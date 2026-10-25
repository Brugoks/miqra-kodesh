// Jerusalem during the final week, c. AD 30.
//
// This is an interpretive, compressed reconstruction built around the durable
// topographic relationships: eastern and western ridges, the Tyropoeon between
// them, the Kidron east of the Temple, the Mount of Olives beyond it, and the
// City of David falling south. Disputed event sites remain representative.

import { applyLighting, resolveTimeOfDay } from './sceneLighting';
import { createSceneAir, makeFogFor } from './sceneAir';
import { createCrowd, gather } from './sceneFigures';
import { createSceneHumans } from './sceneHumans';
import { createEpisodes } from './sceneEpisodes';
import { createProps } from './sceneProps';
import { createHerd, createBirds } from './sceneAnimals';
import { loadMotionLibrary } from './sceneMixamo';
import { applyScannedSurfaces } from './sceneSurfaces';
import { makeRandom } from './sceneLandscape';
import { BUILDINGS, SPECIAL_BUILDINGS, WALL_RECTS } from './jerusalemDimensions';
import { terrainHeight, templePlatformLevel, TOPOGRAPHY, UPPER_ROOM_LEVEL } from './jerusalemTopography';
import { floorAt } from './jerusalemNavigation';
import { JERUSALEM_EVENT_STAGES } from './jerusalemEvents';

export const WEATHER = {
  dawn: { cover: 0.24, fog: 0.00105, mist: 0.7, smoke: 0.65 },
  morning: { cover: 0.28, fog: 0.00078, mist: 0.18, smoke: 0.6 },
  noon: { cover: 0.34, fog: 0.0007, mist: 0, smoke: 0.5 },
  dusk: { cover: 0.32, fog: 0.0009, mist: 0.08, smoke: 0.9 },
  night: { cover: 0.12, fog: 0.00082, mist: 0.28, smoke: 0.55 },
};
export const fogFor = makeFogFor(WEATHER);

const EVENT_AREAS = [
  [126, 28, 15], [24, -13, 12], [50, -7, 11], [62, -12, 8], [-50, 25, 9],
  [174, -23, 12], [-70, 56, 10], [-33, -74, 12], [-132, -28, 12],
  [-166, -39, 13], [-170, -78, 11],
];
const inEventArea = (x, z) => EVENT_AREAS.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r);

export default function buildJerusalem(THREE, options = {}) {
  const { quality = 'high', timeOfDay, reducedMotion = false, maxAnisotropy = 1 } = options;
  const low = quality === 'low';
  const high = quality === 'high';
  const random = makeRandom(7030);
  const motionLibrary = 'motionLibrary' in options
    ? options.motionLibrary
    : loadMotionLibrary().catch(() => null);
  const root = new THREE.Group();
  root.name = 'jerusalem';

  const geometries = new Set();
  const materials = new Set();
  const ownG = (value) => { geometries.add(value); return value; };
  const ownM = (value) => { materials.add(value); return value; };
  const standard = (parameters) => ownM(new THREE.MeshStandardMaterial(parameters));
  const M = {
    terrain: standard({ color: 0xb09b72, roughness: 1, vertexColors: true }),
    limestone: standard({ color: 0xc9ba98, roughness: 0.94 }),
    pale: standard({ color: 0xe0d3b3, roughness: 0.9 }),
    plaster: standard({ color: 0xd2bd98, roughness: 0.98 }),
    paving: standard({ color: 0xa69778, roughness: 1 }),
    roof: standard({ color: 0x877052, roughness: 1 }),
    timber: standard({ color: 0x5b4029, roughness: 0.94 }),
    rock: standard({ color: 0x8d8069, roughness: 1, flatShading: true }),
    soil: standard({ color: 0x806b49, roughness: 1 }),
    leaf: standard({ color: 0x56643d, roughness: 1, flatShading: true }),
    gold: standard({ color: 0xb8933f, roughness: 0.35, metalness: 0.4 }),
    dark: standard({ color: 0x1e1b17, roughness: 1 }),
    water: ownM(new THREE.MeshPhysicalMaterial({ color: 0x334c4b, roughness: 0.3, transparent: true, opacity: 0.55 })),
  };

  const lighting = applyLighting(THREE, root, { slug: 'jerusalem', timeOfDay, skyRadius: 1100, low });
  const { sun } = lighting;
  lighting.sky.userData.excludeFromAO = true;
  if (!low) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 420;
    sun.shadow.normalBias = 0.08;
  }

  const air = createSceneAir(THREE, {
    quality, lighting, name: 'jerusalem-air', weather: WEATHER,
    wind: { x: 0.7, z: -0.22 }, land: { x: -1, z: 0.25 },
    smokeSources: [
      { x: 58, y: templePlatformLevel() + 13, z: -43, strength: 1.6, scale: 2.6 },
      { x: -70, y: terrainHeight(-70, 56) + 0.4, z: 56, strength: 0.35 },
      { x: -16, y: terrainHeight(-16, 53) + 4, z: 53, strength: 0.28 },
      { x: -82, y: terrainHeight(-82, -25) + 5, z: -25, strength: 0.25 },
    ],
    mist: { level: -8, heights: [-8, -6, -4], heightsLow: [-6], centre: [132, 18], size: [70, 310], reach: [132, 18, 42] },
    motes: { centre: [48, 8, -18], spread: [105, 18, 110] },
  });
  root.add(air.group);

  const cameraColliders = [];
  const occluders = [];
  const add = (geometry, material, position, {
    name = '', yaw = 0, cast = true, collide = false, parent = root,
  } = {}) => {
    const mesh = new THREE.Mesh(ownG(geometry), material);
    mesh.position.set(...position);
    mesh.rotation.y = yaw;
    mesh.name = name;
    mesh.castShadow = cast && !low;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (collide) { cameraColliders.push(mesh); occluders.push(mesh); }
    return mesh;
  };

  // Continuous terrain shared with walking/navigation.
  const terrain = ownG(new THREE.PlaneGeometry(480, 350, low ? 46 : 88, low ? 34 : 64));
  terrain.rotateX(-Math.PI / 2);
  const positions = terrain.attributes.position;
  const colours = new Float32Array(positions.count * 3);
  const colour = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i) + 8;
    const z = positions.getZ(i) + 15;
    const y = terrainHeight(x, z) + (random() - 0.5) * (low ? 0.08 : 0.16);
    positions.setXYZ(i, x, y, z);
    const valley = Math.max(0, 1 - Math.abs(x - TOPOGRAPHY.kidronX) / 38);
    const ridge = Math.max(0, Math.min(1, (y + 5) / 20));
    colour.setRGB(0.49 + ridge * 0.16 - valley * 0.08, 0.41 + ridge * 0.13, 0.29 + ridge * 0.1);
    colour.toArray(colours, i * 3);
  }
  terrain.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  terrain.computeVertexNormals();
  const ground = add(terrain, M.terrain, [0, 0, 0], { name: 'jerusalem-topography', cast: false });
  ground.userData.topography = 'compressed-historical';

  function roadRibbon(name, points, halfWidth, material = M.paving, lift = 0.055) {
    const vertices = [];
    const indices = [];
    points.forEach(([x, z], i) => {
      const previous = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const dx = next[0] - previous[0], dz = next[1] - previous[1];
      const length = Math.hypot(dx, dz) || 1;
      const nx = -dz / length, nz = dx / length;
      for (const side of [-1, 1]) {
        const px = x + nx * halfWidth * side, pz = z + nz * halfWidth * side;
        vertices.push(px, terrainHeight(px, pz) + lift, pz);
      }
      if (i) indices.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2, i * 2 - 1, i * 2 + 1);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return add(geometry, material, [0, 0, 0], { name, cast: false });
  }
  roadRibbon('eastern-pilgrim-road', [[224, 31], [186, 27], [151, 24], [128, 27], [111, 30], [83, 28], [45, 25], [4, 28], [-46, 27], [-106, 26], [-170, -38]], 3.5);
  roadRibbon('tyropoeon-stepped-street', [[-8, 145], [-10, 112], [-12, 80], [-14, 48], [-16, 18], [-12, -18], [-4, -54], [14, -94]], 3.1);
  roadRibbon('upper-city-road', [[-103, 70], [-76, 57], [-54, 25], [-42, -8], [-34, -74]], 2.7);
  roadRibbon('kidron-path', [[168, 120], [153, 73], [143, 24], [145, -20], [158, -72]], 2.3, M.soil, 0.04);
  roadRibbon('kidron-channel', [[135, 165], [132, 110], [131, 55], [132, 0], [135, -70], [139, -135]], 0.75, M.water, 0.08);

  function wallSegment(x0, x1, z0, z1, name = 'city-wall') {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const h = 8.5;
    const base = terrainHeight(cx, cz);
    const wall = add(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), M.limestone, [cx, base + h / 2, cz], { name, collide: true });
    for (let y = 1.4; y < h; y += 1.4) {
      add(new THREE.BoxGeometry(Math.max(0.3, x1 - x0 + 0.15), 0.08, Math.max(0.3, z1 - z0 + 0.15)), M.pale, [cx, base + y, cz], { name: 'wall-course', cast: false });
    }
    return wall;
  }
  WALL_RECTS.forEach(([x0, x1, z0, z1]) => wallSegment(x0, x1, z0, z1));
  for (const [x, z] of [[-112, -104], [112, -104], [-112, 104], [112, 104], [112, 28], [-112, 28]]) {
    const base = terrainHeight(x, z);
    add(new THREE.BoxGeometry(9, 12, 9), M.limestone, [x, base + 6, z], { name: 'wall-tower', collide: true });
    add(new THREE.BoxGeometry(10, 0.8, 10), M.pale, [x, base + 12.2, z], { name: 'tower-cornice' });
  }

  function house([x0, x1, z0, z1], index, id = 'jerusalem-house') {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const h = 5.2 + (index % 4) * 0.85;
    const groundHeights = [[x0, z0], [x0, z1], [x1, z0], [x1, z1], [cx, cz]]
      .map(([x, z]) => terrainHeight(x, z));
    const foundation = Math.min(...groundHeights) - 0.65;
    const roofY = Math.max(...groundHeights) + h;
    const bodyHeight = roofY - foundation;
    const body = add(new THREE.BoxGeometry(x1 - x0, bodyHeight, z1 - z0), index % 3 ? M.plaster : M.limestone,
      [cx, foundation + bodyHeight / 2, cz], { name: id, collide: true });
    add(new THREE.BoxGeometry(x1 - x0 + 0.55, 0.35, z1 - z0 + 0.55), M.roof,
      [cx, roofY + 0.17, cz], { name: 'roof-parapet' });
    const doorZ = z1 + 0.015;
    const doorX = cx - (index % 2 ? 2.2 : -2.1);
    const doorGround = terrainHeight(doorX, doorZ);
    add(new THREE.BoxGeometry(1.2, 2.1, 0.08), M.dark, [doorX, doorGround + 1.05, doorZ], { name: 'shadowed-door', cast: false });
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(0.62, 0.8, 0.07), M.dark, [cx + side * Math.min(3.5, (x1 - x0) * 0.28), roofY - h * 0.38, doorZ], { name: 'lattice-window', cast: false });
    }
    return body;
  }
  BUILDINGS.forEach((value, index) => house(value, index));

  for (const [x0, x1, z0, z1, id] of SPECIAL_BUILDINGS.filter((entry) => entry[4] !== 'temple-platform')) {
    const building = house([x0, x1, z0, z1], id === 'praetorium' ? 3 : 2, id);
    const base = terrainHeight((x0 + x1) / 2, (z0 + z1) / 2);
    if (id === 'upper-room') {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      add(new THREE.BoxGeometry(x1 - x0 - 2, 0.35, z1 - z0 - 2), M.pale, [cx, UPPER_ROOM_LEVEL - 0.17, cz], { name: 'upper-room-floor' });
      for (const x of [x0 + 1, x1 - 1]) for (const z of [z0 + 1, z1 - 1]) {
        add(new THREE.CylinderGeometry(0.3, 0.36, 3.8, 10), M.pale, [x, UPPER_ROOM_LEVEL + 1.9, z], { name: 'upper-room-column' });
      }
      add(new THREE.BoxGeometry(x1 - x0, 0.45, z1 - z0), M.roof, [cx, UPPER_ROOM_LEVEL + 3.8, cz], { name: 'upper-room-canopy' });
    }
    if (id === 'praetorium') {
      for (let i = 0; i < 5; i += 1) add(new THREE.CylinderGeometry(0.42, 0.5, 5, 10), M.pale, [x0 + 2.5 + i * 4, base + 2.5, z1 + 1.2], { name: 'palace-column' });
    }
    building.userData.reconstruction = true;
  }

  const templeLevel = templePlatformLevel();
  add(new THREE.BoxGeometry(72, 4, 50), M.pale, [55, templeLevel - 2, -38], { name: 'temple-platform', collide: true });
  const sanctuary = add(new THREE.BoxGeometry(24, 27, 22), M.pale, [62, templeLevel + 13.5, -45], { name: 'temple-sanctuary', collide: true });
  sanctuary.userData.landmark = true;
  add(new THREE.BoxGeometry(17, 19, 0.65), M.gold, [62, templeLevel + 13.4, -33.7], { name: 'temple-golden-facade' });
  for (let i = 0; i < 9; i += 1) {
    add(new THREE.CylinderGeometry(0.58, 0.7, 8, 12), M.pale, [23 + i * 8, templeLevel + 4, -13], { name: 'temple-portico-column' });
    add(new THREE.CylinderGeometry(0.58, 0.7, 8, 12), M.pale, [23 + i * 8, templeLevel + 4, -63], { name: 'temple-portico-column' });
  }
  add(new THREE.BoxGeometry(72, 0.7, 4), M.roof, [55, templeLevel + 8.1, -13], { name: 'temple-portico-roof' });
  add(new THREE.BoxGeometry(72, 0.7, 4), M.roof, [55, templeLevel + 8.1, -63], { name: 'temple-portico-roof' });
  for (let i = 0; i < 12; i += 1) {
    const z = -58 + i * 3.6;
    add(new THREE.BoxGeometry(8.5, 0.32, 3.1), M.paving, [16, terrainHeight(16, z) + 0.16 + i * 0.18, z], { name: 'temple-approach-step', cast: false });
  }

  for (let row = 0; row < 5; row += 1) {
    const z = 68 + row * 17;
    for (let column = 0; column < 3; column += 1) {
      const x = 20 + column * 20 + (row % 2) * 5;
      const base = terrainHeight(x, z);
      add(new THREE.BoxGeometry(14, 3.5 + (column % 2), 10), column % 2 ? M.plaster : M.limestone,
        [x, base + 2, z], { name: 'city-of-david-house', collide: true });
      add(new THREE.BoxGeometry(15, 0.25, 11), M.roof, [x, base + 4.1 + (column % 2), z], { name: 'city-of-david-roof' });
    }
  }

  const hillY = terrainHeight(-166, -39);
  const hill = add(new THREE.CylinderGeometry(25, 33, 5.5, low ? 9 : 16), M.rock, [-166, hillY + 1.8, -39], { name: 'golgotha-hill' });
  hill.scale.z = 0.68;
  const tombY = terrainHeight(-177, -82);
  add(new THREE.DodecahedronGeometry(11, low ? 0 : 1), M.rock, [-177, tombY + 3.5, -82], { name: 'garden-tomb-rock', collide: true });
  add(new THREE.BoxGeometry(5, 4.4, 0.4), M.dark, [-170, terrainHeight(-170, -76) + 2.2, -75.8], { name: 'tomb-opening', cast: false });
  const rolled = add(new THREE.CylinderGeometry(2.25, 2.25, 0.7, 20), M.rock, [-164.8, terrainHeight(-164.8, -75) + 2.25, -75], { name: 'rolled-stone' });
  rolled.rotation.x = Math.PI / 2;

  const treeSites = [];
  const groves = [[183, -25, 34, 24], [-171, -78, 31, 22], [196, 55, 30, 26], [72, 125, 34, 16]];
  for (const [cx, cz, rx, rz] of groves) {
    for (let i = 0; i < (low ? 9 : 20); i += 1) {
      const a = random() * Math.PI * 2, r = Math.sqrt(random());
      const x = cx + Math.cos(a) * rx * r, z = cz + Math.sin(a) * rz * r;
      if (inEventArea(x, z) && Math.hypot(x - 174, z + 23) > 8) continue;
      treeSites.push({ x, z, y: terrainHeight(x, z), scale: 0.75 + random() * 0.55, yaw: random() * Math.PI * 2 });
    }
  }
  const trunkGeometry = ownG(new THREE.CylinderGeometry(0.42, 0.7, 4.6, low ? 6 : 9));
  const crownGeometry = ownG(new THREE.DodecahedronGeometry(2.6, low ? 0 : 1));
  const trunks = new THREE.InstancedMesh(trunkGeometry, M.timber, treeSites.length);
  const crowns = new THREE.InstancedMesh(crownGeometry, M.leaf, treeSites.length);
  const dummy = new THREE.Object3D();
  treeSites.forEach((site, i) => {
    dummy.position.set(site.x, site.y + 2.3 * site.scale, site.z); dummy.rotation.set(0, site.yaw, 0); dummy.scale.set(site.scale, site.scale, site.scale); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(site.x, site.y + 5.2 * site.scale, site.z); dummy.rotation.set(0, site.yaw, 0); dummy.scale.set(1.35 * site.scale, 0.72 * site.scale, site.scale); dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
  });
  for (const value of [trunks, crowns]) { value.castShadow = !low; value.receiveShadow = true; root.add(value); }

  for (const [x, y, z, sx, sy, sz] of [[-30, -48, -310, 2.2, 0.55, 1], [330, -45, -40, 1.6, 0.48, 1], [-320, -55, 40, 1.8, 0.5, 1]]) {
    const ridge = add(new THREE.SphereGeometry(150, low ? 12 : 22, low ? 8 : 13), M.soil, [x, y, z], { name: 'distant-judean-ridge', cast: false });
    ridge.scale.set(sx, sy, sz);
    ridge.userData.excludeFromAO = true;
  }

  const figures = [];
  const groups = [[88, 42, 8], [8, 35, 9], [-48, 46, 7], [-23, -46, 8], [72, -5, 9]];
  groups.forEach(([x, z, count], groupIndex) => {
    const gathered = gather(random, [x, z], low ? Math.ceil(count * 0.55) : count, {
      radius: 4.2, spread: 0.8, minSeparation: 0.65,
      clearAt: (px, pz) => !inEventArea(px, pz),
    });
    gathered.forEach((person, i) => figures.push({
      ...person, y: terrainHeight(person.x, person.z), id: `jerusalem-group-${groupIndex}-${i}`,
      activity: i % 4 === 0 ? 'talking' : i % 5 === 0 ? 'praying' : 'attending',
      motion: i % 4 === 0 ? 'talk-chat' : i % 5 === 0 ? 'pray-sway' : 'look-around',
      phase: random() * 6,
    }));
  });
  const walkingRoutes = [
    [[103, 29], [48, 28]], [[-4, 104], [-13, 24]], [[-88, 66], [-48, 25]], [[-97, -24], [-39, -67]],
  ];
  walkingRoutes.forEach((route, routeIndex) => {
    for (let i = 0; i < (low ? 1 : 3); i += 1) {
      const [x, z] = route[0];
      figures.push({ id: `jerusalem-walker-${routeIndex}-${i}`, x: x + i * 0.8, y: terrainHeight(x, z), z: z + i * 0.6,
        facing: 0, activity: 'walking', motion: i % 3 === 0 ? 'walk-carry' : 'walk-neutral', route, speed: 0.65 + i * 0.12, phase: i * 1.3 });
    }
  });
  const crowd = createCrowd(THREE, { figures, quality, name: 'jerusalem-crowd', groundAt: terrainHeight });
  root.add(crowd.group);
  const humans = createSceneHumans({
    sceneSlug: 'jerusalem', THREE, root, groundAt: terrainHeight,
    floorAt: (x, z) => floorAt(x, z)?.height ?? terrainHeight(x, z), crowdFigures: figures,
    qualityProfile: quality, reducedMotion, motionLibrary,
    actorLimits: { low: 3, balanced: 7, high: 11 }, actorRange: { low: 10, balanced: 15, high: 20 },
    onFallbackSuppressed: (id, suppressed) => crowd.suppress(id, suppressed),
  });

  const episodes = createEpisodes(Object.fromEntries(Object.entries(JERUSALEM_EVENT_STAGES)
    .map(([id, stage]) => [id, stage.create(THREE, { root, active: false, motionLibrary })])));
  const updateHumans = humans.update;
  const acceptHumanAssets = humans.acceptAssets;
  const humanClearance = humans.queryClearance;
  humans.update = (updateOptions) => { updateHumans(updateOptions); episodes.update(updateOptions); };
  humans.acceptAssets = (assets) => { acceptHumanAssets(assets); episodes.acceptAssets(assets); };
  humans.queryClearance = (...args) => {
    const staged = episodes.queryClearance(...args);
    return staged.collides ? staged : humanClearance(...args);
  };

  const herd = createHerd(THREE, {
    quality, groundAt: terrainHeight, name: 'jerusalem-animals',
    animals: [
      { species: 'donkey', pose: 'stand', x: -2, z: 49, facing: 0.3, phase: 0.4 },
      { species: 'donkey', pose: 'stand', x: 89, z: 48, facing: -1.3, phase: 2.2 },
      { species: 'goat', pose: 'graze', wander: { cx: 198, cz: 65, r: 8 }, phase: 1.1 },
      { species: 'sheep', pose: 'graze', wander: { cx: 204, cz: 62, r: 7 }, phase: 3.1 },
    ],
  });
  root.add(herd.group);
  const birds = createBirds(THREE, {
    quality, name: 'jerusalem-birds', birds: [
      { kind: 'dove', mode: 'soar', cx: 55, cz: -35, y: 46, r: 28, phase: 0.4, speed: 7 },
      { kind: 'dove', mode: 'soar', cx: 52, cz: -30, y: 41, r: 22, phase: 2.7, speed: 6 },
      { kind: 'sparrow', mode: 'dart', cx: -30, cz: 35, y: 16, r: 18, phase: 1.3, speed: 7 },
      { kind: 'rooster', mode: 'perch', x: -72, z: 54, y: terrainHeight(-72, 54) + 7.2, facing: 1.2, phase: 2 },
    ],
  });
  root.add(birds.group);

  const propItems = [];
  const propCentres = [[-4, 45], [84, 43], [-73, 45], [-38, -48], [40, 74]];
  propCentres.forEach(([cx, cz], groupIndex) => {
    const kinds = ['jar', 'waterJar', 'basket', 'sack', 'crate', 'ropeCoil'];
    for (let i = 0; i < (low ? 3 : 7); i += 1) {
      const x = cx + (random() - 0.5) * 7, z = cz + (random() - 0.5) * 6;
      propItems.push({ kind: kinds[(i + groupIndex) % kinds.length], x, z, y: terrainHeight(x, z), rotation: random() * Math.PI * 2, scale: 0.85 + random() * 0.25 });
    }
  });
  const props = createProps(THREE, { items: propItems, quality });
  root.add(props.group);

  let hour = resolveTimeOfDay(timeOfDay);
  const applyHour = (time) => { hour = time; air.onTimeOfDay(time); };
  applyHour(lighting.current || hour);

  function update(elapsed, dt, frame) {
    if (frame?.camera) lighting.sky.position.copy(frame.camera.position);
    air.update(elapsed);
    crowd.update(reducedMotion ? 0 : elapsed);
    herd.update(reducedMotion ? 0 : elapsed);
    birds.update(reducedMotion ? 0 : elapsed);
  }

  function dispose() {
    episodes.dispose();
    humans.dispose();
    crowd.dispose();
    props.dispose();
    herd.dispose();
    birds.dispose();
    air.dispose();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    lighting.sky.geometry.dispose();
    lighting.skyMaterial.dispose();
  }

  root.updateMatrixWorld(true);
  return {
    root, sun, lighting, humans, figures,
    update, dispose,
    episodes: episodes.ids,
    setEpisode: episodes.setEpisode,
    getEpisode: episodes.getEpisode,
    getEpisodeStage: episodes.getStage,
    fog: hour.fog,
    exposure: hour.exposure,
    fogFor: (time) => air.fogFor(time),
    onTimeOfDay: applyHour,
    prepareRenderer: (renderer, world) => air.prepareRenderer(renderer, world),
    shadowFollow: low ? null : { extent: 52 },
    cameraColliders,
    occluders,
    terrainHeight,
    applyAssets: (group) => {
      applyScannedSurfaces(THREE, group?.materials, 'jerusalem', [
        [M.terrain, 'earth', { metres: 4, preserveShader: true, strength: 0.8, relief: 0.75, breakTiling: true }],
        [M.limestone, 'ashlar', { metres: 6, strength: 0.86, relief: 0.82, chroma: 0.45 }],
        [M.pale, 'ashlar', { metres: 7, strength: 0.72, relief: 0.7, chroma: 0.32 }],
        [M.plaster, 'ashlar', { metres: 4, strength: 0.45, relief: 0.45, chroma: 0.25 }],
        [M.paving, 'paving', { metres: 3.5, strength: 0.82, relief: 0.7, breakTiling: true }],
        [M.rock, 'earth', { metres: 4, strength: 0.82, relief: 0.9, breakTiling: true }],
        [M.soil, 'earth', { metres: 4, strength: 0.72, relief: 0.75, breakTiling: true }],
        [M.timber, 'timber', { metres: 2, strength: 0.88, relief: 0.75 }],
      ], { anisotropy: Math.min(8, maxAnisotropy) });
      humans.acceptAssets(group);
    },
    applyQuality: (profile) => humans.setQuality(profile),
  };
}
