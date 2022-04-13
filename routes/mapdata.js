"use strict";

var express = require('express');
var router = express.Router();
var moment = require('moment');
let axios = require('axios');
var fs = require('fs');

// URL to get coordinates for cities
const NOMINATIM_URL="https://nominatim.openstreetmap.org/search?format=json&limit=3&q=";

// Mongo wird in app.js geöffnet und verbunden und bleibt immer verbunden !!

// Fetch the actual out of the dbase
router.get('/getaktdata/', async function (req, res) {
// fetch data from API Interface with http
    const url = 'http://localhost:3000/getdata4maps'
    const data = {box: req.query.box, type: req.query.type}
    try {
        const response = await axios.post(encodeURI(url), data);
        res.json(response.data)
    } catch(e) {
        res.json({error: true, errortext: e})
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
