// Verify the shipped binary assets, not just metadata or a spear-inclusive box.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ELAH_CHARACTER_ASSETS } from '../src/components/scene/elahCharacterAssets.js';
import { ELAH_CAST, createElahPrincipals } from '../src/components/scene/elahPrincipals.js';
const loader = new GLTFLoader();
loader.register(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new THREE.Texture() }));
const models = {};
for (const asset of ELAH_CHARACTER_ASSETS) {
  const bytes = await fs.readFile(new URL('../public' + asset.url, import.meta.url));
  assert.equal(bytes.length, asset.size);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength)); const binary = bytes.subarray(28 + jsonLength);
  assert(gltf.skins?.length > 0); assert(gltf.images.length >= 5);
  for (const image of gltf.images) {
    assert.equal(image.uri, undefined);
    const view = gltf.bufferViews[image.bufferView];
    const decoded = await sharp(binary.subarray(view.byteOffset, view.byteOffset + view.byteLength)).raw().toBuffer({ resolveWithObject: true });
    assert(decoded.info.width >= 64 && decoded.info.width <= 2048);
  }
  const triangles = [0, 0];
  for (const node of gltf.nodes.filter((n) => n.mesh !== undefined)) {
    assert.notEqual(node.skin, undefined, `${node.name}: detached character mesh`);
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      for (const key of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) assert.notEqual(primitive.attributes[key], undefined);
      triangles[node.name.includes('_LOD1') ? 1 : 0] += gltf.accessors[primitive.indices].count / 3;
      const accessor = gltf.accessors[primitive.attributes.WEIGHTS_0];
      const view = gltf.bufferViews[accessor.bufferView]; assert.equal(accessor.componentType, 5126);
      for (let i = 0; i < accessor.count; i++) {
        let sum = 0;
        for (let j = 0; j < 4; j++) {
          const w = binary.readFloatLE((view.byteOffset || 0) + (accessor.byteOffset || 0) + i * (view.byteStride || 16) + j * 4);
          assert(Number.isFinite(w) && w >= 0); sum += w;
        }
        assert(Math.abs(sum - 1) < .001);
      }
    }
  }
  assert.deepEqual(triangles, asset.triangles); assert(triangles[0] <= 65000 && triangles[1] <= 13000);
  for (const name of ['idle', 'walk', 'work', 'prayer', 'sit', 'kneel']) assert(gltf.animations.some((clip) => clip.name === name));
  models[asset.id] = await loader.parseAsync(new Uint8Array(bytes).buffer, '');
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
