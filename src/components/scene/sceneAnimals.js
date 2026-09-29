// Animals and birds for the scenes — the other half of a place being lived in.
//
// A first-century village without a goat in it is a museum. These are built
// the way sceneFigures.js builds people: one reusable rig of Object3Ds is
// posed per animal per frame and read out as world matrices into a handful of
// InstancedMeshes shared by every species — bodies, heads, legs, ears, horns,
// tails and panniers — so a whole farmyard is seven draw calls. Species differ
// in their proportions and colours, not in their geometry.
//
// Poses are pure functions of time and each animal's own phase, and walking is
// driven by distance covered, as it is for people, so legs never skate.
//
// Birds are a second, smaller rig — a body and two wings — for gulls over the
// water, swallows over the lanes, doves on the roofs, sparrows and hens on
// the ground.
//
// three.js is passed in, so the module stays importable in jsdom.

import { routePlan, sampleRoute } from './sceneRoutes.js';

// Proportions in metres. `body` is [width, height, length] of the barrel;
// `stand` the height of its centre; `leg` length and radius; `head` the head's
// size; `ear`, `horn`, `tail` what they sound like.
export const SPECIES = {
  // The Syrian black goat: long black hair, swept-back horns. Herds of them
  // are what the hills of Galilee still look like from a distance.
  goat: {
    body: [0.34, 0.36, 0.78], stand: 0.64, leg: [0.46, 0.035], head: [0.13, 0.15, 0.28], neck: 0.32,
    ear: [0.03, 0.14, 0.06], horn: 0.24, tail: [0.03, 0.12], colours: [0x1c1916, 0x241f1b, 0x2c241e], face: null,
  },
  // The fat-tailed Awassi: cream fleece, brown face, the heavy tail that
  // Leviticus 3:9 names among the offerings.
  sheep: {
    body: [0.42, 0.42, 0.8], stand: 0.62, leg: [0.4, 0.035], head: [0.12, 0.15, 0.26], neck: 0.26,
    ear: [0.03, 0.1, 0.07], horn: 0, tail: [0.13, 0.22], colours: [0xd6cbb2, 0xcfc2a6, 0xe0d6c0], face: 0x5a4636,
  },
  // The donkey: the pack animal of the Via Maris and of every village.
  donkey: {
    body: [0.46, 0.5, 1.08], stand: 0.98, leg: [0.72, 0.05], head: [0.17, 0.2, 0.46], neck: 0.52,
    ear: [0.045, 0.26, 0.08], horn: 0, tail: [0.035, 0.42], colours: [0x6e6254, 0x7d7060, 0x5f5549], face: 0xb8ab95,
  },
  // The pariah dog of the Levant: tan, lean, curled tail — the village's
  // scavenger rather than anyone's pet.
  dog: {
    body: [0.24, 0.26, 0.6], stand: 0.5, leg: [0.38, 0.03], head: [0.11, 0.12, 0.24], neck: 0.18,
    ear: [0.03, 0.08, 0.05], horn: 0, tail: [0.025, 0.28], colours: [0xb08a5a, 0xa27c4c, 0xc39a68], face: null,
  },
};

// --- quadruped poses -----------------------------------------------------------
// Each returns { head, legSwing, lie, tail } — head pitch (positive looks
// down), leg swing amplitude, how far lying down (0..1), tail angle.
export const POSES = {
  graze: (t, phase) => ({
    head: 0.95 + Math.sin(t * 0.7 + phase) * 0.12,
    headTurn: Math.sin(t * 0.23 + phase * 2) * 0.25,
    lie: 0,
    tail: Math.sin(t * 2.1 + phase) * 0.25,
  }),
  stand: (t, phase) => ({
    head: -0.1 + Math.sin(t * 0.31 + phase) * 0.12,
    headTurn: Math.sin(t * 0.17 + phase * 1.4) * 0.6,
    lie: 0,
    // An occasional flick at the flies, not a metronome.
    tail: Math.max(0, Math.sin(t * 0.9 + phase)) ** 6 * 0.9,
  }),
  lie: (t, phase) => ({
    head: 0.1 + Math.sin(t * 0.2 + phase) * 0.08,
    headTurn: Math.sin(t * 0.11 + phase) * 0.4,
    lie: 1,
    tail: 0,
  }),
};

function makeQuadrupedRig(THREE) {
  const root = new THREE.Object3D();
  const body = new THREE.Object3D();
  root.add(body);
  const barrel = new THREE.Object3D();
  body.add(barrel);
  const neck = new THREE.Object3D();
  body.add(neck);
  const head = new THREE.Object3D();
  neck.add(head);
  const ears = [new THREE.Object3D(), new THREE.Object3D()];
  const horns = [new THREE.Object3D(), new THREE.Object3D()];
  ears.forEach((ear) => head.add(ear));
  horns.forEach((horn) => head.add(horn));
  const legs = [0, 1, 2, 3].map(() => {
    const pivot = new THREE.Object3D();
    body.add(pivot);
    const limb = new THREE.Object3D();
    pivot.add(limb);
    return { pivot, limb };
  });
  const tail = new THREE.Object3D();
  body.add(tail);
  const tailPiece = new THREE.Object3D();
  tail.add(tailPiece);
  const panniers = [new THREE.Object3D(), new THREE.Object3D()];
  panniers.forEach((pannier) => body.add(pannier));
  root.matrixAutoUpdate = false;
  return { root, body, barrel, neck, head, ears, horns, legs, tail, tailPiece, panniers };
}

// Where an animal is at time t: fixed, wandering round a small patch, or
// walking an out-and-back route as the village's walkers do.
function locate(animal, t) {
  if (animal.route) {
    animal.__plan ||= routePlan(animal);
    const s = sampleRoute(animal.__plan, t);
    return { x: s.x, z: s.z, facing: s.facing, gait: s.moving ? (s.along * animal.__plan.length) : null };
  }
  if (animal.wander) {
    // A slow Lissajous drift round the patch: grazing animals move a step or
    // two at a time, and turn as they go.
    const { cx, cz, r, speed = 0.12 } = animal.wander;
    const w = speed / Math.max(0.5, r);
    const a = t * w + animal.phase;
    const x = cx + Math.sin(a) * r;
    const z = cz + Math.sin(a * 1.37 + 1.1) * r * 0.8;
    const dx = Math.cos(a) * r * w;
    const dz = Math.cos(a * 1.37 + 1.1) * r * 0.8 * w * 1.37;
    return { x, z, facing: Math.atan2(dx, dz), gait: t * speed };
  }
  return { x: animal.x, z: animal.z, facing: animal.facing || 0, gait: null };
}

export function createHerd(THREE, { animals = [], quality = 'high', groundAt = null, name = 'herd' } = {}) {
  const low = quality === 'low';
  const group = new THREE.Group();
  group.name = name;
  const count = animals.length;
  if (!count) return { group, count: 0, update() {}, dispose() {}, meshes: [] };

  const geometries = [];
  const materials = [];
  const own = (g) => { geometries.push(g); return g; };
  const seg = low ? 7 : 11;
  const unitBody = own(new THREE.SphereGeometry(0.5, seg, Math.max(5, seg - 3)));
  const unitHead = own(new THREE.SphereGeometry(0.5, seg - 2, 6).translate(0, 0, 0.5));
  const unitLeg = own(new THREE.CylinderGeometry(1, 0.75, 1, 5).translate(0, -0.5, 0));
  const unitEar = own(new THREE.SphereGeometry(0.5, 6, 4));
  const unitHorn = own(new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0));
  const unitTail = own(new THREE.ConeGeometry(1, 1, 5).translate(0, -0.5, 0));
  const unitPannier = own(new THREE.BoxGeometry(1, 1, 1));
  const coat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  materials.push(coat);
  const woven = new THREE.MeshStandardMaterial({ color: 0x8a6e48, roughness: 1 });
  materials.push(woven);

  const make = (geometry, material, n, partName) => {
    const mesh = new THREE.InstancedMesh(geometry, material, n);
    mesh.name = `${name}-${partName}`;
    mesh.frustumCulled = false;
    if (!low) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return mesh;
  };
  const bodies = make(unitBody, coat, count, 'bodies');
  const heads = make(unitHead, coat, count, 'heads');
  const legs = make(unitLeg, coat, count * 4, 'legs');
  const ears = make(unitEar, coat, count * 2, 'ears');
  const tails = make(unitTail, coat, count, 'tails');
  const hasHorns = animals.some((a) => SPECIES[a.species]?.horn > 0);
  const hasPanniers = animals.some((a) => a.panniers);
  const horns = hasHorns ? make(unitHorn, coat, count * 2, 'horns') : null;
  const panniers = hasPanniers ? make(unitPannier, woven, count * 2, 'panniers') : null;

  const colour = new THREE.Color();
  animals.forEach((animal, i) => {
    const spec = SPECIES[animal.species];
    const coatColour = animal.colour ?? spec.colours[i % spec.colours.length];
    colour.setHex(coatColour);
    bodies.setColorAt(i, colour);
    tails.setColorAt(i, colour);
    for (let k = 0; k < 4; k += 1) legs.setColorAt(i * 4 + k, colour);
    for (let k = 0; k < 2; k += 1) ears.setColorAt(i * 2 + k, colour);
    heads.setColorAt(i, colour.setHex(spec.face ?? coatColour));
    if (horns) for (let k = 0; k < 2; k += 1) horns.setColorAt(i * 2 + k, colour.setHex(0x5e5348));
  });
  for (const mesh of [bodies, heads, legs, ears, tails, horns].filter(Boolean)) {
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  const rig = makeQuadrupedRig(THREE);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  function update(elapsed) {
    const t = elapsed || 0;
    animals.forEach((animal, i) => {
      const spec = SPECIES[animal.species];
      const where = locate(animal, t);
      const moving = where.gait !== null;
      const pose = (POSES[moving ? 'graze' : animal.pose] || POSES.stand)(t, animal.phase || i);
      if (moving && animal.route) { pose.head = 0.1; pose.headTurn = 0; }
      const scale = animal.scale || 1;
      const [bw, bh, bl] = spec.body;
      const ground = groundAt ? groundAt(where.x, where.z) : (animal.y || 0);
      const stand = spec.stand * (1 - pose.lie * 0.62);

      rig.root.position.set(where.x, ground, where.z);
      // Standing on a slope, nose down it (`pitch`, radians) — a colt on the
      // descent of a hill, not a statue on a level plinth.
      rig.root.rotation.set(animal.pitch || 0, where.facing, 0, 'YXZ');
      rig.root.scale.setScalar(scale);
      rig.body.position.set(0, stand, 0);
      rig.barrel.scale.set(bw, bh, bl);

      rig.neck.position.set(0, bh * 0.25, bl * 0.42);
      rig.neck.rotation.set(-0.7 + pose.head, pose.headTurn, 0);
      rig.head.position.set(0, spec.neck * 0.9, 0);
      rig.head.rotation.set(0.7, 0, 0);
      rig.head.scale.set(...spec.head);
      // Ears and horns in the head's own (unit) space, so they scale with it.
      rig.ears.forEach((ear, k) => {
        const side = k ? 1 : -1;
        ear.position.set(side * 0.55, 0.35, 0.15);
        ear.rotation.set(0, 0, side * (animal.species === 'donkey' ? 0.25 : 1.1));
        ear.scale.set(spec.ear[0] / spec.head[0], spec.ear[1] / spec.head[1], spec.ear[2] / spec.head[2]);
      });
      rig.horns.forEach((horn, k) => {
        const side = k ? 1 : -1;
        horn.position.set(side * 0.28, 0.42, 0.25);
        horn.rotation.set(-1.9, 0, side * 0.25);
        const h = spec.horn / spec.head[1];
        horn.scale.set(0.035 / spec.head[0], h, 0.035 / spec.head[2]);
      });

      // Legs: diagonal pairs swing together, from distance covered.
      const stride = moving ? Math.sin((where.gait / (spec.leg[0] * 1.6)) * Math.PI * 2) * 0.45 : 0;
      const corners = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
      rig.legs.forEach((leg, k) => {
        const [sx, sz] = corners[k];
        leg.pivot.position.set(sx * bw * 0.32, -bh * 0.2, sz * bl * 0.34);
        const swing = (k === 0 || k === 3 ? 1 : -1) * stride;
        leg.pivot.rotation.set(swing - pose.lie * (sz > 0 ? 1.4 : -1.2), 0, 0);
        const length = spec.leg[0] * (1 - pose.lie * 0.2);
        leg.limb.scale.set(spec.leg[1], length, spec.leg[1]);
      });
      rig.tail.position.set(0, bh * 0.2, -bl * 0.48);
      rig.tail.rotation.set(0.35 + pose.tail * 0.4 + (animal.species === 'dog' ? -2.2 : 0), pose.tail, 0);
      rig.tailPiece.scale.set(spec.tail[0], spec.tail[1], spec.tail[0]);

      rig.panniers.forEach((pannier, k) => {
        const side = k ? 1 : -1;
        pannier.position.set(side * (bw * 0.62 + 0.08), -0.02, 0.05);
        pannier.scale.set(0.2, 0.42, 0.55);
      });

      rig.root.updateMatrix();
      rig.root.updateMatrixWorld(true);
      bodies.setMatrixAt(i, rig.barrel.matrixWorld);
      heads.setMatrixAt(i, rig.head.matrixWorld);
      rig.legs.forEach((leg, k) => legs.setMatrixAt(i * 4 + k, leg.limb.matrixWorld));
      rig.ears.forEach((ear, k) => ears.setMatrixAt(i * 2 + k, ear.matrixWorld));
      tails.setMatrixAt(i, rig.tailPiece.matrixWorld);
      if (horns) rig.horns.forEach((horn, k) => horns.setMatrixAt(i * 2 + k, spec.horn > 0 ? horn.matrixWorld : zero));
      if (panniers) rig.panniers.forEach((p, k) => panniers.setMatrixAt(i * 2 + k, animal.panniers ? p.matrixWorld : zero));
    });
    for (const mesh of [bodies, heads, legs, ears, tails, horns, panniers].filter(Boolean)) mesh.instanceMatrix.needsUpdate = true;
  }
  update(0);

  return {
    group,
    count,
    meshes: [bodies, heads, legs, ears, tails, horns, panniers].filter(Boolean),
    // Where each animal is now, for collision and for tests.
    positionOf(i, t) {
      const where = locate(animals[i], t);
      return where;
    },
    update,
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      group.removeFromParent();
    },
  };
}

// --- birds -------------------------------------------------------------------------

export const BIRDS = {
  gull: { span: 1.1, body: [0.12, 0.11, 0.38], colour: 0xf1f1ec, wing: 0xb9bdc2, flap: 3.2 },
  swallow: { span: 0.32, body: [0.05, 0.045, 0.16], colour: 0x1d2433, wing: 0x1a1f2b, flap: 11 },
  dove: { span: 0.6, body: [0.09, 0.09, 0.26], colour: 0x9a9ca3, wing: 0x8a8c93, flap: 7 },
  sparrow: { span: 0.22, body: [0.05, 0.05, 0.12], colour: 0x7a5a3c, wing: 0x6a4c30, flap: 14 },
  hen: { span: 0.5, body: [0.16, 0.2, 0.3], colour: 0x8a5a32, wing: 0x7a4c28, flap: 9 },
  rooster: { span: 0.55, body: [0.17, 0.24, 0.32], colour: 0xa04a20, wing: 0x2e3a2a, flap: 9 },
};

// Where a bird is and how it holds its wings at time t. Modes:
//   soar    — a wide banked circle, gliding with the odd burst of flapping (gulls)
//   dart    — quick low figure-eights over the lanes (swallows)
//   perch   — sitting on a roof edge, now and then a short flutter (doves)
//   peck    — on the ground, hopping about a patch, head bobbing (hens, sparrows)
function flight(bird, t, out) {
  const p = bird.phase || 0;
  const spec = BIRDS[bird.kind];
  switch (bird.mode) {
    case 'soar': {
      const a = t * (bird.speed || 8) / bird.r + p;
      out.x = bird.cx + Math.cos(a) * bird.r;
      out.z = bird.cz + Math.sin(a) * bird.r;
      out.y = bird.y + Math.sin(a * 0.5 + p) * 2.5;
      out.facing = Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI / 2;
      out.bank = -0.35;
      const flapping = Math.sin(t * 0.35 + p * 3) > 0.55;
      out.wing = flapping ? Math.sin(t * spec.flap + p) * 0.7 : 0.08;
      return out;
    }
    case 'dart': {
      const a = t * (bird.speed || 7) / bird.r + p;
      out.x = bird.cx + Math.sin(a) * bird.r;
      out.z = bird.cz + Math.sin(a * 2) * bird.r * 0.45;
      out.y = bird.y + Math.sin(a * 3 + p) * 1.2;
      const dx = Math.cos(a);
      const dz = Math.cos(a * 2) * 0.9;
      out.facing = Math.atan2(dx, dz);
      out.bank = Math.cos(a * 2) * 0.7;
      out.wing = Math.sin(t * spec.flap + p) * 0.9;
      return out;
    }
    case 'perch': {
      // Mostly sat; a short hop-and-flutter every so often.
      const cycle = (t + p * 7) % 23;
      const lift = cycle < 1.6 ? Math.sin((cycle / 1.6) * Math.PI) * 0.6 : 0;
      out.x = bird.x;
      out.z = bird.z;
      out.y = bird.y + lift;
      out.facing = bird.facing + (cycle < 1.6 ? cycle : 0) + Math.sin(t * 0.3 + p) * 0.3;
      out.bank = 0;
      out.wing = lift > 0 ? Math.sin(t * spec.flap) * 0.9 : -0.9;
      return out;
    }
    default: { // peck
      const a = t * 0.18 + p;
      out.x = bird.x + Math.sin(a) * (bird.r || 0.8);
      out.z = bird.z + Math.sin(a * 1.6 + p) * (bird.r || 0.8) * 0.7;
      const bob = Math.max(0, Math.sin(t * 5 + p * 5));
      out.y = bird.y;
      out.facing = Math.atan2(Math.cos(a), Math.cos(a * 1.6 + p) * 1.12) + bob * 0.2;
      out.bank = 0;
      out.pitch = bob * 0.6; // head down to the ground
      out.wing = -0.9;
      return out;
    }
  }
}

export function createBirds(THREE, { birds = [], quality = 'high', name = 'birds' } = {}) {
  const group = new THREE.Group();
  group.name = name;
  const count = birds.length;
  if (!count) return { group, count: 0, update() {}, dispose() {}, meshes: [] };
  const low = quality === 'low';
  const bodyGeometry = new THREE.SphereGeometry(0.5, 7, 5);
  // A wing: a swept, tapering triangle hinged at the body, pointing out +X.
  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0.12, 1, 0, -0.18, 0, 0, -0.2,
    0, 0, 0.12, 0.55, 0, 0.02, 1, 0, -0.18,
  ], 3));
  wingGeometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
  const bodies = new THREE.InstancedMesh(bodyGeometry, material, count);
  const wings = new THREE.InstancedMesh(wingGeometry, material, count * 2);
  bodies.name = `${name}-bodies`;
  wings.name = `${name}-wings`;
  for (const mesh of [bodies, wings]) {
    mesh.frustumCulled = false;
    mesh.castShadow = !low;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
  }
  const colour = new THREE.Color();
  birds.forEach((bird, i) => {
    const spec = BIRDS[bird.kind];
    bodies.setColorAt(i, colour.setHex(spec.colour));
    wings.setColorAt(i * 2, colour.setHex(spec.wing));
    wings.setColorAt(i * 2 + 1, colour.setHex(spec.wing));
  });
  bodies.instanceColor.needsUpdate = true;
  wings.instanceColor.needsUpdate = true;

  const root = new THREE.Object3D();
  const body = new THREE.Object3D();
  const wingPivots = [new THREE.Object3D(), new THREE.Object3D()];
  root.add(body);
  wingPivots.forEach((w) => root.add(w));
  const state = { x: 0, y: 0, z: 0, facing: 0, bank: 0, wing: 0, pitch: 0 };

  function update(elapsed) {
    const t = elapsed || 0;
    birds.forEach((bird, i) => {
      const spec = BIRDS[bird.kind];
      state.pitch = 0;
      flight(bird, t, state);
      root.position.set(state.x, state.y, state.z);
      root.rotation.set(state.pitch, state.facing, state.bank, 'YXZ');
      root.updateMatrix();
      body.scale.set(...spec.body);
      body.position.set(0, spec.body[1] * 0.5, 0);
      // The left wing is the right one mirrored by scale, so both sweep back;
      // a raised wing rotates up on either side. A bird on the ground or a
      // roof folds its wings along its back.
      const folded = state.wing <= -0.85;
      wingPivots.forEach((pivot, k) => {
        const side = k ? 1 : -1;
        pivot.position.set(side * spec.body[0] * 0.4, spec.body[1] * 0.7, 0);
        pivot.rotation.set(0, 0, side * (folded ? -0.25 : state.wing));
        pivot.scale.set(side * (spec.span / 2) * (folded ? 0.35 : 1), 1, spec.body[2] * 1.4);
      });
      root.updateMatrixWorld(true);
      bodies.setMatrixAt(i, body.matrixWorld);
      wings.setMatrixAt(i * 2, wingPivots[0].matrixWorld);
      wings.setMatrixAt(i * 2 + 1, wingPivots[1].matrixWorld);
    });
    bodies.instanceMatrix.needsUpdate = true;
    wings.instanceMatrix.needsUpdate = true;
  }
  update(0);

  return {
    group,
    count,
    meshes: [bodies, wings],
    positionOf(i, t) { return { ...flight(birds[i], t, { ...state }) }; },
    update,
    dispose() {
      bodyGeometry.dispose();
      wingGeometry.dispose();
      material.dispose();
      group.removeFromParent();
    },
  };
}
