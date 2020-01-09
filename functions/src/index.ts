import * as functions from 'firebase-functions';
import fetch from 'node-fetch'
import { dialogflow, Permission, /*SimpleResponse, BasicCard, Button, Image*/ } from 'actions-on-google'

const app = dialogflow({ debug: true });

var user_route: any;

app.intent('ETA Fetcher', (conv, {route_name}) => {
    user_route = route_name
    conv.ask(new Permission({
        context: 'To find the closest stop to your location',
        permissions: 'DEVICE_PRECISE_LOCATION',
    }));
})

app.intent('ETA Fetcher Helper', async (conv, {route_name}, locationGranted) => {
    const {location} = conv.device;
    if (locationGranted && location) {
        const answer = await get_arrival_time(user_route, [location.coordinates?.latitude, location.coordinates?.longitude]);
        conv.speechBiasing = [<string>user_route];
        conv.ask(answer);
        conv.ask("Anything else?");        
    }
    else {
        conv.close("Please enable location access.")
    }
});

async function get_arrival_time(route_name: any, coordinates: [any, any]) {
    let response = await fetch("http://mbus.doublemap.com/map/v2/routes");
    const routes = await response.json();
    
    let route_obj = null;
    let item;
    for (item of routes) {
        if (item['name'].indexOf(route_name) !== -1) {
            route_obj = item;
        }
    }
    if (route_obj === null) {
        return "Sorry, but the " + route_name + " route could not be found at this time.";
    }
    
    const route_stop_ids: Array<String> = route_obj['stops'];
    response = await fetch("http://mbus.doublemap.com/map/v2/stops");
    
    const all_stops = await response.json();
    let stops = [];
    for (item of all_stops) {
        if (route_stop_ids.includes(item['id'])) {
            stops.push(item);
        }
    }

    let min_distance = Number.MAX_VALUE;
    let optimal_stop = stops[0];

    for (item of stops) {
        const distance = (coordinates[0] - item['lat']) * (coordinates[0] - item['lat']) + (coordinates[1] - item['lon']) * (coordinates[1] - item['lon']);
        if (distance < min_distance) {
            min_distance = distance;
            optimal_stop = item;
        }
    }

    response = await fetch("http://mbus.doublemap.com/map/v2/eta?stop=" + optimal_stop['id']);
    const eta = await response.json();

    for (item of eta['etas'][optimal_stop['id'].toString()]['etas']) {
        if (item['route'] === route_obj['id']) {
            return route_name + " will arrive at " + optimal_stop['name'] + " in " + item['avg'] + ((item['avg'] === 1) ? " minute." : " minutes.");
        }
    }

    return "An error has occurred."
}

export const fulfillment = functions.https.onRequest(app);

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });
