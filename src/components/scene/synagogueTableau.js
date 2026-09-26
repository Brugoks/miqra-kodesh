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
// three.js is passed in, so the module stays importable in jsdom.

import {
  SYNAGOGUE, SYNAGOGUE_HALL, SYNAGOGUE_BENCHES, SYNAGOGUE_BENCH_BAND, READING_TABLE,
} from './capernaumDimensions.js';
import { cloneSkinnedMesh } from './sceneResources.js';
import { buildPoseClip } from './sceneHumanClips.js';
import { prepareHumanMaterials } from './sceneHumanMaterials.js';
import { measureSkull, shapeHeadwear } from './sceneInstancedHumans.js';

const F = SYNAGOGUE_HALL.floor;
const { tier } = SYNAGOGUE_BENCHES;
// A seated actor's root sits this far below the seat it is sitting on (the
// shared sit pose drives the hips to 0.58 above the root; see the stools in
// matthew9Tableau.js).
const SEAT_DROP = 0.46;
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
// Far enough in that the door's reveal hides the rest of the village from
// here, so its other two moments need not be drawn (buildCapernaum.js).
export function walledInSynagogue(x, y, z) {
  return insideSynagogueHall(x, y, z) && z > HALL.z0 + 3;
}

const SEATED_LEGS = { leftLeg: { thighFlex: 88, shinFlex: 2 }, rightLeg: { thighFlex: 86, shinFlex: -3 } };
const KNEEL_LEGS = { leftLeg: { thighFlex: -12, shinFlex: -95, ankleBend: -20 }, rightLeg: { thighFlex: -12, shinFlex: -95, ankleBend: -20 } };

// Every pose is baked as a loop of this length, and every motion in it is a
// whole number of cycles of it, so no one visibly jumps when the loop wraps.
export const POSE_SECONDS = 12;
const wave = (t, cycles, offset = 0) => Math.sin((t * Math.PI * 2 * cycles) / POSE_SECONDS + offset);

// Each pose is a function of time, as the other tableaux' are: nobody in a
// held moment is a statue, but nobody here is going anywhere either.
export const POSES = {
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
  // Arms folded, weight back: a man in charge of this room, watching it.
  stern: (t) => ({
    spineLean: -3 + wave(t, 1) * 0.4,
    headPitch: 6,
    left: { armFlex: 24, armAbduct: -2, foreArmFlex: 100, foreArmAbduct: -46 },
    right: { armFlex: 26, armAbduct: -2, foreArmFlex: 96, foreArmAbduct: -44 },
    fingerCurl: 55,
  }),
  // Seated with folded arms and the chin down: unconvinced.
  skeptic: (t) => ({
    seated: true,
    ...SEATED_LEGS,
    spineLean: -6 + wave(t, 1) * 0.5,
    headPitch: 10,
    left: { armFlex: 22, armAbduct: -1, foreArmFlex: 98, foreArmAbduct: -44 },
    right: { armFlex: 24, armAbduct: -1, foreArmFlex: 94, foreArmAbduct: -42 },
    fingerCurl: 55,
  }),
  // Pulled back from it, hands up by the chest.
  startled: (t) => {
    const flinch = Math.max(0, wave(t, 4)) * 1.5;
    return {
      seated: true,
      ...SEATED_LEGS,
      spineLean: -11 - flinch,
      headPitch: -3,
      left: { armFlex: 34 + flinch, armAbduct: 16, foreArmFlex: 118 },
      right: { armFlex: 30 + flinch, armAbduct: 18, foreArmFlex: 112 },
      fingerCurl: 12,
    };
  },
  // Forearms on the knees, straining to hear the teacher.
  leanIn: (t) => ({
    seated: true,
    ...SEATED_LEGS,
    spineLean: 22 + wave(t, 1) * 0.8,
    headPitch: -10,
    left: { armFlex: 46, armAbduct: 8, foreArmFlex: 62 },
    right: { armFlex: 44, armAbduct: 8, foreArmFlex: 60 },
    fingerCurl: 40,
  }),
  listen: (t) => ({
    seated: true,
    ...SEATED_LEGS,
    spineLean: 5 + wave(t, 1) * 0.6,
    headPitch: 2,
    left: { armFlex: 16, armAbduct: 6, foreArmFlex: 70 },
    right: { armFlex: 14, armAbduct: 6, foreArmFlex: 68 },
    fingerCurl: 30,
  }),
  // On his feet and backing off, hands up.
  recoil: (t) => {
    const flinch = Math.max(0, wave(t, 4, 0.4)) * 2;
    return {
      spineLean: -13 - flinch,
      headPitch: -2,
      leftLeg: { thighFlex: 12, shinFlex: -4 },
      rightLeg: { thighFlex: -14, shinFlex: -8 },
      left: { armFlex: 42 + flinch, armAbduct: 22, foreArmFlex: 116 },
      right: { armFlex: 38 + flinch, armAbduct: 24, foreArmFlex: 110 },
      fingerCurl: 8,
    };
  },
  kneelListen: (t) => ({
    kneeling: true,
    ...KNEEL_LEGS,
    spineLean: 7 + wave(t, 1) * 0.5,
    headPitch: -6,
    left: { armFlex: 10, armAbduct: 4, foreArmFlex: 50 },
    right: { armFlex: 10, armAbduct: 4, foreArmFlex: 48 },
    fingerCurl: 25,
  }),
  kneelStartled: (t) => {
    const flinch = Math.max(0, wave(t, 5, 1)) * 1.5;
    return {
      kneeling: true,
      ...KNEEL_LEGS,
      spineLean: -6 - flinch,
      headPitch: -4,
      left: { armFlex: 30 + flinch, armAbduct: 18, foreArmFlex: 110 },
      right: { armFlex: 26 + flinch, armAbduct: 18, foreArmFlex: 104 },
      fingerCurl: 10,
    };
  },
};

const REQUIRED_BONES = ['Hips', 'LeftArm', 'LeftUpLeg', 'LeftHand', 'RightHand', 'Head'];

// A woman's veil, as a skinned part of this actor: the same shape the
// instanced crowd's women wear (shapeHeadwear), fitted over this body's own
// skull in its rest pose and bound to its own skeleton, so it turns with the
// head and falls with the shoulders through whatever the pose does.
function skinnedVeil(THREE, actorRoot, material) {
  actorRoot.updateMatrixWorld(true);
  let host = null;
  actorRoot.traverse((node) => { if (!host && node.isSkinnedMesh && node.name.endsWith('_LOD1')) host = node; });
  if (!host) actorRoot.traverse((node) => { if (!host && node.isSkinnedMesh) host = node; });
  if (!host) return null;
  const { bones, boneInverses } = host.skeleton;
  const head = bones.findIndex((bone) => bone.name === 'mixamorigHead');
  if (head < 0) return null;
  const spineAt = bones.findIndex((bone) => bone.name === 'mixamorigSpine2');
  const spine = spineAt >= 0 ? spineAt : head;

  const { shell, spineWeight } = shapeHeadwear(THREE, measureSkull(THREE, actorRoot), 'veil');
  // The rest-pose skinning transform of a bone for this host: a point p in
  // the geometry lands at S·p. The veil's points are known where they should
  // land, so each is carried back through the inverse of its bone's S.
  const skinning = (bone) => new THREE.Matrix4()
    .copy(host.matrixWorld).multiply(host.bindMatrixInverse)
    .multiply(bones[bone].matrixWorld).multiply(boneInverses[bone])
    .multiply(host.bindMatrix)
    .invert();
  const headInverse = skinning(head);
  const spineInverse = skinning(spine);
  const position = shell.attributes.position;
  const skinIndex = new Float32Array(position.count * 4);
  const skinWeight = new Float32Array(position.count * 4);
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    const toSpine = spineWeight[i];
    skinIndex.set([head, spine, 0, 0], i * 4);
    skinWeight.set([1 - toSpine, toSpine, 0, 0], i * 4);
    point.fromBufferAttribute(position, i).applyMatrix4(toSpine > 0.5 ? spineInverse : headInverse);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  shell.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  shell.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  shell.computeVertexNormals();

  const veil = new THREE.SkinnedMesh(shell, material);
  veil.name = 'veil';
  // A sibling of the body it is fitted to, so it shares that body's
  // transform and bind.
  veil.position.copy(host.position);
  veil.quaternion.copy(host.quaternion);
  veil.scale.copy(host.scale);
  veil.bindMode = host.bindMode;
  host.parent.add(veil);
  veil.bind(host.skeleton, host.bindMatrix);
  veil.frustumCulled = false;
  return veil;
}

export function createSynagogueTableau(THREE, { root, onReady } = {}) {
  const group = new THREE.Group();
  group.name = 'synagogue-tableau';
  group.visible = false;
  root.add(group);

  const resources = new Set();
  const own = (resource) => { resources.add(resource); return resource; };
  const basalt = own(new THREE.MeshStandardMaterial({ color: 0x3f3e42, roughness: 0.85 }));
  const timber = own(new THREE.MeshStandardMaterial({ color: 0x6d4c2c, roughness: 0.9 }));
  const parchment = own(new THREE.MeshStandardMaterial({ color: 0xd8c7a0, roughness: 0.92, side: THREE.DoubleSide }));
  const reed = own(new THREE.MeshStandardMaterial({ color: 0xa99160, roughness: 1 }));
  const clay = own(new THREE.MeshStandardMaterial({ color: 0x9a6a44, roughness: 0.85 }));
  const flameMaterial = own(new THREE.MeshBasicMaterial({ color: 0xffb257, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const addMesh = (geometry, material, position, parent = group) => {
    const mesh = new THREE.Mesh(own(geometry), material);
    mesh.position.fromArray(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // --- the furniture --------------------------------------------------------
  // The teacher's seat: a plain block of basalt, not the carved "seat of
  // Moses" found at Chorazin, which is centuries later.
  addMesh(new THREE.BoxGeometry(0.56, TEACHER_SEAT.top - F, 0.46), basalt,
    [TEACHER_SEAT.x, (F + TEACHER_SEAT.top) / 2, TEACHER_SEAT.z + 0.05]).name = 'teacher-seat';

  // The scroll, open on the reading table: rolled at both ends on its wooden
  // rollers, the column being read showing between.
  const scroll = new THREE.Group();
  scroll.name = 'torah-scroll';
  scroll.position.set(READING_TABLE.x, F + READING_TABLE.h, READING_TABLE.z);
  group.add(scroll);
  const rollGeometry = own(new THREE.CylinderGeometry(0.052, 0.052, 0.3, 14));
  const rollerGeometry = own(new THREE.CylinderGeometry(0.011, 0.011, 0.42, 6));
  for (const side of [-1, 1]) {
    const roll = new THREE.Mesh(rollGeometry, parchment);
    roll.rotation.x = Math.PI / 2;
    roll.position.set(side * 0.16, 0.052, 0);
    roll.castShadow = true;
    scroll.add(roll);
    const roller = new THREE.Mesh(rollerGeometry, timber);
    roller.rotation.x = Math.PI / 2;
    roller.position.set(side * 0.16, 0.052, 0);
    scroll.add(roller);
  }
  addMesh(new THREE.PlaneGeometry(0.28, 0.29), parchment, [0, 0.004, 0], scroll).rotation.x = -Math.PI / 2;

  // Reed mats under those sitting on the floor.
  for (const entry of SYNAGOGUE_CAST.filter((actor) => actor.mat)) {
    const mat = addMesh(new THREE.BoxGeometry(0.9, 0.02, 1.1), reed, [entry.position[0], F + 0.01, entry.position[2]]);
    mat.rotation.y = Math.atan2(entry.target[0] - entry.position[0], entry.target[1] - entry.position[2]);
  }

  // A clay lamp on a wooden stand beside the teacher, burning though it is
  // day, as synagogue lamps did.
  const lampAt = [TEACHER_SEAT.x + 1.1, F, TEACHER_SEAT.z + 0.2];
  addMesh(new THREE.CylinderGeometry(0.035, 0.05, 1.15, 8), timber, [lampAt[0], F + 0.575, lampAt[2]]);
  addMesh(new THREE.CylinderGeometry(0.14, 0.1, 0.03, 12), timber, [lampAt[0], F + 1.16, lampAt[2]]);
  const lamp = addMesh(new THREE.SphereGeometry(0.07, 12, 8), clay, [lampAt[0], F + 1.21, lampAt[2]]);
  lamp.scale.set(1.3, 0.55, 1);
  const flame = new THREE.Mesh(own(new THREE.ConeGeometry(0.018, 0.07, 8)), flameMaterial);
  flame.position.set(lampAt[0] + 0.08, F + 1.27, lampAt[2]);
  flame.name = 'lamp-flame';
  group.add(flame);

  // --- the cast ---------------------------------------------------------------
  const models = new Map();
  const actors = new Map();
  const clipsByModel = new Map();
  let ready = false;
  let disposed = false;
  let time = 0;
  const cameraPosition = new THREE.Vector3();
  const focus = new THREE.Vector3(READING_TABLE.x, F + 1, READING_TABLE.z);

  function acceptAssets(assetGroup) {
    if (disposed || ready) return;
    for (const [id, model] of Object.entries(assetGroup?.models || {})) {
      let skinned = false;
      model.scene?.traverse((node) => { if (node.isSkinnedMesh) skinned = true; });
      if (skinned && REQUIRED_BONES.every((bone) => model.scene.getObjectByName(`mixamorig${bone}`))) models.set(id, model);
    }
    if (!SYNAGOGUE_CAST.every((entry) => models.has(entry.model))) return;

    for (const entry of SYNAGOGUE_CAST) {
      const model = models.get(entry.model);
      prepareHumanMaterials(model.scene);
      const key = `${entry.model}:${entry.pose}`;
      if (!clipsByModel.has(key)) {
        clipsByModel.set(key, buildPoseClip(THREE, model.scene, entry.pose, POSE_SECONDS, POSES[entry.pose]));
      }
      const actorRoot = cloneSkinnedMesh(model.scene);
      actorRoot.name = `synagogue-${entry.id}`;
      if (entry.veil !== undefined) {
        // Fitted at rest, before the actor is placed or posed.
        const veilMaterial = own(new THREE.MeshStandardMaterial({ color: entry.veil, roughness: 0.94, side: THREE.DoubleSide }));
        const veil = skinnedVeil(THREE, actorRoot, veilMaterial);
        if (veil) own(veil.geometry);
      }
      actorRoot.scale.setScalar(entry.scale || 1);
      actorRoot.position.fromArray(entry.position);
      actorRoot.rotation.y = Math.atan2(entry.target[0] - entry.position[0], entry.target[1] - entry.position[2]);
      group.add(actorRoot);

      const meshes = [[], []];
      actorRoot.traverse((node) => {
        if (!node.isMesh) return;
        node.frustumCulled = false;
        node.castShadow = true;
        node.receiveShadow = true;
        if (node.name === 'veil') return;
        meshes[node.name.includes('_LOD1') ? 1 : 0].push(node);
      });
      const mixer = new THREE.AnimationMixer(actorRoot);
      const clip = clipsByModel.get(key);
      if (clip) {
        const action = mixer.clipAction(clip).play();
        action.time = (entry.phase || 0) % clip.duration;
        mixer.update(0);
      }
      actors.set(entry.id, { entry, root: actorRoot, mixer, meshes });
    }
    ready = true;
    group.visible = true;
    update({ delta: 0, reducedMotion: true });
    onReady?.();
  }

  function update({ delta = 0.016, camera = null, quality = 'balanced', reducedMotion = false } = {}) {
    if (!ready || disposed) return;
    const dt = reducedMotion ? 0 : Math.min(0.1, Math.max(0, delta));
    time += dt;
    const profile = quality?.name || quality;
    if (camera) camera.getWorldPosition(cameraPosition);
    const distance = camera ? cameraPosition.distanceTo(focus) : 0;
    group.visible = !camera || (distance < 42
      && seesIntoSynagogue(cameraPosition.x, cameraPosition.y, cameraPosition.z));
    if (!group.visible) return;
    for (const actor of actors.values()) {
      actor.root.visible = !actor.entry.audience || profile !== 'low';
      const lod = profile !== 'low' && actor.entry.principal && distance < 14 ? 0 : 1;
      const selected = actor.meshes[lod].length ? lod : 0;
      actor.meshes.forEach((meshes, i) => meshes.forEach((mesh) => { mesh.visible = i === selected; }));
      actor.mixer.update(dt);
    }
    flame.scale.set(1, 0.85 + Math.sin(time * 9.1) * 0.1 + Math.sin(time * 4.3) * 0.06, 1);
  }

  // The people standing or kneeling on the floor, and the teacher's seat,
  // are obstacles; those on the benches are already behind the benches.
  function queryClearance(x, z, radius = 0.35, y = 0) {
    if (!ready || disposed) return { collides: false, pushX: 0, pushZ: 0 };
    if (Math.abs(y - F) > 1.2) return { collides: false, pushX: 0, pushZ: 0 };
    const candidates = SYNAGOGUE_CAST
      .filter((entry) => entry.position[1] >= F - 0.05 || entry.seat)
      .filter((entry) => Math.abs(entry.position[0] - x) < 3 && Math.abs(entry.position[2] - z) < 3)
      .map((entry) => ({ x: entry.position[0], z: entry.position[2], radius: entry.seat ? 0.45 : entry.mat ? 0.42 : 0.32 }));
    candidates.push({ x: lampAt[0], z: lampAt[2], radius: 0.18 });
    for (const other of candidates) {
      const dx = x - other.x;
      const dz = z - other.z;
      const distance = Math.hypot(dx, dz);
      const gap = radius + other.radius;
      if (distance < gap) {
        return {
          collides: true,
          pushX: distance > 0.001 ? (dx / distance) * (gap - distance) : gap,
          pushZ: distance > 0.001 ? (dz / distance) * (gap - distance) : 0,
        };
      }
    }
    return { collides: false, pushX: 0, pushZ: 0 };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const skeletons = new Set();
    for (const actor of actors.values()) {
      actor.mixer.stopAllAction();
      actor.mixer.uncacheRoot(actor.root);
      actor.root.traverse((node) => { if (node.skeleton) skeletons.add(node.skeleton); });
    }
    skeletons.forEach((skeleton) => skeleton.dispose());
    root.remove(group);
    resources.forEach((resource) => resource.dispose());
    actors.clear();
    models.clear();
    clipsByModel.clear();
  }

  return {
    group,
    acceptAssets,
    update,
    queryClearance,
    dispose,
    getActors: () => actors,
    isReady: () => ready && !disposed,
  };
}
