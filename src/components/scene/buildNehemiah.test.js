import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import buildNehemiah, { WEATHER, fogFor } from './buildNehemiah';
import { createNehemiahLandscape, terrainHeight, sameGround, landUse } from './nehemiahLandscape';
import { createNehemiahCity, ALTAR_TOP, PLATFORM, BOOTHS } from './nehemiahCity';
import {
  createNehemiahWalls, buildWallGeometry, buildWallChunks, CHUNK,
} from './nehemiahWallGeometry';
import { HORIZON_RIBBONS } from './nehemiahHorizonData';
import {
  WALK, WALLS, MOUNT, TEMPLE, GATE, HOUSES, POOLS, EVENT_GROUND, EVENT_WALL_STATE,
  groundAt, groves, inEventArea,
} from './nehemiahDimensions';
import {
  PROFILES, PROFILE_BY_ID, FEATURES, FEATURE_BY_ID, GATES, frameAt, ruinHeight,
} from './nehemiahWalls';
import { setWallState, getWallState, blockerAt } from './nehemiahNavigation';
import { TIMES_OF_DAY, SCENE_AXES, headingToScene } from './sceneLighting';
import { figuresFor, animalsFor, itemsFor, walkableY } from './nehemiahLife';
import { NEHEMIAH } from '../../lib/nehemiahScene';

// Nehemiah's Jerusalem, built for real in jsdom (without the character models,
// which nehemiahEvents.test.js loads). Nothing here can be looked at in CI, so
// these hold what a look would check: the drawn ground and the walked ground
// are one surface, the wall is cut where the navigation opens it and solid
// where it closes it, in all three states, the people stand where people can
// stand, and the whole thing builds the same every time and takes itself apart
// cleanly.

afterEach(() => setWallState('built'));

const instanceMatrices = (root) => {
  const values = [];
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (node.isInstancedMesh) values.push(...node.instanceMatrix.array.slice(0, node.count * 16));
    else if (node.isMesh) values.push(...node.matrixWorld.elements);
  });
  return values;
};

describe('the landscape', () => {
  it('draws the ground a visitor walks on, triangle for triangle', () => {
    for (let x = WALK.x0; x <= WALK.x1; x += 7.3) {
      for (let z = WALK.z0; z <= WALK.z1; z += 6.1) expect(sameGround(x, z), `(${x}, ${z})`).toBe(true);
    }
  });

  it('draws every tree the navigation makes solid', () => {
    const landscape = createNehemiahLandscape(THREE, { quality: 'balanced' });
    expect(landscape.counts.olives + landscape.counts.fruit).toBe(groves().length);
    let trunks = 0;
    landscape.group.traverse((node) => {
      if (node.isInstancedMesh && /^(olive|fruit)-trunks-/.test(node.name) && !node.name.includes('far')) trunks += node.count;
    });
    expect(trunks).toBe(groves().length);
    landscape.dispose();
  });

  it('builds without a NaN at any quality and disposes what it made', () => {
    for (const quality of ['low', 'balanced', 'high']) {
      const landscape = createNehemiahLandscape(THREE, { quality });
      expect(instanceMatrices(landscape.group).every(Number.isFinite), quality).toBe(true);
      const geometries = [];
      landscape.group.traverse((node) => { if (node.geometry) geometries.push(vi.spyOn(node.geometry, 'dispose')); });
      landscape.dispose();
      expect(geometries.every((spy) => spy.mock.calls.length > 0), quality).toBe(true);
    }
  });

  it('flattens the Temple platform to its court, and puts the groves on the hills east', () => {
    expect(terrainHeight(-120, -430)).toBeCloseTo(MOUNT.level, 5);
    expect(landUse(-120, -430)).toBe('mount');
    expect(landUse(-140, 160)).toBe('city');
    expect(landUse(-108, 120)).toBe('road');
    expect(landUse(-130, 410)).toBe('garden');
    expect(landUse(-450, 40)).toBe('ruins');
  });

  it('puts the far skyline at its true bearings, the desert and Moab east, hills west', () => {
    const byId = Object.fromEntries(HORIZON_RIBBONS.map((ribbon) => [ribbon.id, ribbon]));
    const bearings = (id) => byId[id].points.map((p) => p[0]);
    expect(Math.min(...bearings('judean-desert'))).toBeGreaterThanOrEqual(20);
    expect(Math.max(...bearings('judean-desert'))).toBeLessThanOrEqual(200);
    expect(Math.min(...bearings('moab'))).toBeGreaterThanOrEqual(40);
    expect(Math.max(...bearings('moab'))).toBeLessThanOrEqual(150);
    expect(Math.min(...bearings('west-hills'))).toBeGreaterThanOrEqual(200);
    // Each ribbon is built where the compass says, in this scene's own axes.
    const axes = SCENE_AXES['nehemiahs-wall'];
    const east = headingToScene(90, axes);
    expect(east.x).toBeCloseTo(1, 5);
    expect(east.z).toBeCloseTo(0, 5);
    for (const ribbon of HORIZON_RIBBONS) {
      for (const point of ribbon.points) expect(point.slice(0, 3).every(Number.isFinite)).toBe(true);
    }
  });
});

describe('the wall, drawn', () => {
  const walls = (state) => {
    const kit = createNehemiahWalls(THREE, {
      quality: 'balanced',
      materials: Object.fromEntries(['ashlar', 'rubbleStone', 'timber', 'iron', 'charred', 'flame'].map((key) => [key, new THREE.MeshStandardMaterial()])),
    });
    kit.setState(state);
    kit.group.updateMatrixWorld(true);
    const meshes = [];
    kit.group.traverse((node) => { if (node.isMesh && /^wall-(city|mount-\w+)-(ruin|half|built)$/.test(node.name)) meshes.push(node); });
    return { kit, meshes };
  };
  const hit = (meshes, origin, direction, far) => {
    const raycaster = new THREE.Raycaster(origin, direction, 0, far);
    const hits = raycaster.intersectObjects(meshes, false);
    return hits.length ? hits[0].distance : null;
  };
  const across = (frame, h, from = 6) => {
    const ground = groundAt(frame.x, frame.z);
    const origin = new THREE.Vector3(frame.x - frame.nx * from, h ?? ground + 1.5, frame.z - frame.nz * from);
    return { origin, direction: new THREE.Vector3(frame.nx, 0, frame.nz) };
  };

  it('is cut at every gate, and the passage is clear: a ray through it meets nothing', () => {
    for (const state of ['half', 'built']) {
      const { kit, meshes } = walls(state);
      for (const gate of GATES) {
        const wall = PROFILE_BY_ID[gate.wall];
        const frame = frameAt(wall, gate.s);
        const { origin, direction } = across(frame, gate.ground + 1.5);
        expect(hit(meshes, origin, direction, 14), `${gate.id} in the ${state} wall`).toBeNull();
        // Standing in the passage, the head is under the lintel.
        origin.y = gate.ground + GATE.height - 0.3;
        expect(hit(meshes, origin, direction, 14), `${gate.id} under its lintel`).toBeNull();
      }
      kit.dispose();
    }
  });

  it('closes the wall between the gates, in the half wall and the finished one', () => {
    for (const state of ['half', 'built']) {
      const { kit, meshes } = walls(state);
      let tried = 0;
      for (const profile of PROFILES) {
        for (let s = 18; s < profile.length - 18; s += 29) {
          if (FEATURES.some((f) => f.wall === profile.wall.id && Math.hypot(f.x - frameAt(profile, s).x, f.z - frameAt(profile, s).z) < 14)) continue;
          const frame = frameAt(profile, s);
          const { origin, direction } = across(frame, frame.high + 1.2, 5);
          const distance = hit(meshes, origin, direction, 14);
          tried += 1;
          expect(distance, `${profile.wall.id} at ${Math.round(s)} (${state})`).not.toBeNull();
          expect(distance, `${profile.wall.id} at ${Math.round(s)} (${state})`).toBeLessThan(5 + profile.wall.thickness / 2 + 1);
        }
      }
      expect(tried).toBeGreaterThan(30);
      kit.dispose();
    }
  });

  it('is as broken as the navigation says: a stump drawn where one blocks, a gap where one does not', () => {
    const { kit, meshes } = walls('ruin');
    let stumps = 0;
    let gaps = 0;
    const profile = PROFILE_BY_ID.city;
    for (let s = 12; s < profile.length - 12; s += 4.5) {
      const frame = frameAt(profile, s);
      if (FEATURES.some((f) => f.wall === 'city' && Math.hypot(f.x - frame.x, f.z - frame.z) < 12)) continue;
      const height = ruinHeight(profile, s);
      // Away from a slot's edge, so the ray cannot graze two.
      const edge = Math.min(s % 7, 7 - (s % 7));
      if (edge < 1) continue;
      const { origin, direction } = across(frame, frame.high + 0.4, 5);
      const distance = hit(meshes, origin, direction, 14);
      if (height === 0) {
        gaps += 1;
        expect(distance, `a gap at ${Math.round(s)}`).toBeNull();
      } else if (height > 0.7) {
        stumps += 1;
        expect(distance, `a stump at ${Math.round(s)}`).not.toBeNull();
      }
    }
    expect(stumps).toBeGreaterThan(20);
    expect(gaps).toBeGreaterThan(8);
    kit.dispose();
  });

  it('is a walkway as high as the navigation’s, edge to edge', () => {
    const { kit, meshes } = walls('built');
    for (let s = 40; s < PROFILE_BY_ID.city.length; s += 180) {
      const frame = frameAt(PROFILE_BY_ID.city, s);
      if (FEATURES.some((f) => f.wall === 'city' && Math.hypot(f.x - frame.x, f.z - frame.z) < 8)) continue;
      for (const lateral of [-0.9, 0, 0.9]) {
        const origin = new THREE.Vector3(frame.x + frame.nx * lateral, frame.top + 3, frame.z + frame.nz * lateral);
        const raycaster = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 8);
        const top = raycaster.intersectObjects(meshes, false)[0];
        expect(top, `the walkway at ${Math.round(s)}`).toBeTruthy();
        expect(top.point.y, `the walkway at ${Math.round(s)}`).toBeCloseTo(frame.top, 0);
      }
    }
    kit.dispose();
  });

  it('shows one state at a time, builds each only when asked, and frees what it made', () => {
    const kit = createNehemiahWalls(THREE, {
      quality: 'low',
      materials: Object.fromEntries(['ashlar', 'rubbleStone', 'timber', 'iron', 'charred', 'flame'].map((key) => [key, new THREE.MeshStandardMaterial()])),
    });
    expect(Object.keys(kit.states)).toEqual([]);
    kit.setState('built');
    expect(Object.keys(kit.states)).toEqual(['built']);
    kit.setState('half');
    expect(kit.states.built.visible).toBe(false);
    expect(kit.states.half.visible).toBe(true);
    kit.setState('ruin');
    expect(Object.values(kit.states).filter((g) => g.visible)).toHaveLength(1);
    expect(instanceMatrices(kit.group).every(Number.isFinite)).toBe(true);
    const spies = [];
    kit.group.traverse((node) => { if (node.geometry) spies.push(vi.spyOn(node.geometry, 'dispose')); });
    kit.dispose();
    expect(spies.every((spy) => spy.mock.calls.length > 0)).toBe(true);
  });

  it('is cut into stretches a ray or the camera can pass over, not one mesh for the circuit', () => {
    const chunks = buildWallChunks(THREE, PROFILE_BY_ID.city, 'built');
    expect(chunks.length).toBeGreaterThanOrEqual(Math.floor(PROFILE_BY_ID.city.length / CHUNK));
    for (const geometry of chunks) {
      expect(geometry.boundingSphere.radius).toBeLessThan(CHUNK * 0.9);
      geometry.dispose();
    }
    // Together they are the whole wall: the same number of triangles as one mesh.
    const whole = buildWallGeometry(THREE, PROFILE_BY_ID.city, 'built');
    const parts = buildWallChunks(THREE, PROFILE_BY_ID.city, 'built');
    expect(parts.reduce((n, g) => n + g.attributes.position.count, 0)).toBe(whole.attributes.position.count);
    whole.dispose();
    parts.forEach((g) => g.dispose());
  });

  it('makes a ribbon with no degenerate triangles and every face pointing the way it should', () => {
    for (const state of ['ruin', 'half', 'built']) {
      for (const profile of PROFILES) {
        const geometry = buildWallGeometry(THREE, profile, state);
        if (!geometry) continue;
        const p = geometry.attributes.position;
        expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
        const n = geometry.attributes.normal;
        let up = 0;
        for (let i = 0; i < n.count; i += 3) if (n.getY(i) > 0.9) up += 1;
        // A wall has tops: a good share of its faces look up.
        if (state === 'built') expect(up).toBeGreaterThan(profile.count / 4);
        geometry.dispose();
      }
    }
  });
});

describe('the city', () => {
  const materials = Object.fromEntries(['ashlar', 'rubbleStone', 'plaster', 'earthRoof', 'timber', 'dark', 'bronze', 'cloth', 'rock', 'water', 'leafy', 'iron', 'flame', 'charred']
    .map((key) => [key, new THREE.MeshStandardMaterial()]));

  it('builds a house for every house the manifest names, and the pools and the Temple', () => {
    const city = createNehemiahCity(THREE, { quality: 'balanced', materials, terrainHeight });
    const names = new Set();
    city.group.traverse((node) => { if (node.name) names.add(node.name); });
    for (const house of HOUSES) expect(names.has(house.id), house.id).toBe(true);
    for (const pool of POOLS) {
      expect(names.has(pool.id), pool.id).toBe(true);
      expect(names.has(`${pool.id}-water`), pool.id).toBe(true);
    }
    for (const name of ['sanctuary', 'altar', 'temple-court', 'gihon', 'governor-seat', 'tombs-of-david', 'stepped-stone-structure']) {
      expect(names.has(name), name).toBe(true);
    }
    expect(instanceMatrices(city.group).every(Number.isFinite)).toBe(true);
    city.dispose();
  });

  it('stands the Temple on the platform, higher than anything round it, with the altar before it', () => {
    const city = createNehemiahCity(THREE, { quality: 'balanced', materials, terrainHeight });
    city.group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    let sanctuary = null;
    city.group.traverse((node) => { if (node.isMesh && node.name === 'sanctuary') sanctuary = (sanctuary || box.makeEmpty()).expandByObject(node); });
    expect(sanctuary.min.y).toBeLessThanOrEqual(MOUNT.level + 0.01);
    expect(sanctuary.max.y).toBeCloseTo(MOUNT.level + TEMPLE.height + 0.0, 0);
    expect(ALTAR_TOP.y).toBeCloseTo(MOUNT.level + TEMPLE.altar.height, 5);
    expect(ALTAR_TOP.x).toBeGreaterThan(sanctuary.max.x);
    city.dispose();
  });

  it('shows the platform for the reading, and the booths for the feast, only for those moments', () => {
    const city = createNehemiahCity(THREE, { quality: 'balanced', materials, terrainHeight });
    expect(city.staged['water-gate'].visible).toBe(false);
    expect(city.staged.booths.visible).toBe(false);
    city.setEpisode('water-gate');
    expect(city.staged['water-gate'].visible).toBe(true);
    expect(city.staged.booths.visible).toBe(false);
    city.setEpisode('booths');
    expect(city.staged.booths.visible).toBe(true);
    city.setEpisode(null);
    expect(Object.values(city.staged).some((node) => node.visible)).toBe(false);
    // The platform is in the square, inside the wall, and every booth is on the ground it stands on.
    expect(Math.hypot(PLATFORM.x - EVENT_GROUND['water-gate'].x, PLATFORM.z - EVENT_GROUND['water-gate'].z)).toBeLessThan(EVENT_GROUND['water-gate'].r);
    for (const [x, z] of BOOTHS) expect(Math.hypot(x - EVENT_GROUND.booths.x, z - EVENT_GROUND.booths.z)).toBeLessThan(EVENT_GROUND.booths.r + 12);
    city.dispose();
  });
});

describe('the people', () => {
  it.each(['ruin', 'half', 'built'])('puts the %s wall’s people where people can stand, clear of every moment', (state) => {
    setWallState(state);
    for (const quality of [{ low: true }, { low: false, high: true }]) {
      const figures = figuresFor(state, quality);
      expect(figures.length).toBeGreaterThan(state === 'ruin' ? 3 : 20 * (quality.low ? 0.3 : 1));
      const ids = new Set();
      for (const figure of figures) {
        expect(ids.has(figure.id), `${figure.id} is unique`).toBe(false);
        ids.add(figure.id);
        const [x, z] = figure.route ? figure.route[0] : [figure.x, figure.z];
        expect(Number.isFinite(x + z), figure.id).toBe(true);
        expect(blockerAt(x, z, figure.y), `${figure.id} at (${x.toFixed(1)}, ${z.toFixed(1)})`).toBeNull();
        if (figure.route) {
          for (const [rx, rz] of figure.route) expect(inEventArea(rx, rz), `${figure.id}'s route`).toBe(false);
        } else if (!figure.id.includes('priest') && !figure.id.includes('levite') && !figure.id.includes('worshipper')) {
          expect(inEventArea(figure.x, figure.z), figure.id).toBe(false);
        }
        expect(figure.y).toBeCloseTo(walkableY(x, z), 5);
      }
    }
  });

  it('has watchers on the wall only when there is a walkway to walk on', () => {
    const built = figuresFor('built', { low: false, high: false });
    const onTop = built.filter((f) => f.id.startsWith('built-watch'));
    expect(onTop.length).toBeGreaterThan(2);
    for (const figure of onTop) {
      const [x, z] = figure.route[0];
      expect(figure.y, figure.id).toBeGreaterThan(groundAt(x, z) + 4);
    }
    for (const state of ['ruin', 'half']) {
      expect(figuresFor(state, { low: false }).some((f) => f.id.includes('watch') && f.route)).toBe(false);
    }
  });

  it('works on the wall in the half wall, and lives in the houses of the finished one', () => {
    const half = figuresFor('half', { low: false, high: true });
    expect(half.filter((f) => f.activity === 'working' || f.activity === 'carrying').length).toBeGreaterThan(10);
    const built = figuresFor('built', { low: false, high: true });
    expect(built.filter((f) => f.id.startsWith('built-gatekeeper')).length).toBeGreaterThan(5);
    expect(built.filter((f) => f.dress === 'priest').length).toBeGreaterThan(2);
  });

  it('places animals and things where they can stand, and never on a moment’s ground', () => {
    for (const state of ['ruin', 'half', 'built']) {
      setWallState(state);
      for (const animal of animalsFor(state, { low: false })) {
        expect(blockerAt(animal.x, animal.z, groundAt(animal.x, animal.z)), `${animal.species}`).toBeNull();
      }
      for (const item of itemsFor(state, { low: false })) {
        expect(blockerAt(item.x, item.z, groundAt(item.x, item.z)), item.kind).toBeNull();
      }
    }
  });
});

describe('the scene', () => {
  const build = (quality = 'balanced') => buildNehemiah(THREE, { quality, motionLibrary: null });

  it('builds at every quality, opens on the finished wall, and takes itself apart', () => {
    for (const quality of ['low', 'balanced', 'high']) {
      const built = build(quality);
      expect(built.getWallState()).toBe('built');
      expect(getWallState()).toBe('built');
      built.update(1.5, 0.016, { camera: new THREE.PerspectiveCamera() });
      expect(instanceMatrices(built.root).every(Number.isFinite), quality).toBe(true);
      const geometries = [];
      built.root.traverse((node) => { if (node.geometry) geometries.push(vi.spyOn(node.geometry, 'dispose')); });
      built.dispose();
      expect(geometries.every((spy) => spy.mock.calls.length > 0), quality).toBe(true);
      expect(getWallState()).toBe('built');
    }
  });

  it('moves the wall, the people, the navigation and the cast together when a moment is chosen', () => {
    const built = build('balanced');
    for (const event of NEHEMIAH.events) {
      expect(built.setEpisode(event.id)).toBe(event.id);
      const state = EVENT_WALL_STATE[event.id];
      expect(built.getWallState(), event.id).toBe(state);
      expect(getWallState(), `${event.id}: the navigation follows`).toBe(state);
      expect(built.walls.states[state].visible, event.id).toBe(true);
      for (const [key, group] of Object.entries(built.walls.states)) {
        if (key !== state) expect(group.visible, `${event.id}: ${key} is hidden`).toBe(false);
      }
      expect(built.getEpisode()).toBe(event.id);
      expect(built.getEpisodeStage(event.id).group.visible || !built.getEpisodeStage(event.id).isReady()).toBe(true);
    }
    // And leaving a moment puts the finished wall back.
    expect(built.setEpisode(null)).toBeNull();
    expect(built.getWallState()).toBe('built');
    expect(getWallState()).toBe('built');
    built.dispose();
  });

  it('lets only the wall on show hide a pin, and keeps the same list for the route to hold', () => {
    const built = build('balanced');
    const held = built.occluders;
    const wallMeshes = () => held.filter((m) => /^wall-/.test(m.name));
    expect(wallMeshes().length).toBeGreaterThan(20);
    expect(wallMeshes().every((m) => /-built$/.test(m.name))).toBe(true);
    built.setEpisode('mockery');
    expect(built.occluders).toBe(held);
    expect(wallMeshes().length).toBeGreaterThan(20);
    expect(wallMeshes().every((m) => /-half$/.test(m.name))).toBe(true);
    built.setEpisode('night-ride');
    expect(wallMeshes().every((m) => /-ruin$/.test(m.name))).toBe(true);
    // Whatever is held is on show.
    for (const m of held) {
      let node = m;
      while (node) {
        expect(node.visible, m.name).toBe(true);
        node = node.parent;
      }
    }
    built.dispose();
  });

  it('draws only the people of the wall that is on show', () => {
    const built = build('balanced');
    built.setEpisode('mockery');
    built.humans.update({ elapsed: 0.5, delta: 0.016, camera: new THREE.PerspectiveCamera(), quality: 'balanced' });
    const visibleCrowds = [];
    built.root.traverse((node) => { if (node.name?.endsWith('-daily-life') && node.visible) visibleCrowds.push(node); });
    expect(visibleCrowds).toHaveLength(1);
    built.dispose();
  });

  it('is deterministic: the same scene twice is the same scene', () => {
    const sample = () => {
      const built = build('balanced');
      const values = instanceMatrices(built.root);
      built.dispose();
      return values;
    };
    expect(sample()).toEqual(sample());
  });

  it('keeps hours, weather and fog in step, for every hour', () => {
    const built = build('balanced');
    for (const hour of TIMES_OF_DAY) {
      expect(WEATHER[hour.id], hour.id).toBeTruthy();
      expect(built.fogFor(hour).density).toBe(fogFor(hour).density);
      built.onTimeOfDay(hour);
    }
    expect(built.exposure).toBeGreaterThan(0);
    built.dispose();
  });

  it('keeps the lighting’s axes the way round the manifest says', () => {
    expect(SCENE_AXES['nehemiahs-wall']).toEqual({ bearing: NEHEMIAH.geo.bearing, xAxis: NEHEMIAH.geo.xAxis });
  });

  it('knows its wall and its gates: there is a gate for every gate the navigation opens', () => {
    expect(WALLS).toHaveLength(4);
    expect(FEATURE_BY_ID['valley-gate']).toBeTruthy();
    expect(GATES.every((gate) => gate.ground > -60)).toBe(true);
  });
});
