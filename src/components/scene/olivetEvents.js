// What happened on the Mount of Olives, staged one moment at a time.
//
// The same engine as the Temple's and Capernaum's events (sceneTableau.js,
// sceneEpisodes.js): each is a fixed cast of skinned characters, built the
// first time it is staged, and only one is staged at a time. Most of the cast
// moves by captured motion (sceneMixamo.js) — waving branches, weeping,
// sleeping, holding up torches, looking up — and authored poses are kept for
// what has to land on something: a rider astride a colt, a hand reaching into
// a fig tree, a kiss, a hand at a cut ear, arms lifted in blessing.
//
// Unlike a Temple court, none of this ground is flat: every position is on
// the real hillside (olivetDimensions.js groundAt), each stage reads the
// ground under a point through `floorAt`, and a colt on the descent stands
// nose-down on it. Where the text does not say — the house the colt was tied
// at, where on the road he wept, who stood where in the garden — the staging
// is reconstruction, and each event's text in src/lib/olivetScene.js says so.
//
// Coordinates are olivetDimensions.js: +X east, -Z north. A heading is three.js
// model convention: facing (sin h, cos h), so 0 faces south and -π/2 west.
//
// three.js is passed in, so the module stays importable in jsdom.

import { createTableau, wave } from './sceneTableau.js';
import { createHerd } from './sceneAnimals.js';
import {
  EVENT_GROUND, FARMSTEAD, groundAt,
} from './olivetDimensions.js';

// The recurring people, dressed as they are in Capernaum and the Temple.
const JESUS = { model: 'human-jesus' };
const PETER = { model: 'human-artisan', tint: { Cloth: 0x5f6f7e } };
const ANDREW = { model: 'human-traveler', tint: { Cloth: 0x8b7755 } };
const JAMES = { model: 'human-traveler', tint: { Cloth: 0x6e5540 } };
const JOHN = { model: 'human-villager', tint: { Cloth: 0xa3977c } };
// The other eight, each always in the same coat; Judas apart from them.
const OTHERS = [
  { model: 'human-villager', tint: { Cloth: 0x7a6a4e } },
  { model: 'human-artisan', tint: { Cloth: 0x566b52 } },
  { model: 'human-traveler', tint: { Cloth: 0x8a5d46 } },
  { model: 'human-villager', tint: { Cloth: 0x4f5a6e } },
  { model: 'human-artisan', tint: { Cloth: 0x9a8a68 } },
  { model: 'human-traveler', tint: { Cloth: 0x6b5f78 } },
  { model: 'human-villager', tint: { Cloth: 0x705a3c } },
];
const JUDAS = { model: 'human-artisan', tint: { Cloth: 0x4a3f36 } };
const WOMAN = 'human-tabernacle-camp-woman';
const VILLAGERS = ['human-villager', 'human-traveler', 'human-artisan'];
const villager = (i) => VILLAGERS[i % VILLAGERS.length];
// The cohort John calls a speira, and the chief priests' own officers.
const SOLDIER = (model) => ({ model, tint: { Cloth: 0x7e3a2c } });
const OFFICER = (model) => ({ model, tint: { Cloth: 0x4c5160 } });
const WHITE = 0xf4f1ea;

// A point on the ground, lifted if need be.
const at = (x, z, lift = 0) => [x, groundAt(x, z) + lift, z];
const toward = ([x, , z]) => [x, z];

// A frame laid along a road: `s` metres ahead of an anchor, `l` to the left of
// the way of travel. Heading h faces (sin h, cos h); its left is (cos h, -sin h).
function roadFrame([x0, z0], heading) {
  const f = [Math.sin(heading), Math.cos(heading)];
  const left = [Math.cos(heading), -Math.sin(heading)];
  return (s, l) => [x0 + f[0] * s + left[0] * l, z0 + f[1] * s + left[1] * l];
}
// How far the ground falls ahead over a stride, as a nose-down pitch.
function pitchAlong([x, z], heading) {
  const e = 0.6;
  const ahead = groundAt(x + Math.sin(heading) * e, z + Math.cos(heading) * e);
  const behind = groundAt(x - Math.sin(heading) * e, z - Math.cos(heading) * e);
  return Math.atan2(behind - ahead, 2 * e);
}

// The colt's back, the height a rider's hips are posed to (sceneAnimals.js
// SPECIES.donkey: barrel centre at `stand`, half its height above it).
export const COLT_SCALE = 0.85;
export const COLT_BACK = (0.98 + 0.25) * COLT_SCALE;

// --- props --------------------------------------------------------------------

const SPEAR_TOP = 1.05;
function spear({ THREE, own, material }, { grip, floor }) {
  const length = grip.y - floor + SPEAR_TOP;
  const shaft = new THREE.Group();
  shaft.name = 'spear';
  const pole = new THREE.Mesh(own(new THREE.CylinderGeometry(0.016, 0.02, length, 7)), material('timber'));
  pole.position.y = SPEAR_TOP - length / 2;
  shaft.add(pole);
  const head = new THREE.Mesh(own(new THREE.ConeGeometry(0.022, 0.2, 6)), material('iron'));
  head.position.y = SPEAR_TOP + 0.1;
  shaft.add(head);
  shaft.userData.aimed = true;
  return shaft;
}

// Where a staged moment's firelight comes from. The stage carries no lights
// itself — a light appearing changes the scene's light count, and three.js
// then recompiles every material on the Mount, a pause of seconds — but marks
// the places, and the builder moves a fixed pool of lights onto them
// (buildOlivet.js). { colour, intensity, distance }.
export const FIRELIGHT = { colour: 0xff9a48, intensity: 3.2, distance: 11 };
function lightAnchor({ THREE }, spec = FIRELIGHT) {
  const anchor = new THREE.Object3D();
  anchor.name = 'light-anchor';
  anchor.userData.light = spec;
  return anchor;
}

// A torch: a staff with pitch-soaked rags burning at the top. A few throw
// light on the faces round them.
function torch(kit) {
  return torchWith(kit, false);
}
function litTorch(kit) {
  return torchWith(kit, true);
}
function torchWith(kit, lit) {
  const { THREE, own, material, flicker } = kit;
  const group = new THREE.Group();
  group.name = 'torch';
  const staff = new THREE.Mesh(own(new THREE.CylinderGeometry(0.018, 0.022, 0.75, 6)), material('darkTimber'));
  staff.position.y = 0.2;
  group.add(staff);
  const rag = new THREE.Mesh(own(new THREE.CylinderGeometry(0.04, 0.03, 0.12, 7)), material('leather'));
  rag.position.y = 0.6;
  group.add(rag);
  const flame = flicker(new THREE.Mesh(own(new THREE.ConeGeometry(0.07, 0.3, 8)), material('flame')));
  flame.position.y = 0.8;
  group.add(flame);
  if (lit) {
    const anchor = lightAnchor(kit);
    anchor.position.y = 0.85;
    group.add(anchor);
  }
  group.userData.aimed = true;
  return group;
}

// Limestone, for the rocks sat on and the stones round a fire.
const limestone = ({ THREE, own }) => own(new THREE.MeshStandardMaterial({ color: 0xb5ab96, roughness: 0.95, flatShading: true }));

// A lantern hung from the hand: a clay lamp inside a pierced housing.
function lantern({ THREE, own, material, flicker }) {
  const group = new THREE.Group();
  group.name = 'lantern';
  const handle = new THREE.Mesh(own(new THREE.TorusGeometry(0.05, 0.006, 4, 10, Math.PI)), material('iron'));
  group.add(handle);
  const housing = new THREE.Mesh(own(new THREE.CylinderGeometry(0.075, 0.085, 0.2, 8, 1, true)), material('bronze'));
  housing.position.y = -0.14;
  group.add(housing);
  const glow = flicker(new THREE.Mesh(own(new THREE.SphereGeometry(0.035, 8, 6)), material('flame')));
  glow.position.y = -0.14;
  group.add(glow);
  group.userData.aimed = true;
  return group;
}

// Peter's sword — the short sword a traveller carried (Luke 22:38).
function sword({ THREE, own, material }) {
  const group = new THREE.Group();
  group.name = 'sword';
  const blade = new THREE.Mesh(own(new THREE.BoxGeometry(0.045, 0.55, 0.012)), material('iron'));
  blade.position.y = 0.34;
  group.add(blade);
  const guard = new THREE.Mesh(own(new THREE.BoxGeometry(0.12, 0.02, 0.03)), material('bronze'));
  guard.position.y = 0.06;
  group.add(guard);
  const hilt = new THREE.Mesh(own(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 6)), material('leather'));
  group.add(hilt);
  return group;
}

// A club (Mark 14:43).
function club({ THREE, own, material }) {
  const mesh = new THREE.Mesh(own(new THREE.CylinderGeometry(0.03, 0.018, 0.6, 7)), material('darkTimber'));
  mesh.name = 'club';
  mesh.geometry.translate(0, 0.25, 0);
  return mesh;
}

// A branch cut from the fields (Mark 11:8) — John says palm (12:13).
function branch({ THREE, own, material }) {
  const group = new THREE.Group();
  group.name = 'branch';
  const stem = new THREE.Mesh(own(new THREE.CylinderGeometry(0.008, 0.012, 1.1, 5)), material('reed'));
  stem.position.y = 0.45;
  group.add(stem);
  const leaf = own(new THREE.PlaneGeometry(0.34, 0.8, 1, 4));
  const green = own(new THREE.MeshStandardMaterial({ color: 0x5e7a36, roughness: 0.8, side: THREE.DoubleSide }));
  for (const [angle, lift] of [[0, 0.72], [Math.PI / 2, 0.8]]) {
    const frond = new THREE.Mesh(leaf, green);
    frond.position.y = lift;
    frond.rotation.y = angle;
    group.add(frond);
  }
  return group;
}

// A cloak laid on the road or on the colt: a slab of cloth fitted to the ground.
function cloth({ THREE, own }, colour) {
  return new THREE.Mesh(own(new THREE.BoxGeometry(1.1, 0.03, 1.5)), own(new THREE.MeshStandardMaterial({ color: colour, roughness: 1 })));
}
const CLOAK_COLOURS = [0x7a5f44, 0x5d6b7a, 0x8c7856, 0x6d4f3e, 0xa0906c, 0x4f5c48, 0x8a6a52];

// A rock to sit on, its top `top` metres above the ground at (x, z).
function seatRock(kit, [x, z], top = 0.4, size = 0.55) {
  const { THREE, own, group } = kit;
  const rock = new THREE.Mesh(own(new THREE.DodecahedronGeometry(size, 1)), limestone(kit));
  rock.scale.set(1.2, 1, 1);
  rock.position.set(x, groundAt(x, z) + top - size, z);
  rock.castShadow = true;
  rock.receiveShadow = true;
  group.add(rock);
  return rock;
}

// A colt with its mother, for the stages that have them: a herd of two, the
// colt pitched down the slope it stands on, with cloaks on its back when it
// is being ridden.
function colts(kit, animals, { cloaked = false } = {}) {
  const { THREE, group, own } = kit;
  const herd = createHerd(THREE, { animals, groundAt, name: 'colt' });
  group.add(herd.group);
  own({ dispose: () => herd.dispose() });
  if (cloaked) {
    // The disciples' cloaks thrown over its back (Mark 11:7), hanging down
    // either side of the barrel.
    const colt = animals[0];
    const red = own(new THREE.MeshStandardMaterial({ color: 0x8c4a3a, roughness: 1 }));
    const saddle = new THREE.Group();
    saddle.position.set(colt.x, groundAt(colt.x, colt.z), colt.z);
    saddle.rotation.set(colt.pitch || 0, colt.facing, 0, 'YXZ');
    const top = new THREE.Mesh(own(new THREE.BoxGeometry(0.46, 0.03, 0.8)), red);
    top.position.y = COLT_BACK;
    saddle.add(top);
    for (const side of [-1, 1]) {
      const drape = new THREE.Mesh(own(new THREE.BoxGeometry(0.02, 0.42, 0.8)), red);
      drape.position.set(side * 0.22, COLT_BACK - 0.21, 0);
      saddle.add(drape);
    }
    group.add(saddle);
  }
  return herd;
}

// --- poses --------------------------------------------------------------------

const RIDER_LEGS = {
  leftLeg: { thighFlex: 46, thighAbduct: 26, shinFlex: 6, shinAbduct: 10, ankleBend: 16 },
  rightLeg: { thighFlex: 46, thighAbduct: 26, shinFlex: 6, shinAbduct: 10, ankleBend: 16 },
};

export const OLIVET_POSES = {
  // Astride the colt, upright, one hand on its neck.
  rider: (t) => ({
    hipsHeight: COLT_BACK + 0.09,
    ...RIDER_LEGS,
    spineLean: 3 + wave(t, 2) * 0.8,
    headPitch: 3 + wave(t, 1, 1) * 1.5,
    left: { armFlex: 34, armAbduct: 8, foreArmFlex: 62 },
    right: { armFlex: 22, armAbduct: 10, foreArmFlex: 78 },
    fingerCurl: 40,
  }),
  // The same, bowed over, a hand to the face (Luke 19:41).
  riderWeep: (t) => ({
    hipsHeight: COLT_BACK + 0.09,
    ...RIDER_LEGS,
    spineLean: 20 + wave(t, 2) * 1.6,
    headPitch: 24 + wave(t, 2, 0.5) * 2,
    left: { armFlex: 34, armAbduct: 8, foreArmFlex: 60 },
    right: { armFlex: 62, armAbduct: -4, foreArmFlex: 150, foreArmAbduct: -22 },
    fingerCurl: 30,
  }),
  // Lifted up, both hands raised over them in blessing (Luke 24:50).
  blessing: (t) => ({
    spineLean: -5 + wave(t, 1) * 0.6,
    headPitch: -8,
    leftLeg: { thighFlex: 4, shinFlex: -3, ankleBend: 28 },
    rightLeg: { thighFlex: 2, shinFlex: -5, ankleBend: 30 },
    left: { armFlex: 118 + wave(t, 1) * 2, armAbduct: 34, foreArmFlex: 138, foreArmAbduct: 30 },
    right: { armFlex: 118 + wave(t, 1) * 2, armAbduct: 34, foreArmFlex: 138, foreArmAbduct: 30 },
    fingerCurl: 6,
  }),
  // Reaching up into the fig's branches for fruit that is not there (Mark 11:13).
  reachUp: (t) => ({
    spineLean: -6 + wave(t, 2) * 0.8,
    headPitch: -22,
    leftLeg: { thighFlex: 6, shinFlex: 0 },
    rightLeg: { thighFlex: -6, shinFlex: -6 },
    right: { armFlex: 170 + wave(t, 2) * 3, armAbduct: 6, foreArmFlex: 175 + wave(t, 2) * 2 },
    left: { armFlex: 10, armAbduct: 6, foreArmFlex: 20 },
    fingerCurl: 22,
  }),
  // Judas, leaning in to kiss him, his hands on his arms (Mark 14:45).
  kiss: (t) => ({
    spineLean: 18 + wave(t, 2) * 0.6,
    headPitch: -2,
    spineYaw: 6,
    leftLeg: { thighFlex: 12, shinFlex: 0 },
    rightLeg: { thighFlex: -8, shinFlex: -10 },
    left: { armFlex: 45, armAbduct: 14, foreArmFlex: 120, foreArmAbduct: -18 },
    right: { armFlex: 45, armAbduct: 14, foreArmFlex: 120, foreArmAbduct: -18 },
    fingerCurl: 45,
  }),
  // Peter, the sword up after the blow (John 18:10).
  swordRaised: (t) => ({
    spineLean: 6 + wave(t, 3) * 1,
    headPitch: 4,
    leftLeg: { thighFlex: 24, shinFlex: 4 },
    rightLeg: { thighFlex: -16, shinFlex: -18 },
    right: { armFlex: 138 + wave(t, 3) * 3, armAbduct: 22, foreArmFlex: 168 },
    left: { armFlex: 54, armAbduct: 12, foreArmFlex: 76 },
    fingerCurl: 80,
  }),
  // Malchus, doubled over, a hand clapped to his right ear.
  earClutch: (t) => ({
    spineLean: 30 + wave(t, 3) * 1.5,
    headPitch: 14,
    spineYaw: -8,
    leftLeg: { thighFlex: 20, shinFlex: -8 },
    rightLeg: { thighFlex: -4, shinFlex: -16 },
    right: { armFlex: 70, armAbduct: 20, foreArmFlex: 175, foreArmAbduct: -25 },
    left: { armFlex: 30, armAbduct: 18, foreArmFlex: 40 },
    fingerCurl: 35,
  }),
  // A soldier at ease with a grounded spear.
  atEase: (t) => ({
    spineLean: -1 + wave(t, 1) * 0.3,
    headPitch: 2,
    left: { armFlex: -2, armAbduct: 5, foreArmFlex: 14 },
    right: { armFlex: 16, armAbduct: 8, foreArmFlex: 76 },
    fingerCurl: 78,
  }),
};

// --- 1. The colt: Luke 19:29-35 -----------------------------------------------

// Tied at the door of a house on the road over the top (Mark 11:4); FARMSTEAD
// is the house, standing in the navigation.
const DOOR = [FARMSTEAD.x0 - 0.1, (FARMSTEAD.door.z0 + FARMSTEAD.door.z1) / 2];
const COLT_TIED = { x: DOOR[0] - 2.6, z: DOOR[1] - 0.2, facing: Math.PI };
const TETHER = [DOOR[0] - 1.2, DOOR[1] - 1.9];
const COLT_JESUS = at(597.0, -53.4);
export const COLT_CAST = [
  { id: 'jesus', ...JESUS, motion: 'breathing-idle', position: COLT_JESUS, target: [COLT_TIED.x, COLT_TIED.z], principal: true },
  { id: 'untying', ...ANDREW, motion: 'crouch-idle', position: at(TETHER[0] - 0.8, TETHER[1] - 0.5), target: TETHER, principal: true },
  { id: 'answering', ...OTHERS[0], motion: 'talk-ask', position: at(DOOR[0] - 4.4, DOOR[1] + 1.4), target: [DOOR[0] - 0.8, DOOR[1] - 0.5] },
  // "What are you doing, untying the colt?" (Mark 11:5)
  { id: 'owner-a', model: 'human-artisan', tint: { Cloth: 0x6f5d44, Hair: 0x9a948a, Beard: 0x9a948a }, motion: 'argue', position: at(DOOR[0] - 0.8, DOOR[1] - 0.5), target: [DOOR[0] - 4.4, DOOR[1] + 1.4], principal: true },
  { id: 'owner-b', model: 'human-traveler', tint: { Cloth: 0x857054 }, motion: 'thinking', position: at(DOOR[0] - 1.0, DOOR[1] - 3.9), target: TETHER },
  { id: 'peter', ...PETER, motion: 'look-around', position: at(595.5, -52.1), target: [COLT_TIED.x, COLT_TIED.z], phase: 1.1 },
  { id: 'john', ...JOHN, motion: 'talk-chat', position: at(596.4, -55.2), target: toward(COLT_JESUS), phase: 2.3 },
  { id: 'james', ...JAMES, motion: 'weight-shift', position: at(596.2, -50.1), target: [COLT_TIED.x, COLT_TIED.z], phase: 0.6 },
  { id: 'disciple-a', ...OTHERS[1], motion: 'thinking', position: at(594.2, -54.6), target: [COLT_TIED.x, COLT_TIED.z], phase: 3.4 },
  { id: 'disciple-b', ...OTHERS[2], motion: 'nod-yes', position: at(602.2, -49.4), target: toward(COLT_JESUS), phase: 1.9 },
];
function coltProps(kit) {
  const { THREE, group, own, material } = kit;
  const herd = colts(kit, [
    { species: 'donkey', pose: 'stand', x: COLT_TIED.x, z: COLT_TIED.z, facing: COLT_TIED.facing, scale: COLT_SCALE, phase: 0.4 },
    { species: 'donkey', pose: 'stand', x: COLT_TIED.x + 0.4, z: COLT_TIED.z + 2.3, facing: COLT_TIED.facing - 0.2, phase: 2.2 },
  ]);
  const post = new THREE.Mesh(own(new THREE.CylinderGeometry(0.06, 0.07, 1.1, 7)), material('darkTimber'));
  post.position.set(TETHER[0], groundAt(...TETHER) + 0.55, TETHER[1]);
  post.castShadow = true;
  group.add(post);
  // The halter rope from the post to the colt's head.
  const head = new THREE.Vector3(COLT_TIED.x, groundAt(COLT_TIED.x, COLT_TIED.z) + 1.05, COLT_TIED.z - 0.75);
  const top = new THREE.Vector3(TETHER[0], groundAt(...TETHER) + 0.95, TETHER[1]);
  const rope = new THREE.Mesh(own(new THREE.CylinderGeometry(0.008, 0.008, head.distanceTo(top), 4)), material('cord'));
  rope.position.copy(head).add(top).multiplyScalar(0.5);
  rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(head).normalize());
  group.add(rope);
  return {
    update: (time) => herd.update(time),
    clearance: [
      { x: COLT_TIED.x, z: COLT_TIED.z, radius: 0.7 },
      { x: COLT_TIED.x + 0.4, z: COLT_TIED.z + 2.3, radius: 0.8 },
      { x: TETHER[0], z: TETHER[1], radius: 0.2 },
    ],
  };
}

// --- 2. Hosanna: Luke 19:36-40 ------------------------------------------------

// At the top of the descent, where Luke has the shouting start (19:37). The
// procession comes down the road westward.
const ENTRY = [EVENT_GROUND['triumphal-entry'].x, 146.75];
const ENTRY_HEADING = Math.atan2(-80, 20);
const entry = roadFrame(ENTRY, ENTRY_HEADING);
const ENTRY_COLT = { x: ENTRY[0], z: ENTRY[1], facing: ENTRY_HEADING, pitch: pitchAlong(ENTRY, ENTRY_HEADING) };
const ENTRY_JESUS = at(...entry(-0.1, 0));
const ENTRY_CROWD = [
  // [s, l, motion, who] — ahead of him, behind him, and along both verges.
  [3.4, -0.9, 'wave-both', PETER], [3.1, 1.2, 'thankful', JOHN], [5.4, 0.3, 'wave-emotional', JAMES],
  [6.8, -1.3, 'wave-both', OTHERS[0]], [7.4, 1.4, 'talk-chat', OTHERS[1]],
  [-2.8, -0.8, 'thankful', OTHERS[2]], [-3.4, 1.0, 'wave-emotional', OTHERS[3]], [-5.2, 0.1, 'wave-both', ANDREW],
  [-4.8, -1.9, 'thankful', { model: WOMAN, veil: 0x6d4f3e }],
  [0.6, -3.6, 'wave-both', { model: 'human-villager' }], [3.8, -3.9, 'wave-emotional', { model: WOMAN, veil: 0x8f7a60 }],
  [7.2, -3.5, 'wave-both', { model: 'human-traveler' }], [-1.8, -3.8, 'thankful', { model: 'human-artisan' }],
  [5.6, 3.8, 'wave-both', { model: 'human-traveler' }], [8.8, 3.4, 'wave-emotional', { model: 'human-villager', scale: 0.64 }],
  [-2.6, 3.7, 'wave-both', { model: WOMAN, veil: 0x3f5a78 }],
];
export const ENTRY_CAST = [
  { id: 'jesus', ...JESUS, pose: 'rider', position: ENTRY_JESUS, facing: ENTRY_HEADING, principal: true, solid: true, radius: 0.9 },
  // Leading the colt by its halter.
  { id: 'leading', ...OTHERS[4], motion: 'weight-shift', position: at(...entry(1.5, 0.5)), facing: ENTRY_HEADING },
  ...ENTRY_CROWD.map(([s, l, motion, who], i) => ({
    id: `crowd-${i}`,
    ...who,
    motion,
    position: at(...entry(s, l)),
    target: toward(ENTRY_JESUS),
    phase: (i * 1.37) % 6,
    audience: i > 8,
    hold: motion.startsWith('wave') ? [{ bone: 'RightHand', at: [0, 0.06, 0.02], build: branch }] : undefined,
  })),
  // "Teacher, rebuke your disciples." (19:39)
  { id: 'pharisee-a', model: 'human-artisan', tint: { Cloth: 0x2f3a52, Hair: 0x8a8580, Beard: 0x8a8580 }, motion: 'point-forward', position: at(...entry(1.8, 3.7)), target: toward(ENTRY_JESUS), principal: true },
  { id: 'pharisee-b', model: 'human-traveler', tint: { Cloth: 0x3b3346 }, motion: 'argue', position: at(...entry(0.2, 4.4)), target: toward(ENTRY_JESUS), phase: 2.2 },
];
function entryProps(kit) {
  const { group } = kit;
  const [mx, mz] = entry(0.5, -1.6);
  const herd = colts(kit, [
    { species: 'donkey', pose: 'stand', ...ENTRY_COLT, scale: COLT_SCALE, phase: 0.4 },
    // Matthew's colt with its mother (21:7).
    { species: 'donkey', pose: 'stand', x: mx, z: mz, facing: ENTRY_HEADING, pitch: ENTRY_COLT.pitch, phase: 2.6 },
  ], { cloaked: true });
  // Cloaks spread on the road ahead of him, and branches cut from the fields.
  for (let i = 0; i < 7; i += 1) {
    const [x, z] = entry(2.2 + i * 1.6, ((i * 0.37) % 1 - 0.5) * 1.2);
    const cloak = cloth(kit, CLOAK_COLOURS[i % CLOAK_COLOURS.length]);
    cloak.position.set(x, groundAt(x, z) + 0.03, z);
    cloak.rotation.set(pitchAlong([x, z], ENTRY_HEADING), ENTRY_HEADING + (i % 3 - 1) * 0.25, 0, 'YXZ');
    group.add(cloak);
  }
  for (let i = 0; i < 9; i += 1) {
    const [x, z] = entry(3 + i * 1.3, ((i * 0.61) % 1 - 0.5) * 2.4);
    const fallen = branch(kit);
    fallen.position.set(x, groundAt(x, z) + 0.05, z);
    fallen.rotation.set(Math.PI / 2 - 0.05, 0, i * 1.1);
    group.add(fallen);
  }
  return {
    update: (time) => herd.update(time),
    clearance: [{ x: ENTRY_COLT.x, z: ENTRY_COLT.z, radius: 0.9 }, { x: mx, z: mz, radius: 0.8 }],
  };
}

// --- 3. He wept over it: Luke 19:41-44 ----------------------------------------

// Lower on the descent, where the whole city is spread out below the road.
const WEEP = [EVENT_GROUND.weeping.x + 6, 158.57];
const WEEP_HEADING = Math.atan2(-70, -10);
const weep = roadFrame(WEEP, WEEP_HEADING);
const WEEP_COLT = { x: WEEP[0], z: WEEP[1], facing: WEEP_HEADING, pitch: pitchAlong(WEEP, WEEP_HEADING) };
const WEEP_JESUS = at(...weep(-0.1, 0));
export const WEEP_CAST = [
  { id: 'jesus', ...JESUS, pose: 'riderWeep', position: WEEP_JESUS, facing: WEEP_HEADING, principal: true, solid: true, radius: 0.9 },
  { id: 'john', ...JOHN, motion: 'sad-idle', position: at(...weep(0.4, 1.3)), target: toward(WEEP_JESUS), principal: true },
  { id: 'peter', ...PETER, motion: 'thinking', position: at(...weep(1.6, -0.8)), target: toward(WEEP_JESUS) },
  { id: 'james', ...JAMES, motion: 'sad-idle', position: at(...weep(-2.6, -2.4)), target: toward(WEEP_JESUS), phase: 1.4 },
  { id: 'andrew', ...ANDREW, motion: 'look-around', position: at(...weep(-2.9, -1.1)), target: [-440, 185], phase: 2.2 },
  { id: 'disciple-a', ...OTHERS[3], motion: 'thinking', position: at(...weep(-4.6, -1.6)), target: toward(WEEP_JESUS), phase: 0.8 },
  { id: 'disciple-b', ...OTHERS[5], motion: 'weight-shift', position: at(...weep(-3.6, 2.2)), target: toward(WEEP_JESUS), phase: 3.1 },
  { id: 'woman', model: WOMAN, veil: 0x6d4f3e, motion: 'crying', position: at(...weep(-5.8, -1.9)), target: [-440, 185], audience: true },
  { id: 'onlooker-a', model: 'human-villager', motion: 'surprised', position: at(...weep(-6.6, 1.6)), target: toward(WEEP_JESUS), audience: true, phase: 1.7 },
  { id: 'onlooker-b', model: 'human-traveler', motion: 'shake-no', position: at(...weep(-7.4, -0.5)), target: toward(WEEP_JESUS), audience: true, phase: 4.2 },
];
function weepProps(kit) {
  const [mx, mz] = weep(0.6, -1.7);
  const herd = colts(kit, [
    { species: 'donkey', pose: 'stand', ...WEEP_COLT, scale: COLT_SCALE, phase: 1.3 },
    { species: 'donkey', pose: 'stand', x: mx, z: mz, facing: WEEP_HEADING, pitch: WEEP_COLT.pitch, phase: 3.9 },
  ], { cloaked: true });
  return {
    update: (time) => herd.update(time),
    clearance: [{ x: WEEP_COLT.x, z: WEEP_COLT.z, radius: 0.9 }, { x: mx, z: mz, radius: 0.8 }],
  };
}

// --- 4. A fig tree in leaf: Mark 11:12-14 -------------------------------------

export const FIG = [470, 92];
const FIG_JESUS = at(471.0, 93.25);
export const FIG_CAST = [
  { id: 'jesus', ...JESUS, pose: 'reachUp', position: FIG_JESUS, target: FIG, principal: true },
  { id: 'peter', ...PETER, motion: 'look-around', position: at(474.4, 96.9), target: toward(FIG_JESUS), principal: true, phase: 0.9 },
  { id: 'john', ...JOHN, motion: 'thinking', position: at(472.8, 98.3), target: toward(FIG_JESUS), phase: 1.8 },
  { id: 'james', ...JAMES, motion: 'talk-chat', position: at(476.3, 95.7), target: toward(FIG_JESUS), phase: 2.6 },
  { id: 'andrew', ...ANDREW, motion: 'weight-shift', position: at(475.7, 98.8), target: toward(FIG_JESUS), phase: 3.3 },
  { id: 'disciple-a', ...OTHERS[6], motion: 'nod-yes', position: at(477.9, 97.6), target: toward(FIG_JESUS), phase: 4.1 },
  { id: 'disciple-b', ...OTHERS[0], motion: 'breathing-idle', position: at(472.0, 100.1), target: toward(FIG_JESUS), phase: 0.3 },
];

// --- 5. Not one stone: Mark 13:1-4 --------------------------------------------

// On the slope opposite the Temple, the fig tree of 13:28 beside them.
const DISCOURSE = [EVENT_GROUND['olivet-discourse'].x - 1.5, EVENT_GROUND['olivet-discourse'].z - 0.5];
export const DISCOURSE_SEAT = { at: DISCOURSE, top: 0.4 };
export const DISCOURSE_CAST = [
  { id: 'jesus', ...JESUS, motion: 'sit-talk', position: at(...DISCOURSE), target: [DISCOURSE[0] + 4.5, DISCOURSE[1] + 0.9], principal: true, solid: true },
  { id: 'peter', ...PETER, motion: 'sit-floor', position: at(DISCOURSE[0] + 1.9, DISCOURSE[1] - 2.3), target: DISCOURSE, principal: true },
  { id: 'andrew', ...ANDREW, motion: 'sit-floor-reclined', position: at(DISCOURSE[0] + 3.3, DISCOURSE[1] - 1.4), target: DISCOURSE, phase: 1.3 },
  { id: 'james', ...JAMES, motion: 'kneel-idle', position: at(DISCOURSE[0] + 2.4, DISCOURSE[1] + 3.1), target: DISCOURSE, phase: 2.1 },
  { id: 'john', ...JOHN, motion: 'sit-floor', position: at(DISCOURSE[0] + 3.8, DISCOURSE[1] + 2.1), target: DISCOURSE, principal: true, phase: 3.4 },
];
function discourseProps(kit) {
  seatRock(kit, DISCOURSE, DISCOURSE_SEAT.top);
  return { clearance: [{ x: DISCOURSE[0], z: DISCOURSE[1], radius: 0.6 }] };
}

// --- 6. He lodged on the Mount: Luke 21:37 ------------------------------------

export const FIRE = [EVENT_GROUND.lodged.x, EVENT_GROUND.lodged.z];
const LODGE_SEAT = [FIRE[0] - 2.0, FIRE[1] - 1.2];
export const LODGED_CAST = [
  { id: 'jesus', ...JESUS, motion: 'sit-idle', position: at(...LODGE_SEAT), target: FIRE, principal: true, solid: true },
  { id: 'peter', ...PETER, motion: 'kneel-warm-hands', position: at(FIRE[0] + 1.5, FIRE[1] + 1.2), target: FIRE, principal: true },
  { id: 'james', ...JAMES, motion: 'kneel-warm-hands', position: at(FIRE[0] + 2.0, FIRE[1] - 1.0), target: FIRE, phase: 2.4 },
  { id: 'john', ...JOHN, motion: 'sit-floor', position: at(FIRE[0] - 0.7, FIRE[1] + 2.2), target: FIRE, phase: 1.1 },
  { id: 'andrew', ...ANDREW, motion: 'sit-floor-reclined', position: at(FIRE[0] - 2.4, FIRE[1] + 1.4), target: FIRE, phase: 3.2 },
  { id: 'disciple-a', ...OTHERS[0], motion: 'sit-floor', position: at(FIRE[0] + 0.6, FIRE[1] - 2.4), target: FIRE, phase: 0.5 },
  { id: 'disciple-b', ...OTHERS[1], motion: 'sit-floor-reclined', position: at(FIRE[0] + 2.8, FIRE[1] - 3.0), target: FIRE, phase: 4.4 },
  // Asleep on their cloaks, lying along the slope's contour.
  { id: 'disciple-c', ...OTHERS[2], motion: 'lie-asleep', position: at(FIRE[0] - 4.2, FIRE[1] - 2.6), facing: 0, mat: { w: 0.9, d: 2.0, offset: 0.15 }, audience: true },
  { id: 'disciple-d', ...OTHERS[3], motion: 'lie-asleep', position: at(FIRE[0] + 4.8, FIRE[1] + 1.4), facing: Math.PI, mat: { w: 0.9, d: 2.0, offset: 0.15 }, audience: true },
  { id: 'disciple-e', ...OTHERS[4], motion: 'talk-chat', position: at(FIRE[0] + 0.9, FIRE[1] + 3.7), target: FIRE, phase: 1.9 },
  { id: 'judas', ...JUDAS, motion: 'thinking', position: at(FIRE[0] + 4.6, FIRE[1] - 3.6), target: FIRE, phase: 2.7 },
];
function lodgedProps(kit) {
  const { THREE, group, own, material, flicker } = kit;
  const y = groundAt(...FIRE);
  const stones = own(new THREE.DodecahedronGeometry(0.13, 0));
  const pale = limestone(kit);
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2;
    const stone = new THREE.Mesh(stones, pale);
    stone.position.set(FIRE[0] + Math.cos(a) * 0.5, y + 0.06, FIRE[1] + Math.sin(a) * 0.5);
    stone.rotation.set(a, a * 2, 0);
    group.add(stone);
  }
  const log = own(new THREE.CylinderGeometry(0.045, 0.05, 0.62, 6));
  for (let i = 0; i < 4; i += 1) {
    const wood = new THREE.Mesh(log, material('darkTimber'));
    wood.position.set(FIRE[0], y + 0.1, FIRE[1]);
    wood.rotation.set(Math.PI / 2 - 0.35, (i / 4) * Math.PI * 2, 0, 'YXZ');
    group.add(wood);
  }
  for (let i = 0; i < 3; i += 1) {
    const flame = flicker(new THREE.Mesh(own(new THREE.ConeGeometry(0.14 - i * 0.03, 0.42 + i * 0.08, 8)), material('flame')));
    flame.position.set(FIRE[0] + (i - 1) * 0.08, y + 0.3 + i * 0.03, FIRE[1] + (i % 2) * 0.06);
    group.add(flame);
  }
  const anchor = lightAnchor(kit, { ...FIRELIGHT, intensity: 4, distance: 14 });
  anchor.position.set(FIRE[0], y + 0.7, FIRE[1]);
  group.add(anchor);
  seatRock(kit, LODGE_SEAT, 0.4);
  return { clearance: [{ x: FIRE[0], z: FIRE[1], radius: 0.7 }, { x: LODGE_SEAT[0], z: LODGE_SEAT[1], radius: 0.6 }] };
}

// --- 7. Across the brook: Mark 14:26-31 ---------------------------------------

// At the crossing, going east to the garden; Jesus has turned to Peter.
const KIDRON = [-83.5, 49.7];
export const KIDRON_CAST = [
  { id: 'jesus', ...JESUS, motion: 'talk-chat', position: at(...KIDRON), target: [-82.2, 50.9], principal: true },
  // "Even though they all fall away, I will not." (14:29)
  { id: 'peter', ...PETER, motion: 'shake-no', position: at(-82.2, 50.9), target: KIDRON, principal: true },
  { id: 'john', ...JOHN, motion: 'sad-idle', position: at(-80.5, 49.1), target: KIDRON, phase: 1.2 },
  { id: 'james', ...JAMES, motion: 'thinking', position: at(-85.5, 48.3), target: KIDRON, phase: 2.3 },
  { id: 'andrew', ...ANDREW, motion: 'look-around', position: at(-86.4, 51.4), target: KIDRON, phase: 0.4 },
  { id: 'disciple-a', ...OTHERS[0], motion: 'torch-idle', position: at(-87.9, 49.6), target: KIDRON, hold: [{ bone: 'LeftHand', at: [0, 0.07, 0.02], build: litTorch }] },
  { id: 'disciple-b', ...OTHERS[1], motion: 'sad-idle', position: at(-84.6, 52.6), target: KIDRON, phase: 3.1 },
  { id: 'disciple-c', ...OTHERS[2], motion: 'weight-shift', position: at(-82.4, 47.3), target: KIDRON, phase: 1.7 },
  { id: 'disciple-d', ...OTHERS[3], motion: 'thinking', position: at(-88.8, 52.0), target: KIDRON, phase: 2.9, audience: true },
  { id: 'disciple-e', ...OTHERS[4], motion: 'breathing-idle', position: at(-87.2, 47.2), target: KIDRON, phase: 4.0, audience: true },
  { id: 'disciple-f', ...OTHERS[5], motion: 'sad-idle', position: at(-89.9, 50.2), target: KIDRON, phase: 0.9, audience: true },
];

// --- 8. Gethsemane: Mark 14:32-42 ---------------------------------------------

export const PRAYING = [3.3, -6.3];
const THREE_ASLEEP = [-9.8, 6.0];
export const GETHSEMANE_CAST = [
  // Luke: he knelt down and prayed (22:41).
  { id: 'jesus', ...JESUS, motion: 'kneel-pray', position: at(...PRAYING), target: [6, -8], principal: true },
  // Peter, James and John, a stone's throw back, asleep (14:37, 40) — lying
  // along the contour.
  { id: 'peter', ...PETER, motion: 'sleep-deep', position: at(THREE_ASLEEP[0], THREE_ASLEEP[1]), facing: -Math.PI / 2, principal: true },
  { id: 'james', ...JAMES, motion: 'lie-asleep', position: at(THREE_ASLEEP[0] - 2.2, THREE_ASLEEP[1] + 2.2), facing: Math.PI, phase: 2.2 },
  { id: 'john', ...JOHN, motion: 'sit-floor-reclined', position: at(THREE_ASLEEP[0] + 1.4, THREE_ASLEEP[1] + 2.6), target: PRAYING, phase: 1.3 },
  // The other eight, near the gate: "Sit here while I pray." (14:32)
  ...[
    [-24.4, 7.6, 'lie-asleep', 0], [-26.0, 10.6, 'sit-floor-reclined', null], [-23.4, 14.6, 'sleep-deep', Math.PI / 2],
    [-27.4, 15.8, 'lie-asleep', Math.PI], [-20.6, 10.0, 'sit-floor', null], [-27.2, 4.4, 'sit-floor-reclined', null],
    [-24.4, 18.2, 'lie-asleep', 0], [-20.4, 16.4, 'sit-floor-reclined', null],
  ].map(([x, z, motion, facing], i) => ({
    id: `sleeping-${i}`,
    ...(i === 7 ? ANDREW : OTHERS[i % OTHERS.length]),
    motion,
    position: at(x, z),
    ...(facing === null ? { target: [-20, 4] } : { facing }),
    phase: (i * 1.13) % 6,
    audience: true,
  })),
];

// --- 9. The arrest: John 18:3-12 ----------------------------------------------

// Inside the garden's west gate, facing the band come up from the brook.
export const ARRESTED = [-24.0, 4.5];
const JUDAS_AT = [-24.42, 4.62];
export const ARREST_CAST = [
  { id: 'jesus', ...JESUS, motion: 'breathing-idle', position: at(...ARRESTED), target: [-30, 4.5], principal: true },
  { id: 'judas', ...JUDAS, pose: 'kiss', position: at(...JUDAS_AT), target: toward(at(...ARRESTED)), principal: true },
  { id: 'peter', ...PETER, pose: 'swordRaised', position: at(-22.6, 6.7), target: [-24.2, 7.6], principal: true, hold: [{ bone: 'RightHand', at: [0, 0.07, 0.02], euler: [0, 0, 0], build: sword }] },
  { id: 'malchus', model: 'human-villager', tint: { Cloth: 0x6a6258 }, pose: 'earClutch', position: at(-24.2, 7.6), target: [-26, 8.6], principal: true },
  // The band, with lanterns and torches and weapons (18:3).
  ...[
    [-26.6, 1.6, 'torch'], [-27.8, 6.6, 'spear'], [-28.4, 3.4, 'torch'], [-29.8, 5.8, 'club'],
    [-30.6, 2.2, 'spear'], [-26.4, 9.8, 'lantern'], [-31.4, 8.4, 'torch'], [-33.4, 4.4, 'spear'],
    [-35.8, 6.2, 'torch'], [-34.6, 1.4, 'club'],
  ].map(([x, z, carry], i) => ({
    id: `band-${i}`,
    ...(carry === 'spear' ? SOLDIER(villager(i)) : OFFICER(villager(i + 1))),
    ...(carry === 'torch' ? { motion: 'torch-idle', hold: [{ bone: 'LeftHand', at: [0, 0.07, 0.02], build: i < 3 ? litTorch : torch }] }
      : carry === 'spear' ? { pose: 'atEase', hold: [{ bone: 'RightHand', at: [0, 0.07, 0.02], build: spear }] }
        : carry === 'lantern' ? { motion: 'breathing-idle', hold: [{ bone: 'RightHand', at: [0, 0.02, 0.02], build: lantern }] }
          : { motion: 'yell-angry', hold: [{ bone: 'RightHand', at: [0, 0.07, 0.02], build: club }] }),
    position: at(x, z),
    target: toward(at(...ARRESTED)),
    phase: (i * 1.29) % 6,
    audience: i > 5,
  })),
  // The disciples behind him, about to run (14:50).
  { id: 'john', ...JOHN, motion: 'surprised', position: at(-19.8, 3.2), target: toward(at(...ARRESTED)), phase: 0.6 },
  { id: 'james', ...JAMES, motion: 'surprised', position: at(-19.2, 6.4), target: toward(at(...ARRESTED)), phase: 1.9 },
  { id: 'andrew', ...ANDREW, motion: 'look-around', position: at(-17.6, 1.6), target: [-10, 0], phase: 2.6, audience: true },
];

// --- 10. The ascension: Acts 1:9-12 -------------------------------------------

export const ASCENDING = [EVENT_GROUND.ascension.x, EVENT_GROUND.ascension.z];
export const ASCENT_LIFT = 2.6;
export const ASCENSION_CAST = [
  { id: 'jesus', ...JESUS, pose: 'blessing', position: at(ASCENDING[0], ASCENDING[1], ASCENT_LIFT), target: [ASCENDING[0] + 8, ASCENDING[1] + 8], principal: true, solid: false },
  ...[
    [4.2, 1.2, 'look-up-arms', PETER], [3.4, 3.5, 'look-up-arms', JOHN], [1.4, 4.6, 'surprised', JAMES],
    [5.0, -1.4, 'pray-sway', ANDREW], [-1.2, 4.4, 'kneel-pray', OTHERS[0]], [2.2, 6.4, 'thankful', OTHERS[1]],
    [2.4, -3.8, 'look-up-arms', OTHERS[2]], [-3.8, 2.4, 'surprised', OTHERS[3]], [6.4, 0.9, 'pray-sway', OTHERS[4]],
    [0.6, -4.6, 'kneel-pray', OTHERS[5]], [-4.4, -0.8, 'thankful', OTHERS[6]],
  ].map(([dx, dz, motion, who], i) => ({
    id: i < 4 ? ['peter', 'john', 'james', 'andrew'][i] : `apostle-${i}`,
    ...who,
    motion,
    position: at(ASCENDING[0] + dx, ASCENDING[1] + dz),
    target: ASCENDING,
    principal: i === 0,
    phase: (i * 1.21) % 6,
    audience: i > 6,
  })),
  // "Two men stood by them in white robes." (1:10)
  { id: 'white-a', model: 'human-traveler', tint: { Cloth: WHITE, Hair: 0xd8d2c6, Beard: 0xd8d2c6 }, motion: 'talk-ask', position: at(ASCENDING[0] + 8.6, ASCENDING[1] + 1.4), target: [ASCENDING[0] + 3.4, ASCENDING[1] + 3.5], principal: true },
  { id: 'white-b', model: 'human-villager', tint: { Cloth: WHITE, Hair: 0xd8d2c6, Beard: 0xd8d2c6 }, motion: 'breathing-idle', position: at(ASCENDING[0] + 9.4, ASCENDING[1] - 0.8), target: [ASCENDING[0] + 3.4, ASCENDING[1] + 3.5], phase: 1.6 },
];
// "A cloud took him out of their sight": soft, bright, gathering under him.
function cloudProps({ THREE, group, own }) {
  const cloud = new THREE.Group();
  cloud.name = 'cloud';
  const puff = own(new THREE.SphereGeometry(1, 16, 12));
  const white = own(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, transparent: true, opacity: 0.72, depthWrite: false, emissive: 0xf4efe6, emissiveIntensity: 0.35,
  }));
  const base = groundAt(...ASCENDING) + ASCENT_LIFT;
  const puffs = [[0, -0.35, 0, 1.25], [0.9, -0.2, 0.4, 0.9], [-0.8, -0.25, -0.3, 1.0], [0.3, 0.1, -0.9, 0.8], [-0.4, 0.2, 0.8, 0.75], [1.4, 0.3, -0.6, 0.6], [-1.3, 0.45, 0.2, 0.65]];
  for (const [dx, dy, dz, r] of puffs) {
    const mesh = new THREE.Mesh(puff, white);
    mesh.position.set(ASCENDING[0] + dx, base + dy, ASCENDING[1] + dz);
    mesh.scale.set(r * 1.2, r * 0.7, r);
    mesh.renderOrder = 4;
    cloud.add(mesh);
  }
  group.add(cloud);
  return {
    update: (time) => {
      cloud.rotation.y = wave(time, 1) * 0.05;
      cloud.position.y = wave(time, 2) * 0.05;
    },
  };
}

// --- the stages ---------------------------------------------------------------

const stage = (options) => ({
  poses: OLIVET_POSES,
  ...options,
  create: (THREE, {
    root, onReady, active, motionLibrary,
  } = {}) => createTableau(THREE, {
    poses: OLIVET_POSES, floorAt: groundAt, drawDistance: 90, root, onReady, active, motionLibrary, ...options,
  }),
});
const focusAt = ([x, z], lift = 1) => [x, groundAt(x, z) + lift, z];

export const OLIVET_EVENT_STAGES = {
  'the-colt': stage({ name: 'colt-tableau', cast: COLT_CAST, focus: focusAt([597, -53.4]), props: coltProps }),
  'triumphal-entry': stage({ name: 'entry-tableau', cast: ENTRY_CAST, focus: focusAt(ENTRY, 1.6), props: entryProps }),
  weeping: stage({ name: 'weeping-tableau', cast: WEEP_CAST, focus: focusAt(WEEP, 1.6), props: weepProps }),
  'fig-tree': stage({ name: 'fig-tableau', cast: FIG_CAST, focus: focusAt([472.5, 95.5]) }),
  'olivet-discourse': stage({ name: 'discourse-tableau', cast: DISCOURSE_CAST, focus: focusAt(DISCOURSE, 0.7), props: discourseProps }),
  lodged: stage({ name: 'lodged-tableau', cast: LODGED_CAST, focus: focusAt(FIRE, 0.6), props: lodgedProps }),
  'across-the-kidron': stage({ name: 'kidron-tableau', cast: KIDRON_CAST, focus: focusAt(KIDRON) }),
  gethsemane: stage({ name: 'gethsemane-tableau', cast: GETHSEMANE_CAST, focus: focusAt(PRAYING, 0.8) }),
  'the-arrest': stage({ name: 'arrest-tableau', cast: ARREST_CAST, focus: focusAt(ARRESTED) }),
  ascension: stage({ name: 'ascension-tableau', cast: ASCENSION_CAST, focus: focusAt(ASCENDING, 2), props: cloudProps }),
};

// Whether a point is on any staged moment's ground (olivetDimensions.js
// EVENT_GROUND), which the Mount's own people keep off.
export function inOlivetEventArea(x, z) {
  return Object.values(EVENT_GROUND).some((ground) => Math.hypot(x - ground.x, z - ground.z) < ground.r);
}
