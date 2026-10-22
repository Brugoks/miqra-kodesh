// Where a visitor can walk in Nehemiah's Jerusalem.
//
// The floor is the real ground (nehemiahDimensions.js groundAt, the same
// triangles the landscape draws) with three things standing on it that matter
// to a walker: the wall, which is solid, has ten gates in it that are not, and
// has a walkway along the top that can be reached by stairs; the Temple Mount,
// a platform levelled on the rock; and the city's ruins, which are in the way.
//
// Stacked surfaces. The wall and the ground under it share a ground plan, so
// `floorAt` returns whichever is nearer the height the question is asked from
// (sceneNavigation.js): from the street the answer is the street, from the
// walkway it is the walkway. The step rule does the rest — a stride that would
// change height by more than MAX_STEP is refused, so the edge of the wall is an
// edge with no geometry listed for it, and the stairs, rising at 0.3, are a
// ramp underfoot.
//
// The wall has three states (nehemiahWalls.js): a ruin, half a wall, a wall.
// A moment sets it with `setWallState`; the ruin can be walked through where it
// has fallen, the half wall cannot be climbed, and only the finished wall has
// a walkway. The same functions that draw it answer for it.
//
// Everything else that stops a walker at the same height is short: the wall,
// its towers, the houses, the Temple and its court, the pools, the trees and
// the rubble. The edges of the scene each explain themselves.

import { createNavigator, rectHit, createCircleIndex } from './sceneNavigation';
import {
  WALK, GATE, HOUSES, RUINS, GOVERNOR_SEAT, TOMBS_OF_DAVID, BROAD_WALL, POOLS, GIHON, DRAGON_SPRING,
  TEMPLE, MOUNT, RUBBLE_FIELDS, WALL_STATES, DEFAULT_WALL_STATE, TOWER_INFO,
  groundAt, groves, trunkRadius, insidePolygon, WALLS,
} from './nehemiahDimensions';
import {
  FEATURES, nearestWall, gateAt, wallTopAt, stairAt, ruinHeight, PROFILE_BY_ID,
} from './nehemiahWalls';

export const BODY_RADIUS = 0.45;
export const MAX_STEP = 0.5;

export const BARRIERS = {
  'city-wall': {
    id: 'city-wall',
    label: 'The Wall',
    body:
      'Six cubits thick and, here, sixteen high — Nehemiah gives no height. What he gives is the '
      + 'order of the work, gate by gate, and who built each stretch: priests, goldsmiths, '
      + 'perfumers, rulers of districts, a man and his daughters, and over and over, families '
      + 'working opposite their own front doors. It was finished on the twenty-fifth of Elul, in '
      + 'fifty-two days, and the nations around were afraid, because they saw that it had been '
      + 'done with the help of God.',
    refs: ['Nehemiah 3:1-32', 'Nehemiah 6:15-16'],
  },
  'mount-wall': {
    id: 'mount-wall',
    label: 'The Wall of the Temple Mount',
    body:
      'The Temple stands inside a platform of its own, shut off from the city by a wall with '
      + 'gates in it — the West Gate, the South Gate, the East Gate. Nehemiah’s first request to '
      + 'the king’s forester was for timber for the gates of the fortress by the Temple, for the '
      + 'wall of the city and for the house he would live in, and it says the king gave it, for '
      + 'the good hand of God was on him.',
    refs: ['Nehemiah 2:8', 'Nehemiah 3:29'],
  },
  'ruined-wall': {
    id: 'ruined-wall',
    label: 'The Broken Wall',
    body:
      'Stumps and breaches. Babylon pulled this wall down a hundred and forty years before, and '
      + 'for all that time the city had lain open to anyone who cared to walk in. When Nehemiah '
      + 'rode round it by night, he counted what was left: the walls of Jerusalem that were '
      + 'broken down, and its gates that had been destroyed by fire.',
    refs: ['Nehemiah 2:13', 'Nehemiah 1:3', '2 Kings 25:8-10'],
  },
  sanctuary: {
    id: 'sanctuary',
    label: 'The Second Temple',
    body:
      'Zerubbabel’s Temple, finished in the sixth year of Darius and dedicated with joy. The old '
      + 'men who had seen the first one wept aloud when its foundation was laid, and the '
      + 'prophet had told them it seemed as nothing in their eyes. Only priests went in; and in '
      + 'Nehemiah’s time its courts were most of what the city had left to be proud of.',
    refs: ['Ezra 6:15-16', 'Ezra 3:12', 'Haggai 2:3'],
  },
  'temple-court': {
    id: 'temple-court',
    label: 'The Court of the Temple',
    body:
      'The altar was the first thing set up when the exiles came back — before the foundation of '
      + 'the Temple was laid — because they were afraid of the peoples round them, and wanted '
      + 'the sacrifices going. Its smoke is the one thing in the city that never stopped. A court '
      + 'wall surrounds it; the gate is on the east, and the way in for anyone who is not a '
      + 'priest stops at the altar.',
    refs: ['Ezra 3:2-3', 'Nehemiah 10:32-39'],
  },
  rubble: {
    id: 'rubble',
    label: 'No Place to Pass',
    body:
      'On the east side, between the Fountain Gate and the King’s Pool, the fallen wall and the '
      + 'terraces that came down with it have buried the slope. Nehemiah was riding, at night, with '
      + 'a few men, and he says it plainly: there was no place for the animal that was under '
      + 'him to pass. So he went up the valley on foot, in the dark, looking at the wall.',
    refs: ['Nehemiah 2:14-15'],
  },
  pool: {
    id: 'pool',
    label: 'The Pools',
    body:
      'Hezekiah brought the Gihon’s water inside the city by a tunnel cut through the rock — '
      + 'five hundred metres, dug from both ends until the crews met — and let it out in a pool '
      + 'at the south. Nehemiah’s builders repaired the wall of the Pool of Shelah by the king’s '
      + 'garden, and further up the wall as far as the artificial pool.',
    refs: ['2 Chronicles 32:30', 'Nehemiah 3:15-16', 'Nehemiah 2:14'],
  },
  'broad-wall': {
    id: 'broad-wall',
    label: 'The Broad Wall',
    body:
      'Seven metres thick: Hezekiah’s wall, thrown up in a hurry when the Assyrians were coming, '
      + 'with the houses that stood in the way pulled down to supply its stone. It ran out across '
      + 'the Western Hill to take in a city that had overflowed. Nehemiah’s people repaired '
      + 'Jerusalem as far as it; and this, west of the line they drew, was left standing.',
    refs: ['Nehemiah 3:8', 'Nehemiah 12:38', 'Isaiah 22:9-10', '2 Chronicles 32:5'],
  },
  'governor-seat': {
    id: 'governor-seat',
    label: 'The Governor’s Seat',
    body:
      'Jerusalem was a small town in a Persian province called Beyond the River, and this is where '
      + 'the province’s governor sat when he came. The men of Gibeon and Mizpah repaired the '
      + 'stretch of wall up to it. Nehemiah himself was the governor of Judah, and for twelve '
      + 'years he did not claim the food allowance that was his due.',
    refs: ['Nehemiah 3:7', 'Nehemiah 5:14-18'],
  },
  'royal-ruin': {
    id: 'royal-ruin',
    label: 'The Kings’ Houses',
    body:
      'What is left of the houses of the kings of Judah: David’s palace over the spring, and above '
      + 'it the upper house the court of the guard belonged to. Jeremiah was held in that court '
      + 'during the last siege. A hundred and forty years on, the walls of the house of David are '
      + 'still the landmarks Nehemiah’s builders use to say where their stretch begins.',
    refs: ['Nehemiah 3:25', 'Nehemiah 12:37', 'Jeremiah 32:2'],
  },
  house: {
    id: 'house',
    label: 'Opposite His Own House',
    body:
      'Over and over Nehemiah 3 says the same thing: so-and-so repaired opposite his house. '
      + 'Priests above the Horse Gate, each before his own door. Jedaiah, Benjamin and Hasshub, '
      + 'Azariah. The city was wide and large, and the people in it few, and no houses had been '
      + 'rebuilt — which is why you can count the ones that had.',
    refs: ['Nehemiah 3:10', 'Nehemiah 3:23', 'Nehemiah 3:28-30', 'Nehemiah 7:4'],
  },
  'tombs-of-david': {
    id: 'tombs-of-david',
    label: 'The Tombs of David',
    body:
      'Across the valley, outside the wall, a stretch of it is marked in Nehemiah 3 only by what '
      + 'lies opposite: the tombs of David, the artificial pool, the house of the mighty men. '
      + 'David’s city was already a landscape of the dead — those are the things this '
      + 'generation uses to find their way round it.',
    refs: ['Nehemiah 3:16', '1 Kings 2:10'],
  },
  'western-hill': {
    id: 'western-hill',
    label: 'The Western Hill',
    body:
      'Where Hezekiah’s Jerusalem had spread to, and where the Babylonians’ fire had gone through '
      + 'every house in 586: the hill the wall does not enclose. Rubble and burned foundations, '
      + 'and so it would stay for centuries; the Hasmoneans were the next to build here. Nehemiah’s '
      + 'city was only the old one, on its ridge.',
    refs: ['Nehemiah 7:4', '2 Kings 25:9', 'Zephaniah 1:10-11'],
  },
  'the-kidron': {
    id: 'the-kidron',
    label: 'The Kidron',
    body:
      'The brook in the valley below the wall, and beyond it the Mount of Olives, terraced with '
      + 'olives and, in places, with graves. Nehemiah’s city looks east across it at a hill that '
      + 'has a scene of its own, five centuries on.',
    refs: ['2 Samuel 15:23', 'John 18:1'],
  },
  'north-edge': {
    id: 'north-edge',
    label: 'North of the Temple',
    body:
      'The hill goes on rising north of the Temple Mount, toward where an army would camp; every '
      + 'siege of Jerusalem came at it from this side, because it is the only side with no valley '
      + 'in front. A prophet had said the trouble would come out of the north, and the Babylonians '
      + 'had come out of it.',
    refs: ['Jeremiah 1:14', 'Nehemiah 3:1'],
  },
  hinnom: {
    id: 'hinnom',
    label: 'The Valley of Hinnom',
    body:
      'Where the city’s refuse went, which is what the Dung Gate is named for, and where, in '
      + 'worse centuries, children were burned. It wraps the foot of the city’s ridge and runs '
      + 'on to meet the Kidron at the spring called En-rogel.',
    refs: ['Nehemiah 2:13', '2 Kings 23:10', 'Joshua 15:8'],
  },
};

// --- the wall's state ---------------------------------------------------------------

let wallState = DEFAULT_WALL_STATE;
export function setWallState(state) {
  wallState = WALL_STATES.includes(state) ? state : DEFAULT_WALL_STATE;
  return wallState;
}
export const getWallState = () => wallState;

// --- what is underfoot ---------------------------------------------------------------

const MARGIN = 6;

function inRect(x, z, r, pad = 0) {
  const c = Math.cos(r.yaw || 0);
  const s = Math.sin(r.yaw || 0);
  const dx = x - r.x;
  const dz = z - r.z;
  const u = dx * c - dz * s;
  const v = dx * s + dz * c;
  return Math.abs(u) <= r.w / 2 + pad && Math.abs(v) <= r.d / 2 + pad;
}

const insideCity = (() => {
  const polygon = WALLS[0].vertices.map((p) => [p.x, p.z]);
  return (x, z) => insidePolygon(x, z, polygon);
})();

export function regionAt(x, z, height) {
  if (height !== undefined && height > groundAt(x, z) + 1.4) return 'wall';
  if (gateAt(x, z)) return 'gate';
  if (insidePolygon(x, z, MOUNT.polygon)) return 'mount';
  if (insideCity(x, z)) return 'city';
  if (x < -300) return 'hill';
  if (x > 40 && groundAt(x, z) < groundAt(x - 30, z) - 3) return 'kidron';
  return 'slope';
}

export function floorAt(x, z, fromHeight = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (x < WALK.x0 - MARGIN || x > WALK.x1 + MARGIN || z < WALK.z0 - MARGIN || z > WALK.z1 + MARGIN) return null;
  // Surfaces stack: the ground, the foot of a flight of stairs, the walkway
  // over it. Of those within a stride of where the question is asked from, the
  // highest is the one stood on — a stair's first tread is a hand's breadth
  // above the ground it starts from, and the ground is not the better answer
  // for being nearer. If none is within a stride, the nearest, which the step
  // rule will then refuse.
  const surfaces = [{ height: groundAt(x, z), region: null }];
  if (wallState === 'built') {
    const top = wallTopAt(x, z);
    if (top) surfaces.push({ height: top.height, region: 'wall' });
  }
  // The stairs are the finished wall's: a ruin has none, a half wall is climbed
  // by ladder, and nobody climbs a ladder in this scene.
  const stair = wallState === 'built' ? stairAt(x, z) : null;
  if (stair) surfaces.push({ height: stair.height, region: 'stair' });
  let reachable = null;
  let nearest = surfaces[0];
  for (const surface of surfaces) {
    const gap = Math.abs(surface.height - fromHeight);
    if (gap <= MAX_STEP && (!reachable || surface.height > reachable.height)) reachable = surface;
    if (gap < Math.abs(nearest.height - fromHeight)) nearest = surface;
  }
  const chosen = reachable || nearest;
  return { height: chosen.height, region: chosen.region || regionAt(x, z) };
}

// How shut in a point is: the gate passages are short tunnels of stone. The
// soundscape closes a lowpass on the weather by it (Scene.jsx).
export function enclosureAt(x, z, height = 0) {
  if (height > groundAt(x, z) + 1.4) return 0;
  const gate = gateAt(x, z);
  if (!gate) return 0;
  // A tunnel of stone only under a finished wall's lintel.
  return wallState === 'built' ? 0.55 : 0.1;
}

// --- what is in the way ----------------------------------------------------------------

// Where a feature's own frame puts a point: along the wall, and out from it.
function inFrame(feature, x, z) {
  const dx = x - feature.x;
  const dz = z - feature.z;
  return { along: dx * feature.tx + dz * feature.tz, lateral: dx * feature.nx + dz * feature.nz };
}

const WALL_BARRIER = { city: 'city-wall', 'mount-west': 'mount-wall', 'mount-south': 'mount-wall', 'mount-east': 'mount-wall' };

function wallBlock(x, z) {
  const hit = nearestWall(x, z);
  if (!hit) return null;
  const { profile, s, distance } = hit;
  // The wall is a capsule round its centre line, thick as it is.
  if (distance >= profile.wall.thickness / 2 + BODY_RADIUS) return null;
  // A gate is a way through.
  if (gateAt(x, z, BODY_RADIUS)) return null;
  if (wallState === 'ruin') return ruinHeight(profile, s) > 0.7 ? 'ruined-wall' : null;
  return WALL_BARRIER[profile.wall.id];
}

// The towers and the gates' flanking towers: solid masses outside the wall's
// outer face, in the two built states.
function towerBlock(x, z) {
  if (wallState === 'ruin') return null;
  for (const feature of FEATURES) {
    const dx = x - feature.x;
    const dz = z - feature.z;
    if (Math.abs(dx) > 16 || Math.abs(dz) > 16) continue;
    const half = PROFILE_BY_ID[feature.wall].wall.thickness / 2;
    const { along, lateral } = inFrame(feature, x, z);
    if (feature.kind === 'tower') {
      const info = TOWER_INFO[feature.id];
      if (Math.abs(along) <= info.width / 2 + BODY_RADIUS && lateral >= -half - BODY_RADIUS && lateral <= half + info.project + BODY_RADIUS) return 'city-wall';
    } else if (feature.kind === 'gate') {
      if (Math.abs(along) >= GATE.width / 2 - BODY_RADIUS && Math.abs(along) <= GATE.width / 2 + GATE.flankWidth + BODY_RADIUS
        && lateral >= half - 0.1 && lateral <= half + GATE.flank + BODY_RADIUS) return 'city-wall';
    }
  }
  return null;
}

// The Temple: its house, its court's wall (broken by the east gate), its altar.
const T = TEMPLE;
const COURT = T.court;
const HOUSE_RECT = [T.x, T.x + T.length + T.porch, T.z - T.width / 2, T.z + T.width / 2, 'sanctuary'];
const COURT_WALLS = [
  [COURT.x0, COURT.x1, COURT.z0, COURT.z0 + COURT.wall / 2, 'temple-court'],
  [COURT.x0, COURT.x1, COURT.z1 - COURT.wall / 2, COURT.z1, 'temple-court'],
  [COURT.x0, COURT.x0 + COURT.wall / 2, COURT.z0, COURT.z1, 'temple-court'],
  [COURT.x1 - COURT.wall / 2, COURT.x1, COURT.z0, T.courtGate.z0, 'temple-court'],
  [COURT.x1 - COURT.wall / 2, COURT.x1, T.courtGate.z1, COURT.z1, 'temple-court'],
];
const ALTAR = T.altar;
const RECTS = [
  HOUSE_RECT,
  ...COURT_WALLS,
  [ALTAR.x - ALTAR.half, ALTAR.x + ALTAR.half, ALTAR.z - ALTAR.half, ALTAR.z + ALTAR.half, 'temple-court'],
  [BROAD_WALL.x0, BROAD_WALL.x1, BROAD_WALL.z - BROAD_WALL.thickness / 2, BROAD_WALL.z + BROAD_WALL.thickness / 2, 'broad-wall'],
  [GOVERNOR_SEAT.x - GOVERNOR_SEAT.half, GOVERNOR_SEAT.x + GOVERNOR_SEAT.half, GOVERNOR_SEAT.z - GOVERNOR_SEAT.half, GOVERNOR_SEAT.z + GOVERNOR_SEAT.half, 'governor-seat'],
];

const ROTATED = [
  ...HOUSES.map((h) => ({ ...h, barrier: 'house' })),
  ...RUINS.map((r) => ({ ...r, barrier: 'royal-ruin' })),
  ...POOLS.map((p) => ({ ...p, barrier: 'pool' })),
  { ...TOMBS_OF_DAVID, id: 'tombs', yaw: 0, barrier: 'tombs-of-david' },
];

const roundThings = createCircleIndex([
  ...groves().map((tree) => ({ x: tree.x, z: tree.z, radius: trunkRadius(tree.s), id: 'olive' })),
  { x: GIHON.x, z: GIHON.z, radius: 2.4, id: 'pool' },
  { x: DRAGON_SPRING.x, z: DRAGON_SPRING.z, radius: DRAGON_SPRING.radius, id: 'pool' },
]);

function rubbleBlock(x, z) {
  for (const field of RUBBLE_FIELDS) {
    if (!field.blocks) continue;
    const u = (x - field.x) / (field.rx + BODY_RADIUS);
    const v = (z - field.z) / (field.rz + BODY_RADIUS);
    if (u * u + v * v < 1) return 'rubble';
  }
  return null;
}

export function blockerAt(x, z, height) {
  if (x < WALK.x0) return 'western-hill';
  if (x > WALK.x1) return 'the-kidron';
  if (z < WALK.z0) return 'north-edge';
  if (z > WALK.z1) return 'hinnom';
  // On the walkway or high on a flight of stairs the ground-level things —
  // the wall's footprint, houses, trees — are below the visitor's feet.
  if (height !== undefined && height > groundAt(x, z) + 1.4) return null;
  const wall = wallBlock(x, z) || towerBlock(x, z);
  if (wall) return wall;
  // A flight is masonry: once its treads are above head height you cannot
  // walk through the place it stands.
  const stair = wallState === 'built' ? stairAt(x, z) : null;
  if (stair && stair.height > groundAt(x, z) + 0.6 && (height === undefined || stair.height - height > 0.6)) return 'city-wall';
  for (const r of ROTATED) if (inRect(x, z, r, BODY_RADIUS)) return r.barrier;
  return rectHit(RECTS, x, z, BODY_RADIUS) || rubbleBlock(x, z) || roundThings(x, z, BODY_RADIUS);
}

const navigator = createNavigator({ floorAt, blockerAt, maxStep: MAX_STEP, bodyRadius: BODY_RADIUS });

export const { stanceAt, move, groundPointAlongRay } = navigator;
