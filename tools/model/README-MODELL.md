# Das 3D-Modell pflegen

Diese Anleitung richtet sich an den Agenten (oder Menschen), der das Hausmodell ändert.
Die App **Reno Master** liest ausschließlich die erzeugten JSON-Dateien unter `public/models/`
und die SVG-Pläne unter `public/plans/`. Wer diese Dateien korrekt erzeugt, kann das Modell
mit jedem Werkzeug bauen – die bestehende Python-Datenbasis ist nur der aktuelle Weg.

## 1. Koordinatensystem (alles in Millimetern)

| Achse | Nullpunkt | Richtung |
|---|---|---|
| x | Außenkante Westwand (Garagenseite) | positiv nach **Osten** |
| y | Außenkante Südwand (Straße) | positiv nach **Norden** (Garten) |
| z | OK Rohdecke EG (±0,000 im Plan) | positiv nach **oben** |

Haus 13240 × 11820. KG-Rohboden −2750, OG-Rohboden +2750, Decken 140, Kniestock 650,
Dach 36°, First UK Sparren ≈ +7430. Garage westlich (x −8000 … −1510), Balkon x −1300 … 0.

Die App rechnet beim Laden um: three.js-Punkt = `(x, z, −y) / 1000`. Norden ist also −Z.

## 2. Dateien

| Datei | Rolle |
|---|---|
| `haus_model.py` | **Datenbasis Bestand (Ist).** Wände `W(...)`, Öffnungen `O(...)`, Treppen, Dach, Gaube, Balkon, Konfidenz-Tags A/B/C. Nur hier wird der Bestand geändert. |
| `haus_model_soll.py` | **Datenbasis Zielzustand (Soll).** Startet als `from haus_model import *`. Hier die Wände/Öffnungen überschreiben, die sich durch die Sanierung ändern. |
| `rooms_ist.py` / `rooms_soll.py` | Raumliste je Variante (Rechtecke, Innenkanten). |
| `build_scene_lite.py` | **Der übliche Weg.** Baut `public/models/<variante>.json` direkt aus der Datenbasis, nur mit der Standardbibliothek. |
| `build_scene.py` | Dasselbe aus echten Volumenkörpern. **Braucht CadQuery/OCP (~150 MB)** – nötig für STEP/STL, nicht für den Viewer. |
| `extract_scene_from_html.py` | Fallback: zieht die Szene aus einer bereits gebauten `Haus_3D.html`. |
| `check_scene.py` | Prüft eine erzeugte Szene (Schema, geschlossene Hüllen, Orientierung) und vergleicht sie mit `--against` gegen eine Referenz. |
| `build_rooms.py` | Erzeugt `public/models/rooms-<variante>.json` **und prüft** die Räume gegen die Wände. |
| `build_plans_svg.py` | Erzeugt die 2D-Grundrisse `public/plans/<variante>-<geschoss>.svg` und `index.json`. |
| `make_manifest.py` | Schreibt `public/models/manifest.json` (Versionen, Datum, Notiz) – die App zeigt das an. |
| `check_walls.py` | Konsistenzprüfung: freie Wandenden, Räume, Öffnungen innerhalb der Wand. |
| `build_all.sh` | Alles der Reihe nach. |
| `Wandtabelle.md`, `README_Uebergabe.md` | Ursprüngliche Übergabe-Doku mit allen Maßen und Konfidenzen. |

## 3. Bestand (Ist) ändern

```bash
cd tools/model
# 1. Geometrie anpassen
$EDITOR haus_model.py
# 2. prüfen - es darf kein "FREIES ENDE" und kein "AUSSERHALB" gemeldet werden
#    (braucht numpy; ohne numpy übernimmt check_scene.py in Schritt 4 die Prüfung)
python3 check_walls.py | grep -i "AUSSERHALB\|FREIES"
# 3. Szene bauen - ohne Abhängigkeiten, das ist der übliche Weg:
python3 build_scene_lite.py --variant ist --version 0.23 --note "Kurznotiz"
#    Alternativen: build_scene.py (mit CadQuery) oder, aus einer gebauten Viewer-HTML,
#    extract_scene_from_html.py --html Haus_3D.html --variant ist --version 0.23
# 4. Szene gegen die vorige Fassung prüfen (Exitcode != 0 = Problem)
python3 check_scene.py ../../public/models/ist.json --against /pfad/zur/alten/ist.json
# 4. Räume und Pläne neu bauen, Manifest schreiben
python3 build_rooms.py --variant ist
python3 build_plans_svg.py --variant ist
python3 make_manifest.py
```

Version in Schritt 3 **immer erhöhen** (`--version`). Die App zeigt sie an und erkennt daran,
dass ein neues Modell vorliegt.

`build_scene_lite.py` und `build_scene.py` beschreiben denselben Körper: gleiche 132 Bauteile,
gleiches Volumen, in fünf Blickrichtungen kein Pixel Unterschied. Der Unterschied liegt nur in
der Vernetzung (lite braucht etwa ein Drittel mehr Dreiecke, ~4500 statt ~3100, weil es Flächen
in Rechtecke statt in minimale Polygone zerlegt). Wasserdichte Volumenkörper braucht nur
`build_print.py` (STL) und `build_cad.py` (STEP/FreeCAD) – daher hängen die an CadQuery, der
Viewer nicht.

## 4. Zielzustand (Soll) ändern

Genauso, aber in `haus_model_soll.py` und `rooms_soll.py`, mit `--variant soll`
(`build_scene_lite.py` lädt dann `haus_model_soll` statt `haus_model`).
`haus_model.py` bleibt unangetastet: es ist die abgeglichene Aufnahme des Bestands.

Beispiel – eine Wand im Soll entfernen und eine neue setzen:

```python
from haus_model import *            # Bestand übernehmen

WALLS[:] = [w for w in WALLS if not (w["floor"] == "EG" and w["name"] == "Gard|WC 115")]
W("EG", "Neue Trennwand Bad 115", 9045, 7035, 9160, 8705, "C")
```

## 5. Veröffentlichen

```bash
git add public/models public/plans tools/model
git commit -m "model: EG Wand versetzt, v0.23"
git push
```

GitHub Actions baut und deployt automatisch. Am Handy: App öffnen, solange WLAN da ist –
sie lädt die neuen Dateien in den Offline-Cache und meldet „Neue Version“.

## 6. Format der erzeugten Dateien

`public/models/<variante>.json`

```jsonc
{
  "meta": { "variant": "ist", "version": "0.22", "generatedAt": "2026-09-14",
            "note": "Rohbau nach Plan 1967", "house_w": 13240, "house_d": 11820, "ridge": 7428.7 },
  "prims": [
    { "layer": "KG|EG|OG|DACH|GAR",
      "name": "Außenwand Nord",
      "kind": "wall|slab|roof|glass|door|stair|rail",
      "tag": "A|B|C",               // Konfidenz: gesichert / abgeleitet / Annahme
      "tragend": true,
      "v": [x, y, z, ...],           // Eckpunkte in mm, 3 Zahlen je Punkt
      "t": [i0, i1, i2, ...],        // Dreiecks-Indizes in v
      "bb": [xmin, ymin, zmin, xmax, ymax, zmax] }
  ]
}
```

`public/models/rooms-<variante>.json`

```jsonc
{ "variant": "ist", "generatedAt": "2026-09-14",
  "rooms": [ { "id": "eg-wohnzimmer", "name": "Wohnzimmer", "floor": "EG",
               "rects": [[365, 365, 8375, 4875]], "areaM2": 36.14 } ] }
```

`id` ist der Schlüssel, mit dem Tagebucheinträge, Fotos, Kosten und Aufgaben verknüpft sind.
**Eine einmal vergebene id niemals umbenennen**, solange der Raum derselbe bleibt – sonst
verlieren bestehende Einträge ihre Zuordnung. Ein Raum darf aus mehreren Rechtecken bestehen
(L-Form, Kamin in der Ecke).

## 7. Verifikation ohne Installation

`tools/model/_verify/` enthält eine Testseite, die die echte App-Logik (`src/modules/viewer3d/`)
mit einem UMD-Build von three.js lädt. Damit lässt sich ein neues Modell prüfen, ohne npm:

```bash
# three.min.js aus der Modell-Übergabe nach tools/model/vendor/ legen
python3 -m http.server 8899 &
npx tsc --target ES2020 --module ES2020 --outDir tools/model/_verify/js src/modules/viewer3d/*.ts
node tools/model/_verify/shoot-viewer.mjs      # rendert Außenansicht + Grundrisse als PNG
```

Erwartung: keine Konsolenfehler, Bauteil- und Dreieckszahl im HUD plausibel, Räume anklickbar.
