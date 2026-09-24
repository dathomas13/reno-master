"""Haus Tirschenreuth - Bestand (Ist). Alle Maße in mm.

Die Daten stehen seit 09/2026 in public/models/haus-ist.json (Format reno-haus/1, siehe
ANLEITUNG-EXTERN.md); dort wird geändert, nicht hier. Dieses Modul stellt sie den Skripten
unter den gewohnten Namen bereit (WALLS, OPENINGS, HOUSE_W, roof_z_under, ...).

Koordinaten: x = 0 Außenkante Westwand, nach Osten; y = 0 Außenkante Südwand, nach Norden;
z = 0 Oberkante Rohdecke EG. Konfidenz-Tags: A gemessen, B abgeleitet, C Annahme.
"""
from hausdatei import load as _load

globals().update(_load("ist"))

if __name__ == "__main__":
    for w in WALLS:  # noqa: F821
        print(w)
    print("Firsthöhe UK Sparren:", roof_z_under(HOUSE_D / 2))  # noqa: F821
