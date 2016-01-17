var StaplesConnectHub = require('./StaplesConnectHub');

// Your Hub MAC address.   In the Staples Connect website, click Account and then 
//	expand your hub.  The MAC address should be listed.
// The username & password you use to connect to the Staples Connect website.
var hub1 = new StaplesConnectHub("xx:xx:xx:xx:xx:xx", "username", "password");

hub1.on("connect", function() {
    console.log("hub connected");

    console.log("Activities: " + Object.keys(hub1.activities).length);
	//console.log(hub1.activities);
	
	console.log("Rooms: " + Object.keys(hub1.rooms).length);
	//console.log(hub1.rooms);
	
	console.log("Devices: " + Object.keys(hub1.devices).length);
	//console.log(hub1.devices);
	
	
	// Sample device control.  The first paramater is the device ID which can be found by looking at the hub1.devices
	// array or by watching the DataUpdate event while controlling a devices from the website.  I'm using device 53 as
	// an example.	
	
	// for simple devices like the GE Appliance plug-in module the second paramater is a value 0 to 100.
	//hub1.deviceSetValue(53, 100);
		
	// for most devices such as lutron, zwave & hue dimmable bulbs the second paramater is a complex json object.  The shape
	// varies between devices, but a common one for most dimmable bulbs looks like the following.
	//hub1.deviceSetState(53, {state: {powerLevel: 100, powerState: 'on'}});
	//setTimeout(function() {  hub1.deviceSetState(53, {state: {powerLevel: 0, powerState: 'off'}});  }, 3000);	
});

hub1.on("disconnect", function(reason) {
    console.log("hub disconnected - " + reason);
});

hub1.on("DataUpdate", function(id, value) {
    console.log(hub1.devices[id].name + " (" + id + ")" + " changed state to " + JSON.stringify(value));
});
