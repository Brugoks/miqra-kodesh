import { createTableau, wave } from './sceneTableau';
import { COMMON_POSES } from './tableauPoses';
import { groundAt } from './bethlehemDimensions';
const person = (id, model, x, z, target, extra = {}) => ({
  id,
  model,
  position: [x, groundAt(x, z), z],
  target,
  pose: 'standListen',
  principal: true,
  motionLife: true,
  ...extra,
});
const woman = 'human-tabernacle-camp-woman';
const mary = (x, z, target, extra = {}) => person('mary', woman, x, z, target, { veil: 0x5e7284, ...extra });
const joseph = (x, z, target) =>
  person('joseph', 'human-traveler', x, z, target, { tint: { Cloth: 0x8a7558 } });

export const BETHLEHEM_CASTS = {
  family: [mary(-11.55, -35, [-10, -35], { pose: 'kneelListen', mat: true }), joseph(-8, -35.4, [-10, -35])],
  shepherds: [
    person('shepherd-a', 'human-artisan', -12.5, -31.8, [-10, -35]),
    person('shepherd-b', 'human-villager', -8, -32, [-10, -35], { pose: 'kneelBowed' }),
    person('shepherd-c', 'human-traveler', -14, -34, [-10, -35]),
  ],
  announcement: [
    person('messenger', 'human-villager', 64, 34, [59, 38], { pose: 'announce', tint: { Cloth: 0xf3eee0 } }),
    person('watcher-a', 'human-artisan', 59, 39, [64, 34], { pose: 'kneelStartled' }),
    person('watcher-b', 'human-traveler', 61, 40, [64, 34]),
  ],
  arrival: [mary(2, 57, [2, 30]), joseph(3.8, 56.2, [3, 30])],
  magi: [
    mary(14, -40, [15, -36], { pose: 'cradle', carryChild: true }),
    joseph(17, -40.5, [15, -37]),
    person('visitor-a', 'human-artisan', 13, -37.6, [14, -40], {
      pose: 'kneelBowed',
      tint: { Cloth: 0x8a6546 },
    }),
    person('visitor-b', 'human-villager', 15.3, -36.8, [14, -40], {
      pose: 'kneelListen',
      tint: { Cloth: 0x635a74 },
    }),
    person('visitor-c', 'human-traveler', 18, -37.3, [14, -40], { tint: { Cloth: 0x7e5845 } }),
  ],
  flight: [mary(3, 85, [3, 105], { pose: 'cradle', carryChild: true }), joseph(5, 87, [4, 105])],
};
export const BETHLEHEM_STAGES = {
  birth: ['family'],
  'good-news': ['family', 'announcement'],
  'shepherds-visit': ['family', 'shepherds'],
  arrival: ['arrival'],
  'magi-visit': ['magi'],
  flight: ['flight'],
};
const poses = {
  ...COMMON_POSES,
  cradle: (t) => ({
    spineLean: 6 + wave(t, 2) * 0.5,
    headPitch: 14,
    left: { armFlex: 26, armAbduct: 4, foreArmFlex: 96, foreArmAbduct: -44 },
    right: { armFlex: 24, armAbduct: 4, foreArmFlex: 92, foreArmAbduct: -40 },
    fingerCurl: 34,
  }),
  announce: (t) => ({
    ...COMMON_POSES.standListen(t),
    left: { armFlex: 35, armAbduct: 35, foreArmFlex: 70 },
    right: { armFlex: 38, armAbduct: 32, foreArmFlex: 72 },
  }),
};
function carriedChild({ THREE, own, material }, { bone }) {
  const group = new THREE.Group();
  group.name = 'carried-child';
  const left = bone('LeftHand'),
    right = bone('RightHand');
  const centre = left
    .clone()
    .add(right)
    .multiplyScalar(0.5)
    .add(new THREE.Vector3(0, 0.07, 0));
  const wrap = new THREE.Mesh(own(new THREE.CapsuleGeometry(0.075, 0.24, 5, 10)), material('linen'));
  wrap.rotation.z = Math.PI / 2;
  group.add(wrap);
  const head = new THREE.Mesh(own(new THREE.SphereGeometry(0.058, 10, 8)), material('clay'));
  head.position.set(0.19, 0.02, 0);
  group.add(head);
  group.position.copy(centre);
  const along = right.clone().sub(left).setY(0);
  group.rotation.y = Math.atan2(-along.z, along.x);
  group.userData.aimed = true;
  group.userData.at = centre;
  return group;
}
export function createBethlehemEvents(THREE, { root, motionLibrary = undefined, onChange } = {}) {
  let current = null,
    disposed = false;
  const tableaus = Object.fromEntries(
    Object.entries(BETHLEHEM_CASTS).map(([name, cast]) => [
      name,
      createTableau(THREE, {
        root,
        name: `bethlehem-${name}`,
        cast: cast.map((entry) =>
          entry.carryChild ? { ...entry, hold: [{ bone: 'RightHand', build: carriedChild }] } : entry,
        ),
        poses,
        focus: cast[0].position,
        floorAt: groundAt,
        drawDistance: 110,
        motionLibrary,
        active: false,
        props:
          name === 'magi'
            ? ({ THREE, addMesh }) => {
                for (let i = 0; i < 3; i++)
                  addMesh(new THREE.BoxGeometry(0.24, 0.17, 0.2), i === 0 ? 'bronze' : 'clay', [
                    13.3 + i * 0.6,
                    groundAt(14, -39) + 0.1,
                    -39,
                  ]);
                return {};
              }
            : null,
      }),
    ]),
  );
  function setEpisode(id) {
    if (disposed || (id !== null && !BETHLEHEM_STAGES[id])) return false;
    current = id;
    for (const [name, tableau] of Object.entries(tableaus))
      tableau.setActive((BETHLEHEM_STAGES[id] || []).includes(name));
    onChange?.(id);
    return true;
  }
  return {
    ids: Object.keys(BETHLEHEM_STAGES),
    tableaus,
    setEpisode,
    getEpisode: () => current,
    acceptAssets: (group) => Object.values(tableaus).forEach((t) => t.acceptAssets(group)),
    update: (frame) => Object.values(tableaus).forEach((t) => t.update(frame)),
    queryClearance: (...args) => {
      for (const t of Object.values(tableaus)) {
        const hit = t.queryClearance(...args);
        if (hit.collides) return hit;
      }
      return { collides: false, pushX: 0, pushZ: 0 };
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      Object.values(tableaus).forEach((t) => t.dispose());
    },
  };
}
