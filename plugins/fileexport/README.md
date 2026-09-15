# FileExport

Schreibt den Export Datei für Datei in einen Ordner, den der Nutzer im Systemdialog
auswählt — internen Speicher, SD-Karte oder einen Ordner, den eine Cloud-App
synchronisiert.

Warum kein ZIP: Das Tagebuch enthält die Originale von einigen hundert Fotos. Ein Archiv
müsste irgendwo entstehen, und dafür bräuchte das Handy kurzzeitig Platz für eine zweite
Kopie von allem. Als einzelne Dateien gibt es diese zweite Kopie nie — jedes Bild wandert
direkt von der Galerie in den Zielordner, ohne je durch die App zu laufen.

## Methoden

| Methode | Zweck |
|---|---|
| `pickFolder()` | Systemdialog; liefert `{ uri, label }` oder `{ cancelled: true }` |
| `canWrite({ treeUri })` | Darf in den Ordner von neulich noch geschrieben werden? |
| `writeFile({ treeUri, path, sourceUri \| base64, mime })` | Legt fehlende Unterordner an und schreibt die Datei |
| `readFile({ treeUri, path })` | Liest eine kleine Datei zurück (der Index des letzten Exports) |

## Details, die nicht offensichtlich sind

- **Die Berechtigung wird dauerhaft übernommen** (`takePersistableUriPermission`), sonst
  wäre der Ordner nach dem nächsten App-Start wieder fremd.
- **Ordner werden zwischengespeichert.** `DocumentFile.findFile` listet für jede Abfrage
  das ganze Verzeichnis; ohne den Zwischenspeicher würde ein Export mit 500 Fotos die
  Tagesordner 500-mal durchgehen.
- **Vorhandene Dateien werden erst gelöscht, dann geschrieben.** Sonst legt der Provider
  „bild (1).jpg" daneben und der Ordner füllt sich mit Dubletten.
- Es wird **keine Berechtigung im Manifest** deklariert: Der Zugriff kommt allein aus dem
  Ordner, den der Nutzer aussucht.
