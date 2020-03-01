import * as functions from 'firebase-functions';
import fetch from 'node-fetch'
import { dialogflow, Permission, BasicCard, Button, Image, LinkOutSuggestion, Suggestions } from 'actions-on-google'

const app = dialogflow({ debug: true });

var user_route: any;

app.intent('ETA Fetcher', (conv, {route_name}) => {
    user_route = route_name
    conv.ask(new Permission({
        context: 'To find your closest stop',
        permissions: 'DEVICE_PRECISE_LOCATION',
    }));
})

app.intent('ETA Fetcher Helper', async (conv, {route_name}, locationGranted) => {
    const {location} = conv.device;
    if (locationGranted && location) {
        const answer = await get_arrival_time(user_route, [location.coordinates?.latitude, location.coordinates?.longitude]);
        conv.speechBiasing = [<string>user_route];
        conv.ask(answer.answer);
        conv.ask(new BasicCard({
            subtitle: answer.lat + ', ' + answer.lon,
            title: 'Directions to ' + answer.stop,
            buttons: new Button({
                title: 'Navigate (' + distance['text'] + ')',
                url: "https://www.google.com/maps/search/?api=1&query=" + answer['lat'] + ',' + answer['lon'],
            }),
            image: new Image({
                url: "https://lh3.googleusercontent.com/9tLfTpdILdHDAvGrRm7GdbjWdpbWSMOa0csoQ8pUba9tLP8tq7M4Quks1xuMQAVnAxVfryiDXRzZ-KDnkPv8Sm4g_YFom1ltQHjQ6Q",
                alt: "https://storage.googleapis.com/actionsresources/logo_assistant_2x_64dp.png"
            }),
            display: 'WHITE',
        }));
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
        return {answer: "Sorry, but the " + route_name + " route could not be found at this time.", lat: String(null), lon: String(null), stop: String(null)};
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
            const final_answer = {answer: route_name + " will arrive at " + optimal_stop['name'] + " in " + item['avg'] + ((item['avg'] === 1) ? " minute." : " minutes."), lat: String(optimal_stop['lat']), lon: String(optimal_stop['lon']), stop: optimal_stop['name']};
            return final_answer;
        }
    }

    return {answer: "An error has occurred.", lat: String(null), lon: String(null), stop: String(null)};
}

export const fulfillment = functions.https.onRequest(app);

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });
