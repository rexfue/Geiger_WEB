const express = require('express');
const geigerApp = express();
//var assert = require('assert');
const bodyParser = require("body-parser");
const MongoClient = require('mongodb').MongoClient;
const os = require('os');
const moment = require('moment');

// Consts
const PORT = process.env.SERVERPORT || 3005;											// Port for server

const debug = (process.env.DEBUG == "true");
const MONGOHOST = process.env.MONGOHOST || 'localhost';
const MONGOPORT = process.env.MONGOPORT || 27017;
const MONGOAUTH = (process.env.MONGOAUTH == "true");
const MONGOUSRP = process.env.MONGOUSRP || "";
const MONGOBASE = process.env.MONGOBASE || 'Feinstaubi_A';

const MONGO_URL = MONGOAUTH ? 'mongodb://'+MONGOUSRP+'@' + MONGOHOST + ':' + MONGOPORT + '/?authSource=admin' :  'mongodb://'+MONGOHOST+':'+MONGOPORT;	// URL to mongo database

console.log(os.hostname());
if (debug) {
    console.log(`MongoURL = "${MONGO_URL}" and Database = ${MONGOBASE}`);
}

geigerApp.set('views','./views');
geigerApp.set('view engine','pug');

geigerApp.use(express.static("public"));
geigerApp.use(express.static("node_modules/bootstrap/dist"));
geigerApp.use(express.static("node_modules/jquery/dist"));
geigerApp.use(express.static("node_modules/moment/min"));
geigerApp.use(express.static("node_modules/leaflet/dist"));
geigerApp.use(express.static("node_modules/d3/dist"));

let requested;
async function checkHost(req, res, next) {
    if (
        (req.headers.host == 'test1.rexfue.de') ||
        (req.headers.host == 'multigeiger.rexfue.de') ||
        (req.headers.host == 'multigeiger.citysensor.de') ||
        (req.headers.host == 'test2.citysensor.de') ||
        (req.headers.host == 'localhost:'+PORT) ||
        (req.headers.host == 'nuccy:3005') ||
        (req.headers.host == '213.136.85.253:'+PORT) ||
        (req.headers.host == '192.168.178.78:'+PORT) ||
        (req.headers.host == 'macbig:'+PORT)                 //Port is important if the url has it
    ) {
        req.url = '/fs' + req.url;
    }
//    console.log("Path:",req.path);
    if(req.path.startsWith('/TEST')) {
        req.url = '/TEST' + req.url;
    }

    let uri = req.url.substr(3);
    let city = "unknown";
    let dbs = geigerApp.get('dbase');
//    if (!isNaN(uri.substring(1) - parseInt(uri.substring(1))))
    if (isNaN(uri.substring(1))) {
        city = await apidatas.api.getCity(dbs, parseInt(uri.substring(1)));
    }

    if(
        (!isNaN(uri.substring(1) - parseInt(uri.substring(1)))) ||
        (uri.substring(1,4)=='api') ||
        ((uri.substring(1,4) == 'map') && (uri.substring(4,5) != 'd'))
    ) {
        console.log(moment().format(),"  ", uri, "  ", city);
    }
    if (req.url.substring(4,5) == 'i') {
        req.url = '/fs/' + req.url.substring(5);
    }
    next();
}

geigerApp.get('*', checkHost);
geigerApp.post('*', checkHost);

geigerApp.use(bodyParser.urlencoded({ extended: true }));
geigerApp.use(bodyParser.json());

//app.post('/sensors', function(res,req,next){
//    var body = res.body;
//    var espid = res.headers['x-sensor'];
//
//    console.log(espid,body);
//
//})


geigerApp.get('/fs/fsdata/help', function(req, res, next) {
	  res.sendFile(__dirname+'/public/info.html');
	});

geigerApp.get('/fs/fsdata/splash', function(req, res, next) {
    res.sendFile(__dirname+'/public/splash.html');
});

geigerApp.get('/fs/fsdata/settingW', function(req, res, next) {
    res.sendFile(__dirname+'/public/settingsW.html');
});

geigerApp.get('/fs/fsdata/settingD', function(req, res, next) {
    res.sendFile(__dirname+'/public/settingsD.html');
});

geigerApp.get('/fs/fsdata/statistik', function(req, res, next) {
    res.sendFile(__dirname+'/public/statistik.html');
});

geigerApp.get('/fs/fsdata/centermap', function(req, res, next) {
    res.sendFile(__dirname+'/public/centermap.html');
});

geigerApp.get('/fs/fsdata/helpmap', function(req, res, next) {
    res.sendFile(__dirname+'/public/helpmap.html');
});

geigerApp.get('/fs/fsdata/fehlersensoren', function(req, res, next) {
    res.sendFile(__dirname+'/public/fehlersensoren.html');
});

geigerApp.get('/fs/fsdata/fehlerliste', function(req, res, next) {
    res.sendFile(__dirname+'/public/fehlerliste.html');
});

geigerApp.get('/fs/fsdata/selsensor', function(req, res, next) {
    res.sendFile(__dirname+'/public/selsensor.html');
});

geigerApp.get('/fs/fsdata/ymax', function(req, res, next) {
    res.sendFile(__dirname+'/public/ymax.html');
});

geigerApp.get('/fs/fsdata/selnewday', function(req, res, next) {
    res.sendFile(__dirname+'/public/selnewday.html');
});


geigerApp.get('/fs/fsdata/erralert', function(req, res, next) {
	  res.sendFile(__dirname+'/public/erralert.html');
	});

var indexs = require('./routes/index');
geigerApp.use('/fs/',indexs);

var fsdatas1 = require('./routes/fsdata');
geigerApp.use('/fs/fsdata',fsdatas1);

var fsdatas2 = require('./routes/mapdata');
geigerApp.use('/fs/mapdata',fsdatas2);

var apidatas = require('./routes/apidata');
geigerApp.use('/fs/api',apidatas);


const connect = MongoClient.connect(MONGO_URL, {poolSize:20, useNewUrlParser: true ,useUnifiedTopology: true});
connect
    .then(client => {
        geigerApp.set('dbase', client.db(MONGOBASE));								    // Übergabe von db
        geigerApp.listen(PORT, function () {
            console.log(moment().format("YYYY-MM-DD HH:mm"), "App listens on port " + PORT +', Mongo at ' + MONGOHOST);
        })
    })
    .catch(err => {
        console.log(err);
        process.exit(-1);
    });
