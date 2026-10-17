// Verify the shipped Tabernacle meshes, textures, skin weights and animations, in both
// the form that loads (meshopt + WebP) and the plain fallback it names.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createTestGltfLoader } from '../src/test/gltf.js';
import { TABERNACLE_CHARACTER_ASSETS } from '../src/components/scene/tabernacleCharacterAssets.js';
import {
  parseGlb, assertLayout, assertExtensions, decodeImages, assertTexturesMatch, assertWeightsNormalized, filesOf, sha256,
} from './lib/glb-check.mjs';
const loader = createTestGltfLoader();
const models = {};
for (const asset of TABERNACLE_CHARACTER_ASSETS) {
  for (const file of filesOf(asset)) {
    const bytes = await fs.readFile(new URL('../public' + file.url, import.meta.url));
    assert.equal(bytes.length, file.size, `${asset.id} ${file.role}: size`);
    assert.equal(sha256(bytes), file.sha256, `${asset.id} ${file.role}: sha256`);
    const { gltf, binary } = parseGlb(bytes);
    assertLayout(gltf, binary);
    assertExtensions(gltf, file.compressed);
    assert(gltf.skins?.length > 0); assert(gltf.images.length >= 3);
    const images = await decodeImages(gltf, binary);
    if (file.role === 'primary') assertTexturesMatch(asset.textures, images);
    const triangles = [0, 0];
    for (const node of gltf.nodes.filter((n) => n.mesh !== undefined)) {
      assert.notEqual(node.skin, undefined, `${node.name}: detached character mesh`);
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        for (const key of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) assert.notEqual(primitive.attributes[key], undefined);
        triangles[node.name.includes('_LOD1') ? 1 : 0] += gltf.accessors[primitive.indices].count / 3;
      }
    }
    await assertWeightsNormalized(bytes, `${asset.id} ${file.role}`);
    assert.deepEqual(triangles, asset.triangles); assert(triangles[0] <= 90000 && triangles[1] <= 23000);
    for (const name of ['idle', 'walk', 'work', 'prayer', 'sit', 'kneel']) assert(gltf.animations.some((clip) => clip.name === name));
    // The loader a scene uses must accept the file as it ships.
    const model = await loader.parseAsync(new Uint8Array(bytes).buffer, '');
    if (file.role === 'primary') models[asset.id] = model;
  }
}
console.log('PASS — all five Tabernacle models, as shipped and as fallback: hashes, embedded textures, normalized weights, LODs and skeletal clips.');
