import { readFileSync } from 'node:fs';
import { beforeAll, describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import buildTabernacle from './buildTabernacle.js';
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';
import { HUMAN_VARIANTS } from './sceneHumanManifest.js';
import { SCENE_ASSET_MANIFEST } from './sceneAssetManifest.js';
import { TABERNACLE } from '../../lib/tabernacleScene.js';
const models = {};
beforeAll(async () => {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new THREE.Texture() }));
  for (const asset of TABERNACLE_CHARACTER_ASSETS) {
    const bytes = readFileSync(`public${asset.url}`);
    models[asset.id] = await loader.parseAsync(new Uint8Array(bytes).buffer, '');
  }
});
const matching = (root, pattern) => { const found = []; root.traverse((node) => { if (node.isMesh && pattern.test(node.name)) found.push(node); }); return found; };
describe('Tabernacle garments and roles', () => {
  it('ships distinct skinned costumes with physical height, textures and two detail levels', () => {
    expect(TABERNACLE_CHARACTER_ASSETS).toHaveLength(5);
    for (const asset of TABERNACLE_CHARACTER_ASSETS) {
      const { scene, animations } = models[asset.id];
      expect(scene.getObjectByName('PhysicalHeight').userData.bodyHeightMeters).toBe(asset.bodyHeightMeters);
      expect(animations.map((clip) => clip.name)).toContain('idle');
      for (const lod of [0, 1]) {
        const meshes = matching(scene, new RegExp(`_LOD${lod}$`)); expect(meshes.length).toBeGreaterThan(3);
        for (const mesh of meshes) { expect(mesh.isSkinnedMesh).toBe(true); expect(mesh.material.map).toBeTruthy(); }
      }
    }
  });
  it('reserves the ephod, twelve stones, shoulder stones, bells and gold plate for the high priest', () => {
    const high = models['human-tabernacle-high-priest'].scene;
    const stones = matching(high, /^Breastpiece.stone.\d+_LOD0$/);
    expect(stones).toHaveLength(12);
    expect(new Set(stones.map((node) => `${node.userData.row}:${node.userData.column}`)).size).toBe(12);
    expect(matching(high, /^Onyx.remembrance.stone.*_LOD0$/)).toHaveLength(2);
    expect(matching(high, /^Gold.hem.bell.*_LOD0$/)).toHaveLength(12);
    expect(matching(high, /^Yarn.pomegranate.*_LOD0$/)).toHaveLength(12);
    expect(matching(high, /^Gold.forehead.plate.*_LOD0$/)).toHaveLength(1);
    expect(matching(high, /^Ephod.front.panel.*_LOD0$/)).toHaveLength(1);
    for (const id of ['priest', 'levite', 'camp-man', 'camp-woman']) expect(matching(models[`human-tabernacle-${id}`].scene, /Breastpiece|Ephod/)).toHaveLength(0);
  });
  it('assigns the correct models to live figures, including on low quality, and preserves gold', () => {
    const world = buildTabernacle(THREE, { quality: 'low', reducedMotion: true });
    world.applyAssets({ models });
    const actors = [...world.humans.getActors().values()];
    const high = actors.filter((actor) => actor.placement.role === 'high-priest');
    expect(high).toHaveLength(1);
    expect(high[0].variant.modelId).toBe('human-tabernacle-high-priest');
    expect(actors.filter((actor) => actor.placement.role === 'levite')).toHaveLength(4);
    for (const actor of actors) {
      expect(actor.variant.modelId).toBe(`human-tabernacle-${actor.placement.role}`);
      if (actor.placement.role === 'priest') {
        const [x, , z] = actor.placement.position;
        expect(Math.abs(x) > 1.9 || Math.abs(z - 10) > 1.9).toBe(true);
        expect(Math.hypot(x, z - 4)).toBeGreaterThan(.9);
      }
      if (actor.placement.role.startsWith('camp-')) expect(actor.placement.position[2]).toBeGreaterThan(25);
      if (actor.placement.role === 'levite') expect(Math.abs(actor.placement.position[0]) > 12.5 || actor.placement.position[2] > 25).toBe(true);
    }
    const camera = new THREE.PerspectiveCamera(); camera.position.set(1.4, 1.7, 4.1);
    world.humans.update({ elapsed: 0, camera, quality: 'low', reducedMotion: true });
    expect(high[0].root.visible).toBe(true); expect(high[0].suppressedFallback).toBe(true);
    expect(matching(high[0].root, /Breastpiece.stone.*_LOD1$/).every((node) => node.visible)).toBe(true);
    expect(matching(high[0].root, /Gold.forehead.plate.*_LOD1$/)[0].material.metalness).toBeGreaterThan(.8);
    world.dispose();
  });
  it('loads Tabernacle costumes only in this scene and provides an accessible inspection viewpoint', () => {
    const ids = TABERNACLE_CHARACTER_ASSETS.map((asset) => asset.id);
    expect(SCENE_ASSET_MANIFEST.tabernacle.groups.actors.models).toEqual(ids);
    for (const slug of ['capernaum', 'caesarea', 'second-temple']) expect(SCENE_ASSET_MANIFEST[slug].models.some((asset) => ids.includes(asset.id))).toBe(false);
    for (const id of ids) expect(HUMAN_VARIANTS[id.replace('human-', '') + '-a']).toBeDefined();
    expect(TABERNACLE.vantages.find((v) => v.id === 'the-high-priest').refs).toContain('Exodus 28:6-38');
  });
});
