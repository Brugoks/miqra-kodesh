import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';
import { humanAppearance, humanVariantId, wardrobeMaterial } from './sceneHumanAppearance.js';
import { measureSkull } from './sceneHumanWardrobe.js';
import { createSceneHumans } from './sceneHumans.js';
import { createInstancedCrowd } from './sceneInstancedHumans.js';

const models = {};
beforeAll(async () => {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new THREE.Texture() }));
  for (const asset of [...HUMAN_MODEL_ASSETS, TABERNACLE_CHARACTER_ASSETS.find((a) => a.id.endsWith('camp-woman'))]) {
    models[asset.id] = await loader.parseAsync(new Uint8Array(readFileSync(`public${asset.url}`)).buffer, '');
  }
}, 30000);

it('keeps identity and wardrobe stable when a near pool filters or reorders people', () => {
  const figure = { id: 'harbour-worker-3', kind: 'man' };
  expect(humanVariantId(figure, 0)).toBe(humanVariantId(figure, 21));
  expect(humanAppearance(figure, 'caesarea', 0)).toEqual(humanAppearance({ ...figure, id: `human-${figure.id}`, fallbackId: figure.id }, 'caesarea', 21));
  expect(humanVariantId({ ...figure, variantId: 'tabernacle-priest-a' })).toBe('tabernacle-priest-a');
  expect(humanVariantId({ id: 'woman', kind: 'woman' })).toBe('tabernacle-camp-woman-a');
  expect(humanVariantId({ id: 'villager-courtyard-grind-0' }, 33, 'capernaum')).toBe('galilee-grinder-a');
});

it('protects ceremonial vestments and explicit head-covering choices', () => {
  for (const variantId of ['tabernacle-high-priest-a', 'tabernacle-priest-a', 'tabernacle-levite-a']) {
    const appearance = humanAppearance({ variantId }, 'tabernacle');
    expect(appearance.ceremonial).toBe(true);
    expect(appearance.headwear).toBe(null);
    expect(appearance.sashWorn).toBe(false);
    expect(appearance.shoulderWrap).toBe(false);
    const gold = new THREE.MeshStandardMaterial({ color: 0xdeb251, metalness: 0.86 });
    wardrobeMaterial(gold, 'tunic', appearance);
    expect(gold.color.getHex()).toBe(0xdeb251);
    expect(gold.metalness).toBe(0.86);
  }
  expect(humanAppearance({ id: 'woman', kind: 'woman', bareheaded: true }).headwear).toBe(null);
});

it('fits the shorter woman’s head instead of falling back to an adult male height', () => {
  const root = models['human-villager'].scene;
  root.updateMatrixWorld(true);
  const skull = measureSkull(THREE, root);
  expect(skull.top).toBeLessThan(1.5);
  expect(skull.top).toBeGreaterThan(1.35);
  expect(skull.radii.every((r) => r > 0.04 && r < 0.16)).toBe(true);
});

it('composes dye shading with the skinning hook and preserves imported textures', () => {
  const map = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map });
  material.onBeforeCompile = (shader) => { shader.vertexShader += '// skinning'; };
  wardrobeMaterial(material, 'tunic', humanAppearance({ id: 'test' }));
  const shader = { uniforms: {}, vertexShader: '', fragmentShader: '#include <map_fragment>' };
  material.onBeforeCompile(shader);
  expect(shader.vertexShader).toContain('skinning');
  expect(shader.fragmentShader).toContain('textileValue');
  expect(material.map).toBe(map);
});

describe('the same dressed person at both render distances', () => {
  it('matches models, tints, build and accessory positions using actual animated rigs', () => {
    const figures = Array.from({ length: 8 }, (_, i) => ({ id: `wardrobe-${i}`, kind: i % 3 === 2 ? 'woman' : 'man', x: i * 0.3, z: 0, phase: 0, activity: 'standing' }));
    const sceneSlug = 'capernaum';
    const near = createSceneHumans({ THREE, root: new THREE.Group(), sceneSlug, crowdFigures: figures, qualityProfile: 'high', actorLimits: { high: 12 } });
    const far = createInstancedCrowd(THREE, { figures, sceneSlug });
    try {
      near.acceptAssets({ models }); far.acceptAssets({ models });
      const camera = new THREE.PerspectiveCamera(); camera.position.set(1, 1.6, 2);
      near.update({ camera, elapsed: 0, delta: 0 });
      for (const person of far.people) {
        const actor = near.getActors().get(`human-${person.figure.id}`);
        expect(actor.variant.modelId).toBe(person.model);
        expect(actor.placement.appearance).toEqual(person.appearance);
        expect(actor.root.scale.x).toBe(person.appearance.build);
        const model = far.models.get(person.model);
        for (const part of model.meshes) {
          if (part.only && !part.only(person)) continue;
          const nearName = ['veil', 'headcloth'].includes(part.partName) ? 'headwrap' : part.partName.replace('_LOD1', '_LOD0');
          const mesh = actor.root.getObjectByName(nearName);
          expect(mesh, nearName).toBeTruthy();
          if (part.mesh.instanceColor) {
            const color = part.mesh.getColorAt(person.slot, new THREE.Color());
            expect(mesh.material.color.r).toBeCloseTo(color.r, 5);
            expect(mesh.material.color.g).toBeCloseTo(color.g, 5);
            expect(mesh.material.color.b).toBeCloseTo(color.b, 5);
          }
          if (!['headwrap', 'waist-wrap', 'shoulder-wrap'].includes(nearName)) continue;
          // Rest geometry must match before the same clip moves it.
          const a = mesh.geometry.attributes.position, b = part.mesh.geometry.attributes.position;
          expect(a.count).toBe(b.count);
          for (let i = 0; i < a.count; i++) {
            expect(new THREE.Vector3().fromBufferAttribute(a, i).distanceTo(new THREE.Vector3().fromBufferAttribute(b, i))).toBeLessThan(0.001);
            const weights = mesh.geometry.attributes.skinWeight;
            expect([0, 1, 2, 3].reduce((n, j) => n + weights.getComponent(i, j), 0)).toBeCloseTo(1, 5);
          }
        }
      }
      const actor = [...near.getActors().values()][0];
      const ownDispose = vi.spyOn(actor.wardrobeResources[0], 'dispose');
      const sourceMesh = models[actor.variant.modelId].scene.getObjectByName('Skin_LOD0');
      const sharedDispose = vi.spyOn(sourceMesh.material, 'dispose');
      near.dispose(); near.dispose();
      expect(ownDispose).toHaveBeenCalledTimes(1);
      expect(sharedDispose).not.toHaveBeenCalled();
    } finally { near.dispose(); far.dispose(); }
  }, 30000);
});
