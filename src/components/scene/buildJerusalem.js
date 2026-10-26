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
import { terrainHeight, surfaceHeight, templePlatformLevel, TOPOGRAPHY, TERRAIN_GRID } from './jerusalemTopography';
import { floorAt, blockerAt } from './jerusalemNavigation';
import { buildJerusalemArchitecture } from './jerusalemArchitecture';
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
  [135, 28, 15], [24, -13, 12], [50, -7, 11], [62, -12, 8], [-50, 25, 9],
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
    terrain: standard({ color: 0xb8a37c, roughness: 1, vertexColors: true }),
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
    mist: { level: -1, heights: [-1, 0, 1], heightsLow: [0], centre: [150, 18], size: [70, 310], reach: [150, 18, 42] },
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
  const terrain = ownG(new THREE.PlaneGeometry(TERRAIN_GRID.width, TERRAIN_GRID.depth,
    TERRAIN_GRID.width / TERRAIN_GRID.step, TERRAIN_GRID.depth / TERRAIN_GRID.step));
  terrain.rotateX(-Math.PI / 2);
  const positions = terrain.attributes.position;
  const colours = new Float32Array(positions.count * 3);
  const colour = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i) + 8;
    const z = positions.getZ(i) + 15;
    const y = terrainHeight(x, z);
    positions.setXYZ(i, x, y, z);
    const valley = Math.max(0, 1 - Math.abs(x - TOPOGRAPHY.kidronX) / 38);
    const ridge = Math.max(0, Math.min(1, (y + 5) / 20));
    colour.setRGB(0.55 + ridge * 0.13 - valley * 0.045, 0.47 + ridge * 0.11, 0.34 + ridge * 0.08);
    colour.toArray(colours, i * 3);
  }
  terrain.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  terrain.computeVertexNormals();
  const ground = add(terrain, M.terrain, [0, 0, 0], { name: 'jerusalem-topography', cast: false });
  ground.userData.topography = 'compressed-historical';

  function roadRibbon(name, controlPoints, halfWidth, material = M.paving, lift = 0.055) {
    // Subdivide long spans before triangulating. Sparse control points made
    // the former approach road a set of giant planar ramps through the valley.
    const points = [controlPoints[0]];
    for (let i = 1; i < controlPoints.length; i += 1) {
      const [ax, az] = controlPoints[i - 1];
      const [bx, bz] = controlPoints[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.75));
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        points.push([ax + (bx - ax) * t, az + (bz - az) * t]);
      }
    }
    const vertices = [];
    const indices = [];
    const across = Math.ceil(halfWidth * 2 / 0.75);
    points.forEach(([x, z], i) => {
      const previous = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const dx = next[0] - previous[0], dz = next[1] - previous[1];
      const length = Math.hypot(dx, dz) || 1;
      const nx = -dz / length, nz = dx / length;
      for (let column = 0; column <= across; column += 1) {
        const side = column / across * 2 - 1;
        const px = x + nx * halfWidth * side, pz = z + nz * halfWidth * side;
        vertices.push(px, terrainHeight(px, pz) + lift, pz);
      }
      if (i) for (let column = 0; column < across; column += 1) {
        const a = (i - 1) * (across + 1) + column, b = i * (across + 1) + column;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return add(geometry, material, [0, 0, 0], { name, cast: false });
  }
  const easternApproach = [[224, 46], [202, 41], [180, 34], [160, 29], [146, 27], [132, 28], [118, 28], [108, 28], [96, 25], [82, 22], [66, 24], [49, 24]];
  roadRibbon('eastern-pilgrim-road', easternApproach, 3.1, M.paving, 0.025);
  roadRibbon('tyropoeon-stepped-street', [[-32, 145], [-32, 112], [-32, 100], [-16, 100], [-16, 80], [-14, 48], [-15, 18], [-12, -18], [-12, -94], [-32, -98]], 2.1, M.paving, 0.025);
  roadRibbon('upper-city-road', [[-90, 57], [-84, 72], [-84, 40], [-60, 40], [-38, 40], [-38, -8], [-54, -56], [-34, -58]], 1.8, M.paving, 0.025);
  roadRibbon('western-gate-road', [[-90, 28], [-104, 28], [-120, 28], [-132, 0], [-140, -28], [-158, -32]], 2.2, M.soil, 0.025);
  roadRibbon('kidron-path', [[168, 120], [153, 73], [143, 24], [145, -20], [158, -72]], 2.3, M.soil, 0.04);
  roadRibbon('kidron-channel', [[144, 165], [143, 110], [143, 55], [144, 0], [147, -70], [150, -135]], 0.45, M.soil, 0.015);

  const architecture = buildJerusalemArchitecture(THREE, { add, M });

  // Keep the finer domestic detail without hundreds of separate draw calls.
  // Structural meshes remain individual for camera collision and sightlines.
  const detailNames = new Set(['wall-coping', 'tower-cornice', 'tower-merlon', 'gate-arrow-slit',
    'house-roof', 'roof-parapet', 'shadowed-door', 'door-lintel', 'lattice-window', 'window-bar']);
  const details = new Map();
  for (const mesh of root.children) {
    if (!detailNames.has(mesh.name)) continue;
    const key = `${mesh.name}:${mesh.material.uuid}`;
    if (!details.has(key)) details.set(key, []);
    details.get(key).push(mesh);
  }
  const detailBox = ownG(new THREE.BoxGeometry(1, 1, 1));
  for (const meshes of details.values()) {
    const batch = new THREE.InstancedMesh(detailBox, meshes[0].material, meshes.length);
    batch.name = meshes[0].name;
    batch.castShadow = !low; batch.receiveShadow = true;
    meshes.forEach((mesh, i) => {
      const { width, height, depth } = mesh.geometry.parameters;
      mesh.scale.set(width, height, depth); mesh.updateMatrix();
      batch.setMatrixAt(i, mesh.matrix);
      root.remove(mesh);
    });
    root.add(batch);
  }

  const treeSites = [];
  const groves = [[183, -25, 34, 24], [-171, -78, 31, 22], [196, 55, 30, 26], [72, 125, 34, 16]];
  for (const [cx, cz, rx, rz] of groves) {
    for (let i = 0; i < (low ? 9 : 20); i += 1) {
      const a = random() * Math.PI * 2, r = Math.sqrt(random());
      const x = cx + Math.cos(a) * rx * r, z = cz + Math.sin(a) * rz * r;
      if (inEventArea(x, z) || blockerAt(x, z)) continue;
      treeSites.push({ x, z, y: terrainHeight(x, z), scale: 0.75 + random() * 0.55, yaw: random() * Math.PI * 2 });
    }
  }
  const trunkGeometry = ownG(new THREE.CylinderGeometry(0.17, 0.32, 2.6, low ? 7 : 10));
  const crownGeometry = ownG(new THREE.SphereGeometry(1.4, low ? 8 : 12, 7));
  const trunks = new THREE.InstancedMesh(trunkGeometry, M.timber, treeSites.length);
  const crowns = new THREE.InstancedMesh(crownGeometry, M.leaf, treeSites.length * 3);
  const dummy = new THREE.Object3D();
  treeSites.forEach((site, i) => {
    dummy.position.set(site.x, site.y + 1.3 * site.scale, site.z); dummy.rotation.set(0.07, site.yaw, 0.09); dummy.scale.set(site.scale, site.scale, site.scale); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    for (let part = 0; part < 3; part += 1) {
      const angle = site.yaw + part * Math.PI * 2 / 3;
      dummy.position.set(site.x + Math.cos(angle) * 0.75 * site.scale, site.y + (2.8 + part * 0.16) * site.scale, site.z + Math.sin(angle) * 0.75 * site.scale);
      dummy.rotation.set(0, angle, 0); dummy.scale.set(1.05 * site.scale, 0.65 * site.scale, site.scale); dummy.updateMatrix(); crowns.setMatrixAt(i * 3 + part, dummy.matrix);
    }
  });
  for (const value of [trunks, crowns]) { value.castShadow = !low; value.receiveShadow = true; root.add(value); }

  // Broken limestone and scrub soften the generated surface at eye level and
  // give the Kidron/Mount approach the irregular, cultivated character that a
  // perfectly smooth heightfield cannot provide on its own.
  const vergeCount = low ? 26 : high ? 82 : 54;
  const vergeRockGeometry = ownG(new THREE.DodecahedronGeometry(0.5, low ? 0 : 1));
  const vergeShrubGeometry = ownG(new THREE.DodecahedronGeometry(0.5, low ? 0 : 1));
  const vergeRocks = new THREE.InstancedMesh(vergeRockGeometry, M.rock, vergeCount);
  const vergeShrubs = new THREE.InstancedMesh(vergeShrubGeometry, M.leaf, vergeCount);
  vergeRocks.name = 'kidron-verge-rocks';
  vergeShrubs.name = 'kidron-verge-scrub';
  for (let i = 0; i < vergeCount; i += 1) {
    const x = 116 + random() * 108;
    const roadZ = x < 158 ? 27.5 + (x - 132) * 0.035 : 28.4 + (x - 158) * 0.22;
    const side = i % 2 ? -1 : 1;
    const z = roadZ + side * (8 + random() * 18);
    const rockScale = 0.24 + random() * 0.75;
    dummy.position.set(x, terrainHeight(x, z) + rockScale * 0.25, z);
    dummy.rotation.set(random() * 0.35, random() * Math.PI, random() * 0.22);
    dummy.scale.set(rockScale * 1.35, rockScale * 0.58, rockScale);
    dummy.updateMatrix();
    vergeRocks.setMatrixAt(i, dummy.matrix);
    const shrubScale = 0.38 + random() * 0.8;
    const shrubX = x + (random() - 0.5) * 2.4, shrubZ = z + (random() - 0.5) * 2.4;
    dummy.position.set(shrubX, terrainHeight(shrubX, shrubZ) + 0.2 * shrubScale, shrubZ);
    dummy.rotation.set(0, random() * Math.PI, 0);
    dummy.scale.set(shrubScale * 1.25, shrubScale * 0.62, shrubScale);
    dummy.updateMatrix();
    vergeShrubs.setMatrixAt(i, dummy.matrix);
  }
  for (const value of [vergeRocks, vergeShrubs]) {
    value.castShadow = !low;
    value.receiveShadow = true;
    root.add(value);
  }

  for (const [x, z, length] of [[181, -48, 24], [188, 2, 30], [196, 54, 27], [207, 92, 22]]) {
    for (let offset = -length / 2; offset < length / 2; offset += 2) {
      const a = terrainHeight(x, z + offset), b = terrainHeight(x, z + offset + 2);
      const bottom = Math.min(a, b) - 0.2, top = Math.max(a, b) + 0.65;
      add(new THREE.BoxGeometry(0.55, top - bottom, 2), M.limestone, [x, (top + bottom) / 2, z + offset + 1], { name: 'olive-terrace-wall' });
    }
  }

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
      clearAt: (px, pz) => !inEventArea(px, pz) && !blockerAt(px, pz),
    });
    gathered.forEach((person, i) => figures.push({
      ...person, y: surfaceHeight(person.x, person.z), id: `jerusalem-group-${groupIndex}-${i}`,
      activity: i % 4 === 0 ? 'talking' : i % 5 === 0 ? 'praying' : 'attending',
      motion: i % 4 === 0 ? 'talk-chat' : i % 5 === 0 ? 'pray-sway' : 'look-around',
      phase: random() * 6,
    }));
  });
  const walkingRoutes = [
    [[103, 26], [68, 26]], [[-16, 100], [-16, 55]], [[-85, 70], [-65, 70]], [[-53, -14], [-53, -50]],
  ];
  walkingRoutes.forEach((route, routeIndex) => {
    for (let i = 0; i < (low ? 1 : 3); i += 1) {
      const [x, z] = route[0];
      figures.push({ id: `jerusalem-walker-${routeIndex}-${i}`, x: x + i * 0.8, y: terrainHeight(x, z), z: z + i * 0.6,
        facing: 0, activity: 'walking', motion: i % 3 === 0 ? 'walk-carry' : 'walk-neutral', route, speed: 0.65 + i * 0.12, phase: i * 1.3 });
    }
  });

  // Passover brought dense streams of pilgrims to the eastern approach. Keep
  // a large, instanced outer crowd on both verges so the entry tableau reads
  // as a city receiving a procession rather than twelve isolated spectators.
  const entryPilgrimCount = low ? 24 : high ? 48 : 36;
  for (let i = 0; i < entryPilgrimCount; i += 1) {
    const row = Math.floor(i / 2);
    const side = i % 2 ? -1 : 1;
    const x = 120 + row * (49 / Math.max(1, Math.ceil(entryPilgrimCount / 2) - 1)) + (random() - 0.5) * 1.4;
    const roadZ = x < 158 ? 27.5 + (x - 132) * 0.035 : 28.4 + (x - 158) * 0.22;
    const verge = 5.2 + (row % 4) * 0.72 + random() * 0.45;
    const z = roadZ + side * verge;
    figures.push({
      id: `eastern-pilgrim-${i}`, x, y: terrainHeight(x, z), z,
      facing: Math.atan2(135 - x, 28 - z), phase: random() * 6,
      activity: i % 5 === 0 ? 'praying' : i % 3 === 0 ? 'talking' : 'attending',
      motion: i % 4 === 0 ? 'wave-emotional' : i % 5 === 0 ? 'thankful' : 'look-around',
    });
  }
  const crowd = createCrowd(THREE, { figures, quality, name: 'jerusalem-crowd', groundAt: surfaceHeight });
  root.add(crowd.group);
  const humans = createSceneHumans({
    sceneSlug: 'jerusalem', THREE, root, groundAt: surfaceHeight,
    floorAt: (x, z) => floorAt(x, z)?.height ?? terrainHeight(x, z), crowdFigures: figures,
    qualityProfile: quality, reducedMotion, motionLibrary,
    actorLimits: { low: 4, balanced: 11, high: 18 }, actorRange: { low: 12, balanced: 22, high: 30 },
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
      { kind: 'rooster', mode: 'perch', x: -72, z: 60, y: terrainHeight(-72, 60), facing: 1.2, phase: 2 },
    ],
  });
  root.add(birds.group);

  const propItems = [];
  const propCentres = [[-4, 45], [84, 43], [-73, 45], [-38, -48], [40, 74]];
  propCentres.forEach(([cx, cz], groupIndex) => {
    const kinds = ['jar', 'waterJar', 'basket', 'sack', 'crate', 'ropeCoil'];
    for (let i = 0; i < (low ? 3 : 7); i += 1) {
      const x = cx + (random() - 0.5) * 7, z = cz + (random() - 0.5) * 6;
      if (!blockerAt(x, z)) propItems.push({ kind: kinds[(i + groupIndex) % kinds.length], x, z, y: surfaceHeight(x, z), rotation: random() * Math.PI * 2, scale: 0.85 + random() * 0.25 });
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
    setEpisode: (id) => {
      architecture.rolled.position.x = id === 'burial' ? -171 : -168.7;
      return episodes.setEpisode(id);
    },
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
