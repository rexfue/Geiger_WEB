#!/usr/bin/env python
# -*- coding: utf-8 -*-
'''
Einlesen der aktuellen Daten vom Madavi und Eintragen der Werte in die Mongo-DB
Es werden hier immer nur die aktuellen Werte, die gerade von Madavi kommen, eingetragen, d.h. es gibt kein Werte älter als 5min.
 
 Diese Kollection dient zur Anzeige der Daten auf der MAP und ggf. zur Überwachung, ob alle Sensoren auch senden.
 
 Gespeicher wird in der Collection 'allewerte'

V 1.0  2917-02-27 rxf
    Neue Datenbank-Struktur
    
    
Datenbank-Struktur:
{
_id: Sensor-Id
loc: {
        type: 'Point',
        coordinates: [lon,lat]            (lon,lat aus der datei)
     }
data: [
       {
           time: timestamp,
           P10: value_P10,
           P2_5: value_P2-5               
        }, {
           time: timestamp,
           P10: value_P10,
           P2_5: value_P2-5               
        },{
            ....
        }
       ],
average: {
            P10_avg: average over last 5 min,
            P2_5_avg: average over last 5 min
        }
}
'''

import json
import pymongo
from pymongo import MongoClient
import requests
from datetime import datetime
import dateutil.parser
import sys

# Globale Konstanten
MONGOHOST = "localhost"
MONGOURL= 'mongodb://'+MONGOHOST+':27017/'
MONGODBASE = 'Feinstaub_AllNew'
# APIURL = 'https://www.madavi.de/sensor/feinstaub-map-sds/data.json'
APIURL = 'https://api.luftdaten.info/static/v1/data.json'
COLLECTION = 'aktwerte'

def getDataValues(x):
    ''' aus dem übergeben Record x nun die enthaltenen Daten rausbasteln und
    in einem Objekt übergeen
    '''
    ts = dateutil.parser.parse(x['timestamp'])
    werte = {}
    werte['time'] = ts
    sv = x['sensordatavalues']
    for val in sv:                              # die richtigen Werte rausbasteln
        t = val['value_type']
        if t == 'P1' or t == 'P2' or t == 'temperature' or t == 'humidity' or t == 'pressure':
            if t == 'P1':
                t = 'P10'                       # Text etwas umschreiben
            if t == 'P2':
                t = 'P2_5'    
            werte[t] = float(val['value'])   # Wertt als FLOAT eintragen
    return werte        

def checkParticulate(values):
    '''Prüfen, ob dieser Datensatz einer mit P1- oder P2-Werten ist. Wenn
    ja, dann True zurückgeben '''
    
    for v in values:
        if v['value_type'] == 'P1' or v['value_type'] == 'P2':
            return True
    return False

def checklatlon(wert):
    if wert == None or wert == '':
        return 999.0
    else:
        return float(wert)

def getandsaveAktdata(db,live):
    """ Die gerade aktuellen Daten von luftdaten.info holen und 
    nur Daten der Feinstaub-Sensoren in die DB eintragen """

    # Die aktuellen Daten vom madavi oder von Disk holen 
    if live == True:
        try:
            r = requests.get(APIURL)                    # Fetch data from server
        except:
            return 'Probleme (reuqest) beim Lesen der Daten'      # Problem: give up
                
        if r.status_code != 200:                        # error ?
            return 'Konnte aktuelle Daten von ' + APIURL + ' nicht laden'  # Yes, give up
        else:
            try:
                aktData = r.json()                      # decode data 
            except:
                return 'Probleme (json) beim Lesen der Daten'   # Problem: give up
            
            with open('data/aktdata.txt','w') as f:  # all OK, write data also to disk 
                f.write(r.text);
    else:
        with open('data/aktdata.txt') as f:      
            aktData = json.loads(f.read())    

    # Now enter data into database
    collection = db[COLLECTION]    
    
    # first delete ALL old data
    collection.drop()
    # then create the indexex again
    collection.create_index('data.time')
    collection.create_index( [('loc', pymongo.GEOSPHERE )])
    
    for x in aktData:
        if not checkParticulate(x['sensordatavalues']): # only use particulate matter sensors
            continue
        if x['sensor']['sensor_type']['name'] == "PPD42NS":
            continue
        toInsert =  {}                              # Object für den Eintrag in die DB
        # Zunächst die Sensornummer rausholen, prüfen, ob die schon drin ist
        # und wenn  nicht, dann eintragten
        sid = x['sensor']['id']                     # Sensor-ID
        toInsert['_id'] = sid
        erg = collection.find_one(toInsert)         # nach der Sensor-ID in der DB suchen
        if erg == None:                             # die Sensor-ID ist noch nicht da
#            print (x)
            lat = checklatlon(x['location']['latitude'])
            lon = checklatlon(x['location']['longitude'])
            if lat == 999.0 or lon == 999.0:
                toInsert['loc'] = {}
            else:    
                toInsert['loc'] = { 'type': 'Point', 'coordinates': [lon,lat]}  # die Koordinten eintragen
            toInsert['data'] = [ getDataValues(x) ]  # Die Werte holen
            collection.insert_one(toInsert)         # und das Alles in die DB rein
#            print(toInsert)    
        else:                                       # die Sensor-ID ist in der DB 
            # also die neuen Daten eintragen
            erg1 = collection.find({'data' : {'$exists': 'true'}})
            if erg1 == None:
                collection.update_one({'_id' : erg['_id']},{'$set': { 'data': getDataValues(x) }})
            else:
                collection.update_one({'_id' : erg['_id']},{'$push': { 'data': getDataValues(x) }})
    return 'OK'         
# Ende def getandsaveAktdata(db):

def buildLastValues(db):
    ''' Durch alle Sensoren in der Datenbank durchgehen, jeweils
    den Mittelwert der daten bilden und als 'average' in die DB zurückspeichern '''

    collection = db[COLLECTION]        
    cursor = collection.find()                      # Alle holen
    for c in cursor:                                # und durchgehen
        sum10=0
        sum25=0
        for i in range(0,len(c['data'])):
            werte = c['data'][i]
            if 'P10' in werte:
                sum10 += werte['P10']
            if 'P2_5' in werte:
                sum25 += werte['P2_5']
        collection.update_one({'_id': c['_id']},{'$set' : {'average': {'P10_avg':sum10/(i+1), 'P2_5_avg': sum25/(i+1)}}})        
    
    
def main():
    print(str(datetime.now()))

    # Vorbereitung für die Dataenbank
    client = MongoClient(MONGOURL)
    db = client[MONGODBASE]
    
    # Ablauf des Ganzen
    ret = getandsaveAktdata(db,True)        # True: Daten live von luftdaten.info holen
    if ret != 'OK':                         # Wenn Fehler,
        print("Fehler:",ret)                # diesen ausgeben
        
    # Berechnen und speichern der Mittelwerte
    buildLastValues(db);
    
    # Datenbank schließen
    client.close()
    
    print(str(datetime.now()),"Alles fertig. Ende - Aus")
# Ende def main():

if __name__ == '__main__':
    main()
