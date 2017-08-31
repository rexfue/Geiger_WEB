#!/usr/bin/env python3
# -*- coding: utf-8 -*-
'''
Created on 13 Jun 2017

@author: rxf
'''

'''
Durchgehen aller data-Collections und jeweils einen TTL-Index auf das Datum
mit 400 Tagen (34560000sec) expire time setzen

V 1.0  2016-12-07  rxf
    Erste Version
    
'''

from pymongo import MongoClient
from datetime import datetime

# Globale Konstanten
MONGOHOST = "fst-mongo"
MONGOURL= 'mongodb://'+MONGOHOST+':27017/'
MONGODBASE = 'Feinstaub_AllNew1'

def indexAlreadyThere(db,c):
    ''' Chaec, if index on date is ther. If yes, return True'''
    idx = db[c].list_indexes();
    for x in idx:
        if x['name'] == "date_1":
            return True
    return False


def main():
        print(str(datetime.now()))
        
        # Vorbereitung für die Dataenbank
        client = MongoClient(MONGOURL)
        db = client[MONGODBASE]

        collections = db.collection_names();
        for c in collections:
            if not c.startswith('data'):
                continue
            if indexAlreadyThere(db,c) == True:
                continue
            db[c].create_index('date',expireAfterSeconds=34560000)     
            print('createIndex date in',c)
        print(str(datetime.now()))
            

if __name__ == '__main__':
    main()