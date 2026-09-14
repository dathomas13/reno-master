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

Das 3D-Modell lässt sich ohne Installation prüfen: siehe Abschnitt „Verifikation“ in
`tools/model/README-MODELL.md`.
