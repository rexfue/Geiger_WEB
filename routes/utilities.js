"use strict";
const moment = require('moment');
const mathe = require('mathjs');



// *********************************************
// Calculate moving average over the data array.
//
//  params:
//      data:       array of data
//      mav:        time in minutes to average
//      name:       name of sensor
//      api:        default=false,  true = API -> no akt. values
//
// return:
//      array with averaged values
// TODO <-----  die ersten Einträge in newData mit 0 füllen bis zum Beginn des average
// *********************************************
async function calcMovingAverage(db, sid, data, mav, api, factor) {
    var newDataF = [], newDataT = [], newDataR = [];
    var avgTime = mav*60;           // average time in sec

    let havepressure = false;       // true: we have pressure
    let iamPM = false;               // true: we are PM values

    if (avgTime === 0) {            // if there's nothing to average, then
        avgTime = 1;
    }
    // first convert date to timestamp (in secs)
    for (var i=0; i<data.length; i++) {
        data[i].datetime = ( new Date(data[i].datetime)) / 1000;       // the math does the conversion
    }

    let left=0, roll_sum1=0, roll_sum2=0,  roll_sum3=0, roll_sum4=0, roll_sum5=0, roll_sum6=0;
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
        if (data[right].counts_per_minute != undefined) {
            roll_sum6 += data[right].counts_per_minute;
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
            if (data[left].counts_per_minute != undefined) {
                roll_sum6 -= data[left].counts_per_minute;
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

            newDataR[right] = {'date': data[right].datetime * 1000};
            if (roll_sum6 != 0) newDataR[right]['cpm'] = roll_sum6 / (right - left + 1);
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

//            newDataR[right] = {'date': data[right].datetime * 1000};
            newDataR[right] = {'_id':  moment.unix(data[right].datetime).toDate()};
            if (roll_sum6 != 0) {
                let val = roll_sum6 / (right - left + 1);
                newDataR[right]['cpmAvg'] = val;
                newDataR[right]['uSvphAvg'] = val * factor;
            }
        }
    }
    if (havepressure == true) {
        let altitude = await getAltitude(db, sid);
        if (api == true) {
            newDataT = calcSealevelPressure(newDataT, 'P', altitude);
            for (let i = 0; i < newDataT.length; i++) {
                newDataT[i].P = (newDataT[i].P / 100).toFixed(0);
            }
        } else {
            newDataT = calcSealevelPressure(newDataT, 'press_mav', altitude);
        }
    }
    if (api == true) {
        return (iamPM == true ? newDataF : newDataT);
    }
    return { 'PM': newDataF, 'THP' : newDataT , 'RAD' : newDataR};
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

module.exports.calcMovingAverage = calcMovingAverage;
module.exports.calcSealevelPressure = calcSealevelPressure;
module.exports.getAltitude = getAltitude;