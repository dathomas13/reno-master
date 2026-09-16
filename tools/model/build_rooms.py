#!/usr/bin/env python3
"""Build public/models/rooms-<variant>.json from the room tables and sanity-check them.

Checks performed (all mm):
  * a room must not be crossed by a wall of the same floor (overlap area > TOL_AREA).
    Open passages ("loggia" openings) are cut out of the wall first: a niche such as the
    EG Garderobe reaches into the wall zone and is not an error.
  * rooms of the same floor must not overlap each other
  * a room must lie inside the building envelope (garage excluded). The envelope comes
    from the model as ENVELOPE, because the loggia wall panels project south of y = 0.

Usage:
    python3 tools/model/build_rooms.py                 # both variants
    python3 tools/model/build_rooms.py --variant ist
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[1]
MODELS = REPO / "public" / "models"
sys.path.insert(0, str(HERE))

TOL = 2                 # mm - rooms may touch wall faces
TOL_AREA = 0.02         # m² - ignore slivers below this


def rect_overlap_area(a, b) -> float:
    """Overlap area of two (x0, y0, x1, y1) rectangles in m²."""
    dx = min(a[2], b[2]) - max(a[0], b[0]) - 2 * TOL
    dy = min(a[3], b[3]) - max(a[1], b[1]) - 2 * TOL
    if dx <= 0 or dy <= 0:
        return 0.0
    return dx * dy / 1e6


def wall_pieces(wall, openings):
    """The wall rectangle split by its open passages, as (x0, y0, x1, y1) pieces.

    Only openings of kind "loggia" count: those are open from the floor up over the full
    height, so a room may legitimately reach into them. A door or a window leaves the
    wall standing at floor level and must still be reported.
    """
    along = (wall["x1"] - wall["x0"]) >= (wall["y1"] - wall["y0"])
    a0, a1 = (wall["x0"], wall["x1"]) if along else (wall["y0"], wall["y1"])
    parts = [(a0, a1)]
    for o in openings:
        if o["kind"] != "loggia":
            continue
        c0, c1 = a0 + o["a0"], a0 + o["a0"] + o["width"]
        rest = []
        for p0, p1 in parts:
            if c1 <= p0 or c0 >= p1:
                rest.append((p0, p1))
                continue
            if p0 < c0:
                rest.append((p0, c0))
            if c1 < p1:
                rest.append((c1, p1))
        parts = rest
    if along:
        return [(p0, wall["y0"], p1, wall["y1"]) for p0, p1 in parts]
    return [(wall["x0"], p0, wall["x1"], p1) for p0, p1 in parts]


def build(variant: str) -> dict:
    rooms_mod = importlib.import_module("rooms_ist" if variant == "ist" else "rooms_soll")
    model_mod = importlib.import_module("haus_model" if variant == "ist" else "haus_model_soll")
    rooms = rooms_mod.ROOMS

    problems: list[str] = []
    seen: set[str] = set()
    for rid, name, floor, rects in rooms:
        if rid in seen:
            problems.append(f"duplicate room id {rid}")
        seen.add(rid)
        if not rects:
            problems.append(f"{rid}: no rectangles")
        for x0, y0, x1, y1 in rects:
            if x1 <= x0 or y1 <= y0:
                problems.append(f"{rid}: empty rectangle {(x0, y0, x1, y1)}")
            ex0, ey0, ex1, ey1 = getattr(model_mod, "ENVELOPE",
                                         (0, 0, model_mod.HOUSE_W, model_mod.HOUSE_D))
            if floor != "GAR" and not (ex0 <= x0 < x1 <= ex1 and ey0 <= y0 < y1 <= ey1):
                problems.append(f"{rid}: rectangle {(x0, y0, x1, y1)} outside the building envelope")

    for rid, name, floor, rects in rooms:
        for rect in rects:
            for w in model_mod.WALLS:
                if w["floor"] != floor:
                    continue
                openings = [o for o in model_mod.OPENINGS
                            if (o["floor"], o["wall"]) == (w["floor"], w["name"])]
                a = sum(rect_overlap_area(rect, piece) for piece in wall_pieces(w, openings))
                if a > TOL_AREA:
                    problems.append(f"{rid} ({name}): wall {w['name']!r} cuts through it ({a:.2f} m²)")
            for other_id, _, other_floor, other_rects in rooms:
                if other_id <= rid or other_floor != floor:
                    continue
                for other_rect in other_rects:
                    a = rect_overlap_area(rect, other_rect)
                    if a > TOL_AREA:
                        problems.append(f"{rid} overlaps {other_id} ({a:.2f} m²)")

    out_rooms = []
    for rid, name, floor, rects in rooms:
        out_rooms.append({
            "id": rid,
            "name": name,
            "floor": floor,
            "rects": [list(r) for r in rects],
            "areaM2": round(sum((x1 - x0) * (y1 - y0) for x0, y0, x1, y1 in rects) / 1e6, 2),
        })

    doc = {
        "variant": variant,
        # the date of the scene these rooms belong to, not today's: the CI guard
        # regenerates this file and compares it with the committed one, so the output has
        # to depend only on the inputs. With the clock in it, the same commit passed today
        # and failed tomorrow.
        "generatedAt": scene_date(variant),
        "rooms": out_rooms,
    }
    if problems:
        print(f"--- {variant}: {len(problems)} Hinweise ---")
        for p in problems:
            print("  " + p)
    else:
        print(f"--- {variant}: alle Räume konsistent ---")
    return doc


def scene_date(variant: str) -> str:
    """The generation date of the scene, or today when there is no scene yet."""
    path = MODELS / f"{variant}.json"
    if path.exists():
        meta = json.loads(path.read_text(encoding="utf-8")).get("meta", {})
        date = meta.get("generatedAt")
        if isinstance(date, str) and date:
            return date
    return dt.date.today().isoformat()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--variant", choices=["ist", "soll", "both"], default="both")
    args = ap.parse_args()

    variants = ["ist", "soll"] if args.variant == "both" else [args.variant]
    for variant in variants:
        try:
            doc = build(variant)
        except ModuleNotFoundError as exc:
            print(f"{variant}: skipped ({exc.name} not found)")
            continue
        out = MODELS / f"rooms-{variant}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        total = sum(r["areaM2"] for r in doc["rooms"])
        print(f"{out.relative_to(REPO)}: {len(doc['rooms'])} Räume, {total:.0f} m² gesamt")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
