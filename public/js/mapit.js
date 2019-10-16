"use strict";

// History for mapit.js
//
// V 2.6.0  2019-10-05 rxf
//  - identical module für 'geiger' and for 'noise'
//
// V 2.5.0  2019-10-05  rxf
//

const Version = "2.6.0";

var map;
var marker = [];
var sBreit = 30;
var infowindow;
var first = true;
var newBounds = false;
var geocod;
var trafficLayer;
let mongoPoints = [];
let problems = [];
let icon = "";
let radius = 10;

let firstZoom = 11;
let useStgtBorder = false;
let popuptext = "";
let bounds;
let polygon;                            // rectangle of whole map to dim background
let refreshRate = 5;                    // refresh map this often [min]

let colorscale = [];
let grades = [];
let cpms=[];
let sv_factor = {};
let clickedSensor = 0;

let startDay = "";
if(!((typeof startday == 'undefined') || (startday == ""))) {
        startDay = startday;
}


let type = "";
if (!((typeof typeOfSensor == 'undefined') || (typeOfSensor == ""))) {
    type = typeOfSensor;
}

let curSensor = -1;                                             // default-Sensor
if (!((typeof csid == 'undefined') || (csid == ""))) {
    curSensor = csid;
    $('#btnBack').show();
}

//	localStorage.clear();


/* Alle Minute die ktuelle Urzeit anzeigen und
 * Alle 'refreshRate' plus 15sec die Grafiken neu zeichnen
 * Die Funktion wird alle Sekunde aufgerufen !
 */
let sofort = true;
(function showUhrzeit() {
    var d = moment()								// akt. Zeit holen
    if (sofort || (d.second() == 0)) {				// Wenn Minute grade um
        $('#h1uhr').html(d.format('HH:mm'));
        $('#h1datum').html(d.format('YYYY-MM-DD'));		// dann zeit anzeigen
    }
    if (((d.minute() % refreshRate) == 0) && (d.second() == 15)) {	// alle ganzen refreshRate Minuten, 15sec danach
        console.log(refreshRate, 'Minuten um, Grafik wird erneuert');
        buildMarkers(bounds);
    }
    sofort = false;
    setTimeout(showUhrzeit,1000);
})();

plotMap(curSensor,null);


function calcPolygon(bound) {
    return L.polygon([[bounds.getNorth(),bounds.getWest()],[bounds.getNorth(),bounds.getEast()],[bounds.getSouth(),bounds.getEast()],[bounds.getSouth(), bounds.getWest()]], {color:'black', fillOpacity: 0.5});;
}
/*
                       div.label(style="bottom: 100%;") 10+
                        div.label(style="bottom: 83.3%;") 5.0
                        div.label(style="bottom: 66.6%;") 2.0
                        div.label(style="bottom: 50%;") 1.0
                        div.label(style="bottom: 33.3%;") 0.5
                        div.label(style="bottom: 16.6%;") 0.2
                        div.label(style="bottom: 1%;")  0.1 µSv/h

 */
if (type == 'Geiger') {
    colorscale = ['#d73027','#fc8d59','#fee08b','#ffffbf','#d9ef8b','#91cf60','#1a9850', '#808080'];
    grades = [  10,   5,   2,   1,  0.5, 0.2, 0.1, -999];
    cpms =   [1482, 741, 296, 148, 74,  30,  15,   -999];

    sv_factor = {'SBM-20':1/2.47, 'SBM-19': 1/9.81888, 'Si22G' : 1 };

}


function getColor(d) {
    let val = parseInt(d);
    for (let i = 0; i < cpms.length; i++) {
        if (val >= cpms[i]) {
            return (colorscale[i]);
        }
    }
}

function buildIcon(color) {
    if(type == 'Geiger') {
        let radiIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">' +
            '<circle cx="300" cy="300" r="300" fill="' + color + '"/>' +
            '<circle cx="300" cy="300" r="50"/>' +
            '<path stroke="#000" stroke-width="175" fill="none" stroke-dasharray="171.74" d="M382,158a164,164 0 1,1-164,0"/>' +
            '</svg>';
        let radiIconUrl = encodeURI("data:image/svg+xml," + radiIcon).replace(new RegExp('#', 'g'), '%23');
        return radiIconUrl;
    }
}

//$('#overlay').html("Das ist das DIV");
// generate map centered on Stuttgart

async function plotMap(cid, poly) {
    // if sensor nbr is give, find coordinates, else use Stuttgart center
    let myLatLng;
    if( cid != -1) {
        myLatLng = await getSensorKoords(curSensor);
    } else {
        let stgt = await getCoords("Stuttgart");
        myLatLng = {lat: parseFloat(stgt.lat),lng: parseFloat(stgt.lon)};
    }

    map = L.map('map').setView(myLatLng, firstZoom);

    L.tileLayer('https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    bounds = map.getBounds();

    map.scrollWheelZoom.disable();

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

    var legend = L.control({position: 'bottomright'});

    legend.onAdd = function (map) {
        let div = L.DomUtil.create('div','info legend');
        let div_color = L.DomUtil.create('div', 'info legend inner',div);
        div_color.innerHTML += 'µSv/h<br />';
        // loop through our density intervals and generate a label with a colored square for each interval
        for (var i = 0; i < grades.length-1; i++) {
            div_color.innerHTML +=
                '<i style="background:' + colorscale[i] + '"></i>'+
            '<u>&nbsp;&nbsp;&nbsp;</u>&nbsp;&nbsp;' + grades[i]  + (i==0?"+":"") + '</upan><br />';
        }
        div_color.innerHTML += '&nbsp;<i style="background:' + getColor(grades[grades.length-1]) + '"></i> offline';
        return div;
    };

    legend.addTo(map);


    if (useStgtBorder) {
        fetchStuttgartBounds();
    }

    await buildMarkers(bounds);

    map.on('popupopen', function() {
        $('.speciallink').click(function(x) {
            showGrafik(clickedSensor);
        });
    });
    map.on('click', function() {
        $('#overlay').hide();
    });

}


async function buildMarkers(bounds) {
    let count = 3;
    let sensors;
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
    for (let x of sensors.avgs) {
        if (x.location == undefined) {                   // if there is no location defined ...
            continue;                                   // ... skip this sensor
        }                                               // otherwise create marker
        let marker = L.marker([x.location[1],x.location[0]], {
            name: x.id,
            icon: new L.Icon({
                iconUrl: buildIcon(getColor(x.cpm)),
                iconSize: [25, 25]
            }),
            value: x.cpm,
            url: '/'+x.id,
            rohr: x.name,
            lastseen: moment(x.lastSeen).format('YYYY-MM-DD HH:mm')

        })
            .on('click', e => onMarkerClick(e,true))        // define click- and
//            .on('mouseover', e => onMarkerClick(e,false))   // over-handler
//            .on('mouseout', e => e.target.closePopup())
            .bindPopup(popuptext);                      // and bint the popup text
        marker.addTo(map);
    }
//    showLastDate(sensors.lastDate);

}


async function onMarkerClick(e, click) {
    let item = e.target.options;
    let factor = sv_factor[item.rohr];
    clickedSensor = item.name;

    let popuptext = '<div id="infoTitle"><h5>Sensor: ' + item.name + '</h5>' +
        '<div id="infoTable">' +
        '<table><tr>';
    if(item.value < 0 ) {
        popuptext +='<td colspan="2"><span style="color:red;">offline</span></td></tr>' +
        '<tr><td>Last seen:</td><td>'+item.lastseen+'</td>';
    } else {
        popuptext += '<td>' + item.value + '</td><td>cpm</td></tr>' +
            '<tr><td>' + Math.round((item.value / 60 *factor)*100)/100 + '</td><td>µSv/h</td>';
    }
    popuptext +=
        '</tr><table>' +
        '<div id="infoBtn">'+
        '<a href="#" class="speciallink">Grafik anzeigen</a>'+
        '</div>' +
        '</div>' +
        '</div>';
    let popup = e.target.getPopup();
    popup.setContent(popuptext);                        // set text into popup
    e.target.openPopup();                               // show the popup
    if(click == true) {                                 // if we clicked
        e.target.closePopup();                               // show the popup
    }
}


$('#btnBack').click(function() {
    window.location = "/"+curSensor;
});


$('#btnHelp').click(function() {
    dialogHelp.dialog("open");
});


$('#btnCent').click(function() {
//    infowindow.setContent("");
//    infowindow.close();								// löschen
    dialogCenter.dialog("open");
});


let dialogHelp = $('#dialogWinHelpM').dialog({
    autoOpen: false,
    width: 800,
    title: 'Info',
    position: {my:'center', at: 'top', of:'#map'},
    open: function() {
        polygon.addTo(map);
        $('#page-mask').css('visibility','visible');
        $(this).load('/fsdata/helpmap')
    },
    close: function() {
        $('#page-mask').css('visibility','hidden');
        $('#btnHelp').css('background','#0099cc');
        polygon.remove();
    },
});

/*        $(
}'#dialogWinHelpM').dialog({
    autoOpen: false,
    width: 800,
    title: 'Info',
    position: {my:'center', at: 'top', of:window},
    open: function() {
        $('#page-mask').css('visibility','visible');
        $(this).load('/fsdata/helpmap')
    },
    close: function() {
        $('#page-mask').css('visibility','hidden');
        $('#btnHelp').css('background','#0099cc');

    },
    modal: true
});
*/

var dialogCenter = $('#dialogCenter').dialog({
    autoOpen: false,
    width: 800,
    title: 'Zentrieren',
    open: function() {
        $('#page-mask').css('visibility','visible');
        polygon.addTo(map);
        $(this).load('/fsdata/centermap', function() {
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
        },{
            text: "Abbrechen",
            click : function() {
                dialogCenter.dialog("close");
            },
            style: "margin-right:40px;",
            width: 100,
        }
    ],
    modal: true,
    close: function() {
        $('#page-mask').css('visibility','hidden');
        polygon.remove();

    },
});

$('.dialog').keypress(function(e) {
    if (e.keyCode == 13) {
        $('.btnOK').focus();
    }
});

function setNewCenter() {
    var town = $('#newmapcenter').val();
    if ((town == "") || (town == null)) {
        town = 'Stuttgart';
    }
    setCenter(town);
    dialogCenter.dialog("close");
    $('#btnCent').css('background','#0099cc');
}


/*
// Karte und die Marker erzeugen
async function initMap() {												// Map initialisieren
    var trafficLayer;

    // 'globale' Variable
    infowindow = new google.maps.InfoWindow;
    geocod = new google.maps.Geocoder;

    let myLatLng = await getSensorKoords(curSensor);

    $('#nosensor').hide();
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 12,													// Start-Zoom-Wert
        center: myLatLng,
		maxZoom: 17,                                                // max. Zoom Level
        scrollwheel: false,
    });

    trafficLayer = new google.maps.TrafficLayer();

*/
/* Autocenter via geoloc  -  geht nur mit https !!
    var infoWindow = new google.maps.InfoWindow({map: map});
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            var pos = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };

            infoWindow.setPosition(pos);
            infoWindow.setContent('Location found.');
            map.setCenter(pos);
        }, function() {
            handleLocationError(true, infoWindow, map.getCenter());
        });
    } else {
        // Browser doesn't support Geolocation
        handleLocationError(false, infoWindow, map.getCenter());
    }


    function handleLocationError(browserHasGeolocation, infoWindow, pos) {
        infoWindow.setPosition(pos);
        infoWindow.setContent(browserHasGeolocation ?
            'Error: The Geolocation service failed.' :
            'Error: Your browser doesn\'t support geolocation.');
    }




    var town = localStorage.getItem('defaultmapCenter');
    if ((town == "") || (town == null)) {
        town = 'Stuttgart';
    }
    setCenter(town);
*/
/*
    $('#btnBack').click(function() {
        window.location = "/"+curSensor;
    });


    $('#btnHelp').click(function() {
        dialogHelp.dialog("open");
    });


    $('#btnCent').click(function() {
        infowindow.setContent("");
        infowindow.close();								// löschen
        dialogCenter.dialog("open");
    });

    $('#btnTraf').click(function() {
        var t = $('#btnTraf').text();
        if(t == "Verkehr einblenden") {
            trafficLayer.setMap(map);
            $('#btnTraf').text('Verkehr ausblenden');
        } else {
            trafficLayer.setMap(null);                    // <<<<< that doesn't work !!!
            $('#btnTraf').text('Verkehr einblenden');
        }
    });

    $('#fehlersensoren').click(function(){
        dialogFehlS.dialog("open");
    });

    let dialogFehlS = $('#dialogFehlSens').dialog({
        autoOpen: false,
        width: 800,
        title: 'Mein Sensor fehlt',
        position: {my:'center', at: 'top', of:'#map'},
        open: function() {
            $('#page-mask').css('visibility','visible');
            $(this).load('/fsdata/fehlersensoren',function() {
                $('.psensornr').html('Nr. ' + curSensor);
                explainProblem(curSensor);
                $('#fehlerliste').click(function(){
                    dialogFehlS.dialog("close");
                    dialogFehlL.dialog("open");
                });
            })
        },
        close: function() {
            $('#page-mask').css('visibility','hidden');
            $('#btnHelp').css('background','#0099cc');

        },

});

    function explainProblem(sensor) {
        let fnd = problems.values.findIndex(x => x._id == curSensor);
        if (fnd == -1)
            return;
        let fnbr = problems.values[fnd].problemNr;
        let txtnr = problems.texte.findIndex(x => x.nr == fnbr);
        let ftxt = 'Grund, warum der Sensor ' + curSensor + ' nicht angezeigt wird: <br /><b>'+
            problems.texte[txtnr].txt;
        $('#fehlerexplain').html(ftxt+'</b>');
    }

    let dialogFehlL = $('#dialogFehlList').dialog({
        autoOpen: false,
        width: 800,
        title: 'Liste Fehlerhafter Sensoren',
        position: {my:'center', at: 'top', of:'#map'},
        open: function() {
            $('#page-mask').css('visibility','visible');
            $(this).load('/fsdata/fehlerliste')
        },
        close: function() {
            $('#page-mask').css('visibility','hidden');
            $('#btnHelp').css('background','#0099cc');

        },
    });


    var dialogHelp = $('#dialogWinHelpM').dialog({
        autoOpen: false,
        width: 800,
        title: 'Info',
        position: {my:'center', at: 'top', of:'#map'},
        open: function() {
            $('#page-mask').css('visibility','visible');
            $(this).load('/fsdata/helpmap')
        },
        close: function() {
            $('#page-mask').css('visibility','hidden');
            $('#btnHelp').css('background','#0099cc');

        },
    });


    var dialogCenter = $('#dialogCenter').dialog({
        autoOpen: false,
        width: 800,
        title: 'Zentrieren',
        open: function() {
            $('#page-mask').css('visibility','visible');
            $(this).load('/fsdata/centermap', function() {
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
            },{
                text: "Abbrechen",
                click : function() {
                    dialogCenter.dialog("close");
                },
                style: "margin-right:40px;",
                width: 100,
            }
        ],
        modal: true,
        close: function() {
            $('#page-mask').css('visibility','hidden');
        },
    });

    $('.dialog').keypress(function(e) {
        if (e.keyCode == 13) {
            $('.btnOK').focus();
        }
    });


    // Listener für das Ändern des ZOOM-Level:
	// Wenn der Zoom-Level > 15 wird, dann die Säulen abh. vom Level in der Dicke anpassen
    map.addListener('zoom_changed', function() {
        clearMarker();
    	var zl = map.getZoom();
        console.log("Zoom: ", zl);
        if (zl > 17) {
            sBreit = 60;
            for (var m = 0; m < marker.length; m++) {
                marker[m].setIcon(getBalken(marker[m].werte[0], 60, 0))
            }
        } else if (zl > 16) {
            sBreit = 50;
            for (var m = 0; m < marker.length; m++) {
                marker[m].setIcon(getBalken(marker[m].werte[0], 50, 0))
            }
        } else if (zl > 15) {
            sBreit = 40;
        	for(var m=0; m<marker.length; m++) {
        		marker[m].setIcon(getBalken(marker[m].werte[0],40,0))
			}
		} else {
            sBreit = 30;
            for(var m=0; m<marker.length; m++) {
                marker[m].setIcon(getBalken(marker[m].werte[0],30,0))
            }
		}
    });

    map.addListener('bounds_changed',function() {
        console.log("bounds changed");
        newBounds = true;
    });


    map.addListener('idle',function() {
        var info = infowindow.getContent();
        if (newBounds) {
            newBounds = false;
            boundBox = map.getBounds().toJSON();
            first = true;
            clearMarker();
//            fetchProblemSensors();
            fetchAktualData();
            fetchStuttgartBounds();
        }
        if (!((info == undefined) || (info == ""))) {
            var sid = infowindow.anchor.sensorid;
            for(var x = 0; x < marker.length; x++) {
                if (marker[x].sensorid == sid) {
                    infowindow.open(map,marker[x]);
                    break;
                }
            }
//            console.log("Info on screen >"+info+"<");
        }
    });


    //  Alle Marker neu zeichen
    function redrawMarker() {
        for (var k = 0; k < marker.length; k++) {
            marker[k].setMap(null)                                                                      // Marker löschen
            marker[k].setMap(map);                                                                      // und wieder zeichnen
        }
    }


    function setNewCenter() {
        var town = $('#newmapcenter').val();
        if ((town == "") || (town == null)) {
            town = 'Stuttgart';
        }
        setCenter(town);
        dialogCenter.dialog("close");
        $('#btnCent').css('background','#0099cc');
    }

    google.maps.event.addListener(infowindow,'closeclick',function(){
        infowindow.setContent("");
    });


    image_red = new google.maps.MarkerImage('../nuclear-red.svg',
        null,null,null, new google.maps.Size(30,30));
    image_green = new google.maps.MarkerImage('../nuclear-green.svg',
        null,null,null, new google.maps.Size(30,30));
    image_yellow = new google.maps.MarkerImage('../nuclear-yellow.svg',
        null,null,null, new google.maps.Size(30,30));
    colorRadio = [500,image_red,100,image_yellow,0,image_green,-1,'black'];


}
*/


// Umrechnung Koordinaten auf Adresse
function geocodeLatLng(latlon) {
    geocod.geocode({'location': latlon}, function(results, status) {
        if (status === google.maps.GeocoderStatus.OK) {
            for (var i =0; i<results.length; i++) {
                console.log(results[i].formatted_address)
            }
            console.log("DAS ist GUT:",results[2].formatted_address);
        } else {
            window.alert('Geocoder failed due to: ' + status);
        }
    });
}

async function getCoords(city) {
    return $.getJSON('/mapdata/getcoord', {city: city})
        .fail((jqxhr, textStatus, error) => null )
        .done(docs => docs);
}

// Map auf Stadt setzen
async function setCenter(adr) {
    let data = await getCoords(adr);
    map.setView([parseFloat(data.lat), parseFloat(data.lon)]);
    console.log(data);
}


// Aktuelle Daten vom Server holen
function fetchAktualData(box) {
    let bnds = null;
    if(box != null) {
        bnds = [
            [box.getWest(), box.getSouth()],
            [box.getEast(), box.getNorth()]
        ];
    }
    return $.getJSON('/mapdata/getaktdata', {start:startDay, box:bnds})
        .fail((jqxhr, textStatus, error) => {
            alert("fetchAktualData: Fehler  " + error);						// if error, show it
        })
        .done(docs => docs);
}

/*
// Show the last date below tha map grafics
function showLastDate(dt) {
    var ld = moment(dt);
    $("#mapdate").html("Werte von " + ld.format('YYYY-MM-DD HH:mm'));
}
*/

function fetchStuttgartBounds() {
    let points = [];
    $.ajax({
        type: "GET",
        url: "/mapdata/getStuttgart",
        dataType: "xml",
        success: function(xml) {
            $(xml).find("rtept").each(function() {
                var lat = parseFloat($(this).attr("lat"));
                var lon = parseFloat($(this).attr("lon"));
                var p = [lat,lon];
                points.push(p);
            });
            L.polyline(points).addTo(map);
        }
    });
}

/*
// die Marker erzeugen
// Übergabe
//		data		aktuelle Daten vom Server
function buildMarkers(data) {
    let centerMarker = -1;
    var lold = 0.0;												// Merke für den Längengrad
//    clearMarker();
    marker = [];
    for (var j=0,x=0; x <data.length; x++) {                        // alle daten durchgehen
        var item = data[x];
//        if(item.value10 == -5) {
//            continue;
//        }
        // Wenn der Sensor in der Problem-Datenbank ist, dann
        // diesen Sensor auslassen
//         if(!allMap) {
//             let fnd = problems.values.findIndex(x => x._id == item.id);
//             if (fnd != -1) {
//                 // Problem Nr. 8 und 5 mal ausklammern
//                 if(item.id == 140) {
//                     print("140");
//                 }
//                 if (!((problems.values[fnd].problemNr == 8) || (problems.values[fnd].problemNr == 5))) {
//                     continue;
//                 }
// //            }
//             }
//         }
        var offset = 0;											// deault Offset ist 0
        if (item.location[0] == lold ) {					            // Wenn Marker auf gleicher Lönge liegen, dann
            offset = 10;											// enen neuen etwas nach rechts verscheiben
        }
        lold = item.location[0];							            // und die Länge merken

        let image;
        for (let c=0; c<=colorRadio.length; c+=2) {					// Farbzuordnung anhand der
            if (item.cpm >= colorRadio[c]) {							// Tafel bestimmen
                image = colorRadio[c + 1];
                break;
            }
        }


        // let image = {
        //     url: "http://localhost:3005/mapdata/getIcon/"+color,
        //     size: new google.maps.Size(50, 50),
        // };


        var oneMarker = new google.maps.Marker({				// Marker-Objekt erzeugen
            position: new google.maps.LatLng(item.location[1],item.location[0]), // mit den Koordinaten aus den daten
            icon: image,
//            icon: getBalken(item.cpm,sBreit,offset),			// die Säule dazu
//            werte: [item.value10, item.value25],				// auch die Werte mit speichern
            werte: [item.cpm],	                    			// auch die Werte mit speichern
            sensorid: item.id,						        	// und auch die Sensor-Nummer
            url: '/'+item.id,		    						// URL zum Aufruf der Grafik
            latlon:  {lat: parseFloat(item.location[1]), lng: parseFloat(item.location[0])}, // und extra nocmla die
            // Koordinaten
            offset: offset,
        });
//         if(curSensor == item.id) {
//             oneMarker.icon.fillColor = 'white';
//             oneMarker.icon.fillOpacity = 0.7;
// //            oneMarker.ZIndex = 100;
//             centerMarker = j;
//         }
        marker[j] = oneMarker;									// diesen Marker in das Array einfogen
//        removeOneMarker(x);
        // Click event an den Marker binden. Wenn geklickt wird, dann ein
        // Info-Window mit den Werte aufpoppen lassen.
        google.maps.event.addListener(marker[j], 'click', function () {
            if(this.werte[0]  < 0) {
                var seit = (this.werte[0] == -2) ? 'Woche' : 'Stunde';
                var infoContent = '<div id="infoTitle"><h4>Sensor: ' + this.sensorid + '</h4>' +
                    '<div id="infoTable">' +
                    '<table><tr>' +
                    '<td>Dieser Sensor hat seit mind. </td>' +
                    '</tr><tr>' +
                    '<td>1 ' + seit + ' keinen Wert gemeldet</td>' +
                    '</tr></table>' +
                    '</div>' +
                    '</div>';
            } else {
                var infoContent = '<div id="infoTitle"><h4>Sensor: ' + this.sensorid + '</h4>' +
                    '<div id="infoTable">' +
                    '<table><tr>' +
                    '<td>cpm</td><td>' + this.werte[0] + '</td>' +
                    '</tr></table>' +
                    '</div>' +
                    '<div id="infoHref">' +
                    '<a href=' + this.url + '>Grafik anzeigen</a>' +
                    '</div>' +
                    '</div>';
            }
            if (infowindow.getContent() != "") {				// ein schon offenes InfoWindow
                infowindow.close();								// löschen
            }													// und das Neue mit den Werten
            infowindow.setContent(infoContent);
            infowindow.open(map, this);							// am Marker anzeigen
            geocodeLatLng(this.latlon);
        });
        if(j != centerMarker) {
            marker[j].setMap(map);									// dann  hin zeichnen
        }
        j++;
    }
    if(centerMarker >= 0) {
        marker[centerMarker].setMap(map);
        marker[centerMarker].setZIndex(200);
    }
}
*/


// Mit dem Array 'mongoPoints' aus der properties-Datenbank ALLe Sensor-IDs holen,
// die innerhalb (d.h. in Stuttgart) liegen.
function findStuttgartSensors() {
    let mp = JSON.stringify(mongoPoints);
    $.get('/mapdata/regionSensors', {points : mp }, function (data1, err) {	// JSON-Daten vom Server holen
        if (err != 'success') {
            alert("Fehler <br />" + err);						// ggf. fehler melden
        } else {
            console.log('Stuttgarter Sensoren:',data1);
            let se = JSON.stringify(data1);
            $.get('/mapdata/storeSensors', { sensors: se  }, function(d,e) {
                if(e != 'success') {
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
    let p = new Promise(function(resolve,reject){
//    let url = 'https://feinstaub.rexfue.de/api/getprops?sensorid='+csens;
    let url = '/api/getprops?sensorid='+csens;
    $.get(url, (data,err) => {
            if (err != 'success') {
                resolve({lat: 48.784373, lng: 9.182});
            } else {
//                console.log(data);
                if (data.values.length == 0) {
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

var dialogError = $('#errorDialog').dialog({
    autoOpen: false,
    width: 300,
    position: {my:'center', at: 'top+100px', of:window},
    open: function() {
        $('#page-mask').css('visibility','visible');
    },
    close: function() {
        $('#page-mask').css('visibility','hidden');
        $('#btnHelp').css('background','#0099cc');
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
    dialogError.dialog("open");
}


function showGrafik(sid) {
    $('#overlay').show();
    doPlot('oneday','');
}
