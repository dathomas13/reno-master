"""Rooms of the existing building (Ist), derived from the wall table in Wandtabelle.md.

Coordinates are INNER edges in mm, same system as haus_model.py:
  x = 0 at the outer face of the west wall, positive towards east
  y = 0 at the outer face of the south wall (street), positive towards north (garden)

A room is a list of axis-aligned rectangles (x0, y0, x1, y1). Most rooms are a single
rectangle; L-shaped rooms and rooms interrupted by a chimney use two or three. The app
draws one pickable floor polygon per rectangle and treats them as one room.

Rooms link diary entries, photos, costs and tasks to a place in the house.
`build_rooms.py` verifies that no wall of the same floor cuts through a rectangle and
that rooms do not overlap. Names marked with "?" are assumptions - correct them here.
"""


def room(rid: str, name: str, floor: str, *rects: tuple[int, int, int, int]):
    return (rid, name, floor, list(rects))


ROOMS = [
    # ---------------- Kellergeschoss (Wohnung WE2 im Süden, Keller im Norden)
    room("kg-esskueche",    "Essküche (WE2)",       "KG", (  365,   365,  2750,  4875)),
    room("kg-wohnzimmer",   "Wohnzimmer (WE2)",     "KG", ( 2865,   365,  8375,  4875)),
    room("kg-schlafzimmer", "Schlafzimmer (WE2)",   "KG", ( 8615,   365, 12875,  4125)),
    room("kg-flur",         "Flur (WE2)",           "KG", ( 8615,  4365, 10250,  7000)),
    room("kg-bad",          "Bad (WE2)",            "KG", (10365,  4365, 12875,  7000)),
    room("kg-heizung",      "Heizung",              "KG", ( 8615,  7240, 12875,  8850)),
    room("kg-oellager",     "Öllager",              "KG", ( 8615,  8965, 12875, 11455)),
    room("kg-treppenhaus",  "Treppenhaus",          "KG", (  365,  5115,  4875,  7375)),
    room("kg-diele",        "Diele",                "KG", ( 5115,  5115,  8375,  7375)),
    room("kg-keller1",      "Keller 1",             "KG", (  365,  7615,  3625, 11455)),
    room("kg-kellerflur",   "Kellerflur (?)",       "KG", ( 3740,  7615,  8375,  8850)),
    room("kg-obst",         "Obstkeller",           "KG", ( 3740,  8965,  4875, 11455)),
    room("kg-keller2",      "Keller 2",             "KG", ( 5115,  8965,  8375, 11455)),
    # ---------------- Erdgeschoss (Hauptwohnung WE1)
    room("eg-wohnzimmer",   "Wohnzimmer",           "EG", (  365,   365,  8375,  4875)),
    room("eg-loggia",       "Loggia",               "EG", ( 8615,   365, 12875,  2615)),
    room("eg-esskueche",    "Essküche",             "EG", ( 8615,  2730, 12875,  6920)),
    room("eg-garderobe",    "Garderobe",            "EG", ( 8615,  7035,  8930,  8705)),
    room("eg-wc",           "WC",                   "EG", ( 9045,  7035, 10750,  8705)),
    # Speisekammer: der Kamin (12500–12875 / 7035–7535) steht in der Südostecke
    room("eg-speise",       "Speisekammer",         "EG", (10865,  7035, 12500,  8705),
                                                          (12500,  7535, 12875,  8705)),
    room("eg-flur",         "Flur",                 "EG", ( 8615,  8820, 10250, 11455)),
    room("eg-bad",          "Bad",                  "EG", (10365,  8820, 12875, 11455)),
    room("eg-windfang",     "Windfang/Treppenhaus", "EG", (  365,  5115,  4875,  7375)),
    room("eg-diele",        "Diele",                "EG", ( 5115,  5115,  8375, 11455)),
    room("eg-zimmer-nw",    "Zimmer Nord-West (?)", "EG", (  365,  7615,  4875, 11455)),
    # ---------------- Obergeschoss (Kniestock 650, Wände unter der Dachschräge)
    room("og-abstell-sw",   "Abstellraum Süd-West", "OG", (  365,   365,  4995,  1385)),
    room("og-kind2",        "Kind 2",               "OG", (  365,  1505,  4995,  5505)),
    room("og-kind1",        "Kind 1",               "OG", (  365,  5625,  4995,  9665)),
    room("og-abstell-nw",   "Abstellraum Nord-West","OG", (  365,  9785,  4995, 11455)),
    room("og-kind3",        "Kind 3",               "OG", ( 5115,   365,  9375,  4375)),
    room("og-diele",        "Diele",                "OG", ( 5115,  4495,  9375,  6630)),
    # Treppe endet an der gestrichelten Abstellwand am Treppenkopf (y 10000)
    room("og-treppe",       "Treppe",               "OG", ( 5115,  6630,  6125, 10000)),
    room("og-g",            "Garderobe (?)",        "OG", ( 6245,  6630,  7045,  7300)),
    room("og-treppenkopf",  "Abstell Treppenkopf",  "OG", ( 5115, 10120,  6125, 11455)),
    room("og-dusche",       "Dusche",               "OG", ( 6245,  7420,  7045,  8370)),
    room("og-wc",           "WC",                   "OG", ( 7165,  6750,  9000,  8370)),
    room("og-abstell",      "Abstellraum",          "OG", ( 6245,  8490,  9000, 11455)),
    room("og-abstell-so",   "Abstellraum Süd-Ost",  "OG", ( 9495,   365, 12875,  1385)),
    room("og-hwr",          "Hauswirtschaftsraum",  "OG", ( 9495,  1505, 12875,  5505)),
    # Wäscheboden: südlich von y 7150 nur östlich der Kind3|HWR-Wand und des Kamins
    room("og-waescheboden", "Wäscheboden",          "OG", ( 9495,  5625, 12875,  7150),
                                                          ( 9120,  7150, 12875, 11455)),
    # ---------------- Garage
    room("gar-garage",      "Garage",               "GAR", (-7760, 5340, -1750, 11850)),
]
