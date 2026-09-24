/**
 * Does the house make sense? Runs on a parsed house file before anything is built.
 *
 * Errors stop an import: an opening that sticks out of its wall, a room cut by a wall,
 * two rooms on top of each other. Warnings only inform - a free wall end can be real
 * (a pillar, a chimney), so it is reported, not refused.
 *
 * The room checks are those of tools/model/build_rooms.py, the wall checks those of
 * check_walls.py, with the same tolerances.
 */
import { pyRound } from './pyRound';
import { alongX, type HouseSource, type SourceRoom, type SourceWall } from './source';
import type { BuiltRooms } from './types';

const TOL = 2; // mm - rooms may touch wall faces
const TOL_AREA = 0.02; // m² - ignore slivers below this

type Rect = [number, number, number, number];

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

function rectOverlapArea(a: Rect, b: Rect): number {
  const dx = Math.min(a[2], b[2]) - Math.max(a[0], b[0]) - 2 * TOL;
  const dy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]) - 2 * TOL;
  if (dx <= 0 || dy <= 0) return 0;
  return dx * dy / 1e6;
}

/** The wall rectangle split by its open passages - a room may reach into those. */
function wallPieces(w: SourceWall): Rect[] {
  const along = alongX(w);
  const [a0, a1] = along ? [w.x0, w.x1] : [w.y0, w.y1];
  let parts: [number, number][] = [[a0, a1]];
  for (const o of w.openings ?? []) {
    if (o.kind !== 'passage') continue;
    const rest: [number, number][] = [];
    for (const [p0, p1] of parts) {
      if (o.to <= p0 || o.from >= p1) {
        rest.push([p0, p1]);
        continue;
      }
      if (p0 < o.from) rest.push([p0, o.from]);
      if (o.to < p1) rest.push([o.to, p1]);
    }
    parts = rest;
  }
  return parts.map(([p0, p1]) => (along ? [p0, w.y0, p1, w.y1] : [w.x0, p0, w.x1, p1]));
}

const m2 = (a: number) => a.toFixed(2).replace('.', ',');

function roomLabel(room: SourceRoom): string {
  return `Raum ${room.id} (${room.name})`;
}

/** clear height of a storey, for the sill + height check */
function storeyHeight(src: HouseSource, floor: string): number | null {
  if (floor === 'KG' || floor === 'EG') return src.params.storey - src.params.slab;
  return null; // OG walls follow the roof, the garage its slope - no single number
}

/**
 * Wall ends that touch nothing - check_walls.py's "FREIES ENDE". A strip of ±20 mm at
 * each end must meet another wall of the same floor (5 mm tolerance).
 */
export function freeWallEnds(src: HouseSource): string[] {
  const out: string[] = [];
  const touches = (a: Rect, b: SourceWall, tol: number) =>
    a[0] <= b.x1 + tol && a[2] >= b.x0 - tol && a[1] <= b.y1 + tol && a[3] >= b.y0 - tol;
  for (const floor of ['KG', 'EG', 'OG'] as const) {
    const walls = src.walls.filter((w) => w.floor === floor);
    for (const w of walls) {
      const ends: Rect[] = alongX(w)
        ? [[w.x0 - 20, w.y0, w.x0 + 20, w.y1], [w.x1 - 20, w.y0, w.x1 + 20, w.y1]]
        : [[w.x0, w.y0 - 20, w.x1, w.y0 + 20], [w.x0, w.y1 - 20, w.x1, w.y1 + 20]];
      ends.forEach((end, i) => {
        if (!walls.some((o) => o !== w && touches(end, o, 5))) {
          out.push(`${w.floor}: Wand „${w.name}“ (${w.id}) endet frei (${i === 0 ? 'Anfang' : 'Ende'}).`);
        }
      });
    }
  }
  return out;
}

export function checkSource(src: HouseSource): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const w of src.walls) {
    const [a0, a1] = alongX(w) ? [w.x0, w.x1] : [w.y0, w.y1];
    const axis = alongX(w) ? 'x' : 'y';
    const clear = storeyHeight(src, w.floor);
    (w.openings ?? []).forEach((o, i) => {
      const label = `Wand „${w.name}“ (${w.id}), Öffnung ${i + 1}`;
      if (!(o.from < o.to)) errors.push(`${label}: from muss kleiner als to sein.`);
      else if (o.from < a0 || o.to > a1) {
        errors.push(`${label}: ${axis} ${o.from}–${o.to} liegt nicht in der Wand (${axis} ${a0}–${a1}).`);
      }
      if (o.kind !== 'passage' && !(o.height > 0)) errors.push(`${label}: height muss größer als 0 sein.`);
      if (o.sill < 0) errors.push(`${label}: sill darf nicht negativ sein.`);
      if (clear !== null && o.kind !== 'passage' && o.sill + o.height > clear) {
        warnings.push(`${label}: Brüstung + Höhe = ${o.sill + o.height} mm, höher als das Geschoss (${clear} mm).`);
      }
    });
  }

  const p = src.params;
  const envelope: Rect = [0, p.yVor, p.houseW, p.houseD];
  for (const room of src.rooms) {
    for (const r of room.rects) {
      if (room.floor !== 'GAR'
        && !(envelope[0] <= r[0] && r[0] < r[2] && r[2] <= envelope[2]
          && envelope[1] <= r[1] && r[1] < r[3] && r[3] <= envelope[3])) {
        errors.push(`${roomLabel(room)}: Rechteck [${r.join(', ')}] liegt außerhalb des Hauses.`);
      }
      for (const w of src.walls) {
        if (w.floor !== room.floor) continue;
        const a = wallPieces(w).reduce((sum, piece) => sum + rectOverlapArea(r, piece), 0);
        if (a > TOL_AREA) errors.push(`${roomLabel(room)}: Wand „${w.name}“ geht durch den Raum (${m2(a)} m²).`);
      }
      for (const other of src.rooms) {
        if (other.id <= room.id || other.floor !== room.floor) continue;
        for (const q of other.rects) {
          const a = rectOverlapArea(r, q);
          if (a > TOL_AREA) errors.push(`${roomLabel(room)} überlappt ${other.id} (${m2(a)} m²).`);
        }
      }
    }
  }

  const g = src.gaube;
  if (!(g.x0 < g.x1)) errors.push('gaube: x0 muss kleiner als x1 sein.');
  if (!(src.garage.x[0] < src.garage.x[1] && src.garage.y[0] < src.garage.y[1])) {
    errors.push('garage: x und y müssen aufsteigend sein.');
  }
  for (const key of ['houseW', 'houseD', 'tOut', 'slab', 'storey', 'roofPitch'] as const) {
    if (!(p[key] > 0)) errors.push(`params.${key} muss größer als 0 sein.`);
  }
  if (!(p.roofPitch < 80)) errors.push('params.roofPitch muss unter 80° liegen.');
  return { errors, warnings };
}

/** rooms-<variant>.json, as build_rooms.py writes it */
export function buildRooms(src: HouseSource, generatedAt: string): BuiltRooms {
  return {
    variant: src.variant,
    generatedAt,
    rooms: src.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      floor: room.floor,
      rects: room.rects.map((r) => [...r]),
      areaM2: pyRound(room.rects.reduce((sum, [x0, y0, x1, y1]) => sum + (x1 - x0) * (y1 - y0), 0) / 1e6, 2),
    })),
  };
}
