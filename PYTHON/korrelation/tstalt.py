#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests

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
#        print (addr)
    except:
        print(('Error in address for location: {0}').format(loc))
        return ""
    return addr['results'][0]['address_components']
#end: def addAddress(loc):


def main():
    lat = 42.693
    lon = 23.333
    
    print (addAddress([lat,lon]))
    print (addAltitude([lat,lon]))



# End: def main():


# Programm starten
if __name__ == "__main__":
    main()
    