/**
 * The 2D floor plans as SVG, built from a house file on the device.
 *
 * Port of tools/model/build_plans_svg.py - byte for byte the same output, which
 * plansSvg.test.ts checks against the committed public/plans/*.svg. With it the plans
 * follow a model imported in the app instead of showing the bundled state until the
 * next deploy.
 *
 * The SVG uses the model coordinate system in mm (y flipped so north is up) and carries
 * data-room-id on every room area, so rooms are tappable in the plan as in the 3D view.
 */
import { pyRound } from './pyRound';
import { alongX, type HouseSource } from './source';
import type { BuiltRooms } from './types';

export type PlanFloor = 'KG' | 'EG' | 'OG';
export const PLAN_FLOORS: PlanFloor[] = ['KG', 'EG', 'OG'];

const MARGIN = 1100; // mm left/right/top of the building
const MARGIN_BOTTOM = 2100; // mm below (dimension chain + scale bar)
export const FLOOR_LABEL: Record<PlanFloor, string> = { KG: 'Kellergeschoss', EG: 'Erdgeschoss', OG: 'Obergeschoss' };
export const VARIANT_LABEL: Record<'ist' | 'soll', string> = { ist: 'Bestand', soll: 'Zielzustand' };
const TAG_FILL: Record<string, string> = { A: 'var(--wall-a)', B: 'var(--wall-b)', C: 'var(--wall-c)' };

const STYLE = `
  svg { --bg:#1d2126; --ink:#e8e4da; --muted:#9aa3ad; --accent:#c9a86a;
        --wall-a:#d9d3c5; --wall-b:#c9b990; --wall-c:#b8845a; --room:#c9a86a;
        --window:#8ec6e6; --door:#7fc98a; --open:#e8e4da; --stair:#a88a5c;
        background:var(--bg); font-family:"Segoe UI",system-ui,sans-serif; }
  svg.light { --bg:#ffffff; --ink:#1d2126; --muted:#666e76; --accent:#8a6d2f;
        --wall-a:#3a3a36; --wall-b:#6b6354; --wall-c:#8a6242; --room:#8a6d2f;
        --window:#2f7fae; --door:#2e7d46; --open:#999; --stair:#7a6338; }
  .room { fill:var(--room); fill-opacity:.14; stroke:var(--room); stroke-opacity:.35;
          stroke-width:12; cursor:pointer; }
  .room:hover, .room.selected { fill-opacity:.28; }
  .room-label { fill:var(--ink); font-size:230px; text-anchor:middle; pointer-events:none;
                paint-order:stroke; stroke:var(--bg); stroke-width:70px; stroke-linejoin:round; }
  .room-area { fill:var(--muted); font-size:170px; text-anchor:middle; pointer-events:none;
               paint-order:stroke; stroke:var(--bg); stroke-width:70px; stroke-linejoin:round; }
  .wall { stroke:none; }
  .window { fill:var(--window); }
  .door { fill:var(--door); }
  .open { fill:var(--open); fill-opacity:.35; }
  .stair { fill:none; stroke:var(--stair); stroke-width:30; }
  .dim { stroke:var(--muted); stroke-width:14; }
  .dim-text { fill:var(--muted); font-size:200px; text-anchor:middle; }
  .title { fill:var(--ink); font-size:400px; font-weight:600; }
  .subtitle { fill:var(--muted); font-size:220px; }
  .north { fill:var(--accent); }
  .north-text { fill:var(--accent); font-size:300px; text-anchor:middle; font-weight:600; }
  @media print { svg { --bg:#fff; } }
`;

/** Python's f"{x:.nf}": correctly rounded, ties to even, and "-0" for a negative zero */
export function pyFixed(x: number, digits = 0): string {
  const rounded = pyRound(x, digits);
  const text = Math.abs(rounded).toFixed(digits);
  return x < 0 || Object.is(x, -0) ? `-${text}` : text;
}

/** xml.sax.saxutils.escape */
function escape(text: string, quote = false): string {
  const out = text.replace(/&/g, '&amp;').replace(/>/g, '&gt;').replace(/</g, '&lt;');
  return quote ? out.replace(/"/g, '&quot;') : out;
}

export function buildPlanSvg(
  src: HouseSource,
  rooms: BuiltRooms,
  floor: PlanFloor,
  version: string,
): string {
  const variant = src.variant;
  const W = src.params.houseW;
  const D = src.params.houseD;
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

  const vb = `${-MARGIN} ${-MARGIN} ${W + 2 * MARGIN} ${D + MARGIN + MARGIN_BOTTOM}`;
  add(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" data-variant="${variant}" data-floor="${floor}" `
    + `data-version="${version}" role="img" aria-label="${FLOOR_LABEL[floor]} ${VARIANT_LABEL[variant]}">`);
  add(`<style>${STYLE}</style>`);
  add(`<rect x="${-MARGIN}" y="${-MARGIN}" width="${W + 2 * MARGIN}" height="${D + MARGIN + MARGIN_BOTTOM}" fill="var(--bg)"/>`);

  // ---- rooms (areas below the walls, labels on top of everything)
  const labels: string[] = [];
  add('<g id="rooms">');
  for (const room of rooms.rooms) {
    if (room.floor !== floor) continue;
    add(`<g class="room-group" data-room-id="${room.id}">`);
    for (const [x0, y0, x1, y1] of room.rects) rect(x0, y0, x1, y1, 'room', ` data-room-id="${room.id}"`);
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
    const dy = showArea ? 0 : size * 0.35;
    labels.push(`<text class="room-label" x="${f0(cx)}" y="${f0(cy - dy)}" font-size="${size}px"${fit}>${name}</text>`);
    if (showArea) labels.push(`<text class="room-area" x="${f0(cx)}" y="${f0(cy + 230)}">${pyFixed(room.areaM2, 1)} m²</text>`);
    add('</g>');
  }
  add('</g>');

  // ---- walls
  add('<g id="walls">');
  const walls = src.walls.filter((w) => w.floor === floor);
  for (const w of walls) {
    const fill = TAG_FILL[w.tag] ?? 'var(--wall-a)';
    rect(w.x0, w.y0, w.x1, w.y1, 'wall', ` fill="${fill}" data-wall="${escape(w.name, true)}"`);
  }
  add('</g>');

  // ---- openings
  add('<g id="openings">');
  for (const w of walls) {
    for (const o of w.openings ?? []) {
      const cls = o.kind === 'window' ? 'window' : o.kind === 'door' ? 'door' : 'open';
      if (alongX(w)) rect(o.from, w.y0, o.to, w.y1, cls);
      else rect(w.x0, o.from, w.x1, o.to, cls);
    }
  }
  add('</g>');

  // ---- stairs (steps as lines, like the printed plan)
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
        add(`<line class="stair" x1="${f0(x)}" y1="${f0(fy(box[1]))}" x2="${f0(x)}" y2="${f0(fy(box[3]))}"/>`);
      } else {
        const y = box[1] + i * s.run;
        add(`<line class="stair" x1="${f0(box[0])}" y1="${f0(fy(y))}" x2="${f0(box[2])}" y2="${f0(fy(y))}"/>`);
      }
    }
  }
  add('</g>');

  // ---- room labels on top, with a halo so they stay readable over stairs
  add('<g id="room-labels">');
  out.push(...labels);
  add('</g>');

  // ---- overall dimensions (south chain and west chain)
  const off = 520;
  add('<g id="dimensions">');
  const y = fy(0) + off;
  add(`<line class="dim" x1="0" y1="${y}" x2="${W}" y2="${y}"/>`);
  add(`<line class="dim" x1="0" y1="${y - 90}" x2="0" y2="${y + 90}"/>`);
  add(`<line class="dim" x1="${W}" y1="${y - 90}" x2="${W}" y2="${y + 90}"/>`);
  add(`<text class="dim-text" x="${f0(W / 2)}" y="${y + 260}">${pyFixed(W / 1000, 2)} m</text>`);
  const x = -off;
  add(`<line class="dim" x1="${x}" y1="0" x2="${x}" y2="${D}"/>`);
  add(`<line class="dim" x1="${x - 90}" y1="0" x2="${x + 90}" y2="0"/>`);
  add(`<line class="dim" x1="${x - 90}" y1="${D}" x2="${x + 90}" y2="${D}"/>`);
  add(`<text class="dim-text" x="${x - 130}" y="${f0(D / 2)}" `
    + `transform="rotate(-90 ${x - 130} ${f0(D / 2)})">${pyFixed(D / 1000, 2)} m</text>`);
  add('</g>');

  // ---- north arrow (top right) and scale bar (bottom left)
  const nx = W + 380;
  const ny = -380;
  add(`<g id="north"><path class="north" d="M ${nx} ${ny} l 150 380 l -150 -120 l -150 120 z"/>`
    + `<text class="north-text" x="${nx}" y="${ny + 700}">N</text></g>`);
  const sx = 0;
  const sy = fy(0) + off + 640;
  add(`<g id="scale"><line class="dim" x1="${sx}" y1="${sy}" x2="${sx + 5000}" y2="${sy}"/>`);
  for (let i = 0; i < 6; i += 1) {
    add(`<line class="dim" x1="${sx + i * 1000}" y1="${sy - 70}" x2="${sx + i * 1000}" y2="${sy + 70}"/>`);
  }
  add(`<text class="dim-text" x="${sx + 2500}" y="${sy + 280}">5 m</text></g>`);

  // ---- title
  add(`<text class="title" x="0" y="${f0(-MARGIN + 480)}">${FLOOR_LABEL[floor]}</text>`);
  add(`<text class="subtitle" x="0" y="${f0(-MARGIN + 800)}">${VARIANT_LABEL[variant]} · Modell v${version} · Schlesierstraße 31</text>`);
  add('</svg>');
  return out.join('\n');
}
