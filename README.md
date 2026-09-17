# Reno Master

Begleit-App für die Kernsanierung der Schlesierstraße 31 in Tirschenreuth: 3D-Modell des
Hauses, Bautagebuch mit Fotos, 2D-Pläne, Kostenerfassung mit Belegauslesen, Aufgaben und
Kontakte. Läuft am Handy als installierbare Web-App, offline nutzbar, später als Android-APK.

## Schnellstart

```bash
npm install
cp .env.example .env      # Firebase-Web-Config eintragen
npm run dev
```

Das Foto der Nordansicht gehört als `public/img/nordansicht.jpg` ins Repo (etwa 1600 px
breit). Fehlt es, blendet die Startseite den Bereich einfach aus.

Ohne Firebase-Projekt startet die App, zeigt aber nur den Login. Für die Entwicklung ohne
echtes Projekt:

```bash
npm run emulators     # Terminal 1
npm run dev:emu       # Terminal 2
```

## Einrichtung des Firebase-Projekts

1. Projekt anlegen. Der Blaze-Tarif ist nur für die Cloud Functions nötig; die Dateien
   liegen auf Cloudflare R2 (siehe `worker/README.md`).
2. **Authentication**: E-Mail/Passwort aktivieren, die zwei Konten anlegen.
3. **Firestore** in `europe-west3` anlegen.
4. **Cloud Messaging**: Web-Push-Zertifikat erzeugen, den öffentlichen Schlüssel als
   `VITE_VAPID_KEY` eintragen.
5. Die beiden E-Mail-Adressen in `firestore.rules` eintragen,
   Projekt-ID in `.firebaserc`, dann:

```bash
firebase deploy --only firestore
cd functions && npm install && npm run deploy
```

## Veröffentlichen

Ein Push auf `main` baut und veröffentlicht über GitHub Actions nach
<https://dathomas13.github.io/reno-master/>. Die Firebase-Werte kommen aus den
*Repository variables* (Settings → Secrets and variables → Actions → Variables).

Am Handy: Seite in Chrome öffnen → Menü → „Zum Startbildschirm hinzufügen“.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/modules/` | die Bildschirme: Start, Tagebuch, 3D, Pläne, Kosten, Aufgaben, Kontakte, Einstellungen |
| `src/data/` | Dokumenttypen, Repositories, Firestore-Hooks, Seed-Daten |
| `src/firebase/` | Initialisierung, Anmeldung, typisierter Datenbankzugriff |
| `src/offline/` | Upload-Warteschlange und Datei-URLs, alles was offline funktionieren muss |
| `src/platform/` | Web gegen nativ: Fotoauswahl, Benachrichtigungen, Belegauslesen |
| `public/models/` | erzeugtes 3D-Modell (Bestand und Zielzustand) samt Räumen |
| `public/plans/` | erzeugte 2D-Grundrisse als SVG |
| `tools/model/` | die Modell-Toolchain, siehe [README-MODELL.md](tools/model/README-MODELL.md) |
| `functions/` | Cloud Function für die Abend-Erinnerung |

Die vollständige Spezifikation liegt in [PLAN.md](PLAN.md).

## Tests

```bash
npm run test    # Unit: Beträge, Datum, Belegparser, Claude-Antwortprüfung
npm run e2e     # Playwright: Start, Modelldateien, Grundrisse
```

Ohne erreichbare npm-Registry:

```bash
npm run check:offline   # Syntax, projektinterne Importe und die Unit-Tests
```

Das 3D-Modell lässt sich ebenfalls ohne Installation prüfen: siehe Abschnitt
„Verifikation“ in `tools/model/README-MODELL.md`.

## Einrichtung ohne lokale Entwicklungsumgebung

Alles, was für den Betrieb nötig ist, geht über den Browser. Gebaut und veröffentlicht
wird von GitHub Actions, die Firebase-Einrichtung passiert in der Firebase-Konsole.

1. **Firebase-Projekt** anlegen. Der Tarif **Blaze** wird nur für die Cloud Functions
   gebraucht (Abend-Erinnerung); Fotos und Belege liegen auf Cloudflare R2, dafür genügt
   der Gratis-Tarif. Wer Blaze aktiviert, setzt unter *Abrechnung* einen Budgetalarm auf 1 €.
2. **Authentication** → *Sign-in method* → **E-Mail/Passwort** aktivieren. Unter *Users*
   die zwei Konten anlegen. Unter *Settings* → *User actions* die Selbstregistrierung
   abschalten, sonst könnte sich jeder mit dem öffentlichen API-Key ein Konto anlegen.
   Unter *Settings* → *Authorized domains* `dathomas13.github.io` ergänzen.
3. **Firestore Database** anlegen, Region `europe-west3`, Production mode.
4. **Dateispeicher**: nicht bei Firebase, sondern bei Cloudflare – die Einrichtung steht
   in `worker/README.md`.
5. **Cloud Messaging** → *Web Push certificates* → Schlüsselpaar erzeugen, den
   öffentlichen Schlüssel notieren (wird erst für die Abend-Erinnerung gebraucht).
6. **Projekteinstellungen** → *Meine Apps* → **Web-App registrieren**. Die sechs Werte aus
   dem Config-Objekt notieren.
7. **Sicherheitsregeln** aus `firestore.rules` in den
   *Rules*-Editor der Konsole kopieren und die beiden E-Mail-Adressen einsetzen. Die
   Adressen bleiben absichtlich aus dem öffentlichen Repo heraus. Achtung: wer später
   `firebase deploy --only firestore` ausführt, überschreibt die Konsolen-Version
   mit der aus dem Repo.
8. **GitHub** → *Settings* → *Secrets and variables* → *Actions* → Reiter **Variables** →
   die `VITE_...`-Werte als Repository variables anlegen, inklusive `VITE_FILES_URL` (siehe `.env.example`).
   Sie sind nicht geheim, sie identifizieren nur das Projekt.
9. Im Reiter **Actions** den letzten Workflow erneut ausführen (*Re-run all jobs*). Danach
   läuft die App mit dem Projekt.

**Zusammengesetzte Indizes:** Beim ersten Aufruf einer gefilterten Liste meldet Firestore
in der Browser-Konsole einen Link „Create index“. Einmal anklicken genügt, die nötigen
Indizes stehen zusätzlich in `firestore.indexes.json`.

**Was ohne CLI nicht geht:** Cloud Functions lassen sich nur mit der Firebase-CLI
veröffentlichen. Bis dahin gibt es keine Abend-Erinnerung; alles andere funktioniert.

## Dateispeicher: Cloudflare R2

Fotos, Belege und Pläne liegen **nicht** bei Firebase, sondern in einem privaten R2-Bucket
bei Cloudflare. Firebases kostenloses Kontingent gilt nur für Buckets in den USA; dieses
Projekt liegt in Frankfurt und würde ab dem ersten Byte abgerechnet. R2 ist bis 10 GB frei
und berechnet keinen Datenverkehr.

Dazwischen steht ein kleiner Worker (`worker/reno-files.js`), der das Firebase-Anmeldeticket
prüft und zum Anzeigen Adressen ausgibt, die eine Stunde gelten. Deshalb speichert die App
offline die Bilddaten selbst statt der Adressen — eine gemerkte Adresse wäre am nächsten Tag
wertlos. Einrichtung (alles im Browser) und Grenzen: [worker/README.md](worker/README.md).

Firebase bleibt für Anmeldung und Firestore. `storage.rules` gibt es nicht mehr; die
Zugriffsregeln für Dateien stehen jetzt im Worker.

## Fotos, Originale und Archiv

Hochgeladen werden eine verkleinerte Fassung (1600 px) und ein Vorschaubild; das Original
bleibt in der Galerie. Für einzelne Aufnahmen, die später in voller Auflösung gebraucht
werden, gibt es über der Fotoleiste den Schalter **Original sichern** — dann geht die
unveränderte Datei zusätzlich in den Speicher und die Vollbildansicht bietet „Original
laden". Der Schalter ist aus, weil ein Original etwa das Zehnfache wiegt.

Wichtig zu wissen: die gespeicherte `content://`-Adresse des Galeriebilds ist eine
laufende Nummer in der Mediendatenbank *dieses* Geräts. Nach einem Handywechsel zeigt sie
ins Leere. Nur das gesicherte Original überlebt den Wechsel.

**Archiv, zwei Wege.** In der App: Einstellungen → *Export in einen Ordner*. Android fragt
nach einem Zielordner, dann schreibt die App das Tagebuch als einzelne Dateien hinein —
die Fotos dieses Geräts in voller Auflösung direkt aus der Galerie, alles andere in der
Fassung, die in der Cloud liegt. Kein Archiv, das erst entstehen muss, also auch kein
Platz für eine zweite Kopie nötig; ein zweiter Lauf schreibt nur, was noch fehlt
(Merkliste in `daten/.export-index.json`). Details in
[plugins/fileexport/README.md](plugins/fileexport/README.md).

Am Laptop: Einstellungen → *Archiv exportieren* packt alles in eine ZIP-Datei — Fotos nach
Tagen sortiert, das Tagebuch als lesbaren Text, die Daten als JSON. Der ZIP-Schreiber liegt
als `src/lib/zip.ts` im Repo (ohne Abhängigkeit, ohne Kompression — JPEGs lassen sich
ohnehin nicht weiter packen) und schreibt ZIP64, sobald ein Archiv über 4 GB geht.
Geschrieben wird direkt in eine Datei, die im Speicherdialog ausgewählt wird; das geht nur
im Desktop-Browser. Am Handy müsste das Archiv komplett in den Arbeitsspeicher, dafür
reicht es bei dieser Größe nicht — die App sagt das dort auch.

## Android-App (APK)

Die APK ist dieselbe Web-App in einem Capacitor-WebView. Gebaut wird sie von GitHub
Actions, ein lokales Android Studio ist dafür nicht nötig.

```
Actions → "Android APK" → Run workflow
```

Am Ende des Laufs hängt unter *Artifacts* die Datei `reno-master-apk`, und dieselbe APK
liegt als `reno-master.apk` am Release des Laufs. Herunterladen, Installation aus unbekannter
Quelle erlauben, installieren.

Das Verzeichnis `android/` liegt bewusst **nicht** im Repo. Capacitor erzeugt es im Lauf neu
aus `capacitor.config.ts` und den installierten Plugins, damit es nie zu den Abhängigkeiten
aus dem Takt gerät. `tools/android/patch-android.mjs` trägt danach unsere Berechtigungen,
den App-Namen und den dunklen Fensterhintergrund ein. Sobald eine native Datei von Hand
bearbeitet werden muss, kann `android/` committet werden; der Workflow überspringt dann das
Erzeugen und synchronisiert nur noch.

### Versionsnummern

Die Version steht in der **`package.json`** und wird von Hand erhöht — sie ist die einzige
Quelle. Das Web-Bundle, der `versionCode` der APK und `version.json` leiten sich daraus ab,
deshalb kann die App vergleichen, was sie ausführt, mit dem, was veröffentlicht ist.

`0.17.0` ist der Stand, bei dem umgestellt wurde: bis dahin waren 16 Fassungen draußen, das
war die siebzehnte. Danach gilt die übliche Lesart:

- letzte Stelle: Fehlerbehebung (`0.17.1`)
- mittlere Stelle: neue Funktion (`0.18.0`)
- erste Stelle: wenn die App erwachsen ist (`1.0.0`)

Zum Vergleichen wird daraus eine Zahl (`src/lib/version.ts`): `0.17.0` → `17000`. „Neuer"
heißt größer, ein Rückschritt ist damit nicht möglich. Wer die Version zu erhöhen vergisst,
merkt es im Android-Workflow: der bricht ab, wenn der Tag schon für einen anderen Stand
existiert.

### Updates

Jeder Push baut beides: die Web-Version auf GitHub Pages und eine APK, die als Release
veröffentlicht wird. Die Seite legt dabei `version.json` mit dem Commit ab, aus dem sie
gebaut wurde. Die App fragt diese Datei beim Start und bei jeder Rückkehr in den
Vordergrund ab und zeigt ein Banner, sobald der veröffentlichte Commit ein anderer ist als
der laufende.

- **Im Browser** genügt „Neu laden“, der Service Worker tauscht die Dateien aus.
Das Banner nennt die verfügbare Version und die laufende; ein Tipp darauf klappt die
Änderungen aus — und zwar **alle seit der installierten Fassung**. Der Text dafür steht in
[RELEASE_NOTES.md](RELEASE_NOTES.md) und wird für den geschrieben, der die App benutzt;
nur wo eine Version dort fehlt, springt die Commit-Nachricht ein. Wer von 0.9.36 auf
0.17.1 springt, liest auch, was 0.17.0 gebracht hat; drin ist es ja. Die Liste steht als
`versions.json` neben der `version.json` und wird beim Deploy aus den Tags erzeugt
(`tools/release-notes.mjs`), damit sie auch dann noch funktioniert, wenn das Repo einmal
privat wird.

- **In der App** lädt „Installieren“ die neue APK innerhalb der App herunter — mit
  eigenem Fortschrittsbalken, ohne Umweg über den Browser — und übergibt sie an Androids
  Installer. Dessen Rückfrage („App aktualisieren?") bleibt: eine per Sideload
  installierte App darf sich nicht ungefragt selbst ersetzen. Beim ersten Mal fragt
  Android zusätzlich nach der Erlaubnis „Apps aus dieser Quelle installieren"; das Banner
  führt direkt auf die passende Systemseite. Details in
  [plugins/appupdate/README.md](plugins/appupdate/README.md).

### Signaturschlüssel

Android nimmt eine neue APK nur über einer bereits installierten an, wenn beide mit
demselben Schlüssel signiert sind. Der Workflow kann das, sobald vier Secrets hinterlegt
sind (*Settings* → *Secrets and variables* → *Actions* → **Secrets**):

| Secret | Inhalt |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | der Keystore (`.jks`) als Base64, eine Zeile |
| `ANDROID_KEYSTORE_PASSWORD` | Passwort des Keystores |
| `ANDROID_KEY_ALIAS` | Alias des Schlüssels, Vorgabe `reno` |
| `ANDROID_KEY_PASSWORD` | Passwort des Schlüssels, Vorgabe = Keystore-Passwort |

Fehlt `ANDROID_KEYSTORE_BASE64`, baut der Workflow wie bisher eine Debug-APK — nichts
geht kaputt, nur das Update über die alte Fassung bleibt dann aus.

Einen Keystore erzeugt man einmalig mit dem JDK:

```bash
keytool -genkeypair -v -keystore reno-master.jks -alias reno \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Reno Master, O=Privat, C=DE"
base64 -w0 reno-master.jks      # dieser Text kommt in das Secret
```

**Den `.jks` gut aufbewahren und niemals ins Repo legen.** Geht er verloren, lässt sich
keine Aktualisierung mehr über die installierte App legen; dann hilft nur deinstallieren
und neu installieren.

Der Workflow schreibt den Schlüssel im Lauf nach `android/keystore.jks` und legt
`android/keystore.properties` daneben; `tools/android/patch-android.mjs` hat den passenden
`signingConfig` schon in `app/build.gradle` eingetragen. Die Versionsnummer der App ist die
Nummer des CI-Laufs (`versionCode`), sie wächst dadurch mit jedem Build.

**Solange kein Schlüssel hinterlegt ist:** Jeder CI-Lauf signiert mit einem anderen
Wegwerf-Schlüssel, deshalb verweigert Android die Installation über die alte Fassung
(„App nicht installiert“). Bis dahin die alte App vorher deinstallieren. Die Daten liegen
in Firestore und sind davon nicht betroffen; verloren gehen nur lokale Einstellungen und
noch nicht hochgeladene Dateien.

### App-Icon

Die Zeichnung liegt als `tools/icon/icon.svg`: das Haus von der Giebelseite mit der echten
Dachneigung von 36°, entlang des Firsts geteilt — links der Bestand, rechts der Zielzustand
in der Akzentfarbe, die Tür auf der Naht gehört beiden Hälften. Nach einer Änderung:

```bash
npm run icons
```

Das erzeugt die PWA-Icons in `public/img/` und die Launcher-Icons in `tools/icon/android/`
(alle Bildschirmdichten, dazu das Vordergrundbild für Androids adaptives Icon). Die PNGs
sind committet, der CI-Lauf kopiert sie nur noch; er bricht ab, wenn sie nicht im
erzeugten Projekt landen. Zum Rendern braucht `npm run icons` ein Chromium auf der
Maschine — notfalls den Pfad über `CHROMIUM=` vorgeben.

### Eigenes Plugin

`plugins/mediastore` liest die Fotogalerie nach Aufnahmedatum, damit das Bautagebuch beim
Eintrag vom 4. September die Bilder dieses Tages vorschlagen kann und sich merkt, wo das
Original liegt. Es hängt als `file:`-Abhängigkeit in der `package.json`, Capacitor findet
es beim Sync von selbst. Details in [plugins/mediastore/README.md](plugins/mediastore/README.md).

Lokal, falls doch einmal ein Rechner mit Android SDK da ist:

```bash
npm run android:sync     # Web-Build mit base=/ und cap sync
npm run android:open     # Android Studio
```
