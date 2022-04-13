"use strict";
const express = require('express');
const router = express.Router();
const moment = require('moment');
const mathe = require('mathjs');
const util = require('./utilities');
const axios = require('axios')

// Mongo wird in app.js geöffnet und verbunden und bleibt immer verbunden !!

let sv_factor = {'SBM-20': 1 / 2.47, 'SBM-19': 1 / 9.81888, 'Si22G': 0.081438};

//Get readings for all data out ot the database
router.get('/getfs/:week', function (req, res) {
    let week = req.params.week;
    let db = req.app.get('dbase');
    let st = req.query.start;
    let sid = parseInt(req.query.sensorid);
    let sname = req.query.sensorname;
    let avg = req.query.avgTime;
    let live = (req.query.live == 'true');
    let movingAvg = (req.query.moving=='true');
    let longAVG = req.query.longAVG;
    let system = req.query.os;

    if (week == 'oneday') {
        console.log(`Operating System = ${system}`);
        getDWMData(db, sid, st, avg, live, movingAvg, 1, longAVG, sname)
            .then(erg => res.json(erg));
    } else if (week == 'oneweek') {
        getDWMData(db, sid, st, avg, live, movingAvg, 7)
            .then(erg => res.json(erg));
    } else if (week == 'onemonth') {
        getDWMData(db, sid, st, 1440, false, false, 31)
            .then(erg => res.json(erg));
    } else if (week == 'korr') {
        getSensorProperties(db,sid)
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
    let start = new Date();
    console.log("Get properties for", sid,"from DB");
    let sensorEntries = [{'sid':sid}];
    let coll = db.collection('properties');
    let properties;
    try {
        properties = await coll.findOne({_id: sid});
    }
    catch(e) {
        console.log("getSensorProperties",e);
        return {};
    }
    console.log("got properties - time:", new Date() - start);
    if(properties == null) return null;
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


async function readRadiationMovingAverage(db, sid, start, end, average, factor) {
    let docs = [];
    let collection = db.collection('data_'+sid);
    try {
        docs = await collection.find({
            datetime: {
                $gte: new Date(start),
                $lt: new Date(end)
            }
        }, {sort: {datetime: 1}}).toArray();
    } catch (e) {
        console.log('readRadiationMovingAverage',e);
        return [];
    }
    if (docs.length == 0) {
        return [];
    } else {
        let d = await util.calcMovingAverage(db, sid, docs, average , false, factor);
        return d.RAD;
    }
}

async function readRadiationAverages(db, sid, start, end, average, factor) {
    let docs = [];
    let collection = db.collection('data_'+sid);
    try {
        docs = await collection.aggregate([
            {$sort: {datetime: 1}},
            {$match: {datetime: {$gte: new Date(start), $lt: new Date(end)}}},
            {
                $group: {
                    _id: {
                        $toDate: {
                            $subtract: [
                                {$toLong: '$datetime'},
                                {$mod: [{$toLong: '$datetime'}, 1000 * 60 * average]}    // aggregate every average minutes
                            ]
                        }
                    },
                    cpmAvg: {$avg: '$counts_per_minute'},
                    cpmSum: {$sum: '$counts_per_minute'},
                    count: {$sum: 1}
                }
            },
            { $addFields: { uSvphAvg: { $multiply: ["$cpmAvg", factor]}}},
            {$sort: {_id: 1}}
        ]).toArray();
    }
    catch(e) {
        console.log('readRadiationAverages', e);
        return [];
    }
    return docs;
}

async function readClimateAverages(db, sid, start, end, average) {
    let docs = [];
    let collection = db.collection('data_'+sid);
    try {
        docs = await collection.aggregate([
            {$sort: {datetime: 1}},
            {$match: {datetime: {$gte: new Date(start), $lt: new Date(end)}}},
            {
                $group: {
                    _id: {
                        $toDate: {
                            $subtract: [
                                {$toLong: '$datetime'},
                                {$mod: [{$toLong: '$datetime'}, 1000 * 60 * average]}    // aggregate every average min
                            ]
                        }
                    },
                    tempAvg: {$avg: '$temperature'},            // average over every 10min
                    humiAvg: {$avg: '$humidity'},
                    pressSeaAvg: {$avg: '$pressure_at_sealevel'},
                    count: {$sum: 1}
                }
            },
            {$sort: {_id: 1}}
        ]).toArray();
    }
    catch(e) {
        console.log('readClimateAverage', e);
        return [];
    }
    return docs;
}

function calcTimeRange(st, range, live, avg) {
    let start = moment(st);
    let end = moment(st);
    if(range == 1) {                                       // one day
        if (live == true) {
            start.subtract(24, 'h');
            start.subtract(avg, 'm');
        } else {
            start.subtract(avg, 'm');
            end.add(24, 'h');
        }
    } else if (range == 7) {                                // one week (7 days)
        if (live == true) {
            start.subtract(24 * 8, 'h');
        } else {
            start.subtract(24 * 8, 'h');
//            end.add(24 * 7, 'h');
            console.log(start.format(), end.format());
        }
    } else if (range == 31) {                               // one month (31 days)
        start=start.startOf('day');
        end = end.startOf('day');
        start.subtract(33, 'd');
    } else if (range >= 48) {                               // 48 hours
        if(live == true) {
            start.subtract(range, 'h')
        }
    }
    return { start: start, end: end };
}

// get data for one day, one week or one month from the database
async function getDWMData(db, sensorid, st, avg, live, doMoving, span, longAVG, sname) {
    let erg = {}
    let response

    let url = `http://localhost:3000/getactdata?sensorid=${sensorid}&span=${span}&datetime=${st}`
    if(avg != 1) {
        url = `http://localhost:3000/getmovavg?sensorid=${sensorid}&span=${span}&datetime=${st}&movavg=${avg}`
    }
    try {
        response = await axios.get(encodeURI(url));
    } catch(e) {
        return{error: true, errortext: e}
        return
    }
    const factor = sv_factor[sname.slice(10)] / 60;
    erg.radiation = {values: response.data.values, sid: response.data.sid, sname: sname}
    erg.radiation.values.map((x) => {
        x.uSvph = x.counts_per_minute * factor
    })
    return erg
/*

        let docs = [];
        let ret = {radiation: [], climate: []};
        // first fetch properties for this sensor
        let properties = await getSensorProperties(db,sensorid);
        // calculate time range
        let timerange = calcTimeRange(st, span, live, avg);
        for (let n = 0; n<properties.othersensors.length; n++) {
            let sid = properties.othersensors[n].sid;
            let sname = properties.othersensors[n].name;
            try {
                if (sname.startsWith("Radiation")) {
                    let factor = sv_factor[sname.substring(10)] / 60;
                    if(doMoving) {
                        docs = await readRadiationMovingAverage(db, sid, timerange.start, timerange.end, avg, factor);
                    } else {
                        docs = await readRadiationAverages(db, sid, timerange.start, timerange.end, avg, factor);
                    }
                    let avg48 = null;
                    if (longAVG != undefined) {
                        timerange = calcTimeRange(st, longAVG, true, avg);
                        let avg48_docs = await readRadiationAverages(db, sid, timerange.start, timerange.end, longAVG*60, factor);
                        avg48 = avg48_docs[0];
                    }
                    ret['radiation'] = {sid: sid, sname: sname, avg48: avg48, values: docs};
                } else if (sname == "BME280") {
                    docs = await readClimateAverages(db, sid, timerange.start, timerange.end, 10);
                    if (docs.length != 0) {
                        ret['climate'] = {sid: sid, sname: sname, values: docs};
                    }
                } else {
                    ret['error'] = "Sensor not of right type (unknown)";
                }
            } catch (e) {
                console.log('getDayData', e);
            }
        }
        return ret;

 */
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


async function calcMinMaxAvgBMP(db, sid, data) {
    var t = [], p = [];
    for (var i = 0; i < data.length; i++) {
        if (data[i].temperature != undefined) {
            t.push(data[i].temperature);
        }
        if (data[i].pressure != undefined) {
            p.push(data[i].pressure);
        }
    }
    let altitude = await util.getAltitude(db, sid);
    p = util.calcSealevelPressure(p, '', altitude);
    return {
        'temp_max': mathe.max(t), 'press_max': mathe.max(p),
        'temp_min': mathe.min(t), 'press_min': mathe.min(p),
        'temp_avg': mathe.mean(t), 'press_avg': mathe.mean(p)
    };
}

async function calcMinMaxAvgBME(db, sid, data) {
    var t = [], h = [], p = [], sumt = 0;
    for (var i = 0; i < data.length; i++) {
        if (data[i].temperature != undefined) {
            t.push(data[i].temperature);
        }
        if (data[i].humidity != undefined) {
            h.push(data[i].humidity);
        }
        if (data[i].pressure != undefined) {
            p.push(data[i].pressure);
        }
    }
    let altitude = await util.getAltitude(db, sid);
    p = util.calcSealevelPressure(p, '', altitude);
    return {
        'temp_max': mathe.max(t), 'humi_max': mathe.max(h), 'press_max': mathe.max(p),
        'temp_min': mathe.min(t), 'humi_min': mathe.min(h), 'press_min': mathe.min(p),
        'temp_avg': mathe.mean(t), 'humi_avg': mathe.mean(h), 'press_avg': mathe.mean(p)
    };
}

function isPM(name) {
    if ((name == "SDS011") || (name.startsWith("PPD")) || (name.startsWith("PMS"))) {
        return true;
    }
    return false;
}


// Statistiken für den Sensor holen und übergeben
async function getStatistics(db,sensorid) {
    let ret = { error:'empty'};
    const Avgs = [
        { nameA: 'a15m', nameD: 'd15m', nameM: 'm15m', time: 15 , art: 'avg'},
        { nameA: 'a60m', nameD: 'd60m', nameM: 'm60m', time: 60 , art: 'avg'},
        { nameA: 'a24h', nameD: 'd24h', nameM: 'm24h', time: 1440 , art: 'avg'},
        ];

    const now = moment();                                 // Zeiten in einen moment umsetzen

    const colstr = 'data_' + sensorid;
    const collection = db.collection(colstr);

    // get aktual value
    let erg  = await collection.findOne({},{sort:{datetime:-1}})
    ret.p10 = erg.P1;
    ret.p25 = erg.P2;

    // get the averages
    for (let i=0; i<Avgs.length; i++) {
        let start = moment(now).subtract(Avgs[i].time,'m');
        erg = await collection.aggregate(
            [
                { $match: {
                        datetime: {
                            $gte: new Date(start),
                        }
                    }
                },
                { $group: {
                        _id: null,
                        avg1: { $avg: '$P1' },
                        std1: { $stdDevPop: '$P1' },
                        max1: { $max: '$P1'},
                        avg2: { $avg: '$P2' },
                        std2: { $stdDevPop: '$P2' },
                        max2: { $max: '$P2'},
                    }
                }
            ]
        ). toArray();
        ret['p10_'+Avgs[i].nameD] = parseFloat(erg[0].std1.toFixed(2));
        ret['p10_'+Avgs[i].nameA] = parseFloat(erg[0].avg1.toFixed(2));
        ret['p10_'+Avgs[i].nameM] = parseFloat(erg[0].max1.toFixed(2));
        ret['p25_'+Avgs[i].nameD] = parseFloat(erg[0].std2.toFixed(2));
        ret['p25_'+Avgs[i].nameA] = parseFloat(erg[0].avg2.toFixed(2));
        ret['p25_'+Avgs[i].nameM] = parseFloat(erg[0].max2.toFixed(2));
    }

    // get the yesterday values
    let start = moment(now).subtract(1,'d');
    start.startOf('day');
    let end = moment(now).startOf('day');
    erg = await collection.aggregate(
        [
            { $match: {
                    datetime: {
                        $gte: new Date(start),
                        $lt: new Date(end),
                    }
                }
            },
            { $group: {
                    _id: null,
                    avg1: { $avg: '$P1'},
                    std1: { $stdDevPop: '$P1' },
                    max1: { $max: '$P1'},
                    avg2: { $avg: '$P2'},
                    std2: { $stdDevPop: '$P2' },
                    max2: { $max: '$P2'},
                }
            }
        ]
    ). toArray();
    ret.p10_d24hy = parseFloat(erg[0].std1.toFixed(2));
    ret.p10_a24hy = parseFloat(erg[0].avg1.toFixed(2));
    ret.p25_d24hy = parseFloat(erg[0].std2.toFixed(2));
    ret.p25_a24hy = parseFloat(erg[0].avg2.toFixed(2));


    return ret;
}


module.exports = router;
