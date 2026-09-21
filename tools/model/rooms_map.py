"""Welcher Raum von heute (Ist) künftig welcher wird (Soll).

Eine Zeile je Ist-Raum, vollständig: jede id aus `rooms_ist.py` kommt genau einmal vor.
`build_rooms.py` meldet, wenn ein Raum fehlt oder auf eine id zeigt, die es in
`rooms_soll.py` nicht gibt.

Ein Raum, der seine Identität behält, zeigt auf sich selbst - das ist der Normalfall
und keine Formalität: erst dadurch ist die Tabelle vollständig, und die Prüfung kann
einen vergessenen Raum von einem absichtlich unveränderten unterscheiden.

Ändert sich ein Raum wirklich (Zusammenlegung, Teilung, Verschiebung), bekommt er eine
NEUE id in `rooms_soll.py`, nie eine umbenannte - siehe die Regel dort und in
CLAUDE.md. Legen sich mehrere alte Räume zu einem neuen zusammen, zeigen alle auf
dieselbe neue id; eine Teilung zeigt auf den Raum, der am ehesten der Nachfolger ist.

Die Tabelle wird nur vorwärts gelesen: ein neuer Eintrag unter der neuen id ist nicht
automatisch auch unter der alten zu finden, nur umgekehrt.
"""

MAP = {
    "kg-esskueche":    "kg-esskueche",
    "kg-wohnzimmer":   "kg-wohnzimmer",
    "kg-schlafzimmer": "kg-schlafzimmer",
    "kg-flur":         "kg-flur",
    "kg-bad":          "kg-bad",
    # Der Kamin bleibt, aber die Trennwand zwischen Heizung und Öllager fällt - ein Raum.
    "kg-heizung":      "kg-technik",
    "kg-oellager":     "kg-technik",
    "kg-treppenhaus":  "kg-treppenhaus",
    "kg-diele":        "kg-diele",
    "kg-keller1":      "kg-keller1",
    "kg-kellerflur":   "kg-kellerflur",
    "kg-obst":         "kg-obst",
    "kg-keller2":      "kg-keller2",
    "eg-wohnzimmer":   "eg-wohnzimmer",
    "eg-loggia":       "eg-loggia",
    "eg-esskueche":    "eg-esskueche",
    "eg-garderobe":    "eg-garderobe",
    "eg-wc":           "eg-wc",
    "eg-speise":       "eg-speise",
    "eg-flur":         "eg-flur",
    "eg-bad":          "eg-bad",
    "eg-treppenhaus":  "eg-treppenhaus",
    "eg-diele":        "eg-diele",
    "eg-zimmer-nw":    "eg-zimmer-nw",
    "og-kind2":        "og-kind2",
    "og-kind1":        "og-kind1",
    "og-kind3":        "og-kind3",
    "og-diele":        "og-diele",
    "og-treppe":       "og-treppe",
    "og-g":            "og-g",
    "og-wc":           "og-wc",
    "og-hwr":          "og-hwr",
    "og-waescheboden": "og-waescheboden",
    "gar-garage":      "gar-garage",
}
