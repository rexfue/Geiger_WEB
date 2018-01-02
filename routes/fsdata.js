var express = require('express');
var router = express.Router();
var moment = require('moment');
var mathe = require('mathjs');
var Vector = require('gauss').Vector;

// Mongo wird in app.js geöffnet und verbunden und bleibt immer verbunden !!

//Get readings for all data out ot the database
router.get('/getfs/:week', function (req, res) {
    var week = req.params.week;
    var db = req.app.get('dbase');
    var st = req.query.start;
    var data = { 'error': 'OK'};
    var samples = req.query.samples;
    var avg = req.query.avgTime;
    var live = (req.query.live == 'true');
    getSensorProperties(db,parseInt(req.query.sensorid))
        .then((props) => {
            if (week == 'oneday') {
                getDayData(db, props.sid, props.name,
                    props.location[props.location.length-1].altitude, st, avg, live)
                    .then(erg => res.json(erg));
            } else if (week == 'oneweek') {
                getWeekData(db, props.sid, props.name, st)
                    .then(erg => res.json(erg));
            } else if ((week == 'oneyear') || (week == 'onemonth')) {
                data['docs'] = getYearData(db, props.sid, props.name, st, week, live)
                    .then(erg => res.json(erg));
            } else if (week == 'latest') {
                getLatestValues(db, props.sid, props.name, samples)
                    .then(erg => res.json(erg));
            } else if (week == 'korr') {
                res.json(props);
            } else if (week == "oldest") {
                getOldestEntry(db, props.sid)
                    .then(erg => res.json(erg));
            } else {
                data = {'error': 'MIST VERDAMMTER!!'};
                res.json(data);
            }
        });
});

// fetch name of given sensor-id
function getSensorName(db,sid) {
    const p = new Promise((resolve,reject) => {
        let coll = db.collection('properties');
        coll.findOne({sid: parseInt(sid)})
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
    console.log("Get properties for", sid);
    let sensorEntries = [{'sid':sid}];
    let coll = db.collection('properties');
    let erg = await coll.findOne({sid: sid});
    sensorEntries[0]['name'] = erg.name;
    for(let i = 0, j=1; i<erg.othersensors.length; i++) {
        let e = {sid: erg.othersensors[i]};
        e.name = await getSensorName(db, erg.othersensors[i]);
        sensorEntries[j] = e;
        j++;
    }
    sensorEntries.sort(function (a, b) {
        if (a.sid < b.sid) {
            return -1;
        }
        if (a.aid > b.aid) {
            return 1;
        }
        return 0;
    });
    erg.othersensors = sensorEntries;
    return erg;
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
            if ((sensorname == "SDS011") || (sensorname == "PMS3003")) {
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
function getDayData(db,sensorid, sensorname, altitude, st, avg, live) {
    var p = new Promise(function(resolve,reject) {              // Promise erzeugen
        var start = moment(st);                                 // Zeiten in einen moiment umsetzen
        var end = moment(st);
        var colstr = 'data_' + sensorid;
        var collection = db.collection(colstr);
        // TODO <--------------------- hier noch die Minuten für die Mittlelwertbildung abziehen
        if (live == true) {
            start.subtract(24, 'h');
        } else {
            end.add(24,'h');
        }
//            console.log(colstr,start,end);
        // <--- PROMISES !!!
        collection.find({
            datetime: {
                $gte: new Date(start),
                $lt: new Date(end)
            }
        }, {sort: {datetime: 1}}).toArray(function (e, docs) {
            if (e != null) {
                reject(e);
            }
                    console.log(docs.length + " Daten gelesen für " + sensorname + ' bei day')
                    if (docs.length == 0) {
                        resolve({'docs': []})
                    } else {
                        if (sensorname == "SDS011") {
                            var x = calcMovingAverage(docs, avg  , 'SDS011', 0,0);
                            var y = calcMinMaxAvgSDS(docs,false);
                            resolve({'docs': x, 'maxima': y}); //, 'others': others.sensors});
                        } else if (sensorname == "DHT22") {
                            resolve({'docs': calcMovingAverage(docs, 10, sensorname,0,0)});
                        } else if (sensorname == "BMP180") {
                            resolve({'docs': calcMovingAverage(docs, 10, sensorname, altitude,0)});
                        } else if (sensorname == "BME280") {
                            resolve({'docs': calcMovingAverage(docs, 10, sensorname, altitude,0)});
                        }
                    }
        });
    });
    return p;
}

// Daten für eine Woche aus der DB holen
function getWeekData(db, sensorid, sensorname, st) {
    var p = new Promise(function(resolve,reject) {
        var start = moment(st);
        var end = moment(st);
        var colstr = 'data_' + sensorid;
        var collection = db.collection(colstr);
        if (sensorname == "SDS011") {
            start.subtract(24*8, 'h');
        } else {
            start.subtract(24*7, 'h');
        }
        // TODO <--------------- Mittelwert-Minuten(Tage) reinrechnen
        // TODO <-------------- Live nocht vergessrn
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
                        if (sensorname == "SDS011") {
                            var wdata = movAvgSDSWeek(docs);
                            var y = calcMinMaxAvgSDS(wdata,true);
                            resolve({
                                'docs': wdata, 'maxima': y
                            });
                        } else if ((sensorname == "DHT22") || (sensorname == "BMP180") || (sensorname == "BME280")) {
                            resolve({'docs': calcMovingAverage(docs, 10, sensorname)});
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
            start.subtract(32, 'd');
        }
        start.add(1,'h');                           // UTC-Anpassung !!!!!!! Sommerzeit !!!!!!!
        end.add(1,'h');
        var datRange = {datetime: {$gte: new Date(start), $lt: new Date(end)}};
//            console.log('datrange:', datRange);
        var sorting = {datetime: 1};
        var grpId = {$dateToString: {format: '%Y-%m-%d', date: '$datetime'}};
        var cursor;
        var stt = new Date();


                if (sensorname == 'SDS011') {
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
//
// return:
//      array with averaged values
// TODO <-----  die ersten Einträge in newData mit 0 füllen bis zum Beginn des average
// *********************************************
function calcMovingAverage(data, mav, name, altitude, cap) {
    var newDatax = [], newData = [];
    var avgTime = mav*60;           // average time in sec

    if (avgTime === 0) {            // if there's nothing to average, then
        return data;                // return original data
    }
    // first convert datetime to timestamp (in secs)
//    for (var i=0; i<data.length; i++) {
//        data[i].date = ( new Date(data[i].date)) / 1000;       // the math does the conversion
//   }
    data[0].datetime = ( new Date(data[0].datetime)) / 1000;       // the math does the conversion
// now calculate the average
    for (var i = 1, j=0; i < data.length; i++, j++) {
        var sum1 = 0, sum2 = 0, sum3=0, cnt1=0, cnt2=0, cnt3=0;
        var a1=[], a2=[], a3=[];
        data[i].datetime = ( new Date(data[i].datetime)) / 1000;       // the math does the conversion
        var di = data[i].datetime;
        if ((name == 'SDS011') || (name == 'SDS021') || (name == 'PMS3003')) {
            for (var k = i; k > 0; k--) {
                var dk = data[k].datetime;
                if (dk + avgTime <= di) {
                    break;
                }
                if (data[k].P1 !== undefined) {
                    a1.push(data[k].P1);
//                    sum1 += data[k].P10;
//                    cnt1++;
                }
                if (data[k].P2 !== undefined) {
                    a2.push(data[k].P2)
//                    sum2 += data[k].P2_5;
//                    cnt2++;
                }
            }
            if (cap > 0) {

                a1.sort(function (a, b) {
                    return (a - b);
                });
                a1 = a1.slice(cap, a1.length - cap);
                a2.sort(function (a, b) {
                    return (a - b);
                });
                a2 = a2.slice(cap, a2.length - cap);
            }
            var p10m = data[i].P1;
            var p25m = data[i].P2;
            if (a1.length>0) {
                p10m = mathe.mean(a1);
            }
            if (a2.length > 0) {
                p25m = mathe.mean(a2);
            }
            newData[j] = {'P10_mav': p10m, 'P2_5_mav' : p25m, 'date': data[i].datetime*1000,
                        'P10':data[i].P1, 'P2_5':data[i].P2};
        } else if ((name == "DHT22") || (name == "BMP180") || (name == "BME280")) {
            for (var k = i; k > 0; k--) {
                var dk = data[k].datetime;
                if (dk + avgTime <= di) {
                    break;
                }
                if (data[k].temperature !== undefined) {
                    sum1 += data[k].temperature;
                    cnt1++;
                }
                if (data[k].humidity !== undefined) {
                    sum2 += data[k].humidity;
                    cnt2++;
                }
                if (data[k].pressure !== undefined) {
                    sum3 += data[k].pressure;
                    cnt3++;
                }
            }
            newData[j] = {'date': data[i].datetime * 1000 };
            if (sum1 != 0) newData[j]['temp_mav'] = sum1 / cnt1;
            if (sum2 != 0) newData[j]['humi_mav'] = sum2 / cnt2;
            if (sum3 != 0) newData[j]['press_mav'] = sum3 / cnt3;
        }
    }
    if ((name == "BMP180") || (name == "BME280")) {
        newData = calcSealevelPressure(newData,altitude);
    }
    return newData;
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
function calcSealevelPressure(data, alti) {
    if (!((alti == 0) || (alti == undefined))) {
        for (let i = 0; i < data.length; i++) {
            data[i].press_mav = data[i].press_mav / Math.pow(1.0 - (alti / 44330.0), 5.255);
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
        data[i].date = ( new Date(data[i].datetime)) / 1000;       // the math does the convertion
    }
    // now calculate the moving average over 24 hours
    for (var i=1, j=0; i< data.length; i++, j++) {
        var sum1=0, sum2 = 0, cnt1 = 0, cnt2 = 0;
        var di = data[i].date;
        for (var k=i; k>=0 ; k--) {
            if (data[k].date+oneDay < di) {
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
        }
        neuData[j] = {'P10': sum1 / cnt1, 'P2_5': sum2 / cnt2, 'date': data[i].date} ;
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
    return neu1;
}



function calcMinMaxAvgSDS(data,isp10) {
    var p1=[], p2=[];
    if(isp10) {
        for (var i = 0; i < data.length; i++) {
            if (data[i].P10 != undefined) {
                p1.push(data[i].P10);
            }
            if (data[i].P2_5 != undefined) {
                p2.push(data[i].P2_5);
            }
        }
    } else {
        for (var i = 0; i < data.length; i++) {
            if (data[i].P1 != undefined) {
                p1.push(data[i].P1);
            }
            if (data[i].P2 != undefined) {
                p2.push(data[i].P2);
            }
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


function calcMinMaxAvgBMP(data) {
    var t=[], p=[];
    for (var i=0; i<data.length; i++) {
        if(data[i].temperature != undefined) {
            t.push(data[i].temperature);
        }
        if(data[i].pressure != undefined) {
            p.push(data[i].pressure);
        }
    }
    return { 'temp_max': mathe.max(t), 'press_max': mathe.max(p),
    'temp_min': mathe.min(t), 'press_min': mathe.min(p),
    'temp_avg' : mathe.mean(t), 'press_avg' : mathe.mean(p) };
}

function calcMinMaxAvgBME(data) {
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
    return { 'temp_max': mathe.max(t), 'humi_max': mathe.max(h), 'press_max': mathe.max(p),
    'temp_min': mathe.min(t), 'humi_min': mathe.min(h), 'press_min': mathe.min(p),
    'temp_avg' : mathe.mean(t), 'humi_avg' : mathe.mean(h), 'press_avg' : mathe.mean(p) };
}


module.exports = router;
