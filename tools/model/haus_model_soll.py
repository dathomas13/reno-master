"""Zielzustand (Soll) - die Daten stehen in public/models/haus-soll.json.

Geändert wird dort (oder in der App über Export/Import), nicht hier. Siehe haus_model.py.
"""
from hausdatei import load as _load

globals().update(_load("soll"))
