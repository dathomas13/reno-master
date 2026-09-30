#!/usr/bin/env python3
"""Generate 2D floor plans as SVG from the model data base.

One file per floor and variant, e.g. plans/ist-EG.svg next to the house file (see
hausdatei.py for the directory). The app draws the same SVG in
src/modules/modelBuild/plansSvg.ts. The SVG uses the model
coordinate system in mm (y flipped so north is up) and carries data-room-id on every
room area, so the app can make rooms tappable in the plan just like in the 3D view.

    python3 tools/model/build_plans_svg.py                # both variants, KG/EG/OG
    python3 tools/model/build_plans_svg.py --variant ist --floors EG

Drawn like a paper plan: grey load-bearing walls with a black outline, dark light
partitions, estimated walls (tag C) hatched, openings with width/height (and the sill
height of windows), room stamps with area and clear dimensions, and dimension chains in
cm on all four sides - openings, walls, overall.
"""
from __future__ import annotations

import argparse
import importlib
import json
import pathlib
import sys
from xml.sax.saxutils import escape

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import hausdatei  # noqa: E402
from hausdatei import DATA, PLANS  # noqa: E402

CHAIN_GAP = 700                    # mm from the building to the first dimension chain
CHAIN_STEP = 450                   # mm between two chains
CHAIN_ZONE = CHAIN_GAP + 3 * CHAIN_STEP + 350   # room for four chains and their text
TITLE_ZONE = 1100                  # mm above the chains for the title
FOOT_ZONE = 1000                   # mm below the chains for scale bar and legend
FLOOR_LABEL = {"KG": "Kellergeschoss", "EG": "Erdgeschoss", "OG": "Obergeschoss"}
VARIANT_LABEL = {"ist": "Bestand", "aktuell": "Aktuell", "soll": "Plan"}
LEGEND = ("Maße in cm · Raummaße in m · Öffnungen Breite/Höhe, BRH Brüstungshöhe · "
          "* oder schraffiert: geschätzt")

# Drawn like a paper plan (Grundriss 1:50): grey walls with a black outline, dark light
# partitions, red dimension chains with architect's slashes. Every rule is scoped to
# .reno-plan because the app puts the SVG into the page, where a bare "svg { }" would
# reach every icon.
STYLE = """
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
"""


def cm(mm: float) -> str:
    """a length in mm as it stands on a plan: cm, German comma, ",5" only where needed"""
    text = f"{mm / 10:.1f}"
    if text.endswith(".0"):
        text = text[:-2]
    return text.replace(".", ",")


def metres(mm: float) -> str:
    return f"{mm / 1000:.3f}".replace(".", ",")


def merge_points(points: list[float]) -> list[float]:
    """sorted, without points closer than 1 mm to the one before"""
    out: list[float] = []
    for p in sorted(points):
        if not out or p - out[-1] >= 1:
            out.append(p)
    return out


def build_floor(model, rooms_doc, variant: str, floor: str, version: str) -> str:
    W, D = model.HOUSE_W, model.HOUSE_D
    t_out = model.T_OUT
    out: list[str] = []
    add = out.append

    def fy(y: float) -> float:
        """model y (north positive) -> svg y (north up)"""
        return D - y

    def rect(x0, y0, x1, y1, cls, extra=""):
        add(f'<rect class="{cls}" x="{x0:.0f}" y="{fy(y1):.0f}" '
            f'width="{x1 - x0:.0f}" height="{y1 - y0:.0f}"{extra}/>')

    def line(x1, y1, x2, y2, cls):
        """svg coordinates"""
        add(f'<line class="{cls}" x1="{x1:.0f}" y1="{y1:.0f}" x2="{x2:.0f}" y2="{y2:.0f}"/>')

    def along_x(w) -> bool:
        return (w["x1"] - w["x0"]) >= (w["y1"] - w["y0"])

    walls = [w for w in model.WALLS if w["floor"] == floor]
    if walls:
        bx0 = min(w["x0"] for w in walls)
        bx1 = max(w["x1"] for w in walls)
        by0 = min(w["y0"] for w in walls)
        by1 = max(w["y1"] for w in walls)
    else:
        bx0, bx1, by0, by1 = 0, W, 0, D

    vx0 = bx0 - CHAIN_ZONE
    vx1 = bx1 + CHAIN_ZONE
    vy0 = fy(by1) - CHAIN_ZONE - TITLE_ZONE
    vy1 = fy(by0) + CHAIN_ZONE + FOOT_ZONE
    vb = f"{vx0:.0f} {vy0:.0f} {vx1 - vx0:.0f} {vy1 - vy0:.0f}"
    add(f'<svg xmlns="http://www.w3.org/2000/svg" class="reno-plan" viewBox="{vb}" '
        f'data-variant="{variant}" data-floor="{floor}" data-version="{version}" '
        f'role="img" aria-label="{FLOOR_LABEL[floor]} {VARIANT_LABEL[variant]}">')
    add(f"<style>{STYLE}</style>")
    add('<defs><pattern id="reno-plan-hatch" patternUnits="userSpaceOnUse" width="120" height="120" '
        'patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="120" stroke="#8a8a8a" '
        'stroke-width="18"/></pattern></defs>')
    add(f'<rect x="{vx0:.0f}" y="{vy0:.0f}" width="{vx1 - vx0:.0f}" '
        f'height="{vy1 - vy0:.0f}" fill="var(--paper)"/>')

    # ---- rooms (tap areas below the walls, stamps on top of everything)
    labels: list[str] = []
    add('<g id="rooms">')
    for room in rooms_doc["rooms"]:
        if room["floor"] != floor:
            continue
        if not room["rects"]:
            continue   # noch keine Geometrie (Soll-Raum ohne Aufmaß) - nichts zu zeichnen
        add(f'<g class="room-group" data-room-id="{room["id"]}">')
        for x0, y0, x1, y1 in room["rects"]:
            rect(x0, y0, x1, y1, "room", f' data-room-id="{room["id"]}"')
        big = max(room["rects"], key=lambda r: (r[2] - r[0]) * (r[3] - r[1]))
        bw, bh = big[2] - big[0], big[3] - big[1]
        cx = (big[0] + big[2]) / 2
        cy = fy((big[1] + big[3]) / 2)
        name = escape(room["name"])
        # shrink the label until it fits the room, drop the area line in tiny rooms
        avail = max(bw - 180, 240)
        size = min(230, max(120, int(avail / (0.60 * max(len(name), 1)))))
        # if the name is still wider than the room, squeeze the glyphs so it always fits
        fit = "" if 0.60 * size * len(name) <= avail else f' textLength="{avail:.0f}" lengthAdjust="spacingAndGlyphs"'
        show_area = bh > 620 and bw > 900
        # the clear inside dimensions, for a room that is one rectangle
        show_size = show_area and len(room["rects"]) == 1 and bh > 900 and bw > 1300
        dy = 0 if show_area else size * 0.35
        if show_size:
            dy = 150
        labels.append(f'<text class="room-label" x="{cx:.0f}" y="{cy - dy:.0f}" '
                      f'font-size="{size}px"{fit}>{name}</text>')
        if show_area:
            area = f"{room['areaM2']:.2f}".replace(".", ",")
            labels.append(f'<text class="room-area" x="{cx:.0f}" y="{cy - dy + 230:.0f}">'
                          f'{area} m²</text>')
        if show_size:
            labels.append(f'<text class="room-size" x="{cx:.0f}" y="{cy - dy + 430:.0f}">'
                          f'{metres(bw)} × {metres(bh)}</text>')
        add("</g>")
    add("</g>")

    # ---- walls: every outline first, then every fill on top - that leaves the outline
    # of the whole wall mass; the thin stroke in wall colour hides the seams where two
    # walls meet
    add('<g id="walls">')
    for w in walls:
        rect(w["x0"], w["y0"], w["x1"], w["y1"], "wall-edge")
    for w in walls:
        thick = min(w["x1"] - w["x0"], w["y1"] - w["y0"])
        bearing = w["tragend"] if w.get("tragend") is not None else thick >= 240
        cls = "wall" if bearing else "wall light"
        rect(w["x0"], w["y0"], w["x1"], w["y1"], cls,
             f' data-wall="{escape(w["name"], {chr(34): "&quot;"})}"')
    for w in walls:
        if w["tag"] == "C":
            rect(w["x0"], w["y0"], w["x1"], w["y1"], "wall-c")
    add("</g>")

    def slide_symbol(w, o, a0, a1):
        """A sliding door: each leaf half open on its face of the wall, as in the 3D view, and
        its rail along the outer edge from the closed to the fully open leaf."""
        sl = o["slide"]
        along = along_x(w)
        c0, c1 = (w["y0"], w["y1"]) if along else (w["x0"], w["x1"])
        q0, q1, qr = (c1 + 10, c1 + 50, c1 + 50) if sl["face"] in ("N", "E") else (c0 - 50, c0 - 10, c0 - 50)
        start = w["x0"] if along else w["y0"]
        if sl.get("split") is not None:
            leaves = [(start + a0, sl["split"], -1), (sl["split"], start + a1, 1)]
        else:
            leaves = [(start + a0, start + a1, 1 if sl["open"] in ("E", "N") else -1)]
        for b0, b1, d in leaves:
            width = b1 - b0
            if d > 0:
                l0, l1, r0, r1, half = b0, b1 + 50, b0, b1 + 50 + width, width / 2
            else:
                l0, l1, r0, r1, half = b0 - 50, b1, b0 - 50 - width, b1, -width / 2
            if along:
                rect(l0 + half, q0, l1 + half, q1, "slide-leaf")
                line(r0, fy(qr), r1, fy(qr), "slide-rail")
            else:
                rect(q0, l0 + half, q1, l1 + half, "slide-leaf")
                line(qr, fy(r0), qr, fy(r1), "slide-rail")

    # ---- openings: cut out of the wall, jambs, glass or door line, and the size as text
    add('<g id="openings">')
    mid_x = (bx0 + bx1) / 2
    mid_y = (by0 + by1) / 2
    by_name = {w["name"]: w for w in walls}
    for o in model.OPENINGS:
        if o["floor"] != floor:
            continue
        w = by_name.get(o["wall"])
        if not w:
            continue
        a0 = o["a0"]
        a1 = o["a0"] + o["width"]
        text = f'{cm(o["width"])}/{cm(o["height"])}'
        if o["kind"] == "window" and o["sill"] > 0:
            text += f' · BRH {cm(o["sill"])}'
        if o["tag"] == "C":
            text += "*"
        if along_x(w):
            x0, x1 = w["x0"] + a0, w["x0"] + a1
            s0, s1 = fy(w["y1"]), fy(w["y0"])        # svg y of the north and the south face
            add(f'<rect class="gap" x="{x0:.0f}" y="{s0 - 25:.0f}" width="{x1 - x0:.0f}" '
                f'height="{s1 - s0 + 50:.0f}"/>')
            line(x0, s0 - 15, x0, s1 + 15, "jamb")
            line(x1, s0 - 15, x1, s1 + 15, "jamb")
            sm = (s0 + s1) / 2
            if o["kind"] == "window":
                line(x0, sm - 40, x1, sm - 40, "glass")
                line(x0, sm + 40, x1, sm + 40, "glass")
            elif o.get("slide"):
                slide_symbol(w, o, a0, a1)
            elif o["kind"] == "door" and o.get("leaf", True):
                line(x0, sm, x1, sm, "door-line")
            # the text goes to the side facing the middle of the house, clear of a sliding leaf
            north = (w["y0"] + w["y1"]) / 2 < mid_y
            shift = 60 if o.get("slide") and o["slide"]["face"] == ("N" if north else "S") else 0
            ty = s0 - 70 - shift if north else s1 + 150 + shift
            add(f'<text class="opening-text" x="{(x0 + x1) / 2:.0f}" y="{ty:.0f}">{text}</text>')
        else:
            y0, y1 = fy(w["y0"] + a1), fy(w["y0"] + a0)  # svg: y0 is the northern end
            add(f'<rect class="gap" x="{w["x0"] - 25:.0f}" y="{y0:.0f}" '
                f'width="{w["x1"] - w["x0"] + 50:.0f}" height="{y1 - y0:.0f}"/>')
            line(w["x0"] - 15, y0, w["x1"] + 15, y0, "jamb")
            line(w["x0"] - 15, y1, w["x1"] + 15, y1, "jamb")
            xm = (w["x0"] + w["x1"]) / 2
            if o["kind"] == "window":
                line(xm - 40, y0, xm - 40, y1, "glass")
                line(xm + 40, y0, xm + 40, y1, "glass")
            elif o.get("slide"):
                slide_symbol(w, o, a0, a1)
            elif o["kind"] == "door" and o.get("leaf", True):
                line(xm, y0, xm, y1, "door-line")
            east = xm < mid_x
            shift = 60 if o.get("slide") and o["slide"]["face"] == ("E" if east else "W") else 0
            tx = w["x1"] + 150 + shift if east else w["x0"] - 70 - shift
            ty = (y0 + y1) / 2
            add(f'<text class="opening-text" x="{tx:.0f}" y="{ty:.0f}" '
                f'transform="rotate(-90 {tx:.0f} {ty:.0f})">{text}</text>')
    add("</g>")

    # ---- stairs: steps as lines and the walking line with its arrow pointing up
    add('<g id="stairs">')
    for s in model.STAIRS:
        on_floor = ("KG" if s["z0"] < 0 else "EG")
        if on_floor != floor:
            continue
        dx, dy = {"+x": (1, 0), "-x": (-1, 0), "+y": (0, 1), "-y": (0, -1)}[s["direction"]]
        length = s["steps"] * s["run"]
        if dx:
            x0 = s["x0"] if dx > 0 else s["x0"] - length
            box = (x0, s["y0"], x0 + length, s["y0"] + s["width"])
        else:
            y0 = s["y0"] if dy > 0 else s["y0"] - length
            box = (s["x0"], y0, s["x0"] + s["width"], y0 + length)
        rect(box[0], box[1], box[2], box[3], "stair")
        for i in range(1, s["steps"]):
            if dx:
                x = box[0] + i * s["run"]
                line(x, fy(box[1]), x, fy(box[3]), "stair")
            else:
                y = box[1] + i * s["run"]
                line(box[0], fy(y), box[2], fy(y), "stair")
        # walking line from the middle of the first step to the top, in svg coordinates
        if dx:
            ly = fy(s["y0"] + s["width"] / 2)
            lx0 = s["x0"] + dx * s["run"] / 2
            lx1 = s["x0"] + dx * length
            line(lx0, ly, lx1 - dx * 180, ly, "stair-run")
            add(f'<path class="stair-arrow" d="M {lx1:.0f} {ly:.0f} l {-dx * 220:.0f} -90 '
                f'l 0 180 z"/>')
        else:
            lx = s["x0"] + s["width"] / 2
            ly0 = fy(s["y0"] + dy * s["run"] / 2)
            ly1 = fy(s["y0"] + dy * length)
            line(lx, ly0, lx, ly1 + dy * 180, "stair-run")
            add(f'<path class="stair-arrow" d="M {lx:.0f} {ly1:.0f} l -90 {dy * 220:.0f} '
                f'l 180 0 z"/>')
    add("</g>")

    # ---- room stamps on top, with a halo so they stay readable over stairs
    add('<g id="room-labels">')
    out.extend(labels)
    add("</g>")

    # ---- dimension chains on all four sides: openings, walls, overall - like a paper plan
    add('<g id="dimensions">')
    band = t_out + 200     # how far into the house a wall may start and still meet the facade

    stair_boxes = []
    for s in model.STAIRS:
        if ("KG" if s["z0"] < 0 else "EG") != floor:
            continue
        length = s["steps"] * s["run"]
        sx0, sy0 = s["x0"], s["y0"]
        if s["direction"] in ("+x", "-x"):
            bx = sx0 if s["direction"] == "+x" else sx0 - length
            stair_boxes.append((bx, sy0, bx + length, sy0 + s["width"]))
        else:
            by = sy0 if s["direction"] == "+y" else sy0 - length
            stair_boxes.append((sx0, by, sx0 + s["width"], by + length))

    def chain_points(side: str) -> tuple[list[float], list[float], list[float], list[float]]:
        horizontal = side in ("S", "N")
        lo, hi = (bx0, bx1) if horizontal else (by0, by1)
        edge = {"S": by0, "N": by1, "W": bx0, "E": bx1}[side]

        def near(w, dist: float) -> bool:
            """does the wall reach within dist of this facade"""
            if side == "S":
                return w["y0"] <= edge + dist
            if side == "N":
                return w["y1"] >= edge - dist
            if side == "W":
                return w["x0"] <= edge + dist
            return w["x1"] >= edge - dist

        def span(w) -> tuple[float, float]:
            return (w["x0"], w["x1"]) if horizontal else (w["y0"], w["y1"])

        rooms_pts = [lo, hi]
        for w in walls:
            if along_x(w) != horizontal and near(w, band):
                rooms_pts.extend(span(w))
        open_pts = list(rooms_pts)
        for w in walls:
            if along_x(w) == horizontal and near(w, t_out):
                open_pts.extend(span(w))
                start = w["x0"] if horizontal else w["y0"]
                for o in model.OPENINGS:
                    if o["floor"] == floor and o["wall"] == w["name"]:
                        open_pts.extend((start + o["a0"], start + o["a0"] + o["width"]))
        # every edge of every wall and stair, so no clear width or wall thickness is missing
        detail_pts = list(rooms_pts)
        for w in walls:
            detail_pts.extend(span(w))
        for x0, y0, x1, y1 in stair_boxes:
            detail_pts.extend((x0, x1) if horizontal else (y0, y1))
        detail_pts = [p for p in detail_pts if lo <= p <= hi]
        return merge_points(open_pts), merge_points(rooms_pts), merge_points(detail_pts), [lo, hi]

    def draw_chain(side: str, level: int, pts: list[float], min_label: float = 0) -> None:
        if side == "S":
            pos = fy(by0) + CHAIN_GAP + level * CHAIN_STEP
        elif side == "N":
            pos = fy(by1) - CHAIN_GAP - level * CHAIN_STEP
        elif side == "W":
            pos = bx0 - CHAIN_GAP - level * CHAIN_STEP
        else:
            pos = bx1 + CHAIN_GAP + level * CHAIN_STEP
        if side in ("S", "N"):
            line(pts[0] - 150, pos, pts[-1] + 150, pos, "dim")
            for p in pts:
                line(p - 60, pos + 60, p + 60, pos - 60, "dim-tick")
            for a, b in zip(pts, pts[1:]):
                if b - a < min_label:
                    continue
                small = ' small' if b - a < 600 else ''
                add(f'<text class="dim-text{small}" x="{(a + b) / 2:.0f}" y="{pos - 50:.0f}">'
                    f'{cm(b - a)}</text>')
        else:
            line(pos, fy(pts[0]) + 150, pos, fy(pts[-1]) - 150, "dim")
            for p in pts:
                line(pos - 60, fy(p) + 60, pos + 60, fy(p) - 60, "dim-tick")
            for a, b in zip(pts, pts[1:]):
                if b - a < min_label:
                    continue
                small = ' small' if b - a < 600 else ''
                tx = pos - 50
                ty = fy((a + b) / 2)
                add(f'<text class="dim-text{small}" x="{tx:.0f}" y="{ty:.0f}" '
                    f'transform="rotate(-90 {tx:.0f} {ty:.0f})">{cm(b - a)}</text>')

    if walls:
        for side in ("S", "N", "W", "E"):
            openings_c, rooms_c, detail_c, total_c = chain_points(side)
            level = 0
            for pts in (openings_c, rooms_c):
                # a chain that shows nothing new is left out
                if len(pts) > 2 and (pts is rooms_c or pts != rooms_c):
                    draw_chain(side, level, pts)
                    level += 1
            # all wall edges and stairs; segments too short for their text stay unlabelled
            if len(detail_c) > 2 and detail_c not in (openings_c, rooms_c):
                draw_chain(side, level, detail_c, 150)
                level += 1
            draw_chain(side, level, total_c)
    add("</g>")

    # ---- north arrow (top right), scale bar and legend (bottom left)
    nx, ny = vx1 - 450, vy0 + 200
    add(f'<g id="north"><path class="north" d="M {nx:.0f} {ny:.0f} l 150 380 l -150 -120 l -150 120 z"/>'
        f'<text class="north-text" x="{nx:.0f}" y="{ny + 650:.0f}">N</text></g>')
    sx, sy = vx0 + 150, vy1 - FOOT_ZONE + 400
    add(f'<g id="scale"><line class="scale" x1="{sx:.0f}" y1="{sy:.0f}" x2="{sx + 5000:.0f}" y2="{sy:.0f}"/>')
    for i in range(6):
        add(f'<line class="scale" x1="{sx + i * 1000:.0f}" y1="{sy - 70:.0f}" '
            f'x2="{sx + i * 1000:.0f}" y2="{sy + 70:.0f}"/>')
    add(f'<text class="scale-text" x="{sx + 2500:.0f}" y="{sy + 280:.0f}">5 m</text></g>')
    add(f'<text class="legend" x="{sx + 5500:.0f}" y="{sy + 50:.0f}">{escape(LEGEND)}</text>')

    # ---- title
    add(f'<text class="title" x="{vx0 + 150:.0f}" y="{vy0 + 450:.0f}">{FLOOR_LABEL[floor]}</text>')
    add(f'<text class="subtitle" x="{vx0 + 150:.0f}" y="{vy0 + 780:.0f}">'
        f'{VARIANT_LABEL[variant]} · Modell v{version} · Schlesierstraße 31</text>')
    add("</svg>")
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--variant", choices=[*hausdatei.VARIANTS, "both"], default="both",
                    help="both = every variant with a house file")
    ap.add_argument("--floors", default="KG,EG,OG")
    args = ap.parse_args()

    variants = hausdatei.present() if args.variant == "both" else [args.variant]
    floors = [f.strip() for f in args.floors.split(",") if f.strip()]
    PLANS.mkdir(parents=True, exist_ok=True)
    for variant in variants:
        model = hausdatei.module(variant)
        rooms_path = DATA / f"rooms-{variant}.json"
        if not rooms_path.exists():
            print(f"{variant}: rooms-{variant}.json missing - run build_rooms.py first")
            continue
        rooms_doc = json.loads(rooms_path.read_text(encoding="utf-8"))
        version = str(model.SOURCE["version"])
        for floor in floors:
            svg = build_floor(model, rooms_doc, variant, floor, version)
            out = PLANS / f"{variant}-{floor}.svg"
            out.write_text(svg, encoding="utf-8")
            print(f"{out}: {out.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
