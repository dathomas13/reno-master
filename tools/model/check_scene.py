#!/usr/bin/env python3
"""Check a generated viewer scene, and optionally compare it against a reference.

    python3 tools/model/check_scene.py public/models/ist.json
    python3 tools/model/check_scene.py new.json --against public/models/ist.json

Standard library only, so it runs in a sandbox without npm or a CAD stack. Exits non-zero
when a check fails, which makes it usable before a commit or in a workflow.

On its own it checks what the viewer relies on:
  * schema - layer, kind and tag are values src/modules/viewer3d/houseScene.ts knows,
    triangle indices are in range, bb matches the vertices
  * closed shells - every edge shared by exactly two triangles with opposite direction.
    An unpaired edge is not cosmetic: EdgesGeometry treats it as an outline and draws a
    seam across the middle of the part.
  * consistent orientation - signed volume positive, so normals point outwards
  * no degenerate triangles

With --against it also compares part inventory, per-part volume and surface, and rasterises
both scenes with a depth buffer from five directions. That last one is the honest test of
"does it look the same": it is independent of triangle count and drawing order.
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import sys
from collections import Counter, defaultdict

LAYERS = {"KG", "EG", "OG", "DACH", "GAR"}
KINDS = {"wall", "slab", "roof", "glass", "door", "stair", "rail"}
TAGS = {"A", "B", "C"}

RES_W, RES_H = 600, 440
VIEWS = [("Südost oben", 35, 22), ("Nordwest oben", 215, 22), ("Süd flach", 0, 5),
         ("Ost flach", 90, 5), ("von oben", 35, 85)]

problems: list[str] = []


def fail(msg: str) -> None:
    problems.append(msg)


def triangles(prim):
    v, t = prim["v"], prim["t"]
    for i in range(0, len(t), 3):
        a, b, c = t[i] * 3, t[i + 1] * 3, t[i + 2] * 3
        yield tuple(v[a:a + 3]), tuple(v[b:b + 3]), tuple(v[c:c + 3])


def cross(u, w):
    return (u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0])


def signed_volume(prim) -> float:
    total = 0.0
    for a, b, c in triangles(prim):
        total += (a[0] * (b[1] * c[2] - b[2] * c[1])
                  - a[1] * (b[0] * c[2] - b[2] * c[0])
                  + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0
    return total


def surface(prim) -> float:
    total = 0.0
    for a, b, c in triangles(prim):
        n = cross([b[i] - a[i] for i in range(3)], [c[i] - a[i] for i in range(3)])
        total += 0.5 * math.sqrt(sum(q * q for q in n))
    return total


def label(prim) -> str:
    return f'{prim["layer"]} {prim["name"]}'


# --------------------------------------------------------------------------- single scene
def check_schema(prims) -> None:
    for p in prims:
        if p["layer"] not in LAYERS or p["kind"] not in KINDS or p["tag"] not in TAGS:
            fail(f'{label(p)}: unbekanntes layer/kind/tag ({p["layer"]}/{p["kind"]}/{p["tag"]})')
        if len(p["v"]) % 3 or len(p["t"]) % 3:
            fail(f"{label(p)}: v oder t ist kein Vielfaches von 3")
        elif p["t"] and max(p["t"]) * 3 + 2 >= len(p["v"]):
            fail(f"{label(p)}: Dreiecksindex zeigt hinter das Vertexfeld")
        if len(p["bb"]) != 6:
            fail(f"{label(p)}: bb hat nicht 6 Werte")
        elif p["v"]:
            xs, ys, zs = p["v"][0::3], p["v"][1::3], p["v"][2::3]
            want = [min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)]
            if any(abs(p["bb"][i] - want[i]) > 1 for i in range(6)):
                fail(f'{label(p)}: bb {p["bb"]} passt nicht zu den Vertices')


def check_shells(prims) -> None:
    for p in prims:
        edges = Counter()
        for a, b, c in triangles(p):
            for u, w in ((a, b), (b, c), (c, a)):
                edges[(u, w)] += 1
        unpaired = [e for e in edges if (e[1], e[0]) not in edges]
        doubled = [e for e, n in edges.items() if n != 1]
        if unpaired or doubled:
            longest = max((math.dist(u, w) for u, w in unpaired + doubled), default=0)
            fail(f"{label(p)}: Hülle nicht geschlossen - {len(unpaired)} unpaarige, "
                 f"{len(doubled)} doppelte Kanten, längste {longest:.1f} mm")


def check_solids(prims) -> None:
    for p in prims:
        vol = signed_volume(p)
        if vol <= 0:
            fail(f"{label(p)}: Volumen {vol/1e6:.2f} dm³ - Normalen zeigen nach innen")
        degenerate = sum(
            1 for a, b, c in triangles(p)
            if math.sqrt(sum(q * q for q in cross([b[i] - a[i] for i in range(3)],
                                                  [c[i] - a[i] for i in range(3)]))) < 1.0)
        if degenerate:
            fail(f"{label(p)}: {degenerate} degenerierte Dreiecke")


# --------------------------------------------------------------------------- comparison
def _project(az_deg, el_deg):
    az, el = math.radians(az_deg), math.radians(el_deg)
    ca, sa, ce, se = math.cos(az), math.sin(az), math.cos(el), math.sin(el)

    def proj(x, y, z):
        return (x * ca - y * sa,
                (x * sa + y * ca) * se - z * ce,
                (x * sa + y * ca) * ce + z * se)   # größere Tiefe = näher an der Kamera
    return proj


def _screen_bounds(prims, proj):
    xs, ys = [], []
    for p in prims:
        v = p["v"]
        for j in range(0, len(v), 3):
            sx, sy, _ = proj(v[j], v[j + 1], v[j + 2])
            xs.append(sx)
            ys.append(sy)
    return min(xs), max(xs), min(ys), max(ys)


def rasterize(prims, proj, bounds):
    minx, maxx, miny, maxy = bounds
    sc = min((RES_W - 4) / (maxx - minx), (RES_H - 4) / (maxy - miny))
    ox, oy = 2 - minx * sc, 2 - miny * sc
    depth: list[float | None] = [None] * (RES_W * RES_H)
    for p in prims:
        v, t = p["v"], p["t"]
        for i in range(0, len(t), 3):
            pts = []
            for k in range(3):
                j = t[i + k] * 3
                sx, sy, d = proj(v[j], v[j + 1], v[j + 2])
                pts.append((sx * sc + ox, sy * sc + oy, d))
            (ax, ay, ad), (bx, by, bd), (cx, cy, cd) = pts
            det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
            if abs(det) < 1e-9:
                continue
            x0 = max(0, int(min(q[0] for q in pts)))
            x1 = min(RES_W - 1, int(max(q[0] for q in pts)) + 1)
            y0 = max(0, int(min(q[1] for q in pts)))
            y1 = min(RES_H - 1, int(max(q[1] for q in pts)) + 1)
            for py in range(y0, y1 + 1):
                fy, row = py + 0.5, py * RES_W
                for px in range(x0, x1 + 1):
                    fx = px + 0.5
                    w1 = ((fx - ax) * (cy - ay) - (cx - ax) * (fy - ay)) / det
                    if w1 < -1e-9 or w1 > 1 + 1e-9:
                        continue
                    w2 = ((bx - ax) * (fy - ay) - (fx - ax) * (by - ay)) / det
                    if w2 < -1e-9 or w1 + w2 > 1 + 1e-9:
                        continue
                    d = ad + w1 * (bd - ad) + w2 * (cd - ad)
                    if depth[row + px] is None or d > depth[row + px]:
                        depth[row + px] = d
    return depth


def compare(new, ref, tol_mm: float) -> None:
    def key(p):
        return (p["layer"], p["kind"], p["name"])

    ni, ri = Counter(key(p) for p in new), Counter(key(p) for p in ref)
    for k, n in (ri - ni).items():
        fail(f"Bauteil fehlt ({n}x): {k}")
    for k, n in (ni - ri).items():
        fail(f"Bauteil zusätzlich ({n}x): {k}")

    nby, rby = defaultdict(list), defaultdict(list)
    for p in new:
        nby[key(p)].append(p)
    for p in ref:
        rby[key(p)].append(p)
    tv = tn = 0.0
    for k in sorted(set(nby) & set(rby)):
        for pn, pr in zip(nby[k], rby[k]):
            vn, vr = signed_volume(pn), signed_volume(pr)
            tn += vn
            tv += vr
            if abs(vn - vr) / max(abs(vr), 1.0) > 0.01:
                fail(f'{label(pn)}: Volumen {vn/1e6:.2f} statt {vr/1e6:.2f} dm³')
            an, ar = surface(pn), surface(pr)
            if abs(an - ar) / max(ar, 1.0) > 0.02:
                fail(f'{label(pn)}: Oberfläche {an/1e6:.2f} statt {ar/1e6:.2f} m²')
            # Volumen und Oberfläche ändern sich beim Verschieben nicht, und ein
            # Innenbauteil sieht keine Ansicht - die Lage muss eigens verglichen werden
            off = [pn["bb"][i] - pr["bb"][i] for i in range(6)]
            if max(abs(d) for d in off) > 1.0:
                fail(f'{label(pn)}: Lage weicht ab, bb {pn["bb"]} statt {pr["bb"]}')
            if (pn["tag"], pn.get("tragend", False)) != (pr["tag"], pr.get("tragend", False)):
                fail(f"{label(pn)}: tag/tragend weicht ab")
    print(f"  Gesamtvolumen {tn/1e9:.3f} m³, Referenz {tv/1e9:.3f} m³ "
          f"(Abweichung {abs(tn-tv)/max(tv,1)*100:.2f} %)")

    print(f"  Tiefenpuffer {RES_W}x{RES_H}, {len(VIEWS)} Ansichten:")
    for name, az, el in VIEWS:
        proj = _project(az, el)
        bounds = _screen_bounds(ref, proj)
        dn, dr = rasterize(new, proj, bounds), rasterize(ref, proj, bounds)
        only_new = only_ref = both = 0
        worst = 0.0
        for i in range(RES_W * RES_H):
            a, b = dn[i], dr[i]
            if a is None and b is None:
                continue
            if a is None:
                only_ref += 1
            elif b is None:
                only_new += 1
            else:
                both += 1
                worst = max(worst, abs(a - b))
        print(f"    {name:15} {both:>7} Pixel gleich, {only_new} nur neu, "
              f"{only_ref} nur Referenz, Tiefe max {worst:.2f} mm")
        if only_new or only_ref:
            fail(f"{name}: {only_new + only_ref} Pixel zeigen Fläche in nur einer Szene")
        if worst > tol_mm:
            fail(f"{name}: Tiefenabweichung {worst:.2f} mm > {tol_mm} mm")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("scene", type=pathlib.Path)
    ap.add_argument("--against", type=pathlib.Path, help="Referenzszene zum Vergleich")
    ap.add_argument("--tol", type=float, default=1.0,
                    help="erlaubte Tiefenabweichung in mm (Standard 1.0)")
    args = ap.parse_args()

    doc = json.loads(args.scene.read_text())
    prims = doc["prims"]
    print(f'{args.scene}: {len(prims)} Bauteile, '
          f'{sum(len(p["t"]) // 3 for p in prims)} Dreiecke, meta {doc.get("meta", {})}')
    print(f'  kind: {dict(sorted(Counter(p["kind"] for p in prims).items()))}')
    print(f'  tag:  {dict(sorted(Counter(p["tag"] for p in prims).items()))}')
    check_schema(prims)
    check_shells(prims)
    check_solids(prims)
    if args.against:
        compare(prims, json.loads(args.against.read_text())["prims"], args.tol)

    print()
    if problems:
        print(f"{len(problems)} Problem(e):")
        for p in problems[:40]:
            print("  -", p)
        if len(problems) > 40:
            print(f"  ... und {len(problems) - 40} weitere")
        return 1
    print("Alle Prüfungen in Ordnung.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
