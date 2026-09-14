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

1. Projekt anlegen, Blaze-Tarif aktivieren (nötig für Storage und Functions), Budgetalarm setzen.
2. **Authentication**: E-Mail/Passwort aktivieren, die zwei Konten anlegen.
3. **Firestore** und **Storage** in `europe-west3` anlegen.
4. **Cloud Messaging**: Web-Push-Zertifikat erzeugen, den öffentlichen Schlüssel als
   `VITE_VAPID_KEY` eintragen.
5. Die beiden E-Mail-Adressen in `firestore.rules` und `storage.rules` eintragen,
   Projekt-ID in `.firebaserc`, dann:

```bash
firebase deploy --only firestore,storage
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

1. **Firebase-Projekt** anlegen, Tarif **Blaze** aktivieren (für Storage und Functions
   nötig, die Nutzung bleibt im Gratis-Kontingent), unter *Abrechnung* einen Budgetalarm
   auf 1 € setzen.
2. **Authentication** → *Sign-in method* → **E-Mail/Passwort** aktivieren. Unter *Users*
   die zwei Konten anlegen. Unter *Settings* → *User actions* die Selbstregistrierung
   abschalten, sonst könnte sich jeder mit dem öffentlichen API-Key ein Konto anlegen.
   Unter *Settings* → *Authorized domains* `dathomas13.github.io` ergänzen.
3. **Firestore Database** anlegen, Region `europe-west3`, Production mode.
4. **Storage** anlegen, gleiche Region.
5. **Cloud Messaging** → *Web Push certificates* → Schlüsselpaar erzeugen, den
   öffentlichen Schlüssel notieren (wird erst für die Abend-Erinnerung gebraucht).
6. **Projekteinstellungen** → *Meine Apps* → **Web-App registrieren**. Die sechs Werte aus
   dem Config-Objekt notieren.
7. **Sicherheitsregeln** aus `firestore.rules` und `storage.rules` in die jeweiligen
   *Rules*-Editoren der Konsole kopieren und die beiden E-Mail-Adressen einsetzen. Die
   Adressen bleiben absichtlich aus dem öffentlichen Repo heraus. Achtung: wer später
   `firebase deploy --only firestore,storage` ausführt, überschreibt die Konsolen-Version
   mit der aus dem Repo.
8. **GitHub** → *Settings* → *Secrets and variables* → *Actions* → Reiter **Variables** →
   die sieben `VITE_...`-Werte als Repository variables anlegen (siehe `.env.example`).
   Sie sind nicht geheim, sie identifizieren nur das Projekt.
9. Im Reiter **Actions** den letzten Workflow erneut ausführen (*Re-run all jobs*). Danach
   läuft die App mit dem Projekt.

**Zusammengesetzte Indizes:** Beim ersten Aufruf einer gefilterten Liste meldet Firestore
in der Browser-Konsole einen Link „Create index“. Einmal anklicken genügt, die nötigen
Indizes stehen zusätzlich in `firestore.indexes.json`.

**Was ohne CLI nicht geht:** Cloud Functions lassen sich nur mit der Firebase-CLI
veröffentlichen. Bis dahin gibt es keine Abend-Erinnerung; alles andere funktioniert.

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

### Updates

Jeder Push baut beides: die Web-Version auf GitHub Pages und eine APK, die als Release
veröffentlicht wird. Die Seite legt dabei `version.json` mit dem Commit ab, aus dem sie
gebaut wurde. Die App fragt diese Datei beim Start und bei jeder Rückkehr in den
Vordergrund ab und zeigt ein Banner, sobald der veröffentlichte Commit ein anderer ist als
der laufende.

- **Im Browser** genügt „Neu laden“, der Service Worker tauscht die Dateien aus.
- **In der App** führt „Laden“ auf die neueste APK unter
  `releases/latest/download/reno-master.apk`. Android zeigt dann seinen Installationsdialog.
  Eine per Sideload installierte App darf sich nicht still selbst überschreiben, dieser
  eine Tipp bleibt.

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
