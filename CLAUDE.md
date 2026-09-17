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
npm run emulators      # Emulatoren starten (auth, firestore)
npm run lint
npm run test           # Unit-Tests (vitest)
npm run e2e            # Playwright, baut und startet die App selbst
npm run build          # Produktionsbuild nach dist/
```

Modell und Pläne neu erzeugen (Python, nur Standardbibliothek):

```bash
python3 tools/model/build_scene_lite.py --variant ist --version 0.23   # 3D-Szene
python3 tools/model/build_rooms.py
python3 tools/model/build_plans_svg.py
python3 tools/model/make_manifest.py
python3 tools/model/check_scene.py public/models/ist.json --against <alte Fassung>
```

`build_scene.py` baut dieselbe Szene aus Volumenkörpern, braucht aber CadQuery (~150 MB).
Das ist nur für STL (`build_print.py`) und STEP/FreeCAD (`build_cad.py`) nötig – der Viewer
braucht keine wasserdichten Körper. Details in `tools/model/README-MODELL.md`.

Wenn kein npm-Registry erreichbar ist (abgeschottete Umgebung), greifen zwei Ersatzprüfungen:

```bash
npm run check:offline
# entspricht:
node tools/verify/typecheck-without-npm.mjs   # Syntax + alle projektinternen Importe
node tools/verify/run-tests-without-npm.mjs   # die Unit-Tests ohne externe Pakete
```

Sie ersetzen `npm run build` nicht, finden aber Tippfehler, kaputte Importe und
Logikfehler. Für das 3D-Modell prüft `tools/model/check_scene.py` ohne Abhängigkeiten
(Exitcode != 0 bei Problemen); das Chromium-Harness in `tools/model/_verify` rendert
zusätzlich Bilder, braucht dafür aber `three.min.js` unter `tools/model/vendor/`.

## Architektur in drei Sätzen

Firestore mit persistentem lokalem Cache ist die Datenbasis; Lesen läuft immer über
`onSnapshot`, Schreiben geht offline in die Firestore-Warteschlange. Die modulübergreifende
Suche (`src/search`, Bildschirm `/suche`) baut aus denselben Abfragen einen eigenen Index -
gefaltet wird beim Aufbau, nicht beim Tippen; Details in `PLAN.md`, Abschnitt 8.9. Dateien (Fotos,
Belege, Pläne) liegen auf Cloudflare R2 hinter dem Worker in `worker/reno-files.js` und
gehen über die eigene Outbox in `src/offline/outbox.ts`. Das 3D-Modell und die 2D-Pläne sind generierte Dateien
unter `public/models` und `public/plans`, erzeugt aus `tools/model`.

**Die Modellversion hängt nicht am App-Build.** `src/data/modelSync.ts` nimmt die höchste
Fassung, die es erreicht – gebündelt, aus dem Manifest der veröffentlichten Seite, oder
aus `meta/model-<variante>` in Firestore – prüft sie und legt sie in IndexedDB
(`src/data/modelStore.ts`). Der Viewer liest über `loadScene`, also offline aus dem Cache.
Die Entscheidungslogik steht testbar in `src/data/modelRelease.ts`. Veröffentlichen geht
per `git push` oder ohne Deploy über Einstellungen → 3D-Modelle → „Modell veröffentlichen“
(Anleitung in `tools/model/README-MODELL.md`, Abschnitt 5).

## Stand (16.09.2026)

Live unter <https://dathomas13.github.io/reno-master/>, gebaut und veröffentlicht von
GitHub Actions. Der Workflow läuft auf `main` und auf jedem `claude/**`-Branch, und der
`deploy`-Job wird von keinem davon mehr abgewiesen: **der letzte Push gewinnt**, gleich
aus welchem Branch.

Steht:

- Firebase-Projekt `reno-master-307f7` in `europe-west3`, Anmeldung mit beiden Konten,
  Selbstregistrierung abgeschaltet, Regeln in der Konsole veröffentlicht.
- Die sieben `VITE_`-Werte liegen als GitHub *Repository variables* und stecken im Bundle.
- Modell-Pipeline, alle Bildschirme, Service Worker, Suche über alle Module, Fotogalerie, 452 Unit-Tests.
- **Dateispeicher steht**: Bucket `reno-master` und Worker `reno-files` bei Cloudflare,
  die Adresse als GitHub-Variable `VITE_FILES_URL`. Damit laufen Fotos, Belege und
  Plan-Uploads. Firebase Storage wird nicht mehr benutzt, der Blaze-Tarif ist dafür nicht
  nötig. Einrichtung und Aufbau stehen in `worker/README.md`.
- **Die Abend-Erinnerung läuft ohne Server**: das Gerät entscheidet selbst, ob heute noch
  ein Eintrag fehlt, und stellt die Benachrichtigung als Wecker
  (`src/platform/reminderPlan.ts` rechnet, `src/platform/reminder.ts` stellt,
  `src/data/useReminder.ts` hält sie an der Tagebuch-Abfrage). Kein Blaze, kein Token,
  kein Netz. Details in `PLAN.md`, Abschnitt 11.
- `public/img/nordansicht.jpg` liegt im Repo.
- Das Bautagebuch ist vollständig in der App. Einträge entstehen nur noch dort
  (App oder Webansicht); es gibt keinen Import von außen mehr.

Offen:

1. **Push, wenn die App zu ist.** Die Abend-Erinnerung steht: sie wird auf dem Gerät
   geplant und kommt ohne Netz (`src/platform/reminderPlan.ts` entscheidet,
   `src/platform/reminder.ts` stellt den Wecker, `src/data/useReminder.ts` hält beides an
   der Tagebuch-Abfrage). Die Cloud Function in `functions/` deckt nur noch den Rest ab –
   den zugeklappten Browser am Laptop – und braucht dafür Blaze und die Firebase-CLI.
2. `package-lock.json` erzeugen und committen, dann in beiden Workflows `npm install`
   wieder durch `npm ci` ersetzen.
3. **Fester Signaturschlüssel für die APK.** Der Workflow ist vorbereitet: liegen die vier
   `ANDROID_*`-Secrets vor, baut und signiert er eine Release-APK, die sich über die alte
   legt (Anleitung im README unter „Signaturschlüssel“). Ohne sie bleibt es beim
   Debug-Schlüssel, und Android verweigert das Update über die alte Fassung.
4. **APK**: Basis und Galerie-Zugriff stehen (Capacitor 6, Workflow *Android APK*,
   Debug-Build als Artefakt, eigenes Plugin `plugins/mediastore` für die Fotos eines
   Tages, Abend-Erinnerung über `@capacitor/local-notifications`). Offen sind ML Kit für
   das Beleg-Auslesen auf dem Gerät und Push. Push braucht zusätzlich
   `google-services.json` und den google-services-Eintrag in Gradle – die Erinnerung
   braucht beides nicht.

**Achtung bei den Regeln:** `firestore.rules` im Repo trägt
Platzhalter statt der echten Adressen. Die gültige Fassung steht in der Firebase-Konsole.
Wer `firebase deploy --only firestore` ausführt, überschreibt sie mit den
Platzhaltern und sperrt beide Konten aus. Vorher die Adressen einsetzen, klein geschrieben.

## Regeln

- Komponenten sprechen nie direkt mit Firestore, sondern über `src/data/*`.
- Jede Netzwerkoperation muss offline sauber scheitern, nie in einen Endlos-Spinner laufen.
- Räume werden über ihre `id` verknüpft (`roomIds`). Eine vergebene Raum-id nie umbenennen.
- Eine Modellversion nie wiederverwenden: die App vergleicht sie und ignoriert Gleiches.
- **Zu jedem Release ein Absatz in `RELEASE_NOTES.md`** (`## <Version> – <Schlagzeile>`). Das ist
  der Text, den das Update-Banner in der App zeigt, und er ist für Thomas geschrieben, nicht für
  den nächsten Agenten: ganze Sätze, was sich an der Bedienung ändert. Keine Dateinamen, keine
  Testzahlen, keine Commit-Prosa – die steht im Commit. Ohne Eintrag nimmt der Build die
  Commit-Nachricht, und die liest sich im Banner auch so.
- **Jeder Entwicklungsschritt ist ein Release**, auch aus einem Sitzungsbranch: das
  Telefon aktualisiert sich über `releases/latest` selbst, ein Umweg über Artefakte im
  Browser ist nicht gewollt. Also bei jedem Push die Version in `package.json` anheben –
  genau daran erinnert die Wächter-Prüfung im APK-Workflow, wenn sie scheitert. Mehrere
  Commits mit derselben Nummer gehen nicht; wer das umgeht, nimmt dem Telefon das Update.
- **In `version.json` nie `releases/latest/download/…` ankündigen**, sondern die Adresse
  genau der angekündigten Fassung (`releases/download/v<version>/reno-master.apk`). Seite
  und APK bauen zwei Workflows: die Seite steht nach ~90 s, das APK-Release nach ~3 min.
  In dieser Lücke ist „latest“ noch die vorige Fassung – das Telefon lädt, installiert und
  startet die Fassung, die es schon hat, und es sieht aus, als hätte das Update geklappt.
  Der Deploy wartet deshalb zusätzlich auf das Release, bevor er die Seite veröffentlicht.
- Der Tag eines Release hängt am gebauten Commit (`--target "$GITHUB_SHA"`). Ohne das
  setzt `gh release create` ihn auf den Default-Branch, und aus einem Sitzungsbranch
  heraus zeigt er dann auf Code, der die veröffentlichte APK nicht enthält.
- Der Pages-Deploy veröffentlicht aus **jedem** Branch, auf den der Workflow hört
  (`main` und `claude/**`) – die Umgebung `github-pages` weist keinen mehr ab. Ein Push
  aus einem Sitzungsbranch stellt die Seite also live und schickt dem Telefon ein neues
  `version.json`. Wer das nicht will, veröffentlicht von dort nicht.
- Keine Geheimnisse ins Repo: Service-Account-JSON, `google-services.json`, `.env` sind gitignored.
- Der Claude API-Key liegt nur im localStorage des Geräts, nie in Firestore.
- Vor dem Push: `npm run lint`, `npm run test`, `npm run build`.
