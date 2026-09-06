// The people in the scenes.
//
// Until this existed, everyone in every scene was a cone with a sphere balanced
// on top, scattered at uniform random across the available floor. That reads
// exactly as what it is — traffic cones — and it is the single most obviously
// wrong thing in the frame, because a human being is the one object in these
// reconstructions that every visitor is an expert on.
//
// Two changes do most of the work, and neither is about polygon count:
//
//   A figure has limbs, and the limbs move. A robe, a head, a headcloth and
//   two arms on a pivot is still only five primitives, but the arms are what
//   turn a silhouette into a posture — and posture is what says whether
//   someone is praying, carrying something, arguing, or waiting.
//
//   People stand in groups. Uniform random scatter is the giveaway: real
//   crowds are lumpy, they face each other, and they leave the middle of a
//   thoroughfare clear. `gather()` below is a bigger improvement than anything
//   done to the geometry.
//
// Everything is instanced — one InstancedMesh per body part, not per person —
// so a hundred and ten pilgrims cost five draw calls. Poses are computed into a
// single reusable rig of Object3Ds and read out as world matrices, which means
// the joint maths is three's rather than mine.
//
// three.js is passed in, as everywhere else in this directory, so the module
// stays importable in jsdom.

// --- proportions ----------------------------------------------------------

// A first-century adult, which is shorter than a modern one: skeletal remains
// from the period put the average man around 1.65m. The visitor's own eye is at
// 1.7, so a crowd built to modern heights would very slightly look down on them
// — a detail nobody could name but everybody would feel.
export const FIGURE = {
  height: 1.66,
  robeHeight: 1.28,
  robeBase: 0.02,
  robeTop: 0.17,
  robeHem: 0.29,
  shoulderY: 1.26,
  shoulderX: 0.19,
  headY: 0.2,
  headRadius: 0.107,
  clothY: 0.225,
  clothRadius: 0.126,
  armLength: 0.55,
  armRadius: 0.043,
};

// Undyed wool and linen, with the occasional madder or indigo among them.
// Bright dyes were expensive, so most of a crowd is the colour the sheep were.
export const ROBE_PALETTE = [
  0xe6ddc9, 0xd8cdb4, 0xc4b79a, 0xa8967d, 0x9c8b74, 0xb6a68c, 0x8d7f6c, 0xd9cdb6,
  0xbfae91, 0x7d6f5e,
];

// A handful of colours nobody could have afforded much of, used sparingly.
export const ROBE_ACCENTS = [0x8a4b3c, 0x4a5c74, 0x6b5340];

export const SKIN = 0x9c7c5f;
export const HEADCLOTH = 0xe8e1d2;

// --- what people are doing ------------------------------------------------
//
// Each activity is a function of time and the figure's own phase, returning a
// pose. Keeping them as pure functions of (t, phase) is what lets a hundred
// people share five geometries and still not move as one.
//
//   lean    — forward tilt at the hips, radians
//   sway    — rotation about the vertical, radians, added to the facing
//   rise    — vertical offset, for sitting and kneeling
//   crouch  — vertical scale on the body, for the same
//   armL/R  — { swing, raise }: swing is forward and back, raise is outward
//             from the body. Both are radians from hanging straight down.

const IDLE_ARM = { swing: 0, raise: 0.06 };

export const ACTIVITIES = {
  // Waiting. Almost still, but never quite: weight shifts, and the head turns.
  standing: (t, phase) => ({
    lean: Math.sin(t * 0.5 + phase) * 0.012,
    sway: Math.sin(t * 0.31 + phase * 1.7) * 0.09,
    armL: { swing: Math.sin(t * 0.4 + phase) * 0.05, raise: 0.07 },
    armR: { swing: Math.sin(t * 0.37 + phase * 2) * 0.05, raise: 0.07 },
  }),

  // In conversation. One arm does most of the talking, in bursts rather than
  // continuously, because a gesture that never stops is a windmill.
  talking: (t, phase) => {
    const burst = Math.max(0, Math.sin(t * 0.7 + phase * 3));
    return {
      lean: 0.03 + Math.sin(t * 0.6 + phase) * 0.02,
      sway: Math.sin(t * 0.45 + phase) * 0.13,
      armL: { swing: -0.15 * burst, raise: 0.1 + 0.32 * burst },
      armR: { swing: Math.sin(t * 0.5 + phase) * 0.06, raise: 0.08 },
    };
  },

  // Listening to whoever is talking. Still, slightly inclined toward them.
  attending: (t, phase) => ({
    lean: 0.05 + Math.sin(t * 0.4 + phase) * 0.012,
    sway: Math.sin(t * 0.22 + phase) * 0.05,
    armL: IDLE_ARM,
    armR: IDLE_ARM,
  }),

  // Standing prayer: hands lifted, palms out, which is how Jews prayed and how
  // Paul tells Timothy men should — not the folded hands of later Christian
  // art. 1 Timothy 2:8.
  praying: (t, phase) => ({
    lean: -0.04 + Math.sin(t * 0.33 + phase) * 0.015,
    sway: Math.sin(t * 0.2 + phase) * 0.03,
    armL: { swing: -1.15 + Math.sin(t * 0.5 + phase) * 0.04, raise: 0.5 },
    armR: { swing: -1.15 + Math.sin(t * 0.47 + phase * 1.3) * 0.04, raise: 0.5 },
  }),

  // Bowed, or prostrate at the moment of the offering.
  bowing: (t, phase) => ({
    lean: 0.75 + Math.sin(t * 0.4 + phase) * 0.03,
    sway: 0,
    armL: { swing: 0.5, raise: 0.14 },
    armR: { swing: 0.5, raise: 0.14 },
  }),

  // Sitting — on a step, a wall, the ground. The robe shortens rather than the
  // legs bending, which is all the resolution this needs.
  sitting: (t, phase) => ({
    lean: 0.12 + Math.sin(t * 0.35 + phase) * 0.02,
    sway: Math.sin(t * 0.25 + phase) * 0.06,
    // `crouch` is what lowers a seated figure — it scales the whole body
    // about the feet — so `rise` only has to settle the robe onto the ground
    // it is pooling on. Applying both at full strength buries the head at
    // half a metre, which is not sitting, it is lying down.
    rise: -0.05,
    crouch: 0.66,
    armL: { swing: 0.42, raise: 0.16 },
    armR: { swing: 0.38, raise: 0.16 },
  }),

  // Carrying something on the hip or the shoulder: one arm up and bent, and a
  // lean away from the load to balance it.
  carrying: (t, phase) => ({
    lean: 0.05,
    sway: 0.16 + Math.sin(t * 0.4 + phase) * 0.03,
    armL: { swing: -0.5, raise: 0.62 },
    armR: { swing: 0.1, raise: 0.05 },
  }),

  // Bent over work — mending a net, sorting fish, washing.
  working: (t, phase) => ({
    lean: 0.62 + Math.sin(t * 1.4 + phase) * 0.07,
    sway: Math.sin(t * 0.7 + phase) * 0.06,
    rise: -0.04,
    crouch: 0.92,
    armL: { swing: 0.85 + Math.sin(t * 1.5 + phase) * 0.18, raise: 0.2 },
    armR: { swing: 0.85 + Math.sin(t * 1.5 + phase + 1.1) * 0.18, raise: 0.2 },
  }),

  // Kneeling, low.
  kneeling: (t, phase) => ({
    lean: 0.28 + Math.sin(t * 0.4 + phase) * 0.02,
    sway: 0,
    // Taller than sitting: kneeling upright puts the head about a head and a
    // half higher than sitting on the ground does.
    rise: -0.02,
    crouch: 0.78,
    armL: { swing: 0.3, raise: 0.12 },
    armR: { swing: 0.3, raise: 0.12 },
  }),

  // On the move. The arms swing against the legs; `cadence` is supplied by the
  // caller from distance travelled so the swing matches the speed.
  walking: (t, phase, cadence = 0) => ({
    lean: 0.06,
    sway: Math.sin(cadence) * 0.05,
    // The bob is what actually reads as walking at any distance.
    rise: Math.abs(Math.sin(cadence)) * 0.035,
    armL: { swing: Math.sin(cadence) * 0.55, raise: 0.09 },
    armR: { swing: -Math.sin(cadence) * 0.55, raise: 0.09 },
  }),
};

export const ACTIVITY_NAMES = Object.keys(ACTIVITIES);

export function poseFor(activity, t, phase, cadence) {
  const fn = ACTIVITIES[activity] || ACTIVITIES.standing;
  const pose = fn(t, phase, cadence);
  return {
    lean: pose.lean || 0,
    sway: pose.sway || 0,
    rise: pose.rise || 0,
    crouch: pose.crouch === undefined ? 1 : pose.crouch,
    armL: pose.armL || IDLE_ARM,
    armR: pose.armR || IDLE_ARM,
  };
}

// --- placing people -------------------------------------------------------

// A knot of people standing together and facing roughly inward, which is what
// a crowd actually looks like and what a uniform scatter never does. Returns
// bare placements; the caller decides what each of them is doing.
export function gather(random, centre, count, options = {}) {
  const { radius = 1.5, y = 0, spread = 0.55 } = options;
  const placements = [];
  // Nobody stands exactly on the circle and nobody stands exactly facing the
  // middle, or the group reads as a committee photograph.
  for (let i = 0; i < count; i += 1) {
    const around = (i / count) * Math.PI * 2 + random() * spread;
    const distance = radius * (0.55 + random() * 0.62);
    const x = centre[0] + Math.cos(around) * distance;
    const z = centre[1] + Math.sin(around) * distance;
    // Face the centre, give or take.
    const facing = Math.atan2(centre[0] - x, centre[1] - z) + (random() - 0.5) * 0.7;
    placements.push({ x, z, y, facing });
  }
  return placements;
}

// Scatters loose individuals across a rectangle, avoiding a middle strip so a
// thoroughfare stays walkable and the scene does not read as a field of people.
export function scatter(random, count, options = {}) {
  const {
    x0, x1, z0, z1, y = 0, clearX = 0,
  } = options;
  const placements = [];
  let guard = 0;
  while (placements.length < count && guard < count * 40) {
    guard += 1;
    const x = x0 + random() * (x1 - x0);
    const z = z0 + random() * (z1 - z0);
    if (clearX > 0 && Math.abs(x) < clearX) continue;
    placements.push({ x, z, y, facing: random() * Math.PI * 2 });
  }
  return placements;
}

// --- the rig --------------------------------------------------------------

// One reusable skeleton, posed once per figure per frame and read out as world
// matrices. Using real Object3Ds for the joints means the arm maths — a pivot
// at the shoulder, a mesh hanging half its length below it — is three's and not
// hand-rolled trigonometry that is wrong in one quadrant.
function makeRig(THREE) {
  const root = new THREE.Object3D();
  const body = new THREE.Object3D();
  root.add(body);

  const robe = new THREE.Object3D();
  robe.position.y = FIGURE.robeBase + FIGURE.robeHeight / 2;
  body.add(robe);

  const shoulders = new THREE.Object3D();
  shoulders.position.y = FIGURE.shoulderY;
  body.add(shoulders);

  const head = new THREE.Object3D();
  head.position.y = FIGURE.headY;
  shoulders.add(head);

  const cloth = new THREE.Object3D();
  cloth.position.y = FIGURE.clothY;
  shoulders.add(cloth);

  const makeArm = (side) => {
    const pivot = new THREE.Object3D();
    pivot.position.set(side * FIGURE.shoulderX, -0.02, 0);
    shoulders.add(pivot);
    const limb = new THREE.Object3D();
    limb.position.y = -FIGURE.armLength / 2;
    pivot.add(limb);
    return { pivot, limb };
  };

  const left = makeArm(-1);
  const right = makeArm(1);

  root.matrixAutoUpdate = false;
  return {
    root, body, robe, shoulders, head, cloth, left, right,
  };
}

// --- the crowd ------------------------------------------------------------

export function createCrowd(THREE, options = {}) {
  const {
    figures = [],
    quality = 'high',
    castShadow = true,
    skin = SKIN,
    headcloth = HEADCLOTH,
    name = 'crowd',
    // Scenes whose ground is not flat resolve the height under a figure that
    // moves. Capernaum's routes run from the beach up into the village, and a
    // walker carrying a fixed Y either wades or floats.
    groundAt = null,
  } = options;

  const low = quality === 'low';
  const count = figures.length;
  const group = new THREE.Group();
  group.name = name;

  if (count === 0) {
    return {
      group, meshes: [], count: 0, update() {}, dispose() {},
    };
  }

  const geometries = [];
  const materials = [];

  const geometry = (g) => {
    geometries.push(g);
    return g;
  };
  const material = (m) => {
    materials.push(m);
    return m;
  };

  // A robe is a truncated cone, narrow at the shoulders and wide at the hem —
  // which is what a single piece of cloth belted at the waist actually does,
  // and it is the shape that reads as "not modern" from any distance.
  const robeGeometry = geometry(new THREE.CylinderGeometry(
    FIGURE.robeTop,
    FIGURE.robeHem,
    FIGURE.robeHeight,
    low ? 6 : 8,
  ));
  const headGeometry = geometry(new THREE.SphereGeometry(FIGURE.headRadius, low ? 6 : 8, low ? 5 : 6));
  // A cap rather than a whole sphere: it sits on the head, it does not swallow
  // it. Nearly everyone in these scenes had their head covered outdoors.
  const clothGeometry = geometry(new THREE.SphereGeometry(
    FIGURE.clothRadius,
    low ? 6 : 8,
    low ? 4 : 5,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.62,
  ));
  const armGeometry = geometry(new THREE.CylinderGeometry(
    FIGURE.armRadius,
    FIGURE.armRadius * 0.85,
    FIGURE.armLength,
    low ? 4 : 5,
  ));

  const robeMaterial = material(new THREE.MeshStandardMaterial({ roughness: 0.92 }));
  const skinMaterial = material(new THREE.MeshStandardMaterial({ color: skin, roughness: 0.88 }));
  const clothMaterial = material(new THREE.MeshStandardMaterial({ color: headcloth, roughness: 0.94 }));

  const mesh = (g, m, instances) => {
    const instanced = new THREE.InstancedMesh(g, m, instances);
    instanced.frustumCulled = false;
    if (!low && castShadow) {
      instanced.castShadow = true;
      instanced.receiveShadow = true;
    }
    group.add(instanced);
    return instanced;
  };

  const robes = mesh(robeGeometry, robeMaterial, count);
  const heads = mesh(headGeometry, skinMaterial, count);
  const cloths = mesh(clothGeometry, clothMaterial, count);
  robes.name = name;
  heads.name = `${name}-heads`;
  cloths.name = `${name}-cloths`;
  // Arms share one instanced mesh with two entries per figure, because two
  // meshes of N is two draw calls where one of 2N is one.
  const arms = mesh(armGeometry, robeMaterial, count * 2);
  arms.name = `${name}-arms`;

  if (figures.some((figure) => figure.route)) {
    for (const instanced of [robes, heads, cloths, arms]) {
      instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
  }

  const rig = makeRig(THREE);
  const colour = new THREE.Color();

  // Robe colour is per-figure and never changes, so it is written once.
  figures.forEach((figure, i) => {
    colour.setHex(figure.colour ?? ROBE_PALETTE[i % ROBE_PALETTE.length]);
    robes.setColorAt(i, colour);
    arms.setColorAt(i * 2, colour);
    arms.setColorAt(i * 2 + 1, colour);
  });
  if (robes.instanceColor) robes.instanceColor.needsUpdate = true;
  if (arms.instanceColor) arms.instanceColor.needsUpdate = true;

  function update(elapsed) {
    const t = elapsed || 0;
    for (let i = 0; i < count; i += 1) {
      const figure = figures[i];
      let { x, z } = figure;
      let facing = figure.facing || 0;
      let cadence = 0;

      // A figure with a route walks it, out and back, so nobody vanishes at
      // the end of a line. Same treatment the Capernaum villagers had, kept
      // because it is the right one.
      if (figure.route) {
        const [from, to] = figure.route;
        const cycle = (t * (figure.speed || 0.1) + (figure.phase || 0)) % 2;
        const along = cycle > 1 ? 2 - cycle : cycle;
        const dx = to[0] - from[0];
        const dz = to[1] - from[1];
        const length = Math.hypot(dx, dz) || 1;
        const lane = figure.lane || 0;
        x = from[0] + dx * along + (-dz / length) * lane;
        z = from[1] + dz * along + (dx / length) * lane;
        facing = Math.atan2(cycle > 1 ? -dx : dx, cycle > 1 ? -dz : dz);
        // Steps per metre, so the gait matches the speed rather than the clock.
        cadence = (along * length) / 0.78 * Math.PI;
      }

      const pose = poseFor(figure.activity, t, figure.phase || i * 0.7, cadence);
      const scale = figure.scale || 1;
      const ground = groundAt ? groundAt(x, z, figure) : (figure.y || 0);

      rig.root.position.set(x, ground + pose.rise * scale, z);
      rig.root.rotation.y = facing + pose.sway;
      rig.root.scale.setScalar(scale);
      rig.body.rotation.x = pose.lean;
      rig.body.scale.y = pose.crouch;
      rig.left.pivot.rotation.set(pose.armL.swing, 0, pose.armL.raise);
      rig.right.pivot.rotation.set(pose.armR.swing, 0, -pose.armR.raise);

      rig.root.updateMatrix();
      rig.root.updateMatrixWorld(true);

      robes.setMatrixAt(i, rig.robe.matrixWorld);
      heads.setMatrixAt(i, rig.head.matrixWorld);
      cloths.setMatrixAt(i, rig.cloth.matrixWorld);
      arms.setMatrixAt(i * 2, rig.left.limb.matrixWorld);
      arms.setMatrixAt(i * 2 + 1, rig.right.limb.matrixWorld);
    }
    robes.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    cloths.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
  }

  // Posed once at build time so a scene that is never updated — a still, a
  // test — still has people in it rather than a pile at the origin.
  update(0);

  function dispose() {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    for (const child of group.children) child.dispose?.();
  }

  return {
    group,
    meshes: [robes, heads, cloths, arms],
    count,
    update,
    dispose,
  };
}
