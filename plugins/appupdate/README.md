# AppUpdate

Installiert eine neue Fassung der App aus der App heraus.

Der Weg über einen Link in den Browser ist zweimal schlecht: man verlässt die App, und ein
Chrome-Download, der auf dem letzten Byte stehen bleibt, hinterlässt gar nichts. Dieses
Plugin lädt die APK selbst, meldet den Fortschritt und übergibt die fertige Datei an
Androids Paket-Installer.

Der letzte Schritt bleibt ein Systemdialog („App aktualisieren?"). Eine seitwärts
installierte App darf sich nicht ungefragt selbst ersetzen — das kann nur der
Geräteeigentümer. Alles davor gehört uns.

## Methoden

| Methode | Zweck |
|---|---|
| `canInstall()` | Hat der Nutzer dieser App das Installieren erlaubt? |
| `openSourceSettings()` | Öffnet die Systemseite, auf der er es erlaubt |
| `downloadAndInstall({ url })` | Lädt die APK und startet den Installer |
| Ereignis `progress` | `{ loaded, total }` in Bytes, etwa alle 100 KB |

## Details, die nicht offensichtlich sind

- **Umleitungen werden selbst verfolgt.** Release-Downloads leiten immer auf einen anderen
  Host um; `HttpURLConnection` folgt dem nicht in jedem Fall von allein. Nur `https` wird
  akzeptiert, auch nach einer Umleitung.
- **Erst `.part`, dann umbenennen.** Ein abgebrochener Download darf nie als gültige APK
  liegen bleiben. Stimmt die Länge am Ende nicht, gibt es einen Fehler statt einer
  halben Datei.
- **Eigener FileProvider** (`${applicationId}.updateprovider`) mit eigenem Pfad, damit das
  Plugin nicht davon abhängt, was die App in ihrer `file_paths.xml` stehen hat. Seit
  Android 7 wird eine `file://`-Adresse an einen anderen Prozess abgelehnt. Er ist eine
  eigene Klasse (`UpdateFileProvider`), weil der Manifest-Merger Provider über den
  Klassennamen zusammenführt — Capacitor bringt bereits einen mit, zwei Einträge derselben
  Klasse brechen den Build.
- Die Berechtigung `REQUEST_INSTALL_PACKAGES` bringt das Plugin selbst mit.
