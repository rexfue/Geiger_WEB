"use strict";

var express = require('express');
var router = express.Router();
var moment = require('moment');
const axios = require('axios');
let $ = require('jquery');
var fs = require('fs');

// URL to get coordinates for cities
const NOMINATIM_URL="https://nominatim.openstreetmap.org/search?format=json&limit=3&q=";

// Mongo wird in app.js geöffnet und verbunden und bleibt immer verbunden !!

// Fetch the actual out of the dbase
router.get('/getaktdata/', function (req, res) {
    var db = req.app.get('dbase');                                      // db wird in req übergeben (von app.js)
    let box = req.query.box;
    let poly = [];
    var collection = db.collection('mapdata');                         // die 'korrelation' verwenden
    var aktData = [];                                                   // hier die daten sammeln
    var now = moment();                                                 // akt. Uhrzeit
    var lastDate = 0;
    let south=null,north=null,east=null,west=null;
    let loc = {};
    if(req.query.poly != undefined) {
        poly = JSON.parse(req.query.poly);
    }
    if (!((box == "") || (box == undefined))) {
        south = parseFloat(box[0][1]);
        north = parseFloat(box[1][1]);
        east = parseFloat(box[1][0]);
        west = parseFloat(box[0][0]);
        console.log("getaktdata: S=", south, " N=", north, " E=", east, " W=", west)
    }
    console.log("getaktdata: now fetching data from DB");

    if(poly.length != 0) {
        loc = {
            location: {
                $geoWithin: {
                    $geometry: {
                        type: "Polygon",
                        coordinates: [poly],
                    }
                }

            }
        }
    } else if (south !== null) {
        loc = {
            location: {
                $geoWithin: {
                    $box: [
                        [west, south],
                        [east, north]
                    ]
                }
            },
            name: /Radiation/,
        }
    } else {
        loc = {
            name: /Radiation/,
        }
    }
    try {
        collection.find(loc)                                              // find all data within map borders (box)
            .toArray(function (err, docs) {
                if (docs == null) {
                    console.log("getaktdata: docs==null");
                    res.json({"avgs": [], "lastDate": null});
                    return;
                }
                console.log("getaktdata: data fetched, length=",docs.length);
                for (var i = 0; i < docs.length; i++) {
                    var item = docs[i];

//                    console.log(item);

                    var oneAktData = {};
                    oneAktData['location'] = item.location.coordinates;
                    oneAktData['id'] = item._id;                                // ID des Sensors holen
                    oneAktData['lastSeen'] = item.values.datetime;
                    oneAktData['name'] = item.name.substring(10);
                    oneAktData['indoor'] = item.indoor;
//                    console.log(oneAktData);

                    var dati = item.values.datetime;
                    var dt = new Date(dati);
                    if ((now - dt) >= (7  * 24 * 3600 * 1000)) {                  // älter als 1 Woche ->
                        oneAktData['cpm'] = -2;                                   // -2 zurückgeben
                    } else if ((now - dt) >= (2 * 3600 * 1000)) {                 // älter als 2 Stunde ->
                        oneAktData['cpm'] = -1;                                   // -1 zurückgeben
                    } else {
                        oneAktData['cpm'] = -5;                                 // bedutet -> nicht anzeigen
                        if (item.values.hasOwnProperty('counts_per_minute')) {
                            oneAktData['cpm'] = item.values.counts_per_minute.toFixed(0);    // und merken
                        }
                        if (dati > lastDate) {
                            lastDate = dati;
                        }
                    }
                    aktData.push(oneAktData);                                   // dies ganzen Werte nun in das Array
                }
                res.json({"avgs": aktData, "lastDate": lastDate});              // alles bearbeitet -> Array senden
            });
    }
    catch(e) {
        console.log("Problem mit getaktdata", e);
        res.json({"avgs": [], "lastDate": null});
        return;
    }
});

// Fetch all akw data out of the dbase
router.get('/getakwdata/', async function (req, res) {
    const db = req.app.get('dbase');                        // db wird in req übergeben (von app.js)
    let collection = db.collection('akws');                 // die 'korrelation' verwenden
    let erg = [];
    let docs = [];
    console.log("getakwdata: now fetching data from DB");
    try {
        docs = await collection.find().toArray();                                // find all
        if (docs == null) {
            console.log("getakwdata: docs==null");
            res.json(erg);
            return;
        }
        console.log("getawkdata: data fetched, length=",docs.length);
        for (var i = 0; i < docs.length; i++) {
            var item = docs[i];
            var oneAktData = {};
            oneAktData['location'] = {
                type: 'Point',
                coordinates: [item.lon, item.lat]
            };
            oneAktData['name'] = item.Name;
            oneAktData['active'] = item.Status == 'aktiv';
            oneAktData['start'] = item.Baujahr;
            oneAktData['end'] = item.Stillgeleg;
            oneAktData['type'] = item.Status === 'aktiv' ? 'akw_a' : 'akw_s';
            oneAktData['link'] = item.Wiki_Link;
            erg.push(oneAktData);                  // dies ganzen Werte nun in das Array
        }

        collection = db.collection('th1_akws');
        docs = await collection.find().toArray();
        if (docs == null) {
            console.log("getakwdata: docs==null");
            res.json(erg);
            return;
        }
        console.log("getawkdata: data fetched from th_akws, length=", docs.length);
        for (let i = 0; i < docs.length; i++) {
            const item = docs[i];
            let oneAktData = {};
            let loc = item.geo.substr(6).split(' ');
            let lon = parseFloat(loc[0]);
            let lat = parseFloat(loc[1]);
            oneAktData['location'] = {
                type: 'Point',
                coordinates: [lon, lat]
            };
            oneAktData['name'] = item.name;
            oneAktData['typeText'] = item.types;
            oneAktData['type'] = item.types == "Nuclear power plant" ? 'akw_a' : 'other';
            oneAktData['link'] = item.item;
            if (item.itemServiceretirement != undefined) {
                oneAktData['ende'] = item.itemServiceretirement.substr(0,4);
            }
            if (item.itemServiceentry != undefined) {
                oneAktData['begin'] = item.itemServiceentry.substr(0,4);
            }
            // Push only NOT 'Nuclear Power Plants' into data array
//            if(item.types != 'Nuclear power plant') {
                erg.push(oneAktData);
//            }
        }
        res.json(erg);
    }
    catch(e) {
        console.log("Problem mit getakwdata", e);
        res.json({"akws": [], "research": [], "fusion": [], "waste": [],});
        return;
    }
});

router.get('/getStuttgart/', function (req, res) {
    fs.readFile('public/Stuttgart.gpx',function(err,data) {
        res.send(data);
    })
});

router.get('/getcoord/', function (req, res) {
    getCoordinates(req.query.city)
        .then(erg => res.json(erg));
});

router.get('/getIcon/:col', function (req, res) {
    let color = req.params.col;
//    fs.readFile('public/radioak4_30.png',function(err,data) {
    fs.readFile('public/nuclear-'+color+'.svg',function(err,data) {
        res.send(data);
    })
});


router.get('/regionSensors/', function (req, res) {
    var db = req.app.get('dbase');                                      // db wird in req übergeben (von app.js)
    var spoints = JSON.parse(req.query.points);
    getRegionSensors(db,spoints)
        .then(erg => res.json(erg));
});

async function getRegionSensors(db,p) {
    let properties = [];
    let pcoll = db.collection("properties");
//    let pcoll = db.collection("mapdata");
    properties = await pcoll.find({
            'location.0.loc': {
                $geoWithin: {
                    $geometry: {
                        type: "Polygon",
                        coordinates: [ p ],
                    }
                }
        }
    },{name:1}
    ).toArray();
    let sids = [];
    properties.forEach(x => {
        if(isPM(x.name)) {
            sids.push(x._id);
        }
    });
    console.log('Anzahl gefundene Sensoren:',sids.length);
    return sids;
}

router.get('/storeSensors/', function (req, res) {
    let data = req.query.sensors;
    fs.writeFile('stuttgart.txt',data,(err) => {
        if (err) throw(err);
        console.log("Sensoren gespeichert");
    });
});


async function getCoordinates(city) {
    let url = NOMINATIM_URL + city;
    const response = await axios.get(encodeURI(url));
    const data = response.data;
    return data[0];
}

module.exports = router;
