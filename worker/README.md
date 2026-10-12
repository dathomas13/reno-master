# Dateispeicher auf Cloudflare R2

Die Fotos, Belege und Pläne liegen nicht bei Firebase, sondern in einem R2-Bucket bei
Cloudflare. Grund: Firebases kostenloses Kontingent gilt nur für Buckets in den USA, und
dieses Projekt liegt in Frankfurt — dort wird ab dem ersten Byte abgerechnet. R2 ist bis
10 GB kostenlos und berechnet keinen Datenverkehr.

Der Bucket ist **nicht öffentlich**. Zwischen App und Bucket steht `reno-files.js`, ein
Worker, der das Firebase-Anmeldeticket prüft. Zum Anzeigen gibt er Adressen heraus, die
eine Stunde gelten — ein `<img>`-Element kann keine Kopfzeile mitschicken, deshalb trägt
die Adresse selbst den Nachweis.

```
App ──Anmeldeticket──▶ Worker ──▶ R2 (privat)
        Anzeigen: kurzlebige signierte Adresse
```

## Einrichten (alles im Browser, keine Kommandozeile)

1. **Konto** auf [dash.cloudflare.com](https://dash.cloudflare.com) anlegen.
2. **R2** → *Create bucket* → Name `reno-master`, Standort *Automatic* (oder EU).
3. **Workers & Pages** → *Create* → *Start with Hello World!* → Name `reno-files` →
   *Deploy*, danach *Edit code*. Den gesamten Inhalt von `reno-files.js` einfügen und
   *Deploy* drücken.
4. Im Worker unter **Settings → Variables and Secrets** anlegen:

   | Name | Art | Wert |
   |---|---|---|
   | `ALLOWED_EMAILS` | Text | die beiden Mailadressen, mit Komma getrennt, klein geschrieben |
   | `FIREBASE_PROJECT` | Text | `reno-master-307f7` |
   | `SIGNING_KEY` | **Secret** | eine lange Zufallszeichenkette, einmal ausdenken und vergessen |

5. Im Worker unter **Settings → Bindings → R2 bucket**: Variablenname `BUCKET`, Bucket
   `reno-master`.
6. Die Adresse des Workers (`https://reno-files.<dein-name>.workers.dev`) im GitHub-Repo
   als **Repository variable** `VITE_FILES_URL` hinterlegen
   (*Settings → Secrets and variables → Actions → Variables*).

Danach einmal den Workflow *Android APK* starten und die neue Fassung installieren.

## Automatisch bereitstellen

Ändert ein Push etwas unter `worker/`, stellt der Workflow *Worker*
(`.github/workflows/worker.yml`) den Worker selbst bei Cloudflare bereit – erst nach
bestandenem Selbsttest. Konfiguration in `wrangler.toml`: Name, R2-Bindung `BUCKET`, und
`keep_vars`, damit die Variablen aus dem Dashboard bleiben. Secrets fasst eine
Bereitstellung nie an. Wie Seite und APK gewinnt der letzte Push, aus welchem Branch auch
immer; ein Push ohne Änderung am Worker lässt ihn in Ruhe.

Einmalig einrichten:

1. Cloudflare-Dashboard → Profil (oben rechts) → **API Tokens** → *Create Token* →
   Vorlage **„Edit Cloudflare Workers“** → bei *Account Resources* das eigene Konto,
   bei *Zone Resources* „All zones“ lassen → *Create Token*. Das Token kopieren.
2. Die **Account ID** steht im Dashboard unter *Workers & Pages* rechts in der Seitenleiste
   (oder in der Adresszeile nach `dash.cloudflare.com/`).
3. GitHub → Repo → *Settings → Secrets and variables → Actions* → **New repository secret**:
   `CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_ACCOUNT_ID`.
4. Unter *Actions → Worker → Run workflow* einmal von Hand starten und prüfen, dass er grün wird.

Ohne die beiden Secrets läuft nur der Selbsttest, und der Workflow meldet eine Warnung.

## Prüfen, ob es läuft

In der App ein Foto zu einem Tagebucheintrag hinzufügen. Erscheint es nach kurzer Zeit
ohne das Kürzel „wartet", ist es im Bucket. Im Cloudflare-Dashboard unter R2 → `reno-master`
lässt sich das nachsehen.

## Routen

| Route | Zweck |
|---|---|
| `PUT /files/<pfad>` | Datei ablegen, mit `Authorization: Bearer <Ticket>` |
| `DELETE /files/<pfad>` | Datei löschen, dito |
| `POST /link` | `{ path }` → `{ url, expires }`, die Adresse zum Anzeigen |
| `GET /files/<pfad>?exp=…&sig=…` | liefert die Datei, prüft Signatur und Ablauf |
| `GET /diag` | Liste der Geräteprotokolle, mit `Authorization: Bearer <DIAG_TOKEN>` |
| `GET /diag/<gerät>` | ein Geräteprotokoll, dito |
| `/api/v1/…`, `POST /mcp` | Einträge von außen, siehe „API“ |

## Geräteprotokolle (Diagnose)

Die App legt ihr Protokoll (`src/platform/debugLog.ts`) selbst als `diag/<gerät>.json`
ab, über dieselbe `PUT`-Route wie Fotos. Lesen lässt es sich nur mit einem eigenen Token,
damit eine Entwicklungssitzung ohne Firebase-Anmeldung herankommt – und nur unter `diag/`.

Einmalig einrichten:

1. Im Dashboard den Code aus `reno-files.js` neu einfügen und bereitstellen.
2. Einstellungen → Variablen → **Secret** `DIAG_TOKEN` anlegen, eine lange Zufallszeichenkette
   (z. B. `openssl rand -hex 32`). Ohne das Secret antwortet `/diag` mit 404.
3. In der Claude-Code-Umgebung (Umgebung bearbeiten) zwei Umgebungsvariablen setzen:
   `RENO_DIAG_URL` = die Worker-Adresse (wie `VITE_FILES_URL`), `RENO_DIAG_TOKEN` = das Token.
   Unter Netzwerkzugriff den Host des Workers (`…workers.dev`) erlauben.

Lesen: `python3 tools/diag/read_log.py` (Geräte und letzte Zeilen),
`python3 tools/diag/read_log.py app-abc123 --scope erinnerung`.

## API (Einträge von außen, z. B. aus einem Chat mit Claude)

Der Worker nimmt Kosten, Aufgaben, Tagebucheinträge und Notizen auch von außerhalb der App
an. Gedacht ist das für Claude: „Ich habe Verpflegung für 23,50 € gekauft“ wird zu einem
Kosteneintrag mit Kategorie „Verpflegung Helfer“, ohne die App zu öffnen.

```
Claude ──Token──▶ Worker /api/v1, /mcp ──Dienstkonto──▶ Firestore ──▶ App (onSnapshot)
```

### Anmeldung: persönliche Zugangstokens

- Erzeugt in der App unter **Einstellungen → API-Zugang**: Name, Rechte (Kosten, Aufgaben,
  Tagebuch, Notizen, Lesen), Gültigkeit (30 Tage bis unbegrenzt).
- Das Token (`reno_…`, 256 Bit Zufall) wird **genau einmal** angezeigt. In
  `meta/api-tokens` steht nur sein SHA-256-Hash, dazu Name, Rechte, Ablauf, Besitzer und
  „zuletzt benutzt“. Weder die Datenbank noch ein Export verrät also ein brauchbares Token.
- Widerrufen löscht den Eintrag; die nächste Anfrage mit dem Token scheitert.
- Ein Token gilt nur, solange sein Besitzer in `ALLOWED_EMAILS` steht.
- Ändern und Löschen sind gestuft. Einträge, die über die API angelegt wurden
  (`createdVia: "api:<token-id>"`), lassen sich ganz ändern und löschen. Einträge aus der
  App nur in wenigen Feldern (Kosten: Zahlungsstatus, bezahlt von, Zahlungsart; Aufgaben:
  Status, Fälligkeit, Priorität, Zuständige; Notizen: angeheftet; Kontakte: Telefon,
  E-Mail, Status) und per `appendText` (ein Absatz angehängt) – nie löschen. Ein verlorenes
  Token kann so nichts Älteres zerstören, und ein Missverständnis im Chat schreibt keine
  gepflegte Rechnung um.
- Rechte (Kosten, Aufgaben, Tagebuch, Notizen, Kontakte und Gespräche, Lesen) lassen sich
  in der App nachträglich ändern; das Token bleibt dasselbe.

Das ist dasselbe Muster wie die „personal access tokens“ bei GitHub: für einen einzelnen
Menschen mit eigenem Werkzeug einfacher und genauso sicher wie OAuth, solange das Token wie
ein Passwort behandelt wird.

### Einmalig einrichten

1. Firebase-Konsole → Projekteinstellungen → **Dienstkonten** → „Neuen privaten Schlüssel
   generieren“. Es kommt eine JSON-Datei.
2. Im Worker unter **Settings → Variables and Secrets** ein **Secret**
   `FIREBASE_SERVICE_ACCOUNT` anlegen und den **gesamten Inhalt** der JSON-Datei einfügen.
   Die Datei danach löschen – sie gehört nie ins Repo.
3. Den Code aus `reno-files.js` neu einfügen und bereitstellen.
4. In der App: Einstellungen → API-Zugang → „Token erzeugen“.

Firestore-Regeln müssen nicht geändert werden: die Tokens stehen unter `meta`, und das
Dienstkonto schreibt an den Regeln vorbei. Deshalb prüft der Worker selbst Token, Ablauf,
Besitzer und Rechte.

### Claude anbinden

- **Claude-App / claude.ai** (Chat, auch per Sprache am Telefon): Einstellungen →
  Connectors → eigenen Connector hinzufügen, als Adresse `https://<worker>/mcp/<token>`.
  Die Connector-Maske kann keine Kopfzeilen setzen, deshalb steckt das Token in der
  Adresse – die Adresse ist damit selbst geheim. Am besten ein eigenes Token dafür
  erzeugen; die App bietet „Adresse für Claude kopieren“ an.
- **Claude Code**: `claude mcp add --transport http reno https://<worker>/mcp --header "Authorization: Bearer <token>"`.
  Oder ohne MCP über `tools/api/reno.py` mit den Umgebungsvariablen `RENO_API_URL`
  (Worker-Adresse) und `RENO_API_TOKEN`, den Worker-Host im Netzwerkzugriff erlaubt.

Der MCP-Server (Streamable HTTP, zustandslos) bietet `get_catalog`, `create_cost`,
`create_task`, `create_diary_entry`, `create_note`, `create_contact`, `create_contact_log`,
`update_entry`, `complete_task`, `list_entries`, `search`, `summarize_costs` und
`delete_entry` – nur die, die das Token darf.

### REST-Routen

Alle mit `Authorization: Bearer <token>`, Antworten als JSON, Fehler als `{ "error": "…" }`.

| Route | Recht | Zweck |
|---|---|---|
| `GET /api/v1` | – | welches Token, welche Rechte |
| `GET /api/v1/catalog` | – | heutiges Datum, Auswahlwerte (Kennung + Name), Gewerke, Phasen |
| `POST /api/v1/costs` | costs | Kosten anlegen |
| `POST /api/v1/tasks` | tasks | Aufgabe anlegen |
| `POST /api/v1/tasks/<id>/done` | tasks | Aufgabe abhaken |
| `POST /api/v1/diary` | diary | Tagebuch: gibt es für den Tag schon einen Eintrag, wird angehängt (`"newEntry": true` legt einen eigenen an) |
| `POST /api/v1/notes` | notes | Notiz anlegen |
| `POST /api/v1/contacts` | contacts | Kontakt anlegen |
| `POST /api/v1/contactLogs` | contacts | Gespräch festhalten (`contact` als id, Name oder Firmenteil; leer = ohne Kontakt) |
| `PATCH /api/v1/<sammlung>/<id>` | Schreibrecht der Sammlung | ändern, gestuft wie oben; `null` leert ein Feld, `appendText` hängt an |
| `GET /api/v1/<sammlung>?since=JJJJ-MM-TT&query=…&limit=20` | read | letzte Einträge; Aufgaben: die offenen (`open=false` alle); Kontakte alphabetisch; Gespräche auch `contact=` |
| `GET /api/v1/costs/summary?groupBy=category&from=…&to=…` | read | Summen nach `category`, `trade` (mit Budget und Rest), `month`, `paidBy`, `paymentStatus` oder `room`; Filter `category`, `trade`, `paidBy`, `paymentStatus`, `room` |
| `GET /api/v1/search?q=…` | read | Wörter in allen Sammlungen, Wortteile zählen, Umlaute egal; `collections=` grenzt ein |
| `DELETE /api/v1/<sammlung>/<id>` | Schreibrecht der Sammlung | nur über die API Angelegtes |

Sammlungen: `costs`, `tasks`, `diary`, `notes`, `contacts`, `contactLogs`.

Felder wie im Datenmodell (`PLAN.md`, Abschnitt 5), z. B. für Kosten `amountGross`
(Pflicht, Zahl oder „12,40“), `vendor`, `description`, `category`, `date`, `paidBy`,
`paymentMethod`, `paymentStatus`, `tradeId`, `vatRate`, `invoiceNumber`, `notes`.
Auswahlwerte gehen als Kennung **oder** Name (`"category": "Verpflegung Helfer"`);
gespeichert wird immer die Kennung, Unbekanntes lehnt der Worker mit den möglichen Werten
ab. Gewerke und Phasen auch über einen eindeutigen Namensteil (`"trade": "Elektrik"`).
Ohne `date` gilt heute in Europe/Berlin. Eine mitgeschickte `id` macht eine Wiederholung
unschädlich: dieselbe id ein zweites Mal legt nichts Neues an. Räume (`rooms`) gehen über
die Namen der **Planung** (`meta/model-soll`); ein Name, den es in zwei Geschossen gibt,
braucht das Geschoss („Flur OG“). Belegfotos kann die API nicht hochladen.

```bash
curl -X POST https://<worker>/api/v1/costs \
  -H "Authorization: Bearer $RENO_API_TOKEN" -H "content-type: application/json" \
  -d '{"amountGross": 12.4, "vendor": "Hornbach", "description": "Schrauben", "category": "Material allgemein"}'
```

## Was geprüft ist, und was nicht

`node worker/selftest.mjs` prüft die Teile, die ohne Cloudflare laufen: Signatur und
Ablauf der Anzeige-Adressen, die Pfad-Prüfung (`..`, führende Schrägstriche, Leerzeichen)
und dass ein selbst gebautes Ticket mit `alg: none` abgewiesen wird. Die API läuft dort
vollständig gegen ein nachgebautes Firestore: Dienstkonto-Ticket, Token-Prüfung (Ablauf,
Besitzer, Rechte), Anlegen, gestuftes Ändern, Anhängen ans Tagebuch, Räume, Kontakte und
Gespräche, Auswertung, Suche, Lesen, Abhaken, Löschen und MCP. Die CI
führt den Selbsttest bei jedem Push aus.

Nicht geprüft werden kann hier: der Worker im echten Betrieb, das Zusammenspiel mit R2 und
die Prüfung eines echten Firebase-Tickets gegen Googles Schlüssel. Das zeigt sich erst beim
ersten Foto. Ebenso die echte Firestore-REST-Schnittstelle und das Dienstkonto: das zeigt
sich beim ersten `GET /api/v1/catalog`.

## Kosten

10 GB Speicher, 1 Mio. Uploads und 10 Mio. Abrufe im Monat sind frei, ebenso der
Datenverkehr. Der Worker selbst: 100.000 Anfragen pro Tag frei. Bei zwei Nutzern ist das
nicht zu erreichen.
