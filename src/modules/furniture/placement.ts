/**
 * Furniture in the planned house: the stored shape of a piece, and the geometry of
 * placing it - footprint, snapping to the walls of its room, which room it stands in.
 *
 * Pure functions on plain data, no three.js and no Firestore, so all of it is tested.
 * Coordinates are model millimetres like the house file: x east, y north, z up.
 */
import { catalogEntry } from './catalog';

export const FURNITURE_FLOORS = ['KG', 'EG', 'OG', 'GAR'] as const;
export type FurnitureFloor = (typeof FURNITURE_FLOORS)[number];

/** floor level of each storey, as the house file counts it (see ANLEITUNG-EXTERN.md) */
export const FLOOR_Z: Record<FurnitureFloor, number> = { KG: -2750, EG: 0, OG: 2750, GAR: -1360 };

export interface FurnitureItem {
  id: string;
  /** catalog type, or `model` for a model loaded from a file */
  type: string;
  /** the uploaded model, only with type `model` */
  modelId?: string;
  /** shown instead of the catalog label */
  name?: string;
  floor: FurnitureFloor;
  /** centre of the footprint, mm */
  x: number;
  y: number;
  /** height of the underside above the floor, mm */
  z: number;
  /** turn about the vertical axis, degrees counterclockwise seen from above, 0 = front faces south */
  rot: number;
  w: number;
  d: number;
  h: number;
}

/** a model file loaded by the user, kept in the file store */
export interface FurnitureModel {
  id: string;
  name: string;
  storagePath: string;
  /** size in mm at its own scale, after the unit was guessed - the default size of a new piece */
  w: number;
  d: number;
  h: number;
  bytes: number;
  uploadState?: 'pending' | 'uploaded' | 'failed';
}

export interface FurnitureState {
  items: FurnitureItem[];
  models: FurnitureModel[];
}

export const MIN_SIZE = 5;
export const MAX_SIZE = 12000;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function size(value: unknown): number | null {
  return finite(value) && value >= MIN_SIZE && value <= MAX_SIZE ? value : null;
}

/** one stored piece, or null when it cannot be drawn */
export function parseItem(id: string, raw: unknown): FurnitureItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const floor = value.floor as FurnitureFloor;
  if (!FURNITURE_FLOORS.includes(floor)) return null;
  if (typeof value.type !== 'string' || !value.type) return null;
  const w = size(value.w);
  const d = size(value.d);
  const h = size(value.h);
  if (w === null || d === null || h === null) return null;
  if (!finite(value.x) || !finite(value.y)) return null;
  if (value.type === 'model' && typeof value.modelId !== 'string') return null;
  const item: FurnitureItem = {
    id,
    type: value.type,
    floor,
    x: value.x,
    y: value.y,
    z: finite(value.z) ? value.z : 0,
    rot: finite(value.rot) ? normalizeRotation(value.rot) : 0,
    w,
    d,
    h,
  };
  if (typeof value.modelId === 'string') item.modelId = value.modelId;
  if (typeof value.name === 'string' && value.name.trim()) item.name = value.name.trim();
  return item;
}

export function parseModel(id: string, raw: unknown): FurnitureModel | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.storagePath !== 'string' || !value.storagePath) return null;
  const w = size(value.w);
  const d = size(value.d);
  const h = size(value.h);
  if (w === null || d === null || h === null) return null;
  const model: FurnitureModel = {
    id,
    name: typeof value.name === 'string' && value.name ? value.name : 'Eigenes Modell',
    storagePath: value.storagePath,
    w,
    d,
    h,
    bytes: finite(value.bytes) ? value.bytes : 0,
  };
  if (value.uploadState === 'pending' || value.uploadState === 'uploaded' || value.uploadState === 'failed') {
    model.uploadState = value.uploadState;
  }
  return model;
}

/**
 * The document meta/moebel-soll as the app uses it. Whatever does not make sense is
 * dropped piece by piece - one broken entry must not take the others with it.
 */
export function parseFurnitureDoc(raw: unknown): FurnitureState {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const items: FurnitureItem[] = [];
  const models: FurnitureModel[] = [];
  const itemMap = value.items && typeof value.items === 'object' ? (value.items as Record<string, unknown>) : {};
  const modelMap = value.models && typeof value.models === 'object' ? (value.models as Record<string, unknown>) : {};
  for (const [id, entry] of Object.entries(modelMap)) {
    const model = parseModel(id, entry);
    if (model) models.push(model);
  }
  const known = new Set(models.map((model) => model.id));
  for (const [id, entry] of Object.entries(itemMap)) {
    const item = parseItem(id, entry);
    // a piece whose model was removed has nothing left to show
    if (item && (item.type !== 'model' || known.has(item.modelId ?? ''))) items.push(item);
  }
  items.sort((a, b) => a.id.localeCompare(b.id));
  models.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return { items, models };
}

export function normalizeRotation(rot: number): number {
  const value = ((rot % 360) + 360) % 360;
  // keep 359.9999 from a sum of steps from showing up as such
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 360 ? 0 : rounded;
}

/** the label of a piece: its own name, the catalog name or the model name */
export function itemLabel(item: FurnitureItem, models: readonly FurnitureModel[] = []): string {
  if (item.name) return item.name;
  if (item.type === 'model') return models.find((model) => model.id === item.modelId)?.name ?? 'Eigenes Modell';
  return catalogEntry(item.type)?.label ?? item.type;
}

// ------------------------------------------------------------------ footprint

export interface Box2 {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** the four corners of the turned footprint */
export function footprintCorners(item: Pick<FurnitureItem, 'x' | 'y' | 'w' | 'd' | 'rot'>): [number, number][] {
  const a = (item.rot * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const corners: [number, number][] = [];
  for (const [lx, ly] of [
    [-item.w / 2, -item.d / 2],
    [item.w / 2, -item.d / 2],
    [item.w / 2, item.d / 2],
    [-item.w / 2, item.d / 2],
  ]) {
    corners.push([item.x + lx * cos - ly * sin, item.y + lx * sin + ly * cos]);
  }
  return corners;
}

/** axis aligned box around the turned footprint; exact for quarter turns */
export function footprintBox(item: Pick<FurnitureItem, 'x' | 'y' | 'w' | 'd' | 'rot'>): Box2 {
  const corners = footprintCorners(item);
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return { x0: round(Math.min(...xs)), y0: round(Math.min(...ys)), x1: round(Math.max(...xs)), y1: round(Math.max(...ys)) };
}

// ------------------------------------------------------------------ rooms

export interface RoomLike {
  id: string;
  name: string;
  floor: string;
  rects: number[][];
}

function inside(rect: readonly number[], x: number, y: number, slack = 0): boolean {
  return x >= rect[0] - slack && x <= rect[2] + slack && y >= rect[1] - slack && y <= rect[3] + slack;
}

/** the room the centre of a piece stands in */
export function roomAt<R extends RoomLike>(rooms: readonly R[], floor: string, x: number, y: number): R | null {
  return rooms.find((room) => room.floor === floor && room.rects.some((rect) => inside(rect, x, y))) ?? null;
}

/**
 * True when part of the footprint reaches out of the room the piece stands in - into a
 * wall or the next room. A piece in no room at all counts as sticking out.
 */
export function sticksOut(item: FurnitureItem, rooms: readonly RoomLike[]): boolean {
  const room = roomAt(rooms, item.floor, item.x, item.y);
  if (!room) return true;
  // 1 mm slack: a piece snapped to the wall touches it, it does not stand in it
  return footprintCorners(item).some(([x, y]) => !room.rects.some((rect) => inside(rect, x, y, 1)));
}

/** distance within which an edge of the footprint jumps onto a wall */
export const SNAP_MM = 120;
/** grid a piece moves on when it is not at a wall */
export const GRID_MM = 10;

/**
 * Where a piece moved to (x, y) actually goes: onto the wall of its room when an edge of
 * the footprint comes close to one, otherwise onto a 10 mm grid. Walls are the inner edges
 * of the room rectangles, so a WC pushed against the back wall touches it exactly.
 */
export function snapPosition(
  item: FurnitureItem,
  x: number,
  y: number,
  rooms: readonly RoomLike[],
  tolerance = SNAP_MM,
): { x: number; y: number; snapped: boolean } {
  const grid = (value: number) => Math.round(value / GRID_MM) * GRID_MM;
  const moved = { ...item, x, y };
  const room = roomAt(rooms, item.floor, x, y);
  if (!room) return { x: grid(x), y: grid(y), snapped: false };
  const box = footprintBox(moved);

  const xs = room.rects.flatMap((rect) => [rect[0], rect[2]]);
  const ys = room.rects.flatMap((rect) => [rect[1], rect[3]]);
  const best = (edges: number[], low: number, high: number): number | null => {
    let shift: number | null = null;
    for (const edge of edges) {
      for (const side of [low, high]) {
        const delta = edge - side;
        if (Math.abs(delta) <= tolerance && (shift === null || Math.abs(delta) < Math.abs(shift))) shift = delta;
      }
    }
    return shift;
  };
  const dx = best(xs, box.x0, box.x1);
  const dy = best(ys, box.y0, box.y1);
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    x: dx === null ? grid(x) : round(x + dx),
    y: dy === null ? grid(y) : round(y + dy),
    snapped: dx !== null || dy !== null,
  };
}

/**
 * Where a new piece goes: in the middle of the given room, or of the given point, turned
 * towards the camera's south. Its size comes from the catalog unless given.
 */
export function newItem(
  id: string,
  type: string,
  floor: FurnitureFloor,
  at: { x: number; y: number },
  dims?: { w: number; d: number; h: number },
  modelId?: string,
): FurnitureItem {
  const entry = catalogEntry(type);
  const size = dims ?? entry?.dims ?? { w: 600, d: 600, h: 600 };
  const item: FurnitureItem = {
    id,
    type,
    floor,
    x: Math.round(at.x / GRID_MM) * GRID_MM,
    y: Math.round(at.y / GRID_MM) * GRID_MM,
    z: entry?.z ?? 0,
    rot: 0,
    w: size.w,
    d: size.d,
    h: size.h,
  };
  if (modelId) item.modelId = modelId;
  return item;
}

/** the middle of a room, the larger rectangle wins for an L-shaped one */
export function roomCentre(room: RoomLike): { x: number; y: number } | null {
  let best: number[] | null = null;
  let area = -1;
  for (const rect of room.rects) {
    const a = (rect[2] - rect[0]) * (rect[3] - rect[1]);
    if (a > area) {
      area = a;
      best = rect;
    }
  }
  return best ? { x: (best[0] + best[2]) / 2, y: (best[1] + best[3]) / 2 } : null;
}

/** clamps a size typed into the editor */
export function clampSize(value: number): number {
  if (!Number.isFinite(value)) return MIN_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(value)));
}

// ------------------------------------------------------------------ model files

/** largest file accepted, below what the file store takes (60 MB) */
export const MAX_MODEL_BYTES = 30 * 1024 * 1024;

/**
 * glTF counts in metres, but plenty of files on the internet were exported in centimetres
 * or millimetres - a chair would come in 45 m high. Judged by the largest side of a piece
 * of furniture, which is somewhere between 20 cm and 5 m: up to 20 it is metres, up to
 * 500 centimetres, above that millimetres. A wrong guess is corrected in the size fields.
 * Returns the factor from file units to metres.
 */
export function guessUnit(size: [number, number, number]): number {
  const largest = Math.max(...size.map((value) => Math.abs(value)));
  if (!Number.isFinite(largest) || largest <= 0) return 1;
  if (largest > 500) return 0.001;
  if (largest > 20) return 0.01;
  return 1;
}

/**
 * Size of a model in mm from its bounding box in file units (glTF: x right, y up, z
 * towards the viewer). The front of a glTF model looks along +z, which is the front of
 * a piece here as well, so width is x, depth is z and height is y.
 */
export function modelSizeMm(size: [number, number, number]): { w: number; d: number; h: number } {
  const factor = guessUnit(size) * 1000;
  const mm = (value: number) => clampSize(Math.abs(value) * factor);
  return { w: mm(size[0]), d: mm(size[2]), h: mm(size[1]) };
}

/** the storage path of a model file */
export function modelPath(id: string, extension: 'glb' | 'gltf' = 'glb'): string {
  return `moebel/${id}.${extension}`;
}
