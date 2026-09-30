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
      if (o.frame) {
        const f = o.frame;
        if (o.kind !== 'window') errors.push(`${label}: frame gibt es nur an Fenstern.`);
        if (!(f.t > 0 && 2 * f.t < o.to - o.from && 2 * f.t < o.height)) {
          errors.push(`${label}: frame.t muss größer als 0 und kleiner als die halbe Breite und Höhe sein.`);
        }
        if (f.out < 0 || f.in < 0) errors.push(`${label}: frame.out und frame.in dürfen nicht negativ sein.`);
      }
      if (o.slide) {
        const [ways, faces] = alongX(w) ? [['W', 'E'], ['N', 'S']] : [['S', 'N'], ['W', 'E']];
        if (o.kind !== 'door') errors.push(`${label}: slide gibt es nur an Türen.`);
        if (!ways.includes(o.slide.open) || !faces.includes(o.slide.face)) {
          errors.push(`${label}: slide.open muss ${ways.join(' oder ')} sein, slide.face ${faces.join(' oder ')}.`);
        }
      }
      // a sliding door's rail sits 50 mm over the hole
      const top = o.sill + o.height + (o.slide ? 50 : 0);
      if (clear !== null && o.kind !== 'passage' && top > clear) {
        warnings.push(o.slide
          ? `${label}: Brüstung + Höhe + Laufschiene = ${top} mm, höher als das Geschoss (${clear} mm).`
          : `${label}: Brüstung + Höhe = ${top} mm, höher als das Geschoss (${clear} mm).`);
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

  if (src.roomMap) {
    if (src.variant !== 'soll') errors.push('roomMap gehört nur in die Soll-Datei (haus-soll.json).');
    const ids = new Set(src.rooms.map((room) => room.id));
    for (const [from, to] of Object.entries(src.roomMap)) {
      if (!ids.has(to)) errors.push(`roomMap: ${from} zeigt auf ${to}, den es in dieser Datei nicht gibt.`);
    }
  }
  for (const room of src.rooms) {
    if (room.rects.length === 0) warnings.push(`${roomLabel(room)} hat noch keine Fläche und erscheint nicht im 3D und in den Plänen.`);
  }

  const g = src.gaube;
  if (g && !(g.x0 < g.x1)) errors.push('gaube: x0 muss kleiner als x1 sein.');
  const rf = src.roofFrame;
  if (rf) {
    if (!(Number.isInteger(rf.rafters) && rf.rafters >= 2)) errors.push('roofFrame.rafters: ganze Zahl ab 2 erwartet.');
    for (const key of ['rafterB', 'rafterH', 'purlinB', 'purlinH', 'postB'] as const) {
      if (!(rf[key] > 0)) errors.push(`roofFrame.${key} muss größer als 0 sein.`);
    }
    if (!(rf.rafterH < p.roofT)) errors.push('roofFrame.rafterH muss kleiner als params.roofT sein (darüber liegt die Dachhaut).');
    for (const x of rf.posts) {
      if (!(x > 0 && x < p.houseW)) errors.push(`roofFrame.posts: ${x} liegt außerhalb des Hauses.`);
    }
    const t = rf.ties;
    if (t) {
      if (!(t.b > 0 && t.h > 0)) errors.push('roofFrame.ties: b und h müssen größer als 0 sein.');
      if (!(t.notch >= 0 && t.notch < t.h && t.notch < rf.purlinH)) {
        errors.push('roofFrame.ties.notch: zwischen 0 und der Zangen- bzw. Pfettenhöhe erwartet.');
      }
      if (!(t.play >= 0 && t.deck >= 0 && t.lining >= 0)) errors.push('roofFrame.ties: play, deck und lining dürfen nicht negativ sein.');
    }
    const ridgeY = p.houseD / 2;
    (rf.trimmers ?? []).forEach((w, i) => {
      const where = `roofFrame.trimmers[${i}]`;
      const [a, b] = w.rafters;
      if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 1 && b <= rf.rafters && b - a >= 2)) {
        errors.push(`${where}: rafters [${a}, ${b}] – Sparrennummern von 1 bis ${rf.rafters}, mindestens einer dazwischen.`);
      }
      const [y0, y1] = w.y;
      if (!(y0 < y1)) errors.push(`${where}: y[0] muss kleiner als y[1] sein.`);
      else if (!((y0 > p.tOut && y1 <= ridgeY) || (y0 >= ridgeY && y1 < p.houseD - p.tOut))) {
        errors.push(`${where}: die Öffnung muss ganz auf einer Seite des Firsts und innerhalb der Außenwände liegen.`);
      }
    });
  }
  (src.chimneys ?? []).forEach((c, i) => {
    const where = `chimneys[${i}] (${c.name})`;
    if (!(c.x0 > p.tOut && c.x1 < p.houseW - p.tOut && c.y0 > p.tOut && c.y1 < p.houseD - p.tOut)) {
      errors.push(`${where}: der Kamin muss innerhalb der Außenwände stehen.`);
    }
    if (!(c.above >= 0)) errors.push(`${where}: above darf nicht negativ sein.`);
    if (!rf) return;
    // every rafter the chimney meets has to be cut by a trimmer whose opening holds it
    const step = (p.houseW - 2 * p.tOut - rf.rafterB) / (rf.rafters - 1);
    for (let k = 0; k < rf.rafters; k += 1) {
      const x = p.tOut + k * step;
      if (x + rf.rafterB <= c.x0 || x >= c.x1) continue;
      const open = (rf.trimmers ?? []).some((w) => w.rafters[0] - 1 < k && k < w.rafters[1] - 1
        && w.y[0] <= c.y0 && c.y1 <= w.y[1]);
      if (!open) warnings.push(`${where}: Sparren ${k + 1} läuft durch den Kamin – ein Wechsel (roofFrame.trimmers) fehlt.`);
    }
  });
  const tanR = Math.tan(p.roofPitch * Math.PI / 180);
  (src.dormers ?? []).forEach((d, i) => {
    const where = `dormers[${i}] (Gaube ${d.side === 'N' ? 'Nord' : 'Süd'})`;
    if (!rf) {
      errors.push(`${where}: Gauben brauchen einen Dachstuhl (roofFrame).`);
      return;
    }
    const [a, b] = d.rafters;
    if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 1 && b <= rf.rafters && b - a >= 2)) {
      errors.push(`${where}: rafters [${a}, ${b}] – Sparrennummern von 1 bis ${rf.rafters}, mindestens einer dazwischen.`);
    }
    if (!(d.frontH > 0)) errors.push(`${where}: frontH muss größer als 0 sein.`);
    if (!(d.frontT > 0)) errors.push(`${where}: frontT muss größer als 0 sein.`);
    if (d.overhang < 0) errors.push(`${where}: overhang darf nicht negativ sein.`);
    if (!(d.sillH > 0 && d.plateH > 0 && d.sillH + d.plateH < d.frontH)) {
      errors.push(`${where}: sillH und plateH müssen größer als 0 und zusammen kleiner als frontH sein.`);
    }
    if (!(d.pitch > 0 && d.pitch < p.roofPitch)) {
      errors.push(`${where}: pitch muss zwischen 0 und der Dachneigung (${p.roofPitch}°) liegen.`);
      return;
    }
    // same numbers as buildScene: where the dormer rafters rest on the main rafters
    const tg = Math.tan(d.pitch * Math.PI / 180);
    const uA = (d.frontH - tg * d.frontT) / (tanR - tg);
    const uB = uA + rf.rafterH / Math.cos(d.pitch * Math.PI / 180) / (tanR - tg);
    if (!(uA > d.frontT)) {
      errors.push(`${where}: das Gaubendach trifft die Sparren schon vor der Front – frontH größer oder pitch kleiner wählen.`);
    } else if (!(uB < p.houseD / 2 - p.tOut)) {
      errors.push(`${where}: das Gaubendach erreicht die Sparren erst hinter dem First – frontH kleiner oder pitch größer wählen.`);
    }
    if (d.windows.length > 0 && Number.isInteger(a) && Number.isInteger(b)) {
      const step = (p.houseW - 2 * p.tOut - rf.rafterB) / (rf.rafters - 1);
      const inner = (b - a) * step - rf.rafterB;
      const total = d.windows.reduce((sum, [wd]) => sum + wd, 0) + d.windows.slice(0, -1).reduce((sum, [, gap]) => sum + gap, 0);
      if (total > inner) errors.push(`${where}: die Fenster (${total} mm) sind breiter als die Gaube innen (${Math.round(inner)} mm).`);
    }
  });
  (['N', 'S'] as const).forEach((side) => {
    const own = (src.dormers ?? []).filter((d) => d.side === side).sort((x, y) => x.rafters[0] - y.rafters[0]);
    for (let i = 1; i < own.length; i += 1) {
      if (own[i].rafters[0] < own[i - 1].rafters[1]) errors.push(`dormers: zwei Gauben ${side === 'N' ? 'Nord' : 'Süd'} überlappen sich.`);
    }
  });
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
      ...(room.rects.length > 0
        ? { areaM2: pyRound(room.rects.reduce((sum, [x0, y0, x1, y1]) => sum + (x1 - x0) * (y1 - y0), 0) / 1e6, 2) }
        : {}),
    })),
  };
}
