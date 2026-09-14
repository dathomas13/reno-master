# Reno Master – Kurzanleitung für Agenten

Renovierungs-App für das Haus Schlesierstraße 31. Mobil zuerst (Galaxy S24), offline-fähig,
PWA auf GitHub Pages, später APK über Capacitor. UI-Texte auf Deutsch, Code auf Englisch.

**Die verbindliche Spezifikation steht in `PLAN.md`.** Wer hier etwas ändert, liest die
betreffenden Abschnitte dort zuerst.

## Befehle

```bash
npm install            # einmalig
npm run dev            # Entwicklung gegen das echte Firebase-Projekt
npm run dev:emu        # Entwicklung gegen die lokalen Emulatoren
npm run emulators      # Emulatoren starten (auth, firestore, storage)
npm run lint
npm run test           # Unit-Tests (vitest)
npm run e2e            # Playwright, baut und startet die App selbst
npm run build          # Produktionsbuild nach dist/
```

Modell und Pläne neu erzeugen (Python, ohne Abhängigkeiten außer für `build_scene.py`):

```bash
python3 tools/model/build_rooms.py
python3 tools/model/build_plans_svg.py
python3 tools/model/make_manifest.py
```

Wenn kein npm-Registry erreichbar ist (abgeschottete Umgebung), greifen zwei Ersatzprüfungen:

```bash
npm run check:offline
# entspricht:
node tools/verify/typecheck-without-npm.mjs   # Syntax + alle projektinternen Importe
node tools/verify/run-tests-without-npm.mjs   # die Unit-Tests ohne externe Pakete
```

Sie ersetzen `npm run build` nicht, finden aber Tippfehler, kaputte Importe und
Logikfehler. Das 3D-Modell lässt sich zusätzlich mit dem Chromium-Harness prüfen
(`tools/model/_verify`, siehe tools/model/README-MODELL.md).

## Architektur in drei Sätzen

Firestore mit persistentem lokalem Cache ist die Datenbasis; Lesen läuft immer über
`onSnapshot`, Schreiben geht offline in die Firestore-Warteschlange. Dateien (Fotos,
Belege, Pläne) kann Storage nicht offline puffern, deshalb gehen sie über die eigene
Outbox in `src/offline/outbox.ts`. Das 3D-Modell und die 2D-Pläne sind generierte Dateien
unter `public/models` und `public/plans`, erzeugt aus `tools/model`.

## Stand (14.09.2026)

Fertig und geprüft:

- Modell-Pipeline: `public/models/ist.json` (132 Bauteile), Räume (40), Grundriss-SVGs,
  Manifest. Im Chromium-Harness gerendert, Raumauswahl getestet.
- App-Code vollständig geschrieben: Shell, Login, Start, Tagebuch, 3D, Pläne, Kosten,
  Aufgaben, Kontakte, Einstellungen, Service Worker, Cloud Function.
- 119 Unit-Tests (Beträge, Datum, Belegparser, Claude-Antwortprüfung, Kostenauswertung).
- Syntax und alle projektinternen Importe geprüft.

Offen, weil in dieser Umgebung keine npm-Registry erreichbar war:

1. `npm install` und danach einmal `npm run typecheck`, `npm run lint`, `npm run build`.
   Erwartbar sind kleinere Typkorrekturen an den Stellen, wo React-, Firebase- oder
   three.js-Typen genau geprüft werden – die Logik selbst ist getestet.
2. Firebase-Projekt anlegen und `.env` füllen (siehe README).
3. `public/img/nordansicht.jpg` ergänzen.
4. Notion-Import ausführen (`tools/import`).
5. Danach Meilenstein M8: Capacitor-APK, MediaStore-Plugin, ML Kit.

## Regeln

- Komponenten sprechen nie direkt mit Firestore, sondern über `src/data/*`.
- Jede Netzwerkoperation muss offline sauber scheitern, nie in einen Endlos-Spinner laufen.
- Räume werden über ihre `id` verknüpft (`roomIds`). Eine vergebene Raum-id nie umbenennen.
- Keine Geheimnisse ins Repo: Service-Account-JSON, `google-services.json`, `.env` sind gitignored.
- Der Claude API-Key liegt nur im localStorage des Geräts, nie in Firestore.
- Vor dem Push: `npm run lint`, `npm run test`, `npm run build`.
