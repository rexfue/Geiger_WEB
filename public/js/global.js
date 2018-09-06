//DOM is ready
"use strict";

$(document).ready(function() {
	
	var TOPIC_SDS = "SDS011",
		TOPIC_DHT = "DHT22",
		TOPIC_BMP = "BMP180";
	
	
	// Defaults für die Mittelwertbildungen
	var AVG_DUST = 59,						// 30 minutes moving average for dust particles
		AVG_TEMPHUM = 9,					// 10 minutes moving average for temperature and humidity	
		AVG_PRESS = 9;						// 10 minutes moving average for pressure
	
	var ALTITUDE = 270;						// Höhe über NN in m
	
	var MAXBARS = 30;						// max bars to plot on year-plot	
	var active = 'oneday';					// default: plot 1 day
	var xbreit = 24;						// 24h Breite der  x-Achs
	var lastButton = '';
	var refreshRate = 5;                    // Grafik so oft auffrischen (in Minuten)
	var habBMP = false;
	var txtMeldung = false;					// falls keine Daten da sind, Text melden
	var korrelation = {};
	var kopf = 'Feinstaub- und Klima-Werte  ';
	var oldestDate = "01-01-2016";			// oldest date in dbase
	var avgTime = 30;						// defaul average time für particulate matter
	var avgTable = [15,30,60,120];
	var globMaxY = null;					// max Y für Feinstaub
	var specialDate = "";					// extra for 'Silvester'
	var doUpdate = true;					// update every 5 min
    var fstAlarm = false;					// if true then is 'Feinstaubalarm' in Stuttgart
	var showscatter = true;				// show lines, no scatter
	var logyaxis = true;					// y-Axis logatithmic

	// Variable selName is defined via index.js and index.pug
	if (typeof selName == 'undefined') {
		return;
	}

    var extAddr = false;
	if (!((typeof parm == 'undefined') || (parm == ""))) {
	    extAddr = true;
    }

    var startDay = "";
	if(!((typeof startday == 'undefined') || (startday == ""))) {
		if(startday == "Silvester") {
			specialDate = "silvester17";
			startDay = "2017-12-31T11:00:00Z";
		} else {
            startDay = startday;
        }
	}

//	moment.locale('de', {
//        months : 'Januar_Februar_März_April_Mai_Juni_Juli_August_September_Oktober_November_Dezember'.split('_'),
//	});
//	let datumtxt = 'Anzeige für: ' + (startDay == "" ? 'heute' : moment(startDay).format("D.MMMM YYYY"));
//
//    $('#datumtxt').text(datumtxt);

//	localStorage.clear();       // <-- *************************************************************

    var dialogYmax = $('#dialogymax').dialog({
        autoOpen: false,
        title: 'yMax anpassen',
		open: function() {
        	$(this).load('/fsdata/ymax',function() {
				let chart = $('#placeholderFS_1').highcharts();
				let axisMax = chart.yAxis[0].max;
				$('#newymax').attr('placeholder',axisMax);
				$('#newymax').focus();
			})
		},
        buttons:  [
            {
                text: "OK",
                class: "btnOK",
                click: setnewymax,
                width: 100,
            }]
    });


	function setnewymax() {
		let max = $('#newymax').val();
		if((max != "") && ((max < 50) || (max > 2000))) {
            $('#newymax').append('<br /><span id="invalid">Ungültiger Wert</span>');
        } else {
			if (max == "") max = null;
			console.log("Neur Wert = ",max)
			dialogYmax.dialog('close');
			globMaxY = max;
			doPlot('oneday',startDay);
            doPlot('oneweek', startDay);						// Start with plotting one day from now on
		}
	}

    function saveSettings() {
        let avg = $('#average').val();
        localStorage.setItem('averageTime', avg);
        let scatter =  $('#scatter').is(':checked')
        localStorage.setItem('showScatter',scatter);
        console.log('logInput:', $('input[name="logy"]:checked').val());
        let logar =   $('#log').is(':checked');
        localStorage.setItem('logYaxis',logar);
        if ((avgTime != parseInt(avg)) || (scatter != showscatter) || (logar != logyaxis)) {
            avgTime = parseInt(avg);
            showscatter = scatter;
            logyaxis = logar;
            doPlot('oneday', startDay);						// Start with plotting one day from now on
            doPlot('oneweek', startDay);						// Start with plotting one day from now on
            doPlot('onemonth', startDay);						// Start with plotting one day from now on
            switchPlot(active);
        }
        dialogSet.dialog('close');
    }

    // Dialog für das Einstell-Menü
    var dialogSet = $('#dialogWinSet').dialog({
        autoOpen: false,
        width: 400,
        title: 'Einstellungen',
        open:
            function() {
                $('#page-mask').css('visibility', 'visible');
                $(this).load('/fsdata/setting', function () {
                    if(showscatter) {
                        $('#scatter').prop("checked", true).trigger("click");
                    } else {
                        $('#lines').prop("checked", true).trigger("click");
                    }
                    console.log("LogAxis:", logyaxis);
                    if(logyaxis) {
                        $('#log').prop("checked", true).trigger("click");
                    } else {
                        $('#linear').prop("checked", true).trigger("click");
                    }
                    //$("#radio_1").is(":checked")
                    console.log('logInputDialog:', $('#log').is(':checked'));

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
        width: 750,
        title: 'Info',
		position: {my:'center', at: 'top+100px', of:window},
        open: function() {
            $(this).load('/fsdata/help');
        },
        close: function() {
            $('#page-mask').css('visibility','hidden');
            $('#btnHelp').css('background','#0099cc');
        },
    });

//    $.datepicker.setDefaults( $.datetimepicker.regional[ "de" ] );

    // Set new Start-Day and show chart
    function setNewDay() {
        let val = $('input:radio[name=selDates]:checked').val();
        dialogNewDay.dialog("close");
		if(val == 'today') {
			doUpdate= true;
            window.location = '/' + aktsensorid;
		} else if (val == 'silvester17') {
            doUpdate= false;
            window.location = '/'+aktsensorid+'?stday=Silvester';
		} else {
            doUpdate= false;
            const newDay = $('#selnewday').val();
            window.location = '/' + aktsensorid + '?stday=' + newDay;
		}
    }


    // let select a new start day
    var dialogNewDay = $('#dialogNewDay').dialog({
		autoOpen: false,
		width: 300,
		title:"Neuen Start-Tag/Zeit wählen",
		position: {my:'center', at: 'top+100px', of:window},
        open: function() {
            $('#page-mask').css('visibility', 'visible');
            $(this).load('/fsdata/selnewday', function () {
                $( "#selnewday" ).datetimepicker({
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
                $('input:radio[name=selDates]').change(function() {
                    if (this.value == 'frei') {
                		$('#selnewday').focus();
                    }
                });
                $('#selnewday').focus( function() {
                    $('input:radio[name=selDates][id=selfrei]').prop('checked',true);
				});
            });
        },
		buttons:  [
            {
                text: "OK",
				class: "btnOK",
                click: setNewDay,
                width: 100,
            },{
                text: "Abbrechen",
                id: "newSensorAbbr",
                click : function() {
                    dialogNewDay.dialog("close");
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



    $('#selnewday').datepicker( $.datepicker.regional[ "de" ] );

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

	function getLocalStorage() {
        // fetch the average time
        var avg = localStorage.getItem('averageTime');
        if (avg != null) {
            avgTime = parseInt(localStorage.getItem('averageTime'));
        }
        console.log('avgTime = ' + avgTime);
        let scatter = localStorage.getItem('showScatter');
        if(scatter != null) {
            showscatter = scatter=='true' ? true : false;
        }
        console.log("Scatter:", showscatter);
        let logy = localStorage.getItem('logYaxis');
        if(logy != null) {
            logyaxis = logy=='true' ? true : false;
        }
        console.log("LogYaxis:", logyaxis);
    }

	getLocalStorage();
	$('#h1name').html(kopf);

    // Die Plots für die diversen Sensoren ausführen:
	// dazu via Korrelation erst mal alle Sensor-Nummern aus der Datenbank holen
	// Danach dann die Plots der Reihe nach aufrufen
	let s1 = moment();
	$.getJSON('fsdata/getfs/korr', { sensorid: aktsensorid }, function(data,err) {				// AJAX Call
		if (err != 'success') {
			alert("Fehler <br />" + err);						// if error, show it
		} else {
			if ((data==null)||(data.length == 0)) {
//				korrelation = {'address':{},'location': {},'espid': "", 'sensors': [{'id': aktsensorid}]};
				showError(2,"No data at korrelation ", aktsensorid);
//					return -1;
			} else {
                korrelation = data;
                fstAlarm = data.alarm;
            }
			console.log("Korrelation: ",korrelation);
//            getOldestDate(aktsensorid, korrelation.sensors,function(old){
//                oldestDate = old;
//                console.log("Oldest Entry:",oldestDate);
//            });

			// save coordinates in localStorage
            localStorage.setItem('curcoord',JSON.stringify(korrelation.location[korrelation.location.length-1].loc.coordinates));

			buildHeaderline(korrelation.othersensors,korrelation.location[korrelation.location.length-1].address);
			doPlot('oneday',startDay);						// Start with plotting one day from now on
			doPlot('oneweek',startDay);								// Start with plotting one week from now on
			doPlot('onemonth');								// Start with plotting one month from now on
			switchPlot(active);

		}
    });



	function buildAverageMenue() {
		for (var i=0; i< avgTable.length; i++) {
			if(avgTime == avgTable[i]) {
                var str = '<option selected="selected" value="' + avgTable[i] + '">' + avgTable[i] + '  min</option>';
			}  else {
                str = '<option value="' + avgTable[i] + '">' + avgTable[i] + '  min</option>';
            }
            $('#average').append(str);
        }
//        $('#average').selectmenu();
	}


// ************** Event-Handler **************

    $('#btnMap').click(function() {
        localStorage.setItem('currentSensor',aktsensorid);			// remember actual sensor
        window.location = "/map";
    });


    $('#btnSet').click(function() {
        dialogSet.dialog("open");
    });

    $('#btnst').click(function() {
        dialogNewDay.dialog("open");
    });


    $('#btnHelp').click(function() {
        dialogHelp.dialog("open");
    });

    // Clicking one of the buttons
	$('.btn').click(function() {
		var button = $(this).val(); 		// fetch the clicked button
        if(button == 'month') {
            $('#btnst').hide();
        } else {
            $('#btnst').show();
        }
		active = 'one'+button;
		switchPlot(active);								// gewählten Plot aktivieren
	});

 //   $('#btnssel').click(function() {
 //       dialogNewSensor.dialog("open");
 //   });

	$('#ssel').keypress(function(event) {
		if(event.which == 13) {
            var newSens = $('#ssel').val();
            checkSensorNr(newSens, function (erg,data) {
                if (erg) {
                	window.location = '/' + newSens;
                } else {
                    showError(2, "", newSens);
                }
            });
		}
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

	// Aus der Datenbank für den Sensor das älteste datum holen und übergeben
	function getOldestDate(sid, sensors, callback) {
		var sname = "";
		for (var i=0; i<sensors.length; i++) {
			if(sensors[i].id == sid) {
				sname = sensors[i].name;
				break;
			}
		}
		$.getJSON('fsdata/getfs/oldest', {sensorid:sid, sensorname:sname}, function(odate,err) {
			if(err != 'success') {
                callback("01-01-2016");
            } else {
				callback(odate.substring(0,10))
			}
		});
	}

	// Prüfen, ob die übergeben Sensornummer in der Korrelations-Tabelle enthalten ist
	// Return TRUE, wenn enthalten
	function checkSensorNr(sid, callBack) {
        $.getJSON('fsdata/getfs/korr', {sensorid: sid}, function (data, err) {				// AJAX Call
            if ((err != 'success') || (data==null)) {
                callBack(false,null);						// if error, show it
            } else {
                callBack(true,data);
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
		if(fstAlarm) {
			$('#alarm').css('display', 'inline');
		} else {
            $('#alarm').css('display', 'none');
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
            $('#h1uhr').html(d.format('HH:mm'));
            $('#subtitle').html(d.format('YYYY-MM-DD'));		// dann zeit anzeigen
        }
		if (((d.minute() % refreshRate) == 0) && (d.second() == 15)) {	// alle ganzen refreshRate Minuten, 15sec danach
			console.log(refreshRate, 'Minuten um, Grafik wird erneuert');
			if ((aktsensorid != 'map') && (doUpdate == true)) {	// Wenn nicht die Karte, dann
				doPlot('oneday',startDay);						// Tages- und
				doPlot('oneweek',startDay);						// Wochenplot erneuern
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
		var idx;
		var count = sensors.length;
		if(count > 0) {
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
            $('#h1name').html($('#h1name').html() + "&nbsp; &nbsp; Sensor-Nr: ");
			$('#ssel').val(aktsensorid);
        }
        console.log(addr);
		var adtxt = '';
		if(!((addr == undefined) || (addr == {}))) {
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


	function showError(err,txt,id) {
	    console.log("*** Fehler: " + txt + " from id " + id);
	    let errtxt = "";
	    if (err == 1) {
	    	errtxt = "Dieser Sensor (" + id + ") liefert keine aktuellen Daten!";
		} else if (err == 2) {
	    	errtxt = "Sensor Nr. " + id + " existiert nicht in der Datenbank";
		}
		$('#errorDialog').text(errtxt);
		dialogError.dialog("open");
    }

    function showNewDate() {
        moment.locale('de', {
            months: 'Januar_Februar_März_April_Mai_Juni_Juli_August_September_Oktober_November_Dezember'.split('_'),
        });
        if(startDay != '') {
            let datumtxt = '<span style="color:blue">Anzeige für: ' +  moment(startDay).format("D.MMMM YYYY")+'</span>';
            $('#datumtxt').html(datumtxt);
        }
    }



    function startPlot(what,d1,d2,sensor,start,live) {
		var name = sensor.name;
		if((name.startsWith("SDS")) || (name.startsWith("PMS")) || (name.startsWith("PPD"))) {
            if ((what == 'oneyear') || (what == 'onemonth')) {						    // gleich plotten
                PlotYearfs(what, d1, sensor,live);
				showNewDate();
            } else {
                PlotItfs(what, d1, sensor,start,live);
            }
        } else {
            if((what == 'oneyear') || (what == 'onemonth')) {
                PlotYearTHP(what,d1,d2,sensor,live);
            } else {
                PlotItTHP(what, d1,d2,sensor,start,live)
            }
		}
    }


    //	doPlot
	//	Fetch relevant data from the server and plot it

	function doPlot(what,start) {								// if 'start' not defined,
//		console.log("doPlot");
		let s2=moment();
		habBMP = false;
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
		var d1, d2=null, d3=null;
		var url = '/fsdata/getfs/'+what;
		var count = korrelation.othersensors.length;			// Anzahl der Sensoren
//		var korridx = 0;
		console.log(aktsensorid, korrelation);

		// find aktsensor in korrelation.othersensors
        let korridx = korrelation.othersensors.findIndex( function(x) {
        	return x.sid == aktsensorid;
        });
        korridx &= 0xFFFE;

//		for(korridx=0; korridx<count; korridx++) {
//			if (aktsensorid == korrelation.othersensors[korridx].sid) {
//				break;
//           }
//		}
                // *********************  Chekc aktsensorid, ob die in korrelations ist, wenn ja, mit diesem Index anfangen

		let location = korrelation.location[korrelation.location.length-1];
        var currentSensor = korrelation.othersensors[korridx];
		var callopts = {
			start: st.toJSON(),
			sensorid: currentSensor.sid,
			sensorname: currentSensor.name,
			avgTime: avgTime,
			live:live,
			altitude: location.altitude,
			special: specialDate,
		};
		$.getJSON(url, callopts, function(data1,err) {				// AJAX Call
			if(err != 'success') {
				alert("Fehler <br />" + err);						// if error, show it
			} else {
                console.log(moment().format() + " --> " +data1.docs.length + " Daten gekommen für " + callopts.sensorname + ' bei ' + what)
				console.log("Zeit dafür:",moment()-s2);
//			    if (data1.docs.length == 0) {
//                    showError(1,"No data at " + what, aktsensorid);
//                }
				startPlot(what,data1,null,currentSensor,st,live);

                korridx++;
                if (korrelation.othersensors[korridx] == undefined) {
                    return;
                }
                currentSensor = korrelation.othersensors[korridx];
				callopts.sensorname = currentSensor.name;
				callopts.sensorid = currentSensor.sid;
				callopts.avgTime = 10;								// 10min Average
				let s3=moment();
                $.getJSON(url,callopts, function(data2,err) {		// AJAX Call
                    if (err != 'success') {
                        alert("Fehler <br />" + err);				// if error, show it
                    } else {
                        d2 = data2;
                        console.log(moment().format() + " --> " + data2.docs.length + " Daten gekommen für " + callopts.sensorname + ' bei ' + what)
						console.log("Zeit dafür:",moment()-s3);
/*                        korridx++;
                        if (!((korridx == count) || (count >= 3))) {
	                        currentSensor = korrelation.othersensors[korridx];
							callopts.sensorname = currentSensor.name;
							callopts.sensorid = currentSensor.sid;

							$.getJSON(url, callopts, function (data3, err) {		// AJAX Call
                                if (err != 'success') {
                                    alert("Fehler <br />" + err);				// if error, show it
                                } else {
                                    d3 = data3;
                                    startPlot(what,d2,d3,currentSensor,st,live);
                                }
                            });
                        } else {
*/                        	startPlot(what,d2,null,currentSensor,st,live);
//                        }
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
				height: 400,
				width: 1000,
				spacingRight: 20,
				spacingLeft: 20,
				spacingTop: 25,
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
						x: -900,
						y: 350,
					},
					relativeTo: 'chart'
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
				style: {"fontSize":"25px"},
				useHTML: true,
			},
            subtitle: {
			    text: 'Gemessene Werte und '+ avgTime +'min-gleitende Mittelwerte',
                align: 'left',
            },
			tooltip: {
				valueDecimals: 1,
				backgroundColor: 0,
				borderWidth: 0,
				borderRadius: 0,
				useHTML: true,
				formatter: function () {
					return '<div style="border: 2px solid ' + this.point.color + '; padding: 3px;">'+
						moment(this.x).format("DD.MMM  HH:mm:ss") + '<br />' +
						'<span style="color: ' + this.point.color + '">&#9679;&nbsp;</span>' +
						this.series.name + ':&nbsp; <b>' +
						Highcharts.numberFormat(this.y,1) +
						'</b></div>';
				}
			},
			xAxis: {
				type: 'datetime',
				title: {
					text: 'Uhrzeit',
				},
                gridLineWidth: 2,
                labels : {
                    formatter : function() {
                        let v = this.axis.defaultLabelFormatter.call(this);
                        if (v.indexOf(':') == -1) {
                            return "<span style='font-weight:bold;color:red'>"+v+"<span>";
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

    function addSensorID2chart(chart, sensor) {
        var sens = chart.renderer.label(
            'Sensor: ' + sensor.sid + ' - ' + sensor.name,
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


    // Plot Feinstaub
	var PlotItfs = function(what, datas, sensor,start,live) {

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
		var tempa=[],huma=[];
		var p1m24,p2m24,tempm24,hunm24,pewssm24;

		// Put values into the arrays
		var cnt=0;
		var data = datas.docs;

		$.each(data, function(i){
			var dat = moment(this.date).valueOf();	// retrieve the date

			if(what == 'oneweek') {
                series1.push([ dat, this.P10 ]);			// put data and value into series array
                series2.push([ dat, this.P2_5 ]);
                series3.push([ dat, this.P10_mav ]);			// put data and value into series array
                series4.push([ dat, this.P2_5_mav ]);
			} else {
				series1.push([ dat, this.P10 ]);			// put data and value into series array
				series2.push([ dat, this.P2_5 ]);
				series3.push([ dat, this.P10_mav]);
				series4.push([ dat, this.P2_5_mav]);
//				series5.push([ dat, this.P10_med]);
//				series6.push([ dat, this.P2_5_med]);
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
				color: '#00CCFF',
				zIndex:3,
				marker: {
					enabled: false,
					symbol: 'square',
				},
				visible: true,
//                type: 'spline',
		};

		var series_P2_5 ={
				name: 'P2.5',
				data: series2,
				color: '#00CC00',
				zIndex:3,
				marker: {
					enabled: false,
					symbol: 'square',
				},
				visible: true,
		};
		
		var series_P10_m = {
				name: 'P10_Mittelwert',
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
				name: 'P2.5_Mittelwert',
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
				name: 'P10_Mittelwert_K',
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
				name: 'P2.5_Mittelwert_K',
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
				name: 'P2.5_Median',
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
				name: 'P2.5_Median',
				data: series6,
				color: '#006400',
				zIndex:4,
				marker: {
					enabled: false,
					symbol: 'square',
				},
				visible: true,
		};

		var series_P10_sc = {
			name: 'P10',
			data: series1,
//			color: '#00CCFF',
            color: '#ABCFFF',
			zIndex:3,
			marker: {
				enabled: true,
				radius: 2,
			},
			visible: true,
			type: 'scatter',
		};

		var series_P2_5_sc ={
			name: 'P2.5',
			data: series2,
//			color: '#00CC00',
            color: '#3FFF70',
			zIndex:3,
			marker: {
				enabled: true,
				radius: 2,
			},
			visible: true,
			type: 'scatter',
		};

		// Check for maxP10/P2_5
		let maxY=50;
		if (globMaxY == null) {
            if ((datas.maxima !== undefined) && (datas.maxima.P10_max > 50)) {
                maxY = null;
            }
		} else {
			maxY = globMaxY;
		}

        var labelText =  (datas.docs.length==0)? '' : 'Grenzwert 50µg/m<sup>3</sup>';

		var yAxis_dust =  {											// 0
				opposite: true,
	            type: logyaxis == true ? 'logarithmic' : 'linear',
    	        max: logyaxis == true ? null : maxY,
        	    min: logyaxis == true ? null : 0,
				type: logyaxis == true ? 'logarithmic' : 'linear',
				title: {
					text: 'Feinstaub µg/m<sup>3</sup>',
					useHTML: true,
                    events: {
					    click: function() {
                            dialogYmax.dialog('open');
					    }
				    },
				},
//				tickAmount: 9,
				gridLineColor: '#A2A6A4', // 'lightgray',
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
			options.series[0] = series_P10_m;
			options.series[1] = series_P2_5_m;
            if(showscatter) {
                options.series[2] = series_P10_sc;
                options.series[3] = series_P2_5_sc;
            } else {
                options.series[2] = series_P10;
                options.series[3] = series_P2_5;
            }
//            var dlt = moment();
  			var dlt = start.clone();
  			if(live) {
                options.xAxis.max = dlt.valueOf();
                dlt.subtract(1, 'd');
                options.xAxis.min = dlt.valueOf();
            } else {
  				if(specialDate == 'silvester17') {
  					dlt = moment("2017-12-31T11:00:00Z");
				}
                options.xAxis.min = dlt.valueOf();
                dlt.add(1, 'd');
                options.xAxis.max = dlt.valueOf();
			}
		} else if (what == 'oneweek'){
            options.series[0] = series_P10_m;
            options.series[1] = series_P2_5_m;
            if(showscatter) {
                options.series[2] = series_P10_sc;
                options.series[3] = series_P2_5_sc;
            } else {
                options.series[2] = series_P10;
                options.series[3] = series_P2_5;
            }
//			options.series[0] = series_P10_m;
//			options.series[1] = series_P2_5_m;
			options.title.text = 'Feinstaub über 1 Woche';
			options.subtitle.text='Gemessene Werte und 24h-gleitende Mittelwerte';
			options.series[0].name = 'P10_h24';
			options.series[1].name = 'P2.5_h24';
			options.xAxis.tickInterval = 3600*6*1000;
			options.xAxis.plotBands = calcWeekends(data,false);
            options.xAxis.plotLines = calcDays(data,false);
            dlt = start.clone();
			if(live) {
                options.xAxis.max = dlt.valueOf();
                dlt.subtract(7, 'd');
                options.xAxis.min = dlt.valueOf();
            } else {
                options.xAxis.min = dlt.valueOf();
                dlt.add(7,'d');
                options.xAxis.max = dlt.valueOf();
                }
        }
        var errorTafel = '<div class="errTafel">' +
            'Fehler: <br />Sensor unbekannt <br />' +
				'<span class="errTafelsmall">Bitte einen anderen Sensor wählen</span>' +
            '</div>';

        var errorTafel_0 = '<div class="errTafel">' +
            'Fehler: <br />Der Sensor liefert keine Daten <br />' +
//            '<span class="errTafelsmall">Bitte einen anderen Sensor wählen</span>' +
            '</div>';



        if(what == 'oneweek') {
			$('#placeholderFS_2').css('margin-bottom','');
//			$('#placeholderFS_2').highcharts(options);
            Highcharts.chart($('#placeholderFS_2')[0],options, function(chart) {
            	addSensorID2chart(chart, sensor);
//                chart.yAxis[0].labelGroup.element.childNodes.forEach(function(label)
//                {
//                    label.style.cursor = "pointer";
//                    label.onclick = function(){
//                        alert('You clicked on '+this.textContent);
//                    }
//                });
			}) ;
		} else {
            $('#placeholderFS_1').css('margin-bottom','');
			Highcharts.chart($('#placeholderFS_1')[0],options,function(chart) {
				addSensorID2chart(chart,sensor);
                var text = chart.renderer.label(
                    infoTafel,
					15,
					78,'rect',0,0,true)
					.css({
						fontSize:'10pt',
						color: 'green'})
					.attr({
						zIndex: 5,
					}).add();
/*                if(datas.docs.length == 0) {
                	var labeText = "";
                    var errtext = chart.renderer.label(
                        errorTafel_0,
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
*/            });
		}
	};


	// Plot Temp/Hum/Press
	var PlotItTHP = function(what, datas, datasBMP, sensor, start,live) {

		var series1 = [];
		var series2 = [];
		var series3 = [];

		var temphum_avg = AVG_TEMPHUM;					// 10 minutes moving average for temperature and humidity
		var press_avg = AVG_PRESS;						// 10 minutes moving average for pressure

//        console.log("Plotting Temp/Feuchte ...");

		// Arrays for Berechnung der Min, Max und Mittewerte über die kompletten 24h
		var aktVal = {};

		// Put values into the arrays
		var cnt=0;
		var data = datas.docs;
		$.each(data, function(i){
			var dat = new Date(this.date).getTime();
			series1.push([dat,this.temp_mav])
			series2.push([dat,this.humi_mav]);
            series3.push([dat,this.press_mav/100]);			// put data and value into series array
 		});
		if(datasBMP != null) {
		    var dataB = datasBMP.docs;
    		$.each(dataB, function(i){
			    var dat = new Date(this.date).getTime();
			    series3.push([ dat, this.press_mav/100 ]);			// put data and value into series array
		    });
        }

        if(data.length != 0) {
            if (what == 'oneday') {
                // Aktuelle Werte speichern
                aktVal['pressak'] = null;
                let aktp = -1;
                for(let i=data.length-1; i>0; i--) {
                	if(data[i].press_mav !== undefined) {
                		aktp = data[i].press_mav;
                		break;
					}
				}
				if(aktp != -1) {
                    aktVal['pressak'] = aktp / 100;
                } else  if ((dataB !== undefined) && (dataB[0].press_mav !== undefined)) {
                    aktVal['pressak'] = dataB[dataB.length - 1].press_mav / 100;
                }
                aktVal['tempak'] = data[data.length - 1].temp_mav
                aktVal['humak'] = data[data.length - 1].humi_mav;

                // InfoTafel füllen
                var infoTafel =
                    '<table class="infoTafel"><tr >' +
                    '<th colspan="3">Aktuelle Werte</th>' +
                    '</tr><tr>' +
                    '<td>Temperatur</td><td>' + (aktVal.tempak).toFixed(1) + '</td><td>°C</td>';
                if(aktVal.humak != undefined) {
                	infoTafel +=
                    '</tr><tr>' +
                    '<td>Feuchte</td><td>' + (aktVal.humak).toFixed(0) + '</td><td>%</td>';
                }
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
			name: 'Temperatur_Mittelwert',
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
			name: 'Feuchte_Mittelwert',
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
			name: 'Luftdruck_Mittelwert',
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

		// Check min/max of temp to arrange y-axis
		let tmi = datas.minmax.temp_min;
		let tma = datas.minmax.temp_max;
		let loy=0, hiy=0;

		if (tmi < 0) {
			loy = (Math.ceil((tmi-5)/5))*5;
			hiy = loy + 50;
		} else {
			hiy = (Math.round((tma+5)/5))*5;
			loy = hiy-50;
		}
//		let lowy = tmi/5

		var yAxis_temp = {													// 1
			title: {
				text: 'Temperatur °C',
				style: {
					color: 'red'
				}
			},
			min: loy,
			max: hiy,
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
        let pmi = datas.minmax.press_min/100;
        let pma = datas.minmax.press_max/100;
        let lopy=0, hipy=0;
        if (pmi < 990) {
            lopy = (Math.ceil((pmi-5)/5))*5;
            hipy = lopy + 50;
        } else {
            hipy = (Math.floor((pma+5)/5))*5;
            lopy = hipy-50;
        }
//        let lopy = tmi/5

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
            var dlt = start.clone();
            if(live) {
                options.xAxis.max = dlt.valueOf();
                dlt.subtract(7, 'd');
                options.xAxis.min = dlt.valueOf();
            } else {
                options.xAxis.min = dlt.valueOf();
                dlt.add(7,'d');
                options.xAxis.max = dlt.valueOf();
            }
        } else {
            dlt = start.clone();
            if(live) {
                options.xAxis.max = dlt.valueOf();
                dlt.subtract(1, 'd');
                options.xAxis.min = dlt.valueOf();
            } else {
            	if(specialDate == 'silvester17') {
            		dlt = moment("2017-12-31T11:00:00Z");
				}
                options.xAxis.min = dlt.valueOf();
                dlt.add(1, 'd');
                options.xAxis.max = dlt.valueOf();
            }
		}

        var noDataTafel = '<div class="errTafel">' +
            'Für heute liegen leider keine Daten vor!<br /> Bitte den Sensor überprüfen!\' <br />' +
            '</div>';


        if(what == 'oneweek') {
            var chr = Highcharts.chart($('#placeholderTHP_2')[0],options,function(chart) {
                addSensorID2chart(chart, sensor);
            }) ;
//			$('#placeholderTHP_2').highcharts(options);
		} else {
            chr = Highcharts.chart($('#placeholderTHP_1')[0],options,function(chart) {
                addSensorID2chart(chart, sensor);
                var text = chart.renderer.label(
                    infoTafel,
                    15,
                    78,'rect',0,0,true)
                    .css({
                        fontSize:'10pt',
                        color: 'green'})
                    .attr({
                        zIndex: 5,
                    }).add();
            if( txtMeldung == true) {
                var labeText = "";
                var errtext = chart.renderer.label(
                    noDataTafel,
                    250,
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
	}


	// Plot Year
	var PlotYearfs = function(what,d1,sensor,live) {
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
//		var maxP10 = Math.max(...mx);
        var maxP10 = Math.max.apply(null,mx);
        var maxy = 50;
		if(maxP10>50) maxy = null;
		var options = createGlobObtions();
        var dlt = moment();	// retrieve the date
		if (what == 'onemonth') {
	        dlt.subtract(31,'d');
		} else {
            dlt.subtract(366, 'd');
        }
		var localOptions = {
		        chart: {
		            type: 'column'
                },
				tooltip: {
                    formatter: function () {
                        return '<div style="border: 2px solid ' + this.point.color + '; padding: 3px;">'+
                            '&nbsp;&nbsp;'+moment(this.x).format("DD.MMM") + '<br />' +
                            '<span style="color: ' + this.point.color + '">&#9679;&nbsp;</span>' +
                            this.series.name + ':&nbsp; <b>' +
                            Highcharts.numberFormat(this.y,1) +
                            '</b></div>';
                    }
                },
				xAxis: {
//					tickInterval: 24*3600*1000,
                    plotBands: calcWeekends(data,true),
                    plotLines: calcDays(data,true),
					max: moment().startOf('day').subtract(1,'d').valueOf(),
        			min: dlt.valueOf(),
                    title: {
                        text: 'Datum',
                    },
                    minTickInterval: moment.duration(1, 'day').asMilliseconds(),
                    labels: {
                        formatter: function() {
                            return this.axis.defaultLabelFormatter.call(this);
                        }
                    },
                },
				yAxis:  {
						title: {
							text: 'µg/m<sup>3</sup>',
							useHTML: true,
						},
						type: logyaxis == true ? 'logarithmic' : 'linear',
						max: logyaxis == true ? null : maxy,
						min: logyaxis == true ? 1 : 0,
//						tickAmount: 9,
						opposite: true,
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
//					        	 type: 'column',
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
//					        	 type: 'column',
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
					groupPadding: 0.1,
//					pointPlacement: 'between',
//					grouping: false,
				},
			    column: {
			         pointPadding: 0,
			    //     borderWidth: 0,
			    //     groupPadding: 0,
			    //     shadow: false
			    }
			},
			title: {
                text: "Feinstaub Tagesmittelwerte",
            },
            subtitle:{
				text: 'Tagesmittelwert jeweils von 0h00 bis 23h59'
			},
		}
        options.chart.zoomType = 'x';

		$.extend(true,options,localOptions);

		// Do the PLOT
		var ch = $('#placeholderFS_3').highcharts(options);
//        ch.renderer.text("Sensor-Nr 141", 10, 10).add();
	};

	var PlotYearTHP = function(what,dat1, dat2,sensor,live) {
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
			seriesDru.push([dat,this.pressAV/100]);
		});
		if(dat2 != null) {
            var d2 = dat2.docs;
            $.each(d2, function() {
                var dat = new Date(this._id).getTime();	// retrieve the date
                seriesDru.push([dat,this.pressAV/100]);
            });
        }

		var tmin = dat1.maxima.tmin;
        var tmax = dat1.maxima.tmax;
        var title = habBMP ? "Temperatur min/max  -  Luftdruck (Tagesmittel)" :  "Temperatur min/max" ;
        var dlt = moment();	// retrieve the date
        if (what == 'onemonth') {
            dlt.subtract(33,'d');
        } else {
            dlt.subtract(366, 'd');
        }
	    var yaxisPress = {
                title: {
                    text: 'Luftdruck hPa'
                },
                gridLineColor: 'lightgray',
                min: 980,
                max: 1030,
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
            tooltip: {
                formatter: function () {
                    return '<div style="border: 2px solid ' + this.point.color + '; padding: 3px;">'+
                        '&nbsp;&nbsp;'+moment(this.x).format("DD.MMM") + '<br />' +
                        '<span style="color: ' + this.point.color + '">&#9679;&nbsp;</span>' +
                        this.series.name + ':&nbsp; <b>' +
                        Highcharts.numberFormat(this.y,1) +
                        '</b></div>';
                }
            },
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
                    min: dlt.valueOf(),
                    labels: {
                        formatter: function() {
                            return this.axis.defaultLabelFormatter.call(this);
                        }
                    },
                },
                yAxis: [{
                    title: {
                        text: 'Temperatur °C'
                    },
//					min: ((Math.round(tmin/10))*10)-5,
//                    max: ((Math.round(tmax/10))*10)+5,
                    opposite: true,
                    tickAmount: 5,
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

