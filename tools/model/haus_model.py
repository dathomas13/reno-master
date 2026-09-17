"""
Haus Tirschenreuth - Geometriedatenbasis (alle Maße in mm)

Koordinatensystem:
  x = 0 an der westlichen Außenwand-Außenkante, positiv nach Osten (Richtung Bad/Öllager)
  y = 0 an der südlichen Außenwand-Außenkante (Straßenseite), positiv nach Norden (Garten)
  z = 0 = OK Rohdecke EG (±0.000 im Plan). KG-Rohfußboden = -2750, OG-Rohfußboden = +2750

Quellen:
  EG  = eigenes Aufmaß Thomas 09/2026, DXF "Grundriss_EG_Bestand_Fertigmasse".
        **Fertigmaße inklusive Putz.** Jede Wandkante, jede Öffnung und die Treppen
        stammen aus dieser Zeichnung; die Raumstempel darin stimmen mit rooms_ist.py
        überein. Das Haus ist ~30 cm kürzer gebaut als 1967 geplant (12.995 statt
        13.240); die Gebäudetiefe passt (11.815 statt 11.820).
  KG  = Pläne Heinz Schaar, Jan 1967 (Blatt 2), **auf das EG-Aufmaß gesetzt**: die
        tragenden Wände stehen jetzt genau unter denen des EG, die nichttragenden 115er
        behalten ihren gemessenen Abstand zur jeweils tragenden Nachbarwand. Das KG ist
        damit abgeleitet, nicht aufgemessen -> Konfidenz B/C.
  OG  = Pläne Blatt 4, unverändert bis auf die Außenmaße (die folgen HOUSE_W/HOUSE_D
        und T_OUT). Die Innenwände stehen noch auf dem Rohbauraster von 1967.

Konfidenz-Tags: A = gemessen bzw. Maßkette direkt gelesen, B = abgeleitet, C = Annahme
"""
import math

# ---------------------------------------------------------------- Grundparameter
HOUSE_W = 12995          # A  Außenmaß Ost-West (Aufmaß 09/2026, Fertigmaß)
HOUSE_D = 11815          # A  Außenmaß Nord-Süd (Aufmaß 09/2026, Fertigmaß)
T_OUT = 400              # A  Außenwand 36,5 + Putz
T_LOAD = 270             # A  tragende Innenwand 24 + Putz
T_LOAD_E = 260           # A  Ostwand Diele (lt. Bauherr 26)
T_PART = 115             # B  nichttragende Wand KG (Rohbau 1967, nicht aufgemessen)
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

# Loggia-Vorsprung: die beiden Wandscheiben neben der Loggia springen 125 nach Süden vor
# (Plan 1967, im Aufmaß bestätigt). Südlichster Punkt des Gebäudes.
Y_VOR = -125             # A
# Bauwerkshülle für die Raumprüfung (build_rooms.py)
ENVELOPE = (0, Y_VOR, HOUSE_W, HOUSE_D)

# Strukturachsen (Wandkanten aus dem EG-Aufmaß) --------------------------------
# Ost-West-Raster (x):
X_W_OUT = (0, T_OUT)                       # 0-400     Westwand
X_LOAD1 = (4745, 5015)                     # A  270er Wand  Treppenhaus|Diele bzw. Schlafzi
X_LOAD2 = (8245, 8505)                     # A  260er Wand  Wohnzi/Diele|Essküche
X_E_OUT = (HOUSE_W - T_OUT, HOUSE_W)       # 12595-12995 Ostwand
# Nord-Süd-Raster (y):
Y_S_OUT = (0, T_OUT)                       # Südwand
Y_LOAD_S = (4860, 5130)                    # A  270er Wand Wohnzimmer|Treppenhaus/Diele
Y_LOAD_N = (7365, 7635)                    # A  270er Wand Treppenhaus|Schlafzimmer
Y_N_OUT = (HOUSE_D - T_OUT, HOUSE_D)       # 11415-11815 Nordwand

# KG: Linie der drei 115er Wände im Nordband (Obst | Keller 2 | Öllager).
# Die Räume nördlich davon sind 2490 tief (Scan 1967), gemessen ab Innenkante Nordwand.
Y_KG_BAND = HOUSE_D - T_OUT - 2490 - T_PART   # 8810


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
    WALLS.append(dict(floor=floor, name=name, x0=min(x0, x1), y0=min(y0, y1),
                      x1=max(x0, x1), y1=max(y0, y1), tag=tag))


def outer_walls(floor, tag="A"):
    W(floor, "Außenwand Süd",  0, 0, HOUSE_W, T_OUT, tag)
    W(floor, "Außenwand Nord", 0, HOUSE_D - T_OUT, HOUSE_W, HOUSE_D, tag)
    W(floor, "Außenwand West", 0, 0, T_OUT, HOUSE_D, tag)
    W(floor, "Außenwand Ost",  HOUSE_W - T_OUT, 0, HOUSE_W, HOUSE_D, tag)


# -------- EG (Aufmaß 09/2026, Fertigmaße) ---------------------------------------
# Außenwände: Süd und Nord sind von der Loggia bzw. der Ostwand unterbrochen, die
# Ostwand und die Wand Wohnzimmer|Loggia springen um Y_VOR nach Süden vor.
W("EG", "Außenwand Süd",  0, 0, X_LOAD2[1], T_OUT, "A")
W("EG", "Außenwand Nord", 0, HOUSE_D - T_OUT, HOUSE_W - T_OUT, HOUSE_D, "A")
W("EG", "Außenwand West", 0, 0, T_OUT, HOUSE_D, "A")
W("EG", "Außenwand Ost",  HOUSE_W - T_OUT, Y_VOR, HOUSE_W, HOUSE_D, "A")
# tragende Innenwände
W("EG", "Tragwand x=4745 (Diele West)", X_LOAD1[0], Y_LOAD_S[0], X_LOAD1[1], HOUSE_D - T_OUT, "A")
W("EG", "Tragwand x=8245 (Diele Ost)",  X_LOAD2[0], Y_VOR, X_LOAD2[1], HOUSE_D, "A")
W("EG", "Tragwand y=4860 (Süd)",  0, Y_LOAD_S[0], X_LOAD2[1], Y_LOAD_S[1], "A")
W("EG", "Tragwand y=7365 (Nord)", 0, Y_LOAD_N[0], X_LOAD1[0], Y_LOAD_N[1], "A")
# Loggia-Rückwand 34 (gemessen; Plan 1967: 30, Ytong)
W("EG", "Essküche|Loggia 34", X_LOAD2[1], 2385, HOUSE_W - T_OUT, 2725, "A")
# Nebenraumband Garderobe | WC | Speis, Wände 13 / 12,5 / 14,5 (Putz dünner)
W("EG", "Essküche|Speis 13",   X_LOAD2[1], 6925, HOUSE_W - T_OUT, 7055, "A")
W("EG", "Gard|WC 13",          8870, 7055,  9000, 8695, "A")
W("EG", "WC|Speis 12,5",      10625, 7055, 10750, 8695, "A")
W("EG", "Nebenräume Nord 14,5", X_LOAD2[1], 8695, HOUSE_W - T_OUT, 8840, "A")
W("EG", "Flur|Bad 14,5",       9985, 8840, 10130, HOUSE_D - T_OUT, "A")
# Kamin 162,5 x 51 (Lage/Größe geschätzt, steht im WC)
W("EG", "Kamin WC", 9000, 7055, 10625, 7565, "C")

# -------- KG (Blatt 2, auf das EG-Aufmaß gesetzt) -------------------------------
outer_walls("KG", "B")
# tragende Wände: gleiche Achsen wie im EG, damit sie übereinander stehen
W("KG", "Tragwand x=4745 (Diele West)",   X_LOAD1[0], Y_LOAD_S[0], X_LOAD1[1], Y_LOAD_N[1], "B")
W("KG", "Tragwand x=4745 (Obst|Keller2)", X_LOAD1[0], Y_KG_BAND, X_LOAD1[1], HOUSE_D, "B")
W("KG", "Tragwand x=8245 (Diele Ost)",    X_LOAD2[0], 0, X_LOAD2[1], HOUSE_D, "B")
W("KG", "Tragwand y=4860 (Süd)",  0, Y_LOAD_S[0], X_LOAD2[1], Y_LOAD_S[1], "B")
W("KG", "Tragwand y=7365 (Nord)", 0, Y_LOAD_N[0], X_LOAD2[1], Y_LOAD_N[1], "B")
# KG-Ostspalte: eigenes Raster, kein Gegenstück im EG (trägt nur die Decke)
W("KG", "Schlafzimmer Nord 240", X_LOAD2[1], 4125, HOUSE_W - T_OUT, 4365, "B")
W("KG", "Bad/Flur Nord 240",     X_LOAD2[1], 7000, HOUSE_W - T_OUT, 7240, "B")
# nichttragend: gemessener Abstand zur tragenden Nachbarwand beibehalten
W("KG", "Essküche|Wohnzimmer 115", T_OUT + 2385, T_OUT, T_OUT + 2385 + T_PART, Y_LOAD_S[0], "C")
W("KG", "Keller1|Obst 115",        T_OUT + 3260, Y_LOAD_N[1], T_OUT + 3260 + T_PART, HOUSE_D - T_OUT, "C")
W("KG", "Obst Süd 115",            T_OUT + 3260 + T_PART, Y_KG_BAND, X_LOAD1[0], Y_KG_BAND + T_PART, "C")
W("KG", "Keller2 Süd 115",         X_LOAD1[1], Y_KG_BAND, X_LOAD2[0], Y_KG_BAND + T_PART, "C")
W("KG", "Öllager|Heizung 115",     X_LOAD2[1], Y_KG_BAND, HOUSE_W - T_OUT, Y_KG_BAND + T_PART, "C")
W("KG", "Flur|Bad 115",            X_LOAD2[1] + 1635, 4365, X_LOAD2[1] + 1635 + T_PART, 7000, "C")

# -------- OG (Blatt 4) – Leichtwände 120 ----------------------------------------
# Unverändert gegenüber v0.23 bis auf die Außenmaße: die Innenwände stehen noch auf dem
# Rohbauraster 1967 und sind noch nicht aufgemessen. Räume reichen bis zu den Außenwänden;
# im Plan sind Wände unter der Dachschräge gestrichelt (unter Schnittebene).
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


# -------- EG: Lage und Breite aus dem Aufmaß, Brüstungs-/Sturzhöhen noch offen (C)
# Süd (Kette ab x=0: 40|96,5|551|137|26)
O("EG", "Außenwand Süd", "window", 1365, 5510, 700, 1385, "A")     # Wohnzimmer 5510 breit
# Nord (Kette: 40|93,5|251|90|27|323|…)
O("EG", "Außenwand Nord", "window", 1335, 2510, 900, 1260, "A")    # Schlafzimmer 2510
O("EG", "Außenwand Nord", "window", 5015, 3230, 0, 2135, "A")      # Diele: Glaselement 3230 (Aufbau/Teilung offen)
# West (Kette: 40|122,5|213,5|110|27|49|126|48,5|27)
O("EG", "Außenwand West", "window", 1625, 2135, 900, 1260, "A")    # Wohnzimmer 2135
O("EG", "Außenwand West", "door",   5620, 1260, 0, 635, "A")       # Haustür, oberer Teil (Sturz +0.635; OK Podest -1.375)
# Ost (a0 ab y = Y_VOR)
O("EG", "Außenwand Ost", "window", 3115 - Y_VOR, 2510, 900, 1260, "A")   # Essküche 2510
O("EG", "Außenwand Ost", "window", 9055 - Y_VOR, 1260, 900, 1260, "A")   # Bad 1260
# Die Loggia ist nach Süden offen: dort steht schlicht keine Wand (die Südwand endet an
# der Wandscheibe x=8245/8505, die Ostwand bildet die Ostseite). Keine Brüstung gezeichnet –
# im Aufmaß steht nur "offen / Stufenkante".
# EG innen
O("EG", "Tragwand y=4860 (Süd)", "door", 5688, 1885, 0, 2010, "A")       # Wohnzimmer|Diele Doppeltür 1885
O("EG", "Tragwand x=4745 (Diele West)", "door", 5255 - Y_LOAD_S[0], 1010, 0, 2010, "A")   # Treppenhaus|Diele y 5255–6265
O("EG", "Tragwand x=4745 (Diele West)", "door", 10470 - Y_LOAD_S[0], 885, 0, 2010, "A")   # Diele|Schlafzimmer y 10470–11355
O("EG", "Tragwand x=8245 (Diele Ost)", "door",   550 - Y_VOR, 1010, 0, 2135, "A")   # Wohnzimmer|Loggia y 550–1560
O("EG", "Tragwand x=8245 (Diele Ost)", "door",  5915 - Y_VOR,  885, 0, 2010, "A")   # Diele|Essküche y 5915–6800
O("EG", "Tragwand x=8245 (Diele Ost)", "loggia", 7055 - Y_VOR, 1640, 0, 2610, "A")  # Garderobe, offene Nische zur Diele
O("EG", "Tragwand x=8245 (Diele Ost)", "door",  9575 - Y_VOR,  885, 0, 2010, "A")   # Diele|Flur y 9575–10460
O("EG", "Essküche|Loggia 34", "door", 10108 - X_LOAD2[1], 885, 0, 2135, "A")   # Essküche|Loggia x 10108–10993
O("EG", "Essküche|Speis 13", "door", 11320 - X_LOAD2[1], 760, 0, 2010, "A")    # Essküche|Speis x 11320–12080
O("EG", "Nebenräume Nord 14,5", "door", 9185 - X_LOAD2[1], 760, 0, 2010, "A")  # Flur|WC x 9185–9945
O("EG", "Flur|Bad 14,5", "door", 9855 - 8840, 760, 0, 2010, "A")               # Flur|Bad y 9855–10615

# -------- KG (Rohbau 1967, auf das neue Raster geschoben)
O("KG", "Außenwand Süd", "window", T_OUT + 1005, 1375, 900, 1260, "B")   # Essküche
O("KG", "Außenwand Süd", "window", T_OUT + 2385 + T_PART, 4015, 900, 1260, "B")   # Wohnzimmer
O("KG", "Außenwand Süd", "window", X_LOAD2[1] + 1125, 2010, 900, 1260, "B")       # Schlafzimmer 1125|2010
O("KG", "Außenwand Nord", "window", T_OUT + 1790, 800, 1800, 600, "B")   # Keller 1
O("KG", "Außenwand Nord", "window", X_LOAD1[1] + 730, 800, 1800, 600, "B")        # Keller 2
O("KG", "Außenwand Ost", "window", 5300, 1260, 900, 1260, "B")     # Bad 1260×1260
O("KG", "Außenwand Ost", "window", 7700, 800, 1800, 600, "B")      # Heizung 800×600
O("KG", "Außenwand Ost", "window", 9100, 800, 1800, 600, "B")      # Öllager 800×600 (ZL)
O("KG", "Außenwand West", "door", 5620, 1260, 1375, 1235, "B")     # Haustür, unterer Teil (OK Podest -1.375)
O("KG", "Tragwand y=4860 (Süd)", "door", X_LOAD1[1] + 1085, 1010, 0, 2610, "C")   # Diele|Wohnzimmer raumhoch
O("KG", "Schlafzimmer Nord 240", "door", 625, 885, 0, 2010, "B")    # Flur|Schlafzimmer (625|885)
O("KG", "Essküche|Wohnzimmer 115", "door", 2250, 760, 0, 2010, "C")
O("KG", "Flur|Bad 115", "door", 950, 760, 0, 2010, "C")             # Flur|Bad y 5315–6075
O("KG", "Obst Süd 115", "door", 30, 760, 0, 2010, "B")              # 30|760
O("KG", "Keller2 Süd 115", "door", 625, 885, 0, 2010, "B")          # 625|885 Kellerflur|Keller2
O("KG", "Keller1|Obst 115", "door", 385, 885, 0, 2010, "C")         # Kellerflur|Keller1
O("KG", "Öllager|Heizung 115", "door", 375, 885, 0, 2010, "B")      # 375|885
O("KG", "Tragwand y=7365 (Nord)", "door", X_LOAD1[0] - 60 - 1010, 1010, 0, 2010, "B")  # Treppenhaus|Kellerflur (1010|60)
O("KG", "Tragwand x=4745 (Diele West)", "door", 5275 - Y_LOAD_S[0], 1010, 0, 2010, "C")  # Treppenhaus|Diele am Südlauf
O("KG", "Tragwand x=8245 (Diele Ost)", "door", 5400, 885, 0, 2010, "C")     # Diele|Flur y 5400–6285
O("KG", "Tragwand x=8245 (Diele Ost)", "door", 7900, 700, 0, 2010, "C")     # Kellerflur|Heizung (700)

# -------- OG Türen (a0 relativ zum Wandanfang)
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
# Balkon West (OG)
BALKON = dict(x0=-1300, x1=0, y0=3035, y1=8095, tag="A")   # 400|2010|240|2010|400 = 5060 lang, 1300 tief
# Loggia: im Aufmaß 09/2026 ist keine Brüstung gezeichnet, nur "offen / Stufenkante".
# Falls doch eine Brüstung steht, hier wieder eintragen (x0, x1, y0, y1, h, tag).
LOGGIA_PARAPETS = []

# Zusätzliche Bodenplatten außerhalb des Rechtecks 0..HOUSE_W / 0..HOUSE_D
SLAB_EXTRAS = [
    dict(floor="EG", name="Loggia Boden (Vorsprung)", tag="A",
         x0=X_LOAD2[0], y0=Y_VOR, x1=HOUSE_W, y1=0, z0=-SLAB),
]

# ---------------------------------------------------------------- Treppen
# Beide Treppen aus dem Aufmaß 09/2026 (Lage A, Steigungen aus Plan 1967).
# Treppenhaus West: Podest im Westen auf -1.375, von dort 8 Stg nach Osten hinauf in die
# Diele (Nordlauf) und 8 Stg nach Osten hinab ins KG (Südlauf).
STAIRS = [
    dict(name="Treppe KG→EG Lauf 1", x0=3615, y0=5130, width=1117.5, steps=8,
         rise=171.875, run=270, z0=Z_KG, direction="-x", tag="A"),
    dict(name="Treppe KG→EG Lauf 2", x0=1455, y0=6247.5, width=1117.5, steps=8,
         rise=171.875, run=270, z0=Z_KG+1375, direction="+x", tag="A"),
    # Holztreppe EG→OG in der Diele, gerader Lauf nach Süden, 16 Stg 172/270
    # (Antritt Nord y=10470, Austritt Süd y=6150; Breite 1000 an der Tragwand)
    dict(name="Holztreppe EG→OG", x0=X_LOAD1[1], y0=10470, width=1000, steps=16,
         rise=171.875, run=270, z0=Z_EG, direction="-y", tag="A"),
]
LANDINGS = [
    dict(name="Podest Treppe KG→EG (OK -1375)", x0=T_OUT, y0=Y_LOAD_S[1], x1=1455,
         y1=Y_LOAD_N[0], z=Z_KG+1375, tag="A"),
]
# Deckenöffnungen (Treppenaugen): (Geschoss der Decke, x0,y0,x1,y1)
SLAB_OPENINGS = {
    "EG": (0, Y_LOAD_S[1], 3615, Y_LOAD_N[0]),         # Decke über KG: Treppenhaus (bis Außenkante, Haustür)
    # Decke über EG: Treppenauge über der Holztreppe. Breite als Vereinigung von Treppe
    # (x 5015–6015, Aufmaß EG) und OG-Schacht (x 5115–6125, Rohbauraster) – die beiden
    # liegen 100 auseinander, bis das OG aufgemessen ist.
    "OG": (X_LOAD1[1], 6150, X_ST[0], 9510),
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
