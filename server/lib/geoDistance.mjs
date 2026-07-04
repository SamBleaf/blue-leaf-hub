/**
 * geoDistance.mjs — Pure haversine distance helper.
 *
 * No external dependencies.  Safe to import anywhere on the server.
 */

const EARTH_RADIUS_M = 6_371_000; // metres

/**
 * Compute the great-circle distance between two WGS-84 coordinates
 * using the haversine formula.
 *
 * @param {number} lat1 — latitude of point A (decimal degrees)
 * @param {number} lng1 — longitude of point A (decimal degrees)
 * @param {number} lat2 — latitude of point B (decimal degrees)
 * @param {number} lng2 — longitude of point B (decimal degrees)
 * @returns {number} distance in metres
 */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}
