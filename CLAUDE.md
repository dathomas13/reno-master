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

Das Modell hat **eine Quelle: die Hausdatei** `public/models/haus-<variante>.json`
(Format `reno-haus/1`, `tools/model/ANLEITUNG-EXTERN.md`). Der Benutzer ändert sie ohne
Repo über Einstellungen → 3D-Modelle → „Modell exportieren“/„Modell importieren“; die App
baut dann selbst (`src/modules/modelBuild`, Punkt für Punkt gleich wie Python). Im Repo
(Python, nur Standardbibliothek):

```bash
python3 tools/model/hausdatei.py --format ist         # Hausdatei ins kanonische Layout
python3 tools/model/build_scene_lite.py --variant ist # 3D-Szene, Version aus der Hausdatei
python3 tools/model/build_rooms.py
python3 tools/model/build_plans_svg.py
python3 tools/model/make_manifest.py
python3 tools/model/check_source.py                   # Szenen passen zu den Hausdateien (CI)
python3 tools/model/check_scene.py public/models/ist.json --against <alte Fassung>
```

**Vor einer Modelländerung im Repo zuerst den App-Export holen** – in der App kann seitdem
eine höhere Fassung veröffentlicht worden sein, die das Repo nicht kennt.

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
per `git push` oder ohne Deploy über „Modell importieren“ (`src/data/modelExchange.ts`);
jede Veröffentlichung trägt ihre Hausdatei mit, damit der Export immer den Stand in
Gebrauch herausgibt (Anleitung in `tools/model/README-MODELL.md`, Abschnitt 5).

## Stand (16.09.2026)

Live unter <https://dathomas13.github.io/reno-master/>, gebaut und veröffentlicht von
GitHub Actions. Die CI-, Pages- und APK-Workflows laufen auf jedem Branch-Push; der
`deploy`-Job wird von keinem Branch mehr abgewiesen: **der letzte Push gewinnt**, gleich
aus welchem Branch.

Steht:

- Firebase-Projekt `reno-master-307f7` in `europe-west3`, Anmeldung mit beiden Konten,
  Selbstregistrierung abgeschaltet, Regeln in der Konsole veröffentlicht.
- Die sieben `VITE_`-Werte liegen als GitHub *Repository variables* und stecken im Bundle.
- **Der Release-Signaturschlüssel liegt als Secret vor** (`ANDROID_KEYSTORE_BASE64` u. a.,
  siehe README unter „Signaturschlüssel“) und wird auch benutzt: der Workflow baut
  `assembleRelease`, nicht `assembleDebug`. Geprüft am 22.09.2026 am Zertifikat zweier
  veröffentlichter APKs (identischer Fingerabdruck, Aussteller „Reno Master“) - falls das
  hier je wieder als offen auftaucht, zuerst dagegen prüfen statt einen Debug-Schlüssel-Fix
  zu bauen, der dann nie zum Zug kommt.
- Modell-Pipeline, alle Bildschirme, Service Worker, Suche über alle Module, Fotogalerie, 248 Unit-Tests (Zahl aus dem vitest-Lauf in der CI, nicht geschätzt).
- **Das EG ist aufgemessen** (Thomas, 09/2026, DXF „Grundriss_EG_Bestand_Fertigmasse“):
  Ist-Modell v0.24 trägt im EG **Fertigmaße inkl. Putz**, Haus 12.995 × 11.815 statt
  13.240 × 11.820. Das KG ist darauf gesetzt (tragende Wände stehen übereinander),
  das OG folgt nur den Außenmaßen und wartet noch auf ein Aufmaß.
- **Dateispeicher steht**: Bucket `reno-master` und Worker `reno-files` bei Cloudflare,
  die Adresse als GitHub-Variable `VITE_FILES_URL`. Damit laufen Fotos, Belege und
  Plan-Uploads. Firebase Storage wird nicht mehr benutzt, der Blaze-Tarif ist dafür nicht
  nötig. Einrichtung und Aufbau stehen in `worker/README.md`.
- **Beleg-Auslesen mit drei Engines**: ML Kit auf dem Gerät, Gemini und Claude, hinter
  einem Interface in `src/platform/ocr`. Beide Online-Engines fragen mit demselben Text
  (`ocr/request.ts`) und laufen durch dieselbe Prüfung (`ocr/receiptFields.ts`) – sonst
  hinge der gebuchte Betrag an einer Einstellung. Beide Schlüssel liegen nur im
  localStorage des Geräts.
- **Die Abend-Erinnerung läuft ohne Server**: das Gerät entscheidet selbst, ob heute noch
  ein Eintrag fehlt, und stellt die Benachrichtigung als Wecker
  (`src/platform/reminderPlan.ts` rechnet, `src/platform/reminder.ts` stellt,
  `src/data/useReminder.ts` hält sie an der Tagebuch-Abfrage). Kein Blaze, kein Token,
  kein Netz. **Native Plugins immer über `Capacitor.Plugins` ansprechen, nie über
  `await import('@capacitor/…')`** – der Nachlade-Baustein kommt im WebView nie an, der
  Aufruf hängt einfach. **Android braucht außerdem zwingend `smallIcon`** – ohne gültiges Symbol
  verwirft es jede Benachrichtigung wortlos; die Datei liegt in
  `tools/icon/android/ic_stat_reno.xml`, der APK-Workflow prüft sie. Einstellungen →
  Abend-Erinnerung → „Diagnose“ fragt das Gerät, was es wirklich tut. Details in
  `PLAN.md`, Abschnitt 11.
- **Die Rückkamera des S24 ist defekt, und zwar unrettbar für jede App.** Kamera 0 ist der
  Verbund der Linsen 2, 5 und 6; Linse 2 ist hinüber (liefert nie ein Bild, fällt nach ~0,7 s
  aus), und weil der Verbund sie mit hochfährt, bricht er nach ~1,6 s ab – unabhängig von
  Auflösung, Bildrate, Fokus und Stabilisator. Die gute Linse einzeln zu öffnen verweigert
  Android (`No camera device with ID "5" available`). Die vollständige Messreihe steht in
  `plugins/nativecam/README.md`; **wer die Kamera-Ansicht anfassen will, liest die zuerst und
  fängt nicht von vorn an.** Fotos laufen über Systemkamera/Expert RAW und die Galerie-Auswahl.
  **Aus der Oberfläche ist das alles entfernt** – kein Kamera-Abschnitt in den Einstellungen,
  keine Diagnose, kein Protokoll, und der Foto-Knopf nimmt wieder den Datei-Dialog. Der Code
  liegt vollständig weiter da (`src/components/CameraCapture.tsx`, `src/platform/camera.ts`,
  `nativeCamera.ts`, `plugins/nativecam`) und ist an keiner Stelle angeschlossen;
  wer weitermachen will, hängt ihn in `PhotoAttach.openCamera` wieder ein.
  Zweiter, unabhängiger Befund: ein `ImageReader` mit `ImageFormat.PRIVATE` an einer laufenden
  Kamera startet dieses Gerät neu – nicht benutzen.
- **Das Modell lässt sich ohne Chat bearbeiten** (09/2026): Hausdatei als einzige Quelle,
  Export als ZIP (Anleitung, `haus-ist.json`, `haus-soll.json`, DXF-Grundrisse), Import
  mit Prüfung, Änderungsbericht, Vorschau im 3D und Veröffentlichen über Firestore. Die
  2D-Pläne zeichnet die App ebenfalls aus der Hausdatei (`modelBuild/plansSvg.ts`, byte-gleich
  zu `build_plans_svg.py`), sie folgen einem Import also sofort. Offen laut
  `tools/model/PLAN-MODELL-WORKFLOW.md`: DXF-Import, Änderung per Sprache in der App (Stufe 6).
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
3. **APK**: Basis und Galerie-Zugriff stehen (Capacitor 6, Workflow *Android APK*, signierte
   APK als Artefakt, eigenes Plugin `plugins/mediastore` für die Fotos eines
   Tages, Abend-Erinnerung über `@capacitor/local-notifications`). Offen sind ML Kit für
   das Beleg-Auslesen auf dem Gerät und Push. Push braucht zusätzlich
   `google-services.json` und den google-services-Eintrag in Gradle – die Erinnerung
   braucht beides nicht.

**Achtung bei den Regeln:** `firestore.rules` im Repo trägt
Platzhalter statt der echten Adressen. Die gültige Fassung steht in der Firebase-Konsole.
Wer `firebase deploy --only firestore` ausführt, überschreibt sie mit den
Platzhaltern und sperrt beide Konten aus. Vorher die Adressen einsetzen, klein geschrieben.

## Regeln

- **Branchnamen sprechend wählen.** Wer in einem neuen Chat einen Entwicklungsbranch anlegt,
  benennt ihn nicht mit Fantasiewörtern (`claude/relaxed-gates-…`), sondern leitet den Namen
  mit Sinn und Verstand aus der Anfrage ab – kurz, klein, mit Bindestrichen, z. B.
  `claude/kontakte-ueberarbeiten`. Gibt die Umgebung einen Fantasienamen vor, zuerst einen
  sprechenden anlegen und dort arbeiten.
- Komponenten sprechen nie direkt mit Firestore, sondern über `src/data/*`.
- Jede Netzwerkoperation muss offline sauber scheitern, nie in einen Endlos-Spinner laufen.
- **Zum Debuggen `src/platform/debugLog.ts` benutzen, nicht `console.log`.** Auf dem Telefon
  gibt es keine Konsole. `debugLog('<bereich>', '…')` schreibt sofort in den localStorage und
  übersteht Absturz, Reload und Neustart, `readDebugLog('<bereich>')` liest zurück. Für
  Vorgänge, die die App mitreißen können, `beginSession`/`endSession` – der nächste Start
  vermerkt dann im Protokoll, dass der vorige nie zu Ende kam.
- Räume werden über ihre `id` verknüpft (`roomIds`). Eine vergebene Raum-id nie umbenennen.
- Eine Modellversion nie wiederverwenden: die App vergleicht sie und ignoriert Gleiches.
- **Zu jedem Release ein Eintrag in `RELEASE_NOTES.md`** (`## <Version> – <Schlagzeile>`),
  darunter **ein bis drei Stichpunkte, je ein bis zwei Zeilen**. Das ist der Text im
  Update-Banner: was sich für den Benutzer ändert, sonst nichts. Keine Erklärungen, keine
  Begründungen, keine Fehlersuche-Geschichten, keine Dateinamen, keine Testzahlen – das
  gehört in den Commit. Wenn der Eintrag aussieht wie eine Chat-Antwort, ist er falsch.
  Ohne Eintrag nimmt der Build die Commit-Nachricht, und die liest sich im Banner auch so.
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
- Der Pages-Deploy veröffentlicht aus **jedem** Branch – die Umgebung `github-pages`
  weist keinen mehr ab. Ein Push aus einem Sitzungsbranch stellt die Seite also live und
  schickt dem Telefon ein neues `version.json`. Wer das nicht will, veröffentlicht von
  dort nicht.
- Keine Geheimnisse ins Repo: Service-Account-JSON, `google-services.json`, `.env` sind gitignored.
- Der Claude API-Key liegt nur im localStorage des Geräts, nie in Firestore.
- Vor dem Push: `npm run lint`, `npm run test`, `npm run build`.
