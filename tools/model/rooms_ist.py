"""Räume des Bestands - die Daten stehen in haus-ist.json (RENO_HAUS_DIR) unter "rooms".

ROOMS ist eine Liste (id, name, geschoss, [(x0, y0, x1, y1), ...]) in Innenkanten.
**Eine Raum-id nie umbenennen** - Tagebuch, Fotos, Kosten und Aufgaben hängen daran.
"""
from hausdatei import rooms as _rooms

ROOMS = _rooms("ist")
