# Was neu ist

Die Texte, die in der App im Update-Banner stehen. Sie sind für den Menschen am Telefon
geschrieben, nicht für den Entwickler: was sich an der Bedienung ändert, in ganzen Sätzen,
ohne Dateinamen, Testzahlen und Commit-Prosa.

Eine Überschrift pro Version, `## <Version> – <Schlagzeile>`, darunter ein bis drei kurze
Absätze. Die Schlagzeile ist die Zeile, die im eingeklappten Banner steht. Fehlt eine
Version hier, nimmt der Build die Commit-Nachricht – und die liest sich dann auch so.

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
