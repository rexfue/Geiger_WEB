const express = require('express');
const app = express();
//var assert = require('assert');
const bodyParser = require("body-parser");
const MongoClient = require('mongodb').MongoClient;
const os = require('os');
const moment = require('moment');

// Consts
const PORT = 3005;											// Port for server

const MONGOBASE = 'Feinstaubi_A';

let MONGOHOST = process.env.MONGOHOST;
let MONGOPORT = process.env.MONGOPORT;
let MONGOAUTH = process.env.MONGOAUTH;
let MONGOUSRP = process.env.MONGOUSRP;

if (MONGOHOST === undefined) { MONGOHOST = 'localhost';}
if (MONGOPORT === undefined) { MONGOPORT =  27017; }
if (MONGOAUTH === undefined) { MONGOAUTH =  'false'; }

let MONGO_URL = 'mongodb://'+MONGOHOST+':'+MONGOPORT;  	// URL to mongo database
if (MONGOAUTH == 'true') {
    MONGO_URL = 'mongodb://'+MONGOUSRP+'@' + MONGOHOST + ':' + MONGOPORT + '/?authSource=admin';          // URL to mongo database
}

console.log(os.hostname());
// console.log(MONGO_URL);

app.set('views','./views');
app.set('view engine','pug');

app.use(express.static("public"));
app.use(express.static("node_modules/bootstrap/dist"));
app.use(express.static("node_modules/jquery/dist"));
app.use(express.static("node_modules/moment/min"));


async function checkHost(req, res, next) {
    if (
        (req.headers.host == 'feinstaub.rexfue.de') ||
        (req.headers.host == 'develop.rexfue.de') ||
        (req.headers.host == 'localhost:3005') ||
        (req.headers.host == 'nuccy:3005') ||
        (req.headers.host == '213.136.85.253:3005') ||
        (req.headers.host == 'macbig:3005')                 //Port is important if the url has it
    ) {
        req.url = '/fs' + req.url;
    }
//    console.log("Path:",req.path);
    if(req.path.startsWith('/TEST')) {
        req.url = '/TEST' + req.url;
    }

    let uri = req.url.substr(3);
    let city = "unknown";
    if (!isNaN(uri.substring(1) - parseInt(uri.substring(1))))
    {
        let dbs = app.get('dbase');
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


app.get('*', checkHost);
app.post('*', checkHost);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//app.post('/sensors', function(res,req,next){
//    var body = res.body;
//    var espid = res.headers['x-sensor'];
//
//    console.log(espid,body);
//
//})


app.get('/fs/fsdata/help', function(req, res, next) {
	  res.sendFile(__dirname+'/public/help.html');
	});

app.get('/fs/fsdata/setting', function(req, res, next) {
    res.sendFile(__dirname+'/public/settings.html');
});

app.get('/fs/fsdata/statistik', function(req, res, next) {
    res.sendFile(__dirname+'/public/statistik.html');
});

app.get('/fs/fsdata/centermap', function(req, res, next) {
    res.sendFile(__dirname+'/public/centermap.html');
});

app.get('/fs/fsdata/helpmap', function(req, res, next) {
    res.sendFile(__dirname+'/public/helpmap.html');
});

app.get('/fs/fsdata/fehlersensoren', function(req, res, next) {
    res.sendFile(__dirname+'/public/fehlersensoren.html');
});

app.get('/fs/fsdata/fehlerliste', function(req, res, next) {
    res.sendFile(__dirname+'/public/fehlerliste.html');
});

app.get('/fs/fsdata/selsensor', function(req, res, next) {
    res.sendFile(__dirname+'/public/selsensor.html');
});

app.get('/fs/fsdata/ymax', function(req, res, next) {
    res.sendFile(__dirname+'/public/ymax.html');
});

app.get('/fs/fsdata/selnewday', function(req, res, next) {
    res.sendFile(__dirname+'/public/selnewday.html');
});


app.get('/fs/fsdata/erralert', function(req, res, next) {
	  res.sendFile(__dirname+'/public/erralert.html');
	});

var indexs = require('./routes/index');
app.use('/fs/',indexs);

var fsdatas1 = require('./routes/fsdata');
app.use('/fs/fsdata',fsdatas1);

var fsdatas2 = require('./routes/mapdata');
app.use('/fs/mapdata',fsdatas2);

var apidatas = require('./routes/apidata');
app.use('/fs/api',apidatas);


const connect = MongoClient.connect(MONGO_URL, {poolSize:20, useNewUrlParser: true });
connect
    .then(client => {
        app.set('dbase', client.db(MONGOBASE));								    // Übergabe von db
        app.listen(PORT, function () {
            console.log("App listens on port " + PORT);
        })
    })
    .catch(err => {
        console.log(err);
        process.exit(-1);
    });
