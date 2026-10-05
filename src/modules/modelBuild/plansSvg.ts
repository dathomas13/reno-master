/**
 * The 2D floor plans as SVG, built from a house file on the device.
 *
 * Port of tools/model/build_plans_svg.py - byte for byte the same output, which
 * modelBuild.test.ts checks against tools/model/testdata/plans/*.svg. With it the plans
 * follow a model imported in the app instead of showing the bundled state until the
 * next deploy.
 *
 * The SVG uses the model coordinate system in mm (y flipped so north is up) and carries
 * data-room-id on every room area, so rooms are tappable in the plan as in the 3D view.
 * Drawn like a paper plan: walls with a black outline, openings with width/height, room
 * stamps with area and clear dimensions, dimension chains in cm on all four sides: from
 * the outside in overall, outer wall, walls meeting the facade, and the inside of the half of
 * the house next to that side (walls, free wall ends, doors, stairs).
 */
import { pyRound } from './pyRound';
import { alongX, slideLeaves, type HouseSource, type HouseVariant, type SourceOpening, type SourceWall } from './source';
import type { BuiltRooms } from './types';

export type PlanFloor = 'KG' | 'EG' | 'OG';
export const PLAN_FLOORS: PlanFloor[] = ['KG', 'EG', 'OG'];

const CHAIN_GAP = 700; // mm from the building to the first dimension chain
const CHAIN_STEP = 450; // mm between two chains
const SLIVER = 40; // mm: closer edges of the inner chain are not both shown
const CHAIN_ZONE = CHAIN_GAP + 3 * CHAIN_STEP + 350; // room for four chains and their text
const TITLE_ZONE = 1100; // mm above the chains for the title
const FOOT_ZONE = 1000; // mm below the chains for scale bar and legend
export const FLOOR_LABEL: Record<PlanFloor, string> = { KG: 'Kellergeschoss', EG: 'Erdgeschoss', OG: 'Obergeschoss' };
export const VARIANT_LABEL: Record<HouseVariant, string> = { ist: 'Bestand', aktuell: 'Aktuell', soll: 'Plan' };
const LEGEND = 'Maße in cm · Raummaße in m · Öffnungen Breite/Höhe, BRH Brüstungshöhe · '
  + '* oder schraffiert: geschätzt';

// Drawn like a paper plan (Grundriss 1:50): grey walls with a black outline, dark light
// partitions, red dimension chains with architect's slashes. Every rule is scoped to
// .reno-plan because the app puts the SVG into the page, where a bare "svg { }" would
// reach every icon.
const STYLE = `
  .reno-plan { --paper:#ffffff; --ink:#111111; --muted:#555555; --wall:#d6d6d6;
        --wall-light:#5f5f5f; --dim:#c62828; --window:#1f6fb2; --door:#2e7d32;
        --room:#1f6fb2; --stair:#333333;
        background:var(--paper); font-family:Arial,"Liberation Sans","Helvetica Neue",sans-serif; }
  .reno-plan .room { fill:var(--room); fill-opacity:0; stroke:none; cursor:pointer; }
  .reno-plan .room:hover, .reno-plan .room.selected { fill-opacity:.12; }
  .reno-plan .room-label { fill:var(--ink); font-size:230px; text-anchor:middle; pointer-events:none;
        paint-order:stroke; stroke:var(--paper); stroke-width:60px; stroke-linejoin:round; }
  .reno-plan .room-area, .reno-plan .room-size { fill:var(--ink); text-anchor:middle; pointer-events:none;
        paint-order:stroke; stroke:var(--paper); stroke-width:50px; stroke-linejoin:round; }
  .reno-plan .room-area { font-size:170px; }
  .reno-plan .room-size { font-size:140px; fill:var(--muted); }
  .reno-plan .wall-edge { fill:var(--ink); stroke:var(--ink); stroke-width:30; }
  .reno-plan .wall { fill:var(--wall); stroke:var(--wall); stroke-width:8; }
  .reno-plan .wall.light { fill:var(--wall-light); stroke:var(--wall-light); }
  .reno-plan .wall-c { fill:url(#reno-plan-hatch); stroke:none; }
  .reno-plan .gap { fill:var(--paper); stroke:none; }
  .reno-plan .jamb { stroke:var(--ink); stroke-width:15; }
  .reno-plan .glass { stroke:var(--window); stroke-width:12; }
  .reno-plan .door-line { stroke:var(--door); stroke-width:12; stroke-dasharray:60 40; }
  .reno-plan .slide-leaf { fill:var(--door); stroke:none; }
  .reno-plan .slide-rail { stroke:var(--door); stroke-width:8; }
  .reno-plan .opening-text { fill:var(--ink); font-size:110px; text-anchor:middle;
        paint-order:stroke; stroke:var(--paper); stroke-width:40px; stroke-linejoin:round; }
  .reno-plan .stair { fill:none; stroke:var(--stair); stroke-width:12; }
  .reno-plan .stair-run { fill:none; stroke:var(--stair); stroke-width:15; }
  .reno-plan .stair-arrow { fill:var(--stair); }
  .reno-plan .dim { stroke:var(--dim); stroke-width:10; }
  .reno-plan .dim-tick { stroke:var(--dim); stroke-width:22; }
  .reno-plan .dim-text { fill:var(--dim); font-size:150px; text-anchor:middle; }
  .reno-plan .dim-text.small { font-size:110px; }
  .reno-plan .scale { stroke:var(--ink); stroke-width:14; }
  .reno-plan .scale-text { fill:var(--ink); font-size:170px; text-anchor:middle; }
  .reno-plan .legend { fill:var(--muted); font-size:150px; }
  .reno-plan .title { fill:var(--ink); font-size:380px; font-weight:600; }
  .reno-plan .subtitle { fill:var(--muted); font-size:200px; }
  .reno-plan .north { fill:var(--ink); }
  .reno-plan .north-text { fill:var(--ink); font-size:260px; text-anchor:middle; font-weight:600; }
`;

/** Python's f"{x:.nf}": correctly rounded, ties to even, and "-0" for a negative zero */
export function pyFixed(x: number, digits = 0): string {
  const rounded = pyRound(x, digits);
  const text = Math.abs(rounded).toFixed(digits);
  return x < 0 || Object.is(x, -0) ? `-${text}` : text;
}

/** a length in mm as it stands on a plan: cm, German comma, ",5" only where needed */
export function cm(mm: number): string {
  let text = pyFixed(mm / 10, 1);
  if (text.endsWith('.0')) text = text.slice(0, -2);
  return text.replace('.', ',');
}

function metres(mm: number): string {
  return pyFixed(mm / 1000, 3).replace('.', ',');
}

/** sorted, without points closer than 1 mm to the one before */
function mergePoints(points: number[]): number[] {
  const out: number[] = [];
  for (const p of [...points].sort((a, b) => a - b)) {
    if (out.length === 0 || p - out[out.length - 1] >= 1) out.push(p);
  }
  return out;
}

/** xml.sax.saxutils.escape */
function escape(text: string, quote = false): string {
  const out = text.replace(/&/g, '&amp;').replace(/>/g, '&gt;').replace(/</g, '&lt;');
  return quote ? out.replace(/"/g, '&quot;') : out;
}

type Side = 'S' | 'N' | 'W' | 'E';

export function buildPlanSvg(
  src: HouseSource,
  rooms: BuiltRooms,
  floor: PlanFloor,
  rawVersion: string,
): string {
  const version = escape(rawVersion, true);
  const variant = src.variant;
  const W = src.params.houseW;
  const D = src.params.houseD;
  const tOut = src.params.tOut;
  const out: string[] = [];
  const add = (line: string) => {
    out.push(line);
  };
  const f0 = (v: number) => pyFixed(v, 0);

  /** model y (north positive) -> svg y (north up) */
  const fy = (y: number) => D - y;

  const rect = (x0: number, y0: number, x1: number, y1: number, cls: string, extra = '') => {
    add(`<rect class="${cls}" x="${f0(x0)}" y="${f0(fy(y1))}" width="${f0(x1 - x0)}" height="${f0(y1 - y0)}"${extra}/>`);
  };
  /** svg coordinates */
  const line = (x1: number, y1: number, x2: number, y2: number, cls: string) => {
    add(`<line class="${cls}" x1="${f0(x1)}" y1="${f0(y1)}" x2="${f0(x2)}" y2="${f0(y2)}"/>`);
  };

  const walls = src.walls.filter((w) => w.floor === floor);
  let bx0 = 0;
  let bx1 = W;
  let by0 = 0;
  let by1 = D;
  if (walls.length > 0) {
    bx0 = Math.min(...walls.map((w) => w.x0));
    bx1 = Math.max(...walls.map((w) => w.x1));
    by0 = Math.min(...walls.map((w) => w.y0));
    by1 = Math.max(...walls.map((w) => w.y1));
  }

  const vx0 = bx0 - CHAIN_ZONE;
  const vx1 = bx1 + CHAIN_ZONE;
  const vy0 = fy(by1) - CHAIN_ZONE - TITLE_ZONE;
  const vy1 = fy(by0) + CHAIN_ZONE + FOOT_ZONE;
  const vb = `${f0(vx0)} ${f0(vy0)} ${f0(vx1 - vx0)} ${f0(vy1 - vy0)}`;
  add(`<svg xmlns="http://www.w3.org/2000/svg" class="reno-plan" viewBox="${vb}" data-variant="${variant}" `
    + `data-floor="${floor}" data-version="${version}" role="img" aria-label="${FLOOR_LABEL[floor]} ${VARIANT_LABEL[variant]}">`);
  add(`<style>${STYLE}</style>`);
  add('<defs><pattern id="reno-plan-hatch" patternUnits="userSpaceOnUse" width="120" height="120" '
    + 'patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="120" stroke="#8a8a8a" '
    + 'stroke-width="18"/></pattern></defs>');
  add(`<rect x="${f0(vx0)}" y="${f0(vy0)}" width="${f0(vx1 - vx0)}" height="${f0(vy1 - vy0)}" fill="var(--paper)"/>`);

  // ---- rooms (tap areas below the walls, stamps on top of everything)
  const labels: string[] = [];
  add('<g id="rooms">');
  for (const room of rooms.rooms) {
    if (room.floor !== floor) continue;
    if (room.rects.length === 0) continue; // no geometry yet (a planned room) - nothing to draw
    // ids and names come from a house file someone else may have written - the SVG goes
    // into the page as markup, so every text is escaped (a plain id stays unchanged)
    const id = escape(room.id, true);
    add(`<g class="room-group" data-room-id="${id}">`);
    for (const [x0, y0, x1, y1] of room.rects) rect(x0, y0, x1, y1, 'room', ` data-room-id="${id}"`);
    const area = (r: number[]) => (r[2] - r[0]) * (r[3] - r[1]);
    const big = room.rects.reduce((best, r) => (area(r) > area(best) ? r : best));
    const bw = big[2] - big[0];
    const bh = big[3] - big[1];
    const cx = (big[0] + big[2]) / 2;
    const cy = fy((big[1] + big[3]) / 2);
    const name = escape(room.name);
    // shrink the label until it fits the room, drop the area line in tiny rooms
    const avail = Math.max(bw - 180, 240);
    const size = Math.min(230, Math.max(120, Math.trunc(avail / (0.60 * Math.max(name.length, 1)))));
    // if the name is still wider than the room, squeeze the glyphs so it always fits
    const fit = 0.60 * size * name.length <= avail ? '' : ` textLength="${f0(avail)}" lengthAdjust="spacingAndGlyphs"`;
    const showArea = bh > 620 && bw > 900;
    // the clear inside dimensions, for a room that is one rectangle
    const showSize = showArea && room.rects.length === 1 && bh > 900 && bw > 1300;
    let dy = showArea ? 0 : size * 0.35;
    if (showSize) dy = 150;
    labels.push(`<text class="room-label" x="${f0(cx)}" y="${f0(cy - dy)}" font-size="${size}px"${fit}>${name}</text>`);
    if (showArea) {
      const m2 = pyFixed(room.areaM2 ?? 0, 2).replace('.', ',');
      labels.push(`<text class="room-area" x="${f0(cx)}" y="${f0(cy - dy + 230)}">${m2} m²</text>`);
    }
    if (showSize) {
      labels.push(`<text class="room-size" x="${f0(cx)}" y="${f0(cy - dy + 430)}">${metres(bw)} × ${metres(bh)}</text>`);
    }
    add('</g>');
  }
  add('</g>');

  // ---- walls: every outline first, then every fill on top - that leaves the outline
  // of the whole wall mass; the thin stroke in wall colour hides the seams where two
  // walls meet
  add('<g id="walls">');
  for (const w of walls) rect(w.x0, w.y0, w.x1, w.y1, 'wall-edge');
  for (const w of walls) {
    const thick = Math.min(w.x1 - w.x0, w.y1 - w.y0);
    const bearing = w.tragend ?? thick >= 240;
    rect(w.x0, w.y0, w.x1, w.y1, bearing ? 'wall' : 'wall light', ` data-wall="${escape(w.name, true)}"`);
  }
  for (const w of walls) {
    if (w.tag === 'C') rect(w.x0, w.y0, w.x1, w.y1, 'wall-c');
  }
  add('</g>');

  /**
   * a sliding door: each leaf half open on its face of the wall, as in the 3D view, and its
   * rail along the outer edge from the closed to the fully open leaf
   */
  const slideSymbol = (w: SourceWall, o: SourceOpening) => {
    const sl = o.slide!;
    const along = alongX(w);
    const [c0, c1] = along ? [w.y0, w.y1] : [w.x0, w.x1];
    const [q0, q1, qr] = sl.face === 'N' || sl.face === 'E' ? [c1 + 10, c1 + 50, c1 + 50] : [c0 - 50, c0 - 10, c0 - 50];
    for (const [b0, b1, d] of slideLeaves(o)) {
      const width = b1 - b0;
      const [l0, l1, r0, r1, half] = d > 0
        ? [b0, b1 + 50, b0, b1 + 50 + width, width / 2]
        : [b0 - 50, b1, b0 - 50 - width, b1, -width / 2];
      if (along) {
        rect(l0 + half, q0, l1 + half, q1, 'slide-leaf');
        line(r0, fy(qr), r1, fy(qr), 'slide-rail');
      } else {
        rect(q0, l0 + half, q1, l1 + half, 'slide-leaf');
        line(qr, fy(r0), qr, fy(r1), 'slide-rail');
      }
    }
  };

  // ---- openings: cut out of the wall, jambs, glass or door line, and the size as text
  add('<g id="openings">');
  const midX = (bx0 + bx1) / 2;
  const midY = (by0 + by1) / 2;
  for (const w of walls) {
    const start = alongX(w) ? w.x0 : w.y0;
    for (const o of w.openings ?? []) {
      // the same arithmetic as hausdatei.py (a0, width) so both builders round alike
      const a0 = o.from - start;
      const a1 = a0 + (o.to - o.from);
      let text = `${cm(o.to - o.from)}/${cm(o.height)}`;
      if (o.kind === 'window' && o.sill > 0) text += ` · BRH ${cm(o.sill)}`;
      if (o.tag === 'C') text += '*';
      if (alongX(w)) {
        const x0 = w.x0 + a0;
        const x1 = w.x0 + a1;
        const s0 = fy(w.y1); // svg y of the north face
        const s1 = fy(w.y0); // and of the south face
        add(`<rect class="gap" x="${f0(x0)}" y="${f0(s0 - 25)}" width="${f0(x1 - x0)}" height="${f0(s1 - s0 + 50)}"/>`);
        line(x0, s0 - 15, x0, s1 + 15, 'jamb');
        line(x1, s0 - 15, x1, s1 + 15, 'jamb');
        const sm = (s0 + s1) / 2;
        if (o.kind === 'window') {
          line(x0, sm - 40, x1, sm - 40, 'glass');
          line(x0, sm + 40, x1, sm + 40, 'glass');
        } else if (o.slide) {
          slideSymbol(w, o);
        } else if (o.kind === 'door' && o.leaf !== false) {
          line(x0, sm, x1, sm, 'door-line');
        }
        // the text goes to the side facing the middle of the house, clear of a sliding leaf
        const north = (w.y0 + w.y1) / 2 < midY;
        const shift = o.slide && o.slide.face === (north ? 'N' : 'S') ? 60 : 0;
        const ty = north ? s0 - 70 - shift : s1 + 150 + shift;
        add(`<text class="opening-text" x="${f0((x0 + x1) / 2)}" y="${f0(ty)}">${text}</text>`);
      } else {
        const y0 = fy(w.y0 + a1); // svg: y0 is the northern end
        const y1 = fy(w.y0 + a0);
        add(`<rect class="gap" x="${f0(w.x0 - 25)}" y="${f0(y0)}" width="${f0(w.x1 - w.x0 + 50)}" height="${f0(y1 - y0)}"/>`);
        line(w.x0 - 15, y0, w.x1 + 15, y0, 'jamb');
        line(w.x0 - 15, y1, w.x1 + 15, y1, 'jamb');
        const xm = (w.x0 + w.x1) / 2;
        if (o.kind === 'window') {
          line(xm - 40, y0, xm - 40, y1, 'glass');
          line(xm + 40, y0, xm + 40, y1, 'glass');
        } else if (o.slide) {
          slideSymbol(w, o);
        } else if (o.kind === 'door' && o.leaf !== false) {
          line(xm, y0, xm, y1, 'door-line');
        }
        const east = xm < midX;
        const shift = o.slide && o.slide.face === (east ? 'E' : 'W') ? 60 : 0;
        const tx = east ? w.x1 + 150 + shift : w.x0 - 70 - shift;
        const ty = (y0 + y1) / 2;
        add(`<text class="opening-text" x="${f0(tx)}" y="${f0(ty)}" transform="rotate(-90 ${f0(tx)} ${f0(ty)})">${text}</text>`);
      }
    }
  }
  add('</g>');

  // ---- stairs: steps as lines and the walking line with its arrow pointing up
  add('<g id="stairs">');
  for (const s of src.stairs) {
    if ((s.z0 < 0 ? 'KG' : 'EG') !== floor) continue;
    const [dx, dy] = ({ '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] } as const)[s.direction];
    const length = s.steps * s.run;
    let box: [number, number, number, number];
    if (dx) {
      const x0 = dx > 0 ? s.x0 : s.x0 - length;
      box = [x0, s.y0, x0 + length, s.y0 + s.width];
    } else {
      const y0 = dy > 0 ? s.y0 : s.y0 - length;
      box = [s.x0, y0, s.x0 + s.width, y0 + length];
    }
    rect(box[0], box[1], box[2], box[3], 'stair');
    for (let i = 1; i < s.steps; i += 1) {
      if (dx) {
        const x = box[0] + i * s.run;
        line(x, fy(box[1]), x, fy(box[3]), 'stair');
      } else {
        const y = box[1] + i * s.run;
        line(box[0], fy(y), box[2], fy(y), 'stair');
      }
    }
    // walking line from the middle of the first step to the top, in svg coordinates
    if (dx) {
      const ly = fy(s.y0 + s.width / 2);
      const lx0 = s.x0 + dx * s.run / 2;
      const lx1 = s.x0 + dx * length;
      line(lx0, ly, lx1 - dx * 180, ly, 'stair-run');
      add(`<path class="stair-arrow" d="M ${f0(lx1)} ${f0(ly)} l ${f0(-dx * 220)} -90 l 0 180 z"/>`);
    } else {
      const lx = s.x0 + s.width / 2;
      const ly0 = fy(s.y0 + dy * s.run / 2);
      const ly1 = fy(s.y0 + dy * length);
      line(lx, ly0, lx, ly1 + dy * 180, 'stair-run');
      add(`<path class="stair-arrow" d="M ${f0(lx)} ${f0(ly1)} l -90 ${f0(dy * 220)} l 180 0 z"/>`);
    }
  }
  add('</g>');

  // ---- room stamps on top, with a halo so they stay readable over stairs
  add('<g id="room-labels">');
  out.push(...labels);
  add('</g>');

  // ---- dimension chains on all four sides, from the outside in: overall, the outer wall of
  // that side, the walls meeting it, and then the inside of the half of the house next to it
  // (the upper chain shows the northern half, the lower one the southern half)
  add('<g id="dimensions">');
  const band = tOut + 200; // how far into the house a wall may start and still meet the facade

  const stairBoxes: [number, number, number, number][] = [];
  for (const s of src.stairs) {
    if ((s.z0 < 0 ? 'KG' : 'EG') !== floor) continue;
    const length = s.steps * s.run;
    if (s.direction === '+x' || s.direction === '-x') {
      const x = s.direction === '+x' ? s.x0 : s.x0 - length;
      stairBoxes.push([x, s.y0, x + length, s.y0 + s.width]);
    } else {
      const y = s.direction === '+y' ? s.y0 : s.y0 - length;
      stairBoxes.push([s.x0, y, s.x0 + s.width, y + length]);
    }
  }

  const chainPoints = (side: Side): [number[], number[], number[], number[]] => {
    const horizontal = side === 'S' || side === 'N';
    const [lo, hi] = horizontal ? [bx0, bx1] : [by0, by1];
    const edge = { S: by0, N: by1, W: bx0, E: bx1 }[side];
    const mid = horizontal ? midY : midX;
    const outward = side === 'N' || side === 'E' ? 1 : -1; // direction from the middle to this side

    /** a wall coordinate across the chain: y for a chain along x, x otherwise */
    const d0 = (w: SourceWall) => (horizontal ? w.y0 : w.x0);
    const d1 = (w: SourceWall) => (horizontal ? w.y1 : w.x1);
    /** does the wall reach within dist of this facade */
    const near = (w: SourceWall, dist: number) => (outward < 0 ? d0(w) <= edge + dist : d1(w) >= edge - dist);
    const span = (w: SourceWall): [number, number] => (horizontal ? [w.x0, w.x1] : [w.y0, w.y1]);
    const openingsOf = (w: SourceWall): number[] => {
      const start = span(w)[0];
      const pts: number[] = [];
      for (const o of w.openings ?? []) {
        const a0 = o.from - start;
        pts.push(start + a0, start + a0 + (o.to - o.from));
      }
      return pts;
    };

    const across = walls.filter((w) => alongX(w) !== horizontal); // cut by the chain
    const parallel = walls.filter((w) => alongX(w) === horizontal);
    const facade = parallel.filter((w) => near(w, tOut));

    /** the outer face of a wall on this side */
    const face = (w: SourceWall) => (outward > 0 ? d1(w) : d0(w));
    /** a wall across the chain that is part of this facade: a corner piece, or a wall that
     * stands out in front of the outer wall - not one that only runs into it */
    const onFacade = (w: SourceWall) => {
      if (!near(w, tOut)) return false;
      const [a0, a1] = span(w);
      const behind = facade.filter((f) => span(f)[0] < a1 && span(f)[1] > a0);
      return behind.every((f) => (face(w) - face(f)) * outward > 0);
    };
    /** does the stretch a..b across the chain reach into this half of the house */
    const inHalf = (a: number, b: number) => (outward > 0 ? b > mid : a < mid);
    /** is a point across the chain in this half (the middle line counts to N and E) */
    const onSide = (c: number) => (outward > 0 ? c >= mid : c < mid);

    // the outer wall of this side: where it starts and ends, steps forward or back, and its
    // openings; pieces that continue each other in one line count as one
    const pieces: [number, number, number][] = [
      ...facade.map((w): [number, number, number] => [...span(w), face(w)]),
      ...across.filter(onFacade).map((w): [number, number, number] => [...span(w), face(w)]),
    ].sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
    const runs: [number, number, number][] = [];
    for (const [a0, a1, f] of pieces) {
      const last = runs[runs.length - 1];
      if (last && a0 <= last[1] + 1 && Math.abs(f - last[2]) < 1) last[1] = Math.max(last[1], a1);
      else runs.push([a0, a1, f]);
    }
    const facadePts = [lo, hi];
    for (const [a0, a1] of runs) facadePts.push(a0, a1);
    for (const w of facade) facadePts.push(...openingsOf(w));
    // every wall that meets this facade - none but the two outer walls is nothing to show
    let wallsPts = [lo, hi];
    for (const w of across) if (near(w, band)) wallsPts.push(...span(w));
    if (mergePoints(wallsPts).length <= 4) wallsPts = [lo, hi];
    // the inside of this half: every wall, the free ends of the walls along the chain, the
    // doors in them and the stairs - so every door can be found from the wall next to it.
    // Each edge carries how far its part lies from this facade.
    const remote = (a: number, b: number) => Math.max(0, outward > 0 ? edge - b : a - edge);
    const inner: [number, number][] = [[-1, lo], [-1, hi]];
    for (const w of across) {
      if (inHalf(d0(w), d1(w))) for (const e of span(w)) inner.push([remote(d0(w), d1(w)), e]);
    }
    for (const w of parallel) {
      if (facade.includes(w) || !onSide((d0(w) + d1(w)) / 2)) continue;
      const r = remote(d0(w), d1(w));
      // an end that runs into a wall across says nothing new; a free end does
      for (const e of span(w)) {
        const meets = across.some((c) => span(c)[0] - 1 <= e && e <= span(c)[1] + 1
          && d0(c) <= d1(w) + 1 && d1(c) >= d0(w) - 1);
        if (!meets) inner.push([r, e]);
      }
      for (const e of openingsOf(w)) inner.push([r, e]);
    }
    for (const [x0, y0, x1, y1] of stairBoxes) {
      const [a0, a1, b0, b1] = horizontal ? [x0, x1, y0, y1] : [y0, y1, x0, x1];
      if (onSide((b0 + b1) / 2)) inner.push([remote(b0, b1), a0], [remote(b0, b1), a1]);
    }
    // rows of rooms at different depths are rarely in line to the millimetre: of two edges
    // closer than SLIVER the one nearer this facade stays, so the chain shows no splinters
    const innerPts: number[] = [];
    for (const [, e] of inner.sort((p, q) => p[0] - q[0] || p[1] - q[1])) {
      if (lo <= e && e <= hi && innerPts.every((q) => Math.abs(e - q) < 1 || Math.abs(e - q) >= SLIVER)) {
        innerPts.push(e);
      }
    }
    return [mergePoints(innerPts), mergePoints(wallsPts), mergePoints(facadePts), [lo, hi]];
  };

  const drawChain = (side: Side, level: number, pts: number[]) => {
    let pos: number;
    if (side === 'S') pos = fy(by0) + CHAIN_GAP + level * CHAIN_STEP;
    else if (side === 'N') pos = fy(by1) - CHAIN_GAP - level * CHAIN_STEP;
    else if (side === 'W') pos = bx0 - CHAIN_GAP - level * CHAIN_STEP;
    else pos = bx1 + CHAIN_GAP + level * CHAIN_STEP;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const horizontal = side === 'S' || side === 'N';
    if (horizontal) {
      line(first - 150, pos, last + 150, pos, 'dim');
      for (const p of pts) line(p - 60, pos + 60, p + 60, pos - 60, 'dim-tick');
    } else {
      line(pos, fy(first) + 150, pos, fy(last) - 150, 'dim');
      for (const p of pts) line(pos - 60, fy(p) + 60, pos + 60, fy(p) - 60, 'dim-tick');
    }
    // a text too wide for its stretch goes to the other side of the line; several narrow
    // ones in a row take turns, so neighbours do not overlap
    let flip = false;
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const text = cm(b - a);
      const size = b - a < 600 ? 110 : 150;
      const narrow = 0.56 * size * text.length + 40 > b - a;
      flip = narrow && !flip;
      const small = size === 110 ? ' small' : '';
      const off = flip ? 50 + 0.72 * size : -50;
      if (horizontal) {
        add(`<text class="dim-text${small}" x="${f0((a + b) / 2)}" y="${f0(pos + off)}">${text}</text>`);
      } else {
        const tx = pos + off;
        const ty = fy((a + b) / 2);
        add(`<text class="dim-text${small}" x="${f0(tx)}" y="${f0(ty)}" `
          + `transform="rotate(-90 ${f0(tx)} ${f0(ty)})">${text}</text>`);
      }
    }
  };

  const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
  if (walls.length > 0) {
    for (const side of ['S', 'N', 'W', 'E'] as const) {
      const [innerChain, wallChain, facadeChain, totalChain] = chainPoints(side);
      let level = 0;
      const drawn: number[][] = [];
      for (const pts of [innerChain, wallChain, facadeChain]) {
        // a chain that shows nothing new is left out
        if (pts.length > 2 && !drawn.some((d) => same(d, pts))) {
          drawChain(side, level, pts);
          drawn.push(pts);
          level += 1;
        }
      }
      drawChain(side, level, totalChain);
    }
  }
  add('</g>');

  // ---- north arrow (top right), scale bar and legend (bottom left)
  const nx = vx1 - 450;
  const ny = vy0 + 200;
  add(`<g id="north"><path class="north" d="M ${f0(nx)} ${f0(ny)} l 150 380 l -150 -120 l -150 120 z"/>`
    + `<text class="north-text" x="${f0(nx)}" y="${f0(ny + 650)}">N</text></g>`);
  const sx = vx0 + 150;
  const sy = vy1 - FOOT_ZONE + 400;
  add(`<g id="scale"><line class="scale" x1="${f0(sx)}" y1="${f0(sy)}" x2="${f0(sx + 5000)}" y2="${f0(sy)}"/>`);
  for (let i = 0; i < 6; i += 1) {
    add(`<line class="scale" x1="${f0(sx + i * 1000)}" y1="${f0(sy - 70)}" x2="${f0(sx + i * 1000)}" y2="${f0(sy + 70)}"/>`);
  }
  add(`<text class="scale-text" x="${f0(sx + 2500)}" y="${f0(sy + 280)}">5 m</text></g>`);
  add(`<text class="legend" x="${f0(sx + 5500)}" y="${f0(sy + 50)}">${escape(LEGEND)}</text>`);

  // ---- title
  add(`<text class="title" x="${f0(vx0 + 150)}" y="${f0(vy0 + 450)}">${FLOOR_LABEL[floor]}</text>`);
  add(`<text class="subtitle" x="${f0(vx0 + 150)}" y="${f0(vy0 + 780)}">${VARIANT_LABEL[variant]} · Modell v${version} · Schlesierstraße 31</text>`);
  add('</svg>');
  return out.join('\n');
}
