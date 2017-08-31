#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Coorelation between sensor-ID ans location
#
# V 2.0  2017-06-14 rxf
# 	- Now using data on disk (aktdata.json) that will be written
#	  every 5 min from dat2mongo.py
#	- If there are new sensors, create TTL-Index on that collection
#
# V 1.0 2017-04-16  rxf
#	First Version
#

# Structure of colletion 'koorrelations'
#{
#	"_id" : ObjectId("58f5ea0be1382382763c8089"),		// ID of record
#	"espid" : "",										// ID of NIDE-MCU (no longer used, always empty)
#	"sensors" : [										// Array of sensors at that location
#		{
#			"name" : "DHT22",							// Name of sensor
#			"id" : 657									// ID of sensor
#		},
#		{
#			"name" : "SDS011",
#			"id" : 658
#		}
#	],
#	"location" : {										// location data
#		"altitude" : 0,										
#		"longitude" : 9.235,
#		"latitude" : 48.777,
#		"country:" : "DE",
#		"id" : 28										// location ID from 'luftdate.onfo' recirds
#	},
#	"address" : {										// posta addres of location coordinates
#		"country" : "DE",
#		"plz" : "70327",
#		"city" : "Stuttgart",
#		"number" : "232-242",
#		"region" : "Wangen",
#		"street" : "Ulmer Str."
#	}
#}

import json
from pymongo import MongoClient
from datetime import datetime
import requests

# Globale Konstanten
MONGOHOST = "fst-mongo"
MONGOURL= 'mongodb://'+MONGOHOST+':27017/'
MONGODBASE = 'Feinstaub_AllNew1'
KORRCOLL = 'korrelations'
DATAPATH = 'data/'

	
def addAltitude(loc):
	""" fetch the altitude of location coordinates via Google-API """
	try:
		r = requests.get('https://maps.googleapis.com/maps/api/elevation/json?locations={0},{1}&key=AIzaSyBpQm2BKLtU2oxdrgy45s27ao3J1cBj64E'.format(loc[0],loc[1]))
		places = r.json()
		eletxt = 'At {0} elevation is: {1}'
		print (eletxt.format(loc, places['results'][0]['elevation']))
	except:
		print (('Error in altitude for location: {0}').format(loc))
		return 0
	return round(places['results'][0]['elevation'])
#Ende: def addAltitude(loc):

	
def addAddress(loc):
	""" Fetch address for location coordinates via Google-API """

	try:
		r = requests.get('https://maps.googleapis.com/maps/api/geocode/json?latlng={0},{1}&key=AIzaSyBpQm2BKLtU2oxdrgy45s27ao3J1cBj64E'.format(loc[0],loc[1]))
		addr = r.json()
#		print (addr)
	except:
		print(('Error in address for location: {0}').format(loc))
		return ""
	return addr['results'][0]['address_components']
#end: def addAddress(loc):


def checklatlon(wert):
	''' Check, if latitude or longitude are valid. if not, return 0 '''
	
	if wert == None or wert == '':
		return 0.0
	else:
		return float(wert)
#End: def checklatlon(wert):

def buildTTLIndex(db,sid,name):
	''' for give sensor ID create the TTL-index with expiration 
	after 400 days  (= 34560000 sec) '''
	collstr = 'data_'+sid+'_'+name
	db[collstr].create_index('date',expireAfterSeconds=34560000)	 
	print('createIndex date in',collstr)
#End: def buildTTLIndex(db,id):


def getAktdata(db):
	""" Fetch relevant sensor data and location info from data file 'aktdata.json' on disk.
	This file will be written every 5 min by dat2mong.py and contains the same data as where
	get from luftdaten.onfo
	"""	
	with open('data/aktdata.json') as f:
		aktDaten =  json.loads(f.read())					# get th data
	for x in aktDaten:										# go through every record
		# print(x)
		sensorname = x['sensor']['sensor_type']['name'] 	# extract sensor name
		if  sensorname == 'PPD42NS':						# ignire this old sensor
			continue		
		sid = int(x['sensor']['id'])						# extract sensor-ID
		# Geokoordinaten in Float umrechnen
		lat = checklatlon(x['location']['latitude'])	# extract coordinates
		lon = checklatlon(x['location']['longitude'])
		lid = int(x['location']['id'])
		one = {}	
		one['location'] = {'longitude':lon, 'latitude':lat, 'altitude':0, 'id':lid }  # Daten zusammestellen
		one['espid'] = ''
		one['sensors'] = [{'id':sid,'name':sensorname}]
		collStr = KORRCOLL							# Name der collection
		collection = db[collStr]
		doIndex = False
		res = collection.find_one({'location.id':lid})
		if res == None: 							# falls noch nicht eingetragen
			print("New location: " + sensorname + ' ' + str(sid))
			one['location']['altitude'] =  addAltitude([lat,lon])	# bei Google die Höhe holen und eintragen
			addr = addAddress([lat,lon])			# und bei Google die Adresse holen
			toinsert = {}
			if addr != "":
				for i in range(0,len(addr)):
					if addr[i]['types'][0] == 'street_number':
						toinsert['number'] = addr[i]['short_name']
					if addr[i]['types'][0] == 'route':
						toinsert['street'] = addr[i]['short_name']
					if addr[i]['types'][0] == 'locality':
						toinsert['city'] = addr[i]['long_name']
					if addr[i]['types'][0] == 'country':
						toinsert['country'] = addr[i]['short_name']
					if addr[i]['types'][0] == 'political':
						toinsert['region'] = addr[i]['short_name']
					if addr[i]['types'][0] == 'postal_code':
						toinsert['plz'] = addr[i]['short_name']
				one['address'] = toinsert	
				print(one['address'])
			collection.insert_one(one)				# nun eintragen
			doIndex = True
		else:										# ist dieser Sensor schon eingetragen?
			erg = collection.find_one({'sensors':{'$elemMatch':{'id':sid}}}) 
			if  erg == None:	# Nein -> also eintragen
				collection.update({'location.id':lid}, {'$push': {'sensors': {'id':sid,'name':sensorname}}})	
				print("New entry: " + sensorname + ' ' + str(sid))
				doIndex = True
		if doIndex == True:
			buildTTLIndex(db,str(sid),sensorname)					# New entry,. now build the Index
# End: def getAktdata(db):

		
def main():
	# Vorbereitung für die Dataenbank
	client = MongoClient(MONGOURL)
	db = client[MONGODBASE]
	
	print("Start at "+ str(datetime.now()))
	# Ablauf des Ganzen
	getAktdata(db)
	
	# Datenbank schließen
	client.close()
	
	print("End at " +  str(datetime.now()))
# End: def main():


# Programm starten
if __name__ == "__main__":
	main()
	