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

Live unter <https://dathomas13.github.io/reno-master/>, gebaut und veröffentlicht von
GitHub Actions aus dem Branch `claude/sweet-franklin-t348jz`.

Steht:

- Firebase-Projekt `reno-master-307f7` in `europe-west3`, Anmeldung mit beiden Konten,
  Selbstregistrierung abgeschaltet, Regeln in der Konsole veröffentlicht.
- Die sieben `VITE_`-Werte liegen als GitHub *Repository variables* und stecken im Bundle.
- Modell-Pipeline, alle Bildschirme, Service Worker, 119 Unit-Tests.

Offen:

1. **Blaze-Tarif.** Ohne ihn gibt es kein Cloud Storage, also keine Fotos und keine Belege,
   und keine Cloud Functions, also keine Abend-Erinnerung. Text-Einträge, Kosten, Aufgaben,
   Kontakte, 3D und Pläne laufen ohne.
2. **Cloud Function veröffentlichen** (`cd functions && npm install && npm run deploy`),
   sobald eine Kommandozeile mit Firebase-CLI verfügbar ist.
3. **Notion-Import** (`tools/import`), braucht `firebase-admin` und einen Service-Account.
4. `public/img/nordansicht.jpg` ergänzen.
5. `package-lock.json` erzeugen und committen, dann in beiden Workflows `npm install`
   wieder durch `npm ci` ersetzen.
6. **APK**: Basis und Galerie-Zugriff stehen (Capacitor 6, Workflow *Android APK*,
   Debug-Build als Artefakt, eigenes Plugin `plugins/mediastore` für die Fotos eines
   Tages). Offen sind ML Kit für das Beleg-Auslesen auf dem Gerät, die lokale
   Abend-Erinnerung und Push. Push braucht zusätzlich `google-services.json` und den
   google-services-Eintrag in Gradle.

**Achtung bei den Regeln:** `firestore.rules` und `storage.rules` im Repo tragen
Platzhalter statt der echten Adressen. Die gültige Fassung steht in der Firebase-Konsole.
Wer `firebase deploy --only firestore,storage` ausführt, überschreibt sie mit den
Platzhaltern und sperrt beide Konten aus. Vorher die Adressen einsetzen, klein geschrieben.

## Regeln

- Komponenten sprechen nie direkt mit Firestore, sondern über `src/data/*`.
- Jede Netzwerkoperation muss offline sauber scheitern, nie in einen Endlos-Spinner laufen.
- Räume werden über ihre `id` verknüpft (`roomIds`). Eine vergebene Raum-id nie umbenennen.
- Keine Geheimnisse ins Repo: Service-Account-JSON, `google-services.json`, `.env` sind gitignored.
- Der Claude API-Key liegt nur im localStorage des Geräts, nie in Firestore.
- Vor dem Push: `npm run lint`, `npm run test`, `npm run build`.
