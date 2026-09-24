"""Reads the house file (public/models/haus-<variant>.json) - the one source of the model.

Format reno-haus/1, documented for humans and other tools in ANLEITUNG-EXTERN.md. The app
builds the 3D scene, the rooms and the plans from the same file (src/modules/modelBuild),
so this module only has to hand the data to the existing Python scripts under the names
they have always used: haus_model.py and haus_model_soll.py are thin wrappers around
load(), rooms_ist.py and rooms_soll.py around rooms().

    python3 tools/model/hausdatei.py --format ist    # rewrite the file in canonical layout

The canonical layout (format_source) is the one the app writes on export as well - short
objects on one line, longer ones broken up - so a file round-trips without a diff.
"""
from __future__ import annotations

import json
import math
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
MODELS = HERE.parents[1] / "public" / "models"
FORMAT = "reno-haus/1"
LINE = 140


def path_of(variant: str) -> pathlib.Path:
    return MODELS / f"haus-{variant}.json"


def read(variant: str) -> dict:
    doc = json.loads(path_of(variant).read_text(encoding="utf-8"))
    if doc.get("format") != FORMAT:
        raise SystemExit(f"{path_of(variant)}: format {doc.get('format')!r}, erwartet {FORMAT!r}")
    return doc


def along_x(w: dict) -> bool:
    """A wall runs along its longer side; a square one counts as east-west."""
    return (w["x1"] - w["x0"]) >= (w["y1"] - w["y0"])


def load(variant: str) -> dict:
    """The house file as the names the scripts of tools/model expect (see haus_model.py)."""
    doc = read(variant)
    p = doc["params"]
    ns: dict = {}
    ns["SOURCE"] = doc
    ns["HOUSE_W"], ns["HOUSE_D"] = p["houseW"], p["houseD"]
    ns["T_OUT"], ns["SLAB"], ns["STOREY"] = p["tOut"], p["slab"], p["storey"]
    ns["KNIESTOCK"], ns["ROOF_PITCH"] = p["kniestock"], p["roofPitch"]
    ns["ROOF_OVERHANG"], ns["ROOF_T"], ns["OG_CEIL"] = p["roofOverhang"], p["roofT"], p["ogCeil"]
    ns["Y_VOR"] = p["yVor"]
    ns["Z_KG"], ns["Z_EG"], ns["Z_OG"] = -p["storey"], 0, p["storey"]
    ns["ENVELOPE"] = (0, p["yVor"], p["houseW"], p["houseD"])

    walls, openings = [], []
    for w in doc["walls"]:
        walls.append(dict(floor=w["floor"], name=w["name"], x0=w["x0"], y0=w["y0"],
                          x1=w["x1"], y1=w["y1"], tag=w.get("tag", "A"), id=w["id"],
                          tragend=w.get("tragend")))
        start = w["x0"] if along_x(w) else w["y0"]
        for o in w.get("openings", []):
            openings.append(dict(floor=w["floor"], wall=w["name"],
                                 kind="loggia" if o["kind"] == "passage" else o["kind"],
                                 a0=o["from"] - start, width=o["to"] - o["from"],
                                 sill=o.get("sill", 0), height=o.get("height", 0),
                                 tag=o.get("tag", "C")))
    ns["WALLS"], ns["OPENINGS"] = walls, openings

    ns["STAIRS"] = [dict(s) for s in doc.get("stairs", [])]
    ns["LANDINGS"] = [dict(s) for s in doc.get("landings", [])]
    ns["SLAB_OPENINGS"] = {k: tuple(v) for k, v in doc.get("slabOpenings", {}).items()}
    ns["SLAB_EXTRAS"] = [dict(s) for s in doc.get("slabExtras", [])]
    ns["LOGGIA_PARAPETS"] = [dict(s) for s in doc.get("loggiaParapets", [])]
    g = doc["gaube"]
    ns["GAUBE"] = dict(x0=g["x0"], x1=g["x1"], depth=g["depth"], wall_h=g["wallH"],
                       windows=[tuple(x) for x in g["windows"]], cheek=tuple(g["cheek"]),
                       tag=g.get("tag", "B"))
    ns["BALKON"] = dict(doc["balkon"])
    gar = doc["garage"]
    ns["GAR_X"], ns["GAR_Y"] = tuple(gar["x"]), tuple(gar["y"])
    ns["GAR_Z0"], ns["GAR_H_FRONT"], ns["GAR_H_BACK"] = gar["z0"], gar["hFront"], gar["hBack"]

    ns["FLOORS"] = {
        "KG": dict(z0=ns["Z_KG"], h=p["storey"] - p["slab"]),
        "EG": dict(z0=0, h=p["storey"] - p["slab"]),
        "OG": dict(z0=ns["Z_OG"], h=p["kniestock"]),
        "GAR": dict(z0=gar["z0"], h=gar["hBack"]),
    }

    def tan_roof():
        return math.tan(math.radians(ns["ROOF_PITCH"]))

    def roof_z_under(y):
        """Unterkante Sparren bei y (Traufpunkt an Innenkante Außenwand)."""
        eave = ns["Z_OG"] + ns["KNIESTOCK"]
        d = min(y, ns["HOUSE_D"] - y) - ns["T_OUT"]
        return eave + tan_roof() * d

    def wall_height(w):
        if w["floor"] == "OG":
            if w["name"].startswith(("Außenwand Süd", "Außenwand Nord")):
                return ns["KNIESTOCK"]
            return None
        if w["floor"] == "GAR":
            return None
        return ns["FLOORS"][w["floor"]]["h"]

    def og_wall_profile(w, step=200):
        z0, ztop = ns["Z_OG"], ns["OG_CEIL"]
        if (w["y1"] - w["y0"]) > (w["x1"] - w["x0"]):
            ys = list(range(int(w["y0"]), int(w["y1"]), step)) + [w["y1"]]
            pts = [(w["y0"], z0), (w["y1"], z0)]
            for y in reversed(ys):
                pts.append((y, min(roof_z_under(y), ztop)))
            return "y", pts
        ymid = (w["y0"] + w["y1"]) / 2
        zt = min(roof_z_under(ymid), ztop)
        return "x", [(w["x0"], z0), (w["x1"], z0), (w["x1"], zt), (w["x0"], zt)]

    def garage_roof_z(y):
        t = (y - ns["GAR_Y"][0]) / (ns["GAR_Y"][1] - ns["GAR_Y"][0])
        return ns["GAR_Z0"] + ns["GAR_H_FRONT"] + (ns["GAR_H_BACK"] - ns["GAR_H_FRONT"]) * t

    ns.update(tan_roof=tan_roof, roof_z_under=roof_z_under, wall_height=wall_height,
              og_wall_profile=og_wall_profile, garage_roof_z=garage_roof_z)
    return ns


def rooms(variant: str) -> list:
    """Rooms as (id, name, floor, [rects]) - the shape rooms_ist.py always had."""
    return [(r["id"], r["name"], r["floor"], [tuple(x) for x in r["rects"]])
            for r in read(variant)["rooms"]]


# ------------------------------------------------------------------------------ layout
def _compact(v) -> str:
    if isinstance(v, dict):
        return "{" + ", ".join(f"{json.dumps(k, ensure_ascii=False)}: {_compact(x)}"
                               for k, x in v.items()) + "}"
    if isinstance(v, list):
        return "[" + ", ".join(_compact(x) for x in v) + "]"
    return json.dumps(v, ensure_ascii=False)


def _scalar(v) -> bool:
    return not isinstance(v, (dict, list)) or not v


def _layout(v, indent: int) -> str:
    """Short values on one line; a record of plain values always on one line, however long
    (one wall, one opening, one room per line reads and diffs best); in a record that also
    holds lists, the plain values lead on one line and each list follows on its own."""
    flat = _compact(v)
    if _scalar(v) or (indent > 0 and indent + len(flat) <= LINE):
        return flat
    pad = " " * (indent + 2)
    end = "\n" + " " * indent
    if isinstance(v, list):
        return "[\n" + ",\n".join(pad + _layout(x, indent + 2) for x in v) + end + "]"
    if indent > 0 and all(_scalar(x) for x in v.values()):
        return flat
    lines = []
    head = [f"{json.dumps(k, ensure_ascii=False)}: {_compact(x)}" for k, x in v.items() if _scalar(x)]
    if indent == 0:
        lines = [pad + h for h in head]
    elif head:
        lines = [pad + ", ".join(head)]
    lines += [f"{pad}{json.dumps(k, ensure_ascii=False)}: {_layout(x, indent + 2)}"
              for k, x in v.items() if not _scalar(x)]
    return "{\n" + ",\n".join(lines) + end + "}"


def format_source(doc: dict) -> str:
    """Canonical text of a house file; identical to formatSource in the app."""
    return _layout(doc, 0) + "\n"


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--format":
        target = path_of(sys.argv[2])
        target.write_text(format_source(read(sys.argv[2])), encoding="utf-8")
        print(f"{target}: neu formatiert")
    else:
        print(__doc__)
