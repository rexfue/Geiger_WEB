//DOM is ready
$(document).ready(function() {
	
	var TOPIC_SDS = "SDS011";
		TOPIC_DHT = "DHT22",
		TOPIC_BMP = "BMP180";
	
	
	// Defaults für die Mittelwertbildungen
	var AVG_DUST = 29,						// 30 minutes moving average for dust particles
		AVG_TEMPHUM = 9,					// 10 minutes moving average for temperature and humidity	
		AVG_PRESS = 9;						// 10 minutes moving average for pressure
	
	var ALTITUDE = 270;						// Höhe über NN in m
	
	var MAXBARS = 30;						// max bars to plot on year-plot	
	var active = 'oneday';					// default: plot 1 day
	var spinnerVisible = false;
	var xbreit = 24;						// 24h Breite der  x-Achs 
	var lastButton = '';
	var refreshRate = 5;                    // Grafik so oft auffrischen (in Minuten)
	var habBMP = false;
	var txtMeldung = false;					// falls keine Daten da sind, Text melden
	var korrelation = {};
	var kopf = 'Feinstaub- und Klima-Werte  ';

	// Variable selName is defined via index.js and index.pug
	if (typeof selName == 'undefined') {
		return;
	}

    var extAddr = false;
	if (!((typeof parm == 'undefined') || (parm == ""))) {
	    extAddr = true;
    }

//	localStorage.clear();


	function saveSettings() {
		if($('#mapcenter').val() == "") {
            localStorage.setItem('defaulktmapCenter', 'Stuttgart');
        } else {
            localStorage.setItem('defaultmapCenter',$('#mapcenter').val())
		}
		dialogSet.dialog('close');
		console.log(localStorage.defaultmapCenter);
	}

	// Dialog für das Einstell-Menü
	var dialogSet = $('#dialogWinSet').dialog({
		autoOpen: false,
		width: 800,
		title: 'Einstellungen',
		open: function() {
            $('#page-mask').css('visibility','visible');
            $(this).load('/fsdata/setting', function() {
            	$('#mapcenter').focus();
			});
		},
		buttons: [
            {
                text: "Sichern",
                class: "btnOK",
                click: saveSettings,
                style: "margin-right:40px;",
                width: 100,
			},{
				text: "Abbrechen",
				click : function() {
                    dialogSet.dialog("close");
                },
                style: "margin-right:40px;",
                width: 100,
			}
			],
		modal: true,
		close: function() {
			$('#page-mask').css('visibility','hidden');
            $('#btnSet').css('background','#0099cc');
		},
	});

	var dialogHelp = $('#dialogWinHelp').dialog({
        autoOpen: false,
        width: 800,
        title: 'Info',
		position: {my:'center', at: 'top+100px', of:window},
        open: function() {
            $('#page-mask').css('visibility','visible');
            $(this).load('/fsdata/help')
        },
        close: function() {
            $('#page-mask').css('visibility','hidden');
            $('#btnHelp').css('background','#0099cc');
        },
    });


	var dialogNewSensor = $('#dialogNewSensor').dialog({
		autoOpen: false,
		width: 300,
		title:"Neue Sensor-Nr wählen",
		position: {my:'center', at: 'top+100px', of:window},
        open: function() {
            $('#page-mask').css('visibility', 'visible');
            $(this).load('/fsdata/selsensor', function () {
                $('#selsensor').focus();
            });
        },
		buttons:  [
            {
                text: "OK",
				class: "btnOK",
                click: function () {
                    var newSens = $('#selsensor').val();
                    checkSensorNr($('#selsensor').val(), function (erg) {
                        if (erg) {
                            dialogSet.dialog("close");
                            window.location = '/' + newSens;
                        } else {
                            showError(2, "", newSens);
                        }
                    });
                },
                width: 100,
            },{
                text: "Abbrechen",
                id: "newSensorAbbr",
                click : function() {
                    dialogNewSensor.dialog("close");
                },
                width: 100,
            }
        ],
    	close: function() {
        	$('#page-mask').css('visibility','hidden');
        	$('#btnHelp').css('background','#0099cc');
		},
		modal: true
	});


	var aktsensorid = selName;
	console.log('Name='+aktsensorid );

    Highcharts.setOptions({
		global: {
			useUTC: false					// Don't use UTC on the charts
		}
	});


	// change moment, so theat toJSON returns local Time
	moment.fn.toJSON = function() { return this.format(); };

	// Zeit gleich anzeigen
	showUhrzeit(true);
    setInterval(function()
    {
        showUhrzeit(false);
    },1000);								// alle Sekunde aufrufen


    if (aktsensorid == 'map') {
    	return;
	}

	$('#h1name').html(kopf);

    // Die Plots für die diversen Sensoren ausführen:
	// dazu vie Korrelation erst mal alle Sensor-Nummern aus der Datenbank
	// Danach dann die Plots der Reihe nach aufrufen
	$.getJSON('fsdata/getfs/korr', { sensorid: aktsensorid }, function(data,err) {				// AJAX Call
		if (err != 'success') {
			alert("Fehler <br />" + err);						// if error, show it
		} else {
			if (data.length == 0) {
				korrelation = {'address':{},'location': {},'espid': "", 'sensors': [{'id': aktsensorid}]};
//				showError(2,"No data at korrelation ", aktsensorid);
//					return -1;
			} else {
                korrelation = data[0];
            }
            // sort array of sensor, so that SDS are the first ones
			if (korrelation.sensors.length > 1) {
                korrelation.sensors.sort(function (a, b) {
                    if (a.name < b.name) {
                        return 1;
                    }
                    if (a.name > b.name) {
                        return -1;
                    }
                    return 0;
                });
            }
			console.log("Korrelation: ",korrelation);

			buildHeaderline(korrelation.sensors,korrelation.address);
			doPlot('oneday');						// Start with plotting one day from now on
			doPlot('oneweek');						// Start with plotting one day from now on
			doPlot('onemonth');						// Start with plotting one day from now on
			$('#spinner').hide();
			switchPlot(active);

		}
    });




// ************** Event-Handler **************
	
	// Wenn das Fenster den Focus bekommt
//	$(window).focus(function() {
//			doPlot(active);
//	});



    $('#btnMap').click(function() {
        localStorage.setItem('currentSensor',aktsensorid);			// remember actual sensor
        window.location = "/map";
    });

    /*
	$('#btnHelp').jBox("Modal",{
	 	ajax: {
		//	 url: aktsensorid == 'map' ? '/fsdata/helpmap' : '/fsdata/help',
			url: '/fsdata/help',
	 		reload: true
	 	}
	 });
*/


    $('#btnSet').click(function() {
        dialogSet.dialog("open");
    });


    $('#btnHelp').click(function() {
        dialogHelp.dialog("open");
    });

    // Clicking one of the buttons
	$('.btn').click(function() {
		var button = $(this).val(); 		// fetch the clicked button
		active = 'one'+button;
		switchPlot(active);								// gewählten Plot aktivieren
	});

    $('#btnssel').click(function() {
        dialogNewSensor.dialog("open");
    });

    $('.dialog').keypress(function(e) {
    	if (e.keyCode == 13) {
            $('.btnOK').focus();
		}
	});


// Einstellungen - Eingaben
    $('#in_mapcenter').click(function(){
        console.log($(this).val());
    });



//	*************  Functions *****************

	// Prüfen, ob die übergeben Sensornummer in der Korrelations-Tabelle enthalten ist
	// Return TRUE, wenn enthalten
	function checkSensorNr(sid, callBack) {
        $.getJSON('fsdata/getfs/korr', {sensorid: sid}, function (data, err) {				// AJAX Call
            if (err != 'success') {
                callBack(false);						// if error, show it
            } else {
                callBack(true);
            }
        });
    }

	// Umschalten der Plots
	function switchPlot(what) {
		if (what == 'oneday') {
			$('#placeholderFS_1').show();
			$('#placeholderTHP_1').show();
			$('#placeholderFS_2').hide();
			$('#placeholderTHP_2').hide();
			$('#placeholderFS_3').hide();
			$('#placeholderTHP_3').hide();
		} else if (what == 'oneweek') {
			$('#placeholderFS_1').hide();
			$('#placeholderTHP_1').hide();
			$('#placeholderFS_2').show();
			$('#placeholderTHP_2').show();
			$('#placeholderFS_3').hide();
			$('#placeholderTHP_3').hide();
		} else if ((what == 'oneyear') || (what == 'onemonth')) {
			doPlot(what);
			$('#placeholderFS_1').hide();
			$('#placeholderTHP_1').hide();
			$('#placeholderFS_2').hide();
			$('#placeholderTHP_2').hide();
			$('#placeholderFS_3').show();
			$('#placeholderTHP_3').show();
		}
	}
	
	
	/* Alle Minute die ktuelle Urzeit anzeigen und
	 * den Plot für Tages - und Wochendaten updaten.
	 * Alle 'refreshRate' plus 15sec die Grafiken neu zeichnen
	 * Die Funktion wird alle Sekunde aufgerufen !
	 */
	function showUhrzeit(sofort) {
        var d = moment()								// akt. Zeit holen
		if (sofort || (d.second() == 0)) {				// Wenn Minute grade um
            $('#h1uhr').text(d.format('HH:mm'));		// dann zeit anzeigen
        }
		if (((d.minute() % refreshRate) == 0) && (d.second() == 15)) {	// alle ganzen refreshRate Minuten, 15sec danach
			console.log(refreshRate, 'Minuten um, Grafik wird erneuert');
			if (aktsensorid != 'map') {					// Wenn nicht die Karte, dann
				doPlot('oneday');						// Tages- und
				doPlot('oneweek');						// Wochenplot erneuern
			}
			else {
				fetchAktualData();
			}
        }
    }


    function roundx(value, digits) {
		var mul = 1;
		for (var i=0; i<digits; i++) {
			mul *= 10;
		}
		value *= mul;
		value = Math.round(value);
		return(value * 1.0 / mul); 
	}

	// Sensornummer und Name und Adresse oben mit eintragen
	function buildHeaderline(sensors,addr) {
		if(sensors.length > 0) {
            var hl = 'Sensoren: ';
            for (var i in sensors) {
                hl += sensors[i].id + "-" + sensors[i].name + " / ";
            }
            hl = hl.slice(0, -2);
            $('#subtitle').html(hl);
            //		$('#h1name').html($('#h1name').html()+"&nbsp; &nbsp; Sensor-Nr: " + sensors[0].id);
            $('#h1name').html($('#h1name').html() + "&nbsp; &nbsp; Sensor-Nr: ");
            $('#btnssel').html(sensors[0].id);
        }
        console.log(addr);
		adtxt = '';
		if(addr != {}) {
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


	// Berechnung des barometrischen Druckes auf Seehöhe
	//
	// Formel (lt. WikiPedia):
	//
	//  p[0] = p[h] * ((T[h] / (T[h] + 0,0065 * h) ) ^-5.255)
	//
	//  mit
	//		p[0]	Druck auf NN (in hPa)
	//		p[h]	gemessener Druck auf Höhe h (in m)
	//		T[h]	gemessene Temperatur auf Höhe h in K (== t+273,15)
	//		h		Höhe über NN in m
	//
	//  press	->	aktuelle Druck am Ort
	//	temp	->	aktuelle Temperatur
	//  alti	-> Höhe über NN im m
	//
	//	Rückgabe: normierter Druck auf Sehhhöhe
	//	
	function calcSealevelPressure(press,temp) {
		var alti = korrelation.location.altitude;
		if (alti == 0) {
			return(press);
		}
		var Th = temp + 273.15;
		var divisor = Th + (0.0065 * alti);
		var quotient = Th / divisor;
		var power = Math.pow(quotient, -5.255);
		var p0 = press * power;
		return p0
	}


	function showError(err,txt,id) {
	    console.log("*** Fehler: " + txt + " from id " + id);
	    var errtxt = "*** Fehler: ";
	    if (err == 1) {
	    	errtxt += "Dieser Sensor (" + id + ") liefert keine aktuellen Daten!";
		} else if (err == 2) {
	    	errtxt += "Sensor Nr. " + id + " existiert nicht in der Datenbank";
		}
	    alert(errtxt);
    }


    function getDataFromDB(url,start,count)
    {
        const promise = new Promise((resolve, reject) => {
                var currentSensor = korrelation.sensors[count];
        var callopts = {start: start.toJSON(), sensorid: currentSensor.id, sensorname: currentSensor.name};
        $.getJSON(url, callopts, function (data1, err) {				// AJAX Call
            if (err != 'success') {
                reject(err);
            }
            console.log(moment().format() + " --> " + data1.docs.length + " Daten gekommen für " + callopts.sensorname + ' bei ' + url)
            if (data1.docs.length == 0) {
                reject("No Data");
            }
            resolve(data1);
        });
    })
        ;
        return promise;
    }


    //	doPlot
//	Fetch relevant data from the server and plot it

	function doPlot(what,start) {								// if 'start' not defined,
//		console.log("doPlot");
		habBMP = false;
		if (start === undefined) {
			start = moment();									// then star 'now'
		}
		var d1, d2=null, d3=null;
		var url = '/fsdata/getfs/'+what;
		var count = korrelation.sensors.length;				// Anzahl der Sensoren
		var currentSensor = korrelation.sensors[0];

		var callopts = {start: start.toJSON(), sensorid: currentSensor.id, sensorname: currentSensor.name};
		$.getJSON(url, callopts, function(data1,err) {				// AJAX Call
			if(err != 'success') {
				alert("Fehler <br />" + err);						// if error, show it
			} else {
                console.log(moment().format() + " --> " +data1.docs.length + " Daten gekommen für " + callopts.sensorname + ' bei ' + what)
//			    if (data1.docs.length == 0) {
//                    showError(1,"No data at " + what, aktsensorid);
//                }
                if((what == 'oneyear') || (what == 'onemonth')) {						    // gleich plotten
                    PlotYearfs (what,data1);
                } else {
                    PlotItfs(what, data1);
                }

                count = count -1
                if (count == 0) {
                    return;
                }

                currentSensor = korrelation.sensors[1];
				callopts.sensorname = currentSensor.name;
				callopts.sensorid = currentSensor.id;
                $.getJSON(url,callopts, function(data2,err) {		// AJAX Call
                    if (err != 'success') {
                        alert("Fehler <br />" + err);				// if error, show it
                    } else {
                        d2 = data2;
                        console.log(moment().format() + " --> " + data2.docs.length + " Daten gekommen für " + callopts.sensorname + ' bei ' + what)

                        count = count - 1
                        if (count != 0) {
	                        currentSensor = korrelation.sensors[2];
							callopts.sensorname = currentSensor.name;
							callopts.sensorid = currentSensor.id;

							$.getJSON(url, callopts, function (data3, err) {		// AJAX Call
                                if (err != 'success') {
                                    alert("Fehler <br />" + err);				// if error, show it
                                } else {
                                    d3 = data3;
                                    if((what == 'oneyear') || (what == 'onemonth')) {
                                        PlotYearTHP(what,d2,d3);
                                    } else {
                                        PlotItTHP(what, d2,d3)
                                    }
                                }
                            });
                        } else {
                            if((what == 'oneyear') || (what == 'onemonth')) {
                                PlotYearTHP(what,d2,null);
                            } else {
                                PlotItTHP(what, d2, null)
                            }
                        }
	                }
				});
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
				height: 600,
				width: 1000,
				spacingRight: 20,
				spacingLeft: 20,
				spacingTop: 25,
				backgroundColor: {
					linearGradient: [0, 400, 0, 0],
					stops: [
						[0, '#FE6'],
						[1, '#EEE']
						]
				},
				type: 'line',
				borderWidth: '2',
			},
			title: {
				text: 'Feinstaub über 1 Tag',
				align: 'left',
				style: {"fontSize":"25px"},
			},
            subtitle: {
			    text: 'Akt.Wert und 30min-gleitender Mittelwert',
                align: 'left',
            },
			tooltip: {
				valueDecimals: 2,
			},
			xAxis: {
				type: 'datetime',
				title: {
					text: 'Uhrzeit',
				},
			},
			legend: {
				enabled: true,
				layout: 'horizontal',
				verticalAlign: 'top',
				borderWidth: 1,
				align: 'right',
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
	};
	return globObject;
}

    function calcWeekends(data, isyear) {
        var weekend = [];
        var oldDay = 8;
        for(var i=0; i< data.length; i++) {
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
        for (var i=0; i< data.length; i++) {
            var m = moment(data[i].date);
            if (isyear) {
                m = moment(data[i]._id);
            }
            var tag = m.day()
            if (tag != oldday) {
                m.startOf('day');
                days.push({color: 'lightgray', value: m.valueOf(), width:1, zIndex:2});
                oldday = tag;
            }
        }
        return days;
    };

	// Plot Feinstaub
	var PlotItfs = function(what, datas) {

        var series1 = [];
		var series2 = [];
		var series3 = [];
		var series4 = [];

		var series5 = [];
		var series6 = [];

		var dust_avg = AVG_DUST;						// 30 minutes moving average for dust particles

		var intoTafel = '';

//		console.log("Plotting Feinstaub ...");
		// Arrays zur Berechnung der Min, Max und Mittewerte über die kompletten 24h
		var tempa=[],huma=[],presa=[];
		var p1m24,p2m24,tempm24,hunm24,pewssm24;

		// Put values into the arrays
		var cnt=0;
		var data = datas.docs;

		$.each(data, function(i){
			var dat = moment(this.date).valueOf();	// retrieve the date

			if(what == 'oneweek') {
//				series3.push([ dat, this.avgP10_h24 ]);			// put data and value into series array
//				series4.push([ dat, this.avgP2_5_h24 ]);
                series3.push([ dat, this.P10 ]);			// put data and value into series array
                series4.push([ dat, this.P2_5 ]);
			} else {
				series1.push([ dat, this.P10 ]);			// put data and value into series array
				series2.push([ dat, this.P2_5 ]);
				series3.push([ dat, this.P10_cav]);
				series4.push([ dat, this.P2_5_cav]);
				series5.push([ dat, this.P10_med]);
				series6.push([ dat, this.P2_5_med]);
			}
		});

		if(what == 'oneday') {
			var p10 = (data.length > 0) ? data[data.length-1].P10 : "";
			var p25 = (data.length > 0) ? data[data.length-1].P2_5 : "";
			// InfoTafel füllen
			var infoTafel = '<div class="infoTafel">' +
            '<table><tr >' +
			'<th colspan="3">Aktuelle Werte</th>' +
            '</tr><tr>' +
            '<td>P10</td><td>' + p10 + '</td><td>µg/m<sup>3</sup></td>' +
            '</tr><tr>' +
            '<td>P2.5</td><td>' + p25 + '</td><td>µg/m<sup>3</sup></td>' +
            '</tr></table>' +
            '</div>';

		}

		// Plot-Options
		var options = createGlobObtions();
		var series_P10 = {
				name: 'P10',
				data: series1,
				color: '#00FFFF',
				zIndex:3,
				marker: {
					enabled: false,
					symbol: 'square',
				},
				visible: true,
		};

		var series_P2_5 ={
				name: 'P2.5',
				data: series2,
				color: '#33FF00',
				zIndex:3,
				marker: {
					enabled: false,
					symbol: 'square',
				},
				visible: true,
		};
		
		var series_P10_m = {
				name: 'P10_m'+(dust_avg+1),
				data: series3,
				color: '#0000FF',
				zIndex:4,
				marker: {
					enabled: false,
					symbol: 'square',
				},
				visible: true,
		};
		
		var series_P2_5_m = {
				name: 'P2.5_m'+(dust_avg+1),
				data: series4,
				color: '#006400',
				zIndex:5,
				marker: {
					enabled: false,
					symbol: 'square',
				},
				visible: true,
		};

		var series_P10_ca = {
				name: 'P10_cav'+(dust_avg+1),
				data: series3,
				color: '#0000FF',
				zIndex:4,
				marker: {
					enabled: false,
					symbol: 'square',
				},
				visible: true,
		};
		
		var series_P2_5_ca = {
				name: 'P2.5_cav'+(dust_avg+1),
				data: series4,
				color: '#006400',
				zIndex:5,
				marker: {
					enabled: false,
					symbol: 'square',
				},
				visible: true,
		};

		var series_P10_md = {
				name: 'P2.5_md'+(dust_avg+1),
				data: series5,
				color: '#0000FF',
				zIndex:5,
				marker: {
					enabled: false,
					symbol: 'square',
				},
				visible: true,
		};

		var series_P2_5_md = {
				name: 'P2.5_md'+(dust_avg+1),
				data: series6,
				color: '#006400',
				zIndex:4,
				marker: {
					enabled: false,
					symbol: 'square',
				},
				visible: true,
		};

		// Check for maxP10/P2_5
		var maxY = 80;
        if ((datas.maxima !== undefined) && (datas.maxima.P10_max > 70)) {
            maxY = datas.maxima.P10_max;
        }

        var labelText =  (datas.docs.length==0)? '' : 'Grenzwert 50µg/m<sup>3</sup>';

		var yAxis_dust =  {											// 0
//				opposite: true,
				title: {
					text: 'Feinstaub µg/m<sup>3</sup>',
					useHTML: true,
				},
				min: 0,
				max: maxY,
//				tickAmount: 9,
				gridLineColor: 'lightgray',
				plotLines : [{
					color: 'red', // Color value
					value: 50, // Value of where the line will appear
					width: 2, // Width of the line
					label: {
						useHTML: true,
						text : labelText,
						y: -10,
						align: 'center',
						style : { color: 'red'},
					},
					zIndex: 8,
				}],
				labels: {
					formatter: function() {
						if('50' == this.value){
							return '<span style="fill: red; font-weight:bold;">' + this.value + '</span>';
						} else {
							return this.value;
						}
					}
				},
		};


		options.series = [];
		options.yAxis = [];
		options.yAxis[0] = yAxis_dust;
		options.chart.zoomType = 'x';
		if (what == 'oneday') {
			options.series[0] = series_P10_ca;
			options.series[1] = series_P2_5_ca;
			options.series[2] = series_P10;
			options.series[3] = series_P2_5;
//			options.series[4] = series_P10_m;
//			options.series[5] = series_P2_5_m;
            var dlt = moment();
            options.xAxis.max = dlt.valueOf();
            dlt.subtract(1,'d');
            options.xAxis.min = dlt.valueOf();
		} else if (what == 'oneweek'){
			options.series[0] = series_P10_m;
			options.series[1] = series_P2_5_m;
			options.title.text = 'Feinstaub - 24h gleitende Mittelwerte über 1 Woche';
			options.subtitle.text='';
			options.series[0].name = 'P10_h24';
			options.series[1].name = 'P2.5_h24';
			options.xAxis.tickInterval = 3600*6*1000;
			options.xAxis.plotBands = calcWeekends(data,false);
            options.xAxis.plotLines = calcDays(data,false);
//            var dlt = moment(data[data.length-1].date);	// retrieve the date
			var dlt = moment();
            options.xAxis.max = dlt.valueOf();
			dlt.subtract(7,'d');
			options.xAxis.min = dlt.valueOf();
        }
        var errorTafel = '<div class="errTafel">' +
            'Fehler: <br />Sensor unbekannt <br />' +
				'<span class="errTafelsmall">Bitte einen anderen Sensor wählen</span>' +
            '</div>';



//        spinnerBox.close();
		if(what == 'oneweek') {
			$('#placeholderFS_2').css('margin-bottom','');
			$('#placeholderFS_2').highcharts(options);
		} else {
			$('#placeholderFS_1').css('margin-bottom','');
			Highcharts.chart($('#placeholderFS_1')[0],options,function(chart) {
                var text = chart.renderer.label(
                    infoTafel,
					750,
					60,'rect',0,0,true)
					.css({
						fontSize:'10pt',
						color: 'green'})
					.attr({
						zIndex: 5,
					}).add();
                if(datas.docs.length == 0) {
                	labeText = "";
                    var errtext = chart.renderer.label(
                        errorTafel,
                        350,
                        120, 'rect', 0, 0, true)
                        .css({
                            fontSize: '20pt',
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
	};


	// Plot Temp/Hum/Press
	var PlotItTHP = function(what, datas, datasBMP) {

		var series1 = [];
		var series2 = [];
		var series3 = [];

		var temphum_avg = AVG_TEMPHUM;					// 10 minutes moving average for temperature and humidity
		var press_avg = AVG_PRESS;						// 10 minutes moving average for pressure

//        console.log("Plotting Temp/Feuchte ...");

		// Arrays for Berechnung der Min, Max und Mittewerte über die kompletten 24h
		var presa=[];
		var aktVal = {};

		// Put values into the arrays
		var cnt=0;
		var data = datas.docs;
		$.each(data, function(i){
			var dat = new Date(this.date).getTime();
			series1.push([dat,this.temp_mav])
			series2.push([dat,this.humi_mav]);
            if (this.press_mav !== undefined) {
                var pr = calcSealevelPressure(this.press_mav/100,this.temp_mav);
                presa.push(pr);
                series3.push([ dat, pr ]);			// put data and value into series array
            }
 		});
		if(datasBMP != null) {
		    var dataB = datasBMP.docs;
    		$.each(dataB, function(i){
			    var dat = new Date(this.date).getTime();
			    var pr = calcSealevelPressure(this.press_mav/100,this.temp_mav);
			    presa.push(pr);
			    series3.push([ dat, pr ]);			// put data and value into series array
		    });
        }

        if(data.length != 0) {
            if (what == 'oneday') {
                // Aktuelle Werte speichern
                aktVal['pressak'] = null;
                if (data[0].press_mav !== undefined) {
                    aktVal['pressak'] = calcSealevelPressure(data[data.length - 1].press_mav / 100, data[data.length - 1].temp_mav);
                } else  if ((dataB !== undefined) && (dataB[0].press_mav !== undefined)) {
                    aktVal['pressak'] = calcSealevelPressure(dataB[dataB.length - 1].press_mav / 100, data[data.length - 1].temp_mav);
                }
                aktVal['tempak'] = data[data.length - 1].temp_mav
                aktVal['humak'] = data[data.length - 1].humi_mav;

                // InfoTafel füllen
                var infoTafel =
                    '<table class="infoTafel"><tr >' +
                    '<th colspan="3">Aktuelle Werte</th>' +
                    '</tr><tr>' +
                    '<td>Temperatur</td><td>' + (aktVal.tempak).toFixed(1) + '</td><td>°C</td>' +
                    '</tr><tr>' +
                    '<td>Feuchte</td><td>' + (aktVal.humak).toFixed(0) + '</td><td>%</td>';
                if (aktVal['pressak'] != null) {
                    infoTafel +=
                        '</tr><tr>' +
                        '<td>Luftdruck</td><td>' + (aktVal.pressak).toFixed(0) + '</td><td>hPa</td>';
                }
                infoTafel +=
                    '</tr></table>' +
                    '</div>';
            }
            txtMeldung = false;
        } else {
			txtMeldung = true;
		}


    // Plot-Options
		var options = createGlobObtions();

		var series_temp= {
			name: 'Temp_m'+(temphum_avg+1),
			data: series1,
			color: 'red',
			yAxis: 0,
			zIndex:1,
			marker: {
				enabled: false,
				symbol: 'square',
			},
			visible: true,
		};

		var series_feucht = {
			name: 'Feuchte_m'+(temphum_avg+1),
			data: series2,
			color: '#946CBD',
			yAxis: 1,
			zIndex:0,
			marker: {
				enabled: false,
				symbol: 'square',
			},
			visible: true,
		};

		var series_druck = {
			name: 'Luftdruck',
			data: series3,
			color: '#DA9E24',
			yAxis: 2,
			zIndex: 6,
			marker: {
				enabled: false,
				symbol: 'square',
			},
			visible: true,
		};


		var yAxis_temp = {													// 1
			title: {
				text: 'Temperatur °C'
			},
			min: -10,
			max: 40,
			opposite: true,
			tickAmount: 11,
		};

		var yAxis_hum = {
			title: {										// 2
				text: 'rel. Feuchte %'
			},
			min: 0,
			max: 100,
			gridLineColor: 'lightgray',
			tickAmount: 11,
		};

		var yAxis_press = {													// 3
			title: {
				text: 'Luftdruck hPa'
			},
			gridLineColor: 'lightgray',
			min: 950,
			max: 1050,
			tickAmount: 11,
		};

		var mitBMP=false;
        if((typeof dataB !== 'undefined') && (typeof dataB[0].press_mav !== 'undefined')) {
        	mitBMP=true;
        }
        if((data.length != 0) && (typeof data[0].press_mav !== 'undefined')) {
            mitBMP = true;
        }
		options.series = [];
		options.yAxis = [];
		options.series[0] = series_temp;
		options.series[1] = series_feucht;
        options.title.text = 'Temperatur und Feuchte über 1 Tag';
        options.subtitle.text = '10min - gleitende Mittelwerte';
		if (mitBMP) {
            options.series[2] = series_druck;
            options.yAxis[2] = yAxis_press;
            options.title.text = 'Temperatur / Feuchte / Luftdruck über 1 Tag';
        }
		options.yAxis[0] = yAxis_temp;
		options.yAxis[1] = yAxis_hum;
		options.chart.zoomType = 'x';
		if (what == 'oneweek'){
			options.title.text = 'Temperatur und Feuchte über 1 Woche';
            if (mitBMP) {
                options.title.text = 'Temperatur / Feuchte / Luftdruck über 1 Woche';
            }
			options.xAxis.tickInterval = 3600*6*1000;
            options.xAxis.plotBands = calcWeekends(data,false);
            options.xAxis.plotLines = calcDays(data,false);
            var dlt = moment();
            options.xAxis.max = dlt.valueOf();
            dlt.subtract(7,'d');
            options.xAxis.min = dlt.valueOf();
        } else {
            var dlt = moment();
            options.xAxis.max = dlt.valueOf();
            dlt.subtract(1,'d');
            options.xAxis.min = dlt.valueOf();
		}

		if(what == 'oneweek') {
			$('#placeholderTHP_2').highcharts(options);
		} else {
            chr = Highcharts.chart($('#placeholderTHP_1')[0],options,function(chart) {
                var text = chart.renderer.label(
                    infoTafel,
                    730,
                    60,'rect',0,0,true)
                    .css({
                        fontSize:'10pt',
                        color: 'green'})
                    .attr({
                        zIndex: 5,
                    }).add();
            });
            if( txtMeldung == true) {
                chr.renderer.text('Für heute liegen leider keine Daten vor!<br /><br /> Bitte den Sensor überprüfen!', 200, 185)
                    .css({
//                        color: '#4572A7',
                        fontSize: '20px'
                    })
                    .add();
            }
		}
	}


	// Plot Year
	var PlotYearfs = function(what,d1) {
		var series1 = [];
		var series2 = [];

		var data = d1.docs;
		var mx = [];
		if(what == 'onemonth') {
			data = data.slice(-32);							// nur einen Monat auswählen
		}
		$.each(data, function(i){
			var dat = new Date(this._id).getTime();	// retrieve the date
			series1.push([dat,this.avgP10]);
			series2.push([dat,this.avgP2_5]);
			mx.push(this.avgP10);
		});
		var maxP10 = Math.max(...mx);
		var maxy = maxP10>80 ? maxP10+10 : 80;
		var options = createGlobObtions();
        var dlt = moment();	// retrieve the date
		if (what == 'onemonth') {
	        dlt.subtract(31,'d');
		} else {
            dlt.subtract(366, 'd');
        }
		var localOptions = {
				xAxis: {
//					tickInterval: 24*3600*1000,
                    plotBands: calcWeekends(data,true),
                    plotLines: calcDays(data,true),
					max: moment().valueOf(),
        			min: dlt.valueOf()
				},
				yAxis:  {
						title: {
							text: 'µg/m<sup>3</sup>',
							useHTML: true,
						},
						max: maxy,
//						tickAmount: 9,
//						opposite: true,
						gridLineColor: 'lightgray',
						plotLines : [{
						    color: 'red', // Color value
						    value: 50, // Value of where the line will appear
						    width: 2, // Width of the line
						    label: {
						    	useHTML: true,
						    	text : 'Grenzwert 50µg/m<sup>3</sup>',
						    	y: -10,
						    	align: 'center',
						    	style : { color: 'red'},
						    },
							zIndex: 8,
						},{
                            color: 'blue', // Color value
                            value: maxP10, // Value of where the line will appear
                            width: 1, // Width of the line
                            label: {
                                useHTML: true,
                                text : 'max. Wert P10: '+ maxP10.toFixed(0) + 'µg/m<sup>3</sup>',
                                y: -10,
                                align: 'center',
                                style : { color: 'blue'},
                            },
                            zIndex: 8,
                        }],
					},
				series:  [
					         {
					        	 name: 'P10',
					        	 data: series1,
					        	 type: 'column',
					        	 color: 'blue',
//					        	 dataLabels: {
//					        		 rotation: -90,
//					        		 color: '#fff',
//					        		 enabled: true,
//					        		 format: '{y:.1f}',
//					        		 align: 'right',
//					        		 x: 0,
//					        		 y: 10,
//					        	 },
//					             pointPadding: 0.3,
					         },
					         {
					        	 name: 'P2.5',
					        	 data: series2,
					        	 type: 'column',
//								 color:'red',
//					        	 dataLabels: {
//					        		 rotation: -90,
//					        		 color: '#fff',
//					        		 enabled: true,
//					        		 format: '{y:.1f}',
//					        		 align: 'right',
//					        		 x: 0,
//					        		 y: 10,
//					        	 },
//					             pointPadding: 0.4,
					         },
					         ],
			plotOptions:  {
				series: 
				{
					animation: false,
//					pointWidth: 5,
//					groupPadding: 0.1,
					pointPlacement: 'between',
					grouping: false,
				},
			    column: {
			        pointPadding: 0,
			        borderWidth: 0,
			        groupPadding: 0,
			        shadow: false
			    }
			},
			title: {
                text: "Feinstaub Tagesmittelwerte",
            },
            subtitle:{
				text: 'Tagesmittelwert jeweils von 0h00 bis 23h59 für P10 und P2.5'
			},
		}
        options.chart.zoomType = 'x';

		$.extend(true,options,localOptions);
//		spinnerBox.close();

		// Do the PLOT
		var ch = $('#placeholderFS_3').highcharts(options);
//        ch.renderer.text("Sensor-Nr 141", 10, 10).add();
	};

	var PlotYearTHP = function(what,dat1, dat2) {
		var seriesTmx = [];
		var seriesTmi = [];
		var seriesDru = [];
		var seriesRan = [];

		var d1 = dat1.docs;
        if(what == 'onemonth') {
            d1 = d1.slice(-32);							// nur einen Monat auswählen
        }

        $.each(d1, function() {
			var dat = new Date(this._id).getTime();	// retrieve the date
			seriesTmx.push([dat, this.tempMX]);
			seriesTmi.push([dat, this.tempMI]);
			seriesRan.push([dat, this.tempMI, this.tempMX]);
			if(this.pressAV!== undefined) {
                var pr = calcSealevelPressure(this.pressAV/100,this.tempAV);
                seriesDru.push([dat,pr]);
			}
		});
		if(dat2 != null) {
            var d2 = dat2.docs;
            $.each(d2, function() {
                var dat = new Date(this._id).getTime();	// retrieve the date
                var pr = calcSealevelPressure(this.pressAV/100,this.tempAV);
                seriesDru.push([dat,pr]);
            });
        }

		var tmin = dat1.maxima.tmin;
        var tmax = dat1.maxima.tmax;
        var title = habBMP ? "Temperatur min/max  -  Luftdruck (Tagesmittel)" :  "Temperatur min/max" ;
        var dlt = moment();	// retrieve the date
        if (what == 'onemonth') {
            dlt.subtract(31,'d');
        } else {
            dlt.subtract(366, 'd');
        }
	    var yaxisPress = {
                title: {
                    text: 'Luftdruck hPa'
                },
                gridLineColor: 'lightgray',
                min: 950,
                max: 1050,
                tickAmount: 5,
            };

	    var seriesPress = 	{
            name: 'Luftdruck',
            data: seriesDru,
            yAxis: 1,
            color: '#DA9E24',
            zIndex:3,
            marker: {
                enabled: true,
                symbol: 'circle',
                radius: 2,
            },
        };
        var seriesRange =  {
            name: 'max/min Temp',
            data: seriesRan,
            type: 'arearange',
            color: '#FFDD7F',
            zIndex:0,
            showInLegend: false,
				        };

        var options = createGlobObtions();

		var opts = {
				series:[
				        {
				        	name: 'max Temp',
				        	data: seriesTmx,
				        	color: 'red',
				        	zIndex:2,
                            marker: {
                                enabled: true,
                                symbol: 'circle',
								radius: 2,
                            },
				        },
				        {
				        	name: 'min Temp',
				        	data: seriesTmi,
				        	color: 'blue',
				        	zIndex:2,
                            marker: {
                                enabled: true,
                                symbol: 'circle',
								radius: 2,
                            },
				        },
//						seriesRange,
				        ],
		        title: {
		        	useHTML: true,
					text: title,
				},
				xAxis: {
//					tickInterval: 24*3600*1000,
					title: {
						text: 'Datum',
					},
                    plotBands: calcWeekends(d1,true),
                    plotLines: calcDays(d1,true),
                    max: moment().valueOf(),
                    min: dlt.valueOf()
				},
                yAxis: [{
                    title: {
                        text: 'Temperatur °C'
                    },
//					min: ((Math.round(tmin/10))*10)-5,
//                    max: ((Math.round(tmax/10))*10)+5,
//                    opposite: true,
//                    tickAmount: 5,
                    gridLineColor: 'lightgray',
                    plotLines : [{
                        color: 'red', // Color value
                        value: tmax, // Value of where the line will appear
                        width: 1, // Width of the line
                        label: {
                            useHTML: true,
                            text : 'Höchsttemperatur ' + tmax + '°C',
                            y: -10,
                            align: 'center',
                            style : { color: 'red'},
                        },
                        zIndex: 8,
                    },
                     {
                        color: 'blue', // Color value
                        value: tmin, // Value of where the line will appear
                        width: 1, // Width of the line
                        label: {
                            useHTML: true,
                            text : 'Tiefsttemperatur ' + tmin + '°C',
                            y: 20,
                            align: 'center',
                            style : { color: 'blue'},
                        },
                        zIndex: 8,
                    }]
                }],
			};

		if (habBMP) {
		    opts.yAxis[1] = yaxisPress;
		    opts.series[2] = seriesPress;
        }

        options.subtitle.text = 'Tages-Höchst- und Tiefsttemperaturen';
        options.chart.zoomType = 'x';

		$.extend(true,options,opts);
		$('#placeholderTHP_3').highcharts(options);
	};

	
	function average(arr) {
		var sum = 0;
		for (var i = 0; i < arr.length; i++) {
			sum += arr[i];
		}
		return(sum/arr.length);
	}
	

});

