# Reno Master – Implementierungsplan (Übergabe an den Entwicklungs-Chat)

> Dieses Dokument ist die vollständige Spezifikation für die App **Reno Master**. Es wurde im Planungsmodus
> mit Thomas erstellt; alle Entscheidungen darin sind mit ihm abgestimmt und **nicht mehr zu hinterfragen**.
> Der Entwicklungs-Chat (Opus/Sonnet, darf Sub-Agenten spawnen) setzt es Meilenstein für Meilenstein um.
> Wo etwas nicht spezifiziert ist, gilt: die einfachste robuste Lösung wählen, deutsch beschriften, mobil zuerst.

---

## 0. Kontext

Thomas (dathomas13, Kontakt tom.friedl@web.de) kernsaniert mit Sarah das Haus **Schlesierstraße 31, Tirschenreuth**
(EFH Bj. 1966/67, 13,24 × 11,82 m, KG/EG/OG + Satteldach 36°, Garage westlich). Bautagebuch, Aufgaben, Gewerke,
Finanzen und Kontakte lagen vorher in einem allgemeinen Notiz-Werkzeug, das am Handy zu umständlich war.
Es gibt bereits ein 3D-Rohbaumodell (Python-Datenbasis `haus_model.py` →
three.js-Viewer `Haus_3D.html`, Stand v0.22).

**Ziel:** Eine eigene, auf Thomas zugeschnittene App, die all das an einer Stelle zusammenführt.

- Nutzung fast ausschließlich am Handy (**Samsung Galaxy S24**, Android, Chrome; CSS-Viewport ≈ 360 × 780 px).
- Phase 1: **PWA**, gehostet auf **GitHub Pages** (Repo `dathomas13/reno-master`, öffentlich), am Handy "zum Startbildschirm hinzufügen".
- Phase 2: **Android-APK** via Capacitor (gleicher Code), dann wird das Repo privat gestellt.
- Zusätzlich: dieselbe App am Laptop im Browser (responsive Desktop-Layout, gleiche Datenbasis).
- **Offline zwingend**: Grundfunktionen (Tagebuch lesen/schreiben, 3D, Pläne, Kosten, Aufgaben, Kontakte) müssen ohne Netz gehen; Sync sobald online (WLAN).

---

## 1. Getroffene Entscheidungen (verbindlich)

| Thema | Entscheidung |
|---|---|
| App-Name | **Reno Master** (Icon-Name am Homescreen "Reno Master", `short_name` "Reno") |
| Backend | **Firebase**: Firestore (offline-persistent), Cloud Storage, Auth, Cloud Messaging, Cloud Functions (nur für Erinnerung) |
| Nutzer | **Thomas + Sarah**, Login per **E-Mail/Passwort** (Konten werden von Thomas in der Firebase-Konsole angelegt; Registrierung in der App deaktiviert). Allowlist per E-Mail in den Security Rules. Bei Einträgen wird `createdBy` gespeichert. |
| Fotos | **Verkleinerte Kopie (max. 1600 px lange Kante, JPEG q≈0,82) + Thumbnail (320 px)** nach Firebase Storage. Original bleibt in der Galerie. Zusätzlich werden **Originaldateiname, Aufnahmezeit (EXIF), Dateigröße** und – in der APK – die **MediaStore-URI** gespeichert, damit das Original schnell wiedergefunden werden kann. |
| Beleg-Auslesen (OCR) | **Drei Engines hinter einem Interface.** Default: **Google ML Kit Text Recognition on-device** (nur in der APK) + heuristischer Parser. Optional **Gemini** oder **Claude**, jeweils aktiv, sobald in den Einstellungen ein API-Key dafür liegt. `auto` geht die feste Reihenfolge ML Kit → Gemini → Claude durch. Ohne Key und ohne APK: manuelle Eingabe. |
| Datenschutz | Repo public. Ins Repo: Code, 3D-Modell-JSON, generierte Grundriss-SVGs, Nordansicht-Foto. **Nicht ins Repo:** Original-Baupläne (PDF), Fotos, Belege, Kontakte, Tagebuchtexte, Service-Account-Keys → alles nur in Firebase hinter Login. |
| 3D-Modelle Ist/Soll | Liegen als JSON im Repo (`public/models/`), werden mit dem App-Build ausgeliefert und vom Service Worker vorgecacht – das ist die Untergrenze, die offline ab dem ersten Start da ist. **Die Version ist vom App-Build gelöst:** die App nimmt die höchste Fassung, die sie erreicht (gebündelt, Website-Manifest, oder ein in `meta/model-<variante>` veröffentlichtes Modell), legt sie in IndexedDB und behält sie offline. Austausch also per `git push` **oder** ohne Deploy über "Modell veröffentlichen" in den Einstellungen. Vollständig dokumentiert für den "Modell-Agenten" (Abschnitt 9). |
| Neue 2D-Pläne | **Aus dem Modell generierte SVG-Grundrisse** (pro Geschoss × Variante Ist/Soll) + freier **Upload** (PDF/PNG/JPG) für Original-Baupläne und sonstige Pläne. Die Original-PDFs lädt Thomas selbst in der App hoch. |
| Zusatzfeatures v1 | **Aufgaben/To-do**, **Kontakte/Handwerker**, **Raum-Verknüpfung im 3D-Modell** (Tagebuch, Fotos, Kosten, Aufgaben können Räumen zugeordnet werden; Tippen auf einen Raum zeigt alles dazu). |
| Erinnerung | Ja, **Uhrzeit in den Einstellungen konfigurierbar, Default 20:00**, nur wenn für heute noch kein Eintrag existiert. PWA: Web-Push via FCM (Cloud Function). APK: zusätzlich lokale Benachrichtigung. |
| Sprache | UI komplett **Deutsch**. Code, Kommentare, Commits: Englisch. |

---

## 2. Was Thomas vor bzw. während der Entwicklung bereitstellen muss

Der Entwicklungs-Chat soll diese Punkte **zu Beginn gesammelt** anfordern (eine Liste, nicht häppchenweise) und in
der Zwischenzeit mit allem weiterarbeiten, was nicht davon abhängt (M0 komplett, M1 komplett, UI aller Module
gegen die Firebase-Emulatoren).

1. **Die ZIP `Uebergabe_Haus3D_v0.22.zip`** erneut im Entwicklungs-Chat hochladen (enthält `haus_model.py`,
   `build_scene.py`, `viewer_template.html`, `Haus_3D.html` mit eingebettetem Szenen-JSON, `Wandtabelle.md`,
   `README_Uebergabe.md`, `build_*.py`, `check_walls.py`, `plan2d.py`, `Haus_FreeCAD.py`, `Haus_Rohbau.step`, `three.min.js`).
2. **Das Nordansicht-Foto** (Gartenseite, 2000 × 1125 px, Winterbild) erneut hochladen → wird zu `public/img/nordansicht.jpg` (auf 1600 px verkleinert, ~250 KB).
3. **Firebase-Projekt** anlegen (console.firebase.google.com), Projekt-ID z. B. `reno-master`:
   - Plan auf **Blaze** umstellen (Kreditkarte nötig; Cloud Storage und Cloud Functions erfordern das für neue Projekte seit 2024). Nutzung bleibt im kostenlosen Kontingent; **Budget-Alarm bei 1 €** einrichten.
   - **Authentication** → Sign-in method **E-Mail/Passwort** aktivieren; zwei Nutzer anlegen (Thomas, Sarah) mit Passwort.
   - **Firestore Database** anlegen (Region `europe-west3` Frankfurt, Production mode).
   - **Storage** anlegen (gleiche Region).
   - **Cloud Messaging**: Web-Push-Zertifikat (VAPID-Schlüsselpaar) erzeugen, öffentlichen Key notieren.
   - Projekteinstellungen → Web-App registrieren → **Web-Config-Objekt** (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`) kopieren und dem Chat geben. (Die Web-Config ist nicht geheim und wird committet.)
   - **Service-Account-Key** (Projekteinstellungen → Dienstkonten → "Neuen privaten Schlüssel generieren", JSON) als Datei im Chat hochladen. Wird nur lokal im Sandbox des Agenten benutzt (Rules deployen, Functions deployen) und ist per `.gitignore` vom Repo ausgeschlossen. **Niemals committen.**
   - Die beiden **E-Mail-Adressen** der Nutzer (für die Allowlist in den Rules).
4. **GitHub Pages** aktivieren: Repo → Settings → Pages → Source **"GitHub Actions"** (nach dem ersten Push des Workflows).
5. Für Phase 2 (APK): `google-services.json` aus der Firebase-Konsole (Android-App mit Package `de.friedl.renomaster` registrieren).
6. Optional: **Anthropic API-Key** (console.anthropic.com) – wird nur in der App unter Einstellungen eingetragen, nie im Code.

---

## 3. Tech-Stack

| Bereich | Wahl | Begründung |
|---|---|---|
| Sprache | **TypeScript** (strict) | |
| Build | **Vite 5** | schnell, PWA-Plugin, GitHub-Pages-`base` |
| UI | **React 18** + **react-router** (HashRouter → keine 404-Probleme auf GitHub Pages, funktioniert unverändert in Capacitor) | |
| Styling | **Tailwind CSS** + wenige eigene Komponenten (kein schweres UI-Kit). Dark-Theme als Default (passend zum bestehenden Viewer: `#1d2126` Hintergrund, Akzent `#c9a86a`), Light-Theme optional später. | |
| 3D | **three** (npm, aktuelle Version pinnen, z. B. `^0.170`) – der bestehende Viewer nutzt nur Core-API (WebGLRenderer, BufferGeometry, EdgesGeometry, Raycaster, Sprite, Lights), die unverändert existiert. | |
| Daten | **firebase** JS SDK v10+ (modular): `firebase/firestore` mit `persistentLocalCache`, `firebase/storage`, `firebase/auth`, `firebase/messaging` | |
| Lokale Dateien/Outbox | **idb** (IndexedDB-Wrapper) | Upload-Warteschlange, Modell-/Plan-Cache |
| PWA | **vite-plugin-pwa** (Workbox, Strategie `injectManifest`, damit der FCM-Handler in denselben SW kann) | |
| PDF-Anzeige | **pdfjs-dist** (Worker lokal bundlen, kein CDN) | |
| Bilder | Canvas/`createImageBitmap` fürs Verkleinern, **exifr** für EXIF-Datum | |
| Zoom/Pan für Pläne | **panzoom** (oder eigene Pointer-Implementierung wie im 3D-Viewer) | |
| Charts (Kosten) | **recharts**, sparsam (Balken nach Kategorie/Monat) | |
| Claude | **@anthropic-ai/sdk** (`dangerouslyAllowBrowser: true`, Key aus Einstellungen), **zod** + `zodOutputFormat` für strukturierte Ausgabe | |
| Native (Phase 2) | **Capacitor 6**: `@capacitor/android`, `@capacitor/camera`, `@capacitor/filesystem`, `@capacitor/local-notifications`, `@capacitor/push-notifications`, `@capacitor-mlkit/text-recognition`, eigene Plugins `MediaStore`, `NativeCam` (Java) | |
| Tests | **vitest** (Unit), **Playwright** (E2E, Chromium mobil-emuliert 360×780 @3x + Desktop), **Firebase Emulator Suite** (auth, firestore, storage, functions) | |
| CI/CD | GitHub Actions: `deploy.yml` (Build + Pages-Deploy bei Push auf `main`), `ci.yml` (Lint, Typecheck, Unit, E2E gegen Emulator bei PR), später `android.yml` (APK-Build) | |
| Lint/Format | ESLint (typescript-eslint, react-hooks), Prettier | |

Node 20 LTS. Paketmanager **npm** (Lockfile committen).

---

## 4. Repo-Struktur

```
reno-master/
├── .github/workflows/         deploy.yml, ci.yml, (android.yml in Phase 2)
├── public/
│   ├── models/                manifest.json, ist.json, soll.json, rooms-ist.json, rooms-soll.json
│   ├── plans/                 generierte SVGs: ist-KG.svg, ist-EG.svg, ist-OG.svg, soll-KG.svg, ...
│   ├── img/                   nordansicht.jpg, icons (192/512/maskable), apple-touch-icon
│   └── (manifest wird vom PWA-Plugin erzeugt)
├── src/
│   ├── main.tsx, App.tsx, routes.tsx
│   ├── firebase/              app.ts (init + persistentLocalCache), auth.ts, db.ts (typed collection refs), storage.ts, messaging.ts, emulators.ts
│   ├── data/                  types.ts (alle Dokument-Typen), hooks (useCollection/useDoc mit onSnapshot), repos je Modul, seed/*.json (trades, phases, categories, people, weather)
│   ├── offline/               outbox.ts (IndexedDB-Queue für Datei-Uploads), fileCache.ts, syncStatus.ts, useOnline.ts
│   ├── platform/              index.ts (isNative), photos.ts, ocr/ (index.ts, mlkit.ts, claude.ts, gemini.ts, request.ts, receiptFields.ts, errors.ts, parseReceiptText.ts), reminder.ts, reminderPlan.ts, notifications.ts, share.ts
│   ├── modules/
│   │   ├── home/              Dashboard
│   │   ├── diary/             Liste, Detail, Editor, PhotoPicker, PhotoGrid
│   │   ├── viewer3d/          Viewer3D.tsx (Port des Templates), controls.ts, sceneBuilder.ts, rooms.ts, ModelSwitch, BuildInfoPanel, RoomPanel
│   │   ├── plans/             Liste, SvgPlanView, PdfPlanView, ImagePlanView, Upload
│   │   ├── costs/             Liste, Editor, ReceiptCapture, Summary (Charts), Export
│   │   ├── tasks/             Liste (Filter/Gruppen), Editor
│   │   ├── contacts/          Liste, Detail, Editor
│   │   ├── search/            SearchPage (eine Suche über alle Module)
│   │   └── settings/          Konto, Erinnerung, OCR (Gemini- und Claude-Key), Modelle (Versionen), Listen (Personen, Kategorien), Import, Offline-Status
│   ├── components/            AppShell (BottomNav / Sidebar), TopBar, Sheet/Modal, Form-Controls, ChipSelect, DateInput, EmptyState, SyncBadge
│   ├── search/                normalize.ts (Faltung + Positionskarte), engine.ts (Index, Bewertung, Ausschnitt), records.ts (Dokumente → Datensätze), useSearch.ts, recent.ts
│   ├── lib/                   date.ts (de-DE, Europe/Berlin), image.ts (resize, thumb, exif), money.ts, ids.ts, rooms-geometry.ts
│   ├── sw.ts                  Workbox injectManifest + FCM onBackgroundMessage
│   └── styles/
├── functions/                 Cloud Functions (Node 20, TS): reminder.ts (Scheduler + FCM)
├── tools/
│   ├── model/                 komplette Modell-Toolchain aus der ZIP + README-MODELL.md + extract_scene_from_html.py + build_rooms.py + build_plans_svg.py + build_all.sh
│   └── verify/                Ersatzprüfungen ohne npm (typecheck-without-npm.mjs, run-tests-without-npm.mjs)
├── tests/                     e2e/ (Playwright), unit unter src/**/__tests__
├── firebase.json, firestore.rules, firestore.indexes.json, storage.rules, .firebaserc
├── capacitor.config.ts        (Phase 2), android/ (Phase 2, generiert)
├── CLAUDE.md                  Kurzanleitung für zukünftige Agenten (Build, Test, Deploy, Modell tauschen)
└── README.md
```

`.gitignore`: `node_modules`, `dist`, `dev-dist`, `*.sa.json`, `serviceAccount*.json`, `google-services.json`,
`tools/model/Haus_Rohbau.step`, `tools/model/Haus_3D.html`, `tools/model/three.min.js`, `tools/model/package/`, `.env*`.

---

## 5. Datenmodell (Firestore)

Alle Zeitstempel ISO-Strings **oder** Firestore `Timestamp` – Konvention: `createdAt`/`updatedAt` als `serverTimestamp()`,
fachliche Daten (`date`, `takenAt`) als ISO-String `YYYY-MM-DD` bzw. `YYYY-MM-DDTHH:mm:ss` (lokal, Europe/Berlin),
damit Sortierung/Anzeige offline ohne Zeitzonen-Chaos funktioniert. IDs: `nanoid(12)`, außer wo angegeben.
Jedes Dokument: `createdAt`, `updatedAt`, `createdBy` (E-Mail), `updatedBy`.

### 5.1 `diary` – Bautagebuch
```ts
interface DiaryEntry {
  id: string;
  date: string;              // 'YYYY-MM-DD' (Pflicht)
  title: string;             // Default "Tagebuch DD.MM."
  text: string;              // Markdown-light (Absätze, Listen); Editor = Textarea
  weather?: 'Sonnig'|'Bewölkt'|'Regen'|'Frost'|'Schnee';
  present: string[];         // Namen aus meta/lists.people (frei erweiterbar)
  defects: boolean;          // "Mängel"
  phaseId?: string;
  tradeIds: string[];        // Gewerke
  roomIds: string[];         // Räume (Abschnitt 9.4)
  photoIds: string[];        // geordnete Referenzen auf photos/*
}
```
Regel: pro Datum beliebig viele Einträge erlaubt, UX behandelt aber "Eintrag für heute" als Singleton (Öffnen des bestehenden statt neu anlegen).

### 5.2 `photos`
```ts
interface Photo {
  id: string;
  entryId?: string;          // Tagebuch-Eintrag
  costId?: string;           // oder Beleg (dann kind='receipt')
  kind: 'photo'|'receipt';
  storagePath: string;       // photos/{id}.jpg  (1600px) | receipts/{costId}/{id}.{ext}
  thumbPath?: string;        // photos/{id}_thumb.jpg (320px)
  width: number; height: number; bytes: number;
  takenAt?: string;          // EXIF DateTimeOriginal, sonst lastModified
  originalName?: string;     // z. B. 20260828_191245.jpg
  originalBytes?: number;
  sourceUri?: string;        // content://media/... (nur APK)
  deviceId?: string;         // localStorage-UUID des Geräts, das das Original hat
  caption?: string;
  roomIds: string[];
  uploadState: 'pending'|'uploaded';   // 'pending' solange in der Outbox
}
```

### 5.3 `costs` – Kosten/Rechnungen
```ts
interface Cost {
  id: string;
  date: string;              // Rechnungs-/Belegdatum
  vendor: string;            // Händler/Firma
  description: string;
  amountGross: number;       // EUR, Pflicht
  amountNet?: number; vatRate?: 19|7|0|null; vatAmount?: number;
  category: string;          // aus meta/lists.costCategories
  tradeId?: string;          // Gewerk
  roomIds: string[];
  paymentStatus: 'offen'|'bezahlt'|'erstattet';
  paidBy?: 'Thomas'|'Sarah'|'Gemeinsam';
  paymentMethod?: 'Karte'|'Bar'|'Überweisung'|'PayPal';
  invoiceNumber?: string;
  receiptPhotoIds: string[]; // photos/* mit kind='receipt' (Bilder ODER PDFs)
  extraction?: { engine: 'mlkit'|'claude'|'gemini'|'none'; rawText?: string; confidence?: number; at: string };
  notes?: string;
}
```

Beim Belegimport werden Dateiname, ursprüngliche Dateigröße, Dateiart und das verfügbare
Aufnahmedatum mit bekannten Belegen verglichen. Ein Treffer wird nicht erneut hochgeladen:
bei einer bestehenden Rechnung wird diese verlinkt und das doppelte Speichern gesperrt;
Belege ohne bestehende Rechnung können dem aktuellen Entwurf zugeordnet werden. Beide
Verweisrichtungen (`costId` und `receiptPhotoIds`) zählen bei der Prüfung. Das Speichern
wartet auf Dateiimport und Auslesen; lokale Anhänge bleiben bis zur Bestätigung durch die
Fotoabfrage erhalten. Firestore-Schreibvorgänge für Beleg und Rechnung warten höchstens
10 Sekunden auf die Serverbestätigung und bleiben danach in der Offline-Warteschlange.

### 5.4 `tasks` – Aufgaben
```ts
interface Task {
  id: string; title: string; notes?: string;
  status: 'Offen'|'In Arbeit'|'Wartet auf'|'Erledigt';
  priority: 'Hoch'|'Mittel'|'Niedrig';
  due?: string;              // YYYY-MM-DD
  reminderAt?: string;       // YYYY-MM-DDTHH:mm:ss, lokale Aufgaben-Erinnerung auf dem Gerät
  assignees: ('Thomas'|'Sarah'|'Handwerker'|'Beide')[];
  area?: string;             // "Bereich" (Seed: Kauf, Finanzen, Versicherung, Energieberatung, Förderung, Dach, Fenster, Heizung, Fassade, Elektrik, Sanitär, PV, Behörden, Planung, Innenausbau, Rückbau, Organisation, Keller, Gebäudehülle)
  tradeId?: string; phaseId?: string; roomIds: string[];
  doneAt?: string;
}
```

### 5.5 `contacts`
```ts
interface Contact {
  id: string; name: string; company?: string;
  role?: string;             // Seed "Rolle/Gewerk" (Energieberater (iSFP), Immobilienmaklerin, Dachdecker, Heizungsbauer, Elektriker, Fensterbauer, Sanitär, Trockenbauer, Estrichleger, Fliesenleger, Maler, PV-Installateur, Statiker, Notar, Bank/Finanzierung)
  phone?: string; email?: string;
  tradeIds: string[];
  status?: 'Angefragt'|'Angebot erhalten'|'Beauftragt'|'Aktiv'|'Abgeschlossen'|'Abgelehnt';
  rating?: 1|2|3|4|5; notes?: string;
}
```

### 5.6 `trades` (Gewerke) und `phases`
```ts
interface Trade { id: string; name: string; status: 'Noch offen'|'Geplant'|'Angebot einholen'|'Angebote vergleichen'|'Beauftragt'|'In Arbeit'|'Abnahme'|'Fertig'; priority: 'Hoch'|'Mittel'|'Niedrig'; budgetPlanned?: number; offer?: number; notes?: string }
interface Phase { id: string; name: string; status: 'Geplant'|'In Arbeit'|'Abgeschlossen'|'Blockiert'; start?: string; end?: string; order: number }
```
Seed (im Repo unter `src/data/seed/`, beim ersten App-Start eines eingeloggten Nutzers idempotent nach Firestore geschrieben, wenn Collection leer):
- **trades** (18): Außenanlagen (Zufahrt/Garten/Terrasse), Dachsanierung (Aufdachdämmung), Elektrik komplett, Entkernung / Rückbau, Estrich / Bodenbeläge, Fassade / WDVS, Fenster & Türen, Fliesen (Bäder / Küche), Gaube Nordseite (optional), Heizung (Sole-Wasser-WP + Flächenkollektor), Innentüren, Kellersanierung (Boden + Feuchtigkeit), Loggia-Umbau (Einhausung), Lüftungsanlage, Malerarbeiten, PV-Anlage (~12 kWp) [Geplant, Budget 15000, Hoch], Sanitär / Wasser / Abwasser, Trockenbau / Innenausbau. Prioritäten (Hoch: Dach, Elektrik, Entkernung, Fassade, Fenster, Heizung, Keller, PV; Mittel: Estrich, Fliesen, Loggia, Lüftung, Sanitär, Trockenbau; Niedrig: Außenanlagen, Gaube, Innentüren, Maler). Status alle "Noch offen" außer Dachsanierung "Angebot einholen", PV "Geplant".
- **phases** (10, order 0–9): Phase 0: Kaufabwicklung (Abgeschlossen, 2026-04-01–2026-06-15), Phase 1: Planung & Förderanträge (Abgeschlossen, 2026-04-01–2026-06-05), Phase 2: Entkernung & Rückbau (In Arbeit, ab 2026-06-15), Phase 3: Rohbau & Keller, Phase 4: Dach & Fassade, Phase 5: Haustechnik, Phase 6: Innenausbau, Phase 7: PV-Anlage, Phase 8: Außenanlagen, Phase 9: Einzug (alle "Geplant").

### 5.7 `meta/lists` (ein Dokument)
```ts
{ people: string[]   // Seed: Thomas, Sarah, Laura, Matze, Christine, Julia, Tom, Jonas, Joni, Andre, Peter, Hannes, Wolfgang, Robert, Sabi, Handwerker
  weather: string[]  // Sonnig, Bewölkt, Regen, Frost, Schnee
  costCategories: string[] // Seed: Abriss/Entsorgung, Außendämmung/Fassade, Baustellenequipment, Bäder, Dach, Elektrik, Energieberater/Baubegleitung, Estrich, Fenster, Fußbodenheizung, Heizungsmontage, Wärmepumpe, Innenausbau, Küche, Lüftungsanlage, PV-Anlage, Werkzeug, Material allgemein, Verpflegung Helfer, Sonstiges
  taskAreas: string[]; contactRoles: string[] }
```
In den Einstellungen editierbar (hinzufügen/umbenennen).

### 5.8 `plans` – Pläne
```ts
interface Plan {
  id: string; title: string;
  floor?: 'KG'|'EG'|'OG'|'DACH'|'GAR'|'GESAMT';
  variant: 'original'|'ist'|'soll';   // original = Baupläne 1967, ist = Bestand-Modell, soll = Zielzustand
  kind: 'svg'|'pdf'|'image';
  source: 'bundled'|'upload';
  path: string;              // bundled: 'plans/ist-EG.svg' (relativ zu base) | upload: Storage-Pfad 'plans/{id}.pdf'
  pages?: number; bytes?: number; order: number; notes?: string;
}
```
Die gebündelten SVGs werden beim Seed als `source:'bundled'` eingetragen (bzw. rein clientseitig aus `public/plans/index.json` gelesen – Entscheidung: **`public/plans/index.json`**, kein Firestore nötig für bundled).

### 5.9 `users/{uid}`
```ts
{ email: string; displayName: 'Thomas'|'Sarah'; reminderEnabled: boolean; reminderTime: 'HH:mm' (Default '20:00'); fcmTokens: string[]; tz: 'Europe/Berlin' }
```

### 5.10 Lokale (nur Gerät) Einstellungen – `localStorage`/IndexedDB
`claudeApiKey`, `claudeModel` (Default `claude-opus-5`, Alternative `claude-sonnet-5`), `geminiApiKey`, `geminiModel` (freies Textfeld, Default `gemini-2.5-flash` – Googles Modellnamen wechseln schneller als diese App, eine Auswahlliste wäre irgendwann eine Sackgasse), `ocrEngine` (`auto`|`mlkit`|`gemini`|`claude`|`off`), `defaultModelVariant` (`ist`|`soll`), `deviceId`, `theme`.

### 5.11 Storage-Pfade
```
photos/{photoId}.jpg, photos/{photoId}_thumb.jpg
receipts/{costId}/{photoId}.(jpg|pdf)
plans/{planId}.(pdf|png|jpg)
```
Metadaten `contentType` korrekt setzen; `cacheControl: public, max-age=31536000` (Dateien sind unveränderlich, neue Version = neue ID).

### 5.12 Indizes (`firestore.indexes.json`)
`diary(date desc)`, `diary(roomIds array, date desc)`, `costs(date desc)`, `costs(category, date desc)`, `tasks(status, due)`, `photos(entryId)`, `photos(costId)`.

---

## 6. Security Rules

`firestore.rules`:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function allowed() {
      return request.auth != null
        && request.auth.token.email in ['<THOMAS_EMAIL>', '<SARAH_EMAIL>'];   // vom Chat eintragen
    }
    match /users/{uid} { allow read, write: if allowed() && request.auth.uid == uid; }
    match /{collection}/{doc} { allow read, write: if allowed(); }            // diary, photos, costs, tasks, contacts, trades, phases, meta, plans
  }
}
```
`storage.rules`: `allow read, write: if request.auth != null && request.auth.token.email in [...] && request.resource.size < 30 * 1024 * 1024`.
Deploy mit `firebase deploy --only firestore,storage` (Service-Account: `GOOGLE_APPLICATION_CREDENTIALS=sa.json`).

---

## 7. Offline- und Sync-Architektur

1. **Firestore** mit `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: CACHE_SIZE_UNLIMITED }) })`. Alle Reads über `onSnapshot` (Listener liefern Cache sofort, dann Server). Alle Writes gehen lokal durch und werden von Firestore selbst nachsynchronisiert – **keine eigene Sync-Logik für Dokumente**.
2. **Dateien (Fotos, Belege, Pläne-Upload)** können Firebase Storage offline **nicht** in die Warteschlange stellen → eigene **Outbox** in IndexedDB (`idb`, Store `outbox`: `{id, storagePath, blob, contentType, docRef:{collection,id,field}, attempts, createdAt}`).
   - Beim Anlegen: Foto verkleinern → Blob in Outbox → Firestore-Dokument sofort mit `uploadState:'pending'` schreiben → UI zeigt Bild aus der lokalen Blob-URL.
   - `outbox.process()` läuft bei App-Start, bei `online`-Event, beim Sichtbarwerden der App und alle 60 s wenn online: sequentiell hochladen (`uploadBytes`), dann Dokument `uploadState:'uploaded'` setzen, Blob aus Outbox löschen, Blob zusätzlich in den `fileCache` (Cache API) legen, damit er ohne erneuten Download sichtbar bleibt. Fehler → `attempts++`, exponentielles Backoff, nach 10 Versuchen sichtbarer Fehlerstatus (nicht verwerfen).
   - **Nichts darin darf unbegrenzt warten.** Der Upload hat ein Zeitlimit (90 s, `AbortController`); auf die Bestätigung des Firestore-Schreibens wird **nicht** gewartet, sondern nur kurz (10 s) darauf, dass es *scheitert* – Firestore hat seine eigene dauerhafte Warteschlange. Ein Lauf, der länger als 5 Minuten hängt, gilt als verloren, der nächste darf starten. Sonst genügt eine hängende Verbindung, damit die Anzeige dauerhaft „1 wird geladen“ zeigt, obwohl die Datei längst oben liegt, und auch „Jetzt versuchen“ nichts mehr tut.
   - Ein Job, dessen Dokument gelöscht wurde, wird verworfen statt ewig wiederholt (er lädt sonst die gelöschte Datei wieder hoch); `deletePhoto` räumt die Jobs eines Fotos gleich mit weg. Die testbare Entscheidungslogik steht in `src/offline/outboxRules.ts`.
   - Background Sync API (`registration.sync.register('outbox')`) zusätzlich registrieren, wenn verfügbar.
3. **Anzeige von Storage-Dateien**: Download-URLs werden über `getDownloadURL` geholt und im Dokument-Cache (`urlCache` in IndexedDB, `{storagePath → url}`) gespeichert; URLs sind stabil (Token). Workbox-Runtime-Route `CacheFirst` für `firebasestorage.googleapis.com` (max. 3000 Einträge, 180 Tage). Thumbnails werden beim Rendern der Liste geladen → danach offline verfügbar. Detailbilder nach erstem Öffnen offline.
4. **Pläne offline**: Für Uploads (PDF) gibt es pro Plan einen Schalter "Offline verfügbar" → Datei wird in den Cache `plans-offline` gelegt (und Status im UI). Gebündelte SVGs und Modelle sind über den Precache immer offline da.
5. **App-Shell** vollständig precached (Workbox `injectManifest`, `globPatterns: ['**/*.{js,css,html,svg,json,png,jpg,woff2}']`, `maximumFileSizeToCacheInBytes: 6 MB`). Update-Strategie: `registerType: 'prompt'` → Banner "Neue Version verfügbar – Neu laden".
6. **Sync-Status** in der TopBar: grüner Punkt (online, alles synchron), gelber Punkt mit Zahl (ausstehende Uploads), grau (offline). Klick → Liste der ausstehenden Uploads: was es ist (Foto, Vorschaubild, Beleg, Plan), wie groß, wie lange es schon wartet, wie viele Versuche, und der letzte Fehler im Klartext, dazu "Jetzt versuchen" und "Verwerfen" je Datei. Eine Zahl allein sagt nicht, *was* hängt, und lässt keinen Ausweg.
7. Konflikte: Last-write-wins (Firestore-Standard) reicht bei zwei Nutzern; Felder werden mit `updateDoc` partiell geschrieben, nie ganze Dokumente überschrieben.

---

## 8. Module / Screens

### 8.0 App-Shell & Navigation
- Mobil (< 900 px): **Bottom-Navigation** mit 5 Tabs: **Start · Tagebuch · 3D · Kosten · Mehr**. "Mehr" öffnet ein Sheet mit: Suche, Dateien, Aufgaben, Notizen, Kontakte, Gespräche, Einstellungen.
- Desktop (≥ 900 px): linke Sidebar mit allen 8 Zielen, Inhalt max. 1100 px breit, Listen zweispaltig wo sinnvoll.
- TopBar: Titel, Sync-Badge, kontextabhängige Aktion (z. B. "+").
- **Sheets werden per Portal an `document.body` gehängt.** `backdrop-blur` (wie `filter` und `transform`) macht ein Element zum Bezugsrahmen für `position: fixed` darin – TopBar und Bottom-Navigation haben es. Ein Sheet, das im Baum darunter steht, misst sich sonst an einer 56 px hohen Kopfzeile und erscheint am Telefon verschoben und unlesbar.
- Routen (HashRouter): `/`, `/tagebuch`, `/tagebuch/neu?date=YYYY-MM-DD`, `/tagebuch/:id`, `/tagebuch/:id/bearbeiten`, `/3d?variant=ist|soll&room=<id>`, `/plaene`, `/plaene/:id`, `/kosten`, `/kosten/neu`, `/kosten/:id`, `/aufgaben`, `/aufgaben/:id`, `/kontakte`, `/kontakte/:id`, `/gespraeche` (alle Gesprächsprotokolle über alle Kontakte, aus "Mehr" erreichbar), `/suche?q=<text>&typ=<art>`, `/einstellungen`, `/login`.
- Filter und Sprungziele in der Adresse: `/tagebuch?raum=<id>` und `?phase=<id>`, `/kosten?raum=<id>`, `?kategorie=<name>` und `?gewerk=<id>`, `/aufgaben?raum=<id>` und `?aufgabe=<id>` (öffnet das Sheet), `/kontakte?kontakt=<id>` (öffnet das Sheet), `/gespraeche?eintrag=<id>` (öffnet den Gesprächseintrag), `/fotos?raum=<id>` und `?art=photo|receipt`. Die Suche verlinkt darüber; das Sheet schließt den Parameter wieder weg.
- Unauthentifiziert → `/login` (E-Mail + Passwort, "Angemeldet bleiben" ist Standard über Firebase-Persistenz). Nach Login bleibt die Session auch offline gültig (Firebase Auth persistiert Token).
- Theme: dunkel wie der 3D-Viewer (`--bg #1d2126`, `--panel #2a3038`, `--ink #e8e4da`, `--muted #9aa3ad`, `--accent #c9a86a`), `theme-color` im Manifest identisch. Touch-Ziele ≥ 44 px. Safe-Area-Insets beachten (`viewport-fit=cover`).
- PWA-Manifest: `name: "Reno Master"`, `short_name: "Reno"`, `display: standalone`, `orientation: any`, `start_url: ./`, Icons 192/512 + maskable (einfaches Haus-Piktogramm in Akzentfarbe auf `#1d2126`), **Shortcuts**: "Neuer Tagebuch-Eintrag" (`#/tagebuch/neu`), "Beleg erfassen" (`#/kosten/neu?capture=1`), "3D-Modell" (`#/3d`).

### 8.1 Start (Dashboard)
- Hero: Nordansicht-Foto (`public/img/nordansicht.jpg`) mit Overlay-Titel "Schlesierstraße 31" und aktueller Phase (aus `phases` mit Status "In Arbeit"). Die Phase bleibt nur eine dezente Zeile im Bild, ist aber antippbar: ein kleines Sheet setzt genau eine Phase auf "In Arbeit", schließt bisher laufende Phasen ab und hält damit die automatische Phase für neue Tagebuch-Einträge und Aufgaben aktuell. Keine eigene Phasen-Karte auf dem Startscreen.
- Karte "Heute": wenn kein Eintrag für heute → großer Button "Tagebuch-Eintrag für heute anlegen"; sonst Vorschau des Eintrags + "Bearbeiten".
- Schnellaktionen: "Beleg erfassen" (öffnet Kosten-Editor mit Kamera), "Foto zum Tagebuch", "Aufgabe".
- Letzte 3 Tagebucheinträge (Datum, Titel, erstes Thumbnail).
- Offene Aufgaben (fällig ≤ 7 Tage oder Priorität Hoch), max. 5.
- Kosten-Kachel: Summe gesamt, Summe laufender Monat.
- Oben ein Suchfeld-Link "Alles durchsuchen…" auf `/suche`.
- Sync-/Offline-Hinweis.

### 8.2 Bautagebuch
- **Liste**: chronologisch absteigend, gruppiert nach Monat; Karte je Eintrag: Datum (Wochentag), Titel, Wetter-Icon, Anwesend-Chips, erste 3 Thumbnails, Mängel-Marker. Suchfeld (Volltext clientseitig über `title`+`text`+`present`). Filter-Chips: Phase, Gewerk, Raum, "mit Fotos", "Mängel".
- **Detail**: Text, Fotogrid (Tippen → Vollbild-Lightbox mit Wischen; Info-Button zeigt Originalname/Aufnahmezeit/Größe und – APK – "Original in Galerie öffnen"), Metadaten-Chips, Bearbeiten/Löschen.
- **Editor** (auch für Nachträge an anderen Tagen):
  - Datum (Default heute; `?date=` aus Shortcut/Erinnerung), Titel (auto "Tagebuch DD.MM.", editierbar), Text (Textarea, autogrow, Markdown-light), Wetter (Select), Anwesend (kompakter Mehrfach-Picker aus `meta/lists.people` + Person hinzufügen), Mängel (Toggle), Phase (automatisch gesetztes Info-Tag aus der aktuellen Phase), Gewerke (bewusst wählbarer Mehrfach-Picker), Räume (Mehrfach-Picker, gruppiert nach Geschoss).
  - **Fotos**: Button "Fotos hinzufügen" → `platform/photos.pickPhotos({ suggestDate: entry.date })`.
    - PWA: `<input type="file" accept="image/*" multiple>`; nach Auswahl EXIF-Datum lesen; Fotos, deren Aufnahmedatum ≠ Eintragsdatum, bekommen ein gelbes Badge "anderes Datum (DD.MM.)" mit Möglichkeit, sie zu entfernen. Hinweistext im Picker: "Die Galerie ist nach Datum sortiert – wähle die Fotos von heute."
    - APK: eigener Picker-Screen: Raster der Galerie-Fotos **des Eintragsdatums** (MediaStore-Abfrage), Button "Andere Tage" öffnet Datumsnavigation bzw. den System-Picker. Mehrfachauswahl, dann Übernahme.
      Auswahl startet noch keinen Import. „Hochladen (Anzahl)“ schließt den Dialog sofort;
      im Editor werden zunächst alle Vorschauen erzeugt, danach die Fotos lokal übernommen
      und über die Outbox hochgeladen. Pro Bild zeigen Ladekreise Vorbereitung bzw. ausstehenden
      Upload; fehlgeschlagene Importe lassen sich einzeln wiederholen. Formularfelder bleiben
      bedienbar. Speichern und Verwerfen warten nur auf die lokale Übernahme, nicht auf Uploads.
      Fotoimporte warten nicht auf Firestore-Serverbestätigungen; der Beleg-/OCR-Pfad behält
      seine bisherige begrenzte Wartezeit. Lokale Anhänge bleiben bis zum bestätigenden Snapshot sichtbar.
    - Kamera-Button (PWA: `capture="environment"`; APK: Capacitor Camera). "Original sichern" ist ein dezenter Inline-Toggle, kein Hauptaktionsknopf und keine gerahmte Schaltfläche.
    - Verarbeitung: `lib/image.resize(file, 1600)` + `thumb(320)` → Outbox (Abschnitt 7) → sofortige Vorschau. Reihenfolge per Drag/Pfeile änderbar, Bildunterschrift optional.
  - Autosave als Entwurf alle 5 s in IndexedDB (`drafts`), damit nichts verloren geht; beim Öffnen von `/tagebuch/neu` Entwurf anbieten.
  - Speichern schreibt Dokument (offline-fähig) und navigiert zum Detail.
- Löschen mit Bestätigung; verknüpfte Fotos werden aus Storage gelöscht (best effort, offline: in Outbox als Delete-Job).

### 8.3 3D-Modell (Port des bestehenden Viewers)
Der Viewer aus `viewer_template.html` wird **funktionsgleich** nach React/TypeScript portiert (`modules/viewer3d`), **nicht** neu erfunden:
- Szenenaufbau aus `SCENE.prims` (siehe Format in 9.2): `buildMesh` (Modell-Koordinaten mm → three: `(x, z, -y) * 0.001`, `toNonIndexed`, `computeVertexNormals`, `EdgesGeometry` mit Winkel 20°), Materialien nach `kind` (`wall`/`slab`/`roof`/`glass` transparent 0.45/`door`/`stair`/`rail`), Wandfarbe nach Konfidenz-Tag A/B/C, Modus "Tragwände" (rot/weiß), Boden-Ebene + Grid, Himmelsrichtungs-Labels (Sprites), Beleuchtung (Hemisphere + 2 Directional).
- **Eigene Orbit-Steuerung** 1:1 übernehmen: Pointer-Events, 1 Finger drehen, 2 Finger zoomen+verschieben, Mausrad, Rechtsklick/Shift = pan, Tippen ohne Bewegung = Auswahl (Raycaster), Kamera-Parameter `theta/phi/dist/target`, Limits (phi 0.08…π/2−0.02, dist 4…120).
- Layer-Buttons **KG · EG · OG · Dach · Garage** (an/aus), Ansichten-Select **Außen · EG-Grundriss · OG-Grundriss · KG-Grundriss** (setzen Sichtbarkeit + Kamera wie im Template), Button **Tragwände**, Legende (Konfidenz bzw. tragend/nicht tragend), Vollbild-Button, Info-Panel bei Auswahl (Name, Geschoss, Maße aus `bb`, Koordinaten, Konfidenztext, tragend).
- **Neu: Modell-Umschalter** oben: Segment-Control **"Ist" | "Soll"** (Default aus Einstellungen, URL-Param `variant`). Wechsel lädt die andere JSON (aus Precache/IndexedDB), baut die Szene neu, behält Kamera + Layer-Zustand. Versionsinfo (aus der aktiven Fassung, `src/data/models.ts` → `activeRelease`) klein im Header, z. B. "Ist v0.23 · 16.09.2026"; kommt das Modell nicht aus dem App-Bündel, steht der Kanal dahinter ("Sync", "Website").
- **Neu: Räume** (Abschnitt 9.4): pro Raum ein flaches, halbtransparentes Bodenpolygon (Extrusion 20 mm, Farbe Akzent 15 % Opazität, pickbar, eigene Layer-Zuordnung zum Geschoss). Tippen auf Raum → **RoomPanel** (Bottom-Sheet): Raumname, Geschoss, Fläche (aus Polygon), Zähler "12 Einträge · 34 Fotos · 3 Kosten · 2 Aufgaben" mit Links (führen in die jeweiligen Listen mit Raumfilter). Umschalter "Räume anzeigen" (Default an in Grundriss-Ansichten, aus in Außenansicht). Über URL `?room=<id>` wird der Raum vorselektiert und die passende Grundriss-Ansicht gesetzt.
- Performance: `setPixelRatio(min(dpr, 2))`, Rendering nur bei Änderung (`invalidate()`-Pattern statt dauerhaftem RAF-Loop, um Akku zu schonen), Szene beim Verlassen der Route disposen.
- Modell laden: über `loadScene(variant)` – die in IndexedDB liegende Fassung, wenn sie mindestens so neu ist wie die gebündelte, sonst `fetch(`${base}models/${variant}.json`)` (≈95 KB, 132 Bauteile, 4512 Dreiecke – unkritisch). Ladefehler offline → Meldung "Modell noch nicht heruntergeladen – einmal online öffnen". Ein Modell, das während der Ansicht ankommt, meldet sich über das Fenster-Ereignis `reno:model`; der Viewer baut die Szene dann neu.
- **Die Ansicht bleibt stehen.** Kamera (theta, phi, Abstand, Ziel), sichtbare Geschosse, Tragwand-Modus, Raum-Overlay, gewählte Ansicht und der offene Raum werden beim Verlassen des Bildschirms gemerkt (`viewerState.ts`: im Modul für den Weg zu einem anderen Bildschirm, in `localStorage` für den Weg durch eine geschlossene App, gesichert auch bei `pagehide`/`visibilitychange`). Beim Aufbau gewinnt der gemerkte Blick über die Standardansicht – auch beim Wechsel Bestand/Zielzustand, damit das Haus nicht unter dem Finger springt. Nur `?raum=<id>` sticht ihn, das ist ja eine Ansage. Was aus dem Speicher kommt, geht durch `parseViewerState`: ein einziges NaN stellt die Kamera sonst ins Nichts und der Bildschirm bleibt schwarz.
- **Alles Untere ist ein Stapel**: Bauteil-Info, Raumfenster und die Schalter-Chips stehen in *einem* Container über der Bottom-Navigation (`bottom-[calc(64px+env(safe-area-inset-bottom))]`), nicht als drei Einblendungen mit eigenen Abständen. Sonst liegt das Raumfenster am Telefon hinter der Navigation und unter den Chips – die Kachelleiste war dort zur Hälfte unsichtbar.

### 8.4 Pläne
- Liste gruppiert: **Original 1967** (Uploads von Thomas), **Bestand (Ist)** (generierte SVGs KG/EG/OG), **Zielzustand (Soll)**, **Sonstige** (Uploads). Kacheln mit Vorschau (SVG inline verkleinert, PDF-Erste-Seite via pdfjs-Thumbnail, Bild).
- Viewer: Vollbild, Pinch-Zoom/Pan (panzoom), für PDF Seitenwechsel (Wischen/Buttons), Rotation 90°. SVG-Pläne: Tippen auf Raum-Fläche (SVG-Elemente tragen `data-room-id`) → gleiches RoomPanel wie im 3D.
- Upload: Datei (PDF/PNG/JPG, max. 30 MB), Titel, Geschoss, Variante, Notiz → Outbox → Storage `plans/{id}.ext`. Kamera-Aufnahme (Plan abfotografieren) ebenfalls möglich.
- Schalter "Offline verfügbar" pro Upload (Abschnitt 7.4). Gebündelte SVGs immer offline.
- SVG-Generierung: `tools/model/build_plans_svg.py` (Abschnitt 9.3).

### 8.5 Kosten
- **Liste**: absteigend nach Datum; Zeile: Datum, Händler, Beschreibung, Betrag brutto, Kategorie-Chip, Status-Punkt, Beleg-Icon. Summenleiste oben (Gesamt, gefiltert). Filter: Zeitraum (Monat/Jahr/frei), Kategorie, Gewerk, Raum, Status, bezahlt von. Suchfeld.
- **Übersicht** (Tab): Summe gesamt; Balken nach Kategorie; Balken nach Monat; Tabelle Kategorie × Summe; optional Vergleich mit Gewerk-Budget (`trades.budgetPlanned` vs. Summe der Kosten mit `tradeId`). Export CSV (Semikolon, `de-DE`-Zahlen) über Web Share / Download.
- **Editor**:
  - Oben **Beleg-Bereich**: Buttons "Foto aufnehmen", "Aus Galerie", "Datei (PDF)". Sobald ein Beleg hinzugefügt wurde und die Felder noch leer sind → automatisch `platform/ocr.extract(file)` starten (Spinner "Beleg wird gelesen…"), Ergebnis in die Felder vorbefüllen, jedes vorbefüllte Feld mit dezentem Marker "automatisch erkannt" (Tippen entfernt Marker); nichts wird ohne Speichern übernommen. Button "Erneut auslesen" und Engine-Anzeige ("ML Kit" / "Claude" / "nicht verfügbar – Felder manuell ausfüllen").
  - Felder: Datum, Händler, Beschreibung, Betrag brutto (numerisches Tastatur-Feld, Komma erlaubt), MwSt-Satz (19/7/0) → Netto/MwSt automatisch, Kategorie (Chips + Select), Gewerk, Räume, Status, bezahlt von, Zahlungsart, Rechnungsnummer, Notizen.
  - Mehrere Belege pro Kosteneintrag möglich (Vorder-/Rückseite).
- Belege werden wie Fotos verkleinert (max. 2000 px, damit Text lesbar bleibt), PDFs unverändert gespeichert.
- Tippen auf einen angehängten Beleg öffnet dieselbe Vollbildansicht wie in der Beleg- und
  Fotoliste. PDFs rendert `PdfViewer` mit PDF.js statt über den Browser-PDF-Viewer: Seitenwechsel,
  Zoom (100–300 % relativ zur Seitenbreite) und Scrollen des Ausschnitts. PDF-Gesten wechseln
  nicht zur nächsten Datei; dafür gibt es eigene Pfeile. Dateien kommen über `resolveFileUrl`
  aus Outbox, lokalem Cache oder dem Netz. Der PDF-Worker ist gebündelt und im PWA-Precache;
  Ladefehler und Zeitüberschreitungen zeigen einen Wiederholen-Knopf, keine Endlos-Ladeanzeige.

### 8.6 Aufgaben
- Liste mit Segment "Offen | Alle | Erledigt"; Gruppierung nach Fälligkeit (Überfällig, Heute, Diese Woche, Später, Ohne Datum); Zeile: Checkbox, Titel, Chips (Priorität farbig, Bereich, Zuständig), Fälligkeit. Filter: Zuständig (Thomas/Sarah/Beide), Bereich, Gewerk, Phase, Raum.
- Schnellanlage: Eingabefeld oben ("Aufgabe… ⏎"), Details später.
- Editor: Titel, Notizen, Status, Priorität, Fällig am, Erinnerung, Zuständig (Multi), Bereich, Gewerk, Phase, Räume.
- Erledigt-Haken setzt `status:'Erledigt'`, `doneAt` und löscht eine geplante Erinnerung. In der Android-App wird `reminderAt` beim Speichern der Aufgabe direkt als lokale Benachrichtigung gestellt oder gelöscht; dieser direkte Weg wartet nicht auf den nächsten Aufgaben-Snapshot. Falls die Benachrichtigungserlaubnis noch fehlt, fragt der Speichervorgang mit Erinnerung danach. Der laufende Aufgaben-Listener gleicht die Liste danach nur noch als Sicherheitsnetz ab. Kann Android die Aktion „Erledigt“ nicht registrieren, wird die Erinnerung trotzdem geplant; deren Aktion „Erledigt“ markiert die Aufgabe als abgeschlossen, wenn sie verfügbar ist.

### 8.7 Kontakte
- Liste alphabetisch mit Suchfeld, Gruppierung nach Rolle/Gewerk optional; Zeile: Name, Firma, Rollen, Status-Chip, Sterne.
- Detail: Telefon (`tel:`-Link + WhatsApp-Link `https://wa.me/<nummer>`), E-Mail (`mailto:`), Gewerke, Status, Bewertung, Notizen; Buttons Anrufen / WhatsApp / E-Mail / Teilen (vCard über Web Share).
- Editor mit allen Feldern. **Rollen sind mehrfach wählbar und erweiterbar**: der Picker ist derselbe
  Sheet-mit-Checkliste wie „Anwesend“ im Tagebuch (`RolePicker`/`MultiPicker` in `src/components/Pickers.tsx`),
  nicht mehr eine flache Chip-Reihe – neue Rollen kommen über „Rolle hinzufügen“ direkt in die gemeinsame
  Liste `meta/lists.contactRoles`. Kontakte, die noch das alte einzelne `role`-Feld tragen, werden beim
  nächsten Speichern automatisch auf `roles: string[]` migriert (`contactRoleNames()` in
  `src/data/contactRoles.ts` liest beide Formen).
- **Import aus dem Adressbuch**: Button „Importieren“ neben „Neu“. Woher die Auswahl kommt, hängt an der
  Plattform (`src/platform/contactsImport.ts`): in der App liest das eigene Plugin `plugins/contacts` das
  Adressbuch direkt (Berechtigung `READ_CONTACTS`) – die Web Contact Picker API meldet sich im WebView der
  App zwar als vorhanden, aber ihr `select()` scheitert dort immer mit „Unable to open a contact selector“,
  weil dem WebView die Activity für den Auswahldialog fehlt, und Android kennt ohnehin keinen zuverlässigen
  Mehrfachauswahl-Intent. Im Browser (Chrome/Android) läuft stattdessen die Contact Picker API. Überall sonst
  – und immer zusätzlich – wird eine vCard-Datei (.vcf, ein oder mehrere Kontakte) ausgewählt und geparst.
  Alle drei Wege landen in derselben Checkliste vor dem Anlegen, mit Hinweis auf Namen, die schon als
  Kontakt bestehen.
- **Mehrere Telefonnummern**: ein Kontakt im Adressbuch kann mehr als eine Nummer haben (Mobil, Arbeit, ...).
  Der Import behält alle, beschriftet (`ImportedContact.phones` in `contactsImport.ts`); beim Anlegen bekommt
  `Contact.phone` die bevorzugt mobile Nummer (`primaryPhone()`), der Rest landet beschriftet in den Notizen,
  weil `Contact` selbst nur ein Telefonfeld hat.
- **Gesprächsprotokoll**: eigene, datierte Einträge je Kontakt (Datum/Uhrzeit, Art – Anruf/Termin/E-Mail/
  Nachricht/Sonstiges –, Text) statt Fließtext in den Notizen; Collection `contactLogs`, Feld `contactId`.
  Liste und Editor sitzen im Kontakt-Editor (`src/modules/contacts/ContactLogSection.tsx`), neueste zuerst.
  Das freie Notizfeld bleibt für alles andere, alte Telefonat-Vermerke wandern nicht automatisch um.
  Eigener Bildschirm `/gespraeche` (`ContactLogsPage.tsx`, aus "Mehr" erreichbar) zeigt alle Einträge über
  alle Kontakte, neueste zuerst, mit Suchfeld und bis zu dreizeiliger Vorschau (Zeilenumbrüche zu
  Leerzeichen gefaltet); Tippen öffnet den Eintrag selbst (`ContactLogEditor` mit „Kontakt“-Feld),
  ebenso ein Suchtreffer über `?eintrag=<id>`.
  **Kein Löschen in Kaskade**: löscht man einen Kontakt, bleiben seine Einträge stehen (eigene Collection,
  keine Firestore-Kaskade). Unter `/gespraeche` zeigt so ein verwaister Eintrag "Kontakt gelöscht" statt
  eines Namens; über das "Kontakt"-Feld im Editor lässt er sich einem anderen zuordnen.

### 8.10 Fotos (`/fotos`)
- Alle Bilder an einem Ort, nach Monaten gruppiert, Raster aus quadratischen Vorschaubildern (3 Spalten am Telefon, 4 bzw. 6 breiter), Tippen öffnet die bestehende `Lightbox` mit Wischen, Original-Nachladen und einem Fuß, der zum Tagebucheintrag bzw. Beleg führt.
- Die Standardgruppierung ist nach Bauphase: Fotos erben die Phase ausschließlich über ihren Tagebuch-Eintrag (`entry.phaseId`), nicht über ein eigenes Pflegefeld. Ein dezenter Umschalter bietet weiter die Monatsgruppierung. Belege werden hier nicht nach Phase gruppiert; die Fotos-Seite zeigt nur `kind:'photo'`.
- Chips: Alle · Fotos · Belege. `?raum=<id>` filtert auf einen Raum – dorthin führt die Kachel „Fotos“ im Raumfenster des 3D-Modells, und zurück führt der Pfeil dorthin.
- **Der Raum eines Fotos steht nicht am Foto.** `addPhoto` setzt `roomIds` nie: beim Fotografieren wählt niemand Räume aus. Ein Bild gehört zu einem Raum, wenn sein Tagebucheintrag oder sein Beleg ihn trägt (`src/data/photoRooms.ts`, testbar); das Feld am Foto zählt zusätzlich. Ohne diese Regel zeigt die Kachel „Fotos“ eines Raums null, so voll das Tagebuch auch ist.
- Das Datum eines Fotos ist `takenAt`, sonst der Tag seines Eintrags, sonst der seines Belegs – Bilder ohne alles stehen unter „Ohne Datum“.

### 8.9 Suche (`/suche`)
- **Eine Suche über alles**: Tagebuch (Titel, Text, Anwesende, Wetter, Mängel), Kosten und Belege (Händler,
  Beschreibung, Kategorie, Rechnungsnummer, Notizen und der vom Beleg **gescannte Text** aus
  `extraction.rawText`), Aufgaben, Kontakte (inklusive Rollen und Notizen), die Gesprächsprotokoll-Einträge
  der Kontakte (eigene Art `contactLog`, verlinkt zurück auf den Kontakt), Gewerke,
  Phasen, Räume des Modells, Pläne und Fotountertitel. Verknüpfungen zählen mit: ein Eintrag wird auch über
  den Namen seines Raums, seines Gewerks oder seiner Phase gefunden.
- Mitgesucht wird, was nicht als Text dasteht: Status ("offen", "Beauftragt"), Zuständige, Beträge
  (`89,90` findet `89,90 €`) und Daten in jeder Schreibweise (`13.09`, `13.09.2026`, `September`).
- **Wortteile zählen**: `putz` findet `Innenputz` – bei deutschen Komposita führt Präfixsuche sonst ins Leere.
  Umlaute sind egal (`tuer` = `tür`, `strasse` = `straße`), Groß-/Kleinschreibung auch.
- Mehrere Wörter sind eine UND-Suche; jedes Wort muss irgendwo im Datensatz vorkommen. Treffer im Titel
  wiegen schwerer als in den Zusatzfeldern, die wiederum schwerer als im Fließtext; ein ganzes Wort schlägt
  einen Wortanfang, der einen Treffer im Wortinneren.
- Darstellung: ein Suchfeld, darunter Filter-Chips je Art mit Trefferzahl ("Alle 24 · Tagebuch 7 · Kosten 5"),
  dann die Treffer **nach Abschnitten gruppiert** – ein Abschnitt je Art, in der Reihenfolge ihres besten
  Treffers, je fünf Zeilen und darunter "Alle 12 unter Kosten anzeigen", was auf den Filter dieser Art
  umschaltet. Mit gesetztem Filter wird daraus eine flache Liste, 25 Treffer, dann "Weitere anzeigen".
  Jede Zeile: Art-Plakette, Titel mit hervorgehobener Fundstelle, Kontextzeile (Datum, Status, Kategorie)
  und – wenn der Treffer im Fließtext liegt – ein Textausschnitt um die Fundstelle. Rechts der Betrag,
  wo es einen gibt.
- Ohne Eingabe: die letzten Suchen (nur auf dem Gerät, `localStorage`), Vorschlags-Chips und ein kurzer
  Hinweis, was durchsucht wird.
- Technik (`src/search/`): `normalize.ts` faltet Text und Anfrage gleich und merkt sich, woher jedes Zeichen
  kam (für die Hervorhebung im **Original**text). `engine.ts` baut daraus einen Index aus Zeichenpaaren
  (Paar → Datensätze); eine Anfrage schneidet die Listen ihrer seltensten Paare und prüft erst dann die
  wenigen übrigen Datensätze genau. Gefaltet wird also **einmal beim Aufbau**, nicht bei jedem Tastendruck.
  `records.ts` macht aus den Firestore-Dokumenten die durchsuchbaren Datensätze (ohne React, ohne Firestore –
  das ist der Teil mit Unit-Tests). Der Index entsteht erst, wenn der Suchbildschirm offen ist, und lebt
  von denselben `onSnapshot`-Abfragen wie der Rest, also auch offline.
- Größenordnung: 1500 Datensätze mit Text sind in ~50 ms indiziert, eine Suche liegt darunter.

### 8.8 Einstellungen
- Konto (E-Mail, Abmelden), Anzeigename.
- Erinnerung: an/aus, Uhrzeit (Default 20:00), „Benachrichtigungen erlauben“, „Testbenachrichtigung“; darunter die nächste fällige Erinnerung im Klartext („Nächste Erinnerung: morgen um 20:00.“) und der Hinweis, ob das Gerät sie selbst stellt (App) oder nur die offene Seite (Browser).
- Beleg-Auslesen: Verfahren (Automatisch = ML Kit → Gemini → Claude, oder eines davon erzwingen, oder aus), darunter je ein Block für Gemini und Claude mit API-Key (Passwortfeld, nur lokal) und Modell. Beide Schlüssel liegen ausschließlich im localStorage des Geräts.
- Modelle (`ModelSection`): Tabelle Ist/Soll mit aktiver Version, Datum, Kanal und Ladedatum, Standardvariante, "Nach neuem Modell suchen", und – angemeldet – "Modell veröffentlichen": erzeugte `ist.json`/`rooms-ist.json` auswählen, Version und Datum kommen aus `meta` der Datei selbst.
- Listen: Personen (Anwesend), Kosten-Kategorien, Aufgaben-Bereiche, Kontakt-Rollen – hinzufügen/umbenennen.
- Offline: belegter Speicher (StorageManager.estimate), ausstehende Uploads, "Alle Thumbnails jetzt laden", "Cache leeren".
- App-Version (Git-SHA + Build-Datum), "Nach Update suchen".

---

## 9. 3D-Modell-Pipeline und Übergabe an den Modell-Agenten

### 9.1 Ablage im Repo
`tools/model/` erhält die komplette Toolchain aus der ZIP (Python): `haus_model.py` (**Datenbasis Ist**), `build_scene.py`,
`build_outputs.py`, `build_cad.py`, `build_print.py`, `check_walls.py`, `plan2d.py`, `overlay.py`, `pinkcheck.py`,
`viewer_template.html` (Referenz), `Wandtabelle.md`, `README_Uebergabe.md`, `Haus_FreeCAD.py`, `requirements.txt`, `build_all.sh`.
Nicht committen: `Haus_Rohbau.step`, `Haus_3D.html`, `three.min.js`, `package/` (gitignored, siehe Abschnitt 4).

Neu zu erstellen:
- `tools/model/haus_model_soll.py`: startet als `from haus_model import *` (Soll = Ist). Der Modell-Agent ändert hier später Wände/Öffnungen für den Zielzustand (Anleitung in README-MODELL.md: Kopie der Listen `WALLS`/`OPENINGS` anlegen und modifizieren, nicht `haus_model.py` anfassen).
- `tools/model/build_scene.py`: Parameter `--variant ist|soll` (importiert `haus_model` bzw. `haus_model_soll` als `m`) und `--out <pfad>`; Ausgabe zusätzlich mit `meta.variant`, `meta.version`, `meta.generatedAt`.
- `tools/model/extract_scene_from_html.py`: zieht das eingebettete `const SCENE = {...};` aus `Haus_3D.html` und schreibt `public/models/ist.json` (**Fallback ohne CadQuery** – wird in M1 benutzt, weil `cadquery` (~150 MB OCP) in der Entwicklungs-Sandbox evtl. nicht installierbar ist). Das ist der Weg für den ersten Stand: Ist = extrahiertes JSON, Soll = Kopie davon mit `meta.note = "Platzhalter – identisch mit Ist"`.
- `tools/model/build_rooms.py` (reine Python-Stdlib): erzeugt `public/models/rooms-ist.json` und `rooms-soll.json` aus Raumdefinitionen (9.4).
- `tools/model/build_plans_svg.py` (Stdlib): erzeugt `public/plans/{variant}-{KG|EG|OG}.svg` (9.3).
- `tools/model/build_all.sh`: `check_walls` → `build_rooms` → `build_plans_svg` → `build_scene` (wenn cadquery verfügbar, sonst Hinweis) → Manifest schreiben.
- `tools/model/README-MODELL.md` – **die Anleitung für den Modell-Agenten**, Inhalt:
  1. Koordinatensystem (aus README_Uebergabe), Dateien, Konfidenz-Tags.
  2. Workflow Ist ändern: `haus_model.py` editieren → `./build_all.sh` → prüfen (`check_walls.py` darf keine "FREIES ENDE"/"AUSSERHALB" melden) → `public/models/manifest.json` Version erhöhen → Commit + Push auf `main` → GitHub Actions deployt → App zeigt beim nächsten Online-Start "Neue Version" → nach Neuladen ist das neue Modell offline vorhanden.
  3. Workflow Soll ändern: analog in `haus_model_soll.py`.
  4. Format der Ausgabe (9.2) und der Räume (9.4) – Pflicht, damit auch ein anderes Werkzeug (FreeCAD/Blender-Export) dieselbe JSON liefern könnte.
  5. Was die App erwartet (Layer-Namen, `kind`-Werte, Einheiten mm, Koordinatenmapping).

### 9.2 Szenenformat `public/models/{ist|soll}.json` (bestehendes Format von `build_scene.py`, unverändert + `meta` erweitert)
```json
{ "meta": { "variant": "ist", "version": "0.22", "generatedAt": "2026-09-13", "house_w": 13240, "house_d": 11820, "ridge": 7428.7, "note": "" },
  "prims": [ { "layer": "KG|EG|OG|DACH|GAR", "name": "Außenwand Nord", "kind": "wall|slab|roof|glass|door|stair|rail",
               "tag": "A|B|C", "tragend": true, "v": [x,y,z, ...mm], "t": [i0,i1,i2, ...], "bb": [xmin,ymin,zmin,xmax,ymax,zmax] } ] }
```
`public/models/manifest.json`: `{ "ist": { "file": "ist.json", "version": "0.22", "updatedAt": "2026-09-13", "note": "Rohbau nach Plan 1967" }, "soll": { "file": "soll.json", "version": "0.0", "updatedAt": "...", "note": "Platzhalter – identisch mit Ist" } }`.
Die App validiert beim Laden (zod-Schema) und zeigt bei Formatfehlern eine klare Meldung.

### 9.3 Grundriss-SVGs
`build_plans_svg.py` zeichnet pro Geschoss: Wände (Rechtecke, Farbe nach Tag wie `plan2d.py`), Öffnungen (Fenster blau, Türen grün, "offen" weiß), Treppen (schraffiert), Räume als transparente Flächen mit `data-room-id` und Raumname + Fläche als Text in der Mitte, Maßketten außen (Gesamtmaße), Nordpfeil, Maßstabsleiste, Titel ("EG – Bestand v0.22"). ViewBox in mm (`0 0 14240 12820` mit 500 mm Rand), y-Achse gespiegelt (Norden oben). Stil an das App-Theme angepasst (dunkler Hintergrund, helle Wände) **und** druckfreundliche Variante per CSS-Klasse.

### 9.4 Räume `public/models/rooms-{ist|soll}.json` und `public/models/room-map.json`
```json
{ "variant": "ist", "generatedAt": "2026-09-17",
  "rooms": [ { "id": "eg-wohnzimmer", "name": "Wohnzimmer", "floor": "EG", "rects": [[x0,y0,x1,y1], ...], "areaM2": 34.99 } ] }
```
`rects` sind achsenparallele Rechtecke in mm (Innenkanten), meist eines, bei L-Räumen oder
Räumen mit Kamin mehrere. `areaM2` fehlt, wenn `rects` leer ist – ein Soll-Raum ohne
Aufmaß (siehe unten). Definiert werden die Räume in `tools/model/rooms_ist.py`
(Ist) und `tools/model/rooms_soll.py` (Soll), erzeugt und geprüft von
`tools/model/build_rooms.py`.

**`tools/model/rooms_map.py`** ordnet jeder Ist-id genau eine Soll-id zu, vollständig
(jede Ist-id kommt vor, auch wo sie sich nicht ändert) und einspaltig (auch bei einer
Zusammenlegung zeigt jede beteiligte alte id auf dieselbe neue id). Daraus baut
`build_rooms.py` `public/models/room-map.json` (`{"from":"ist","to":"soll","map":{…}}`)
und meldet eine fehlende oder auf nichts zeigende Zeile. Aktueller Stand:

| id | Name | Geschoss | wird zu |
|---|---|---|---|
| kg-esskueche | Essküche | KG |  |
| kg-wohnzimmer | Wohnzimmer | KG |  |
| kg-schlafzimmer | Schlafzimmer | KG |  |
| kg-flur | Flur | KG |  |
| kg-bad | Bad | KG |  |
| kg-heizung | Heizung | KG | `kg-technik` |
| kg-oellager | Öllager | KG | `kg-technik` |
| kg-treppenhaus | Treppenhaus | KG |  |
| kg-diele | Diele | KG |  |
| kg-keller1 | Keller 1 | KG |  |
| kg-kellerflur | Kellerflur | KG |  |
| kg-obst | Obstkeller | KG |  |
| kg-keller2 | Keller 2 | KG |  |
| eg-wohnzimmer | Wohnzimmer | EG |  |
| eg-loggia | Loggia | EG |  |
| eg-esskueche | Essküche | EG |  |
| eg-garderobe | Garderobe | EG |  |
| eg-wc | WC | EG |  |
| eg-speise | Speisekammer | EG |  |
| eg-flur | Flur | EG |  |
| eg-bad | Bad | EG |  |
| eg-treppenhaus | Treppenhaus | EG |  |
| eg-diele | Diele | EG |  |
| eg-zimmer-nw | Schlafzimmer | EG |  |
| og-kind2 | Kind 2 | OG |  |
| og-kind1 | Kind 1 | OG |  |
| og-kind3 | Kind 3 | OG |  |
| og-diele | Diele | OG |  |
| og-treppe | Treppe | OG |  |
| og-g | Garderobe | OG |  |
| og-wc | Bad | OG |  |
| og-hwr | Hauswirtschaftsraum | OG |  |
| og-waescheboden | Wäscheboden | OG |  |
| gar-garage | Garage | GAR |  |

**Ein Soll-Raum darf ohne Rechtecke in der Liste stehen** (`room(rid, name, floor)` ohne
weitere Argumente): er taucht in Auswahl, Listen und Suche auf und sammelt die alten
Einträge seiner Vorgänger ein, wird im 3D und im Grundriss aber erst gezeichnet, sobald
die Wände feststehen. So kann die Soll-Namensliste und die Zuordnung stehen, bevor das
Soll-Aufmaß da ist.

**Bestand/Planung** (Einstellungen → Räume, gerätelokal, `src/data/roomNaming.ts`):
wirkt auf Tagebuch, Kosten, Aufgaben, Notizen, Fotos, die Suche und die Raum-Auswahl in
Formularen – **nicht** auf 3D und Pläne, die immer die Namen ihrer eigenen Modellvariante
zeigen. In Stellung Planung zeigt eine gespeicherte Ist-id den Namen des Soll-Raums, auf
den sie zeigt, und ein Filter oder eine Raum-Kachel fasst den Soll-Raum und alle Ist-Räume
zusammen, die auf ihn zeigen (`kg-technik` findet also `kg-heizung`- und
`kg-oellager`-Einträge). Ein neuer Eintrag speichert die id der Ansicht, in der er angelegt
wurde, nie eine übersetzte; die Zuordnung wird nur vorwärts gelesen. Trefferprüfung im 3D:
Raum-Meshes sind pickbar (Raycaster); in SVG per `data-room-id`. Ein Link `?raum=<id>` aus
der anderen Variante wird über `resolveInVariant` aufgelöst: vorwärts (Ist → Soll) über die
Zuordnung, immer eindeutig; rückwärts (Soll → Ist) über den flächenmäßig größten
Vorgänger, wenn mehrere zusammengelegt wurden.

---

## 10. Beleg-Auslesen (OCR / Extraktion)

`src/platform/ocr/index.ts`:
```ts
export interface ReceiptFields { date?: string; vendor?: string; amountGross?: number; amountNet?: number; vatRate?: number; vatAmount?: number; invoiceNumber?: string; description?: string; category?: string; confidence: number; engine: 'mlkit'|'claude'|'none'; rawText?: string }
export interface ReceiptExtractor { readonly id: 'mlkit'|'claude'; isAvailable(): Promise<boolean>; extract(file: Blob, mime: string): Promise<ReceiptFields> }
export async function extractReceipt(file, mime): Promise<ReceiptFields>  // 'auto' geht AUTO_ORDER durch: mlkit, gemini, claude - das erste mit Schlüssel und Verfügbarkeit
```
- **ML Kit** (`@capacitor-mlkit/text-recognition`, nur `isNativePlatform()`): Bild → `TextRecognition.recognize({ image: path })` → `rawText` → `parseReceiptText(rawText)` (heuristisch, deutsch):
  - Datum: Regex `\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b`, nimm das plausibelste (≤ heute, ≥ 2025), bevorzugt neben "Datum"/"Rechnungsdatum".
  - Bruttobetrag: Zeilen mit `Summe|Gesamt|Total|Brutto|zu zahlen|Endbetrag|EUR|€`; größter Betrag im Format `1.234,56` / `1234,56` / `12,34`; Fallback: größter Betrag überhaupt.
  - MwSt: `19\s?%|7\s?%`, Betrag daneben; Netto = Brutto − MwSt oder Zeile "Netto".
  - Händler: erste nicht-leere Zeile mit Buchstaben (ohne Straßen-/PLZ-Muster), oder bekannte Namen (Liste: Bauhaus, Hornbach, OBI, Toom, Hagebau, Raiffeisen, BayWa, Amazon, eBay, Kleinanzeigen, Würth, Hilti, Bosch) → dann auch Kategorie-Vorschlag "Material allgemein"/"Werkzeug".
  - Rechnungsnummer: `Re(chnungs)?[-.\s]?Nr\.?\s*[:#]?\s*([A-Z0-9\-\/]+)`.
  - Confidence 0–1 aus Anzahl gefundener Felder. Unit-Tests mit 8–10 Beispieltexten (Baumarkt-Kassenzettel, Handwerkerrechnung, Amazon).
- **Gemini** (kein Client-Paket, ein `fetch` auf `generativelanguage.googleapis.com/v1beta/models/<modell>:generateContent`): Bild und PDF gleichermaßen als `inline_data` mit dem passenden `mime_type`, `systemInstruction` und Nutzertext aus `ocr/request.ts` – **dieselben wie bei Claude**, sonst läse dieselbe Quittung je nach Einstellung anders. `generationConfig.temperature: 0` und `responseMimeType: 'application/json'`. Der Schlüssel geht im Header `x-goog-api-key`, nie im Query-String, sonst steht er in Logs und Referrern. Ein Fehlerstatus wird als `status` an den Fehler gehängt, damit `ocr/errors.ts` für beide Engines eine Meldung erzeugt (404 → "Modellnamen prüfen", denn Googles Modellnamen wechseln).
- **Claude** (`@anthropic-ai/sdk`, Browser-Client `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`, Modell aus Einstellungen, Default `claude-opus-5`): Bild als `{type:'image', source:{type:'base64', media_type, data}}` (auf ≤ 1568 px verkleinern), PDF als `{type:'document', source:{type:'base64', media_type:'application/pdf', data}}`; Prompt: "Lies diesen Beleg/diese Rechnung (deutsch) aus …"; **strukturierte Ausgabe** über `client.messages.parse({ model, max_tokens: 2000, messages, output_config: { format: zodOutputFormat(ReceiptSchema) } })` mit zod-Schema (Felder wie `ReceiptFields`, Datum ISO, Beträge als Zahl, `category` aus der übergebenen Kategorienliste wählen, `confidence` 0–1). `parsed_output` null → Fehler "Beleg nicht lesbar". Fehler (401 → "API-Key ungültig", 429/5xx → "später erneut", offline → "Nur online möglich"). Kosten ~1–2 Cent pro Beleg mit Opus 5; Hinweis in den Einstellungen.
- Beide Engines liefern `rawText`/Roh-JSON, das im `costs.extraction` gespeichert wird (Debug/Nachvollziehbarkeit).

---

## 11. Erinnerung (Abend-Push)

**Die Entscheidung fällt auf dem Gerät, nicht auf einem Server.** Ein Server bräuchte den
Blaze-Tarif und – wichtiger – ein Telefon, das genau in dieser Minute online ist. Auf einer
Baustelle im Keller ist es das nicht. Beides weiß die App selbst: die Uhrzeit steht im
Profil, welche Tage schon einen Eintrag haben, beantwortet der Offline-Cache.

- `src/platform/reminderPlan.ts` – die ganze Entscheidung als reine Rechnung, ohne Gerät:
  `planReminders({ enabled, time, datesWithEntry, now, days })` liefert die nächsten 14
  Termine (ein Tag mit Eintrag fällt raus, ein verstrichener Zeitpunkt auch),
  `dueReminder(…)` den Termin, der gerade überfällig ist. Die id eines Termins wird aus dem
  Datum abgeleitet (`reminderId`), damit genau dieser eine Tag später wieder zurückgezogen
  werden kann. Unit-getestet.
- `src/platform/reminder.ts` – die Geräteseite. Nativ übergibt `applyReminderPlan` den Plan
  an `@capacitor/local-notifications`; Android weckt sich selbst, ganz ohne Netz.
  `showReminderNow` ist die Testbenachrichtigung, `watchReminderTaps` öffnet beim Antippen
  `#/tagebuch/neu` (über den Hash, weil beim Kaltstart noch kein Router da ist).
- `src/data/useReminder.ts` – hält beides synchron. Der Hook hängt an derselben
  `onSnapshot`-Abfrage wie der Rest: wer den heutigen Eintrag speichert, nimmt damit im
  selben Moment die heutige Erinnerung mit. Zusätzlich löscht das Speichern eines Eintrags
  den Termin für dieses Datum direkt über seine abgeleitete Android-id, ohne auf die nächste
  Listenabfrage oder die Serverbestätigung des Firestore-Writes zu warten. Neu geplant wird
  außerdem, wenn die App wieder sichtbar wird. Ohne geladenes Profil und ohne erste
  Tagebuchantwort passiert nichts – ein Offline-Start ohne Cache darf die gestellten Wecker
  nicht löschen und ein Start vor dem Tagebuch-Snapshot darf nicht kurz einen falschen Wecker
  stellen.
- Im Browser geht das nicht: eine Seite kann sich nicht selbst wecken. Dort erinnert die App,
  solange sie offen ist (Minutentakt, `dueReminder`, einmal pro Tag über
  `reno.reminder.lastShown`). Die Einstellungen sagen diesen Unterschied ausdrücklich.
- **Optional obendrauf**, für den Fall „Browser zu“: `functions/src/index.ts` –
  `onSchedule({ schedule: 'every 10 minutes', timeZone: 'Europe/Berlin' })`, schickt FCM an
  `users/*.fcmTokens`, wenn `reminderEnabled` und noch kein `diary`-Dokument mit
  `date == heute`. `src/platform/notifications.ts` holt den Token (`registerPushToken`,
  stillschweigend wirkungslos ohne `VITE_VAPID_KEY`), `sw.ts` zeigt die Nachricht erst nach
  einem lokalen Gerätecheck: bekannte Tage mit Eintrag liegen zusätzlich in IndexedDB, damit
  ein Offline-Eintrag auf diesem Gerät einen Server-Push noch unterdrücken kann.
  `notificationclick` öffnet die Route. Das braucht Blaze und `firebase deploy --only functions`;
  ohne das bleibt es bei der Erinnerung vom Gerät, und die ist der Normalfall.
- APK: keine zusätzliche Einrichtung, kein `google-services.json`, kein Token. Die
  Berechtigung (`POST_NOTIFICATIONS` ab Android 13) fragt der Knopf in den Einstellungen.
  Darf die App keine exakten Wecker stellen (Android 14), stellt das Plugin ungenaue – die
  Erinnerung kommt dann ein paar Minuten später statt gar nicht.

**Vier Regeln, jede nach einem Knopf geschrieben, der am Telefon nichts tat:**

0. **Native Plugins über `Capacitor.Plugins` ansprechen, nicht über `import()`.**
   `await import('@capacitor/local-notifications')` löste im WebView nie ein: ein zur
   Laufzeit nachgeladener Baustein geht durch den Service Worker, und diese Anfrage kommt
   dort nicht zurück. Die Diagnose meldete die Acht-Sekunden-Frist, bevor überhaupt nach
   einer Erlaubnis gefragt wurde. `photos.ts` und `ocr/mlkit.ts` nehmen seit jeher die
   Brücke, die der native Teil füllt – das funktioniert. Das npm-Paket bleibt trotzdem in
   `package.json`: daraus holt `npx cap sync` die Android-Seite. **Achtung:**
   `platform/native.ts` lädt Status Bar, Splash Screen und den Zurück-Knopf noch per
   `import()` und dürfte aus demselben Grund still wirkungslos sein.

1. **`smallIcon` ist Pflicht.** Android zeichnet in der Statusleiste ein eigenes kleines
   Symbol und verwirft die Benachrichtigung **wortlos**, wenn es fehlt oder ins Leere
   zeigt – kein Fehler, kein Log, nichts. Das Symbol ist
   `tools/icon/android/ic_stat_reno.xml` (Vektor, nur Alphakanal), `patch-android.mjs`
   kopiert es nach `res/drawable/`, `capacitor.config.ts` nennt es, und der APK-Workflow
   bricht ab, wenn eines von beidem fehlt.
2. **Die Testbenachrichtigung wird nie geplant, sondern sofort angezeigt** (kein
   `schedule` im Aufruf). Ein Wecker eine Sekunde in der Zukunft läuft in Androids
   Stromsparbremse: `setAndAllowWhileIdle` feuert im Doze-Zustand nur etwa alle neun
   Minuten. Eine funktionierende Einrichtung sah dadurch kaputt aus.
3. **In der App nie auf die Browser-API zurückfallen.** `Notification` gibt es auch im
   Android-WebView und sieht benutzbar aus, aber `requestPermission()` kann dort schlicht
   nie antworten – ein Versprechen, das nie eingelöst wird, ist ein Knopf, der nichts tut.
   Deshalb bekommt außerdem jeder Geräteaufruf in `reminder.ts` eine Frist
   (`withDeadline`, 8 s): ein stummes Gerät muss einen Satz erzeugen, keinen toten Knopf.

- **Diagnose statt Raten.** Das Telefon steht woanders, und „es passiert nichts“ passt auf
  eine fehlende Erlaubnis, ein nicht geladenes Plugin und eine weggeworfene Meldung – drei
  Ursachen mit gegensätzlichen Lösungen. `reminderDiagnosis()` fragt das Gerät (Erlaubnis,
  exakte Wecker, Anzahl der wirklich gestellten Wecker samt nächstem Datum),
  `describeDiagnosis()` macht daraus deutsche Sätze, und die Einstellungen zeigen sie unter
  „Diagnose“. Die Formatierung ist rein und getestet.

---

## 12. PWA & Deployment (GitHub Pages)

- `vite.config.ts`: `base: '/reno-master/'`, `VitePWA({ strategies: 'injectManifest', srcDir: 'src', filename: 'sw.ts', registerType: 'prompt', manifest: {...}, injectManifest: { globPatterns: [...], maximumFileSizeToCacheInBytes: 6_000_000 } })`.
- `.github/workflows/deploy.yml`: bei Push auf `main`: `npm ci` → `npm run lint && npm run typecheck && npm run test:unit` → `npm run build` → `actions/upload-pages-artifact` (`dist`) → `actions/deploy-pages`. `dist/404.html` = Kopie von `index.html` (Sicherheitsnetz). Build-Zeit-Variablen: `VITE_APP_VERSION` = Git-SHA, `VITE_BUILD_DATE`.
- `.github/workflows/ci.yml`: bei PR: Lint, Typecheck, Unit, E2E gegen Emulator (`firebase emulators:exec --only auth,firestore,storage "npx playwright test"`).
- **Update-Ankündigung und APK müssen zusammenpassen.** `version.json` trägt die Adresse der APK **genau dieser Fassung** (`releases/download/v<version>/reno-master.apk`), nie `releases/latest/download/…`: Seite (~90 s) und APK-Release (~3 min) entstehen in zwei Workflows, und in der Lücke dazwischen ist „latest“ die vorige Fassung – das Telefon installiert dann die, die es schon hat, scheinbar erfolgreich. Zusätzlich wartet der Deploy vor dem Veröffentlichen bis zu sechs Minuten auf das Release (danach trotzdem, mit Warnung), und die App prüft vor „Installieren“ über die GitHub-API, ob es das Release schon gibt: fehlt es, bleibt der Knopf grau mit Hinweis und schaltet sich von selbst frei. Eine Prüfung, die nicht antwortet (offline, Rate-Limit), gilt als „weiß nicht“ und blockiert nichts.
- **Release Notes**: was im Update-Banner steht, kommt aus `RELEASE_NOTES.md` (`## <Version> – <Schlagzeile>`, darunter ein bis drei Absätze), nicht aus der Commit-Nachricht. Der Deploy erzeugt daraus `version.json` und `versions.json` (`tools/release-notes.mjs --current` bzw. ohne Schalter), der APK-Workflow denselben Text für das GitHub-Release (`--text`). Fehlt eine Version in der Datei, bleibt es bei der Commit-Nachricht. Geschrieben wird für den, der die App benutzt: ganze Sätze, was sich an der Bedienung ändert – keine Dateinamen, keine Testzahlen, kein Changelog.
- URL: `https://dathomas13.github.io/reno-master/`. Am S24: Chrome → Menü → "Zum Startbildschirm hinzufügen" / "App installieren".
- Firebase-Auth "Authorized domains": `dathomas13.github.io` eintragen (nur nötig für OAuth-Provider; bei E-Mail/Passwort nicht erforderlich, trotzdem eintragen).

---

## 13. Phase 2 – Android-APK (Capacitor)

Erst nach Abnahme von Phase 1 (M0–M7).
- `npm i @capacitor/core @capacitor/cli @capacitor/android`, `npx cap init "Reno Master" de.friedl.renomaster --web-dir dist`, `npx cap add android`. `capacitor.config.ts`: `server.androidScheme: 'https'`, `plugins.LocalNotifications`, `plugins.PushNotifications.presentationOptions`. `base` für den Capacitor-Build auf `/` setzen (Vite-Modus `native`: `base: process.env.CAP ? '/' : '/reno-master/'`).
- Plugins: Camera, Filesystem, LocalNotifications, PushNotifications, `@capacitor-mlkit/text-recognition`, Share, App, StatusBar, SplashScreen.
- **Eigenes Plugin `MediaStore`** (`android/app/src/main/java/de/friedl/renomaster/MediaStorePlugin.kt`, registriert in `MainActivity`), TS-Wrapper `src/platform/mediastore.ts`:
  - `listPhotos({ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', limit })` → `[{ uri, name, takenAt, width, height, bytes }]` (Query `MediaStore.Images.Media.EXTERNAL_CONTENT_URI`, Filter `DATE_TAKEN`, sortiert absteigend).
  - `getThumbnail({ uri, size })` → base64 (ContentResolver `loadThumbnail`).
  - `readImage({ uri, maxEdge })` → base64 JPEG (verkleinert, EXIF-Orientierung angewandt).
  - `openInGallery({ uri })` → `Intent.ACTION_VIEW`.
  - Berechtigung `READ_MEDIA_IMAGES` (API 33+) / `READ_EXTERNAL_STORAGE` (älter) über `@capacitor/core` Permissions-API.
- `platform/photos.ts` schaltet per `Capacitor.isNativePlatform()` zwischen Web-Input und MediaStore-Picker um; `sourceUri` wird gespeichert; "Original in Galerie öffnen" im Foto-Info.
- OCR: ML Kit aktiv; Gemini und Claude bleiben optional.
- Benachrichtigungen: LocalNotifications, vom Gerät geplant (Abschnitt 11). Push ist optional und braucht zusätzlich `google-services.json`.
- Build: `android.yml` (GitHub Actions, JDK 17, `./gradlew assembleDebug`) lädt `app-debug.apk` als Artifact hoch; Thomas installiert per Sideload. Release-Signatur später (Keystore als Secret).
- Auth/Firestore/Storage funktionieren im WebView unverändert (JS-SDK). `google-services.json` nur für den optionalen Push nötig, nicht für die Erinnerung.
- Danach: Repo privat stellen (Thomas), Pages-Deploy bleibt optional für die Laptop-Webapp (private Repos: Pages nur mit Pro/Student-Plan – Thomas hat den Student-Plan).

---

## 14. Meilensteine (Reihenfolge, Definition of Done, Aufteilung)

Jeder Meilenstein: eigener Branch + PR **oder** direkte Commits auf `main` (Thomas' Wahl im Dev-Chat; Default: Feature-Branches `feat/m1-viewer`, PR, Squash-Merge, Deploy von `main`). Nach jedem Meilenstein: kurzer Testbericht (was wurde wie geprüft) und Bitte an Thomas, am S24 zu testen. Emulatoren für alles, was Firebase braucht, bis das echte Projekt da ist.

| # | Meilenstein | Inhalt | Done wenn |
|---|---|---|---|
| **M0** | Grundgerüst | Vite+React+TS+Tailwind, Routing, AppShell (BottomNav/Sidebar), Theme, PWA (Manifest, SW, Update-Banner, Shortcuts), Firebase-Init mit Persistenz + Emulator-Umschaltung, Login-Screen, Auth-Guard, Sync-Badge, `users/{uid}`-Anlage, Seeds, ESLint/Prettier/vitest/Playwright, `deploy.yml`, `ci.yml`, `CLAUDE.md`, README | Deploy auf GitHub Pages läuft, App installierbar am S24, Login gegen Emulator und echtes Projekt funktioniert, offline startet die Shell |
| **M1** | 3D-Viewer | Port des Viewers (8.3), Modelle Ist/Soll aus JSON (`extract_scene_from_html.py`), Manifest, Modell-Umschalter, Räume-Overlay (`build_rooms.py`, Tabelle 9.4), RoomPanel (Zähler erst ab M6 gefüllt), `tools/model/*` + README-MODELL.md | Modell sieht am S24 aus wie `Haus_3D.html` (Screenshots vergleichen), Touch-Steuerung identisch, Wechsel Ist/Soll < 1 s, offline nutzbar |
| **M2** | Bautagebuch | Liste/Detail/Editor (8.2), Foto-Pipeline (Resize, Thumb, EXIF), Outbox + Sync (7), Lightbox, Entwürfe, Löschen | Eintrag mit 5 Fotos offline anlegen → online gehen → alles in Firestore/Storage; Thumbnails offline sichtbar; Nachtrag für vergangenes Datum |
| **M3** | Datenübernahme | Einmalige Übernahme der Altdaten (Bautagebuch, Aufgaben, Kontakte, Belege) in das echte Projekt; das Werkzeug dafür wurde danach wieder entfernt | Einträge, Fotos, Aufgaben, Kontakte und Kosten-Belege in der App sichtbar |
| **M4** | Kosten | Liste/Übersicht/Editor (8.5), Belegaufnahme, OCR-Abstraktion mit Claude-Engine + `parseReceiptText` (ML-Kit-Engine als Stub, der `isAvailable()=false` liefert bis Phase 2), CSV-Export | Beleg fotografieren → mit Claude-Key Felder vorbefüllt; ohne Key manuelle Eingabe; Summen/Charts stimmen (Unit-Test) |
| **M5** | Pläne | SVG-Generator, Plan-Liste/Viewer, Upload (PDF/Bild), pdfjs, Offline-Schalter | Original-PDF hochladen, offline öffnen; SVG-Grundrisse zeigen Räume |
| **M6** | Aufgaben, Kontakte, Raum-Verknüpfung | 8.6, 8.7, Raumfilter in allen Listen, RoomPanel-Zähler + Links, Raum-Auswahl in allen Editoren | Tippen auf Raum im 3D zeigt zugehörige Einträge/Fotos/Kosten/Aufgaben |
| **M7** | Erinnerung & Feinschliff | Cloud Function + FCM (12), Einstellungen komplett (8.8), Dashboard komplett (8.1), Desktop-Layout-Politur, Performance (Lighthouse PWA ≥ 90), Accessibility-Basics | Push kommt um die eingestellte Zeit, wenn kein Eintrag; alle Screens auf 360 px und 1280 px sauber |
| **M8** | Android-APK | Abschnitt 13 | APK installiert, Galerie-Picker zeigt Fotos des Tages, ML Kit liest Beleg offline, lokale Erinnerung, Original-Foto öffnen |

**Empfohlene Sub-Agenten-Aufteilung im Dev-Chat:** M0 sequenziell (Basis). Danach parallel: Agent A = M1 (Viewer, reines Frontend + Python-Tools), Agent B = M2 (Tagebuch + Offline-Infrastruktur). M3 nach M2. M4/M5/M6 parallel (unabhängige Module, gemeinsame Basis aus M0/M2). M7 danach. Jeder Sub-Agent bekommt diesen Plan + den relevanten Abschnitt + die Datei-Konventionen; der Hauptagent reviewt PRs (`/code-review`), führt Tests aus und merged.

---

## 15. Verifikation / Tests

- **Unit (vitest):** `parseReceiptText` (≥ 8 Fälle), `lib/date` (Berlin-Zeitzone, Wochen-Gruppierung), `lib/money` (de-DE-Parsing "1.234,56"), Outbox-Statusmaschine (mit fake-indexeddb), Raum-Geometrie (Punkt-in-Polygon, Fläche), Kosten-Aggregation, Szenen-Schema-Validierung (zod) gegen `public/models/ist.json`, Import-Mapping-Funktionen.
- **E2E (Playwright, Emulatoren):** Login → Tagebuch-Eintrag mit Foto (Fixture-JPG mit EXIF) offline (`context.setOffline(true)`) anlegen → online → Upload abgeschlossen; Kosten anlegen + Summe; Aufgabe anlegen/erledigen; Kontakt anlegen; 3D-Route rendert Canvas und Layer-Buttons; Umschalten Ist/Soll; Plan-Upload; Desktop-Viewport-Smoke. Projekte: `mobile` (viewport 360×780, deviceScaleFactor 3, isMobile, hasTouch) und `desktop` (1280×800).
- **Manuell durch Thomas (Checkliste im PR-Text):** Installation am S24, Flugmodus-Test, Foto aus Galerie, Kamera, Beleg-Auslesen, Push-Erinnerung, Laptop-Ansicht.
- **Build-Checks:** `npm run lint`, `npm run typecheck`, `npm run build` (Bundle-Größe: three.js separat gechunkt, Hauptbundle < 400 KB gz), Lighthouse PWA-Kategorie ≥ 90 (installierbar, offline).
- Firebase Emulator: `firebase.json` mit `emulators: { auth: 9099, firestore: 8080, storage: 9199, functions: 5001, ui: true }`; `VITE_USE_EMULATORS=1` verbindet die App (`connectAuthEmulator` etc.). Test-Nutzer werden beim Emulator-Start per Script angelegt.

---

## 16. Konventionen

- UI-Texte Deutsch (Sie-Form vermeiden, direkte Kurzlabels: "Speichern", "Neuer Eintrag"). Datumsformat `DD.MM.YYYY`, Wochentag abgekürzt (`Sa, 13.09.2026`), Beträge `1.234,56 €`.
- TypeScript strict, keine `any`. Firestore-Zugriffe nur über `src/data/*` (typed converters). Keine Firebase-Aufrufe in Komponenten.
- Komponenten funktional, Hooks, kein globaler Store außer `AuthContext`, `SettingsContext`, `SyncContext`.
- Alle Netzwerkzugriffe müssen offline sauber scheitern (try/catch + Hinweis), nie Endlos-Spinner.
- Commits: Conventional Commits (`feat(diary): …`). Keine Modell-/Sitzungs-IDs in Commits.
- Secrets nie ins Repo; `.env.example` dokumentiert alle Variablen (`VITE_FIREBASE_*`, `VITE_VAPID_KEY`, `VITE_USE_EMULATORS`).
- `CLAUDE.md` im Repo pflegen: Befehle (`npm run dev`, `dev:emu`, `test`, `e2e`, `build`, `deploy`), wie Modelle getauscht werden (Verweis auf `tools/model/README-MODELL.md`), wie der Import läuft, Architektur-Kurzfassung.

---

## 17. Annahmen und bewusst offen gelassene Punkte

- Erinnerungs-Uhrzeit: Thomas wollte "andere Uhrzeit", hat keine genannt → **konfigurierbar, Default 20:00**.
- Raumnamen mit "?" (Tabelle 9.4) sind Annahmen aus der Wandtabelle; der Modell-Agent oder Thomas korrigiert sie in `rooms_ist.py`.
- Soll-Modell existiert noch nicht → Platzhalter = Ist; die App ist dafür vorbereitet.
- Firebase Storage/Functions setzen den Blaze-Plan voraus (Kreditkarte, Free-Tier bleibt) – Thomas wurde darauf hingewiesen; Budget-Alarm einrichten.
- Claude-Kosten trägt Thomas über seinen eigenen API-Key; Default-Modell `claude-opus-5`, umschaltbar auf `claude-sonnet-5`.
- Bis M8 gibt es keine Galerie-Vorschläge "Fotos von heute" (technisch in der PWA nicht möglich); Ersatz: EXIF-Datumsprüfung mit Warnung.

---

## 18. Übergabe an den Entwicklungs-Chat

**Schritt 0 (noch in dieser Sitzung):** Dieses Dokument wird als `PLAN.md` auf dem Branch
`claude/sweet-franklin-t348jz` im Repo `dathomas13/reno-master` committet und gepusht. Damit liegt es dauerhaft
im Repo und jeder neue Chat/Agent hat es automatisch vor sich.

**Startprompt für den neuen Chat (Opus/Sonnet, mit Sub-Agenten):**

> Lies `PLAN.md` im Repo `dathomas13/reno-master` (Branch `claude/sweet-franklin-t348jz`) vollständig. Das ist die
> abgestimmte Spezifikation für die App "Reno Master" – alle Entscheidungen darin sind verbindlich und nicht mehr
> zu hinterfragen. Fordere zuerst die in Abschnitt 2 gelisteten Dinge bei mir an (ZIP mit dem 3D-Modell, das
> Nordansicht-Foto, Firebase-Web-Config, Service-Account-JSON, die beiden E-Mail-Adressen) – gesammelt in einer
> Nachricht. Beginne parallel mit Meilenstein M0 (Abschnitt 14) und arbeite die Meilensteine der Reihe nach ab,
> mit Sub-Agenten gemäß der Aufteilung am Ende von Abschnitt 14. Nach jedem Meilenstein: Testbericht und Bitte
> um meinen Test am Handy.

**Was der neue Chat nicht aus dem Plan holen kann und daher von Thomas braucht:** die Dateien und Zugänge aus
Abschnitt 2. Alles andere (Repo, Modellformat, Raumliste) ist entweder
im Plan dokumentiert oder über die Connectoren erreichbar.
