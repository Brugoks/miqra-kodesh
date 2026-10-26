import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createTestGltfLoader } from '../../test/gltf.js';
import { SCENE_ASSET_MANIFEST } from './sceneAssetManifest.js';
import { JERUSALEM_EVENT_STAGES, SUPPER_DISCIPLES } from './jerusalemEvents.js';
import { UPPER_ROOM_LEVEL } from './jerusalemTopography.js';
import { blockerAt, move, stanceAt } from './jerusalemNavigation.js';
import buildJerusalem from './buildJerusalem.js';

const supper = JERUSALEM_EVENT_STAGES['last-supper'];
const models = {};
beforeAll(async () => {
  const loader = createTestGltfLoader();
  const needed = new Set(supper.cast.map((actor) => actor.model));
  for (const id of needed) {
    const asset = SCENE_ASSET_MANIFEST.jerusalem.models.find((item) => item.id === id);
    expect(asset, `missing Jerusalem asset: ${id}`).toBeTruthy();
    models[id] = await loader.parseAsync(new Uint8Array(readFileSync(`public${asset.url}`)).buffer, '');
  }
}, 60000);

describe('Jerusalem upper room', () => {
  it('has an actual enclosure on four sides, with an open stair doorway', () => {
    const built = buildJerusalem(THREE, { quality: 'low', motionLibrary: null });
    built.root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(-50, UPPER_ROOM_LEVEL + 1.6, 25));
    ray.far = 10;
    for (const direction of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
      ray.ray.direction.set(...direction);
      expect(ray.intersectObjects(built.cameraColliders, false)[0]?.object.name).toMatch(/^upper-room-/);
    }
    ray.set(new THREE.Vector3(-60, UPPER_ROOM_LEVEL + 1.6, 21), new THREE.Vector3(1, 0, 0));
    ray.far = 9;
    expect(ray.intersectObjects(built.cameraColliders, false)).toHaveLength(0);
    const stair = move(stanceAt(-60, 41), 0, -20);
    expect(move(stair, 9, 0).x).toBeCloseTo(-51);
    expect(blockerAt(-55.8, 25)).toBe('upper-room');
    expect(blockerAt(-50, 30.5)).toBe('upper-room');
    built.dispose();
  }, 15000);

  it('uses distinct adult bodies and individually colored garments', () => {
    expect(SUPPER_DISCIPLES).toHaveLength(12);
    expect(new Set(SUPPER_DISCIPLES.map((actor) => actor.model)).size).toBe(5);
    expect(new Set(SUPPER_DISCIPLES.map((actor) => actor.tint.Cloth)).size).toBe(12);
    expect(new Set(supper.cast.map((actor) => actor.pose)).size).toBeGreaterThan(1);
  });

  it('loads and seats Jesus and all twelve disciples, including on low graphics', () => {
    const root = new THREE.Group();
    const tableau = supper.create(THREE, { root, active: true, motionLibrary: null });
    tableau.acceptAssets({ models });
    expect(tableau.isReady()).toBe(true);
    tableau.update({ quality: 'low', delta: 0.016 });
    root.updateMatrixWorld(true);
    expect(tableau.getActors().size).toBe(13);
    for (const actor of tableau.getActors().values()) {
      expect(actor.root.visible, actor.entry.id).toBe(true);
      const hips = actor.root.getObjectByName('mixamorigHips').getWorldPosition(new THREE.Vector3());
      expect(hips.y - UPPER_ROOM_LEVEL, actor.entry.id).toBeGreaterThan(0.1);
      expect(hips.y - UPPER_ROOM_LEVEL, actor.entry.id).toBeLessThan(0.5);
      if (!actor.entry.tint) continue;
      let cloth;
      actor.root.traverse((node) => { if (node.isMesh && /^Cloth(?:\.\d+)?$/.test(node.material?.name)) cloth = node; });
      expect(cloth, actor.entry.id).toBeTruthy();
      expect(cloth.material.color.getHex(), actor.entry.id).toBe(actor.entry.tint.Cloth);
      expect(cloth.material.customProgramCacheKey()).toContain('woven-dye-v1');
    }
    tableau.dispose();
  }, 15000);
});
