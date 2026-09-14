import json, math
import haus_model as m

# ------------------------------------------------------------------ Szenen-Primitive
# box: dict(t="box", x,y,z (min corner), dx,dy,dz, layer, name, tag, kind)
# prism: dict(t="prism", axis "x"|"y", u0,u1 (Extrusionsbereich), pts [(v,z)...], layer, ...)
#   axis "x": Profil in (y,z), extrudiert von x=u0..u1 ; axis "y": Profil in (x,z), extrudiert y=u0..u1
prims = []
def box(layer, name, x, y, z, dx, dy, dz, kind="wall", tag="A"):
    if dx <= 0 or dy <= 0 or dz <= 0: return
    prims.append(dict(t="box", layer=layer, name=name, x=x, y=y, z=z, dx=dx, dy=dy, dz=dz, kind=kind, tag=tag))
def prism(layer, name, axis, u0, u1, pts, kind="wall", tag="A"):
    prims.append(dict(t="prism", layer=layer, name=name, axis=axis, u0=u0, u1=u1, pts=pts, kind=kind, tag=tag))

def wall_openings(w):
    return [o for o in m.OPENINGS if o["floor"] == w["floor"] and o["wall"] == w["name"]]

def build_wall_boxes(w, z0, h):
    """Wand als Boxen mit ausgesparten Öffnungen (Fenster/Türen)."""
    along_x = (w["x1"] - w["x0"]) >= (w["y1"] - w["y0"])
    L0 = w["x0"] if along_x else w["y0"]
    L1 = w["x1"] if along_x else w["y1"]
    ops = sorted(wall_openings(w), key=lambda o: o["a0"])
    cursor = L0
    layer = w["floor"]
    def seg(a, b, zz, hh, kind="wall"):
        if b - a <= 0 or hh <= 0: return
        if along_x:
            box(layer, w["name"], a, w["y0"], zz, b - a, w["y1"] - w["y0"], hh, kind, w["tag"])
        else:
            box(layer, w["name"], w["x0"], a, zz, w["x1"] - w["x0"], b - a, hh, kind, w["tag"])
    for o in ops:
        a = L0 + o["a0"]                                          # a0 ist relativ zum Wandanfang
        b = a + o["width"]
        seg(cursor, a, z0, h)
        if o["kind"] != "loggia":
            seg(a, b, z0, o["sill"])                                  # Brüstung
            top = o["sill"] + o["height"]
            seg(a, b, z0 + top, h - top)                             # Sturz
            # Glas / Türblatt als dünne Scheibe
            kind = "glass" if o["kind"] == "window" else "door"
            if along_x:
                ym = (w["y0"] + w["y1"]) / 2
                box(layer, f'{o["kind"]} {o["width"]}×{o["height"]}', a, ym - 20, z0 + o["sill"], b - a, 40, o["height"], kind, o["tag"])
            else:
                xm = (w["x0"] + w["x1"]) / 2
                box(layer, f'{o["kind"]} {o["width"]}×{o["height"]}', xm - 20, a, z0 + o["sill"], 40, b - a, o["height"], kind, o["tag"])
        cursor = b
    seg(cursor, L1, z0, h)

# ------------------------------------------------------------------ Wände
for w in m.WALLS:
    f = m.FLOORS[w["floor"]]
    h = m.wall_height(w)
    if h is not None:
        build_wall_boxes(w, f["z0"], h)
    elif w["floor"] == "OG":
        # Profilwand (oben durch Dach begrenzt) mit Öffnungen: Wand entlang der Länge in Segmente teilen
        along_x = (w["x1"] - w["x0"]) >= (w["y1"] - w["y0"])
        L0, L1 = (w["x0"], w["x1"]) if along_x else (w["y0"], w["y1"])
        ztop = m.OG_CEIL
        def top_z(u):
            y = (w["y0"] + w["y1"]) / 2 if along_x else u
            return min(m.roof_z_under(y), ztop)
        def prism_seg(u0, u1, zb, name, kind="wall"):
            if u1 - u0 <= 0: return
            us = list(range(int(u0), int(u1), 150)) + [u1]
            pts = [(u0, zb), (u1, zb)] + [(u, max(top_z(u), zb + 1)) for u in reversed(us)]
            if along_x: prism("OG", name, "y", w["y0"], w["y1"], pts, kind, w["tag"])
            else:       prism("OG", name, "x", w["x0"], w["x1"], pts, kind, w["tag"])
        cursor = L0
        for o in sorted(wall_openings(w), key=lambda o: o["a0"]):
            a, bb = L0 + o["a0"], L0 + o["a0"] + o["width"]
            prism_seg(cursor, a, m.Z_OG, w["name"])
            if o["sill"] > 0:
                if along_x: box("OG", w["name"], a, w["y0"], m.Z_OG, bb - a, w["y1"] - w["y0"], o["sill"], "wall", w["tag"])
                else:       box("OG", w["name"], w["x0"], a, m.Z_OG, w["x1"] - w["x0"], bb - a, o["sill"], "wall", w["tag"])
            # Sturz: von Oberkante Öffnung bis Dach
            us = list(range(int(a), int(bb), 150)) + [bb]
            zl = m.Z_OG + o["sill"] + o["height"]
            pts = [(a, zl), (bb, zl)] + [(u, max(top_z(u), zl + 1)) for u in reversed(us)]
            if along_x: prism("OG", w["name"], "y", w["y0"], w["y1"], pts, "wall", w["tag"])
            else:       prism("OG", w["name"], "x", w["x0"], w["x1"], pts, "wall", w["tag"])
            if o["sill"] > 0:   # Brüstung als Box (ersetzt Prisma-Vereinfachung)
                pass
            kind = "glass" if o["kind"] == "window" else "door"
            if along_x:
                ym = (w["y0"] + w["y1"]) / 2
                box("OG", f'{o["kind"]} {o["width"]}×{o["height"]}', a, ym - 20, m.Z_OG + o["sill"], bb - a, 40, o["height"], kind, o["tag"])
            else:
                xm = (w["x0"] + w["x1"]) / 2
                box("OG", f'{o["kind"]} {o["width"]}×{o["height"]}', xm - 20, a, m.Z_OG + o["sill"], 40, bb - a, o["height"], kind, o["tag"])
            cursor = bb
        prism_seg(cursor, L1, m.Z_OG, w["name"])
    elif w["floor"] == "GAR":
        # Garage: Wandhöhe folgt dem Dachgefälle → Prisma
        along_x = (w["x1"] - w["x0"]) >= (w["y1"] - w["y0"])
        if along_x:
            zt = m.garage_roof_z((w["y0"] + w["y1"]) / 2)
            build_wall_boxes(w, m.GAR_Z0, zt - m.GAR_Z0)
        else:
            pts = [(w["y0"], m.GAR_Z0), (w["y1"], m.GAR_Z0), (w["y1"], m.garage_roof_z(w["y1"])), (w["y0"], m.garage_roof_z(w["y0"]))]
            prism("GAR", w["name"], "x", w["x0"], w["x1"], pts, "wall", w["tag"])

# ------------------------------------------------------------------ Decken
box("KG", "Bodenplatte KG", 0, 0, m.Z_KG - 200, m.HOUSE_W, m.HOUSE_D, 200, "slab")
def slab_with_opening(layer, name, z, op):
    ox0, oy0, ox1, oy1 = op
    box(layer, name, 0, 0, z, ox0, m.HOUSE_D, m.SLAB, "slab")
    box(layer, name, ox1, 0, z, m.HOUSE_W - ox1, m.HOUSE_D, m.SLAB, "slab")
    box(layer, name, ox0, 0, z, ox1 - ox0, oy0, m.SLAB, "slab")
    box(layer, name, ox0, oy1, z, ox1 - ox0, m.HOUSE_D - oy1, m.SLAB, "slab")
slab_with_opening("EG", "Stahlbetondecke über KG (14 cm)", -m.SLAB, m.SLAB_OPENINGS["EG"])
slab_with_opening("OG", "Stahlbetondecke über EG (14 cm)", m.Z_OG - m.SLAB, m.SLAB_OPENINGS["OG"])
ys_ = m.T_OUT + (m.OG_CEIL - (m.Z_OG + m.KNIESTOCK)) / m.tan_roof() + 100
box("DACH", "Holzbalkendecke Spitzboden", m.T_OUT, ys_, m.OG_CEIL, m.HOUSE_W - 2*m.T_OUT, m.HOUSE_D - 2*ys_, 200, "slab", "B")
# Loggia-Brüstung + Balkon
for lp in m.LOGGIA_PARAPETS:
    box("EG", "Loggia Brüstung", lp["x0"], lp["y0"], 0, lp["x1"]-lp["x0"], lp["y1"]-lp["y0"], lp["h"], "wall", lp["tag"])
bk = m.BALKON
box("OG", "Balkon Platte", bk["x0"], bk["y0"], m.Z_OG - 160, bk["x1"]-bk["x0"], bk["y1"]-bk["y0"], 160, "slab", bk["tag"])
box("OG", "Balkon Geländer", bk["x0"], bk["y0"], m.Z_OG, 60, bk["y1"]-bk["y0"], 1000, "rail", bk["tag"])
box("OG", "Balkon Geländer", bk["x0"], bk["y0"], m.Z_OG, bk["x1"]-bk["x0"], 60, 1000, "rail", bk["tag"])
box("OG", "Balkon Geländer", bk["x0"], bk["y1"]-60, m.Z_OG, bk["x1"]-bk["x0"], 60, 1000, "rail", bk["tag"])

# ------------------------------------------------------------------ Dach (Satteldach 36°, First Ost-West)
t = m.tan_roof()
ov = m.ROOF_OVERHANG
def zu(y): return m.roof_z_under(y)
ridge_y = m.HOUSE_D / 2
dz_t = m.ROOF_T / math.cos(math.radians(m.ROOF_PITCH))   # vertikale Dicke
roof_pts = [(-ov, zu(-ov)), (ridge_y, zu(ridge_y)), (m.HOUSE_D + ov, zu(m.HOUSE_D + ov)),
            (m.HOUSE_D + ov, zu(m.HOUSE_D + ov) + dz_t), (ridge_y, zu(ridge_y) + dz_t), (-ov, zu(-ov) + dz_t)]
prism("DACH", "Satteldach 36° (Kunstschiefer)", "x", 0, m.HOUSE_W, roof_pts, "roof", "A")

# Gaube (Süd, über Kind 3)
g = m.GAUBE
gz0 = m.Z_OG
gtop = gz0 + g["wall_h"]
gy1 = g["depth"]
# Frontwand mit 4 Fenstern
gx = g["x0"]; cursor = gx + 120
box("DACH", "Gaube Frontwand", gx, 0, gz0, 120, 365, gtop - gz0, "wall", g["tag"])
for i, (wd, gap) in enumerate(g["windows"]):
    box("DACH", "Gaube Brüstung", cursor, 0, gz0, wd, 365, 900, "wall", g["tag"])
    box("DACH", f"Gaubenfenster {wd}", cursor, 160, gz0 + 900, wd, 40, 1100, "glass", g["tag"])
    box("DACH", "Gaube Sturz", cursor, 0, gz0 + 2000, wd, 365, gtop - gz0 - 2000, "wall", g["tag"])
    cursor += wd
    if i < 3:
        box("DACH", "Gaube Pfosten", cursor, 0, gz0, gap, 365, gtop - gz0, "wall", g["tag"]); cursor += gap
box("DACH", "Gaube Frontwand", cursor, 0, gz0, g["x1"] - cursor, 365, gtop - gz0, "wall", g["tag"])
# Seitenwände (Wange): von Dachunterkante bis Gaubendecke, Profil in (y,z)
side = [(0, gz0), (gy1, gz0), (gy1, min(zu(gy1), gtop)), (0, gtop)]
# nur Bereich oberhalb Dach sichtbar – wir zeichnen ab Kniestock-Oberkante
side = [(0, gz0 + m.KNIESTOCK), (gy1, zu(gy1)), (gy1, gtop + 50), (0, gtop + 50)]
prism("DACH", "Gaube Wange West", "x", g["x0"], g["x0"] + 120, side, "wall", g["tag"])
prism("DACH", "Gaube Wange Ost", "x", g["x1"] - 120, g["x1"], side, "wall", g["tag"])
# Gaubendach (leicht geneigt, 5°)
gd = [(-300, gtop + 50), (gy1 + 200, gtop + 50 + (gy1 + 500) * math.tan(math.radians(5))),
      (gy1 + 200, gtop + 250 + (gy1 + 500) * math.tan(math.radians(5))), (-300, gtop + 250)]
prism("DACH", "Gaubendach", "x", g["x0"] - 200, g["x1"] + 200, gd, "roof", g["tag"])

# ------------------------------------------------------------------ Treppen (Stufenblöcke)
for s in m.STAIRS:
    layer = "KG" if s["z0"] < 0 else "EG"
    sx, sy = (1, 0) if s["direction"] == "+x" else (-1, 0) if s["direction"] == "-x" else (0, 1) if s["direction"] == "+y" else (0, -1)
    for i in range(s["steps"]):
        zt = s["z0"] + (i + 1) * s["rise"]
        zb = s["z0"] + max(i - 1, 0) * s["rise"]     # Stufenblock reicht 2 Steigungen tief (Untersicht)
        if sx:
            x = s["x0"] + (i * s["run"] if sx > 0 else -(i + 1) * s["run"])
            box(layer, s["name"], x, s["y0"], zb, s["run"], s["width"], zt - zb, "stair", s["tag"])
        else:
            y = s["y0"] + (i * s["run"] if sy > 0 else -(i + 1) * s["run"])
            box(layer, s["name"], s["x0"], y, zb, s["width"], s["run"], zt - zb, "stair", s["tag"])
for l in m.LANDINGS:
    box("KG", l["name"], l["x0"], l["y0"], l["z"] - 150, l["x1"] - l["x0"], l["y1"] - l["y0"], 150, "stair", l["tag"])

# ------------------------------------------------------------------ Garage: Dach + Boden + Zwischendach
gpts = [(m.GAR_Y[0] - 300, m.garage_roof_z(m.GAR_Y[0] - 300)), (m.GAR_Y[1] + 300, m.garage_roof_z(m.GAR_Y[1] + 300)),
        (m.GAR_Y[1] + 300, m.garage_roof_z(m.GAR_Y[1] + 300) + 220), (m.GAR_Y[0] - 300, m.garage_roof_z(m.GAR_Y[0] - 300) + 220)]
prism("GAR", "Garagendach (4 %, Lagenpappe)", "x", m.GAR_X[0] - 300, 0, gpts, "roof", "B")
box("GAR", "Garagenboden", m.GAR_X[0], m.GAR_Y[0], m.GAR_Z0 - 160, m.GAR_X[1] - m.GAR_X[0], m.GAR_Y[1] - m.GAR_Y[0], 160, "slab", "B")
box("GAR", "Vordach Garagen (8000×2500)", m.GAR_X[0], m.GAR_Y[0] - 2500, m.GAR_Z0 + m.GAR_H_FRONT, 8000, 2500, 200, "roof", "A")

# ------------------------------------------------------------------ Export JSON + HTML
scene = dict(prims=prims, meta=dict(house_w=m.HOUSE_W, house_d=m.HOUSE_D, ridge=zu(ridge_y)))
json.dump(scene, open("scene_legacy.json", "w"))
print(len(prims), "Primitive")

# Wandtabelle
def nm(s): return s.replace("|", "/")
rows = ["| Geschoss | Wand | x von | x bis | y von | y bis | Dicke | Länge | Konf. |", "|---|---|---|---|---|---|---|---|---|"]
for w in sorted(m.WALLS, key=lambda w: (["KG","EG","OG","GAR"].index(w["floor"]), w["name"])):
    dx, dy = w["x1"] - w["x0"], w["y1"] - w["y0"]
    th, ln = (dy, dx) if dx >= dy else (dx, dy)
    rows.append(f'| {w["floor"]} | {nm(w["name"])} | {w["x0"]} | {w["x1"]} | {w["y0"]} | {w["y1"]} | {th} | {ln} | {w["tag"]} |')
rows2 = ["| Geschoss | Wand | Art | Breite | von | bis | Brüstung | Höhe | Konf. |", "|---|---|---|---|---|---|---|---|---|"]
wl = {(w["floor"], w["name"]): w for w in m.WALLS}
art = {"door": "Tür", "window": "Fenster", "loggia": "offen"}
for o in sorted(m.OPENINGS, key=lambda o: (["KG","EG","OG","GAR"].index(o["floor"]), o["wall"], o["a0"])):
    w = wl[(o["floor"], o["wall"])]
    along = (w["x1"] - w["x0"]) >= (w["y1"] - w["y0"])
    a = (w["x0"] if along else w["y0"]) + o["a0"]
    rows2.append(f'| {o["floor"]} | {nm(o["wall"])} | {art[o["kind"]]} | {o["width"]} | {"x" if along else "y"} {a} | {a + o["width"]} | {o["sill"]} | {o["height"]} | {o["tag"]} |')
md = f"""# Wand- und Öffnungstabelle – Haus Tirschenreuth (Modell v0.19)

Koordinaten in mm. x = 0 Westkante Außenwand (Garagenseite), y = 0 Südkante (Straße), z = 0 OK Rohdecke EG.
Wände als Grundrissrechtecke (Außenkante zu Außenkante). Öffnungen mit absoluter Lage entlang der Wand.
Konfidenz: **A** = Maßkette/Scan gesichert · **B** = abgeleitet · **C** = Annahme, bitte prüfen.

## Strukturraster
- Ost-West: Westwand 0–365 · Tragwand 4875–5115 (nur nördlich der Südräume) · Tragwand 8375–8615 · Ostwand 12875–13240
- Nord-Süd West/Mitte: Südwand 0–365 · Tragwand 4875–5115 · Tragwand 7375–7615 (KG durchgehend, EG nur West) · Nordwand 11455–11820
- Nord-Süd KG-Ostspalte: Schlafzimmer-Nordwand 4125–4365 · Bad-Nordwand 7000–7240 · Obst/Keller2/Öllager-Südwand 8850–8965
- OG: Leichtwände 120 bei x 4995–5115, 6125–6245 (Treppe), 7045–7165, 9000–9120 (Nordreihe), 9375–9495 (Südreihe); Mittelwand y 5505–5625
- Geschosshöhe roh 2750, Decken 140, Kniestock 650, Dach 36°, First UK Sparren ≈ +{zu(ridge_y)/1000:.2f} m

## Wände ({len(m.WALLS)})
{chr(10).join(rows)}

## Öffnungen ({len(m.OPENINGS)})
{chr(10).join(rows2)}

## Bekannte Lücken
- Brüstungshöhen überall angenommen (900 / 1800 Kellerfenster) – Ansichten oder Aufmaß nötig
- OG: G/DU-Trennwand und DU-Tür Annahme; Abstellwand Treppenkopf 10000 (gestrichelte Doppellinie 10000/10250)
- EG: Wohnzimmer-Westfenster? (aktuell keins), Haustür-Lage im Podest (y 5700–6700)
- Garage: Lage in y geschätzt; Zwischendach fehlt
"""
open("Wandtabelle_v0.1.md", "w").write(md)
