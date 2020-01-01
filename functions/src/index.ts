import * as functions from 'firebase-functions';
import fetch from 'node-fetch'
import { dialogflow, /*SimpleResponse, BasicCard, Button, Image*/ } from 'actions-on-google'

const app = dialogflow({ debug: true });

app.intent('ETA Fetcher', async (conv, {route_name}) => {
    const answer = await get_arrival_time(route_name, [42.277797, -83.735203]);
    conv.speechBiasing = [<string>route_name];
    conv.close(answer);
});

async function get_arrival_time(route_name: any, coordinates: [number, number]) {
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
