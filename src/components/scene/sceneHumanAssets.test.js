// Parse the actual shipped geometry, skinning, and clips with Three's loader.
// Image decoding is deliberately substituted; PNG/JPEG payloads are independently
// decoded by scripts/validate-scene-humans.js in the asset validation command.
import path from 'node:path';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { SCENE_ASSET_MANIFEST } from './sceneAssetManifest.js';
import { cloneSkinnedMesh } from './sceneResources.js';

for (const asset of HUMAN_MODEL_ASSETS) {
  describe(asset.id, () => {
    it('loads textured skeletal meshes at both detail levels with independently animated clones', async () => {
      const bytes = readFileSync(path.resolve(process.cwd(), 'public', asset.url.slice(1)));
      const loader = new GLTFLoader();
      loader.register(() => ({ name: 'HEADLESS_TEST_IMAGES', loadTexture: async () => new THREE.Texture() }));
      const model = await loader.parseAsync(new Uint8Array(bytes).buffer, '');
      expect(model.animations.map((clip) => clip.name)).toEqual(expect.arrayContaining(['idle', 'walk', 'work', 'prayer']));
      for (const level of [0, 1]) {
        let found = false;
        model.scene.traverse((node) => {
          if (node.isSkinnedMesh && node.name.includes(`LOD${level}`)) {
            found = true;
            expect(node.geometry.attributes.skinWeight).toBeDefined();
            expect(node.material.map).toBeTruthy();
            expect(node.skeleton.bones.length).toBeGreaterThan(40);
          }
        });
        expect(found).toBe(true);
      }
      const first = cloneSkinnedMesh(model.scene); const second = cloneSkinnedMesh(model.scene);
      const mixer = new THREE.AnimationMixer(first);
      mixer.clipAction(model.animations.find((clip) => clip.name === 'walk')).play();
      const findLeg = (root) => { let leg; root.traverse((node) => { if (node.isBone && node.name.endsWith('LeftUpLeg')) leg = node; }); return leg; };
      const before = findLeg(second).quaternion.clone();
      mixer.update(0.3);
      expect(findLeg(first).quaternion.equals(before)).toBe(false);
      expect(findLeg(second).quaternion.equals(before)).toBe(true);
      mixer.stopAllAction(); mixer.uncacheRoot(first);
    });
  });
}

it.each(['capernaum', 'caesarea', 'second-temple', 'tabernacle'])('%s loads the shared humans and excludes static placeholder actors', (slug) => {
  const manifest = SCENE_ASSET_MANIFEST[slug];
  expect(manifest.groups.actors.models).toEqual(HUMAN_MODEL_ASSETS.map((asset) => asset.id));
  expect(manifest.models.some((model) => model.id.startsWith('actor-'))).toBe(false);
});
