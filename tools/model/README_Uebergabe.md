# Übergabe – Haus Tirschenreuth, 3D-Rohbaumodell (Stand v0.22, 13.09.2026)

## Was das ist
Rohbaumodell des EFH Schlesierstraße 31 (Baujahr 1966/67) aus den Originalplänen von Heinz Schaar (Jan. 1967),
in vielen Runden mit Thomas gegen die Pläne abgeglichen. **Alle Geometrie steckt in `haus_model.py`** – jede andere
Datei wird daraus erzeugt. Nie in erzeugten Dateien editieren, immer in `haus_model.py`, dann neu bauen.

## Koordinatensystem (mm)
- x = 0 an der westlichen Außenkante (Garagenseite), positiv nach Osten
- y = 0 an der südlichen Außenkante (Straße), positiv nach Norden (Garten)
- z = 0 = OK Rohdecke EG. KG-Rohboden −2750, OG-Rohboden +2750, Decken 140, Kniestock 650, Dach 36°
- Haus 13240 × 11820. Garage westlich (x −8000…−1510), Balkon x −1300…0

## Dateien
| Datei | Zweck |
|---|---|
| `haus_model.py` | **Datenbasis**: Wände (`W(...)`), Öffnungen (`O(...)`, a0 = Abstand vom Wandanfang), Treppen, Dach, Gaube, Balkon, Konfidenz-Tags A/B/C |
| `build_all.sh` | Checks → Wandtabelle → Viewer (`Haus_3D.html`); `./build_all.sh print` zusätzlich STL, `./build_all.sh cad` FreeCAD-Skript + STEP |
| `build_cad.py` | erzeugt `Haus_FreeCAD.py` (Arch/BIM-Skript) und `Haus_Rohbau.step` (CadQuery) |
| `Haus_FreeCAD.py` | **fertig erzeugt**, in FreeCAD 1.0 ausführen – ungetestet, da bisher kein FreeCAD verfügbar war |
| `Haus_Rohbau.step` | reine Geometrie als Fallback-Import |
| `build_scene.py`, `viewer_template.html` | Web-Viewer (three.js inline, offline-fähig) |
| `build_print.py` | Druckteile (STL) mit Steckzapfen, `python3 build_print.py 75 print75` |
| `check_walls.py` | Konsistenz: freie Wandenden, Räume, Öffnungen innerhalb Wand |
| `pinkcheck.py`, `overlay.py`, `plan2d.py` | Abgleich gegen die Plan-Scans (brauchen `plan-1..5.png` aus `Plaene_Scan_neu.pdf`, 200 dpi) |
| `Wandtabelle.md` | alle Wände/Öffnungen mit Koordinaten und Konfidenz |

## Installation
```
pip install -r requirements.txt       # cadquery zieht OCP (~150 MB)
```
FreeCAD 1.0 (Desktop). `FreeCADCmd` (headless) liegt im FreeCAD-bin-Ordner.

## Aufgabe für Cowork: FreeCAD-Modell erzeugen
1. `python3 build_cad.py` → erzeugt `Haus_FreeCAD.py` neu (oder das mitgelieferte nehmen).
2. Skript in FreeCAD ausführen – **bevorzugt headless**:
   `FreeCADCmd -c "exec(open(r'PFAD/Haus_FreeCAD.py').read()); App.ActiveDocument.saveAs(r'PFAD/Haus_Tirschenreuth.FCStd')"`
   oder in der FreeCAD-GUI: Makro → Makros… → Ausführen.
3. Ergebnis in FreeCAD öffnen und prüfen (Screenshot): Fenster/Türen sitzen in den Wänden, OG-Wände enden am Dach,
   Geschosse als eigene Ebenen (Arch-Floor: Kellergeschoss, Erdgeschoss, Obergeschoss, Dach, Garage).
4. Fehler im Skript **beheben** (in `build_cad.py`, Vorlage `FREECAD = '''…'''`), nicht umgehen; dann `build_cad.py` neu laufen lassen.

### Bekannte Risikostellen im Skript
- `Arch.makeWindowPreset(...)`: Parameterreihenfolge (windowtype, width, height, h1, h2, h3, w1, w2, o1, o2, placement) und die
  Rotation `rot` der Fensterskizze (XZ-Ebene → Wand in x; um Z gedreht → Wand in y). Falls Fenster quer stehen: nur `rot` anpassen.
- `win.Hosts = [wall]` muss vor `doc.recompute()` gesetzt sein, sonst werden Öffnungen nicht ausgeschnitten.
- OG-Wände sind Profilkörper (`Part::Feature` als Base von `Arch.makeWall`) – die haben in FreeCAD keine `Length`-Eigenschaft;
  zum Verschieben Placement ändern oder das Profil in `haus_model.py` anpassen.
- Wenn `Arch` nicht importierbar: in FreeCAD 1.x heißt das Modul weiterhin `Arch` (BIM-Workbench nutzt es intern).
- Notfalls Fenster als einfache Abzugskörper: `Arch.removeComponents([box], host=wall)` – so sind die offenen Durchgänge bereits gelöst.

## Was im Modell noch unsicher ist (Konfidenz C/B)
- Brüstungshöhen aller Fenster (angenommen 900, Kellerfenster 1800) – Ansichten liegen nicht vor
- OG: Trennwand G/DU und DU-Tür; Abstellwand Treppenkopf (10000 vs 10250)
- Haustür-Lage im Podest (y 5700–6700), Garagen-Lage in y
- Tragwände: nur aus Wanddicke und Baubeschreibung 1966 abgeleitet (24 cm tragend, 11,5 cm nicht) – **keine Statik**

## Nächste Schritte nach dem FreeCAD-Import
- Schnitt (Blatt 5) mit demselben Verfahren abgleichen: Dachstuhl (Sparren 100/160, Pfetten 240/260), Gaubenhöhe, Spitzboden
- Neue Grundrisse (Sanierung) als zweite Wand-Liste in `haus_model.py` anlegen, damit Alt/Neu übereinandergelegt werden können
