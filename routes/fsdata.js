"use strict";
const express = require('express');
const router = express.Router();
const moment = require('moment');
const mathe = require('mathjs');
// const Vector = require('gauss').Vector;
const request = require('request-promise');
const fs = require('fs');
const $ = require('jquery');

// Mongo wird in app.js geöffnet und verbunden und bleibt immer verbunden !!

//Get readings for all data out ot the database
router.get('/getfs/:week', function (req, res) {
    let week = req.params.week;
    let db = req.app.get('dbase');
    let st = req.query.start;
    let sid = parseInt(req.query.sensorid);
    let sname = req.query.sensorname;
    let samples = req.query.samples;
    let avg = req.query.avgTime;
    let altitude = req.query.altitude;
    let live = (req.query.live == 'true');
    let special = req.query.special;

    if (week == 'oneday') {
        getDayData(db, sid, sname, altitude, st, avg, live,special)
            .then(erg => res.json(erg));
    } else if (week == 'oneweek') {
        getWeekData(db, sid, sname, altitude, st, live)
            .then(erg => res.json(erg));
    } else if ((week == 'oneyear') || (week == 'onemonth')) {
        getYearData(db, sid, sname, st, week, live)
            .then(erg => res.json(erg));
    } else if (week == 'latest') {
        getLatestValues(db, sid, sname, samples)
            .then(erg => res.json(erg));
    } else if (week == 'korr') {
        getSensorProperties(db,sid)
            .then(erg => res.json(erg));
    } else if (week == "oldest") {
        getOldestEntry(db, sid)
            .then(erg => res.json(erg));
    } else {
        res.json({'error': 'MIST VERDAMMTER!!'});
    }
});

// fetch name of given sensor-id
function getSensorName(db,sid) {
    const p = new Promise((resolve,reject) => {
        let coll = db.collection('properties');
        coll.findOne({_id: parseInt(sid)})
            .then(erg => {
                resolve(erg.name);
            })
            .catch(err => {
                console.log('getSensorName',err);
                reject(err);
            });
    });
    return p
}

// fetch the properties for the given sensor
async function getSensorProperties(db,sid) {

    console.log("Get properties for", sid,"from DB");
    let sensorEntries = [{'sid':sid}];
    let coll = db.collection('properties');
    let properties = await coll.findOne({_id: sid});
    if(properties == null) return null;
    let alarm = false;
    if(properties.location[properties.location.length-1].address.city == 'Stuttgart') {
        try {
            alarm = await checkFeinstaubAlarm();
            console.log('ALARM:', alarm);
        }
        catch(e) {
            alarm = false;
            console.log("Problems with  'CheckFeinstaubAlarm()'");
        }
    }
    properties.alarm = alarm;
    sensorEntries[0]['name'] = properties.name;
    let mustbeobject = false;
    for(let i = 0, j=1; i<properties.othersensors.length; i++) {
        let es = properties.othersensors[i];
        let e = {};
        if (es != null) {
            if ( typeof es === 'object') {
                mustbeobject=true;
                e.sid = es.id;
                e.name = es.name;
            } else {
                if(mustbeobject) { continue; }
                e.sid = es;
                e.name = await getSensorName(db, es);
            }
        }
        sensorEntries[j] = e;
        j++;
    }
    sensorEntries.sort(function (a, b) {
        if (a.sid < b.sid) {
            return -1;
        }
        if (a.sid > b.sid) {
            return 1;
        }
        return 0;
    });
    properties.othersensors = sensorEntries;
    return properties;
}

// Feinstaubalarm in Stuttgart cjecken
function checkFeinstaubAlarm() {
    var p = new Promise(function (resolve,reject) {
        request('http://www.stuttgart.de/feinstaubalarm/widget/xtrasmall')
            .then(function (html) {
//                console.log(html);
                if (html.indexOf('widget alarm-on') > 0) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            })
            .catch(function (err) {
                console.log(err);
                reject(err);
            });
    });
    return p;
}

/* für den übergebenen Sensor das Datum des ältesten Eintrages übergeben
 */
function getOldestEntry(db,sid) {
    var p = new Promise(function (resolve,reject) {
        var colstr = 'data_' + sid;
        var collection = db.collection(colstr);
        collection.findOne({},{sort: {datetime:1}}, function(err,entry){
            if (err != null) { reject (err); }
            resolve(entry.datetime);
        });
    })  ;
    return p;
}


/*
 Die neuesten 'samples' Werte ( d.h. die letzten 'samples' min) holen, davon den Mittelwert bilden (von Hand) und
 dieses dann zurückgeben.
 */
function getLatestValues(db,sensorid,sensorname,samples) {
    console.log("GetLatest  " + sensorid + "  " + sensorname + "  " + samples);
    var p = new Promise(function(resolve,reject) {
        var colstr = 'data_' + sensorid ;
        var collection = db.collection(colstr);
        if (samples == undefined) {
            samples = 10;
        }
        var start = moment().subtract(samples,'m');
        var end = moment();
        console.log(start,end);
        collection.find({
            date: {
                $gte: new Date(start),
                $lt: new Date(end)
            }
        }, {sort: {datetime: 1}}).toArray(function (e, docs) {
            if (e != null) {
                reject(e);
            }
            console.log(docs.length + " Daten gelesen für " + sensorname + ' bei latest')
            var y;
            if (isPM(sensorname)) {
                y = calcMinMaxAvgSDS(docs,false);
                resolve({'P1':y.P10_avg,'P2':y.P2_5_avg});
            } else if (sensorname == "DHT22") {
                y = calcMinMaxAvgDHT(docs);
                resolve({'T':y.temp_avg, 'H':y.humi_avg});
            } else if (sensorname == "BMP180") {
                y =  calcMinMaxAvgBMP(docs);
                resolve({'T':y.temp_avg, 'P':y.press_avg});
            } else if (sensorname == "BME280") {
                y = calcMinMaxAvgBME(docs);
                resolve({'T':y.temp_avg, 'H':y.humi_avg, 'P': y.press_avg });
            }
        });
    });
    return p;
}


/****  TODO für das Display  ****
    Zur einfachen Anzeige der atuellen Werte (für das Display z.B.):
    Hier oben die Abfrage für die aktuellen Werte eines Sensors bzw. einer Location reinbasteln:
    Wenn :week keine der obigen Bedingungen erfüllt und eine Zahl ist, dann für diese Sensornummer
    (falls sie existiert) die neuesten Werte aus der DB holen und als einen JSON-String übergeben.
    Evtl. die 30min-Werte nehmen oder auch nur 5min-Mittelwerte.
    Format könnte sein:
        {"P1":"23.5", "P2":"4.5", "T":"12.4","H":"56","P":"1003"}
     Es müssen also über die Korrelation-Collection die zugehörigen Sensorren dazu gelesen werden.
 ******/


// Daten für einen Tag aus der Datenbank holen
async function getDayData(db, sensorid, sensorname, altitude, st, avg, live, special) {
        let docs = [];
        try {
            if (special == 'silvester17') {
                let coll = db.collection('silvester');
                let silv  = await coll.findOne({_id:sensorid},{_id:0, data:1});
                if (silv != null) {
                    docs = silv.data;
                }
            } else {
                var start = moment(st);                                 // Zeiten in einen moment umsetzen
                var end = moment(st);
                var colstr = 'data_' + sensorid;
                var collection = db.collection(colstr);
                if (live == true) {
                    start.subtract(24, 'h');
                    start.subtract(avg,'m');
                } else {
                    start.subtract(avg,'m');
                    end.add(24, 'h');
                }
                docs = await collection.find({
                    datetime: {
                        $gte: new Date(start),
                        $lt: new Date(end)
                    }
                }, {sort: {datetime: 1}}).toArray();
            }
            console.log(docs.length + " Daten gelesen für " + sensorname + ' bei day')
            if (docs.length == 0) {
                return {'docs': []};
            } else {
                if (isPM(sensorname)) {
                    var x = calcMovingAverage(docs, avg,  0, 0);
                    var y = calcMinMaxAvgSDS(docs, false);
                    return {'docs': x.PM, 'maxima': y};
                } else if (sensorname == "DHT22") {
                    return {'docs': calcMovingAverage(docs, avg,  0, 0).THP,
                    'minmax': calcMinMaxAvgDHT(docs)};
                } else if (sensorname == "BMP180") {
                    return {'docs': calcMovingAverage(docs, avg,  altitude, 0).THP,
                    'minmax': calcMinMaxAvgBMP(docs,altitude)};
                } else if (sensorname == "BME280") {
                    return {'docs': calcMovingAverage(docs, avg, altitude, 0).THP,
                    'minmax':calcMinMaxAvgBME(docs,altitude)};
                }
            }
        }
        catch(e) {
            console.log(e);
        }
}

// Daten für eine Woche aus der DB holen
function getWeekData(db, sensorid, sensorname, altitude , st, live) {
    var p = new Promise(function(resolve,reject) {
        var start = moment(st);
        var end = moment(st);
        var colstr = 'data_' + sensorid;
        var collection = db.collection(colstr);
        if (live == true) {
            if (isPM(sensorname)) {
                start.subtract(24 * 8, 'h');
            } else {
                start.subtract(24 * 7, 'h');
            }
        } else {
            start.subtract(24,'h');
            end.add(24*7,'h');
        }
        collection.find({
            datetime: {
                $gte: new Date(start),
                $lt: new Date(end)
            }
        }, {sort: {datetime: 1}}).toArray(function (e, docs) {
            if (e != null) {
                reject(e);
            }
            console.log(docs.length + " Daten gelesen für " + sensorname + ' bei week')
            if (docs.length == 0) {
                resolve({'docs': []})
            } else {
                if (isPM(sensorname)) {
                    var wdata = calcMovingAverage(docs, 1440 ,  0,0);
                    var y = calcMinMaxAvgSDS(wdata.PM,true);
                    resolve({'docs': wdata.PM, 'maxima': y });
                } else if (sensorname == "DHT22") {
                    resolve({'docs': calcMovingAverage(docs, 10,  altitude).THP,
                        'minmax': calcMinMaxAvgDHT(docs)});
                } else if (sensorname == "BMP180") {
                    resolve({'docs': calcMovingAverage(docs, 10,  altitude).THP,
                        'minmax': calcMinMaxAvgBMP(docs,altitude)});
                } else if (sensorname == "BME280") {
                    resolve({'docs': calcMovingAverage(docs, 10,  altitude).THP,
                        'minmax':calcMinMaxAvgBME(docs,altitude)});
                }
            }
        });
    });
    return p;
}


// Daten für ein ganzes Jahr abholen
function getYearData(db,sensorid,sensorname, st,what) {
    var p = new Promise(function(resolve,reject) {
        var start = moment(st);
        var end = moment(st);
        var colstr = 'data_' + sensorid;
        var collection = db.collection(colstr);
        start=start.startOf('day');
        end = end.startOf('day');
        if(what == 'oneyear') {
            start.subtract(366, 'd');
        } else {
            start.subtract(33, 'd');
        }
        start.subtract(1,'d');          // plot until 'yesterday'
        var datRange = {datetime: {$gte: new Date(start), $lt: new Date(end)}};
//            console.log('datrange:', datRange);
        var sorting = {datetime: 1};
        var grpId = {$dateToString: {format: '%Y-%m-%d', date: '$datetime'}};
        var cursor;
        var stt = new Date();


                if (isPM(sensorname)) {
                    cursor = collection.aggregate([
                        {$sort: sorting},
                        {$match: datRange},
                        {
                            $group: {
                                _id: grpId,
                                avgP10: {$avg: '$P1'},
                                avgP2_5: {$avg: '$P2'},
                                count: {$sum: 1}
                            }
                        },
                        {$sort: {_id: 1}}
                    ]);
                    cursor.toArray(function (err, docs) {
//                    console.log(docs);
                        console.log("Dauer SDS:", new Date() - stt)
                        resolve({'docs': docs});
                    });
                } else if (sensorname == 'DHT22') {
                    cursor = collection.aggregate([
                        {$sort: sorting},
                        {$match: datRange},
                        {
                            $group: {
                                _id: grpId,
                                tempAV: {$avg: '$temperature'},
                                tempMX: {$max: '$temperature'},
                                tempMI: {$min: '$temperature'},
                            }
                        },
                        {$sort: {_id: 1}}
                    ], {cursor: {batchSize: 1}});
                    cursor.toArray(function (err, docs) {
                        var min = Infinity, max = -Infinity, x;
                        for (x in docs) {
                            if (docs[x].tempMI < min) min = docs[x].tempMI;
                            if (docs[x].tempMX > max) max = docs[x].tempMX;
                        }
                        console.log("Dauer DHT:", new Date() - stt)
                        resolve({'docs': docs, 'maxima': {'tmax': max, 'tmin': min}});
                    });
                } else if ((sensorname == 'BMP180') || (sensorname == 'BME280')) {
                    cursor = collection.aggregate([
                        {$sort: sorting},
                        {$match: datRange},
                        {
                            $group: {
                                _id: grpId,
                                pressAV: {$avg: '$pressure'},
                                tempAV: {$avg: '$temperature'},
                                tempMX: {$max: '$temperature'},
                                tempMI: {$min: '$temperature'},
                            }
                        },
                        {$sort: {_id: 1}}
                    ], {cursor: {batchSize: 1}});
                    cursor.toArray(function (err, docs) {
                        var min = Infinity, max = -Infinity, x;
                        for (x in docs) {
                            if (docs[x].tempMI < min) min = docs[x].tempMI;
                            if (docs[x].tempMX > max) max = docs[x].tempMX;
                        }
                        console.log("Dauer BMP/E:", new Date() - stt)
                        resolve({'docs': docs, 'maxima': {'tmax': max, 'tmin': min}});
                    });
                }
    });
    return p;
}


// *********************************************
// Calculate moving average over the data array.
//
//  params:
//      data:       array of data
//      mav:        time in minutes to average
//      name:       name of sensor
//      cap:        cap so many max and min values
//      api:        default=false,  true = API -> no akt. values
//
// return:
//      array with averaged values
// TODO <-----  die ersten Einträge in newData mit 0 füllen bis zum Beginn des average
// *********************************************
function calcMovingAverage(data, mav, altitude, cap, api) {
    var newDataF = [], newDataT = [];
    var avgTime = mav*60;           // average time in sec

    let havepressure = false;       // true: we have pressure
    let iamPM = false;               // true: we are PM values

    if (avgTime === 0) {            // if there's nothing to average, then
        avgTime = 1;
    }
    // first convert date to timestam (in secs)
    for (var i=0; i<data.length; i++) {
        data[i].datetime = ( new Date(data[i].datetime)) / 1000;       // the math does the convertion
    }

    let left=0, roll_sum1=0, roll_sum2=0,  roll_sum3=0, roll_sum4=0, roll_sum5=0;
    if(data[0].P1 != undefined) {
        iamPM = true;
    }
    if(data[0].pressure != undefined) {
        havepressure = true;
    }
    for (let right =0; right <  data.length; right++) {
        if (data[right].P1 != undefined) {
            roll_sum1 += data[right].P1;
        }
        if (data[right].P2 != undefined) {
            roll_sum2 += data[right].P2;
        }

        if (data[right].temperature != undefined) {
            roll_sum3 += data[right].temperature;
        }
        if (data[right].humidity != undefined) {
            roll_sum4 += data[right].humidity;
        }
        if (data[right].pressure != undefined) {
            roll_sum5 += data[right].pressure;
        }
        while (data[left].datetime <= data[right].datetime - avgTime) {
            if (data[left].P1 != undefined) {
                roll_sum1 -= data[left].P1;
            }
            if (data[left].P2 != undefined) {
                roll_sum2 -= data[left].P2;
            }
            if (data[left].temperature != undefined) {
                roll_sum3 -= data[left].temperature;
            }
            if (data[left].humidity != undefined) {
                roll_sum4 -= data[left].humidity;
            }
            if (data[left].pressure != undefined) {
                roll_sum5 -= data[left].pressure;
            }
            left += 1;
        }
        if (api == true) {
            newDataF[right] = {
                'P1': (roll_sum1 / (right - left + 1)).toFixed(2),
                'P2': (roll_sum2 / (right - left + 1)).toFixed(2),
                'dt': moment.unix(data[right].datetime),
            };
            newDataT[right] = {'dt': moment.unix(data[right].datetime)};
            if (roll_sum3 != 0) newDataT[right]['T'] = (roll_sum3 / (right - left + 1)).toFixed(1);
            if (roll_sum4 != 0) newDataT[right]['H'] = (roll_sum4 / (right - left + 1)).toFixed(0);
            if (roll_sum5 != 0) newDataT[right]['P'] = (roll_sum5 / (right - left + 1)).toFixed(2);
        } else {
            newDataF[right] = {
                'P10_mav': roll_sum1 / (right - left + 1),
                'P2_5_mav': roll_sum2 / (right - left + 1),
                'date': data[right].datetime * 1000,
                'P10': data[right].P1,
                'P2_5': data[right].P2
            };
            newDataT[right] = {'date': data[right].datetime * 1000};
            if (roll_sum3 != 0) newDataT[right]['temp_mav'] = roll_sum3 / (right - left + 1);
            if (roll_sum4 != 0) newDataT[right]['humi_mav'] = roll_sum4 / (right - left + 1);
            if (roll_sum5 != 0) newDataT[right]['press_mav'] = roll_sum5 / (right - left + 1);
        }
    }
    if (havepressure == true) {
        if (api==true) {
            newDataT = calcSealevelPressure(newDataT,'P',altitude);
            for (let i=0; i< newDataT.length; i++) {
                newDataT[i].P = (newDataT[i].P / 100).toFixed(0);
            }
        } else {
            newDataT = calcSealevelPressure(newDataT,'press_mav',altitude);
        }
    }
    if (api == true) {
        return (iamPM == true ? newDataF : newDataT);
    }
    return { 'PM': newDataF, 'THP' : newDataT };
}

// Berechnung des barometrischen Druckes auf Seehöhe
//
// Formel (lt. WikiPedia):
//
//  p[0] = p[h] * ((T[h] / (T[h] + 0,0065 * h) ) ^-5.255)
//
//  mit
//		p[0]	Druck auf NN (in hPa)
//		p[h]	gemessener Druck auf Höhe h (in m)
//		T[h]	gemessene Temperatur auf Höhe h in K (== t+273,15)
//		h		Höhe über NN in m
//
//  press	->	aktuelle Druck am Ort
//	temp	->	aktuelle Temperatur
//  alti	-> Höhe über NN im m
//
// NEU NEU NEU
// Formel aus dem BMP180 Datenblatt
//
//  p0 = ph / pow(1.0 - (altitude/44330.0), 5.255);
//
//
//
//	Rückgabe: normierter Druck auf Sehhhöhe
//
function calcSealevelPressure(data, p, alti) {
    if (!((alti == 0) || (alti == undefined))) {
        for (let i = 0; i < data.length; i++) {
            if (p=='') {
                data[i] = data[i] / Math.pow(1.0 - (alti / 44330.0), 5.255);
            } else {
                data[i][p] = data[i][p] / Math.pow(1.0 - (alti / 44330.0), 5.255);
            }
        }
    }
    return data
}



// für die Wochenanzeige die Daten als gleitenden Mittelwert über 24h durchrechnen
// und in einem neuen Array übergeben
function movAvgSDSWeek(data) {
    var neuData = [];
    const oneDay = 3600*24;

    // first convert date to timestam (in secs)
    for (var i=0; i<data.length; i++) {
        data[i].datetime = ( new Date(data[i].datetime)) / 1000;       // the math does the convertion
    }

    // now calculate the moving average over 24 hours
    let left=0, roll_sum=0, nd = [];
    for (let right =0; right <  data.length; right++) {
//        if(right == 200) {
//            console.log("right = 200");
//        }

        if(data[right].P1 != undefined) {
            roll_sum += data[right].P1;
        }
        if(data[right].P10 != undefined) {
            roll_sum += data[right].P10;
        }

        while( data[left].datetime <= data[right].datetime - oneDay) {
            if(data[left].P1 != undefined) {
                roll_sum -= data[left].P1;
            }
            if(data[left].P10 != undefined) {
                roll_sum -= data[left].P10;
            }
            left += 1;
         }
         nd[right] = { 'P1024': roll_sum/ (right-left+1)+5};
    }

    for (var i=1, j=0; i< data.length; i++, j++) {
        var sum1=0, sum2 = 0, cnt1 = 0, cnt2 = 0;
        var di = data[i].datetime;
        for (var k=i; k>=0 ; k--) {
            if (data[k].datetime+oneDay < di) {
                break;
            }
            if (data[k].P1 !== undefined) {
                sum1 += data[k].P1;
                cnt1++;
            }
            if (data[k].P2 !== undefined) {
                sum2 += data[k].P2;
                cnt2++;
            }
            if (data[k].P10 !== undefined) {
                sum1 += data[k].P10;
                cnt1++;
            }
            if (data[k].P2_5 !== undefined) {
                sum2 += data[k].P2_5;
                cnt2++;
            }
        }
        neuData[j] = {'P10': sum1 / cnt1, 'P2_5': sum2 / cnt2, 'date': data[i].datetime} ;
    }
    // finally shrink datasize, so that max. 1000 values will be returned
    var neu1 = [];
    var step = Math.round(neuData.length / 500);
//    if (step == 0) step = 1;
    step = 1;
    for (var i = 0, j=0; i < neuData.length; i+=step, j++) {
        var d = neuData.slice(i,i+step)
        var p1=0, p2=0;
        for(var k=0; k<d.length; k++) {
            if (d[k].P10 > p1) {
                p1 = d[k].P10;
            }
            if (d[k].P2_5 > p2) {
                p2 = d[k].P2_5;
            }
        }
        neu1[j] = {'P10': p1, 'P2_5': p2, 'date': neuData[i].date*1000} ;
    }
    return { 'ndold': neu1, 'ndnew': nd };
}



function calcMinMaxAvgSDS(data,isp10) {
    var p1=[], p2=[];
    for (var i = 0; i < data.length; i++) {
        if (data[i].P10 != undefined) {
            p1.push(data[i].P10);
        }
        if (data[i].P2_5 != undefined) {
            p2.push(data[i].P2_5);
        }
        if (data[i].P1 != undefined) {
            p1.push(data[i].P1);
        }
        if (data[i].P2 != undefined) {
            p2.push(data[i].P2);
        }
    }
    return {
        'P10_max': mathe.max(p1),
        'P2_5_max': mathe.max(p2),
        'P10_min': mathe.min(p1),
        'P2_5_min': mathe.min(p2),
        'P10_avg' : mathe.mean(p1),
        'P2_5_avg' : mathe.mean(p2) };
}

function calcMinMaxAvgDHT(data) {
    var t=[], h=[];
    for (var i=0; i<data.length; i++) {
        if(data[i].temperature != undefined) {
            t.push(data[i].temperature);
        }
        if(data[i].humidity != undefined) {
            h.push(data[i].humidity);
        }
    }
    return {
        'temp_max': mathe.max(t),
        'humi_max': mathe.max(h),
        'temp_min': mathe.min(t),
        'humi_min': mathe.min(h),
        'temp_avg' : mathe.mean(t),
        'humi_avg' : mathe.mean(h) };
}


function calcMinMaxAvgBMP(data,altitude) {
    var t=[], p=[];
    for (var i=0; i<data.length; i++) {
        if(data[i].temperature != undefined) {
            t.push(data[i].temperature);
        }
        if(data[i].pressure != undefined) {
            p.push(data[i].pressure);
        }
    }
    p = calcSealevelPressure(p,'',altitude);
    return { 'temp_max': mathe.max(t), 'press_max': mathe.max(p),
    'temp_min': mathe.min(t), 'press_min': mathe.min(p),
    'temp_avg' : mathe.mean(t), 'press_avg' : mathe.mean(p) };
}

function calcMinMaxAvgBME(data,altitude) {
    var t=[], h=[], p=[], sumt=0;
    for (var i=0; i<data.length; i++) {
        if(data[i].temperature != undefined) {
            t.push(data[i].temperature);
        }
        if(data[i].humidity != undefined) {
            h.push(data[i].humidity);
        }
        if(data[i].pressure != undefined) {
            p.push(data[i].pressure);
        }
    }
    p = calcSealevelPressure(p,'',altitude);
    return { 'temp_max': mathe.max(t), 'humi_max': mathe.max(h), 'press_max': mathe.max(p),
    'temp_min': mathe.min(t), 'humi_min': mathe.min(h), 'press_min': mathe.min(p),
    'temp_avg' : mathe.mean(t), 'humi_avg' : mathe.mean(h), 'press_avg' : mathe.mean(p) };
}

function isPM(name) {
    if ((name == "SDS011") || (name.startsWith("PPD")) || (name.startsWith("PMS"))) {
        return true;
    }
    return false;
}


// Aus der 'properties'-collection die altitude für die
// übergebene sid rausholen
async function getAltitude(db,sid) {
    let collection = db.collection('properties');
    try {
        let values = await collection.findOne({"_id":sid});
        return values.location[values.location.length-1].altitude;
        }
    catch(e) {
        console.log("GetAltitude Error",e);
        return 0
    }
}



module.exports = router;
module.exports.calcMovingAverage = calcMovingAverage;
