# Das 3D-Modell pflegen

Diese Anleitung richtet sich an den Agenten (oder Menschen), der das Hausmodell ändert.
Die App **Reno Master** liest ausschließlich die erzeugten JSON-Dateien unter `public/models/`
und die SVG-Pläne unter `public/plans/`. Wer diese Dateien korrekt erzeugt, kann das Modell
mit jedem Werkzeug bauen – die bestehende Python-Datenbasis ist nur der aktuelle Weg.

> **Die Quelle ist die Hausdatei** `public/models/haus-<variante>.json` (Format
> `reno-haus/1`, beschrieben in [`ANLEITUNG-EXTERN.md`](ANLEITUNG-EXTERN.md)). Die App baut
> daraus selbst: Einstellungen → 3D-Modelle → „Modell exportieren“ / „Modell importieren“.
> Hintergrund und offene Stufen: [`PLAN-MODELL-WORKFLOW.md`](PLAN-MODELL-WORKFLOW.md).

## 1. Koordinatensystem (alles in Millimetern)

| Achse | Nullpunkt | Richtung |
|---|---|---|
| x | Außenkante Westwand (Garagenseite) | positiv nach **Osten** |
| y | Außenkante Südwand (Straße) | positiv nach **Norden** (Garten) |
| z | OK Rohdecke EG (±0,000 im Plan) | positiv nach **oben** |

Haus 12995 × 11815 (Aufmaß 09/2026, Fertigmaß). KG-Rohboden −2750, OG-Rohboden +2750,
Decken 140, Kniestock 650, Dach 36°, First UK Sparren ≈ +7401. Garage westlich
(x −8000 … −1510), Balkon x −1300 … 0. Südlichster Punkt ist **y = −125**: die beiden
Wandscheiben neben der Loggia springen 12,5 cm nach Süden vor (`Y_VOR`). `ENVELOPE` in
`haus_model.py` nennt die Hülle (aus `params.yVor`), die `build_rooms.py` prüft.

**Maßstand je Geschoss.** Das EG ist aufgemessen (Thomas, 09/2026, DXF
„Grundriss_EG_Bestand_Fertigmasse“) und steht in **Fertigmaßen inklusive Putz**:
Außenwand 400 (36,5 + Putz), tragende Innenwand 270 (24 + Putz), Ostwand Diele 260,
Leichtwände 130 / 125 / 145. Das KG ist daraus abgeleitet – die tragenden Wände stehen
auf denselben Achsen, die nichttragenden 115er behalten ihren Abstand zur tragenden
Nachbarwand (Konfidenz B/C). Das OG ist unverändert 1967er Rohbauraster und folgt nur
`HOUSE_W`, `HOUSE_D` und `T_OUT`.

Die App rechnet beim Laden um: three.js-Punkt = `(x, z, −y) / 1000`. Norden ist also −Z.

## 2. Dateien

| Datei | Rolle |
|---|---|
| `public/models/haus-ist.json` | **Die Quelle für den Bestand (Ist).** Wände mit ihren Öffnungen, Treppen, Dach- und Gaubenmaße, Balkon, Garage, Räume, Konfidenz-Tags A/B/C. Nur hier wird der Bestand geändert. |
| `public/models/haus-soll.json` | **Die Quelle für den Zielzustand (Soll).** Anfangs eine Kopie von Ist. Planungsänderungen gehören hierher, nie in die Ist-Datei. |
| `hausdatei.py` | Liest eine Hausdatei und stellt sie den Skripten unter den alten Namen bereit (`WALLS`, `OPENINGS`, `HOUSE_W`, `roof_z_under` …). `--format <variante>` schreibt die Datei im kanonischen Layout neu. |
| `haus_model.py`, `haus_model_soll.py`, `rooms_ist.py`, `rooms_soll.py` | Dünne Hüllen um `hausdatei.py`, damit alle älteren Skripte unverändert laufen. **Hier nichts eintragen.** |
| `build_scene_lite.py` | Baut `public/models/<variante>.json` aus der Hausdatei, nur mit der Standardbibliothek. Dasselbe tut die App mit `src/modules/modelBuild` – Punkt für Punkt gleich, ein Unit-Test hält das fest. |
| `check_source.py` | Prüft, dass die committeten Szenen genau das sind, was die Hausdateien ergeben (läuft in der CI). |
| `build_scene.py` | Dasselbe aus echten Volumenkörpern. **Braucht CadQuery/OCP (~150 MB)** – nötig für STEP/STL, nicht für den Viewer. |
| `extract_scene_from_html.py` | Fallback: zieht die Szene aus einer bereits gebauten `Haus_3D.html`. |
| `check_scene.py` | Prüft eine erzeugte Szene (Schema, geschlossene Hüllen, Orientierung) und vergleicht sie mit `--against` gegen eine Referenz. |
| `build_rooms.py` | Erzeugt `public/models/rooms-<variante>.json` **und prüft** die Räume gegen die Wände. |
| `build_plans_svg.py` | Erzeugt die 2D-Grundrisse `public/plans/<variante>-<geschoss>.svg` und `index.json`. |
| `make_manifest.py` | Schreibt `public/models/manifest.json` (Versionen, Datum, Notiz, Hausdatei) – die App zeigt das an. |
| `check_walls.py` | Konsistenzprüfung: freie Wandenden, Räume, Öffnungen innerhalb der Wand (braucht numpy). |
| `Wandtabelle.md`, `README_Uebergabe.md` | Ursprüngliche Übergabe-Doku (Rohbau 1967). **Überholt** – es gilt die Hausdatei. |

## 3. Bestand (Ist) ändern

**Ohne Repo, der übliche Weg:** in der App „Modell exportieren“, die Hausdatei extern ändern
(KI, Editor, siehe `ANLEITUNG-EXTERN.md`), „Modell importieren“, prüfen, veröffentlichen.
Das Modell ist dann auf allen Geräten, das Repo aber nicht – siehe Abschnitt 5.

**Im Repo:**

```bash
# 0. Zuerst den Stand der App holen, falls dort seit dem letzten Commit veröffentlicht wurde:
#    App → Modell exportieren → haus-ist.json nach public/models/ legen.
# 1. Hausdatei ändern, Version in "version" erhöhen, "note" setzen
$EDITOR public/models/haus-ist.json
python3 tools/model/hausdatei.py --format ist          # kanonisches Layout
# 2. Szene, Räume, Pläne, Manifest bauen
python3 tools/model/build_scene_lite.py --variant ist   # Version und Notiz aus der Hausdatei
python3 tools/model/build_rooms.py --variant ist        # meldet Räume, die eine Wand schneidet
python3 tools/model/build_plans_svg.py --variant ist
python3 tools/model/make_manifest.py
# 3. prüfen (Exitcode != 0 = Problem)
python3 tools/model/check_source.py
python3 tools/model/check_scene.py public/models/ist.json --against /pfad/zur/alten/ist.json
```

Die Version **immer erhöhen**, und zwar über die höchste, die irgendwo veröffentlicht ist
(App-Einstellungen zeigen sie). Die App erkennt daran, dass ein neues Modell vorliegt.

`build_scene_lite.py` und `build_scene.py` beschreiben denselben Körper: gleiche 132 Bauteile,
gleiches Volumen, in fünf Blickrichtungen kein Pixel Unterschied. Der Unterschied liegt nur in
der Vernetzung (lite braucht etwa ein Drittel mehr Dreiecke, ~4500 statt ~3100, weil es Flächen
in Rechtecke statt in minimale Polygone zerlegt). Wasserdichte Volumenkörper braucht nur
`build_print.py` (STL) und `build_cad.py` (STEP/FreeCAD) – daher hängen die an CadQuery, der
Viewer nicht.

## 4. Zielzustand (Soll) ändern

Genauso, aber in `public/models/haus-soll.json` und mit `--variant soll`. Die Ist-Datei
bleibt unangetastet: sie ist die abgeglichene Aufnahme des Bestands. Eine Wand fällt weg,
indem ihr Objekt aus `walls` gelöscht wird. Eine neue Wand bekommt eine neue, eindeutige
`id`.

## 5. Veröffentlichen

Die Modellversion hängt **nicht** am App-Build. Die App nimmt immer die höchste Fassung,
die sie erreicht, legt sie in IndexedDB und behält sie offline. Drei Kanäle, gleichwertig
nach Version verglichen (Details in `src/data/modelRelease.ts`):

| Kanal | Wie er gefüllt wird | Wer ihn braucht |
|---|---|---|
| `bundled` | `public/models/` im Repo, mit dem Build ausgeliefert | die Untergrenze: offline ab dem ersten Start |
| `site` | derselbe `git push`, gelesen aus `models/manifest.json` der **veröffentlichten** Seite | die APK, deren gebündelte Dateien sich nie ändern, und die Web-App, die sonst erst nach einer angenommenen App-Aktualisierung das neue Modell sähe |
| `firestore` | Einstellungen → 3D-Modelle → „Modell importieren“ → „Veröffentlichen“ | ein neues Modell **ohne jeden Deploy**; das andere Gerät holt es beim nächsten Sync |

**Weg A – über das Repo** (wie bisher, wirkt auf Web und APK):

```bash
git add public/models public/plans tools/model
git commit -m "model: EG Wand versetzt, v0.25"
git push
```

GitHub Actions baut und deployt. Danach genügt es, die App einmal online zu öffnen: sie
holt das neue Modell in den Offline-Cache. Ein App-Update ist dafür nicht nötig.

**Weg B – ohne Deploy**, direkt aus der App: „Modell importieren“ nimmt die Hausdatei (oder
das Export-ZIP), baut Szene und Räume auf dem Gerät und legt Szene, Räume **und Hausdatei**
in `meta/model-<variante>` in Firestore (~95 + 5 + 30 KB, Grenze 1 MiB pro Dokument). Die
Version vergibt die App. Das andere Gerät hat das Modell beim nächsten Sync, auch wenn dort
eine ältere App läuft. Unter „Fertige Szene hochladen (erweitert)“ geht weiterhin der alte
Weg mit einer außerhalb gebauten `ist.json`. Die hat aber keine Hausdatei, der Export gibt
dann die ältere heraus.

**Rückweg ins Repo:** Was über Weg B veröffentlicht wurde, steht nicht im Repo. Vor der
nächsten Änderung im Repo deshalb den App-Export holen und `haus-*.json` nach
`public/models/` legen, dann wie in Abschnitt 3 bauen. Sonst setzt das Repo auf einem
älteren Stand auf, und dessen Version wäre ohnehin niedriger – die App würde sie ignorieren.

In beiden Fällen: **Version immer erhöhen.** Die App vergleicht zahlenweise (`0.10` ist
neuer als `0.9`) und rührt ein Modell mit gleicher oder kleinerer Version nicht an. Vor
dem Ablegen prüft sie die Szene (`validateScene`); eine abgeschnittene Datei wird
abgelehnt und das bisherige Modell bleibt in Betrieb.

## 6. Format der erzeugten Dateien

`public/models/<variante>.json`

```jsonc
{
  "meta": { "variant": "ist", "version": "0.24", "generatedAt": "2026-09-16",
            "note": "EG-Aufmaß 09/2026", "house_w": 12995, "house_d": 11815, "ridge": 7401.4 },
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
