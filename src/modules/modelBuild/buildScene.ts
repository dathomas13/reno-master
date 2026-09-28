/**
 * Builds the viewer scene (the scene format, README-MODELL.md section 6) from a house file.
 *
 * Port of build() in tools/model/build_scene_lite.py. The Python version stays the
 * reference: modelBuild.test.ts builds tools/model/testdata/haus-ist.json here and compares the
 * result with the committed ist.json, which Python produced.
 */
import { pyRound } from './pyRound';
import { triangulate } from './mesh';
import { alongX, type HouseSource, type SourceStair, type SourceWall } from './source';
import type { BuiltPrim, BuiltScene, Confidence, Layer, PrimKind } from './types';
import { box, prism, solidInter, solidSub, solidUnion, volume, type Solid } from './solid';

const RAD = Math.PI / 180;

export interface BuildOptions {
  version: string;
  note: string;
  /** ISO date written into meta.generatedAt */
  generatedAt: string;
}

/** Heights the scene is built from - derived from params, as haus_model.py derives them. */
export function houseLevels(src: HouseSource) {
  const p = src.params;
  const zKG = -p.storey;
  const zOG = p.storey;
  const tanRoof = () => Math.tan(p.roofPitch * RAD);
  const roofZUnder = (y: number) => {
    const eave = zOG + p.kniestock;
    const d = Math.min(y, p.houseD - y) - p.tOut;
    return eave + tanRoof() * d;
  };
  const g = src.garage;
  const garageRoofZ = (y: number) => {
    const t = (y - g.y[0]) / (g.y[1] - g.y[0]);
    return g.z0 + g.hFront + (g.hBack - g.hFront) * t;
  };
  /** floor level of each storey, for sills */
  const floorZ: Record<string, number> = { KG: zKG, EG: 0, OG: zOG, GAR: g.z0 };
  return { zKG, zOG, tanRoof, roofZUnder, garageRoofZ, floorZ };
}

export function buildScene(src: HouseSource, options: BuildOptions): BuiltScene {
  const p = src.params;
  const { zKG, zOG, tanRoof, roofZUnder: zu, garageRoofZ } = houseLevels(src);
  const ridge = p.houseD / 2;
  const ov = p.roofOverhang;
  const dzT = p.roofT / Math.cos(p.roofPitch * RAD);
  const g = src.gaube;
  const gtop = g ? zOG + g.wallH : 0;

  // everything below the rafters, plus the dormer volume - the OG walls are cut to it
  const underRoof: Solid = [
    ...prism(-ov - 1, p.houseW + 1, -ov - 1, ridge, zOG - 500, zOG - 500, zu(-ov - 1), zu(ridge)),
    ...prism(-ov - 1, p.houseW + 1, ridge, p.houseD + ov + 1, zOG - 500, zOG - 500, zu(ridge), zu(p.houseD + ov + 1)),
  ];
  let underRoofG = underRoof;
  if (g) underRoofG = solidUnion(underRoof, box(g.x0, -1, zOG - 500, g.x1, g.depth, gtop + 50));
  let clipOuter = underRoofG;

  // Dachstuhl: rafters, middle purlins, posts, roof skin and shed dormers. Everything in u,
  // the distance inwards from the inner face of the eave wall - north and south alike.
  const rf = src.roofFrame;
  const tr = tanRoof();
  const zK = zOG + p.kniestock; // rafter underside at the inner face of the eave wall
  const uR = ridge - p.tOut;
  const uE = -(p.tOut + ov);
  const zr = (u: number) => zK + tr * u;
  const band = (side: 'N' | 'S', x0: number, x1: number, ua: number, ub: number,
    loA: number, loB: number, hiA: number, hiB: number): Solid => {
    if (side === 'N') {
      const yIn = p.houseD - p.tOut;
      return prism(x0, x1, yIn - ub, yIn - ua, loB, loA, hiB, hiA);
    }
    return prism(x0, x1, p.tOut + ua, p.tOut + ub, loA, loB, hiA, hiB);
  };
  interface Dormer {
    side: 'N' | 'S'; i0: number; i1: number; x0: number; x1: number; tg: number; hrg: number;
    hsg: number; zW: number; uA: number; uB: number; uK: number; frontT: number; overhang: number;
    windows: [number, number][]; sillH: number; plateH: number; glass: boolean; tag: Confidence;
  }
  const dormers: Dormer[] = [];
  let hr = 0; let hs = 0; let rb = 0; let spX: number[] = []; let zC = 0; let zPt = 0;
  let uSeat = 0; let uPn = 0; let uPi = 0; let uEb = 0;
  if (rf) {
    hr = rf.rafterH / Math.cos(p.roofPitch * RAD);
    hs = dzT - hr;
    rb = rf.rafterB;
    const step = (p.houseW - 2 * p.tOut - rb) / (rf.rafters - 1);
    spX = Array.from({ length: rf.rafters }, (_, i) => p.tOut + i * step);
    zC = zK + hr;
    zPt = p.ogCeil + 200; // top of the purlin = top of the Spitzboden ceiling
    uSeat = (zPt - zK) / tr;
    uPn = uSeat - 70; // outer face of the purlin, birdsmouth 7 cm long
    uPi = uPn + rf.purlinB;
    uEb = uE + rf.rafterH * Math.sin(p.roofPitch * RAD); // square-cut rafter head
    for (const d of src.dormers ?? []) {
      const i0 = d.rafters[0] - 1;
      const i1 = d.rafters[1] - 1;
      const tg = Math.tan(d.pitch * RAD);
      const hrg = rf.rafterH / Math.cos(d.pitch * RAD);
      const hsg = (p.roofT - rf.rafterH) / Math.cos(d.pitch * RAD);
      const uA = (d.frontH - tg * d.frontT) / (tr - tg);
      dormers.push({
        side: d.side, i0, i1, x0: spX[i0], x1: spX[i1] + rb, tg, hrg, hsg, zW: zC + d.frontH,
        uA, uB: uA + hrg / (tr - tg), uK: (d.frontH - tg * d.frontT + hrg + hsg - hs) / (tr - tg),
        frontT: d.frontT, overhang: d.overhang, windows: d.windows, sillH: d.sillH, plateH: d.plateH,
        glass: d.glass, tag: d.tag,
      });
    }
    clipOuter = [
      ...prism(-ov - 1, p.houseW + 1, -ov - 1, ridge, zOG - 500, zOG - 500, zu(-ov - 1) + hr, zu(ridge) + hr),
      ...prism(-ov - 1, p.houseW + 1, ridge, p.houseD + ov + 1, zOG - 500, zOG - 500, zu(ridge) + hr, zu(p.houseD + ov + 1) + hr),
    ];
    // inner walls end under the Spitzboden ceiling, which spans between the purlins, and
    // under the purlins themselves
    const zHigh = zr(uR) + dzT + 1000;
    underRoofG = solidSub(underRoofG, box(-ov - 1, p.tOut + uPi, p.ogCeil, p.houseW + ov + 1,
      p.houseD - p.tOut - uPi, zHigh));
    for (const side of ['S', 'N'] as const) {
      underRoofG = solidSub(underRoofG, band(side, -ov - 1, p.houseW + ov + 1, uPn, uPi,
        zPt - rf.purlinH, zPt - rf.purlinH, zHigh, zHigh));
    }
    for (const d of dormers) {
      // between the cheeks, behind the front and in front of the purlin only - walls must
      // not grow into a cheek, the front or the purlin
      const uEnd = Math.min(d.uA, uPn);
      underRoofG = solidUnion(underRoofG, band(d.side, d.x0 + rb, d.x1 - rb, d.frontT, uEnd, zOG - 500, zOG - 500,
        d.zW, d.zW + d.tg * (uEnd - d.frontT)));
    }
  }
  /** underside of the dormer rafters */
  const zd = (d: Dormer, u: number) => d.zW + d.tg * (u - d.frontT);

  const parts: BuiltPrim[] = [];

  const add = (layer: Layer, name: string, kind: PrimKind, tag: Confidence, solid: Solid, tragend = false) => {
    if (solid.length === 0 || volume(solid) < 1e3) return;
    const { v, t } = triangulate(solid);
    const xs = v.filter((_, i) => i % 3 === 0);
    const ys = v.filter((_, i) => i % 3 === 1);
    const zs = v.filter((_, i) => i % 3 === 2);
    parts.push({
      layer, name, kind, tag, tragend, v, t,
      bb: [pyRound(Math.min(...xs)), pyRound(Math.min(...ys)), pyRound(Math.min(...zs)),
        pyRound(Math.max(...xs)), pyRound(Math.max(...ys)), pyRound(Math.max(...zs))],
    });
  };

  /** openings as offset a from the wall start and width, as the Python scripts see them */
  const openingsOf = (w: SourceWall) => {
    const start = alongX(w) ? w.x0 : w.y0;
    return (w.openings ?? []).map((o) => ({ ...o, a: o.from - start, width: o.to - o.from }));
  };

  const wallSolid = (w: SourceWall, z0: number, z1: number): Solid => {
    let s = box(w.x0, w.y0, z0, w.x1, w.y1, z1);
    const along = alongX(w);
    for (const o of openingsOf(w)) {
      const h = o.kind !== 'passage' ? o.height : (z1 - z0 - o.sill) + 10;
      const a = o.a;
      const cut = along
        ? box(w.x0 + a, w.y0 - 10, z0 + o.sill, w.x0 + a + o.width, w.y1 + 10, z0 + o.sill + h)
        : box(w.x0 - 10, w.y0 + a, z0 + o.sill, w.x1 + 10, w.y0 + a + o.width, z0 + o.sill + h);
      s = solidSub(s, cut);
    }
    return s;
  };

  /** window and door leaves as thin sheets, for display */
  const panels = (w: SourceWall, z0: number) => {
    const along = alongX(w);
    const out: [string, PrimKind, Confidence, Solid][] = [];
    for (const o of openingsOf(w)) {
      if (o.kind === 'passage') continue;
      const kind: PrimKind = o.kind === 'window' ? 'glass' : 'door';
      const name = `${kind === 'glass' ? 'Fenster' : 'Tür'} ${o.width}×${o.height}`;
      const a = o.a;
      let s: Solid;
      if (along) {
        const ym = (w.y0 + w.y1) / 2;
        s = box(w.x0 + a, ym - 20, z0 + o.sill, w.x0 + a + o.width, ym + 20, z0 + o.sill + o.height);
      } else {
        const xm = (w.x0 + w.x1) / 2;
        s = box(xm - 20, w.y0 + a, z0 + o.sill, xm + 20, w.y0 + a + o.width, z0 + o.sill + o.height);
      }
      out.push([name, kind, o.tag, s]);
    }
    return out;
  };

  const thickness = (w: SourceWall) => Math.min(w.x1 - w.x0, w.y1 - w.y0);
  /** order for overlap removal: outer walls first, then 240, then light walls */
  const byPriority = (walls: SourceWall[]) => {
    const rank = (w: SourceWall) => (w.name.startsWith('Außenwand') ? 0 : thickness(w) >= 240 ? 1 : 2);
    return [...walls].sort((a, b) => rank(a) - rank(b) || thickness(b) - thickness(a));
  };

  const buildFloorWalls = (floor: 'KG' | 'EG' | 'OG', z0: number, z1: number, clip: Solid | null = null,
    clipOut: Solid | null = null) => {
    const done: Solid[] = [];
    for (const w of byPriority(src.walls.filter((x) => x.floor === floor))) {
      let s = wallSolid(w, z0, z1);
      if (clip !== null) s = solidInter(s, w.name.startsWith('Außenwand') ? (clipOut ?? clip) : clip);
      for (const d of done) s = solidSub(s, d); // remove overlaps at crossings
      const tragend = w.tragend ?? (thickness(w) >= 240 && !w.name.startsWith('Kamin'));
      add(floor, w.name, 'wall', w.tag, s, tragend);
      done.push(s);
      for (const [name, kind, tag, panel] of panels(w, z0)) add(floor, name, kind, tag, panel);
    }
  };

  const slab = (z0: number, opening?: [number, number, number, number]) => {
    let s = box(0, 0, z0, p.houseW, p.houseD, z0 + p.slab);
    if (opening) s = solidSub(s, box(opening[0], opening[1], z0 - 10, opening[2], opening[3], z0 + p.slab + 10));
    return s;
  };

  const stairSolid = (s: SourceStair, floor: 'KG' | 'EG') => {
    const [dx, dy] = ({ '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] } as const)[s.direction];
    let out: Solid = [];
    for (let i = 0; i < s.steps; i += 1) {
      const zt = s.z0 + (i + 1) * s.rise;
      const zb = floor === 'KG' ? zKG : s.z0 + Math.max(i - 1, 0) * s.rise;
      let b: Solid;
      if (dx) {
        const x = s.x0 + (dx > 0 ? i * s.run : -(i + 1) * s.run);
        b = box(x, s.y0, zb, x + s.run, s.y0 + s.width, zt);
      } else {
        const y = s.y0 + (dy > 0 ? i * s.run : -(i + 1) * s.run);
        b = box(s.x0, y, zb, s.x0 + s.width, y + s.run, zt);
      }
      out = solidUnion(out, b);
    }
    return out;
  };

  // ------------------------------------------------------------------ KG / EG
  add('KG', 'Bodenplatte KG', 'slab', 'A', box(0, 0, zKG - 200, p.houseW, p.houseD, zKG));
  buildFloorWalls('KG', zKG, -p.slab);
  add('EG', 'Stahlbetondecke über KG (14 cm)', 'slab', 'A', slab(-p.slab, src.slabOpenings.EG));
  buildFloorWalls('EG', 0, zOG - p.slab);
  for (const lp of src.loggiaParapets) {
    add('EG', 'Loggia Brüstung', 'wall', lp.tag, box(lp.x0, lp.y0, 0, lp.x1, lp.y1, lp.h));
  }
  // slab pieces outside the rectangle 0..houseW / 0..houseD (loggia projection)
  for (const e of src.slabExtras) {
    add(e.floor as Layer, e.name, 'slab', e.tag, box(e.x0, e.y0, e.z0, e.x1, e.y1, e.z0 + p.slab));
  }
  for (const s of src.stairs) {
    const floor = s.z0 < 0 ? 'KG' : 'EG';
    add(floor, s.name, 'stair', s.tag, stairSolid(s, floor));
  }
  for (const l of src.landings) {
    add('KG', l.name, 'stair', l.tag, box(l.x0, l.y0, l.z - 150, l.x1, l.y1, l.z));
  }

  // ------------------------------------------------------------------ OG
  add('OG', 'Stahlbetondecke über EG (14 cm)', 'slab', 'A', slab(zOG - p.slab, src.slabOpenings.OG));
  buildFloorWalls('OG', zOG, zu(ridge) + 100, underRoofG, clipOuter);
  const bk = src.balkon;
  add('OG', 'Balkon Platte', 'slab', bk.tag, box(bk.x0, bk.y0, zOG - 160, bk.x1, bk.y1, zOG));
  let rail = box(bk.x0, bk.y0, zOG, bk.x0 + 60, bk.y1, zOG + 1000);
  rail = solidUnion(rail, box(bk.x0, bk.y0, zOG, bk.x1, bk.y0 + 60, zOG + 1000));
  rail = solidUnion(rail, box(bk.x0, bk.y1 - 60, zOG, bk.x1, bk.y1, zOG + 1000));
  add('OG', 'Balkon Geländer', 'rail', bk.tag, rail);

  // ------------------------------------------------------------------ Dach + Gaube
  let oldCut: Solid = [];
  const [chW, chE] = g?.cheek ?? [120, 120];
  if (g) oldCut = box(g.x0 + chW, -ov - 1, zOG, g.x1 - chE, g.depth - 50, gtop);
  if (!rf) {
    const roof: Solid = [
      ...prism(0, p.houseW, -ov, ridge, zu(-ov), zu(ridge), zu(-ov) + dzT, zu(ridge) + dzT),
      ...prism(0, p.houseW, ridge, p.houseD + ov, zu(ridge), zu(p.houseD + ov), zu(ridge) + dzT, zu(p.houseD + ov) + dzT),
    ];
    add('DACH', 'Satteldach 36° (Kunstschiefer)', 'roof', 'A', solidSub(roof, oldCut));
  } else {
    const zTop = zr(uR) + dzT + 1000;
    let skin: Solid = [];
    const rafters: Record<'N' | 'S', Solid> = { N: [], S: [] };
    for (const side of ['S', 'N'] as const) {
      skin = solidUnion(skin, band(side, 0, p.houseW, uE, uR, zr(uE) + hr, zr(uR) + hr, zr(uE) + dzT, zr(uR) + dzT));
      spX.forEach((x, i) => {
        const x1 = x + rb;
        const inner = dormers.some((d) => d.side === side && d.i0 < i && i < d.i1);
        let sol = band(side, x, x1, uE, uEb, zr(uE) + hr, zr(uEb), zr(uE) + hr, zr(uEb) + hr);
        let uLo = uEb;
        if (inner) {
          // trimmed: below the stub through the wall, cut flat at rafter top inside;
          // above from 50 cm in front of the purlin up to the ridge
          const uS = hr / tr;
          sol = solidUnion(sol, band(side, x, x1, uEb, 0, zr(uEb), zr(0), zr(uEb) + hr, zC));
          sol = solidUnion(sol, band(side, x, x1, 0, uS, zr(0), zr(uS), zC, zC));
          uLo = uPn - 500;
        }
        sol = solidUnion(sol, band(side, x, x1, uLo, uPn, zr(uLo), zr(uPn), zr(uLo) + hr, zr(uPn) + hr));
        sol = solidUnion(sol, band(side, x, x1, uPn, uSeat, zPt, zPt, zr(uPn) + hr, zr(uSeat) + hr));
        sol = solidUnion(sol, band(side, x, x1, uSeat, uR, zr(uSeat), zr(uR), zr(uSeat) + hr, zr(uR) + hr));
        rafters[side] = solidUnion(rafters[side], sol);
      });
    }
    for (const d of dormers) skin = solidSub(skin, band(d.side, d.x0, d.x1, 0, d.uK, zOG, zOG, zTop, zTop));
    skin = solidSub(skin, oldCut);
    add('DACH', 'Dachhaut 36° (Lattung + Kunstschiefer)', 'roof', 'A', skin);
    for (const [side, name] of [['S', 'Süd'], ['N', 'Nord']] as const) {
      add('DACH', `Sparren ${name}`, 'roof', rf.tag, solidSub(rafters[side], oldCut), true);
      add('DACH', `Mittelpfette ${name}`, 'roof', rf.tag,
        band(side, 50, p.houseW - 50, uPn, uPi, zPt - rf.purlinH, zPt - rf.purlinH, zPt, zPt), true);
      const uM = (uPn + uPi) / 2;
      const pb = rf.postB / 2;
      for (const x of rf.posts) {
        add('OG', 'Stütze', 'wall', rf.tag,
          band(side, x - pb, x + pb, uM - pb, uM + pb, zOG, zOG, zPt - rf.purlinH, zPt - rf.purlinH), true);
      }
    }
    for (const d of dormers) {
      const { side, x0, x1, frontT: tf } = d;
      const label = `Gaube ${side === 'N' ? 'Nord' : 'Süd'}`;
      // the boundary rafters run on under the front
      let front = solidSub(band(side, x0, x1, 0, tf, zC, zC, d.zW, d.zW), rafters[side]);
      if (d.windows.length > 0) {
        const total = d.windows.reduce((sum, [wd]) => sum + wd, 0)
          + d.windows.slice(0, -1).reduce((sum, [, gap]) => sum + gap, 0);
        let cx = x0 + rb + (x1 - x0 - 2 * rb - total) / 2;
        // timber frame: sill on the rafter stubs, plate under the dormer rafters; the openings
        // between them leave the posts standing
        const zLo = zC + d.sillH;
        const zHi = d.zW - d.plateH;
        for (const [wd, gap] of d.windows) {
          front = solidSub(front, band(side, cx, cx + wd, -10, tf + 10, zLo, zLo, zHi, zHi));
          if (d.glass) {
            add('DACH', `Gaubenfenster ${wd}`, 'glass', d.tag, band(side, cx, cx + wd, tf / 2 - 20, tf / 2 + 20, zLo, zLo, zHi, zHi));
          }
          cx += wd + gap;
        }
      }
      add('DACH', `${label} Front`, 'wall', d.tag, front);
      for (const [nm, x] of [['West', x0], ['Ost', x1 - rb]] as const) {
        add('DACH', `${label} Wange ${nm}`, 'wall', d.tag,
          band(side, x, x + rb, tf, d.uA, zr(tf) + hr, zr(d.uA) + hr, zd(d, tf), zd(d, d.uA)));
      }
      const ug = -d.overhang;
      const { uA: ua, uB: ub, hrg, hsg } = d;
      let ds: Solid = [];
      for (let i = d.i0; i <= d.i1; i += 1) {
        const x = spX[i];
        const xe = spX[i] + rb;
        let sol = band(side, x, xe, ug, 0, zd(d, ug), zd(d, 0), zd(d, ug) + hrg, zd(d, 0) + hrg);
        sol = solidUnion(sol, band(side, x, xe, 0, tf, d.zW, d.zW, zd(d, 0) + hrg, zd(d, tf) + hrg));
        sol = solidUnion(sol, band(side, x, xe, tf, ua, zd(d, tf), zd(d, ua), zd(d, tf) + hrg, zd(d, ua) + hrg));
        sol = solidUnion(sol, band(side, x, xe, ua, ub, zr(ua) + hr, zr(ub) + hr, zd(d, ua) + hrg, zd(d, ub) + hrg));
        ds = solidUnion(ds, sol);
      }
      add('DACH', `${label} Sparren`, 'roof', d.tag, ds, true);
      const uk = d.uK;
      add('DACH', `${label} Dachhaut`, 'roof', d.tag,
        band(side, x0, x1, ug, uk, zd(d, ug) + hrg, zd(d, uk) + hrg, zd(d, ug) + hrg + hsg, zd(d, uk) + hrg + hsg));
    }
  }
  if (g) {
    let front = box(g.x0, 0, zOG, g.x1, 365, gtop);
    let cx = g.x0 + chW;
    for (const [wd, gap] of g.windows) {
      front = solidSub(front, box(cx, -10, zOG + 900, cx + wd, 400, zOG + 2000));
      add('DACH', `Gaubenfenster ${wd}`, 'glass', g.tag, box(cx, 160, zOG + 900, cx + wd, 200, zOG + 2000));
      cx += wd + gap;
    }
    add('DACH', 'Gaube Frontwand', 'wall', g.tag, solidSub(front, underRoof));
    for (const [name, x, t] of [['Gaube Wange West', g.x0, chW], ['Gaube Wange Ost', g.x1 - chE, chE]] as const) {
      add('DACH', name, 'wall', g.tag,
        prism(x, x + t, 0, g.depth, zOG + p.kniestock, zu(g.depth), gtop + 50, gtop + 50));
    }
    add('DACH', 'Gaubendach', 'roof', 'C', box(g.x0 - 200, -300, gtop + 50, g.x1 + 200, g.depth + 200, gtop + 250));
  }
  if (rf) {
    // between the purlins
    add('DACH', 'Holzbalkendecke Spitzboden', 'slab', 'B',
      box(p.tOut, p.tOut + uPi, p.ogCeil, p.houseW - p.tOut, p.houseD - p.tOut - uPi, p.ogCeil + 200));
  } else {
    const ys = p.tOut + (p.ogCeil - (zOG + p.kniestock)) / tanRoof() + 100;
    add('DACH', 'Holzbalkendecke Spitzboden', 'slab', 'B',
      box(p.tOut, ys, p.ogCeil, p.houseW - p.tOut, p.houseD - ys, p.ogCeil + 200));
  }

  // ------------------------------------------------------------------ Garage
  const gar = src.garage;
  const done: Solid[] = [];
  for (const w of byPriority(src.walls.filter((x) => x.floor === 'GAR'))) {
    let s = wallSolid(w, gar.z0, garageRoofZ((w.y0 + w.y1) / 2));
    for (const d of done) s = solidSub(s, d);
    add('GAR', w.name, 'wall', w.tag, s, w.tragend ?? true);
    done.push(s);
    for (const [name, kind, tag, panel] of panels(w, gar.z0)) add('GAR', name, kind, tag, panel);
  }
  const gy0 = gar.y[0] - 300;
  const gy1 = gar.y[1] + 300;
  add('GAR', 'Garagendach (4 %, Lagenpappe)', 'roof', 'B',
    prism(gar.x[0] - 300, 0, gy0, gy1, garageRoofZ(gy0), garageRoofZ(gy1), garageRoofZ(gy0) + 220, garageRoofZ(gy1) + 220));
  add('GAR', 'Garagenboden', 'slab', 'B', box(gar.x[0], gar.y[0], gar.z0 - 160, gar.x[1], gar.y[1], gar.z0));
  add('GAR', 'Vordach Garagen (8000×2500)', 'roof', 'A',
    box(gar.x[0], gar.y[0] - 2500, gar.z0 + gar.hFront, gar.x[0] + 8000, gar.y[0], gar.z0 + gar.hFront + 200));

  return {
    prims: parts,
    meta: {
      variant: src.variant,
      version: options.version,
      generatedAt: options.generatedAt,
      note: options.note,
      house_w: p.houseW,
      house_d: p.houseD,
      ridge: zu(ridge),
      source: 'app',
    },
  };
}
