/**
 * From a solid to triangles: interior faces removed, T-junctions welded, vertices rounded.
 *
 * Port of the second half of tools/model/build_scene_lite.py. Every face of a wedge lies
 * in a plane that is axis aligned in x or y, or is the z = s*y + c plane of a sloped
 * top/bottom. Two coincident faces with opposite normals are interior, so they cancel.
 * What survives is the outer shell of the part.
 */
import { pyRound } from './pyRound';
import { bandOk, bandSub, type Band, type Solid } from './solid';

// Vertex tolerances in mm, each an order of magnitude apart:
const WELD_DIGITS = 2; // 0.01 mm - one corner reached along two interpolation paths is one vertex
const TOL_LINE = 0.05; // a vertex this close to an edge lies on it, so the edge is split there
const OUT_DIGITS = 1; // 0.1 mm output grid, as GRID below
const GRID = 0.1; // a vertex nearer than this to an end of an edge is never inserted

type Plane = ['x', number] | ['y', number] | ['z', number, number];
type Point = [number, number, number];
type Triangle = [Point, Point, Point];

interface Face {
  key: string;
  plane: Plane;
  sign: 1 | -1;
  band: Band;
}

/**
 * The key is rounded, so faces that should be coplanar land in the same group even when
 * their bounds were interpolated along different paths. The plane keeps the exact numbers:
 * a vertex rebuilt from a rounded plane would no longer weld with its neighbour.
 */
function facesOf(solid: Solid): Face[] {
  const out: Face[] = [];
  for (const [x0, x1, [y0, y1, lo0, lo1, hi0, hi1]] of solid) {
    out.push({ key: `x|${pyRound(x0, 3)}`, plane: ['x', x0], sign: -1, band: [y0, y1, lo0, lo1, hi0, hi1] });
    out.push({ key: `x|${pyRound(x1, 3)}`, plane: ['x', x1], sign: 1, band: [y0, y1, lo0, lo1, hi0, hi1] });
    out.push({ key: `y|${pyRound(y0, 3)}`, plane: ['y', y0], sign: -1, band: [x0, x1, lo0, lo0, hi0, hi0] });
    out.push({ key: `y|${pyRound(y1, 3)}`, plane: ['y', y1], sign: 1, band: [x0, x1, lo1, lo1, hi1, hi1] });
    for (const [zb, zt, sign] of [[lo0, lo1, -1], [hi0, hi1, 1]] as const) {
      const s = (zt - zb) / (y1 - y0);
      const c = zb - s * y0;
      out.push({
        key: `z|${pyRound(s, 9)}|${pyRound(c, 3)}`, plane: ['z', s, c], sign, band: [x0, x1, y0, y0, y1, y1],
      });
    }
  }
  return out;
}

/** Faces of the solid with all interior ones removed. */
function shell(solid: Solid): { plane: Plane; sign: 1 | -1; band: Band }[] {
  const groups = new Map<string, { plane: Plane; pos: Band[]; neg: Band[] }>();
  for (const face of facesOf(solid)) {
    let group = groups.get(face.key);
    if (!group) {
      group = { plane: face.plane, pos: [], neg: [] };
      groups.set(face.key, group);
    }
    (face.sign === 1 ? group.pos : group.neg).push(face.band);
  }
  const out: { plane: Plane; sign: 1 | -1; band: Band }[] = [];
  for (const group of groups.values()) {
    for (const sign of [1, -1] as const) {
      const [mine, theirs] = sign === 1 ? [group.pos, group.neg] : [group.neg, group.pos];
      for (const band of bandSub(mine, theirs)) {
        if (bandOk(band)) out.push({ plane: group.plane, sign, band });
      }
    }
  }
  return out;
}

function normal(plane: Plane, sign: number): Point {
  if (plane[0] === 'x') return [sign, 0, 0];
  if (plane[0] === 'y') return [0, sign, 0];
  return [0, -plane[1] * sign, sign];
}

function to3d(plane: Plane, a: number, b: number): Point {
  if (plane[0] === 'x') return [plane[1], a, b];
  if (plane[0] === 'y') return [a, plane[1], b];
  return [a, b, plane[1] * b + plane[2]];
}

/**
 * Position of p along a->b if it lies inside the segment, else null. The line tolerance
 * is wider than the weld grid: a corner of a sloped face sits on that grid, so it can
 * miss the exact line by half a grid step per axis.
 */
function onSegment(p: Point, a: Point, b: Point): number | null {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const length = Math.sqrt(ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2);
  if (length <= GRID) return null;
  const along = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / length;
  if (!(GRID < along && along < length - GRID)) return null;
  const cr = [ap[1] * ab[2] - ap[2] * ab[1], ap[2] * ab[0] - ap[0] * ab[2], ap[0] * ab[1] - ap[1] * ab[0]];
  if (Math.sqrt(cr[0] ** 2 + cr[1] ** 2 + cr[2] ** 2) / length > TOL_LINE) return null;
  return along;
}

function same(p: Point, q: Point): boolean {
  return p[0] === q[0] && p[1] === q[1] && p[2] === q[2];
}

/**
 * Split edges that carry another vertex in their interior. Coplanar neighbours of
 * different height leave a T; the edge then has no partner and three.js EdgesGeometry
 * draws a seam across the part. Fanning the triangle from its opposite corner closes the
 * mesh and keeps the winding.
 */
function weldTJunctions(triangles: Triangle[]): Triangle[] {
  const unique = new Map<string, Point>();
  for (const tri of triangles) for (const p of tri) unique.set(p.join(','), p);
  const points = [...unique.values()];
  const queue = [...triangles];
  const out: Triangle[] = [];
  let guard = 0;
  while (queue.length > 0) {
    guard += 1;
    if (guard > 200000) throw new Error('weldTJunctions did not settle');
    const tri = queue.pop() as Triangle;
    let chain: { apex: Point; pts: Point[] } | null = null;
    for (let i = 0; i < 3; i += 1) {
      const a = tri[i];
      const b = tri[(i + 1) % 3];
      const apex = tri[(i + 2) % 3];
      const lo = [0, 1, 2].map((k) => Math.min(a[k], b[k]) - 1e-3);
      const hi = [0, 1, 2].map((k) => Math.max(a[k], b[k]) + 1e-3);
      const hits: [number, Point][] = [];
      for (const p of points) {
        if (same(p, a) || same(p, b)) continue;
        if (!(lo[0] <= p[0] && p[0] <= hi[0] && lo[1] <= p[1] && p[1] <= hi[1] && lo[2] <= p[2] && p[2] <= hi[2])) {
          continue;
        }
        const t = onSegment(p, a, b);
        if (t !== null) hits.push([t, p]);
      }
      if (hits.length > 0) {
        hits.sort((u, v) => u[0] - v[0] || u[1][0] - v[1][0] || u[1][1] - v[1][1] || u[1][2] - v[1][2]);
        chain = { apex, pts: [a, ...hits.map(([, p]) => p), b] };
        break;
      }
    }
    if (chain === null) {
      out.push(tri);
    } else {
      for (let k = 0; k + 1 < chain.pts.length; k += 1) queue.push([chain.apex, chain.pts[k], chain.pts[k + 1]]);
    }
  }
  return out;
}

/** Shell of the solid as (vertices in mm, triangle indices). */
export function triangulate(solid: Solid): { v: number[]; t: number[] } {
  const triangles: Triangle[] = [];

  const emit = (p0: Point, p1: Point, p2: Point, n: Point) => {
    const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const w = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const cr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (Math.abs(cr[0]) + Math.abs(cr[1]) + Math.abs(cr[2]) < 1e-3) return; // degenerate sliver
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) triangles.push([p0, p2, p1]);
    else triangles.push([p0, p1, p2]);
  };
  const snap = (p: Point): Point => [pyRound(p[0], WELD_DIGITS), pyRound(p[1], WELD_DIGITS), pyRound(p[2], WELD_DIGITS)];

  for (const { plane, sign, band: [a0, a1, lo0, lo1, hi0, hi1] } of shell(solid)) {
    const n = normal(plane, sign);
    const c00 = to3d(plane, a0, lo0);
    const c10 = to3d(plane, a1, lo1);
    const c11 = to3d(plane, a1, hi1);
    const c01 = to3d(plane, a0, hi0);
    emit(snap(c00), snap(c10), snap(c11), n);
    emit(snap(c00), snap(c11), snap(c01), n);
  }

  const verts: Point[] = [];
  const index = new Map<string, number>();
  const tris: number[] = [];
  for (const tri of weldTJunctions(triangles)) {
    for (const p of tri) {
      const key: Point = [pyRound(p[0], OUT_DIGITS), pyRound(p[1], OUT_DIGITS), pyRound(p[2], OUT_DIGITS)];
      const id = key.join(',');
      let at = index.get(id);
      if (at === undefined) {
        at = verts.length;
        index.set(id, at);
        verts.push(key);
      }
      tris.push(at);
    }
  }
  return { v: verts.flat(), t: tris };
}
