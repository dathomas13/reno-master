# @reno/nativecam

Kamera-Vorschau und Aufnahme über Camera2, direkt gegen einen physischen Sensor gebunden.

## Warum das nötig ist

`src/platform/camera.ts` beschreibt das eigentliche Problem: Samsungs "camera2 0" ist eine
logische Kamera, die für Nahfokus oder niedrigen Zoom selbständig auf die Ultraweitwinkel-
Linse umschaltet, und auf diesem Gerät nimmt genau dieser Wechsel den Kameradienst mit. Über
`getUserMedia` - also aus jedem Browser oder jeder WebView heraus - ist diese logische Kamera
das Einzige, was sich ansprechen lässt; die physischen Sensoren dahinter sind dem Web
schlicht nicht zugänglich, da hilft kein Constraint und kein Workaround in JavaScript.

Seit Android 9 kennt Camera2 dafür `OutputConfiguration#setPhysicalCameraId`: jede
Ausgabe-Surface kann sich an einen bestimmten physischen Sensor binden, und die logische
Kamera muss dann nie mehr selbst entscheiden, welcher Sensor liefert. Genau das - und sonst
nichts - macht dieses Plugin anders als die Kamera-Ansicht im Browser.

## Warum die Vorschau keine native Ansicht ist

Der naheliegende Weg für eine native Kamera-Vorschau ist ein `TextureView`, der hinter eine
transparent gemachte WebView gehängt wird (so macht es z. B. `capacitor-community/camera-preview`).
Das lässt sich aber ohne Gerät nicht prüfen - ein falscher Z-Index, eine falsche
Pixeldichte-Umrechnung, das fällt erst auf dem Handy auf, nicht beim Schreiben. Stattdessen
kodiert das Plugin jedes Vorschaubild als kleines JPEG und schickt es ein paar Mal pro
Sekunde als `frame`-Ereignis an JS (`src/platform/nativeCamera.ts`, dargestellt als `<img>`
statt als `<video>`). Spürbar weniger flüssig als eine echte Live-Ansicht, aber genug, um
ein Foto einer Wand oder einer Leitung zu rahmen - und ohne das Risiko einer nur auf dem Gerät
sichtbaren Kompositions-Fehlfunktion.

## Methoden

| Methode | Zweck |
|---|---|
| `isSupported()` | `{ supported, reason? }` - Android 9+ und eine Rückkamera vorausgesetzt |
| `start()` | probiert die Linsen der Rückkamera der Reihe nach durch und löst erst auf, wenn eine davon wirklich ein Bild geliefert hat. `{ physicalCameraId? }` |
| `capture()` | das nächste Bild des laufenden Stroms, in voller Qualität. `{ base64, mime, width, height }` |
| `stop()` | schließt Sitzung, Gerät und `ImageReader` |
| Ereignis `frame` | `{ base64, width, height }`, etwa alle 120 ms |
| Ereignis `error` | `{ message }`, wenn eine laufende Kamera von sich aus aufgibt |
| Ereignis `log` | `{ message }` - jeder Schritt der Linsen-Suche, landet im Kamera-Protokoll |

## Was der erste Gerätelauf gelehrt hat

Die erste Fassung wählte die Linse mit der größten Brennweite, band ein Vollauflösungs-JPEG
daran und meldete „bereit“, sobald die Sitzung stand. Auf dem S24 hieß das: Teleobjektiv,
`ERROR_CAMERA_DEVICE` nach 0,8 s, und kein einziges Bild. Daraus drei Änderungen:

- **Reihenfolge statt Rateschluss.** Die Sensoren werden nach Sensorfläche sortiert - die
  Hauptlinse zuerst - und einer nach dem anderen probiert, zuletzt ganz ohne Bindung. Auf
  einem Gerät mit einer physisch defekten Linse, wie es hier der Fall ist, ist diese Leiter
  der eigentliche Sinn der Sache.
- **Ein Strom, höchstens 1080p.** Für physische Ströme garantiert Android nur Größen bis
  1080p; ein Vollauflösungs-JPEG daran ist außerhalb dieser Zusage. Es gibt deshalb genau
  einen YUV-Strom, der Vorschau *und* Foto trägt. Das kostet Auflösung (rund 2 Megapixel
  statt 50) und ist der Preis dafür, dass die Kamera überhaupt läuft - lässt sich später
  wieder anheben, wenn das Gerät sich als stabil erweist.
- **„Bereit“ heißt: es kommen Bilder.** Eine konfigurierte Sitzung sagt nichts. `start()`
  löst erst mit dem ersten wirklich gelieferten Bild auf; bleibt ein Sensor 2,5 s stumm,
  gilt er als gescheitert und der nächste ist dran.

## Was der zweite Gerätelauf gelehrt hat

Das Protokoll listete drei Linsen (5: 4080×3060, f 5.4 – die Hauptlinse; 2: 4000×3000, f 2.2 –
Ultraweitwinkel; 6: 3648×2736, f 7.0 – Tele) und zeigte dann zweierlei:

- **Die Hauptlinse stirbt genauso wie die Ultraweitwinkel-Linse**, beide mit
  `ERROR_CAMERA_DEVICE`. Damit ist die ursprüngliche These – die logische Kamera schaltet auf
  die defekte Linse um – widerlegt. Es liegt nicht am Wechsel.
- **Jeder Fehlversuch beschädigt den Kameradienst weiter.** Nach zwei Versuchen war nicht nur
  Linse 6 unlesbar, sondern die Kamera 0 selbst (`unknown device 0`), und anschließend fand
  auch `getUserMedia` nichts mehr. Die Leiter probiert deshalb nur noch zwei Dinge, mit einer
  Pause dazwischen, und bricht sofort ab, sobald der Kameradienst nicht mehr antwortet.

Der neue Versuch steckt dafür in der Aufnahme-Anfrage selbst: **Autofokus und Bildstabilisator
werden abgeschaltet**, bevor das erste Bild angefordert wird (`holdEverythingStill`). Die
Kamera stirbt ein bis zwei Sekunden nach dem Start – und genau dann macht der Autofokus seinen
ersten Zug und der Stabilisator übernimmt. Bei einem mechanisch beschädigten Kameramodul sind
das die Teile, die ausfallen. Genau das kann der Browser nicht: er darf nur hinterher einen
Fokusmodus erbitten, nicht von vornherein „bewege dich nicht“ sagen.

In Java geschrieben, nicht in Kotlin - aus demselben Grund wie beim `mediastore`-Plugin: das
Android-Projekt von Capacitor bringt den Kotlin-Gradle-Plugin nicht mit.

## Was ungetestet bleibt

Dieses Plugin lässt sich in der Entwicklungsumgebung, in der es entstanden ist, nicht gegen
ein Android-SDK bauen oder auf einem Gerät ausführen. Die Camera2-Aufrufe, die Bindung an den
physischen Sensor und die YUV→JPEG-Umrechnung der Vorschau sind sorgfältig gegen die
offizielle Camera2-Dokumentation geschrieben, aber der eigentliche Beweis - läuft die
Rückkamera jetzt länger als zwei Sekunden - steht erst nach einem Build auf dem Gerät.
