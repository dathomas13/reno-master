# Dateispeicher auf Cloudflare R2

Die Fotos, Belege und Pläne liegen nicht bei Firebase, sondern in einem R2-Bucket bei
Cloudflare. Grund: Firebases kostenloses Kontingent gilt nur für Buckets in den USA, und
dieses Projekt liegt in Frankfurt — dort wird ab dem ersten Byte abgerechnet. R2 ist bis
10 GB kostenlos und berechnet keinen Datenverkehr.

Der Bucket ist **nicht öffentlich**. Zwischen App und Bucket steht `reno-files.js`, ein
Worker, der das Firebase-Anmeldeticket prüft. Zum Anzeigen gibt er Adressen heraus, die
eine Stunde gelten — ein `<img>`-Element kann keine Kopfzeile mitschicken, deshalb trägt
die Adresse selbst den Nachweis.

```
App ──Anmeldeticket──▶ Worker ──▶ R2 (privat)
        Anzeigen: kurzlebige signierte Adresse
```

## Einrichten (alles im Browser, keine Kommandozeile)

1. **Konto** auf [dash.cloudflare.com](https://dash.cloudflare.com) anlegen.
2. **R2** → *Create bucket* → Name `reno-master`, Standort *Automatic* (oder EU).
3. **Workers & Pages** → *Create* → *Start with Hello World!* → Name `reno-files` →
   *Deploy*, danach *Edit code*. Den gesamten Inhalt von `reno-files.js` einfügen und
   *Deploy* drücken.
4. Im Worker unter **Settings → Variables and Secrets** anlegen:

   | Name | Art | Wert |
   |---|---|---|
   | `ALLOWED_EMAILS` | Text | die beiden Mailadressen, mit Komma getrennt, klein geschrieben |
   | `FIREBASE_PROJECT` | Text | `reno-master-307f7` |
   | `SIGNING_KEY` | **Secret** | eine lange Zufallszeichenkette, einmal ausdenken und vergessen |

5. Im Worker unter **Settings → Bindings → R2 bucket**: Variablenname `BUCKET`, Bucket
   `reno-master`.
6. Die Adresse des Workers (`https://reno-files.<dein-name>.workers.dev`) im GitHub-Repo
   als **Repository variable** `VITE_FILES_URL` hinterlegen
   (*Settings → Secrets and variables → Actions → Variables*).

Danach einmal den Workflow *Android APK* starten und die neue Fassung installieren.

## Prüfen, ob es läuft

In der App ein Foto zu einem Tagebucheintrag hinzufügen. Erscheint es nach kurzer Zeit
ohne das Kürzel „wartet", ist es im Bucket. Im Cloudflare-Dashboard unter R2 → `reno-master`
lässt sich das nachsehen.

## Routen

| Route | Zweck |
|---|---|
| `PUT /files/<pfad>` | Datei ablegen, mit `Authorization: Bearer <Ticket>` |
| `DELETE /files/<pfad>` | Datei löschen, dito |
| `POST /link` | `{ path }` → `{ url, expires }`, die Adresse zum Anzeigen |
| `GET /files/<pfad>?exp=…&sig=…` | liefert die Datei, prüft Signatur und Ablauf |

## Was geprüft ist, und was nicht

`node worker/selftest.mjs` prüft die Teile, die ohne Cloudflare laufen: Signatur und
Ablauf der Anzeige-Adressen, die Pfad-Prüfung (`..`, führende Schrägstriche, Leerzeichen)
und dass ein selbst gebautes Ticket mit `alg: none` abgewiesen wird.

Nicht geprüft werden kann hier: der Worker im echten Betrieb, das Zusammenspiel mit R2 und
die Prüfung eines echten Firebase-Tickets gegen Googles Schlüssel. Das zeigt sich erst beim
ersten Foto.

## Kosten

10 GB Speicher, 1 Mio. Uploads und 10 Mio. Abrufe im Monat sind frei, ebenso der
Datenverkehr. Der Worker selbst: 100.000 Anfragen pro Tag frei. Bei zwei Nutzern ist das
nicht zu erreichen.
