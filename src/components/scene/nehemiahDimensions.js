// The measurements of Nehemiah's Jerusalem, in one place.
//
// The geometry (buildNehemiah.js, nehemiahLandscape.js, nehemiahCity.js,
// nehemiahWallGeometry.js) and the collision model (nehemiahNavigation.js)
// both read from here, so what is drawn and what is solid cannot drift apart.
//
// Axes: +X east, -Z north, +Y up, metres, from the Gihon spring (31.7739 N,
// 35.2367 E) — the right-handed way round, like the Mount of Olives. y = 0 is
// the ground at the spring, 667 m above the sea. The ground is real elevation
// data (scripts/build-nehemiah-landscape.py); where the fifth century BC
// differs from the survey, `shapeGround` reshapes it before anything stands on
// it, for the ground drawn and the ground walked alike.
//
// The plan is the one in the map this scene was built from — the circuit of
// Nehemiah 3, gate by gate — laid onto that ground. Its pixel positions were
// fitted to three places whose real positions are known (the Gihon, the Pool
// of Siloam and the rock under the Dome of the Rock) at 0.657 m a pixel; at
// that scale the circuit comes to 1.6 miles against the map's own "1.5", and
// the Valley Gate and the Dung Gate stand 1000 cubits apart as Nehemiah 3:13
// says they do. Where the fitted line fell in the bed of the Kidron instead of
// on its slope, or a house would have stood in a wall, the point was moved by
// hand; nehemiah.test.js holds the numbers that matter against the text.
//
// A cubit is half a metre here, as in the Tabernacle and the Temple scenes.

import { GROUND } from './nehemiahGroundData.js';
import { triangleHeight, makeRandom } from './sceneLandscape.js';

export const SLUG = 'nehemiahs-wall';
export const EYE_HEIGHT = 1.7;
export const CUBIT = 0.5;

// Where a visitor may go: the whole walled city, the Western Hill's ruins out
// to the Broad Wall, the Kidron's west bank, the Hinnom. The edges are
// barriers with prose.
export const WALK = { x0: -612, x1: 312, z0: -756, z1: 600 };

// --- the ground -----------------------------------------------------------------

export function insidePolygon(x, z, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, zi] = points[i];
    const [xj, zj] = points[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function segmentDistance(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const length2 = dx * dx + dz * dz;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

export function polygonDistance(x, z, points) {
  let best = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    best = Math.min(best, segmentDistance(x, z, points[j][0], points[j][1], points[i][0], points[i][1]));
  }
  return best;
}

const smooth = (t) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

// The Temple Mount: a platform made level on the rock, cut down where the
// plateau stands higher and built up where the hill falls away. Its corners
// are the inner faces of the three walls that close it, and of the city's
// north wall.
export const MOUNT = {
  level: 74,
  polygon: [[-238, -553], [28, -606], [78, -326], [-178, -289]],
  // Outside the walls the platform's level fades back to the hill over this.
  feather: 22,
};

// The square before the Water Gate (Nehemiah 8:1,3): open ground inside the
// gate, made level for a crowd, and the larger open court before the Ephraim
// Gate, where booths were set up (8:16).
export const WATER_SQUARE = { x: -34, z: -92, radius: 20, level: 35.6, feather: 12 };

export function shapeGround(x, z, height) {
  let h = height;
  const inside = insidePolygon(x, z, MOUNT.polygon);
  const distance = polygonDistance(x, z, MOUNT.polygon);
  if (inside) h = MOUNT.level;
  else if (distance < MOUNT.feather) h = height + (MOUNT.level - height) * (1 - smooth(distance / MOUNT.feather));
  const dSquare = Math.hypot(x - WATER_SQUARE.x, z - WATER_SQUARE.z);
  if (dSquare < WATER_SQUARE.radius + WATER_SQUARE.feather) {
    h += (WATER_SQUARE.level - h) * (1 - smooth((dSquare - WATER_SQUARE.radius) / WATER_SQUARE.feather));
  }
  return h;
}

let shapedGrid = null;
function shaped() {
  if (shapedGrid) return shapedGrid;
  const { x0, z0, step, nx } = GROUND;
  shapedGrid = {
    ...GROUND,
    heights: GROUND.heights.map((h, k) => shapeGround(x0 + (k % nx) * step, z0 + Math.floor(k / nx) * step, h)),
  };
  return shapedGrid;
}

// The ground a visitor walks on: the baked grid's own triangles, so a foot
// meets exactly the surface drawn (sceneLandscape.js triangleHeight).
export function groundAt(x, z) {
  return triangleHeight(shaped(), x, z);
}

// --- the walls ------------------------------------------------------------------
// A wall is a polyline of vertices, each a bend or something standing in the
// wall: a gate, a tower. The city wall is closed and runs counter-clockwise
// from the Sheep Gate — the order Nehemiah 3 takes it in: west along the north
// side, down the west, round the south of the city of David and back up its
// east side, then north past the Horse Gate and the Muster Gate. The Temple
// Mount is closed inside it by three walls of its own.

const v = (id, x, z, kind = 'bend') => ({ id, x, z, kind });

export const WALLS = [
  {
    id: 'city',
    label: 'The wall of Jerusalem',
    closed: true,
    thickness: 3, // six cubits
    height: 8, // sixteen above the higher ground at its foot
    vertices: [
      v('sheep-gate', -161, -571, 'gate'),
      v('tower-of-meah', -193, -566, 'tower'),
      v('tower-of-hananel', -242, -556, 'tower'),
      v('nw-bend', -274, -524),
      v('fish-gate', -300, -490, 'gate'),
      v('west-bend-1', -303, -441),
      v('old-gate', -284, -371, 'gate'),
      v('west-bend-2', -274, -324),
      v('ephraim-gate', -263, -271, 'gate'),
      v('west-bend-3', -201, -182),
      v('west-bend-4', -152, -119),
      v('tower-of-furnaces', -136, -85, 'tower'),
      v('west-bend-5', -130, -34),
      v('valley-gate', -124, 19, 'gate'),
      v('spur-west-1', -150, 91),
      v('spur-west-2', -165, 158),
      v('spur-west-3', -166, 243),
      v('spur-west-4', -176, 305),
      v('spur-west-5', -186, 352),
      v('spur-west-6', -172, 405),
      v('spur-west-7', -148, 452),
      v('dung-gate', -115, 491, 'gate'),
      v('south-bend', -96, 470),
      v('fountain-gate', -70, 432, 'gate'),
      v('spur-east-1', -58, 372),
      v('spur-east-2', -62, 323),
      v('angle-1', -84, 237, 'tower'),
      v('spur-east-3', -72, 153),
      v('spur-east-4', -62, 74),
      v('angle-2', -45, -18, 'tower'),
      v('projecting-tower', -25, -55, 'tower'),
      v('water-gate', -3, -93, 'gate'),
      v('great-projecting-tower', 35, -148, 'tower'),
      v('ophel-bend', 74, -208),
      v('horse-gate', 104, -262, 'gate'),
      v('east-bend-1', 112, -380),
      v('east-bend-2', 108, -479),
      v('east-bend-3', 90, -544),
      v('muster-gate', 64, -566, 'gate'),
      v('east-bend-4', 52, -596),
      v('corner-tower', 23, -614, 'tower'),
      v('north-bend', -49, -598),
      v('prison-gate', -125, -581, 'gate'),
    ],
  },
  {
    id: 'mount-west',
    label: 'The west wall of the Temple Mount',
    closed: false,
    thickness: 5,
    height: 6,
    vertices: [v('mount-nw', -236, -553), v('mount-west-bend', -214, -470), v('west-gate', -196, -389, 'gate'), v('mount-sw', -178, -289)],
  },
  {
    id: 'mount-south',
    label: 'The south wall of the Temple Mount',
    closed: false,
    thickness: 5,
    height: 6,
    vertices: [v('mount-sw-end', -178, -289), v('mount-south-bend', -140, -296), v('south-gate', -96, -303, 'gate'), v('mount-se', 78, -326)],
  },
  {
    id: 'mount-east',
    label: 'The east wall of the Temple Mount',
    closed: false,
    thickness: 5,
    height: 6,
    vertices: [v('mount-se-end', 78, -326), v('mount-east-bend-1', 70, -420), v('mount-east-bend-2', 62, -490), v('east-gate', 50, -530, 'gate'), v('mount-ne', 28, -606)],
  },
];

export const WALL_BY_ID = Object.fromEntries(WALLS.map((wall) => [wall.id, wall]));

// What each gate, tower and angle is, as the text names it. `builders` is
// Nehemiah 3's own account of who built the stretch; `refs` are the verses.
export const GATE_INFO = {
  'sheep-gate': {
    label: 'The Sheep Gate',
    builders: 'Eliashib the high priest and his brothers the priests',
    refs: ['Nehemiah 3:1', 'Nehemiah 3:32', 'Nehemiah 12:39'],
  },
  'fish-gate': {
    label: 'The Fish Gate',
    builders: 'the sons of Hassenaah',
    refs: ['Nehemiah 3:3', 'Nehemiah 12:39'],
  },
  'old-gate': {
    label: 'The Old Gate',
    builders: 'Joiada son of Paseah and Meshullam son of Besodeiah',
    refs: ['Nehemiah 3:6', 'Nehemiah 12:39'],
  },
  'valley-gate': {
    label: 'The Valley Gate',
    builders: 'Hanun and the inhabitants of Zanoah',
    refs: ['Nehemiah 3:13', 'Nehemiah 2:13', 'Nehemiah 2:15'],
  },
  'dung-gate': {
    label: 'The Dung Gate',
    builders: 'Malchijah son of Rechab, ruler of the district of Beth-haccherem',
    refs: ['Nehemiah 3:14', 'Nehemiah 2:13', 'Nehemiah 12:31'],
  },
  'fountain-gate': {
    label: 'The Fountain Gate',
    builders: 'Shallun son of Col-hozeh, ruler of the district of Mizpah',
    refs: ['Nehemiah 3:15', 'Nehemiah 2:14', 'Nehemiah 12:37'],
  },
  'water-gate': {
    label: 'The Water Gate',
    builders: 'the temple servants living on the Ophel',
    refs: ['Nehemiah 3:26', 'Nehemiah 8:1', 'Nehemiah 12:37'],
  },
  'horse-gate': {
    label: 'The Horse Gate',
    builders: 'the priests, each opposite his own house',
    refs: ['Nehemiah 3:28', 'Jeremiah 31:40'],
  },
  'east-gate': {
    label: 'The East Gate',
    builders: 'Shemaiah son of Shecaniah, its keeper',
    refs: ['Nehemiah 3:29'],
  },
  'muster-gate': {
    label: 'The Muster Gate',
    alias: 'Hammiphkad, the Inspection Gate',
    builders: 'Malchijah, one of the goldsmiths',
    refs: ['Nehemiah 3:31'],
  },
  'ephraim-gate': {
    label: 'The Ephraim Gate',
    builders: null,
    refs: ['Nehemiah 8:16', 'Nehemiah 12:39', '2 Kings 14:13'],
  },
  'prison-gate': {
    label: 'The Gate of the Guard',
    alias: 'the Prison Gate',
    builders: null,
    refs: ['Nehemiah 12:39'],
  },
  'west-gate': { label: 'The West Gate of the Mount', builders: null, refs: ['Nehemiah 2:8'] },
  'south-gate': { label: 'The South Gate of the Mount', builders: null, refs: ['Nehemiah 2:8'] },
};

// The ten gates Nehemiah 3 builds, in the order it names them.
export const NEHEMIAH_3_GATES = [
  'sheep-gate', 'fish-gate', 'old-gate', 'valley-gate', 'dung-gate',
  'fountain-gate', 'water-gate', 'horse-gate', 'east-gate', 'muster-gate',
];

export const TOWER_INFO = {
  'tower-of-meah': { label: 'The Tower of Meah', alias: 'of the Hundred', rise: 8, width: 10, project: 7, refs: ['Nehemiah 3:1', 'Nehemiah 12:39'] },
  'tower-of-hananel': { label: 'The Tower of Hananel', rise: 7, width: 11, project: 8, refs: ['Nehemiah 3:1', 'Nehemiah 12:39', 'Jeremiah 31:38'] },
  'tower-of-furnaces': { label: 'The Tower of the Furnaces', rise: 5, width: 9, project: 6, refs: ['Nehemiah 3:11', 'Nehemiah 12:38'] },
  'angle-1': { label: 'The Angle', rise: 4, width: 8, project: 5, refs: ['Nehemiah 3:19', 'Nehemiah 3:24-25'] },
  'angle-2': { label: 'The Turning of the Wall', rise: 4, width: 8, project: 5, refs: ['Nehemiah 3:20', 'Nehemiah 3:24-25'] },
  'projecting-tower': { label: 'The Projecting Tower', rise: 6, width: 8, project: 6, refs: ['Nehemiah 3:25-26'] },
  'great-projecting-tower': { label: 'The Great Projecting Tower', rise: 8, width: 12, project: 8, refs: ['Nehemiah 3:27'] },
  'corner-tower': { label: 'The Corner Tower', rise: 7, width: 11, project: 8, refs: ['Nehemiah 3:31-32'] },
};

// A gate: a passage through the wall, and a gatehouse flanking it.
export const GATE = {
  width: 4.4, // nine cubits of clear way
  height: 4.6,
  flank: 5, // how far the gate's towers stand out from the wall's outer face
  flankWidth: 3.4,
  rise: 2.6, // above the wall's top
};

export const wallVertex = (wallId, vertexId) => WALL_BY_ID[wallId].vertices.find((vertex) => vertex.id === vertexId) || null;

// --- the stairs -----------------------------------------------------------------
// How a visitor gets onto the wall (nehemiahWalls.js lays each one out): a
// flight against the inside face, rising along the wall from near a gate to
// where its treads meet the walkway. The first is the one the text names.
export const STAIRS = [
  {
    id: 'city-of-david-stairs',
    label: 'The stairs that go down from the city of David',
    wall: 'city',
    vertex: 'fountain-gate',
    direction: 1,
    start: 12,
    refs: ['Nehemiah 3:15', 'Nehemiah 12:37'],
  },
  { id: 'valley-stairs', label: 'Stairs by the Valley Gate', wall: 'city', vertex: 'valley-gate', direction: 1, start: 12, refs: ['Nehemiah 12:31'] },
  { id: 'sheep-stairs', label: 'Stairs by the Sheep Gate', wall: 'city', vertex: 'sheep-gate', direction: 1, start: 12, refs: ['Nehemiah 12:39'] },
  { id: 'fish-stairs', label: 'Stairs by the Fish Gate', wall: 'city', vertex: 'fish-gate', direction: 1, start: 12, refs: ['Nehemiah 12:39'] },
  { id: 'water-stairs', label: 'Stairs by the Water Gate', wall: 'city', vertex: 'water-gate', direction: 1, start: 12, refs: ['Nehemiah 12:37'] },
  { id: 'horse-stairs', label: 'Stairs by the Horse Gate', wall: 'city', vertex: 'horse-gate', direction: 1, start: 12, refs: ['Nehemiah 3:28'] },
];
export const STAIR = { width: 1.7, rise: 0.28, slope: 0.3 };

// --- the three states of the wall ------------------------------------------------
// The wall is not one thing in this scene but three, because the text says it
// was: broken down, its gates burned (1:3; 2:13-17), joined to half its height
// (4:6), and finished (6:15). A moment sets the state it is in.
export const WALL_STATES = ['ruin', 'half', 'built'];
export const DEFAULT_WALL_STATE = 'built';

// What the wall is doing at each staged moment (nehemiahEvents.js).
export const EVENT_WALL_STATE = {
  'night-ride': 'ruin',
  'rise-and-build': 'ruin',
  'sheep-gate': 'built',
  'daughters-of-shallum': 'half',
  'nobles-of-tekoa': 'half',
  mockery: 'half',
  'sword-and-trowel': 'half',
  outcry: 'half',
  finished: 'built',
  'water-gate': 'built',
  booths: 'built',
  dedication: 'built',
};

// --- the streets ------------------------------------------------------------------
// The ways between the gates: the ridge street down the length of the city of
// David from the Water Gate to the Fountain Gate, the street up the Ophel to the
// South Gate of the Temple Mount, the Temple Mount's own road from its East Gate
// to the court, and the track down from the Water Gate to the Gihon. Points
// are [x, z].
export const STREETS = [
  { id: 'ridge-street', width: 3.2, points: [[-3, -93], [-34, -92], [-62, -30], [-92, 40], [-108, 120], [-120, 200], [-124, 280], [-112, 360], [-96, 412], [-70, 432]] },
  { id: 'valley-street', width: 2.6, points: [[-124, 19], [-100, 22], [-92, 40]] },
  { id: 'ophel-street', width: 3, points: [[-34, -92], [-70, -150], [-92, -220], [-96, -290], [-96, -303]] },
  { id: 'mount-road', width: 4, points: [[50, -530], [0, -500], [-48, -465]] },
  { id: 'sheep-road', width: 3, points: [[-161, -571], [-150, -540], [-125, -500], [-80, -470]] },
  { id: 'gihon-track', width: 2.4, points: [[-3, -93], [28, -70], [30, -26], [8, -4]] },
];

export function streetDistance(x, z, streets = STREETS) {
  let best = Infinity;
  let id = null;
  for (const street of streets) {
    const pts = street.points;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const d = segmentDistance(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) - street.width / 2;
      if (d < best) {
        best = d;
        id = street.id;
      }
    }
  }
  return { distance: best, id };
}

// --- inside the walls -----------------------------------------------------------
// "The city was wide and large, but the people within it were few, and no
// houses had been rebuilt" (Nehemiah 7:4). A scatter of houses, each the
// house of someone Nehemiah 3 names, among rubble.
const house = (id, label, x, z, w, d, yaw, height, extra = {}) => ({ id, label, x, z, w, d, yaw, height, ...extra });

export const HOUSES = [
  house('jedaiah-house', 'The house of Jedaiah', -127, -144, 8, 6, 0.3, 3.4, { refs: ['Nehemiah 3:10'], owner: 'Jedaiah son of Harumaph' }),
  house('zadok-house', 'The house of Zadok', 92, -363, 7, 6, 0, 3.4, { refs: ['Nehemiah 3:29'], owner: 'Zadok son of Immer' }),
  house('meshullam-quarters', 'Meshullam’s quarters', 84, -500, 9, 6, 0, 3.2, { refs: ['Nehemiah 3:30'], owner: 'Meshullam son of Berechiah' }),
  house('temple-servants-merchants', 'The house of the temple servants and the merchants', 73, -528, 12, 7, 0, 3.4, { refs: ['Nehemiah 3:31'] }),
  house('priests-house-1', 'A priest’s house', 94, -316, 6, 5, 0, 3.2, { refs: ['Nehemiah 3:28'] }),
  house('priests-house-2', 'A priest’s house', 94, -298, 6, 5, 0, 3.2, { refs: ['Nehemiah 3:28'] }),
  house('priests-house-3', 'A priest’s house', 94, -280, 6, 5, 0, 3.2, { refs: ['Nehemiah 3:28'] }),
  house('ophel-1', 'A house of the temple servants', -44, -230, 5, 4, 0.2, 2.8, { refs: ['Nehemiah 3:26'] }),
  house('ophel-2', 'A house of the temple servants', -22, -234, 5, 4, -0.3, 2.8, { refs: ['Nehemiah 3:26'] }),
  house('ophel-3', 'A house of the temple servants', -60, -208, 5, 4, 0.5, 2.8, { refs: ['Nehemiah 3:26'] }),
  house('ophel-4', 'A house of the temple servants', -28, -206, 5, 4, 0, 2.8, { refs: ['Nehemiah 3:26'] }),
  house('ophel-5', 'A house of the temple servants', -44, -190, 5, 4, -0.2, 2.8, { refs: ['Nehemiah 3:26'] }),
  house('azariah-house', 'The house of Azariah', -73, 43, 8, 6, 0.1, 3.4, { refs: ['Nehemiah 3:23'], owner: 'Azariah son of Maaseiah' }),
  house('benjamin-hasshub-house', 'The house of Benjamin and Hasshub', -86, 117, 8, 6, 0, 3.4, { refs: ['Nehemiah 3:23'], owner: 'Benjamin and Hasshub' }),
  house('eliashib-house', 'The house of Eliashib the high priest', -93, 149, 13, 8, 0, 3.8, { refs: ['Nehemiah 3:20-21'], owner: 'Eliashib the high priest' }),
  house('house-of-the-mighty', 'The house of the mighty men', -100, 300, 10, 7, 0.2, 3.4, { refs: ['Nehemiah 3:16'] }),
  house('armory', 'The armory', -112, 250, 12, 7, 0, 3.4, { refs: ['Nehemiah 3:19'] }),
];

// Ruins of a greater age: David's palace above the spring, Solomon's upper
// house with the court of the guard, the governor's seat of the province
// beyond the River (Nehemiah 3:7), the stepped stone structure on the slope
// above the Gihon, and the tombs of David across the valley (3:16).
export const RUINS = [
  { id: 'davids-palace', label: 'David’s palace', x: -77, z: 1, w: 26, d: 20, yaw: 0.15, height: 3.2, refs: ['2 Samuel 5:9-11', 'Nehemiah 12:37'] },
  { id: 'upper-palace', label: 'The upper house of the king', x: -52, z: -138, w: 22, d: 20, yaw: -0.1, height: 3.6, refs: ['Nehemiah 3:25'] },
  { id: 'court-of-the-guard', label: 'The court of the guard', x: -72, z: -66, w: 20, d: 14, yaw: 0.2, height: 2.6, refs: ['Nehemiah 3:25', 'Jeremiah 32:2'] },
  { id: 'stepped-stone-structure', label: 'The stepped stone structure', x: -30, z: 8, w: 18, d: 14, yaw: 0, height: 6, refs: ['2 Samuel 5:9', 'Nehemiah 3:15'] },
];

export const GOVERNOR_SEAT = { x: -241, z: -332, half: 13, tiers: 3, tierRise: 0.7, refs: ['Nehemiah 3:7'] };

export const TOMBS_OF_DAVID = { x: 84, z: 329, w: 12, d: 8, height: 4.4, facing: -Math.PI / 2, refs: ['Nehemiah 3:16'] };

// The Broad Wall: Hezekiah's, seven metres thick, built against the Assyrian
// when he spread the city onto the Western Hill. Nehemiah's builders restored
// Jerusalem "as far as the Broad Wall" (3:8) — and what stands of it stands
// outside the line they drew.
export const BROAD_WALL = { x0: -540, x1: -430, z: -190, thickness: 7, height: 3.4, refs: ['Nehemiah 3:8', 'Nehemiah 12:38', 'Isaiah 22:9-10'] };

// --- water ----------------------------------------------------------------------
export const POOLS = [
  { id: 'pool-of-siloam', label: 'The Pool of Shelah', alias: 'the Pool of Siloam', x: -153, z: 351, w: 20, d: 14, yaw: 0.35, refs: ['Nehemiah 3:15', 'John 9:7'] },
  { id: 'kings-pool', label: 'The King’s Pool', alias: 'the artificial pool', x: -6, z: 320, w: 28, d: 18, yaw: -0.2, refs: ['Nehemiah 2:14', 'Nehemiah 3:16'] },
];
export const GIHON = { x: 0, z: 0, refs: ['1 Kings 1:33-45', '2 Chronicles 32:30'] };
export const DRAGON_SPRING = { x: -206, z: 300, radius: 3, refs: ['Nehemiah 2:13'] };
// Hezekiah's tunnel runs under the ridge from the Gihon to the Pool of
// Siloam, five hundred and thirty-three metres of rock cut from both ends.
// It is not walkable here: the mouths are.
export const HEZEKIAH_TUNNEL = { from: [-22, 4], to: [-135, 347], refs: ['2 Chronicles 32:30', '2 Kings 20:20'] };

// --- the Temple -----------------------------------------------------------------
// The second Temple, Zerubbabel's, standing on the rock under the Dome of the
// Rock, facing east. Nehemiah never describes it: it is the Temple Ezra 6 has
// finished and Haggai 2:3 says was nothing beside the first. It is built to
// the first's plan at its modest end — a house thirty metres long by twenty
// wide and fifteen high, the proportions of 1 Kings 6:2 — inside a court the
// map draws, with the altar of Ezra 3:2 before it.
export const TEMPLE = {
  // The Holy of Holies' west wall; the house runs east from it.
  x: -131,
  z: -465,
  length: 30,
  width: 20,
  height: 15,
  porch: 5,
  court: { x0: -163, x1: -48, z0: -511, z1: -426, wall: 3.6 },
  courtGate: { z0: -471, z1: -459 },
  altar: { x: -74, z: -463, half: 2.7, height: 2.6 },
  refs: ['Ezra 3:2', 'Ezra 6:15', 'Haggai 2:3', '1 Kings 6:2'],
};

// --- the ruin and the rubble ------------------------------------------------------
// Where the fall of the walls lies thickest, as ellipses [x, z, rx, rz].
// "There was no place for the animal that was under me to pass" (2:14): the
// east slope between the Fountain Gate and the King's Pool, and the terraces
// that fell from the spur above the Gihon.
export const RUBBLE_FIELDS = [
  { id: 'fountain-slope', x: -34, z: 372, rx: 20, rz: 16, density: 1, blocks: true },
  { id: 'gihon-terraces', x: -34, z: 62, rx: 38, rz: 70, density: 0.8, blocks: false },
  { id: 'ophel-fall', x: -10, z: -170, rx: 60, rz: 40, density: 0.5, blocks: false },
  { id: 'western-hill', x: -440, z: 40, rx: 170, rz: 330, density: 0.35, blocks: false },
  { id: 'city-interior', x: -120, z: 220, rx: 60, rz: 120, density: 0.3, blocks: false },
];

// --- vantage grounds ------------------------------------------------------------
// Where each staged moment stands (nehemiahEvents.js). Kept clear of trees and
// the ambient crowd, which are placed without knowing which moment is staged.
export const EVENT_GROUND = {
  'night-ride': { x: -56, z: 396, r: 14 },
  'rise-and-build': { x: -112, z: 40, r: 16 },
  'sheep-gate': { x: -150, z: -560, r: 14 },
  'daughters-of-shallum': { x: -124, z: -52, r: 12 },
  'nobles-of-tekoa': { x: 22, z: -136, r: 14 },
  mockery: { x: -338, z: -366, r: 18 },
  'sword-and-trowel': { x: 80, z: -243, r: 14 },
  outcry: { x: -100, z: 70, r: 14 },
  finished: { x: -36, z: -84, r: 16 },
  'water-gate': { x: -34, z: -92, r: 26 },
  booths: { x: -248, z: -254, r: 18 },
  dedication: { x: -132, z: -62, r: 22 },
};

export const inEventArea = (x, z, pad = 0) => Object.values(EVENT_GROUND)
  .some((area) => Math.hypot(x - area.x, z - area.z) < area.r + pad);

// --- olives and fruit -----------------------------------------------------------
// The groves the Kidron's west bank and the Mount across it carried, and the
// king's garden at the south tip of the city (Nehemiah 3:15). Generated here,
// deterministically, because the trunks are solid and the navigation needs the
// same trees the landscape draws. Each is { x, z, s, r, kind }.
export const GARDEN_ZONES = [
  { id: 'kings-garden', kind: 'fruit', density: 0.9, spacing: 9, polygon: [[-168, 372], [-96, 380], [-84, 430], [-130, 462], [-176, 430]] },
  { id: 'kidron-bank', kind: 'olive', density: 0.8, spacing: 11, polygon: [[70, -120], [180, -150], [220, 120], [150, 330], [60, 280], [40, 60]] },
  { id: 'mount-slope', kind: 'olive', density: 0.9, spacing: 10.5, polygon: [[150, -420], [312, -420], [312, 300], [190, 300], [170, -100]] },
  { id: 'hinnom-terraces', kind: 'olive', density: 0.6, spacing: 12, polygon: [[-300, 380], [-200, 420], [-180, 560], [-340, 560]] },
];

export function groveGround(x, z) {
  if (inEventArea(x, z, 4)) return false;
  for (const zone of GARDEN_ZONES) {
    if (zone.kind === 'fruit' && insidePolygon(x, z, zone.polygon)) return true;
  }
  // Never in the way of a wall, a house or a pool.
  for (const wall of WALLS) {
    const pts = wall.vertices;
    const count = wall.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < count; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (segmentDistance(x, z, a.x, a.z, b.x, b.z) < wall.thickness / 2 + 9) return false;
    }
  }
  for (const pool of POOLS) if (Math.hypot(x - pool.x, z - pool.z) < Math.max(pool.w, pool.d) / 2 + 6) return false;
  if (Math.hypot(x - GIHON.x, z - GIHON.z) < 14) return false;
  if (Math.hypot(x - TOMBS_OF_DAVID.x, z - TOMBS_OF_DAVID.z) < 12) return false;
  // Not in the bed of the brook.
  const y = groundAt(x, z);
  const across = Math.min(groundAt(x - 16, z), groundAt(x + 16, z));
  if (y < across - 1.5) return false;
  return true;
}

let groveCache = null;
export function groves() {
  if (groveCache) return groveCache;
  const random = makeRandom(4440);
  const trees = [];
  for (const zone of GARDEN_ZONES) {
    const xs = zone.polygon.map((p) => p[0]);
    const zs = zone.polygon.map((p) => p[1]);
    const s = zone.spacing;
    for (let x = Math.min(...xs); x < Math.max(...xs); x += s) {
      const rowShift = (random() - 0.5) * s * 0.5;
      for (let z = Math.min(...zs); z < Math.max(...zs); z += s * 0.85) {
        const tx = x + (random() - 0.5) * s * 0.35;
        const tz = z + rowShift + (random() - 0.5) * s * 0.4;
        if (random() > zone.density) continue;
        if (!insidePolygon(tx, tz, zone.polygon)) continue;
        if (!groveGround(tx, tz)) continue;
        trees.push({ x: tx, z: tz, s: 0.75 + random() * 0.5, r: random() * Math.PI * 2, kind: zone.kind });
      }
    }
  }
  groveCache = trees;
  return trees;
}

export const trunkRadius = (s, girth = 0) => (0.3 + girth * 0.55) * s;
