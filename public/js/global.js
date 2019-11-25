//DOM is ready
"use strict";

$(document).ready(function() {

    const MAXOPTARR = 5;

    var active = 'oneday';					// default: plot 1 day
    var refreshRate = 1;                    // Grafik so oft auffrischen (in Minuten)
    var txtMeldung = false;					// falls keine Daten da sind, Text melden
    var korrelation = {};
    var kopf = 'Radioaktivitäts-Messung';
    var avgTime = 30;						// defaul average time für particulate matter
    var avgTable = [0, 30, 60, 180, 360, 720, 1440];
    var specialDate = "";					// extra for 'Silvester'
    var doUpdate = true;					// update every 5 min
    var fstAlarm = false;					// if true then is 'Feinstaubalarm' in Stuttgart
    var logyaxis = false;					// y-Axis logatithmic
    var movingAVG = true;                   // 7-Days: use moving average
    let optSidsArray = [];                  // Arrray der letzten 5 Einträge
    let ymax_geig = 100;

    var map;
    let firstZoom = 11;
    let useStgtBorder = false;
    let popuptext = "";
    let bounds;
    let polygon;                            // rectangle of whole map to dim background

    let clickedSensor = 0;
    let properties;
    let gbreit=100;
    let grafikON = false;

    let mapLoaded = false;

    let showOnlySi22G = false;


    let colorscale = ['#d73027', '#fc8d59', '#fee08b', '#ffffbf', '#d9ef8b', '#91cf60', '#1a9850', '#808080'];
    let grades = [10, 5, 2, 1, 0.5, 0.2, 0.1, -999];
    let cpms = [1482, 741, 296, 148, 74, 30, 15, -999];

    let sv_factor = {'SBM-20': 1 / 2.47, 'SBM-19': 1 / 9.81888, 'Si22G': 0.0};

    // Variable selName is defined via index.js and index.pug
    if (typeof selName == 'undefined') {
        return;
    }

    var startDay = "";
    if (!((typeof startday == 'undefined') || (startday == ""))) {
        if (startday == "Silvester17") {
            specialDate = "silvester17";
            startDay = "2017-12-31T11:00:00Z";
        } else if (startday == "Silvester18") {
            specialDate = "silvester18";
            startDay = "2018-12-31T11:00:00Z";
        } else {
            startDay = startday;
        }
    }

    let curSensor = -1;                                             // default-Sensor
    if (!((typeof csid == 'undefined') || (csid == ""))) {
        curSensor = csid;
    }


    let butOpts = [
        {fill: 'lightblue', r: 2},
        {fill: 'blue', r: 2, style: {color: 'white'}},
        {fill: 'lightblue', r: 2},
        {fill: 'lightblue', r: 2}
    ];

//	localStorage.clear();       // <-- *************************************************************

    var aktsensorid = csid;
    console.log('Name=' + aktsensorid);

    Highcharts.setOptions({
        global: {
            useUTC: false					// Don't use UTC on the charts
        }
    });


// Start with plotting the map
    plotMap(curSensor);


// ********************************************************************************
// MAP
// ********************************************************************************

    function calcPolygon(bound) {
        return L.polygon([[bounds.getNorth(), bounds.getWest()], [bounds.getNorth(), bounds.getEast()], [bounds.getSouth(), bounds.getEast()], [bounds.getSouth(), bounds.getWest()]], {
            color: 'black',
            fillOpacity: 0.5
        });
        ;
    }

    function getColor(d) {
        let val = parseInt(d);
        for (let i = 0; i < cpms.length; i++) {
            if (val >= cpms[i]) {
                return (colorscale[i]);
            }
        }
    }

    function buildIcon(color,n) {
        let x = 100;
        if (n < 10) {
            x = 200;
        } else if (n < 100) {
            x = 150;
        }
        let radiIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">' +
            '<circle cx="300" cy="300" r="300" fill="' + color + '"/>' +
            '<circle cx="300" cy="300" r="50"/>' +
            '<path stroke="#000" stroke-width="175" fill="none" stroke-dasharray="171.74" d="M382,158a164,164 0 1,1-164,0"/>';
        if (n !== undefined) {
            radiIcon +=
                '<text id="marker_text" x="' + x + '" y="400" font-size="1500%" font-family="Verdana,Lucida Sans Unicode,sans-serif" fill="white">' + n + '</text>';
        }
            radiIcon += '</svg>';
        let radiIconUrl = encodeURI("data:image/svg+xml," + radiIcon).replace(new RegExp('#', 'g'), '%23');
        return radiIconUrl;
    }

    async function plotMap(cid, poly) {
        // if sensor nbr is give, find coordinates, else use Stuttgart center
        let myLatLng;
        if (cid != -1) {
            myLatLng = await getSensorKoords(curSensor);
        } else {
            let stgt = await getCoords("Stuttgart");
            myLatLng = {lat: parseFloat(stgt.lat), lng: parseFloat(stgt.lon)};
        }

        map = L.map('map');
        map.on('load',function() { mapLoaded = true; });
        map.setView(myLatLng, firstZoom);

        L.tileLayer('https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', {
            maxZoom: 17,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        bounds = map.getBounds();

//        map.scrollWheelZoom.disable();

        map.on('moveend', async function () {
            bounds = map.getBounds();
            polygon = calcPolygon(bounds);
            await buildMarkers(bounds)
        });

        polygon = calcPolygon(bounds);
        /*
            var circle = L.circle([loc.coordinates[1], loc.coordinates[0]], {
                radius: radius * 1000,
                color: 'red',
                opacity: 0.3,
        //            fillColor: '#f03',
                fillOpacity: 0,
                interactive: false,
            }).addTo(map);

        */


        var legend = L.control({position: 'topright'});
        legend.onAdd = function (map) {
            let div = L.DomUtil.create('div', 'info legend');
            let div_color = L.DomUtil.create('div', 'info legend inner', div);
            div_color.innerHTML += 'µSv/h<br />';
            // loop through our density intervals and generate a label with a colored square for each interval
            for (var i = 0; i < grades.length - 1; i++) {
                div_color.innerHTML +=
                    '<i style="background:' + colorscale[i] + '"></i>' +
                    '<u>&nbsp;&nbsp;&nbsp;</u>&nbsp;&nbsp;' + grades[i] + (i == 0 ? "+" : "") + '</upan><br />';
            }
            div_color.innerHTML += '&nbsp;<i style="background:' + getColor(grades[grades.length - 1]) + '"></i> offline';
            return div;
        };
        legend.addTo(map);

        var infobutton = L.control({position:'bottomright'});
        infobutton.onAdd = function (map) {
            let div = L.DomUtil.create('div');
            div.innerHTML = '<button class="ib infobutt">Info</button>';
            div .onclick = function() {
                dialogHelp.dialog('open');
                console.log("Clicked on 'InfoButton'");
            }
            return div;
        }
        infobutton.addTo(map);

        var centerbutton = L.control({position:'topleft'});
        centerbutton.onAdd = function (map) {
            let div = L.DomUtil.create('div');
            div.innerHTML = '<button class="cb centerbutt">neu zentrieren</button>';
            div .onclick = function() {
                dialogCenter.dialog('open');
                console.log("Clicked on 'Zentrieren'");
            }
            return div;
        }
        centerbutton.addTo(map);

        let tubebutton = L.control({position:'bottomleft'});
        tubebutton.onAdd = function(map) {
            let div = L.DomUtil.create('div');
            div.innerHTML = '<select><option value="all">alle Zählrohre</option><option value="sig">nur Si22Gn</option></select>';
            div.firstChild.onmousedown = div.firstChild.ondblclick = L.DomEvent.stopPropagation;
            return div;
        }
        tubebutton.addTo(map);

        $('select').change(async function() {
            if(this.value == "sig") {
                showOnlySi22G = true;
            } else {
                showOnlySi22G = false;
            }
            bounds = map.getBounds();
            await buildMarkers(bounds);
            console.log(this.value);
        });


        if (useStgtBorder) {
            fetchStuttgartBounds();
        }

        await buildMarkers(bounds);

        map.on('popupopen', function (e) {
            let tg = e.popup._source;
            $('.speciallink').click(function (x, tg) {
                map.closePopup();
                showGrafik(clickedSensor);
            });
        });
        map.on('click', function (e) {
            $('#overlay').hide();
            grafikON = false;
        });
    }

    // With all Markers in cluster (markers) calculate the median
    // of the values. With this median fetch the color and return it.
    // If there are 'offline' sensors (value == -1) strip then before
    // calculating the median. If there are only offline sensor, return
    // color of value==-1 (dark gray).
    function getMedian(markers) {
        markers.sort(function(a,b) {                        // first sort, lowest first
            let y1 = a.options.value;
            let y2 = b.options.value;
            if(y1 < y2) {
                return -1;
            }
            if(y2 < y1) {
                return 1;
            }
            return 0;
        });
        console.log(markers);
        let i=0;                                            // now find the 'offlines' (value == -1)
        for(i=0; i<markers.length; i++) {
            if(markers[i].options.value != -1) {
                break;
            }
        }
        markers.splice(0,i);                                // remove these from array
        let lang = markers.length;
        if (lang > 1) {                                     //
            if ((lang % 2) == 1) {                          // uneven ->
                return getColor(markers[(Mathfloor(lang / 2))].options.value);  // median is in the middle
            } else {                                        // evaen ->
                lang = lang / 2;                            // median is mean of both middle values
                console.log(lang);
                let wert = (markers[lang-1].options.value +
                    markers[lang].options.value) / 2;
                return getColor(wert);
            }
        } else if (lang == 1) {                             // only one marker -> return its color
            return getColor(markers[0].options.value);
        }
        return getColor(-1);                            // only offlines
    }

    let markersAll;
    async function buildMarkers(bounds) {
        let count = 3;
        let sensors;
        let alltubes = [];
        let sigtubes = [];
        while (count != 0) {
            sensors = await fetchAktualData(bounds)
                .catch(e => {
                    console.log(e);
                    sensors = null;
                });
            if ((sensors == null) || (sensors.length == 0)) {
                showError(1, 'Daten Laden', 0);
            } else {
//            dialogError.dialog("close");
                break;
            }
            count--;
        }
        if (count == 0) {
            return;
        }
        if (markersAll) {
            map.removeLayer(markersAll);
        }
        markersAll = L.markerClusterGroup({
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            disableClusteringAtZoom: 14,
            iconCreateFunction: function(cluster) {
                let mymarkers = cluster.getAllChildMarkers();
                let color = getMedian(mymarkers);           // calc median of markers in cluster and use that color
//                return L.divIcon({ html: '<b>' + cluster.getChildCount() + '</b>' });
                return new L.Icon({
                    iconUrl: buildIcon(color,cluster.getChildCount()),
                    iconSize: [35, 35]
                });
            }
        });
        for (let x of sensors.avgs) {
            if (x.location == undefined) {                   // if there is no location defined ...
                continue;                                   // ... skip this sensor
            }                                               // otherwise create marker
            if ((x.name != "Si22G") && showOnlySi22G) {
                continue;
            }
            let marker = L.marker([x.location[1], x.location[0]], {
                name: x.id,
                icon: new L.Icon({
                    iconUrl: buildIcon(getColor(parseInt(x.cpm))),
                    iconSize: [35, 35]
                }),
                value: parseInt(x.cpm),
                url: '/' + x.id,
                rohr: x.name,
                lastseen: moment(x.lastSeen).format('YYYY-MM-DD HH:mm')

            })
                .on('click', e => onMarkerClick(e, true))        // define click- and
                //            .on('mouseover', e => onMarkerClick(e,false))   // over-handler
                //            .on('mouseout', e => e.target.closePopup())
                .bindPopup(popuptext);                      // and bint the popup text
            markersAll.addLayer(marker);
        }
        markersAll.addTo(map);
    }


    async function onMarkerClick(e, click) {
        let item = e.target.options;
        let factor = sv_factor[item.rohr];
        clickedSensor = item.name;

        let popuptext = '<div id="popuptext"><div id="infoTitle"><h4>Sensor: ' + item.name + '</h4>' +
            '<div id="infoTable">' +
            '<table><tr>';
        if (item.value < 0) {
            popuptext += '<td colspan="2" style="text-align:center;"><span style="color:red;font-size:130%;">offline</span></td></tr>' +
                '<tr><td>Last seen:</td><td>' + item.lastseen + '</td>';
        } else {
            popuptext += '<td>' + item.value + '</td><td>cpm</td></tr>' +
                '<tr><td>' + Math.round((item.value / 60 * factor) * 100) / 100 + '</td><td>µSv/h</td>';
        }
        popuptext +=
            '</tr><table>' +
            '<div id="infoBtn">' +
            '<a href="#" class="speciallink">Grafik anzeigen</a>' +
            '</div>' +
            '</div>' +
            '</div></div>';
        let popup = e.target.getPopup();
        popup.setContent(popuptext);                        // set text into popup
        e.target.openPopup();                               // show the popup
        if (click == true) {                                // if we clicked
             e.target.closePopup();                         // show the popup
        }
    }



// ********************************************************************************
// Events
// ********************************************************************************
    $('#btnHelp').click(function () {
        dialogHelp.dialog("open");
    });


    $('#btnCent').click(function () {
//    infowindow.setContent("");
//    infowindow.close();								// löschen
        dialogCenter.dialog("open");
    });


// ********************************************************************************
// Dialogs
// ********************************************************************************
/*
    var dialogError = $('#errorDialog').dialog({

        autoOpen: false,
        width: 300,
        position: {my: 'center', at: 'top+100px', of: window},
        open: function () {
            $('#page-mask').css('visibility', 'visible');
            consloe.log('Opening errorDialog');
        },
        close: function () {
            $('#page-mask').css('visibility', 'hidden');
        },
        title: "Fehler",
        modal: true,
    });
*/

    var dialogError = $('#dialogError').dialog({
        autoOpen: false,
        width: 750,
        title: 'Fehler',
        position: {my: 'center', at: 'top+100px', of: window},
        open: function () {
            $('#page-mask').css('visibility', 'visible');
            consloe.log('DialogError: Opening errorDialog');
        },
        close: function () {
            $('#page-mask').css('visibility', 'hidden');
//            polygon.remove();
        },
    });

    var dialogHelp = $('#dialogWinHelpM').dialog({
        autoOpen: false,
        width: 750,
        title: 'Info',
        position: {my: 'center', at: 'top+100px', of: window},
        open: function () {
            $('#page-mask').css('visibility', 'visible');
//            polygon.addTo(map);
            console.log("in DialogHelp-open");
            $(this).load('/fsdata/help');
        },
        close: function () {
            $('#page-mask').css('visibility', 'hidden');
//            polygon.remove();
        },
    });

    var dialogCenter = $('#dialogCenter').dialog({
        autoOpen: false,
        width: 800,
        title: 'Zentrieren',
        open: function () {
            $('#page-mask').css('visibility', 'visible');
//            polygon.addTo(map);
            $(this).load('/fsdata/centermap', function () {
                $('#newmapcenter').focus();
            });
        },
        buttons: [
            {
                text: "OK",
                class: 'btnOK',
                click: setNewCenter,
                style: "margin-right:40px;",
                width: 100,
            }, {
                text: "Abbrechen",
                click: function () {
                    dialogCenter.dialog("close");
                },
                style: "margin-right:40px;",
                width: 100,
            }
        ],
        modal: true,
        close: function () {
            $('#page-mask').css('visibility', 'hidden');
//            polygon.remove();

        },
    });

    $('.dialog').keypress(function (e) {
        if (e.keyCode == 13) {
            $('.btnOK').focus();
        }
    });

    async function setNewCenter() {
        let x = $('#newmapcenter').val();
        let y = parseInt(x);
        if(isNaN(y)) {
            var town = x;
            if (!((town == "") || (town == null))) {
                setCenter(town);
            }
        } else {
            let coo = await getSensorKoords(x);
            map.setView([coo.lat,coo.lng]);
        }
        dialogCenter.dialog("close");
    }



    function saveSettings() {
        let avg = $('#average').val();
        localStorage.setItem('geiger_averageTime', avg);
        let avgkind = $('#movingavg').is(':checked')
        localStorage.setItem('geiger_movAVG', avgkind);
        if ((avgTime != parseInt(avg)) || (avgkind != movingAVG)) {
            avgTime = parseInt(avg);
            movingAVG = avgkind;
            doPlot(active, startDay,properties);						// Start with plotting one day from now on
//            switchPlot(active);
        }
        dialogSet.dialog('close');
    }

    // Dialog für die Einstellungen
    var dialogSet = $('#dialogWinSet').dialog({
        autoOpen: false,
        width: 400,
        title: 'Einstellungen',
        open:
            function () {
                $('#page-mask').css('visibility', 'visible');
                $(this).load('/fsdata/setting', function () {
                    if (movingAVG) {
                        $('#movingavg').prop("checked", true).trigger("click");
                    } else {
                        $('#staticavg').prop("checked", true).trigger("click");
                    }
                    // if(showscatter) {
                    //     $('#scatter').prop("checked", true).trigger("click");
                    // } else {
                    //     $('#lines').prop("checked", true).trigger("click");
                    // }
                    // console.log("LogAxis:", logyaxis);
                    // if(logyaxis) {
                    //     $('#log').prop("checked", true).trigger("click");
                    // } else {
                    //     $('#linear').prop("checked", true).trigger("click");
                    // }
                    // //$("#radio_1").is(":checked")
                    // console.log('logInputDialog:', $('#log').is(':checked'));

                    $('#average').focus();
                    $('#invalid').hide();
                    buildAverageMenue();
                });
            },
        buttons: [
            {
                text: "Übernehmen",
                class: "btnOK",
                click: saveSettings,
                style: "margin-right:40px;",
                width: 120,
            }, {
                text: "Abbrechen",
                click: function () {
                    dialogSet.dialog("close");
                },
                style: "margin-right:40px;",
                width: 100,
            }
        ],
        modal: true,
        close: function () {
            $('#page-mask').css('visibility', 'hidden');
            $('#btnSet').show();
            $('#btnSet').css('background', '#0099cc');
        },
    });


    // Dialog für das Einstell-Menü
    var dialogStatistik = $('#dialogStatistik').dialog({
        autoOpen: false,
        width: 600,
        title: 'Statistik',
        open:
            function () {
                $('#page-mask').css('visibility', 'visible');
                $(this).load('/fsdata/statistik', function () {
                    buildStatistik(aktsensorid);
                });
            },
        buttons: [
            {
                text: "Schließen",
                click: function () {
                    dialogStatistik.dialog("close");
                },
                style: "margin-right:40px;",
                width: 100,
            }
        ],
        modal: true,
        close: function () {
            $('#page-mask').css('visibility', 'hidden');
            $('#btnSet').css('background', '#0099cc');
        },
    });


//    $.datepicker.setDefaults( $.datetimepicker.regional[ "de" ] );

    // Set new Start-Day and show chart
    function setNewDay() {
        let val = $('input:radio[name=selDates]:checked').val();
        dialogNewDay.dialog("close");
        if (val == 'today') {
            doUpdate = true;
            window.location = '/' + aktsensorid;
        } else if (val == 'silvester17') {
            doUpdate = false;
            window.location = '/' + aktsensorid + '?stday=Silvester17';
        } else if (val == 'silvester18') {
            doUpdate = false;
            window.location = '/' + aktsensorid + '?stday=Silvester18';
        } else {
            doUpdate = false;
            const newDay = $('#selnewday').val();
            window.location = '/' + aktsensorid + '?stday=' + newDay;
        }
    }


    // let select a new start day
    var dialogNewDay = $('#dialogNewDay').dialog({
        autoOpen: false,
        width: 300,
        title: "Neuen Start-Tag/Zeit wählen",
        position: {my: 'center', at: 'top+100px', of: window},
        open: function () {
            $('#page-mask').css('visibility', 'visible');
            $(this).load('/fsdata/selnewday', function () {
                $("#selnewday").datetimepicker({
//                    minDate: new Date(oldestDate),
                    minDate: '-2m',
                    maxDate: '0',
                    dateFormat: 'yy-mm-dd',
                    showMinute: false,
                    hourText: 'Stunde',
                    timeText: 'Uhrzeit',
                    closeText: 'OK',
                    currentText: 'Jetzt',
                });
                $('input:radio[name=selDates]').change(function () {
                    if (this.value == 'frei') {
                        $('#selnewday').focus();
                    }
                });
                $('#selnewday').focus(function () {
                    $('input:radio[name=selDates][id=selfrei]').prop('checked', true);
                });
            });
        },
        buttons: [
            {
                text: "OK",
                class: "btnOK",
                click: setNewDay,
                width: 100,
            }, {
                text: "Abbrechen",
                id: "newSensorAbbr",
                click: function () {
                    dialogNewDay.dialog("close");
                },
                width: 100,
            }
        ],
        close: function () {
            $('#page-mask').css('visibility', 'hidden');
            $('#btnHelp').css('background', '#0099cc');
        },
        modal: true
    });


    $('#selnewday').datepicker($.datepicker.regional["de"]);

    // change moment, so theat toJSON returns local Time
    moment.fn.toJSON = function () {
        return this.format();
    };

    // Zeit gleich anzeigen
    setInterval(function () {
        updateGrafik();
    }, 1000);								// alle Sekunde aufrufen


    if (aktsensorid == 'map') {
        return;
    }

    function getLocalStorage() {
        // fetch the average time
        var avg = localStorage.getItem('geiger_averageTime');
        if (avg != null) {
            avgTime = parseInt(localStorage.getItem('geiger_averageTime'));
        }
        console.log('avgTime = ' + avgTime);
        let movAVG = localStorage.getItem('geiger_movAVG');
        if (movAVG != null) {
            movingAVG = movAVG == 'true' ? true : false;
        }
        console.log("MovAVG:", movingAVG);
        // let scatter = localStorage.getItem('showScatter');
        // if(scatter != null) {
        //     showscatter = scatter=='true' ? true : false;
        // }
        // console.log("Scatter:", showscatter);
        // let logy = localStorage.getItem('logYaxis');
        // if(logy != null) {
        //     logyaxis = logy=='true' ? true : false;
        // }
        // console.log("LogYaxis:", logyaxis);
    }

    getLocalStorage();
    $('#h1name').html(kopf);
    $('#sbx label').html('Auswahl der letzten ' + MAXOPTARR);

    /*
    // Die Plots für die diversen Sensoren ausführen:
    // dazu via Korrelation erst mal alle Sensor-Nummern aus der Datenbank holen
    // Danach dann die Plots der Reihe nach aufrufen
    let s1 = moment();
    $.getJSON('fsdata/getfs/korr', {sensorid: aktsensorid}, function (data, err) {				// AJAX Call
        if (err != 'success') {
            alert("Fehler <br />" + err);						// if error, show it
        } else {
            if ((data == null) || (data.length == 0)) {
//				korrelation = {'address':{},'location': {},'espid': "", 'sensors': [{'id': aktsensorid}]};
                showError(2, "No data at korrelation ", aktsensorid);
//					return -1;
            } else {
                if (!data.name.startsWith('Radia')) {
                    showError(3, "This is no Radiation-Sensor", aktsensorid);
                    return -1;
                }
                korrelation = data;
                fstAlarm = data.alarm;
            }
//			console.log("Korrelation: ",korrelation);
//            getOldestDate(aktsensorid, korrelation.sensors,function(old){
//                oldestDate = old;
//                console.log("Oldest Entry:",oldestDate);
//            });

            // save coordinates in localStorage
            localStorage.setItem('geiger_curcoord', JSON.stringify(korrelation.location[korrelation.location.length - 1].loc.coordinates));

            buildHeaderline(korrelation.othersensors, korrelation.location[korrelation.location.length - 1]);
            buildSelectTable();
            doPlot(active, startDay);						// Start with plotting one day from now on
            switchPlot(active);

        }
    });
*/

    function buildAverageMenue() {
        for (var i = 0; i < avgTable.length; i++) {
            if (avgTime == avgTable[i]) {
                var str = '<option selected="selected" value="' + avgTable[i] + '">' + avgTable[i] + '  min</option>';
            } else {
                str = '<option value="' + avgTable[i] + '">' + avgTable[i] + '  min</option>';
            }
            $('#average').append(str);
        }
//        $('#average').selectmenu();
    }


    // Diverse Statistiken für den übergenen Sensor vom Server holen
    // und als Tabvelle darstellen
    function buildStatistik(sid) {
        $.getJSON('fsdata/getfs/statistik', {sensorid: sid}, function (data, err) {				// AJAX Call
            if (err != 'success') {
                alert("Fehler <br />" + err);						// if error, show it
            } else {
                if ((data == null) || (data.length == 0)) {
                    showError(2, "No data at statistics ", aktsensorid);
                } else {
                    $('#stat_sid').text(sid);
                    $('#stat_table').append("<tbody><tr>" +
                        "<td></td>" +
                        "<td>Aktueller Wert</td>" +
                        "<td class='w10'>" + data.p10 + "</td>" +
                        "<td class='w25'>" + data.p25 + "</td>" +
                        "</tr><tr>" +
                        "<td class='bord1'  rowspan='3'>letzte 15min</td>" +
                        "<td class='bord1' >Mittelwert</td>" +
                        "<td class='bord1 w10'>" + data.p10_a15m + "</td>" +
                        "<td class='bord1 w25'>" + data.p25_a15m + "</td>" +
                        "</tr><tr>" +
                        "<td>Standardabweichung</td>" +
                        "<td class='w10'>" + data.p10_d15m + "</td>" +
                        "<td class='w25'>" + data.p25_d15m + "</td>" +
                        "</tr><tr>" +
                        "<td>Maximum</td>" +
                        "<td class='w10'>" + data.p10_m15m + "</td>" +
                        "<td class='w25'>" + data.p25_m15m + "</td>" +
                        "</tr><tr>" +
                        "<td class='bord1' rowspan='3'>letzte 60min</td>" +
                        "<td class='bord1' >Mittelwert</td>" +
                        "<td class='bord1 w10'>" + data.p10_a60m + "</td>" +
                        "<td class='bord1 w25'>" + data.p25_a60m + "</td>" +
                        "</tr><tr>" +
                        "<td>Standardabweichung</td>" +
                        "<td class='w10'>" + data.p10_d60m + "</td>" +
                        "<td class='w25'>" + data.p25_d60m + "</td>" +
                        "</tr><tr>" +
                        "<td>Maximum</td>" +
                        "<td class='w10'>" + data.p10_m60m + "</td>" +
                        "<td class='w25'>" + data.p25_m60m + "</td>" +
                        "</tr><tr>" +
                        "<td class='bord1' rowspan='3'>letzte 24h</td>" +
                        "<td class='bord1'>Mittelwert</td>" +
                        "<td class='bord1 w10'>" + data.p10_a24h + "</td>" +
                        "<td class='bord1 w25'>" + data.p25_a24h + "</td>" +
                        "</tr><tr>" +
                        "<td>Standardabweichung</td>" +
                        "<td class='w10'>" + data.p10_d24h + "</td>" +
                        "<td class='w25'>" + data.p25_d24h + "</td>" +
                        "</tr><tr>" +
                        "<td>Maximum</td>" +
                        "<td class='w10'>" + data.p10_m24h + "</td>" +
                        "<td class='w25'>" + data.p25_m24h + "</td>" +
                        "</tr><tr>" +
                        "</tbody><tbody id='body2'>" +
                        "<td rowspan='2'>gestern (24h)</td>" +
                        "<td>Mittelwert</td>" +
                        "<td class='w10'>" + data.p10_a24hy + "</td>" +
                        "<td class='w25'>" + data.p25_a24hy + "</td>" +
                        "</tr><tr>" +
                        "<td>Standardabweichung</td>" +
                        "<td class='w10'>" + data.p10_d24hy + "</td>" +
                        "<td class='w25'>" + data.p25_d24hy + "</td>" +
                        "</tr></tbody>");
                }
            }
        });
    }


// ************** Event-Handler **************

    $('#btnMap').click(function () {
        $('#overlay').hide();
        grafikON = false;
    });


    $('#btnSet').click(function () {
        dialogSet.dialog("open");
    });

/*
    $('#btnHelp').click(function () {
        dialogHelp.dialog("open");
    });
*/
    // Clicking one of the buttons
    $('.btn').click(function () {
        var button = $(this).val(); 		// fetch the clicked button
        if (!((button == 'day') || (button == 'week') || (button == 'month'))) {
            return;
        }
        if (button == 'week') {
            $('#btnSet').show();
        } else {
            $('#btnSet').hide();
        }
        active = 'one' + button;
        doPlot(active, startDay,properties);
//        switchPlot(active);								// gewählten Plot aktivieren
    });


    $('.dialog').keypress(function (e) {
        if (e.keyCode == 13) {
            $('.btnOK').focus();
        }
    });

// Einstellungen - Eingaben
    $('#in_mapcenter').click(function () {
        console.log($(this).val());
    });


    $('#combo').change(function () {
        let sid = $('#combo').val();
        if (sid != aktsensorid) {
            window.location = '/' + sid;
        }
    });

//	*************  Functions *****************

    function updateGrafik() {
        var d = moment()								// akt. Zeit holen
        if (((d.minute() % refreshRate) == 0) && (d.second() == 15)) {	// alle ganzen refreshRate Minuten, 15sec danach
            console.log(refreshRate, 'Minuten um, Grafik wird erneuert jetzt');
            if (grafikON && (active == 'oneday')) {	// Wenn nicht die Karte, dann
                doPlot(active, startDay,properties);						// Tages- und
            } else {
                if(mapLoaded) {
                    fetchAktualData(bounds);
                }
            }
        }
    }

    function roundx(value, digits) {
        var mul = 1;
        for (var i = 0; i < digits; i++) {
            mul *= 10;
        }
        value *= mul;
        value = Math.round(value);
        return (value * 1.0 / mul);
    }

    // Sensornummer und Name und Adresse oben mit eintragen
    function buildHeaderline(sensors, loc) {
        var idx;
        var count = sensors.length;
        if (count > 0) {
            /*			// Find aktualsensir in sensors
                        for(idx=0; idx<count; idx++) {
                            if (aktsensorid == sensors[idx].id) {
                                break;
                            }
                        }
                        var hl = 'Sensoren: ';
                        for (var i=0; i<count; i++) {
                            hl += sensors[i].id + "-" + sensors[i].name + " / ";
                        }
                        hl = hl.slice(0, -2);
                        $('#subtitle').html(hl);
                        //		$('#h1name').html($('#h1name').html()+"&nbsp; &nbsp; Sensor-Nr: " + sensors[0].id);
            */
//            $('#h1name').html($('#h1name').html() + "&nbsp; &nbsp; Sensor-Nr: ");
//            $('#insel').html("Sensor-Nr: ");
            $('#ssel').val(aktsensorid);
        }
//        console.log(addr);
        var addr = loc.address;
        if ((loc.loc.coordinates[0]) == 0 && (loc.loc.coordinates[1] == 0)) {
            $('#adresse').html("Keine Koordinaten bzw. keine Adresse angegeben!");
            return;
        }
        var adtxt = '';
        if (!((addr == undefined) || (addr == {}))) {
            if (extAddr) {
                if (addr.number !== undefined) {
                    adtxt += addr.number + ', ';
                }
                if (addr.street !== undefined) {
                    adtxt += addr.street + ', ';
                }
            }
            if (addr.region !== undefined) {
                adtxt += addr.region + ', ';
            }
            if (addr.plz !== undefined) {
                adtxt += addr.plz + ' ';
            }
            if (addr.city !== undefined) {
                adtxt += addr.city + ', ';
            }
            if (addr.country !== undefined) {
                adtxt += addr.country;
            }
            $('#adresse').html(adtxt);
        }
    }


    function showError(err, txt, id) {
        console.log("*** Fehler: " + txt + " from id " + id);
        let errtxt = "";
        if (err == 1) {
            errtxt = "Dieser Sensor (" + id + ") liefert keine aktuellen Daten!";
        } else if (err == 2) {
            if (id == -1) {
                errtxt = "Keine Sensornummer eingegeben!\nBitte eingeben";
            } else {
                errtxt = "Sensor Nr. " + id + " existiert nicht in der Datenbank";
            }
        } else if (err == 3) {
            errtxt = "Sensor Nr. " + id + " ist kein Geigerzähler-Sensor";
        } else if (err==4) {
            errtxt = "Stadt " + id + " nicht gefunden";
        }
        $('#errorDialog').text(errtxt);
        dialogError.dialog("open");
    }

    function showNewDate() {
        moment.locale('de', {
            months: 'Januar_Februar_März_April_Mai_Juni_Juli_August_September_Oktober_November_Dezember'.split('_'),
        });
        if (startDay != '') {
            let datumtxt = '<span style="color:blue">Anzeige für: ' + moment(startDay).format("D.MMMM YYYY") + '</span>';
            $('#datumtxt').html(datumtxt);
        }
    }


    function startPlot(what, d1, d2, sensor, start, live) {
        if ((what == 'oneyear') || (what == 'onemonth')) {						    // gleich plotten
            PlotYM_Geiger(what, d1, sensor, live);
            showNewDate();
        } else {
            PlotDay_Geiger(what, d1, sensor, start, live);
        }
    }


    //	doPlot
    //	Fetch relevant data from the server and plot it

    function doPlot(what, start, props) {								// if 'start' not defined,
//		console.log("doPlot");
        $('placeholderFS_1').html("");
        $('#loading').show();
        let s2 = moment();
        var st;
        let live = true;
        if ((start === undefined) || (start == "")) {
            st = moment();										// then start 'now'
        } else {
            st = moment(start);
            live = false;
        }
        if (specialDate != "") {
            live = false;
        }
        var d1;
        var url = '/fsdata/getfs/' + what;
        var callopts = {
            start: st.toJSON(),
            sensorid: props._id,
            sensorname: props.name,
            avgTime: avgTime,
            live: live,
            special: specialDate,
            moving: movingAVG
        };
        $.getJSON(url, callopts, function (data1, err) {				// AJAX Call
            if (err != 'success') {
                alert("Fehler <br />" + err);						// if error, show it
            } else {
                startPlot(what, data1, null, {sid:props._id, name:props.name}, st, live);
            }
        });
    }

//	**************** PLOT *********************************************


//	PlotIT
//	Plot the given data

    function createGlobObtions() {
        var globObject = {};

        // Options, die für alle Plots identisch sind
        globObject = {
            chart: {
                height: 400,
                width: gbreit-5,
                spacingRight: 20,
                spacingLeft: 20,
                spacingTop: 25,
                spacingBottom:25,
                backgroundColor: {
                    linearGradient: [0, 400, 0, 0],
                    stops: [
                        [0, '#eee'],//[0, '#ACD0AA'], //[0, '#A18D99'], // [0, '#886A8B'], // [0, '#F2D0B5'],
                        [1, '#eee']
                    ]
                },
                type: 'line',
                borderWidth: '2',
                resetZoomButton: {
                    position: {
//						align: 'left',
//						verticalAlign: 'bottom',
                        x: -30,
                        y: 350,
                    },
                    relativeTo: 'chart',
                    theme: {
                        fill: 'lightblue',
                        r: 2,
                        states: {
                            hover: {
                                fill: 'blue',
                                style: {
                                    color: 'white'
                                }
                            }
                        }
                    }
                },
                events: {
                    selection: function (event) {
                        if (event.xAxis) {
                            doUpdate = false;
                        } else {
                            doUpdate = true;
                        }
                    }
                }
            },
            title: {
                text: 'Feinstaub über 1 Tag',
                align: 'left',
                style: {"fontSize": "25px"},
                useHTML: true,
            },
            subtitle: {
                text: 'Gemessene Werte und ' + avgTime + 'min-gleitende Mittelwerte',
                align: 'left',
            },
            tooltip: {
                valueDecimals: 1,
                backgroundColor: 0,
                borderWidth: 0,
                borderRadius: 0,
                useHTML: true,
                formatter: function () {
                    return '<div style="border: 2px solid ' + this.point.color + '; padding: 3px;">' +
                        moment(this.x).format("DD.MMM  HH:mm:ss") + '<br />' +
                        '<span style="color: ' + this.point.color + '">&#9679;&nbsp;</span>' +
                        this.series.name + ':&nbsp; <b>' +
                        Highcharts.numberFormat(this.y, 1) +
                        '</b></div>';
                }
            },
            xAxis: {
                type: 'datetime',
                title: {
                    text: 'Uhrzeit',
                },
                gridLineWidth: 2,
                labels: {
                    formatter: function () {
                        let v = this.axis.defaultLabelFormatter.call(this);
                        if (v.indexOf(':') == -1) {
                            return "<span style='font-weight:bold;color:red'>" + v + "<span>";
                        } else {
                            return v;
                        }
                    }
                },
            },
            legend: {
                enabled: true,
                layout: 'horizontal',
//				verticalAlign: 'top',
                borderWidth: 1,
                align: 'center',
            },
            plotOptions: {
                series: {
                    animation: false,
                    turboThreshold: 0,
                    marker: {
                        enabled: false,
                    }
                },
            },
//			tooltip: {
//				backgroundColor: "rgba(255,255,255,1)"
//			}
        };
        return globObject;
    }

    function calcWeekends(data, isyear) {
        var weekend = [];
        var oldDay = 8;
        for (var i = 0; i < data.length; i++) {
            var mom = moment(data[i].date);
            if (isyear) {
                mom = moment(data[i]._id)
            }
            var day = mom.day();
            var st = mom.startOf('day');
            if (day != oldDay) {
                if (day == 6) {
                    weekend.push({
                        color: 'rgba(169,235,158,0.4)',
                        from: st.valueOf(),
                        to: st.add(1, 'days').valueOf(),
                        zIndex: 0
                    })
                } else if (day == 0) {
                    weekend.push({
                        color: 'rgba(169,235,158,0.4)',
                        from: st.valueOf(),
                        to: st.add(1, 'days').valueOf(),
                        zIndex: 0
                    })
                }
                oldDay = day;
            }
        }
        return weekend;
    }

    function calcDays(data, isyear) {
        var days = [];
        if (data.length == 0) {
            return days
        }
        var oldday = moment(data[0].date).day();
        if (isyear) {
            oldday = moment(data[0]._id).day();
        }
        for (var i = 0; i < data.length; i++) {
            var m = moment(data[i].date);
            if (isyear) {
                m = moment(data[i]._id);
            }
            var tag = m.day()
            if (tag != oldday) {
                m.startOf('day');
                days.push({color: 'lightgray', value: m.valueOf(), width: 1, zIndex: 2});
                oldday = tag;
            }
        }
        return days;
    };

    function addSensorID2chart(chart, sensor) {
        let sn = (sensor.name.startsWith("Radiation")) ? sensor.name.substring(10) : sensor.name;
        var sens = chart.renderer.label(
            'Sensor: ' + sensor.sid + ' - ' + sn,
            400, 55,
            'text', 0, 0, true)
            .css({
                fontSize: '12pt',
                'font-weight': 'bold',
            })
            .attr({
                zIndex: 5,
            }).add();
    }


    var noDataTafel1 = '<div class="errTafel">' +
        'Für heute liegen leider keine Daten vor!<br /> Bitte den Sensor überprüfen!\' <br />' +
        '</div>';
    var noDataTafel2 = '<div class="errTafel">' +
        'Für den Zeitraum liegen leider keine Daten vor!<br /> Bitte den Sensor überprüfen!\' <br />' +
        '</div>';


    function calcMaxY(values) {
        let maxcpm = Math.max.apply(null, values);
        return  maxcpm + (maxcpm/2);
    }

    // ************************  GEIGER  **********************************
    function PlotYM_Geiger(what, datas, sensor, live) {
        var series1 = [];
        var series2 = [];

        var data = datas.docs;
        let faktor = sv_factor[datas.sensorname];

        if(data.length != 0) {
            var mx = [];
            if (what == 'onemonth') {
                data = data.slice(-32);							// nur einen Monat auswählen
            }
            $.each(data, function (i) {
                var dat = new Date(this._id).getTime();	// retrieve the date
                series1.push([dat, this.cpmAV]);
                mx.push(this.cpmAV);
            });
            txtMeldung = false;
        } else {
            txtMeldung = true;
        }
        let maxy = calcMaxY(mx);
        var options = createGlobObtions();
        var dlt = moment();	// retrieve the date
        if (what == 'onemonth') {
            dlt.subtract(31, 'd');
        } else {
            dlt.subtract(366, 'd');
        }


        var localOptions = {
            chart: {
                type: 'column'
            },
            tooltip: {
                formatter: function () {
                    return '<div style="border: 2px solid ' + this.point.color + '; padding: 3px;">' +
                        '&nbsp;&nbsp;' + moment(this.x).format("DD.MMM") + '<br />' +
                        '<span style="color: ' + this.point.color + '">&#9679;&nbsp;</span>' +
                        this.series.name + ':&nbsp; <b>' +
                        Highcharts.numberFormat(this.y, 1) +
                        '</b></div>';
                }
            },
            xAxis: {
//					tickInterval: 24*3600*1000,
                plotBands: calcWeekends(data, true),
                plotLines: calcDays(data, true),
                max: moment().startOf('day').subtract(1, 'd').valueOf(),
                min: dlt.valueOf(),
                title: {
                    text: 'Datum',
                },
                minTickInterval: moment.duration(1, 'day').asMilliseconds(),
                labels: {
                    formatter: function () {
                        return this.axis.defaultLabelFormatter.call(this);
                    }
                },
            },
            series: [
                {
                    name: 'cpm',
                    data: series1,
                    color: 'blue',
                },
            ],
            plotOptions: {
                series:
                    {
                    animation: false,
                    groupPadding: 0.1,
                },
                column: {
                    pointPadding: 0,
                }
            },
            title: {
                text: "Strahlung Tagesmittelwerte",
            },
            subtitle: {
                text: 'Tagesmittelwert jeweils von 0h00 bis 23h59'
            },
        }

        let maxcpm = Math.max.apply(null, mx);

        let yAxis_cpm =  [{
            title: {
                text: 'Impulse pro Minute',
                useHTML: true,
            },
            type: logyaxis == true ? 'logarithmic' : 'linear',
//                max: logyaxis == true ? null : maxy,
            max: maxy,
            min: logyaxis == true ? 1 : 0,
//						tickAmount: 9,
            opposite: true,
            gridLineColor: 'lightgray',
            plotLines: [
                {
                    color: 'blue', // Color value
                    value: maxcpm, // Value of where the line will appear
                    width: 1, // Width of the line
                    label: {
                        useHTML: true,
                        text: 'max. Wert : ' + maxcpm.toFixed(0) + ' Impule/min',
                        y: -10,
                        align: 'center',
                        style: {color: 'blue'},
                    },
                    zIndex: 8,
                }],
        },{
            title: {
                text: 'µSv/h',
                style: {
                    color: 'red'
                }
            },
            linkedTo: 0,
            useHTML: true,
            labels: {
                formatter: function () {
                    let v = this.axis.defaultLabelFormatter.call(this);
                    let w = parseFloat(v);
                    let s = Math.round((w / 60 * faktor) * 100) / 100;
                    return s;
                }
            },
        }
        ];
        options.chart.zoomType = 'x';
        options.yAxis=[];
        options.yAxis[0] = yAxis_cpm[0];
        if (faktor != 0) {
            options.yAxis[1] = yAxis_cpm[1];
        }

        $.extend(true, options, localOptions);

        // Do the PLOT
        var ch = Highcharts.chart($('#placeholderFS_1')[0], options, function (chart) {
            addSensorID2chart(chart, sensor);
            if (txtMeldung == true) {
                var labeText = "";
                var errtext = chart.renderer.label(
                    noDataTafel2,
                    80,
                    120, 'rect', 0, 0, true)
                    .css({
                        fontSize: '18pt',
                        color: 'red'
                    })
                    .attr({
                        zIndex: 1000,
                        stroke: 'black',
                        'stroke-width': 2,
                        fill: 'white',
                        padding: 10,
                    }).add();
            }
        });

//        ch.renderer.text("Sensor-Nr 141", 10, 10).add();
        $('#loading').hide();

    }

    // Geiger
    function PlotDay_Geiger(what, datas, sensor, start, live) {

        var series1 = [];
        var series2 = [];
        var series3 = [];
        let mx = [];

        // Arrays for Berechnung der Min, Max und Mittewerte über die kompletten 24h
        var aktVal = {};

        // Put values into the arrays
        var cnt = 0;
        var data = datas.docs;
        let faktor = sv_factor[datas.sensorname];

        if (data.length != 0) {
            if (what == 'oneweek') {
                data = data.RAD
            }
            $.each(data, function (i) {
                var dat = new Date(this._id).getTime();
                if ((what == 'oneweek') && movingAVG) {
                    dat = new Date(this.date).getTime();
                }
                series1.push([dat, what == 'oneweek' ? this.cpm_mav : this.cpm])
                mx.push(what == 'oneweek' ? this.cpm_mav : this.cpm);
            });

            if (what == 'oneday') {
                // Aktuelle Werte speichern

                aktVal['cpm'] = data[data.length - 1].cpm;
                // aktVal['LAMax'] = data[data.length - 1].LAMax;
                // aktVal['LAMin'] = data[data.length - 1].LAMin;

                // InfoTafel füllen
                var infoTafel =
                    '<table class="infoTafel"><tr >' +
                    '<th colspan="2">Aktuelle Werte</th>' +
                    '</tr><tr>' +
                    '<td>cpm</td><td>' + (aktVal.cpm).toFixed(1) + '</td>' +
                    '</tr><tr>' +
                    '<td>µSv/h</td><td>' + Math.round((aktVal.cpm / 60 * faktor) * 100) / 100  + '</td>';
                    '</tr></table>' +
                    '</div>';
            }
            txtMeldung = false;
        } else {
            txtMeldung = true;
        }


        // Plot-Options
        var options = createGlobObtions();

        var series_cpm = {
            name: 'Impulse_pro_Minute',
            type: ((what == 'oneweek') && !movingAVG) ? 'column' : 'spline',
            data: series1,
            color: (what == 'oneweek') ? 'green' : 'red',
            yAxis: 0,
            zIndex: 1,
            marker: {
                enabled: what == 'oneweek' ? false : true,
                symbol: 'circle',
            },
            visible: true,
        };


        let maxy = calcMaxY(mx);

        var yAxis_cpm = [{													// 1
            title: {
                text: 'Impulse pro Minute',
                style: {
                    color: 'red'
                }
            },
            min: 0,
            max: maxy,
            opposite: true,
//            tickAmount: 11,
            useHTML: true,
        },{
            title: {
                text: 'µSv/h',
                style: {
                    color: 'red'
                }
            },
            linkedTo: 0,
            useHTML: true,
            labels: {
                formatter: function () {
                    let v = this.axis.defaultLabelFormatter.call(this);
                    let w = parseFloat(v);
                    let s = Math.round((w / 60 * faktor) * 100) / 100;
                    return s;
                }
            },
        }];


        options.series = [];
        options.yAxis = [];
        options.series[0] = series_cpm;
//        options.series[1] = series_LAMin;
        options.title.text = 'Strahlung über einen Tag';
        options.subtitle.text = 'Impulse pro Minute (Mittelwert über jeweils 10min)';
//        options.series[2] = series_LAMax;
//        options.yAxis[2] = yAxis_LAMin;
        options.yAxis[0] = yAxis_cpm[0];
        if (faktor != 0) {
            options.yAxis[1] = yAxis_cpm[1];
        }
        options.chart.zoomType = 'x';
        if (what == 'oneweek') {
            options.plotOptions = {
                column: {
                    pointPadding: 0.1,
                    borderWidth: 0,
                    groupPadding: 0,
                    shadow: false
                }
            };

            options.title.text = 'Strahlung über eine Woche';
            let dau = ' Minuten';
            let avt = avgTime;
            if (avgTime >= 60) {
                dau = (avgTime == 60) ? ' Stunde' : ' Stunden';
                avt /= 60;
            }
            if (movingAVG) {
                options.subtitle.text = 'Impulse pro Minute - gleitender Mittelwert über ' + avt + dau;
            } else {
                options.subtitle.text = 'Impulse pro Minute - Mittelwert über je ' + avt + dau;
            }
//            if (mitBMP) {
//                options.title.text = 'Temperatur / Feuchte / Luftdruck über 1 Woche';
//            }
            options.xAxis.tickInterval = 3600 * 6 * 1000;
            options.xAxis.plotBands = calcWeekends(data, false);
            options.xAxis.plotLines = calcDays(data, false);
            var dlt = start.clone();
            if (live) {
                options.xAxis.max = dlt.valueOf();
                dlt.subtract(7, 'd');
                options.xAxis.min = dlt.valueOf();
            } else {
                options.xAxis.min = dlt.valueOf();
                dlt.add(7, 'd');
                options.xAxis.max = dlt.valueOf();
            }
        } else {
            dlt = start.clone();
            if (live) {
                options.xAxis.max = dlt.valueOf();
                dlt.subtract(1, 'd');
                options.xAxis.min = dlt.valueOf();
            } else {
                if (specialDate == 'silvester17') {
                    dlt = moment("2017-12-31T11:00:00Z");
                } else if (specialDate == 'silvester18') {
                    dlt = moment("2018-12-31T11:00:00Z");
                }
                options.xAxis.min = dlt.valueOf();
                dlt.add(1, 'd');
                options.xAxis.max = dlt.valueOf();
            }
        }

        let navx = gbreit-300;
        let navy = 20;
        let navbreit = 55;
        let chr;
        if (what == 'oneweek') {
            let navtxt = ['-7d', '-3d', 'live', '+3d', '+7d'];
            let navtime = [-7 * 24, -3 * 24, 0, 3 * 24, 7 * 24];
            chr = Highcharts.chart($('#placeholderFS_1')[0], options, function (chart) {
                addSensorID2chart(chart, sensor);
                for (let i = 0; i < navtxt.length; i++) {
                    renderPfeil(i, chart, navx + (i * navbreit), navy, navtxt[i], navtime[i]);
                }
                if (txtMeldung == true) {
                    var labeText = "";
                    var errtext = chart.renderer.label(
                        noDataTafel2,
                        80,
                        120, 'rect', 0, 0, true)
                        .css({
                            fontSize: '18pt',
                            color: 'red'
                        })
                        .attr({
                            zIndex: 1000,
                            stroke: 'black',
                            'stroke-width': 2,
                            fill: 'white',
                            padding: 10,
                        }).add();
                }
            });
        } else {
            let navtxt = ['-24h', '-12h', 'live', '+12h', '+24h'];
            let navtime = [-24, -12, 0, 12, 24];
            chr = Highcharts.chart($('#placeholderFS_1')[0], options, function (chart) {
                addSensorID2chart(chart, sensor);
                chart.renderer.label(
                    infoTafel,
                    50,
                    chart.chartHeight-80, 'rect', 0, 0, true)
                    .css({
                        fontSize: '10pt',
                        color: 'green'
                    })
                    .attr({
                        zIndex: 5,
                    }).add();
                for (let i = 0; i < navtxt.length; i++) {
                    renderPfeil(i, chart, navx + (i * navbreit), navy, navtxt[i], navtime[i]);
                }
                if (txtMeldung == true) {
                    var labeText = "";
                    var errtext = chart.renderer.label(
                        noDataTafel1,
                        80,
                        120, 'rect', 0, 0, true)
                        .css({
                            fontSize: '18pt',
                            color: 'red'
                        })
                        .attr({
                            zIndex: 1000,
                            stroke: 'black',
                            'stroke-width': 2,
                            fill: 'white',
                            padding: 10,
                        }).add();
                }
            });
        }
        $('#loading').hide();
    }

    function renderPfeil(n, chart, x, y, txt, time) {
        chart.renderer.button(txt, x, y, null, butOpts[0], butOpts[1], butOpts[2], butOpts[3])
            .attr({
                id: 'button' + n,
                zIndex: 3,
                width: 30,
            })
            .on('click', function () {
                prevHour(time, chart);
            })
            .add();
    }

    function prevHour(hours, ch) {
        console.log("Zurück um ", hours, "Stunden");
        let start;
        if (startDay == "") {
            start = moment();
            start.subtract(24, 'h');
        } else {
            start = moment(startDay);
        }
        let mrk = moment();
        mrk.subtract(24, 'h');
        startDay = "";
        if (hours < 0) {
            start.subtract(Math.abs(hours), 'h');
            startDay = start.format("YYYY-MM-DDTHH:mm:ssZ");
        } else if (hours > 0) {
            start.add(hours, 'h');
            if (!start.isAfter(mrk)) {
                startDay = start.format("YYYY-MM-DDTHH:mm:ssZ");
            }
        }
        doPlot(active, startDay, properties);
    }



// Umrechnung Koordinaten auf Adresse
    function geocodeLatLng(latlon) {
        geocod.geocode({'location': latlon}, function (results, status) {
            if (status === google.maps.GeocoderStatus.OK) {
                for (var i = 0; i < results.length; i++) {
                    console.log(results[i].formatted_address)
                }
                console.log("DAS ist GUT:", results[2].formatted_address);
            } else {
                window.alert('Geocoder failed due to: ' + status);
            }
        });
    }

    async function getCoords(city) {
        return $.getJSON('/mapdata/getcoord', {city: city})
            .fail((jqxhr, textStatus, error) => null)
            .done(docs => docs);
    }

// Map auf Stadt setzen
    async function setCenter(adr) {
        try {
            let data = await getCoords(adr);
            map.setView([parseFloat(data.lat), parseFloat(data.lon)]);
            console.log(data);
            return true;
        } catch (e) {
            showError(4,"Town not found",adr);
            console.log(e);
            return false;
        }
    }

// Aktuelle Daten vom Server holen
    function fetchAktualData(box) {
        let bnds = null;
        if (box != null) {
            bnds = [
                [box.getWest(), box.getSouth()],
                [box.getEast(), box.getNorth()]
            ];
        }
        return $.getJSON('/mapdata/getaktdata', {start: startDay, box: bnds})
            .fail((jqxhr, textStatus, error) => {
                alert("fetchAktualData: Fehler  " + error);						// if error, show it
            })
            .done(docs => docs);
    }

    function fetchStuttgartBounds() {
        let points = [];
        $.ajax({
            type: "GET",
            url: "/mapdata/getStuttgart",
            dataType: "xml",
            success: function (xml) {
                $(xml).find("rtept").each(function () {
                    var lat = parseFloat($(this).attr("lat"));
                    var lon = parseFloat($(this).attr("lon"));
                    var p = [lat, lon];
                    points.push(p);
                });
                L.polyline(points).addTo(map);
            }
        });
    }


// Mit dem Array 'mongoPoints' aus der properties-Datenbank ALLe Sensor-IDs holen,
// die innerhalb (d.h. in Stuttgart) liegen.
    function findStuttgartSensors() {
        let mp = JSON.stringify(mongoPoints);
        $.get('/mapdata/regionSensors', {points: mp}, function (data1, err) {	// JSON-Daten vom Server holen
            if (err != 'success') {
                alert("Fehler <br />" + err);						// ggf. fehler melden
            } else {
                console.log('Stuttgarter Sensoren:', data1);
                let se = JSON.stringify(data1);
                $.get('/mapdata/storeSensors', {sensors: se}, function (d, e) {
                    if (e != 'success') {
                        alert("Fehler beim Speichern der Region-Sensoren");
                    } else {
                        console.log("Sensoren gespeichert");
                    }
                });
            }
        });
    }

// fetch coordinates for selected sensor
// use the API
    function getSensorKoords(csens) {
        let p = new Promise(function (resolve, reject) {
//    let url = 'https://feinstaub.rexfue.de/api/getprops?sensorid='+csens;
            let url = '/api/getprops?sensorid=' + csens;
            $.get(url, (data, err) => {
                if (err != 'success') {
                    resolve({lat: 48.784373, lng: 9.182});
                } else {
//                console.log(data);
                    if ((data.values.length == 0) || ((data.values[0]==0) && (data.values[1]==0))){
                        resolve({lat: 48.780045, lng: 9.182646});
                    } else {
                        resolve({lat: data.values[0].lat, lng: data.values[0].lon});
                    }
                }
                ;
            });
        });
        return p;
    }

    /*
    var dialogError = $('#errorDialog').dialog({
        autoOpen: false,
        width: 300,
        position: {my: 'center', at: 'top+100px', of: window},
        open: function () {
            $('#page-mask').css('visibility', 'visible');
        },
        close: function () {
            $('#page-mask').css('visibility', 'hidden');
            $('#btnHelp').css('background', '#0099cc');
        },
        title: "Fehler",
        modat: true,
    });


    function showError(err, txt, id) {
        console.log("*** Fehler: " + txt + " from id " + id);
        let errtxt = "";
        if (err == 1) {
            errtxt = "Das Laden der Daten dauert etwas länger";
        } else {
            errtxt = "Unbekannter Fehler"
        }
        $('#errorDialog').text(errtxt);
        dialogHelp.dialog("open");
    }
*/

    function showGrafik(sid) {
        active = 'oneday';
        $.getJSON('fsdata/getfs/korr', {sensorid: sid}, function (data, err) {				// AJAX Call
            if (err != 'success') {
                alert("Fehler <br />" + err);						// if error, show it
            } else {
                if ((data == null) || (data.length == 0)) {
                    showError(2, "No property data for  ", sid);
					return -1;
                } else {
                    if (!data.name.startsWith('Radia')) {
                        showError(3, "This is no Radiation-Sensor", aktsensorid);
                        return -1;
                    }
                }
                properties = data;
                // save coordinates in localStorage
                localStorage.setItem('geiger_curcoord', JSON.stringify(data.location[0].loc.coordinates));
                doPlot(active, startDay, data);						// Start with plotting one day from now on
                let breit = $(window).width();
                gbreit = breit * 0.8;
                let marg = (breit-gbreit)/2;
                $('#overlay').css('width', gbreit);
                $('#overlay').css('margin-left',marg);
                $('#overlay').show();
                grafikON = true;
                doPlot(active, startDay, data);						// Start with plotting one day from now on
            }
        });
    }

});