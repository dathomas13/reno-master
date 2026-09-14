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

Am Ende des Laufs hängt unter *Artifacts* die Datei `reno-master-debug-apk`. Herunterladen,
auf das Handy kopieren, Installation aus unbekannter Quelle erlauben, installieren. Es ist
ein Debug-Build, signiert mit dem Standard-Debug-Schlüssel: gut zum Ausprobieren, nicht für
den Play Store.

Das Verzeichnis `android/` liegt bewusst **nicht** im Repo. Capacitor erzeugt es im Lauf neu
aus `capacitor.config.ts` und den installierten Plugins, damit es nie zu den Abhängigkeiten
aus dem Takt gerät. `tools/android/patch-android.mjs` trägt danach unsere Berechtigungen,
den App-Namen und den dunklen Fensterhintergrund ein. Sobald eine native Datei von Hand
bearbeitet werden muss, kann `android/` committet werden; der Workflow überspringt dann das
Erzeugen und synchronisiert nur noch.

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
