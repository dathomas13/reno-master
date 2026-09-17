"""Rooms of the existing building (Ist).

Coordinates are INNER edges in mm, same system as haus_model.py:
  x = 0 at the outer face of the west wall, positive towards east
  y = 0 at the outer face of the south wall (street), positive towards north (garden)

EG: taken from the surveyed floor plan of 09/2026 (DXF, Fertigmaße). The areas printed
in that plan are reproduced exactly, with one exception noted at eg-diele.
KG/OG: still the 1967 plan, moved onto the surveyed grid - see haus_model.py.

A room is a list of axis-aligned rectangles (x0, y0, x1, y1). Most rooms are a single
rectangle; L-shaped rooms and rooms interrupted by a chimney use two or three. The app
draws one pickable floor polygon per rectangle and treats them as one room.

Rooms link diary entries, photos, costs and tasks to a place in the house.
`build_rooms.py` verifies that no wall of the same floor cuts through a rectangle and
that rooms do not overlap. **Never rename an id** - existing entries hang on it.
"""


def room(rid: str, name: str, floor: str, *rects: tuple[int, int, int, int]):
    return (rid, name, floor, list(rects))


ROOMS = [
    # ---------------- Kellergeschoss (Wohnung WE2 im Süden, Keller im Norden)
    room("kg-esskueche",    "Essküche (WE2)",       "KG", (  400,   400,  2785,  4860)),
    room("kg-wohnzimmer",   "Wohnzimmer (WE2)",     "KG", ( 2900,   400,  8245,  4860)),
    room("kg-schlafzimmer", "Schlafzimmer (WE2)",   "KG", ( 8505,   400, 12595,  4125)),
    room("kg-flur",         "Flur (WE2)",           "KG", ( 8505,  4365, 10140,  7000)),
    room("kg-bad",          "Bad (WE2)",            "KG", (10255,  4365, 12595,  7000)),
    room("kg-heizung",      "Heizung",              "KG", ( 8505,  7240, 12595,  8810)),
    room("kg-oellager",     "Öllager",              "KG", ( 8505,  8925, 12595, 11415)),
    room("kg-treppenhaus",  "Treppenhaus",          "KG", (  400,  5130,  4745,  7365)),
    room("kg-diele",        "Diele",                "KG", ( 5015,  5130,  8245,  7365)),
    room("kg-keller1",      "Keller 1",             "KG", (  400,  7635,  3660, 11415)),
    room("kg-kellerflur",   "Kellerflur (?)",       "KG", ( 3775,  7635,  8245,  8810)),
    room("kg-obst",         "Obstkeller",           "KG", ( 3775,  8925,  4745, 11415)),
    room("kg-keller2",      "Keller 2",             "KG", ( 5015,  8925,  8245, 11415)),
    # ---------------- Erdgeschoss (Hauptwohnung WE1) - Aufmaß 09/2026
    room("eg-wohnzimmer",   "Wohnzimmer",           "EG", (  400,   400,  8245,  4860)),   # 7,845 × 4,460
    # Loggia: lichte Weite 4,050 zwischen den außen verputzten Wandscheiben, 2,510 tief
    # bis zur Stufenkante (die Wandscheiben springen 125 nach Süden vor).
    room("eg-loggia",       "Loggia",               "EG", ( 8525,  -125, 12575,  2385)),   # 4,050 × 2,510
    room("eg-esskueche",    "Essküche",             "EG", ( 8505,  2725, 12595,  6925)),   # 4,090 × 4,200
    # Garderobe: offene Nische, 625 tief ab der Dielenkante (die Wandscheibe ist dort
    # unterbrochen), 1,640 breit.
    room("eg-garderobe",    "Garderobe",            "EG", ( 8245,  7055,  8870,  8695)),   # 0,625 × 1,640
    room("eg-wc",           "WC",                   "EG", ( 9000,  7565, 10625,  8695)),   # 1,625 × 1,130 (Kamin südlich)
    room("eg-speise",       "Speisekammer",         "EG", (10750,  7055, 12595,  8695)),   # 1,845 × 1,640
    room("eg-flur",         "Flur",                 "EG", ( 8505,  8840,  9985, 11415)),   # 1,480 × 2,575
    room("eg-bad",          "Bad",                  "EG", (10130,  8840, 12595, 11415)),   # 2,465 × 2,575
    room("eg-windfang",     "Eingang/Treppenhaus",  "EG", (  400,  5130,  4745,  7365)),   # 4,345 × 2,235
    # Der Plan stempelt 21,08 m² (3,230 × 6,525); geometrisch sind es 3,230 × 6,285.
    # Hier steht die Geometrie, die Fläche rechnet build_rooms.py daraus.
    room("eg-diele",        "Diele",                "EG", ( 5015,  5130,  8245, 11415)),
    room("eg-zimmer-nw",    "Schlafzimmer",         "EG", (  400,  7635,  4745, 11415)),   # 4,345 × 3,780
    # ---------------- Obergeschoss (Kniestock 650, Wände unter der Dachschräge)
    room("og-abstell-sw",   "Abstellraum Süd-West", "OG", (  400,   400,  4995,  1385)),
    room("og-kind2",        "Kind 2",               "OG", (  400,  1505,  4995,  5505)),
    room("og-kind1",        "Kind 1",               "OG", (  400,  5625,  4995,  9665)),
    room("og-abstell-nw",   "Abstellraum Nord-West","OG", (  400,  9785,  4995, 11415)),
    room("og-kind3",        "Kind 3",               "OG", ( 5115,   400,  9375,  4375)),
    room("og-diele",        "Diele",                "OG", ( 5115,  4495,  9375,  6630)),
    # Treppe endet an der gestrichelten Abstellwand am Treppenkopf (y 10000)
    room("og-treppe",       "Treppe",               "OG", ( 5115,  6630,  6125, 10000)),
    room("og-g",            "Garderobe (?)",        "OG", ( 6245,  6630,  7045,  7300)),
    room("og-treppenkopf",  "Abstell Treppenkopf",  "OG", ( 5115, 10120,  6125, 11415)),
    room("og-dusche",       "Dusche",               "OG", ( 6245,  7420,  7045,  8370)),
    room("og-wc",           "WC",                   "OG", ( 7165,  6750,  9000,  8370)),
    room("og-abstell",      "Abstellraum",          "OG", ( 6245,  8490,  9000, 11415)),
    room("og-abstell-so",   "Abstellraum Süd-Ost",  "OG", ( 9495,   400, 12595,  1385)),
    room("og-hwr",          "Hauswirtschaftsraum",  "OG", ( 9495,  1505, 12595,  5505)),
    # Wäscheboden: südlich von y 7150 nur östlich der Kind3|HWR-Wand und des Kamins
    room("og-waescheboden", "Wäscheboden",          "OG", ( 9495,  5625, 12595,  7150),
                                                          ( 9120,  7150, 12595, 11415)),
    # ---------------- Garage
    room("gar-garage",      "Garage",               "GAR", (-7760, 5340, -1750, 11850)),
]
