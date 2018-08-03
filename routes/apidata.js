"use strict";
const express = require('express');
const router = express.Router();
const moment = require('moment');
const mathe = require('mathjs');
// const Vector = require('gauss').Vector;
const request = require('request-promise');
const fs = require('fs');
const $ = require('jquery');
const MongoClient1 = require('mongodb').MongoClient;

// Mongo wird in app.js geöffnet und verbunden und bleibt immer verbunden !!

//API to read all datas from the database
router.get('/getdata', function (req, res) {
    let db = req.app.get('dbase');
    let sid=1;
    if (!((req.query.sensorid == undefined) || (req.query.sensorid == ""))) {
        sid = parseInt(req.query.sensorid);
    }
    let avg = req.query.avg;
    let span = req.query.span;
    let dt = req.query.datetime;
    if(isNaN(sid)) {
        getAPIdataTown(db, req.query.sensorid, avg, span, dt, res);
//            .then(erg => res.json(erg));
    } else {
        getAPIdataSensor(db, sid, avg, span, dt,res);
//            .then(erg => res.json(erg));
    }

//    if(req.query.sensorid == "all") {
//        getAPIalldata(db, dt)
//            .then(erg => res.json(erg));
});

router.get('/getprops', function (req, res) {
    let db = req.app.get('dbase');
    let sid=0;
    if (!((req.query.sensorid == undefined) || (req.query.sensorid == ""))) {
        sid = parseInt(req.query.sensorid);
    }
    let dt = "1900-01-01T00:00:00";
    if(!((req.query.since === undefined)  || (req.query.since ==""))) {
        dt = req.query.since;
    }
    let name = ""
    if(!((req.query.sensortyp === undefined)  || (req.query.sensortyp ==""))) {
        name = req.query.sensortyp;
    }

    getAPIprops(db, sid, name, dt)
        .then(erg => res.json(erg));
});

// ***********************************************************
// getAPIdataNew  -  Get data direct via API for one sensor
//
//  Parameter:
//      db:     Mongo-Database
//      sid:    sensor ID
//      mavg:   time over that to build the average [minutes]
//      dauer:  duration for the data [hours]
//      start:  starting point of 'dauer'
//      end:    end of 'dauer'
//
// return:
//      JSON Dokument mit den angefragten Werten
// ***********************************************************

async function getAPIdataNew(db,sid,mavg,dauer,start,end) {
    let st = moment(start).startOf('day');               // clone start/end ..
    let en = moment(end).startOf('day');                 // .. and set to start of day

    let retur = {sid: sid, avg: mavg, span: dauer, start: start};
    let collection = db.collection('values');
    let ergArr = [];
    let values;
    for (; st <= en; st.add(1, 'd')) {
        let id = sid + '_' + st.format('YYYYMMDD');
        try {
            values = await collection.findOne({
                _id: id
            });
        }
        catch (e) {
            console.log(e);
        }
        if(values && (values.values.length != 0)) {
            ergArr.push(...values.values);
        }
    }
    if (ergArr.length == 0) {
        retur.count = 0;
        retur['values'] = [];
    } else {
        // Bereich einschränken
        let v = [];
        let startm = moment(start);
        if(mavg != 1) {
            startm.subtract(mavg,'m');
        }
        let fnd = ergArr.findIndex(x => x.datetime >= startm);
        if (fnd != -1) {
            v = ergArr.slice(fnd);
            ergArr = v;
        }
        fnd = ergArr.findIndex(x => x.dateTime > end);
        if (fnd != -1) {
            v = ergArr.slice(-fnd);
            erg.Arr = v;
        }
        if ((mavg === undefined) || (mavg == 1)) {
            retur.count = ergArr.length;
            retur['values'] = ergArr;
        }
        // Mittelwert berechnen
        let x = calcMovingAverage(ergArr, mavg, 0, 0, true);
        fnd = x.findIndex(u => u.dt >= start);
        if (fnd != -1) {
            let y = x.slice(fnd);
            x=y;
        }
        retur.count = x.length;
        retur.values = x;
    }
    return retur;
}


// ******************************************************************
// getAPITN  -  Get data direct via API for all sensors in a town
//
//  Parameter:
//      dbase:      Mongo-Database
//      sensors:    array of sensors
//      mavg:       time over that to build the average [minutes]
//      dauer:      duration for the data [hours]
//      start:      starting point of 'dauer'
//      end:        end of 'dauer'
//      town:       name of town
//
// return:
//      JSON document with data for ALL sensors in town
//
// ***** Neue DB-Struktur - Versuch
//
// ********************************************************************
async function getAPITN (dbase,sensors,mavg,dauer,start,end,town) {
    // Fetch for all this sensors
    let los = moment();                         // debug, to time it
    let erg = {sid:town, avg: mavg, span: dauer, start: start, count: 0, sensordata: []};  // prepare object
    let val;
    for(let j=0; j<sensors.length; j++) {       // loop thru array of sensors
        try {
            val = await getAPIdataNew(dbase,sensors[j],mavg,dauer,start,end);   // get data for obe sensor
            if(val.count != 0) {                // if there is data
                delete val.avg;                 // delete unnecessary elements
                delete val.span;
                delete val.start;
                erg.sensordata.push(val);       // and push data to result array
            }
        }
        catch(e) {
            console.log(e);
        }
    }
    console.log("Zeit in getAPIdataTown:",(moment()-los)/1000,'[sec]'); // time it
    console.log('Daten für',erg.sensordata.length,' Sensoren gelesen');
    erg.count = erg.sensordata.length;          // save count
    return erg;                                 // and return all data
}


// ******************************************************************
// getAPIdataTown  -  Get data direct via API for all sensors in a town
//
//  Call:
//      http://feinstaub.rexfue.de/api/getdata/?sensorid=stuttgart&avg=5&span=12
//
//      mit:
//          sensorid:  Name der Stadt
//          avg:  Mittelwert-Bildung über xxx Minuten
//          span: Zeitraum für die Mittelwertbildung in Stunden
//          dt:   Startzeitpunkt
//
//  Parameter:
//      db:     Mongo-Database
//      town:   name of town
//      avg:    time over that to build the average [minutes]
//      span:   duration for the data [hours]
//      dt:     starting point of 'span'
//      res:    http-object to send result
//
// return:
//      nothing; JSON document will be sent back
//
//
// For every town, there has to be an JSON-file with the
// sensornumbers of ervery sensor living in that town.
//
// ***** Neue DB-Struktur - Versuch
//
// ********************************************************************
async function  getAPIdataTown(db, sid, avg, span, dt, res) {
    // get sensors for the town as array of ids
    let mavg = 1;                               // default average
    if (avg !== undefined) {                    // if acg defined ..
        mavg = parseInt(avg);                   // .. use it
    }
    if (mavg > 1440) { mavg = 1440;}            // avgmax = 1 day
    let dauer = 24;                             // span default 1 day
    if(span !== undefined) {                    // if defined ..
        dauer = parseInt(span);                 // .. use it
    }
    if (dauer > 720) { dauer = 720;}            // spanmax = 30 days
    let start = moment();                       // default start -> now
    let end = moment();                         // define end
    if(dt != undefined) {                       // if defined ..
        start = moment(dt);                     // .. use it ..
        end = moment(dt);
        end.add(dauer,'h');                     // .. and calculate new end
    } else {                                    // if not defined, calc start ..
        start.subtract((dauer * 60), 'm');      // .. from span (= dauer)
    }

    // now fetch data fpr all this sensors
    const connect = MongoClient1.connect( 'mongodb://nuccy:27017/Feinstaub');
    connect                                     // connect to database
        .then(dbase => {                        // and get all data
            return getAPITN (dbase,sensors,mavg,dauer,start,end,town)
                .then (erg => res.json(erg))    // send data back
                .then (() => dbase.close())     // and close database
        });
}



// ******************************************************************
// getAPIdataSenssor  -  Get data direct via API for all sensors in a town
//
//  Call:
//      http://feinstaub.rexfue.de/api/getdata/?sensorid=140&avg=5&span=12&datetime=2018-08-ß02T20:12:00
//
//      mit:
//          sensorid:   ID des gewümschten Sensors
//          avg:        Mittelwert-Bildung über xxx Minuten
//          span:       Zeitraum für die Mittelwertbildung in Stunden
//          datetime:   Startzeitpunkt
//
//  Parameter:
//      db:     Datenbank
//      sid:    ID of sensor
//      avg:    time over that to build the average [minutes]
//      span:   duration for the data [hours]
//      dt:     starting point of 'span'
//      res:    http-object to send result
//
// return:
//      nothing; JSON document will be sent back
//
//
// ***** Neue DB-Struktur - Versuch
//
// ********************************************************************
async function  getAPIdataSensor(db, sid, avg, span, dt, res) {
    let mavg = 1;                               // default average
    if (avg !== undefined) {                    // if acg defined ..
        mavg = parseInt(avg);                   // .. use it
    }
    if (mavg > 1440) { mavg = 1440;}            // avgmax = 1 day
    let dauer = 24;                             // span default 1 day
    if(span !== undefined) {                    // if defined ..
        dauer = parseInt(span);                 // .. use it
    }
    if (dauer > 720) { dauer = 720;}            // spanmax = 30 days
    let start = moment();                       // default start -> now
    let end = moment();                         // define end
    if(dt != undefined) {                       // if defined ..
        start = moment(dt);                     // .. use it ..
        end = moment(dt);
        end.add(dauer,'h');                     // .. and calculate new end
    } else {                                    // if not defined, calc start ..
        start.subtract((dauer * 60), 'm');      // .. from span (= dauer)
    }

    // now fetch data fpr all this sensors
    const connect = MongoClient1.connect( 'mongodb://nuccy:27017/Feinstaub');
    connect                                     // connect to database
        .then(dbase => {                        // and get all data
            return getAPIdataNew(db,sid,mavg,dauer,start,end)
                .then (erg => res.json(erg))    // send data back
                .then (() => dbase.close())     // and close database
        });
}


// *********************************************
// Get data direct via API for one sensor
//
//  Call:
//      http://feinstaub.rexfue.de/api?sid=1234&avg=5&span=24
//
//      mit:
//          sid:  Sensornummer
//          avg:  Mittelwert-Bildung über xxx Minuten
//          span: Zeitraum für die Mittelwertbildung in Stunden
//
// return:
//      JSON Dokument mit den angefragten Werten
// *********************************************
async function getAPIdata(db,sid,avg,span,dt) {
    let los=moment();
    let values = [];
    let mavg = 1;
    if (avg !== undefined) {
        mavg = parseInt(avg);
    }
    if (mavg > 1440) { mavg = 1440;}
    let dauer = 24;
    if(span !== undefined) {
        dauer = parseInt(span);
    }
    if (dauer > 720) { dauer = 720;}
    let start = moment();
    let end = moment();
    if(dt != undefined) {
        start = moment(dt);
        end = moment(dt);
        end.add(dauer,'h');
    } else {
        start = start.subtract((dauer * 60) + mavg, 'm');
    }
    let retur = {sid: sid, avg: mavg, span: dauer, start: start};
    let collection = db.collection('data_'+sid);
    try {
        values = await collection.find({
                datetime: {
                    $gte: new Date(start),
                    $lt: new Date(end)
                }},{ _id: 0 },
            {
                sort: {datetime:1}
            }
        ).toArray()
    }
    catch(e) {
        console.log(e);
    }
    if(values.length == 0) {
        retur.count = 0;
        retur['values'] = [];
    } else {
        if((mavg===undefined) || (mavg == 1)) {
            retur.count = values.length;
            retur['values'] = values;
        }
        let x = calcMovingAverage(values, mavg, await getAltitude(db,sid), 0, true);
        end.subtract(dauer,'h');
        let i = 0;
        for(i=0; i< x.length; i++) {
            if (moment(x[i].date) >= end) {
                break;
            }
        }
        let y = x.slice(i);
        retur.count = y.length;
        retur.values = y;
    }
//    console.log("Zeit in getAPIdata",(moment()-los)/1000,'[sec]')
    return retur;
}

// *********************************************
// Get data direct via API for ALL sensor
//
//  Call:
//      http://feinstaub.rexfue.de/api?sid=all&datetime="2018-06-02T12:00Z"
//
//      mit:
//          dt:     Zeitpunkt, für den die Daten geholt werden
//                  Es werden Daten <= dem Zeitpunkt geholt
//
// return:
//      JSON Dokument mit den angefragten Werten
// *********************************************
async function getAPIalldata(db,dt) {
    let values = [];
    let properties = [];
    let start = moment(dt);
    let retur = {sid: "all", datetime: dt};
    let clist = [];
    // read all collection-names
    try {
        clist = await db.listCollections().toArray();
    }
    catch(e) {
        console.log("Problem to get collection list")
        retur['values'] = [];
    }
    // read properties
    let pcoll = db.collection("properties");
    properties = await pcoll.find().toArray();

    for(let i = 0; i< clist.length; i++) {
        let entry = {};
        let name = clist[i].name;
        if (! name.startsWith("data")) {
            continue;
        }
        let prop = properties.find(obj => {
            return( obj._id == name.substring(5));
        });
        if(prop === undefined) {
            continue;
        }
//        console.log(name);
        if(!isPM(prop.name)){
            continue;
        }
        let collection = db.collection(name);
        try {
            let val = await collection.findOne({datetime: {$gte: new Date(start)}}, {_id: 0});
//            if ((val == null) || (val.P1 === undefined)) {
            if (val == null) {
                continue;
            }
            entry.P1 = val.P1;
            entry.P2 = val.P2;
            entry.datetime = val.datetime;
            entry.sid = name.substring(5);
            values.push(entry);
        }
        catch(e){
            console.log("Error on reading collection");
            values = [];
        }
    }
    if(values.length == 0) {
        retur.count = 0;
        retur['values'] = [];
    } else {
        retur.count = values.length;
        retur['values'] = values;
    }
    return retur;
}

// *********************************************
// Get properties for all sensors
//
//  Call:
//      http://feinstaub.rexfue.de/api/getprops?sensorid=1234&since=2810-03-23
//
//      mit:
//          sid:  Sensornummer (all -> alle Sensoren)
//          since: seit dem Datum (incl)
//
// return:
//      JSON Dokument mit den angefragten werten
// *********************************************
async function getAPIprops(db,sid,typ,dt) {
    let properties = [];
    let erg = [];
    let entry = {};
    let pcoll = db.collection("properties");
    let query = {};
    if(sid == 0) {
        if(typ == "") {
            query = {date_since: {$gte: new Date(dt)}};
        } else {
            query = {date_since: {$gte: new Date(dt)}, name: typ};
        }
    } else {
        query = { _id:sid };
    }
    properties = await pcoll.find(query).sort({_id: 1}).toArray();
    console.log("Anzahl gekommen: ",properties.length);
    console.log("First:", properties[0]);
    for (let i = 0; i < properties.length; i++) {
        erg.push({
            sid:properties[i]._id,
            typ: properties[i].name,
            since: moment(properties[i].date_since).format(),
            lat: properties[i].location[0].loc.coordinates[1],
            lon: properties[i].location[0].loc.coordinates[0],
            alt: properties[i].location[0].altitude,
        });
    }
    entry.sensortyp = typ =="" ? "all" : typ;
    entry.count = erg.length;
    entry.since = dt;
    entry.werte = erg;
    return entry;
}

module.exports = router;
