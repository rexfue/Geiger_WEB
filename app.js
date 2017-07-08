var express = require('express');
var app = express();
//var assert = require('assert');
var bodyParser = require("body-parser");
var MongoClient = require('mongodb').MongoClient;
var os = require('os');

// Consts
const PORT = 3005;											// Port for server

var mongoPort = 27017;
var mongoHost = 'localhost';

if (os.hostname() != "rexfue.de") {
	mongoPort = 27018;
}
console.log(os.hostname());

const MONGO_URL = 'mongodb://'+mongoHost+':'+mongoPort+'/Feinstaub_AllNew';  	// URL to mongo database
console.log(MONGO_URL);

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
        (req.headers.host == 'fs.localhost:3005') ||
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

app.get('/fs/fsdata/selnewday', function(req, res, next) {
    res.sendFile(__dirname+'/public/selnewday.html');
});


app.get('/fs/fsdata/erralert', function(req, res, next) {
	  res.sendFile(__dirname+'/public/erralert.html');
	});

var indexs = require('./routes/index');
app.use('/fs/',indexs);

var fsdatas = require('./routes/fsdata');
app.use('/fs/fsdata',fsdatas);

var fsdatas = require('./routes/mapdata');
app.use('/fs/mapdata',fsdatas);


MongoClient.connect(MONGO_URL, function(err,db) {
    if (err) {
	console.log("Bitte erst den SSH-Tunnel aufbauen: 'ssh -fN -L 27018:localhost:27017 rxf@rexfue.de' !!");
        process.exit(-1);    
}	
    app.set('dbase',db);								    // Übergabe von db
    app.listen(PORT, function () {
        console.log("App listens on port " + PORT);
    });
});
