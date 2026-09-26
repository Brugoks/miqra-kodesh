// The life of the village: its animals, its birds, and the people the crowd
// placement in buildCapernaum.js does not reach — women at the ovens and
// carrying water, children playing in the lanes, a fisherman mending a net on
// the beach, an old man sitting in a doorway, a shepherd boy on the slope.
//
// Every one of them is placed on a floor the navigation reports and off
// anything it says is solid; the tests walk every route end to end. None of
// them stand in either tableau (Mark 2 at the house, Matthew 9 at the booth),
// which are staged moments and not somewhere for a goat to wander.
//
// On what is here and why. Black goats and fat-tailed sheep were the flocks of
// Galilee, folded at night inside a ring of dry-stone walling and let out onto
// the slope by day. Donkeys carried everything the Via Maris carried, which is
// why a customs post sat on it. Chickens were kept in first-century Judea —
// the rooster that crows in Mark 14:30 is a household bird, not a wild one —
// and scratched about courtyards as they do now. Gulls follow the boats on the
// lake; swallows hunt low over the lanes in spring; rock doves sit on the
// roofs. And a village's work was done by everyone in it: grinding and baking
// and drawing water largely by the women, and children underfoot.
//
// three.js is passed in, so the module stays importable in jsdom.

import { createHerd, createBirds } from './sceneAnimals.js';
import { createCrowd, ROBE_PALETTE } from './sceneFigures.js';
import { LIFE_ANCHORS, LEVEL, BLOCKS } from './capernaumDimensions.js';

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// The flock's fold, and where each kind of animal is kept. Exported so the
// tests can walk them and the soundscape can put the bleating in the right
// place.
export const FOLD = LIFE_ANCHORS.goatPen;

// People not placed by the builder's haunts. Routes are out-and-back and have
// been walked against the navigation; `activity` is a sceneFigures activity.
export const VILLAGE_PEOPLE = [
  // Baking at the tabun ovens in the yards, first thing in the morning.
  { id: 'oven-west-a', kind: 'woman', x: -12, z: 27.75, facing: Math.PI, activity: 'kneeling' },
  { id: 'oven-west-b', kind: 'child', x: -10.6, z: 28.4, facing: -2.4, activity: 'standing', scale: 0.62 },
  { id: 'oven-north-a', kind: 'woman', x: -2, z: 35.7, facing: Math.PI, activity: 'working' },
  { id: 'oven-north-b', kind: 'woman', x: -0.4, z: 36.1, facing: -2.6, activity: 'talking' },
  // Water carried up from the lake; the nearest spring, the one Josephus calls
  // Capharnaum, was a few kilometres west at Tabgha (War 3.519).
  { id: 'water-a', kind: 'woman', route: [[-1.5, -12.6], [-1.5, 0.5]], speed: 0.8, phase: 0, activity: 'walking' },
  { id: 'water-b', kind: 'woman', route: [[-1.5, -12.6], [-1.5, 0.5]], speed: 0.75, phase: 0.55, activity: 'walking' },
  // Children chasing one another up and down the lanes.
  { id: 'play-a', kind: 'child', route: [[2, 8.5], [2, 19]], speed: 2.2, phase: 0, activity: 'walking', scale: 0.6 },
  { id: 'play-b', kind: 'child', route: [[2, 8.5], [2, 19]], speed: 2.1, phase: 0.08, activity: 'walking', scale: 0.66 },
  { id: 'play-c', kind: 'child', route: [[2, 8.5], [2, 19]], speed: 1.9, phase: 0.16, activity: 'walking', scale: 0.56 },
  { id: 'play-d', kind: 'child', route: [[-28, 25], [-21.6, 25]], speed: 2, phase: 0.3, activity: 'walking', scale: 0.62 },
  { id: 'play-e', kind: 'child', route: [[-28, 25], [-21.6, 25]], speed: 1.8, phase: 0.42, activity: 'walking', scale: 0.58 },
  // Mending a net beside the boat, as the Zebedees were (Mark 1:19).
  { id: 'mender', kind: 'man', x: -4.6, z: -15.3, facing: -Math.PI / 2, activity: 'sitting' },
  // An old man in a doorway, watching the lane.
  { id: 'elder', kind: 'man', x: 13, z: 37.25, facing: Math.PI, activity: 'sitting', headcloth: 0xd6c6a6 },
  // A boy minding the flock on the slope above the village.
  { id: 'shepherd', kind: 'child', x: 10, z: 124, facing: Math.PI / 2, activity: 'standing', scale: 0.7 },
];

export function createCapernaumLife(THREE, ctx = {}) {
  const {
    quality = 'high', floorAt = null, terrainHeight = null, reducedMotion = false,
  } = ctx;
  const low = quality === 'low';
  const random = makeRandom(ctx.seed ?? 7713);
  const group = new THREE.Group();
  group.name = 'capernaum-life';
  const disposables = [];

  // The ground under anything: the village's floors where the navigation has
  // them, the real terrain beyond.
  const groundAt = (x, z) => {
    const floor = floorAt?.(x, z, 0);
    if (floor) return floor.height;
    return terrainHeight ? terrainHeight(x, z) : LEVEL.ground;
  };

  // --- animals ---
  const animals = [];
  const inFold = { cx: (FOLD.x0 + FOLD.x1) / 2, cz: (FOLD.z0 + FOLD.z1) / 2 };
  const foldCount = low ? 5 : 11;
  for (let i = 0; i < foldCount; i += 1) {
    const species = i % 3 === 2 ? 'sheep' : 'goat';
    animals.push({
      species,
      pose: i % 4 === 3 ? 'lie' : 'graze',
      wander: i % 4 === 3 ? null : { cx: inFold.cx + (random() - 0.5) * 3, cz: inFold.cz + (random() - 0.5) * 3, r: 0.9 + random() * 1.1, speed: 0.08 },
      x: inFold.cx + (random() - 0.5) * 5, z: inFold.cz + (random() - 0.5) * 5,
      facing: random() * 6, phase: random() * 10, scale: 0.9 + random() * 0.2,
    });
  }
  const { x: dx, z: dz } = LIFE_ANCHORS.donkeys;
  animals.push(
    { species: 'donkey', pose: 'stand', x: dx, z: dz - 0.9, facing: Math.PI / 2, phase: 1, panniers: true },
    { species: 'donkey', pose: 'stand', x: dx - 0.6, z: dz + 1.1, facing: Math.PI / 2 + 0.3, phase: 4 },
  );
  animals.push(
    // A dog working the promenade for scraps; another asleep in the sun.
    { species: 'dog', pose: 'stand', route: [[-30, -10.6], [10, -10.6]], speed: 0.9, phase: 0.2 },
    { species: 'dog', pose: 'lie', x: -43, z: 16.2, facing: 0.8, phase: 3 },
  );
  if (!low) {
    // The day flock on the slope above the village, with its boy.
    for (let i = 0; i < 9; i += 1) {
      animals.push({
        species: i % 3 === 0 ? 'sheep' : 'goat',
        pose: 'graze',
        wander: { cx: 18 + (random() - 0.5) * 14, cz: 128 + (random() - 0.5) * 10, r: 1.5 + random() * 2.5, speed: 0.1 },
        phase: random() * 10, scale: 0.9 + random() * 0.2,
      });
    }
  }
  const herd = createHerd(THREE, { animals, quality, groundAt, name: 'capernaum-animals' });
  group.add(herd.group);

  // The fold's wall: rounded basalt stones two courses high, a brushwood gate.
  const stones = [];
  const edge = (x0, z0, x1, z1) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 0; s <= length; s += 0.55) {
      const t = s / length;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      stones.push({ x: x + (random() - 0.5) * 0.12, y: 0.24, z: z + (random() - 0.5) * 0.12, s: 0.3 + random() * 0.1 });
      if (random() < 0.85) stones.push({ x, y: 0.62, z, s: 0.24 + random() * 0.08 });
    }
  };
  edge(FOLD.x0, FOLD.z0, FOLD.x0, FOLD.z1);
  edge(FOLD.x0, FOLD.z1, FOLD.x1, FOLD.z1);
  edge(FOLD.x1, FOLD.z1, FOLD.x1, FOLD.z0);
  // The south side has the gate in its middle.
  edge(FOLD.x1, FOLD.z0, (FOLD.x0 + FOLD.x1) / 2 + 0.9, FOLD.z0);
  edge((FOLD.x0 + FOLD.x1) / 2 - 0.9, FOLD.z0, FOLD.x0, FOLD.z0);
  const stoneGeometry = new THREE.IcosahedronGeometry(1, 0);
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x2f2b28, roughness: 0.92, flatShading: true });
  disposables.push(stoneGeometry, stoneMaterial);
  const wall = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, stones.length);
  wall.name = 'fold-wall';
  const dummy = new THREE.Object3D();
  stones.forEach((stone, i) => {
    dummy.position.set(stone.x, groundAt(stone.x, stone.z) + stone.y * (stone.s / 0.3), stone.z);
    dummy.rotation.set(random(), random() * 6, random());
    dummy.scale.set(stone.s * 1.2, stone.s, stone.s);
    dummy.updateMatrix();
    wall.setMatrixAt(i, dummy.matrix);
  });
  wall.castShadow = !low;
  wall.receiveShadow = !low;
  group.add(wall);
  // The gate: a hurdle of brushwood across the gap, and the donkeys' post.
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b5334, roughness: 0.95 });
  const hurdleGeometry = new THREE.BoxGeometry(1.9, 0.9, 0.12);
  const postGeometry = new THREE.CylinderGeometry(0.07, 0.09, 1.3, 6);
  disposables.push(wood, hurdleGeometry, postGeometry);
  const gate = new THREE.Mesh(hurdleGeometry, wood);
  gate.position.set((FOLD.x0 + FOLD.x1) / 2, 0.45 + groundAt((FOLD.x0 + FOLD.x1) / 2, FOLD.z0), FOLD.z0);
  gate.name = 'fold-gate';
  const post = new THREE.Mesh(postGeometry, wood);
  post.position.set(dx + 1.1, 0.65 + groundAt(dx + 1.1, dz), dz);
  post.name = 'tether-post';
  for (const mesh of [gate, post]) {
    mesh.castShadow = !low;
    group.add(mesh);
  }

  // --- birds ---
  const birds = [];
  const gulls = low ? 4 : 9;
  for (let i = 0; i < gulls; i += 1) {
    birds.push({
      kind: 'gull', mode: 'soar', cx: -30 + random() * 90, cz: -55 - random() * 45,
      r: 16 + random() * 30, y: 10 + random() * 14, speed: 7 + random() * 3, phase: random() * 10,
    });
  }
  for (let i = 0; i < (low ? 4 : 10); i += 1) {
    birds.push({
      kind: 'swallow', mode: 'dart', cx: random() * 30, cz: 8 + random() * 34,
      r: 8 + random() * 8, y: 4.6 + random() * 2.4, speed: 9 + random() * 3, phase: random() * 10,
    });
  }
  // Doves along the parapets of the block roofs (their tops are the roof
  // height plus the parapet, 0.55).
  const north = BLOCKS.find((b) => b.id === 'insula-north');
  const east = BLOCKS.find((b) => b.id === 'insula-east');
  const perchOn = (block, x) => ({ x, z: block.z0 + 0.21, y: block.height + 0.55 });
  if (north && east) {
    [perchOn(north, 9.5), perchOn(north, 11.2), perchOn(north, 20.4), perchOn(east, 44), perchOn(east, 46.6), perchOn(east, 52)]
      .slice(0, low ? 3 : 6)
      .forEach((perch, i) => birds.push({ kind: 'dove', mode: 'perch', ...perch, facing: Math.PI + (random() - 0.5), phase: i * 3.1 }));
  }
  // Hens and a rooster scratching about the insula courtyard.
  const { x: px, z: pz } = LIFE_ANCHORS.poultry;
  for (let i = 0; i < (low ? 3 : 6); i += 1) {
    birds.push({
      kind: i === 0 ? 'rooster' : 'hen', mode: 'peck',
      x: px + (random() - 0.5) * 3, z: pz + (random() - 0.5) * 2, y: LEVEL.ground, r: 0.5 + random() * 0.6, phase: random() * 10,
    });
  }
  // Sparrows in the quiet corners of the lanes.
  if (!low) {
    [[8.6, 30], [-3.3, 23.6], [34.6, 26], [38.6, 22], [-26.8, 20], [-0.2, 36.8]].forEach(([x, z], i) => {
      birds.push({ kind: 'sparrow', mode: 'peck', x, z, y: LEVEL.ground, r: 0.4, phase: i * 1.9 });
    });
  }
  const flock = createBirds(THREE, { birds, quality, name: 'capernaum-birds' });
  group.add(flock.group);

  // --- people ---
  const people = VILLAGE_PEOPLE
    .filter((person) => !low || !person.id.startsWith('play-') || person.id === 'play-a')
    .map((person, i) => ({
      ...person,
      colour: person.colour ?? ROBE_PALETTE[(i * 3) % ROBE_PALETTE.length],
      phase: person.route ? person.phase : i * 1.3,
    }));
  const crowd = createCrowd(THREE, {
    figures: people,
    quality,
    name: 'capernaum-people',
    groundAt: (x, z) => groundAt(x, z),
  });
  group.add(crowd.group);

  return {
    group,
    herd,
    flock,
    crowd,
    animals,
    birds,
    people,
    groundAt,
    update(elapsed) {
      if (reducedMotion) return;
      herd.update(elapsed);
      flock.update(elapsed);
      crowd.update(elapsed);
    },
    dispose() {
      herd.dispose();
      flock.dispose();
      crowd.dispose();
      disposables.forEach((thing) => thing.dispose());
      group.removeFromParent();
    },
  };
}
