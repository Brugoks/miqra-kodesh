// Where a visitor can walk in Capernaum.
//
// This is the first scene with stacked surfaces: the room where the paralytic
// was lowered and the roof they dug through occupy the same ground plan, so
// `floorAt` returns whichever of them is nearer the height the question is
// asked from. Everything else — stepping, sliding, the step rule that keeps you
// from strolling off a roof — comes from sceneNavigation.js.
//
// Blockers are asked at a height too, because a house wall is a wall in the
// lane and a floor on the roof.

import { createNavigator, rectHit, createCircleIndex } from './sceneNavigation';
import {
  LEVEL,
  SHORE,
  VILLAGE,
  INSULA,
  HOUSE,
  COURTYARD,
  COURTYARD_ENTRY,
  ROOF_OPENING,
  ROOF_STAIR,
  SYNAGOGUE,
  BLOCKS,
  TAX_BOOTH,
  BOATS,
  QUAYSIDE,
  YARD_THINGS,
  TREES,
} from './capernaumDimensions';

export const BODY_RADIUS = 0.45;
export const MAX_STEP = 0.5;

// Above this you are on a roof or the stair up to one, and the village below is
// something you are standing over rather than walking through.
const ROOF_THRESHOLD = 2.6;

export const BARRIERS = {
  water: {
    id: 'water',
    label: 'The Lake',
    body:
      'The Sea of Galilee is a road, not a boundary — Capernaum lived off it. Four of the '
      + 'twelve were pulled out of a working life on this water, and the boats drawn up behind '
      + 'you are the kind they left. To go further you would need one of them.',
    refs: ['Mark 1:16-20', 'Luke 5:1-11'],
  },
  'roof-opening': {
    id: 'roof-opening',
    label: 'The Hole in the Roof',
    body:
      'Beams, brushwood and packed earth — a Capernaum roof was made of exactly the materials '
      + 'you could dig through, and four men did. The house was so crowded there was no room '
      + 'left, not even at the door, so they went up the outside stair and took the roof apart '
      + 'over Jesus’ head and let their friend down on his mat into the room below. Look down '
      + 'through it.',
    refs: ['Mark 2:1-12', 'Luke 5:17-26'],
  },
  'village-edge': {
    id: 'village-edge',
    label: 'The Edge of the Village',
    body:
      'The reconstruction stops here; the real site runs further along the shore in both '
      + 'directions. Capernaum was never large — a fishing village of a few hundred people on '
      + 'the road between Damascus and the coast, which is why it had a customs post and a '
      + 'garrison, and why a man of the world like Matthew was sitting at a tax booth in it.',
    refs: ['Matthew 4:13', 'Matthew 9:9'],
  },
};

// --- what is underfoot ----------------------------------------------------

const between = (v, a, b) => v >= a && v <= b;
const inside = (x, z, r, x0, x1, z0, z1) => x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r;

// The surface, or surfaces, present at a point. The roof of the insula sits
// over the courtyard and the one enterable room, so those coordinates have two.
function surfacesAt(x, z) {
  const found = [];
  const onStair = inside(x, z, 0, ROOF_STAIR.x0, ROOF_STAIR.x1, ROOF_STAIR.zTop, ROOF_STAIR.zBottom);

  // Ground family: the lake, the beach, the ramp up, and everything inland.
  // Suppressed under the stair, which is solid masonry, not a bridge.
  if (!onStair && Math.abs(x) <= VILLAGE.halfX) {
    if (between(z, -140, SHORE.beachSouth)) {
      // Deliberately just below the beach rather than at the drawn water
      // level: a 60cm drop would trip the step rule and report a cliff, when
      // what is actually there is the lake, and the lake has something to say.
      found.push({ height: LEVEL.beach - 0.05, region: 'lake' });
    } else if (z <= SHORE.beachNorth) {
      found.push({ height: LEVEL.beach, region: 'beach' });
    } else if (z <= SHORE.rampNorth) {
      const climbed = (z - SHORE.beachNorth) / (SHORE.rampNorth - SHORE.beachNorth);
      found.push({ height: LEVEL.beach + climbed * (LEVEL.ground - LEVEL.beach), region: 'shore-ramp' });
    } else if (z <= VILLAGE.zNorth) {
      // The synagogue stands on a podium reached by steps from the south.
      if (inside(x, z, 0, SYNAGOGUE.podiumX0, SYNAGOGUE.podiumX1, SYNAGOGUE.podiumZ0, SYNAGOGUE.podiumZ1)) {
        found.push({ height: LEVEL.platform, region: 'synagogue-podium' });
      } else if (inside(x, z, 0, SYNAGOGUE.podiumX0, SYNAGOGUE.podiumX1, SYNAGOGUE.stepsZ0, SYNAGOGUE.stepsZ1)) {
        const climbed = (z - SYNAGOGUE.stepsZ0) / (SYNAGOGUE.stepsZ1 - SYNAGOGUE.stepsZ0);
        found.push({ height: LEVEL.ground + climbed * (LEVEL.platform - LEVEL.ground), region: 'synagogue-steps' });
      } else {
        found.push({ height: LEVEL.ground, region: 'village' });
      }
    }
  }

  // The outside stair up the east wall of the insula.
  if (onStair) {
    const climbed = (ROOF_STAIR.zBottom - z) / (ROOF_STAIR.zBottom - ROOF_STAIR.zTop);
    found.push({ height: LEVEL.ground + climbed * (LEVEL.roof - LEVEL.ground), region: 'roof-stair' });
  }

  // The roof itself — the whole insula footprint except the open courtyard,
  // which has no roof over it by definition.
  if (
    inside(x, z, 0, INSULA.x0, INSULA.x1, INSULA.z0, INSULA.z1)
    && !inside(x, z, 0, COURTYARD.x0, COURTYARD.x1, COURTYARD.z0, COURTYARD.z1)
  ) {
    found.push({ height: LEVEL.roof, region: 'roof' });
  }

  return found;
}

// How enclosed a point is, 0 for open air and 1 for a room with a roof on it.
// Used by the soundscape (src/lib/sceneAudio.js) to shut the lake and the wind
// out as you step through the door — which is most of what tells you, without
// looking up, that you have gone inside.
//
// Only one place in this scene is genuinely enclosed: the room under the
// insula roof, which is the room in Mark 2 with more people in it than it
// holds and four men on the roof above. Standing in it is the whole point of
// the scene, so it is worth the ears noticing.
export function enclosureAt(x, z, height = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  // On the roof you are outside again, however far in you stand.
  if (height > LEVEL.ground + 1) return 0;
  if (!inside(x, z, 0, HOUSE.x0, HOUSE.x1, HOUSE.z0, HOUSE.z1)) return 0;
  // Eased at the walls rather than switched, so a doorway is a threshold and
  // not a step change; the hole in the roof lets a little of the outside back
  // in, which is the one thing that room is famous for.
  const margin = 1.2;
  const toEdge = Math.min(
    x - HOUSE.x0, HOUSE.x1 - x, z - HOUSE.z0, HOUSE.z1 - z,
  );
  return Math.min(1, Math.max(0, toEdge / margin)) * 0.82;
}

// Picks the surface nearest the height the walker is asking from, which is what
// keeps someone on the roof on the roof and someone in the room in the room.
export function floorAt(x, z, fromHeight = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const surfaces = surfacesAt(x, z);
  if (surfaces.length === 0) return null;
  let best = surfaces[0];
  for (const surface of surfaces) {
    if (Math.abs(surface.height - fromHeight) < Math.abs(best.height - fromHeight)) best = surface;
  }
  return best;
}

// --- what is in the way ---------------------------------------------------

const BLOCK_RECTS = BLOCKS.map((b) => [b.x0, b.x1, b.z0, b.z1, b.id]);
const QUAY_RECTS = QUAYSIDE.map((q) => [q.x - q.w / 2, q.x + q.w / 2, q.z - q.d / 2, q.z + q.d / 2, q.id]);
const BOAT_RECTS = BOATS.filter((b) => b.beached).map((b) => [b.x - 2.2, b.x + 2.2, b.z - 4.4, b.z + 4.4, 'boat']);
const TAX_RECT = [[TAX_BOOTH.x0, TAX_BOOTH.x1, TAX_BOOTH.z0, TAX_BOOTH.z1, 'tax-booth']];

const roundThings = createCircleIndex([
  ...YARD_THINGS.map((t) => ({ x: t.x, z: t.z, radius: t.radius, id: t.id })),
  ...TREES.map((t) => ({ x: t.x, z: t.z, radius: t.kind === 'palm' ? 0.5 : 0.9, id: 'tree' })),
]);

// The insula is solid masonry except for the courtyard, the one room that can
// be entered, and the two openings that connect them to each other and to the
// lane. Written as "in the block, but not in any of the holes".
function insulaBlocks(x, z, r) {
  // The stair is built against this wall, so its treads are not the wall.
  if (inside(x, z, 0, ROOF_STAIR.x0, ROOF_STAIR.x1, ROOF_STAIR.zTop, ROOF_STAIR.zBottom)) return false;
  if (!inside(x, z, r, INSULA.x0, INSULA.x1, INSULA.z0, INSULA.z1)) return false;
  if (inside(x, z, -r, COURTYARD.x0, COURTYARD.x1, COURTYARD.z0, COURTYARD.z1)) return false;
  if (inside(x, z, -r, HOUSE.x0, HOUSE.x1, HOUSE.z0, HOUSE.z1)) return false;
  // Doorways: narrowed by the shoulders in X, but open right through the wall
  // thickness in Z, so a visitor can actually pass rather than bounce.
  if (x > HOUSE.doorX0 + r && x < HOUSE.doorX1 - r && between(z, HOUSE.z1 - 0.6, COURTYARD.z0 + 0.6)) return false;
  if (x > COURTYARD_ENTRY.x0 + r && x < COURTYARD_ENTRY.x1 - r && between(z, COURTYARD.z1 - 0.6, INSULA.z1 + 0.6)) return false;
  return true;
}

function synagogueBlocks(x, z, r) {
  if (!inside(x, z, r, SYNAGOGUE.x0, SYNAGOGUE.x1, SYNAGOGUE.z0, SYNAGOGUE.z1)) return false;
  const inX = SYNAGOGUE.x0 + SYNAGOGUE.wall;
  const inZ0 = SYNAGOGUE.z0 + SYNAGOGUE.wall;
  const inZ1 = SYNAGOGUE.z1 - SYNAGOGUE.wall;
  if (inside(x, z, -r, inX, SYNAGOGUE.x1 - SYNAGOGUE.wall, inZ0, inZ1)) return false;
  if (x > SYNAGOGUE.doorX0 + r && x < SYNAGOGUE.doorX1 - r && between(z, SYNAGOGUE.z0 - 0.6, inZ0 + 0.6)) return false;
  return true;
}

export function blockerAt(x, z, height = 0) {
  // On the roof and the stair, the village below is something you are standing
  // over. The only thing up here that stops you is the hole they dug.
  if (height >= ROOF_THRESHOLD) {
    return inside(x, z, BODY_RADIUS, ROOF_OPENING.x0, ROOF_OPENING.x1, ROOF_OPENING.z0, ROOF_OPENING.z1)
      ? 'roof-opening'
      : null;
  }

  if (z <= SHORE.beachSouth + BODY_RADIUS) return 'water';

  if (insulaBlocks(x, z, BODY_RADIUS)) return 'house';
  if (synagogueBlocks(x, z, BODY_RADIUS)) return 'synagogue-wall';

  return (
    rectHit(BLOCK_RECTS, x, z, BODY_RADIUS)
    || rectHit(TAX_RECT, x, z, BODY_RADIUS)
    || rectHit(QUAY_RECTS, x, z, BODY_RADIUS)
    || rectHit(BOAT_RECTS, x, z, BODY_RADIUS)
    || roundThings(x, z, BODY_RADIUS)
  );
}

const navigator = createNavigator({ floorAt, blockerAt, maxStep: MAX_STEP, bodyRadius: BODY_RADIUS });

export const { stanceAt, move, groundPointAlongRay } = navigator;
export { surfacesAt };
