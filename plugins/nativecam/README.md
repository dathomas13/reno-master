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
| `start()` | öffnet die Rückkamera, bindet Vorschau und Aufnahme an denselben physischen Sensor (wenn vorhanden), startet die Vorschau. `{ physicalCameraId? }` |
| `capture()` | eine Aufnahme vom selben Sensor wie die Vorschau, als JPEG. `{ base64, mime, width, height }` |
| `stop()` | schließt Sitzung, Gerät und beide `ImageReader` |
| Ereignis `frame` | `{ base64, width, height }`, etwa alle 120 ms |
| Ereignis `error` | `{ message }`, wenn die Kamera von sich aus die Verbindung beendet |

Welcher physische Sensor gewählt wird: unter den Sensoren, die `getPhysicalCameraIds()` der
logischen Kamera nennt, der mit der größten Brennweite - das ist auf einem Telefon ohne
Teleobjektiv zuverlässig die Hauptlinse, nie die Ultraweitwinkel-Linse, die den Absturz
auslöst. Gibt es keine logische Kamera (nur ein Sensor hinten), läuft die Aufnahme normal
weiter, nur ohne `physicalCameraId` im Ergebnis.

In Java geschrieben, nicht in Kotlin - aus demselben Grund wie beim `mediastore`-Plugin: das
Android-Projekt von Capacitor bringt den Kotlin-Gradle-Plugin nicht mit.

## Was ungetestet bleibt

Dieses Plugin lässt sich in der Entwicklungsumgebung, in der es entstanden ist, nicht gegen
ein Android-SDK bauen oder auf einem Gerät ausführen. Die Camera2-Aufrufe, die Bindung an den
physischen Sensor und die YUV→JPEG-Umrechnung der Vorschau sind sorgfältig gegen die
offizielle Camera2-Dokumentation geschrieben, aber der eigentliche Beweis - läuft die
Rückkamera jetzt länger als zwei Sekunden - steht erst nach einem Build auf dem Gerät.
