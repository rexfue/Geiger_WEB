/* Feinstaub in Mongo-Db eintragen
 *
 * Die Feinstaubsensoren senden ihre Daten regelmäßig (etwa alle Minute) vie MQTT
 * an den Broker (ist hier der Rechner 'castor' oder auch 'locahost'. 
 * Aufbau der Topic siehe unten.
 * 
 * Hier werden nun die Topics der Feinstaubsensoren am MQTT-Broker subscribed und
 * nach dem Ankommen aller Messages eines Gerätes werden die Daten in die Datenbank (Mongo-DB)
 * eingetragen. Die DB befindet sich auch auf castor bzw. auf localhost.
 * 
 * Wird über node.js gestartet, läuft dann dauernd !
 * 
 * V 1.1  2016-11-02 rxf
 * 		Die Mittelwerte für Feinstaub wurden in die DB auch bei Temp 
 * 		und Druck eingetragen. Behoben.
 * 
 * V 1.0  2016-10-08 rxf
 * 		Start dieser Version 
 * 			Baut auf ursaprünglich in Python geschriebenen
 * 			Version auf
 * 
 */

var
	VERSION="1.0",
	VDATE="2016-11-02";

// 'Konstanten':
const 
	TIMEOUT=10000.								// 10sec Timeout
//	MQTTHOST = "castor";						// der MQTT-Broaker
	MQTTHOST = "rxflan.dyndns-home.com:9883";						// der MQTT-Broaker
	MONGOHOST = "localhost"						// Host der Mongo-Datenbank

var 
	event = require('events'), 					// Event-Library
	moment = require('moment');					// fancy date formats
	mqtt = require('mqtt');						// MQTT-System
	MongoClient = require('mongodb').MongoClient;  // Zugriff auf die Mongo-DB
	assert = require('assert');					// Fehler abfangen
	

// more 'global' Variables
var device = { 
		'SDS011': {'float':['P10', 'P2.5']},
		'DHT22': {'float':['temperature','humidity']},
		'BMP180':{'float':['temperature', 'pressure']},
		'BME280':{'float':['temperature', 'pressure','humidity']},
		'GPS':{'float':['latutude','longitude','height'], 'dattim': ['date','time'] }
		};

var gotMQTTconnection = false;

// Connect to mqtt-Broker
var mqclient = mqtt.connect('mqtt://'+MQTTHOST);

//URL to connect to Mongo-DB
var url = 'mongodb://'+MONGOHOST+':27017/Feinstaub_Test';

var geraete = {};


//Use connect method to connect to the server
var connect = MongoClient.connect(url);
logAction('Connecting to mongo at ' + url);


// Wenn mit dem MQTT-Broker connected, dann Flag setzen
mqclient.on('connect',function() {
	logAction("MQTT connected ");
	gotMQTTconnection = true;
	mqclient.subscribe('/Feinstaub/+/status');
});

mqclient.on('disconnect',function() {
	logAction('MQTT DISconnected');
	mqclient.end();
});

mqclient.on('error', function(err) {
	logAction("Fehler beim connect " + err);
});

mqclient.on('message', function(topic, message) {
	var jobj = JSON.parse(message.toString());
	if (topic.slice(-6)=='status') {					// status - Topic
		gotStatus(jobj);								// -> in die Tabelle eintragen und die verscheidenen Topics subscriben
	} else {
		console.log(topic,jobj);
		putInDB(jobj,topic);							// alle anderen Topics in die DB eintragen
	}
});

function gotStatus(js) {
		var found = false;
		var id = js.Chip_ID;
		var lang = Object.keys(geraete).length;
		for (var i=0; i< lang; i++) {
			if(geraete[id] !== undefined) {
				found = true;
				break;
			}
		}
		if(found) return;
		delete js.Chip_ID;
		js['lastDay'] = 0 // moment().date();   <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
		geraete[id] = js;
		console.log('Neu eingetragen: ' + id);
		console.log(geraete);
		for (var d in js.Devices) {
			mqclient.subscribe('/Feinstaub/'+id+'/'+ js.Devices[d]);
		}
		var usub = '/Feinstaub/'+id+'/status';
		mqclient.unsubscribe(usub);
}


// Eintrag in die DB
function putInDB(js,top) {
	var dt = moment();
	var DB;
	var parts = top.split('/');
	var dev = parts[parts.length-1];
	var id = parts[parts.length-2];
	var data = {};
	var insID;
	data['date'] = dt.toDate();
	for( var key in js) {
		if(!js.hasOwnProperty(key)) {
			continue;
		}
		var x = parseFloat(js[key]);			// <<<<<< abh. von der Tabelle oben !!
		if (isNaN(x)) {
			return;
		}
		data[key] = x;
	}
	// insert aktual data
	stime = moment().millisecond();
	if (dev == 'SDS011') {
		var pipeline = [
		                { $match: { 						// look at only the last 24 hours
		                	"date": { $lte: new Date(), $gt: new Date(new Date().setDate(new Date().getDate()-1))}
		                }
		                },
		                { $group: { 						// for all
		                	_id: null , 
		                	avg10: { $avg: "$P10"}, 	// calc the average
		                	avg2_5: { $avg: "$P2_5"}, 
		                	cnt: { $sum: 1},			// count enties
		                	dat: { $last: "$date"}		// date used only to verify
		                }
		                }];
	
		connect
		.then(db => {
			DB = db;
			return DB.collection('ESP_'+id+'.'+dev).insertOne(data);
		})
		.then(result => {
			insID = result.insertedId; 
			return DB.collection('ESP_'+id+'.'+dev).aggregate(pipeline).toArray();
		})
		.then(result => DB.collection('ESP_'+id+'.'+dev).updateOne(
				{ "_id" : insID },
				{ $set : { "avgP10_h24": result[0].avg10, "avgP2_5_h24": result[0].avg2_5 } })
		)
		.catch(function(err){
			console.log(err);
		});
	} else {
		connect
		.then(db => {
			DB = db;
			return db.collection('ESP_'+id+'.'+dev).insertOne(data);
		})
		.catch(function(err){
			console.log(err);
		});
	}		

	if(dt.day() != geraete[id].lastDay) {
		console.log("Daywechsel now:", dt.day());
		geraete[id].lastDay = dt.day();
		enterPerDayData(id);
	}
}


// New day - enter averages, min/max etc. in day-colletion
function enterPerDayData(chipid) {
//	stime = moment().millisecond();
	var datum = moment();
	var start = moment();
	var end = moment();
	start.startOf('day');
	end.startOf('day').subtract(1,'day');
	datum.startOf('day').subtract(12,'h');
	console.log("Datum = ", datum.format(), "start:",start.format(), "end:", end.format());
	var entry = {'date': new Date(datum)};
	connect													// if coonected
	.then(db => {											// then start all DB querys at once
		var sdsdata = db.collection('ESP_'+chipid+'.SDS011').findOne({date: { $lt: new Date(start)}},{sort: [[ 'date', 'descending']]});
		var dht_desc = db.collection('ESP_'+chipid+'.DHT22').find(
				{ date: { $lt: new Date(start), $gte: new Date(end)}},
				{ sort: [[ 'temperature', 'descending']]}).toArray();
		var bmpdata = db.collection('ESP_'+chipid+'.BMP180').find(
				{ date: { $lt: new Date(start), $gte: new Date(end)}},
				{ sort: [[ 'temperature', 'descending']]}).toArray();

		// wait for the promises to come up
		sdsdata													// first promise: feinstaub data
		.then(data => {
			entry['SDS011'] = {};
			entry.SDS011['avgP10_d1'] = data.avgP10_h24;
			entry.SDS011['avgP2_5_d1'] = data.avgP2_5_h24;
			console.log("----------Staub----"+chipid+"-----")
			console.log(entry);
			console.log("-------------------");
			return dht_desc										// second promise: temperature min/max data
		})
		.then(result => {
			if(result[0] != undefined) {
				entry['DHT22'] = {};
				entry.DHT22['tmpMax_d1'] = {'value': parseFloat(result[0].temperature), 'date': result[0].date };
				entry.DHT22['tmpMin_d1'] = {'value': parseFloat(result[result.length-1].temperature), 'date': result[result.length-1].date };
				var sum=0;
				for(var i=0; i< result.length; i++){
					sum += result[i].temperature;
				}
				entry.DHT22['tmpAvg_d1'] = sum/result.length;

				console.log("--------desc----"+chipid+"-------")
				console.log(entry);
				console.log("-------------------")
			}
			return bmpdata										// third promise: temperature min/max data, pressure
		})
		.then(result => {
			if(result[0] != undefined) {
				entry['BMP180'] = {};
				entry.BMP180['tmpMax_d1'] = {'value': parseFloat(result[0].temperature), 'date': result[0].date };
				entry.BMP180['tmpMin_d1'] = {'value': parseFloat(result[result.length-1].temperature), 'date': result[result.length-1].date };
				var sum=0;
				for(var i=0; i< result.length; i++){
					sum += result[i].temperature;
				}
				entry.BMP180['tmpAvg_d1'] = sum/result.length;
				sum=0;
				for(var i=0; i< result.length; i++){
					sum += result[i].pressure;
				}
				entry.BMP180['pressAvg_d1'] = sum/result.length;

				console.log("--------BMP----"+chipid+"-------")
				console.log(entry);
				console.log("-------------------")
			}
//			console.log("DayChange-Time: ", moment().millisecond()-stime);
			return db.collection('ESP_'+chipid+'.day').insertOne(entry)				// all promises resolved: insert data
		})
		.catch(function(err){
			if (err.toString().indexOf("Cannot read property") != -1) {
				return;
			} else {
				console.log("Error1",err);
			}
		})
		.catch(function(err){
			console.log("Error2",err);
		});
	});
}


// Übergebenen Text loggen und vorne noch Datum/Uhrzeit hinschreiben
function logAction(s) {
	var str = moment().format("YYYY-MM-DD HH:mm:ss");
	str = str + " -> " + s;
	console.log(str);
}
