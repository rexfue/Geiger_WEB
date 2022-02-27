var express = require('express');
var router = express.Router();
var moment = require('moment');

// Get latest 10 readings out from the database
router.get('/latest10', function(req,res) {
	var collection = req.strom;
	collection.find({},{limit:5, sort: { date: -1}},function(e,docs) {
		res.json(docs);
	});
});


// Get readings for the last hour out from the database
router.get('/onehour', function(req,res) {
	var db = req.db;
	var collection = db.get('strom');
	var st = req.query.start;
	st = st.substring(0,st.length-1);
	var start = moment(st);
	var end = moment(st);
	start.subtract(1,'h');
	collection.find({date: { $gte: new Date(start), $lt: new Date(end)}},{sort:  { date: 1} },function(e,docs) {
//		console.dir(docs);
		res.json(docs);
	});
});


router.get('/oneyear', function(req,res) {
	var year = req.query.year;
	if(year == undefined) {
		year = moment().year();
	}
	var st = req.query.start;
	st = st.substring(0,10);
//	console.log("st: " + st);
	var start = moment(st);
	var db = req.db;
	var collection = db.get('stromDay');
	var sDat = moment("01-01-"+year, "MM-DD-YYYY");  			// Start-Datum  1.1.year
	var curDat = moment();
	var erg = [];								// hier die Werte sammeln
	var last = { date: 0, wert: 0, cnt: 0};
	var first=0;
//	console.log("Start " + start.format());
	start.subtract(30,'days');						// Daten für 30 Tage holen
//	console.log("Start-30 " + start.format());
	collection.find( { date: { $gte:  new Date(start) }}, {sort: { date: 1} },function(err,docs){
		if(err) {
			console.log("StromM-Error: ");
			console.dir(err);
		} else {
			var lang = (docs.length > 31) ? 31 : docs.length;
			for(var i=0; i<lang; i++) {
//				console.log(i + "   " + docs[i].date);
				if(last.date != 0) {
//					console.log("last.date: " + last.date);
					erg.push({ date: last.date, wert: (docs[i].zstand - last.wert)});
					if( (docs[i].zstand - last.wert) != 0) {
						last.cnt++;
					}
				} else {
					first = docs[i].zstand;
				}
				last.date = docs[i].date;
				last.wert = docs[i].zstand;
			}
		}
//		console.log(erg);
		var avg = (last.wert - first)/last.cnt;
		res.send ({ average: avg, erg: erg });
	});
	
/*	
	async.whilst(
			function() { return sDat < curDat; },
			function (callback) {
				collection.findOne( { date: { $gte:  new Date(sDat) }}, {sort: { date: 1} }, function(err,data) {
					if(err) {
						console.log("StromM-Error: " + err);
						callback(err);
					} else {
						if(last.date != 0) {
							erg.push({ date: last.date, wert: (data.all - last.wert)});
							if( (data.all - last.wert) != 0) {
								last.cnt++;
							}
						} else {
							first = data.all;
						}
						last.date = data.date;
						last.wert = data.all;
					}
					sDat.add(1, 'days');					// add 1 day of seconds
					callback();
				});
			},
			function (err) {
				var avg = (last.wert - first)/last.cnt;
				res.send ({ average: avg, erg: erg });
			}
	);
*/
});



//Get readings for the last hour out from the database
router.get('/latest10I', function(req,res) {
	var collection = req.strom;
	var start = moment();
//	console.log("Start=" + start);
	start.subtract(20,'s');
	collection.find({date: { $gte: new Date(start)}},{sort:  { date: 1} },function(e,docs) {
		res.json(docs);
	});
});

//Get the reading of the 1. of January for the current year
router.get('/zstand', function(req,res) {
	var db = req.db;
	var curYear = moment().year();
	var collection = db.get('zaehler');
	collection.findOne({'year' : curYear},function(e,docs) {
		res.json(docs);
	});
});





module.exports = router;
