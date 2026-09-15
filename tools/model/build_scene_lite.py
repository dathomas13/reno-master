#!/usr/bin/env python3
"""Build public/models/<variant>.json from haus_model.py without any CAD dependency.

Same output as build_scene.py, which needs CadQuery/OCP (~150 MB) because the print and
STEP exports need watertight solids. The viewer only needs triangles, so this script uses
the standard library alone:

    python3 tools/model/build_scene_lite.py --variant ist --version 0.23

Every part is a list of disjoint *wedges*. A wedge is extruded along x from x0 to x1 and
its profile over y in [y0, y1] is a trapezoid whose lower and upper bounds zb(y), zt(y)
are linear in y. A box is a wedge without slope; the 36 deg roof, the OG walls cut to the
rafters and the garage roof are wedges with slope. That single primitive covers the whole
house, so subtraction, intersection and union reduce to interval arithmetic.

Coincident opposite faces inside a part are removed before triangulation, so a wall split
by a window stays one clean shell - the viewer draws EdgesGeometry per part and would
otherwise show a seam at every cut.

Format documented in tools/model/README-MODELL.md, section 6.
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib
import json
import math
import pathlib

EPS = 1e-6

# Vertex tolerances in mm, each an order of magnitude apart:
WELD_DIGITS = 2  # 0.01 mm - vertices this close are one vertex while welding, so a corner
#                  reached along two different interpolation paths does not split in two
TOL_LINE = 0.05  # a vertex this close to an edge lies on it, so the edge is split there
OUT_DIGITS = 1   # 0.1 mm output grid, as GRID below
GRID = 0.1       # a vertex nearer than this to an end of an edge is never inserted: the
#                  output rounding merges those two anyway, and the sliver between them
#                  would collapse into a degenerate triangle

REPO = pathlib.Path(__file__).resolve().parents[2]
MODELS = REPO / "public" / "models"

# --------------------------------------------------------------------------- bands
# band = (a0, a1, lo0, lo1, hi0, hi1): over a in [a0, a1] the region spans b from the
# line lo0->lo1 to the line hi0->hi1. Used for the (y, z) profile of a wedge and, one
# dimension down, for the polygons of a face during internal-face removal.


def _lerp(p0: float, p1: float, a0: float, a1: float, a: float) -> float:
    if a1 - a0 <= EPS:
        return p0
    return p0 + (p1 - p0) * (a - a0) / (a1 - a0)


def band_clip(b, p: float, q: float):
    """Restrict a band to a in [p, q], interpolating its bounds. None if empty."""
    a0, a1 = b[0], b[1]
    p, q = max(p, a0), min(q, a1)
    if q - p <= EPS:
        return None
    return (p, q,
            _lerp(b[2], b[3], a0, a1, p), _lerp(b[2], b[3], a0, a1, q),
            _lerp(b[4], b[5], a0, a1, p), _lerp(b[4], b[5], a0, a1, q))


def band_ok(b) -> bool:
    """A band is real if it has extent in a and positive height somewhere."""
    return b is not None and b[1] - b[0] > EPS and (b[4] - b[2] > EPS or b[5] - b[3] > EPS)


def _crossing(b, f0: float, f1: float, g0: float, g1: float):
    """Where line f crosses line g inside b's a-range, else None."""
    d0, d1 = f0 - g0, f1 - g1
    if (d0 > EPS and d1 < -EPS) or (d0 < -EPS and d1 > EPS):
        return b[0] + (d0 / (d0 - d1)) * (b[1] - b[0])
    return None


def _splits(m, c):
    """a-values where the bounds of m and c cross, so each slice has a constant order."""
    cuts = {m[0], m[1]}
    for f0, f1 in ((m[2], m[3]), (m[4], m[5])):
        for g0, g1 in ((c[2], c[3]), (c[4], c[5])):
            x = _crossing(m, f0, f1, g0, g1)
            if x is not None:
                cuts.add(x)
    return sorted(cuts)


def band_sub_one(a, b):
    """a minus b, both in the same plane."""
    p, q = max(a[0], b[0]), min(a[1], b[1])
    if q - p <= EPS:
        return [a]
    out = []
    for keep in (band_clip(a, a[0], p), band_clip(a, q, a[1])):
        if band_ok(keep):
            out.append(keep)
    mid, sub = band_clip(a, p, q), band_clip(b, p, q)
    if not band_ok(mid):
        return out
    if not band_ok(sub):
        out.append(mid)
        return out
    xs = _splits(mid, sub)
    for s, t in zip(xs, xs[1:]):
        m, c = band_clip(mid, s, t), band_clip(sub, s, t)
        if not band_ok(m):
            continue
        if not band_ok(c):
            out.append(m)
            continue
        # below the cut, then above it - the min/max are safe because the order of the
        # bounds does not change inside a slice
        for cand in ((s, t, m[2], m[3], min(m[4], c[2]), min(m[5], c[3])),
                     (s, t, max(m[2], c[4]), max(m[3], c[5]), m[4], m[5])):
            if band_ok(cand):
                out.append(cand)
    return out


def band_sub(bands, subtrahends):
    out = list(bands)
    for b in subtrahends:
        nxt = []
        for a in out:
            nxt.extend(band_sub_one(a, b))
        out = nxt
    return out


def band_inter_one(a, b):
    p, q = max(a[0], b[0]), min(a[1], b[1])
    if q - p <= EPS:
        return []
    m, c = band_clip(a, p, q), band_clip(b, p, q)
    if not (band_ok(m) and band_ok(c)):
        return []
    out = []
    xs = _splits(m, c)
    for s, t in zip(xs, xs[1:]):
        mm, cc = band_clip(m, s, t), band_clip(c, s, t)
        if not (band_ok(mm) and band_ok(cc)):
            continue
        cand = (s, t, max(mm[2], cc[2]), max(mm[3], cc[3]), min(mm[4], cc[4]), min(mm[5], cc[5]))
        if band_ok(cand):
            out.append(cand)
    return out


# --------------------------------------------------------------------------- solids
# solid = list of wedges, each (x0, x1, band in (y, z)). Wedges of one solid are disjoint.


def box(x0, y0, z0, x1, y1, z1):
    if x1 - x0 <= EPS or y1 - y0 <= EPS or z1 - z0 <= EPS:
        return []
    return [(x0, x1, (y0, y1, z0, z0, z1, z1))]


def prism(x0, x1, y0, y1, lo0, lo1, hi0, hi1):
    """Wedge with bounds linear in y - the roof slopes, garage roof, dormer cheeks."""
    if x1 - x0 <= EPS or y1 - y0 <= EPS:
        return []
    w = (x0, x1, (y0, y1, lo0, lo1, hi0, hi1))
    return [w] if band_ok(w[2]) else []


def solid_sub(a, b):
    out = list(a)
    for bx0, bx1, bb in b:
        nxt = []
        for x0, x1, band in out:
            p, q = max(x0, bx0), min(x1, bx1)
            if q - p <= EPS:
                nxt.append((x0, x1, band))
                continue
            if p - x0 > EPS:
                nxt.append((x0, p, band))
            if x1 - q > EPS:
                nxt.append((q, x1, band))
            for r in band_sub([band], [bb]):
                nxt.append((p, q, r))
        out = nxt
    return out


def solid_inter(a, b):
    out = []
    for ax0, ax1, ab in a:
        for bx0, bx1, bb in b:
            p, q = max(ax0, bx0), min(ax1, bx1)
            if q - p <= EPS:
                continue
            for r in band_inter_one(ab, bb):
                out.append((p, q, r))
    return out


def solid_union(a, b):
    """Disjoint union: whatever b adds on top of a."""
    return list(a) + solid_sub(b, a)


def volume(solid) -> float:
    total = 0.0
    for x0, x1, (y0, y1, lo0, lo1, hi0, hi1) in solid:
        total += (x1 - x0) * (y1 - y0) * ((hi0 - lo0) + (hi1 - lo1)) / 2
    return total


# --------------------------------------------------------------------------- faces
# Every face of a wedge lies in a plane that is axis aligned in x or y, or is the
# z = s*y + c plane of a sloped top/bottom. Two coincident faces with opposite normals
# are interior, so they cancel. What survives is the outer shell of the part.


def faces_of(solid):
    """[(group_key, plane, sign, band)] - band in the plane's two in-plane coordinates.

    group_key is rounded, so faces that should be coplanar land in the same group even
    when their bounds were interpolated along different paths. plane keeps the exact
    numbers, because reconstructing a vertex from a rounded plane would move it off the
    corner that the neighbouring face computed - the two would no longer weld.
    """
    out = []
    for x0, x1, (y0, y1, lo0, lo1, hi0, hi1) in solid:
        # x = const, in-plane (y, z)
        out.append((("x", round(x0, 3)), ("x", x0), -1, (y0, y1, lo0, lo1, hi0, hi1)))
        out.append((("x", round(x1, 3)), ("x", x1), +1, (y0, y1, lo0, lo1, hi0, hi1)))
        # y = const, in-plane (x, z)
        out.append((("y", round(y0, 3)), ("y", y0), -1, (x0, x1, lo0, lo0, hi0, hi0)))
        out.append((("y", round(y1, 3)), ("y", y1), +1, (x0, x1, lo1, lo1, hi1, hi1)))
        # z = s*y + c, in-plane (x, y)
        for (zb, zt), sign in (((lo0, lo1), -1), ((hi0, hi1), +1)):
            s = (zt - zb) / (y1 - y0)
            c = zb - s * y0
            out.append((("z", round(s, 9), round(c, 3)), ("z", s, c), sign, (x0, x1, y0, y0, y1, y1)))
    return out


def shell(solid):
    """Faces of the solid with all interior ones removed."""
    groups: dict[tuple, dict] = {}
    for key, plane, sign, band in faces_of(solid):
        grp = groups.setdefault(key, {"plane": plane, +1: [], -1: []})
        grp[sign].append(band)      # one plane per group, so a group stays self-consistent
    out = []
    for grp in groups.values():
        for sign in (+1, -1):
            for band in band_sub(grp[sign], grp[-sign]):
                if band_ok(band):
                    out.append((grp["plane"], sign, band))
    return out


def _normal(plane, sign):
    if plane[0] == "x":
        return (sign, 0.0, 0.0)
    if plane[0] == "y":
        return (0.0, sign, 0.0)
    return (0.0, -plane[1] * sign, float(sign))


def _to3d(plane, a, b):
    if plane[0] == "x":
        return (plane[1], a, b)                   # a = y, b = z
    if plane[0] == "y":
        return (a, plane[1], b)                   # a = x, b = z
    return (a, b, plane[1] * b + plane[2])        # a = x, b = y, z on the plane


def _on_segment(p, a, b):
    """Position of p along a->b if it lies inside the segment, else None.

    The line tolerance is wider than the weld grid on purpose: a corner of a sloped face
    sits on that grid, so it can miss the exact line by half a grid step per axis.
    """
    ab = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    ap = (p[0] - a[0], p[1] - a[1], p[2] - a[2])
    length = math.sqrt(ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)
    if length <= GRID:
        return None
    along = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / length
    if not GRID < along < length - GRID:
        return None
    cr = (ap[1] * ab[2] - ap[2] * ab[1], ap[2] * ab[0] - ap[0] * ab[2], ap[0] * ab[1] - ap[1] * ab[0])
    if math.sqrt(cr[0] ** 2 + cr[1] ** 2 + cr[2] ** 2) / length > TOL_LINE:
        return None
    return along


def weld_tjunctions(triangles):
    """Split edges that carry another vertex in their interior.

    Coplanar neighbours of different height leave a T - one triangle's edge meets the
    middle of another's. The volume is still right, but the edge has no partner, so
    three.js EdgesGeometry treats it as an outline and draws a seam across the part.
    Fanning the offending triangle from its opposite corner closes the mesh and keeps
    every triangle non-degenerate, because that corner never lies on the split edge.
    """
    points = {p for tri in triangles for p in tri}
    queue, out, guard = list(triangles), [], 0
    while queue:
        guard += 1
        if guard > 200000:                            # cannot happen; never hang a build
            raise RuntimeError("weld_tjunctions did not settle")
        tri = queue.pop()
        chain = None
        for i in range(3):
            a, b, apex = tri[i], tri[(i + 1) % 3], tri[(i + 2) % 3]
            lo = [min(a[k], b[k]) - 1e-3 for k in range(3)]
            hi = [max(a[k], b[k]) + 1e-3 for k in range(3)]
            hits = []
            for p in points:
                if p == a or p == b:
                    continue
                if not (lo[0] <= p[0] <= hi[0] and lo[1] <= p[1] <= hi[1] and lo[2] <= p[2] <= hi[2]):
                    continue
                t = _on_segment(p, a, b)
                if t is not None:
                    hits.append((t, p))
            if hits:
                hits.sort()
                # (apex, u, w) is a cyclic rotation of the original corners, so the
                # winding - and with it the outward normal - is preserved
                chain = (apex, [a] + [p for _, p in hits] + [b])
                break
        if chain is None:
            out.append(tri)
        else:
            apex, pts = chain
            for u, w in zip(pts, pts[1:]):
                queue.append((apex, u, w))
    return out


def triangulate(solid):
    """Shell of the solid as (vertices in mm, triangle indices)."""
    triangles = []

    def emit(p0, p1, p2, n):
        u = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
        v = (p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2])
        cr = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
        if abs(cr[0]) + abs(cr[1]) + abs(cr[2]) < 1e-3:
            return                                    # degenerate sliver
        if cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0:
            p1, p2 = p2, p1
        triangles.append((p0, p1, p2))

    def snap(p):
        # the weld grid is fine enough to keep a sloped edge straight, but coarse enough
        # that one corner reached along two different interpolation paths is one vertex
        return (round(p[0], WELD_DIGITS), round(p[1], WELD_DIGITS), round(p[2], WELD_DIGITS))

    for plane, sign, (a0, a1, lo0, lo1, hi0, hi1) in shell(solid):
        n = _normal(plane, sign)
        c00, c10 = _to3d(plane, a0, lo0), _to3d(plane, a1, lo1)
        c11, c01 = _to3d(plane, a1, hi1), _to3d(plane, a0, hi0)
        emit(snap(c00), snap(c10), snap(c11), n)
        emit(snap(c00), snap(c11), snap(c01), n)

    verts: list[tuple[float, float, float]] = []
    index: dict[tuple, int] = {}
    tris: list[int] = []
    for tri in weld_tjunctions(triangles):
        for p in tri:
            key = tuple(round(c, OUT_DIGITS) for c in p)
            if key not in index:
                index[key] = len(verts)
                verts.append(key)
            tris.append(index[key])
    return [c for p in verts for c in p], tris


# --------------------------------------------------------------------------- scene
def build(m, variant: str, version: str, note: str) -> dict:
    zu = m.roof_z_under
    ridge = m.HOUSE_D / 2
    ov = m.ROOF_OVERHANG
    dz_t = m.ROOF_T / math.cos(math.radians(m.ROOF_PITCH))
    g = m.GAUBE
    gtop = m.Z_OG + g["wall_h"]

    # everything below the rafters, plus the dormer volume - the OG walls are cut to it
    under_roof = (prism(-ov - 1, m.HOUSE_W + 1, -ov - 1, ridge,
                        m.Z_OG - 500, m.Z_OG - 500, zu(-ov - 1), zu(ridge))
                  + prism(-ov - 1, m.HOUSE_W + 1, ridge, m.HOUSE_D + ov + 1,
                          m.Z_OG - 500, m.Z_OG - 500, zu(ridge), zu(m.HOUSE_D + ov + 1)))
    gaube_vol = box(g["x0"], -1, m.Z_OG - 500, g["x1"], g["depth"], gtop + 50)
    under_roof_g = solid_union(under_roof, gaube_vol)

    parts: list[dict] = []

    def add(layer, name, kind, tag, solid, tragend=False):
        if not solid or volume(solid) < 1e3:
            return
        v, t = triangulate(solid)
        xs, ys, zs = v[0::3], v[1::3], v[2::3]
        parts.append(dict(layer=layer, name=name, kind=kind, tag=tag, tragend=tragend, v=v, t=t,
                          bb=[round(min(xs)), round(min(ys)), round(min(zs)),
                              round(max(xs)), round(max(ys)), round(max(zs))]))

    def openings_of(w):
        return [o for o in m.OPENINGS if (o["floor"], o["wall"]) == (w["floor"], w["name"])]

    def wall_solid(w, z0, z1):
        s = box(w["x0"], w["y0"], z0, w["x1"], w["y1"], z1)
        along = (w["x1"] - w["x0"]) >= (w["y1"] - w["y0"])
        for o in openings_of(w):
            h = o["height"] if o["kind"] != "loggia" else (z1 - z0 - o["sill"]) + 10
            a = o["a0"]
            if along:
                cut = box(w["x0"] + a, w["y0"] - 10, z0 + o["sill"],
                          w["x0"] + a + o["width"], w["y1"] + 10, z0 + o["sill"] + h)
            else:
                cut = box(w["x0"] - 10, w["y0"] + a, z0 + o["sill"],
                          w["x1"] + 10, w["y0"] + a + o["width"], z0 + o["sill"] + h)
            s = solid_sub(s, cut)
        return s

    def panels(w, z0):
        """Window and door leaves as thin sheets, for display."""
        along = (w["x1"] - w["x0"]) >= (w["y1"] - w["y0"])
        out = []
        for o in openings_of(w):
            if o["kind"] == "loggia":
                continue
            kind = "glass" if o["kind"] == "window" else "door"
            name = f'{"Fenster" if kind == "glass" else "Tür"} {o["width"]}×{o["height"]}'
            a = o["a0"]
            if along:
                ym = (w["y0"] + w["y1"]) / 2
                s = box(w["x0"] + a, ym - 20, z0 + o["sill"],
                        w["x0"] + a + o["width"], ym + 20, z0 + o["sill"] + o["height"])
            else:
                xm = (w["x0"] + w["x1"]) / 2
                s = box(xm - 20, w["y0"] + a, z0 + o["sill"],
                        xm + 20, w["y0"] + a + o["width"], z0 + o["sill"] + o["height"])
            out.append((name, kind, o["tag"], s))
        return out

    def wall_priority(w):
        """Order for overlap removal: outer walls first, then 240, then light walls."""
        th = min(w["x1"] - w["x0"], w["y1"] - w["y0"])
        return (0 if w["name"].startswith("Außenwand") else 1 if th >= 240 else 2, -th)

    def build_floor_walls(floor, z0, z1, clip=None):
        done = []
        for w in sorted([w for w in m.WALLS if w["floor"] == floor], key=wall_priority):
            s = wall_solid(w, z0, z1)
            if clip is not None:
                s = solid_inter(s, clip)
            for d in done:
                s = solid_sub(s, d)                   # remove overlaps at crossings
            th = min(w["x1"] - w["x0"], w["y1"] - w["y0"])
            add(floor, w["name"], "wall", w["tag"], s,
                tragend=(th >= 240 and not w["name"].startswith("Kamin")))
            done.append(s)
            for name, kind, tag, p in panels(w, z0):
                add(floor, name, kind, tag, p)

    def slab(z0, opening=None):
        s = box(0, 0, z0, m.HOUSE_W, m.HOUSE_D, z0 + m.SLAB)
        if opening:
            s = solid_sub(s, box(opening[0], opening[1], z0 - 10,
                                 opening[2], opening[3], z0 + m.SLAB + 10))
        return s

    def stair_solid(s, floor):
        dx, dy = {"+x": (1, 0), "-x": (-1, 0), "+y": (0, 1), "-y": (0, -1)}[s["direction"]]
        out = []
        for i in range(s["steps"]):
            zt = s["z0"] + (i + 1) * s["rise"]
            zb = m.Z_KG if floor == "KG" else s["z0"] + max(i - 1, 0) * s["rise"]
            if dx:
                x = s["x0"] + (i * s["run"] if dx > 0 else -(i + 1) * s["run"])
                b = box(x, s["y0"], zb, x + s["run"], s["y0"] + s["width"], zt)
            else:
                y = s["y0"] + (i * s["run"] if dy > 0 else -(i + 1) * s["run"])
                b = box(s["x0"], y, zb, s["x0"] + s["width"], y + s["run"], zt)
            out = solid_union(out, b)
        return out

    # ------------------------------------------------------------------ KG / EG
    add("KG", "Bodenplatte KG", "slab", "A", box(0, 0, m.Z_KG - 200, m.HOUSE_W, m.HOUSE_D, m.Z_KG))
    build_floor_walls("KG", m.Z_KG, -m.SLAB)
    add("EG", "Stahlbetondecke über KG (14 cm)", "slab", "A", slab(-m.SLAB, m.SLAB_OPENINGS["EG"]))
    build_floor_walls("EG", 0, m.Z_OG - m.SLAB)
    for lp in m.LOGGIA_PARAPETS:
        add("EG", "Loggia Brüstung", "wall", lp["tag"],
            box(lp["x0"], lp["y0"], 0, lp["x1"], lp["y1"], lp["h"]))
    for s in m.STAIRS:
        floor = "KG" if s["z0"] < 0 else "EG"
        add(floor, s["name"], "stair", s["tag"], stair_solid(s, floor))
    for l in m.LANDINGS:
        add("KG", l["name"], "stair", l["tag"],
            box(l["x0"], l["y0"], l["z"] - 150, l["x1"], l["y1"], l["z"]))

    # ------------------------------------------------------------------ OG
    add("OG", "Stahlbetondecke über EG (14 cm)", "slab", "A", slab(m.Z_OG - m.SLAB, m.SLAB_OPENINGS["OG"]))
    build_floor_walls("OG", m.Z_OG, zu(ridge) + 100, clip=under_roof_g)
    bk = m.BALKON
    add("OG", "Balkon Platte", "slab", bk["tag"],
        box(bk["x0"], bk["y0"], m.Z_OG - 160, bk["x1"], bk["y1"], m.Z_OG))
    rail = box(bk["x0"], bk["y0"], m.Z_OG, bk["x0"] + 60, bk["y1"], m.Z_OG + 1000)
    rail = solid_union(rail, box(bk["x0"], bk["y0"], m.Z_OG, bk["x1"], bk["y0"] + 60, m.Z_OG + 1000))
    rail = solid_union(rail, box(bk["x0"], bk["y1"] - 60, m.Z_OG, bk["x1"], bk["y1"], m.Z_OG + 1000))
    add("OG", "Balkon Geländer", "rail", bk["tag"], rail)

    # ------------------------------------------------------------------ Dach + Gaube
    roof = (prism(0, m.HOUSE_W, -ov, ridge, zu(-ov), zu(ridge), zu(-ov) + dz_t, zu(ridge) + dz_t)
            + prism(0, m.HOUSE_W, ridge, m.HOUSE_D + ov,
                    zu(ridge), zu(m.HOUSE_D + ov), zu(ridge) + dz_t, zu(m.HOUSE_D + ov) + dz_t))
    roof = solid_sub(roof, box(g["x0"] + 120, -ov - 1, m.Z_OG, g["x1"] - 120, g["depth"] - 50, gtop))
    add("DACH", "Satteldach 36° (Kunstschiefer)", "roof", "A", roof)

    front = box(g["x0"], 0, m.Z_OG, g["x1"], 365, gtop)
    cx = g["x0"] + 120
    for wd, gap in g["windows"]:
        front = solid_sub(front, box(cx, -10, m.Z_OG + 900, cx + wd, 400, m.Z_OG + 2000))
        add("DACH", f"Gaubenfenster {wd}", "glass", g["tag"],
            box(cx, 160, m.Z_OG + 900, cx + wd, 200, m.Z_OG + 2000))
        cx += wd + gap
    add("DACH", "Gaube Frontwand", "wall", g["tag"], solid_sub(front, under_roof))
    for name, x in (("Gaube Wange West", g["x0"]), ("Gaube Wange Ost", g["x1"] - 120)):
        add("DACH", name, "wall", g["tag"],
            prism(x, x + 120, 0, g["depth"], m.Z_OG + m.KNIESTOCK, zu(g["depth"]), gtop + 50, gtop + 50))
    add("DACH", "Gaubendach", "roof", "C",
        box(g["x0"] - 200, -300, gtop + 50, g["x1"] + 200, g["depth"] + 200, gtop + 250))
    ys_ = m.T_OUT + (m.OG_CEIL - (m.Z_OG + m.KNIESTOCK)) / m.tan_roof() + 100
    add("DACH", "Holzbalkendecke Spitzboden", "slab", "B",
        box(m.T_OUT, ys_, m.OG_CEIL, m.HOUSE_W - m.T_OUT, m.HOUSE_D - ys_, m.OG_CEIL + 200))

    # ------------------------------------------------------------------ Garage
    done = []
    for w in sorted([w for w in m.WALLS if w["floor"] == "GAR"], key=wall_priority):
        s = wall_solid(w, m.GAR_Z0, m.garage_roof_z((w["y0"] + w["y1"]) / 2))
        for d in done:
            s = solid_sub(s, d)
        add("GAR", w["name"], "wall", w["tag"], s, tragend=True)
        done.append(s)
        for name, kind, tag, p in panels(w, m.GAR_Z0):
            add("GAR", name, kind, tag, p)
    gy0, gy1 = m.GAR_Y[0] - 300, m.GAR_Y[1] + 300
    add("GAR", "Garagendach (4 %, Lagenpappe)", "roof", "B",
        prism(m.GAR_X[0] - 300, 0, gy0, gy1, m.garage_roof_z(gy0), m.garage_roof_z(gy1),
              m.garage_roof_z(gy0) + 220, m.garage_roof_z(gy1) + 220))
    add("GAR", "Garagenboden", "slab", "B",
        box(m.GAR_X[0], m.GAR_Y[0], m.GAR_Z0 - 160, m.GAR_X[1], m.GAR_Y[1], m.GAR_Z0))
    add("GAR", "Vordach Garagen (8000×2500)", "roof", "A",
        box(m.GAR_X[0], m.GAR_Y[0] - 2500, m.GAR_Z0 + m.GAR_H_FRONT,
            m.GAR_X[0] + 8000, m.GAR_Y[0], m.GAR_Z0 + m.GAR_H_FRONT + 200))

    return dict(prims=parts, meta=dict(
        variant=variant, version=version, generatedAt=dt.date.today().isoformat(), note=note,
        house_w=m.HOUSE_W, house_d=m.HOUSE_D, ridge=zu(ridge), source="build_scene_lite.py"))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--variant", choices=("ist", "soll"), default="ist")
    ap.add_argument("--version", required=True, help="model version, always increase it")
    ap.add_argument("--note", default="", help="short note shown in the app")
    ap.add_argument("--out", help=f"output file (default {MODELS}/<variant>.json)")
    args = ap.parse_args()

    m = importlib.import_module("haus_model" if args.variant == "ist" else "haus_model_soll")
    scene = build(m, args.variant, args.version, args.note)
    out = pathlib.Path(args.out) if args.out else MODELS / f"{args.variant}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(scene, separators=(",", ":")))
    print(f"{out}: {len(scene['prims'])} Bauteile, "
          f"{sum(len(p['t']) // 3 for p in scene['prims'])} Dreiecke, "
          f"{out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
