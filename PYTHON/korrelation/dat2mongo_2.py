#!/usr/bin/env python3
# -*- coding: utf-8 -*-
'''
Read actual data from 'luftdaten.info' an store them in mongo database

For every sensor there is one collection ( named 'data_NMBR_NAME') in the database. The incoming data will be
stored in the appropriate collection. (Naming: NMBR is sensor-ID, NAME is sensor name)

Additionaly all data from this incoming batch will be stored in an extra collection
named 'data_formap'. In this collection there are only the last 5 m inutes; it will be
used at the map


V 1.0  2017-06-13 rxf
    Merged version from older programs
    
Structure:
data-collections:

Particulate-matter-sensors:  (example)
{
    "_id" : ObjectId("584fcf61e18d0e8fb0eb5bd8"),                    // record ID
    "date" : ISODate("2016-08-12T14:53:48.715Z"),                    // timestamp for this values
    "P10" : 6.97,                                                    // value of P10 as float    
    "P2_5" : 5.13                                                    // value of P2.5 as float
}

Temperatur and pressure sensors:  (example)
{
    "_id" : ObjectId("58f20ecf2d0c38a8ec593045"),                    // record ID
    "date" : ISODate("2017-04-15T12:10:46Z"),                        // timestamp for this values
    "temperature" : 15.65,                                           // value of temperature (float) 
    "humidity" : 46.02,                                              // value of humidity (if sensor has it)
    "pressure" : 98400.44                                            // value of pressure (if sensor has it)
}

Collection 'data_formap'  (example)
{
_id: 123                                                            // Sensor-ID
    "data" : [                                                      // data, every minute, max 5 min  
        {
            "P2_5" : 6.1,                                           // value of P2.5 as float
            "date" : ISODate("2017-06-13T09:14:10Z"),               // timestamp for this value 
            "P10" : 70.17                                           // value of P10 as float
        },
        {
            "P2_5" : 3.6,
            "date" : ISODate("2017-06-13T09:16:37Z"),
            "P10" : 13.87
        }
    ],
    "loc" : {                                                        // location of this sensor
        "coordinates" : [                                            // as geocoordinates for mongo db
            8.541,
            47.429
        ],
        "type" : "Point"
    },
    "average" : {                                                    // average values over all data points
        "P10_avg" : 42.02,
        "P2_5_avg" : 4.85
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

# Globale constants
MONGOHOST = "fst-mongo"
MONGOURL= 'mongodb://'+MONGOHOST+':27017/'
MONGODBASE = 'Feinstaub_AllNew1'
APIURL = 'https://api.luftdaten.info/static/v1/data.json'
MAPCOLLECTION = 'data_formap'  
MAPCOLLPATH = 'data/data_formap.json'                                       # collection for map data 

# Global variables
recordCnt = 0

def getDataValues(x):
    ''' aus dem übergeben Record x nun die enthaltenen Daten rausbasteln und
    in einem Objekt übergeen
    '''
    ts = dateutil.parser.parse(x['timestamp'])
    werte = {}
    werte['date'] = ts
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

def doInsertMapData(db,x,collection):
    ''' from given record x extract data für map collection ('data_formap') and store
    them isto dbase '''

    toInsert = {}                               # Empty object to collect the data
    # First extract sensor id and check, if ist is already in the collection
    sid = x['sensor']['id']                     # Sensor-ID
    toInsert['_id'] = sid
    erg = collection.find_one(toInsert)         # search for this sensir in collection
    if erg == None:                             # sensor is NOT there:
#            print (x)
        lat = checklatlon(x['location']['latitude'])    # extract coordinates
        lon = checklatlon(x['location']['longitude'])
        if lat == 999.0 or lon == 999.0:        # if not given, insert empty loc-object
            toInsert['loc'] = {}
        else:    
            toInsert['loc'] = { 'type': 'Point', 'coordinates': [lon,lat]}  # insert the coordinates
        toInsert['data'] = [ getDataValues(x) ]  # fetch the values to insert
        collection.insert_one(toInsert)          # and now put all into dbase
#            print(toInsert)    
    else:                                       # sensor is already in dbase: update with ne data
        erg1 = collection.find({'data' : {'$exists': 'true'}})
        if erg1 == None:
            collection.update_one({'_id' : erg['_id']},{'$set': { 'data': getDataValues(x) }})
        else:
            collection.update_one({'_id' : erg['_id']},{'$push': { 'data': getDataValues(x) }})
# End: def doInsertMapData(db,x,collection):    



    
def doInsertAllData(db,x):
    ''' store all data drom this record into dbase '''

    global recordCnt
    
    toInsert = getDataValues(x)                  # fetch the values to insert
    collStr = 'data_' + str(x['sensor']['id'])  # name of sensor collectionjedi  
#    if x['sensor']['id'] == 141:
#        print ('141: ')
#        print(toInsert)
#        print(collStr)
    collection = db[collStr]            # Daten als 'update' in die DB eintragen
    collection.update_one({'date':toInsert['date']}, {'$set': toInsert}, upsert=True )
    recordCnt = recordCnt+1
    return 'OK'                                     # wenn Aless durch, OK übertragen
# End: def doInsertAllData(db,x):

    
    
def getandsaveAktdata(db,live):
    """ Fetch actual data from 'luftdaten.info' and store them in database """
 
    # Fetch data from luftdate.info 
    if live == True:
        try:
            r = requests.get(APIURL)                    # Fetch data from server
        except:
            return 'Issues (reuqest) during read'       # isuues: give up
                
        if r.status_code != 200:                        # error ?
            return "Could'nt read data from  " + APIURL   # Yes, give up
        else:
            try:
                aktData = r.json()                      # decode data 
            except:
                return 'Issues (json) during read'      # issues: give up
            
            with open(MAPCOLLPATH,'w') as f:  # all OK, write data also to disk 
                f.write(r.text);
    else:
        with open(MAPCOLLPATH) as f:          # NOT live: so read from disk
            aktData = json.loads(f.read())    

    # Prepare collection for map use
    mapcollection = db[MAPCOLLECTION]    
    # first delete ALL old data
    mapcollection.drop()
    # then create the indexex again
    mapcollection.create_index('data.data')
    mapcollection.create_index( [('loc', pymongo.GEOSPHERE )])
    
    # go through asll data
    for x in aktData:
        if x['sensor']['sensor_type']['name'] == "PPD42NS":
            continue                                # dont save old sensor !
        doInsertAllData(db,x);                      # normal data into database
        if checkParticulate(x['sensordatavalues']): # if it is a particulate matter sensor
            doInsertMapData(db,x,mapcollection);                  # then also put datat into map collection
    # All data inserted. Now calculate the average over the last received values (max. 5 min) for
    # using in infowindow on map
    buildAverageValues(db,mapcollection)     
    return 'OK'    
# End: def getandsaveAktdata(db):


def buildAverageValues(db,collection):
    ''' Pass through all values in data_formap collection, calculate the average for 
    each and store in dbase'''

    cursor = collection.find()                      # fetch all data
    for c in cursor:                                # and pass through all recods
        sum10=0
        sum25=0
        cnt1=0
        cnt2=0
        for i in range(0,len(c['data'])):
            werte = c['data'][i]
            if 'P10' in werte:
                sum10 += werte['P10']
                cnt1 = cnt1+1
            if 'P2_5' in werte:
                sum25 += werte['P2_5']
                cnt2 = cnt2+1
        if cnt1 == 0:
            avg10 = 0
        else:
            avg10 = sum10/cnt1
        if cnt2 == 0:
            avg25 = 0
        else:
            avg25 = sum25/cnt2
        collection.update_one({'_id': c['_id']},{'$set' : {'average': {'P10_avg':avg10, 'P2_5_avg': avg25}}})        
    
    
def main():
    global recordCnt
    
    print(str(datetime.now()),'Start reading new data ...')

    # prepare database connection
    client = MongoClient(MONGOURL)
    db = client[MONGODBASE]
    
    # main loop
    ret = getandsaveAktdata(db,True)        # True: use live data; False: use stored data from disk (debug)
    if ret != 'OK':                         # error?
        print("ERROR:",ret)                 # show it
        
    # Clopse dbase
    client.close()
    
    print('stored',recordCnt,'records')
    print(str(datetime.now()),"... end reading data. Finished")
# End: def main():

if __name__ == '__main__':
    main()
