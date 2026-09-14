# @reno/mediastore

Kleines Capacitor-Plugin, das die Fotogalerie des Geräts nach Aufnahmedatum durchsucht.

Warum das nötig ist: Der übliche Weg über einen Datei-Dialog liefert nur Kopien und keine
Information darüber, welches Bild wann entstanden ist. Für das Bautagebuch soll die App
beim Eintrag vom 4. September genau die Fotos dieses Tages vorschlagen und sich merken,
wo das Original liegt, damit es nicht doppelt gespeichert werden muss.

## Methoden

| Methode | Zweck |
|---|---|
| `listPhotos({ from, to, limit })` | Fotos zwischen zwei Tagen (`YYYY-MM-DD`), neueste zuerst |
| `getThumbnail({ uri, size })` | kleines Vorschaubild als base64-JPEG |
| `readImage({ uri, maxEdge })` | verkleinerte Fassung des Originals als base64-JPEG |
| `openInGallery({ uri })` | öffnet das Original in der Galerie-App |

Alle Methoden fragen die nötige Leseberechtigung selbst an: `READ_MEDIA_IMAGES` ab
Android 13, darunter `READ_EXTERNAL_STORAGE`.

In Java geschrieben, nicht in Kotlin: Das Android-Projekt von Capacitor bringt den
Kotlin-Gradle-Plugin nicht mit, und für diese paar hundert Zeilen lohnt es nicht, ihn
einzurichten.
