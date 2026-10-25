// The Synoptic final week, staged with the same skinned-character and captured
// Mixamo motion system used by the dedicated Temple and Mount of Olives worlds.
// Positions are absolute Jerusalem scene coordinates; only one tableau is
// visible (and its cast instantiated) at a time.

import { createTableau, wave } from './sceneTableau.js';
import { COMMON_POSES, FLOOR_SIT } from './tableauPoses.js';
import { createHerd } from './sceneAnimals.js';
import { eventFloorAt } from './jerusalemTopography.js';

const JESUS = { model: 'human-jesus' };
const WOMAN = 'human-tabernacle-camp-woman';
const MEN = ['human-artisan', 'human-villager', 'human-traveler'];
const man = (i) => MEN[i % MEN.length];
const at = (x, z, lift = 0) => [x, eventFloorAt(x, z) + lift, z];
const toward = ([x, , z]) => [x, z];
const ENTRY_POINT = [135, 28];
const ENTRY_HEADING = -Math.PI / 2;
export const ENTRY_COLT_SCALE = 1.13;
export const ENTRY_COLT_BACK = (0.98 + 0.25) * ENTRY_COLT_SCALE;
const entryFrame = (s, lateral = 0) => [ENTRY_POINT[0] - s, ENTRY_POINT[1] + lateral];
const pitchAlong = ([x, z], heading) => {
  const distance = 0.75;
  const ahead = eventFloorAt(x + Math.sin(heading) * distance, z + Math.cos(heading) * distance);
  const behind = eventFloorAt(x - Math.sin(heading) * distance, z - Math.cos(heading) * distance);
  return Math.atan2(behind - ahead, distance * 2);
};

export const JERUSALEM_POSES = {
  ...COMMON_POSES,
  rider: (t) => ({
    hipsHeight: ENTRY_COLT_BACK + 0.06,
    leftLeg: { thighFlex: 46, thighAbduct: 28, shinFlex: 6, shinAbduct: 10, ankleBend: 16 },
    rightLeg: { thighFlex: 46, thighAbduct: 28, shinFlex: 6, shinAbduct: 10, ankleBend: 16 },
    spineLean: 3 + wave(t, 2) * 0.7,
    headPitch: 2 + wave(t, 1, 1) * 1.2,
    left: { armFlex: 36, armAbduct: 8, foreArmFlex: 66 },
    right: { armFlex: 50 + wave(t, 2) * 2, armAbduct: 12, foreArmFlex: 82 },
    fingerCurl: 42,
  }),
  drive: (t) => ({
    spineLean: 8 + wave(t, 2) * 1.2,
    leftLeg: { thighFlex: 18, shinFlex: 1 }, rightLeg: { thighFlex: -14, shinFlex: -15 },
    left: { armFlex: 70, armAbduct: 28, foreArmFlex: 82 },
    right: { armFlex: 142 + wave(t, 2) * 4, armAbduct: 20, foreArmFlex: 164 },
    fingerCurl: 65,
  }),
  offer: (t) => ({
    spineLean: 18 + wave(t, 1) * 0.5, headPitch: 12,
    left: { armFlex: 18, armAbduct: 4, foreArmFlex: 58 },
    right: { armFlex: 72, armAbduct: -18, foreArmFlex: 78, foreArmAbduct: -18 },
    fingerCurl: 32,
  }),
  recline: (t) => ({
    ...FLOOR_SIT, spineLean: 18 + wave(t, 1) * 0.5, spineYaw: 8,
    left: { armFlex: 58, armAbduct: 8, foreArmFlex: 86 },
    right: { armFlex: 48, armAbduct: 12, foreArmFlex: 82 }, fingerCurl: 28,
  }),
  carryCross: (t) => ({
    spineLean: 26 + wave(t, 2) * 1.2, headPitch: 12,
    leftLeg: { thighFlex: 18, shinFlex: 4 }, rightLeg: { thighFlex: -12, shinFlex: -12 },
    left: { armFlex: 70, armAbduct: 28, foreArmFlex: 96 },
    right: { armFlex: 82, armAbduct: 20, foreArmFlex: 108 }, fingerCurl: 72,
  }),
  crucified: (t) => ({
    hipsHeight: 3.55, spineLean: 2, headPitch: 18 + wave(t, 1) * 0.5,
    leftLeg: { thighFlex: 8, shinFlex: -10 }, rightLeg: { thighFlex: 5, shinFlex: -14 },
    left: { armFlex: 0, armAbduct: 88, foreArmFlex: 3 },
    right: { armFlex: 0, armAbduct: 88, foreArmFlex: 3 }, fingerCurl: 28,
  }),
};

const actor = (id, model, motion, x, z, target, extra = {}) => ({
  id, model, motion, pose: 'standIdle', position: at(x, z, extra.lift || 0), target, ...extra,
});

function branch({ THREE, own, material }) {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(own(new THREE.CylinderGeometry(0.01, 0.014, 0.9, 5)), material('reed'));
  stem.position.y = 0.35;
  group.add(stem);
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(own(new THREE.PlaneGeometry(0.28, 0.55)), material('wool'));
    leaf.material = own(material('wool').clone());
    leaf.material.color.setHex(0x627842);
    leaf.material.side = THREE.DoubleSide;
    leaf.position.set(side * 0.12, 0.62, 0);
    leaf.rotation.set(0, side * 0.25, side * 0.45);
    group.add(leaf);
  }
  return group;
}

function entryProps(kit) {
  const { THREE, group, own, addMesh, material } = kit;
  const floor = eventFloorAt(...ENTRY_POINT);
  const pitch = pitchAlong(ENTRY_POINT, ENTRY_HEADING);
  const herd = createHerd(THREE, {
    name: 'entry-colt', groundAt: eventFloorAt,
    quality: 'high',
    animals: [{ species: 'donkey', pose: 'stand', x: ENTRY_POINT[0], z: ENTRY_POINT[1], facing: ENTRY_HEADING, pitch, scale: ENTRY_COLT_SCALE, phase: 0.4 }],
  });
  group.add(herd.group);
  own({ dispose: () => herd.dispose() });

  // The disciples' cloaks form a broad, readable saddle rather than letting
  // the rider visually sink into the donkey's barrel.
  const saddle = new THREE.Group();
  saddle.name = 'entry-colt-cloaks-and-tack';
  saddle.position.set(ENTRY_POINT[0], floor, ENTRY_POINT[1]);
  saddle.rotation.set(pitch, ENTRY_HEADING, 0, 'YXZ');
  const madder = own(material('wool').clone());
  madder.color.setHex(0x8f4938);
  const indigo = own(material('wool').clone());
  indigo.color.setHex(0x475b70);
  addMesh(new THREE.BoxGeometry(0.88, 0.055, 0.92), madder, [0, ENTRY_COLT_BACK + 0.02, -0.04], saddle);
  for (const side of [-1, 1]) {
    addMesh(new THREE.BoxGeometry(0.045, 0.5, 0.88), side > 0 ? madder : indigo,
      [side * 0.43, ENTRY_COLT_BACK - 0.24, -0.04], saddle);
    const eye = addMesh(new THREE.SphereGeometry(0.027, 8, 6), 'darkTimber',
      [side * 0.115, 1.56 * ENTRY_COLT_SCALE, 1.08 * ENTRY_COLT_SCALE], saddle);
    eye.name = 'entry-colt-eye';
  }
  for (let i = 0; i < 5; i += 1) {
    const mane = addMesh(new THREE.BoxGeometry(0.07, 0.17, 0.12), 'darkTimber',
      [0, (1.28 + i * 0.075) * ENTRY_COLT_SCALE, (0.34 + i * 0.115) * ENTRY_COLT_SCALE], saddle);
    mane.name = 'entry-colt-mane';
    mane.rotation.x = -0.35;
  }
  group.add(saddle);

  // A halter and slack reins make the relationship between Jesus and the colt
  // legible at the close camera used for this scene.
  const cord = material('cord');
  const muzzleX = ENTRY_POINT[0] - 1.12;
  const halter = addMesh(new THREE.TorusGeometry(0.19, 0.018, 6, 18), cord,
    [muzzleX, floor + 1.42, ENTRY_POINT[1]]);
  halter.rotation.y = Math.PI / 2;
  for (const side of [-1, 1]) {
    const points = [
      new THREE.Vector3(muzzleX + 0.04, floor + 1.44, ENTRY_POINT[1] + side * 0.13),
      new THREE.Vector3(ENTRY_POINT[0] - 0.7, floor + 1.18, ENTRY_POINT[1] + side * 0.24),
      new THREE.Vector3(ENTRY_POINT[0] - 0.18, floor + 1.72, ENTRY_POINT[1] + side * 0.18),
    ];
    const rein = addMesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 10, 0.012, 5, false), cord);
    rein.name = 'entry-colt-rein';
  }

  // Cloaks and leafy branches continue ahead of the animal along the road.
  for (let i = 0; i < 10; i += 1) {
    const [x, z] = entryFrame(3 + i * 1.45, (i % 3 - 1) * 0.58);
    const cloak = addMesh(new THREE.BoxGeometry(1.42, 0.028, 1.05), i % 3 === 0 ? indigo : i % 2 ? 'linen' : madder,
      [x, eventFloorAt(x, z) + 0.035, z]);
    cloak.rotation.y = ENTRY_HEADING + (i % 3 - 1) * 0.18;
    if (i < 8) {
      const fallen = branch(kit);
      fallen.position.set(x - 0.35, eventFloorAt(x - 0.35, z + 0.48) + 0.055, z + 0.48);
      fallen.rotation.set(Math.PI / 2 - 0.08, 0, i * 0.9);
      group.add(fallen);
    }
  }
  return { update: (time) => herd.update(time), clearance: [{ x: ENTRY_POINT[0], z: ENTRY_POINT[1], radius: 1.1 }] };
}

function tableProps({ THREE, addMesh }) {
  addMesh(new THREE.BoxGeometry(5.8, 0.16, 1.55), 'darkTimber', [-50, eventFloorAt(-50, 25) + 0.5, 25]);
  for (const x of [-52.3, -47.7]) for (const z of [24.45, 25.55]) {
    addMesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), 'darkTimber', [x, eventFloorAt(-50, 25) + 0.25, z]);
  }
  for (let i = 0; i < 5; i += 1) {
    const dish = addMesh(new THREE.CylinderGeometry(0.18, 0.22, 0.04, 12), 'clay', [-52 + i, eventFloorAt(-50, 25) + 0.61, 25]);
    dish.castShadow = false;
  }
  return { clearance: [{ x: -50, z: 25, radius: 3.2 }] };
}

function marketProps({ THREE, addMesh }) {
  for (let i = 0; i < 4; i += 1) {
    const x = 20 + i * 3;
    const floor = eventFloorAt(x, -13);
    const table = addMesh(new THREE.BoxGeometry(2.2, 0.16, 1.15), 'darkTimber', [x, floor + 0.45, -13 + (i % 2) * 1.6]);
    table.rotation.z = i % 2 ? 0.28 : -0.2;
  }
}

function treasuryProps({ THREE, addMesh }) {
  const floor = eventFloorAt(62, -12);
  const chest = addMesh(new THREE.CylinderGeometry(0.36, 0.52, 1.15, 8), 'bronze', [62, floor + 0.58, -12]);
  chest.name = 'treasury-chest';
  addMesh(new THREE.ConeGeometry(0.28, 0.52, 8, 1, true), 'bronze', [62, floor + 1.32, -12]);
  return { clearance: [{ x: 62, z: -12, radius: 0.65 }] };
}

function fireProps({ THREE, addMesh, material, flicker }) {
  const floor = eventFloorAt(-70, 56);
  addMesh(new THREE.CylinderGeometry(0.55, 0.65, 0.18, 10), 'basalt', [-70, floor + 0.09, 56]);
  const flame = flicker(addMesh(new THREE.ConeGeometry(0.22, 0.7, 8), material('flame'), [-70, floor + 0.48, 56]));
  flame.userData.light = { colour: 0xff9944, intensity: 8, distance: 10 };
  return { clearance: [{ x: -70, z: 56, radius: 0.8 }] };
}

function judgmentProps({ THREE, addMesh }) {
  const floor = eventFloorAt(-33, -74);
  addMesh(new THREE.BoxGeometry(4.8, 0.9, 2.7), 'basalt', [-33, floor + 0.45, -76]);
  addMesh(new THREE.BoxGeometry(1.5, 0.7, 1.1), 'limestone', [-33, floor + 1.25, -76]);
  return { clearance: [{ x: -33, z: -76, radius: 2.6 }] };
}

function cross({ THREE, addMesh }, x, z, tall = 7.3) {
  const floor = eventFloorAt(x, z);
  addMesh(new THREE.BoxGeometry(0.3, tall, 0.3), 'darkTimber', [x, floor + tall / 2, z]);
  addMesh(new THREE.BoxGeometry(4.2, 0.3, 0.3), 'darkTimber', [x, floor + tall * 0.72, z]);
}

function roadProps(kit) {
  const { THREE, addMesh } = kit;
  const floor = eventFloorAt(-132, -28);
  const upright = addMesh(new THREE.BoxGeometry(0.28, 5.2, 0.28), 'darkTimber', [-132.2, floor + 2.2, -28]);
  upright.rotation.z = Math.PI / 2.9;
  const bar = addMesh(new THREE.BoxGeometry(3.2, 0.28, 0.28), 'darkTimber', [-132.8, floor + 2.8, -28]);
  bar.rotation.z = Math.PI / 2.9;
}

function crucifixionProps(kit) {
  cross(kit, -171, -39, 6.5); cross(kit, -166, -39, 8); cross(kit, -161, -39, 6.5);
  return { clearance: [-171, -166, -161].map((x) => ({ x, z: -39, radius: 0.7 })) };
}

function burialProps({ THREE, addMesh }) {
  const floor = eventFloorAt(-170, -78);
  const body = addMesh(new THREE.CapsuleGeometry(0.28, 1.25, 6, 12), 'linen', [-166, floor + 0.55, -75]);
  body.rotation.z = Math.PI / 2;
}

const ENTRY_FOCUS = at(...ENTRY_POINT, 1.35);
const entrySpectators = Array.from({ length: 22 }, (_, i) => {
  const row = Math.floor(i / 2);
  const side = i % 2 ? -1 : 1;
  const [x, z] = entryFrame(-10.5 + row * 2.05, side * (4.65 + (row % 3) * 0.62));
  const woman = i % 7 === 0;
  const motion = i % 4 === 0 ? 'wave-emotional' : i % 5 === 0 ? 'thankful' : 'wave-emotional';
  return {
    ...actor(`pilgrim-${i}`, woman ? WOMAN : man(i), motion, x, z, toward(ENTRY_FOCUS), { audience: i > 9, phase: i * 0.47 }),
    ...(woman ? { veil: [0x765b46, 0x4d6172, 0x8b765b][i % 3] } : {}),
    hold: i % 3 !== 1 ? [{ bone: 'RightHand', at: [0, 0.06, 0.02], build: branch }] : undefined,
  };
});
const entryFollowers = Array.from({ length: 6 }, (_, i) => {
  const [x, z] = entryFrame(-3.3 - i * 1.35, (i % 2 ? -1 : 1) * (0.8 + (i % 3) * 0.18));
  return actor(`disciple-${i}`, man(i + 1), i % 2 ? 'walk-neutral' : 'thankful', x, z, toward(ENTRY_FOCUS), { audience: i > 3, phase: i * 0.8 });
});
const entryCast = [
  { id: 'jesus', ...JESUS, pose: 'rider', position: at(...ENTRY_POINT, 0.01), facing: ENTRY_HEADING, scale: 1.08, principal: true, solid: true, radius: 1.05 },
  actor('colt-leader', 'human-traveler', 'walk-neutral', ...entryFrame(2, 1.05), toward(ENTRY_FOCUS), { principal: true }),
  ...entryFollowers,
  ...entrySpectators,
];

const templeTeaching = (focus, count = 12) => [
  { id: 'jesus', ...JESUS, motion: 'talk-ask', pose: 'standTalk', position: focus, target: [focus[0], focus[2] + 5], principal: true },
  ...Array.from({ length: count }, (_, i) => {
    const a = -1.2 + (i / Math.max(1, count - 1)) * 2.4;
    const r = 4.8 + (i % 3) * 0.8;
    return actor(`hearer-${i}`, man(i), i % 4 === 0 ? 'nod-yes' : 'breathing-idle',
      focus[0] + Math.sin(a) * r, focus[2] + Math.cos(a) * r, toward(focus), { audience: i > 7 });
  }),
];

const stages = {
  'entry-gate': { name: 'jerusalem-entry-tableau', cast: entryCast, focus: ENTRY_FOCUS, props: entryProps, drawDistance: 130, principalDetail: 45 },
  'temple-cleansing': {
    name: 'jerusalem-cleansing-tableau', focus: at(24, -13, 1), props: marketProps,
    cast: [
      { id: 'jesus', ...JESUS, pose: 'drive', position: at(24, -13), target: [30, -13], principal: true },
      ...Array.from({ length: 8 }, (_, i) => actor(`merchant-${i}`, man(i), i % 2 ? 'surprised' : 'yell-angry', 18 + i * 1.7, -8 + (i % 2) * 3, [24, -13], { audience: i > 5 })),
    ],
  },
  'temple-teaching': { name: 'jerusalem-teaching-tableau', focus: at(50, -7, 1), cast: templeTeaching(at(50, -7), 14) },
  'widows-offering': {
    name: 'jerusalem-widow-tableau', focus: at(62, -12, 1), props: treasuryProps,
    cast: [
      { id: 'widow', model: WOMAN, veil: 0x5f5146, pose: 'offer', position: at(60.9, -10.8), target: [62, -12], principal: true },
      { id: 'jesus', ...JESUS, motion: 'thinking', pose: 'standListen', position: at(57, -7), target: [62, -12], principal: true },
      ...Array.from({ length: 6 }, (_, i) => actor(`giver-${i}`, man(i), i % 2 ? 'look-around' : 'breathing-idle', 64 + i * 0.9, -8 + (i % 2), [62, -12], { audience: i > 3 })),
    ],
  },
  'last-supper': {
    name: 'jerusalem-supper-tableau', focus: at(-50, 25, 0.8), props: tableProps,
    cast: Array.from({ length: 13 }, (_, i) => {
      const north = i < 7;
      const x = -53 + (i % 7);
      const z = 25 + (north ? -1.35 : 1.35);
      return { id: i === 0 ? 'jesus' : `disciple-${i}`, model: i === 0 ? 'human-jesus' : man(i),
        motion: i % 3 === 0 ? 'sit-talk' : 'sit-floor-reclined', pose: 'recline', position: at(x, z), target: [-50, 25], principal: i < 4, audience: i > 8 };
    }),
  },
  gethsemane: {
    name: 'jerusalem-gethsemane-tableau', focus: at(174, -23, 0.8),
    cast: [
      { id: 'jesus', ...JESUS, motion: 'kneel-pray', pose: 'kneelBowed', position: at(174, -23), target: [177, -25], principal: true },
      ...[-1, 0, 1].map((n, i) => ({ ...actor(`sleeping-${i}`, man(i), 'sleep-deep', 169 + n * 1.7, -18 + Math.abs(n), [174, -23]), lying: true, mat: true })),
      ...Array.from({ length: 7 }, (_, i) => actor(`arrest-party-${i}`, man(i), i % 2 ? 'torch-walk' : 'walk-neutral', 181 + (i % 3) * 1.4, -29 + Math.floor(i / 3) * 1.8, [174, -23], { audience: i > 4 })),
    ],
  },
  'caiaphas-courtyard': {
    name: 'jerusalem-caiaphas-tableau', focus: at(-70, 56, 0.8), props: fireProps,
    cast: [
      actor('peter', 'human-artisan', 'kneel-warm-hands', -72, 57.5, [-70, 56], { principal: true }),
      { ...actor('servant', WOMAN, 'point-forward', -67.7, 57, [-72, 57.5], { principal: true }), veil: 0x75604b },
      ...Array.from({ length: 6 }, (_, i) => actor(`witness-${i}`, man(i + 1), i % 2 ? 'talk-chat' : 'look-around', -74 + i * 1.5, 53 + (i % 2), [-70, 56], { audience: i > 3 })),
    ],
  },
  'before-pilate': {
    name: 'jerusalem-pilate-tableau', focus: at(-33, -74, 1), props: judgmentProps,
    cast: [
      actor('pilate', 'human-artisan', 'point-forward', -33, -76, [-33, -72], { lift: 1.7, principal: true, solid: false, tint: { Cloth: 0x852f2b } }),
      { id: 'jesus', ...JESUS, motion: 'sad-idle', pose: 'standIdle', position: at(-33, -71), target: [-33, -76], principal: true },
      ...Array.from({ length: 10 }, (_, i) => actor(`accuser-${i}`, man(i), i % 3 ? 'yell-angry' : 'argue', -41 + (i % 5) * 4, -66 + Math.floor(i / 5) * 2, [-33, -74], { audience: i > 6 })),
    ],
  },
  'road-to-golgotha': {
    name: 'jerusalem-road-tableau', focus: at(-132, -28, 1), props: roadProps,
    cast: [
      { id: 'simon', model: 'human-artisan', pose: 'carryCross', position: at(-132, -28), target: [-140, -31], principal: true },
      { id: 'jesus', ...JESUS, motion: 'sad-idle', pose: 'standIdle', position: at(-135, -29), target: [-142, -32], principal: true },
      ...Array.from({ length: 8 }, (_, i) => actor(`escort-${i}`, man(i), i < 3 ? 'walk-neutral' : 'crying', -128 + (i % 4) * 2, -24 + Math.floor(i / 4) * 2, [-135, -29], { audience: i > 5 })),
    ],
  },
  crucifixion: {
    name: 'jerusalem-crucifixion-tableau', focus: at(-166, -39, 3.5), props: crucifixionProps,
    cast: [
      { id: 'jesus', ...JESUS, pose: 'crucified', position: at(-166, -39), facing: Math.PI, principal: true, solid: false },
      ...Array.from({ length: 9 }, (_, i) => ({ ...actor(`witness-${i}`, i < 3 ? WOMAN : man(i), i % 3 === 0 ? 'crying' : 'sad-idle', -174 + i * 2, -31 + (i % 2) * 2, [-166, -39], { audience: i > 5 }), ...(i < 3 ? { veil: [0x6f5547, 0x4c5f70, 0x8a765d][i] } : {}) })),
    ],
  },
  burial: {
    name: 'jerusalem-burial-tableau', focus: at(-170, -78, 1), props: burialProps,
    cast: [
      actor('joseph', 'human-artisan', 'carry-box', -167.5, -74, [-170, -78], { principal: true }),
      actor('helper', 'human-traveler', 'carry-box', -164.6, -74, [-170, -78], { principal: true }),
      { ...actor('woman-a', WOMAN, 'crying', -168, -70.5, [-170, -78]), veil: 0x665247 },
      { ...actor('woman-b', WOMAN, 'sad-idle', -171, -70.5, [-170, -78]), veil: 0x4d6172 },
    ],
  },
  'empty-tomb': {
    name: 'jerusalem-empty-tomb-tableau', focus: at(-170, -78, 1),
    cast: [
      { id: 'messenger', model: 'human-traveler', tint: { Cloth: 0xf3efe7 }, motion: 'look-up-arms', pose: 'standTalk', position: at(-171.5, -79), target: [-166, -75], principal: true },
      ...Array.from({ length: 3 }, (_, i) => ({ ...actor(`woman-${i}`, WOMAN, i === 0 ? 'surprised' : 'thankful', -166 + i * 1.5, -74 + i * 0.5, [-171, -79], { principal: i === 0 }), veil: [0x765a49, 0x4d6375, 0x8b765b][i] })),
    ],
  },
};

const stage = (options) => ({
  ...options,
  create: (THREE, { root, active = false, motionLibrary, onReady } = {}) => createTableau(THREE, {
    root, active, motionLibrary, onReady, poses: JERUSALEM_POSES,
    floorAt: eventFloorAt, drawDistance: 95, principalDetail: 16, ...options,
  }),
});

export const JERUSALEM_EVENT_STAGES = Object.fromEntries(
  Object.entries(stages).map(([id, options]) => [id, stage(options)]),
);
