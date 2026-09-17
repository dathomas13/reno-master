# Was neu ist

Die Texte, die in der App im Update-Banner stehen. Sie sind für den Menschen am Telefon
geschrieben, nicht für den Entwickler: was sich an der Bedienung ändert, in ganzen Sätzen,
ohne Dateinamen, Testzahlen und Commit-Prosa.

Eine Überschrift pro Version, `## <Version> – <Schlagzeile>`, darunter ein bis drei kurze
Absätze. Die Schlagzeile ist die Zeile, die im eingeklappten Banner steht. Fehlt eine
Version hier, nimmt der Build die Commit-Nachricht – und die liest sich dann auch so.

## 0.28.3 – Neue Übersicht: alle Belege an einem Ort

Unter „Mehr“ gibt es jetzt „Belege“: eine Liste aller eingescannten Rechnungen und Quittungen,
neueste zuerst, mit Vorschaubild, Händler, Datum und Betrag. Ein Tipp öffnet den Beleg in
groß – Foto oder PDF – und von dort geht es direkt zum passenden Kosten-Eintrag. Über dem
Suchfeld steht die Summe der gerade sichtbaren Belege, gefiltert werden kann nach Händler,
Kategorie oder Rechnungsnummer.

## 0.28.2 – Erinnerung repariert, und Belege kann jetzt auch Gemini lesen

Die Diagnose aus der vorigen Fassung hat den wahren Grund gezeigt: Die App hat den
Benachrichtigungsteil des Telefons nie erreicht – noch bevor es um Erlaubnis oder Uhrzeit
ging. Sie holte ihn auf einem Umweg, der im App-Fenster nicht ankommt. Jetzt nimmt sie
denselben direkten Weg, über den auch der Galerie-Zugriff und das Beleg-Auslesen laufen,
und der funktioniert hier seit jeher.

Neu beim Beleg-Auslesen: **Gemini** steht als zweite Online-Möglichkeit neben Claude. In den
Einstellungen unter „Beleg-Auslesen“ gibt es jetzt für beide je ein Feld für den Schlüssel
und eines für das Modell; oben wählst du, was benutzt werden soll. „Automatisch“ nimmt der
Reihe nach ML Kit auf dem Gerät, dann Gemini, dann Claude – das erste, für das ein Schlüssel
hinterlegt ist. Beide bekommen wortgleich dieselbe Frage gestellt und ihre Antwort wird
gleich streng geprüft, damit derselbe Beleg nicht je nach Einstellung einen anderen Betrag
ergibt. Die Schlüssel bleiben auf dem Telefon.

## 0.27.0 – Die Erinnerung geht jetzt wirklich raus

In der vorigen Fassung passierte beim Antippen der beiden Knöpfe schlicht nichts. Drei
Gründe, alle behoben.

Der wichtigste: Benachrichtigungen brauchen unter Android ein eigenes kleines Symbol für
die Statusleiste. Fehlt es, wirft das Telefon die Meldung wortlos weg – keine Fehlermeldung,
kein Hinweis, nichts. Das Symbol gibt es jetzt, und der Build bricht ab, falls es je wieder
fehlt. Die Testbenachrichtigung ging außerdem den Umweg über einen Wecker und blieb dabei in
der Stromsparbremse hängen; sie wird jetzt direkt angezeigt. Und wenn das Telefon auf eine
Anfrage gar nicht antwortet, sagt der Knopf das nach ein paar Sekunden, statt still zu
bleiben.

Neu ist unter „Abend-Erinnerung“ die aufklappbare Zeile **Diagnose**. Dort steht schwarz auf
weiß, was das Telefon gerade tut: ob es die Erlaubnis erteilt hat, ob es die Weckzeit auf die
Minute einhalten darf und wie viele Wecker wirklich gestellt sind. Falls doch wieder etwas
klemmt, steht dort, woran es liegt.

## 0.26.0 – Die Abend-Erinnerung kommt jetzt auch ohne Netz

Die Erinnerung, abends einen Tagebucheintrag zu schreiben, wartete bisher auf einen Server –
und der kam nie. Jetzt stellt das Telefon sie selbst, wie einen Wecker: Es weiß, wann du
erinnert werden willst, und es weiß aus dem eigenen Speicher, ob für heute schon ein Eintrag
steht. Funk, WLAN oder Flugmodus spielen dabei keine Rolle mehr.

Einschalten in den Einstellungen unter „Abend-Erinnerung“: Haken setzen, Uhrzeit wählen,
einmal „Benachrichtigungen erlauben“ antippen. Darunter steht im Klartext, wann die nächste
Erinnerung kommt, und „Testbenachrichtigung“ zeigt sofort, wie sie aussieht. Ein Tipp auf die
Meldung öffnet direkt den neuen Eintrag. Wer den Eintrag schon geschrieben hat, wird an
diesem Abend nicht mehr behelligt.

Am Laptop im Browser geht das nur eingeschränkt: dort erinnert die App, solange sie offen
ist. Zuverlässig ist die Erinnerung in der App auf dem Telefon.

## 0.25.0 – Das Update installiert jetzt wirklich die neue Fassung

Wer in der App auf „Installieren“ getippt hat, bekam unter Umständen die Fassung
installiert, die schon drauf war – und die App startete danach unverändert neu. Grund war
ein Wettlauf: die Webseite mit der Ankündigung steht anderthalb Minuten nach einer
Änderung, die App-Datei zum Installieren erst nach dreien. Wer schnell war, lud die alte
Datei.

Die Ankündigung nennt jetzt die App-Datei genau dieser Fassung statt „die neueste“, und
sie erscheint erst, wenn die Datei auch fertig ist. Fehlt sie trotzdem einmal, sagt das
Banner das – und schaltet sich von selbst frei, sobald sie da ist.

## 0.24.0 – Eine Fotogalerie, und das 3D-Modell merkt sich die Ansicht

Neu ist der Bildschirm „Fotos“: alle Bilder nach Monaten, Fotos und Belege getrennt
filterbar, Tippen öffnet sie groß mit Wischen von Bild zu Bild. Die Kachel „Fotos“ im
Raumfenster des 3D-Modells führt direkt in die Bilder dieses Raums.

Diese Kachel zeigte bisher übrigens fast immer null. Ein Foto merkt sich selbst keinen
Raum – der steht am Tagebucheintrag oder am Beleg, an dem es hängt. Genau so wird jetzt
gezählt, und deshalb stehen dort auf einmal Zahlen.

Und das 3D-Modell fängt nicht mehr bei jedem Besuch von vorn an. Kameraposition,
sichtbare Geschosse, Tragwände, Raum-Anzeige und der geöffnete Raum sind beim Zurückkommen
noch so, wie sie beim Verlassen waren – auch nach einem Wechsel zwischen Bestand und
Zielzustand und nachdem die App zwischendurch zu war.

## 0.23.0 – Zwei Anzeigen, die am Telefon nicht lesbar waren

Die Upload-Liste hinter dem Punkt oben rechts öffnete sich bisher verschoben: man sah
nicht, welche Datei eigentlich aussteht. Sie sitzt jetzt dort, wo sie hingehört, am
unteren Rand und vollständig lesbar. Dasselbe galt für jedes Fenster, das aus der
Kopfzeile heraus aufgeht.

Im 3D-Modell verschwand die Kachelleiste eines Raums – Einträge, Fotos, Kosten, offene
Aufgaben – halb hinter der Navigationsleiste. Raumfenster und Schaltflächen stehen jetzt
übereinander statt übereinander gelegt, und die Kacheln bleiben auch bei vierstelligen
Beträgen in der Zeile.

## 0.22.0 – Suchergebnisse nach Bereichen, und Klarheit bei den Uploads

Die Suche sortiert ihre Treffer jetzt nach Bereichen: erst Tagebuch, dann Kosten, dann
Aufgaben – je nachdem, wo das Gesuchte am besten passt. Jeder Bereich zeigt die fünf
besten Treffer, der Rest ist einen Tipp entfernt.

Der Punkt oben rechts lässt sich antippen und zeigt endlich, was er meint: welche Datei
noch nicht im Speicher liegt, seit wann, und woran es zuletzt gescheitert ist. Von dort
aus geht „Jetzt versuchen“ oder „Verwerfen“.

Dazu ein hartnäckiger Fehler weniger: Eine einzige hängende Verbindung konnte die
Warteschlange dauerhaft blockieren – das Foto war längst hochgeladen, die Anzeige stand
trotzdem tagelang auf „1 wird geladen“ und auch der Knopf half nicht mehr. Uploads haben
jetzt ein Zeitlimit, und eine Datei, deren Foto gelöscht wurde, verschwindet mit ihm.

## 0.21.0 – Eine Suche über alles

Neu ist ein Suchbildschirm, der alles auf einmal durchsucht: Tagebuch, Kosten und Belege,
Aufgaben, Kontakte samt ihren Notizen, Gewerke, Phasen, Räume und Pläne. Zu finden über
„Mehr“, oder gleich über das Suchfeld auf der Startseite.

Gesucht wird so, wie man tippt: „putz“ findet auch „Innenputz“, Umlaute sind egal, und
Beträge („89,90“) und Daten („13.09“, „September“) zählen mit. Ein Tagebucheintrag ist
auch über den Namen des Raums zu finden, mit dem er verknüpft ist, und ein Beleg über den
Text, den die App vom Foto gelesen hat.
