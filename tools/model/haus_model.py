"""
Haus Tirschenreuth - Geometriedatenbasis (alle Maße in mm)

Koordinatensystem:
  x = 0 an der westlichen Außenwand-Außenkante, positiv nach Osten (Richtung Bad/Öllager)
  y = 0 an der südlichen Außenwand-Außenkante (Straßenseite), positiv nach Norden (Garten)
  z = 0 = OK Rohdecke EG (±0.000 im Plan). KG-Rohfußboden = -2750, OG-Rohfußboden = +2750

Quelle: Pläne Heinz Schaar, Jan 1967 (Blatt 2 KG, 3 EG, 4 OG, 5 Schnitte), Maßketten ausgelesen.
Konfidenz-Tags: A = Maßkette direkt gelesen, B = aus Maßkette abgeleitet, C = Annahme/geschätzt
"""
import math

# ---------------------------------------------------------------- Grundparameter
HOUSE_W = 13240          # A  Außenmaß Ost-West
HOUSE_D = 11820          # A  Außenmaß Nord-Süd (Schnitt: 11.820)
T_OUT = 365              # A  Außenwand
T_LOAD = 240             # A  tragende Innenwand
T_PART = 115             # A  nichttragende Wand KG/EG
T_PART_DG = 120          # A  Leichtwand OG
SLAB = 140               # A  Stahlbetondecke
STOREY = 2750            # A  Geschosshöhe roh
KNIESTOCK = 650          # A  (Doku) OK OG-Rohdecke bis Traufe
ROOF_PITCH = 36.0        # A
ROOF_OVERHANG = 500      # C  Dachüberstand Traufe
ROOF_T = 200             # C  Dachpaket (Sparren 160 + Schalung/Deckung)
OG_CEIL = 2750 + 2590    # B  OK Holzbalkendecke Spitzboden (rechnerisch 2.590 lichte Höhe roh)

Z_KG = -STOREY           # -2750
Z_EG = 0
Z_OG = STORY = STOREY    # 2750

# Strukturachsen (Wand-Kanten, aus den Maßketten) -------------------------------
# Ost-West-Raster (x):
X_W_OUT = (0, T_OUT)                       # 0-365   Westwand
X_LOAD1 = (4875, 5115)                     # A  240er Wand (KG/EG)  Schlafzi|Diele
X_LOAD2 = (8375, 8615)                     # A  240er Wand (KG/EG)  Wohnzi|Essküche bzw. Keller2|Öllager
X_E_OUT = (HOUSE_W - T_OUT, HOUSE_W)       # 12875-13240 Ostwand
# Nord-Süd-Raster (y):
Y_S_OUT = (0, T_OUT)                       # Südwand
Y_LOAD_S = (4875, 5115)                    # A  240er Wand Südräume|Diele  (365+4510)
Y_LOAD_N = (7375, 7615)                    # A  240er Wand Diele|Nordräume (5115+2260)
Y_N_OUT = (HOUSE_D - T_OUT, HOUSE_D)       # 11455-11820 Nordwand

def tan_roof():
    return math.tan(math.radians(ROOF_PITCH))

def roof_z_under(y):
    """Unterkante Sparren bei y (Traufpunkt an Innenkante Außenwand, Kniestock 650)."""
    eave = Z_OG + KNIESTOCK
    d = min(y, HOUSE_D - y) - T_OUT
    return eave + tan_roof() * d

# ---------------------------------------------------------------- Wände
# Jede Wand: (floor, name, x0, y0, x1, y1, tag)   -> Grundrissrechteck, Höhe = Geschoss
# floor: "KG" | "EG" | "OG" | "GAR"
WALLS = []
def W(floor, name, x0, y0, x1, y1, tag="A"):
    WALLS.append(dict(floor=floor, name=name, x0=min(x0,x1), y0=min(y0,y1),
                      x1=max(x0,x1), y1=max(y0,y1), tag=tag))

def outer_walls(floor):
    W(floor, "Außenwand Süd",  0, 0, HOUSE_W, T_OUT)
    W(floor, "Außenwand Nord", 0, HOUSE_D - T_OUT, HOUSE_W, HOUSE_D)
    W(floor, "Außenwand West", 0, 0, T_OUT, HOUSE_D)
    W(floor, "Außenwand Ost",  HOUSE_W - T_OUT, 0, HOUSE_W, HOUSE_D)

def load_walls(floor):
    # Querwände (Nord-Süd) 240
    if floor == "KG":   # KG: im Kellerflur-Band (7615–9135) keine Wand (Thomas)
        W(floor, "Tragwand x=4875 (Diele West)", X_LOAD1[0], Y_LOAD_S[0], X_LOAD1[1], Y_LOAD_N[1])
        W(floor, "Tragwand x=4875 (Obst|Keller2)", X_LOAD1[0], 8850, X_LOAD1[1], HOUSE_D)
    else:
        W(floor, "Tragwand x=4875 (Diele West)", X_LOAD1[0], Y_LOAD_S[0], X_LOAD1[1], HOUSE_D)   # nur nördlich der Südräume (Wohnzimmer 8010 durchgehend)          # A – durchgehend KG/EG
    W(floor, "Tragwand x=8375 (Diele Ost)",  X_LOAD2[0], 0, X_LOAD2[1], HOUSE_D)          # A – durchgehend KG/EG
    # Längswände (Ost-West) 240
    if floor == "EG":
        W(floor, "Tragwand y=4875 (Süd)", 0, Y_LOAD_S[0], X_LOAD2[1], Y_LOAD_S[1])   # EG: Essküche durchgehend (2730–7035)
    else:   # KG: Ostspalte eigenes Raster – Schlafzimmer 3760 tief (Scan + Doku)
        W(floor, "Tragwand y=4875 (Süd)", 0, Y_LOAD_S[0], X_LOAD2[1], Y_LOAD_S[1])
        W(floor, "Schlafzimmer Nord 240", X_LOAD2[1], 4125, HOUSE_W - T_OUT, 4365, "A")
    if floor == "EG":
        W(floor, "Tragwand y=7375 (Nord)", 0, Y_LOAD_N[0], X_LOAD1[0], Y_LOAD_N[1])   # EG: nur West (Diele offen bis Nordwand)
    else:   # KG: Ostspalte – Bad 2635 tief, Nordwand bei 7000 (Scan)
        W(floor, "Tragwand y=7375 (Nord)", 0, Y_LOAD_N[0], X_LOAD2[1], Y_LOAD_N[1])
        W(floor, "Bad/Flur Nord 240", X_LOAD2[1], 7000, HOUSE_W - T_OUT, 7240, "A")

# -------- KG (Blatt 2) ----------------------------------------------------------
outer_walls("KG"); load_walls("KG")
W("KG", "Essküche|Wohnzimmer 115",   2750, T_OUT, 2865, Y_LOAD_S[0], "A")       # 365+2385
W("KG", "Keller1|Obst 115",          3625, Y_LOAD_N[1], 3740, HOUSE_D - T_OUT, "A")     # durchgehend bis Tragwand (Thomas)
W("KG", "Obst Süd 115",              3740, 8850, X_LOAD1[0], 8965, "B")          # eine Linie mit Keller2/Öllager (Scan ≈8850–8965)
W("KG", "Keller2 Süd 115",           X_LOAD1[1], 8850, X_LOAD2[0], 8965, "B")   # Keller2 ≈2490 tief (Scan; Doku 2580)
W("KG", "Öllager|Heizung 115",       X_LOAD2[1], 8850, HOUSE_W - T_OUT, 8965, "B")  # Öllager ≈2490, Heizung ≈1610 (Scan)
W("KG", "Flur|Bad 115",              8615+1635, 4365, 8615+1635+115, 7000, "A")  # x=10250, Bad-Band 4365–7000

# -------- EG (Blatt 3) ----------------------------------------------------------
outer_walls("EG"); load_walls("EG")
W("EG", "Loggia Ytong 115",          X_LOAD2[1], 2615, HOUSE_W - T_OUT, 2730, "B")   # Loggia 2250 tief
W("EG", "Essküche|Speise 115",       X_LOAD2[1], 6920, HOUSE_W - T_OUT, 7035, "B")   # Speise 1670 tief (Südwand Gard/WC/Speise)
W("EG", "Speise|Bad 115",            X_LOAD2[1], 8705, HOUSE_W - T_OUT, 8820, "A")   # Bad 2635 tief; Gard geschlossen (rosa)
W("EG", "Kamin Speise", 12500, 7035, HOUSE_W - T_OUT, 7535, "C")
W("EG", "WC|Speise 115",             10750, 7035, 10865, 8705, "A")               # rosa bei x≈10750; Speise 2010 breit (Kette)
W("EG", "Gard|WC 115",               X_LOAD2[1]+315, 7035, X_LOAD2[1]+315+115, 8705, "A")   # Kette 315 (rosa bei x≈8930)
W("EG", "Flur|Bad 115",              10250, 8820, 10365, HOUSE_D - T_OUT, "A")

# -------- OG (Blatt 4) – Leichtwände 120 ----------------------------------------
# Räume reichen bis zu den Außenwänden; im Plan sind Wände unter der Dachschräge gestrichelt (unter Schnittebene).
# Ketten: oben 365|4630|120|1010|120|2755|120|3755|365 (Nordreihe) ; unten 365|4630|120|4260|120|3380|365 (Südreihe)
outer_walls("OG")
XO1 = (4995, 5115)   # A  Westspalte | Mitte
XO2 = (9375, 9495)   # A  Kind3 | HWR (Südreihe) – reicht bis Kamin y 7150
XO3 = (9000, 9120)   # A  WC/Abst | Wäscheboden (Nordreihe)
Y_AB_S = (1385, 1505)  # A  Abseitenwand Süd (365+1020|120)
Y_AB_N = (9665, 9785)  # B  Abseitenwand Nord (Kind1 4040 ab Mittelwand; Scan)
Y_K3 = (4375, 4495)  # A  Kind3-Nordwand = Diele-Südkante
Y_MID = (5505, 5625) # A  Mittellinie: Kind1|Kind2 und HWR|Wäscheboden (Pfeiler 5445–5685)
Y_DN = (6630, 6750)  # A  Diele-Nordkante (G/WC-Südwand)
X_ST = (6125, 6245)  # A  Treppe (1010 breit) | G/DU/Abst
X_GD = (7045, 7165)  # A  G/DU | WC  (800|120)
Y_GD = (7300, 7420)  # B  G | DU (Scan)
Y_WC = (8370, 8490)  # B  DU/WC | Abst (Scan; Kette 1760 ergäbe 8510)
# Abstellwände (gestrichelt, in der Seitenkette bemaßt) nur in Kind 2, HWR und Kind 1 (Thomas); Wäscheboden und Mittelspalte offen bis Außenwand
W("OG", "Abstellwand Kind2 120",      T_OUT, Y_AB_S[0], XO1[0], Y_AB_S[1], "A")
W("OG", "Abstellwand HWR 120",        XO2[1], Y_AB_S[0], HOUSE_W - T_OUT, Y_AB_S[1], "A")
W("OG", "Abstellwand Kind1 120",      T_OUT, Y_AB_N[0], XO1[0], Y_AB_N[1], "B")
W("OG", "Abstellwand Treppenkopf 120", XO1[1], 10000, X_ST[0], 10120, "B")   # gestrichelt bei y≈10000, etwas nördlich von Kind 1 (Thomas)
W("OG", "Westspalte | Mitte 120",     XO1[0], T_OUT, XO1[1], HOUSE_D - T_OUT, "A")
W("OG", "Kind3 | HWR 120",            XO2[0], T_OUT, XO2[1], 7150, "A")
W("OG", "Kamin",                      XO3[0], Y_DN[0], XO2[1], 7150, "A")
W("OG", "WC/Abst | Wäscheboden 120",  XO3[0], Y_DN[0], XO3[1], HOUSE_D - T_OUT, "A")
W("OG", "Kind1 | Kind2 120",          T_OUT, Y_MID[0], XO1[0], Y_MID[1], "A")
W("OG", "HWR | Wäscheboden 120",      XO2[1], Y_MID[0], HOUSE_W - T_OUT, Y_MID[1], "A")
W("OG", "Kind3 Nord 120",             XO1[1], Y_K3[0], XO2[0], Y_K3[1], "A")
W("OG", "WC Süd 120",                 X_GD[0], Y_DN[0], XO3[0], Y_DN[1], "A")     # G offen zur Diele
W("OG", "Treppe | G/DU/Abst 120",     X_ST[0], Y_DN[0], X_ST[1], HOUSE_D - T_OUT, "A")
W("OG", "G/DU | WC 120",              X_GD[0], Y_DN[1], X_GD[1], Y_WC[0], "A")
W("OG", "G | DU 120",                 X_ST[1], Y_GD[0], X_GD[0], Y_GD[1], "B")
W("OG", "DU/WC | Abst 120",           X_ST[1], Y_WC[0], XO3[0], Y_WC[1], "B")

# -------- Garage (Blatt 2/3/5) ----------------------------------------------------
GAR_X = (-8000, -1510)   # A  Garage 6490 breit, Zwischenbereich 1510
GAR_Y = (5100, 12090)    # C  Lage in y geschätzt (6990 tief)
GAR_Z0 = -1360           # A  OK Rohboden -1.360
GAR_H_FRONT = 2600       # A
GAR_H_BACK = 2300        # A
W("GAR", "Garage Süd",  GAR_X[0], GAR_Y[0], GAR_X[1], GAR_Y[0]+240)
W("GAR", "Garage Nord", GAR_X[0], GAR_Y[1]-240, GAR_X[1], GAR_Y[1])
W("GAR", "Garage West", GAR_X[0], GAR_Y[0], GAR_X[0]+240, GAR_Y[1])
W("GAR", "Garage Ost",  GAR_X[1]-240, GAR_Y[0], GAR_X[1], GAR_Y[1])

# ---------------------------------------------------------------- Öffnungen
# (floor, wall_name, kind, a0, width, sill, height, tag)
# a0 = Abstand entlang der Wand ab x0 (bei Ost-West-Wand) bzw. ab y0 (bei Nord-Süd-Wand)
OPENINGS = []
def O(floor, wall, kind, a0, width, sill, height, tag="C"):
    OPENINGS.append(dict(floor=floor, wall=wall, kind=kind, a0=a0, width=width,
                         sill=sill, height=height, tag=tag))

# EG Süd (Kette: 365|1370|5510/1385|1370|365 ; Loggia 1625|1010/2135|1625)
O("EG", "Außenwand Süd", "window", 1735, 5510, 700, 1385, "A")     # Wohnzimmer 5510×1385 (Brüstung C)
O("EG", "Außenwand Süd", "loggia", 8980, 3895, 0, 2610, "A")       # Loggia offen zw. Pfeiler 8615–8980 und Eckpfeiler 12875
# EG Nord (Kette: 1300|2510/1260|…|3260/2135|4865)
O("EG", "Außenwand Nord", "window", 1665, 2510, 900, 1260, "A")    # Schlafzimmer 2510×1260 (Brüstung C)
O("EG", "Außenwand Nord", "window", 5115, 3260, 0, 2135, "A")    # Diele: Glaselement 3260×2135 (Gartentür + Seitenteile)
# EG West
O("EG", "Außenwand West", "window", 1900, 1700, 900, 1260, "C")    # Wohnzimmer (HK) – Lage/Breite aus Bild
O("EG", "Außenwand West", "door",   5700, 1000, 0, 635, "A")        # Haustür oberer Teil (Sturz bei +0.635)
O("KG", "Außenwand West", "door",   5700, 1000, 1375, 1235, "A")     # Haustür (OK Podest -1.375, Höhe 2010) – Lage y im Podest (B)
# EG Ost
O("EG", "Außenwand Ost", "loggia",  365, 2250, 0, 2610, "A")       # Loggia Ostseite offen (Brüstung separat)
O("EG", "Außenwand Ost", "window", 6920-1260, 1260, 900, 1260, "B")   # Essküche: Fenster 1260 direkt südl. der Speisewand (rosa-Lücke)
O("EG", "Außenwand Ost", "window", 8820+115, 1260, 900, 1260, "B")    # Bad: 115 | Fenster 1260 | 1260 (rosa-Lücke y≈9000–10400)
# EG innen (Türen)
O("EG", "Tragwand y=4875 (Süd)", "door", 5115+685, 1885, 0, 2010, "A")  # Wohnzimmer|Diele Doppeltür 685|1885|690
O("EG", "Tragwand x=8375 (Diele Ost)", "door", 5115+125, 885, 0, 2010, "A")   # Diele|Essküche y 5240–6125 (rosa-Lücke 5200–6100)
O("EG", "Tragwand x=4875 (Diele West)", "door", 7375-1125-1010-4875, 1010, 0, 2010, "A")  # Treppenhaus|Diele y 5240–6250 (1125|1010 ab Nord, Thomas)
O("EG", "Tragwand x=8375 (Diele Ost)", "loggia", 9200, 1400, 0, 2135, "B")   # Diele→Flur: offener Durchgang 1400 (rosa-Lücke 9200–10600, "Flur wie Diele")
O("EG", "Tragwand x=4875 (Diele West)", "door", HOUSE_D-T_OUT-885-4875, 885, 0, 2010, "B")  # Diele|Schlafzimmer, an der Nordwand (rosa-Lücke 11275–11455)
O("EG", "Essküche|Speise 115", "door", 10865 - X_LOAD2[1], 760, 0, 2010, "B")  # Speisetür direkt an der WC-Wand (rosa-Lücke 10815–11615, Türschwung)
O("EG", "Speise|Bad 115", "door", 8930+315-X_LOAD2[1], 760, 0, 2010, "A")    # Flur|WC: 315|760|560 ab Gard-Wand (rosa-Lücke 9415–10015)
O("EG", "Tragwand x=8375 (Diele Ost)", "loggia", 7035, 1670, 0, 2610, "A")   # Garderobe offen zur Diele (Thomas)
O("EG", "Flur|Bad 115", "door", 880, 760, 0, 2010, "B")                        # Flur|Bad y 9700–10460
O("EG", "Loggia Ytong 115", "door", 1700, 1010, 0, 2135, "B")                    # Essküche|Loggia
O("EG", "Tragwand x=8375 (Diele Ost)", "door", 540, 1010, 0, 2135, "B")    # Wohnzimmer|Loggia (rosa-Lücke y 400–1200; Kette 490|175|1010)
# KG (Süd-Kette ab x=0: 1370|1375/1260|4135/1260|1370|365 ; 1125|2010/1260|1125 ; Nord: 2155|800/600|2890|800/600|6595)
O("KG", "Außenwand Süd", "window", 1370, 1375, 900, 1260, "A")     # Essküche (Brüstung C)
O("KG", "Außenwand Süd", "window", 2865, 4015, 900, 1260, "A")     # Wohnzimmer (Kette 4135 ab 2745, an Wand gekürzt)
O("KG", "Außenwand Süd", "window", 9740, 2010, 900, 1260, "A")     # Schlafzimmer 1125|2010
O("KG", "Außenwand Nord", "window", 2155, 800, 1800, 600, "A")     # Keller 1
O("KG", "Außenwand Nord", "window", 5845, 800, 1800, 600, "A")     # Keller 2
O("KG", "Außenwand Ost", "window", 5300, 1260, 900, 1260, "B")     # Bad 1260×1260
O("KG", "Außenwand Ost", "window", 7700, 800, 1800, 600, "B")      # Heizung 800×600
O("KG", "Außenwand Ost", "window", 9100, 800, 1800, 600, "B")      # Öllager 800×600 (ZL)
O("KG", "Tragwand y=4875 (Süd)", "door", 6200, 1010, 0, 2610, "B")   # Diele|Wohnzimmer raumhoch
O("KG", "Schlafzimmer Nord 240", "door", 625, 885, 0, 2010, "A")    # Flur|Schlafzimmer (625|885)
O("KG", "Essküche|Wohnzimmer 115", "door", 2615-T_OUT, 760, 0, 2010, "B")  # 1500|760|2250
O("KG", "Flur|Bad 115", "door", 950, 760, 0, 2010, "B")             # Flur|Bad y 5315–6075 (Scan)
O("KG", "Obst Süd 115", "door", 30, 760, 0, 2010, "A")                # 30|760|345
O("KG", "Keller2 Süd 115", "door", 625, 885, 0, 2010, "A")      # 625|885 Kellerflur|Keller2
O("KG", "Keller1|Obst 115", "door", 385, 885, 0, 2010, "B")            # Kellerflur|Keller1 y 8000–8885 (Scan)
O("KG", "Öllager|Heizung 115", "door", 375, 885, 0, 2010, "A")  # 375|885
O("KG", "Tragwand y=7375 (Nord)", "door", X_LOAD1[0]-60-1010, 1010, 0, 2010, "A")  # Treppenhaus|Kellerflur (1010|60), keine Tür Diele|Kellerflur (Thomas)
O("KG", "Tragwand x=4875 (Diele West)", "door", 5275-4875, 1010, 0, 2010, "B")   # Treppenhaus|Diele y 5275–6285 am Südlauf (Scan)
O("KG", "Tragwand x=8375 (Diele Ost)", "door", 5400, 885, 0, 2010, "B")     # Diele|Flur y 5400–6285 (Scan)
O("KG", "Tragwand x=8375 (Diele Ost)", "door", 7900, 700, 0, 2010, "C")     # Kellerflur|Heizung (700)
# OG Türen (a0 relativ zum Wandanfang)
O("OG", "Westspalte | Mitte 120", "door", 4560-T_OUT, 885, 0, 2010, "A")   # Diele|Kind2  y 4560–5445
O("OG", "Westspalte | Mitte 120", "door", 5685-T_OUT, 885, 0, 2010, "A")   # Diele|Kind1  y 5685–6570
O("OG", "Kind3 | HWR 120",        "door", 4560-T_OUT, 885, 0, 2010, "A")   # Diele|HWR
O("OG", "Kind3 | HWR 120",        "door", 5685-T_OUT, 885, 0, 2010, "A")   # Diele|Wäscheboden
O("OG", "WC/Abst | Wäscheboden 120", "door", 8650-Y_DN[0], 750, 0, 2010, "B")  # Wäscheboden|Abst y 8650–9400 (Scan)
O("OG", "Kind3 Nord 120", "door", 1125, 885, 0, 2010, "A")                  # 1125|885
O("OG", "WC Süd 120", "door", 120, 760, 0, 2010, "A")                        # 800|120|760|955 → x 7165–7925
O("OG", "G/DU | WC 120", "door", 7500-Y_DN[1], 760, 0, 2010, "C")            # DU vom WC aus (Annahme)
# OG (Giebel)
O("OG", "Außenwand West", "door",   5685, 2010, 0, 2135, "A")      # Balkontür Kind 1 (Doppeltür 2010, y 5685–7695)
O("OG", "Außenwand West", "door",   3435, 2010, 0, 2135, "A")      # Balkontür Kind 2 (y 3435–5445)
O("OG", "Außenwand Ost", "window",  4310, 1135, 900, 1300, "A")    # HWR (Breite A, Höhe C)
O("OG", "Außenwand Ost", "window",  5685, 1135, 900, 1300, "A")    # Wäscheboden (Breite A, Höhe C)
# Garage
O("GAR", "Garage Süd", "door", 240+365, 2300, 0, 2100, "A")        # Tor 1
O("GAR", "Garage Süd", "door", 240+365+2300+365, 2300, 0, 2100, "A")  # Tor 2

# ---------------------------------------------------------------- Gaube (Blatt 4/5)
GAUBE = dict(x0=4995, x1=9495, depth=2250, wall_h=2200, windows=[(1020,60)]*4, tag="B")
# Balkon West (OG), Loggia-Brüstung (EG)
BALKON = dict(x0=-1300, x1=0, y0=3035, y1=8095, tag="A")   # 400|2010|240|2010|400 = 5060 lang, 1300 tief
LOGGIA_PARAPETS = [dict(x0=8980, x1=10605, y0=0, y1=240, h=1010, tag="A"), dict(x0=11615, x1=12875, y0=0, y1=240, h=1010, tag="A"),
                   dict(x0=13000, x1=13240, y0=365, y1=2615, h=1010, tag="B")]   # Süd 1625|1010 Durchgang|1625, Ost

# ---------------------------------------------------------------- Treppen (vereinfacht)
# Bürkle-Fertigteiltreppe im Treppenhaus West (KG→EG, EG→OG-Bereich): 2×8 Stg 172/270, Podest
STAIRS = [
    # Bürkle-Fertigteiltreppe KG→EG, Treppenhaus West: 2×8 Stg 172/270, Podest West bei -1375 (A)
    dict(name="Treppe KG→EG Lauf 1", x0=3360, y0=6275, width=1000, steps=8, rise=171.875, run=270, z0=Z_KG, direction="-x", tag="A"),
    dict(name="Treppe KG→EG Lauf 2", x0=1200, y0=5215, width=1000, steps=8, rise=171.875, run=270, z0=Z_KG+1375, direction="+x", tag="A"),
    # Holztreppe EG→OG in der Diele, gerader Lauf nach Norden, 16 Stg 172/270 (B)
    dict(name="Holztreppe EG→OG", x0=5115, y0=10620, width=1010, steps=16, rise=171.875, run=270, z0=Z_EG, direction="-y", tag="A"),  # 900 nach Norden (Thomas): Antritt Nord y=10620, Austritt Süd y=6300  # Antritt Nord, Austritt Süd (Thomas)
]
LANDINGS = [
    dict(name="Podest Treppe KG→EG (OK -1375)", x0=T_OUT, y0=5215, x1=1200, y1=7275, z=Z_KG+1375, tag="A"),
]
# Deckenöffnungen (Treppenaugen): (Geschoss der Decke, x0,y0,x1,y1)
SLAB_OPENINGS = {
    "EG": (0, Y_LOAD_S[1], 3360, Y_LOAD_N[0]),         # Decke über KG: Treppenhaus (bis Außenkante, Haustür)
    "OG": (5115, 6300, 6125, 9660),                    # Decke über EG: Treppenauge 1010 breit
}

FLOORS = {
    "KG": dict(z0=Z_KG, h=STOREY - SLAB),
    "EG": dict(z0=Z_EG, h=STOREY - SLAB),
    "OG": dict(z0=Z_OG, h=KNIESTOCK),        # Außenwände OG; Innen-/Giebelwände werden ans Dach geschnitten
    "GAR": dict(z0=GAR_Z0, h=GAR_H_BACK),
}

def wall_height(w):
    """Höhe einer Wand; OG-Innen- und Giebelwände bis Dachunterkante (Profil), sonst Geschoss."""
    f = FLOORS[w["floor"]]
    if w["floor"] == "OG":
        if w["name"] in ("Außenwand Süd", "Außenwand Nord"):
            return KNIESTOCK
        return None   # Profil, siehe og_wall_profile
    if w["floor"] == "GAR":
        return None
    return f["h"]

def og_wall_profile(w, step=200):
    """Für OG-Wände: Polygon (u,z) entlang der Wand-Längsrichtung, oben durch Dachunterkante begrenzt.
    u läuft entlang y (bei Nord-Süd-Wand) bzw. konstant (Ost-West-Wand → Rechteck)."""
    z0 = Z_OG
    ztop = OG_CEIL
    if (w["y1"] - w["y0"]) > (w["x1"] - w["x0"]):   # Nord-Süd-Wand → Giebelprofil
        ys = list(range(int(w["y0"]), int(w["y1"]), step)) + [w["y1"]]
        pts = [(w["y0"], z0), (w["y1"], z0)]
        for y in reversed(ys):
            pts.append((y, min(roof_z_under(y), ztop)))
        return "y", pts
    else:                                            # Ost-West-Wand → Rechteck
        ymid = (w["y0"] + w["y1"]) / 2
        zt = min(roof_z_under(ymid), ztop)
        return "x", [(w["x0"], z0), (w["x1"], z0), (w["x1"], zt), (w["x0"], zt)]

def garage_roof_z(y):
    # 4 % Gefälle, vorne (Süd, Tore) 2600 hoch, hinten 2300
    t = (y - GAR_Y[0]) / (GAR_Y[1] - GAR_Y[0])
    return GAR_Z0 + GAR_H_FRONT + (GAR_H_BACK - GAR_H_FRONT) * t

if __name__ == "__main__":
    for w in WALLS: print(w)
    print("Firsthöhe UK Sparren:", roof_z_under(HOUSE_D/2))
