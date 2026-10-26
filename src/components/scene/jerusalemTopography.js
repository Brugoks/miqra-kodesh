import { TEMPLE_COURT, TEMPLE_STAIRS, UPPER_ROOM, UPPER_STAIRS, UPPER_LANDING } from './jerusalemDimensions';

// A deliberately compressed model of first-century Jerusalem's landform.
//
// +X is east and -Z is north.  The model keeps the relationships that matter
// to reading the Gospels: the Temple at the north end of the eastern ridge,
// the City of David descending south from it, the Western Hill across the
// Tyropoeon, the Kidron between the city and the Mount of Olives, and the
// Hinnom wrapping the west and south.  It is not a survey or a claim about a
// disputed street, gate, praetorium, Golgotha or tomb location.

export const TOPOGRAPHY = {
  bounds: { x0: -220, x1: 235, z0: -145, z1: 175 },
  kidronX: 150,
  tyropoeonX: -12,
  temple: { x: 55, z: -38, level: 12 },
  westernHill: { x: -68, z: -8 },
  mountOfOlives: { x: 212, z: -5 },
};
export const UPPER_ROOM_LEVEL = 12.4;

const gaussian = (value, centre, width) => Math.exp(-(((value - centre) / width) ** 2));
const smoothstep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function naturalHeight(x, z) {
  // The watershed rises toward the north; both old ridges descend south.
  const northRise = Math.max(-3.2, Math.min(4.2, (-z - 8) * 0.025));
  const southDescent = -Math.max(0, z - 18) * 0.035;

  const easternRidge = 6.8 * gaussian(x, 50, 61) * (0.72 + 0.28 * gaussian(z, -35, 120));
  const westernHill = 8.7 * gaussian(x, -71, 55) * (0.78 + 0.22 * gaussian(z, -8, 115));
  const tyropoeon = -5.0 * gaussian(x, -12, 19) * (0.75 + 0.25 * gaussian(z, 38, 130));
  // A broad valley reads more faithfully at the scene's compressed scale than
  // a deep, narrow trench. The previous 19 m Gaussian made the eastern road
  // break into two implausible ramps immediately outside the wall.
  const kidron = -7.4 * gaussian(x, TOPOGRAPHY.kidronX, 38)
    * (0.92 + 0.08 * gaussian(z, 25, 150));
  const hinnomWest = -5.8 * gaussian(x, -132, 24) * smoothstep(15, 105, z);
  const hinnomSouth = -5.0 * gaussian(z, 119, 25) * smoothstep(-105, -35, x);
  const olives = 12 * gaussian(x, TOPOGRAPHY.mountOfOlives.x, 90)
    * (0.9 + 0.1 * gaussian(z, -5, 115));

  return northRise + southDescent + easternRidge + westernHill + tyropoeon
    + kidron + hinnomWest + hinnomSouth + olives
    + 2.2 * gaussian(x, -166, 19) * gaussian(z, -39, 17);
}

const COURTYARDS = [
  { rect: [-80, -58, 49, 66], level: naturalHeight(-70, 56) },
  { rect: [-49, -18, -81, -60], level: naturalHeight(-33, -74) },
  { rect: [-176, -162, -84, -69], level: naturalHeight(-170, -76) },
  { rect: [164, 187, -32, -15], level: naturalHeight(174, -23) },
];
const within = ([x0, x1, z0, z1], x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;

function shapedHeight(x, z) {
  let height = naturalHeight(x, z);
  for (const { rect: [x0, x1, z0, z1], level } of COURTYARDS) {
    const distance = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
    const blend = 1 - smoothstep(0, 7, distance);
    height += (level - height) * blend;
  }
  return height;
}

// The mesh, roads, feet and navigation sample the SAME triangulated 2m grid.
// Changing graphics quality must never move the visible floor beneath people.
export const TERRAIN_GRID = { x0: -232, z0: -160, width: 480, depth: 350, step: 2 };
export function terrainHeight(x, z) {
  const { x0, z0, step } = TERRAIN_GRID;
  const gx = Math.floor((x - x0) / step) * step + x0;
  const gz = Math.floor((z - z0) / step) * step + z0;
  const u = (x - gx) / step, v = (z - gz) / step;
  const a = shapedHeight(gx, gz), b = shapedHeight(gx + step, gz);
  const c = shapedHeight(gx, gz + step), d = shapedHeight(gx + step, gz + step);
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v
    : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

export function stairHeight(rect, top, x, z) {
  const [x0, x1, z0, z1] = rect;
  const bottom = terrainHeight((x0 + x1) / 2, z1);
  const count = Math.ceil((top - bottom) / 0.18);
  const tread = Math.min(count, Math.max(0, Math.ceil((z1 - z) / (z1 - z0) * count)));
  return bottom + (top - bottom) * tread / count;
}

export function surfaceHeight(x, z) {
  if (within(TEMPLE_COURT, x, z)) return TOPOGRAPHY.temple.level;
  if (within(TEMPLE_STAIRS, x, z)) return stairHeight(TEMPLE_STAIRS, TOPOGRAPHY.temple.level, x, z);
  if (within(UPPER_ROOM, x, z)) return UPPER_ROOM_LEVEL;
  if (within(UPPER_LANDING, x, z)) return UPPER_ROOM_LEVEL;
  if (within(UPPER_STAIRS, x, z)) return stairHeight(UPPER_STAIRS, UPPER_ROOM_LEVEL, x, z);
  return terrainHeight(x, z);
}

export function templePlatformLevel() {
  return TOPOGRAPHY.temple.level;
}

export function eventFloorAt(x, z) {
  return surfaceHeight(x, z);
}

export function topographicRegion(x, z) {
  if (x >= 170) return 'mount-of-olives';
  if (x > 112 && x < 170) return 'kidron-valley';
  if (x < -112 && z > 18) return 'hinnom-valley';
  if (x < -30) return 'western-hill';
  if (x < 10) return 'tyropoeon-valley';
  if (z > 35) return 'city-of-david';
  return 'eastern-ridge';
}
