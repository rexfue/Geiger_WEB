"use strict";

var express = require('express');
var router = express.Router();
var moment = require('moment');
const request = require('request');
let $ = require('jquery');
require('../jquery.csv.js');
var fs = require('fs');

// Mongo wird in app.js geöffnet und verbunden und bleibt immer verbunden !!

let URL='http://archive.luftdaten.info/';

// Fetch the actual out of the dbase
router.get('/getaktdata/', function (req, res) {
    var db = req.app.get('dbase');                                      // db wird in req übergeben (von app.js)
    var south = parseFloat(req.query.south);
    var north = parseFloat(req.query.north);
    var east = parseFloat(req.query.east);
    var west = parseFloat(req.query.west);
    let st = req.query.start;
    let poly = [];
    if(req.query.poly != undefined) {
        poly = JSON.parse(req.query.poly);
    }
    console.log('Box:', south,north,east,west);

/* Versuch, über die CSV-Dateien einen beliebigen Zeitpunkt einzulesen.
    Das funtioniert erstens noch nicht (Fehler, wenn CSV nicht da ist, wird nicht richtig
    abgefangen.
    Und es dauert wohl doch einfach viel zu lange.
    if(st != "") {
        fetchCSV(db,moment.utc(st),south,north,east,west)
            .then((erg) => {
                res.json(erg);
                return;
            });
        return;
    }
*/

    var collection = db.collection('mapdata');                         // die 'korrelation' verwenden
    var aktData = [];                                                   // hier die daten sammeln
    var now = moment();                                                 // akt. Uhrzeit
    var lastDate = 0;
    let loc;
    console.log("fetching data ");
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
        } else {
        loc = {
            location: {
                $geoWithin: {
                    $box: [
                        [west, south],
                        [east, north]
                    ]
                }
            }
        }
    }
    collection.find( loc )                                                 // find all data within map borders (box)
        .toArray(function (err, docs) {
 //       console.log(docs);
        for (var i=0; i< docs.length; i++) {
            var item = docs[i];
            var oneAktData = {};
            oneAktData['location'] = item.location.coordinates;
            oneAktData['id'] = item._id;                                // ID des Sensors holen
            var dati = item.values.datetime;
            var dt = new Date(dati);
            if((now-dt) >= 7*24*3600*1000) {                            // älter als 1 WOCHE ->
                oneAktData['value10'] = -2;                             // -2 zurückgeben
                oneAktData['value25'] = -2;
            } else if((now-dt) >= 3600*1000) {                          // älter als 1 Stunde ->
                oneAktData['value10'] = -1;                             // -1 zurückgeben
                oneAktData['value25'] = -1;
            } else {
                oneAktData['value10'] = -5;                             // bedutet -> nicht anzeigen
                oneAktData['value25'] = -5;
                if (item.values.hasOwnProperty('P1')) {
                    oneAktData['value10'] = item.values.P1.toFixed(2);    // und merken
                } else {
                    console.log(item._id+': P1 fehlt',)
                }
                if(item.values.hasOwnProperty('P2')) {
                    oneAktData['value25'] = item.values.P2.toFixed(2);      // und merken
                } else {
                    console.log(item._id + ': P2 fehlt',)
                }
                // if (item.values.P1 != undefined) {
                //     if (item.values.P1 < 1990.0) {
                //         oneAktData['value10'] = item.values.P1.toFixed(2);    // und merken
                //     }
                // }
                // if (item.values.P2 != undefined) {
                //     if (item.values.P2 < 990.0) {
                //         oneAktData['value25'] = item.values.P2.toFixed(2);      // und merken
                //     }
                // }
                if (dati > lastDate) {
                    lastDate = dati;
                 }
            }
            aktData.push(oneAktData);                                   // dies ganzen Werte nun in das Array
 //           console.log('lastDate:',lastDate);
 //           console.log("Daten für "+ oneAktData.id + " geholt");
        }
        console.log("Komm direkt vor res.json in route.get(/getaktdata) und lastDate ist:", lastDate);
        res.json({"avgs": aktData, "lastDate": lastDate});                                              // alles bearbeitet _> Array senden
        console.log("Array-Länge:",aktData.length);
    });
});

router.get('/getStuttgart/', function (req, res) {
    fs.readFile('public/Stuttgart.gpx',function(err,data) {
        res.send(data);
    })
});

/*

async function fetchCSV(db,start,south,north,east,west) {
    let datum = start.format('YYYY-MM-DD');
    let pcoll = db.collection('properties');
    let werte = [];
    let ones = {};
    try {
        let docs = await pcoll.find({                                                   // find all data within map borders (box)
            'location.0.loc': {
                $geoWithin: {
                    $box: [
                        [west, south],
                        [east, north]
                    ]
                }
            }
        }).toArray();
        for (let x in docs) {
            let sid = docs[x]._id;
            let name = docs[x].name;
            ones.location = docs[x].location[0].loc.coordinates;
            ones.id = sid;
            let fn = URL + datum + '/' + datum + '_' + name.toLowerCase() + '_sensor_' + sid + '.csv';
            let erg = await readOneSensorData(fn, moment(start));
            Object.keys(erg).forEach(key => {
                ones[key] = erg[key];
            });
            werte.push(ones);
        }
        return {"avgs": werte, "lastDate": datum};
    }
    catch (e) {
        console.log(e);
    }
}


// read the CSV-File and parse it int right format for DB
function readOneSensorData(url, dt) {
    let cdat = dt.startOf('day');
    const p = new Promise((resolve, reject) => {
        request(url, function (error, response, body) {         // request the file
            if((error) || (response.statusCode != 200)) {
                console.log("error readOneSensorOneDay:", error, '  Status:',response.statusCode, url);
                reject("Error", error);                         // if not OK, reject
            }
            $.csv.toObjects(body, {separator: ';'}, function (err, data) {  // parse CSV
//                console.log("Lang: ", data.length);
                for (let i = 0; i < data.length; i++) {
                    entry = {};
                    let date = moment.utc(data[i].timestamp);               // extract date of entry
                    if (cdat.isAfter(date)) continue;
                    entry.datetime = date.toDate();					        // make date for Mongo (== ISODate)
                    if (data[i].P1 !== undefined) {
                        entry.value10 = parseFloat(data[i].P1);
                    }
                    if (data[i].P2 !== undefined) {
                        entry.value25 = parseFloat(data[i].P2);
                    }
                    break;
                }
                resolve(entry);                  // return all the data
            });
        });
    });
    return p;
}
*/

/*
<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
router.get('/adressSensors/', function (req, res) {
    var db = req.app.get('dbase');                                      // db wird in req übergeben (von app.js)
    var spoints = JSON.parse(req.query.points);
    getRegionSensors(db,spoints)
        .then(erg => res.json(erg));
});
*/


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

function isPM(name) {
    if ((name == "SDS011") || (name.startsWith("PPD")) || (name.startsWith("PMS"))) {
        return true;
    }
    return false;
}

module.exports = router;
