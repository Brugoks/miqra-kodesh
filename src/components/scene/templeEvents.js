// What happened in the Temple courts, staged one moment at a time.
//
// The same arrangement as Capernaum's (capernaumEvents.js): each event is a
// staged moment on sceneTableau.js, only one is staged at a time, and the
// visitor picks them from the list in the order the text tells them (the
// `events` of the second-temple manifest in src/lib/scenes.js). Here most of
// the cast moves by captured motion (`motion`, sceneMixamo.js) — people
// praying, arguing, stooping for stones, giving thanks — and authored poses
// are kept for the few gestures that have to land on something: a hand in a
// hand, a finger on the paving, a coin into the chest.
//
// Coordinates are the Temple's (templeDimensions.js): +X north, +Z east
// toward the gates, −Z west toward the sanctuary. Three floors: the outer
// court, the Court of the Women up twelve steps, the inner court up fifteen.
//
// Where the text does not say — which portico, which of the thirteen chests,
// how many stood round — the staging is reconstruction, and each event's text
// says so.
//
// three.js is passed in, so the module stays importable in jsdom.

import {
  LEVEL, WOMEN, SOREG,
} from './templeDimensions.js';
import { createTableau, wave, SEAT_DROP } from './sceneTableau.js';
import { COMMON_POSES, SEATED_LEGS, FLOOR_SIT } from './tableauPoses.js';
import { createHerd } from './sceneAnimals.js';

const O = LEVEL.outer;
const W = LEVEL.women;
const I = LEVEL.inner;

// The recurring people, dressed alike wherever they appear.
const JESUS = { model: 'human-jesus' };
const PETER = { model: 'human-artisan', tint: { Cloth: 0x5f6f7e } };
const JOHN = { model: 'human-villager', tint: { Cloth: 0xa3977c } };
const WOMAN = 'human-tabernacle-camp-woman';
const LINEN = 0xf1ede2;
const GREY = 0xa9a49b;
const PRIEST = (model) => ({ model, tint: { Cloth: LINEN } });
const ELDER = (model, cloth) => ({ model, tint: { Cloth: cloth, Hair: GREY, Beard: GREY } });
const VILLAGERS = ['human-villager', 'human-traveler', 'human-artisan'];
const villager = (i) => VILLAGERS[i % VILLAGERS.length];
const EAST = 0;
const WEST = Math.PI;
const SOUTH = -Math.PI / 2;
const NORTH = Math.PI / 2;
const toward = ([x, , z]) => [x, z];

// --- props --------------------------------------------------------------------

// A swaddled child, carried in both arms: laid along the line between the two
// hands that hold it.
function swaddled({ THREE, own, material }, { bone }) {
  const bundle = new THREE.Group();
  bundle.name = 'swaddled-child';
  const left = bone('LeftHand');
  const right = bone('RightHand');
  const middle = left.clone().add(right).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.07, 0));
  const body = new THREE.Mesh(own(new THREE.CapsuleGeometry(0.075, 0.24, 6, 12)), material('linen'));
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  bundle.add(body);
  const head = new THREE.Mesh(own(new THREE.SphereGeometry(0.058, 12, 10)), material('clay'));
  head.position.set(0.19, 0.02, 0);
  bundle.add(head);
  bundle.position.copy(middle);
  const along = right.clone().sub(left).setY(0);
  bundle.rotation.y = Math.atan2(-along.z, along.x);
  bundle.userData.aimed = true;
  // The engine places a held prop at its grip; this one is placed at the
  // middle of the arms, so it reports that as where it goes.
  bundle.userData.at = middle;
  return bundle;
}

// The pair of turtledoves the poor could offer (Leviticus 12:8; Luke 2:24),
// in a small wicker cage.
function dovesInCage({ THREE, own, material }) {
  const cage = new THREE.Group();
  cage.name = 'doves';
  const box = new THREE.Mesh(own(new THREE.CylinderGeometry(0.11, 0.13, 0.16, 10, 1, true)), material('reed'));
  box.material = own(material('reed').clone());
  box.material.side = THREE.DoubleSide;
  box.position.y = -0.1;
  cage.add(box);
  const dove = own(new THREE.SphereGeometry(0.045, 8, 6));
  const grey = own(new THREE.MeshStandardMaterial({ color: 0xb9b3a8, roughness: 0.9 }));
  for (const side of [-1, 1]) {
    const bird = new THREE.Mesh(dove, grey);
    bird.scale.set(1.4, 0.9, 1);
    bird.position.set(side * 0.04, -0.07, 0);
    cage.add(bird);
  }
  return cage;
}

// A stone picked up to throw.
function stone({ THREE, own, material }) {
  const rock = new THREE.Mesh(own(new THREE.DodecahedronGeometry(0.055, 0)), material('basalt'));
  rock.name = 'stone';
  rock.castShadow = true;
  return rock;
}

// A whip of cords (John 2:15).
function cords({ THREE, own, material }) {
  const whip = new THREE.Group();
  whip.name = 'cords';
  const handle = new THREE.Mesh(own(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 5)), material('cord'));
  whip.add(handle);
  const strand = own(new THREE.CylinderGeometry(0.005, 0.003, 0.55, 4));
  for (let i = 0; i < 4; i += 1) {
    const cord = new THREE.Mesh(strand, material('cord'));
    cord.position.set(Math.cos(i * 1.6) * 0.015, 0.34, Math.sin(i * 1.6) * 0.015);
    cord.rotation.set(0.25 + i * 0.12, 0, -0.2 + i * 0.1);
    whip.add(cord);
  }
  return whip;
}

// A spear, grounded at the soldier's side.
function spear({ THREE, own, material }, { grip, floor }) {
  const length = grip.y - floor + 1.05;
  const shaft = new THREE.Group();
  const pole = new THREE.Mesh(own(new THREE.CylinderGeometry(0.016, 0.02, length, 7)), material('timber'));
  pole.position.y = 1.05 - length / 2;
  shaft.add(pole);
  const head = new THREE.Mesh(own(new THREE.ConeGeometry(0.022, 0.2, 6)), material('iron'));
  head.position.y = 1.15;
  shaft.add(head);
  shaft.userData.aimed = true;
  return shaft;
}

// --- 1. Zechariah's silence: Luke 1:8-23 ---------------------------------------

const ZECHARIAH_AT = [-10, I, 16.2];
export const ZECHARIAH_CAST = [
  // Come out from the incense unable to speak, making signs to them.
  { id: 'zechariah', ...ELDER('human-artisan', LINEN), motion: 'talk-ask', pose: 'standIdle', position: ZECHARIAH_AT, facing: EAST, principal: true },
  { id: 'priest-a', ...PRIEST('human-traveler'), motion: 'surprised', pose: 'recoil', position: [-12.3, I, 14.7], target: toward(ZECHARIAH_AT), phase: 1.2 },
  { id: 'priest-b', ...PRIEST('human-villager'), motion: 'thinking', pose: 'standIdle', position: [-12.8, I, 16.9], target: toward(ZECHARIAH_AT), phase: 2.4 },
  // The whole multitude of the people praying outside at the hour of incense,
  // across the rail in the Court of Israel.
  ...[
    [-13.5, 21.2, 'pray-sway'], [-11.2, 21.0, 'surprised'], [-8.8, 21.4, 'pray-buckled'], [-6.2, 21.2, 'look-around'],
    [-15.2, 22.9, 'pray-sway'], [-12.4, 22.8, 'thinking'], [-9.8, 23.1, 'surprised'], [-7.0, 22.9, 'pray-sway'],
  ].map(([x, z, motion], i) => ({
    id: `people-${i}`, model: villager(i), motion, pose: 'standListen', position: [x, I, z], target: toward(ZECHARIAH_AT), audience: true, phase: (i * 1.31) % 6,
  })),
];

// --- 2. Simeon and Anna: Luke 2:22-38 -------------------------------------------

const SIMEON_AT = [-0.4, W, 39.3];
export const SIMEON_CAST = [
  // "He took him up in his arms and blessed God."
  {
    id: 'simeon',
    ...ELDER('human-artisan', 0xcbbf9f),
    pose: 'cradle',
    position: SIMEON_AT,
    target: [1.0, 40.5],
    principal: true,
    hold: [{ bone: 'LeftHand', build: swaddled }],
  },
  { id: 'mary', model: WOMAN, veil: 0x3f5a78, motion: 'thankful', pose: 'standListen', position: [1.05, W, 40.55], target: toward(SIMEON_AT), principal: true },
  {
    id: 'joseph',
    model: 'human-traveler',
    tint: { Cloth: 0x7c6a52 },
    motion: 'carry-box',
    pose: 'standListen',
    position: [2.6, W, 41.3],
    target: toward(SIMEON_AT),
    hold: [{ bone: 'RightHand', at: [0, 0.08, 0.03], build: dovesInCage }],
  },
  // Anna, a prophetess of great age, giving thanks (2:36-38).
  { id: 'anna', model: WOMAN, veil: 0x2f2a28, tint: { Hair: 0xb2ada6 }, motion: 'thankful', pose: 'standListen', position: [-1.9, W, 41.5], target: toward(SIMEON_AT), speed: 0.8 },
  { id: 'bystander-a', model: 'human-villager', motion: 'pray-sway', pose: 'standListen', position: [-2.9, W, 38.3], target: [0, 30], audience: true },
  { id: 'bystander-b', model: 'human-artisan', motion: 'look-around', pose: 'standIdle', position: [3.6, W, 42.4], target: toward(SIMEON_AT), audience: true, phase: 2.2 },
  { id: 'bystander-c', model: WOMAN, veil: 0x8f7a60, motion: 'breathing-idle', pose: 'standListen', position: [-4.1, W, 42.3], target: toward(SIMEON_AT), audience: true, phase: 3.1 },
];

// --- 3. The boy in his Father's house: Luke 2:41-52 -----------------------------

// Solomon's Portico, the east colonnade: between its two rows of columns
// (templeDimensions.js COLONNADE), north of the stair's axis.
const BOY_AT = [39.1, O, 223.6];
export const BOY_CAST = [
  // Twelve years old, sitting among the teachers, asking them questions.
  { id: 'boy', model: 'human-villager', tint: { Cloth: 0xd8ccb0 }, scale: 0.8, pose: 'askSeated', position: BOY_AT, target: [39.4, 226], principal: true, mat: true },
  { id: 'teacher-a', ...ELDER('human-artisan', 0x4b5566), motion: 'sit-floor', pose: 'floorListen', position: [37.1, O, 225.6], target: toward(BOY_AT), principal: true, phase: 1.4 },
  { id: 'teacher-b', ...ELDER('human-traveler', 0x6a5a48), motion: 'sit-floor-reclined', pose: 'floorLean', position: [41.3, O, 225.7], target: toward(BOY_AT), phase: 2.1 },
  { id: 'teacher-c', ...ELDER('human-villager', 0x5d4f63), motion: 'thinking', pose: 'standListen', position: [39.6, O, 226.4], target: toward(BOY_AT) },
  { id: 'elder', ...ELDER('human-artisan', 0x3e3a36), motion: 'old-man-idle', pose: 'standIdle', position: [42.9, O, 224.1], target: toward(BOY_AT), phase: 0.7 },
  // "Son, why have you treated us so? Your father and I have been searching
  // for you in great distress." (2:48)
  { id: 'mary', model: WOMAN, veil: 0x3f5a78, motion: 'talk-ask', pose: 'standListen', position: [36.4, O, 221.9], target: toward(BOY_AT), principal: true },
  { id: 'joseph', model: 'human-traveler', tint: { Cloth: 0x7c6a52 }, motion: 'breathing-idle', pose: 'standListen', position: [35.3, O, 222.8], target: toward(BOY_AT), phase: 1.9 },
  { id: 'listener', model: 'human-traveler', motion: 'nod-yes', pose: 'standListen', position: [45.2, O, 224.9], target: toward(BOY_AT), audience: true },
];

// --- 4. The cleansing of the temple: John 2:13-22; Mark 11:15-17 ----------------

// The outer court, in the south, among the traders under the porticoes.
const CLEANSING_JESUS = [-108.2, O, 176.1];
export const CLEANSING_CAST = [
  {
    id: 'jesus',
    ...JESUS,
    pose: 'drive',
    position: CLEANSING_JESUS,
    facing: SOUTH + 0.5,
    principal: true,
    hold: [{ bone: 'RightHand', at: [0, 0.07, 0.02], euler: [0, 0, 0], build: cords }],
  },
  // The money-changers, one at his table and one getting away from it.
  { id: 'changer-a', model: 'human-traveler', tint: { Cloth: 0x6d4f3a }, motion: 'surprised', pose: 'recoil', position: [-111.4, O, 174.3], target: toward(CLEANSING_JESUS), principal: true },
  { id: 'changer-b', model: 'human-artisan', tint: { Cloth: 0x4f3f2f }, motion: 'yell-angry', pose: 'standTalk', position: [-110.9, O, 178.4], target: toward(CLEANSING_JESUS), phase: 1.5 },
  // "Take these things away" — to those who sold pigeons (John 2:16).
  {
    id: 'dove-seller', model: 'human-villager', tint: { Cloth: 0x8b7a5c }, motion: 'carry-box', pose: 'standListen', position: [-105.3, O, 173.4], target: [-100, 170], phase: 0.6,
    hold: [{ bone: 'RightHand', at: [0, 0.08, 0.03], build: dovesInCage }],
  },
  { id: 'peter', ...PETER, motion: 'thinking', pose: 'standListen', position: [-104.7, O, 179.3], target: toward(CLEANSING_JESUS) },
  { id: 'john', ...JOHN, motion: 'surprised', pose: 'standListen', position: [-103.6, O, 177.9], target: toward(CLEANSING_JESUS), phase: 2 },
  ...[[-113.8, 177.2, 'argue'], [-106.0, 181.6, 'look-around'], [-102.6, 175.3, 'argue-2']].map(([x, z, motion], i) => ({
    id: `onlooker-${i}`, model: villager(i), motion, pose: 'standListen', position: [x, O, z], target: toward(CLEANSING_JESUS), audience: true, phase: i * 1.7,
  })),
];

function cleansingProps(kit) {
  const { THREE, addMesh, group, own, material } = kit;
  // The table turned over, its coins on the paving, and one still standing.
  const table = new THREE.Group();
  table.position.set(-109.6, O, 175.1);
  table.rotation.set(0, 0.4, -1.25);
  group.add(table);
  addMesh(new THREE.BoxGeometry(1.4, 0.06, 0.7), 'timber', [0, 0.36, 0], table);
  for (const [x, z] of [[-0.62, -0.28], [0.62, -0.28], [-0.62, 0.28], [0.62, 0.28]]) {
    addMesh(new THREE.BoxGeometry(0.06, 0.72, 0.06), 'darkTimber', [x, 0, z], table);
  }
  const upright = addMesh(new THREE.BoxGeometry(1.3, 0.06, 0.65), 'timber', [-112.3, O + 0.74, 179.3]);
  upright.rotation.y = 0.3;
  const coin = own(new THREE.CylinderGeometry(0.013, 0.013, 0.004, 10));
  for (let i = 0; i < 26; i += 1) {
    const piece = new THREE.Mesh(coin, material(i % 3 ? 'bronze' : 'silver'));
    const angle = i * 2.39;
    const r = 0.25 + (i % 7) * 0.13;
    piece.position.set(-108.9 + Math.cos(angle) * r, O + 0.004, 174.6 + Math.sin(angle) * r * 0.8);
    piece.rotation.set(Math.PI / 2 * (i % 5 === 0 ? 1 : 0), angle, 0);
    group.add(piece);
  }
  // The sheep and the oxen driven out (John 2:15): the sheep, going.
  const herd = createHerd(THREE, {
    animals: [
      { species: 'sheep', pose: 'stand', x: -115.0, z: 172.2, facing: -2.3, phase: 0.2 },
      { species: 'sheep', pose: 'stand', x: -116.1, z: 173.6, facing: -2.1, phase: 1.1 },
      { species: 'sheep', pose: 'stand', x: -114.2, z: 170.7, facing: -2.6, phase: 2.0 },
    ],
  });
  group.add(herd.group);
  own({ dispose: () => herd.dispose() });
  return {
    update: (time) => herd.update(time),
    clearance: [
      { x: -109.6, z: 175.1, radius: 0.7 },
      { x: -112.3, z: 179.3, radius: 0.65 },
      { x: -115.0, z: 172.2, radius: 0.5 },
      { x: -116.1, z: 173.6, radius: 0.5 },
      { x: -114.2, z: 170.7, radius: 0.5 },
    ],
  };
}

// --- 5. The widow's offering: Mark 12:41-44; Luke 21:1-4 -------------------------

// The treasury: trumpet-mouthed chests along the south wall of the Court of
// the Women (Mishnah Shekalim 6:5 counts thirteen).
export const CHESTS = [58.5, 61.5, 64.5, 67.5, 70.5, 73.5].map((z) => ({ x: -WOMEN.halfX + 1.05, z, mouth: W + 1.08 }));
const WIDOW_CHEST = CHESTS[2];
export const WIDOW_CAST = [
  { id: 'widow', model: WOMAN, veil: 0x26221f, tint: { Hair: 0xa7a29a, Cloth: 0x5a524a }, pose: 'offering', position: [WIDOW_CHEST.x + 0.5, W, WIDOW_CHEST.z + 0.05], facing: SOUTH, principal: true },
  // "Many rich people put in large sums."
  {
    id: 'rich-man', model: 'human-traveler', tint: { Cloth: 0x5a2d58 }, motion: 'carry-box', pose: 'standListen', position: [CHESTS[4].x + 1.0, W, CHESTS[4].z + 0.1], facing: SOUTH + 0.2, phase: 1.1,
  },
  { id: 'servant', model: 'human-villager', tint: { Cloth: 0x8f8470 }, motion: 'breathing-idle', pose: 'standIdle', position: [CHESTS[4].x + 2.3, W, CHESTS[4].z + 1.2], target: [CHESTS[4].x, CHESTS[4].z], audience: true },
  // "He sat down opposite the treasury and watched" — and called his
  // disciples to him (12:41, 43).
  { id: 'jesus', ...JESUS, pose: 'watchSeated', position: [-27.4, W + 0.45 - SEAT_DROP, 64.8], facing: SOUTH, principal: true },
  { id: 'peter', ...PETER, pose: 'floorListen', position: [-28.4, W, 66.7], target: [-32, 64.5], phase: 1.2 },
  { id: 'john', ...JOHN, motion: 'breathing-idle', pose: 'standListen', position: [-26.3, W, 62.6], target: [-32, 64.5], phase: 2.2 },
  { id: 'disciple', model: 'human-traveler', motion: 'thinking', pose: 'standListen', position: [-25.8, W, 67.0], target: [-32, 64.5], phase: 0.4 },
];

function treasuryProps({ THREE, addMesh }) {
  // Each chest a box with a bronze horn standing on it, mouth up, narrow at
  // the top so a hand could not reach back in.
  for (const chest of CHESTS) {
    addMesh(new THREE.BoxGeometry(0.62, 0.72, 0.62), 'darkTimber', [chest.x, W + 0.36, chest.z]);
    addMesh(new THREE.CylinderGeometry(0.07, 0.2, 0.36, 12, 1, true), 'bronze', [chest.x, W + 0.9, chest.z]).material.side = THREE.DoubleSide;
  }
  // The bench he sat on.
  addMesh(new THREE.BoxGeometry(0.5, 0.45, 1.6), 'basalt', [-27.25, W + 0.225, 64.8]);
  return {
    clearance: [
      ...CHESTS.map((chest) => ({ x: chest.x, z: chest.z, radius: 0.42 })),
      { x: -27.25, z: 64.4, radius: 0.35 },
      { x: -27.25, z: 65.2, radius: 0.35 },
    ],
  };
}

// --- 6. The woman caught in adultery: John 7:53-8:11 -----------------------------

const WRITING_AT = [6.0, W, 70.0];
const ACCUSED_AT = [4.55, W, 71.7];
export const ADULTERESS_CAST = [
  // "Jesus bent down and wrote with his finger on the ground."
  { id: 'jesus', ...JESUS, pose: 'writeGround', position: WRITING_AT, facing: NORTH - 0.35, principal: true },
  { id: 'woman', model: WOMAN, veil: 0x6a3f35, motion: 'sad-idle', pose: 'standListen', position: ACCUSED_AT, target: toward(WRITING_AT), principal: true },
  // The scribes and Pharisees, stones in hand.
  { id: 'accuser-a', ...ELDER('human-artisan', 0x2f3a4f), motion: 'point-forward', pose: 'standTalk', position: [6.9, W, 73.5], target: toward(WRITING_AT), hold: [{ bone: 'LeftHand', at: [0, 0.07, 0.03], build: stone }] },
  { id: 'accuser-b', model: 'human-traveler', tint: { Cloth: 0x3b3f55 }, motion: 'argue', pose: 'standTalk', position: [8.6, W, 72.3], target: toward(ACCUSED_AT), phase: 1.3 },
  { id: 'accuser-c', model: 'human-villager', tint: { Cloth: 0x4a3c2e }, motion: 'yell-angry', pose: 'standTalk', position: [3.9, W, 74.0], target: toward(ACCUSED_AT), phase: 2.1, hold: [{ bone: 'RightHand', at: [0, 0.07, 0.03], build: stone }] },
  // "They went away one by one, beginning with the older ones."
  { id: 'leaving', ...ELDER('human-artisan', 0x3a3530), motion: 'old-man-idle', pose: 'standIdle', position: [9.9, W, 74.9], facing: NORTH + 0.6, phase: 0.8 },
  // The people he had sat down to teach at dawn (8:2).
  { id: 'listener-a', model: 'human-traveler', pose: 'floorListen', position: [4.6, W, 67.1], target: toward(WRITING_AT), audience: true },
  { id: 'listener-b', model: WOMAN, veil: 0xc9b99a, motion: 'sit-floor', pose: 'floorListen', position: [7.6, W, 66.8], target: toward(WRITING_AT), audience: true, phase: 1.6 },
  { id: 'listener-c', model: 'human-villager', motion: 'breathing-idle', pose: 'standListen', position: [2.3, W, 68.5], target: toward(WRITING_AT), audience: true, phase: 2.7 },
];

// --- 7. The Feast of Dedication: John 10:22-39 -----------------------------------

const DEDICATION_JESUS = [-40.0, O, 224.0];
export const DEDICATION_CAST = [
  // "Jesus was walking in the temple, in the colonnade of Solomon."
  { id: 'jesus', ...JESUS, motion: 'talk-ask', pose: 'standListen', position: DEDICATION_JESUS, facing: NORTH + 0.25, principal: true },
  ...[
    [-42.3, 223.0, 'argue'], [-38.0, 225.6, 'argue-2'], [-41.6, 226.0, 'point-bent'], [-37.9, 226.6, 'shake-no'],
  ].map(([x, z, motion], i) => ({
    id: `questioner-${i}`, model: villager(i), tint: { Cloth: [0x3f3a4f, 0x4e4234, 0x383f47, 0x51443a][i] }, motion, pose: 'standTalk', position: [x, O, z], target: toward(DEDICATION_JESUS), principal: i === 0, phase: i * 1.3,
  })),
  // "The Jews picked up stones again to stone him." (10:31)
  { id: 'stone-a', model: 'human-artisan', motion: 'pick-up', pose: 'standListen', position: [-44.0, O, 225.1], target: toward(DEDICATION_JESUS), phase: 0.6 },
  { id: 'stone-b', model: 'human-traveler', motion: 'pick-up', pose: 'standListen', position: [-36.0, O, 224.3], target: toward(DEDICATION_JESUS), phase: 2.4 },
  { id: 'peter', ...PETER, motion: 'look-around', pose: 'standListen', position: [-39.2, O, 221.7], target: toward(DEDICATION_JESUS) },
];

function dedicationProps({ THREE, addMesh }) {
  // Loose stones on the paving at the colonnade's foot.
  for (const [x, z] of [[-44.3, 225.5], [-35.7, 224.7], [-43.4, 226.4], [-36.9, 225.7]]) {
    addMesh(new THREE.DodecahedronGeometry(0.07, 0), 'basalt', [x, O + 0.05, z]);
  }
  return {};
}

// --- 8. The lame man at the Beautiful Gate: Acts 3:1-10 --------------------------

// Just inside the gate, against the east wall of the Court of the Women.
const LAME_AT = [-6.2, W + 0.02, 103.6];
export const BEAUTIFUL_GATE_CAST = [
  { id: 'lame-man', model: 'human-villager', tint: { Cloth: 0x8a7d66 }, pose: 'risingUp', position: LAME_AT, facing: WEST, principal: true, mat: { w: 0.8, d: 1.2, offset: 0.35 }, radius: 0.55 },
  // "He took him by the right hand and raised him up." (3:7)
  { id: 'peter', ...PETER, pose: 'liftUp', position: [-5.73, W, 102.94], target: [LAME_AT[0] - 0.2, LAME_AT[2] - 0.3], principal: true },
  { id: 'john', ...JOHN, motion: 'thinking', pose: 'standListen', position: [-3.9, W, 101.9], target: toward(LAME_AT), phase: 1 },
  // "All the people ran together to them" (3:11).
  ...[[-8.3, 100.6, 'surprised'], [-2.4, 100.4, 'look-around'], [-9.4, 102.3, 'surprised'], [-1.6, 102.6, 'pray-sway']].map(([x, z, motion], i) => ({
    id: `people-${i}`, model: i === 3 ? WOMAN : villager(i), ...(i === 3 ? { veil: 0xb8a98a } : {}), motion, pose: 'standListen', position: [x, W, z], target: toward(LAME_AT), audience: true, phase: i * 1.4,
  })),
];

// --- 9. Paul seized in the temple: Acts 21:27-36 ---------------------------------

// Outside the soreg (templeDimensions.js SOREG): the rumour was that he had
// taken a Greek past it (21:28-29).
const PAUL_AT = [0.4, O, SOREG.zEast + 3.4];
export const PAUL_CAST = [
  { id: 'paul', model: 'human-traveler', tint: { Cloth: 0x6f5b45, Hair: 0x3b3029 }, pose: 'seized', position: PAUL_AT, facing: EAST, principal: true },
  // "They seized Paul and dragged him out of the temple."
  { id: 'captor-left', model: 'human-artisan', tint: { Cloth: 0x4a3f33 }, pose: 'gripRight', position: [PAUL_AT[0] + 0.82, O, PAUL_AT[2] - 0.35], facing: EAST, principal: true },
  { id: 'captor-right', model: 'human-villager', tint: { Cloth: 0x55493a }, pose: 'gripLeft', position: [PAUL_AT[0] - 0.87, O, PAUL_AT[2] - 0.35], facing: EAST },
  ...[[-2.3, 3.0, 'yell-angry'], [2.8, 3.4, 'argue'], [0.1, 4.6, 'point-forward'], [-3.5, 0.6, 'yell-angry'], [3.9, 0.9, 'argue-2']].map(([dx, dz, motion], i) => ({
    id: `mob-${i}`, model: villager(i), motion, pose: 'standTalk', position: [PAUL_AT[0] + dx, O, PAUL_AT[2] + dz], target: toward(PAUL_AT), audience: i > 1, phase: i * 1.1,
  })),
  // The tribune and his soldiers, down from the Antonia at the north-west
  // corner (21:31-32).
  { id: 'tribune', model: 'human-traveler', tint: { Cloth: 0x8a3b2e }, motion: 'point-forward', pose: 'standTalk', position: [PAUL_AT[0] + 5.6, O, PAUL_AT[2] + 5.2], target: toward(PAUL_AT), principal: true },
  ...[[6.8, 3.6], [7.9, 5.4]].map(([dx, dz], i) => ({
    id: `soldier-${i}`, model: ['human-artisan', 'human-villager'][i], tint: { Cloth: 0xb4a283 }, pose: 'atEase', position: [PAUL_AT[0] + dx, O, PAUL_AT[2] + dz], target: toward(PAUL_AT), audience: true, phase: i * 2,
    hold: [{ bone: 'RightHand', at: [0, 0.07, 0], build: spear }],
  })),
];

// --- poses ------------------------------------------------------------------

export const TEMPLE_POSES = {
  ...COMMON_POSES,
  // Holding the child close in both arms.
  cradle: (t) => ({
    spineLean: 6 + wave(t, 2) * 0.5,
    headPitch: 14,
    leftLeg: { thighFlex: 3, shinFlex: 0 },
    rightLeg: { thighFlex: -3, shinFlex: -1 },
    left: { armFlex: 26, armAbduct: 4, foreArmFlex: 96, foreArmAbduct: -44 },
    right: { armFlex: 24, armAbduct: 4, foreArmFlex: 92, foreArmAbduct: -40 },
    fingerCurl: 34,
  }),
  // Seated on the floor, looking up at the teachers and asking.
  askSeated: (t) => {
    const beat = wave(t, 4);
    return {
      ...FLOOR_SIT,
      spineLean: 6,
      headPitch: -10,
      left: { armFlex: 56, armAbduct: 10, foreArmFlex: 86, foreArmAbduct: -20 },
      right: { armFlex: 48 + beat * 6, armAbduct: 16, foreArmFlex: 96 + beat * 6, handTwist: -40 },
      fingerCurl: 12,
    };
  },
  // The whip of cords raised, the other arm driving them out.
  drive: (t) => ({
    spineLean: 6 + wave(t, 2) * 0.8,
    spineYaw: -10,
    headPitch: -2,
    leftLeg: { thighFlex: 18, shinFlex: 2 },
    rightLeg: { thighFlex: -14, shinFlex: -16, ankleBend: 8 },
    right: { armFlex: 150 + wave(t, 2) * 3, armAbduct: 18, foreArmFlex: 168 },
    left: { armFlex: 74, armAbduct: 32, foreArmFlex: 80 },
    fingerCurl: 70,
  }),
  // Leaning to the chest, the coins going in from her fingers.
  offering: (t) => ({
    spineLean: 18 + wave(t, 1) * 0.6,
    headPitch: 10,
    right: { armFlex: 74, armAbduct: -20, foreArmFlex: 76, foreArmAbduct: -20 },
    left: { armFlex: 14, armAbduct: 6, foreArmFlex: 56 },
    fingerCurl: 30,
  }),
  // Seated opposite the treasury, watching.
  watchSeated: (t) => ({
    seated: true,
    ...SEATED_LEGS,
    spineLean: 10 + wave(t, 1) * 0.5,
    headPitch: 4,
    left: { armFlex: 20, armAbduct: 8, foreArmFlex: 72 },
    right: { armFlex: 22, armAbduct: 8, foreArmFlex: 70 },
    fingerCurl: 30,
  }),
  // Stooped low, one knee down, a finger on the paving.
  writeGround: (t) => ({
    // Down on his haunches, the weight on both feet.
    hipsHeight: 0.3,
    leftLeg: { thighFlex: 118, shinFlex: -20, ankleBend: 22 },
    rightLeg: { thighFlex: 110, shinFlex: -24, ankleBend: 22 },
    spineLean: 72 + wave(t, 2) * 0.6,
    headPitch: 12,
    right: { armFlex: 26 + wave(t, 3) * 2, armAbduct: 12, foreArmFlex: 30 + wave(t, 3) * 2 },
    left: { armFlex: 30, armAbduct: 10, foreArmFlex: 70 },
    fingerCurl: 8,
  }),
  // Pulled back by both arms.
  seized: (t) => ({
    spineLean: -6 + wave(t, 3) * 1.5,
    spineYaw: wave(t, 3) * 4,
    headPitch: -6,
    leftLeg: { thighFlex: 10, shinFlex: -6 },
    rightLeg: { thighFlex: -12, shinFlex: -12 },
    left: { armFlex: -24, armAbduct: 26, foreArmFlex: -10 },
    right: { armFlex: -24, armAbduct: 26, foreArmFlex: -10 },
    fingerCurl: 55,
  }),
  // A captor gripping the arm on his right (gripRight) or left (gripLeft).
  gripRight: (t) => ({
    spineLean: 10 + wave(t, 3) * 1.2,
    leftLeg: { thighFlex: 14, shinFlex: 0 },
    rightLeg: { thighFlex: -10, shinFlex: -10 },
    right: { armFlex: 40, armAbduct: 46, foreArmFlex: 42, foreArmAbduct: 46 },
    left: { armFlex: 30, armAbduct: 4, foreArmFlex: 60 },
    fingerCurl: 70,
  }),
  gripLeft: (t) => ({
    spineLean: 10 + wave(t, 3, 1) * 1.2,
    leftLeg: { thighFlex: -10, shinFlex: -10 },
    rightLeg: { thighFlex: 14, shinFlex: 0 },
    left: { armFlex: 81, armAbduct: 63, foreArmFlex: 83, foreArmAbduct: 63 },
    right: { armFlex: 30, armAbduct: 4, foreArmFlex: 60 },
    fingerCurl: 70,
  }),
  // At ease with a grounded spear (the centurion's men in Capernaum).
  atEase: (t) => ({
    spineLean: -1 + wave(t, 1) * 0.3,
    headPitch: 2,
    left: { armFlex: -2, armAbduct: 5, foreArmFlex: 14 },
    right: { armFlex: 16, armAbduct: 8, foreArmFlex: 76 },
    fingerCurl: 78,
  }),
  // Peter lifting the lame man, and the man rising: the same grip as the
  // mother-in-law's in Capernaum (capernaumEvents.js).
  liftUp: (t) => ({
    hipsHeight: 0.72,
    spineLean: 48 + wave(t, 2) * 0.6,
    headPitch: 2,
    leftLeg: { thighFlex: 50, shinFlex: -36, ankleBend: -8 },
    rightLeg: { thighFlex: 36, shinFlex: -50, ankleBend: 6 },
    left: { armFlex: 12, armAbduct: 8, foreArmFlex: 34 },
    right: { armFlex: 34, armAbduct: -25, foreArmFlex: 36, foreArmAbduct: -25 },
    fingerCurl: 58,
  }),
  risingUp: (t) => ({
    hipsHeight: 0.12,
    leftLeg: { thighFlex: 88, shinFlex: 90 },
    rightLeg: { thighFlex: 84, shinFlex: 88 },
    spineLean: 12 + wave(t, 2) * 0.8,
    headPitch: -12,
    right: { armFlex: 104, armAbduct: -2, foreArmFlex: 112 },
    left: { armFlex: -32, armAbduct: 18, foreArmFlex: -26 },
    fingerCurl: 55,
  }),
};

// --- the stages ---------------------------------------------------------------

// The ground each moment occupies, [x0, x1, z0, z1], kept clear of the
// courts' own crowd and clutter, which are placed at random once.
export const TEMPLE_EVENT_AREAS = {
  zechariah: [-17, -4.5, 13.5, 24],
  'simeon-anna': [-5.5, 5.5, 37.2, 46],
  'boy-jesus': [33, 46, 220.9, 227.1],
  cleansing: [-119, -99, 168, 184],
  widow: [-33.7, -21, 55, 76],
  adulteress: [1, 12, 64.5, 77],
  dedication: [-46, -33, 220.9, 227.1],
  'beautiful-gate': [-11, 0, 98.5, 104.9],
  'paul-seized': [-5, 10.5, SOREG.zEast + 1, SOREG.zEast + 12],
};
export function inTempleEventArea(x, z) {
  return Object.values(TEMPLE_EVENT_AREAS).some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
}

const stage = (options) => ({
  poses: TEMPLE_POSES,
  ...options,
  create: (THREE, {
    root, onReady, active, motionLibrary,
  } = {}) => createTableau(THREE, {
    poses: TEMPLE_POSES, root, onReady, active, motionLibrary, ...options,
  }),
});

export const TEMPLE_EVENT_STAGES = {
  zechariah: stage({ name: 'zechariah-tableau', cast: ZECHARIAH_CAST, floor: I, focus: [-10, I + 1, 19] }),
  'simeon-anna': stage({ name: 'simeon-tableau', cast: SIMEON_CAST, floor: W, focus: [0.4, W + 1, 40.2] }),
  'boy-jesus': stage({ name: 'boy-jesus-tableau', cast: BOY_CAST, floor: O, focus: [39.2, O + 1, 224.2] }),
  cleansing: stage({ name: 'cleansing-tableau', cast: CLEANSING_CAST, floor: O, focus: [-108.5, O + 1, 176.5], props: cleansingProps }),
  widow: stage({ name: 'widow-tableau', cast: WIDOW_CAST, floor: W, focus: [-28, W + 1, 65], props: treasuryProps }),
  adulteress: stage({ name: 'adulteress-tableau', cast: ADULTERESS_CAST, floor: W, focus: [5.8, W + 1, 71] }),
  dedication: stage({ name: 'dedication-tableau', cast: DEDICATION_CAST, floor: O, focus: [-40, O + 1, 224], props: dedicationProps }),
  'beautiful-gate': stage({ name: 'beautiful-gate-tableau', cast: BEAUTIFUL_GATE_CAST, floor: W, focus: [-5.2, W + 1, 102.6] }),
  'paul-seized': stage({ name: 'paul-seized-tableau', cast: PAUL_CAST, floor: O, focus: [PAUL_AT[0] + 1.5, O + 1, PAUL_AT[2] + 2] }),
};
