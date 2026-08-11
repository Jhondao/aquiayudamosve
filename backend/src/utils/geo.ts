/** Great-circle distance between two coordinates, in meters. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Coarsens coordinates to ~110m grid cells. Used when a report is flagged
 * isSensitive so we never persist a precise pin for vulnerable people.
 */
export function coarsenCoordinates(lat: number, lng: number): { lat: number; lng: number } {
  const precision = 3; // ~111m at the equator
  return {
    lat: Number(lat.toFixed(precision)),
    lng: Number(lng.toFixed(precision)),
  };
}
