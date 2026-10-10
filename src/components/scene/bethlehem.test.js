import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import buildBethlehem from './buildBethlehem';
import { BETHLEHEM } from '../../lib/bethlehemScene';
import { getScene, sceneForPlace } from '../../lib/scenes';
import { sceneModule } from './sceneModules';
import { floorAt, stanceAt, blockerAt, move, groundPointAlongRay, enclosureAt } from './bethlehemNavigation';
import { TIMES_OF_DAY } from './sceneLighting';
import { HOUSES, WALLS, PATHS, groundAt, MANGER, BOUNDS } from './bethlehemDimensions';
import { BETHLEHEM_CASTS, BETHLEHEM_STAGES } from './bethlehemEvents';
import {
  createThirdPersonRig,
  thirdPersonAim,
  PIVOT_HEIGHT,
  FLOOR_CLEARANCE,
  THIRD_PERSON_NEAR,
} from './sceneThirdPerson';
import { SCENE_ASSET_MANIFEST } from './sceneAssetManifest';
import { SCENE_SOURCES_DATA } from './sceneSourcesData';
import { surfaceForRegion } from '../../lib/sceneAudio';

describe('Bethlehem integration and navigation', () => {
  it('registers a distinct scene on the Judean Bethlehem atlas place', () => {
    expect(getScene('bethlehem')).toBe(BETHLEHEM);
    expect(sceneForPlace('bethlehem-1')).toBe(BETHLEHEM);
    expect(sceneModule('bethlehem').defaultView).toBe('third');
    expect(sceneModule('bethlehem').thirdPerson).toBe(true);
    expect(SCENE_SOURCES_DATA.bethlehem.length).toBeGreaterThan(3);
    const shipped = new Set(SCENE_ASSET_MANIFEST.bethlehem.models.map((m) => m.id));
    for (const cast of Object.values(BETHLEHEM_CASTS))
      for (const actor of cast) expect(shipped.has(actor.model)).toBe(true);
  });
  it('gives every vantage, event and actor a valid floor', () => {
    for (const item of [...BETHLEHEM.vantages, ...BETHLEHEM.events]) {
      const [x, y, z] = item.position;
      expect(stanceAt(x, z), item.id).toBeTruthy();
      expect(y, item.id).toBeCloseTo(groundAt(x, z) + 1.7, 6);
    }
    for (const cast of Object.values(BETHLEHEM_CASTS))
      for (const actor of cast) {
        const [x, y, z] = actor.position;
        expect(stanceAt(x, z), actor.id).toBeTruthy();
        expect(y).toBe(groundAt(x, z));
      }
    expect(surfaceForRegion(floorAt(60, 42).region)).toBe('earth');
  });
  it('walks every route from the approach to the shelter and fields', () => {
    for (const path of PATHS) {
      let walker = stanceAt(...path[0]);
      expect(walker).toBeTruthy();
      for (const [x, z] of path.slice(1)) {
        walker = move(walker, x - walker.x, z - walker.z);
        expect(walker.x).toBeCloseTo(x, 3);
        expect(walker.z).toBeCloseTo(z, 3);
      }
    }
  });
  it('refuses buildings, cave walls, the trough and out-of-bounds points', () => {
    for (const b of [...HOUSES, ...WALLS])
      expect(blockerAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)).toBeTruthy();
    expect(blockerAt(MANGER.x, MANGER.z)).toBe('manger');
    expect(floorAt(NaN, 0)).toBeNull();
    expect(stanceAt(BOUNDS.x1 + 1, 0)).toBeNull();
    const hit = groundPointAlongRay({ x: 4, y: 20, z: 60 }, { x: 0, y: -1, z: 0 });
    expect(hit.height).toBeCloseTo(groundAt(4, 60), 6);
    const walker = move(stanceAt(-10, -28), 0, -40);
    expect(walker.z).toBeGreaterThan(-34.2);
  });
  it('softens outdoor ambience inside the shelter', () => {
    expect(enclosureAt(-10, -23)).toBe(0);
    expect(enclosureAt(-10, -25)).toBeCloseTo(0.8 / 3);
    expect(enclosureAt(-10, -30)).toBe(0.8);
    expect(enclosureAt(-10, -30, 12)).toBe(0);
    expect(enclosureAt(NaN, -30)).toBe(0);
  });
});

describe('Bethlehem geometry and camera', () => {
  let built;
  beforeAll(() => {
    built = buildBethlehem(THREE, { quality: 'low', motionLibrary: null });
  });
  it('keeps the daily walkers on open lanes and gives neighbors alternating speaking turns', () => {
    const figures = built.dailyLife.figures;
    expect(figures.filter((f) => f.conversationId === 'bethlehem-well').map((f) => f.conversationSlot)).toEqual([0, 1]);
    const routes = figures.filter((f) => f.route);
    expect(routes).toHaveLength(2);
    for (const { route: [a, b] } of routes) {
      for (let i = 0; i <= 80; i++) {
        expect(stanceAt(a[0] + (b[0] - a[0]) * i / 80, a[1] + (b[1] - a[1]) * i / 80)).toBeTruthy();
      }
    }
  });
  afterAll(() => built.dispose());
  it('provides finite linear fog colors for every time of day', () => {
    for (const time of TIMES_OF_DAY) {
      const fog = built.fogFor(time);
      expect(fog.color).toHaveLength(3);
      expect(fog.color.every((c) => Number.isFinite(c) && c >= 0 && c <= 1)).toBe(true);
      expect(fog.density).toBeGreaterThan(0);
      built.onTimeOfDay(time);
    }
  });
  it('renders the floor used by navigation, with finite geometry at both qualities', () => {
    const floor = built.root.getObjectByName('walkable-ground');
    const positions = floor.geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 19)
      expect(positions.getY(i)).toBeCloseTo(groundAt(positions.getX(i), positions.getZ(i)), 5);
    built.root.traverse((node) => {
      if (node.geometry)
        expect(Array.from(node.geometry.attributes.position.array).every(Number.isFinite), node.name).toBe(
          true,
        );
      if (node.isInstancedMesh)
        expect(Array.from(node.instanceMatrix.array).every(Number.isFinite), node.name).toBe(true);
    });
    const high = buildBethlehem(THREE, { quality: 'high', motionLibrary: null });
    high.update(3, 0.016);
    high.dispose();
  });
  it('keeps the follow camera clear of walls and above the floor at every stop', () => {
    const rig = createThirdPersonRig(THREE, { colliders: built.cameraColliders, floorAt });
    const ray = new THREE.Raycaster(),
      anchor = new THREE.Vector3(),
      direction = new THREE.Vector3();
    for (const item of [...BETHLEHEM.vantages, ...BETHLEHEM.events]) {
      const [x, y, z] = item.position,
        stance = stanceAt(x, z),
        aim = thirdPersonAim(item.position, item.lookAt);
      for (const turn of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        const frame = {
          x,
          y: stance.height + PIVOT_HEIGHT,
          z,
          walkerFloor: stance.height,
          yaw: aim.yaw + turn,
          pitch: aim.pitch,
          distance: 3.8,
          fov: 60,
          aspect: 16 / 10,
          near: THIRD_PERSON_NEAR,
        };
        const camera = rig.settle(frame);
        expect(camera.y, item.id).toBeGreaterThanOrEqual(
          (floorAt(camera.x, camera.z)?.height ?? y - 1.7) + FLOOR_CLEARANCE - 1e-6,
        );
        anchor.set(frame.x, frame.y, frame.z);
        const reach = direction.subVectors(camera, anchor).length();
        ray.set(anchor, direction.multiplyScalar(1 / reach));
        ray.far = reach - 1e-4;
        expect(ray.intersectObjects(built.cameraColliders, false), item.id).toHaveLength(0);
      }
    }
  });
  it('separates the manger, shepherds, Magi and flight episodes', () => {
    expect(new Set(built.episodes)).toEqual(new Set(BETHLEHEM.events.map((e) => e.id)));
    expect(BETHLEHEM_STAGES['magi-visit']).not.toContain('family');
    expect(BETHLEHEM_STAGES['shepherds-visit']).not.toContain('magi');
    built.setEpisode('birth');
    expect(built.root.getObjectByName('infant-in-manger').visible).toBe(true);
    built.setEpisode('magi-visit');
    expect(built.root.getObjectByName('infant-in-manger').visible).toBe(false);
    expect(built.root.getObjectByName('magi-star').visible).toBe(true);
    built.setEpisode('flight');
    expect(built.root.getObjectByName('magi-star').visible).toBe(false);
    expect(built.setEpisode('not-an-event')).toBe(false);
  });
  it('releases shared geometry exactly once and freezes motion when requested', () => {
    const world = buildBethlehem(THREE, { quality: 'low', reducedMotion: true });
    const fire = world.root.getObjectByName('watch-fire');
    world.update(1);
    const scale = fire.scale.clone();
    world.update(100);
    expect(fire.scale.equals(scale)).toBe(true);
    const dispose = vi.spyOn(world.root.getObjectByName('north-house').geometry, 'dispose');
    world.dispose();
    world.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
