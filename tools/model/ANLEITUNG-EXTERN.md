# Hausmodell Schlesierstraße 31 – Anleitung zum Bearbeiten

Diese Datei liegt in jedem Modell-Export der App **Reno Master**. Sie richtet sich an
den, der das Modell außerhalb der App ändert: eine KI (Claude, ChatGPT, Gemini …), ein
Skript oder einen Menschen mit Texteditor. Wer sie gelesen hat, braucht nichts anderes.

> Format `reno-haus/1`, Stand 24.09.2026.

## Kurz gesagt

1. Geändert wird **nur `haus-ist.json`** (Bestand) oder **`haus-soll.json`**
   (Zielzustand nach der Sanierung). Alle anderen Dateien im ZIP sind Ansichten.
2. Zurück kommt **die vollständige Datei**: gültiges JSON, ohne Kommentare, gleicher
   Dateiname.
3. In der App: Einstellungen → 3D-Modelle → **Modell importieren** → Datei wählen (die
   JSON allein oder das ganze ZIP). Die App prüft sie, baut das 3D-Modell und die Räume
   und zeigt, was sich ändert. „Im 3D ansehen“ zeigt das Ergebnis vorab.
   **Veröffentlicht wird erst auf einen zweiten Tipp**, dann haben es alle Geräte.

## Was im Export steckt

| Datei | Zweck | Zurückgeben? |
|---|---|---|
| `ANLEITUNG.md` | diese Anleitung | nein |
| `haus-ist.json` | **Quelle Bestand**: Wände, Öffnungen, Treppen, Räume, Grundmaße | **ja, wenn geändert** |
| `haus-soll.json` | **Quelle Zielzustand**, am Anfang eine Kopie von Ist | **ja, wenn geändert** |
| `grundriss-ist.dxf`, `grundriss-soll.dxf` | Grundrisse aller Geschosse für CAD, aus der Hausdatei erzeugt. Ursprung und Einheit wie unten. | nein |
| `grundriss-ist-KG.svg`, `-EG.svg`, `-OG.svg` (ebenso `soll`) | dieselben Grundrisse als Bild mit Raumnamen und Flächen, für KIs und Menschen ohne CAD | nein |

Das berechnete 3D-Netz ist nicht im Export. Die App erzeugt es aus der Hausdatei.

## Koordinatensystem

Alle Maße in **Millimetern, ganze Zahlen** (0,5 mm geht als `.5`, wenn es das Aufmaß so
sagt).

| Achse | Null | positiv nach |
|---|---|---|
| x | Außenkante Westwand (Garagenseite) | **Osten** |
| y | Außenkante Südwand (Straße) | **Norden** (Garten) |
| z | Oberkante Rohdecke EG | oben |

Haus 12 995 × 11 815. Die Wandscheiben neben der Loggia springen bis `y = −125` nach Süden
vor. Garage westlich (x −8000 … −1510).

Geschosse: `KG` (Boden −2750), `EG` (Boden 0), `OG` (Boden 2750, Wände oben bis unter die
Dachschräge geschnitten), `GAR` (Boden −1360). Geschosshöhe 2750, Decke 140.

Das DXF im Export verwendet genau dieses System (Einheit mm, `$INSUNITS = 4`). Ein neues
Aufmaß, das auf diesem DXF gezeichnet ist, lässt sich also direkt ablesen. Alle Geschosse
liegen übereinander und werden über Layer getrennt: `EG_WAND_A` (Wände nach Konfidenz
A/B/C), `EG_FENSTER`, `EG_TUER`, `EG_DURCHGANG`, `EG_RAUM` und `EG_RAUMTEXT` (Name, id,
Fläche), `EG_TREPPE`, entsprechend für `KG`, `OG` und `GAR`.

## Aufbau der Hausdatei

```jsonc
{
  "format": "reno-haus/1",
  "variant": "ist",                      // "ist" | "soll" - nicht ändern
  "version": "0.25",                     // Stand des Exports - NICHT ändern, die App vergibt die nächste
  "note": "",                            // HIER kurz eintragen, was sich geändert hat (erscheint in der App)
  "info": ["…"],                         // Herkunft der Maße (Aufmaß, Pläne) - Lesestoff, optional

  "params": {                            // Grundmaße, selten zu ändern
    "houseW": 12995, "houseD": 11815,    // Außenmaße
    "tOut": 400,                         // Außenwanddicke (für Dach, Decken)
    "slab": 140, "storey": 2750,         // Deckendicke, Geschosshöhe
    "kniestock": 650, "roofPitch": 36,   // OG-Kniestock, Dachneigung in Grad
    "roofOverhang": 500, "roofT": 200,   // Dachüberstand, Dachpaket
    "ogCeil": 5340,                      // Oberkante Spitzbodendecke
    "yVor": -125                         // Loggia-Vorsprung (südlichster Punkt)
  },

  "walls": [
    {
      "id": "eg-aussenwand-sued",        // stabil; neue Wände: frei wählen, eindeutig, klein-mit-bindestrichen
      "floor": "EG",                     // KG | EG | OG | GAR
      "name": "Außenwand Süd",           // Anzeigename im 3D-Modell
      "x0": 0, "y0": 0, "x1": 8505, "y1": 400,   // Grundriss-Rechteck, x0<x1, y0<y1
      "tag": "A",                        // A gemessen | B abgeleitet | C Annahme
      "tragend": true,                   // optional; ohne Angabe: Dicke >= 240 mm
      "note": "Aufmaß 09/2026",          // optional, frei
      "openings": [
        {
          "kind": "window",              // window | door | passage (offener Durchgang, raumhoch)
          "from": 1365, "to": 6875,      // ABSOLUTE Koordinate entlang der Wand (siehe unten)
          "sill": 700,                   // Brüstung über Geschossboden (Tür: 0)
          "height": 1385,                // lichte Höhe (bei passage ignoriert)
          "tag": "A",
          "note": "Wohnzimmer"
        }
      ]
    }
  ],

  "stairs": [                            // gerade Läufe
    { "name": "Holztreppe EG→OG", "x0": 5015, "y0": 10470, "width": 1010,
      "steps": 14, "rise": 196.43, "run": 270, "z0": 0,
      "direction": "-y", "tag": "B" }    // Laufrichtung +x | -x | +y | -y ab (x0, y0)
  ],
  "landings":       [ { "name": "Podest …", "x0": 400, "y0": 5130, "x1": 1455, "y1": 7365, "z": -1375, "tag": "A" } ],
  "slabOpenings":   { "EG": [0, 5130, 3615, 7365], "OG": [5015, 6690, 6025, 10050] },  // Treppenaugen [x0,y0,x1,y1]
  "slabExtras":     [ { "floor": "EG", "name": "Loggia Boden", "x0": 8245, "y0": -125, "x1": 12995, "y1": 0, "z0": -140, "tag": "A" } ],
  "loggiaParapets": [],                  // Brüstungen: { x0, y0, x1, y1, h, tag }
  "gaube":  { "x0": 4840, "x1": 9370, "depth": 2250, "wallH": 2200,
              "windows": [[1010, 60], [1010, 60], [1010, 60], [1010, 60]],   // [Breite, Pfosten danach]
              "cheek": [175, 135], "tag": "B" },
  "balkon": { "x0": -1300, "x1": 0, "y0": 3035, "y1": 8095, "tag": "A" },
  "garage": { "x": [-8000, -1510], "y": [5100, 12090], "z0": -1360, "hFront": 2600, "hBack": 2300 },

  "rooms": [
    { "id": "eg-wohnzimmer", "name": "Wohnzimmer", "floor": "EG",
      "rects": [[400, 400, 8245, 4860]] }          // ein oder mehr Rechtecke [x0,y0,x1,y1], INNENkanten
  ]
}
```

### Wände

- Jede Wand ist ein **achsparalleles Rechteck** im Grundriss. Schräge Wände gibt es im Haus
  nicht, und die App kann sie nicht bauen.
- Die Höhe ergibt sich aus dem Geschoss: KG und EG raumhoch bis unter die Decke, OG bis
  unter die Dachschräge (Süd- und Nordaußenwand nur Kniestock), Garage mit 4 % Gefälle.
  Es gibt kein Höhenfeld.
- Wände dürfen sich an Ecken und Stößen überlappen. Die App schneidet die Überlappung
  selbst weg, Vorrang haben Außenwände, dann dicke vor dünnen. Jedes Wandende soll eine
  andere Wand berühren. Ein freies Ende meldet die App als Hinweis.
- Die **Längsrichtung** einer Wand ist die längere Seite des Rechtecks. Ost-West-Wände
  laufen in x, Nord-Süd-Wände in y.

### Öffnungen

- Sie stehen **in ihrer Wand** (`openings`). Wird eine Wand gelöscht, verschwinden ihre
  Öffnungen mit.
- `from`/`to` sind **absolute Koordinaten entlang der Wand**: x bei Ost-West-Wänden,
  y bei Nord-Süd-Wänden. Man kann sie also direkt aus einem Plan oder DXF ablesen.
  Beispiel: die Tür Wohnzimmer|Loggia in der Nord-Süd-Wand x = 8245 reicht von y = 550 bis
  y = 1560 → `"from": 550, "to": 1560`.
- Sie müssen innerhalb der Wand liegen (`x0 ≤ from < to ≤ x1` bzw. mit y). Sonst lehnt die
  App den Import ab.
- `sill` und `height` zählen ab dem Geschossboden (KG −2750, EG 0, OG 2750, GAR −1360).

### Räume

- Rechtecke in **Innenkanten** (Wandoberfläche mit Putz), auf dem Geschoss des Raums. Ein
  L-förmiger Raum oder ein Raum um einen Kamin besteht aus mehreren Rechtecken.
- Keine Wand darf ein Rechteck durchschneiden. Ausnahme: ein `passage` in dieser Wand.
  Räume eines Geschosses dürfen sich nicht überlappen.
- Die Fläche rechnet die App selbst aus. Eine gestempelte Planfläche gehört in `note`.
- **Die `id` eines Raums niemals ändern oder wiederverwenden.** An ihr hängen Tagebuch,
  Fotos, Kosten und Aufgaben. Umbenennen geht über `name`. Neuer Raum: neue id nach dem
  Muster `<geschoss>-<name>` (`eg-hwr`).
- **Im Bestand (`haus-ist.json`) fällt kein Raum weg.** Die App nennt entfernte ids beim
  Import und veröffentlicht erst nach ausdrücklicher Bestätigung; Einträge daran verlieren
  sonst ihre Zuordnung.
- **In der Planung (`haus-soll.json`) wird zusammengelegt, geteilt, verschoben** – mit
  neuen ids und der Umbenennungstabelle `roomMap` (nur in der Soll-Datei):

  ```jsonc
  "roomMap": {
    "kg-heizung": "kg-technik",     // Heizung und Öllager werden der Technikraum
    "kg-oellager": "kg-technik",
    "eg-bad": "eg-bad",             // jede Ist-id kommt vor, unveränderte zeigen auf sich selbst
    …
  }
  ```

  Jede Raum-id aus `haus-ist.json` steht genau einmal links, rechts steht eine id aus den
  Räumen von `haus-soll.json`. Darüber zeigt die App alte Einträge unter dem neuen Raum.
- Ein geplanter Raum darf noch **keine Fläche** haben (`"rects": []`): er erscheint dann in
  Auswahllisten und der Suche, aber noch nicht im 3D und in den Plänen.
- `note` bei einem Raum ist frei, meist steht dort die im Plan gestempelte Fläche.

### Konfidenz `tag`

`A` gemessen oder Maßkette direkt gelesen · `B` abgeleitet oder aus dem Plan von 1967
übernommen · `C` Annahme. Im 3D-Viewer sieht man den Unterschied an der Farbe. Den Tag
nur hochstufen, wenn es wirklich ein Aufmaß gibt.

### Was NICHT in der Datei steht

Dachform (Satteldach, First mittig), die OG-Wände unter der Schräge, Spitzbodendecke,
Garagendach, Balkongeländer und die Materialien baut die App selbst. Sie lassen sich nur
über `params`, `gaube`, `balkon` und `garage` beeinflussen. Für eine andere Dachform muss
das Programm geändert werden. Das gehört in einen Chat mit Repo-Zugriff, nicht in die
Hausdatei.

## Ist oder Soll?

- **`haus-ist.json` ist das Aufmaß des Bestands.** Nur ändern, wenn das Haus anders
  gemessen wurde oder ein Umbau schon passiert ist.
- **`haus-soll.json` ist die Planung.** Wände wegnehmen, versetzen, Türen verschieben,
  Räume neu aufteilen: alles hier. Beim ersten Mal ist es eine Kopie von Ist. Also Kopie
  nehmen und ändern.

## Typische Aufgaben

**Wand versetzen** (z. B. neues Aufmaß): `x0/x1` bzw. `y0/y1` ändern. Dann prüfen, ob
angrenzende Wände noch anstoßen, ob Öffnungen noch in der Wand liegen und ob die
angrenzenden Raumrechtecke mitwandern müssen. Dafür bei allen Räumen dieses Geschosses die
betroffene Kante anpassen.

**Tür einbauen:** in der Wand ein Objekt unter `openings` anlegen:
`{"kind":"door","from":…,"to":…,"sill":0,"height":2010,"tag":"C"}`. Standardbreiten
(Rohbau/Lichtmaß) sind 760, 885 und 1010, die Höhe 2010.

**Wand im Soll entfernen:** das Wandobjekt löschen. Die beiden Räume links und rechts
zu einem Raum zusammenfassen (Rechtecke vereinigen, eine id behalten) und den Streifen,
auf dem die Wand stand, in ein Rechteck aufnehmen.

**Aufmaß aus einem eigenen DXF übernehmen:** Wände im DXF als Rechtecke oder
Linienpaare suchen. Die Außenkante der Westwand liegt bei x = 0, die der Südwand bei y = 0.
Liegt das DXF woanders, verschieben. Dicke = Abstand der beiden Wandkanten. Jede Wand der
Hausdatei der gleichen Wand im DXF zuordnen, `id` behalten, Koordinaten ersetzen, `tag`
auf `A`. Wände, die sich nicht zuordnen lassen, in `note` aufzählen statt raten.

## Selbstkontrolle vor der Rückgabe

- [ ] Gültiges JSON, `format`, `variant` und `version` unverändert.
- [ ] `note` sagt in einem Satz, was sich geändert hat.
- [ ] Alle Zahlen in mm, jedes Rechteck mit `x0 < x1` und `y0 < y1`.
- [ ] Jede Öffnung liegt in ihrer Wand. `sill + height` ist nicht höher als das Geschoss
      (2610 in KG/EG).
- [ ] Kein Raum wird von einer Wand durchschnitten, keine Räume überlappen.
- [ ] **Keine Raum-id umbenannt.** Entfernte ids sind in `note` genannt.
- [ ] Nichts geändert, worum nicht gebeten wurde.

Auch wenn etwas übersehen wird: Die App prüft alles davon beim Import noch einmal und
veröffentlicht nichts mit Fehlern. Fehler nennen die Stelle so, dass man sie in der Datei
findet, zum Beispiel `Wand eg-flur-bad-14-5 (walls[12]), Öffnung 1: y 9855–10615 liegt nicht
in der Wand`.

## Was die App daraus macht

- Die **Versionsnummer** vergibt die App: die höchste bekannte plus eins in der letzten
  Stelle (0.25 → 0.26). Deshalb bleibt `version` in der Datei, wie sie war. Die App liest
  daran ab, auf welchem Stand die Änderung beruht, und warnt, wenn inzwischen ein neuerer
  in Gebrauch ist.
- Beim Veröffentlichen wandern 3D-Modell, Raumliste **und die Hausdatei selbst** zu allen
  Geräten. Der nächste Export gibt also genau diesen Stand heraus.
- Geprüft wird: Aufbau und Datentypen, Öffnungen in ihrer Wand, Räume innerhalb des Hauses,
  nicht von Wänden durchschnitten, ohne Überlappung. Nur als Hinweis kommen neue freie
  Wandenden und Öffnungen, die höher sind als das Geschoss.

## Prompt-Vorlage für eine externe KI

> Im Anhang ist der Export meines Hausmodells (ZIP). Lies zuerst `ANLEITUNG.md` und halte
> dich genau daran. Aufgabe: **‹hier die Änderung, z. B. „im Soll die Wand zwischen Flur
> und Bad im EG entfernen und die Räume zu einem Bad zusammenlegen“›**. Gib mir die
> vollständige geänderte `haus-soll.json` als Datei zurück und liste darunter in drei bis
> fünf Punkten auf, was du geändert hast.
