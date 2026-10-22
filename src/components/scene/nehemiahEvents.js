// What happened at the wall: twelve staged moments from the book of Nehemiah,
// in the order it tells them, on the same engine the other scenes' events use
// (sceneTableau.js, sceneEpisodes.js).
//
// Only one is staged at a time, and each sets the wall's state with it — the
// text is the reason (nehemiahDimensions.js EVENT_WALL_STATE): the night ride is
// among ruins, the builders are at half a wall, and the reading at the Water
// Gate, the Feast and the dedication are at the finished one. The cast is fixed
// and placed against the real ground, one tableau per moment, built the first
// time it is staged; the few things they carry — a lamp, a trumpet, a spear,
// the scroll — are built here.
//
// Recurring people are dressed alike wherever they appear: Nehemiah is always
// in the same blue-grey governor's robe, Ezra always the priest.

import { createTableau, wave } from './sceneTableau';
import { COMMON_POSES } from './tableauPoses';
import { EVENT_GROUND, groundAt } from './nehemiahDimensions';
import { FEATURE_BY_ID, PROFILE_BY_ID, frameAt, wallTopAt } from './nehemiahWalls';
import { PLATFORM } from './nehemiahCity';

const MAN = 'human-tabernacle-camp-man';
const WOMAN = 'human-tabernacle-camp-woman';
const PRIEST = 'human-tabernacle-priest';
const LEVITE = 'human-tabernacle-levite';
const HIGH_PRIEST = 'human-tabernacle-high-priest';
const TRAVELER = 'human-traveler';
const ARTISAN = 'human-artisan';

// Where someone stands: on the walkway if they are on the wall, else the ground.
const stand = (x, z) => wallTopAt(x, z)?.height ?? groundAt(x, z);

const person = (id, model, x, z, target, extra = {}) => ({
  id,
  model,
  position: [x, extra.y ?? stand(x, z), z],
  target,
  pose: 'standListen',
  principal: true,
  motionLife: true,
  ...extra,
});

// The recurring principals.
const GOVERNOR_BLUE = 0x4a5878;
const nehemiah = (x, z, target, extra = {}) => person('nehemiah', TRAVELER, x, z, target, { tint: { Cloth: GOVERNOR_BLUE }, ...extra });
const ezra = (x, z, target, extra = {}) => person('ezra', PRIEST, x, z, target, extra);
const SANBALLAT = 0x6a3f3a;
const TOBIAH = 0x5a4a3a;

// The people of Jerusalem: undyed wool and a few dyes, a veil for the women.
const WOOL = [0xa9957b, 0xe1d0a9, 0x9b8270, 0xb4a98c];
const VEILS = [0x6f5a4a, 0x8a6a5a, 0x5c6a72, 0x7a5a64];
const people = (prefix, list, target) => list.map(([x, z, extra = {}], i) => (extra.woman
  ? person(`${prefix}-${i}`, WOMAN, x, z, extra.target || target, { veil: VEILS[i % VEILS.length], principal: false, ...extra })
  : person(`${prefix}-${i}`, MAN, x, z, extra.target || target, {
    tint: { 'Tabernacle undyed woven cloth': WOOL[i % WOOL.length] }, principal: false, ...extra,
  })));

// --- what they carry ------------------------------------------------------------------
const FIRELIGHT = { colour: 0xff9a48, intensity: 2.8, distance: 10 };
function lamp(kit) {
  const { THREE, own, material, flicker } = kit;
  const group = new THREE.Group();
  group.name = 'lamp';
  const body = new THREE.Mesh(own(new THREE.CylinderGeometry(0.05, 0.07, 0.06, 10)), material('clay'));
  group.add(body);
  const flame = flicker(new THREE.Mesh(own(new THREE.ConeGeometry(0.025, 0.1, 6)), material('flame')));
  flame.position.y = 0.09;
  group.add(flame);
  const anchor = new THREE.Object3D();
  anchor.name = 'light-anchor';
  anchor.userData.light = FIRELIGHT;
  anchor.position.y = 0.12;
  group.add(anchor);
  group.userData.aimed = true;
  return group;
}

// A trumpet: the straight silver one Moses was told to make, and the priests
// of Nehemiah's day blew (Numbers 10:2; Nehemiah 12:35, 41).
function trumpet({ THREE, own, material }) {
  const group = new THREE.Group();
  group.name = 'trumpet';
  const tube = new THREE.Mesh(own(new THREE.CylinderGeometry(0.018, 0.075, 0.9, 10)), material('silver'));
  tube.rotation.x = Math.PI / 2;
  tube.position.z = 0.36;
  group.add(tube);
  group.userData.aimed = true;
  return group;
}

// The cymbals of the Levites (12:27).
function cymbals({ THREE, own, material }) {
  const group = new THREE.Group();
  group.name = 'cymbals';
  for (const side of [-1, 1]) {
    const disc = new THREE.Mesh(own(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 14)), material('bronze'));
    disc.rotation.z = Math.PI / 2;
    disc.position.set(side * 0.04, 0.02, 0.06);
    group.add(disc);
  }
  group.userData.aimed = true;
  return group;
}

const SPEAR_TOP = 0.62;
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

// A short sword, strapped at the side while the hands work (4:18).
function sword({ THREE, own, material }) {
  const group = new THREE.Group();
  group.name = 'sword';
  const blade = new THREE.Mesh(own(new THREE.BoxGeometry(0.045, 0.55, 0.012)), material('iron'));
  blade.position.y = 0.34;
  group.add(blade);
  const guard = new THREE.Mesh(own(new THREE.BoxGeometry(0.12, 0.02, 0.03)), material('bronze'));
  guard.position.y = 0.06;
  group.add(guard);
  return group;
}

// The Book of the Law, a scroll open between the hands (8:3, 5).
function scroll({ THREE, own, material }) {
  const group = new THREE.Group();
  group.name = 'scroll';
  const sheet = new THREE.Mesh(own(new THREE.BoxGeometry(0.46, 0.3, 0.008)), material('parchment'));
  group.add(sheet);
  for (const side of [-1, 1]) {
    const roll = new THREE.Mesh(own(new THREE.CylinderGeometry(0.026, 0.026, 0.34, 8)), material('timber'));
    roll.position.x = side * 0.24;
    group.add(roll);
  }
  group.userData.aimed = true;
  return group;
}

// A mason's trowel: the tool of the other hand (4:17).
function trowel({ THREE, own, material }) {
  const group = new THREE.Group();
  group.name = 'trowel';
  const blade = new THREE.Mesh(own(new THREE.BoxGeometry(0.1, 0.01, 0.2)), material('iron'));
  blade.position.z = 0.12;
  group.add(blade);
  const grip = new THREE.Mesh(own(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 6)), material('timber'));
  grip.rotation.x = Math.PI / 2;
  group.add(grip);
  return group;
}

// --- the staging -------------------------------------------------------------------
// Where the dedication's two choirs stand: on the wall itself, along the
// walkway between the Tower of the Furnaces and the Valley Gate, "up on the
// wall" (12:31, 37).
// Staggered across the walkway, a little to either side of its middle, so that in
// a procession two abreast nobody is hidden by the one in front.
const wallSpot = (offset, lateral = 0) => {
  const profile = PROFILE_BY_ID.city;
  const base = FEATURE_BY_ID['tower-of-furnaces'].s;
  const frame = frameAt(profile, base + offset);
  return {
    x: frame.x + frame.nx * lateral, z: frame.z + frame.nz * lateral, y: frame.top, tx: frame.tx, tz: frame.tz,
  };
};

const C = EVENT_GROUND;
const dedicationSpots = [[11, -0.75], [14, 0.75], [17, -0.75], [20, 0.75], [23, -0.75], [26, 0.75]].map(([offset, lateral]) => wallSpot(offset, lateral));
const along = (spot, d = 1) => [spot.x + spot.tx * d * 6, spot.z + spot.tz * d * 6];

export const NEHEMIAH_CASTS = {
  // By night, with a few men and a lamp, among the fallen stones (2:12-15).
  nightRide: [
    nehemiah(-58.5, 398.5, [-40, 372], { pose: 'holdLamp', hold: [{ bone: 'RightHand', at: [0, 0.07, 0.02], build: lamp }] }),
    person('companion-a', MAN, -63.5, 394, [-40, 372], { principal: false, tint: { 'Tabernacle undyed woven cloth': 0x8a7760 } }),
    person('companion-b', MAN, -53, 404.5, [-40, 372], { principal: false, tint: { 'Tabernacle undyed woven cloth': 0x9b8270 } }),
  ],
  // "Come, let us build the wall of Jerusalem" (2:17-18).
  rise: [
    nehemiah(C['rise-and-build'].x, C['rise-and-build'].z, [C['rise-and-build'].x - 7, C['rise-and-build'].z + 1], { pose: 'standTalk' }),
    ...people('listener', [
      [C['rise-and-build'].x - 7.2, C['rise-and-build'].z - 1.6],
      [C['rise-and-build'].x - 7.6, C['rise-and-build'].z + 1.4, { woman: true }],
      [C['rise-and-build'].x - 6.6, C['rise-and-build'].z + 4],
      [C['rise-and-build'].x - 8.8, C['rise-and-build'].z + 3, { pose: 'stern' }],
      [C['rise-and-build'].x - 6.4, C['rise-and-build'].z - 4, { woman: true }],
    ], [C['rise-and-build'].x, C['rise-and-build'].z]),
  ],
  // Eliashib and his brothers the priests build the Sheep Gate and consecrate it (3:1).
  sheepGate: [
    person('eliashib', HIGH_PRIEST, -151.5, -561, [-157, -567], { pose: 'blessing' }),
    person('priest-a', PRIEST, -148, -563, [-157, -567]),
    person('priest-b', PRIEST, -154, -557, [-157, -567]),
    person('priest-c', PRIEST, -146.5, -558.5, [-157, -567], { pose: 'kneelBowed' }),
  ],
  // Shallum, ruler of half the district of Jerusalem — he and his daughters (3:12).
  daughters: [
    person('shallum', MAN, -125, -52, [-131, -52], { pose: 'working', tint: { 'Tabernacle undyed woven cloth': 0x8a7760 } }),
    person('daughter-a', WOMAN, -124.5, -48.5, [-131, -48.5], { pose: 'working', veil: VEILS[0], principal: true }),
    person('daughter-b', WOMAN, -125.5, -55.5, [-131, -55.5], { pose: 'working', veil: VEILS[2], principal: true }),
  ],
  // The Tekoites repaired a second section; their nobles would not stoop (3:5, 27).
  tekoa: [
    person('tekoite-a', MAN, 27.5, -139, [34, -142], { pose: 'working', tint: { 'Tabernacle undyed woven cloth': 0xa9957b } }),
    person('tekoite-b', MAN, 25.5, -143.5, [32, -146], { pose: 'working', tint: { 'Tabernacle undyed woven cloth': 0xb4a98c } }),
    person('noble-a', TRAVELER, 17.5, -142.5, [28, -141], { pose: 'stern', tint: { Cloth: 0x6a4a5a } }),
    person('noble-b', ARTISAN, 16.5, -136.5, [28, -141], { pose: 'stern', tint: { Cloth: 0x5a5a72 } }),
  ],
  // Sanballat and Tobiah at the foot of the wall: "if a fox goes up on it..." (4:1-3).
  mockery: [
    person('sanballat', ARTISAN, -337, -366, [-312, -371], { pose: 'standTalk', tint: { Cloth: SANBALLAT } }),
    person('tobiah', TRAVELER, -334, -360, [-312, -371], { pose: 'stern', tint: { Cloth: TOBIAH } }),
    person('soldier-a', MAN, -342, -371, [-312, -371], { principal: false, tint: { 'Tabernacle undyed woven cloth': 0x5a5a4a }, hold: [{ bone: 'RightHand', at: [0, 0.05, 0.02], build: spear }] }),
    person('soldier-b', MAN, -340, -355, [-312, -371], { principal: false, tint: { 'Tabernacle undyed woven cloth': 0x5a5a4a }, hold: [{ bone: 'RightHand', at: [0, 0.05, 0.02], build: spear }] }),
  ],
  // Half at the work, half under arms; the trumpeter by Nehemiah (4:13-23).
  swordAndTrowel: [
    nehemiah(80, -244.5, [90, -239], { pose: 'standTalk' }),
    person('trumpeter', PRIEST, 81.5, -241.5, [92, -236], { pose: 'blessing', hold: [{ bone: 'RightHand', build: trumpet }] }),
    person('builder', MAN, 84, -250, [92, -245], {
      pose: 'working',
      tint: { 'Tabernacle undyed woven cloth': 0xa9957b },
      // Trowel in one hand and, "strapped at his side as he built" (4:18), a sword.
      hold: [
        { bone: 'LeftHand', at: [0, 0.05, 0.02], build: trowel },
        { bone: 'Hips', offset: [0.3, -0.1, 0.02], euler: [Math.PI, 0, 0.12], build: sword },
      ],
    }),
    person('guard-a', MAN, 85.5, -236, [95, -230], { principal: false, tint: { 'Tabernacle undyed woven cloth': 0x5a5a4a }, hold: [{ bone: 'RightHand', at: [0, 0.05, 0.02], build: spear }] }),
    person('guard-b', MAN, 75, -251, [86, -253], { principal: false, tint: { 'Tabernacle undyed woven cloth': 0x5a5a4a }, hold: [{ bone: 'RightHand', at: [0, 0.05, 0.02], build: spear }] }),
  ],
  // A great outcry of the people and their wives (5:1-13).
  outcry: [
    nehemiah(-92, 74, [-102, 70], { pose: 'stern' }),
    person('lender', ARTISAN, -108.5, 72, [-92, 74], { pose: 'standTalk', tint: { Cloth: 0x5a5a72 }, principal: false }),
    ...people('petitioner', [
      [-103.5, 66.5, { woman: true, pose: 'kneelBowed' }],
      [-100.5, 77, { woman: true }],
      [-106, 79.5, { pose: 'recoil' }],
    ], [-92, 74]),
  ],
  // Finished: the twenty-fifth of Elul, fifty-two days (6:15).
  finished: [
    nehemiah(-33, -83, [-12, -89], { pose: 'blessing' }),
    person('eliashib', HIGH_PRIEST, -36, -88, [-12, -89], { principal: false }),
    ...people('builder', [[-37, -78], [-30, -90, { pose: 'standTalk' }], [-39, -92, { woman: true }]], [-12, -89]),
  ],
  // Ezra reads from the platform in the square before the Water Gate (8:1-12).
  waterGate: [
    ezra(PLATFORM.x, PLATFORM.z, [PLATFORM.x - 20, PLATFORM.z], {
      y: groundAt(PLATFORM.x, PLATFORM.z) + PLATFORM.height,
      pose: 'blessing',
      hold: [{ bone: 'LeftHand', at: [0, 0.03, 0.02], build: scroll }],
    }),
    person('levite-r1', LEVITE, PLATFORM.x, PLATFORM.z - 1.7, [PLATFORM.x - 20, PLATFORM.z], { y: groundAt(PLATFORM.x, PLATFORM.z) + PLATFORM.height, principal: false }),
    person('levite-l1', LEVITE, PLATFORM.x, PLATFORM.z + 1.7, [PLATFORM.x - 20, PLATFORM.z], { y: groundAt(PLATFORM.x, PLATFORM.z) + PLATFORM.height, principal: false }),
    nehemiah(-27, -84, [-17, -92]),
    ...people('assembly', [
      [-28, -96, { pose: 'floorListen', mat: true }],
      [-31, -91, { pose: 'floorLean', mat: true }],
      [-31, -100, { pose: 'floorListen', mat: true, woman: true }],
      [-34.5, -94, { pose: 'floorListen', mat: true }],
      [-35, -88, { pose: 'floorLean', mat: true, woman: true }],
      [-38.5, -97.5, { pose: 'floorListen', mat: true }],
      [-39, -90, { pose: 'kneelBowed', woman: true }],
      [-42, -94, { pose: 'floorListen', mat: true }],
      [-33, -80, { pose: 'standListen' }],
    ], [PLATFORM.x, PLATFORM.z]),
    person('levite-teacher', LEVITE, -37, -103, [-37, -97], { pose: 'standTalk', principal: false }),
  ],
  // Booths of branches, in the squares and on the roofs (8:13-18).
  booths: [
    ...people('family', [
      [-251, -260, { pose: 'floorListen', mat: true, principal: true }],
      [-248.4, -257.6, { pose: 'floorLean', mat: true, woman: true }],
      [-244.5, -252.5, { pose: 'standTalk' }],
      [-239.5, -257.5, { pose: 'floorListen', mat: true, woman: true }],
    ], [-252, -268]),
    person('child', MAN, -246.5, -262, [-252, -268], { scale: 0.62, principal: false, tint: { 'Tabernacle undyed woven cloth': 0xe1d0a9 } }),
  ],
  // Two great choirs on the wall, the trumpets and cymbals (12:27-43).
  dedication: [
    ezra(dedicationSpots[0].x, dedicationSpots[0].z, along(dedicationSpots[0], 1), { y: dedicationSpots[0].y, pose: 'blessing' }),
    person('trumpeter-a', PRIEST, dedicationSpots[1].x, dedicationSpots[1].z, along(dedicationSpots[1], 1), { y: dedicationSpots[1].y, pose: 'blessing', hold: [{ bone: 'RightHand', build: trumpet }] }),
    person('singer-a', LEVITE, dedicationSpots[2].x, dedicationSpots[2].z, along(dedicationSpots[2], 1), { y: dedicationSpots[2].y, pose: 'blessing', hold: [{ bone: 'RightHand', at: [0, 0.02, 0.04], build: cymbals }], principal: false }),
    person('singer-b', LEVITE, dedicationSpots[3].x, dedicationSpots[3].z, along(dedicationSpots[3], 1), { y: dedicationSpots[3].y, principal: false }),
    nehemiah(dedicationSpots[4].x, dedicationSpots[4].z, along(dedicationSpots[4], 1), { y: dedicationSpots[4].y, pose: 'blessing' }),
    person('trumpeter-b', PRIEST, dedicationSpots[5].x, dedicationSpots[5].z, along(dedicationSpots[5], 1), { y: dedicationSpots[5].y, pose: 'blessing', hold: [{ bone: 'RightHand', build: trumpet }] }),
  ],
};

// Which cast belongs to which event.
export const NEHEMIAH_STAGES = {
  'night-ride': 'nightRide',
  'rise-and-build': 'rise',
  'sheep-gate': 'sheepGate',
  'daughters-of-shallum': 'daughters',
  'nobles-of-tekoa': 'tekoa',
  mockery: 'mockery',
  'sword-and-trowel': 'swordAndTrowel',
  outcry: 'outcry',
  finished: 'finished',
  'water-gate': 'waterGate',
  booths: 'booths',
  dedication: 'dedication',
};

const poses = {
  ...COMMON_POSES,
  working: (t) => ({
    ...COMMON_POSES.standListen(t),
    spineLean: 16,
    headPitch: 22,
    right: { armFlex: 38 + wave(t, 3) * 5, foreArmFlex: 74 },
    left: { armFlex: 34, foreArmFlex: 66 },
  }),
  blessing: (t) => ({
    ...COMMON_POSES.standListen(t),
    right: { armFlex: 74, armAbduct: 30, foreArmFlex: 70 },
    left: { armFlex: 62, armAbduct: 24, foreArmFlex: 70 },
  }),
};

// One event's stage: something that can be set active, updated, asked about,
// and disposed (sceneEpisodes.js).
export function createNehemiahStage(THREE, event, { root, motionLibrary = undefined, active = false } = {}) {
  const cast = NEHEMIAH_CASTS[NEHEMIAH_STAGES[event]];
  return createTableau(THREE, {
    root,
    name: `nehemiah-${event}`,
    cast,
    poses,
    focus: cast[0].position,
    floorAt: stand,
    drawDistance: 120,
    motionLibrary,
    active,
  });
}

export function createNehemiahEventStages(THREE, { root, motionLibrary = undefined } = {}) {
  return Object.fromEntries(Object.keys(NEHEMIAH_STAGES).map((event) => [event, createNehemiahStage(THREE, event, { root, motionLibrary })]));
}

export { poses as NEHEMIAH_POSES };
export { stand as standingHeight };
