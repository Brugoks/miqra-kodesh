// Where a visitor can walk on the Mount of Olives.
//
// All of it is hillside: the floor is the real ground (olivetDimensions.js
// groundAt, the same triangles the landscape draws), and the step rule does
// what it does everywhere else — a stride that would change height by more
// than MAX_STEP is refused, which on this ground means nothing but the
// quarried faces round the tombs and the edge of the press yard.
//
// What stops a walker at the same height is short: the garden's wall (with
// its gates), the olive trunks, the press and the monuments. Everything else
// is the edge of the scene, and each edge explains itself — the brook on the
// west, beyond which is the city and another scene; the road on to Bethany;
// the rest of the Mount north and south.

import { createNavigator, rectHit, createCircleIndex } from './sceneNavigation';
import {
  WALK,
  GARDEN,
  GARDEN_OLIVES,
  PRAYER_ROCK,
  PRESS,
  TOMBS,
  HILLSIDE_TOMBS,
  FIGS,
  FARMSTEAD,
  TOMB_LEVELS,
  campTents,
  groundAt,
  groveOlives,
  roadDistance,
  trunkRadius,
} from './olivetDimensions';

export const BODY_RADIUS = 0.45;
export const MAX_STEP = 0.5;

export const BARRIERS = {
  'the-brook': {
    id: 'the-brook',
    label: 'The Brook Kidron',
    body:
      'A winter torrent, dry for most of the year, in the bottom of the valley between the Mount '
      + 'and the city. David crossed it barefoot and weeping when Absalom took Jerusalem, and '
      + 'kings who purged the Temple burned what they threw out of it here. John is precise that '
      + 'Jesus crossed it on the night he was betrayed. Across it the ground climbs to the east '
      + 'wall of the Temple — which has a scene of its own.',
    refs: ['John 18:1', '2 Samuel 15:23', '2 Chronicles 29:16'],
  },
  'the-road-to-bethany': {
    id: 'the-road-to-bethany',
    label: 'The Road to Bethany',
    body:
      'Over the top, the road runs down the Mount’s eastern side to Bethany, about fifteen '
      + 'stadia from Jerusalem — under two miles — and on through the desert to Jericho. Jesus '
      + 'stayed at Bethany through the last week and walked this way into the city each '
      + 'morning. Luke ends his gospel here: he led them out as far as Bethany, lifted up his '
      + 'hands, and blessed them.',
    refs: ['John 11:18', 'Mark 11:11-12', 'Luke 24:50-51', 'Luke 10:30'],
  },
  'the-mount': {
    id: 'the-mount',
    label: 'The Mount',
    body:
      'The ridge runs on north and south of here, a mile and more of it, terraced with olives '
      + 'and cut with tombs — the hill east of the city that Ezekiel saw the glory of the Lord '
      + 'stop on as it left the Temple, and that Zechariah says will split in two under the '
      + 'Lord’s feet. This walk keeps to its western face, opposite the Temple.',
    refs: ['Ezekiel 11:23', 'Zechariah 14:4'],
  },
  'garden-wall': {
    id: 'garden-wall',
    label: 'The Garden',
    body:
      'John calls it a garden, and says Jesus went there often with his disciples, which is how '
      + 'Judas knew where to bring the soldiers. Mark and Matthew give its name, Gethsemane — '
      + 'the oil press. A low wall of field stones round an olive grove; the ways in are gaps in '
      + 'it, one toward the brook and one toward the road.',
    refs: ['John 18:1-2', 'Mark 14:32', 'Luke 22:39'],
  },
  farmstead: {
    id: 'farmstead',
    label: 'The House by the Road',
    body:
      'A farmhouse on the road over the top of the Mount, its door toward the road. Mark says the '
      + 'two disciples found the colt tied at a door, outside in the street, and that some of the '
      + 'people standing there asked what they were doing, untying it.',
    refs: ['Mark 11:2-6'],
  },
  'the-tomb': {
    id: 'the-tomb',
    label: 'The Tombs',
    body:
      'Monuments cut out of the Mount’s own rock and left standing, facing the Temple across '
      + 'the valley. Days earlier, in the Temple, Jesus had said: you build the tombs of the '
      + 'prophets and decorate the monuments of the righteous, and say, if we had lived in the '
      + 'days of our fathers, we would not have taken part in shedding their blood.',
    refs: ['Matthew 23:29-31', 'Luke 11:47-48'],
  },
};

// --- what is underfoot ----------------------------------------------------

// Past the walkable ground the floor carries on for a few metres, so that the
// edge is met as a barrier with something to say rather than as a drop.
const MARGIN = 6;

function inside(x, z, rect, pad = 0) {
  const c = Math.cos(-rect.angle || 0);
  const s = Math.sin(-rect.angle || 0);
  const dx = x - rect.x;
  const dz = z - rect.z;
  const u = dx * c - dz * s;
  const v = dx * s + dz * c;
  return Math.abs(u) <= rect.halfX + pad && Math.abs(v) <= rect.halfZ + pad;
}

// The press yard is paved level at its own highest corner: a low step up from
// the slope on its downhill sides.
export const PRESS_LEVEL = Math.max(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
  const c = Math.cos(PRESS.angle);
  const s = Math.sin(PRESS.angle);
  const u = a * PRESS.halfX;
  const v = b * PRESS.halfZ;
  return groundAt(PRESS.x + u * c - v * s, PRESS.z + u * s + v * c);
})) + 0.05;

// Each monument's court, quarried level round it (olivetDimensions.js).
export { TOMB_LEVELS };
const TOMB_COURTS = [
  { id: 'absalom', x: TOMBS.absalom.x, z: TOMBS.absalom.z, halfX: TOMBS.absalom.half + TOMBS.absalom.court, halfZ: TOMBS.absalom.half + TOMBS.absalom.court },
  { id: 'zechariah', x: TOMBS.zechariah.x, z: TOMBS.zechariah.z, halfX: TOMBS.zechariah.half + TOMBS.zechariah.court, halfZ: TOMBS.zechariah.half + TOMBS.zechariah.court },
];

export function regionAt(x, z) {
  if (inside(x, z, PRESS)) return 'press';
  if (roadDistance(x, z).distance < 2.4) return 'road';
  if (gardenContains(x, z)) return 'garden';
  if (x < -60) return 'kidron';
  return 'slope';
}

export function floorAt(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (x < WALK.x0 - MARGIN || x > WALK.x1 + MARGIN || z < WALK.z0 - MARGIN || z > WALK.z1 + MARGIN) return null;
  if (inside(x, z, PRESS)) return { height: PRESS_LEVEL, region: 'press' };
  for (const court of TOMB_COURTS) {
    if (inside(x, z, court)) return { height: TOMB_LEVELS[court.id], region: 'tombs' };
  }
  const rock = PRAYER_ROCK;
  if (inside(x, z, rock)) return { height: groundAt(rock.x, rock.z) + rock.rise, region: 'garden' };
  return { height: groundAt(x, z), region: regionAt(x, z) };
}

// --- what is in the way ---------------------------------------------------

// The garden wall as segments, broken at the gates: [ax, az, bx, bz].
export function gardenWallSegments() {
  const segments = [];
  const { corners, gates } = GARDEN;
  corners.forEach(([ax, az], i) => {
    const [bx, bz] = corners[(i + 1) % corners.length];
    const length = Math.hypot(bx - ax, bz - az);
    const openings = gates.filter(([side]) => side === i).map(([, from, to]) => [from, to]).sort((p, q) => p[0] - q[0]);
    let start = 0;
    for (const [from, to] of [...openings, [length, length]]) {
      if (from > start) {
        const t0 = start / length;
        const t1 = from / length;
        segments.push([ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1]);
      }
      start = to;
    }
  });
  return segments;
}
const WALL_SEGMENTS = gardenWallSegments();

function gardenContains(x, z) {
  // A convex quadrilateral: inside if on the same side of every edge.
  const { corners } = GARDEN;
  let sign = 0;
  for (let i = 0; i < corners.length; i += 1) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % corners.length];
    const cross = (bx - ax) * (z - az) - (bz - az) * (x - ax);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

function segmentDistance(x, z, [ax, az, bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

// Every trunk on the hillside and in the garden, and the round things: the
// press basin and the monuments' own blocks.
const roundThings = createCircleIndex([
  ...groveOlives().map((tree) => ({ x: tree.x, z: tree.z, radius: trunkRadius(tree.s), id: 'olive' })),
  ...GARDEN_OLIVES.map(([x, z, girth]) => ({ x, z, radius: trunkRadius(1, girth), id: 'olive' })),
  {
    x: PRESS.x + PRESS.basin.dx * Math.cos(PRESS.angle) - PRESS.basin.dz * Math.sin(PRESS.angle),
    z: PRESS.z + PRESS.basin.dx * Math.sin(PRESS.angle) + PRESS.basin.dz * Math.cos(PRESS.angle),
    radius: PRESS.basin.radius,
    id: 'press',
  },
  ...HILLSIDE_TOMBS.map(([x, z]) => ({ x, z, radius: 1.6, id: 'the-tomb' })),
  ...FIGS.map(([x, z, size]) => ({ x, z, radius: 0.35 * size, id: 'fig' })),
  // A tent as three circles along its length.
  ...campTents().flatMap((tent) => [-1, 0, 1].map((k) => ({
    x: tent.x + Math.sin(tent.facing) * k * (tent.length / 3),
    z: tent.z + Math.cos(tent.facing) * k * (tent.length / 3),
    radius: tent.width / 2,
    id: 'tent',
  }))),
]);

// The monuments, and the rock faces quarried round them on three sides.
const RECTS = [
  [TOMBS.absalom.x - TOMBS.absalom.half, TOMBS.absalom.x + TOMBS.absalom.half, TOMBS.absalom.z - TOMBS.absalom.half, TOMBS.absalom.z + TOMBS.absalom.half, 'the-tomb'],
  [TOMBS.zechariah.x - TOMBS.zechariah.half, TOMBS.zechariah.x + TOMBS.zechariah.half, TOMBS.zechariah.z - TOMBS.zechariah.half, TOMBS.zechariah.z + TOMBS.zechariah.half, 'the-tomb'],
  // The farmhouse: solid, door and all.
  [FARMSTEAD.x0, FARMSTEAD.x1, FARMSTEAD.z0, FARMSTEAD.z1, 'farmstead'],
  // The Bene Hezir porch is cut into the face: its front is the barrier.
  [TOMBS.hezir.x, TOMBS.hezir.x + TOMBS.hezir.depth + 2, TOMBS.hezir.z - TOMBS.hezir.width / 2 - 1, TOMBS.hezir.z + TOMBS.hezir.width / 2 + 1, 'the-tomb'],
  // The quarried scarps behind the two monoliths.
  ...TOMB_COURTS.flatMap((court) => [
    [court.x + court.halfX, court.x + court.halfX + 1.2, court.z - court.halfZ, court.z + court.halfZ, 'the-tomb'],
    [court.x - court.halfX, court.x + court.halfX + 1.2, court.z - court.halfZ - 1.2, court.z - court.halfZ, 'the-tomb'],
    [court.x - court.halfX, court.x + court.halfX + 1.2, court.z + court.halfZ, court.z + court.halfZ + 1.2, 'the-tomb'],
  ]),
];

// The press's beam and the back of its yard, as rotated rectangles.
function pressBlocker(x, z) {
  const c = Math.cos(-PRESS.angle);
  const s = Math.sin(-PRESS.angle);
  const dx = x - PRESS.x;
  const dz = z - PRESS.z;
  const u = dx * c - dz * s;
  const v = dx * s + dz * c;
  const { beam } = PRESS;
  const r = BODY_RADIUS;
  // The beam and the baskets under it.
  if (Math.abs(v - beam.dz) < 0.9 + r && u > beam.dx - beam.length / 2 - r && u < beam.dx + beam.length / 2 + r) return 'press';
  // The rock face at the back (uphill, east) of the yard.
  if (u > PRESS.halfX - 0.6 - r && u < PRESS.halfX + 1.5 && Math.abs(v) < PRESS.halfZ + 1.5) return 'press';
  return null;
}

export function blockerAt(x, z) {
  if (x < WALK.x0) return 'the-brook';
  if (x > WALK.x1) return 'the-road-to-bethany';
  if (z < WALK.z0 || z > WALK.z1) return 'the-mount';
  for (const segment of WALL_SEGMENTS) {
    if (segmentDistance(x, z, segment) < GARDEN.wallThickness / 2 + BODY_RADIUS) return 'garden-wall';
  }
  return rectHit(RECTS, x, z, BODY_RADIUS) || pressBlocker(x, z) || roundThings(x, z, BODY_RADIUS);
}

const navigator = createNavigator({ floorAt, blockerAt, maxStep: MAX_STEP, bodyRadius: BODY_RADIUS });

export const { stanceAt, move, groundPointAlongRay } = navigator;
