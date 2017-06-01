#!/usr/bin/env python
# -*- coding: utf-8 -*-
# Korrelation von Sensor-ID zu Location
#
# 2017-04-16  rxf
#	Erste Version
#

# Aufbau der Collectionen in der MongoDB:
# {
#	_id,
#	latitude
#	longitude
#	espid,
#	sensors [{id,name},{id,name},.....]
#   }
#
# Daten-Collection: data_<sensID>_<sensName>
# {
#	_id: ObjectId("582c6d8a4bb090779d357a81"),
#	date: 2016-11-16 14:30:34.013Z,
#	P10: 4.67,
#	P2_5: 7.67
# }

import json
from pymongo import MongoClient
from datetime import datetime
import requests


# Globale Konstanten
MONGOHOST = "localhost"
# APIURL = 'https://api.luftdaten.info/v1/now/'
SENSORCSVURL = "http://archive.luftdaten.info/"
MONGOURL= 'mongodb://'+MONGOHOST+':27017/'
MONGODBASE = 'Feinstaub_AllNew'
KORRCOLL = 'korrelations'
MADAVICVS = 'https://www.madavi.de/sensor/csvfiles.php'
MADAVIDATA = 'https://www.madavi.de/sensor/data/' #data-esp8266-13928303-2016-11-03.csv
DATAPATH = '../data/'
PATH2DATUM = '../data/curDatum'
APIURL = 'http://api.luftdaten.info/static/v1/data.json'

	
def addAltitude(loc):
	""" Via Google-API doe Höhe bei den übergeben Koordinaten holen """
	try:
		r = requests.get('https://maps.googleapis.com/maps/api/elevation/json?locations={0},{1}&key=AIzaSyBpQm2BKLtU2oxdrgy45s27ao3J1cBj64E'.format(loc[0],loc[1]))
		places = r.json()
		eletxt = 'At {0} elevation is: {1}'
		print (eletxt.format(loc, places['results'][0]['elevation']))
	except:
		print (('Error in altitude for location: {0}').format(loc))
		return 0
		
	return round(places['results'][0]['elevation'])
	
def addAddress(loc):
	""" Via Google-API die Adressdaten zu den Koordinaten holen """
	try:
		r = requests.get('https://maps.googleapis.com/maps/api/geocode/json?latlng={0},{1}&key=AIzaSyBpQm2BKLtU2oxdrgy45s27ao3J1cBj64E'.format(loc[0],loc[1]))
		addr = r.json()
#		print (addr)
	except:
		print(('Error in address for location: {0}').format(loc))
		return ""
	return addr['results'][0]['address_components']


def getAktdata(db):
	""" Die gerade aktuellen Daten von madavi holen, die wichtigen (die SDS011-) Daten
	extrahieren, über die Korrelationstabelle die ESP-ID holen und dann in die DB eintragen
	"""	
	def holDaten(live):
		""" Die aktuellen Daten vom madavi oder von Disk holen """
		dstr = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
		if live == True:
			print(dstr + ' - Hole von Madavi');
			r = requests.get(APIURL)
			if r.status_code == 200:
				with open('data/curdata.txt','w') as f:  # und auch zusätzlich auf
					f.write(r.text);						# Disk schreiben
				return r.json()
		else:
			with open('data/curdata.txt') as f:
				return json.loads(f.read())	
	# Ende def holDaten():
		
	
	aktDaten = holDaten(True)
	for x in aktDaten:	
		# print(x)
		sensorname = x['sensor']['sensor_type']['name'] 
		if  sensorname == 'PPD42NS':						# diese Sensoren ignorieren
			continue		
		sid = int(x['sensor']['id'])						# Sensor-ID
		# Geokoordinaten in Float umrechnen
		lat = float(x['location']['latitude'])	
		lon = float(x['location']['longitude'])
		lid = int(x['location']['id'])
		one = {}
		one['location'] = {'longitude':lon, 'latitude':lat, 'altitude':0, 'id':lid }  # Daten zusammestellen
		one['espid'] = ''
		one['sensors'] = [{'id':sid,'name':sensorname}]
		collStr = KORRCOLL							# Name der collection
		collection = db[collStr]
		res = collection.find_one({'location.id':lid})
		if res == None: 							# falls noch nicht eingetragen
			print("Neu-Eintrag " + sensorname + ' ' + str(sid))
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
		else:										# ist dieser Sensor schon eingetragen?
			erg = collection.find_one({'sensors':{'$elemMatch':{'id':sid}}}) 
			if  erg == None:	# Nein -> also eintragen
				collection.update({'location.id':lid}, {'$push': {'sensors': {'id':sid,'name':sensorname}}})	

			
# Ende def getAktdata(db):

		
def main():
	# Vorbereitung für die Dataenbank
	client = MongoClient(MONGOURL)
	db = client[MONGODBASE]
	
	print("Start um "+ str(datetime.now()))
	# Ablauf des Ganzen
	getAktdata(db)
	
	# Datenbank schließen
	client.close()
	
	print("Alles fertig. Ende - Aus  " +  str(datetime.now()))
# Ende def main():


# Programm starten
if __name__ == "__main__":
	main()
	