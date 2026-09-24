#!/usr/bin/env python3
"""Checks that the committed scenes are exactly what the house files produce.

    python3 tools/model/check_source.py

public/models/<variant>.json must be the scene build_scene_lite.py builds from
public/models/haus-<variant>.json, part by part and vertex by vertex. The app's own
builder (src/modules/modelBuild) is held to the same scene by its unit test, so the two
builders cannot drift apart unnoticed. Exits non-zero on the first mismatch.
"""
from __future__ import annotations

import importlib
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
MODELS = HERE.parents[1] / "public" / "models"
sys.path.insert(0, str(HERE))

import build_scene_lite  # noqa: E402


def main() -> int:
    bad = 0
    for variant in ("ist", "soll"):
        committed = json.loads((MODELS / f"{variant}.json").read_text(encoding="utf-8"))
        m = importlib.import_module("haus_model" if variant == "ist" else "haus_model_soll")
        meta = committed.get("meta", {})
        if meta.get("version") != m.SOURCE["version"]:
            print(f"{variant}: Szene v{meta.get('version')}, Hausdatei v{m.SOURCE['version']}")
            bad += 1
        built = build_scene_lite.build(m, variant, meta.get("version", ""), meta.get("note", ""))
        if built["prims"] != committed["prims"]:
            names = [(a["name"], b["name"]) for a, b in zip(built["prims"], committed["prims"]) if a != b]
            print(f"{variant}: die Szene passt nicht zur Hausdatei "
                  f"({len(built['prims'])} statt {len(committed['prims'])} Bauteile, "
                  f"erste Abweichung: {names[:1]}) - build_scene_lite.py laufen lassen")
            bad += 1
        else:
            print(f"{variant}: Szene v{meta.get('version')} passt zur Hausdatei")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
