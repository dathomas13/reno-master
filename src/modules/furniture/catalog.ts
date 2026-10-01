/**
 * The furniture that can be placed in the planned house.
 *
 * Every piece is described as plain parts - boxes, cylinders, turned profiles, spheres -
 * in millimetres, built from its outer size. Nothing in here knows three.js: the parts are
 * data, furnitureScene.ts turns them into meshes, and the tests can check them without a
 * renderer. A longer kitchen gets more cabinets, a wider sofa more cushions, because the
 * parts are computed from the size, not stretched.
 *
 * Local frame of one piece: origin in the middle of its footprint on the floor, x along
 * its width, y along its depth with the FRONT at -d/2 and the back (the wall side) at
 * +d/2, z up. Placing and turning happens outside, in the item.
 */

export type Finish =
  | 'ceramic'
  | 'white'
  | 'front'
  | 'chrome'
  | 'metal'
  | 'steel'
  | 'wood'
  | 'woodDark'
  | 'fabric'
  | 'fabricLight'
  | 'cushion'
  | 'linen'
  | 'duvet'
  | 'dark'
  | 'blackglass'
  | 'glass'
  | 'mirror'
  | 'worktop'
  | 'basin'
  | 'hob'
  | 'rug'
  | 'plant'
  | 'pot';

/** colours of the finishes; the material kind (shiny, transparent) is decided in the scene */
export const FINISH_COLOR: Record<Finish, number> = {
  ceramic: 0xf5f5f2,
  white: 0xeceae5,
  front: 0xe6e2da,
  chrome: 0xc9ced3,
  metal: 0x80868c,
  steel: 0xb4b9be,
  wood: 0xb8905e,
  woodDark: 0x6e4f35,
  fabric: 0x707b88,
  fabricLight: 0x8f9aa6,
  cushion: 0x9ea8b3,
  linen: 0xf0ede6,
  duvet: 0xc3cfda,
  dark: 0x2f3338,
  blackglass: 0x16181b,
  glass: 0x9fd0ea,
  mirror: 0xb7c9d6,
  worktop: 0x8d8a85,
  basin: 0xdcdedb,
  hob: 0x55595e,
  rug: 0x8a6f5a,
  plant: 0x4f7a3a,
  pot: 0xb5653f,
};

/**
 * One part of a piece.
 *
 * - box: `c` is the centre of the footprint, `z` the underside, `s` the size; `r` rounds
 *   the edges.
 * - cyl: upright (`axis` z, the default) it stands on `z`; lying along x or y, `z` is the
 *   height of its axis and `h` its length, centred on `c`. `r2` makes it a cone, `sx`/`sy`
 *   stretch an upright one into an oval.
 * - lathe: a turned profile of [radius, height] pairs standing on `z`, for bowls and basins;
 *   `sx`/`sy` stretch it into an oval.
 * - sphere: centre at `c`/`z`, `sz` flattens or stretches it upright.
 */
export type Part =
  | { shape: 'box'; c: [number, number]; z: number; s: [number, number, number]; f: Finish; r?: number }
  | {
      shape: 'cyl';
      c: [number, number];
      z: number;
      r: number;
      h: number;
      f: Finish;
      r2?: number;
      axis?: 'x' | 'y' | 'z';
      sx?: number;
      sy?: number;
    }
  | { shape: 'lathe'; c: [number, number]; z: number; profile: [number, number][]; f: Finish; sx?: number; sy?: number }
  | { shape: 'sphere'; c: [number, number]; z: number; r: number; f: Finish; sz?: number };

export interface Dims {
  w: number;
  d: number;
  h: number;
}

export const CATALOG_GROUPS = ['Bad', 'Küche', 'Wohnen', 'Essen', 'Schlafen', 'Arbeiten', 'Sonstiges'] as const;
export type CatalogGroup = (typeof CATALOG_GROUPS)[number];

export interface CatalogEntry {
  type: string;
  label: string;
  group: CatalogGroup;
  /** outer size when placed */
  dims: Dims;
  /** height above the floor it is mounted at (wall cabinet, mirror) */
  z?: number;
  /** how far small fittings (a tap) may stand above `h` */
  over?: number;
  build(dims: Dims): Part[];
}

// ------------------------------------------------------------------ helpers

function box(cx: number, cy: number, z: number, w: number, d: number, h: number, f: Finish, r = 0): Part {
  return r > 0 ? { shape: 'box', c: [cx, cy], z, s: [w, d, h], f, r } : { shape: 'box', c: [cx, cy], z, s: [w, d, h], f };
}

/** box given by its extent in y instead of its centre, which is how most fronts and backs are thought of */
function boxY(cx: number, y0: number, y1: number, z: number, w: number, h: number, f: Finish, r = 0): Part {
  return box(cx, (y0 + y1) / 2, z, w, y1 - y0, h, f, r);
}

function post(cx: number, cy: number, z: number, r: number, h: number, f: Finish): Part {
  return { shape: 'cyl', c: [cx, cy], z, r, h, f };
}

function rod(axis: 'x' | 'y', cx: number, cy: number, z: number, r: number, length: number, f: Finish): Part {
  return { shape: 'cyl', c: [cx, cy], z, r, h: length, f, axis };
}

/** four legs inset from the corners of a w×d footprint */
function legs(w: number, d: number, inset: number, size: number, h: number, f: Finish, round = false): Part[] {
  const out: Part[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = sx * (w / 2 - inset - size / 2);
      const y = sy * (d / 2 - inset - size / 2);
      out.push(round ? post(x, y, 0, size / 2, h, f) : box(x, y, 0, size, size, h, f));
    }
  }
  return out;
}

/** how many equal doors or drawers fit a width, about `target` each */
function split(width: number, target: number): number {
  return Math.max(1, Math.round(width / target));
}

/**
 * A row of base cabinets: plinth, carcass, fronts with handles, worktop.
 * `front` is the y the fronts stand at, `back` where the carcass ends.
 */
function cabinetRow(w: number, front: number, back: number, h: number, top: number, fronts: number): Part[] {
  const plinth = 100;
  const parts: Part[] = [];
  parts.push(boxY(0, front + 50, back, 0, w, plinth, 'dark'));
  parts.push(boxY(0, front + 20, back, plinth, w, top - plinth, 'white'));
  const mw = w / fronts;
  for (let i = 0; i < fronts; i++) {
    const cx = -w / 2 + mw * (i + 0.5);
    parts.push(boxY(cx, front, front + 20, plinth + 2, mw - 4, top - plinth - 4, 'front'));
    parts.push(boxY(cx, front - 15, front, top - 70, Math.min(mw * 0.5, 300), 12, 'metal'));
  }
  return parts;
}

function sink(cx: number, cy: number, z: number, w: number, d: number): Part[] {
  return [box(cx, cy, z, w, d, 3, 'steel'), box(cx, cy, z + 1, w - 60, d - 60, 3, 'dark')];
}

function tap(cx: number, back: number, z: number, height: number): Part[] {
  const reach = Math.min(180, height * 0.7);
  return [
    post(cx, back - 50, z, 15, height, 'chrome'),
    rod('y', cx, back - 50 - reach / 2, z + height - 15, 12, reach, 'chrome'),
  ];
}

function hob(cx: number, cy: number, z: number, w: number, d: number): Part[] {
  const parts: Part[] = [box(cx, cy, z, w, d, 4, 'blackglass')];
  for (const [fx, fy, r] of [
    [-0.25, -0.22, 85],
    [0.25, -0.22, 70],
    [-0.25, 0.22, 70],
    [0.25, 0.22, 95],
  ] as const) {
    parts.push(post(cx + fx * w, cy + fy * d, z + 4, Math.min(r, w / 5, d / 5), 1, 'hob'));
  }
  return parts;
}

/**
 * Seating with arms, a back and cushions - sofa, armchair, the long side of a corner sofa.
 * `arms` says which ends get an armrest.
 */
function seating(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  h: number,
  seats: number,
  arms: { left: boolean; right: boolean },
  back = true,
): Part[] {
  const w = x1 - x0;
  const d = y1 - y0;
  const cx = (x0 + x1) / 2;
  const arm = Math.min(180, w / 6);
  const backD = back ? Math.min(220, d / 4) : 0;
  const foot = 100;
  const base = 420;
  const parts: Part[] = [];
  // feet
  for (const fx of [x0 + 60, x1 - 60]) for (const fy of [y0 + 60, y1 - 60]) parts.push(post(fx, fy, 0, 20, foot, 'dark'));
  // frame under the cushions
  parts.push(boxY(cx, y0, y1, foot, w, base - foot, 'fabric', 20));
  if (back) parts.push(boxY(cx, y1 - backD, y1, base, w, h - base, 'fabric', 30));
  const armTop = Math.min(h - 50, 650);
  if (arms.left) parts.push(boxY(x0 + arm / 2, y0, y1, base, arm, armTop - base, 'fabric', 40));
  if (arms.right) parts.push(boxY(x1 - arm / 2, y0, y1, base, arm, armTop - base, 'fabric', 40));
  const inner0 = x0 + (arms.left ? arm : 0);
  const inner1 = x1 - (arms.right ? arm : 0);
  const cw = (inner1 - inner0) / seats;
  const cushionTop = Math.min(base + 140, h);
  for (let i = 0; i < seats; i++) {
    const sx = inner0 + cw * (i + 0.5);
    parts.push(boxY(sx, y0 + 10, y1 - backD, base, cw - 10, cushionTop - base, 'cushion', 45));
    if (back) {
      const backTop = h - 30;
      if (backTop > cushionTop + 100) {
        parts.push(
          boxY(sx, y1 - backD - 160, y1 - backD, cushionTop, cw - 20, backTop - cushionTop, 'fabricLight', 60),
        );
      }
    }
  }
  return parts;
}

function bed(dims: Dims, pillows: number): Part[] {
  const { w, d, h } = dims;
  const head = 60;
  const frameTop = 330;
  const mattress = 220;
  const parts: Part[] = [];
  parts.push(...legs(w, d - head, 30, 60, 100, 'woodDark').map((part) => shift(part, 0, -head / 2)));
  parts.push(boxY(0, -d / 2, d / 2 - head, 100, w, frameTop - 100, 'wood', 10));
  parts.push(boxY(0, d / 2 - head, d / 2, 0, w, h, 'wood', 15));
  const mw = w - 60;
  const my0 = -d / 2 + 30;
  const my1 = d / 2 - head - 10;
  parts.push(boxY(0, my0, my1, frameTop, mw, mattress, 'linen', 40));
  // the duvet covers the front two thirds and hangs a bit over the sides
  const duvetEnd = my0 + (my1 - my0) * 0.7;
  parts.push(boxY(0, my0 - 10, duvetEnd, frameTop + mattress - 40, mw + 20, 70, 'duvet', 30));
  const pw = Math.min(700, (mw - 60) / pillows);
  for (let i = 0; i < pillows; i++) {
    const px = -((pillows - 1) * (pw + 40)) / 2 + i * (pw + 40);
    parts.push(boxY(px, my1 - 420, my1 - 40, frameTop + mattress, pw, 120, 'white', 50));
  }
  return parts;
}

function shift(part: Part, dx: number, dy: number): Part {
  return { ...part, c: [part.c[0] + dx, part.c[1] + dy] } as Part;
}

/** carcass with doors or with rows of drawers; the fronts sit in front of the carcass, the handles in front of them */
function cupboard({ w, d, h }: Dims, columns: number, drawers: boolean): Part[] {
  const parts: Part[] = [boxY(0, -d / 2 + 20, d / 2, 0, w, h, 'white')];
  const mw = w / columns;
  const at = (i: number) => -w / 2 + mw * (i + 0.5);
  if (drawers) {
    const base = 80;
    const rows = Math.max(1, Math.round((h - base) / 260));
    const rh = (h - base) / rows;
    for (let row = 0; row < rows; row++) {
      const z = base + rh * row;
      for (let i = 0; i < columns; i++) {
        parts.push(boxY(at(i), -d / 2 + 4, -d / 2 + 20, z + 2, mw - 4, rh - 4, 'front'));
        parts.push(boxY(at(i), -d / 2, -d / 2 + 4, z + rh / 2 - 6, Math.min(mw * 0.4, 200), 12, 'metal'));
      }
    }
    return parts;
  }
  const handle = Math.min(300, h * 0.3);
  for (let i = 0; i < columns; i++) {
    parts.push(boxY(at(i), -d / 2 + 4, -d / 2 + 20, 2, mw - 4, h - 4, 'front'));
    // two doors of a pair have their handles next to each other
    const pairedRight = i % 2 === 0 && i + 1 < columns;
    const hx = pairedRight ? at(i) + mw / 2 - 40 : at(i) - mw / 2 + 40;
    parts.push(boxY(hx, -d / 2, -d / 2 + 4, h / 2 - handle / 2, 14, handle, 'metal'));
  }
  return parts;
}

// ------------------------------------------------------------------ the catalog

export const CATALOG: CatalogEntry[] = [
  // ---------------------------------------------------------------- Bad
  {
    type: 'wc',
    label: 'WC wandhängend',
    group: 'Bad',
    dims: { w: 370, d: 540, h: 420 },
    build({ w, d, h }) {
      const bowlD = d - 60;
      const sy = bowlD / w;
      const r = w / 2;
      const top = h - 20;
      const bottom = Math.max(0, top - 220);
      const k = (top - bottom) / 220;
      return [
        boxY(0, d / 2 - 140, d / 2, bottom + 40 * k, w * 0.75, top - bottom - 40 * k, 'ceramic', 20),
        {
          shape: 'lathe',
          c: [0, -30],
          z: bottom,
          profile: [
            [0, 0],
            [r * 0.55, 0],
            [r * 0.75, 60 * k],
            [r * 0.94, 170 * k],
            [r, 220 * k],
            [0, 220 * k],
          ],
          f: 'ceramic',
          sy,
        },
        { shape: 'cyl', c: [0, -30], z: top, r: r - 4, h: 20, f: 'white', sy: (bowlD - 8) / (w - 8) },
      ];
    },
  },
  {
    type: 'wc-stand',
    label: 'WC mit Spülkasten',
    group: 'Bad',
    dims: { w: 380, d: 680, h: 780 },
    build({ w, d, h }) {
      const tankD = 180;
      const bowlD = d - 100;
      const r = w / 2;
      const seat = Math.min(400, h - 200);
      return [
        {
          shape: 'lathe',
          c: [0, -50],
          z: 0,
          profile: [
            [0, 0],
            [r * 0.6, 0],
            [r * 0.55, seat * 0.3],
            [r * 0.8, seat * 0.62],
            [r * 0.97, seat * 0.95],
            [r, seat],
            [0, seat],
          ],
          f: 'ceramic',
          sy: bowlD / w,
        },
        { shape: 'cyl', c: [0, -50], z: seat, r: r - 4, h: 20, f: 'white', sy: (bowlD - 8) / (w - 8) },
        boxY(0, d / 2 - tankD, d / 2, seat, w - 20, h - seat, 'ceramic', 20),
      ];
    },
  },
  {
    type: 'waschtisch',
    label: 'Waschtisch mit Unterschrank',
    group: 'Bad',
    dims: { w: 800, d: 480, h: 850 },
    over: 200,
    build({ w, d, h }) {
      const top = 150;
      const cabinetTop = h - top;
      const cabinetBottom = Math.max(0, cabinetTop - 450);
      const bw = Math.max(200, Math.min(w - 160, 560));
      const bd = Math.max(150, d - 180);
      return [
        boxY(0, -d / 2 + 30, d / 2, cabinetBottom, w - 20, cabinetTop - cabinetBottom, 'front'),
        boxY(0, -d / 2 + 15, -d / 2 + 30, cabinetTop - 80, Math.min(w * 0.4, 300), 12, 'metal'),
        box(0, 0, cabinetTop, w, d, top, 'ceramic', 15),
        { shape: 'cyl', c: [0, -20], z: h, r: bd / 2, h: 2, f: 'basin', sx: bw / bd },
        ...tap(0, d / 2, h, 180),
      ];
    },
  },
  {
    type: 'dusche',
    label: 'Dusche bodengleich',
    group: 'Bad',
    dims: { w: 900, d: 900, h: 2100 },
    build({ w, d, h }) {
      const tray = 30;
      const glassTop = h - 100;
      const sx = w / 2 - 150;
      return [
        box(0, 0, 0, w, d, tray, 'ceramic'),
        post(0, 0, tray, 50, 1, 'chrome'),
        boxY(0, -d / 2, -d / 2 + 8, tray, w - 8, glassTop - tray, 'glass'),
        box(-w / 2 + 4, 4, tray, 8, d - 8, glassTop - tray, 'glass'),
        boxY(0, -d / 2, -d / 2 + 20, glassTop, w, 20, 'chrome'),
        box(-w / 2 + 10, 0, glassTop, 20, d, 20, 'chrome'),
        post(sx, d / 2 - 30, 900, 12, h - 900 - 40, 'chrome'),
        rod('y', sx, d / 2 - 85, h - 60, 12, 110, 'chrome'),
        post(sx, d / 2 - 150, h - 90, Math.min(110, d / 6), 15, 'chrome'),
        boxY(sx, d / 2 - 60, d / 2, 1050, 150, 80, 'chrome', 10),
      ];
    },
  },
  {
    type: 'badewanne',
    label: 'Badewanne',
    group: 'Bad',
    dims: { w: 1700, d: 750, h: 580 },
    build({ w, d, h }) {
      const side = 70;
      const end = 110;
      return [
        boxY(0, -d / 2, -d / 2 + side, 0, w, h, 'ceramic', 15),
        boxY(0, d / 2 - side, d / 2, 0, w, h, 'ceramic', 15),
        box(-w / 2 + end / 2, 0, 0, end, d - 2 * side, h, 'ceramic', 15),
        box(w / 2 - end / 2, 0, 0, end, d - 2 * side, h, 'ceramic', 15),
        box(0, 0, 0, w - 2 * end, d - 2 * side, 160, 'basin'),
        post(w / 2 - 55, 0, h - 40, 30, 40, 'chrome'),
        rod('x', w / 2 - end - 40, 0, h - 30, 14, 90, 'chrome'),
      ];
    },
  },
  {
    type: 'heizkoerper-bad',
    label: 'Handtuchheizkörper',
    group: 'Bad',
    dims: { w: 500, d: 80, h: 1200 },
    z: 200,
    build({ w, h }) {
      const parts: Part[] = [post(-w / 2 + 15, 0, 0, 15, h, 'white'), post(w / 2 - 15, 0, 0, 15, h, 'white')];
      const bars = Math.max(2, Math.floor(h / 90));
      for (let i = 0; i < bars; i++) {
        parts.push(rod('x', 0, 0, 40 + ((h - 80) * i) / (bars - 1), 10, w - 30, 'white'));
      }
      return parts;
    },
  },
  {
    type: 'spiegel',
    label: 'Spiegel',
    group: 'Bad',
    dims: { w: 800, d: 30, h: 700 },
    z: 1100,
    build({ w, d, h }) {
      return [box(0, 0, 0, w, d, h, 'mirror', 8)];
    },
  },
  {
    type: 'waschmaschine',
    label: 'Waschmaschine',
    group: 'Bad',
    dims: { w: 600, d: 600, h: 850 },
    build: washer,
  },
  {
    type: 'trockner',
    label: 'Trockner',
    group: 'Bad',
    dims: { w: 600, d: 600, h: 850 },
    build: washer,
  },

  // ---------------------------------------------------------------- Küche
  {
    type: 'kuechenzeile',
    label: 'Küchenzeile mit Spüle und Kochfeld',
    group: 'Küche',
    dims: { w: 2400, d: 620, h: 910 },
    over: 320,
    build({ w, d, h }) {
      const n = split(w, 600);
      const top = h - 40;
      const parts = cabinetRow(w, -d / 2 + 20, d / 2, h, top, n);
      parts.push(box(0, 0, top, w, d, 40, 'worktop'));
      const mw = w / n;
      const at = (i: number) => -w / 2 + mw * (i + 0.5);
      const sinkAt = n <= 3 ? 0 : 1;
      const sw = Math.min(mw - 100, 500);
      parts.push(...sink(at(sinkAt), -20, h - 2, sw, Math.min(d - 200, 420)));
      parts.push(...tap(at(sinkAt), d / 2, h, 300));
      if (n >= 2) {
        const hobAt = n >= 4 ? n - 2 : n - 1;
        parts.push(...hob(at(hobAt), -10, h, Math.min(mw - 60, 580), Math.min(d - 100, 510)));
      }
      return parts;
    },
  },
  {
    type: 'unterschrank',
    label: 'Unterschrank mit Arbeitsplatte',
    group: 'Küche',
    dims: { w: 600, d: 620, h: 910 },
    build({ w, d, h }) {
      const top = h - 40;
      return [...cabinetRow(w, -d / 2 + 20, d / 2, h, top, split(w, 600)), box(0, 0, top, w, d, 40, 'worktop')];
    },
  },
  {
    type: 'haengeschrank',
    label: 'Hängeschrank',
    group: 'Küche',
    dims: { w: 1200, d: 350, h: 700 },
    z: 1450,
    build({ w, d, h }) {
      const n = split(w, 600);
      const mw = w / n;
      const parts: Part[] = [boxY(0, -d / 2 + 20, d / 2, 0, w, h, 'white')];
      for (let i = 0; i < n; i++) {
        const cx = -w / 2 + mw * (i + 0.5);
        parts.push(boxY(cx, -d / 2 + 4, -d / 2 + 20, 2, mw - 4, h - 4, 'front'));
        parts.push(boxY(cx, -d / 2, -d / 2 + 4, 40, Math.min(mw * 0.5, 300), 12, 'metal'));
      }
      return parts;
    },
  },
  {
    type: 'hochschrank',
    label: 'Hochschrank / Einbaukühlschrank',
    group: 'Küche',
    dims: { w: 600, d: 620, h: 2150 },
    build({ w, d, h }) {
      const plinth = 100;
      const split_ = plinth + (h - plinth) * 0.55;
      return [
        boxY(0, -d / 2 + 70, d / 2, 0, w, plinth, 'dark'),
        boxY(0, -d / 2 + 35, d / 2, plinth, w, h - plinth, 'white'),
        boxY(0, -d / 2 + 15, -d / 2 + 35, plinth + 2, w - 4, split_ - plinth - 4, 'front'),
        boxY(0, -d / 2 + 15, -d / 2 + 35, split_ + 2, w - 4, h - split_ - 4, 'front'),
        boxY(w / 2 - 50, -d / 2, -d / 2 + 15, split_ - 350, 14, 300, 'metal'),
        boxY(w / 2 - 50, -d / 2, -d / 2 + 15, split_ + 50, 14, 300, 'metal'),
      ];
    },
  },
  {
    type: 'kuehlschrank',
    label: 'Kühlschrank freistehend',
    group: 'Küche',
    dims: { w: 700, d: 700, h: 1850 },
    build({ w, d, h }) {
      const split_ = h * 0.6;
      return [
        boxY(0, -d / 2 + 30, d / 2, 0, w, h, 'steel', 20),
        boxY(0, -d / 2 + 10, -d / 2 + 30, 20, w - 10, split_ - 30, 'steel', 10),
        boxY(0, -d / 2 + 10, -d / 2 + 30, split_ + 10, w - 10, h - split_ - 20, 'steel', 10),
        boxY(-w / 2 + 60, -d / 2, -d / 2 + 10, split_ - 450, 20, 400, 'metal'),
        boxY(-w / 2 + 60, -d / 2, -d / 2 + 10, split_ + 60, 20, 300, 'metal'),
      ];
    },
  },
  {
    type: 'kuecheninsel',
    label: 'Kücheninsel mit Kochfeld',
    group: 'Küche',
    dims: { w: 1800, d: 1000, h: 910 },
    over: 10,
    build({ w, d, h }) {
      const top = h - 40;
      const overhang = Math.min(300, d / 3);
      const parts = cabinetRow(w, -d / 2 + 20, d / 2 - overhang, h, top, split(w, 600));
      parts.push(box(0, 0, top, w, d, 40, 'worktop'));
      parts.push(...hob(0, -d / 2 + 20 + (d - overhang - 20) / 2, h, Math.min(w - 200, 800), Math.min(d - overhang - 120, 520)));
      return parts;
    },
  },

  // ---------------------------------------------------------------- Wohnen
  {
    type: 'sofa',
    label: 'Sofa',
    group: 'Wohnen',
    dims: { w: 2200, d: 950, h: 830 },
    build({ w, d, h }) {
      const seats = Math.max(1, Math.round((w - 360) / 650));
      return seating(-w / 2, w / 2, -d / 2, d / 2, h, seats, { left: true, right: true });
    },
  },
  {
    type: 'ecksofa',
    label: 'Ecksofa',
    group: 'Wohnen',
    dims: { w: 2800, d: 1800, h: 830 },
    build({ w, d, h }) {
      const depth = Math.min(950, d * 0.6);
      const chaise = Math.min(950, w * 0.4);
      const seats = Math.max(1, Math.round((w - chaise - 180) / 650));
      return [
        // the long side along the back, its left end continues into the chaise
        ...seating(-w / 2, w / 2, d / 2 - depth, d / 2, h, seats + 1, { left: false, right: true }),
        ...seating(-w / 2, -w / 2 + chaise, -d / 2, d / 2 - depth, h, 1, { left: true, right: false }, false),
      ];
    },
  },
  {
    type: 'sessel',
    label: 'Sessel',
    group: 'Wohnen',
    dims: { w: 850, d: 850, h: 830 },
    build({ w, d, h }) {
      return seating(-w / 2, w / 2, -d / 2, d / 2, h, 1, { left: true, right: true });
    },
  },
  {
    type: 'couchtisch',
    label: 'Couchtisch',
    group: 'Wohnen',
    dims: { w: 1100, d: 600, h: 420 },
    build({ w, d, h }) {
      return [...legs(w, d, 40, 50, h - 40, 'woodDark'), box(0, 0, h - 40, w, d, 40, 'wood', 8)];
    },
  },
  {
    type: 'tvboard',
    label: 'TV-Board mit Fernseher',
    group: 'Wohnen',
    dims: { w: 1800, d: 450, h: 1280 },
    build({ w, d, h }) {
      const board = Math.min(500, h * 0.4);
      const n = split(w, 600);
      const mw = w / n;
      const tvW = Math.min(w - 100, 1450);
      const tvH = Math.min(h - board - 80, tvW * 0.57);
      const parts: Part[] = [boxY(0, -d / 2 + 18, d / 2, 0, w, board, 'woodDark')];
      for (let i = 0; i < n; i++) {
        parts.push(boxY(-w / 2 + mw * (i + 0.5), -d / 2, -d / 2 + 18, 102, mw - 4, board - 104, 'wood'));
      }
      parts.push(box(0, 0, board, 300, 200, 10, 'dark'));
      parts.push(box(0, 0, board + 10, 60, 40, 70, 'dark'));
      parts.push(box(0, 0, board + 70, tvW, 50, tvH, 'blackglass', 6));
      return parts;
    },
  },
  {
    type: 'regal',
    label: 'Regal',
    group: 'Wohnen',
    dims: { w: 800, d: 350, h: 2000 },
    build({ w, d, h }) {
      const t = 25;
      const parts: Part[] = [
        box(-w / 2 + t / 2, 0, 0, t, d, h, 'wood'),
        box(w / 2 - t / 2, 0, 0, t, d, h, 'wood'),
        boxY(0, d / 2 - 8, d / 2, 0, w - 2 * t, h, 'woodDark'),
      ];
      const shelves = Math.max(2, Math.round(h / 350) + 1);
      for (let i = 0; i < shelves; i++) {
        const z = Math.min(h - t, 60 + ((h - 60 - t) * i) / (shelves - 1));
        parts.push(box(0, -4, z, w - 2 * t, d - 8, t, 'wood'));
      }
      return parts;
    },
  },
  {
    type: 'teppich',
    label: 'Teppich',
    group: 'Wohnen',
    dims: { w: 2000, d: 3000, h: 12 },
    build({ w, d, h }) {
      return [box(0, 0, 0, w, d, h, 'rug', Math.min(h / 2, 4))];
    },
  },
  {
    type: 'pflanze',
    label: 'Zimmerpflanze',
    group: 'Wohnen',
    dims: { w: 500, d: 500, h: 1300 },
    build({ w, d, h }) {
      const r = Math.min(w, d) / 2;
      const pot = Math.min(400, h * 0.3);
      const leaves = h - pot;
      return [
        { shape: 'cyl', c: [0, 0], z: 0, r: r * 0.55, r2: r * 0.7, h: pot, f: 'pot' },
        { shape: 'sphere', c: [0, 0], z: pot + leaves * 0.45, r: r, sz: (leaves * 0.45) / r, f: 'plant' },
        { shape: 'sphere', c: [r * 0.3, -r * 0.2], z: pot + leaves * 0.75, r: r * 0.6, sz: (leaves * 0.25) / (r * 0.6), f: 'plant' },
      ];
    },
  },

  // ---------------------------------------------------------------- Essen
  {
    type: 'esstisch',
    label: 'Esstisch',
    group: 'Essen',
    dims: { w: 1800, d: 900, h: 750 },
    build({ w, d, h }) {
      return [...legs(w, d, 60, 70, h - 40, 'wood'), box(0, 0, h - 40, w, d, 40, 'wood', 6)];
    },
  },
  {
    type: 'esstisch-rund',
    label: 'Esstisch rund',
    group: 'Essen',
    dims: { w: 1200, d: 1200, h: 750 },
    build({ w, d, h }) {
      const r = d / 2;
      return [
        { shape: 'cyl', c: [0, 0], z: 0, r: r * 0.4, h: 30, f: 'woodDark', sx: w / d },
        post(0, 0, 30, 50, h - 70, 'woodDark'),
        { shape: 'cyl', c: [0, 0], z: h - 40, r, h: 40, f: 'wood', sx: w / d },
      ];
    },
  },
  {
    type: 'stuhl',
    label: 'Stuhl',
    group: 'Essen',
    dims: { w: 450, d: 520, h: 850 },
    build({ w, d, h }) {
      const seat = Math.min(460, h - 100);
      return [
        ...legs(w, d, 20, 30, seat - 30, 'woodDark', true),
        box(0, 0, seat - 30, w, d, 40, 'wood', 10),
        boxY(0, d / 2 - 30, d / 2, seat + 10, w - 20, h - seat - 10, 'wood', 10),
      ];
    },
  },
  {
    type: 'barhocker',
    label: 'Barhocker',
    group: 'Essen',
    dims: { w: 400, d: 400, h: 750 },
    build({ w, d, h }) {
      const r = Math.min(w, d) / 2;
      return [
        post(0, 0, 0, r * 0.8, 15, 'metal'),
        post(0, 0, 15, 25, h - 65, 'metal'),
        { shape: 'cyl', c: [0, 0], z: h * 0.4, r: r * 0.75, h: 12, f: 'metal' },
        { shape: 'cyl', c: [0, 0], z: h - 50, r, h: 50, f: 'fabric' },
      ];
    },
  },

  // ---------------------------------------------------------------- Schlafen
  {
    type: 'bett',
    label: 'Doppelbett',
    group: 'Schlafen',
    dims: { w: 1860, d: 2160, h: 1000 },
    build: (dims) => bed(dims, 2),
  },
  {
    type: 'bett-einzel',
    label: 'Einzelbett',
    group: 'Schlafen',
    dims: { w: 1060, d: 2160, h: 900 },
    build: (dims) => bed(dims, 1),
  },
  {
    type: 'kleiderschrank',
    label: 'Kleiderschrank',
    group: 'Schlafen',
    dims: { w: 2000, d: 600, h: 2200 },
    build: (dims) => cupboard(dims, split(dims.w, 500), false),
  },
  {
    type: 'kommode',
    label: 'Kommode',
    group: 'Schlafen',
    dims: { w: 1000, d: 450, h: 850 },
    build: (dims) => cupboard(dims, split(dims.w, 500), true),
  },
  {
    type: 'nachttisch',
    label: 'Nachttisch',
    group: 'Schlafen',
    dims: { w: 450, d: 400, h: 500 },
    build: (dims) => cupboard(dims, 1, true),
  },

  // ---------------------------------------------------------------- Arbeiten
  {
    type: 'schreibtisch',
    label: 'Schreibtisch',
    group: 'Arbeiten',
    dims: { w: 1400, d: 700, h: 750 },
    build({ w, d, h }) {
      return [
        box(-w / 2 + 20, 0, 0, 40, d - 40, h - 25, 'metal'),
        box(w / 2 - 20, 0, 0, 40, d - 40, h - 25, 'metal'),
        boxY(0, d / 2 - 60, d / 2 - 40, h - 325, w - 80, 300, 'metal'),
        box(0, 0, h - 25, w, d, 25, 'wood', 5),
      ];
    },
  },
  {
    type: 'buerostuhl',
    label: 'Bürostuhl',
    group: 'Arbeiten',
    dims: { w: 650, d: 650, h: 1100 },
    build({ w, d, h }) {
      const r = Math.min(w, d) / 2;
      const seat = 480;
      const parts: Part[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI) / 5;
        parts.push(post(Math.sin(a) * (r - 30), -Math.cos(a) * (r - 30), 0, 25, 50, 'dark'));
      }
      parts.push({ shape: 'cyl', c: [0, 0], z: 50, r: r - 30, h: 30, f: 'dark', r2: 60 });
      parts.push(post(0, 0, 80, 25, seat - 130, 'metal'));
      parts.push(box(0, -20, seat - 70, Math.min(500, w - 20), Math.min(480, d - 60), 80, 'fabric', 30));
      parts.push(boxY(0, d / 2 - 140, d / 2 - 80, seat + 60, Math.min(460, w - 60), h - seat - 60, 'fabric', 30));
      return parts;
    },
  },

  // ---------------------------------------------------------------- Sonstiges
  {
    type: 'kaminofen',
    label: 'Kaminofen',
    group: 'Sonstiges',
    dims: { w: 500, d: 450, h: 1500 },
    build({ w, d, h }) {
      const body = Math.min(1100, h - 200);
      return [
        boxY(0, -d / 2 + 5, d / 2, 0, w, body, 'dark', 15),
        boxY(0, -d / 2, -d / 2 + 5, body * 0.3, w - 120, body * 0.45, 'blackglass'),
        post(0, d / 4 - 20, body, 75, h - body, 'dark'),
      ];
    },
  },
  {
    type: 'heizkoerper',
    label: 'Heizkörper',
    group: 'Sonstiges',
    dims: { w: 1000, d: 100, h: 600 },
    z: 150,
    build({ w, d, h }) {
      const parts: Part[] = [boxY(0, -d / 2 + 30, d / 2 - 20, 0, w, h, 'white', 5)];
      const ribs = Math.max(3, Math.floor(w / 60));
      for (let i = 0; i < ribs; i++) {
        parts.push(boxY(-w / 2 + 30 + ((w - 60) * i) / (ribs - 1), -d / 2, -d / 2 + 30, 20, 20, h - 40, 'white'));
      }
      return parts;
    },
  },
  {
    type: 'quader',
    label: 'Quader (frei)',
    group: 'Sonstiges',
    dims: { w: 600, d: 600, h: 600 },
    build({ w, d, h }) {
      return [box(0, 0, 0, w, d, h, 'front', 5)];
    },
  },
];

function washer({ w, d, h }: Dims): Part[] {
  const r = Math.min(w, h) * 0.27;
  return [
    boxY(0, -d / 2 + 30, d / 2, 0, w, h, 'white', 15),
    rod('y', 0, -d / 2 + 17.5, h * 0.45, r, 25, 'chrome'),
    rod('y', 0, -d / 2 + 2.5, h * 0.45, r * 0.75, 5, 'blackglass'),
    boxY(0, -d / 2 + 25, -d / 2 + 30, h - 120, w - 40, 90, 'dark'),
  ];
}

const BY_TYPE = new Map(CATALOG.map((entry) => [entry.type, entry]));

export function catalogEntry(type: string): CatalogEntry | undefined {
  return BY_TYPE.get(type);
}

/** the parts of a catalog piece at a given size; an unknown type is a plain box */
export function buildParts(type: string, dims: Dims): Part[] {
  const entry = BY_TYPE.get(type);
  if (!entry) return [box(0, 0, 0, dims.w, dims.d, dims.h, 'front')];
  return entry.build(dims);
}

/** [xmin, ymin, zmin, xmax, ymax, zmax] of a part in the local frame */
export function partBounds(part: Part): [number, number, number, number, number, number] {
  const [cx, cy] = part.c;
  switch (part.shape) {
    case 'box': {
      const [w, d, h] = part.s;
      return [cx - w / 2, cy - d / 2, part.z, cx + w / 2, cy + d / 2, part.z + h];
    }
    case 'cyl': {
      const r = Math.max(part.r, part.r2 ?? part.r);
      if (part.axis === 'x') return [cx - part.h / 2, cy - r, part.z - r, cx + part.h / 2, cy + r, part.z + r];
      if (part.axis === 'y') return [cx - r, cy - part.h / 2, part.z - r, cx + r, cy + part.h / 2, part.z + r];
      const rx = r * (part.sx ?? 1);
      const ry = r * (part.sy ?? 1);
      return [cx - rx, cy - ry, part.z, cx + rx, cy + ry, part.z + part.h];
    }
    case 'lathe': {
      const r = Math.max(...part.profile.map(([radius]) => radius));
      const top = Math.max(...part.profile.map(([, z]) => z));
      const rx = r * (part.sx ?? 1);
      const ry = r * (part.sy ?? 1);
      return [cx - rx, cy - ry, part.z, cx + rx, cy + ry, part.z + top];
    }
    case 'sphere': {
      const rz = part.r * (part.sz ?? 1);
      return [cx - part.r, cy - part.r, part.z - rz, cx + part.r, cy + part.r, part.z + rz];
    }
  }
}
