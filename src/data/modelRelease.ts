/**
 * What a model release is, and which of several is the newest.
 *
 * The model is not part of the app build and not in the repository. Its one true home is
 * a document in the Firestore meta collection (meta/model-<variant>), written by
 * "Modell importieren" in the settings. Every signed-in device listens to it and keeps
 * the newest model in IndexedDB, which is what makes it available offline:
 *
 *   firestore the published document - the only place a model comes from
 *   cache     what this device already stored from it
 *
 * Kept free of imports so the logic can be tested without a browser, Firestore or three.
 */

export type Variant = 'ist' | 'soll';

export const VARIANTS: Variant[] = ['ist', 'soll'];

/** where a release came from; also the tie breaker when two carry the same version */
export type ReleaseSource = 'cache' | 'firestore';

// at an equal version what is already decoded on the device wins
const SOURCE_ORDER: ReleaseSource[] = ['cache', 'firestore'];


export interface ReleaseInfo {
  variant: Variant;
  version: string;
  updatedAt: string;
  note: string;
  source: ReleaseSource;
  /** for a cached release: the channel it originally came through, for the UI */
  origin?: ReleaseSource;
  /** size of the scene payload in bytes, when known */
  bytes?: number;
  /** where to fetch scene and rooms, for a release that is only announced */
  sceneUrl?: string;
  roomsUrl?: string;
  /** payload carried inline, as JSON text - how the Firestore document ships a model */
  sceneJson?: string;
  roomsJson?: string;
  /**
   * The house file the scene was built from (format reno-haus/1), as text or address.
   * Travels with every release so the export always hands out the source of the model
   * in use, whichever channel it came through.
   */
  sourceJson?: string;
  sourceUrl?: string;
}

/**
 * Compares two version strings by numeric segments, so 0.10 is newer than 0.9.
 * Returns > 0 when a is newer, < 0 when b is newer, 0 when they are equal.
 */
export function compareVersions(a: string, b: string): number {
  const left = String(a ?? '').split('.');
  const right = String(b ?? '').split('.');
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    // a missing segment counts as zero, so 1.0 and 1 are the same version
    const x = left[i] ?? '0';
    const y = right[i] ?? '0';
    const nx = Number.parseInt(x, 10);
    const ny = Number.parseInt(y, 10);
    if (Number.isFinite(nx) && Number.isFinite(ny)) {
      if (nx !== ny) return nx - ny;
      // 1.2a vs 1.2b - same number, so let the rest of the segment decide
      const rest = x.slice(String(nx).length).localeCompare(y.slice(String(ny).length));
      if (rest !== 0) return rest;
    } else {
      const cmp = x.localeCompare(y);
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

export function isNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

/**
 * The release to use out of everything reachable.
 *
 * Highest version wins. On a tie the source order decides, so an already downloaded
 * model is not fetched again just because the site announces the same version.
 */
export function pickRelease(candidates: (ReleaseInfo | null | undefined)[]): ReleaseInfo | null {
  let best: ReleaseInfo | null = null;
  for (const candidate of candidates) {
    if (!candidate || !candidate.version) continue;
    if (!best) {
      best = candidate;
      continue;
    }
    const diff = compareVersions(candidate.version, best.version);
    if (diff > 0) best = candidate;
    else if (diff === 0
      && SOURCE_ORDER.indexOf(candidate.source) < SOURCE_ORDER.indexOf(best.source)) best = candidate;
  }
  return best;
}

/** what a sync run should do, once it knows what is reachable */
export type SyncPlan =
  /** the newest release is already usable here - nothing to fetch */
  | { action: 'keep'; release: ReleaseInfo }
  /** the newest release has to be downloaded and stored first */
  | { action: 'download'; release: ReleaseInfo };

/**
 * Decides a sync run from the reachable releases, without touching network or storage.
 *
 * Kept separate from the fetching so the branching is testable: a model that is already
 * on the device or shipped with the app must never be downloaded again, and a higher
 * version elsewhere must always win.
 */
export function planSync(candidates: (ReleaseInfo | null | undefined)[]): SyncPlan | null {
  const best = pickRelease(candidates);
  if (!best) return null;
  return { action: best.source === 'cache' ? 'keep' : 'download', release: best };
}

const LAYERS = new Set(['KG', 'EG', 'OG', 'DACH', 'GAR']);
const KINDS = new Set(['wall', 'slab', 'roof', 'glass', 'door', 'stair', 'rail']);

/**
 * Checks a scene before it is cached or shown.
 *
 * A model now arrives over the network, so a truncated download or a half written
 * document must not brick the viewer - the app falls back to the bundled model instead.
 * Returns a German message for the UI, or null when the scene is sound.
 */
export function validateScene(doc: unknown): string | null {
  if (!doc || typeof doc !== 'object') return 'Das Modell ist keine gültige JSON-Struktur.';
  const prims = (doc as { prims?: unknown }).prims;
  if (!Array.isArray(prims) || prims.length === 0) return 'Das Modell enthält keine Bauteile.';
  for (const [index, entry] of prims.entries()) {
    if (!entry || typeof entry !== 'object') return `Bauteil ${index} ist leer.`;
    const prim = entry as { layer?: unknown; kind?: unknown; v?: unknown; t?: unknown };
    if (typeof prim.layer !== 'string' || !LAYERS.has(prim.layer)) {
      return `Bauteil ${index} hat ein unbekanntes Geschoss.`;
    }
    if (typeof prim.kind !== 'string' || !KINDS.has(prim.kind)) {
      return `Bauteil ${index} hat eine unbekannte Art.`;
    }
    if (!Array.isArray(prim.v) || !Array.isArray(prim.t)) return `Bauteil ${index} hat keine Geometrie.`;
    if (prim.v.length === 0 || prim.v.length % 3 !== 0 || prim.t.length % 3 !== 0) {
      return `Bauteil ${index} hat eine unvollständige Geometrie.`;
    }
    for (const i of prim.t as number[]) {
      if (!Number.isInteger(i) || i < 0 || i * 3 + 2 >= prim.v.length) {
        return `Bauteil ${index} verweist auf einen Punkt, den es nicht gibt.`;
      }
    }
  }
  return null;
}

export function validateRooms(doc: unknown): string | null {
  if (!doc || typeof doc !== 'object') return 'Die Raumliste ist keine gültige JSON-Struktur.';
  const rooms = (doc as { rooms?: unknown }).rooms;
  if (!Array.isArray(rooms)) return 'Die Raumliste fehlt.';
  for (const [index, entry] of rooms.entries()) {
    const room = entry as { id?: unknown; name?: unknown; rects?: unknown };
    if (typeof room?.id !== 'string' || !room.id) return `Raum ${index} hat keine id.`;
    if (typeof room.name !== 'string') return `Raum ${index} hat keinen Namen.`;
    // leer ist erlaubt: ein Soll-Raum ohne Aufmaß hat noch keine Flächen, siehe roomNaming.ts
    if (!Array.isArray(room.rects)) return `Raum ${index} hat keine Flächen.`;
  }
  return null;
}

/** the Ist -> Soll room mapping (roomMap of the Soll house file): every Ist id -> the Soll id it becomes */
export interface RoomMapDoc {
  from: Variant;
  to: Variant;
  map: Record<string, string>;
}

export function validateRoomMap(doc: unknown): string | null {
  if (!doc || typeof doc !== 'object') return 'Die Raumzuordnung ist keine gültige JSON-Struktur.';
  const map = (doc as { map?: unknown }).map;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return 'Die Raumzuordnung fehlt.';
  for (const [id, target] of Object.entries(map as Record<string, unknown>)) {
    if (!id) return 'Die Raumzuordnung enthält eine leere id.';
    if (typeof target !== 'string' || !target) return `Die Raumzuordnung für ${id} hat kein Ziel.`;
  }
  return null;
}

/**
 * How a release is stored in the meta collection.
 *
 * The model's own date is called generatedAt, not updatedAt: every document carries an
 * updatedAt written by the server on save, and that one says when it was published, not
 * which day the model was built.
 */
export interface ReleaseDoc {
  variant?: string;
  version?: string;
  generatedAt?: string;
  note?: string;
  bytes?: number;
  scene?: string;
  rooms?: string | null;
  /** the house file the scene was built from; null for a scene published on its own */
  source?: string | null;
  // null, not undefined: the document is merged, so clearing a key has to be written
  sceneUrl?: string | null;
  roomsUrl?: string | null;
}

/** Reads a meta document into a release, or null when it carries no usable version. */
export function releaseFromDoc(variant: Variant, doc: ReleaseDoc | null): ReleaseInfo | null {
  if (!doc || typeof doc.version !== 'string' || !doc.version) return null;
  if (!doc.scene && !doc.sceneUrl) return null;
  return {
    variant,
    version: doc.version,
    updatedAt: typeof doc.generatedAt === 'string' ? doc.generatedAt : '',
    note: typeof doc.note === 'string' ? doc.note : '',
    bytes: Number.isFinite(doc.bytes) ? doc.bytes : undefined,
    source: 'firestore',
    sceneJson: typeof doc.scene === 'string' ? doc.scene : undefined,
    roomsJson: typeof doc.rooms === 'string' ? doc.rooms : undefined,
    sourceJson: typeof doc.source === 'string' ? doc.source : undefined,
    sceneUrl: typeof doc.sceneUrl === 'string' ? doc.sceneUrl : undefined,
    roomsUrl: typeof doc.roomsUrl === 'string' ? doc.roomsUrl : undefined,
  };
}

/** Builds the meta document that publishes a scene to the other devices. */
export function releaseToDoc(
  variant: Variant,
  version: string,
  note: string,
  generatedAt: string,
  sceneJson: string,
  roomsJson: string | null,
  sourceJson: string | null = null,
): ReleaseDoc {
  return {
    variant,
    version,
    generatedAt,
    note,
    bytes: sceneJson.length,
    scene: sceneJson,
    // written even when empty: the document is merged, so leaving the key out would keep
    // the room list of the previous release
    rooms: roomsJson ?? null,
    // the same for the house file: a scene uploaded without one must not keep the old one,
    // or the export would hand out a source that does not match the model
    source: sourceJson,
  };
}

/**
 * Firestore stores at most one MiB per document, and the scene travels as JSON text
 * inside one field. A model that big has to be published by URL instead.
 *
 * Counted in characters, not UTF-8 bytes - the headroom covers the difference, which for
 * a scene of numbers and a German note is a handful of bytes.
 */
export const DOC_LIMIT_BYTES = 1_000_000;

export function fitsInDocument(sceneJson: string, roomsJson: string | null, sourceJson: string | null = null): boolean {
  return sceneJson.length + (roomsJson?.length ?? 0) + (sourceJson?.length ?? 0) < DOC_LIMIT_BYTES - 20_000;
}
