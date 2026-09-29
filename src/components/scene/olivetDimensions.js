// The measurements of the Mount of Olives scene, in one place.
//
// Both the geometry (buildOlivet.js, olivetLandscape.js, olivetCity.js) and
// the collision model (olivetNavigation.js) read from here, so what is drawn
// and what is solid cannot drift apart.
//
// Axes: +X east, -Z north, +Y up, metres, from the rock the Church of All
// Nations is built round (31.7797 N, 35.2398 E). That is the right-handed way
// round — facing north, east is on your right — and it matters more here than
// anywhere: this scene is a view, and a +Z-north frame would show the city in
// a mirror, the Antonia on the wrong side of the Temple. The ground is real
// elevation data (scripts/build-olivet-landscape.py); y = 0 is the ground at
// Gethsemane, 707 m above the sea.
//
// Where the first-century features stand is set by the terrain rather than by
// the modern street plan: the Kidron's bed is where the elevation model's bed
// is, the Temple platform's east wall is where the plateau falls away to it,
// and the Temple's sanctuary stands on the rock under the Dome of the Rock.

import { GROUND } from './olivetGroundData.js';
import { triangleHeight } from './sceneLandscape.js';

export const EYE_HEIGHT = 1.7;

// --- the ground -----------------------------------------------------------------

// The elevation model is of the modern surface; a few places are reshaped to
// the first century before anything stands on them. Applied per grid point,
// to the walkable grid here and to the whole grid in the landscape, so the
// ground drawn and the ground walked stay the same triangles.
const rawGroundAt = (x, z) => triangleHeight(GROUND, x, z);

// The monuments in the Kidron stand in courts quarried down into the foot of
// the slope, level with the valley's bed: each court's floor is the lowest
// ground just round it.
const lowestRaw = (x, z, r) => Math.min(rawGroundAt(x - r, z), rawGroundAt(x + r, z), rawGroundAt(x, z - r), rawGroundAt(x, z + r));
// Filled in below, once TOMBS is defined.
export const TOMB_LEVELS = {};
const TOMB_REACH = 13;

export function shapeGround(x, z, height) {
  let h = height;
  for (const [id, level] of Object.entries(TOMB_LEVELS)) {
    const tomb = TOMBS[id];
    if (Math.hypot(x - tomb.x, z - tomb.z) < TOMB_REACH) h = Math.min(h, level);
  }
  if (insidePolygon(x, z, PLATFORM.corners)) h = PLATFORM.level - 0.3;
  return h;
}

export function insidePolygon(x, z, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, zi] = points[i];
    const [xj, zj] = points[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

let shapedGround = null;
function shaped() {
  if (shapedGround) return shapedGround;
  const { x0, z0, step, nx } = GROUND;
  shapedGround = {
    ...GROUND,
    heights: GROUND.heights.map((h, k) => shapeGround(x0 + (k % nx) * step, z0 + Math.floor(k / nx) * step, h)),
  };
  return shapedGround;
}

// The ground a visitor walks on: the baked grid's own triangles, so a foot
// meets exactly the surface drawn (see sceneLandscape.js triangleHeight).
export function groundAt(x, z) {
  return triangleHeight(shaped(), x, z);
}

// Where a visitor may go: the Kidron's west bank to just past the summit, the
// Mount's north shoulder to the tombs. The edges are barriers with prose.
export const WALK = { x0: -150, x1: 630, z0: -280, z1: 460 };

// --- the road -------------------------------------------------------------------
// The way down from Bethphage: south along the top of the ridge, over the
// brow, and steeply down the western face to the Kidron — the descent Luke
// 19:37 names — then across the brook toward the city. Points are [x, z].
export const ROAD = {
  width: 3.4,
  points: [
    [640, -160], [600, -70], [556, 10], [512, 72], [452, 112], [380, 138], [300, 158],
    [222, 168], [152, 158], [98, 128], [58, 90], [32, 56], [6, 44], [-40, 46], [-86, 50],
    [-128, 56], [-170, 62],
  ],
};

// Distance from (x, z) to the road's centre line, and how far along it (m).
export function roadDistance(x, z, points = ROAD.points) {
  let best = Infinity;
  let along = 0;
  let travelled = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (length * length)));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) {
      best = d;
      along = travelled + t * length;
    }
    travelled += length;
  }
  return { distance: best, along };
}

// --- Gethsemane -----------------------------------------------------------------
// "A place called Gethsemane" (Mark 14:32) — gat shemanim, an oil press — "where
// there was a garden" (John 18:1), across the Kidron. An olive grove inside a
// dry-stone wall at the foot of the slope, with a gate toward the brook and one
// toward the road, the press yard just outside its north wall.
export const GARDEN = {
  // Corners, walked round in order; the wall is WALL_HEIGHT above the ground.
  corners: [[-36, -34], [34, -38], [42, 30], [-30, 36]],
  wallHeight: 1.05,
  wallThickness: 0.7,
  // Openings as [side index, from, to] in metres along that side.
  gates: [[3, 30, 34], [2, 30, 34.5], [0, 36, 39.5]],
};

// The rock where tradition has him pray, a stone's throw beyond the three
// (Luke 22:41). A low shelf of bedrock with a flat top.
export const PRAYER_ROCK = { x: 6, z: -8, halfX: 2.3, halfZ: 1.6, rise: 0.45, angle: 0.25 };

// The ancient trees inside the wall: few, huge and hollow-hearted, as the
// eight at the Church of All Nations still are. [x, z, girth].
export const GARDEN_OLIVES = [
  [-26, -24, 1], [-12, -28, 0.9], [4, -30, 1], [22, -30, 0.85], [28, -16, 0.95],
  [-24, -8, 0.9], [-4, -18, 0.8], [20, 4, 1], [30, 16, 0.9], [-22, 12, 0.95],
  [-6, 14, 0.85], [8, 22, 1], [24, 28, 0.8], [-16, 28, 0.9],
];

// The press, in a yard cut level into the slope. The crushing basin with its
// upright stone wheel, and the beam press: a long beam anchored in the rock at
// one end, the baskets of crushed olives under it, and stone weights hung from
// the other end. `level` is set from the ground (the yard's highest corner).
export const PRESS = {
  x: -14,
  z: -62,
  halfX: 7,
  halfZ: 5,
  angle: -0.12,
  basin: { dx: -2.6, dz: 0.4, radius: 1.05, height: 0.75 },
  // The beam runs from its free end, where the weights hang, into a socket
  // in the rock face at the back of the yard; the baskets sit under it
  // `frails` along.
  beam: { dx: 2.0, dz: -1.8, length: 9.2, frails: 3.8 },
};

// --- the Kidron tombs -----------------------------------------------------------
// Three monuments cut from the Mount's own rock at the foot of its west face,
// facing the Temple across the bed of the brook. Measurements from the
// surviving monuments; each stands in a court quarried round it.
export const TOMBS = {
  // Yad Avshalom: a rock-cut cube with engaged Ionic columns and a Doric frieze,
  // under a built drum and a concave cone. Probably of Jesus' own century.
  absalom: { x: -82, z: 298, half: 3.4, cube: 6.5, drum: 3.2, cone: 10.3, court: 4.5, facing: -Math.PI / 2 },
  // The tomb of the Bene Hezir, a priestly family (1 Chronicles 24:15): a
  // Doric porch of two columns cut into the cliff, with their names over it.
  hezir: { x: -70, z: 342, width: 8.6, height: 6.2, depth: 3.1, facing: -Math.PI / 2 },
  // The monolith called Zechariah's tomb: a cube with Ionic columns under a
  // pyramid, cut from the rock and never hollowed out.
  zechariah: { x: -74, z: 366, half: 2.6, cube: 5.4, pyramid: 3.8, court: 3.2, facing: -Math.PI / 2 },
};

TOMB_LEVELS.absalom = lowestRaw(TOMBS.absalom.x, TOMBS.absalom.z, TOMBS.absalom.half + TOMBS.absalom.court);
TOMB_LEVELS.hezir = lowestRaw(TOMBS.hezir.x, TOMBS.hezir.z, 3);
TOMB_LEVELS.zechariah = lowestRaw(TOMBS.zechariah.x, TOMBS.zechariah.z, TOMBS.zechariah.half + TOMBS.zechariah.court);

// Graves on the slope: a family tomb cut in a rock face, its doorway closed
// with a square stone. The necropolis the Franciscans dug at Dominus Flevit
// held ossuaries of exactly this generation. [x, z, facing].
export const HILLSIDE_TOMBS = [
  [118, 178, -1.35], [132, 196, -1.5], [86, 212, -1.2], [178, 214, -1.6], [210, 120, -1.45],
];

// --- the Temple, across the valley ------------------------------------------------
// The Herodian platform, a quadrilateral round the plateau the elevation data
// shows: its east wall where the ground falls to the Kidron, its south wall
// where the Ophel drops away. Corners in order NE, SE, SW, NW.
export const PLATFORM = {
  level: 33,
  corners: [[-228, -114], [-228, 372], [-508, 364], [-540, -118]],
};

// The Temple scene's own frame (templeDimensions.js: +X north, +Z east) set
// down on the platform: the Holy of Holies over the rock under the Dome of the
// Rock (-430, 185), the sanctuary looking due east up the Mount. temple (tx,
// tz) sits at olivet (TX + tz, TZ - tx). The eastern gate is on this axis —
// the line the priest burning the red heifer on the Mount looked down to see
// the sanctuary's door (Mishnah Middot 2:4).
export const TEMPLE_FRAME = { x: -383, z: 185 };
export function templeToOlivet(tx, tz) {
  return { x: TEMPLE_FRAME.x + tz, z: TEMPLE_FRAME.z - tx };
}

// The Antonia on its rock at the platform's north-west corner: four towers,
// the south-east one taller, to see the whole Temple from (Josephus, War
// 5.238-245).
export const ANTONIA = { x0: -540, x1: -428, z0: -168, z1: -116, body: 20, tower: 25, tallTower: 35 };

// Herod's palace and its three towers on the west side of the upper city,
// the skyline's other landmark: Phasael, Hippicus, Mariamne (War 5.161-175).
export const HEROD_TOWERS = [
  { id: 'phasael', x: -1100, z: 342, half: 10, height: 45 },
  { id: 'hippicus', x: -1128, z: 322, half: 6.5, height: 40 },
  { id: 'mariamne', x: -1078, z: 318, half: 5.5, height: 27 },
];

// The city walls, as polylines [x, z]: the first wall round the upper city and
// down the eastern ridge to Siloam; the second round the northern quarter to
// the Antonia. Heights above the ground they stand on.
export const CITY_WALLS = [
  { id: 'east', height: 11, points: [[-236, 380], [-262, 520], [-296, 680], [-336, 860], [-372, 1000], [-430, 1060]] },
  { id: 'south', height: 10, points: [[-430, 1060], [-560, 1020], [-760, 900], [-960, 800], [-1140, 700]] },
  { id: 'west', height: 12, points: [[-1140, 700], [-1150, 520], [-1130, 360]] },
  { id: 'first-north', height: 12, points: [[-1130, 360], [-940, 300], [-760, 260], [-600, 250], [-540, 250]] },
  { id: 'second', height: 11, points: [[-980, 318], [-980, 120], [-900, -60], [-760, -170], [-600, -176], [-540, -168]] },
];

// Where the city's houses are, as polygons [x, z]: the lower city down the
// eastern ridge, the Tyropoeon, the upper city, the northern quarter inside
// the second wall, and the new suburb of Bezetha spilling north outside it.
export const CITY_QUARTERS = [
  { id: 'lower', density: 1, points: [[-244, 390], [-500, 380], [-560, 700], [-440, 1040], [-372, 996], [-300, 690]] },
  { id: 'upper', density: 0.8, points: [[-560, 260], [-1120, 380], [-1130, 690], [-760, 890], [-560, 700], [-520, 390]] },
  { id: 'north', density: 0.9, points: [[-560, 236], [-560, -160], [-900, -50], [-970, 130], [-970, 300]] },
  { id: 'bezetha', density: 0.35, points: [[-240, -150], [-420, -190], [-560, -200], [-700, -420], [-420, -560], [-240, -400]] },
];

// --- the life of the Mount at Passover ------------------------------------------
// Pilgrims could not all sleep inside the city: they camped on the hills round
// it, and Luke says Jesus lodged on this one (21:37). Tent camps on the gentler
// shoulders, each with its fire. [x, z, radius, tents].
export const CAMPS = [
  { id: 'north-shoulder', x: 150, z: -190, radius: 26, tents: 7 },
  { id: 'north-high', x: 360, z: -210, radius: 22, tents: 5 },
  { id: 'south-slope', x: 170, z: 330, radius: 24, tents: 6 },
  { id: 'summit-east', x: 590, z: -120, radius: 20, tents: 5 },
];

// Each camp's tents: black goat-hair, pitched round the fire facing in.
// Deterministic, because a tent is solid and the navigation needs the same
// ones the builder draws. { x, z, length, width, height, facing }.
export function campTents() {
  const random = makeRandom(1717);
  return CAMPS.flatMap((camp) => Array.from({ length: camp.tents }, (_, i) => {
    const a = (i / camp.tents) * Math.PI * 2 + random() * 0.5;
    const r = camp.radius * (0.5 + random() * 0.35);
    const x = camp.x + Math.cos(a) * r;
    const z = camp.z + Math.sin(a) * r;
    return {
      camp: camp.id, x, z, length: 3.6 + random() * 2.6, width: 2.6 + random() * 0.8, height: 1.8 + random() * 0.4,
      // Long side toward the fire.
      facing: Math.atan2(camp.x - x, camp.z - z) + Math.PI / 2,
    };
  }));
}

// The fig trees by the road, putting out their leaves: "when its branch
// becomes tender and puts out its leaves, you know that summer is near"
// (Mark 13:28), said on this hillside. [x, z, size].
export const FIGS = [[470, 92, 1.1], [347, 174, 1], [200, 184, 0.95], [566, -40, 1.05], [80, 108, 0.9]];

// A farmhouse on the road over the top, where the colt was found tied at the
// door (Mark 11:4): stone walls, a flat roof, its door toward the road.
export const FARMSTEAD = { x0: 606, x1: 614, z0: -66, z1: -50, height: 3.2, door: { z0: -59.2, z1: -57.8 } };

// A threshing floor on the summit: the barley harvest began at Passover, with
// the first sheaf waved in the Temple (Leviticus 23:10-11).
export const THRESHING_FLOOR = { x: 588, z: 70, radius: 7 };

// Where each staged moment stands (olivetEvents.js). Kept clear of trees,
// the camps' people and props, which are placed without knowing which moment
// is staged.
export const EVENT_GROUND = {
  'the-colt': { x: 598, z: -58, r: 16 },
  'triumphal-entry': { x: 345, z: 147, r: 24 },
  weeping: { x: 150, z: 158, r: 14 },
  'fig-tree': { x: 472, z: 98, r: 12 },
  'olivet-discourse': { x: 338, z: 182, r: 12 },
  lodged: { x: 12, z: -112, r: 14 },
  'across-the-kidron': { x: -86, z: 50, r: 14 },
  gethsemane: { x: -6, z: 4, r: 30 },
  'the-arrest': { x: -22, z: 6, r: 26 },
  ascension: { x: 522, z: 48, r: 18 },
};

// Standpoints worth a clear view: a clearing round each, and for the view
// across to the Temple a wedge cut down the slope toward it, where olive
// crowns just below the eye would otherwise fill the bottom of the frame.
export const VIEW_CLEARINGS = [
  { x: 262, z: 186, r: 16, toward: [-440, 185], length: 60, spread: 0.42 },
  { x: 380, z: 140, r: 10, toward: [-300, 200], length: 40, spread: 0.3 },
  { x: 548, z: 30, r: 12 },
];

// Ground kept clear of groves, camps and props: the road, the garden, the
// press, the tombs, and where each vantage and staged moment stands.
export const CLEARINGS = [
  ...Object.values(EVENT_GROUND),
  ...VIEW_CLEARINGS.map(({ x, z, r }) => ({ x, z, r })),
  { x: 0, z: 0, r: 46 }, // the garden and round it
  { x: PRESS.x, z: PRESS.z, r: 12 },
  { x: TOMBS.absalom.x, z: TOMBS.absalom.z, r: 16 },
  { x: TOMBS.hezir.x, z: TOMBS.hezir.z, r: 12 },
  { x: TOMBS.zechariah.x, z: TOMBS.zechariah.z, r: 12 },
  { x: THRESHING_FLOOR.x, z: THRESHING_FLOOR.z, r: 14 },
  { x: (FARMSTEAD.x0 + FARMSTEAD.x1) / 2, z: (FARMSTEAD.z0 + FARMSTEAD.z1) / 2, r: 14 },
  ...HILLSIDE_TOMBS.map(([x, z]) => ({ x, z, r: 6 })),
];

// --- the olive groves ------------------------------------------------------------
// The Mount's name. Terraced groves over the whole western face, thinning on
// the summit, where barley grows instead, and absent from the Kidron's bed.
// Generated here, deterministically, because the trunks are solid and the
// navigation needs the same trees the landscape draws. Each is { x, z, s, r }
// — size and a turn.

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export const GROVE_SPACING = 10.5;

// Whether a spot is open ground for a tree: not on the road or in a clearing,
// not in the brook's bed, not on the summit's fields.
export function groveGround(x, z, extraClearings = []) {
  if (roadDistance(x, z).distance < ROAD.width / 2 + 2.6) return false;
  for (const c of [...CLEARINGS, ...extraClearings]) if (Math.hypot(x - c.x, z - c.z) < c.r) return false;
  for (const view of VIEW_CLEARINGS) {
    if (!view.toward) continue;
    const dx = x - view.x;
    const dz = z - view.z;
    const distance = Math.hypot(dx, dz);
    if (distance > view.length) continue;
    const heading = Math.atan2(view.toward[1] - view.z, view.toward[0] - view.x);
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dz, dx) - heading), Math.cos(Math.atan2(dz, dx) - heading)));
    if (off < view.spread) return false;
  }
  const y = groundAt(x, z);
  // The Kidron's bed: the lowest ground within twenty metres either side.
  const across = Math.min(groundAt(x - 20, z), groundAt(x + 20, z));
  if (y < across + 1.2 && x < 20) return false;
  // The summit plateau is barley.
  if (y > 96) return false;
  return true;
}

let groveCache = null;
export function groveOlives() {
  if (groveCache) return groveCache;
  const random = makeRandom(3010);
  const trees = [];
  const s = GROVE_SPACING;
  // Rows along the contour: the slope's own fall line is roughly west, so the
  // terraces run north-south, and each row is jittered a little along itself.
  for (let x = WALK.x0 + 4; x < WALK.x1; x += s) {
    const rowShift = (random() - 0.5) * s * 0.5;
    for (let z = WALK.z0 + 2; z < WALK.z1; z += s * 0.85) {
      const tx = x + (random() - 0.5) * s * 0.35;
      const tz = z + rowShift + (random() - 0.5) * s * 0.4;
      const keep = random();
      if (keep < 0.14) continue; // a gap, a dead tree cut out, a patch of vines
      if (tx < WALK.x0 || tx > WALK.x1 || tz < WALK.z0 || tz > WALK.z1) continue;
      if (!groveGround(tx, tz)) continue;
      trees.push({ x: tx, z: tz, s: 0.75 + random() * 0.5, r: random() * Math.PI * 2 });
    }
  }
  groveCache = trees;
  return trees;
}

// A trunk's collision radius at a tree's size.
export const trunkRadius = (s, girth = 0) => (0.3 + girth * 0.55) * s;
