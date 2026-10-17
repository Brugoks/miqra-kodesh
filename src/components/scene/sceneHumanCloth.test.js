import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createTestGltfLoader } from '../../test/gltf.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { HUMAN_PRESET_ASSETS } from './scenePresetAssets.js';
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';
import {
  CLOTH_CLOCK, CLOTH_KINDS, WEAVE_GAIN, WEAVE_TILE, clothify, ensureClothAttributes, setClothTime, weaveBytes, weaveTexture,
} from './sceneHumanCloth.js';
import { wardrobeMaterial, humanAppearance } from './sceneHumanAppearance.js';
import { shapeHeadwear, measureSkull } from './sceneHumanWardrobe.js';
import { createSceneHumans } from './sceneHumans.js';
import { createInstancedCrowd, WOMAN_MODEL } from './sceneInstancedHumans.js';

const models = {};
beforeAll(async () => {
  const loader = createTestGltfLoader();
  for (const asset of [...HUMAN_MODEL_ASSETS, ...HUMAN_PRESET_ASSETS, TABERNACLE_CHARACTER_ASSETS.find((a) => a.id.endsWith('camp-woman'))]) {
    models[asset.id] = await loader.parseAsync(new Uint8Array(readFileSync(`public${asset.url}`)).buffer, '');
  }
}, 30000);

const cameraAt = (x, y, z) => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(x, y, z);
  return camera;
};

// three's own shader templates, with the includes resolved, so what the cloth
// injects is checked against the GLSL it lands in and not against a stand-in.
const resolve = (source) => source.replace(/#include <(\w+)>/g, (_, name) => resolve(THREE.ShaderChunk[name] ?? `/* missing ${name} */`));
const templates = () => ({
  uniforms: {},
  vertexShader: THREE.ShaderLib.physical.vertexShader,
  fragmentShader: THREE.ShaderLib.physical.fragmentShader,
});

describe('the weave', () => {
  const size = 128;
  const bytes = weaveBytes();
  const at = (x, y) => bytes[(((y + size) % size) * size + ((x + size) % size)) * 4];

  it('is deterministic and opaque', () => {
    expect(weaveBytes()).toEqual(bytes);
    for (let i = 3; i < bytes.length; i += 4) expect(bytes[i]).toBe(255);
  });

  it('brings the dye back to what it was: its average times the gain is one', () => {
    let sum = 0;
    for (let i = 0; i < bytes.length; i += 4) sum += bytes[i] / 255;
    const mean = sum / (bytes.length / 4);
    expect(mean * WEAVE_GAIN).toBeGreaterThan(0.96);
    expect(mean * WEAVE_GAIN).toBeLessThan(1.04);
    // And it has a grain worth having: not a flat field.
    const values = Array.from({ length: size * size }, (_, i) => bytes[i * 4] / 255);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.2);
  });

  it('tiles: the seam between the last column and the first is no rougher than any other crossing of two threads', () => {
    // Where one thread goes over and the next under there is a step in the
    // cloth; the seam of the tile must be one of those and not a worse one.
    const crossing = (a, b) => {
      let sum = 0;
      for (let k = 0; k < size; k += 1) sum += Math.abs(a(k) - b(k));
      return sum / size;
    };
    const cell = size / 16;
    const insideAcross = crossing((y) => at(cell - 1, y), (y) => at(cell, y));
    const seamAcross = crossing((y) => at(size - 1, y), (y) => at(0, y));
    expect(seamAcross).toBeLessThan(insideAcross * 1.5 + 3);
    const insideDown = crossing((x) => at(x, cell - 1), (x) => at(x, cell));
    const seamDown = crossing((x) => at(x, size - 1), (x) => at(x, 0));
    expect(seamDown).toBeLessThan(insideDown * 1.5 + 3);
  });

  it('is one shared texture, repeating, mipmapped', () => {
    const texture = weaveTexture(THREE);
    expect(weaveTexture(THREE)).toBe(texture);
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(texture.wrapT).toBe(THREE.RepeatWrapping);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
  });
});

describe('clothify', () => {
  it('lays the weave under a woven cloth and leaves an imported texture alone', () => {
    const veil = clothify(THREE, new THREE.MeshStandardMaterial({ color: 0xffffff }), 'veil');
    expect(veil.map).toBe(weaveTexture(THREE));
    expect(veil.bumpMap).toBe(weaveTexture(THREE));
    expect(veil.bumpScale).toBe(CLOTH_KINDS.veil.relief);

    const imported = new THREE.Texture();
    const tunic = clothify(null, new THREE.MeshStandardMaterial({ map: imported }), 'tunic');
    expect(tunic.map).toBe(imported);
    expect(tunic.bumpMap).toBe(imported);
  });

  it('ignores a kind it does not know and a material that is not there', () => {
    const material = new THREE.MeshStandardMaterial();
    expect(clothify(THREE, material, 'plate-armour')).toBe(material);
    expect(material.map).toBe(null);
    expect(clothify(THREE, null, 'veil')).toBe(null);
  });

  it('gives each kind a program of its own, and keeps the one it was given', () => {
    const keys = Object.keys(CLOTH_KINDS).map((kind) => {
      const material = new THREE.MeshStandardMaterial();
      material.customProgramCacheKey = () => 'vat-model-part';
      return clothify(THREE, material, kind).customProgramCacheKey();
    });
    expect(new Set(keys).size).toBe(keys.length);
    keys.forEach((key) => expect(key.startsWith('vat-model-part-cloth-')).toBe(true));
  });

  it('runs the hook the material already had, then adds its own', () => {
    const material = new THREE.MeshStandardMaterial();
    material.onBeforeCompile = (shader) => { shader.vertexShader = shader.vertexShader.replace('#include <skinning_vertex>', 'TRANSFORMED_BY_SKIN;'); };
    clothify(THREE, material, 'veil');
    const shader = templates();
    material.onBeforeCompile(shader);
    expect(shader.vertexShader).toContain('TRANSFORMED_BY_SKIN;');
    expect(shader.vertexShader).toContain('attribute vec2 aCloth');
    expect(shader.uniforms.uClothTime).toBe(CLOTH_CLOCK.uClothTime);
  });

  it('lands every injection on three’s own shader, in an order that compiles', () => {
    for (const kind of Object.keys(CLOTH_KINDS)) {
      const material = clothify(THREE, new THREE.MeshStandardMaterial(), kind);
      const shader = templates();
      material.onBeforeCompile(shader);
      const vertex = resolve(shader.vertexShader);
      const fragment = resolve(shader.fragmentShader);
      expect(vertex, kind).not.toContain('missing');
      expect(fragment, kind).not.toContain('missing');
      // Declared before it is used.
      expect(vertex.indexOf('attribute vec2 aCloth')).toBeGreaterThan(-1);
      expect(vertex.indexOf('attribute vec2 aCloth')).toBeLessThan(vertex.indexOf('vClothOcc = aCloth.x'));
      expect(fragment.indexOf('varying float vClothOcc')).toBeLessThan(fragment.indexOf('1.0 - vClothOcc'));
      // The cloth's direct term wraps three's, and replaces it for the lights loop.
      const wrapped = fragment.indexOf('void RE_Direct_Cloth');
      expect(wrapped).toBeGreaterThan(fragment.indexOf('void RE_Direct_Physical'));
      expect(fragment.search(/#define RE_Direct\s+RE_Direct_Physical/)).toBeLessThan(fragment.indexOf('#define RE_Direct RE_Direct_Cloth'));
      expect(fragment.indexOf('#define RE_Direct RE_Direct_Cloth')).toBeLessThan(fragment.indexOf('RE_Direct( directLight'));
      // The flutter only exists for cloth that can move, and only after the
      // vertex has been skinned.
      if (CLOTH_KINDS[kind].sway > 0) {
        expect(vertex.indexOf('transformed += objectNormal * (aCloth.y')).toBeGreaterThan(vertex.indexOf('vec3 transformed = vec3( position )'));
      } else {
        expect(vertex).not.toContain('aCloth.y');
      }
      // Only the cloth with its own weave is rescaled to keep the dye.
      expect(fragment.includes(`diffuseColor.rgb *= ${WEAVE_GAIN.toFixed(3)}`)).toBe(CLOTH_KINDS[kind].weave);
    }
  });

  it('puts the flutter after the crowd’s skinning, which replaces three’s', () => {
    const crowd = createInstancedCrowd(THREE, { figures: [{ id: 'w', kind: 'woman', x: 0, z: 0 }], sceneSlug: 'capernaum' });
    try {
      crowd.acceptAssets({ models });
      const part = [...crowd.models.values()][0].meshes.find((m) => m.partName === 'veil');
      expect(part).toBeTruthy();
      const shader = templates();
      part.mesh.material.onBeforeCompile(shader);
      const vertex = shader.vertexShader;
      expect(vertex).toContain('transformed = (vatMatrix * vec4(transformed, 1.0)).xyz;');
      expect(vertex.indexOf('transformed = (vatMatrix')).toBeLessThan(vertex.indexOf('transformed += objectNormal * (aCloth.y'));
    } finally { crowd.dispose(); }
  });

  it('is applied to the dyed tunic by the wardrobe, once, without disturbing the dye', () => {
    const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    wardrobeMaterial(material, 'tunic', humanAppearance({ id: 'someone' }));
    const shader = templates();
    material.onBeforeCompile(shader);
    expect(shader.fragmentShader).toContain('textileValue');
    expect(shader.fragmentShader).toContain('RE_Direct_Cloth');
    expect(material.customProgramCacheKey()).toMatch(/woven-dye-v1-cloth-tunic-v1$/);
    // Not for a skin, nor a head of hair.
    const skin = new THREE.MeshStandardMaterial();
    wardrobeMaterial(skin, 'skin', humanAppearance({ id: 'someone' }));
    expect(skin.customProgramCacheKey()).not.toContain('cloth');
  });
});

describe('the clock', () => {
  it('is whatever the people were last updated to, and zero when it is not a time', () => {
    setClothTime(12.5);
    expect(CLOTH_CLOCK.uClothTime.value).toBe(12.5);
    setClothTime(undefined);
    expect(CLOTH_CLOCK.uClothTime.value).toBe(0);
  });

  it('is advanced by both the crowd and the people who stand in for it', () => {
    const figures = [{ id: 'a', kind: 'man', x: 0, z: 0 }, { id: 'b', kind: 'woman', x: 1, z: 0 }];
    const crowd = createInstancedCrowd(THREE, { figures, sceneSlug: 'capernaum' });
    const near = createSceneHumans({ THREE, root: new THREE.Group(), sceneSlug: 'capernaum', crowdFigures: figures, qualityProfile: 'high' });
    try {
      crowd.acceptAssets({ models });
      setClothTime(0);
      crowd.update(3.25);
      expect(CLOTH_CLOCK.uClothTime.value).toBe(3.25);
      const camera = new THREE.PerspectiveCamera();
      near.acceptAssets({ models });
      near.update({ camera, elapsed: 1, delta: 0 });
      expect(CLOTH_CLOCK.uClothTime.value).toBe(1);
      near.update({ camera, elapsed: 1.5, delta: 0.5 });
      expect(CLOTH_CLOCK.uClothTime.value).toBeCloseTo(1.1, 5);
      // Reduced motion holds the cloth at its rest pose.
      near.update({ camera, elapsed: 9, delta: 0.1, reducedMotion: true });
      expect(CLOTH_CLOCK.uClothTime.value).toBe(1.1);
    } finally { crowd.dispose(); near.dispose(); }
  }, 30000);
});

describe('fold shading and hem flutter on a garment that came with the model', () => {
  const tunics = () => {
    const found = [];
    for (const id of ['human-villager', 'human-traveler', 'human-artisan']) {
      models[id]?.scene.traverse((node) => { if (node.isSkinnedMesh && /tunic/i.test(node.name)) found.push(node); });
    }
    return found;
  };

  it('bakes one occlusion and one flutter weight per vertex, all of them numbers in range', () => {
    const meshes = tunics();
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      const geometry = ensureClothAttributes(THREE, mesh.geometry, 'tunic');
      const cloth = geometry.attributes.aCloth;
      expect(cloth.itemSize).toBe(2);
      expect(cloth.count).toBe(geometry.attributes.position.count);
      for (let i = 0; i < cloth.count; i += 1) {
        expect(cloth.getX(i)).toBeGreaterThanOrEqual(0);
        expect(cloth.getX(i)).toBeLessThanOrEqual(0.7);
        expect(cloth.getY(i)).toBeGreaterThanOrEqual(0);
        expect(cloth.getY(i)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is free at the hem, still at the shoulder, and dark somewhere — but not everywhere', () => {
    for (const mesh of tunics().filter((m) => m.name.endsWith('_LOD0'))) {
      const { position, aCloth } = ensureClothAttributes(THREE, mesh.geometry, 'tunic').attributes;
      let low = Infinity; let high = -Infinity;
      for (let i = 0; i < position.count; i += 1) { low = Math.min(low, position.getY(i)); high = Math.max(high, position.getY(i)); }
      let darkest = 0; let dark = 0;
      for (let i = 0; i < position.count; i += 1) {
        if (position.getY(i) < low + 0.01) expect(aCloth.getY(i)).toBeGreaterThan(0.95);
        if (position.getY(i) > high - 0.01) expect(aCloth.getY(i)).toBe(0);
        darkest = Math.max(darkest, aCloth.getX(i));
        if (aCloth.getX(i) > 0.05) dark += 1;
      }
      expect(darkest).toBeGreaterThan(0.05);
      // A fold is the exception: most of the cloth is open to the light.
      expect(dark / position.count).toBeLessThan(0.5);
    }
  });

  it('agrees between the dense mesh seen up close and the coarse one in the crowd', () => {
    // Someone changing from one to the other must not change shade.
    for (const id of ['human-villager', 'human-traveler', 'human-artisan']) {
      const meshes = {};
      models[id].scene.traverse((node) => { if (node.isSkinnedMesh && /tunic/i.test(node.name)) meshes[node.name.slice(-4)] = ensureClothAttributes(THREE, node.geometry, 'tunic'); });
      const near = meshes.LOD0.attributes;
      const far = meshes.LOD1.attributes;
      let total = 0;
      for (let i = 0; i < far.position.count; i += 1) {
        let best = Infinity; let value = 0;
        for (let j = 0; j < near.position.count; j += 1) {
          const d = (far.position.getX(i) - near.position.getX(j)) ** 2 + (far.position.getY(i) - near.position.getY(j)) ** 2 + (far.position.getZ(i) - near.position.getZ(j)) ** 2;
          if (d < best) { best = d; value = near.aCloth.getX(j); }
        }
        total += Math.abs(value - far.aCloth.getX(i));
      }
      expect(total / far.position.count, id).toBeLessThan(0.02);
    }
  });

  it('is baked once onto the geometry, which every wearer shares', () => {
    const [mesh] = tunics();
    const first = ensureClothAttributes(THREE, mesh.geometry, 'tunic').attributes.aCloth;
    expect(ensureClothAttributes(THREE, mesh.geometry, 'tunic').attributes.aCloth).toBe(first);
  });

  it('is baked by the crowd and by a near actor, on the geometry they draw', () => {
    const figures = [{ id: 'near', kind: 'man', x: 0, z: 0, phase: 0 }];
    const crowd = createInstancedCrowd(THREE, { figures, sceneSlug: 'capernaum' });
    const near = createSceneHumans({ THREE, root: new THREE.Group(), sceneSlug: 'capernaum', crowdFigures: figures, qualityProfile: 'high', actorLimits: { high: 4 } });
    try {
      crowd.acceptAssets({ models });
      const tunicPart = [...crowd.models.values()][0].meshes.find((m) => /tunic/i.test(m.partName));
      expect(tunicPart.mesh.geometry.attributes.aCloth).toBeTruthy();
      near.acceptAssets({ models });
      near.update({ camera: cameraAt(0, 1.6, 2), elapsed: 0, delta: 0 });
      const actor = [...near.getActors().values()][0];
      let seen = 0;
      actor.root.traverse((node) => {
        if (node.isMesh && /tunic/i.test(node.name)) {
          seen += 1;
          expect(node.geometry.attributes.aCloth, node.name).toBeTruthy();
          expect(node.material.customProgramCacheKey()).toContain('cloth-tunic');
        }
      });
      expect(seen).toBeGreaterThan(0);
    } finally { crowd.dispose(); near.dispose(); }
  }, 30000);
});

describe('what is worn on the head, where the body could not be measured', () => {
  // Without a body to lay it over, the cloth is the bent shell it was before
  // there was a drape (sceneHumanDrape.js): still woven, still shaded.
  const measured = (id) => { models[id].scene.updateMatrixWorld(true); return { ...measureSkull(THREE, models[id].scene), root: undefined }; };

  for (const kind of ['veil', 'cloth']) {
    it(`a ${kind} has a weave measured in metres, shade where it lies against the body, and a free edge`, () => {
      const { shell } = shapeHeadwear(THREE, measured('human-villager'), kind);
      const { position, uv, aCloth } = shell.attributes;
      expect(position.count).toBe(19 * 13);
      expect(uv.count).toBe(position.count);
      expect(aCloth.count).toBe(position.count);
      let lowest = Infinity; let highest = -Infinity;
      for (let i = 0; i < position.count; i += 1) { lowest = Math.min(lowest, position.getY(i)); highest = Math.max(highest, position.getY(i)); }
      let vMax = 0; let crownSway = 0; let hemSway = 0; let dark = 0;
      for (let i = 0; i < position.count; i += 1) {
        for (const value of [uv.getX(i), uv.getY(i), aCloth.getX(i), aCloth.getY(i)]) expect(Number.isFinite(value)).toBe(true);
        vMax = Math.max(vMax, uv.getY(i));
        if (position.getY(i) > highest - 0.01) crownSway = Math.max(crownSway, aCloth.getY(i));
        if (position.getY(i) < lowest + 0.01) hemSway = Math.max(hemSway, aCloth.getY(i));
        dark = Math.max(dark, aCloth.getX(i));
      }
      const reach = (highest - lowest) / WEAVE_TILE;
      expect(vMax).toBeGreaterThan(reach * 0.8);
      expect(vMax).toBeLessThan(reach * 4);
      expect(crownSway).toBe(0);
      expect(hemSway).toBeGreaterThan(0.2);
      expect(dark).toBeGreaterThan(0.1);
      expect(dark).toBeLessThanOrEqual(0.8 + 1e-6);
    });
  }

  it('wraps round on a whole number of tiles, so the weave meets itself at the seam', () => {
    const { shell } = shapeHeadwear(THREE, measured('human-villager'), 'veil');
    const { uv } = shell.attributes;
    const columns = 19;
    for (let row = 0; row < 13; row += 1) {
      const end = uv.getX(row * columns + columns - 1);
      expect(Math.abs(end - Math.round(end))).toBeLessThan(1e-4);
      expect(uv.getX(row * columns)).toBe(0);
    }
  });
});

describe('the wardrobe a person wears, dressed', () => {
  it('weaves a near actor’s veil, belt and wrap and tints them as before', () => {
    const figures = Array.from({ length: 6 }, (_, i) => ({ id: `dressed-${i}`, kind: i % 2 ? 'woman' : 'man', x: i * 0.4, z: 0, phase: 0 }));
    const near = createSceneHumans({ THREE, root: new THREE.Group(), sceneSlug: 'capernaum', crowdFigures: figures, qualityProfile: 'high', actorLimits: { high: 12 } });
    try {
      near.acceptAssets({ models });
      near.update({ camera: cameraAt(1, 1.6, 2), elapsed: 0, delta: 0 });
      const found = new Set();
      for (const actor of near.getActors().values()) {
        for (const name of ['headwrap', 'waist-wrap', 'shoulder-wrap']) {
          const mesh = actor.root.getObjectByName(name);
          if (!mesh) continue;
          found.add(name);
          expect(mesh.material.map, name).toBe(weaveTexture(THREE));
          expect(mesh.geometry.attributes.aCloth, name).toBeTruthy();
          expect(mesh.geometry.attributes.uv.count).toBe(mesh.geometry.attributes.position.count);
        }
      }
      expect(found.has('headwrap')).toBe(true);
      expect(found.has('waist-wrap')).toBe(true);
    } finally { near.dispose(); }
  }, 30000);

  it('draws every kind of cloth on the crowd with a weave but the imported tunic', () => {
    const figures = Array.from({ length: 12 }, (_, i) => ({ id: `crowd-${i}`, kind: i % 3 === 2 ? 'woman' : 'man', x: i * 0.4, z: 0, phase: 0 }));
    const crowd = createInstancedCrowd(THREE, { figures, sceneSlug: 'capernaum' });
    try {
      crowd.acceptAssets({ models });
      const names = new Set();
      for (const model of crowd.models.values()) {
        for (const { mesh, partName } of model.meshes) {
          if (['veil', 'headcloth', 'shoulder-wrap', 'waist-wrap'].includes(partName)) {
            names.add(partName);
            expect(mesh.material.map, partName).toBe(weaveTexture(THREE));
            expect(mesh.geometry.attributes.aCloth, partName).toBeTruthy();
          }
        }
      }
      expect(names.has('veil')).toBe(true);
      expect(WOMAN_MODEL).toBeTruthy();
    } finally { crowd.dispose(); }
  }, 30000);
});
