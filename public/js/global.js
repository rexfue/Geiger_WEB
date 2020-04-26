//DOM is ready
"use strict";

$(document).ready(function() {

    const MAXOPTARR = 5;

    var active = 'oneday';					// default: plot 1 day
    var refreshRate = 15;                   // Grafik so oft auffrischen (in Minuten)
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
    let firstZoom = 8;
    const MAXZOOM = 17;
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
    let faktor;
    let showAKWs = 0;                       // 0 -> no, 1 -> only active, 2  -> all



    let showSplashScreen = false;
    let splashVersion;

    let colorscale = ['#d73027', '#fc8d59', '#fee08b', '#ffffbf', '#d9ef8b', '#91cf60', '#1a9850', '#808080'];
    let grades = [10, 5, 2, 1, 0.5, 0.2, 0, -999];
    let cpms = [1482, 741, 296, 148, 74, 30, 0, -999];

    let sv_factor = {'SBM-20': 1 / 2.47, 'SBM-19': 1 / 9.81888, 'Si22G': 0.081438};

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
    let startcity = "";
    if (!((typeof csid == undefined) || (csid == ""))) {
        if(!isNaN(csid - parseFloat(csid))) {               // check if csid is a number
            curSensor = csid;
        } else {
            startcity = csid;
        }
    }
    if(!((typeof fzoom == undefined) || (fzoom == ""))) {
        if(fzoom <= MAXZOOM)  {
            firstZoom = fzoom;
        }
    }

    // call with url ....?splash=true
    if(splash=='true') {
        localStorage.setItem('geiger_splashscreen',"0");
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
    plotMap(curSensor, startcity);

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


    function getColor(name,d) {
        let val = parseFloat(d);
        for (let i = 0; i < grades.length; i++) {
            if (val >= grades[i]) {
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

    $('.btnrohr').click(async function() {
        if(this.value == "sig") {
            showOnlySi22G = true;
        } else {
            showOnlySi22G = false;
        }
        bounds = map.getBounds();
        await buildMarkers(bounds);
        console.log('btnrohr:',this.value);
    });

    $('.btnakw').click(async function() {
        if(this.value == 'no') {
            showAKWs = 0;                                   // don't show AKWs
        } else if (this.value == 'activ') {
            showAKWs = 1;                                   // show only actives
        } else {
            showAKWs = 2;                                   // show all
        }
        bounds = map.getBounds();
        await buildAKWs(bounds);
        console.log('btnawk:',this.value);
    });



    async function plotMap(cid, city) {
        let allAKWs = L.layerGroup();
        let activeAKWs = L.layerGroup();

        let pos;
        // if sensor nbr is giveen, find coordinates, else use Stuttgart center
        let myLatLng;
        if (cid != -1) {
            myLatLng = await getSensorKoords(cid);
        } else {
            if (city != "") {
                pos = await getCoords(city);
            } else {
                pos = await getCoords("Stuttgart");
            }
            myLatLng = {lat: parseFloat(pos.lat), lng: parseFloat(pos.lon)};
        }

        map = L.map('map');
        map.on('load',function() { mapLoaded = true; });
        map.setView(myLatLng, firstZoom);

        L.tileLayer('https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', {
            maxZoom: MAXZOOM,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        bounds = map.getBounds();

//        map.scrollWheelZoom.disable();

        map.on('moveend', async function () {
            bounds = map.getBounds();
            polygon = calcPolygon(bounds);
            await buildAKWs(bounds);
            await buildMarkers(bounds);
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
                    '<u>&nbsp;&nbsp;&nbsp;</u>&nbsp;&nbsp;' + grades[i] + (i == 0 ? "+" : "") + '<br />';
            }
            div_color.innerHTML += '&nbsp;<i style="background:' + '#87CEEB' + '"></i> indoor<br />';
            div_color.innerHTML += '&nbsp;<i style="background:' + colorscale[colorscale.length - 1] + '"></i> offline';
            return div;
        };
        legend.addTo(map);

        if (useStgtBorder) {
            fetchStuttgartBounds();
        }

        await buildAKWs(bounds,allAKWs,true);
        await buildAKWs(bounds,activeAKWs,false);
        await buildMarkers(bounds);

        // let ndMarker = new L.marker(bounds.getCenter(), {opacity: 0.01});
        // ndMarker.bindTooltip("Leider z.Zt. keine Daten von sensor.community !", {permanent:true, className: "ndmarker", offset: [250,0]});
        // ndMarker.addTo(map);

        map.on('popupopen', function () {
            $('#btnshwgrafic').click(function () {
                console.log('call Grafik');
                map.closePopup();
                if(window.matchMedia("(orientation:portrait").matches) {
                    showError(5,"goto Landscape")
                } else {
                    showGrafik(clickedSensor);
                }
            });
        });

        if(cid != -1) {
            showGrafik(cid);
        }
        let overlays = {
            "Alle Kraftwerke":allAKWs,
            "nur aktive": activeAKWs
        }
        L.control.layers(overlays.addTo(map);
    }



    // With all Markers in cluster (markers) calculate the median
    // of the values. With this median fetch the color and return it.
    // If there are 'offline' sensors (value == -1) strip them before
    // calculating the median. If there are only offline sensor, return
    // color of value==-1 (dark gray).
    function getMedian(markers) {
        markers.sort(function(a,b) {                        // first sort, lowest first
            let y1 = a.options.mSvph;
            let y2 = b.options.mSvph;
            if(y1 < y2) {999
                return -1;
            }
            if(y2 < y1) {
                return 1;
            }
            return 0;
        });
        let i=0;                                            // now find the 'offlines' (mSvph == -1)
        for(i=0; i<markers.length; i++) {
            if(markers[i].options.mSvph != -1) {
                break;
            }
        }
        markers.splice(0,i);                                // remove these from array
        let lang = markers.length;
        if (lang > 1) {                                     //
            let name = markers[0].options.rohr;
            if ((lang % 2) == 1) {                          // uneven ->
                return getColor(name,markers[(Math.floor(lang / 2))].options.mSvph);  // median is in the middle
            } else {                                        // evaen ->
                lang = lang / 2;                            // median is mean of both middle mSvphs
                console.log(lang);
                let wert = (markers[lang-1].options.mSvph +
                    markers[lang].options.mSvph) / 2;
                return getColor(name,wert);
            }
        } else if (lang == 1) {                             // only one marker -> return its color
            let name = markers[0].options.rohr;
            return getColor(name,markers[0].options.mSvph);
        }
        return getColor(name,-1);                            // only offlines
    }


    /******************************************************
     * buildMarkers
     *
     * fetch data for MArkers from 'mapdata' and create
     * all the markers, that are visibile within bounds
     * and plot them on the map.
     * Use the ClusterGroup-Library to cluster the markers
     *
     * params:
     *      bounds          find markers within this bounds
     * return:
     *      all markers plotted on map
     *******************************************************/
    async function buildMarkers(bounds) {
        let markersAll;
        let count = 3;
        let sensors = [];
        let alltubes = [];
        let sigtubes = [];
        while (count != 0) {
            sensors = await fetchAktualData(bounds)
                .catch(e => {
                    console.log(e);
                    sensors = null;
                });
            if ((sensors == null) || (sensors.length == 0)) {
//                showError(1, 'Daten Laden', 0);
            } else {
//            dialogError.dialog("close");
                break;
            }
            count--;
        }
        if (count == 0) {
            return;                     // ****** <<<< Fehler meldung rein
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
                continue;                                    // ... skip this sensor
            }                                               // otherwise create marker
            if ((x.name != "Si22G") && showOnlySi22G) {
                continue;
            }
            if ((x.cpm == -2) && (curSensor == -1)) {
                continue;
            }
            let value = parseInt(x.cpm);
            let uSvph = value < 0 ? -1 : value / 60 * sv_factor[x.name];
            let curcolor = getColor(x.name,uSvph);
            let marker = L.marker([x.location[1], x.location[0]], {
                name: x.id,
                icon: new L.Icon({
                    iconUrl: buildIcon(x.indoor == 1 ? ((curcolor == '#808080') ? curcolor : '#87CEEB') : curcolor),
                    iconSize: [35, 35]
                }),
                value: value,
                mSvph: uSvph,
                url: '/' + x.id,
                rohr: x.name,
                indoor: x.indoor,
                lastseen: moment(x.lastSeen).format('YYYY-MM-DD HH:mm'),

            });
            let pos = map.latLngToLayerPoint(marker.getLatLng()).round();
            marker.setZIndexOffset(100 - pos.y);
            let addr = "Adresse";
            try {
                let ret = await $.get("api/getprops?sensorid=" +x.id);
                if(ret.values[0].address.plz == null) {
                    addr += " unbekannt !"
                } else {
                    addr = ret.values[0].address.street + "&nbsp;&nbsp;" + ret.values[0].address.plz + " " + ret.values[0].address.city;
                }
            } catch (e) {
                console.log("onMarker - getpops", e)
            }
            console.log("addr:", addr);
            marker.bindPopup((e) =>  getPopUp(e,addr)); // and bind the popup text
            if(marker.options.value != -2) {
                markersAll.addLayer(marker);
            } else {
                console.log(`Too old Sensor: ${markers.options.name}`);
            }
        }
        map.addLayer(markersAll);
    }

     function getPopUp(marker,addr) {
        clickedSensor = marker.options.name;


             let popuptext =
            `
            <div id="popuptext">
                <div id="infoTitle">
                    <h4>Sensor: ${clickedSensor}</h4>
                </div>
                <div>
                    <h6>${marker.options.rohr}</h6>
                </div>
                <div id="infoaddr">
                    ${addr}
                </div>
                <div id="indoor">
                    ${marker.options.indoor==1 ? 'indoor' : ''}
                </div>    
                <div id="infoTable">
                    <table>
                        <tr>
            `
        if (marker.options.value < 0) {
            popuptext += '<td colspan="2" style="text-align:center;"><span style="color:red;font-size:130%;">offline</span></td></tr>' +
                '<tr><td>Last seen:</td><td>' + marker.options.lastseen + '</td>';
        } else {
            popuptext += '<td>' + marker.options.value + '</td><td>cpm</td></tr>' +
                '<tr><td>' + Math.round(marker.options.mSvph * 100) / 100 + '</td><td>µSv/h</td>';
        }
        popuptext +=
            '</tr></table></div>';
        popuptext +=
            '<div id="infoBtn">' +
            '<button id="btnshwgrafic" class="btn btn-success btn-sm ">Grafik anzeigen</button>' +
            '</div></div>';
        return popuptext;
    }

    async function onMarkerClick(e, click) {
        let item = e.target.options;
        clickedSensor = item.name;
        let addr = "Adresse";
        let sensortyp = "Radiation-.Typ"
        // try {
        //     let ret = await $.get("api/getprops?sensorid=" + item.name);
        //     addr = ret.values[0].address.street + "&nbsp;&nbsp;" + ret.values[0].address.plz + " " + ret.values[0].address.city;
        //     sensortyp = ret.values[0].typ;
        // } catch (e) {
        //     console.log("onMarker - getpops", e)
        // }
        // console.log("addr:", addr);

        popuptext = '<div id="popuptext"><div id="infoTitle"><h4>Sensor: ' + item.name + '</h4>' +
            '<div><h6>' + sensortyp.substring(10) + '</h6></div>' +
            '<div id="infoaddr">' + addr + '</div>' +
            '<div id="infoTable">' +
            '<table><tr>';
        if (item.value < 0) {
            popuptext += '<td colspan="2" style="text-align:center;"><span style="color:red;font-size:130%;">offline</span></td></tr>' +
                '<tr><td>Last seen:</td><td>' + item.lastseen + '</td>';
        } else {
            popuptext += '<td>' + item.value + '</td><td>cpm</td></tr>' +
                '<tr><td>' + Math.round(item.mSvph * 100) / 100 + '</td><td>µSv/h</td>';
        }
        popuptext +=
            '</tr></table></div>';
        popuptext +=
            '<div id="infoBtn">' +
            '<button class="btn btn-success btn-sm btnshwgrafic">Grafik anzeigen</button>' +
            '</div></div>';
        let popup = e.target.getPopup();
        popup.setContent(popuptext);                        // set text into popup
        e.target.openPopup();                               // show the popup
    }

    /******************************************************
     * buildAKWs
     *
     * fetch data for all nuclear power plants and show
     * them on the map.
     * use blackcolor for active and gray color for inactive
     * plants.
     *
     * params:
     *      bounds          find npp within this bounds
     * return:
     *      all npp plotted on map
     *******************************************************/
    async function buildAKWs(bound,layer,what) {
        let akwLayer = L.layerGroup();
        if(showAKWs == 0) {
            if (akwLayer != null) {
                akwLayer.clearLayers();
            }
            return;
        }
        let count = 3;
        let kraftwerke = [];
        while (count != 0) {
            kraftwerke = await fetchAKWData(bounds)
                .catch(e => {
                    console.log(e);
                    kraftwerke = null;
                });
            if ((kraftwerke == null) || (kraftwerke.length == 0)) {
//                showError(1, 'Daten Laden', 0);
            } else {
//            dialogError.dialog("close");
                break;
            }
            count--;
        }
        if (count == 0) {
            return;                     // ****** <<<< Fehler meldung rein
        }
        let akws = kraftwerke.akws;
        for (let akw of akws) {
            if ((showAKWs == 1) && !akw.active) {
                continue;
            }
            console.log("akw: ",akw.name);
            let color = akw.active ? 'black' : 'gray';
            let marker = L.marker([akw.location.coordinates[1], akw.location.coordinates[0]], {
                name: akw.name,
                baujahr: akw.start,
                stillgelegt: akw.end,
                icon: new L.Icon({
                    iconUrl: buildAKWIcon(color),
                    iconSize: [30,30],
                    iconAnchor: [15,15]
                }),
                zIndexOffset: -1000,
                class: 'akwmarker'
            });
            marker.bindPopup((e) => getAKWPopUp(e));
            marker.addTo(akwLayer);
        }
        akwLayer.addTo(map);
    }

    function buildAKWIcon(color) {

        let akwIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">' +
            '<path fill="' + color + '" stroke="black" stroke-width="5"  ' +
            'd="M 10 0 v 600 h 650 v -250 a 250 250 0 0 0 -500 0 v 200 h -50 v -550 z" />' +
            '</svg>';
        let akwIconUrl = encodeURI("data:image/svg+xml," + akwIcon).replace(new RegExp('#', 'g'), '%23');
        return akwIconUrl;
    }

    function getAKWPopUp(marker) {
        let still = marker.options.stillgelegt==0 ? 'unbekannt' : marker.options.stillgelegt;
        let popuptxt =
        `<div id="akwpopuptext">
            <h5>${marker.options.name}</h5>
            <br />
            Baujahr: ${marker.options.baujahr}<br />
        `;
        const thisYear = moment().year();
        const stillgelegt = marker.options.stillgelegt;
        if ((stillgelegt < thisYear ) && (stillgelegt > 0)){
            popuptxt +=
                `Stillgelegt: ${marker.options.stillgelegt}`
        } else if (stillgelegt >= thisYear) {
            popuptxt +=
                `Stilllegung: ${marker.options.stillgelegt} (geplant)`
        };
        popuptxt += '</div>';
        return popuptxt;
    }
// ********************************************************************************
// Events
// ********************************************************************************
    $('#btninfo').click(function () {
        $('#modalTitle').html("Infos zur Karte");
//        dialogHelp.dialog("open");
        $('.modal-body').load("fsdata/help",function() {
            $('.modal-body').removeClass('text-danger');
            $('#myModal').modal({show:true, focus:true});
         });
    });

    $('#newmapcenter').change(()=>
        setNewCenter());

    $('#btnsearch').click(function () {
        setNewCenter();
    });

    let showlegend = false;
    $('#btnlegende').click(function() {
        if(showlegend === true) {
            $('.legend').hide();
            showlegend = false;
        } else {
            $('.legend').show();
            showlegend = true;
        }

    })

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
            if (coo.err ==  null) {
                map.setView([coo.lat, coo.lng]);
            } else if (coo.err == 'not found') {
                showError(2,coo.err, x);
            } else if (coo.err == 'wrong type') {
                showError(3,coo.err,x);
            }
        }
    }


    function switchGray(on) {
        if (on) {
            $('img.leaflet-tile').css('-webkit-filter', 'brightness(60%)').css('filter', 'brightness(60%)');
        } else {
            $('img.leaflet-tile').css('-webkit-filter', 'brightness(100%)').css('filter', 'brightness(100%)');
        }
    }


    var dialogHelp = $('#dialogWinHelp').dialog({
        autoOpen: false,
        width: function () {
            let breit = $(window).width();
            return breit * 0.5;
        },
        title: 'Info',
        position: {my: 'center', at: 'top+100px', of: window},
        open: function () {
            $('#page-mask').css('visibility', 'visible');
//            switchGray(true);
            $(this).load('/fsdata/help', function() {
                console.log("help geladen");
            });
        },
        close: function () {
            $('#page-mask').css('visibility', 'hidden');
//            switchGray(false);
            $('#btnHelp').css('background', '#0099cc');
        },
    });


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
            $('#btnset').show();
//            $('#btnset').css('background', '#0099cc');
        },
    });


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
        let splash = localStorage.getItem('geiger_splashscreen');
        if (splash != null) {
            splashVersion = splash;
        }
        console.log("SplashScreen:", splashVersion);
    }

    getLocalStorage();
    $('#h1name').html(kopf);
    $('#sbx label').html('Auswahl der letzten ' + MAXOPTARR);


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

// if enabled, show splash screen
    if (showSplashScreen) {
        if (splashVersion != curversion) {                        // curversion comes from index.js (package.json)
            $('#modalTitle').html("Neue Version");
            $('.modal-body').load("fsdata/splash", function () {
                $('.modal-body').removeClass('text-danger');
                $('#splashModal').modal({show: true, focus: true});
                $('#splashModal').on('hidden.bs.modal', function () {
                    let sp = $('#splashCheck');
                    if (sp[0].checked) {
                        console.log("Checked");
                        localStorage.setItem('geiger_splashscreen', curversion);
                    } else {
                        console.log("NOT Checked");
                    }
                });
            });
        }
        ;
    }


// ************** Event-Handler **************

    $('#btnend').click(function () {
        $('#overlay').hide();
        $('#btnset').hide();
        grafikON = false;
        $('#placeholderBME').hide();
        $('#placeholder_FS1').hide();
    });


    $('#btnset').click(function () {
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
            $('#btnset').show();
        } else {
            $('#btnset').hide();
        }
        active = 'one' + button;
        doPlot(active, startDay,properties);
//        switchPlot(active);								// gewählten Plot aktivieren
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

    async function updateGrafik() {
        var d = moment()								// akt. Zeit holen
        if (((d.minute() % refreshRate) == 0) && (d.second() == 15)) {	// alle ganzen refreshRate Minuten, 15sec danach
            console.log(refreshRate, 'Minuten um, Grafik wird erneuert jetzt');
            if (grafikON && (active == 'oneday')) {	// Wenn nicht die Karte, dann
                doPlot(active, startDay,properties);						// Tages- und
            } else {
                if(mapLoaded) {
                    await buildMarkers(bounds);
                }
            }
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
        } else if (err==5) {
            errtxt = "Gerät bitte auf quer drehen!";
        }
        $('#errorDialog').text(errtxt);
        $('#modalTitle').html("Error");
//        dialogHelp.dialog("open");
        $('.modal-body').html(errtxt);
        $('.modal-body').addClass('text-danger');
        $('#myModal').modal({show:true});
//        dialogError.dialog("open");
    }


    function startPlot(what, d1, d2, start, live) {
        if (what == 'onemonth') {						    // gleich plotten
            PlotMonth_Geiger(d1, live);
        } else {
            PlotDayWeek_Geiger(what, d1, start, live);
            $('#placeholder_FS1').show();
            if(d1.climate.length != 0) {
                PlotDayWeek_BME280(what, d1, start, live);
                $('#placeholderBME').show();
            }
        }
    }


    //	doPlot
    //	Fetch relevant data from the server and plot it

    function doPlot(what, start, props) {								// if 'start' not defined,
		console.log("doPlot");
        $('placeholderFS_1').html("");
        $('placeholderBME').html("");
        $('#loading').show();
        let st;
        let live = true;
        if ((start === undefined) || (start == "")) {
            st = moment();										// then start 'now'
        } else {
            st = moment(start);
            live = false;
        }
        var url = '/fsdata/getfs/' + what;
        var callopts = {
            start: st.format(),
            sensorid: props._id,
            sensorname: props.name,
            avgTime: avgTime,
            live: live,
            moving: movingAVG,
        };
        faktor = sv_factor[props.name.substring(10)];
        $.getJSON(url, callopts, function (data1, err) {				// AJAX Call
            if (err != 'success') {
                alert("Fehler <br />" + err);						// if error, show it
            } else {
                startPlot(what, data1, null,  st, live);
            }
        });
    }


    //	**************** PLOT *********************************************


    /******************************************************
    * createGlobalOptions
    *
    * Create all identical option for the plots
    * params:
    *      none
    * return:
    *      object with all defined options
    *******************************************************/
    function createGlobObtions() {
        var globObject = {};

        // Options, die für alle Plots identisch sind
        globObject = {
            chart: {
                height: 350,
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
                        y: 300,
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

    /******************************************************
     * calcWeekends
     *
     * Calulate the weekends. The ar merked in the plot as
     * lightgreen bands
     * params:
     *      data            array of dates
     *      isyear          true, if data is year average
     * return:
     *      object to be plotted
     *******************************************************/
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


    /******************************************************
     * calcDays
     *
     * Calulate the day borders. In week plot every day
     * border is shown es darker gray vertical line
     * params:
     *      data            array of dates
     *      isyear          true, if data is year average
     * return:
     *      object to be plotted
     *******************************************************/
    function calcDays(data, isyear) {
        var days = [];
        if (data.length == 0) {
            return days
        }
        let  oldday = moment(data[0]._id).day();
        for (var i = 0; i < data.length; i++) {
            var m = moment(data[i]._id);
            var tag = m.day()
            if (tag != oldday) {
                m.startOf('day');
                days.push({color: 'lightgray', value: m.valueOf(), width: 1, zIndex: 2});
                oldday = tag;
            }
        }
        return days;
    };


    /******************************************************
     * addSensorID2chart
     *
     * Plot the sensor number an name in the top center of
     * chart
     * params:
     *      chart           chart, where to plot
     *      sensor          whos number is to plot
     * return:
     *      none
     *******************************************************/
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



    /******************************************************
     * calcMaxY
     *
     * Calculate the max of the data array. Return the
     * value for max at yAxis (is max of data + 2/2 * max of data)
     *
     * params:
     *      values        array with data
     * return:
     *      object wih max of values and max for yAxis
     *******************************************************/
    function calcMaxY(values) {
        let maxval = Math.max.apply(null, values);
        return  {maxY: maxval*2, maxVal: maxval};
    }


    /******************************************************
     * PlotMonth_Geiger
     *
     * Plot the geiger values für the last 31 days
     *
     * params:
     *      datas           object with the data to plot#
     *      sensor          sensor number, whos values this are
     *      live            true => live-data
     * return:
     *      none
     *******************************************************/
    function PlotMonth_Geiger(datas, live) {
        let series1 = [];
        let series2 = [];
        let series3 = [];
        let series4 = [];
        var mx1 = [];

        let data = datas.radiation.values;
        let sensor = {sid: datas.radiation.sid, name: datas.radiation.sname};

        if(data.length != 0) {
//            data = data.slice(-32);							// nur einen Monat auswählen
            $.each(data, function (i) {
                var dat = new Date(this._id).getTime();	// retrieve the date
                series1.push([dat, this.uSvphAvg])
                mx1.push(this.uSvphAvg);
            });
            txtMeldung = false;
        } else {
            txtMeldung = true;
        }
        let maxima = calcMaxY(mx1);
        var options = createGlobObtions();
        var dlt = moment();	// retrieve the date
        dlt.subtract(31, 'd');

        var localOptions = {
            chart: {
                type: 'column'
            },
            xAxis: {
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
            tooltip: {
                valueDecimals: 1,
                backgroundColor: 0,
                borderWidth: 0,
                borderRadius: 0,
                useHTML: true,
                formatter: function () {
                    return '<div style="border: 2px solid ' + this.point.color + '; padding: 3px;">' +
                        moment(this.x).format("DD.MMM") + '<br />' +
                        '<span style="color: ' + this.point.color + '">&#9679;&nbsp;</span>' +
                        this.series.name + ':&nbsp; <b>' +
                        Highcharts.numberFormat(this.y, 3) +
                        '</b><br /> &#x2259; Impulse pro Minute: <b>' + Highcharts.numberFormat(this.y*60/faktor, 0) + '</b></div>';
                }
            },
            series: [
                {
                    name: 'uSvph',
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

        let yAxis =  [{
            title: {
                text: 'µSv/h',
                style: {
                    color: 'red'
                }
            },
            max: maxima.maxY,
            min: 0,
            gridLineColor: 'lightgray',
            plotLines: [
                {
                    color: 'blue', // Color value
                    value: maxima.maxVal, // Value of where the line will appear
                    width: 1, // Width of the line
                    label: {
                        useHTML: true,
                        text: 'max. Wert : ' + maxima.maxVal.toFixed(3) + ' µSv/h',
                        y: -10,
                        align: 'center',
                        style: {color: 'blue'},
                    },
                    zIndex: 8,
                }],
        },{
            title: {
                text: 'Impulse pro Minute',
                useHTML: true,
            },
            opposite: true,
            linkedTo: 0,
            useHTML: true,
            labels: {
                formatter: function () {
                    let v = this.axis.defaultLabelFormatter.call(this);
                    let w = parseFloat(v);
                    let s = Math.round(w * 60 / faktor);
                    return s;
                }
            },
        }
        ];
        options.chart.zoomType = 'x';
        options.yAxis=[];
        options.yAxis[0] = yAxis[0];
        if (faktor != 0) {
            options.yAxis[1] = yAxis[1];
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
    function PlotDayWeek_Geiger(what, datas, start, live) {

        var series1 = [];
        var series2 = [];
        var series3 = [];
        let mx = [];

        // Arrays for Berechnung der Min, Max und Mittewerte über die kompletten 24h
        var aktVal = {};

        // Put values into the arrays
        var cnt = 0;
        var data = datas.radiation.values;
        let sensor = {sid:datas.radiation.sid, name:datas.radiation.sname}

        if (data.length != 0) {
            $.each(data, function (i) {
                var dat = new Date(this._id).getTime();
                series1.push([dat, this.uSvphAvg])
                mx.push(this.uSvphAvg);
            });

            if (what == 'oneday') {
                // Aktuelle Werte speichern

                aktVal['cpm'] = data[data.length - 1].cpmAvg;
                aktVal['uSvph'] = data[data.length - 1].uSvphAvg;

                // InfoTafel füllen
                var infoTafel =
                    '<table class="infoTafel"><tr >' +
                    '<th colspan="2">Aktuelle Werte</th>' +
                    '</tr><tr>' +
                    '<td>cpm</td><td>' + (aktVal.cpm).toFixed(0) + '</td>' +
                    '</tr><tr>' +
                    '<td>µSv/h</td><td>' +  (aktVal.uSvph).toFixed(2)  + '</td>';
                    '</tr></table>' +
                    '</div>';
            }
            txtMeldung = false;
        } else {
            txtMeldung = true;
        }


        // Plot-Options
        var options = createGlobObtions();

        var series_uSvph = {
            name: 'µSv pro Stunde',
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
                text: 'µSv/h',
                style: {
                    color: 'red'
                }
            },
            min: 0,
            max: maxy.maxY,
//            tickAmount: 11,
            useHTML: true,
        },{
            title: {
                text: 'Impulse pro Minute',
                style: {
                    color: 'red'
                }
            },
            linkedTo: 0,
            useHTML: true,
            opposite: true,
            labels: {
                formatter: function () {
                    let v = this.axis.defaultLabelFormatter.call(this);
                    let w = parseFloat(v);
                    let s = Math.round(w * 60 / faktor);
                    return s;
                }
            },
        }];


        options.tooltip =
            {
            valueDecimals: 1,
                backgroundColor: 0,
                borderWidth: 0,
                borderRadius: 0,
                useHTML: true,
                formatter: function () {
                return '<div style="border: 2px solid ' + this.point.color + '; padding: 3px;">' +
                    moment(this.x).format("DD.MMM,  HH:mm") + ' Uhr<br />' +
                    '<span style="color: ' + this.point.color + '">&#9679;&nbsp;</span>' +
                    this.series.name + ':&nbsp; <b>' +
                    Highcharts.numberFormat(this.y, 3) +
                    '</b><br /> &#x2259; Impulse pro Minute: <b>' + Highcharts.numberFormat(this.y*60/faktor, 0) + '</b></div>';
            }
        };

        options.series = [];
        options.yAxis = [];
        options.series[0] = series_uSvph;
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
            options.xAxis.tickInterval = 3600 * 6 * 1000;
            options.xAxis.plotBands = calcWeekends(data, false);
            options.xAxis.plotLines = calcDays(data, false);
            var dlt = start.clone();
                options.xAxis.max = dlt.valueOf();
                dlt.subtract(7, 'd');
                options.xAxis.min = dlt.valueOf();
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
                    7,
                    chart.chartHeight-74, 'rect', 0, 0, true)
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

    // ************************************************************
    // Plot BME280
    function PlotDayWeek_BME280(what, datas, start, live) {

        let series1 = [];
        let series2 = [];
        let series3 = [];
        let mx1 = [];
        let mx3 = [];

        // Arrays for Berechnung der Min, Max und Mittewerte über die kompletten 24h
        var aktVal = {};

        // Put values into the arrays
        var cnt = 0;
        var data = datas.climate.values;
        let sensor = {sid:datas.climate.sid, name:datas.climate.sname}


        if (data.length != 0) {
            $.each(data, function (i) {
                var dat = new Date(this._id).getTime();
                series1.push([dat, this.tempAvg])
                mx1.push(this.tempAvg);
                series2.push([dat, this.humiAvg])
                if(this.pressSeaAvg != null) {
                    series3.push([dat, this.pressSeaAvg/100])
                    mx3.push(this.pressSeaAvg/100);
                }
            });

            if (what == 'oneday') {
                // Aktuelle Werte speichern

                aktVal['temperature'] = data[data.length - 1].tempAvg;
                aktVal['humidity'] = data[data.length - 1].humiAvg;
                aktVal['pressure'] = data[data.length - 1].pressSeaAvg/100;

                // InfoTafel füllen
                var infoTafel =
                    '<table class="infoTafel"><tr >' +
                    '<th colspan="3">Aktuelle Werte</th>' +
                    '</tr><tr>' +
                    '<td>Temperatur</td><td>' + (aktVal.temperature).toFixed(1) + '</td>' + '<td>°C</td>' +
                    '</tr><tr>' +
                    '<td>Feuchte</td><td>' +  (aktVal.humidity).toFixed(0)  + '</td>' + '<td>%</td>' +
                    '</tr><tr>' +
                    '<td>Luftdruck</td><td>' +  (aktVal.pressure).toFixed(0)  + '</td>' + '<td>hPa</td>' +
                '</tr></table>' +
                '</div>';
            }
            txtMeldung = false;
        } else {
            txtMeldung = true;
        }


        // Plot-Options
        var options = createGlobObtions();

        var series_temp = {
            name: 'Temperatur',
            type: 'line',
//            type: ((what == 'oneweek') && !movingAVG) ? 'column' : 'spline',
            data: series1,
            color: 'red',
//            color: (what == 'oneweek') ? 'green' : 'red',
            yAxis: 0,
            zIndex: 1,
            marker: {
                enabled: false,
//                enabled: what == 'oneweek' ? false : true,
                symbol: 'circle',
            },
            visible: true,
        };

        var series_humi = {
            name: 'Feuchte',
            type: 'line',
//            type: ((what == 'oneweek') && !movingAVG) ? 'column' : 'spline',
            data: series2,
            color: '#946CBD',
//            color: (what == 'oneweek') ? 'green' : 'red',
            yAxis: 1,
            zIndex: 1,
            marker: {
                enabled: false,
//                enabled: what == 'oneweek' ? false : true,
                symbol: 'circle',
            },
            visible: true,
        };

        var series_press = {
            name: 'Luftdruck',
            type: 'line',
//            type: ((what == 'oneweek') && !movingAVG) ? 'column' : 'spline',
            data: series3,
            color: '#DA9E24',
//            color: (what == 'oneweek') ? 'green' : 'red',
            yAxis: 2,
            zIndex: 1,
            marker: {
                enabled: false,
//                enabled: what == 'oneweek' ? false : true,
                symbol: 'circle',
            },
            visible: true,
        };

        // Check min/max of temp to arrange y-axis
        let tmi = Math.min(...mx1);
        let tma = Math.max(...mx1);
        let tmid = (tmi+tma) / 2;
        let loty = tmid - 5;
        let hity = tmid + 5;

        var yAxis_temp = {													// 1
            title: {
                text: 'Temperatur °C',
                style: {
                    color: 'red'
                }
            },
            min: loty,
            max: hity,
            opposite: true,
            tickAmount: 11,
            useHTML: true,
        };

        var yAxis_hum = {
            title: {										// 2
                text: 'rel. Feuchte %',
                style: {
                    color: '#946CBD',
                }
            },
            min: 0,
            max: 100,
            gridLineColor: 'lightgray',
            opposite: true,
            tickAmount: 11,
        };

        // Check min/max of press to arrange y-axis
        let pmi = Math.min(...mx3);
        let pma = Math.max(...mx3);
        let mid = (pmi+pma) / 2;
        let lopy = mid - 30;
        let hipy = mid + 30;

        var yAxis_press = {													// 3
            title: {
                text: 'Luftdruck hPa',
                style: {
                    color: '#DA9E24',
                }
            },
            gridLineColor: 'lightgray',
            min: lopy,
            max: hipy,
            opposite: true,
            tickAmount: 11,
        };


        options.tooltip =
            {
                valueDecimals: 1,
                backgroundColor: 0,
                borderWidth: 0,
                borderRadius: 0,
                useHTML: true,
                formatter: function () {
                    return '<div style="border: 2px solid ' + this.point.color + '; padding: 3px;">' +
                        moment(this.x).format("DD.MMM,  HH:mm") + ' Uhr<br />' +
                        '<span style="color: ' + this.point.color + '">&#9679;&nbsp;</span>' +
                        this.series.name + ':&nbsp; <b>' +
                        Highcharts.numberFormat(this.y, 3) +
                       '</div>';
                }
            };

        options.series = [];
        options.yAxis = [];
        options.series[0] = series_temp;
        options.series[1] = series_humi;
        options.series[2] = series_press;
        options.title.text = 'Temperatur / Feuchte / Luftdruck über 1 Tag';
        options.subtitle.text = 'Mittelwerte über jeweils 10min';
//        options.series[2] = series_LAMax;
//        options.yAxis[2] = yAxis_LAMin;
        options.yAxis[0] = yAxis_temp;
        options.yAxis[1] = yAxis_hum;
        options.yAxis[2] = yAxis_press;
        options.chart.zoomType = 'x';
        options.chart.spacingBottom = 40;

        if (what == 'oneweek') {
            options.plotOptions = {
                column: {
                    pointPadding: 0.1,
                    borderWidth: 0,
                    groupPadding: 0,
                    shadow: false
                }
            };

            options.title.text = 'Temperatur / Feuchte / Luftdruck über 1 Woche';
            options.subtitle.text = 'Mittelwerte über jeweils 10min';
            // let dau = ' Minuten';
            // let avt = avgTime;
            // if (avgTime >= 60) {
            //     dau = (avgTime == 60) ? ' Stunde' : ' Stunden';
            //     avt /= 60;
            // }
            // if (movingAVG) {
            //     options.subtitle.text = 'Impulse pro Minute - gleitender Mittelwert über ' + avt + dau;
            // } else {
            //     options.subtitle.text = 'Impulse pro Minute - Mittelwert über je ' + avt + dau;
            // }
            options.xAxis.tickInterval = 3600 * 6 * 1000;
            options.xAxis.plotBands = calcWeekends(data, false);
            options.xAxis.plotLines = calcDays(data, false);
            var dlt = start.clone();
            options.xAxis.max = dlt.valueOf();
            dlt.subtract(7, 'd');
            options.xAxis.min = dlt.valueOf();
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
            chr = Highcharts.chart($('#placeholderBME')[0], options, function (chart) {
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
        } else {
            chr = Highcharts.chart($('#placeholderBME')[0], options, function (chart) {
                addSensorID2chart(chart, sensor);
                chart.renderer.label(
                    infoTafel,
                    7,
                    chart.chartHeight-94, 'rect', 0, 0, true)
                    .css({
                        fontSize: '8pt',
                        color: 'green'
                    })
                    .attr({
                        zIndex: 5,
                    }).add();
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
                prevHour(time);
            })
            .add();
    }

    function prevHour(hours) {
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
//                alert("fetchAktualData: Fehler  " + error);						// if error, show it
                return [];
            })
            .done(docs => docs);
    }

// Aktuelle Daten vom Server holen
    function fetchAKWData(box) {
        let bnds = null;
        if (box != null) {
            bnds = [
                [box.getWest(), box.getSouth()],
                [box.getEast(), box.getNorth()]
            ];
        }
        return $.getJSON('/mapdata/getakwdata', {box: bnds})
            .fail((jqxhr, textStatus, error) => {
//                alert("fetchAKWData: Fehler  " + error);						// if error, show it
                return [];
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
                    resolve({err: 'not found', lat: 48.784373, lng: 9.182});
                } else {
//                console.log(data);
                    if ((data.values.length == 0) || ((data.values[0].lat==0) && (data.values[1].lon==0))){
                        resolve({err: 'not found', lat: 48.780045, lng: 9.182646});
                    } else {
                        if (!data.values[0].typ.startsWith("Radiation")) {
                            resolve({err: 'wrong type', lat: 48.780045, lng: 9.182646});
                        } else {
                            resolve({err: null, lat: data.values[0].lat, lng: data.values[0].lon});
                        }
                    }
                }
            });
        });
        return p;
    }


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