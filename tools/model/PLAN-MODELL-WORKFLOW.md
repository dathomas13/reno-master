# Plan: Das 3D-Modell extern bearbeiten und per Knopf zurückspielen

Stand 24.09.2026. Bewertung des heutigen Ablaufs und der Umbauplan. Die Anleitung für das
externe Werkzeug (KI oder Mensch) steht getrennt in [`ANLEITUNG-EXTERN.md`](ANLEITUNG-EXTERN.md).
Sie liegt später auch in jedem Export-ZIP.

---

## 1. Wie es heute läuft und wo es hakt

```
haus_model.py ─┐                         ┌─ public/models/ist.json (Dreiecksnetz, 96 KB)
haus_model_soll.py ─┤  Python-Skripte    ├─ public/models/rooms-ist.json
rooms_ist.py ──┤  (build_scene_lite,     ├─ public/plans/ist-EG.svg …
rooms_soll.py ─┘   build_rooms, plans)   └─ manifest.json
                         │
            git push (Weg A) oder Datei-Upload in der App (Weg B)
```

| Problem | Folge |
|---|---|
| **Die Quelle ist Python-Code**, verteilt auf vier Dateien. Maße stehen teils als Ausdrücke (`3115 - Y_VOR`, `X_LOAD2[1]`), Öffnungen hängen über den Wandnamen an der Wand. | Ein externes Werkzeug muss Python lesen und schreiben können. Eine andere KI oder ein CAD-Programm kann damit nichts anfangen. |
| **Das Bauen braucht Python und das Repo.** | Praktisch geht jede Änderung nur über diesen Chat. |
| **Weg B nimmt das fertige Dreiecksnetz entgegen**, nicht die Quelle. | Der Upload ohne Deploy hilft nur dem, der ohnehin Python laufen hat. |
| **Die 2D-Pläne kommen nur per Deploy** (`public/plans`, gebündelt). | Nach Weg B zeigt der 3D-Viewer das neue Modell, die Pläne zeigen noch das alte. |
| **Es gibt keinen Export aus der App.** | Der aktuelle Stand lässt sich nicht als Datei herausgeben. |
| **Was über Weg B veröffentlicht wird, kommt nie ins Repo zurück.** | Die nächste Änderung im Repo baut auf einem veralteten Stand auf. |

Was schon gut ist und bleiben soll: Die Modellversion hängt nicht am App-Build. Die App
nimmt die höchste Fassung aus Bündel, Website oder Firestore, prüft sie (`validateScene`),
legt sie in IndexedDB ab und zeigt sie auch offline. Auf diesem Kanal baut der Plan auf.

---

## 2. Die Möglichkeiten im Vergleich

| | Ansatz | Extern bearbeitbar | Knopf in der App | Offline | Aufwand | Urteil |
|---|---|---|---|---|---|---|
| A | So lassen (Python + Chat) | nein | nein | – | 0 | der heutige Engpass |
| B | App schickt die Quelle über den Worker an eine GitHub Action, die Python laufen lässt und committet | ja, wenn die Quelle Daten statt Code ist | ja, Ergebnis nach 3–5 min | nein | mittel | Token im Worker, Bot-Commits kollidieren mit der Regel „jeder Push ist ein Release“, keine Vorschau |
| C | Pyodide (Python als WebAssembly) in der App, alte Skripte unverändert | wie B | ja, sofort | ja, nach ~10 MB Download | klein | keine Portierung, aber 10 MB mehr in APK/Cache und 3–5 s Start auf dem S24 |
| **D** | **Hausdatei (JSON) als einzige Quelle, Builder als TypeScript in der App** | **ja** | **ja, sofort, mit Vorschau** | **ja** | mittel | **Empfehlung** |
| E | DXF als Quelle | im CAD ja | – | – | hoch | Ein DXF kennt Linien, aber keine Wände, Höhen, Brüstungen, Raum-ids oder Konfidenz. Die Deutung braucht jedes Mal Intelligenz, also eine KI, und ist kein Skript. Als **Ansicht** und **Eingang für ein Aufmaß** gut, als Quelle nicht. |
| F | FreeCAD/IFC als Quelle | im CAD ja | nein | – | sehr hoch | Werkzeugwechsel, kein Weg zurück aufs Telefon ohne Server |

**Warum D:** Die ganze Geometrie besteht aus achsparallelen Quadern und Keilen. Der
Python-Builder (`build_scene_lite.py`, rund 600 Zeilen, nur Standardbibliothek) lässt sich
also sauber portieren. Danach gilt:

- Die **Hausdatei** ist reiner Text mit etwa 30 KB. Jede KI, jeder Editor und jedes Skript
  kann sie lesen und schreiben. Sie enthält alles, was ein Mensch entscheidet: Wände,
  Öffnungen, Treppen, Räume, Grundmaße.
- Alles andere wird daraus berechnet (Netz, Räume, Pläne), und zwar **auf dem Telefon**.
  Das dauert unter einer Sekunde, geht offline und zeigt vor dem Veröffentlichen eine
  Vorschau.
- Weil die Quelle Text ist, fällt Stufe 6 fast umsonst ab: die Änderung direkt in der App
  beschreiben, Claude ändert die Hausdatei. Den API-Schlüssel hat die App schon.

Pyodide (C) bleibt der Notfallplan, falls die Portierung sich an einer Stelle als
widerspenstig erweist. Mit D teilt es sich Stufe 0 (Hausdatei) und die ganze Oberfläche.

---

## 3. Der neue Ablauf aus Sicht des Benutzers

```
 App: Einstellungen → 3D-Modelle
 ┌───────────────────────────────┐
 │ [Modell exportieren]          │──►  reno-modell-v0.25.zip
 └───────────────────────────────┘        ├─ ANLEITUNG.md      (für die externe KI)
                                          ├─ haus-ist.json     ◄── das Einzige, was man ändert
                                          ├─ haus-soll.json    ◄── dito, für den Zielzustand
                                          ├─ grundriss-ist.dxf (zum Ansehen im CAD)
                                          └─ grundriss-ist-EG.svg … (Bilder für KIs ohne DXF)
                  │
                  ▼  extern: Claude/ChatGPT/Gemini (ZIP hochladen + „verschiebe die Wand …“),
                     Texteditor, eigenes Skript, oder Aufmaß-DXF + ANLEITUNG an eine KI
                  │
 ┌───────────────────────────────┐
 │ [Modell importieren]          │◄──  haus-ist.json (oder das ganze ZIP zurück)
 │   ↓ prüfen + bauen (lokal)    │
 │   Bericht: 2 Wände verschoben,│
 │   1 Tür neu, Raum eg-bad      │
 │   7,1 → 6,4 m², 0 Fehler      │
 │   [Vorschau im 3D]            │
 │   [Veröffentlichen als v0.26] │──►  Firestore meta/model-ist (Netz + Räume + Quelle)
 └───────────────────────────────┘      → alle Geräte beim nächsten Sync, Pläne inklusive
```

- **Export** gibt immer den Stand heraus, den die App gerade zeigt, also die höchste
  bekannte Version. Die Quelle reist in jeder Veröffentlichung mit. Deshalb exportiert jedes
  Gerät denselben Stand, egal ob er aus dem Bündel oder aus Firestore kommt.
- **Import** ist der gewünschte Knopf „neues Modell drin, jetzt ausführen“. Die App prüft,
  baut, zeigt den Bericht und die Vorschau. Veröffentlicht wird erst auf einen zweiten Tipp.
  Die Versionsnummer vergibt die App selbst (höchste bekannte + 0.01), damit sie nie
  doppelt vorkommt.
- **Fehler blockieren** (kaputtes JSON, Öffnung außerhalb der Wand, Raum von einer Wand
  durchschnitten, Raum-id verschwunden). **Hinweise warnen** nur (freies Wandende,
  Fläche stark verändert).

---

## 4. Umsetzung in Stufen

Jede Stufe ist für sich nutzbar und ein eigener Release.

### Stufe 0 – Hausdatei als einzige Quelle (Python-Seite)

- Format `reno-haus/1` festlegen, wie in `ANLEITUNG-EXTERN.md` beschrieben.
- `tools/model/source/haus-ist.json` und `haus-soll.json` einmalig aus den heutigen
  Python-Dateien erzeugen (`export_source.py`). Ausdrücke werden zu Zahlen, Kommentare zu
  `note`-Feldern, Öffnungen wandern als absolute `from`/`to` in ihre Wand.
- `haus_model.py` wird zum **Lader**: liest die JSON und stellt dieselben Namen bereit
  (`WALLS`, `OPENINGS`, `HOUSE_W`, `roof_z_under` …). Damit laufen `build_scene_lite.py`,
  `build_rooms.py`, `build_plans_svg.py`, `build_cad.py` und `build_print.py` unverändert
  weiter. `rooms_ist.py`, `rooms_soll.py` und `haus_model_soll.py` entfallen.
- **Abnahme:** `check_scene.py public/models/ist.json --against <vorher>` meldet keinen
  Unterschied, die Pläne sind bytegleich.
- Die Hausdatei geht zusätzlich nach `public/models/haus-ist.json`, damit das Bündel sie
  enthält.

### Stufe 1 – Builder in TypeScript

Neues Modul `src/modules/modelBuild/`, ohne Abhängigkeiten, lauffähig in einem Web Worker:

| Datei | Inhalt | Vorlage |
|---|---|---|
| `source.ts` | Typen und Schema-Prüfung der Hausdatei, verständliche Fehlermeldungen mit Pfad (`walls[12].openings[1].to`) | – |
| `solid.ts` | Bänder und Keile: `box`, `prism`, `solidSub`, `solidInter`, `solidUnion` | `build_scene_lite.py` Z. 40–220 |
| `mesh.ts` | Innenflächen entfernen, T-Stöße verschweißen, triangulieren, runden | Z. 220–378 |
| `buildScene.ts` | Wände, Decken, Treppen, Dach, Gaube, Balkon, Garage | Z. 380–566 |
| `buildRooms.ts` | `rooms-<variante>.json` und die Raumprüfungen | `build_rooms.py` |
| `checks.ts` | freie Wandenden, Öffnungen in der Wand, geschlossene Hüllen | `check_walls.py`, `check_scene.py` |
| `diff.ts` | Vergleich zweier Hausdateien für den Bericht | – |

- **Golden-Test:** Der TS-Builder baut aus `public/models/haus-ist.json` genau
  `public/models/ist.json` (gleiche Bauteile, gleiche Punkte nach Rundung auf 0,1 mm).
- **CI-Wächter:** Ein Job lässt beide Builder laufen und vergleicht. So kann keiner der beiden
  unbemerkt abweichen. Python bleibt Referenz und Weg zu STEP/STL.

### Stufe 2 – Export und Import in der App

- `ModelSection` bekommt „Modell exportieren“ und „Modell importieren“. Der alte Upload von
  Szenen-JSON bleibt als „Erweitert“ erhalten.
- **Export:** ZIP über `src/lib/zip.ts` und den vorhandenen Datei-Export bzw. Teilen-Dialog.
  Inhalt siehe Abschnitt 3. `ANLEITUNG.md` ist `ANLEITUNG-EXTERN.md`, beim Build gebündelt.
- **Import:** nimmt `.json` oder `.zip`. Für das ZIP braucht es einen kleinen Leser.
  Externe Werkzeuge packen mit *deflate*, also `DecompressionStream('deflate-raw')`, das
  WebView und Chrome können. Dann folgen Prüfen, Bauen im Worker, Bericht, Vorschau
  (Viewer mit einer temporären Szene, ohne IndexedDB) und Veröffentlichen.
- `publishModel` speichert zusätzlich `sourceJson` im Release-Dokument. Die Größe
  (96 KB Netz, 5 KB Räume, 30 KB Quelle) liegt weit unter 1 MiB. `modelRelease.ts` und
  `modelStore.ts` reichen die Quelle durch, sodass der Export sie findet.
- Soll wird genauso behandelt. Solange `haus-soll.json` eine Kopie von Ist ist, zeigt der
  Bericht das an.

### Stufe 3 – Pläne aus der Quelle

- `build_plans_svg.py` nach `src/modules/modelBuild/plansSvg.ts` portieren (250 Zeilen).
  Die Plan-Ansicht rendert die Grundrisse der aktiven Modellfassung, statt die gebündelten
  SVGs zu laden. Damit passen Pläne und 3D immer zusammen, auch nach einer Veröffentlichung
  ohne Deploy.
- Die gebündelten SVGs bleiben nur als Rückfall.

### Stufe 4 – DXF

- **Export** (klein, sicher): `grundriss-<variante>.dxf`, ASCII R12, Einheit mm, gleicher
  Ursprung wie das Modell, Layer je Geschoss (`EG_WAND_A`, `EG_FENSTER`, `EG_TUER`,
  `EG_RAUM` mit Text `id`). Darin kann man ein neues Aufmaß direkt über den Bestand legen.
- **Import** (später, optional, streng): nur geschlossene Rechteck-Polylinien auf
  `*_WAND_*`-Layern. Sie werden über Lage und Überdeckung den bestehenden Wänden zugeordnet.
  Höhen, Öffnungen und Tags kommen aus der alten Hausdatei. Alles, was sich nicht eindeutig
  zuordnen lässt, landet im Bericht statt im Modell. Den Aufwand lohnt das erst, wenn sich
  das Muster „Aufmaß im CAD, dann Modell“ wiederholt. Bis dahin übersetzt die KI mit
  `ANLEITUNG.md` das DXF in die Hausdatei. Das ist zuverlässiger als ein Parser, der raten
  müsste.

### Stufe 5 – Rückweg ins Repo

- Die in der App veröffentlichte Quelle soll auch im Repo landen, damit CAD-Export und
  Chat-Arbeit auf dem neuesten Stand aufsetzen. Einfachster Weg: Das Export-ZIP wird der
  nächsten Chat-Sitzung übergeben, und der Agent legt `haus-*.json` ab und baut neu.
- Regel für Agenten (in `README-MODELL.md`): **Vor jeder Modelländerung im Repo zuerst den
  App-Export holen** oder die Version in Firestore gegen die im Repo prüfen. Das Repo darf
  nur auf der höchsten Fassung aufsetzen. Eine niedrigere Version würde die App ohnehin
  ignorieren.

### Stufe 6 (Ausblick) – Änderung in der App beschreiben

- Unter „Modell importieren“ ein Textfeld „Was soll sich ändern?“. Die App schickt
  `ANLEITUNG.md`, die Hausdatei und die Bitte an Claude, mit dem Schlüssel aus den
  OCR-Einstellungen, und bekommt die geänderte Hausdatei zurück. Danach läuft dieselbe
  Pipeline aus Prüfen, Bericht, Vorschau und Veröffentlichen. Die KI kann also nichts
  veröffentlichen, was nicht geprüft und gesehen wurde.

---

## 5. Risiken und Entscheidungen

| Punkt | Umgang |
|---|---|
| Zwei Builder laufen auseinander | Golden-Test plus CI-Vergleich (Stufe 1). Python nur noch als Referenz und für CAD. |
| Nur achsparallele Wände | Der Builder kann keine schrägen Wände. Das steht in der Anleitung und wird beim Import mit einer klaren Fehlermeldung abgelehnt. Das Haus hat keine schrägen Wände. |
| Dachform, Geschosshöhen-Logik, OG-Wände unter der Schräge | Stecken im Builder, nicht in der Datei. Über Parameter (Neigung, Kniestock, Überstand) steuerbar. Eine andere Dachform bleibt Chat-Arbeit. |
| Raum-id verschwindet | Import blockiert mit der Liste der betroffenen Einträge. Umbenennen geht nur über `name`, nie über `id`. |
| Zwei Geräte veröffentlichen gleichzeitig | Die höhere Version gewinnt, wie heute. Der Bericht zeigt, auf welcher Version der Import aufsetzt. Ist das nicht die aktuelle, gibt es eine Warnung. |
| Soll als volle Kopie von Ist | Einfach für externe Werkzeuge. Eine spätere Ist-Korrektur wandert aber nicht von selbst ins Soll. Der Bericht vergleicht Soll mit Ist und zeigt Abweichungen, sodass man sie sieht. Ein Patch-Format („Soll = Ist + Änderungen“) wäre eleganter, ist aber für eine fremde KI deutlich fehleranfälliger. Erst einführen, wenn das Nachziehen lästig wird. |
| Import-ZIP mit Kompression | `DecompressionStream` ist in Chromium/WebView vorhanden. Ohne ihn geht die einzelne `.json` immer. |

## 6. Reihenfolge und Umfang

| Stufe | Ergebnis für den Benutzer | Umfang |
|---|---|---|
| 0 | Eine lesbare Hausdatei statt vier Python-Dateien. Extern bearbeitbar, zurück über den Chat. | klein |
| 1 + 2 | **Export/Import-Knopf in der App, Bauen auf dem Telefon, Vorschau, kein Chat nötig** | groß (Kern) |
| 3 | Pläne folgen dem Modell ohne Deploy | mittel |
| 4 | DXF zum Ansehen und Überzeichnen im CAD | klein (Export) |
| 5 | Repo bleibt aktuell | Regel + klein |
| 6 | Änderung in Worten direkt in der App | klein, wenn 1–2 stehen |

Empfohlen: 0 → 1 → 2 in einem Zug, dann 3 und 4, dann 6.
