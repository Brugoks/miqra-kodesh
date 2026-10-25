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
  kidronX: 132,
  tyropoeonX: -12,
  temple: { x: 55, z: -38, level: 12 },
  westernHill: { x: -68, z: -8 },
  mountOfOlives: { x: 205, z: -5 },
};
export const UPPER_ROOM_LEVEL = 15.2;

const gaussian = (value, centre, width) => Math.exp(-(((value - centre) / width) ** 2));
const smoothstep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function terrainHeight(x, z) {
  // The watershed rises toward the north; both old ridges descend south.
  const northRise = Math.max(-3.2, Math.min(4.2, (-z - 8) * 0.025));
  const southDescent = -Math.max(0, z - 18) * 0.035;

  const easternRidge = 6.8 * gaussian(x, 50, 61) * (0.72 + 0.28 * gaussian(z, -35, 120));
  const westernHill = 8.7 * gaussian(x, -71, 55) * (0.78 + 0.22 * gaussian(z, -8, 115));
  const tyropoeon = -5.0 * gaussian(x, -12, 19) * (0.75 + 0.25 * gaussian(z, 38, 130));
  const kidron = -12.4 * gaussian(x, TOPOGRAPHY.kidronX, 19);
  const hinnomWest = -5.8 * gaussian(x, -132, 24) * smoothstep(15, 105, z);
  const hinnomSouth = -5.0 * gaussian(z, 119, 25) * smoothstep(-105, -35, x);
  const olives = 17.5 * gaussian(x, TOPOGRAPHY.mountOfOlives.x, 55)
    * (0.9 + 0.1 * gaussian(z, -5, 115));

  return northRise + southDescent + easternRidge + westernHill + tyropoeon
    + kidron + hinnomWest + hinnomSouth + olives;
}

export function templePlatformLevel() {
  return TOPOGRAPHY.temple.level;
}

export function eventFloorAt(x, z) {
  // The staged Temple moments stand on Herod's retained platform. The visitor
  // remains outside this blocked volume, so navigation still follows terrain.
  if (x >= 20 && x <= 90 && z >= -61 && z <= -12) return TOPOGRAPHY.temple.level;
  // The supper is on the exposed upper floor of the representative house.
  if (x >= -73 && x <= -42 && z >= 17 && z <= 40) return UPPER_ROOM_LEVEL;
  return terrainHeight(x, z);
}

export function topographicRegion(x, z) {
  if (x > 165) return 'mount-of-olives';
  if (x > 112 && x < 153) return 'kidron-valley';
  if (x < -112 && z > 18) return 'hinnom-valley';
  if (x < -30) return 'western-hill';
  if (x < 10) return 'tyropoeon-valley';
  if (z > 35) return 'city-of-david';
  return 'eastern-ridge';
}
