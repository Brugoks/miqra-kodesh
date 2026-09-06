// Links out to Google Maps — no API key, no SDK, no billing.
//
// Google's "Maps URLs" scheme is a documented, key-free URL format, which makes
// it the right tool for three places in this app that all want to answer the
// same question: what does this place look like now?
//
//   - an atlas pin, which knows only a latitude and longitude
//   - a Bible Wiki place entry, likewise
//   - a vantage inside a 3D scene, which knows a great deal more — where the
//     visitor is standing and which way they are facing — and can carry that
//     across so Street View opens on the same view, two thousand years later
//
// The transforms that make the third case work are here too, because their only
// purpose is to feed these URLs.

const MAPS_BASE = 'https://www.google.com/maps/@?api=1';

// Metres per degree of latitude. Longitude shrinks by cos(latitude), which over
// a few hundred metres is the only correction worth making — the flat-earth
// error at this scale is centimetres.
const METRES_PER_DEGREE = 111320;

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const toDegrees = (radians) => (radians * 180) / Math.PI;

// Compass headings wrap; everything below normalises into [0, 360).
export function normaliseHeading(degrees) {
  if (!Number.isFinite(degrees)) return 0;
  return ((degrees % 360) + 360) % 360;
}

const round = (value, places = 6) => Number(value.toFixed(places));

// --- scene geography ------------------------------------------------------
//
// A scene's `geo` block says where its origin sits and how its axes lie against
// the compass:
//
//   { lat, lon, bearing, xAxis }
//
// `bearing` is the compass heading the camera faces at yaw 0 — which is down
// -Z, the direction every scene treats as "forward". `xAxis` is the heading of
// +X, the camera's right at yaw 0.
//
// Both are needed because the scenes disagree about which way round their axes
// go: the temple has +X north and +Z east, Capernaum has +X east and +Z north.
// One number cannot tell those apart, and getting it wrong mirrors the view.

// -1 when +X lies to the compass-right of forward, +1 when it lies to the left.
// Increasing yaw always turns the camera toward -X, so this is what decides
// whether that is clockwise or anticlockwise on a map.
function turnSign(geo) {
  const delta = normaliseHeading(geo.xAxis - geo.bearing);
  return Math.abs(delta - 90) < 1 ? -1 : 1;
}

// The compass heading a camera at this scene yaw is looking along.
export function compassFromYaw(geo, yawRadians) {
  if (!geo) return 0;
  return normaliseHeading(geo.bearing + turnSign(geo) * toDegrees(yawRadians));
}

// A point in scene metres as a real place on earth.
export function localToLatLon(geo, x, z) {
  if (!geo) return null;
  const alongX = toRadians(geo.xAxis);
  // +Z is the opposite of forward.
  const alongZ = toRadians(geo.bearing + 180);

  const north = x * Math.cos(alongX) + z * Math.cos(alongZ);
  const east = x * Math.sin(alongX) + z * Math.sin(alongZ);

  const lat = geo.lat + north / METRES_PER_DEGREE;
  const lon = geo.lon + east / (METRES_PER_DEGREE * Math.cos(toRadians(geo.lat)));
  return { lat, lon };
}

// --- URLs -----------------------------------------------------------------

// Satellite view centred on a point. Safe everywhere on earth, which is why it
// is the default for an atlas pin or a wiki entry: there is always an image,
// even where nobody has ever walked a camera.
export function satelliteMapUrl(lat, lon, { zoom = 17 } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const params = new URLSearchParams({
    map_action: 'map',
    center: `${round(lat)},${round(lon)}`,
    zoom: String(Math.min(21, Math.max(0, Math.round(zoom)))),
    basemap: 'satellite',
  });
  return `${MAPS_BASE}&${params}`;
}

// Street View. `panoId` pins one specific panorama — always prefer it where a
// good one has been picked by hand, because `viewpoint` alone means "nearest",
// and nearest can be a road two kilometres away across a field.
export function streetViewUrl({ lat, lon, heading, pitch, fov, panoId } = {}) {
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lon);
  if (!panoId && !hasPoint) return null;

  const params = new URLSearchParams({ map_action: 'pano' });
  if (hasPoint) params.set('viewpoint', `${round(lat)},${round(lon)}`);
  if (panoId) params.set('pano', panoId);
  if (Number.isFinite(heading)) params.set('heading', String(round(normaliseHeading(heading), 1)));
  // Google clamps these itself, but sending something out of range is a way to
  // get an ignored parameter rather than an error, so clamp here.
  if (Number.isFinite(pitch)) params.set('pitch', String(round(Math.min(90, Math.max(-90, pitch)), 1)));
  if (Number.isFinite(fov)) params.set('fov', String(round(Math.min(100, Math.max(10, fov)), 1)));
  return `${MAPS_BASE}&${params}`;
}

// The link for a place that knows nothing but where it is — an atlas pin, a
// wiki entry. Takes the atlas/wiki shape directly.
export function placeMapUrl(place, options) {
  if (!place) return null;
  return satelliteMapUrl(place.la, place.lo, options);
}

// The link for a visitor standing somewhere inside a scene, looking somewhere.
// Falls back to satellite when the vantage has no confirmed panorama, so the
// button always goes somewhere useful rather than dumping someone in a field.
export function sceneViewUrl(geo, { x, z, yaw, pitch, fov, now } = {}) {
  if (!geo) return null;
  const point = localToLatLon(geo, x || 0, z || 0);
  if (!point) return null;

  if (now?.panoId || now?.streetView) {
    return streetViewUrl({
      lat: point.lat,
      lon: point.lon,
      heading: compassFromYaw(geo, yaw || 0),
      pitch: Number.isFinite(pitch) ? toDegrees(pitch) : 0,
      fov,
      panoId: now.panoId,
    });
  }
  return satelliteMapUrl(point.lat, point.lon, { zoom: 18 });
}
