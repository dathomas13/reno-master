"""Räume des Zielzustands - die Daten stehen in haus-soll.json (RENO_HAUS_DIR) unter "rooms"."""
from hausdatei import rooms as _rooms

ROOMS = _rooms("soll")
