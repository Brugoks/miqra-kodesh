// Validate the shipped binaries, not promises written in a manifest.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { HUMAN_MODEL_ASSETS } from '../src/components/scene/sceneHumanAssets.js';
import { RIG_DEFINITIONS } from '../src/components/scene/sceneHumanManifest.js';
import { SCENE_ASSET_MANIFEST } from '../src/components/scene/sceneAssetManifest.js';
const root = path.resolve(import.meta.dirname, '..');
const rig = RIG_DEFINITIONS['makehuman-mixamo-v1'];
let total = 0;
for (const asset of HUMAN_MODEL_ASSETS) {
  const data = await fs.readFile(path.join(root, 'public', asset.url));
  assert.equal(data.toString('ascii', 0, 4), 'glTF');
  assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length);
  assert.equal(data.length, asset.size);
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'), asset.sha256);
  const jsonLength = data.readUInt32LE(12);
  const gltf = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
  const binary = data.subarray(28 + jsonLength);
  assert.equal(gltf.asset.version, '2.0');
  assert.equal(gltf.buffers.length, 1);
  assert.equal(gltf.buffers[0].byteLength, binary.length);
  assert(!gltf.buffers[0].uri, 'No external runtime buffers');
  assert(gltf.skins?.length > 0, `${asset.id}: missing real skeletal skin`);
  const names = new Set(gltf.nodes.map((node) => node.name));
  for (const bone of rig.boneNames) assert(names.has(bone), `${asset.id}: missing ${bone}`);
  for (const clip of ['idle', 'walk', 'work', 'prayer', 'sit', 'kneel']) {
    const animation = gltf.animations?.find((item) => item.name === clip);
    assert(animation?.channels.length > 0, `${asset.id}: missing ${clip} tracks`);
    for (const channel of animation.channels) {
      assert(gltf.nodes[channel.target.node], 'Animation targets must exist');
      const sampler = animation.samplers[channel.sampler];
      assert(gltf.accessors[sampler.input].count >= 1);
      assert(gltf.accessors[sampler.output].count >= 1);
    }
  }
  for (const view of gltf.bufferViews) {
    assert.equal(view.buffer, 0);
    assert.equal((view.byteOffset || 0) % 4, 0);
    assert((view.byteOffset || 0) + view.byteLength <= binary.length, 'Buffer view overflow');
  }
  assert(gltf.images.length >= 5, 'Skin, eyes, hair, eyebrows and clothing must have actual textures');
  for (const image of gltf.images) {
    assert(!image.uri && image.bufferView !== undefined, 'All textures must be embedded');
    const view = gltf.bufferViews[image.bufferView];
    const bytes = binary.subarray(view.byteOffset, view.byteOffset + view.byteLength);
    const decoded = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    assert(decoded.info.width >= 64 && decoded.info.width <= 2048);
    assert(decoded.info.height >= 64 && decoded.info.height <= 2048);
  }
  const triangles = [0, 0];
  for (const node of gltf.nodes.filter((node) => node.mesh !== undefined)) {
    assert(node.skin !== undefined, `${node.name}: all character parts must follow the rig`);
    const level = node.name.includes('_LOD1') ? 1 : 0;
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      for (const attr of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
        assert(primitive.attributes[attr] !== undefined, `${node.name} missing ${attr}`);
      }
      triangles[level] += gltf.accessors[primitive.indices].count / 3;
      const material = gltf.materials[primitive.material];
      assert(material.pbrMetallicRoughness.baseColorTexture, 'No untextured placeholder body parts');
      assert.equal(material.pbrMetallicRoughness.metallicFactor, 0);
      if (/hair|beard|brows/i.test(material.name)) assert.equal(material.alphaMode, 'MASK');
      const weights = gltf.accessors[primitive.attributes.WEIGHTS_0];
      const view = gltf.bufferViews[weights.bufferView];
      assert.equal(weights.componentType, 5126);
      const stride = view.byteStride || 16;
      for (let i = 0; i < weights.count; i++) {
        const offset = view.byteOffset + (weights.byteOffset || 0) + i * stride;
        let sum = 0;
        for (let j = 0; j < 4; j++) { const weight = binary.readFloatLE(offset + j * 4); assert(Number.isFinite(weight) && weight >= 0); sum += weight; }
        assert(Math.abs(sum - 1) < 0.001, `${node.name}: unnormalized weights`);
      }
    }
  }
  assert.deepEqual(triangles, asset.triangles);
  assert(triangles[0] > 10000 && triangles[0] <= 65000);
  assert(triangles[1] > 1000 && triangles[1] <= 12000 && triangles[1] < triangles[0] / 3);
  assert(data.length <= 7 * 1024 * 1024, 'Per-character transfer budget exceeded');
  total += data.length;
  console.log(`${asset.id}: ${(data.length / 1048576).toFixed(2)} MiB, ${triangles.join(' / ')} triangles, textured + rigged, six clips`);
}
for (const slug of ['capernaum', 'caesarea', 'second-temple', 'tabernacle']) {
  assert.deepEqual(SCENE_ASSET_MANIFEST[slug].groups.actors.models, HUMAN_MODEL_ASSETS.map((asset) => asset.id));
}
console.log(`Validated three characters for all four scenes (${(total / 1048576).toFixed(2)} MiB shared library).`);
