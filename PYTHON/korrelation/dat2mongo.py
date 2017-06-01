#!/usr/bin/env python
# -*- coding: utf-8 -*-
'''
Einlesen der aktuellen Daten vom Madavi und Eintragen der Werte in die Mongo-DB

V 1.0  2016-12-07  rxf
    Erste Version
    
'''

import json
import pymongo
from pymongo import MongoClient
import requests
from datetime import datetime
import dateutil.parser

# Globale Konstanten
MONGOHOST = "localhost"
MONGOURL= 'mongodb://'+MONGOHOST+':27017/'
MONGODBASE = 'Feinstaub_AllNew'
# APIURL = 'https://www.madavi.de/sensor/feinstaub-map-sds/data.json'
APIURL = 'https://api.luftdaten.info/static/v1/data.json'

def getandsaveAktdata(db,live):
    """ Die gerade aktuellen Daten von luftdaten holen und die Daten 
    der Sensoren in die DB eintragen """

    # Die aktuellen Daten von luftdaten.info oder von Disk holen 
    start = datetime.now()
    if live == True:
        r = requests.get(APIURL)
        if r.status_code != 200:
            return 'Konnte aktuelle Daten von ' + APIURL + ' nicht laden'
        else:
            # print(r.headers)
            aktData = r.json()                      # Daten einlesen und JSON parsen 
            with open('../data/aktdata.json','w') as f:  # und auch zusätzlich auf
                f.write(r.text);                    # Disk schreiben
    else:
        with open('../data/aktdata.json') as f:      
            aktData = json.loads(f.read())    

    # Die Daten in aktData nun der Reihe nach in die DB eintragen
    for x in aktData:
        if x['sensor']['sensor_type']['name'] == 'PPD42NS': # PPD-Sensoren ignorieren
            continue
        toInsert =  {}                              # Object für den Eintrag in die DB
        ts = dateutil.parser.parse(x['timestamp'])
        toInsert['date'] = ts                       # Datum eintragen    
        sv = x['sensordatavalues']
        for val in sv:                              # die richtigen Werte rausbasteln
            t = val['value_type']
            if t == 'P1' or t == 'P2' or t == 'temperature' or t == 'humidity' or t == 'pressure':
                if t == 'P1':
                    t = 'P10'                       # Text etwas umschreiben
                if t == 'P2':
                    t = 'P2_5'    
                toInsert[t] = float(val['value'])   # Wert als FLOAT eintragen
                collStr = 'data_' + str(x['sensor']['id']) + '_' + x['sensor']['sensor_type']['name']  
                if x['sensor']['id'] == 141:
                    print ('141: ')
                    print(toInsert)
                    print(collStr)
                collection = db[collStr]            # Daten als 'update' in die DB eintragen
                collection.update_one({'date':toInsert['date']}, {'$set': toInsert}, upsert=True )
    end = datetime.now()
    print ("Zeitverbrauch: ",start,end)
    return 'OK'                                     # wenn Aless durch, OK übertragen
# Ende def getandsaveAktdata(db):

def buildLastValues(db):
    ''' Durch alle Collections in der Datenbank durchgehen, jeweils
    den Mittelwert der letzten 5 Werte bilden und dies dann in einem
    File abspeichern'''
    fileName = '../data/mapvalues.txt'
    collections = db.collection_names();
    for c in collections:
        if c.endswith('SDS011') and c.startswith('data'):
            print(c)
            erg = db[c].find({}, sort=[('date',pymongo.DESCENDING)],limit=5)
            sum1=0
            sum2=0
            datum = erg[0]['date']
            for e in erg:
                sum1 = sum1 + e['P10']
                sum2 = sum2 + e['P2_5']
            print(c,'P10avg=',sum1/5,'  P2_5avg=',sum2/5)
    
def main():
    print(str(datetime.now()))

    # Vorbereitung für die Dataenbank
    client = MongoClient(MONGOURL)
    db = client[MONGODBASE]
    
    # Erzeugen einer Datei, in der die Werte der letzten 5min als Mittelwert
    # stehen.
#    buildLastValues(db);
    
    
    # Ablauf des Ganzen
    ret = getandsaveAktdata(db,True)        # True: Daten live von madavi holen
    if ret != 'OK':                         # Wenn Fehler,
        print("Fehler:",ret)                # diesen ausgeben
        
    # Datenbank schließen
    client.close()
    
#    print("Alles ferig. Ende - Aus")
# Ende def main():

if __name__ == '__main__':
    main()
