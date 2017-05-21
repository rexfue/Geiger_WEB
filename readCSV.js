/** readCSV.js
 * 
 * CSV-File mit Feinsdtaubdaten einlesen und die eingelesenen Daten an den
 * MQTT-Broker weiter senden
 * 
 * V 1.0  2016-11-09  rxf
 * 		erste Version
 */

var
	VERSION="1.0",
	VDATE="2016-11-09";

// 'Konstanten':
const 
	TIMEOUT=10000.								// 10sec Timeout
	MQTTHOST = "castor";						// der MQTT-Broaker
	MONGOHOST = "localhost";					// Host der Mongo-Datenbank
	CSVHOST = "https://www.madavi.de/sensor";	// Hier liegen die CSV-Dateien
	CSVPATH = "/csvfiles.php";					// Path auf diese Dateien
var 
	moment = require('moment');					// fancy date formats
	mqtt = require('mqtt');						// MQTT-System
	MongoClient = require('mongodb').MongoClient;  // Zugriff auf die Mongo-DB
	assert = require('assert');					// Fehler abfangen
	request = require('request');				// Zugriff auf die Daten vir HTTP
	async = require('async');
	
var csvFiles = [];	
var ids = [];
	
// Direktory mir den Sensoren einlesen




function filterDates(fn) {
	var now = moment().format("YYYY-MM-DD");
	if(fn.indexOf(now) != -1) {
		return true;
	}
	return false;
}
	

function readDirectory(callback) {
	request(CSVHOST+CSVPATH,function(error,res,body){
		if(!error && res.statusCode == 200) {
			var lines  = body.split('\n');
			for (var i=0; i<lines.length; i++) {
				var x = lines[i].split('>esp8266-');
				if(x[0].indexOf('sensor') != -1) {
					var id = x[1].substring(0,x[1].indexOf('<'));
					ids.push(id);
				}
			}
		}
		callback(error);
	});
}

function readCSVDirs(callback) {
	async.forEach(ids, function(id, callback) {
		request(CSVHOST+CSVPATH+'?sensor=esp8266-'+id,function(error,res,body){
			if(!error && res.statusCode == 200) {
				var lines  = body.split('\n');
				for (var i=0; i<lines.length; i++) {
					var s = lines[i].indexOf('data');
					var e = lines[i].indexOf('.csv');
					if(s != -1) {
						var fn = lines[i].substring(s,e+4);
						if(filterDates(fn)) {
							csvFiles.push(fn);
						}
					}
				}
			} else {
				callback(error);
				return;
			}
			callback();
		});
	}, function(err) {
		if(err) {
			callback(err);
			return;
		}
		callback();
	});
}

function readOneFile( callback) {
	var fn = csvFiles[12];						// <<<<< test
	request(CSVHOST+'/'+fn, function(err,res,body) {
		if(!err && res.statusCode == 200) {
			console.log(body);
		}
	});
}

async.series([
	function(callback) {
		readDirectory(function(){
			callback();
		});
	},
	function(callback) {
		readCSVDirs(function(){
			callback();
		});
	},
	function(callback) {
		readOneFile(function() {
			callback();
		})
	}],
	function(err,result) {
//		console.log(csvFiles);
}
);




