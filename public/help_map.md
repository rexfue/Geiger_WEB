##Info zur Karte
Auf dieser Karte hat jeder Sensor ein rundes Icon (Radioaktivitäs-Symbol). Die Farbe des Symbols ist abhängig von der aktuellen Zählrate. Es gelten folgende Beziehungen:  

| Wert | Farbe | Bemerkung
-------|-------|----------
  0 | grau |der Sensor hat seit mind. einer Stunde keine Daten gesendet
< 30 | grün | die sogenannte Null-Rate
< 100 | gelbgrün |
< 250 | gelb |
< 500 | orange |
\>= 500 | rot

Wenn sich ein Sensor länger als einen Monat nicht gemeldet hat, wird er nicht mehr angezeigt.

Bein Aufruf der Karte ohne Sensornummer (also <https://test1.rexfue.de> oder <https://test1.rexfue.de/map> ) wird die Karte auf Stuttgart-Mitte zentriert. Wird eine Sensornummer mit übergeben (als z.B. <https://test1.rexfue.de/map?sid=31122> so wird die Karte auf diesen Sensor zentriert.  
Ebenso wird auf den Sensor zentriert, wenn von der Grafik-Darstellung auf die Kartendarstellung umgeschaltet wird.

Ein Klick auf ein Sensor-Icon lässt eine kleine Infotafel aufpoppen. Auf dieser Tafel steht die Sensornummer, der aktuelle Wert (in cpm = counts per minute) sowie ein Link. Durch Klick auf den Link erreicht man die Grafik-Ausgabe, d.h. es wird der zeitliche Verlauf der Sensorwerte dargestellt.

Die Karte kann durch Klick auf das Plus- bzw. Minus-Zeichen links oben gezoomed werden. Durch Klicken in der Karte und halten kann mit der Maus der Kartenausschnitt verschoben werden.

Mit dem **Zentrieren**-Knopf kann ein neuer Kartenmittelpunkt festgelegt werden. Es muss ein Ort eingegeben werden. Die Suche nach den Koordintaen des Ortes erfolgt online, d.h. es kann sein, dass der falsche Ort gefunden wird, dann kann die Suche verfeinert werden. Z.B wenn Stuttgart in den USA gesucht werden soll, dann kann Stuttgart,USA eingegeben werden.

Mit dem **zurück**-Knopf gelangt man zurück zur zuletzt angezeigten Grafik-Darstellung.

Da die Sensoren alle 10min Daten senden, wird auch die Information auf der Karte alle 10min erneuert.

Die Grafik eines Sensor kann auch direkt über die URL <https://test1.rexfue.de/xxxx> aufgerufen werden. xxxx ist die gewünschte Sensor-Nummer, also z.B.: <https://test1.rexfue.de/31122>.

 Hier gehts zum [Impressum]('https://rexfue.de/impressum.html')