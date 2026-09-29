// What happened in Capernaum, staged one moment at a time.
//
// The gospels set more of Jesus' ministry in this village than anywhere else,
// and much of it in the same few places: the shore, the synagogue, one house,
// its door. So the village cannot show everything at once — the house would
// have to hold a fevered woman, a man let down through its roof and twelve
// men arguing about which of them was the greatest, all on the same afternoon.
// Instead each event is a staged moment (sceneTableau.js) and only one is
// staged at a time; the visitor chooses which from the list of events, in the
// order the gospels tell them (src/lib/capernaumScene.js `events`).
//
// Most of the moments live here. The rebuke in the synagogue and the bread of
// life share the synagogue's furniture (synagogueTableau.js); the man let down
// through the roof (mark2Tableau.js) and the call of Matthew
// (matthew9Tableau.js) are older and keep their own code. EVENT_STAGES lists
// the ones built on sceneTableau.js, which is what their shared tests walk.
//
// Recurring people are dressed the same in every event they appear in, so a
// visitor stepping from one to the next can tell Peter from Andrew: see the
// tints below. Jesus is the one character with a model of his own.
//
// Where the gospels do not say — which house, which stretch of shore, how many
// were in the room — the staging is reconstruction, and each event's text in
// the manifest says what is reconstruction and what is written.
//
// three.js is passed in, so the module stays importable in jsdom.

import {
  LEVEL, HOUSE, BOATS, PIERS, SHORE,
} from './capernaumDimensions.js';
import { createTableau, wave, SEAT_DROP } from './sceneTableau.js';
import {
  COMMON_POSES, SEATED_LEGS, KNEEL_LEGS,
} from './tableauPoses.js';
import { beachedPose, THWARTS, netTexture } from './capernaumBoats.js';
import { createSynagogueTableau, createBreadOfLifeTableau } from './synagogueTableau.js';

const G = LEVEL.ground;
const B = LEVEL.beach;

// The disciples who recur, dressed alike wherever they appear.
const PETER = { model: 'human-artisan', tint: { Cloth: 0x5f6f7e } };
const ANDREW = { model: 'human-traveler', tint: { Cloth: 0x8b7755 } };
const JAMES = { model: 'human-traveler', tint: { Cloth: 0x6e5540 } };
const JOHN = { model: 'human-villager', tint: { Cloth: 0xa3977c } };
const WOMAN = 'human-tabernacle-camp-woman';
const VILLAGERS = ['human-villager', 'human-traveler', 'human-artisan'];
const villager = (i) => VILLAGERS[i % VILLAGERS.length];

const inRect = (x, z, [x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1;

// The room of the house (see capernaumDimensions.js HOUSE), inside its walls,
// and the front edges of the stone benches along its west and east walls
// (buildCapernaum.js), which is where anyone sitting on them sits.
export const ROOM = {
  x0: HOUSE.x0 + HOUSE.wall,
  x1: HOUSE.x1 - HOUSE.wall,
  z0: HOUSE.z0 + HOUSE.wall,
  z1: HOUSE.z1 - HOUSE.wall,
  benchWest: HOUSE.x0 + 0.9,
  benchEast: HOUSE.x1 - 0.9,
  benchTop: LEVEL.ground + 0.45,
};
const onWestBench = (z) => [ROOM.benchWest - 0.2, ROOM.benchTop - SEAT_DROP, z];
const onEastBench = (z) => [ROOM.benchEast + 0.2, ROOM.benchTop - SEAT_DROP, z];
const DOOR_X = (HOUSE.doorX0 + HOUSE.doorX1) / 2;

// --- props --------------------------------------------------------------------

// A Herodian clay lamp with its flame: in a hand, on a stand, in a niche.
function clayLamp({ THREE, own, material, flicker }) {
  const lamp = new THREE.Group();
  lamp.name = 'clay-lamp';
  const body = new THREE.Mesh(own(new THREE.SphereGeometry(0.05, 12, 8)), material('clay'));
  body.scale.set(1.35, 0.5, 1);
  body.position.y = 0.022;
  body.castShadow = true;
  lamp.add(body);
  const nozzle = new THREE.Mesh(own(new THREE.CylinderGeometry(0.014, 0.018, 0.05, 8)), material('clay'));
  nozzle.rotation.z = Math.PI / 2;
  nozzle.position.set(0.07, 0.024, 0);
  lamp.add(nozzle);
  const flame = new THREE.Mesh(own(new THREE.ConeGeometry(0.014, 0.06, 8)), material('flame'));
  flame.position.set(0.095, 0.062, 0);
  flame.name = 'lamp-flame';
  lamp.add(flicker(flame));
  // The light itself is not a light — a new light recompiles every material
  // in the scene the moment it appears — but a soft halo reads as one.
  const halo = new THREE.Mesh(own(new THREE.SphereGeometry(0.09, 10, 8)), material('flame'));
  halo.material = own(material('flame').clone());
  halo.material.opacity = 0.16;
  halo.position.copy(flame.position);
  lamp.add(halo);
  return lamp;
}

// Held upright on the palm, whatever the hand's own angle.
const lampInHand = (kit) => {
  const lamp = clayLamp(kit);
  lamp.userData.aimed = true;
  return lamp;
};

// A staff standing on the ground, gripped where the hand is.
const staffTo = (extraAbove) => ({ THREE, own, material }, { grip, floor }) => {
  const length = grip.y - floor + extraAbove;
  const staff = new THREE.Group();
  const pole = new THREE.Mesh(own(new THREE.CylinderGeometry(0.018, 0.022, length, 7)), material('timber'));
  pole.position.y = extraAbove - length / 2;
  pole.castShadow = true;
  staff.add(pole);
  staff.userData.aimed = true;
  return staff;
};

// --- 1. The call of the fishermen: Mark 1:16-20 --------------------------------

// The boat drawn up at the west end of the beach (capernaumBoats.js), with the
// sons of Zebedee sitting in it over their nets.
const ZEBEDEE_BOAT = BOATS.find((boat) => boat.id === 'boat-beach-a');
const BOAT_POSE = beachedPose(ZEBEDEE_BOAT, B);
// A point in the boat's own frame (+Z to the bow, +X to starboard, the keel at
// y = 0) carried into the world: the same YXZ rotation the fleet gives it.
function inBoat([x, y, z]) {
  const [rx, ry, rz] = BOAT_POSE.rotation;
  // Rz, then Rx, then Ry.
  let px = x * Math.cos(rz) - y * Math.sin(rz);
  let py = x * Math.sin(rz) + y * Math.cos(rz);
  let pz = z;
  const qy = py * Math.cos(rx) - pz * Math.sin(rx);
  const qz = py * Math.sin(rx) + pz * Math.cos(rx);
  py = qy;
  pz = qz;
  const wx = px * Math.cos(ry) + pz * Math.sin(ry);
  const wz = -px * Math.sin(ry) + pz * Math.cos(ry);
  px = wx;
  return [BOAT_POSE.position[0] + px, BOAT_POSE.position[1] + py, BOAT_POSE.position[2] + wz];
}
// Facing to starboard, over the gunwale where the net hangs.
const STARBOARD = Math.atan2(Math.cos(ZEBEDEE_BOAT.rotation), -Math.sin(ZEBEDEE_BOAT.rotation));
const onThwart = (x, z) => {
  const seat = inBoat([x, THWARTS.top, z]);
  return [seat[0], seat[1] - SEAT_DROP, seat[2]];
};
const SIMON_AT = [-13.5, B, -18.45];
const FISHERMEN_JESUS = [-11.55, B, -16.25];

export const FISHERMEN_CAST = [
  { id: 'jesus', model: 'human-jesus', pose: 'callFollow', position: FISHERMEN_JESUS, target: [SIMON_AT[0] - 0.3, SIMON_AT[2]], principal: true },
  { id: 'simon', ...PETER, pose: 'castNet', position: SIMON_AT, target: [SIMON_AT[0] - 0.4, SIMON_AT[2] - 4], principal: true },
  { id: 'andrew', ...ANDREW, pose: 'gatherNet', position: [-12.2, B, -18.2], target: [-12.6, -20], phase: 2.1 },
  // In the boat, "mending the nets" (1:19) — and looking up.
  { id: 'james', ...JAMES, pose: 'mendLook', position: onThwart(0.32, THWARTS.z[1]), facing: STARBOARD + 0.5, inBoat: true, solid: false },
  { id: 'john', ...JOHN, pose: 'mend', position: onThwart(0.32, THWARTS.z[2]), facing: STARBOARD, inBoat: true, solid: false, phase: 1.3 },
  // Their father, and the hired men (1:20).
  { id: 'zebedee', model: 'human-artisan', tint: { Cloth: 0x7b7466, Hair: 0x9a948a, Beard: 0x9a948a }, pose: 'mend', position: onThwart(-0.1, THWARTS.z[0]), facing: STARBOARD, inBoat: true, solid: false, phase: 3.2 },
  { id: 'hired-a', model: 'human-villager', pose: 'haul', position: [inBoat([2.15, 0, 0.2])[0], B, inBoat([2.15, 0, 0.2])[2]], facing: STARBOARD + Math.PI, audience: true, blocked: 'boat' },
  { id: 'hired-b', model: 'human-traveler', pose: 'haul', position: [inBoat([2.15, 0, 1.6])[0], B, inBoat([2.15, 0, 1.6])[2]], facing: STARBOARD + Math.PI, audience: true, blocked: 'boat', phase: 1.9 },
];

const FISHERMEN_POSES = {
  ...COMMON_POSES,
  // "Follow me": the right arm out to them, the hand open.
  callFollow: (t) => ({
    spineLean: 4 + wave(t, 2) * 0.4,
    headPitch: 4,
    leftLeg: { thighFlex: 6, shinFlex: 0 },
    rightLeg: { thighFlex: -6, shinFlex: -3 },
    left: { armFlex: -2, armAbduct: 6, foreArmFlex: 14 },
    right: { armFlex: 64 + wave(t, 2) * 0.6, armAbduct: 12, foreArmFlex: 80 },
    fingerCurl: 6,
  }),
  // The throw just gone: both arms still out after the net, the body turned
  // through with it, the weight on the front foot.
  castNet: (t) => ({
    spineLean: 16 + wave(t, 2) * 0.8,
    spineYaw: -14,
    headPitch: -6,
    leftLeg: { thighFlex: 22, shinFlex: 4 },
    rightLeg: { thighFlex: -16, shinFlex: -26, ankleBend: 14 },
    left: { armFlex: 96, armAbduct: 26, foreArmFlex: 104 },
    right: { armFlex: 104, armAbduct: 18, foreArmFlex: 112 },
    fingerCurl: 8,
  }),
  // Bent over the wet net at his feet.
  gatherNet: (t) => ({
    spineLean: 40 + wave(t, 2) * 2,
    headPitch: 6,
    leftLeg: { thighFlex: 28, shinFlex: -6 },
    rightLeg: { thighFlex: 12, shinFlex: -14 },
    left: { armFlex: 16 + wave(t, 2) * 5, armAbduct: 12, foreArmFlex: 26 },
    right: { armFlex: 20 - wave(t, 2) * 5, armAbduct: 10, foreArmFlex: 32 },
    fingerCurl: 62,
  }),
  // At the net over the gunwale, the hands working.
  mend: (t) => ({
    seated: true,
    ...SEATED_LEGS,
    spineLean: 20 + wave(t, 4) * 1.2,
    headPitch: 16,
    left: { armFlex: 38 + wave(t, 4) * 4, armAbduct: 8, foreArmFlex: 92 },
    right: { armFlex: 34 - wave(t, 4, 1) * 4, armAbduct: 8, foreArmFlex: 98 + wave(t, 4, 1) * 6 },
    fingerCurl: 48,
  }),
  // Hands still in the net, head come up.
  mendLook: (t) => ({
    seated: true,
    ...SEATED_LEGS,
    spineLean: 8 + wave(t, 1) * 0.6,
    spineYaw: 18,
    headPitch: -4,
    left: { armFlex: 36, armAbduct: 8, foreArmFlex: 88 },
    right: { armFlex: 32, armAbduct: 8, foreArmFlex: 94 },
    fingerCurl: 50,
  }),
  // Holding the foot of the net off the shingle.
  haul: (t) => ({
    spineLean: 10 + wave(t, 2) * 0.8,
    headPitch: 8,
    leftLeg: { thighFlex: 8, shinFlex: 0 },
    rightLeg: { thighFlex: -6, shinFlex: -4 },
    left: { armFlex: 34, armAbduct: 10, foreArmFlex: 64 },
    right: { armFlex: 36, armAbduct: 10, foreArmFlex: 62 },
    fingerCurl: 72,
  }),
};

// The cast net in the air: a bell of net opening as it goes out over the
// water, lead weights round its mouth, and the hand line back to the thrower.
function fishermenProps({ THREE, group, own, material, addMesh }) {
  const netMaterial = own(new THREE.MeshStandardMaterial({
    color: 0xffffff, map: own(netTexture(THREE, { size: 64, cells: 6 })), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1,
  }));
  netMaterial.map.repeat.set(4, 2);
  const net = new THREE.Group();
  net.name = 'cast-net';
  net.position.set(SIMON_AT[0] - 0.35, B + 0.95, SIMON_AT[2] - 2.6);
  net.rotation.x = 0.28;
  group.add(net);
  const bell = new THREE.Mesh(own(new THREE.CylinderGeometry(0.16, 1.25, 0.8, 28, 3, true)), netMaterial);
  net.add(bell);
  const weight = own(new THREE.SphereGeometry(0.022, 6, 5));
  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    const lead = new THREE.Mesh(weight, material('iron'));
    lead.position.set(Math.cos(angle) * 1.25, -0.4, Math.sin(angle) * 1.25);
    net.add(lead);
  }
  const line = addMesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 4), 'cord');
  const up = new THREE.Vector3(0, 1, 0);
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const along = new THREE.Vector3();
  return {
    update: (time, dt, actors) => {
      const hand = actors.get('simon')?.root.getObjectByName('mixamorigRightHand');
      if (!hand) return;
      hand.localToWorld(from.set(0, 0.06, 0));
      group.worldToLocal(from);
      net.localToWorld(to.set(0, 0.4, 0));
      group.worldToLocal(to);
      along.subVectors(to, from);
      line.position.copy(from).add(to).multiplyScalar(0.5);
      line.scale.set(1, along.length(), 1);
      line.quaternion.setFromUnitVectors(up, along.normalize());
      net.rotation.y = time * 0.3;
    },
  };
}

// --- 2. Peter's mother-in-law: Mark 1:29-31 ------------------------------------

const HER_AT = [13.2, G + 0.02, 11.45];
export const MOTHER_IN_LAW_CAST = [
  { id: 'her', model: WOMAN, pose: 'risingUp', position: HER_AT, facing: Math.PI / 2, veil: 0x5d5348, tint: { Hair: 0xa8a39c }, principal: true, mat: { w: 0.8, d: 1.95, offset: 0.65 }, radius: 0.55 },
  { id: 'jesus', model: 'human-jesus', pose: 'liftUp', position: [13.98, G, 12.02], target: [HER_AT[0] + 0.25, HER_AT[2] + 0.1], principal: true },
  { id: 'peter', ...PETER, pose: 'standListen', motion: 'breathing-idle', position: [15.35, G, 13.05], target: [13.6, 11.7] },
  { id: 'andrew', ...ANDREW, pose: 'crane', position: [16.3, G, 12.3], target: [13.6, 11.7], phase: 1.2 },
  { id: 'james', ...JAMES, pose: 'standListen', motion: 'thinking', position: [16.7, G, 13.75], target: [13.8, 11.8], phase: 2.4 },
  { id: 'john', ...JOHN, pose: 'crane', position: [16.25, G, 14.35], target: [13.6, 11.6], phase: 3.6 },
  // Simon's wife (1 Corinthians 9:5), kneeling at her mother's head.
  { id: 'wife', model: WOMAN, pose: 'kneelTend', position: [13.25, G, 12.55], target: [13.4, 11.4], veil: 0x7a5a45, mat: true },
];

const MOTHER_IN_LAW_POSES = {
  ...COMMON_POSES,
  // Stooping to her, his right hand holding hers.
  liftUp: (t) => ({
    // Down on bent knees to her, not just bent over.
    hipsHeight: 0.72,
    spineLean: 48 + wave(t, 2) * 0.6,
    headPitch: 2,
    leftLeg: { thighFlex: 50, shinFlex: -36, ankleBend: -8 },
    rightLeg: { thighFlex: 36, shinFlex: -50, ankleBend: 6 },
    left: { armFlex: 12, armAbduct: 8, foreArmFlex: 34 },
    right: { armFlex: 50, armAbduct: -6, foreArmFlex: 52, foreArmAbduct: -6 },
    fingerCurl: 58,
  }),
  // Sitting up on her mat as he lifts her, her hand in his, looking up.
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
  // Kneeling at the head of the mat, a cloth in her hands.
  kneelTend: (t) => ({
    kneeling: true,
    ...KNEEL_LEGS,
    spineLean: 18 + wave(t, 1) * 0.6,
    headPitch: 8,
    left: { armFlex: 30, armAbduct: 6, foreArmFlex: 74 },
    right: { armFlex: 32, armAbduct: 6, foreArmFlex: 70 },
    fingerCurl: 40,
  }),
};

function motherInLawProps({ THREE, addMesh }) {
  // A blanket over her legs, and a bowl of water on the bench by her head.
  const blanket = addMesh(new THREE.BoxGeometry(0.46, 0.07, 0.95), 'wool', [HER_AT[0] + 0.72, G + 0.13, HER_AT[2]]);
  blanket.rotation.y = Math.PI / 2;
  addMesh(new THREE.CylinderGeometry(0.15, 0.1, 0.08, 14), 'clay', [ROOM.benchWest - 0.28, ROOM.benchTop + 0.04, 11.95]);
  return {};
}

// --- 3. At the door at sundown: Mark 1:32-34 -----------------------------------

const DOOR_JESUS = [DOOR_X - 0.05, G, HOUSE.z1 + 0.75];
const toJesus = [DOOR_JESUS[0], DOOR_JESUS[2]];
export const SUNDOWN_CAST = [
  { id: 'jesus', model: 'human-jesus', pose: 'layHands', position: DOOR_JESUS, target: [DOOR_JESUS[0], 20], principal: true },
  { id: 'kneeling', model: WOMAN, pose: 'kneelBowed', position: [DOOR_JESUS[0] + 0.02, G, DOOR_JESUS[2] + 0.6], target: toJesus, veil: 0x6b4a3a, principal: true },
  { id: 'peter', ...PETER, pose: 'standListen', position: [DOOR_JESUS[0] - 1.2, G, DOOR_JESUS[2] + 1.05], target: [15.2, 18] },
  { id: 'andrew', ...ANDREW, pose: 'holdLamp', position: [DOOR_JESUS[0] + 1.3, G, DOOR_JESUS[2] + 1.05], target: [15.8, 18], hold: [{ bone: 'RightHand', at: [0, 0.07, 0.03], build: lampInHand }] },
  // A sick man laid on a mat before the door, and the two who carried him.
  { id: 'sick', model: 'human-traveler', pose: 'lieStill', position: [13.55, G + 0.1, 18.9], target: [13.55, 17.2], lying: true, mat: { w: 0.8, d: 1.95, offset: 0.85 } },
  { id: 'bearer-a', model: 'human-artisan', pose: 'kneelTend', position: [12.9, G, 18.0], target: [13.55, 18.0], audience: true },
  { id: 'bearer-b', model: 'human-villager', pose: 'kneelListen', position: [14.3, G, 18.55], target: toJesus, audience: true, phase: 2 },
  // A blind man with a boy to lead him, and an old man on a stick.
  { id: 'blind', model: 'human-artisan', pose: 'led', position: [17.45, G, 18.2], target: toJesus, principal: true },
  { id: 'boy', model: 'human-villager', pose: 'standIdle', position: [17.1, G, 18.14], target: toJesus, scale: 0.8, near: ['blind'] },
  { id: 'old-man', model: 'human-artisan', tint: { Hair: 0xb0aba3, Beard: 0xb0aba3, Cloth: 0x8d8370 }, pose: 'onStaff', position: [18.7, G, 19.3], target: toJesus, hold: [{ bone: 'RightHand', at: [0, 0.07, 0], build: staffTo(0.22) }] },
  // Lamps, because the sun has gone.
  { id: 'lamp-a', model: 'human-traveler', pose: 'holdLamp', position: [13.0, G, 20.3], target: toJesus, audience: true, hold: [{ bone: 'RightHand', at: [0, 0.07, 0.03], build: lampInHand }] },
  { id: 'lamp-b', model: WOMAN, pose: 'holdLamp', position: [18.1, G, 21.2], target: toJesus, veil: 0xd6cbb2, audience: true, hold: [{ bone: 'RightHand', at: [0, 0.07, 0.03], build: lampInHand }] },
  { id: 'lamp-c', model: 'human-villager', pose: 'holdLamp', position: [14.2, G, 22.3], target: toJesus, audience: true, phase: 1.5, hold: [{ bone: 'RightHand', at: [0, 0.07, 0.03], build: lampInHand }] },
  // The rest of the town, pressing in.
  ...[
    [12.75, 21.6, 'crane'], [13.35, 23.5, 'press'], [17.3, 22.9, 'crane'], [18.8, 23.8, 'press'],
    [19.9, 22.0, 'standListen', 'pray-buckled'], [12.9, 25.0, 'standListen', 'weight-shift'], [17.6, 25.0, 'crane'], [19.6, 20.2, 'press'],
  ].map(([x, z, pose, motion], i) => ({
    id: `town-${i}`, model: villager(i), pose, motion, position: [x, G, z], target: toJesus, audience: true, phase: (i * 1.37) % 6,
  })),
  { id: 'town-woman', model: WOMAN, pose: 'standListen', motion: 'pray-sway', position: [14.2, G, 24.6], target: toJesus, veil: 0x8a6d55, audience: true, phase: 2.7 },
];

const SUNDOWN_POSES = {
  ...COMMON_POSES,
  // His hand on the head of the woman kneeling before him (Luke 4:40: "he
  // laid his hands on every one of them").
  layHands: (t) => ({
    spineLean: 16 + wave(t, 2) * 0.5,
    headPitch: 14,
    leftLeg: { thighFlex: 6, shinFlex: 0 },
    rightLeg: { thighFlex: -4, shinFlex: -4 },
    left: { armFlex: 10, armAbduct: 8, foreArmFlex: 40 },
    right: { armFlex: 70, armAbduct: -24, foreArmFlex: 70, foreArmAbduct: -24, handTwist: -10 },
    fingerCurl: 14,
  }),
  lieStill: (t) => ({
    spineLean: -2 + wave(t, 2) * 0.35,
    headPitch: 7,
    left: { armFlex: 4, armAbduct: 3, foreArmFlex: 18, foreArmAbduct: -10, handTwist: 75 },
    right: { armFlex: 3, armAbduct: 3, foreArmFlex: 20, foreArmAbduct: -12, handTwist: -75 },
    leftLeg: { thighFlex: 2, shinFlex: 0 },
    rightLeg: { thighFlex: 3, shinFlex: 1 },
    fingerCurl: 14,
  }),
  kneelTend: MOTHER_IN_LAW_POSES.kneelTend,
  // A hand on the boy's shoulder ahead of him, face lifted.
  led: (t) => ({
    spineLean: -2 + wave(t, 1) * 0.4,
    headPitch: -14,
    leftLeg: { thighFlex: 5, shinFlex: 0 },
    rightLeg: { thighFlex: -3, shinFlex: -2 },
    left: { armFlex: 34, armAbduct: -11, foreArmFlex: 37, foreArmAbduct: -11 },
    right: { armFlex: 8, armAbduct: 10, foreArmFlex: 30 },
    fingerCurl: 30,
  }),
};

// --- 4. The centurion's servant: Matthew 8:5-13; Luke 7:1-10 --------------------

const CENTURION_AT = [-7.0, G, 24.45];
const STREET_JESUS = [-4.7, G, 24.4];
export const CENTURION_CAST = [
  { id: 'jesus', model: 'human-jesus', pose: 'marvel', position: STREET_JESUS, target: [CENTURION_AT[0], CENTURION_AT[2]], principal: true },
  {
    id: 'centurion',
    model: 'human-traveler',
    tint: { Cloth: 0x8a3b2e },
    pose: 'unworthy',
    position: CENTURION_AT,
    target: [STREET_JESUS[0], STREET_JESUS[2]],
    principal: true,
    hold: [
      // The vine staff, a centurion's mark of rank.
      { bone: 'LeftHand', at: [0, 0.07, 0], euler: [0.3, 0, 0], build: vineStaff },
      // His sword worn on the left, as centurions wore it.
      { bone: 'Hips', offset: [0.2, -0.1, 0.03], euler: [-0.3, 0, 0.1], build: sword },
    ],
  },
  // The elders the centurion sent (Luke 7:3-5): "he loves our nation, and he
  // is the one who built us our synagogue."
  { id: 'elder-a', model: 'human-artisan', tint: { Cloth: 0xcfc3a8, Hair: 0xa9a49b, Beard: 0xa9a49b }, pose: 'pointAside', position: [-7.55, G, 25.55], target: [STREET_JESUS[0], STREET_JESUS[2]] },
  { id: 'elder-b', model: 'human-villager', tint: { Cloth: 0xbcae90, Hair: 0x9d978d }, pose: 'plead', position: [-7.8, G, 23.35], target: [STREET_JESUS[0], STREET_JESUS[2]], phase: 1.7 },
  // "I have soldiers under me."
  ...[[-8.95, 24.0], [-9.15, 25.05]].map(([x, z], i) => ({
    id: `soldier-${i}`,
    model: ['human-artisan', 'human-traveler'][i],
    tint: { Cloth: 0xb4a283 },
    pose: 'atEase',
    position: [x, G, z],
    target: [STREET_JESUS[0], STREET_JESUS[2]],
    audience: true,
    phase: i * 2.3,
    hold: [{ bone: 'RightHand', at: [0, 0.07, 0], build: spear }],
  })),
  // Those following Jesus, to whom he turned (Matthew 8:10).
  { id: 'peter', ...PETER, pose: 'standListen', motion: 'thinking', position: [-3.55, G, 25.45], target: [CENTURION_AT[0], CENTURION_AT[2]] },
  { id: 'john', ...JOHN, pose: 'crane', position: [-3.3, G, 23.55], target: [CENTURION_AT[0], CENTURION_AT[2]], phase: 0.9 },
  ...[[-2.4, 24.6, 'crane'], [-2.15, 23.1, 'press', 'nod-yes'], [-1.85, 25.8, 'standListen', 'look-around']].map(([x, z, pose, motion], i) => ({
    id: `follower-${i}`, model: villager(i + 1), pose, motion, position: [x, G, z], target: [CENTURION_AT[0], CENTURION_AT[2]], audience: true, phase: i * 1.9,
  })),
  { id: 'follower-woman', model: WOMAN, pose: 'standListen', motion: 'breathing-idle', position: [-2.9, G, 26.35], target: [CENTURION_AT[0], CENTURION_AT[2]], veil: 0x9a7b5e, audience: true },
];

function vineStaff({ THREE, own, material }) {
  const staff = new THREE.Group();
  // A short knotted stick of vine wood, carried rather than leant on.
  const stick = new THREE.Mesh(own(new THREE.CylinderGeometry(0.014, 0.018, 0.9, 6, 4)), material('darkTimber'));
  const position = stick.geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    position.setX(i, position.getX(i) + Math.sin(y * 9) * 0.008);
    position.setZ(i, position.getZ(i) + Math.cos(y * 7) * 0.008);
  }
  stick.geometry.computeVertexNormals();
  stick.position.y = -0.2;
  stick.castShadow = true;
  staff.add(stick);
  return staff;
}

function sword({ THREE, own, material }) {
  const sheath = new THREE.Group();
  const scabbard = new THREE.Mesh(own(new THREE.BoxGeometry(0.055, 0.5, 0.025)), material('leather'));
  scabbard.position.y = -0.25;
  scabbard.castShadow = true;
  sheath.add(scabbard);
  const hilt = new THREE.Mesh(own(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 6)), material('timber'));
  hilt.position.y = 0.07;
  sheath.add(hilt);
  const pommel = new THREE.Mesh(own(new THREE.SphereGeometry(0.022, 8, 6)), material('bronze'));
  pommel.position.y = 0.13;
  sheath.add(pommel);
  return sheath;
}

function spear(kit, context) {
  const { THREE, own, material } = kit;
  const shaft = staffTo(1.05)(kit, context);
  const head = new THREE.Mesh(own(new THREE.ConeGeometry(0.022, 0.2, 6)), material('iron'));
  head.position.y = 1.15;
  head.castShadow = true;
  shaft.add(head);
  return shaft;
}

const CENTURION_POSES = {
  ...COMMON_POSES,
  // "Lord, I am not worthy to have you come under my roof": head bowed, a
  // hand on his chest, the staff held down at his side.
  unworthy: (t) => ({
    spineLean: 10 + wave(t, 1) * 0.5,
    headPitch: 16,
    leftLeg: { thighFlex: 3, shinFlex: 0 },
    rightLeg: { thighFlex: -3, shinFlex: -1 },
    right: { armFlex: 22, armAbduct: -4, foreArmFlex: 118, foreArmAbduct: -52 },
    left: { armFlex: 14, armAbduct: 8, foreArmFlex: 44 },
    fingerCurl: 70,
  }),
  // Listening, and astonished at what he hears: both hands a little open.
  marvel: (t) => ({
    spineLean: 2 + wave(t, 1) * 0.4,
    headPitch: 2,
    leftLeg: { thighFlex: 4, shinFlex: 0 },
    rightLeg: { thighFlex: -4, shinFlex: -2 },
    left: { armFlex: 22, armAbduct: 16, foreArmFlex: 62, handTwist: 40 },
    right: { armFlex: 24 + wave(t, 2), armAbduct: 16, foreArmFlex: 64, handTwist: -40 },
    fingerCurl: 10,
  }),
  // "He built us our synagogue" — the arm out toward it.
  pointAside: (t) => ({
    spineLean: 4,
    spineYaw: 10,
    headPitch: 0,
    right: { armFlex: 34 + wave(t, 2) * 3, armAbduct: 62, foreArmFlex: 40, foreArmAbduct: 62 },
    left: { armFlex: 4, armAbduct: 6, foreArmFlex: 20 },
    fingerCurl: 10,
  }),
  // Both hands out, palms up: asking.
  plead: (t) => ({
    spineLean: 8 + wave(t, 2) * 0.6,
    headPitch: 2,
    left: { armFlex: 34, armAbduct: 12, foreArmFlex: 74, handTwist: 60 },
    right: { armFlex: 34, armAbduct: 12, foreArmFlex: 74, handTwist: -60 },
    fingerCurl: 8,
  }),
  // At ease, the spear grounded at his right side.
  atEase: (t) => ({
    spineLean: -1 + wave(t, 1) * 0.3,
    headPitch: 2,
    leftLeg: { thighFlex: 2, shinFlex: 0 },
    rightLeg: { thighFlex: -2, shinFlex: 0 },
    left: { armFlex: -2, armAbduct: 5, foreArmFlex: 14 },
    right: { armFlex: 16, armAbduct: 8, foreArmFlex: 76 },
    fingerCurl: 78,
  }),
};

// --- 5. The woman who touched his cloak: Mark 5:24-34 ---------------------------

// "When Jesus had crossed again in the boat to the other side, a great crowd
// gathered about him, and he was beside the sea" (5:21) — so on the shore
// street, with Jairus leading him toward his house and the crowd pressing.
const SHORE_JESUS = [16.5, G, 0.35];
const WEST = -Math.PI / 2;
export const WOMAN_CAST = [
  {
    id: 'jesus',
    model: 'human-jesus',
    pose: 'turnBack',
    position: SHORE_JESUS,
    facing: WEST,
    principal: true,
    // The fringes on the corners of his cloak (Numbers 15:38; Matthew 9:20).
    hold: [
      { bone: 'RightLeg', offset: [-0.13, -0.14, -0.14], build: tassel, name: 'tassel-right' },
      { bone: 'LeftLeg', offset: [0.13, -0.14, -0.14], build: tassel, name: 'tassel-left' },
    ],
  },
  { id: 'woman', model: WOMAN, pose: 'reachHem', position: [17.08, G, -0.08], target: [SHORE_JESUS[0], SHORE_JESUS[2] - 0.1], veil: 0x47413d, principal: true },
  // Jairus, a ruler of the synagogue, whose daughter is dying (5:22-23).
  { id: 'jairus', model: 'human-artisan', tint: { Cloth: 0xd2c6ab }, pose: 'urge', position: [14.75, G, 0.1], target: [SHORE_JESUS[0], SHORE_JESUS[2]] },
  // Peter: "You see the crowd pressing around you, and yet you say, Who
  // touched me?" (5:31).
  { id: 'peter', ...PETER, pose: 'standTalk', position: [16.2, G, 1.35], target: [17.6, 0.6] },
  { id: 'john', ...JOHN, pose: 'press', position: [15.3, G, 1.35], target: [SHORE_JESUS[0], SHORE_JESUS[2]], phase: 1 },
  ...[
    [18.1, 0.95, 'press'], [18.55, -0.45, 'crane'], [17.55, 1.95, 'press'], [16.75, 2.25, 'crane'],
    [19.1, 1.5, 'standListen', 'look-around'], [15.45, 2.4, 'press'], [19.4, -1.1, 'press'], [18.0, -1.6, 'crane'],
  ].map(([x, z, pose, motion], i) => ({
    id: `crowd-${i}`, model: villager(i), pose, motion, position: [x, G, z], target: [SHORE_JESUS[0], SHORE_JESUS[2]], audience: true, phase: (i * 1.21) % 6,
  })),
  { id: 'crowd-woman', model: WOMAN, pose: 'crane', position: [18.3, G, 2.7], target: [SHORE_JESUS[0], SHORE_JESUS[2]], veil: 0xc9b99a, audience: true, phase: 3.1 },
];

function tassel({ THREE, own, material }) {
  // Twisted white cords, with the one of blue the law asks for.
  const fringe = new THREE.Group();
  fringe.name = 'tassel';
  const cord = own(new THREE.CylinderGeometry(0.004, 0.003, 0.13, 4));
  const white = material('linen');
  const blue = own(new THREE.MeshStandardMaterial({ color: 0x2f4d86, roughness: 0.9 }));
  for (let i = 0; i < 5; i += 1) {
    const strand = new THREE.Mesh(cord, i === 2 ? blue : white);
    strand.position.set(Math.cos(i * 1.3) * 0.006, -0.065, Math.sin(i * 1.3) * 0.006);
    fringe.add(strand);
  }
  const knot = new THREE.Mesh(own(new THREE.SphereGeometry(0.009, 6, 5)), white);
  fringe.add(knot);
  return fringe;
}

const WOMAN_POSES = {
  ...COMMON_POSES,
  // Stopped, and turning: "Who touched my garments?" (5:30).
  turnBack: (t) => ({
    spineLean: 2 + wave(t, 1) * 0.4,
    spineYaw: -34,
    pelvisYaw: -10,
    headPitch: 6,
    leftLeg: { thighFlex: 14, shinFlex: 2 },
    rightLeg: { thighFlex: -10, shinFlex: -18, ankleBend: 10 },
    left: { armFlex: 6, armAbduct: 6, foreArmFlex: 22 },
    right: { armFlex: -6, armAbduct: 10, foreArmFlex: 16 },
    fingerCurl: 18,
  }),
  // Low behind him, the arm out to the fringe of his cloak.
  reachHem: (t) => ({
    // Down on her knees and sitting back, low in the press of legs.
    hipsHeight: 0.3,
    leftLeg: { thighFlex: 61, shinFlex: -95, ankleBend: -20 },
    rightLeg: { thighFlex: 58, shinFlex: -95, ankleBend: -20 },
    spineLean: 50 + wave(t, 1) * 0.6,
    headPitch: -6,
    right: { armFlex: 41, armAbduct: -20, foreArmFlex: 43, foreArmAbduct: -20 },
    left: { armFlex: 18, armAbduct: 10, foreArmFlex: 60 },
    fingerCurl: 12,
  }),
  // Turned back to him, beckoning him on: his daughter is dying.
  urge: (t) => ({
    spineLean: 6,
    spineYaw: 10,
    headPitch: 0,
    leftLeg: { thighFlex: -8, shinFlex: -10 },
    rightLeg: { thighFlex: 10, shinFlex: 2 },
    right: { armFlex: 58 + wave(t, 6) * 6, armAbduct: 14, foreArmFlex: 96 + wave(t, 6) * 10 },
    left: { armFlex: 6, armAbduct: 8, foreArmFlex: 34 },
    fingerCurl: 18,
  }),
};

// --- 6. The coin in the fish's mouth: Matthew 17:24-27 --------------------------

const WEST_PIER = PIERS.find((pier) => pier.id === 'pier-west');
const PIER_X = (WEST_PIER.x0 + WEST_PIER.x1) / 2;
const PETER_ON_PIER = [PIER_X - 0.3, G, WEST_PIER.zEnd + 1.1];
export const TEMPLE_TAX_CAST = [
  {
    id: 'peter',
    ...PETER,
    pose: 'holdFish',
    position: PETER_ON_PIER,
    facing: Math.PI / 2,
    principal: true,
    hold: [
      { bone: 'RightHand', at: [0, 0.07, 0.02], build: barbel },
      { bone: 'LeftHand', at: [0, 0.075, 0.025], euler: [0, 0, Math.PI / 2], build: shekel },
    ],
  },
  // "The collectors of the two-drachma tax" (17:24), waiting at the root of
  // the pier for the answer.
  { id: 'collector-a', model: 'human-traveler', tint: { Cloth: 0xc2b28f }, pose: 'standTalk', motion: 'talk-ask', position: [PIER_X - 0.6, G, SHORE.rampNorth + 1.4], target: [PIER_X + 0.8, SHORE.rampNorth + 1.9] },
  {
    id: 'collector-b',
    model: 'human-villager',
    tint: { Cloth: 0x9f8f71 },
    pose: 'holdTablet',
    position: [PIER_X + 0.75, G, SHORE.rampNorth + 1.95],
    target: [PIER_X - 0.6, SHORE.rampNorth + 1.4],
    hold: [{ bone: 'LeftHand', at: [0, 0.08, 0.03], euler: [-1.1, 0, 0], build: waxTablet }],
  },
];

// A barbel, not a tilapia: the "St Peter's fish" of the menus feeds on
// plankton and will not take a hook, while the lake's barbels are predators
// that will (Nun). Silver-bronze, long-bodied, the barbels at its mouth. The
// fish lies from the grip in the right hand to the fingers of the left, so
// the hand at its mouth is at its mouth.
function barbel({ THREE, own, material }, { grip, bone }) {
  const fish = new THREE.Group();
  fish.name = 'barbel';
  const mouthAt = bone('LeftHand').add(new THREE.Vector3(0, -0.02, 0));
  const along = mouthAt.clone().sub(grip);
  const reach = Math.max(0.2, along.length() + 0.04);
  const skin = own(new THREE.MeshStandardMaterial({ color: 0x9c8f6a, roughness: 0.45, metalness: 0.35 }));
  const body = new THREE.Mesh(own(new THREE.SphereGeometry(1, 16, 10)), skin);
  body.scale.set(0.045, 0.06, reach * 0.62);
  body.position.z = reach * 0.42;
  body.castShadow = true;
  fish.add(body);
  const tail = new THREE.Mesh(own(new THREE.ConeGeometry(0.06, 0.1, 3)), skin);
  tail.rotation.x = -Math.PI / 2;
  tail.scale.set(0.3, 1, 1);
  tail.position.z = -0.12;
  fish.add(tail);
  const whisker = own(new THREE.CylinderGeometry(0.002, 0.001, 0.05, 3));
  for (const side of [-1, 1]) {
    const barb = new THREE.Mesh(whisker, material('clay'));
    barb.position.set(side * 0.015, -0.02, reach);
    barb.rotation.set(1.2, 0, side * 0.4);
    fish.add(barb);
  }
  fish.position.copy(grip);
  fish.lookAt(mouthAt);
  fish.userData.aimed = true;
  fish.userData.mouth = new THREE.Vector3(0, 0, reach);
  return fish;
}

// A Tyrian shekel — four drachmas, the temple tax for two: "give it to them
// for me and for yourself" (17:27).
function shekel({ THREE, own, material }) {
  const coin = new THREE.Mesh(own(new THREE.CylinderGeometry(0.014, 0.014, 0.003, 14)), material('silver'));
  coin.name = 'shekel';
  return coin;
}

function waxTablet({ THREE, own, material }) {
  const tablet = new THREE.Group();
  const board = new THREE.Mesh(own(new THREE.BoxGeometry(0.2, 0.26, 0.016)), material('darkTimber'));
  tablet.add(board);
  const wax = new THREE.Mesh(own(new THREE.BoxGeometry(0.16, 0.22, 0.004)), material('parchment'));
  wax.position.z = 0.009;
  tablet.add(wax);
  return tablet;
}

const TEMPLE_TAX_POSES = {
  ...COMMON_POSES,
  // The fish held up in the right hand, the left at its mouth, finding it.
  holdFish: (t) => ({
    spineLean: 12 + wave(t, 1) * 0.5,
    headPitch: 16,
    leftLeg: { thighFlex: 5, shinFlex: 0 },
    rightLeg: { thighFlex: -4, shinFlex: -2 },
    right: { armFlex: 50, armAbduct: 14, foreArmFlex: 92 },
    left: { armFlex: 46, armAbduct: -4, foreArmFlex: 100, foreArmAbduct: -20 },
    fingerCurl: 46,
  }),
  holdTablet: (t) => ({
    spineLean: 4 + wave(t, 1) * 0.3,
    headPitch: 8,
    left: { armFlex: 30, armAbduct: 4, foreArmFlex: 92 },
    right: { armFlex: 8, armAbduct: 6, foreArmFlex: 40 },
    fingerCurl: 48,
  }),
};

function templeTaxProps({ THREE, addMesh, group }) {
  // The line, run out from a coil on the deck to the fish's mouth.
  const coil = addMesh(new THREE.TorusGeometry(0.11, 0.018, 6, 18), 'cord', [PETER_ON_PIER[0] + 0.55, G + 0.02, PETER_ON_PIER[2] - 0.35]);
  coil.rotation.x = Math.PI / 2;
  const basket = addMesh(new THREE.CylinderGeometry(0.22, 0.17, 0.3, 14, 1, true), 'reed', [PETER_ON_PIER[0] - 0.75, G + 0.15, PETER_ON_PIER[2] + 0.45]);
  basket.material.side = THREE.DoubleSide;
  const line = addMesh(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 3), 'cord');
  const up = new THREE.Vector3(0, 1, 0);
  const from = new THREE.Vector3();
  const to = new THREE.Vector3(coil.position.x, coil.position.y, coil.position.z);
  const along = new THREE.Vector3();
  return {
    update: (time, dt, actors) => {
      const fish = actors.get('peter')?.held[0];
      if (!fish) return;
      fish.localToWorld(from.copy(fish.userData.mouth));
      group.worldToLocal(from);
      along.subVectors(to, from);
      line.position.copy(from).add(to).multiplyScalar(0.5);
      line.scale.set(1, along.length(), 1);
      line.quaternion.setFromUnitVectors(up, along.normalize());
    },
    clearance: [{ x: basket.position.x, z: basket.position.z, radius: 0.25 }],
  };
}

// --- 7. The child in the midst: Mark 9:33-37; Matthew 18:1-5 --------------------

const TEACHER_AT = [DOOR_X - 0.15, G - 0.02, ROOM.z0 + 0.75];
const CHILD_AT = [TEACHER_AT[0] - 0.5, G, TEACHER_AT[2] + 0.42];
const faceTeacher = [TEACHER_AT[0], TEACHER_AT[2] + 0.4];
export const CHILD_CAST = [
  { id: 'jesus', model: 'human-jesus', pose: 'embrace', position: TEACHER_AT, facing: 0, principal: true, seat: 'stool' },
  { id: 'child', model: 'human-villager', pose: 'childStand', position: CHILD_AT, facing: 0.15, scale: 0.64, principal: true },
  // The twelve round the room: on the benches along its walls, on the floor,
  // and two kneeling close.
  { id: 'peter', ...PETER, pose: 'kneelListen', position: [TEACHER_AT[0] - 1.35, G, TEACHER_AT[2] + 1.25], target: faceTeacher, mat: true },
  { id: 'john', ...JOHN, pose: 'kneelListen', position: [TEACHER_AT[0] + 1.25, G, TEACHER_AT[2] + 1.2], target: faceTeacher, mat: true, phase: 1.3 },
  { id: 'andrew', ...ANDREW, pose: 'listen', position: onWestBench(11.2), facing: Math.PI / 2, phase: 0.5 },
  { id: 'james', ...JAMES, pose: 'leanIn', position: onEastBench(11.2), facing: -Math.PI / 2, phase: 2.2 },
  ...[
    [onWestBench(12.4), Math.PI / 2, 'leanIn'], [onWestBench(13.6), Math.PI / 2, 'listen'],
    [onEastBench(12.4), -Math.PI / 2, 'listen'], [onEastBench(13.6), -Math.PI / 2, 'skeptic'],
    [[ROOM.x0 + 1.35, G, 14.2], null, 'floorListen'], [[DOOR_X + 1.35, G, 14.1], null, 'floorListen'],
    [[ROOM.x0 + 1.75, G, 12.45], null, 'floorLean'], [[ROOM.x1 - 1.55, G, 12.5], null, 'floorListen'],
  ].map(([position, facing, pose], i) => ({
    id: `disciple-${i}`,
    model: villager(i + 2),
    pose,
    position,
    ...(facing === null ? { target: faceTeacher } : { facing }),
    phase: (i * 1.61) % 6,
  })),
];

const CHILD_POSES = {
  ...COMMON_POSES,
  // Seated, the right arm round the child standing at his side (9:36).
  embrace: (t) => ({
    seated: true,
    ...SEATED_LEGS,
    spineLean: 6 + wave(t, 1) * 0.4,
    spineYaw: 8,
    headPitch: 4,
    right: { armFlex: 64, armAbduct: 31, foreArmFlex: 72, foreArmAbduct: 31 },
    left: { armFlex: 30, armAbduct: 12, foreArmFlex: 70, handTwist: 40 },
    fingerCurl: 30,
  }),
  childStand: (t) => ({
    spineLean: -2 + wave(t, 1) * 0.4,
    headPitch: 6,
    left: { armFlex: 6, armAbduct: 3, foreArmFlex: 50, foreArmAbduct: -30 },
    right: { armFlex: 6, armAbduct: 3, foreArmFlex: 52, foreArmAbduct: -32 },
    fingerCurl: 35,
  }),
};

function childProps({ THREE, addMesh, flicker, group, own, material }) {
  // A plain stool for the teacher, and a lamp on its stand beside him.
  const seatTop = TEACHER_AT[1] + SEAT_DROP;
  addMesh(new THREE.CylinderGeometry(0.2, 0.22, seatTop - G, 12), 'timber', [TEACHER_AT[0], (G + seatTop) / 2, TEACHER_AT[2] - 0.07]);
  const lampAt = [TEACHER_AT[0] + 1.0, G, TEACHER_AT[2] - 0.2];
  addMesh(new THREE.CylinderGeometry(0.03, 0.045, 1.05, 8), 'timber', [lampAt[0], G + 0.525, lampAt[2]]);
  addMesh(new THREE.CylinderGeometry(0.12, 0.09, 0.03, 12), 'timber', [lampAt[0], G + 1.06, lampAt[2]]);
  const lamp = clayLamp({ THREE, own, material, flicker });
  lamp.position.set(lampAt[0], G + 1.075, lampAt[2]);
  group.add(lamp);
  return {
    clearance: [
      { x: TEACHER_AT[0], z: TEACHER_AT[2] - 0.07, radius: 0.35 },
      { x: lampAt[0], z: lampAt[2], radius: 0.18 },
    ],
  };
}

// --- the stages ---------------------------------------------------------------

// The ground each moment occupies, [x0, x1, z0, z1]: kept clear of the
// village's own people, who are placed once and cannot know which moment is
// staged.
export const EVENT_AREAS = {
  fishermen: [-16.5, -5.2, -19.4, -13.3],
  sundown: [11.9, 21.2, 15.4, 25.9],
  centurion: [-10.2, -1.2, 22.4, 27.0],
  'the-woman': [13.6, 20.4, -2.3, 3.4],
  'temple-tax': [WEST_PIER.x0 - 0.5, WEST_PIER.x1 + 0.5, WEST_PIER.zEnd - 0.5, WEST_PIER.zEnd + 4.5],
  'temple-tax-collectors': [PIER_X - 1.5, PIER_X + 1.6, SHORE.rampNorth + 0.6, SHORE.rampNorth + 2.8],
};
export function inEventArea(x, z) {
  return Object.values(EVENT_AREAS).some((rect) => inRect(x, z, rect));
}

const stage = (options) => ({
  ...options,
  create: (THREE, {
    root, onReady, active, motionLibrary,
  } = {}) => createTableau(THREE, {
    root, onReady, active, motionLibrary, ...options,
  }),
});

export const EVENT_STAGES = {
  fishermen: stage({
    name: 'fishermen-tableau', cast: FISHERMEN_CAST, poses: FISHERMEN_POSES, floor: B,
    focus: [-11.5, B + 1, -17.2], props: fishermenProps,
  }),
  'mother-in-law': stage({
    name: 'mother-in-law-tableau', cast: MOTHER_IN_LAW_CAST, poses: MOTHER_IN_LAW_POSES, floor: G,
    focus: [14, G + 1, 12], drawDistance: 30, props: motherInLawProps,
  }),
  sundown: stage({
    name: 'sundown-tableau', cast: SUNDOWN_CAST, poses: SUNDOWN_POSES, floor: G,
    focus: [15.8, G + 1, 19.5],
  }),
  centurion: stage({
    name: 'centurion-tableau', cast: CENTURION_CAST, poses: CENTURION_POSES, floor: G,
    focus: [-5.8, G + 1, 24.4],
  }),
  'the-woman': stage({
    name: 'woman-tableau', cast: WOMAN_CAST, poses: WOMAN_POSES, floor: G,
    focus: [16.8, G + 1, 0.4],
  }),
  'temple-tax': stage({
    name: 'temple-tax-tableau', cast: TEMPLE_TAX_CAST, poses: TEMPLE_TAX_POSES, floor: G,
    focus: [PETER_ON_PIER[0], G + 1, PETER_ON_PIER[2] + 4], drawDistance: 80, props: templeTaxProps,
  }),
  'the-child': stage({
    name: 'child-tableau', cast: CHILD_CAST, poses: CHILD_POSES, floor: G,
    focus: [15.4, G + 1, 12], drawDistance: 30, props: childProps,
  }),
};

// The two synagogue moments, built on the same engine, for the builder.
export const SYNAGOGUE_STAGES = {
  'synagogue-rebuke': createSynagogueTableau,
  'bread-of-life': createBreadOfLifeTableau,
};
