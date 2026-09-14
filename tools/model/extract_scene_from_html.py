#!/usr/bin/env python3
"""Extract the embedded scene JSON from a generated Haus_3D.html into public/models/<variant>.json.

This is the dependency-free fallback for `build_scene.py`, which needs CadQuery/OCP (~150 MB).
Use it when you only want to publish an already generated viewer scene to the app.

    python3 tools/model/extract_scene_from_html.py --html Haus_3D.html --variant ist --version 0.22

The output format is documented in tools/model/README-MODELL.md.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
MODELS = REPO / "public" / "models"
KINDS = {"wall", "slab", "roof", "glass", "door", "stair", "rail"}
LAYERS = {"KG", "EG", "OG", "DACH", "GAR"}


def extract(html: str) -> dict:
    start = html.find("const SCENE =")
    if start < 0:
        raise SystemExit("no 'const SCENE =' found - is this a viewer HTML built by build_all.sh?")
    start = html.index("{", start)
    depth, in_str, esc, end = 0, False, False, None
    for i in range(start, len(html)):
        c = html[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end is None:
        raise SystemExit("unterminated SCENE object literal")
    return json.loads(html[start:end])


def validate(scene: dict) -> list[str]:
    problems: list[str] = []
    prims = scene.get("prims")
    if not isinstance(prims, list) or not prims:
        return ["scene has no prims"]
    for i, p in enumerate(prims):
        where = f"prims[{i}] ({p.get('name', '?')})"
        if p.get("layer") not in LAYERS:
            problems.append(f"{where}: unknown layer {p.get('layer')!r}")
        if p.get("kind") not in KINDS:
            problems.append(f"{where}: unknown kind {p.get('kind')!r}")
        if p.get("tag") not in {"A", "B", "C"}:
            problems.append(f"{where}: unknown tag {p.get('tag')!r}")
        v, t, bb = p.get("v"), p.get("t"), p.get("bb")
        if not isinstance(v, list) or len(v) % 3:
            problems.append(f"{where}: vertex list not a multiple of 3")
        if not isinstance(t, list) or len(t) % 3:
            problems.append(f"{where}: index list not a multiple of 3")
        elif v and max(t) * 3 + 2 >= len(v):
            problems.append(f"{where}: triangle index out of range")
        if not isinstance(bb, list) or len(bb) != 6:
            problems.append(f"{where}: bb must have 6 numbers")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--html", default="Haus_3D.html", help="viewer HTML containing the embedded scene")
    ap.add_argument("--variant", default="ist", choices=["ist", "soll"])
    ap.add_argument("--version", default="0.22", help="model version written into meta and manifest")
    ap.add_argument("--note", default="", help="short note shown in the app")
    ap.add_argument("--out", default=None, help="output path (default public/models/<variant>.json)")
    args = ap.parse_args()

    html_path = pathlib.Path(args.html)
    if not html_path.is_absolute():
        for base in (pathlib.Path.cwd(), REPO / "tools" / "model", REPO):
            if (base / args.html).exists():
                html_path = base / args.html
                break
    if not html_path.exists():
        raise SystemExit(f"not found: {args.html}")

    scene = extract(html_path.read_text(encoding="utf-8", errors="replace"))
    problems = validate(scene)
    if problems:
        print("SCENE PROBLEMS:", file=sys.stderr)
        for p in problems[:20]:
            print("  " + p, file=sys.stderr)
        return 1

    meta = dict(scene.get("meta") or {})
    meta.update(
        variant=args.variant,
        version=args.version,
        generatedAt=dt.date.today().isoformat(),
        note=args.note or meta.get("note", ""),
        source=html_path.name,
    )
    scene["meta"] = meta

    out = pathlib.Path(args.out) if args.out else MODELS / f"{args.variant}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(scene, separators=(",", ":")), encoding="utf-8")

    tris = sum(len(p["t"]) // 3 for p in scene["prims"])
    print(f"{out.relative_to(REPO)}: {len(scene['prims'])} parts, {tris} triangles, {out.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
