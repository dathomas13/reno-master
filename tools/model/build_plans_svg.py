#!/usr/bin/env python3
"""Generate 2D floor plans as SVG from the model data base.

One file per floor and variant, e.g. plans/ist-EG.svg next to the house file (see
hausdatei.py for the directory). The app draws the same SVG in
src/modules/modelBuild/plansSvg.ts. The SVG uses the model
coordinate system in mm (y flipped so north is up) and carries data-room-id on every
room area, so the app can make rooms tappable in the plan just like in the 3D view.

    python3 tools/model/build_plans_svg.py                # both variants, KG/EG/OG
    python3 tools/model/build_plans_svg.py --variant ist --floors EG

Colours follow the 3D viewer: wall confidence A/B/C, windows blue, doors green,
open passages light. Add class="light" on the root <svg> for the print/light version.
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
from hausdatei import DATA, PLANS  # noqa: E402

MARGIN = 1100                      # mm left/right/top of the building
MARGIN_BOTTOM = 2100               # mm below (dimension chain + scale bar)
FLOOR_LABEL = {"KG": "Kellergeschoss", "EG": "Erdgeschoss", "OG": "Obergeschoss"}
VARIANT_LABEL = {"ist": "Bestand", "soll": "Zielzustand"}
TAG_FILL = {"A": "var(--wall-a)", "B": "var(--wall-b)", "C": "var(--wall-c)"}

STYLE = """
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
"""


def build_floor(model, rooms_doc, variant: str, floor: str, version: str) -> str:
    W, D = model.HOUSE_W, model.HOUSE_D
    out: list[str] = []
    add = out.append

    def fy(y: float) -> float:
        """model y (north positive) -> svg y (north up)"""
        return D - y

    def rect(x0, y0, x1, y1, cls, extra=""):
        add(f'<rect class="{cls}" x="{x0:.0f}" y="{fy(y1):.0f}" '
            f'width="{x1 - x0:.0f}" height="{y1 - y0:.0f}"{extra}/>')

    vb = f"{-MARGIN} {-MARGIN} {W + 2 * MARGIN} {D + MARGIN + MARGIN_BOTTOM}"
    add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" '
        f'data-variant="{variant}" data-floor="{floor}" data-version="{version}" '
        f'role="img" aria-label="{FLOOR_LABEL[floor]} {VARIANT_LABEL[variant]}">')
    add(f"<style>{STYLE}</style>")
    add(f'<rect x="{-MARGIN}" y="{-MARGIN}" width="{W + 2 * MARGIN}" '
        f'height="{D + MARGIN + MARGIN_BOTTOM}" fill="var(--bg)"/>')

    # ---- rooms (areas below the walls, labels on top of everything)
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
        dy = 0 if show_area else size * 0.35
        labels.append(f'<text class="room-label" x="{cx:.0f}" y="{cy - dy:.0f}" '
                      f'font-size="{size}px"{fit}>{name}</text>')
        if show_area:
            labels.append(f'<text class="room-area" x="{cx:.0f}" y="{cy + 230:.0f}">'
                          f'{room["areaM2"]:.1f} m²</text>')
        add("</g>")
    add("</g>")

    # ---- walls
    add('<g id="walls">')
    walls = [w for w in model.WALLS if w["floor"] == floor]
    for w in walls:
        fill = TAG_FILL.get(w["tag"], "var(--wall-a)")
        rect(w["x0"], w["y0"], w["x1"], w["y1"], "wall",
             f' fill="{fill}" data-wall="{escape(w["name"], {chr(34): "&quot;"})}"')
    add("</g>")

    # ---- openings
    add('<g id="openings">')
    by_name = {w["name"]: w for w in walls}
    for o in model.OPENINGS:
        if o["floor"] != floor:
            continue
        w = by_name.get(o["wall"])
        if not w:
            continue
        cls = {"window": "window", "door": "door"}.get(o["kind"], "open")
        along = (w["x1"] - w["x0"]) >= (w["y1"] - w["y0"])
        if along:
            rect(w["x0"] + o["a0"], w["y0"], w["x0"] + o["a0"] + o["width"], w["y1"], cls)
        else:
            rect(w["x0"], w["y0"] + o["a0"], w["x1"], w["y0"] + o["a0"] + o["width"], cls)
    add("</g>")

    # ---- stairs (steps as lines, like the printed plan)
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
                add(f'<line class="stair" x1="{x:.0f}" y1="{fy(box[1]):.0f}" x2="{x:.0f}" y2="{fy(box[3]):.0f}"/>')
            else:
                y = box[1] + i * s["run"]
                add(f'<line class="stair" x1="{box[0]:.0f}" y1="{fy(y):.0f}" x2="{box[2]:.0f}" y2="{fy(y):.0f}"/>')
    add("</g>")

    # ---- room labels on top, with a halo so they stay readable over stairs
    add('<g id="room-labels">')
    out.extend(labels)
    add("</g>")

    # ---- overall dimensions (south chain and west chain)
    off = 520
    add('<g id="dimensions">')
    y = fy(0) + off
    add(f'<line class="dim" x1="0" y1="{y}" x2="{W}" y2="{y}"/>')
    add(f'<line class="dim" x1="0" y1="{y - 90}" x2="0" y2="{y + 90}"/>')
    add(f'<line class="dim" x1="{W}" y1="{y - 90}" x2="{W}" y2="{y + 90}"/>')
    add(f'<text class="dim-text" x="{W / 2:.0f}" y="{y + 260}">{W / 1000:.2f} m</text>')
    x = -off
    add(f'<line class="dim" x1="{x}" y1="0" x2="{x}" y2="{D}"/>')
    add(f'<line class="dim" x1="{x - 90}" y1="0" x2="{x + 90}" y2="0"/>')
    add(f'<line class="dim" x1="{x - 90}" y1="{D}" x2="{x + 90}" y2="{D}"/>')
    add(f'<text class="dim-text" x="{x - 130}" y="{D / 2:.0f}" '
        f'transform="rotate(-90 {x - 130} {D / 2:.0f})">{D / 1000:.2f} m</text>')
    add("</g>")

    # ---- north arrow (top right) and scale bar (bottom left)
    nx, ny = W + 380, -380
    add(f'<g id="north"><path class="north" d="M {nx} {ny} l 150 380 l -150 -120 l -150 120 z"/>'
        f'<text class="north-text" x="{nx}" y="{ny + 700}">N</text></g>')
    sx, sy = 0, fy(0) + off + 640
    add(f'<g id="scale"><line class="dim" x1="{sx}" y1="{sy}" x2="{sx + 5000}" y2="{sy}"/>')
    for i in range(6):
        add(f'<line class="dim" x1="{sx + i * 1000}" y1="{sy - 70}" x2="{sx + i * 1000}" y2="{sy + 70}"/>')
    add(f'<text class="dim-text" x="{sx + 2500}" y="{sy + 280}">5 m</text></g>')

    # ---- title
    add(f'<text class="title" x="0" y="{-MARGIN + 480:.0f}">{FLOOR_LABEL[floor]}</text>')
    add(f'<text class="subtitle" x="0" y="{-MARGIN + 800:.0f}">'
        f'{VARIANT_LABEL[variant]} · Modell v{version} · Schlesierstraße 31</text>')
    add("</svg>")
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--variant", choices=["ist", "soll", "both"], default="both")
    ap.add_argument("--floors", default="KG,EG,OG")
    args = ap.parse_args()

    variants = ["ist", "soll"] if args.variant == "both" else [args.variant]
    floors = [f.strip() for f in args.floors.split(",") if f.strip()]
    PLANS.mkdir(parents=True, exist_ok=True)
    for variant in variants:
        model = importlib.import_module("haus_model" if variant == "ist" else "haus_model_soll")
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
