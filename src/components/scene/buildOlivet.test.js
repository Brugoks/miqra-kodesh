import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import buildOlivet, { WEATHER, fogFor, smokeSources } from './buildOlivet';
import { createOlivetLandscape, terrainHeight, sameGround, landUse } from './olivetLandscape';
import { createOlivetCity, ALTAR_TOP } from './olivetCity';
import { HORIZON_RIBBONS } from './olivetHorizonData';
import { OLIVET_EVENT_STAGES, inOlivetEventArea } from './olivetEvents';
import {
  WALK, PLATFORM, TEMPLE_FRAME, groundAt, groveOlives, insidePolygon, GARDEN_OLIVES, CITY_QUARTERS,
} from './olivetDimensions';
import { floorAt, blockerAt } from './olivetNavigation';
import { TIMES_OF_DAY, applyLighting, headingToScene, SCENE_AXES } from './sceneLighting';
import { OLIVET } from '../../lib/olivetScene';

// The Mount of Olives, built for real in jsdom (without the character models,
// which olivetEvents.test.js loads). Nothing here can be looked at in CI, so
// these hold what a look would check: the drawn ground and the walked ground
// are one surface, the far skyline is where the compass says, the Temple
// stands where the platform is, the people stand where people can stand, and
// the whole thing builds the same every time and takes itself apart cleanly.

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

  it('draws every tree the navigation makes solid, and the garden’s old ones', () => {
    const landscape = createOlivetLandscape(THREE, { quality: 'balanced' });
    expect(landscape.counts.near).toBe(groveOlives().length);
    expect(landscape.counts.garden).toBe(GARDEN_OLIVES.length);
    let trunks = 0;
    landscape.group.traverse((node) => {
      if (node.isInstancedMesh && node.name.startsWith('olive-trunks-') && !node.name.includes('far')) trunks += node.count;
    });
    expect(trunks).toBe(groveOlives().length);
    landscape.dispose();
  });

  it('builds without a NaN at any quality and disposes what it made', () => {
    for (const quality of ['low', 'balanced', 'high']) {
      const landscape = createOlivetLandscape(THREE, { quality });
      expect(instanceMatrices(landscape.group).every(Number.isFinite), quality).toBe(true);
      const geometries = [];
      landscape.group.traverse((node) => { if (node.geometry) geometries.push(vi.spyOn(node.geometry, 'dispose')); });
      landscape.dispose();
      expect(geometries.every((spy) => spy.mock.calls.length > 0), quality).toBe(true);
    }
  });

  it('flattens the Temple platform to its court, and leaves the Kidron in its bed', () => {
    expect(terrainHeight(-400, 150)).toBeCloseTo(PLATFORM.level - 0.3, 5);
    expect(landUse(-100, 250)).toBe('kidron');
    expect(landUse(-400, 150)).toBe('city');
  });

  it('puts the far skyline at its true bearings, the Dead Sea and Moab east of the summit', () => {
    const byId = Object.fromEntries(HORIZON_RIBBONS.map((ribbon) => [ribbon.id, ribbon]));
    const bearings = (id) => byId[id].points.map((p) => p[0]);
    for (const b of bearings('moab')) expect(b > 30 && b < 160).toBe(true);
    for (const b of bearings('west-hills')) expect(b > 190 && b < 350).toBe(true);
    // A band of water, below Moab's skyline, from the summit.
    expect(byId['dead-sea'].points.length).toBeGreaterThan(10);
    for (const [bearing, top, , bottom] of byId['dead-sea'].points) {
      expect(bearing > 80 && bearing < 160).toBe(true);
      expect(top).toBeGreaterThan(bottom);
    }
    // East is +X, north is -Z.
    const east = headingToScene(90, SCENE_AXES['mount-of-olives']);
    const north = headingToScene(0, SCENE_AXES['mount-of-olives']);
    expect(east.x).toBeCloseTo(1, 6);
    expect(north.z).toBeCloseTo(-1, 6);
  });

  it('carries the skyline at the camera’s height, since the eye climbs a hundred metres', () => {
    const lighting = applyLighting(THREE, new THREE.Group(), { slug: 'mount-of-olives' });
    const landscape = createOlivetLandscape(THREE, { quality: 'low', lighting });
    const ribbons = landscape.group.getObjectByName('horizon-ribbons');
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(540, 104, 30);
    landscape.update(1, 0.016, { camera });
    expect(ribbons.position.toArray()).toEqual([540, 104, 30]);
    landscape.dispose();
  });
});

describe('the city across the valley', () => {
  const city = createOlivetCity(THREE, { quality: 'high', terrainHeight });

  it('stands the sanctuary on the rock under the Dome of the Rock, facing up the Mount', () => {
    // The Holy of Holies, about forty-seven metres behind the porch front, at
    // the Dome's site; the altar on the platform, east of it.
    expect(TEMPLE_FRAME.x - 47).toBeCloseTo(-430, 0);
    expect(TEMPLE_FRAME.z).toBe(185);
    expect(insidePolygon(ALTAR_TOP.x, ALTAR_TOP.z, PLATFORM.corners)).toBe(true);
    expect(ALTAR_TOP.x).toBeGreaterThan(TEMPLE_FRAME.x);
  });

  it('builds its houses on the city’s hills, none on the Temple platform', () => {
    const houses = city.group.getObjectByName('city-houses');
    expect(houses.count).toBeGreaterThan(1500);
    const matrix = new THREE.Matrix4();
    const at = new THREE.Vector3();
    for (let i = 0; i < houses.count; i += 1) {
      houses.getMatrixAt(i, matrix);
      at.setFromMatrixPosition(matrix);
      expect(insidePolygon(at.x, at.z, PLATFORM.corners)).toBe(false);
      expect(CITY_QUARTERS.some((q) => insidePolygon(at.x, at.z, q.points))).toBe(true);
    }
    expect(instanceMatrices(city.group).every(Number.isFinite)).toBe(true);
  });
});

describe('buildOlivet', () => {
  const build = (quality = 'balanced', options = {}) => buildOlivet(THREE, { quality, motionLibrary: null, ...options });

  it('builds at every quality with nothing out of place', () => {
    for (const quality of ['low', 'balanced', 'high']) {
      const built = build(quality);
      expect(instanceMatrices(built.root).every(Number.isFinite), quality).toBe(true);
      for (const name of ['garden-wall', 'camp-tents', 'farmstead', 'press-rock', 'absaloms-pillar', 'garden-olive-trunks', 'fig-trunks']) {
        expect(built.cameraColliders, `${quality}: ${name}`).toContain(built.root.getObjectByName(name));
      }
      expect(built.cameraColliders).not.toContain(built.root.getObjectByName('garden-olive-crowns'));
      expect(built.occluders).toContain(built.root.getObjectByName('farmstead'));
      built.dispose();
    }
  });

  it('is the same Mount every time', () => {
    const a = build();
    const b = build();
    expect(instanceMatrices(b.root)).toEqual(instanceMatrices(a.root));
    a.dispose();
    b.dispose();
  });

  it('stages each of the manifest’s events, one at a time', () => {
    const built = build();
    expect(built.episodes).toEqual(OLIVET.events.map((event) => event.id));
    expect(Object.keys(OLIVET_EVENT_STAGES)).toEqual(built.episodes);
    for (const id of built.episodes) {
      expect(built.setEpisode(id)).toBe(id);
      expect(built.getEpisode()).toBe(id);
    }
    expect(built.setEpisode('nothing')).toBeNull();
    built.dispose();
  });

  it('stands its people where people can stand, off every event’s ground', () => {
    const built = build('high');
    expect(built.figures.length).toBeGreaterThan(40);
    for (const figure of built.figures) {
      const points = figure.route || [[figure.x, figure.z]];
      for (const [x, z] of points) {
        expect(floorAt(x, z), figure.id).toBeTruthy();
        expect(inOlivetEventArea(x, z), figure.id).toBe(false);
      }
      if (!figure.route) expect(blockerAt(figure.x, figure.z), figure.id).toBeNull();
    }
    // Most of those standing about move by captured motion (walkers keep
    // the baked walk).
    expect(built.figures.filter((figure) => figure.motion).length).toBeGreaterThan(15);
    // Pilgrims on the road, and people at the camps.
    expect(built.figures.filter((figure) => figure.route).length).toBeGreaterThan(10);
    expect(built.figures.some((figure) => figure.id.startsWith('olivet-camp'))).toBe(true);
    built.dispose();
  });

  it('sends up the altar’s smoke where the altar is, and lies mist in the valley at dawn', () => {
    const [altar] = smokeSources();
    expect(altar.x).toBe(ALTAR_TOP.x);
    expect(altar.scale).toBeGreaterThan(3);
    expect(WEATHER.dawn.mist).toBe(1);
    expect(WEATHER.noon.mist).toBe(0);
    const built = build();
    const mist = built.root.getObjectByName('olivet-air-mist');
    expect(mist.children.length).toBeGreaterThan(0);
    for (const sheet of mist.children) expect(sheet.position.y).toBeLessThan(groundAt(0, 0));
    built.dispose();
  });

  it('offers the builder hooks, and changes the hour without rebuilding', () => {
    const built = build();
    for (const time of Object.values(TIMES_OF_DAY)) {
      const fog = built.fogFor(time);
      expect(fog.color.every(Number.isFinite)).toBe(true);
      expect(fog.density).toBe(fogFor(time).density);
      built.onTimeOfDay(time);
    }
    expect(built.shadowFollow.extent).toBeGreaterThan(20);
    expect(typeof built.prepareRenderer).toBe('function');
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(262, 68.8, 186);
    built.update(3, 0.016, { camera, walker: null, view: 'first' });
    expect(built.lighting.sky.position.toArray()).toEqual(camera.position.toArray());
    expect(built.lighting.sky.geometry.parameters.radius).toBeGreaterThan(Math.max(...HORIZON_RIBBONS.map((r) => r.D)));
    expect(built.lighting.sky.userData.excludeFromAO).toBe(true);
    expect(built.root.getObjectByName('horizon-ribbons').userData.excludeFromAO).toBe(true);
    expect(instanceMatrices(built.root).every(Number.isFinite)).toBe(true);
    built.dispose();
  });

  it('keeps the same lights whatever is staged, so staging never recompiles the scene', () => {
    const built = build('high');
    const count = () => { let n = 0; built.root.traverse((node) => { if (node.isLight) n += 1; }); return n; };
    const before = count();
    expect(built.firelight).toHaveLength(3);
    for (const id of built.episodes) {
      built.setEpisode(id);
      built.update(1, 0.016, { camera: new THREE.PerspectiveCamera(), walker: null, view: 'first' });
      expect(count(), id).toBe(before);
    }
    // Nothing staged, nothing lit.
    built.setEpisode(null);
    built.update(2, 0.016, { camera: new THREE.PerspectiveCamera(), walker: null, view: 'first' });
    expect(built.firelight.every((lamp) => lamp.intensity === 0)).toBe(true);
    const low = build('low');
    expect(low.firelight).toHaveLength(0);
    low.dispose();
    built.dispose();
  });

  it('takes itself apart, geometry and all', () => {
    const built = build();
    const spies = [];
    built.root.traverse((node) => { if (node.geometry) spies.push(vi.spyOn(node.geometry, 'dispose')); });
    built.dispose();
    const undisposed = spies.filter((spy) => spy.mock.calls.length === 0).length;
    expect(undisposed).toBe(0);
  });
});
