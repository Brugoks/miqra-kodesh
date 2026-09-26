// A sabbath in the synagogue at Capernaum: Mark 1:21–28, Luke 4:31–37.
//
// "And they went into Capernaum, and immediately on the Sabbath he entered the
// synagogue and was teaching. And they were astonished at his teaching, for he
// taught them as one who had authority, and not as the scribes. And
// immediately there was in their synagogue a man with an unclean spirit. And
// he cried out, 'What have you to do with us, Jesus of Nazareth? Have you come
// to destroy us? I know who you are — the Holy One of God.' But Jesus rebuked
// him, saying, 'Be silent, and come out of him!'"
//
// The third of Capernaum's tableaux, built as the other two are (see
// mark2Tableau.js and matthew9Tableau.js): a fixed cast of real skinned
// characters and their furniture, held as one composition. What it holds is
// the instant of the rebuke. Jesus is seated, as a teacher sat (Luke 4:20),
// by the reading table in the middle of the nave, with his right hand raised
// toward the man; the man is standing in the nave in the grip of the spirit,
// back arched and hands clawed; the congregation on the benches round the
// walls has half-risen, leaned away or leaned in. Two scribes sit apart with
// their arms folded — Mark's own contrast, "not as the scribes". The attendant
// (Luke 4:20's hazzan) stands at the scroll, and a ruler of the synagogue
// (Mark 5:22 names one, very probably of this synagogue) watches beside it.
//
// On what is interpretive. Where people sat, what they wore and how they held
// themselves are reconstruction; so is the seating of women, who attended
// (Luke 13:10–17) but whose place in the room is not known — here they sit
// with a child near the door. That Jesus sat to teach follows Luke 4:20 and
// the practice it describes. The benches, the reading table and the painted
// walls are modelled on the first-century synagogues excavated at Magdala and
// Gamla (see capernaumDimensions.js SYNAGOGUE_HALL).
//
// The same room holds a second moment, John 6: the bread of life, taught "in
// the synagogue, as he taught at Capernaum" (John 6:59), and what followed —
// "after this many of his disciples turned back and no longer walked with
// him", and Peter's "Lord, to whom shall we go?" Only one of the two is ever
// staged (see capernaumEvents.js), so they share the room's furniture.
//
// Both are built on sceneTableau.js. three.js is passed in, so the module
// stays importable in jsdom.

import {
  SYNAGOGUE, SYNAGOGUE_HALL, SYNAGOGUE_BENCHES, SYNAGOGUE_BENCH_BAND, READING_TABLE,
} from './capernaumDimensions.js';
import { createTableau, wave, SEAT_DROP } from './sceneTableau.js';
import { COMMON_POSES, SEATED_LEGS } from './tableauPoses.js';

export { POSE_SECONDS } from './sceneTableau.js';

const F = SYNAGOGUE_HALL.floor;
const { tier } = SYNAGOGUE_BENCHES;
const HALL = SYNAGOGUE_HALL;
const FRONT = {
  west: HALL.x0 + SYNAGOGUE_BENCH_BAND,
  east: HALL.x1 - SYNAGOGUE_BENCH_BAND,
  north: HALL.z1 - SYNAGOGUE_BENCH_BAND,
  south: HALL.z0 + SYNAGOGUE_BENCH_BAND,
};
// Seated on a bench: tier 1 is the front tier, tier 2 the higher one behind.
const benchWest = (z, t = 1) => [FRONT.west - 0.2 - (t - 1) * SYNAGOGUE_BENCHES.depth, F + tier * t - SEAT_DROP, z];
const benchEast = (z, t = 1) => [FRONT.east + 0.2 + (t - 1) * SYNAGOGUE_BENCHES.depth, F + tier * t - SEAT_DROP, z];
const benchNorth = (x, t = 1) => [x, F + tier * t - SEAT_DROP, FRONT.north + 0.2 + (t - 1) * SYNAGOGUE_BENCHES.depth];
const benchSouth = (x, t = 1) => [x, F + tier * t - SEAT_DROP, FRONT.south - 0.2 - (t - 1) * SYNAGOGUE_BENCHES.depth];

// Where the teacher sits: just north of the reading table, facing down the
// hall toward the door, on a stone seat.
export const TEACHER_SEAT = { x: READING_TABLE.x, z: READING_TABLE.z + 1.9, top: F + 0.44 };
// Where the man stands: in the nave between the teacher and the door.
export const POSSESSED_AT = [READING_TABLE.x + 0.7, F, READING_TABLE.z - 2.5];
const toward = (p) => [p[0], p[2]];
const JESUS_AT = [TEACHER_SEAT.x, F - 0.02, TEACHER_SEAT.z];

export const SYNAGOGUE_CAST = [
  { id: 'jesus', model: 'human-jesus', pose: 'rebuke', position: JESUS_AT, target: toward(POSSESSED_AT), principal: true, seat: 'teacher' },
  { id: 'possessed', model: 'human-traveler', pose: 'convulse', position: POSSESSED_AT, target: [JESUS_AT[0], JESUS_AT[2]], principal: true },
  // The attendant at the scroll, and a ruler of the synagogue beside the table.
  { id: 'attendant', model: 'human-artisan', pose: 'attend', position: [READING_TABLE.x - 1.05, F, READING_TABLE.z + 0.2], target: [READING_TABLE.x, READING_TABLE.z], audience: false },
  { id: 'ruler', model: 'human-villager', pose: 'stern', position: [READING_TABLE.x + 2.3, F, READING_TABLE.z + 1.4], target: toward(POSSESSED_AT) },
  // The scribes, apart on the east benches, arms folded.
  { id: 'scribe-a', model: 'human-artisan', pose: 'skeptic', position: benchEast(38.1), target: [READING_TABLE.x, 39.5], audience: true },
  { id: 'scribe-b', model: 'human-villager', pose: 'skeptic', position: benchEast(39.3), target: [READING_TABLE.x, 39.8], audience: true, phase: 1.7 },
  // The congregation.
  { id: 'west-a', model: 'human-villager', pose: 'startled', position: benchWest(35.8), target: toward(POSSESSED_AT), audience: true, phase: 0.6 },
  { id: 'west-b', model: 'human-traveler', pose: 'leanIn', position: benchWest(37.4), target: [JESUS_AT[0], JESUS_AT[2]], audience: true, phase: 2.2 },
  { id: 'west-c', model: 'human-artisan', pose: 'listen', position: benchWest(40.6), target: [JESUS_AT[0], JESUS_AT[2]], audience: true, phase: 3.1 },
  { id: 'west-high', model: 'human-traveler', pose: 'startled', position: benchWest(38.9, 2), target: toward(POSSESSED_AT), audience: true, phase: 4.4 },
  { id: 'east-a', model: 'human-traveler', pose: 'startled', position: benchEast(34.4), target: toward(POSSESSED_AT), audience: true, phase: 1.1 },
  { id: 'east-high', model: 'human-artisan', pose: 'leanIn', position: benchEast(41.3, 2), target: [JESUS_AT[0], JESUS_AT[2]], audience: true, phase: 2.9 },
  { id: 'north-a', model: 'human-villager', pose: 'listen', position: benchNorth(-22.1), target: [JESUS_AT[0], JESUS_AT[2] - 1], audience: true, phase: 0.3 },
  { id: 'north-b', model: 'human-traveler', pose: 'leanIn', position: benchNorth(-15.9), target: [JESUS_AT[0], JESUS_AT[2] - 1], audience: true, phase: 3.8 },
  // The man nearest him has got up and backed away from him.
  { id: 'recoil', model: 'human-villager', pose: 'recoil', position: [POSSESSED_AT[0] - 1.4, F, POSSESSED_AT[2] - 1.0], target: toward(POSSESSED_AT), audience: true },
  // Two on the floor at the front, kneeling on mats.
  { id: 'kneel-a', model: 'human-artisan', pose: 'kneelListen', position: [READING_TABLE.x - 1.9, F, READING_TABLE.z - 1.4], target: [JESUS_AT[0], JESUS_AT[2]], audience: true, mat: true, phase: 1.4 },
  { id: 'kneel-b', model: 'human-traveler', pose: 'kneelStartled', position: [READING_TABLE.x - 2.2, F, READING_TABLE.z - 2.8], target: toward(POSSESSED_AT), audience: true, mat: true, phase: 2.6 },
  // Women by the door, and a child.
  { id: 'woman-a', model: 'human-tabernacle-camp-woman', pose: 'startled', position: benchSouth(-15.2), target: toward(POSSESSED_AT), audience: true, veil: 0x8a4b3c, phase: 0.9 },
  { id: 'woman-b', model: 'human-tabernacle-camp-woman', pose: 'listen', position: benchSouth(-14.0), target: [JESUS_AT[0], JESUS_AT[2]], audience: true, veil: 0xd8cdb4, phase: 3.3 },
  { id: 'child', model: 'human-villager', pose: 'kneelStartled', position: [-14.6, F, FRONT.south + 0.55], target: toward(POSSESSED_AT), audience: true, scale: 0.64, mat: true, phase: 0.2 },
];

// John 6:59–69. Jesus seated where he taught; the twelve close to him, Peter
// on his feet in front of him; some of those who had followed him on their
// way out of the door; the rest of the room arguing it out — "How can this
// man give us his flesh to eat?" (6:52).
const PETER = { Cloth: 0x5f6f7e };
const ME = [JESUS_AT[0], JESUS_AT[2]];
const DOOR = [(SYNAGOGUE.doorX0 + SYNAGOGUE.doorX1) / 2, SYNAGOGUE.z0];
export const BREAD_CAST = [
  { id: 'jesus', model: 'human-jesus', pose: 'teachSeated', position: JESUS_AT, target: [JESUS_AT[0], 34], principal: true, seat: 'teacher' },
  { id: 'peter', model: 'human-artisan', pose: 'confess', position: [JESUS_AT[0] + 0.9, F, JESUS_AT[2] - 1.3], target: ME, principal: true, tint: PETER },
  // The twelve, nearest him.
  { id: 'andrew', model: 'human-traveler', pose: 'standListen', position: [JESUS_AT[0] - 1.3, F, JESUS_AT[2] - 1.1], target: ME },
  { id: 'john', model: 'human-villager', pose: 'kneelListen', position: [JESUS_AT[0] - 1.05, F, JESUS_AT[2] - 1.75], target: ME, mat: true, phase: 2 },
  { id: 'james', model: 'human-traveler', pose: 'standListen', position: [JESUS_AT[0] + 1.7, F, JESUS_AT[2] - 0.9], target: ME, phase: 1.1 },
  { id: 'disciple', model: 'human-artisan', pose: 'stern', position: [JESUS_AT[0] - 2.1, F, JESUS_AT[2] - 0.2], target: ME, phase: 3 },
  // Going.
  { id: 'leaving-a', model: 'human-villager', pose: 'leave', position: [-19.9, F, 36.6], target: [DOOR[0] - 0.4, DOOR[1]], principal: true },
  { id: 'leaving-b', model: 'human-traveler', pose: 'leaveLook', position: [-16.9, F, 37.2], target: [DOOR[0] + 0.3, DOOR[1]], principal: true, phase: 0.8 },
  { id: 'leaving-c', model: 'human-artisan', pose: 'leave', position: [-20.6, F, 38.1], target: [DOOR[0] + 0.6, DOOR[1]], phase: 1.6 },
  // Arguing on the benches.
  { id: 'west-a', model: 'human-villager', pose: 'dispute', position: benchWest(36.2), target: [-19, 36.9], audience: true, phase: 0.4 },
  { id: 'west-b', model: 'human-artisan', pose: 'skeptic', position: benchWest(37.3), target: [-19, 37.3], audience: true, phase: 1.3 },
  { id: 'west-c', model: 'human-traveler', pose: 'listen', position: benchWest(40.2), target: ME, audience: true, phase: 2.2 },
  { id: 'west-high', model: 'human-villager', pose: 'dispute', position: benchWest(38.6, 2), target: [-19, 39.4], audience: true, phase: 3.4 },
  { id: 'east-a', model: 'human-artisan', pose: 'dispute', position: benchEast(35.8), target: [-19, 35.2], audience: true, phase: 0.7 },
  { id: 'east-b', model: 'human-traveler', pose: 'skeptic', position: benchEast(37.0), target: [-19, 37.0], audience: true, phase: 1.9 },
  { id: 'east-high', model: 'human-villager', pose: 'leanIn', position: benchEast(40.4, 2), target: ME, audience: true, phase: 2.8 },
  { id: 'north-a', model: 'human-traveler', pose: 'listen', position: benchNorth(-23.4), target: [JESUS_AT[0], JESUS_AT[2] - 1], audience: true, phase: 0.2 },
  { id: 'woman-a', model: 'human-tabernacle-camp-woman', pose: 'listen', position: benchSouth(-15.2), target: ME, audience: true, veil: 0x6f5a48, phase: 1.5 },
];

// Keep anything placed at random out of the hall.
export function inSynagogueTableauArea(x, z) {
  return x > SYNAGOGUE.x0 && x < SYNAGOGUE.x1 && z > SYNAGOGUE.z0 && z < SYNAGOGUE.z1;
}

// The hall is walled and roofed, so the only way to see anyone in it is from
// inside or through the open door; the cast is drawn only from there. The
// door's reveal is as deep as the wall, which bounds the angle a line of
// sight can take through it.
const DOOR_X = (SYNAGOGUE.doorX0 + SYNAGOGUE.doorX1) / 2;
const DOOR_HALF = (SYNAGOGUE.doorX1 - SYNAGOGUE.doorX0) / 2;
const DOOR_SLOPE = (DOOR_HALF * 2) / SYNAGOGUE.wall;
const LINTEL = 3.1;
export function insideSynagogueHall(x, y, z) {
  return x > HALL.x0 && x < HALL.x1 && z > HALL.z0 && z < HALL.z1 && y > F - 0.5 && y < F + 7;
}
export function seesIntoSynagogue(x, y, z) {
  if (insideSynagogueHall(x, y, z)) return true;
  // In the doorway itself.
  if (z >= SYNAGOGUE.z0 && z <= HALL.z0) return Math.abs(x - DOOR_X) < DOOR_HALF;
  const out = SYNAGOGUE.z0 - z;
  if (out < 0 || out > 35) return false;
  return Math.abs(x - DOOR_X) < DOOR_HALF + out * DOOR_SLOPE && y < F + LINTEL + out * 2;
}

// Each pose is a function of time: nobody in a held moment is a statue, but
// nobody here is going anywhere either.
export const POSES = {
  ...COMMON_POSES,
  // Seated, leaning toward the man, the right hand raised to him: the rebuke.
  rebuke: (t) => {
    const breath = wave(t, 2);
    return {
      seated: true,
      ...SEATED_LEGS,
      spineLean: 9 + breath * 0.4,
      headPitch: 3,
      right: { armFlex: 74 + breath * 0.4, armAbduct: 14, foreArmFlex: 96, foreArmAbduct: 2 },
      left: { armFlex: 22, armAbduct: 9, foreArmFlex: 74 },
      fingerCurl: 5,
    };
  },
  // In the grip of the spirit: back arched, head thrown back, knees bent,
  // arms rigid and spread, the hands clawed — and never still.
  convulse: (t) => {
    const spasm = wave(t, 10) * 0.6 + wave(t, 17, 1.2) * 0.4;
    const heave = wave(t, 2);
    return {
      spineLean: -17 + spasm * 3 + heave * 2,
      spineYaw: spasm * 5,
      headPitch: -26 + spasm * 4,
      leftLeg: { thighFlex: 16 + heave * 3, shinFlex: -13 },
      rightLeg: { thighFlex: 8 - heave * 3, shinFlex: -9 },
      left: { armFlex: 22 + spasm * 6, armAbduct: 52 + spasm * 5, foreArmFlex: 34, foreArmAbduct: 48 },
      right: { armFlex: 30 - spasm * 6, armAbduct: 46 - spasm * 5, foreArmFlex: 44, foreArmAbduct: 40 },
      fingerCurl: 74 + spasm * 6,
    };
  },
  // Bent to the scroll on the table, but looking up at the noise.
  attend: (t) => ({
    spineLean: 14 + wave(t, 2) * 0.6,
    headPitch: -8,
    right: { armFlex: 44, armAbduct: 6, foreArmFlex: 52 },
    left: { armFlex: 8, armAbduct: 6, foreArmFlex: 22 },
    fingerCurl: 18,
  }),
  // Seated and teaching, the right hand open toward the room: "I am the
  // bread of life."
  teachSeated: (t) => {
    const beat = wave(t, 3);
    return {
      seated: true,
      ...SEATED_LEGS,
      spineLean: 6 + beat * 0.6,
      headPitch: 2,
      right: { armFlex: 46 + beat * 5, armAbduct: 22, foreArmFlex: 82 + beat * 4, handTwist: -40 },
      left: { armFlex: 20, armAbduct: 8, foreArmFlex: 72 },
      fingerCurl: 8,
    };
  },
  // Walking out: mid-stride, arms swinging, going.
  leave: (t) => {
    const sway = wave(t, 2);
    return {
      spineLean: 5 + sway * 0.5,
      headPitch: 4,
      leftLeg: { thighFlex: 20, shinFlex: 6 },
      rightLeg: { thighFlex: -16, shinFlex: -34, ankleBend: 18 },
      left: { armFlex: -14, armAbduct: 6, foreArmFlex: 8 },
      right: { armFlex: 16, armAbduct: 6, foreArmFlex: 34 },
      fingerCurl: 22,
    };
  },
  // Going, and looking back over the shoulder.
  leaveLook: (t) => {
    const sway = wave(t, 2);
    return {
      spineLean: 2 + sway * 0.5,
      spineYaw: 38,
      pelvisYaw: 8,
      headPitch: 2,
      leftLeg: { thighFlex: -14, shinFlex: -30, ankleBend: 16 },
      rightLeg: { thighFlex: 18, shinFlex: 5 },
      left: { armFlex: 14, armAbduct: 6, foreArmFlex: 30 },
      right: { armFlex: -12, armAbduct: 6, foreArmFlex: 10 },
      fingerCurl: 22,
    };
  },
  // "Lord, to whom shall we go?" — standing before him, a hand on the chest.
  confess: (t) => ({
    spineLean: 6 + wave(t, 1) * 0.5,
    headPitch: 4,
    leftLeg: { thighFlex: 4, shinFlex: 0 },
    rightLeg: { thighFlex: -4, shinFlex: -2 },
    right: { armFlex: 22, armAbduct: -4, foreArmFlex: 118, foreArmAbduct: -52 },
    left: { armFlex: 26 + wave(t, 2) * 3, armAbduct: 14, foreArmFlex: 60, handTwist: -50 },
    fingerCurl: 12,
  }),
};

// The room's furniture, shared by both moments: the teacher's seat, the scroll
// open on the reading table, and a lamp burning beside the teacher.
function synagogueFurniture({ THREE, group, own, material, addMesh }) {
  // A plain block of basalt, not the carved "seat of Moses" found at Chorazin,
  // which is centuries later.
  addMesh(new THREE.BoxGeometry(0.56, TEACHER_SEAT.top - F, 0.46), 'basalt',
    [TEACHER_SEAT.x, (F + TEACHER_SEAT.top) / 2, TEACHER_SEAT.z + 0.05]).name = 'teacher-seat';

  // The scroll, rolled at both ends on its wooden rollers, the column being
  // read showing between.
  const scroll = new THREE.Group();
  scroll.name = 'torah-scroll';
  scroll.position.set(READING_TABLE.x, F + READING_TABLE.h, READING_TABLE.z);
  group.add(scroll);
  const rollGeometry = own(new THREE.CylinderGeometry(0.052, 0.052, 0.3, 14));
  const rollerGeometry = own(new THREE.CylinderGeometry(0.011, 0.011, 0.42, 6));
  for (const side of [-1, 1]) {
    const roll = new THREE.Mesh(rollGeometry, material('parchment'));
    roll.rotation.x = Math.PI / 2;
    roll.position.set(side * 0.16, 0.052, 0);
    roll.castShadow = true;
    scroll.add(roll);
    const roller = new THREE.Mesh(rollerGeometry, material('timber'));
    roller.rotation.x = Math.PI / 2;
    roller.position.set(side * 0.16, 0.052, 0);
    scroll.add(roller);
  }
  addMesh(new THREE.PlaneGeometry(0.28, 0.29), 'parchment', [0, 0.004, 0], scroll).rotation.x = -Math.PI / 2;

  // A clay lamp on a wooden stand beside the teacher, burning though it is
  // day, as synagogue lamps did.
  const lampAt = [TEACHER_SEAT.x + 1.1, F, TEACHER_SEAT.z + 0.2];
  addMesh(new THREE.CylinderGeometry(0.035, 0.05, 1.15, 8), 'timber', [lampAt[0], F + 0.575, lampAt[2]]);
  addMesh(new THREE.CylinderGeometry(0.14, 0.1, 0.03, 12), 'timber', [lampAt[0], F + 1.16, lampAt[2]]);
  const lamp = addMesh(new THREE.SphereGeometry(0.07, 12, 8), 'clay', [lampAt[0], F + 1.21, lampAt[2]]);
  lamp.scale.set(1.3, 0.55, 1);
  const flame = new THREE.Mesh(own(new THREE.ConeGeometry(0.018, 0.07, 8)), material('flame'));
  flame.position.set(lampAt[0] + 0.08, F + 1.27, lampAt[2]);
  flame.name = 'lamp-flame';
  group.add(flame);

  return {
    update: (time) => {
      flame.scale.set(1, 0.85 + Math.sin(time * 9.1) * 0.1 + Math.sin(time * 4.3) * 0.06, 1);
    },
    // The teacher's seat and the lamp stand are in the way of a walker.
    clearance: [
      { x: TEACHER_SEAT.x, z: TEACHER_SEAT.z + 0.05, radius: 0.4 },
      { x: lampAt[0], z: lampAt[2], radius: 0.18 },
    ],
  };
}

// Where in the room the cast is drawn from: inside, or through the door.
const synagogueStage = (name, cast, onReady, active) => ({
  name,
  cast,
  poses: POSES,
  focus: [READING_TABLE.x, F + 1, READING_TABLE.z],
  floor: F,
  drawDistance: 42,
  visibleFrom: seesIntoSynagogue,
  props: synagogueFurniture,
  onReady,
  active,
});

export function createSynagogueTableau(THREE, { root, onReady, active } = {}) {
  return createTableau(THREE, { root, ...synagogueStage('synagogue-tableau', SYNAGOGUE_CAST, onReady, active) });
}

export function createBreadOfLifeTableau(THREE, { root, onReady, active } = {}) {
  return createTableau(THREE, { root, ...synagogueStage('bread-of-life-tableau', BREAD_CAST, onReady, active) });
}
