#!/usr/bin/env python3
"""Write public/models/manifest.json from the meta blocks of ist.json / soll.json.

The app reads the manifest to show the model version ("Ist v0.22 · 13.09.2026") and to
decide which files to load. Run this after every model rebuild.
"""
from __future__ import annotations

import json
import pathlib

REPO = pathlib.Path(__file__).resolve().parents[2]
MODELS = REPO / "public" / "models"


def main() -> int:
    manifest: dict[str, dict] = {}
    for variant in ("ist", "soll"):
        path = MODELS / f"{variant}.json"
        if not path.exists():
            print(f"missing {path.relative_to(REPO)} - skipped")
            continue
        meta = json.loads(path.read_text(encoding="utf-8")).get("meta", {})
        rooms = MODELS / f"rooms-{variant}.json"
        manifest[variant] = {
            "file": path.name,
            "rooms": rooms.name if rooms.exists() else None,
            "version": meta.get("version", "0"),
            "updatedAt": meta.get("generatedAt", ""),
            "note": meta.get("note", ""),
            "bytes": path.stat().st_size,
        }
    out = MODELS / "manifest.json"
    out.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{out.relative_to(REPO)}: " + ", ".join(f"{k} v{v['version']}" for k, v in manifest.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
