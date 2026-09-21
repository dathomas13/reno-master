# @reno/nativecam

Kamera-Vorschau und Aufnahme über Camera2, als Capacitor-Plugin.

## Das Ergebnis zuerst: auf diesem S24 ist die Rückkamera nicht zu retten

Dieses Plugin ist über sieben Fassungen und fünf Geräteläufe entstanden, um herauszufinden,
warum die Rückkamera des Telefons rund zwei Sekunden nach dem Öffnen abbricht. Die Antwort
steht fest, und sie ist keine Vermutung mehr, sondern eine vollständige Messreihe:

| Was | Ergebnis |
|---|---|
| Frontkamera 1, 640×480 | **6167 ms, 159 Bilder** – tadellos |
| Kamera 0, 1232×1008, Standard | `ERROR_CAMERA_DEVICE` nach 1750 ms, 19 Bilder |
| Kamera 0, 640×480, langsam | nach 1604 ms, 5 Bilder |
| Kamera 0, 320×240, langsamste Bildrate | nach 1620 ms, 5 Bilder |
| Kamera 2, alle drei Größen | nach 430–762 ms, **nie ein Bild** |
| Linse 5 einzeln öffnen | `CAMERA_DISCONNECTED: No camera device with ID "5" available` |
| Linse 6 einzeln öffnen | dasselbe |

Daraus folgt lückenlos:

1. **Kamera 2 ist die defekte Linse.** Einzeln geöffnet liefert sie in keiner Konfiguration
   ein einziges Bild und fällt nach einer halben bis dreiviertel Sekunde aus – über alle Läufe
   hinweg auf die Millisekunde reproduzierbar.
2. **Kamera 0 ist keine Kamera, sondern der Verbund aus den Linsen 2, 5 und 6.** Wer sie
   öffnet, fährt alle drei hoch, auch die defekte, und der Verbund fällt nach rund 1,6 s mit
   ihr. Die Zeit dahin ist unabhängig von Auflösung, Bildrate, Fokus und Stabilisator:
   320×240 bei 15 Bildern/s stirbt so schnell wie 1232×1008 bei 60, sogar etwas schneller.
   Das ist eine Zeitschranke im Kameradienst, kein Belastungsgrenzwert.
3. **Die gute Linse lässt sich nicht einzeln ansprechen.** Ihre Eigenschaften sind lesbar
   (4080×3060, f/1.8, voller Fokus- und Stabilisator-Satz), `openCamera("5")` wird abgewiesen.
   Damit ist der letzte Weg zu, den Camera2 kennt.

**Warum Expert RAW trotzdem läuft:** Samsungs eigene Apps sprechen die Sensoren über eine
herstellereigene Schnittstelle an, die Fremd-Apps nicht offensteht. Dass dieselbe Hardware
dort funktioniert, widerspricht dem Befund nicht – es zeigt nur, dass ein Weg daran vorbei
existiert, der für uns verschlossen ist.

**Für die App heißt das:** Es gibt auf diesem Gerät keine Betriebsart, in der die Rückkamera
länger als zwei Sekunden hält. Fotos entstehen über die Systemkamera oder Expert RAW und
kommen über die Galerie-Auswahl in den Eintrag. Die Kamera-Ansicht fasst die Kamera genau
einmal an, scheitert sauber und weist auf diesen Weg hin.

## Ein zweiter, davon unabhängiger Befund: PRIVATE-Puffer starten das Gerät neu

Ein `ImageReader` im Format `ImageFormat.PRIVATE` an einer *laufenden* Kamera startet dieses
Telefon neu – das ganze Telefon, nicht die App. Sauberes A/B an der gesunden Frontkamera,
gleiche Größe, gleiche Einstellungen: mit YUV 6 s und 130 Bilder, mit PRIVATE ein Neustart.
Das Anlegen des Puffers allein, ohne Kamera, ist unschuldig. In `CameraDiagnosis` steht das
deshalb hinter `TEST_PRIVATE`, abgeschaltet; jede Bestätigung kostet einen weiteren Neustart.

Für ein zukünftiges Gerät ist das die wichtigste Warnung in diesem Verzeichnis.

## Der Weg dorthin, und was dabei widerlegt wurde

Drei Thesen sind unterwegs gestorben, jede an einem Gerätelog:

- **„Die logische Kamera schaltet auf die defekte Linse um."** Die ursprüngliche Annahme, für
  die dieses Plugin überhaupt gebaut wurde. `OutputConfiguration#setPhysicalCameraId` bindet
  jede Ausgabe an einen benannten Sensor – hilft aber nicht, weil es nur den Bildstrom umlenkt
  und weiterhin den ganzen Verbund öffnet. Gepinnt starb es sogar schneller und lieferte nie
  ein Bild.
- **„Fokusmotor oder Bildstabilisator fallen aus."** Beide abgeschaltet, bevor das erste Bild
  angefordert wurde – ohne jede Wirkung. Und der Besitzer fokussiert in Expert RAW problemlos.
- **„Die Kamera-Platine bricht unter Last ein."** Widerlegt durch die Messreihe oben: die Zeit
  bis zum Abbruch bewegt sich nicht, wenn die Last auf ein Vierzigstel fällt.

## Methoden

| Methode | Zweck |
|---|---|
| `isSupported()` | `{ supported, reason? }` – Android 9+ und eine Rückkamera vorausgesetzt |
| `start()` | öffnet die Rückkamera einmal, klein, und löst erst auf, wenn wirklich ein Bild ankam |
| `capture()` | das nächste Bild des laufenden Stroms, in voller Qualität |
| `stop()` | schließt Sitzung, Gerät und `ImageReader` |
| `diagnose()` | die Vollprüfung, siehe `CameraDiagnosis` – nur auf Knopfdruck aus den Einstellungen |
| `readDiagnosis()` / `clearDiagnosis()` | der Bericht der letzten Prüfung, überlebt einen Geräteneustart |
| Ereignis `frame` | `{ base64, width, height }`, etwa alle 120 ms |
| Ereignis `error` | `{ message }`, wenn eine laufende Kamera aufgibt |
| Ereignis `log` | `{ message }` – jeder Schritt, landet im Kamera-Protokoll |

Die Vorschau ist keine native Ansicht hinter einer transparent gemachten WebView, sondern ein
paar JPEGs pro Sekunde als Ereignis an JS (dargestellt als `<img>` statt `<video>`). Spürbar
weniger flüssig, dafür ohne eine Kompositions-Mechanik, die sich nur auf dem Gerät prüfen
ließe. Der Bericht der Vollprüfung geht über `DiagnosisLog` mit `fsync` pro Zeile auf die
Platte, weil `localStorage` einen Geräteneustart nicht übersteht – ohne das wäre keiner dieser
Befunde je lesbar gewesen.

In Java geschrieben, nicht in Kotlin – aus demselben Grund wie beim `mediastore`-Plugin: das
Android-Projekt von Capacitor bringt den Kotlin-Gradle-Plugin nicht mit.
