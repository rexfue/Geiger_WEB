var express = require('express');
var router = express.Router();
var moment = require('moment');
var assert = require('assert');
var async = require('async');

// Mongo wird in app.js geöffnet und verbunden und bleibt immer verbunden !!

// Fetch the actual out of the dbase
router.get('/getaktdata/', function (req, res) {
    var db = req.app.get('dbase');                                      // db wird in req übergeben (von app.js)
    var south = parseFloat(req.query.south);
    var north = parseFloat(req.query.north);
    var east = parseFloat(req.query.east);
    var west = parseFloat(req.query.west);
    console.log('Box:', south,north,east,west);
    var collection = db.collection('aktwerte');                         // die 'korrelation' verwenden
    var aktData = [];                                                   // hier die daten sammeln
    var now = moment();                                                 // akt. Uhrzeit
    console.log("fetching data ");
    collection.find({                                                   // find all data within map borders (box)
        loc: {
            $geoWithin: {
                $box : [
                    [west,south],
                    [east,north]
                ]
            }
        }
    }).toArray(function (err, docs) {
 //       console.log(docs);
        for (var i=0; i< docs.length; i++) {
            var item = docs[i];
            var oneAktData = {};
            oneAktData['loc'] = item.loc.coordinates;
            oneAktData['id'] = item._id;                                // ID des Sensors holen
            var dt = new Date(item.data[0].time);
            if((now-dt) >= 7*24*3600*1000) {                            // älter als 1 WOCHE ->
                oneAktData['value10'] = -2;                             // -2 zurückgeben
                oneAktData['value25'] = -2;
            } else if((now-dt) >= 3600*1000) {                          // älter als 1 Stunde ->
                oneAktData['value10'] = -1;                             // -1 zurückgeben
                oneAktData['value25'] = -1;
            } else {
                oneAktData['value10'] = -5;
                oneAktData['value25'] = -5;
                if (item.average != undefined) {
                    if (item.average.P10_avg != undefined) {
                        oneAktData['value10'] = item.average.P10_avg.toFixed(2);    // und merken
                    }
                    if (item.average.P2_5_avg != undefined) {
                        oneAktData['value25'] = item.average.P2_5_avg.toFixed(2);      // und merken
                    }
                }
            }
            aktData.push(oneAktData);                                   // dies ganzen Werte nun in das Array
 //           console.log("Daten für "+ oneAktData.id + " geholt");
        }
        res.json(aktData);                                              // alles bearbeitet _> Array senden
        console.log("Array-Länge:",aktData.length);
    });
});


module.exports = router;
