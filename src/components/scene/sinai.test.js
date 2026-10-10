import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as THREE from 'three';
import buildSinai from './buildSinai';
import { SINAI } from '../../lib/sinaiScene';
import { getScene, sceneForPlace } from '../../lib/scenes';
import { sceneModule } from './sceneModules';
import { stanceAt, floorAt, move, enclosureAt } from './sinaiNavigation';
import { PATHS, SITES, groundAt } from './sinaiDimensions';
import { SINAI_CASTS } from './sinaiEvents';
import { SCENE_ASSET_MANIFEST } from './sceneAssetManifest';
import { AVATAR_MODELS } from './scenePlayerAvatar';
import { TIMES_OF_DAY } from './sceneLighting';
import {
  createThirdPersonRig,
  thirdPersonAim,
  PIVOT_HEIGHT,
  FLOOR_CLEARANCE,
  THIRD_PERSON_NEAR,
} from './sceneThirdPerson';

describe('Sinai across the biblical narrative', () => {
  let built;
  beforeAll(() => {
    built = buildSinai(THREE, { quality: 'low' });
  });
  afterAll(() => built.dispose());
  it('registers separately from the architectural Tabernacle scene', () => {
    expect(getScene('sinai')).toBe(SINAI);
    expect(sceneForPlace('sinai')).toBe(SINAI);
    expect(sceneForPlace('mount-sinai').slug).toBe('tabernacle');
    expect(sceneModule('sinai').defaultView).toBe('third');
    expect(sceneModule('sinai').thirdPerson).toBe(true);
    expect(new Set(built.episodes)).toEqual(new Set(SINAI.events.map((e) => e.id)));
    const shipped = new Set(SCENE_ASSET_MANIFEST.sinai.models.map((m) => m.id));
    expect(AVATAR_MODELS.some((id) => shipped.has(id))).toBe(true);
    for (const cast of Object.values(SINAI_CASTS))
      for (const actor of cast) expect(shipped.has(actor.model)).toBe(true);
  });
  it('places every event, vantage and principal on valid ground', () => {
    for (const item of [...SINAI.vantages, ...SINAI.events]) {
      const [x, y, z] = item.position;
      expect(stanceAt(x, z), item.id).toBeTruthy();
      expect(y).toBeCloseTo(groundAt(x, z) + 1.7, 6);
      built.setEpisode(item.event || item.id);
      expect(built.humans.queryClearance(x, z, 0.4, y - 1.7).collides, item.id).toBe(false);
    }
    for (const cast of Object.values(SINAI_CASTS))
      for (const actor of cast) {
        const [x, y, z] = actor.position;
        expect(stanceAt(x, z), actor.id).toBeTruthy();
        expect(y).toBeCloseTo(groundAt(x, z), 6);
      }
  });
  it('connects the camp, mountain, cleft, cave and rock on walkable paths', () => {
    for (const path of PATHS) {
      let walker = stanceAt(...path[0]);
      expect(walker).toBeTruthy();
      for (const [x, z] of path.slice(1)) {
        walker = move(walker, x - walker.x, z - walker.z);
        expect(walker.x, JSON.stringify([x, z])).toBeCloseTo(x, 3);
        expect(walker.z).toBeCloseTo(z, 3);
      }
    }
    expect(enclosureAt(47, -97)).toBe(0.85);
    expect(enclosureAt(47, -87)).toBe(0);
    expect(stanceAt(40.5, -95)).toBeNull();
    expect(floorAt(NaN, 0)).toBeNull();
  });
  it('renders navigation heights and finite fog at all times', () => {
    const p = built.root.getObjectByName('walkable-ground').geometry.attributes.position;
    for (let i = 0; i < p.count; i += 23) expect(p.getY(i)).toBeCloseTo(groundAt(p.getX(i), p.getZ(i)), 4);
    for (const time of TIMES_OF_DAY) {
      expect(built.fogFor(time).color).toHaveLength(3);
      expect(built.fogFor(time).color.every(Number.isFinite)).toBe(true);
      built.onTimeOfDay(time);
    }
    built.update(2);
    built.root.traverse((node) => {
      if (node.isSprite) expect(node.userData.excludeFromAO).toBe(true);
      if (node.geometry)
        expect(Array.from(node.geometry.attributes.position.array).every(Number.isFinite), node.name).toBe(
          true,
        );
      if (node.isInstancedMesh)
        expect(Array.from(node.instanceMatrix.array).every(Number.isFinite), node.name).toBe(true);
    });
  });

  it('keeps daily walking routes clear throughout the camp eras and hides them for Elijah', () => {
    const routes = built.dailyLife.figures.filter((figure) => figure.route);
    expect(routes).toHaveLength(3);
    for (const episode of ['revelation', 'craftsmen', 'tabernacle-raised', 'passover', 'departure']) {
      built.setEpisode(episode);
      for (const figure of routes) {
        const [a, b] = figure.route;
        for (let i = 0; i <= 80; i++) {
          const x = a[0] + (b[0] - a[0]) * i / 80, z = a[1] + (b[1] - a[1]) * i / 80;
          expect(stanceAt(x, z), `${episode} ${figure.id} ${x},${z}`).toBeTruthy();
          expect(built.humans.queryClearance(x, z, 0.4, groundAt(x, z)).collides, `${episode} ${figure.id} ${x},${z}`).toBe(false);
        }
      }
    }
    built.setEpisode('elijah-cave');
    built.dailyLife.update({ elapsed: 0, delta: 0 });
    expect(built.dailyLife.group.visible).toBe(false);
    expect(built.dailyLife.queryClearance(-38, 96).collides).toBe(false);
  });
  it('buries every distant ridge base in the terrain', () => {
    built.root.traverse((node) => {
      if (!node.name.startsWith('granite-ridge-')) return;
      const p = node.geometry.attributes.position,
        h = node.geometry.parameters.height;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) >= -h * 0.45) continue;
        expect(node.position.y + p.getY(i)).toBeLessThan(
          groundAt(node.position.x + p.getX(i), node.position.z + p.getZ(i)),
        );
      }
    });
  });
  it('keeps the follow camera clear of walls and above the floor at every stop', () => {
    const rig = createThirdPersonRig(THREE, { colliders: built.cameraColliders, floorAt });
    const ray = new THREE.Raycaster(),
      anchor = new THREE.Vector3(),
      direction = new THREE.Vector3();
    for (const item of [...SINAI.vantages, ...SINAI.events]) {
      built.setEpisode(item.event || item.id);
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
  it('keeps earlier, covenant, sanctuary and Elijah settings distinct', () => {
    const visible = (name) => built.root.getObjectByName(name).visible;
    built.setEpisode('burning-bush');
    expect(visible('bush-fire')).toBe(true);
    expect(visible('israel-camp')).toBe(false);
    built.setEpisode('golden-calf');
    expect(visible('golden-calf')).toBe(true);
    expect(visible('tabernacle')).toBe(false);
    built.setEpisode('broken-tablets');
    expect(visible('golden-calf')).toBe(false);
    expect(visible('broken-tablets')).toBe(true);
    built.setEpisode('meeting-tent');
    expect(visible('outside-meeting-tent')).toBe(true);
    expect(visible('tabernacle')).toBe(false);
    built.setEpisode('tabernacle-raised');
    expect(visible('outside-meeting-tent')).toBe(false);
    expect(visible('tabernacle')).toBe(true);
    built.setEpisode('departure');
    expect(visible('tabernacle')).toBe(false);
    expect(visible('packed-for-departure')).toBe(true);
    built.setEpisode('elijah-voice');
    expect(visible('israel-camp')).toBe(false);
    expect(visible('elijah-fire')).toBe(false);
    expect(visible('mountain-cloud')).toBe(false);
    expect(visible('pillar-of-cloud')).toBe(false);
    expect(built.setEpisode('bad-id')).toBe(false);
    expect(built.getEpisode()).toBe('elijah-voice');
  });
  it('removes camp and sanctuary collision envelopes with their era', () => {
    built.setEpisode('tabernacle-raised');
    expect(built.humans.queryClearance(48, 77).collides).toBe(true);
    expect(built.humans.queryClearance(-59, 111).collides).toBe(true);
    expect(built.cameraColliders.some((m) => m.name === 'tabernacle-structure')).toBe(true);
    built.setEpisode('elijah-cave');
    expect(built.humans.queryClearance(48, 77).collides).toBe(false);
    expect(built.humans.queryClearance(-59, 111).collides).toBe(false);
    expect(built.cameraColliders.some((m) => m.name === 'tabernacle-structure')).toBe(false);
  });
  it('freezes reduced motion and disposes shared geometry only once', () => {
    const world = buildSinai(THREE, { quality: 'high', reducedMotion: true });
    world.setEpisode('elijah-wind');
    world.update(1);
    const dust = world.root.getObjectByName('elijah-wind'),
      at = dust.position.clone();
    world.update(100);
    expect(dust.position.equals(at)).toBe(true);
    const dispose = vi.spyOn(world.root.getObjectByName('stone-altar').geometry, 'dispose');
    world.dispose();
    world.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(SITES.cave.height).toBeGreaterThan(SITES.camp.height);
  });
});
