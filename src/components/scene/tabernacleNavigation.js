// Where a visitor can walk at the Tabernacle.
//
// Flat desert, one level, and almost all of the interest in the thresholds. The
// whole structure is an argument about access: a court with exactly one gate, a
// tent only priests entered, and behind a curtain a room one man went into once
// a year and not without blood. Two of those three are barriers here, and both
// of them explain themselves when you meet them.
//
// The one that is deliberately *not* a barrier is the door of the tent. Letting
// a visitor into the Holy Place is a small liberty — the text is clear that
// only priests went in — but everything worth seeing is in there, and a hotspot
// at the door says plainly whose place it was.

import { createNavigator, rectHit, createCircleIndex } from './sceneNavigation';
import {
  LEVEL,
  COURT,
  COURT_GATE,
  TENT,
  VEIL_Z,
  BRONZE_ALTAR,
  LAVER,
  TABLE,
  LAMPSTAND,
  INCENSE_ALTAR,
  DESERT,
  campTents,
} from './tabernacleDimensions';

export const BODY_RADIUS = 0.45;
export const MAX_STEP = 0.5;

export const BARRIERS = {
  veil: {
    id: 'veil',
    label: 'The Veil',
    body:
      'Blue, purple and scarlet on fine twined linen, with cherubim worked into it, hung on '
      + 'four pillars of gold. Behind it is a room ten cubits every way containing one object, '
      + 'and the high priest went in once a year, on one day, carrying blood, having filled the '
      + 'room with incense smoke so that he would not see what he was not to see. Everyone else '
      + 'in the history of Israel stopped exactly where you are standing.',
    refs: ['Exodus 26:31-33', 'Leviticus 16:2', 'Hebrews 9:6-8', 'Matthew 27:51'],
  },
  'court-hanging': {
    id: 'court-hanging',
    label: 'The Hangings',
    body:
      'Fine twined linen, five cubits high, right the way round — a hundred cubits by fifty with '
      + 'one opening in it. You cannot climb in, and you are not meant to look for a second way. '
      + 'The gate is twenty cubits wide, in the middle of the east end, and it is the only one.',
    refs: ['Exodus 27:9-16'],
  },
  desert: {
    id: 'desert',
    label: 'The Wilderness',
    body:
      'Beyond the camp there is nothing for a very long way. Israel was out here for forty years '
      + 'with this tent at the centre of the arrangement, taking it down and putting it up again '
      + 'every time the cloud moved, which is the point Numbers keeps making: the dwelling was '
      + 'portable because the people were not staying.',
    refs: ['Numbers 9:15-23', 'Exodus 40:36-38'],
  },
};

// --- what is underfoot ----------------------------------------------------

// Desert, all of it, all the way out to where the scene stops. The Tabernacle
// has no stairs, no platform and no upper floor — it stood on the ground.
export function floorAt(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (Math.abs(x) > DESERT.halfX) return null;
  if (z < DESERT.zSouth || z > DESERT.zNorth) return null;
  return { height: LEVEL.ground, region: 'desert' };
}

// --- what is in the way ---------------------------------------------------

const HANGING = 0.06;
const WALL = TENT.boardThickness;

const RECTS = [
  // The court hangings: three closed sides, and an east end broken only by the
  // gate. Written as runs rather than a box so the gap is real.
  [COURT.halfX - HANGING, COURT.halfX + HANGING, COURT.zWest, COURT.zEast, 'court-hanging'],
  [-COURT.halfX - HANGING, -COURT.halfX + HANGING, COURT.zWest, COURT.zEast, 'court-hanging'],
  [-COURT.halfX, COURT.halfX, COURT.zWest - HANGING, COURT.zWest + HANGING, 'court-hanging'],
  [-COURT.halfX, -COURT_GATE.halfX, COURT.zEast - HANGING, COURT.zEast + HANGING, 'court-hanging'],
  [COURT_GATE.halfX, COURT.halfX, COURT.zEast - HANGING, COURT.zEast + HANGING, 'court-hanging'],

  // The boarded walls of the tent. Its east end is the screen, which is cloth,
  // and which you walk through.
  [TENT.halfX - WALL, TENT.halfX + WALL, TENT.zWest, TENT.zEast, 'tent-wall'],
  [-TENT.halfX - WALL, -TENT.halfX + WALL, TENT.zWest, TENT.zEast, 'tent-wall'],
  [-TENT.halfX, TENT.halfX, TENT.zWest - WALL, TENT.zWest + WALL, 'tent-wall'],

  // The veil. Ten cubits from the west end, across the full width.
  [-TENT.halfX, TENT.halfX, VEIL_Z - 0.05, VEIL_Z + 0.05, 'veil'],

  // Furniture.
  [
    BRONZE_ALTAR.x - BRONZE_ALTAR.half, BRONZE_ALTAR.x + BRONZE_ALTAR.half,
    BRONZE_ALTAR.z - BRONZE_ALTAR.half, BRONZE_ALTAR.z + BRONZE_ALTAR.half, 'altar',
  ],
  [
    TABLE.x - TABLE.width / 2, TABLE.x + TABLE.width / 2,
    TABLE.z - TABLE.depth / 2, TABLE.z + TABLE.depth / 2, 'table',
  ],
  [
    INCENSE_ALTAR.x - INCENSE_ALTAR.half, INCENSE_ALTAR.x + INCENSE_ALTAR.half,
    INCENSE_ALTAR.z - INCENSE_ALTAR.half, INCENSE_ALTAR.z + INCENSE_ALTAR.half, 'incense-altar',
  ],
];

// The posts of the court and the pillars of the two screens are deliberately
// not solid. They stand at two-and-a-half and one-and-a-quarter cubit spacings,
// and with a body radius on top the gate would be a squeeze through a gap of a
// few centimetres — which is a fight with the controls, not an encounter with
// the architecture. The hangings between them are what stops you.
const roundThings = createCircleIndex([
  { x: LAVER.x, z: LAVER.z, radius: LAVER.radius, id: 'laver' },
  { x: LAMPSTAND.x, z: LAMPSTAND.z, radius: 0.42, id: 'lampstand' },
  ...campTents().map((tent) => ({ x: tent.x, z: tent.z, radius: tent.radius * 0.8, id: 'tent' })),
]);

export function blockerAt(x, z) {
  return rectHit(RECTS, x, z, BODY_RADIUS) || roundThings(x, z, BODY_RADIUS);
}

const navigator = createNavigator({ floorAt, blockerAt, maxStep: MAX_STEP, bodyRadius: BODY_RADIUS });

export const { stanceAt, move, groundPointAlongRay } = navigator;
