var express = require('express');
var router = express.Router();
//Version
var pkg = require('../package.json');


var MAINT = false;
var idx = 'index';
var mapit = 'mapit';
var title = 'Geiger';


if (MAINT==true) {
    idx = 'maintenance';
    mapit = 'maintenance';
}

// GET home page.
router.get('/', function(req, res, next) {
    res.render(mapit, {
        title: 'Geiger-Map',
        version: pkg.version,
        date: pkg.date,
        name: 'map',
        param: req.query.addr,
        stday: req.query.stday,
        showAllMap: req.query.mall,
        csensor: req.query.sid
    });
});


router.get('/:nam', function(req, res, next) {
	var name = req.params.nam;
    if(name == 'index') {
        idx = 'index';
        name = '140';
        title += '_I';
    }
    if (name == 'map') {
    	res.render(mapit, {
    		title: 'Geiger-Map',
    		version : pkg.version,
    		date : pkg.date,
            param: req.query.addr,
            stday: req.query.stday,
            showAllMap: req.query.mall,
            csensor: req.query.sid,
    		name: 'map'});
    } else {
    res.render(idx, {
        title: title+'-'+name,
        version : pkg.version,
        date : pkg.date,
        param: req.query.addr,
        stday: req.query.stday,
        name : name});
    }
});



module.exports = router;
