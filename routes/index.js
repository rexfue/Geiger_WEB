var express = require('express');
var router = express.Router();
//Version
var pkg = require('../package.json');


var idx = 'index';
var mapit = 'mapit';
var tit = 'Geiger';

const MAINT = (process.env.MAINTENANCE=="true");

if (MAINT==true) {
    idx = 'maintenance';
    mapit = 'maintenance';
}

// GET home page.
router.get('/', function(req, res, next) {
    res.render(mapit, {
        title: tit+'-Map',
        version: pkg.version,
        date: pkg.date,
        name: 'map',
        param: req.query.addr,
        stday: req.query.stday,
        showAllMap: req.query.mall,
        csensor: req.query.sid,
        zoom:req.query.zoom,
        stype: tit,
        splash: req.query.splash == 'true',
    });
});


router.get('/:nam', function(req, res, next) {
	var name = req.params.nam;
    if(name == 'index') {
        idx = 'index';
        name = '140';
        title += '_I';
    } else {
    	res.render(mapit, {
    		title: tit+'-Map',
    		version : pkg.version,
    		date : pkg.date,
            param: req.query.addr,
            stday: req.query.stday,
            zoom:req.query.zoom,
            csensor: name,
            splash: req.query.splash == 'true',
    		name: 'map'});
    }
});


module.exports = router;
