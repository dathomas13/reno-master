/**
 * Room edits made in the app (Voreinstellungen → Räume / Zuordnung), as pure functions on
 * the house file text. Free of Firebase, so it runs in the plain-Node test fallback.
 *
 * An edit never renames a room id: a name changes (`rename`), a Bestand room is pointed at
 * another Planung room (`map`), or a new Planung room without any area is added
 * (`addSoll`). The result goes through formatSource, so it is byte-identical to what
 * tools/model/hausdatei.py --format writes, and is published like any imported house file
 * (prepareModelImport → publishImport in modelExchange.ts).
 */
import { formatSource } from '@/modules/modelBuild/format';

export type RoomVariant = 'ist' | 'soll' | 'aktuell';
export type RoomFloor = 'KG' | 'EG' | 'OG' | 'GAR';

export type RoomEdit =
  | { op: 'rename'; variant: RoomVariant; id: string; name: string }
  | { op: 'map'; from: string; to: string }
  | { op: 'addSoll'; id: string; name: string; floor: RoomFloor };

export interface AppliedEdits {
  text: string;
  applied: RoomEdit[];
  /** edits that point at an id this file does not have (or that would clash) */
  dropped: RoomEdit[];
}

/** identifies what an edit is about, regardless of its value - a newer one replaces an older one */
export function editKey(edit: RoomEdit): string {
  switch (edit.op) {
    case 'rename': return `rename|${edit.variant}|${edit.id}`;
    case 'map': return `map|${edit.from}`;
    case 'addSoll': return `addSoll|${edit.id}`;
  }
}

type Obj = Record<string, unknown>;

/**
 * Applies the edits that concern `variant` to a house file. Edits for other variants are
 * ignored (neither applied nor dropped). Throws only when the text is not a JSON object.
 */
export function applyRoomEdits(sourceText: string, edits: RoomEdit[], variant: RoomVariant): AppliedEdits {
  const doc = JSON.parse(sourceText.replace(/^\uFEFF/, '')) as Obj;
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('Die Hausdatei ist kein JSON-Objekt.');
  }
  const rooms = (Array.isArray(doc.rooms) ? doc.rooms : []) as Obj[];
  doc.rooms = rooms;
  const applied: RoomEdit[] = [];
  const dropped: RoomEdit[] = [];

  for (const edit of edits) {
    if (edit.op === 'rename') {
      if (edit.variant !== variant) continue;
      const room = rooms.find((r) => r.id === edit.id);
      if (!room) dropped.push(edit);
      else {
        room.name = edit.name;
        applied.push(edit);
      }
    } else if (edit.op === 'map') {
      if (variant !== 'soll') continue;
      if (!rooms.some((r) => r.id === edit.to)) {
        dropped.push(edit);
        continue;
      }
      const map = (doc.roomMap && typeof doc.roomMap === 'object' ? doc.roomMap : {}) as Record<string, string>;
      map[edit.from] = edit.to;
      doc.roomMap = map;
      applied.push(edit);
    } else {
      if (variant !== 'soll') continue;
      if (rooms.some((r) => r.id === edit.id)) dropped.push(edit);
      else {
        rooms.push({ id: edit.id, name: edit.name, floor: edit.floor, rects: [] });
        applied.push(edit);
      }
    }
  }
  return { text: formatSource(doc), applied, dropped };
}

const TRANSLITERATE: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/** `<geschoss>-<slug>`, umlauts spelled out, unique among `takenIds` (suffix -2, -3, …) */
export function newRoomId(name: string, floor: string, takenIds: Iterable<string>): string {
  const slug = name
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => TRANSLITERATE[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'raum';
  const taken = new Set(takenIds);
  const base = `${floor.toLowerCase()}-${slug}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}

export const ROOM_NAME_MAX = 40;

/** trim, collapse whitespace, NFC - the shape a room name is stored in */
export function normalizeRoomName(name: string): string {
  return name.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export interface SummaryRoom {
  id: string;
  name: string;
  floor: string;
}

export interface RoomMapSummary {
  /** Planung rooms with exactly one Bestand predecessor of the same id and name */
  stay: SummaryRoom[];
  /** Planung rooms that two or more Bestand rooms flow into */
  merged: { target: SummaryRoom; sources: SummaryRoom[] }[];
  /** one predecessor, but another id or name */
  renamed: { target: SummaryRoom; source: SummaryRoom }[];
  /** Planung rooms no Bestand room leads to */
  added: SummaryRoom[];
  /** Bestand rooms whose target is missing in the Planung (the check refuses that) */
  lost: SummaryRoom[];
}

/** What the mapping Bestand → Planung amounts to. An id absent from `map` maps to itself. */
export function summarizeRoomMap(
  istRooms: SummaryRoom[],
  sollRooms: SummaryRoom[],
  map: Record<string, string>,
): RoomMapSummary {
  const soll = new Map(sollRooms.map((r) => [r.id, r]));
  const sources = new Map<string, SummaryRoom[]>();
  const lost: SummaryRoom[] = [];
  for (const room of istRooms) {
    const target = map[room.id] ?? room.id;
    if (!soll.has(target)) {
      lost.push(room);
      continue;
    }
    sources.set(target, [...(sources.get(target) ?? []), room]);
  }
  const out: RoomMapSummary = { stay: [], merged: [], renamed: [], added: [], lost };
  for (const target of sollRooms) {
    const from = sources.get(target.id) ?? [];
    if (from.length === 0) out.added.push(target);
    else if (from.length > 1) out.merged.push({ target, sources: from });
    else if (from[0].id === target.id && from[0].name === target.name) out.stay.push(target);
    else out.renamed.push({ target, source: from[0] });
  }
  return out;
}

export interface RoomRow extends SummaryRoom {
  areaM2?: number;
  /** a Planung room that only exists in the draft */
  isNew?: boolean;
  /** the name differs from the published one */
  changed?: boolean;
}

/** the rooms of a variant as they will look once the draft is published */
export function previewRooms(
  rooms: (SummaryRoom & { areaM2?: number })[],
  edits: RoomEdit[],
  variant: RoomVariant,
): RoomRow[] {
  const rows: RoomRow[] = rooms.map((r) => ({ id: r.id, name: r.name, floor: r.floor, areaM2: r.areaM2 }));
  for (const edit of edits) {
    if (edit.op === 'rename' && edit.variant === variant) {
      const row = rows.find((r) => r.id === edit.id);
      if (row) {
        row.changed = row.changed || row.name !== edit.name;
        row.name = edit.name;
      }
    } else if (edit.op === 'addSoll' && variant === 'soll' && !rows.some((r) => r.id === edit.id)) {
      rows.push({ id: edit.id, name: edit.name, floor: edit.floor, isNew: true });
    }
  }
  return rows;
}

/** the mapping Bestand → Planung with the draft's changes */
export function previewMap(map: Record<string, string>, edits: RoomEdit[]): Record<string, string> {
  const out = { ...map };
  for (const edit of edits) if (edit.op === 'map') out[edit.from] = edit.to;
  return out;
}
