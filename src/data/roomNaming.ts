/**
 * Which name a room shows, and which stored ids count towards it.
 *
 * There are two room tables (Bestand/Ist, Planung/Soll) and one mapping from every Ist
 * room id to the Soll id it becomes (`rooms_map.py` / `public/models/room-map.json`).
 * The mapping is read only forward: an old entry filed under "Heizung" or "Öllager"
 * shows up under "Technikraum", but a new entry filed under "Technikraum" does not need
 * to be findable under "Öllager" - nobody asked for that, and it would need a rule for
 * which of several predecessors a new entry "really" belongs to.
 *
 * Kept free of imports so the logic can be tested without a browser or Firestore, same
 * as modelRelease.ts.
 */

export type RoomNaming = 'bestand' | 'planung';

/** the parts of Room this module actually looks at */
export interface RoomLike {
  id: string;
  name: string;
  floor: string;
  areaM2?: number;
}

export interface RoomNamingView<R extends RoomLike> {
  /** the rooms of this naming's own table, unsorted - the caller sorts (models.ts sortRooms) */
  rooms: R[];
  /** the room to show for a stored id, whichever table it lives in */
  roomFor(id: string): R | undefined;
  /** every stored id that counts towards the room a given id resolves to - filters, tiles, photos */
  idsFor(id: string): string[];
  /** true when any of a set of stored ids belongs to the room `filterId` resolves to */
  matches(roomIds: string[], filterId: string): boolean;
  /** the id a new link should store, given the id of the room the user picked or is looking at */
  writeId(id: string): string;
  /** the counterpart name(s) of a room - a merged predecessor's name, or the other side of a rename */
  aliases(id: string): string[];
}

/**
 * Builds one naming's view from both room tables and the Ist -> Soll mapping.
 *
 * `map` may be incomplete or empty (no room-map.json reached yet, or an id the mapping
 * does not know): every lookup falls back to treating the id as its own target, so the
 * app degrades to showing ids more or less as they are, never throws.
 */
export function buildRoomNaming<R extends RoomLike>(
  ist: R[],
  soll: R[],
  map: Record<string, string>,
  naming: RoomNaming,
): RoomNamingView<R> {
  const istById = new Map(ist.map((room) => [room.id, room]));
  const sollById = new Map(soll.map((room) => [room.id, room]));

  // Ist id -> Soll id it becomes, and the reverse: Soll id -> every Ist id mapping to it.
  // An id absent from `map` is treated as mapping to itself, so an incomplete or empty
  // table still resolves - see the module comment.
  const forward = new Map<string, string>(Object.entries(map));
  const reverse = new Map<string, string[]>();
  for (const room of ist) {
    const target = forward.get(room.id) ?? room.id;
    reverse.set(target, [...(reverse.get(target) ?? []), room.id]);
  }

  function sollTargetOf(id: string): string {
    return istById.has(id) ? (forward.get(id) ?? id) : id;
  }

  function roomFor(id: string): R | undefined {
    if (naming === 'bestand') {
      // an id this device only ever saw as a Soll id (created while looking at the
      // Planung naming) has no Ist room to show - fall back to its own Soll name,
      // never to `undefined`, or a genuinely new room would vanish from view.
      return istById.get(id) ?? sollById.get(id);
    }
    const target = sollTargetOf(id);
    return sollById.get(target) ?? istById.get(id);
  }

  function idsFor(id: string): string[] {
    // only walk the direction `id` itself points as a TARGET: an id that other ids map
    // to (a merge target, or a room mapping to itself) picks up its predecessors. An id
    // that is itself a predecessor of something else does NOT pull that in - opening
    // "Heizung" alone still means Heizung alone, whichever naming is active. Only
    // opening the merged room ("Technikraum") aggregates.
    const predecessors = reverse.get(id) ?? [];
    return [...new Set([id, ...predecessors])];
  }

  function matches(roomIds: string[], filterId: string): boolean {
    const wanted = idsFor(filterId);
    return roomIds.some((id) => wanted.includes(id));
  }

  // The picker only ever offers ids from this naming's own `rooms` list, and every link
  // the app builds (RoomPanel, search) already carries an id valid for the naming that
  // built it - so the id to write is simply the id the caller already resolved to. Named
  // for what it means at the call site, not because it transforms anything today.
  function writeId(id: string): string {
    return id;
  }

  function aliases(id: string): string[] {
    const ownName = roomFor(id)?.name;
    const names = new Set<string>();
    if (istById.has(id)) {
      const counterpart = sollById.get(forward.get(id) ?? id)?.name;
      if (counterpart) names.add(counterpart);
    }
    for (const predecessorId of reverse.get(id) ?? []) {
      const predecessorName = istById.get(predecessorId)?.name;
      if (predecessorName) names.add(predecessorName);
    }
    names.delete(ownName ?? '');
    return [...names];
  }

  return {
    rooms: naming === 'bestand' ? ist : soll,
    roomFor,
    idsFor,
    matches,
    writeId,
    aliases,
  };
}

/**
 * A room name, with its floor appended only when another room in the SAME list shares
 * the exact name - "Wohnzimmer (Keller)" next to a plain "Wohnzimmer" in the Erdgeschoss,
 * but never "Wäscheboden (Obergeschoss)" when nothing else is called that. Computed once
 * per room list, not per render: a short-display spot (a comma-joined list of rooms, a
 * filter chip, a picker's summary line) looks this up by id instead of calling `name()`.
 */
export function disambiguatedNames<R extends RoomLike>(
  rooms: R[],
  floorLabel: Record<string, string>,
): Map<string, string> {
  const countByName = new Map<string, number>();
  for (const room of rooms) countByName.set(room.name, (countByName.get(room.name) ?? 0) + 1);
  const out = new Map<string, string>();
  for (const room of rooms) {
    const ambiguous = (countByName.get(room.name) ?? 0) > 1;
    out.set(room.id, ambiguous ? `${room.name} (${floorLabel[room.floor] ?? room.floor})` : room.name);
  }
  return out;
}

/**
 * Resolves a stored room id within ONE variant's own room list - what the 3D viewer
 * needs for `?raum=<id>`. The viewer never switches naming, only Ist/Soll, and always
 * has only that one side's rooms loaded.
 *
 * Forward (id looked up on the Soll side) is always unique, via `map` directly. Backward
 * (id looked up on the Ist side) can be ambiguous when several Ist rooms merged into the
 * id asked for - picks the largest of them, or the first the mapping lists when none has
 * a surveyed area yet, rather than showing nothing or guessing at random.
 */
export function resolveInVariant<R extends RoomLike>(
  id: string,
  side: 'ist' | 'soll',
  ownRooms: R[],
  map: Record<string, string>,
): R | undefined {
  const byId = new Map(ownRooms.map((room) => [room.id, room]));
  const direct = byId.get(id);
  if (direct) return direct;

  if (side === 'soll') {
    const target = map[id];
    return target ? byId.get(target) : undefined;
  }

  const predecessors = Object.entries(map)
    .filter(([, target]) => target === id)
    .map(([sourceId]) => byId.get(sourceId))
    .filter((room): room is R => Boolean(room));
  if (predecessors.length === 0) return undefined;
  return predecessors.reduce((best, room) => ((room.areaM2 ?? 0) > (best.areaM2 ?? 0) ? room : best));
}
