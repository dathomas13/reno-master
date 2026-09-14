import json, math, pprint
import haus_model as m

# ------------------------------------------------------------- Daten für FreeCAD-Skript einbetten
walls = []
for w in m.WALLS:
    h = m.wall_height(w)
    f = m.FLOORS[w["floor"]]
    entry = dict(floor=w["floor"], name=w["name"], x0=w["x0"], y0=w["y0"], x1=w["x1"], y1=w["y1"], tag=w["tag"], z0=f["z0"])
    if h is not None:
        entry["h"] = h
    elif w["floor"] == "OG":
        axis, pts = m.og_wall_profile(w)
        entry["profile"] = dict(axis=axis, pts=pts)
    elif w["floor"] == "GAR":
        entry["h"] = round(m.garage_roof_z((w["y0"] + w["y1"]) / 2) - m.GAR_Z0)
    walls.append(entry)

t = m.tan_roof(); ov = m.ROOF_OVERHANG
dz_t = m.ROOF_T / math.cos(math.radians(m.ROOF_PITCH))
ry = m.HOUSE_D / 2
roof_profile = [(-ov, m.roof_z_under(-ov)), (ry, m.roof_z_under(ry)), (m.HOUSE_D + ov, m.roof_z_under(m.HOUSE_D + ov)),
                (m.HOUSE_D + ov, m.roof_z_under(m.HOUSE_D + ov) + dz_t), (ry, m.roof_z_under(ry) + dz_t), (-ov, m.roof_z_under(-ov) + dz_t)]
gpts = [(m.GAR_Y[0] - 300, m.garage_roof_z(m.GAR_Y[0] - 300)), (m.GAR_Y[1] + 300, m.garage_roof_z(m.GAR_Y[1] + 300)),
        (m.GAR_Y[1] + 300, m.garage_roof_z(m.GAR_Y[1] + 300) + 220), (m.GAR_Y[0] - 300, m.garage_roof_z(m.GAR_Y[0] - 300) + 220)]

DATA = dict(walls=walls, openings=m.OPENINGS, roof_profile=roof_profile, roof_x=(0, m.HOUSE_W),
            garage_roof=dict(profile=gpts, x=(m.GAR_X[0] - 300, 0)),
            slabs=[dict(name="Bodenplatte KG", x0=0, y0=0, z0=m.Z_KG - 200, dx=m.HOUSE_W, dy=m.HOUSE_D, dz=200, floor="KG"),
                   dict(name="Decke über KG", x0=0, y0=0, z0=-m.SLAB, dx=m.HOUSE_W, dy=m.HOUSE_D, dz=m.SLAB, floor="EG"),
                   dict(name="Decke über EG", x0=0, y0=0, z0=m.Z_OG - m.SLAB, dx=m.HOUSE_W, dy=m.HOUSE_D, dz=m.SLAB, floor="OG"),
                   dict(name="Garagenboden", x0=m.GAR_X[0], y0=m.GAR_Y[0], z0=m.GAR_Z0 - 160, dx=m.GAR_X[1]-m.GAR_X[0], dy=m.GAR_Y[1]-m.GAR_Y[0], dz=160, floor="GAR")],
            gaube=dict(x0=m.GAUBE["x0"], x1=m.GAUBE["x1"], depth=m.GAUBE["depth"], wall_h=m.GAUBE["wall_h"], z0=m.Z_OG,
                       kniestock=m.KNIESTOCK, windows=m.GAUBE["windows"]),
            balkon=m.BALKON, loggia_parapets=m.LOGGIA_PARAPETS, slab_openings=m.SLAB_OPENINGS, stairs=m.STAIRS, landings=m.LANDINGS, z_dg=m.Z_OG, dg_ceil=m.OG_CEIL,
            floors=dict(KG=m.Z_KG, EG=m.Z_EG, OG=m.Z_OG, GAR=m.GAR_Z0))

FREECAD = '''# -*- coding: utf-8 -*-
"""
Haus Tirschenreuth – FreeCAD BIM-Modell v0.1 (generiert)
Ausführen in FreeCAD 1.0:  Makro > Makros... > Ausführen   oder  in der Python-Konsole: exec(open(r"PFAD").read())
Erzeugt Arch-Wände (parametrisch: Length/Width/Height/Placement editierbar), Fenster/Türen als Arch-Window
(mit Host-Wand, Öffnung wird automatisch ausgeschnitten), Decken, Dach, Gaube, Garage – gruppiert nach Geschoss.
Koordinaten mm: x=0 Westkante, y=0 Südkante (Straße), z=0 OK Rohdecke EG.
Konfidenz steht im Label: [A] Maßkette · [B] abgeleitet · [C] Annahme.
"""
import FreeCAD, Part, Draft, Arch
from FreeCAD import Vector as V

DATA = %s

doc = FreeCAD.newDocument("Haus_Tirschenreuth_v01")
site = Arch.makeSite(); site.Label = "Schlesierstraße 31"
bldg = Arch.makeBuilding(); bldg.Label = "Wohnhaus + Garage"; site.addObject(bldg)
levels = {}
for key, label in (("KG", "Kellergeschoss"), ("EG", "Erdgeschoss"), ("OG", "Dachgeschoss"), ("DACH", "Dach"), ("GAR", "Garage")):
    lv = Arch.makeFloor(); lv.Label = label
    lv.Placement.Base = V(0, 0, DATA["floors"].get(key, 0))
    bldg.addObject(lv); levels[key] = lv

def wall_objs_by_key():
    return {(w["floor"], w["name"]): o for (w, o) in WALLS_MADE}

WALLS_MADE = []
for w in DATA["walls"]:
    dx, dy = w["x1"] - w["x0"], w["y1"] - w["y0"]
    along_x = dx >= dy
    thick = dy if along_x else dx
    if "h" in w:
        if along_x:
            p1, p2 = V(w["x0"], (w["y0"] + w["y1"]) / 2, w["z0"]), V(w["x1"], (w["y0"] + w["y1"]) / 2, w["z0"])
        else:
            p1, p2 = V((w["x0"] + w["x1"]) / 2, w["y0"], w["z0"]), V((w["x0"] + w["x1"]) / 2, w["y1"], w["z0"])
        line = Draft.make_line(p1, p2); line.ViewObject.Visibility = False if hasattr(line, "ViewObject") and line.ViewObject else None
        wall = Arch.makeWall(line, width=thick, height=w["h"], align="Center")
    else:
        # OG-Wand mit Dachprofil: Profil (u,z) -> Fläche -> Extrusion über Wanddicke
        pr = w["profile"]
        if pr["axis"] == "y":   # Profil in (y,z), Wand steht in y-Richtung, Dicke in x
            pts = [V(w["x0"], u, z) for (u, z) in pr["pts"]]
            vec = V(dx, 0, 0)
        else:                   # Profil in (x,z), Dicke in y
            pts = [V(u, w["y0"], z) for (u, z) in pr["pts"]]
            vec = V(0, dy, 0)
        pts.append(pts[0])
        face = Part.Face(Part.makePolygon(pts))
        solid = face.extrude(vec)
        shp = doc.addObject("Part::Feature", "Profil"); shp.Shape = solid
        wall = Arch.makeWall(shp)
    wall.Label = "%%s %%s [%%s]" %% (w["floor"], w["name"], w["tag"])
    levels[w["floor"]].addObject(wall)
    WALLS_MADE.append((w, wall))

# ---------------- Fenster / Türen (Arch-Window mit Preset, Host = Wand)
walls_by_key = wall_objs_by_key()
wall_data = {(w["floor"], w["name"]): w for w in DATA["walls"]}
for o in DATA["openings"]:
    key = (o["floor"], o["wall"])
    if key not in walls_by_key:
        continue
    w = wall_data[key]; host = walls_by_key[key]
    dx, dy = w["x1"] - w["x0"], w["y1"] - w["y0"]
    along_x = dx >= dy
    thick = dy if along_x else dx
    z = w["z0"] + o["sill"]
    if o["kind"] == "loggia":   # offener Durchgang: Abzugskörper an der Wand (parametrisch, Arch.removeComponents)
        if along_x: b = Part.makeBox(o["width"], thick + 20, o["height"], V(w["x0"] + o["a0"], w["y0"] - 10, z))
        else:       b = Part.makeBox(thick + 20, o["width"], o["height"], V(w["x0"] - 10, w["y0"] + o["a0"], z))
        sub = doc.addObject("Part::Feature", "Durchgang"); sub.Shape = b
        sub.Label = "%%s Öffnung %%d [%%s]" %% (o["floor"], o["width"], o["tag"])
        Arch.removeComponents([sub], host=host)
        continue
    if along_x:
        base = V(w["x0"] + o["a0"], (w["y0"] + w["y1"]) / 2 - thick / 2, z)
        rot = FreeCAD.Rotation(V(1, 0, 0), 90)                       # Skizze XZ-Ebene → Wand entlang x
    else:
        base = V((w["x0"] + w["x1"]) / 2 + thick / 2, w["y0"] + o["a0"], z)
        rot = FreeCAD.Rotation(V(0, 0, 1), 90).multiply(FreeCAD.Rotation(V(1, 0, 0), 90))
    pl = FreeCAD.Placement(base, rot)
    preset = "Simple door" if o["kind"] == "door" else "Fixed"
    win = Arch.makeWindowPreset(preset, width=o["width"], height=o["height"], h1=60, h2=60, h3=40, w1=thick, w2=40, o1=0, o2=thick / 2, placement=pl)
    win.Hosts = [host]
    win.Label = "%%s %%s %%dx%%d [%%s]" %% (o["floor"], "Tür" if o["kind"] == "door" else "Fenster", o["width"], o["height"], o["tag"])
    levels[o["floor"]].addObject(win)

# ---------------- Decken (mit Treppenauge)
for s in DATA["slabs"]:
    b = Part.makeBox(s["dx"], s["dy"], s["dz"], V(s["x0"], s["y0"], s["z0"]))
    op = DATA["slab_openings"].get(s["floor"])
    if op and s["name"].startswith("Decke"):
        b = b.cut(Part.makeBox(op[2]-op[0], op[3]-op[1], s["dz"]+20, V(op[0], op[1], s["z0"]-10)))
    st = Arch.makeStructure(doc.addObject("Part::Feature", "Decke")); st.Base.Shape = b
    st.Label = s["name"]; st.IfcType = "Slab"; levels[s["floor"]].addObject(st)

# ---------------- Treppen (Stufenblöcke, vereinfacht)
for s in DATA["stairs"]:
    layer = "KG" if s["z0"] < 0 else "EG"
    dx_, dy_ = {"+x": (1, 0), "-x": (-1, 0), "+y": (0, 1), "-y": (0, -1)}[s["direction"]]
    shp = None
    for i in range(s["steps"]):
        zt = s["z0"] + (i + 1) * s["rise"]
        if dx_:
            x = s["x0"] + (i * s["run"] if dx_ > 0 else -(i + 1) * s["run"])
            b = Part.makeBox(s["run"], s["width"], zt - s["z0"], V(x, s["y0"], s["z0"]))
        else:
            y = s["y0"] + (i * s["run"] if dy_ > 0 else -(i + 1) * s["run"])
            b = Part.makeBox(s["width"], s["run"], zt - s["z0"], V(s["x0"], y, s["z0"]))
        shp = b if shp is None else shp.fuse(b)
    st = Arch.makeStairs() if False else Arch.makeStructure(doc.addObject("Part::Feature", "Treppe")); st.Base.Shape = shp
    st.Label = s["name"] + " [" + s["tag"] + "]"; levels[layer].addObject(st)
for l in DATA["landings"]:
    b = Part.makeBox(l["x1"]-l["x0"], l["y1"]-l["y0"], 150, V(l["x0"], l["y0"], l["z"]-150))
    st = Arch.makeStructure(doc.addObject("Part::Feature", "Podest")); st.Base.Shape = b; st.Label = l["name"]; levels["KG"].addObject(st)

# ---------------- Dach (Satteldach 36°, First Ost-West) als Volumenkörper
rp = [V(DATA["roof_x"][0], y, z) for (y, z) in DATA["roof_profile"]]; rp.append(rp[0])
roof_solid = Part.Face(Part.makePolygon(rp)).extrude(V(DATA["roof_x"][1] - DATA["roof_x"][0], 0, 0))
rs = doc.addObject("Part::Feature", "DachProfil"); rs.Shape = roof_solid
roof = Arch.makeRoof(rs); roof.Label = "Satteldach 36° [A]"; levels["DACH"].addObject(roof)

# Gaube (Süd, über Kind 3)
g = DATA["gaube"]; gz = g["z0"]; gtop = gz + g["wall_h"]
front = Part.makeBox(g["x1"] - g["x0"], 365, g["wall_h"], V(g["x0"], 0, gz))
cx = g["x0"] + 120
for (wd, gap) in g["windows"]:
    front = front.cut(Part.makeBox(wd, 400, 1100, V(cx, -10, gz + 900)))
    cx += wd + gap
gf = Arch.makeWall(doc.addObject("Part::Feature", "GaubeFront")); gf.Base.Shape = front; gf.Label = "Gaube Frontwand [B]"
levels["DACH"].addObject(gf)
tan36 = math.tan(math.radians(36.0))
def zroof(y): return gz + g["kniestock"] + tan36 * (y - 365)
for name, x in (("Gaube Wange West [B]", g["x0"]), ("Gaube Wange Ost [B]", g["x1"] - 120)):
    pts = [V(x, 0, gz + g["kniestock"]), V(x, g["depth"], zroof(g["depth"])), V(x, g["depth"], gtop + 50), V(x, 0, gtop + 50)]
    pts.append(pts[0])
    sol = Part.Face(Part.makePolygon(pts)).extrude(V(120, 0, 0))
    ww = Arch.makeWall(doc.addObject("Part::Feature", "Wange")); ww.Base.Shape = sol; ww.Label = name; levels["DACH"].addObject(ww)
gd = Part.makeBox(g["x1"] - g["x0"] + 400, g["depth"] + 500, 200, V(g["x0"] - 200, -300, gtop + 50))
gr = Arch.makeStructure(doc.addObject("Part::Feature", "Gaubendach")); gr.Base.Shape = gd; gr.Label = "Gaubendach [C]"; levels["DACH"].addObject(gr)

# ---------------- Balkon / Loggia-Brüstung
bk = DATA["balkon"]
bb = Part.makeBox(bk["x1"] - bk["x0"], bk["y1"] - bk["y0"], 160, V(bk["x0"], bk["y0"], DATA["z_dg"] - 160))
bs = Arch.makeStructure(doc.addObject("Part::Feature", "Balkon")); bs.Base.Shape = bb; bs.Label = "Balkonplatte [B]"; levels["OG"].addObject(bs)
for lp in DATA["loggia_parapets"]:
    lb = Part.makeBox(lp["x1"] - lp["x0"], lp["y1"] - lp["y0"], lp["h"], V(lp["x0"], lp["y0"], 0))
    ls = Arch.makeWall(doc.addObject("Part::Feature", "LoggiaBr")); ls.Base.Shape = lb; ls.Label = "Loggia-Brüstung [%%s]" %% lp["tag"]; levels["EG"].addObject(ls)

# ---------------- Garagendach
gr_ = DATA["garage_roof"]
gp = [V(gr_["x"][0], y, z) for (y, z) in gr_["profile"]]; gp.append(gp[0])
gsol = Part.Face(Part.makePolygon(gp)).extrude(V(gr_["x"][1] - gr_["x"][0], 0, 0))
gro = Arch.makeStructure(doc.addObject("Part::Feature", "GaragenDach")); gro.Base.Shape = gsol; gro.Label = "Garagendach 4%% [B]"; levels["GAR"].addObject(gro)

doc.recompute()
try:
    import FreeCADGui
    FreeCADGui.SendMsgToActiveView("ViewFit")
    FreeCADGui.activeDocument().activeView().viewIsometric()
except Exception:
    pass
print("Fertig: %%d Wände, %%d Öffnungen" %% (len(WALLS_MADE), len(DATA["openings"])))
'''

import math as _m
code = FREECAD % pprint.pformat(DATA, width=140)
code = code.replace("import FreeCAD, Part, Draft, Arch", "import math\nimport FreeCAD, Part, Draft, Arch")
open("Haus_FreeCAD.py", "w").write(code)
print("FreeCAD script written", len(code))

# ------------------------------------------------------------- STEP via CadQuery (Geometriecheck + Import-Fallback)
import cadquery as cq
solids = []
def add(shape, name):
    solids.append((name, shape))
for w in walls:
    dx, dy = w["x1"] - w["x0"], w["y1"] - w["y0"]
    if "h" in w:
        s = cq.Workplane("XY").box(dx, dy, w["h"], centered=False).translate((w["x0"], w["y0"], w["z0"]))
    else:
        pr = w["profile"]
        if pr["axis"] == "y":
            s = cq.Workplane("YZ", origin=(w["x0"], 0, 0)).polyline(pr["pts"]).close().extrude(dx)
        else:
            s = cq.Workplane("XZ", origin=(0, w["y1"], 0)).polyline(pr["pts"]).close().extrude(dy)  # XZ-Normale = -Y → von y1 nach y0
    # Öffnungen ausschneiden
    for o in m.OPENINGS:
        if (o["floor"], o["wall"]) != (w["floor"], w["name"]): continue
        along_x = dx >= dy
        if along_x:
            cut = cq.Workplane("XY").box(o["width"], dy + 20, o["height"] if o["kind"] != "loggia" else o["height"], centered=False).translate((w["x0"] + o["a0"], w["y0"] - 10, w["z0"] + o["sill"]))
        else:
            cut = cq.Workplane("XY").box(dx + 20, o["width"], o["height"], centered=False).translate((w["x0"] - 10, w["y0"] + o["a0"], w["z0"] + o["sill"]))
        s = s.cut(cut)
    add(s, f'{w["floor"]}_{w["name"]}')
for s in DATA["slabs"]:
    add(cq.Workplane("XY").box(s["dx"], s["dy"], s["dz"], centered=False).translate((s["x0"], s["y0"], s["z0"])), s["name"])
add(cq.Workplane("YZ", origin=(0, 0, 0)).polyline(roof_profile).close().extrude(m.HOUSE_W), "Dach")
add(cq.Workplane("YZ", origin=(m.GAR_X[0] - 300, 0, 0)).polyline(gpts).close().extrude(-(m.GAR_X[0] - 300)), "Garagendach")
g = m.GAUBE
front = cq.Workplane("XY").box(g["x1"] - g["x0"], 365, g["wall_h"], centered=False).translate((g["x0"], 0, m.Z_OG))
cx = g["x0"] + 120
for wd, gap in g["windows"]:
    front = front.cut(cq.Workplane("XY").box(wd, 400, 1100, centered=False).translate((cx, -10, m.Z_OG + 900))); cx += wd + gap
add(front, "Gaube_Front")
for x in (g["x0"], g["x1"] - 120):
    pts = [(0, m.Z_OG + m.KNIESTOCK), (g["depth"], m.roof_z_under(g["depth"])), (g["depth"], m.Z_OG + g["wall_h"] + 50), (0, m.Z_OG + g["wall_h"] + 50)]
    add(cq.Workplane("YZ", origin=(x, 0, 0)).polyline(pts).close().extrude(120), "Gaube_Wange")
add(cq.Workplane("XY").box(g["x1"] - g["x0"] + 400, g["depth"] + 500, 200, centered=False).translate((g["x0"] - 200, -300, m.Z_OG + g["wall_h"] + 50)), "Gaubendach")

asm = cq.Assembly()
for i, (name, s) in enumerate(solids):
    asm.add(s, name=f"{i:03d}_{name}".replace(" ","_").replace("/","_").replace("|","_"))
asm.save("Haus_Rohbau.step")
import os
print("STEP", os.path.getsize("Haus_Rohbau_v0.1.step"))
# Volumen-Plausibilität
vol = sum(s.val().Volume() for _, s in solids) / 1e9
print(f"Gesamtvolumen Bauteile: {vol:.1f} m³")
