/**
 * Created by Nick Largent on 6/16/14.
 */

var https = require('https');
var fs = require('fs');
var WebSocket = require('ws');
var util = require("util");
var events = require("events");
var sha1 = require('sha1');

function StaplesConnectHub(hubID, username, password) {

    // private variables
    var UI_VERSION = "7.6.1";
    var PHP_SESSIONID = null;
    var HUB_ID = hubID;
    var TICKET = null;
    var RAS = null;
    var ws = null;
    var watchdogTimer = null;
    var hub = this;

    // public properties
    this.ready = false;
    this.devices = {};
    this.thermostats = {};
    this.rooms = {};
    this.activities = {};
    this.debounceMap = {};

    // private methods
    var log = function(text) {
        hub.emit('log_verbose', text);
    }

    var log_info = function(text) {
        hub.emit('log_info', text);
    }

    var better_split = function(str, separator, limit) {
        str = str.split(separator);

        if(str.length >= limit) {
            var ret = str.splice(0, limit-1);
            ret.push(str.join(separator));

            return ret;
        }
        return str;
    }

    var watchdogTriggered = function() {
        log("Watchdog Timeout");
        ws.close("protocol timeout");
        ws = null;
        this.emit('Disconnect', 'Timeout');
    }

    var authenticate = function(username, password, next) {
        var options = {
            hostname: 'my.staples-connect.com',
            port: 443,
            path: '/portal/api/user/auth',
            method: 'PUT',
            headers: {
                'Host': 'my.staples-connect.com',
                'Connection': 'keep-alive',
                'Content-Length': '0',
                'Cache-Control': 'max-age=0',
                'Accept': 'application/json, text/plain, */*',
                'Origin': 'https://my.staples-connect.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.153 Safari/537.36',
                'Referer': 'https://my.staples-connect.com/homecontrol/staples/',
                'Accept-Encoding': 'gzip,deflate,sdch',
                'Accept-Language': 'en-US,en;q=0.8',
                'x-zonoff-email': username,
                'x-zonoff-password': new Buffer(password).toString('base64')
            }
        };

        var req = https.request(options, function(res) {
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                if (res.statusCode == 200) {
                    var data = JSON.parse(chunk);
                    var sessid = null;
                    var cookies = res.headers['set-cookie'];
                    for (var i in cookies) {
                        var args = cookies[i].split("=");
                        if (args[0] == 'PHPSESSID') {
                            sessid = args[1].split(";")[0];
                            break;
                        }
                    }
                    next(null, sessid);
                } else {
                    log('STATUS: ' + res.statusCode);
                    log('HEADERS: ' + JSON.stringify(res.headers));
                    log('BODY: ' + chunk);
                    next("Unexpected response");
                }
            });
        });

        req.on('error', function(e) {
            next(e);
        });

        // write data to request body
        req.end();
    }

    var getTicket = function(next) {
        var options = {
            hostname: 'my.staples-connect.com',
            port: 443,
            path: '/portal/api/hub/' + HUB_ID + '/ticket',
            method: 'POST',
            headers: {
                'Host': 'my.staples-connect.com',
                'Connection': 'keep-alive',
                'Content-Length': '0',
                'Cache-Control': 'max-age=0',
                'Accept': 'application/json, text/plain, */*',
                'Origin': 'https://my.staples-connect.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.153 Safari/537.36',
                'Referer': 'https://my.staples-connect.com/homecontrol/staples/',
                'Accept-Encoding': 'gzip,deflate,sdch',
                'Accept-Language': 'en-US,en;q=0.8',
                'Cookie': 'PHPSESSID=' + PHP_SESSIONID
            }
        };

        var req = https.request(options, function(res) {
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                if (res.statusCode == 200) {
                    var data = JSON.parse(chunk);
                    log("TICKET: " + data.body.ticket);
                    log("RAS: " + data.body.ras);
                    next(null, data.body);
                } else {
                    log('STATUS: ' + res.statusCode);
                    log('HEADERS: ' + JSON.stringify(res.headers));
                    log('BODY: ' + chunk);
                    next("Unexpected response");
                }
            });
        });

        req.on('error', function(e) {
            next(e);
        });

        // write data to request body
        req.end();
    }

    var getSocketSession = function(next) {
        var options = {
            hostname: RAS,
            port: 8088,
            path: '/socket.io/1',
            method: 'GET',
            rejectUnauthorized: false,
            headers: {
                'Host': RAS,
                'Connection': 'keep-alive',
                'Content-Length': '0',
                'Cache-Control': 'max-age=0',
                'Accept': 'application/json, text/plain, */*',
                'Origin': 'https://my.staples-connect.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.153 Safari/537.36',
                'Referer': 'https://my.staples-connect.com/homecontrol/staples/',
                'Accept-Encoding': 'gzip,deflate,sdch',
                'Accept-Language': 'en-US,en;q=0.8'
            }
        };

        var req = https.request(options, function(res) {
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                if (res.statusCode == 200) {
                    var data = chunk.split(':');
                    log("SESSIONID: " + data[0]);
                    next(null, data[0]);
                } else {
                    log('STATUS: ' + res.statusCode);
                    log('HEADERS: ' + JSON.stringify(res.headers));
                    log('BODY: ' + chunk);
                    next("Unexpected response");
                }
            });
        });

        req.on('error', function(e) {
            log(e);
            next(e);
        });

        // write data to request body
        req.end();
    }

    var getConfigFilename = function() {
        return ".staples." + sha1(HUB_ID + username) + ".cache";
    }

    var loadConfig = function(next) {
        fs.readFile(getConfigFilename(), 'utf8', next);
    }



    var doInit = function(username, password, next) {

        log_info("Staples Hub Init");

        var onLoadConfig = function(err, config) {
            if (err) {
                log("config not found - authenticating");
                authenticate(username, password, onAuthenticated);
                return;
            }
            log("loading config");
            config = JSON.parse(config);
            PHP_SESSIONID = config.phpsessionid;
            getTicket(onTicket);
        }

        loadConfig(onLoadConfig); // <-- ENTRY POINT

        var onAuthenticated = function(err, sessionId) {
            if (err) {
                log_info("Error authenticating: " + err);
                next(err);
                return;
            }
            fs.writeFile(getConfigFilename(), JSON.stringify({"phpsessionid": sessionId }));
            PHP_SESSIONID = sessionId;
            getTicket(onTicket);
        }

        var onTicket = function(err, data) {
            if (err) {
                log_info("Error getting ticket: " + err);
                authenticate(username, password, onAuthenticated);
                return;
            }
            TICKET = data.ticket;
            RAS = data.ras;
            getSocketSession(onSocketSession);
        }

        var onSocketSession = function(err, wsSessionId) {
            if (err) {
                log_info("Error starting socket session: " + err);
                next(err);
                return;
            }

            ws = new WebSocket('wss://' + RAS + ':8088/socket.io/1/websocket/' + wsSessionId, {rejectUnauthorized: false});
            ws.frameCt = 1;
            ws.eventMap = {};
            watchdogTimer = setTimeout(watchdogTriggered, 30000);

            ws.sendEvent = function(msg, next) {
                this.eventMap[this.frameCt] = next;

                msg.seq = ws.frameCt;
                msg.dst = HUB_ID;

                if (msg.body)
                    msg.body = [ msg.body ];

                var frame = "5:" + this.frameCt + "+::" + JSON.stringify({"name":"message","args":[msg]});
                this.frameCt ++;
                //log("sent: " + frame);
                this.send(frame, function(error) {
                    if (error) {
                        next(error);
                    }
                });
            }

            ws.on('open', function() {
                log("Websocket Connected");
                ws.sendEvent({msg: "WebsocketAuthenticate", datatype: "WSAuthenticateType3", body: {"ticket": TICKET, "version":UI_VERSION}}, onWebsocketAuthenticate);
				//5:1+::{"name":"message","args":[{"msg":"WebsocketAuthenticate","seq":1,"datatype":"WSAuthenticateType3","dst":"A8:77:6F:00:2A:3C","body":[{"ticket":"88xsS6mph6ISQWUf59aoI8CJAZ7esmMiffSIp9irnz6ODf/lZGI0PtBvnvlOtCch","version":"7.5.1"}]}]}
            });

            ws.on('error', function(err) {
                log("websocket error");
                log(err);
                ws.close();
                ws = null;
                hub.emit('disconnect', 'Websocket error');
            });

            ws.on('close', function() {
                log("websocket disconnected");
                hub.emit('disconnect', 'Websocket closed');
            });

            ws.on('message', function(message) {
                var args = better_split(message, ":", 4);
                switch (args[0])  {
                    case "1": // CONNECT
                        break;

                    case "2":
                        //log("PING");
                        clearTimeout(watchdogTimer);
                        watchdogTimer = setTimeout(watchdogTriggered, 30000);
                        this.send("2::");
                        break;

                    case "5": // MESSAGE
                        var data = JSON.parse(args[3]);
                        switch (data.name) {
                            case "DataUpdate":
                                var body = data.args[0].body[0];
                                switch (data.args[0].datatype) {
                                    case "DeviceListType":
                                        log("DataUpdate: " + body.id + " (" + JSON.stringify(body.deviceStateDoc || body.value) + ")");
                                        hub.devices[body.id] = body;
                                        hub.emit('DataUpdate', body.id, body.deviceStateDoc || body.value);
                                        break;

                                    case "ThermostatsListType":
                                        log("Thermostat: " + body.id + " (" + JSON.stringify(body)) + ")";
                                        hub.thermostats[body.id] = body;
                                        hub.emit('ThermostatUpdate', body.id, body.ambientTemp);
                                        break;

                                    case "SystemAlertsType":
                                        log("SystemAlert" + JSON.stringify(body));
                                        var activity = hub.activities[body.message];
                                        if (activity) {
                                            var t = (new Date()).getTime();
                                            if (!hub.debounceMap[body.message] || t - hub.debounceMap[body.message] > 2000) {
                                                hub.debounceMap[body.message] = t;
                                                hub.emit('EventInitiated', activity.id);
                                            }
                                            else {
                                                log("discarding dup");
                                            }
                                        }
                                        else {
                                            hub.emit('SystemAlert', body.message);
                                        }
                                        break;

                                    case "DeviceInfoDocType":
                                        // suppressing this since I don't think I need it.
                                        break;

                                    default:
                                        log('Unknown datatype: ' + message);
                                }
                                break;
                            default:
                                log('Unknown message: ' + message);
                        }
                        break;

                    case "6": // ACK
                        var idAndData = better_split(args[3], "+", 2);
                        ws.eventMap[idAndData[0]](null, JSON.parse(idAndData[1])[0]);
                        delete ws.eventMap[idAndData[0]];
                        break;

                    default:
                        log('received: ' + message);
                        break;
                }

            });

            var onWebsocketAuthenticate = function(err, authResult) {
                if (err) {
                    log(err);
                    next(err);
                } else if (authResult.status != 0) {
                    log(authResult);
                    next(authResult.msg);
                } else {
                    log("Found controller: " + authResult.body.controllers[0].displayName);
                    ws.sendEvent({msg: "GetSystemInformation"}, onGetSystemInformation);
                }
            }

            var initReadyCounter = 0;
            var initFunctionFinished = function() {
                initReadyCounter ++;
                if (initReadyCounter == 4) {
                    hub.ready = true;
                    hub.emit('connect');
					next(null);
                }
            }

            var onGetSystemInformation = function(err, systemInfo) {
                if (err) {
                    next(err);
                    return;
                }

                ws.sendEvent({msg: "DeviceGetList"}, onDeviceGetList);
                ws.sendEvent({msg: "ThermostatGetList"}, onThermostatGetList);
                ws.sendEvent({msg: "RoomGetList"}, onRoomGetList);
                ws.sendEvent({msg: "ActivityGetLists", "datatype": "ActivityGetListsType", "body": [{"activityType":0}]}, onActivityGetLists);
            }

            var onDeviceGetList = function(err, devices) {
                if (err) {
                    next(err);
                    return;
                }

                for (var i in devices.body) {
                    var x = devices.body[i];
                    hub.devices[x.id] = x;
                };

                initFunctionFinished();
            }

            var onThermostatGetList = function(err, thermostats) {
                if (err) {
                    next(err);
                    return;
                }

                for (var i in thermostats.body) {
                    var x = thermostats.body[i];
                    hub.thermostats[x.id] = x;
                };

                initFunctionFinished();
            }

            var onRoomGetList = function(err, rooms) {
                if (err) {
                    next(err);
                    return;
                }

                for (var i in rooms.body) {
                    var x = rooms.body[i];
                    hub.rooms[x.id] = x;
                };

                initFunctionFinished();
            }

            var onActivityGetLists = function(err, activities) {
                if (err) {
                    next(err);
                    return;
                }

                for (var i in activities.body) {
                    var subset = activities.body[i];
                    if (subset.activityType == 2) {
                        for (var j in subset.activities) {
                            var x = subset.activities[j];
                            hub.activities[x.id] = x;
                            hub.activities["Event " + x.name + " was initiated"] = x;
                        }
                    }
                };

                initFunctionFinished();
            }
        }
    }

    // public methods
    this.deviceSetValue = function(id, value, next) {
        ws.sendEvent({msg: "DeviceSetValue", datatype: "DeviceSetValueType", body: {id: id, value: value}}, function(err, result) { next && next(err, result ? result.status == 0 : null); });
    };

    this.deviceSetState = function(id, state, next) {
        ws.sendEvent({msg: "DeviceSetState", datatype: "DeviceSetStateType", body: {id: id, deviceStateDoc: state}}, function(err, result) { next && next(err, result ? result.status == 0 : null); });
    };

    doInit(username, password, function(err) {
		if (err)
			log("Init failed");
		else
			log("Init complete");
	});
}

util.inherits(StaplesConnectHub, events.EventEmitter);

exports = module.exports = StaplesConnectHub;
