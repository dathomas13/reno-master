"""Viewer-Szene aus sauberen Volumenkörpern (CadQuery): je Bauteil ein Solid ohne Überlappungen,
Öffnungen ausgeschnitten, OG-Wände am Dach beschnitten. Ausgabe: scene.json (Dreiecksnetze je Bauteil)."""
import json, math, cadquery as cq, haus_model as m

def box(x0,y0,z0,x1,y1,z1):
    return cq.Workplane("XY").box(x1-x0, y1-y0, z1-z0, centered=False).translate((x0,y0,z0))
def prism_x(pts, x0, x1):
    return cq.Workplane("YZ", origin=(x0,0,0)).polyline(pts).close().extrude(x1-x0)
def bb_overlap(a, b, tol=1):
    A, B = a.val().BoundingBox(), b.val().BoundingBox()
    return A.xmin < B.xmax-tol and A.xmax > B.xmin+tol and A.ymin < B.ymax-tol and A.ymax > B.ymin+tol and A.zmin < B.zmax-tol and A.zmax > B.zmin+tol

zu = m.roof_z_under; ridge = m.HOUSE_D/2; ov = m.ROOF_OVERHANG
dz_t = m.ROOF_T/math.cos(math.radians(m.ROOF_PITCH))
UNDER_ROOF = prism_x([(-ov-1, m.Z_OG-500), (m.HOUSE_D+ov+1, m.Z_OG-500), (m.HOUSE_D+ov+1, zu(m.HOUSE_D+ov+1)),
                      (ridge, zu(ridge)), (-ov-1, zu(-ov-1))], -1, m.HOUSE_W+1)
g = m.GAUBE; gtop = m.Z_OG + g["wall_h"]
GAUBE_VOL = box(g["x0"], -1, m.Z_OG-500, g["x1"], g["depth"], gtop+50)
UNDER_ROOF_G = UNDER_ROOF.union(GAUBE_VOL)

elements = []   # dict(layer, name, kind, tag, solid)
def add(layer, name, kind, tag, solid, tragend=False):
    if solid is None: return
    try:
        if solid.val().Volume() < 1e3: return
    except Exception:
        return
    elements.append(dict(layer=layer, name=name, kind=kind, tag=tag, solid=solid, tragend=tragend))

def openings_of(w):
    return [o for o in m.OPENINGS if (o["floor"], o["wall"]) == (w["floor"], w["name"])]

def wall_solid(w, z0, z1):
    s = box(w["x0"], w["y0"], z0, w["x1"], w["y1"], z1)
    along = (w["x1"]-w["x0"]) >= (w["y1"]-w["y0"])
    for o in openings_of(w):
        h = o["height"] if o["kind"] != "loggia" else (z1 - z0 - o["sill"]) + 10
        if along: c = box(w["x0"]+o["a0"], w["y0"]-10, z0+o["sill"], w["x0"]+o["a0"]+o["width"], w["y1"]+10, z0+o["sill"]+h)
        else:     c = box(w["x0"]-10, w["y0"]+o["a0"], z0+o["sill"], w["x1"]+10, w["y0"]+o["a0"]+o["width"], z0+o["sill"]+h)
        s = s.cut(c)
    return s

def panels(w, z0):
    """Fenster-/Türblätter als dünne Scheiben (Anzeige)."""
    along = (w["x1"]-w["x0"]) >= (w["y1"]-w["y0"])
    out = []
    for o in openings_of(w):
        if o["kind"] == "loggia": continue
        kind = "glass" if o["kind"] == "window" else "door"
        name = f'{"Fenster" if kind=="glass" else "Tür"} {o["width"]}×{o["height"]}'
        if along:
            ym = (w["y0"]+w["y1"])/2
            s = box(w["x0"]+o["a0"], ym-20, z0+o["sill"], w["x0"]+o["a0"]+o["width"], ym+20, z0+o["sill"]+o["height"])
        else:
            xm = (w["x0"]+w["x1"])/2
            s = box(xm-20, w["y0"]+o["a0"], z0+o["sill"], xm+20, w["y0"]+o["a0"]+o["width"], z0+o["sill"]+o["height"])
        out.append((name, kind, o["tag"], s))
    return out

def wall_priority(w):
    """Reihenfolge für Überlappungsabzug: Außenwände zuerst, dann 240er, dann Leichtwände."""
    th = min(w["x1"]-w["x0"], w["y1"]-w["y0"])
    return (0 if w["name"].startswith("Außenwand") else 1 if th >= 240 else 2, -th)

def build_floor_walls(floor, z0, z1, clip=None):
    walls = sorted([w for w in m.WALLS if w["floor"] == floor], key=wall_priority)
    done = []
    for w in walls:
        s = wall_solid(w, z0, z1)
        if clip is not None: s = s.intersect(clip)
        for d in done:
            if bb_overlap(s, d): s = s.cut(d)      # Überlappung an Kreuzungen entfernen
        th = min(w["x1"]-w["x0"], w["y1"]-w["y0"])
        add(floor, w["name"], "wall", w["tag"], s, tragend=(th >= 240 and not w["name"].startswith("Kamin")))
        done.append(s)
        for name, kind, tag, p in panels(w, z0): add(floor, name, kind, tag, p)

def slab(z0, opening=None):
    s = box(0, 0, z0, m.HOUSE_W, m.HOUSE_D, z0+m.SLAB)
    if opening: s = s.cut(box(opening[0], opening[1], z0-10, opening[2], opening[3], z0+m.SLAB+10))
    return s

def stair_solid(s, floor):
    dirx = {"+x":(1,0), "-x":(-1,0), "+y":(0,1), "-y":(0,-1)}[s["direction"]]
    shp = None
    for i in range(s["steps"]):
        zt = s["z0"] + (i+1)*s["rise"]; zb = m.Z_KG if floor == "KG" else s["z0"] + max(i-1, 0)*s["rise"]
        if dirx[0]:
            x = s["x0"] + (i*s["run"] if dirx[0] > 0 else -(i+1)*s["run"])
            b = box(x, s["y0"], zb, x+s["run"], s["y0"]+s["width"], zt)
        else:
            y = s["y0"] + (i*s["run"] if dirx[1] > 0 else -(i+1)*s["run"])
            b = box(s["x0"], y, zb, s["x0"]+s["width"], y+s["run"], zt)
        shp = b if shp is None else shp.union(b)
    return shp

# ---------------- KG / EG
add("KG", "Bodenplatte KG", "slab", "A", box(0, 0, m.Z_KG-200, m.HOUSE_W, m.HOUSE_D, m.Z_KG))
build_floor_walls("KG", m.Z_KG, -m.SLAB)
add("EG", "Stahlbetondecke über KG (14 cm)", "slab", "A", slab(-m.SLAB, m.SLAB_OPENINGS["EG"]))
build_floor_walls("EG", 0, m.Z_OG-m.SLAB)
for lp in m.LOGGIA_PARAPETS:
    add("EG", "Loggia Brüstung", "wall", lp["tag"], box(lp["x0"], lp["y0"], 0, lp["x1"], lp["y1"], lp["h"]))
# Deckenstücke außerhalb des Rechtecks 0..HOUSE_W / 0..HOUSE_D (Loggia-Vorsprung)
for e in getattr(m, "SLAB_EXTRAS", []):
    add(e["floor"], e["name"], "slab", e["tag"], box(e["x0"], e["y0"], e["z0"], e["x1"], e["y1"], e["z0"]+m.SLAB))
for s in m.STAIRS:
    floor = "KG" if s["z0"] < 0 else "EG"
    add(floor, s["name"], "stair", s["tag"], stair_solid(s, floor))
for l in m.LANDINGS:
    add("KG", l["name"], "stair", l["tag"], box(l["x0"], l["y0"], l["z"]-150, l["x1"], l["y1"], l["z"]))
# ---------------- OG
add("OG", "Stahlbetondecke über EG (14 cm)", "slab", "A", slab(m.Z_OG-m.SLAB, m.SLAB_OPENINGS["OG"]))
build_floor_walls("OG", m.Z_OG, zu(ridge)+100, clip=UNDER_ROOF_G)
bk = m.BALKON
add("OG", "Balkon Platte", "slab", bk["tag"], box(bk["x0"], bk["y0"], m.Z_OG-160, bk["x1"], bk["y1"], m.Z_OG))
rail = box(bk["x0"], bk["y0"], m.Z_OG, bk["x0"]+60, bk["y1"], m.Z_OG+1000).union(box(bk["x0"], bk["y0"], m.Z_OG, bk["x1"], bk["y0"]+60, m.Z_OG+1000)).union(box(bk["x0"], bk["y1"]-60, m.Z_OG, bk["x1"], bk["y1"], m.Z_OG+1000))
add("OG", "Balkon Geländer", "rail", bk["tag"], rail)
# ---------------- Dach
roof_pts = [(-ov, zu(-ov)), (ridge, zu(ridge)), (m.HOUSE_D+ov, zu(m.HOUSE_D+ov)),
            (m.HOUSE_D+ov, zu(m.HOUSE_D+ov)+dz_t), (ridge, zu(ridge)+dz_t), (-ov, zu(-ov)+dz_t)]
roof = prism_x(roof_pts, 0, m.HOUSE_W).cut(box(g["x0"]+120, -ov-1, m.Z_OG, g["x1"]-120, g["depth"]-50, gtop))
add("DACH", "Satteldach 36° (Kunstschiefer)", "roof", "A", roof)
front = box(g["x0"], 0, m.Z_OG, g["x1"], 365, gtop)
cx = g["x0"]+120
for wd, gap in g["windows"]:
    front = front.cut(box(cx, -10, m.Z_OG+900, cx+wd, 400, m.Z_OG+2000))
    add("DACH", f"Gaubenfenster {wd}", "glass", g["tag"], box(cx, 160, m.Z_OG+900, cx+wd, 200, m.Z_OG+2000))
    cx += wd+gap
add("DACH", "Gaube Frontwand", "wall", g["tag"], front.cut(UNDER_ROOF))
for name, x in (("Gaube Wange West", g["x0"]), ("Gaube Wange Ost", g["x1"]-120)):
    add("DACH", name, "wall", g["tag"], prism_x([(0, m.Z_OG+m.KNIESTOCK), (g["depth"], zu(g["depth"])), (g["depth"], gtop+50), (0, gtop+50)], x, x+120))
add("DACH", "Gaubendach", "roof", "C", box(g["x0"]-200, -300, gtop+50, g["x1"]+200, g["depth"]+200, gtop+250))
ys_ = m.T_OUT + (m.OG_CEIL - (m.Z_OG+m.KNIESTOCK))/m.tan_roof() + 100
add("DACH", "Holzbalkendecke Spitzboden", "slab", "B", box(m.T_OUT, ys_, m.OG_CEIL, m.HOUSE_W-m.T_OUT, m.HOUSE_D-ys_, m.OG_CEIL+200))
# ---------------- Garage
gwalls = sorted([w for w in m.WALLS if w["floor"] == "GAR"], key=wall_priority); done = []
for w in gwalls:
    zt = m.garage_roof_z((w["y0"]+w["y1"])/2)
    s = wall_solid(w, m.GAR_Z0, zt)
    for d in done:
        if bb_overlap(s, d): s = s.cut(d)
    add("GAR", w["name"], "wall", w["tag"], s, tragend=True); done.append(s)
    for name, kind, tag, p in panels(w, m.GAR_Z0): add("GAR", name, kind, tag, p)
gp = [(m.GAR_Y[0]-300, m.garage_roof_z(m.GAR_Y[0]-300)), (m.GAR_Y[1]+300, m.garage_roof_z(m.GAR_Y[1]+300)),
      (m.GAR_Y[1]+300, m.garage_roof_z(m.GAR_Y[1]+300)+220), (m.GAR_Y[0]-300, m.garage_roof_z(m.GAR_Y[0]-300)+220)]
add("GAR", "Garagendach (4 %, Lagenpappe)", "roof", "B", prism_x(gp, m.GAR_X[0]-300, 0))
add("GAR", "Garagenboden", "slab", "B", box(m.GAR_X[0], m.GAR_Y[0], m.GAR_Z0-160, m.GAR_X[1], m.GAR_Y[1], m.GAR_Z0))
add("GAR", "Vordach Garagen (8000×2500)", "roof", "A", box(m.GAR_X[0], m.GAR_Y[0]-2500, m.GAR_Z0+m.GAR_H_FRONT, m.GAR_X[0]+8000, m.GAR_Y[0], m.GAR_Z0+m.GAR_H_FRONT+200))

# ---------------- Tessellieren
out = []
for e in elements:
    shape = e["solid"].val()
    bb = shape.BoundingBox()
    verts, tris = shape.tessellate(2.0, 0.3)
    out.append(dict(layer=e["layer"], name=e["name"], kind=e["kind"], tag=e["tag"], tragend=e["tragend"],
                    v=[round(c, 1) for p in verts for c in (p.x, p.y, p.z)], t=[i for tr in tris for i in tr],
                    bb=[round(bb.xmin), round(bb.ymin), round(bb.zmin), round(bb.xmax), round(bb.ymax), round(bb.zmax)]))
json.dump(dict(prims=out, meta=dict(house_w=m.HOUSE_W, house_d=m.HOUSE_D, ridge=zu(ridge))), open("scene.json", "w"))
print(len(out), "Bauteile,", sum(len(e["t"])//3 for e in out), "Dreiecke")
