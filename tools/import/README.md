# Einmaliger Import aus Notion

Zwei Schritte: **Export** aus Notion in JSON-Dateien, dann **Import** nach Firestore und in
den Dateispeicher auf Cloudflare R2. Der Import ist idempotent – er erkennt schon
importierte Datensätze an ihrer Notion-ID und aktualisiert sie, statt Dubletten anzulegen.

## Schritt 1: Export

Die Eigenschaften und Texte lassen sich über den Notion-Connector in einer Claude-Sitzung
holen. Die Datenquellen im Workspace „Thomas's Notion“, Bereich **Hausrenovierung**:

| Inhalt | Data-Source-URL | Umfang (Stand 16.09.2026) |
|---|---|---|
| Bautagebuch | `collection://33ccbf13-353a-80c3-8cdc-000b9d359219` | 19 Einträge, 20.08.–15.09.2026, 27 Fotos |
| Aufgaben | `collection://33bcbf13-353a-8188-938d-000b4019197a` | 33 |
| Kontakte | `collection://33bcbf13-353a-81aa-be74-000b0ef2979e` | 19 |
| Gewerke | `collection://33bcbf13-353a-8150-8fca-000bd433c726` | 18 |
| Projektphasen | `collection://33bcbf13-353a-81c8-afd7-000b122f7314` | 10 |
| Finanzen (nur Rechnungsanhänge) | `collection://33bcbf13-353a-81de-ad28-000b6c346a98` | 10 Dateien |

Wichtig: Der eigentliche Text eines Tagebucheintrags steht **nicht** in der Eigenschaft
„Notizen“, sondern im Seiteninhalt. Also pro Eintrag `notion-fetch` auf die Seiten-URL
aufrufen und den `<content>`-Block übernehmen; `<br>` wird zum Zeilenumbruch.

**Die Fotos gehen nur über Notions eigenen Export.** Der Connector kommt an die Bilddaten
nicht heran: `notion-download-attachment` liefert ausschließlich Text-Anhänge, die die
Integration selbst angelegt hat, und die Adressen der Anhänge brauchen eine angemeldete
Sitzung. Also in Notion die Datenbank **Bautagebuch** öffnen → ••• → *Exportieren* →
Format *Markdown & CSV*, *Include files* an. Das ZIP enthält je Eintrag eine
`Tagebuch … <notionId>.md` (Eigenschaften als Kopfzeilen, darunter der Text) und die Fotos
unter ihrem Originalnamen. Der Export ist zugleich die bequemste Quelle für die
Eigenschaften – die CSV listet je Zeile auch die zugehörigen Dateinamen.

Ergebnis (dieser Ordner ist absichtlich gitignored, er enthält private Daten):

```
tools/import/notion/
  diary.json      tasks.json      contacts.json
  trades.json     phases.json     costs.json
  files/<originalname>.jpg
```

`files/` ist flach: die Namen aus dem Notion-Export sind schon eindeutig (Zeitstempel), und
bei einer Dublette hängt Notion selbst ein „ 1“ an. Ein Unterordner je Seite geht auch,
dann steht der Pfad eben so in `diary.json` – gelesen wird alles relativ zu
`tools/import/notion/`.

### Format

```jsonc
// diary.json
[{ "notionId": "3d8cbf13-353a-8066-86c9-c3f31fce627f", "date": "2026-09-04", "title": "Tagebuch 04.09",
   "text": "Wolfgang hat …\nAbends noch …",
   "weather": "Bewölkt", "present": ["Wolfgang"], "defects": false,
   "phaseNotionId": "33bcbf13-353a-81cf-984c-e9bcab7a48f4", "tradeNotionIds": [],
   "photos": [{ "file": "files/20260904_181303.jpg", "takenAt": "2026-09-04T18:13:03" }] }]

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
   "receipts": ["files/rechnung.pdf"] }]
```

`weather`, `present`, `status`, `priority` und `category` müssen zu den Werten passen, die
`src/data/types.ts` und `src/data/seed/lists.ts` kennen – sonst zeigt die App den Eintrag
zwar an, aber der Chip bleibt leer. `phaseNotionId` und `tradeNotionIds` werden über
`phases.json`/`trades.json` auf den **Namen** und darüber auf die vorhandenen Seed-Daten
abgebildet.

## Schritt 2: Import

```bash
cd tools/import
npm install firebase-admin sharp
export GOOGLE_APPLICATION_CREDENTIALS=/pfad/zum/service-account.json
export FILES_URL=https://reno-files.<konto>.workers.dev   # dasselbe wie VITE_FILES_URL
export FIREBASE_API_KEY=<der Wert von VITE_FIREBASE_API_KEY>
export IMPORT_USER_EMAIL=<eine der beiden freigeschalteten Adressen>
node import_notion.mjs --project reno-master --dry-run    # zeigt nur, was passieren würde
node import_notion.mjs --project reno-master
```

Die Dateien gehen **nicht** über den Admin-SDK, sondern über den Worker aus
`worker/reno-files.js` nach R2 – der kennt nur Firebase-Anmeldetickets. Deshalb die drei
zusätzlichen Variablen: das Skript stellt sich mit dem Service-Account ein eigenes Ticket
für eines der freigeschalteten Konten aus. Ohne eingerichteten Worker
(`worker/README.md`) bricht der Import ab, bevor er etwas schreibt.

Was passiert:

- Gewerke und Phasen werden über den **Namen** den bereits angelegten Seed-Daten
  zugeordnet. Findet sich keiner, meldet das Skript den Datensatz und lässt das Feld leer –
  es legt nichts an. Das passiert, wenn die App noch nie gestartet wurde und die Seed-Daten
  darum fehlen: einmal anmelden, dann erneut importieren. Die Notion-ID landet in `notionId`.
- Jedes Foto geht dreifach hoch: das **unveränderte Original** nach
  `photos/<id>_original.jpg` (`originalPath`), eine 1600-px-Fassung für die App nach
  `photos/<id>.jpg` und ein 320-px-Thumbnail. Belege dürfen auch PDF sein, die bleiben wie
  sie sind. Der Originalname bleibt erhalten.
- Jeder Datensatz bekommt `source: 'notion'` und seine `notionId`.

Mit `--wipe-diary` wird die Sammlung `diary` vorher geleert, zusammen mit den Fotos, die an
ihren Einträgen hängen, und deren Dateien in R2. Das ist der saubere Weg, wenn in der App
schon von Hand geschriebene Einträge stehen, die der Import ersetzen soll – **es ist nicht
rückgängig zu machen**, also vorher einmal mit `--dry-run` ansehen.

Ein zweiter Lauf hängt keine Fotos doppelt an: schon vorhandene erkennt das Skript am
Originalnamen an seinem Eintrag und lässt sie stehen (`unchanged` in der Bilanz).

Danach in der App stichprobenartig prüfen: 22.08. (1 Foto), 28.08. (5 Fotos),
11.09. (4 Fotos), 15.09. (3 Fotos).

Notion selbst wird nicht verändert – kein Zurückschreiben, kein Löschen.
