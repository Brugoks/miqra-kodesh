// Nehemiah's Jerusalem, 444 BC (/scene/nehemiahs-wall).
//
// The builder composes:
//   nehemiahLandscape.js     the real ground, the groves, the far skyline
//   nehemiahWallGeometry.js  the wall in its three states, its gates, towers
//                            and stairs
//   nehemiahCity.js          the Temple, the houses, the ruins, the pools
//   sceneAir.js              clouds, haze, mist in the Kidron at dawn, smoke:
//                            the altar's column, the few hearths
//   nehemiahLife.js          the people, the flocks, the things lying about —
//                            made per state of the wall, the first time it is
//                            wanted
//   nehemiahEvents.js        the twelve staged moments, one at a time
//
// and it is the wall's state that holds them together. A moment sets it
// (nehemiahDimensions.js EVENT_WALL_STATE); the builder shows that state's wall
// and that state's crowd, tells the navigation (setWallState) so what is solid
// follows what is drawn, and stages the moment's cast. Leaving the moment puts
// the finished wall back.
//
// Axes: +X east, -Z north (nehemiahDimensions.js). THREE is passed in, so the
// module stays importable in jsdom.

import { applyLighting, resolveTimeOfDay } from './sceneLighting';
import { createProps } from './sceneProps';
import { createLivingCrowd } from './sceneLivingCrowd';
import { loadMotionLibrary } from './sceneMixamo';
import { createHerd, createBirds } from './sceneAnimals';
import { createEpisodes } from './sceneEpisodes';
import { createSceneAir, makeFogFor } from './sceneAir';
import { applyScannedSurfaces } from './sceneSurfaces';
import { createNehemiahLandscape, WIND, terrainHeight } from './nehemiahLandscape';
import { createNehemiahCity, ALTAR_TOP } from './nehemiahCity';
import { createNehemiahWalls } from './nehemiahWallGeometry';
import { createNehemiahEventStages } from './nehemiahEvents';
import {
  figuresFor, animalsFor, birdsFor, itemsFor, smokeSourcesFor, walkableY,
} from './nehemiahLife';
import { setWallState, getWallState } from './nehemiahNavigation';
import {
  SLUG, EVENT_WALL_STATE, DEFAULT_WALL_STATE, WALL_STATES, groundAt, MOUNT,
} from './nehemiahDimensions';

// The end of the dry year: clear, dusty, the hills pale. Mist lies in the
// Kidron at first light, and the altar's smoke stands straight up in the still
// of the morning.
export const WEATHER = {
  dawn: { cover: 0.18, fog: 0.0008, mist: 1, smoke: 1 },
  morning: { cover: 0.14, fog: 0.00058, mist: 0.25, smoke: 0.9 },
  noon: { cover: 0.12, fog: 0.00052, mist: 0, smoke: 0.7 },
  dusk: { cover: 0.2, fog: 0.00072, mist: 0.05, smoke: 1 },
  night: { cover: 0.08, fog: 0.00062, mist: 0.3, smoke: 0.8 },
};
export const fogFor = makeFogFor(WEATHER);

export default function buildNehemiah(THREE, options = {}) {
  const { quality = 'high', timeOfDay, reducedMotion = false } = options;
  const low = quality === 'low';
  const high = quality === 'high';
  const motionLibrary = 'motionLibrary' in options
    ? options.motionLibrary
    : loadMotionLibrary().catch(() => null);

  const root = new THREE.Group();
  root.name = SLUG;
  const materials = [];
  const own = (m) => { materials.push(m); return m; };
  const standard = (parameters) => own(new THREE.MeshStandardMaterial(parameters));

  // --- sky and light ---
  const lighting = applyLighting(THREE, root, {
    slug: SLUG,
    timeOfDay,
    skyRadius: 2200,
    low,
  });
  const { sun } = lighting;
  lighting.sky.userData.excludeFromAO = true;
  if (!low) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 480;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.08;
  }

  // --- the air ---
  const air = createSceneAir(THREE, {
    quality,
    lighting,
    name: 'nehemiah-air',
    weather: WEATHER,
    wind: WIND,
    land: { x: -1, z: 0 },
    smokeSources: smokeSourcesFor(ALTAR_TOP),
    // Pooled in the Kidron and the Hinnom at dawn.
    mist: { level: -14, heights: [0, 2, 4], heightsLow: [1.5], centre: [20, 240], size: [520, 1100], reach: [20, 120, 340] },
  });
  root.add(air.group);

  // --- what things are made of ---
  const M = {
    ashlar: standard({ color: 0xc2b79d, roughness: 0.95 }),
    rubbleStone: standard({ color: 0xa89f8b, roughness: 1, flatShading: true }),
    plaster: standard({ color: 0xcfc0a0, roughness: 0.98 }),
    earthRoof: standard({ color: 0x9a8663, roughness: 1 }),
    timber: standard({ color: 0x5f4731, roughness: 0.9 }),
    charred: standard({ color: 0x1d1a17, roughness: 1 }),
    dark: standard({ color: 0x1c1915, roughness: 1 }),
    iron: standard({ color: 0x4a4b4e, roughness: 0.5, metalness: 0.6 }),
    bronze: standard({ color: 0xa8813f, roughness: 0.42, metalness: 0.55 }),
    cloth: standard({ color: 0x7a4a62, roughness: 1, side: THREE.DoubleSide }),
    rock: standard({ color: 0xa89f8b, roughness: 1, flatShading: true }),
    water: standard({ color: 0x3f6a6c, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.88 }),
    flame: own(new THREE.MeshBasicMaterial({
      color: 0xffb257, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    })),
    leafy: standard({ color: 0x5d7a3c, roughness: 0.9, flatShading: true, side: THREE.DoubleSide }),
  };

  // --- the land, the wall and the city ---
  const landscape = createNehemiahLandscape(THREE, { quality, lighting });
  root.add(landscape.group);
  const walls = createNehemiahWalls(THREE, {
    quality, materials: M, shadows: !low, lighting,
  });
  root.add(walls.group);
  const city = createNehemiahCity(THREE, {
    quality, materials: M, shadows: !low, terrainHeight,
  });
  root.add(city.group);
  const cameraColliders = [...landscape.cameraColliders, ...city.cameraColliders];
  // What can hide a pin: the city, always, and the wall that is on show. One
  // array for the life of the scene, because the route keeps hold of it.
  const occluders = [...city.occluders];
  const fixedOccluders = occluders.length;

  // --- the birds: over the brook and on the roofs ---
  const flock = createBirds(THREE, { birds: birdsFor({ low }), quality, name: 'nehemiah-birds' });
  root.add(flock.group);

  // --- the life, per state of the wall, the first time it is wanted ---
  const lives = {};
  const assetsSeen = [];
  let state = DEFAULT_WALL_STATE;
  function lifeFor(wanted) {
    if (lives[wanted]) return lives[wanted];
    // Placement asks the navigation what is in the way, and what is in the way
    // depends on the wall.
    const before = getWallState();
    setWallState(wanted);
    const figures = figuresFor(wanted, { low, high });
    const animals = animalsFor(wanted, { low });
    const items = itemsFor(wanted, { low });
    setWallState(before);
    const crowd = createLivingCrowd(THREE, {
      root,
      figures,
      sceneSlug: SLUG,
      groundAt: walkableY,
      quality,
      reducedMotion,
      motionLibrary,
      active: () => state === wanted,
    });
    const herd = createHerd(THREE, { animals, quality, groundAt, name: `nehemiah-animals-${wanted}` });
    herd.group.visible = false;
    root.add(herd.group);
    const props = createProps(THREE, { items, quality });
    props.group.visible = false;
    root.add(props.group);
    assetsSeen.forEach((assets) => crowd.acceptAssets(assets));
    lives[wanted] = { crowd, herd, props, figures };
    return lives[wanted];
  }

  // --- what happened here ---
  const episodes = createEpisodes(createNehemiahEventStages(THREE, { root, motionLibrary }));
  let episode = null;

  // The staged moments' lamplight — the lamp Nehemiah carries by night — from
  // a fixed pool of lights moved onto the anchors the staged moment carries. A
  // fixed count, because a light appearing makes three.js recompile every
  // material in the scene; on lighter settings the flame's own glow stands
  // alone.
  const glow = high ? [0, 1].map((i) => {
    const light = new THREE.PointLight(0xff9a48, 0, 10, 1.6);
    light.name = `lamplight-${i}`;
    root.add(light);
    return light;
  }) : [];
  let anchors = [];
  let anchoredTo;
  const findAnchors = () => {
    const stage = episode ? episodes.getStage(episode) : null;
    if (episode === anchoredTo && (anchors.length || !stage?.isReady?.())) return;
    anchoredTo = episode;
    anchors = [];
    stage?.group.traverse((node) => { if (node.userData.light) anchors.push(node); });
  };
  const anchorAt = new THREE.Vector3();
  const lamplight = (elapsed) => {
    if (!glow.length) return;
    findAnchors();
    glow.forEach((lamp, i) => {
      const anchor = anchors[i];
      if (!anchor) { lamp.intensity = 0; return; }
      const spec = anchor.userData.light;
      anchor.getWorldPosition(anchorAt);
      lamp.position.copy(anchorAt);
      lamp.color.setHex(spec.colour);
      lamp.distance = spec.distance;
      lamp.intensity = spec.intensity * (0.88 + Math.sin(elapsed * 11 + i * 2.3) * 0.08 + Math.sin(elapsed * 29 + i) * 0.04);
    });
  };

  // The wall's state, everywhere it has to be known.
  function showState(next) {
    state = WALL_STATES.includes(next) ? next : DEFAULT_WALL_STATE;
    setWallState(state);
    walls.setState(state);
    occluders.length = fixedOccluders;
    occluders.push(...walls.occludersFor(state));
    const life = lifeFor(state);
    for (const [key, entry] of Object.entries(lives)) {
      const on = key === state;
      entry.herd.group.visible = on;
      entry.props.group.visible = on;
      if (!on) entry.crowd.group.visible = false;
    }
    return life;
  }
  showState(DEFAULT_WALL_STATE);

  function setEpisode(id) {
    episode = episodes.setEpisode(id);
    showState(episode ? EVENT_WALL_STATE[episode] : DEFAULT_WALL_STATE);
    city.setEpisode(episode);
    return episode;
  }

  // --- the facade the route reads people through ---
  const activeCrowd = () => lives[state]?.crowd;
  const humans = {
    update(frame) {
      activeCrowd()?.update(frame);
      episodes.update(frame);
    },
    acceptAssets(assets) {
      assetsSeen.push(assets);
      for (const entry of Object.values(lives)) entry.crowd.acceptAssets(assets);
      episodes.acceptAssets(assets);
    },
    queryClearance(...args) {
      const clearance = episodes.queryClearance(...args);
      if (clearance.collides) return clearance;
      return activeCrowd()?.queryClearance(...args) || { collides: false, pushX: 0, pushZ: 0 };
    },
    setQuality(profile) {
      for (const entry of Object.values(lives)) entry.crowd.setQuality(profile);
    },
    getElapsed: () => activeCrowd()?.getElapsed() ?? 0,
    getActors: () => activeCrowd()?.getActors() ?? [],
    dispose() {
      for (const entry of Object.values(lives)) entry.crowd.dispose();
    },
  };

  // --- the hour ---
  let hour = resolveTimeOfDay(timeOfDay);
  const applyHour = (time) => {
    hour = time;
    landscape.onTimeOfDay(time);
    air.onTimeOfDay(time);
  };
  applyHour(lighting.current || hour);

  function update(elapsed, dt, frame) {
    if (frame?.camera) lighting.sky.position.copy(frame.camera.position);
    air.update(elapsed);
    landscape.update(elapsed, dt, frame);
    city.update(elapsed);
    walls.update(elapsed, hour);
    const life = lives[state];
    life?.herd.update(elapsed);
    flock.update(elapsed);
    lamplight(elapsed);
  }

  function dispose() {
    episodes.dispose();
    humans.dispose();
    for (const entry of Object.values(lives)) {
      entry.props.dispose();
      entry.herd.dispose();
    }
    flock.dispose();
    air.dispose();
    walls.dispose();
    city.dispose();
    landscape.dispose();
    materials.forEach((m) => m.dispose());
    root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else if (material) material.dispose();
    });
    setWallState(DEFAULT_WALL_STATE);
  }

  const time = resolveTimeOfDay(timeOfDay);
  root.updateMatrixWorld(true);
  return {
    root,
    sun,
    lighting,
    humans,
    landscape,
    city,
    walls,
    update: (elapsed, dt, frame) => update(elapsed, dt, frame),
    episodes: episodes.ids,
    setEpisode,
    getEpisode: episodes.getEpisode,
    getEpisodeStage: episodes.getStage,
    getWallState: () => state,
    firelight: glow,
    dispose,
    fog: time.fog,
    exposure: time.exposure,
    fogFor: (t) => air.fogFor(t),
    onTimeOfDay: applyHour,
    prepareRenderer: (renderer, world) => air.prepareRenderer(renderer, world),
    shadowFollow: low ? null : { extent: 50 },
    cameraColliders,
    occluders,
    applyAssets: (group) => {
      // The ridge is real ground, and now it wears it: gravelly terra rossa
      // under the baked vertex colours, dressed limestone in the wall, rough
      // field stone in the rubble.
      applyScannedSurfaces(THREE, group?.materials, SLUG, [
        [landscape.materials.terrain, 'earth', { metres: 4, preserveShader: true, strength: 0.8, relief: 0.7, breakTiling: true }],
        [landscape.materials.limestone, 'rock', { metres: 2.5, strength: 0.85, relief: 0.8 }],
        [M.ashlar, 'limestone', { metres: 4, strength: 0.85, relief: 0.8 }],
        [M.plaster, 'limestone', { metres: 3, strength: 0.6, relief: 0.6 }],
        [M.rubbleStone, 'rock', { metres: 3, strength: 0.85, relief: 0.9 }],
        [M.rock, 'rock', { metres: 4, strength: 0.85, relief: 0.9 }],
        [M.timber, 'timber', { metres: 2, strength: 0.85 }],
        [M.cloth, 'cloth', { metres: 1.2, strength: 0.85, relief: 0.8, chroma: 0.5 }],
      ], { anisotropy: Math.min(8, options.maxAnisotropy ?? 1) });
      humans.acceptAssets(group);
    },
    applyQuality: (profile) => humans.setQuality(profile),
    // The platform level, for tests and the route: where the Temple stands.
    mountLevel: MOUNT.level,
  };
}
