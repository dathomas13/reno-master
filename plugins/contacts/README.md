# Contacts

Liest das Adressbuch des Geräts für den Kontakt-Import in der App.

Die Web Contact Picker API (`navigator.contacts`), die der Browser-Build benutzt, geht in
diesem WebView nicht: Chromium meldet die API als vorhanden und beantwortet sogar
`getProperties()`, aber `select()` scheitert immer sofort mit „Unable to open a contact
selector" - dem WebView fehlt die Activity, die den Auswahldialog anzeigen könnte, anders
als bei einem echten Chrome-Tab. Einen zuverlässigen Mehrfachauswahl-Dialog kennt Android
über Intents ohnehin nicht. Dieses Plugin liest das Adressbuch deshalb direkt (wie
`MediaStore` die Galerie), und dieselbe Übersichtsliste, die schon den vCard-Import
anzeigt, übernimmt Auswahl und Import.

## Methoden

| Methode | Zweck |
|---|---|
| `hasPermission()` | `{ granted }` - liegt die Leseberechtigung schon vor? |
| `requestPermission()` | Fragt danach, `{ granted }` mit dem Ergebnis |
| `listContacts({ limit? })` | `{ contacts: [{ name, phone?, email?, company? }] }`, alphabetisch |

`listContacts` fragt die Berechtigung selbst nach, falls sie fehlt - ein eigener Aufruf von
`requestPermission()` davor ist nicht nötig, aber möglich, um vorher etwas anzuzeigen.

## Details, die nicht offensichtlich sind

- **Drei Tabellen, eine Zeile pro Kontakt.** Android trennt Name, Telefonnummern, E-Mails
  und Firma in eigene Tabellen (`ContactsContract.CommonDataKinds.*`), mit potenziell
  mehreren Zeilen je Kontakt. Für die Import-Übersicht reicht der jeweils erste Treffer je
  Feld - keine volle Kontaktkarte.
- Ein Kontakt ohne Namen wird übersprungen; ohne Namen gibt es später auch keinen
  `Contact`-Namen zum Speichern.
- Die Berechtigung `READ_CONTACTS` bringt das Plugin selbst mit.
