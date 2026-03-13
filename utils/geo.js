// utils/geo.js

// Define Campus Center and Allowed Radius constraint
// Example Coordinates: User Provided College Coordinates
const CAMPUS_CENTER_LAT = 10.95698918766332;
const CAMPUS_CENTER_LNG = 77.95508250232707;
const ALLOWED_RADIUS_KM = 1.5; // 1.5 km radius

/**
 * Calculates the great-circle distance between two points on the Earth surface using the Haversine formula.
 * @param {number} lat1 Latitude of point 1
 * @param {number} lon1 Longitude of point 1
 * @param {number} lat2 Latitude of point 2
 * @param {number} lon2 Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function getDistanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

/**
 * Checks if a given coordinate is strictly within the defined campus boundary radius.
 * @param {number} lat Latitude
 * @param {number} lng Longitude
 * @returns {boolean} True if within radius, False otherwise
 */
function isInsideCampus(lat, lng) {
    const distance = getDistanceInKm(lat, lng, CAMPUS_CENTER_LAT, CAMPUS_CENTER_LNG);
    return distance <= ALLOWED_RADIUS_KM;
}

module.exports = {
    CAMPUS_CENTER_LAT,
    CAMPUS_CENTER_LNG,
    ALLOWED_RADIUS_KM,
    getDistanceInKm,
    isInsideCampus
};
