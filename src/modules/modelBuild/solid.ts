/**
 * Solids made of wedges - the geometry kernel of the scene builder.
 *
 * A straight port of tools/model/build_scene_lite.py (same names, same order of
 * operations), because both builders must yield the same vertices: the Python one stays
 * the reference and the way to STEP/STL, this one runs in the app.
 *
 * A wedge is extruded along x from x0 to x1; its profile over y in [y0, y1] is a
 * trapezoid whose lower and upper bounds are linear in y. A box is a wedge without slope,
 * the 36° roof, the OG walls cut to the rafters and the garage roof are wedges with slope.
 * That single primitive covers the whole house, so subtraction, intersection and union
 * reduce to interval arithmetic.
 */

export const EPS = 1e-6;

/**
 * (a0, a1, lo0, lo1, hi0, hi1): over a in [a0, a1] the region spans b from the line
 * lo0->lo1 to the line hi0->hi1. The (y, z) profile of a wedge, and one dimension down,
 * the polygon of a face during internal-face removal.
 */
export type Band = [number, number, number, number, number, number];
export type Wedge = [number, number, Band];
export type Solid = Wedge[];

function lerp(p0: number, p1: number, a0: number, a1: number, a: number): number {
  if (a1 - a0 <= EPS) return p0;
  return p0 + (p1 - p0) * (a - a0) / (a1 - a0);
}

/** Restrict a band to a in [p, q], interpolating its bounds. null if empty. */
export function bandClip(b: Band, p: number, q: number): Band | null {
  const a0 = b[0];
  const a1 = b[1];
  p = Math.max(p, a0);
  q = Math.min(q, a1);
  if (q - p <= EPS) return null;
  return [p, q,
    lerp(b[2], b[3], a0, a1, p), lerp(b[2], b[3], a0, a1, q),
    lerp(b[4], b[5], a0, a1, p), lerp(b[4], b[5], a0, a1, q)];
}

/** A band is real if it has extent in a and positive height somewhere. */
export function bandOk(b: Band | null): b is Band {
  return b !== null && b[1] - b[0] > EPS && (b[4] - b[2] > EPS || b[5] - b[3] > EPS);
}

function crossing(b: Band, f0: number, f1: number, g0: number, g1: number): number | null {
  const d0 = f0 - g0;
  const d1 = f1 - g1;
  if ((d0 > EPS && d1 < -EPS) || (d0 < -EPS && d1 > EPS)) {
    return b[0] + (d0 / (d0 - d1)) * (b[1] - b[0]);
  }
  return null;
}

/** a-values where the bounds of m and c cross, so each slice has a constant order */
function splits(m: Band, c: Band): number[] {
  const cuts = new Set<number>([m[0], m[1]]);
  for (const [f0, f1] of [[m[2], m[3]], [m[4], m[5]]]) {
    for (const [g0, g1] of [[c[2], c[3]], [c[4], c[5]]]) {
      const x = crossing(m, f0, f1, g0, g1);
      if (x !== null) cuts.add(x);
    }
  }
  return [...cuts].sort((p, q) => p - q);
}

/** a minus b, both in the same plane */
function bandSubOne(a: Band, b: Band): Band[] {
  const p = Math.max(a[0], b[0]);
  const q = Math.min(a[1], b[1]);
  if (q - p <= EPS) return [a];
  const out: Band[] = [];
  for (const keep of [bandClip(a, a[0], p), bandClip(a, q, a[1])]) {
    if (bandOk(keep)) out.push(keep);
  }
  const mid = bandClip(a, p, q);
  const sub = bandClip(b, p, q);
  if (!bandOk(mid)) return out;
  if (!bandOk(sub)) {
    out.push(mid);
    return out;
  }
  const xs = splits(mid, sub);
  for (let i = 0; i + 1 < xs.length; i += 1) {
    const s = xs[i];
    const t = xs[i + 1];
    const m = bandClip(mid, s, t);
    const c = bandClip(sub, s, t);
    if (!bandOk(m)) continue;
    if (!bandOk(c)) {
      out.push(m);
      continue;
    }
    // below the cut, then above it - the min/max are safe because the order of the
    // bounds does not change inside a slice
    const below: Band = [s, t, m[2], m[3], Math.min(m[4], c[2]), Math.min(m[5], c[3])];
    const above: Band = [s, t, Math.max(m[2], c[4]), Math.max(m[3], c[5]), m[4], m[5]];
    if (bandOk(below)) out.push(below);
    if (bandOk(above)) out.push(above);
  }
  return out;
}

export function bandSub(bands: Band[], subtrahends: Band[]): Band[] {
  let out = [...bands];
  for (const b of subtrahends) {
    const next: Band[] = [];
    for (const a of out) next.push(...bandSubOne(a, b));
    out = next;
  }
  return out;
}

function bandInterOne(a: Band, b: Band): Band[] {
  const p = Math.max(a[0], b[0]);
  const q = Math.min(a[1], b[1]);
  if (q - p <= EPS) return [];
  const m = bandClip(a, p, q);
  const c = bandClip(b, p, q);
  if (!(bandOk(m) && bandOk(c))) return [];
  const out: Band[] = [];
  const xs = splits(m, c);
  for (let i = 0; i + 1 < xs.length; i += 1) {
    const s = xs[i];
    const t = xs[i + 1];
    const mm = bandClip(m, s, t);
    const cc = bandClip(c, s, t);
    if (!(bandOk(mm) && bandOk(cc))) continue;
    const cand: Band = [s, t, Math.max(mm[2], cc[2]), Math.max(mm[3], cc[3]),
      Math.min(mm[4], cc[4]), Math.min(mm[5], cc[5])];
    if (bandOk(cand)) out.push(cand);
  }
  return out;
}

export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Solid {
  if (x1 - x0 <= EPS || y1 - y0 <= EPS || z1 - z0 <= EPS) return [];
  return [[x0, x1, [y0, y1, z0, z0, z1, z1]]];
}

/** Wedge with bounds linear in y - the roof slopes, garage roof, dormer cheeks. */
export function prism(
  x0: number, x1: number, y0: number, y1: number,
  lo0: number, lo1: number, hi0: number, hi1: number,
): Solid {
  if (x1 - x0 <= EPS || y1 - y0 <= EPS) return [];
  const band: Band = [y0, y1, lo0, lo1, hi0, hi1];
  return bandOk(band) ? [[x0, x1, band]] : [];
}

export function solidSub(a: Solid, b: Solid): Solid {
  let out = [...a];
  for (const [bx0, bx1, bb] of b) {
    const next: Solid = [];
    for (const [x0, x1, band] of out) {
      const p = Math.max(x0, bx0);
      const q = Math.min(x1, bx1);
      if (q - p <= EPS) {
        next.push([x0, x1, band]);
        continue;
      }
      if (p - x0 > EPS) next.push([x0, p, band]);
      if (x1 - q > EPS) next.push([q, x1, band]);
      for (const r of bandSub([band], [bb])) next.push([p, q, r]);
    }
    out = next;
  }
  return out;
}

export function solidInter(a: Solid, b: Solid): Solid {
  const out: Solid = [];
  for (const [ax0, ax1, ab] of a) {
    for (const [bx0, bx1, bb] of b) {
      const p = Math.max(ax0, bx0);
      const q = Math.min(ax1, bx1);
      if (q - p <= EPS) continue;
      for (const r of bandInterOne(ab, bb)) out.push([p, q, r]);
    }
  }
  return out;
}

/** Disjoint union: whatever b adds on top of a. */
export function solidUnion(a: Solid, b: Solid): Solid {
  return [...a, ...solidSub(b, a)];
}

export function volume(solid: Solid): number {
  let total = 0;
  for (const [x0, x1, [y0, y1, lo0, lo1, hi0, hi1]] of solid) {
    total += (x1 - x0) * (y1 - y0) * ((hi0 - lo0) + (hi1 - lo1)) / 2;
  }
  return total;
}
