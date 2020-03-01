import * as functions from 'firebase-functions';
import fetch from 'node-fetch'
import { dialogflow, Permission, BasicCard, Button, Image, LinkOutSuggestion, Suggestions } from 'actions-on-google'

const app = dialogflow({ debug: true });

var user_route: any;

// This intent is launched when the user asks for the arrival time of a certain route.
app.intent('ETA Fetcher', (conv, {route_name}) => {
    // Store requested route name to be used across intents
    user_route = route_name

    // Ask for user's location, then redirect to ETA Fetcher Helper intent
    conv.ask(new Permission({
        context: 'To find your closest stop',
        permissions: 'DEVICE_PRECISE_LOCATION',
    }));
})

app.intent('ETA Fetcher Helper', async (conv, {route_name}, locationGranted) => {
    // Store user's GPS coordinates into 'location' variable
    const {location} = conv.device;

    // Check if user has consented to share location
    if (locationGranted && location) {
        // Call helper function to get ETA from DoubleMap using user's location and desired route
        const answer = await get_arrival_time(user_route, [location.coordinates?.latitude, location.coordinates?.longitude]);
        /*const distance = await time_from_stop([String(location.coordinates?.latitude), String(location.coordinates?.longitude)], [answer.lat, answer.lon]);*/

        // Emphasize route in spoken answer
        conv.speechBiasing = [<string>user_route];

        // Return answer to user
        conv.ask(answer.answer);

        // Show suggestion card linking to directions to stop on Google Maps
        if (answer['lat'] != 'null' && answer['lon'] != 'null') {
            conv.ask(new LinkOutSuggestion({
                name: 'directions to stop',
                url: "https://www.google.com/maps/search/?api=1&query=" + answer['lat'] + ',' + answer['lon'],
            }));
        }
        /*conv.ask(new BasicCard({
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
        }));*/
        conv.ask("Anything else?");        
    }
    else {
        // Abort function if user has declined to share location
        conv.close("Please enable location access to find the closest stop to you.");
    }
});

app.intent('Check Route Status', async (conv, {bus_route}) => {
    // Call helper function to check whether requested route is active
    const active = await route_status(bus_route);

    // Return an answer depending on route status
    if (active) {
        conv.ask("Yes, " + bus_route + " is currently active.");
        conv.ask(new Suggestions(bus_route + " ETA")); // Suggest to call ETA fetcher intent if route is active
    }
    else {
        conv.ask("No, " + bus_route + " is not running right now.");
    }
    conv.ask("Anything else?");
})

async function get_arrival_time(route_name: any, coordinates: [any, any]) {
    // Get all routes from DoubleMap API
    let response = await fetch("http://mbus.doublemap.com/map/v2/routes");
    const routes = await response.json();
    
    // Find specific route object corresponding to user's request, and return error if route not found
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
    
    // Get all stops from DoubleMap API and filter stops based on which ones contain desired route
    response = await fetch("http://mbus.doublemap.com/map/v2/stops");
    const all_stops = await response.json();

    const route_stop_ids: Array<String> = route_obj['stops'];
    let stops = [];
    for (item of all_stops) {
        if (route_stop_ids.includes(item['id'])) {
            stops.push(item);
        }
    }

    // Find the closest stop based on user's coordinates
    let min_distance = Number.MAX_VALUE;
    let optimal_stop = stops[0];

    for (item of stops) {
        const distance = (coordinates[0] - item['lat']) * (coordinates[0] - item['lat']) + (coordinates[1] - item['lon']) * (coordinates[1] - item['lon']);
        if (distance < min_distance) {
            min_distance = distance;
            optimal_stop = item;
        }
    }

    // Get list of bus arrival times for user's closest stop from DoubleMap API
    response = await fetch("http://mbus.doublemap.com/map/v2/eta?stop=" + optimal_stop['id']);
    const eta = await response.json();

    // Search through all bus arrival times to find the bus specific to desired route
    for (item of eta['etas'][optimal_stop['id'].toString()]['etas']) {
        if (item['route'] === route_obj['id']) {
            const final_answer = {answer: route_name + " will arrive at " + optimal_stop['name'] + " in " + item['avg'] + ((item['avg'] === 1) ? " minute." : " minutes."), lat: String(optimal_stop['lat']), lon: String(optimal_stop['lon']), stop: optimal_stop['name']};
            return final_answer;
        }
    }

    return {answer: "Sorry, but an estimated time for " + route_name + " could not be found.", lat: String(null), lon: String(null), stop: String(null)};
}

// Uses Google Maps API to get estimated walking time from user's location to closest stop
async function time_from_stop(user_coordinates: [string, string], stop_coordinates: [string, string]) {
    let api_url = "https://maps.googleapis.com/maps/api/distancematrix/json?origins=" + user_coordinates[0] + ',' + user_coordinates[1] + "&destinations=" + stop_coordinates[0] + ',' + stop_coordinates[1] + "&mode=walking&key=" + functions.config().gmaps.key;
    let response = await fetch(api_url);
    const eta = await response.json()

    return eta['rows'][0]['elements'][0]['duration'];
}

async function route_status(route_name: any) {
    // Get all routes from DoubleMap API
    let response = await fetch("http://mbus.doublemap.com/map/v2/routes");
    const routes = await response.json();
    
    // Search for desired route, and return true or false depending on whether route has been found
    let route_obj = null;
    let item;
    for (item of routes) {
        if (item['name'].indexOf(route_name) !== -1) {
            route_obj = item;
        }
    }
    if (route_obj === null) {
        return false;
    }
    else {
        return true;
    }
}

export const fulfillment = functions.https.onRequest(app);

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });
