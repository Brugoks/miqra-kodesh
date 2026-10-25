import { applyLighting, resolveTimeOfDay } from './sceneLighting';
import { applyScannedSurfaces } from './sceneSurfaces';
import { BUILDINGS, SPECIAL_BUILDINGS, WALL_RECTS } from './jerusalemDimensions';

const EVENT_FOCI = {
  'entry-gate': [92, 0, 31], 'temple-cleansing': [24, 0, -13],
  'temple-teaching': [50, 0, -7], 'widows-offering': [62, 0, -12],
  'last-supper': [-50, 4.4, 25], 'caiaphas-courtyard': [-70, 0, 56],
  gethsemane: [139, 0, -23],
  'before-pilate': [-33, 1, -74], 'road-to-golgotha': [-132, 0, -28],
  crucifixion: [-166, 0, -39], burial: [-170, 0, -78], 'empty-tomb': [-170, 0, -78],
};

export default function buildJerusalem(THREE, options = {}) {
  const { quality = 'high', timeOfDay, reducedMotion = false, maxAnisotropy = 1 } = options;
  const low = quality === 'low';
  const root = new THREE.Group();
  root.name = 'jerusalem';
  const geometries = new Set();
  const materials = new Set();
  const ownG = (geometry) => { geometries.add(geometry); return geometry; };
  const ownM = (material) => { materials.add(material); return material; };
  const standard = (parameters) => ownM(new THREE.MeshStandardMaterial(parameters));
  const basic = (parameters) => ownM(new THREE.MeshBasicMaterial(parameters));
  const M = {
    ground: standard({ color: 0xb9a27d, roughness: 1 }),
    road: standard({ color: 0x9f8d70, roughness: 1 }),
    stone: standard({ color: 0xc9b995, roughness: 0.93 }),
    pale: standard({ color: 0xe4d7b9, roughness: 0.86 }),
    plaster: standard({ color: 0xd5c39f, roughness: 0.96 }),
    roof: standard({ color: 0x8b7356, roughness: 1 }),
    timber: standard({ color: 0x5d412b, roughness: 0.92 }),
    gold: standard({ color: 0xc49a3c, roughness: 0.35, metalness: 0.42 }),
    rock: standard({ color: 0x93836b, roughness: 1, flatShading: true }),
    olive: standard({ color: 0x55633a, roughness: 1, flatShading: true }),
    robe: standard({ color: 0xb05b43, roughness: 0.95 }),
    robeBlue: standard({ color: 0x526b78, roughness: 0.95 }),
    robeCream: standard({ color: 0xe7d8b7, roughness: 0.94 }),
    skin: standard({ color: 0x9b6848, roughness: 1 }),
    dark: standard({ color: 0x302921, roughness: 1 }),
    flame: basic({ color: 0xffa13c, transparent: true, opacity: 0.9 }),
  };
  const lighting = applyLighting(THREE, root, { slug: 'jerusalem', timeOfDay, skyRadius: 900, low });
  const { sun } = lighting;

  function mesh(geometry, material, name, position, shadows = true) {
    const value = new THREE.Mesh(ownG(geometry), material);
    value.name = name;
    value.position.set(...position);
    value.castShadow = shadows && !low;
    value.receiveShadow = true;
    root.add(value);
    return value;
  }

  const ground = mesh(new THREE.PlaneGeometry(400, 300), M.ground, 'jerusalem-ground', [-27, -0.05, 0], false);
  ground.rotation.x = -Math.PI / 2;
  const road = mesh(new THREE.PlaneGeometry(285, 12), M.road, 'east-west-road', [-25, 0.01, 28], false);
  road.rotation.x = -Math.PI / 2;
  const northRoad = mesh(new THREE.PlaneGeometry(12, 190), M.road, 'north-south-road', [-30, 0.012, 4], false);
  northRoad.rotation.x = -Math.PI / 2;

  const occluders = [];
  for (const [x0, x1, z0, z1] of WALL_RECTS) {
    const wall = mesh(new THREE.BoxGeometry(x1 - x0, 8, z1 - z0), M.stone, 'city-wall', [(x0 + x1) / 2, 4, (z0 + z1) / 2]);
    occluders.push(wall);
  }
  for (const x of [-112, 112]) for (const z of [-104, 104]) {
    const tower = mesh(new THREE.BoxGeometry(9, 12, 9), M.stone, 'city-wall-tower', [x, 6, z]);
    occluders.push(tower);
  }
  // Gate lintels leave the openings physically and visually readable.
  for (const x of [-112, 112]) {
    const lintel = mesh(new THREE.BoxGeometry(4, 3, 20), M.pale, 'city-gate', [x, 9.5, 28]);
    occluders.push(lintel);
  }

  BUILDINGS.forEach(([x0, x1, z0, z1], index) => {
    const height = 5 + (index % 4) * 0.8;
    const house = mesh(new THREE.BoxGeometry(x1 - x0, height, z1 - z0), index % 3 ? M.plaster : M.stone, 'jerusalem-house', [(x0 + x1) / 2, height / 2, (z0 + z1) / 2]);
    occluders.push(house);
    const parapet = mesh(new THREE.BoxGeometry(x1 - x0 + 0.6, 0.35, z1 - z0 + 0.6), M.roof, 'house-roof', [(x0 + x1) / 2, height + 0.16, (z0 + z1) / 2]);
    occluders.push(parapet);
  });

  // Named narrative buildings get silhouettes distinct enough to navigate by.
  for (const [x0, x1, z0, z1, id] of SPECIAL_BUILDINGS.filter((item) => item[4] !== 'temple-platform')) {
    if (id === 'upper-room') {
      const base = mesh(new THREE.BoxGeometry(x1 - x0, 4, z1 - z0), M.plaster, id, [(x0 + x1) / 2, 2, (z0 + z1) / 2]);
      occluders.push(base);
      mesh(new THREE.BoxGeometry(x1 - x0, 0.45, z1 - z0), M.pale, 'upper-room-floor', [(x0 + x1) / 2, 4.2, (z0 + z1) / 2]);
      mesh(new THREE.BoxGeometry(x1 - x0, 4.5, 0.55), M.pale, 'upper-room-wall', [(x0 + x1) / 2, 6.4, z0]);
      mesh(new THREE.BoxGeometry(0.55, 4.5, z1 - z0), M.pale, 'upper-room-wall', [x1, 6.4, (z0 + z1) / 2]);
      continue;
    }
    const height = id === 'praetorium' ? 9 : 7;
    const building = mesh(new THREE.BoxGeometry(x1 - x0, height, z1 - z0), M.pale, id, [(x0 + x1) / 2, height / 2, (z0 + z1) / 2]);
    occluders.push(building);
  }

  const templePlatform = mesh(new THREE.BoxGeometry(72, 2.5, 50), M.pale, 'temple-platform', [55, 1.25, -38]);
  occluders.push(templePlatform);
  const sanctuary = mesh(new THREE.BoxGeometry(25, 26, 23), M.pale, 'temple-sanctuary', [62, 15.5, -45]);
  occluders.push(sanctuary);
  mesh(new THREE.BoxGeometry(17, 18, 0.6), M.gold, 'temple-golden-facade', [62, 15.5, -33.2]);
  for (let i = 0; i < 8; i += 1) {
    mesh(new THREE.CylinderGeometry(0.7, 0.8, 9, 10), M.pale, 'temple-column', [25 + i * 8.5, 6.8, -14]);
  }

  // Rocky execution ground and garden tomb lie visibly outside the west wall.
  const hill = mesh(new THREE.CylinderGeometry(27, 34, 4, 9), M.rock, 'golgotha-hill', [-166, 1.8, -39]);
  hill.scale.z = 0.65;
  const tombRock = mesh(new THREE.BoxGeometry(24, 8, 13), M.rock, 'garden-tomb-rock', [-177, 4, -82]);
  occluders.push(tombRock);
  const tombMouth = mesh(new THREE.BoxGeometry(5, 4.5, 0.4), M.dark, 'tomb-opening', [-170, 2.2, -75.35], false);
  tombMouth.rotation.y = 0;
  const stone = mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.7, 18), M.rock, 'rolled-stone', [-165, 2.35, -75]);
  stone.rotation.x = Math.PI / 2;

  // Sparse olive trees distinguish the garden from the tightly built city.
  for (const [x, z] of [[-188, -68], [-187, -96], [-154, -94], [-143, -70], [128, 62], [132, -18], [142, -27], [147, -40], [129, -38]]) {
    mesh(new THREE.CylinderGeometry(0.5, 0.8, 4.5, 7), M.timber, 'olive-trunk', [x, 2.25, z]);
    const crown = mesh(new THREE.DodecahedronGeometry(3.2, 0), M.olive, 'olive-crown', [x, 5.3, z]);
    crown.scale.set(1.4, 0.75, 1);
  }

  const episodeRoot = new THREE.Group();
  episodeRoot.name = 'jerusalem-events';
  root.add(episodeRoot);
  const episodes = new Map();
  const animated = [];

  function figure(parent, x, y, z, material = M.robe, scale = 1) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.scale.setScalar(scale);
    const body = new THREE.Mesh(ownG(new THREE.CylinderGeometry(0.25, 0.48, 1.25, 8)), material);
    body.position.y = 0.65;
    const head = new THREE.Mesh(ownG(new THREE.SphereGeometry(0.22, 10, 7)), M.skin);
    head.position.y = 1.48;
    group.add(body, head);
    parent.add(group);
    animated.push(group);
    return group;
  }

  function prop(parent, geometry, material, position, name, rotation) {
    const value = new THREE.Mesh(ownG(geometry), material);
    value.name = name;
    value.position.set(...position);
    if (rotation) value.rotation.set(...rotation);
    parent.add(value);
    return value;
  }

  function makeEpisode(id, build) {
    const group = new THREE.Group();
    group.name = `event-${id}`;
    const [x, y, z] = EVENT_FOCI[id];
    group.position.set(x, y, z);
    build(group);
    group.visible = false;
    episodeRoot.add(group);
    episodes.set(id, group);
  }
  const semicircle = (group, count, radius, centreMaterial = M.robeCream) => {
    figure(group, 0, 0, 0, centreMaterial, 1.05);
    for (let i = 0; i < count; i += 1) {
      const angle = -1.15 + (i / Math.max(1, count - 1)) * 2.3;
      figure(group, Math.sin(angle) * radius, 0, Math.cos(angle) * radius, i % 2 ? M.robe : M.robeBlue, 0.9);
    }
  };
  makeEpisode('entry-gate', (g) => {
    prop(g, new THREE.BoxGeometry(2.2, 0.14, 0.7), M.roof, [0, 0.15, 0], 'colt');
    figure(g, 0, 0.45, 0, M.robeCream);
    for (let i = 0; i < 12; i += 1) figure(g, (i % 2 ? -1 : 1) * (2.4 + (i % 3)), 0, -6 + i, i % 3 ? M.robe : M.robeBlue, 0.9);
  });
  makeEpisode('temple-cleansing', (g) => {
    figure(g, 0, 0, 0, M.robeCream, 1.08);
    for (let i = 0; i < 4; i += 1) prop(g, new THREE.BoxGeometry(2.2, 0.16, 1.2), M.timber, [-5 + i * 3.2, 0.3, 2 + (i % 2)], 'overturned-table', [0.3, 0, i % 2 ? 0.4 : -0.35]);
    for (let i = 0; i < 7; i += 1) figure(g, -6 + i * 2, 0, 5, i % 2 ? M.robeBlue : M.robe, 0.92);
  });
  makeEpisode('temple-teaching', (g) => semicircle(g, 14, 6));
  makeEpisode('widows-offering', (g) => {
    prop(g, new THREE.BoxGeometry(1.1, 1.4, 0.9), M.gold, [0, 0.7, 0], 'offering-chest');
    figure(g, -1.2, 0, 1, M.dark, 0.82);
    for (let i = 0; i < 5; i += 1) figure(g, 3 + i * 0.8, 0, 1 + (i % 2), M.robeBlue, 0.95);
  });
  makeEpisode('last-supper', (g) => {
    prop(g, new THREE.BoxGeometry(7, 0.25, 2), M.timber, [0, 0.75, 0], 'passover-table');
    for (let i = 0; i < 13; i += 1) figure(g, -3 + (i % 7), 0, i < 7 ? -1.6 : 1.6, i === 0 ? M.robeCream : (i % 2 ? M.robe : M.robeBlue), 0.78);
  });
  makeEpisode('gethsemane', (g) => {
    figure(g, 0, 0, 0, M.robeCream, 1.05);
    for (let i = 0; i < 3; i += 1) figure(g, -5 + i * 1.8, 0, 4 + (i % 2), M.robeBlue, 0.88);
    for (let i = 0; i < 7; i += 1) figure(g, 7 + (i % 3) * 1.4, 0, -5 + Math.floor(i / 3) * 1.6, i === 0 ? M.robe : M.dark, 0.9);
  });
  makeEpisode('caiaphas-courtyard', (g) => {
    const flame = prop(g, new THREE.ConeGeometry(0.45, 1.1, 8), M.flame, [0, 0.55, 0], 'courtyard-fire');
    flame.userData.flame = true;
    for (let i = 0; i < 7; i += 1) { const a = (i / 7) * Math.PI * 2; figure(g, Math.cos(a) * 4, 0, Math.sin(a) * 4, i === 0 ? M.robeBlue : M.robe, 0.9); }
  });
  makeEpisode('before-pilate', (g) => {
    prop(g, new THREE.BoxGeometry(5, 1.2, 3), M.stone, [0, 0.6, -2], 'judgment-seat');
    figure(g, 0, 1.2, -2, M.robe, 1.03); figure(g, 0, 0, 2, M.robeCream, 1.02);
    for (let i = 0; i < 10; i += 1) figure(g, -6 + (i % 5) * 3, 0, 6 + Math.floor(i / 5) * 2, i % 2 ? M.robeBlue : M.dark, 0.9);
  });
  makeEpisode('road-to-golgotha', (g) => {
    const cross = new THREE.Group();
    cross.name = 'carried-cross';
    g.add(cross);
    const beam = new THREE.Mesh(ownG(new THREE.BoxGeometry(0.28, 5, 0.28)), M.timber); beam.rotation.z = Math.PI / 2.8; beam.position.y = 1.7;
    const bar = new THREE.Mesh(ownG(new THREE.BoxGeometry(3.4, 0.25, 0.25)), M.timber); bar.rotation.z = Math.PI / 2.8; bar.position.set(-0.6, 2.5, 0);
    cross.add(beam, bar); figure(g, 0.4, 0, 0.6, M.robeCream, 0.95);
    for (let i = 0; i < 8; i += 1) figure(g, -5 + i * 1.5, 0, 4 + (i % 2), i % 2 ? M.robe : M.robeBlue, 0.88);
  });
  function crosses(g) {
    [-5, 0, 5].forEach((x, index) => {
      prop(g, new THREE.BoxGeometry(0.32, index === 1 ? 8 : 6.5, 0.32), M.timber, [x, index === 1 ? 4 : 3.25, 0], 'cross-upright');
      prop(g, new THREE.BoxGeometry(index === 1 ? 4.6 : 4, 0.3, 0.3), M.timber, [x, index === 1 ? 5.7 : 4.7, 0], 'crossbeam');
    });
  }
  makeEpisode('crucifixion', (g) => { crosses(g); for (let i = 0; i < 7; i += 1) figure(g, -6 + i * 2, 0, 7 + (i % 2), i % 2 ? M.robeBlue : M.robe, 0.84); });
  makeEpisode('burial', (g) => { figure(g, -4, 0, 3, M.robeBlue); figure(g, -2, 0, 3, M.robe); prop(g, new THREE.BoxGeometry(4, 0.35, 1.1), M.robeCream, [-3, 1.1, 3], 'wrapped-body'); });
  makeEpisode('empty-tomb', (g) => { figure(g, 2, 0, 1, M.robeCream, 1.02); for (let i = 0; i < 3; i += 1) figure(g, -4 + i * 1.7, 0, 4, i % 2 ? M.robeBlue : M.robe, 0.88); });

  let activeEpisode = null;
  function setEpisode(id) {
    activeEpisode = episodes.has(id) ? id : null;
    episodes.forEach((group, key) => { group.visible = key === activeEpisode; });
    return activeEpisode;
  }

  function update(elapsed) {
    if (reducedMotion) return;
    animated.forEach((person, index) => {
      if (!person.parent?.visible) return;
      person.rotation.z = Math.sin(elapsed * 0.9 + index * 1.7) * 0.012;
    });
    episodeRoot.traverse((object) => {
      if (object.userData?.flame) object.scale.y = 0.9 + Math.sin(elapsed * 8) * 0.15;
    });
  }

  return {
    root, sun, lighting, update, occluders, cameraColliders: occluders,
    episodes: [...episodes.keys()], setEpisode, getEpisode: () => activeEpisode,
    fog: resolveTimeOfDay(timeOfDay).fog,
    exposure: resolveTimeOfDay(timeOfDay).exposure,
    applyAssets: (group) => applyScannedSurfaces(THREE, group?.materials, 'jerusalem', [
      [M.stone, 'ashlar', { metres: 7, strength: 0.8 }],
      [M.plaster, 'plaster', { metres: 4, strength: 0.65 }],
      [M.road, 'paving', { metres: 4, strength: 0.65, breakTiling: true }],
      [M.timber, 'timber', { metres: 2 }],
    ], { anisotropy: Math.min(8, maxAnisotropy) }),
    applyQuality: () => {},
    dispose: () => {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      lighting.sky.geometry.dispose();
      lighting.skyMaterial.dispose();
    },
  };
}
