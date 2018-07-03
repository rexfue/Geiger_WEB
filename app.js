const express = require('express');
const app = express();
//var assert = require('assert');
const bodyParser = require("body-parser");
const MongoClient = require('mongodb').MongoClient;
const os = require('os');

// Consts
const PORT = 3005;											// Port for server

let MONGOHOST = process.env.MONGOHOST;
let MONGOPORT = process.env.MONGOPORT;
let MONGOAUTH = process.env.MONGOAUTH;
let MONGOUSRP = process.env.MONGOUSRP;

if (MONGOHOST === undefined) { MONGOHOST = 'localhost';}
if (MONGOPORT === undefined) { MONGOPORT =  27017; }
if (MONGOAUTH === undefined) { MONGOAUTH =  'false'; }

let MONGO_URL = 'mongodb://'+MONGOHOST+':'+MONGOPORT+'/Feinstaubi_A';  	// URL to mongo database
if (MONGOAUTH == 'true') {
    MONGO_URL = 'mongodb://'+MONGOUSRP+'@' + MONGOHOST + ':' + MONGOPORT + '/Feinstaubi_A';          // URL to mongo database
}

console.log(os.hostname());

app.set('views','./views');
app.set('view engine','pug');

app.use(express.static("public"));
app.use(express.static("node_modules/bootstrap/dist"));
app.use(express.static("node_modules/jquery/dist"));
app.use(express.static("node_modules/moment/min"));


app.get('*', function(req, res, next){
//    console.log("Host:",req.headers.host);
    if (
        (req.headers.host == 'feinstaub.rexfue.de') ||
        (req.headers.host == 'fstst.rexfue.de') ||
        (req.headers.host == 'localhost:3005') ||
        (req.headers.host == 'castor') ||
        (req.headers.host == 'macbig:3005')                 //Port is important if the url has it
        ) {
        req.url = '/fs' + req.url;
    }
//    console.log("Path:",req.path);
    if(req.path.startsWith('/TEST')) {
    	req.url = '/TEST' + req.url;	
    }
//    console.log("URL:",req.url);
    next();
});

//app.use(bodyParser.json());
//
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

app.get('/fs/fsdata/centermap', function(req, res, next) {
    res.sendFile(__dirname+'/public/centermap.html');
});

app.get('/fs/fsdata/helpmap', function(req, res, next) {
    res.sendFile(__dirname+'/public/helpmap.html');
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

var fsdatas3 = require('./routes/fsdata');
app.use('/fs/api',fsdatas3);


const connect = MongoClient.connect(MONGO_URL);
connect
    .then(db => {
        app.set('dbase', db);								    // Übergabe von db
        app.listen(PORT, function () {
            console.log("App listens on port " + PORT);
        })
    })
    .catch(err => {
        console.log(err);
        process.exit(-1);
    });
