"""Druckteile (STL) aus haus_model – Stapelteile KG / EG / OG / DACH / GARAGE mit Steckzapfen."""
import sys, math, cadquery as cq, haus_model as m
SCALE = float(sys.argv[1]) if len(sys.argv) > 1 else 75.0
OUT = sys.argv[2] if len(sys.argv) > 2 else "print"
# Verbinder (in mm am Modell, werden mit skaliert → Zapfen Ø3, Bohrung Ø3.3, Höhe 3 / Tiefe 3.5 bei 1:75)
PEG_D, HOLE_D, PEG_H, HOLE_H = 3.0*SCALE, 3.3*SCALE, 3.0*SCALE, 3.5*SCALE
CORNERS = [(182, 182), (m.HOUSE_W-182, 182), (182, m.HOUSE_D-182), (m.HOUSE_W-182, m.HOUSE_D-182), (5055, 4995)]

def box(x0,y0,z0,x1,y1,z1):
    return cq.Workplane("XY").box(x1-x0, y1-y0, z1-z0, centered=False).translate((x0,y0,z0))
def cyl(x,y,z0,d,h):
    return cq.Workplane("XY").circle(d/2).extrude(h).translate((x,y,z0))
def prism_x(pts, x0, x1):   # Profil (y,z), Extrusion entlang x
    return cq.Workplane("YZ", origin=(x0,0,0)).polyline(pts).close().extrude(x1-x0)
def fuse(solids):
    r = solids[0]
    for s in solids[1:]: r = r.union(s)
    return r

zu = m.roof_z_under; ridge = m.HOUSE_D/2; ov = m.ROOF_OVERHANG
dz_t = m.ROOF_T/math.cos(math.radians(m.ROOF_PITCH))
UNDER_ROOF = prism_x([(-ov-1, m.Z_OG-500), (m.HOUSE_D+ov+1, m.Z_OG-500), (m.HOUSE_D+ov+1, zu(m.HOUSE_D+ov+1)),
                      (ridge, zu(ridge)), (-ov-1, zu(-ov-1))], -1, m.HOUSE_W+1)
g = m.GAUBE; gtop = m.Z_OG + g["wall_h"]
GAUBE_VOL = box(g["x0"], -1, m.Z_OG-500, g["x1"], g["depth"], gtop+50)     # Raum unter Gaubendach
UNDER_ROOF_G = UNDER_ROOF.union(GAUBE_VOL)

def wall_solid(w, z0, z1):
    s = box(w["x0"], w["y0"], z0, w["x1"], w["y1"], z1)
    along = (w["x1"]-w["x0"]) >= (w["y1"]-w["y0"])
    for o in m.OPENINGS:
        if (o["floor"], o["wall"]) != (w["floor"], w["name"]): continue
        h = o["height"] if o["kind"] != "loggia" else (z1 - z0 - o["sill"]) + 10
        if along: c = box(w["x0"]+o["a0"], w["y0"]-10, z0+o["sill"], w["x0"]+o["a0"]+o["width"], w["y1"]+10, z0+o["sill"]+h)
        else:     c = box(w["x0"]-10, w["y0"]+o["a0"], z0+o["sill"], w["x1"]+10, w["y0"]+o["a0"]+o["width"], z0+o["sill"]+h)
        s = s.cut(c)
    return s

def floor_walls(floor, z0, z1):
    return [wall_solid(w, z0, z1) for w in m.WALLS if w["floor"] == floor]

def slab(z0, opening=None):
    s = box(0, 0, z0, m.HOUSE_W, m.HOUSE_D, z0+m.SLAB)
    if opening: s = s.cut(box(opening[0], opening[1], z0-10, opening[2], opening[3], z0+m.SLAB+10))
    return s

def stairs(floor):
    out = []
    for s in m.STAIRS:
        layer = "KG" if s["z0"] < 0 else "EG"
        if layer != floor: continue
        dirx = {"+x":(1,0), "-x":(-1,0), "+y":(0,1), "-y":(0,-1)}[s["direction"]]
        for i in range(s["steps"]):
            zt = s["z0"] + (i+1)*s["rise"]; zb = m.Z_KG if floor == "KG" else s["z0"]   # KG-Treppe massiv bis Boden
            if dirx[0]:
                x = s["x0"] + (i*s["run"] if dirx[0] > 0 else -(i+1)*s["run"])
                out.append(box(x, s["y0"], zb, x+s["run"], s["y0"]+s["width"], zt))
            else:
                y = s["y0"] + (i*s["run"] if dirx[1] > 0 else -(i+1)*s["run"])
                out.append(box(s["x0"], y, zb, s["x0"]+s["width"], y+s["run"], zt))
    if floor == "KG":
        for l in m.LANDINGS: out.append(box(l["x0"], l["y0"], l["z"]-150, l["x1"], l["y1"], l["z"]))
    return out

def add_pegs(part, ztop_fn):
    for (x,y) in CORNERS:
        part = part.union(cyl(x, y, ztop_fn(x,y)-1, PEG_D, PEG_H+1))
    return part
def cut_holes(part, zbot_fn):
    for (x,y) in CORNERS:
        part = part.cut(cyl(x, y, zbot_fn(x,y)-1, HOLE_D, HOLE_H+1))
    return part

parts = {}
# ---------------- KG: Bodenplatte + Wände + Treppe, Zapfen oben
kg = fuse([box(0, 0, m.Z_KG-200, m.HOUSE_W, m.HOUSE_D, m.Z_KG)] + floor_walls("KG", m.Z_KG, -m.SLAB) + stairs("KG"))
kg = add_pegs(kg, lambda x,y: -m.SLAB)
parts["KG"] = kg
# ---------------- EG: Decke über KG + Wände + Loggiabrüstung + Treppe
eg = fuse([slab(-m.SLAB, m.SLAB_OPENINGS["EG"])] + floor_walls("EG", 0, m.Z_OG-m.SLAB) +
          [box(lp["x0"], lp["y0"], 0, lp["x1"], lp["y1"], lp["h"]) for lp in m.LOGGIA_PARAPETS] + stairs("EG"))
eg = cut_holes(eg, lambda x,y: -m.SLAB)
eg = add_pegs(eg, lambda x,y: m.Z_OG-m.SLAB)
parts["EG"] = eg
# ---------------- OG: Decke über EG + Wände (bis Dachunterkante geschnitten) + Balkon, Zapfen an den 4 Ecken
og_walls = []
for w in m.WALLS:
    if w["floor"] != "OG": continue
    top = zu(ridge) + 100
    og_walls.append(wall_solid(w, m.Z_OG, top).intersect(UNDER_ROOF_G))
bk = m.BALKON
og = fuse([slab(m.Z_OG-m.SLAB, m.SLAB_OPENINGS["OG"])] + og_walls +
          [box(bk["x0"], bk["y0"], m.Z_OG-160, bk["x1"], bk["y1"], m.Z_OG)])
og = cut_holes(og, lambda x,y: m.Z_OG-m.SLAB)
for (x,y) in CORNERS[:4]:   # Zapfen zum Dach: kürzer (2,2 mm)
    og = og.union(cyl(x, y, zu(y)-1, PEG_D, 2.2*SCALE+1))
parts["OG"] = og
# ---------------- DACH: Schale + Gaube + Spitzbodendecke + Eckklötze mit Bohrungen
roof_pts = [(-ov, zu(-ov)), (ridge, zu(ridge)), (m.HOUSE_D+ov, zu(m.HOUSE_D+ov)),
            (m.HOUSE_D+ov, zu(m.HOUSE_D+ov)+dz_t), (ridge, zu(ridge)+dz_t), (-ov, zu(-ov)+dz_t)]
roof = prism_x(roof_pts, 0, m.HOUSE_W)
roof = roof.cut(box(g["x0"]+120, -ov-1, m.Z_OG, g["x1"]-120, g["depth"]-50, gtop))   # Gaubeninneres freischneiden
front = box(g["x0"], 0, m.Z_OG, g["x1"], 365, gtop)
cx = g["x0"]+120
for wd, gap in g["windows"]:
    front = front.cut(box(cx, -10, m.Z_OG+900, cx+wd, 400, m.Z_OG+2000)); cx += wd+gap
wangen = [prism_x([(0, m.Z_OG+m.KNIESTOCK), (g["depth"], zu(g["depth"])), (g["depth"], gtop+50), (0, gtop+50)], x, x+120)
          for x in (g["x0"], g["x1"]-120)]
gdach = box(g["x0"]-200, -300, gtop+50, g["x1"]+200, g["depth"]+200, gtop+250)
ys_ = m.T_OUT + (m.OG_CEIL - (m.Z_OG+m.KNIESTOCK))/m.tan_roof() + 100
spitz = box(m.T_OUT, ys_, m.OG_CEIL, m.HOUSE_W-m.T_OUT, m.HOUSE_D-ys_, m.OG_CEIL+200)
dach = fuse([roof, front] + wangen + [gdach, spitz])
# Dachverbinder: Bohrungen in der Dachschale (3,3 mm dick) – flacher als bei den Decken
for (x,y) in CORNERS[:4]:
    dach = dach.cut(cyl(x, y, zu(y)-1, HOLE_D, 2.6*SCALE+1))
parts["DACH"] = dach
# ---------------- GARAGE: Boden + Wände + Dach + Vordach (ein Teil)
gwalls = []
for w in m.WALLS:
    if w["floor"] != "GAR": continue
    zt = m.garage_roof_z((w["y0"]+w["y1"])/2)
    gwalls.append(wall_solid(w, m.GAR_Z0, zt))
gp = [(m.GAR_Y[0]-300, m.garage_roof_z(m.GAR_Y[0]-300)), (m.GAR_Y[1]+300, m.garage_roof_z(m.GAR_Y[1]+300)),
      (m.GAR_Y[1]+300, m.garage_roof_z(m.GAR_Y[1]+300)+220), (m.GAR_Y[0]-300, m.garage_roof_z(m.GAR_Y[0]-300)+220)]
garage = fuse([box(m.GAR_X[0], m.GAR_Y[0], m.GAR_Z0-160, m.GAR_X[1], m.GAR_Y[1], m.GAR_Z0)] + gwalls +
              [prism_x(gp, m.GAR_X[0]-300, m.GAR_X[1]+300), box(m.GAR_X[0], m.GAR_Y[0]-2500, m.GAR_Z0+m.GAR_H_FRONT, m.GAR_X[0]+8000, m.GAR_Y[0], m.GAR_Z0+m.GAR_H_FRONT+200)])
parts["GARAGE"] = garage

import os
os.makedirs(OUT, exist_ok=True)
for name, p in parts.items():
    sc = p.val().scale(1.0/SCALE)
    bb = sc.BoundingBox()
    fn = f"{OUT}/Haus_{name}_1zu{int(SCALE)}.stl"
    cq.exporters.export(cq.Workplane().add(sc), fn, tolerance=0.02, angularTolerance=0.1)
    print(f"{name:7s} {bb.xlen:6.1f} x {bb.ylen:6.1f} x {bb.zlen:6.1f} mm  Volumen {sc.Volume()/1000:.1f} cm³  Solids: {len(p.solids().vals())}")
