#Feinstaub ToDos
letzte Änderung: 2018-09-06

### Properties
* Typ einführen: PM,T,TH,THP,TP, .... Erkennen am Vorhandensein der Werte
* Änderungen berücksichtigen von
 * Typ
 * Adresse

### Sonstiges
* Bewegung darstellen, d.h. z.B. mehrere Sensoren über merhrere Tage laufen lassen
* Ausgabe aller möglichen Sensortypen, Eintrag in eine DB namens 'typen' und falls es da eine Änderung gibt, dieses per email melden
* Anfragende IP merken
* Anfragende Sensornummer merken
* **rexfue.de** wieder so herrichten, dass man das aufrufen kann
* Sensor an **opensensmap** schicken


 
### Oberfläche
* Kein refresh bei Woche/Monat, d.h. den refresh an 'live' binden
* Farben der Buttons von Hand machen (hover etc)
* ältere Daten doch per CSV holen
* bei Programmstart und bei Sensorwechsel das Datum des ältesten Eintrages holen und damit dann die Wahl des Start-Tages begrenzen (gg. Fehlermeldung)
* Info-Tafel mit 'Aktuelle Werte' wegmachen, wenn wir nicht 'live'sind, d.h. wenn ein Tag eingebeben wurde
* **Grundsätzlich** die Grafikbilder darstellen, ob nun Daten da sind oder nicht oder obs den Sensor gibt oder nicht
* mehrere SIDs im selben Plot vergleichen
* Hüllkurve rechnen und einzeichen, Spitzen, die da rausfallen, als Linie dazu malen

### Location
* Programm 'location' checken, ob auch Alles richtig eingetragen wird
* Alle, die keine Adresse oder auch keine Altitude haben, holen und eintragen


### MAP
* **Ohne** extra Window, sondern das vorhanden ersetzetn, so, dass der Kopf mit den Date identisch bleibt (vielleicht D3.js?)
* gweählten Sensor markieren (Blinken o.ä.)
* Sensorliste aus den *properties* innerhalb der 'bounds' lesen
 * damit dann über die API **alle** werte der letzten 5min als Mittelwerte holen
* für die gpx-bounds: ein eigenes Programm, evtl. Python, das 1x pro Tag die Sensoren innerhalb der gpx-bounds holt und in einer Textdatei als array ablegt. 
* Falls mehrere Sensoren auf den selben Koordinaten liegen (oder sehr eng), dann per Klick der Reihe nach anwählen lassen
* Infotafel bei 'hover' erscheinen lassen (bei iPad dann bei Klick) -> gibt aber Problem, wenn mehrere Sensoren auf einem Fleck sitzen
* Start bei Aufruf ohne SID immer mit der Stadt (Koordinaten), die in localStorage steht. Wenn da nix drin, dann mit Stuttgart
* Legende für die Farben dazu
* Sensorwahl ermöglichen
* Zusammenfassen von Sensoren beim raus zoomen. Sensoren im Bereich (z.B. 50px) sortieren, die größten weg und denn den Duschnitt der restlichen als 1 Balken dartstellen
* Darstellung des weißen Balken evtl nur für 10 sec und auch nicht 100% dicht sondern leicht durchscheinend

### D2Mongo
* Speedup
 * am Anfan die Properties für alle einlesen
 * *insertMany* **ohne** den 'wait', dafür ein Promise-Array einführen und alle parallel ablaufen lassen
 * am Ende das Promise-Array abfragen, ob alle fertig sind  
 * Collection trennen: valuesPM und valuesTHP ??
* Überflüssige (nicht mehr verwendete) Dateien raus löschen
* Datenbank-**Backup** 
* evtl **doch** die Mittelwerte beim Einlesen mitrechnen
	* oder direkt von madavi einlesen (es gibt da 5min- und 24h-Werte
* auch min/max mitrechnen
* CSV Dateien einlesen 
* Fehlerbehandlung:
	* wenn parse-Fehler kommt: exit -1
	* wenn schon in dbase Fehler kommt: exit -2
	* im script dann bei exit -1 sofort nochmal einlesen und bei exit -2 60sec warten (max. 2x) 
* extra Programm, das die Werte avg24, min, max in alle Dokumente reinschreibt (neue DB)
* evtl. jeden Tag die Propertien mit ablegen
 
### API
* span=0 testen -> soll die aktuellen Werte liefern über avg gemittelt 
* **Problem:**  
bei avg=1440 und span=0 ist kein Wert >= start in dem Array, d.h. das Mittelwert-Ergebnis kann nicht gefunden werden
* Durchschnitt aller Werte in einem bestimmten Gebiet (nach Koordinaten) ausgeben (die Ausreißer müssen vorher weg)
* erkennen, welcher Typ gerade da ist, damit bei leeren Daten trotzdem die THP geskipped werden können (?)
* für die Stuttgarter (oder auch andere Städte) ein eigenes Progrämmle, das 1x täglich die Sensornummern hoilt un in ein Array (oder die DB!) schreibt
* Liste mit den Problem-Sensoren

### Sharding-Test
* alte Daten da rein füttern mit einem kleinen Progämmle (zunächst mal ab 2018-01-01)


### MySIDs-Check
* prüfen, ob die wirklich richtig nur 1x gemeldet weden
* eine GUT-Meldung absetzten, wenn der Sensor wieder kommt


###Einstellungen
* Einstellung der Farben für die Grafik-Linien vorsehen
* Favoriten einführen
* Evtl. wählen lassen, ob die Grafik vor 24h oder immer um 0h00 beginnt
* Übersetzung auf Englisch
* Sprachwahl dann dazu

###FST-Problem-Sensoren
* request: Error abfangen (z.B. 504)
* Durchschnitt für ca. 1km rechnen wenn da noch >= 3 Sensoren vorhanden sind. Die, die da etwa. 50% drüber liegen, als Problem-Sensor markieren und nicht anzeigen
* Meldung, dass der Sensor Probleme hat (auch welche) schon gleich bei der Grafik, nicht erst bei der Map
* API mit der Liste dieser Senoren (sie auch API)
* evtl. weiter problematische Senoren von Hand raussuchen und in der DB in einer eigene Kategire sammel, extr Text dazu nbauen, der dann angezeigt wird
* neue bzw. welche, die rausgefallen sind erkennen und entweder im log melden oder per email

###Tests
* Lesezeit für alle Stadt-Sensoren über die alte und die neue DB vergleichen
* 