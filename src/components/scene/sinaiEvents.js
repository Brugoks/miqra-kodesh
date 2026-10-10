import { createTableau, wave } from './sceneTableau';
import { COMMON_POSES } from './tableauPoses';
import { groundAt } from './sinaiDimensions';

const man = 'human-tabernacle-camp-man',
  woman = 'human-tabernacle-camp-woman';
const person = (id, x, z, target, extra = {}) => ({
  id,
  model: man,
  position: [x, groundAt(x, z), z],
  target,
  pose: 'standListen',
  principal: true,
  motionLife: true,
  ...extra,
});
const moses = (x, z, target, extra = {}) =>
  person('moses', x, z, target, {
    tint: { 'Tabernacle undyed woven cloth': 0xb4ada1, Hair: 0xc7c1b7 },
    ...extra,
  });
const listeners = (x, z, target, n = 3) =>
  Array.from({ length: n }, (_, i) =>
    person(`listener-${i}`, x + (i - (n - 1) / 2) * 1.8, z + (i % 2) * 0.8, target, {
      model: i % 3 === 2 ? woman : man,
      tint: { 'Tabernacle undyed woven cloth': [0xa9957b, 0xe1d0a9, 0x9b8270][i % 3] },
    }),
  );
const tablets = ({ THREE, own }) => {
  const g = new THREE.Group();
  for (const x of [-0.16, 0.16]) {
    const m = new THREE.Mesh(
      own(new THREE.BoxGeometry(0.29, 0.44, 0.065)),
      own(new THREE.MeshStandardMaterial({ color: 0xa49c8e, roughness: 1 })),
    );
    m.position.set(x, 0.07, 0);
    g.add(m);
  }
  return g;
};
const trumpet = ({ THREE, own, material }) => {
  const g = new THREE.Group();
  const m = new THREE.Mesh(own(new THREE.CylinderGeometry(0.025, 0.1, 0.8, 12)), material('silver'));
  m.rotation.x = Math.PI / 2;
  m.position.z = 0.3;
  g.add(m);
  return g;
};
export const SINAI_CASTS = {
  bush: [moses(-70, 39, [-70, 36], { pose: 'kneelBowed' })],
  signs: [moses(-72, 39, [-70, 36], { pose: 'recoil' })],
  brothers: [moses(-71, 37, [-69, 37]), person('aaron', -69, 37, [-71, 37], { pose: 'standTalk' })],
  water: [moses(-105.5, 12, [-109, 9], { pose: 'standTalk' }), ...listeners(-109, 17, [-109, 9])],
  counsel: [
    person('jethro', -1.2, 67, [1, 69], { pose: 'standTalk' }),
    moses(1, 69, [-1.2, 67]),
    person('zipporah', -3.5, 68, [-1, 67], { model: woman }),
    ...listeners(0, 72, [-1, 67], 2),
  ],
  assembly: [
    moses(0, 66, [0, 72], { pose: 'standTalk' }),
    person('aaron', 2, 66, [0, 72]),
    ...listeners(0, 72, [0, 66], 4),
  ],
  boundary: [moses(3, 9, [6, 18], { pose: 'standTalk' }), ...listeners(6, 17, [3, 9], 4)],
  covenant: [
    moses(3, 9, [6, 15], { pose: 'standTalk' }),
    person('young-man', 8.8, 9, [6, 9]),
    ...listeners(6, 15, [3, 9]),
  ],
  elders: [
    moses(1, -55, [4, -55], { pose: 'floorListen', mat: true }),
    person('aaron', 7, -55, [4, -55], { pose: 'floorListen', mat: true }),
    ...listeners(4, -57.8, [4, -55], 3).map((p) => ({ ...p, pose: 'floorListen', mat: true })),
  ],
  tablets: [
    moses(-3, -150, [-3, -155], { pose: 'carryTablets', hold: [{ bone: 'RightHand', build: tablets }] }),
    person('joshua', 0, -132, [-3, -150]),
  ],
  renewal: [moses(-3, -150, [-3, -155], { pose: 'kneelBowed' })],
  calf: [person('aaron', -26, 44, [-23, 49], { pose: 'standTalk' }), ...listeners(-23, 50, [-23, 45], 4)],
  broken: [
    moses(-23, 48, [-23, 45], { pose: 'stern' }),
    person('joshua', -25, 49, [-23, 45]),
    person('aaron', -20, 45, [-23, 48]),
  ],
  intercession: [moses(-3, -150, [-3, -156], { pose: 'kneelBowed' })],
  tent: [moses(-125, 83, [-125, 87]), person('joshua', -122.5, 84, [-125, 87])],
  cleft: [moses(-28, -116, [-28, -121], { pose: 'kneelBowed' })],
  radiant: [
    moses(0, 66, [0, 72], { pose: 'carryTablets', hold: [{ bone: 'RightHand', build: tablets }] }),
    ...listeners(0, 72, [0, 66]),
  ],
  craftsmen: [
    person('bezalel', 62.2, 38, [64, 38], { pose: 'working' }),
    person('oholiab', 65.8, 38, [64, 38], { pose: 'working' }),
    person('weaver', 64, 34, [64, 36], { model: woman, pose: 'working' }),
  ],
  sanctuary: [moses(44, 96, [48, 86], { pose: 'standTalk' }), ...listeners(48, 98, [48, 86], 3)],
  priests: [
    person('aaron', 48, 95, [48, 101], { model: 'human-tabernacle-high-priest', pose: 'blessing' }),
    moses(44, 95, [48, 99]),
    person('priest-son', 51, 95, [48, 99]),
  ],
  mourning: [
    person('aaron', 48, 97, [48, 91], { model: 'human-tabernacle-high-priest' }),
    moses(45, 97, [48, 91], { pose: 'kneelBowed' }),
  ],
  meal: [
    ...listeners(0, 68, [0, 68], 4).map((p, i) => ({
      ...p,
      position: [i % 2 ? 2.2 : -2.2, groundAt(0, 68), 67 + Math.floor(i / 2) * 2.4],
      pose: 'floorListen',
      mat: true,
    })),
  ],
  gifts: [person('leader', 45, 97, [48, 91]), ...listeners(49, 99, [48, 91])],
  trumpets: [
    person('trumpeter-a', 4.2, 137, [7, 147], {
      pose: 'blessing',
      hold: [{ bone: 'RightHand', build: trumpet }],
    }),
    person('trumpeter-b', 9.8, 137, [7, 147], {
      pose: 'blessing',
      hold: [{ bone: 'RightHand', build: trumpet }],
    }),
    moses(7, 140, [7, 150]),
  ],
  departure: [moses(7, 137, [7, 152]), ...listeners(7, 132, [7, 152], 4)],
  elijah: [
    person('elijah', 47, -96, [47, -87], {
      pose: 'floorListen',
      mat: true,
      tint: { 'Tabernacle undyed woven cloth': 0x8a7760 },
    }),
  ],
  elijahWind: [
    person('elijah', 47, -93, [47, -84], {
      pose: 'kneelStartled',
      tint: { 'Tabernacle undyed woven cloth': 0x8a7760 },
    }),
  ],
  elijahVoice: [
    person('elijah', 47, -90, [47, -83], {
      pose: 'coveredFace',
      veil: 0x8a7760,
      tint: { 'Tabernacle undyed woven cloth': 0x8a7760 },
    }),
  ],
};
export const SINAI_STAGES = {
  'burning-bush': 'bush',
  signs: 'signs',
  'aaron-meets-moses': 'brothers',
  'water-rock': 'water',
  jethro: 'counsel',
  arrival: 'assembly',
  preparation: 'boundary',
  revelation: 'boundary',
  commandments: 'boundary',
  covenant: 'covenant',
  'elders-meal': 'elders',
  tablets: 'tablets',
  'golden-calf': 'calf',
  'broken-tablets': 'broken',
  intercession: 'intercession',
  'meeting-tent': 'tent',
  'cleft-glory': 'cleft',
  renewal: 'renewal',
  'radiant-face': 'radiant',
  craftsmen: 'craftsmen',
  'tabernacle-raised': 'sanctuary',
  ordination: 'priests',
  'first-offerings': 'priests',
  'nadab-abihu': 'mourning',
  'holy-living': 'assembly',
  dedication: 'gifts',
  passover: 'meal',
  census: 'assembly',
  trumpets: 'trumpets',
  departure: 'departure',
  'elijah-cave': 'elijah',
  'elijah-wind': 'elijahWind',
  'elijah-voice': 'elijahVoice',
};
const poses = {
  ...COMMON_POSES,
  carryTablets: (t) => ({
    ...COMMON_POSES.standListen(t),
    right: { armFlex: 28, armAbduct: 4, foreArmFlex: 90 },
    left: { armFlex: 22, armAbduct: 4, foreArmFlex: 80 },
  }),
  blessing: (t) => ({
    ...COMMON_POSES.standListen(t),
    right: { armFlex: 70, armAbduct: 30, foreArmFlex: 70 },
    left: { armFlex: 60, armAbduct: 24, foreArmFlex: 70 },
  }),
  working: (t) => ({
    ...COMMON_POSES.standListen(t),
    spineLean: 14,
    headPitch: 20,
    right: { armFlex: 35 + wave(t, 3) * 4, foreArmFlex: 70 },
    left: { armFlex: 35, foreArmFlex: 65 },
  }),
  coveredFace: (t) => ({
    ...COMMON_POSES.standListen(t),
    headPitch: 12,
    right: { armFlex: 85, foreArmFlex: 125, foreArmAbduct: -25 },
  }),
};
export function createSinaiEvents(THREE, { root, motionLibrary = undefined, onChange } = {}) {
  let current = null,
    disposed = false;
  const tableaus = Object.fromEntries(
    Object.entries(SINAI_CASTS).map(([name, cast]) => [
      name,
      createTableau(THREE, {
        root,
        name: `sinai-${name}`,
        cast,
        poses,
        focus: cast[0].position,
        floorAt: groundAt,
        drawDistance: 120,
        motionLibrary,
        active: false,
      }),
    ]),
  );
  return {
    ids: Object.keys(SINAI_STAGES),
    tableaus,
    setEpisode(id) {
      if (disposed || (id !== null && !SINAI_STAGES[id])) return false;
      current = id;
      for (const [name, tableau] of Object.entries(tableaus)) tableau.setActive(SINAI_STAGES[id] === name);
      onChange?.(id);
      return true;
    },
    getEpisode: () => current,
    acceptAssets: (group) => Object.values(tableaus).forEach((t) => t.acceptAssets(group)),
    update: (frame) => Object.values(tableaus).forEach((t) => t.update(frame)),
    queryClearance: (...args) => {
      const t = tableaus[SINAI_STAGES[current]];
      return t?.queryClearance(...args) || { collides: false, pushX: 0, pushZ: 0 };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      Object.values(tableaus).forEach((t) => t.dispose());
    },
  };
}
