# Das 3D-Modell pflegen

Diese Anleitung richtet sich an den Agenten (oder Menschen), der das Hausmodell ändert.

> **Das Modell liegt nur in der Datenbank** (Firestore, `meta/model-ist` und
> `meta/model-soll`) – nicht im Repo und nicht in der App. Gepflegt wird es in der App:
> Einstellungen → 3D-Modelle → „Modell exportieren“ gibt die Hausdateien (Format
> `reno-haus/1`, [`ANLEITUNG-EXTERN.md`](ANLEITUNG-EXTERN.md)), „Modell importieren“ nimmt
> sie geändert zurück, baut Szene, Räume und Pläne auf dem Gerät und veröffentlicht sie.
> Die Werkzeuge hier im Ordner arbeiten auf solchen exportierten Hausdateien.
> Hintergrund: [`PLAN-MODELL-WORKFLOW.md`](PLAN-MODELL-WORKFLOW.md).

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
| `haus-ist.json`, `haus-soll.json` (aus dem App-Export) | **Die Hausdateien** für Bestand und Zielzustand: Wände mit ihren Öffnungen, Treppen, Dach- und Gaubenmaße, Balkon, Garage, Räume, Konfidenz-Tags A/B/C. |
| `testdata/` | **Eingefrorene Testdaten** (Stand Ist v0.27 / Soll v0.24, zugleich der Startstand für die Datenbank): Hausdateien plus die daraus von Python erzeugten Szenen, Räume und Pläne. Die Unit-Tests der App und die CI halten beide Builder daran fest. Das ist nicht das Modell in Gebrauch. |
| `hausdatei.py` | Liest eine Hausdatei aus `RENO_HAUS_DIR` (Standard: `testdata/`) und stellt sie den Skripten unter den alten Namen bereit (`WALLS`, `OPENINGS`, `HOUSE_W`, `roof_z_under` …). `--format <variante>` schreibt die Datei im kanonischen Layout neu. |
| `haus_model.py`, `haus_model_soll.py`, `rooms_ist.py`, `rooms_soll.py` | Dünne Hüllen um `hausdatei.py`, damit alle älteren Skripte unverändert laufen. **Hier nichts eintragen.** |
| `build_scene_lite.py` | Baut `<variante>.json` neben der Hausdatei, nur mit der Standardbibliothek. Dasselbe tut die App mit `src/modules/modelBuild` – Punkt für Punkt gleich, ein Unit-Test hält das fest. |
| `check_source.py` | Prüft, dass die Szenen im Datenordner genau das sind, was die Hausdateien ergeben (läuft in der CI auf `testdata/`). |
| `build_scene.py` | Dasselbe aus echten Volumenkörpern. **Braucht CadQuery/OCP (~150 MB)** – nötig für STEP/STL, nicht für den Viewer. |
| `extract_scene_from_html.py` | Fallback: zieht die Szene aus einer bereits gebauten `Haus_3D.html`. |
| `check_scene.py` | Prüft eine erzeugte Szene (Schema, geschlossene Hüllen, Orientierung) und vergleicht sie mit `--against` gegen eine Referenz. |
| `build_rooms.py` | Erzeugt `rooms-<variante>.json` **und prüft** die Räume gegen die Wände. |
| `build_plans_svg.py` | Erzeugt die 2D-Grundrisse `plans/<variante>-<geschoss>.svg` (die App zeichnet dieselben selbst). |
| `check_walls.py` | Konsistenzprüfung: freie Wandenden, Räume, Öffnungen innerhalb der Wand (braucht numpy). |
| `Wandtabelle.md`, `README_Uebergabe.md` | Ursprüngliche Übergabe-Doku (Rohbau 1967). **Überholt** – es gilt die Hausdatei. |

## 3. Bestand (Ist) ändern

**Der übliche Weg, ohne Repo:** in der App „Modell exportieren“, die Hausdatei extern ändern
(KI, Editor, siehe `ANLEITUNG-EXTERN.md`), „Modell importieren“, prüfen, veröffentlichen.

**Mit den Python-Werkzeugen** (Kontrolle, STEP/STL, Arbeit im Chat):

```bash
# App-Export entpacken, z. B. nach ~/modell
export RENO_HAUS_DIR=~/modell
$EDITOR ~/modell/haus-ist.json
python3 tools/model/hausdatei.py --format ist          # kanonisches Layout
python3 tools/model/build_rooms.py --variant ist        # meldet Räume, die eine Wand schneidet
python3 tools/model/build_scene_lite.py --variant ist   # Szene zum Prüfen/Vergleichen
python3 tools/model/build_plans_svg.py --variant ist
```

Zurück in die App geht nur die Hausdatei, über „Modell importieren“. Die Version vergibt die
App dort selbst; `version` in der Datei bleibt, wie sie exportiert wurde.

`build_scene_lite.py` und `build_scene.py` beschreiben denselben Körper: gleiche 132 Bauteile,
gleiches Volumen, in fünf Blickrichtungen kein Pixel Unterschied. Der Unterschied liegt nur in
der Vernetzung (lite braucht etwa ein Drittel mehr Dreiecke, ~4500 statt ~3100, weil es Flächen
in Rechtecke statt in minimale Polygone zerlegt). Wasserdichte Volumenkörper braucht nur
`build_print.py` (STL) und `build_cad.py` (STEP/FreeCAD) – daher hängen die an CadQuery, der
Viewer nicht.

## 4. Zielzustand (Soll) ändern

Genauso, aber in `haus-soll.json` und mit `--variant soll`. Die Ist-Datei
bleibt unangetastet: sie ist die abgeglichene Aufnahme des Bestands. Eine Wand fällt weg,
indem ihr Objekt aus `walls` gelöscht wird. Eine neue Wand bekommt eine neue, eindeutige
`id`.

## 5. Veröffentlichen

Es gibt genau einen Weg: **„Modell importieren“ → „Als vX veröffentlichen“** in der App
(angemeldet). Die App baut Szene und Räume auf dem Gerät und legt Szene, Räume **und
Hausdatei** in `meta/model-<variante>` (~95 + 5 + 30 KB, Grenze 1 MiB pro Dokument). Jedes
angemeldete Gerät hört auf dieses Dokument, übernimmt eine höhere Version sofort und
behält sie in IndexedDB – offline, ohne Deploy, ohne App-Update (`src/data/modelSync.ts`,
Logik in `src/data/modelRelease.ts`).

Die Version vergibt die App (höchste bekannte + 1 in der letzten Stelle). Ein Modell mit
gleicher oder kleinerer Version rührt sie nicht an. Vor dem Ablegen prüft sie die Szene
(`validateScene`); ein beschädigtes Dokument wird abgelehnt und das bisherige Modell
bleibt in Betrieb.

**Einmalig beim Umzug (0.51.0):** Solange die Datenbank für eine Variante noch kein Modell
hat, bietet die App unter 3D-Modelle „Startstand übernehmen“ an – das ist Ist v0.27 / Soll v0.24,
der bis dahin mit der App ausgeliefert wurde (`testdata/haus-*.json`). Sind beide
Varianten übernommen, können der Knopf und `publishStartModel` in
`src/data/modelExchange.ts` entfallen.

## 6. Format der erzeugten Dateien

Szene `<variante>.json` (in der Datenbank als Text im Feld `scene`)

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

Räume `rooms-<variante>.json` (Feld `rooms`)

```jsonc
{ "variant": "ist", "generatedAt": "2026-09-14",
  "rooms": [ { "id": "eg-wohnzimmer", "name": "Wohnzimmer", "floor": "EG",
               "rects": [[365, 365, 8375, 4875]], "areaM2": 36.14 } ] }
```

`id` ist der Schlüssel, mit dem Tagebucheinträge, Fotos, Kosten und Aufgaben verknüpft sind.
**Eine einmal vergebene id niemals umbenennen**, solange der Raum derselbe bleibt – sonst
verlieren bestehende Einträge ihre Zuordnung. Ein Raum darf aus mehreren Rechtecken bestehen
(L-Form, Kamin in der Ecke). `rects` darf auch leer sein: ein Soll-Raum ohne Aufmaß taucht
dann in Auswahl, Listen und Suche auf, wird aber erst gezeichnet, sobald die Wände feststehen.

### 6.1 Wenn sich ein Raum durch die Sanierung wirklich ändert

Legen sich zwei Räume zusammen, teilt sich einer, oder entsteht ein neuer – die id bleibt
trotzdem unangetastet. Stattdessen: der veränderte Raum bekommt in `haus-soll.json` eine
**neue** id, und die Umbenennungstabelle `roomMap` in derselben Datei zeigt die alte id
auf die neue.

```jsonc
// haus-soll.json
"rooms": [ …, {"id": "kg-technik", "name": "Technikraum", "floor": "KG", "rects": []}, … ],
"roomMap": {
  "kg-heizung":  "kg-technik",
  "kg-oellager": "kg-technik",
  …                                 // jede Ist-id kommt vor, auch unveränderte auf sich selbst
}
```

`roomMap` ist **vollständig** (jede Raum-id aus `haus-ist.json` kommt genau einmal vor,
auch ein unveränderter Raum auf sich selbst) und **einspaltig** (ein Ziel je Eintrag; bei
einer Teilung zeigt die alte id auf den Raum, der am ehesten ihr Nachfolger ist). Die App
lehnt beim Import ein Ziel ab, das es in der Soll-Datei nicht gibt; `build_rooms.py`
meldet zusätzlich fehlende Ist-ids.

Die App liest die Zuordnung nur vorwärts: ein alter Tagebucheintrag unter „Heizung“ oder
„Öllager“ erscheint in der Einstellung „Planung“ unter „Technikraum“; ein neuer Eintrag
unter „Technikraum“ muss nicht umgekehrt unter „Öllager“ auffindbar sein. Details und die
Einstellung Bestand/Planung stehen in `src/data/roomNaming.ts` und in `PLAN.md`,
Abschnitt 9.4.

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
