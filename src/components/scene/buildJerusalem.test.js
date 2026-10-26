import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import buildJerusalem, { WEATHER, fogFor } from './buildJerusalem';
import { ENTRY_COLT_BACK, JERUSALEM_EVENT_STAGES, JERUSALEM_POSES } from './jerusalemEvents';
import { terrainHeight, eventFloorAt, topographicRegion, TOPOGRAPHY } from './jerusalemTopography';
import { MOTION_URL } from './sceneMixamo';
import { JERUSALEM } from '../../lib/jerusalemScene';
import { blockerAt } from './jerusalemNavigation';
import { WALL_RECTS } from './jerusalemDimensions';

const matrixValues = (root) => {
  const values = [];
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (node.isInstancedMesh) values.push(...node.instanceMatrix.array.slice(0, node.count * 16));
    else if (node.isMesh) values.push(...node.matrixWorld.elements);
  });
  return values;
};

describe('Jerusalem topography', () => {
  it('keeps the historically meaningful ridges and valleys in their relative places', () => {
    const templeRidge = terrainHeight(52, -35);
    const cityOfDavid = terrainHeight(52, 130);
    const tyropoeon = terrainHeight(-12, 25);
    const westernHill = terrainHeight(-70, 25);
    const kidron = terrainHeight(TOPOGRAPHY.kidronX, -5);
    const olives = terrainHeight(TOPOGRAPHY.mountOfOlives.x, -5);
    expect(templeRidge).toBeGreaterThan(cityOfDavid);
    expect(westernHill).toBeGreaterThan(tyropoeon);
    expect(olives).toBeGreaterThan(kidron + 10);
    expect(topographicRegion(150, 0)).toBe('kidron-valley');
    expect(topographicRegion(212, 0)).toBe('mount-of-olives');
  });

  it('gives the eastern approach a continuous walkable grade instead of a trench', () => {
    const samples = Array.from({ length: 32 }, (_, i) => terrainHeight(100 + i * 4, 28));
    const steepestGrade = Math.max(...samples.slice(1).map((height, i) => Math.abs(height - samples[i]) / 4));
    expect(steepestGrade).toBeLessThan(0.28);
  });

  it('places elevated Temple and upper-room tableaus on their own floors', () => {
    expect(eventFloorAt(62, -12)).toBe(12);
    expect(eventFloorAt(-50, 25)).toBeGreaterThan(terrainHeight(-50, 25) + 4);
  });
});

describe('immersive Jerusalem build', () => {
  it.each(['low', 'balanced', 'high'])('builds finite geometry at %s quality', (quality) => {
    const built = buildJerusalem(THREE, { quality, motionLibrary: null });
    expect(matrixValues(built.root).every(Number.isFinite)).toBe(true);
    expect(built.root.getObjectByName('jerusalem-topography')).toBeTruthy();
    expect(built.root.getObjectByName('tyropoeon-stepped-street')).toBeTruthy();
    expect(built.root.getObjectByName('kidron-channel')).toBeTruthy();
    expect(built.root.getObjectByName('temple-sanctuary')).toBeTruthy();
    expect(built.root.getObjectByName('jerusalem-air')).toBeTruthy();
    expect(built.figures.length).toBeGreaterThan(20);
    const approach = built.root.getObjectByName('eastern-pilgrim-road');
    expect(approach.geometry.attributes.position.count).toBeGreaterThan(100);
    for (const name of ['eastern-pilgrim-road', 'tyropoeon-stepped-street', 'upper-city-road', 'western-gate-road']) {
      const vertices = built.root.getObjectByName(name).geometry.attributes.position;
      const overlaps = [];
      for (let i = 0; i < vertices.count; i += 1) {
        const x = vertices.getX(i), z = vertices.getZ(i), blocked = blockerAt(x, z);
        if (blocked) overlaps.push({ x, z, blocked });
      }
      expect(overlaps, `${name} intersects architecture`).toEqual([]);
    }
    built.dispose();
  });

  it('fills the eastern approach and gives the colt readable anatomy and tack', () => {
    const built = buildJerusalem(THREE, { quality: 'high', motionLibrary: null });
    expect(built.figures.filter((figure) => figure.id.startsWith('eastern-pilgrim-')).length).toBe(48);
    expect(JERUSALEM_EVENT_STAGES['entry-gate'].cast.length).toBeGreaterThanOrEqual(30);
    expect(ENTRY_COLT_BACK).toBeGreaterThan(1.2);
    expect(built.root.getObjectByName('entry-colt-muzzles')).toBeTruthy();
    expect(built.root.getObjectByName('entry-colt-hooves')).toBeTruthy();
    expect(built.root.getObjectByName('entry-colt-cloaks-and-tack')).toBeTruthy();
    expect(built.root.getObjectByName('entry-colt-rein')).toBeTruthy();
    built.dispose();
  });

  it('offers every Gospel event as a lazily staged tableau', () => {
    const built = buildJerusalem(THREE, { quality: 'low', motionLibrary: null });
    expect(built.episodes).toEqual(JERUSALEM.events.map((event) => event.id));
    expect(built.setEpisode('gethsemane')).toBe('gethsemane');
    expect(built.getEpisode()).toBe('gethsemane');
    expect(built.getEpisodeStage('gethsemane').isActive()).toBe(true);
    built.dispose();
  });

  it('updates air, people, animals and birds without moving in reduced motion', () => {
    const built = buildJerusalem(THREE, { quality: 'balanced', motionLibrary: null, reducedMotion: true });
    expect(() => built.update(4, 0.016, { camera: new THREE.PerspectiveCamera() })).not.toThrow();
    built.dispose();
  });

  it('provides hour-specific haze for the scene atmosphere', () => {
    expect(Object.keys(WEATHER)).toEqual(expect.arrayContaining(['dawn', 'morning', 'noon', 'dusk', 'night']));
    expect(fogFor({ id: 'dawn', sky: { low: [1, 0.8, 0.6], high: [0.2, 0.4, 0.7] } }).density)
      .toBeGreaterThan(fogFor({ id: 'noon', sky: { low: [1, 0.8, 0.6], high: [0.2, 0.4, 0.7] } }).density);
  });
});

describe('Jerusalem event motion', () => {
  const library = JSON.parse(readFileSync(resolve('public', MOTION_URL.slice(1)), 'utf8'));
  const keys = new Set(Object.keys(library.clips));

  it('uses only shipped Mixamo captures and authored poses', () => {
    for (const [id, stage] of Object.entries(JERUSALEM_EVENT_STAGES)) {
      expect(stage.cast.some((entry) => entry.principal), id).toBe(true);
      for (const entry of stage.cast) {
        if (entry.motion) expect(keys.has(entry.motion), `${id}: ${entry.motion}`).toBe(true);
        if (entry.pose) expect(JERUSALEM_POSES[entry.pose], `${id}: ${entry.pose}`).toBeTypeOf('function');
      }
    }
  });
});

describe('Jerusalem physical consistency', () => {
  it('keeps each event cast out of solid architecture', () => {
    for (const [id, stage] of Object.entries(JERUSALEM_EVENT_STAGES)) {
      for (const entry of stage.cast) {
        expect(blockerAt(entry.position[0], entry.position[2]), `${id}/${entry.id}`).toBeNull();
      }
    }
  });

  it('supports every staged figure on the visible floor within 5cm', () => {
    const built = buildJerusalem(THREE, { quality: 'low', motionLibrary: null });
    const floors = [];
    built.root.traverse((mesh) => {
      if (['jerusalem-topography', 'temple-platform', 'upper-room-floor'].includes(mesh.name)) floors.push(mesh);
    });
    built.root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (const [id, stage] of Object.entries(JERUSALEM_EVENT_STAGES)) for (const actor of stage.cast) {
      if (actor.lift) continue;
      const [x, y, z] = actor.position;
      ray.set(new THREE.Vector3(x, y + 0.1, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(floors, false)[0];
      expect(hit, `${id}/${actor.id}: missing floor`).toBeTruthy();
      expect(Math.abs(hit.point.y - y), `${id}/${actor.id}: feet/floor gap`).toBeLessThan(0.05);
    }
    for (const view of [...JERUSALEM.events, ...JERUSALEM.vantages]) {
      const origin = new THREE.Vector3(...view.position);
      const direction = new THREE.Vector3(...view.lookAt).sub(origin);
      ray.far = direction.length() - 0.25;
      ray.set(origin, direction.normalize());
      const hit = ray.intersectObjects([...floors, ...built.occluders], false)[0];
      expect(hit?.object.name, `${view.id}: viewpoint obstructed`).toBeUndefined();
    }
    built.dispose();
  }, 15000);

  it('builds continuous full-thickness walls down to the terrain', () => {
    const built = buildJerusalem(THREE, { quality: 'low', motionLibrary: null });
    const walls = []; built.root.traverse((mesh) => { if (mesh.name === 'city-wall') walls.push(mesh); });
    const wallBounds = walls.map((wall) => new THREE.Box3().setFromObject(wall));
    for (const [x0, x1, z0, z1] of WALL_RECTS) {
      for (let t = 0.01; t < 1; t += 0.03) {
        const x = x1 - x0 > z1 - z0 ? x0 + (x1 - x0) * t : (x0 + x1) / 2;
        const z = x1 - x0 > z1 - z0 ? (z0 + z1) / 2 : z0 + (z1 - z0) * t;
        const point = new THREE.Vector3(x, terrainHeight(x, z) + 0.05, z);
        expect(wallBounds.some((bounds) => bounds.containsPoint(point)), `wall gap at ${x},${z}`).toBe(true);
      }
    }
    built.dispose();
  });
});
