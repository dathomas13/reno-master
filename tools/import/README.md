# Einmaliger Import aus Notion

Zwei Schritte: **Export** aus Notion in JSON-Dateien, dann **Import** nach Firestore und
Firebase Storage. Der Import ist idempotent – er erkennt schon importierte Datensätze an
ihrer Notion-ID und aktualisiert sie, statt Dubletten anzulegen.

## Schritt 1: Export

Am einfachsten über den Notion-Connector in einer Claude-Sitzung. Die Datenquellen im
Workspace „Thomas's Notion“, Bereich **Hausrenovierung**:

| Inhalt | Data-Source-URL | Umfang (Stand 13.09.2026) |
|---|---|---|
| Bautagebuch | `collection://33ccbf13-353a-80c3-8cdc-000b9d359219` | 16 Einträge, 20.08.–11.09.2026, 18 Fotos |
| Aufgaben | `collection://33bcbf13-353a-8188-938d-000b4019197a` | 33 |
| Kontakte | `collection://33bcbf13-353a-81aa-be74-000b0ef2979e` | 19 |
| Gewerke | `collection://33bcbf13-353a-8150-8fca-000bd433c726` | 18 |
| Projektphasen | `collection://33bcbf13-353a-81c8-afd7-000b122f7314` | 10 |
| Finanzen (nur Rechnungsanhänge) | `collection://33bcbf13-353a-81de-ad28-000b6c346a98` | 10 Dateien |

Wichtig: Der eigentliche Text eines Tagebucheintrags steht **nicht** in der Eigenschaft
„Notizen“, sondern im Seiteninhalt. Also pro Eintrag `notion-fetch` auf die Seiten-URL
aufrufen und den `<content>`-Block übernehmen; `<br>` wird zum Zeilenumbruch.

Die Fotos hängen als Notion-Attachments an den Einträgen (`Fotos`-Eigenschaft, Werte der
Form `file://…attachment:<id>:<dateiname>`). Mit `notion-download-attachment` herunterladen
und unter `tools/import/notion/files/<pageId>/<dateiname>` ablegen.

Ergebnis (dieser Ordner ist absichtlich gitignored, er enthält private Daten):

```
tools/import/notion/
  diary.json      tasks.json      contacts.json
  trades.json     phases.json     costs.json
  files/<pageId>/<originalname>.jpg
```

### Format

```jsonc
// diary.json
[{ "notionId": "3d8cbf13…", "date": "2026-09-04", "title": "Tagebuch 04.09",
   "text": "Wolfgang hat …\nAbends noch …",
   "weather": "Bewölkt", "present": ["Wolfgang"], "defects": false,
   "phaseNotionId": "33bcbf13…", "tradeNotionIds": [],
   "photos": [{ "file": "files/3d8cbf13…/20260904_181303.jpg", "takenAt": "2026-09-04T18:13:03" }] }]

// tasks.json
[{ "notionId": "…", "title": "Angebot Dachdecker einholen", "status": "Offen",
   "priority": "Hoch", "due": "2026-09-20", "assignees": ["Thomas"], "area": "Dach",
   "tradeNotionId": "…", "phaseNotionId": "…", "notes": "" }]

// contacts.json
[{ "notionId": "…", "name": "Gerald Schabner", "company": "", "role": "Dachdecker",
   "phone": "", "email": "", "status": "Angefragt", "rating": 4, "notes": "" }]

// trades.json / phases.json - nur zum Zuordnen der Relationen
[{ "notionId": "…", "name": "Dachsanierung (Aufdachdämmung)" }]

// costs.json - eine Position je Kategorie mit angehängten Rechnungen
[{ "notionId": "…", "date": "2026-08-28", "vendor": "Raiffeisen", "category": "Material allgemein",
   "amountGross": 3531.14, "description": "Import aus Notion",
   "notes": "Sammelposition aus Notion – Einzelbeträge bitte prüfen",
   "receipts": ["files/…/rechnung.pdf"] }]
```

## Schritt 2: Import

```bash
cd tools/import
npm install firebase-admin sharp
export GOOGLE_APPLICATION_CREDENTIALS=/pfad/zum/service-account.json
node import_notion.mjs --project reno-master --dry-run    # zeigt nur, was passieren würde
node import_notion.mjs --project reno-master
```

Was passiert:

- Gewerke und Phasen werden über den Namen den bereits angelegten Seed-Daten zugeordnet;
  fehlt eines, wird es angelegt. Die Notion-ID landet in `notionId`.
- Fotos werden auf 1600 px verkleinert (plus 320-px-Thumbnail), nach
  `photos/<id>.jpg` hochgeladen und als `photos`-Dokument mit `uploadState: 'uploaded'`
  angelegt. Der Originalname bleibt erhalten.
- Jeder Datensatz bekommt `source: 'notion'` und seine `notionId`.

Danach in der App stichprobenartig prüfen: 22.08. (1 Foto), 28.08. (5 Fotos),
11.09. (4 Fotos).

Notion selbst wird nicht verändert – kein Zurückschreiben, kein Löschen.
