"""Zielzustand (Soll) - die Daten stehen in haus-soll.json in RENO_HAUS_DIR (hausdatei.py).

Geändert wird dort (oder in der App über Export/Import), nicht hier. Siehe haus_model.py.
"""
from hausdatei import load as _load

globals().update(_load("soll"))
