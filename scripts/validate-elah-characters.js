// Verify the shipped binary assets, not just metadata or a spear-inclusive box, in both
// the form that loads (meshopt + WebP) and the plain fallback it names.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTestGltfLoader } from '../src/test/gltf.js';
import { ELAH_CHARACTER_ASSETS } from '../src/components/scene/elahCharacterAssets.js';
import { ELAH_CAST, createElahPrincipals } from '../src/components/scene/elahPrincipals.js';
import {
  parseGlb, assertLayout, assertExtensions, decodeImages, assertTexturesMatch, assertWeightsNormalized, filesOf, sha256,
} from './lib/glb-check.mjs';
const loader = createTestGltfLoader();
const models = {};
for (const asset of ELAH_CHARACTER_ASSETS) {
  for (const file of filesOf(asset)) {
    const bytes = await fs.readFile(new URL('../public' + file.url, import.meta.url));
    assert.equal(bytes.length, file.size, `${asset.id} ${file.role}: size`);
    assert.equal(sha256(bytes), file.sha256, `${asset.id} ${file.role}: sha256`);
    const { gltf, binary } = parseGlb(bytes);
    assertLayout(gltf, binary);
    assertExtensions(gltf, file.compressed);
    assert(gltf.skins?.length > 0); assert(gltf.images.length >= 5);
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
    assert.deepEqual(triangles, asset.triangles); assert(triangles[0] <= 65000 && triangles[1] <= 13000);
    for (const name of ['idle', 'walk', 'work', 'prayer', 'sit', 'kneel']) assert(gltf.animations.some((clip) => clip.name === name));
    const model = await loader.parseAsync(new Uint8Array(bytes).buffer, '');
    if (file.role === 'primary') models[asset.id] = model;
  }
}
const cast = createElahPrincipals(THREE, new THREE.Group(), { reducedMotion: true }); cast.acceptAssets({ models });
assert(cast.isReady()); const measurements = {};
for (const entry of ELAH_CAST) {
  const actor = cast.getActors().get(entry.id); const box = new THREE.Box3(); const p = new THREE.Vector3();
  actor.model.updateMatrixWorld(true);
  actor.model.traverse((node) => {
    if (!node.isSkinnedMesh || !node.name.includes('_LOD0') || !/Skin|short|Hair/.test(node.name)) return;
    node.skeleton.update();
    for (let i = 0; i < node.geometry.attributes.position.count; i++) {
      node.getVertexPosition(i, p); box.expandByPoint(p.applyMatrix4(node.matrixWorld));
    }
  });
  const height = box.max.y - box.min.y;
  assert(Math.abs(height - entry.height) < .03, `${entry.id}: actual body height ${height} differs from ${entry.height}`);
  measurements[entry.id] = { target: entry.height, posedBody: Number(height.toFixed(4)) };
}
const ratio = measurements.goliath.posedBody / measurements.david.posedBody;
assert(ratio > 1.70 && ratio < 1.83);
cast.dispose();
console.log(JSON.stringify({ measurements, nominalRatio: 2.9 / 1.65, posedRatio: ratio, result: 'PASS — embedded textures, normalized skin weights, LODs, clips and actual body measurements' }, null, 2));
