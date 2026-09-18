# Was neu ist

Die Texte, die in der App im Update-Banner stehen. Sie sind für den Menschen am Telefon
geschrieben, nicht für den Entwickler: was sich an der Bedienung ändert, in ganzen Sätzen,
ohne Dateinamen, Testzahlen und Commit-Prosa.

Eine Überschrift pro Version, `## <Version> – <Schlagzeile>`, darunter ein bis drei kurze
Absätze. Die Schlagzeile ist die Zeile, die im eingeklappten Banner steht. Fehlt eine
Version hier, nimmt der Build die Commit-Nachricht – und die liest sich dann auch so.

## 0.30.0 – Fotos auswählen und weiterschreiben

In der Tagesgalerie kannst du mehrere Fotos markieren und mit „Hochladen“ gemeinsam
übernehmen. Der Dialog schließt sofort. Im Editor erscheinen zuerst die Vorschaubilder;
kleine Ladekreise zeigen, welche Fotos noch vorbereitet werden oder auf den Upload warten.
Du kannst dabei weiterschreiben. Sobald die Fotos lokal übernommen sind, lässt sich der
Eintrag speichern, während der Upload im Hintergrund weiterläuft, auch nach einer Offline-Pause.

## 0.29.11 – Tagebuch merkt Entwürfe

Ein angefangener neuer Tagebuch-Eintrag bleibt jetzt als Entwurf auf dem Gerät erhalten,
wenn du zurückgehst oder die App verlässt. Im Editor gibt es dafür einen eigenen Knopf
„Verwerfen und schließen“, wenn der angefangene Text wirklich weg soll.

## 0.29.10 – Tagebuch ohne Wolfgang-Schablone

Der Text im neuen Tagebuch-Eintrag schlägt nicht mehr jeden Tag dieselbe konkrete Arbeit vor.
Stattdessen wechseln neutrale Schreibanstöße, die nichts behaupten und nur helfen sollen,
den Tag schnell festzuhalten.

## 0.29.9 – Tagebuch erinnert genauer

Wenn du einen Tagebuch-Eintrag speicherst, löscht die App den Wecker für diesen Tag jetzt
sofort direkt auf dem Gerät, ohne auf die Serverbestätigung zu warten. Zusätzlich wartet
die Abend-Erinnerung beim Start, bis die Tagebuchdaten wirklich geladen sind, bevor sie
neue Wecker stellt.

Änderungen an der Uhrzeit werden jetzt sofort übernommen. Die Einstellungen hören live auf
das Nutzerprofil, sodass Statuszeile und gestellte Erinnerung nicht mehr auf der alten Zeit
stehen bleiben.

## 0.29.8 – Jeder Branch baut

Pushes von Entwicklungsbranches starten jetzt ebenfalls die Prüfungen, den Seiten-Deploy und den
APK-Build. Damit kommt eine neue Fassung nicht erst nach dem Merge an.

## 0.29.7 – Aufgaben erinnern dich

Aufgaben haben jetzt ein Feld „Erinnerung“. In der App stellt das Telefon dafür eine
Benachrichtigung; direkt in der Benachrichtigung gibt es die Aktion „Erledigt“, mit der
die Aufgabe abgeschlossen wird. Am Laptop lässt sich der Zeitpunkt ebenfalls eintragen,
die zuverlässige Erinnerung kommt aber über die Android-App.

## 0.29.6 – Editoren laden sauber neu

Beim Prüfen der anderen Formulare wurden zwei verwandte Stellen aufgeräumt: Kontakte speichern
jetzt ebenfalls über „Fertig“ im Formular-Kopf, und der Tagebuch-Editor lädt beim Wechsel auf
einen anderen Eintrag sicher den richtigen Datensatz.

## 0.29.5 – Aufgaben bleiben erledigt

Wenn du eine Aufgabe abhakst und direkt danach öffnest, bleibt sie im Formular jetzt auch
wirklich auf „Erledigt“. Der „Fertig“-Knopf oben im Aufgabenformular speichert nun ebenfalls,
statt die Änderungen nur zu schließen.

## 0.29.4 – Einstellungen übersichtlicher

Erklärungen zu Fotos, Beleg-Auslesen, Export und 3D-Modellen öffnest du jetzt über das
Fragezeichen. Beim Beleg-Auslesen siehst du nur die Einstellungen des gewählten Verfahrens;
bei „Automatisch“ kannst du Gemini und Claude einzeln aufklappen. Deine hinterlegten Werte bleiben erhalten.

Der Ordnerexport erscheint nur noch in der App, der Archiv-Export nur im Browser.
Warnungen, der Erinnerungsstatus und wartende Uploads bleiben direkt sichtbar.

## 0.29.3 – ML Kit nur, wo es das gibt

Beim Beleg-Auslesen stand „Nur ML Kit“ auch im Browser zur Wahl, obwohl das nur auf dem Gerät
läuft – im Browser hätte die Auswahl nie einen Beleg gelesen. Die Option erscheint jetzt nur
noch in der App-Version.

## 0.29.2 – Archiv-Export nur, wo er auch geht

Den Knopf für „Archiv erstellen“ gab es bisher auch dort, wo er nie funktionieren konnte –
am Handy hätte das ganze Archiv in den Arbeitsspeicher gepasst haben müssen. Jetzt zeigt die
Einstellungsseite dort von vornherein nur den Hinweis, das Archiv am Laptop zu erstellen –
genauso, wie es der Export in einen Ordner schon für die App-Version macht.

## 0.29.1 – Plus bei Aufgaben öffnet das Formular

Steht kein Text im Eingabefeld, öffnet das Plus jetzt das Formular für eine neue Aufgabe,
statt scheinbar nichts zu tun. Steht schon ein Titel da, legt das Plus die Aufgabe wie
bisher direkt an.

## 0.29.0 – Neue Aufgabe im gefilterten Raum

Wenn du bei Aufgaben nach einem Raum gefiltert hast und über das Plus eine neue Aufgabe
angelegt hast, verschwand sie sofort wieder aus der Liste – sie war zwar gespeichert, aber
keinem Raum zugeordnet. Jetzt landet sie im gerade gefilterten Raum.

## 0.28.7 – Dateien gemeinsam geöffnet

Fotos, Belege und Pläne findest du jetzt gesammelt unter „Dateien“. Die drei Bereiche bleiben
jeweils eigene Ansichten, sind aber vom Menü aus mit einem Tipp erreichbar.

## 0.28.6 – PDF-Belege wirklich öffnen

PDF-Belege zeigen jetzt ihren Inhalt statt nur des Schriftzugs „PDF“. In der Vollbildansicht
kannst du durch die Seiten blättern, sie vergrößern und den Ausschnitt verschieben. Auch
direkt in einer Rechnung öffnet ein Tipp auf den angehängten Beleg die Ansicht.

Bereits auf dem Gerät gespeicherte Belege lassen sich ohne Netz ansehen. Ist eine Datei
nicht verfügbar oder nicht lesbar, erscheint eine Fehlermeldung mit „Erneut versuchen“.

## 0.28.5 – Belege nicht doppelt ablegen

Beim erneuten Auswählen einer bereits bekannten Belegdatei wird keine weitere Kopie
hochgeladen. Gehört sie schon zu einer Rechnung, kannst du diese direkt öffnen, statt
dieselben Kosten noch einmal anzulegen. Ein noch nicht zugeordneter Beleg wird wiederverwendet.

Die Rechnung lässt sich erst speichern, wenn das Belegfoto angehängt und das Auslesen
abgeschlossen ist. Dadurch geht die Verbindung zum Foto nicht mehr verloren, wenn die
Verarbeitung länger dauert. Ohne Verbindung wartet das Speichern nicht mehr unbegrenzt
auf den Server; die Synchronisierung läuft später weiter.

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
