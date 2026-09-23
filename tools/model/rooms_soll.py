"""Rooms of the target state (Soll).

Starting point: identical to the existing rooms (`rooms_ist.py`), room by room, until
the real Soll floor plan replaces this file wholesale. Change rectangles here once walls
move in `haus_model_soll.py`; keep an id stable where a room keeps its identity - and
where a room's identity changes (merges, splits, moves), give it a NEW id here and add
the old id(s) to `rooms_map.py`, never rename an id in place.

A room may have NO rectangles yet (`room(rid, name, floor)` with nothing after `floor`):
it appears in pickers, lists and search and collects whatever the mapping sends its way,
but is not drawn in the 3D view or on the generated floor plans until its geometry is
known.
"""


def room(rid: str, name: str, floor: str, *rects: tuple[int, int, int, int]):
    return (rid, name, floor, list(rects))


ROOMS = [
    # ---------------- Kellergeschoss (Wohnräume im Süden, Keller im Norden)
    # Aufmaß 09/2026; die gestempelten Flächen des Plans stimmen exakt.
    room("kg-esskueche",    "Essküche",             "KG", (  400,   400,  2710,  4860)),   # 10,30
    room("kg-wohnzimmer",   "Wohnzimmer",           "KG", ( 2835,   400,  8235,  4860)),   # 24,08
    room("kg-schlafzimmer", "Schlafzimmer",         "KG", ( 8505,   400, 12595,  4200)),   # 15,54
    room("kg-flur",         "Flur",                 "KG", ( 8505,  4470, 10105,  7020)),   # 4,08
    room("kg-bad",          "Bad",                  "KG", (10255,  4470, 12595,  7020)),   # 5,97
    # Heizung und Öllager werden ein Raum. Noch kein Soll-Aufmaß - die Geometrie kommt,
    # sobald die Wände feststehen; bis dahin sammelt der Raum die alten Einträge ohne
    # eigene Fläche im 3D und im Grundriss.
    room("kg-technik",      "Technikraum",          "KG"),
    # im Plan als VORRAUM gestempelt (Treppe ins EG und hinunter ins KG)
    room("kg-treppenhaus",  "Treppenhaus",          "KG", (  400,  5130,  4745,  7365)),
    room("kg-diele",        "Diele",                "KG", ( 5015,  5130,  8235,  7365)),   # 7,20
    room("kg-keller1",      "Keller 1",             "KG", (  365,  7610,  3500, 11450)),   # 12,04
    room("kg-kellerflur",   "Kellerflur",           "KG", ( 3640,  7610,  8235,  8790)),
    room("kg-obst",         "Obstkeller",           "KG", ( 3640,  8930,  4760, 11450)),
    room("kg-keller2",      "Keller 2",             "KG", ( 5000,  8930,  8220, 11450)),   # 8,11
    # ---------------- Erdgeschoss - Aufmaß 09/2026
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
    room("eg-treppenhaus",  "Treppenhaus",          "EG", (  400,  5130,  4745,  7365)),   # 4,345 × 2,235
    # Der Plan stempelt 21,08 m² (3,230 × 6,525); geometrisch sind es 3,230 × 6,285.
    # Hier steht die Geometrie, die Fläche rechnet build_rooms.py daraus.
    room("eg-diele",        "Diele",                "EG", ( 5015,  5130,  8245, 11415)),
    room("eg-zimmer-nw",    "Schlafzimmer",         "EG", (  400,  7635,  4745, 11415)),   # 4,345 × 3,780
    # ---------------- Obergeschoss (Kniestock 650, Wände unter der Dachschräge)
    # Aufmaß 09/2026. Die Abseitenwände bei Kind 2 und Kind 3 wurden nie gebaut, die
    # Räume reichen dort bis an die Außenwand - die gestempelten Flächen bestätigen das.
    room("og-kind2",        "Kind 2",               "OG", (  400,   400,  4840,  5800)),   # 23,98
    room("og-kind1",        "Kind 1",               "OG", (  400,  5920,  4840, 10450)),   # 20,11
    # Kind 3: der Plan stempelt 16,33 - gemessen ab der Erkerrückkante y=675, nicht ab
    # der Außenwand. Die Erkernische selbst zählt er nicht mit.
    room("og-kind3",        "Kind 3",               "OG", ( 5015,   675,  9235,  4545)),   # 16,33
    room("og-diele",        "Diele",                "OG", ( 5015,  4705,  9235,  6835)),
    room("og-treppe",       "Treppe",               "OG", ( 5015,  6835,  6025, 10450)),
    room("og-g",            "Garderobe",            "OG", ( 6145,  6955,  6945,  7505)),
    # im Plan "BAD*" (3,81) - aus Blatt 4 übernommen, L-förmig um die Garderobe
    room("og-wc",           "Bad",                  "OG", ( 7065,  6955,  8880,  8575),
                                                          ( 6145,  7625,  7065,  8575)),
    room("og-hwr",          "Hauswirtschaftsraum",  "OG", ( 9370,  1690, 12595,  5800)),   # 13,25
    # Wäscheboden: Ostspalte nördlich des HWR, dann über die ganze Nordseite. Der Plan
    # stempelt 27,52; die Geometrie ergibt 26,3 - der Stempel zählt offenbar einen Teil
    # der offenen Abseite hinter Kind 1 mit. Hier steht die Geometrie.
    room("og-waescheboden", "Wäscheboden",          "OG", ( 9370,  5920, 12595,  6955),
                                                          ( 9000,  6955, 12595,  7055),
                                                          (10625,  7055, 12595,  7565),
                                                          ( 9000,  7565, 12595,  8695),
                                                          ( 6145,  8695, 12595, 11415)),
    # ---------------- Garage
    room("gar-garage",      "Garage",               "GAR", (-7760, 5340, -1750, 11850)),
]
