StapesConnectHub
=========

Control your Staples Connect Hub from NodeJS using the same web API used by
the Connect web interface.

## Installation

`npm install staplesconnecthub`

## Basic Usage

To find your hubs MAC address, in the Staples Connect website, click Account and then
expand your hub.  The MAC address should be listed.

```
var StaplesConnectHub = require('staplesconnecthub');

// Your hub MAC address
// The username & password you use to connect to the Staples Connect website.
var hub1 = new StaplesConnectHub("xx:xx:xx:xx:xx:xx", "username", "password");

hub1.on("connect", function() {
    console.log("hub connected");

    console.log("Activities: " + Object.keys(hub1.activities).length);
    console.log("Rooms: " + Object.keys(hub1.rooms).length);
    console.log("Devices: " + Object.keys(hub1.devices).length);
});

hub1.on("disconnect", function(reason) {
    console.log("hub disconnected - " + reason);
});

hub1.on("DataUpdate", function(id, value) {
    console.log(hub1.devices[id].name + " (" + id + ")" + " changed state to " + JSON.stringify(value));
});

```


## Device control

The first parameter is the device ID which can be found by looking at the hub1.devices
array or by watching the DataUpdate event while controlling a devices from the website.  I'm using device 53 as
an example.

For simple devices like the GE Appliance plug-in module the second parameter is a value 0 to 100.

`hub1.deviceSetValue(53, 100);`

For most devices such as Lutron, ZWave & Hue dimmable bulbs, the second parameter is a complex json object.  The shape
varies between devices, but a common one for most dimmable bulbs looks like the following.

`hub1.deviceSetState(53, {state: {powerLevel: 100, powerState: 'on'}});`

`hub1.deviceSetState(53, {state: {powerLevel: 0, powerState: 'off'}});`

## Events

##### connect

`.on('connect', function() {})`

Successfully connected to the hub.  All device & activity information is available.

##### disconnect

`.on('disconnect', function(reason) {})`

Disconnected from the hub.  The first parameter is a string containing the reason.

##### log_verbose

`.on('log_verbose', function(message) {})`

Verbose logging information from the library.

##### log_info

`.on('log_info', function(message) {})`

Informational logging information from the library

##### DataUpdate

`.on('DataUpdate', function(deviceID, value) {})`

Event from the hub when a device value changes.  Value is dependant on the type of
device.  It may be a simple integer or a complex StateDoc object.

##### ThermostatUpdate

`.on('ThermostatUpdate', function(deviceID, ambientTemp) {})`

Temperature change from a thermostat device.


##### EventInitiated

`.on('EventInitiated', function(activityID) {})`

Notification that a hub activity has started.

##### SystemAlert

`.on('SystemAlert', function(message) {})`

System messages from the hub.


## Release History

1.0.1
* Initial Release
