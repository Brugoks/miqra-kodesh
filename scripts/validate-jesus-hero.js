// Validate the optional Jesus hero asset when it is present. An empty generated
// manifest is a valid development state: Capernaum continues to use the shipped
// `human-jesus` fallback until the approved hero GLB is packaged.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { HERO_MODEL_ASSETS } from '../src/components/scene/sceneHeroAssets.js';
import { RIG_DEFINITIONS } from '../src/components/scene/sceneHumanManifest.js';
import { SCENE_ASSET_MANIFEST } from '../src/components/scene/sceneAssetManifest.js';

const root = path.resolve(import.meta.dirname, '..');
const rig = RIG_DEFINITIONS['makehuman-mixamo-v1'];
const REQUIRED_MORPHS = [
  'eyeBlinkLeft', 'eyeBlinkRight',
  'eyeSquintLeft', 'eyeSquintRight',
  'eyeWideLeft', 'eyeWideRight',
  'browInnerUp', 'browDownLeft', 'browDownRight',
  'browOuterUpLeft', 'browOuterUpRight',
  'jawOpen',
  'mouthSmileLeft', 'mouthSmileRight',
  'mouthFrownLeft', 'mouthFrownRight',
  'mouthPucker', 'mouthFunnel',
  'mouthPressLeft', 'mouthPressRight',
  'mouthUpperUp', 'mouthLowerDown',
  'cheekSquint', 'noseSneer',
];

if (HERO_MODEL_ASSETS.length === 0) {
  assert(!SCENE_ASSET_MANIFEST.capernaum.groups.actors.models.includes('human-jesus-v1'));
  console.log('Jesus hero asset is not packaged yet; `human-jesus` remains the active fallback.');
} else {
  assert.equal(HERO_MODEL_ASSETS.length, 1, 'Exactly one Jesus hero asset is expected');
  const asset = HERO_MODEL_ASSETS[0];
  assert.equal(asset.id, 'human-jesus-v1');
  assert(SCENE_ASSET_MANIFEST.capernaum.groups.actors.models.includes(asset.id));
  assert(SCENE_ASSET_MANIFEST.capernaum.models.some((model) => model.id === asset.id));
  assert(asset.source && asset.license, 'Hero provenance and license metadata are mandatory');

  const data = await fs.readFile(path.join(root, 'public', asset.url));
  assert.equal(data.toString('ascii', 0, 4), 'glTF');
  assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length);
  assert.equal(data.length, asset.size);
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'), asset.sha256);
  assert(data.length <= 12 * 1024 * 1024, 'Jesus hero transfer budget exceeded');

  const jsonLength = data.readUInt32LE(12);
  const gltf = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
  const binary = data.subarray(28 + jsonLength);
  assert.equal(gltf.asset.version, '2.0');
  assert.equal(gltf.buffers.length, 1);
  assert(!gltf.buffers[0].uri, 'Hero must not depend on an external buffer');
  assert.equal(gltf.buffers[0].byteLength, binary.length);
  assert(gltf.skins?.length > 0, 'Jesus hero must contain a real skeletal skin');

  const nodeNames = new Set((gltf.nodes || []).map((node) => node.name));
  for (const bone of rig.boneNames) assert(nodeNames.has(bone), `human-jesus-v1: missing ${bone}`);

  const animationNames = new Set((gltf.animations || []).map((animation) => animation.name));
  for (const clip of ['idle', 'walk']) assert(animationNames.has(clip), `human-jesus-v1: missing ${clip}`);
  assert(animationNames.has('teacher') || animationNames.has('teaching'), 'human-jesus-v1: missing teacher/teaching motion');

  const morphNames = new Set((gltf.meshes || []).flatMap((mesh) => mesh.extras?.targetNames || []));
  for (const morph of REQUIRED_MORPHS) assert(morphNames.has(morph), `human-jesus-v1: missing morph ${morph}`);

  const triangles = [0, 0];
  let hasLod1 = false;
  for (const node of (gltf.nodes || []).filter((node) => node.mesh !== undefined)) {
    const level = node.name?.includes('_LOD1') ? 1 : 0;
    if (level === 1) hasLod1 = true;
    const mesh = gltf.meshes[node.mesh];
    for (const primitive of mesh.primitives || []) {
      assert(primitive.indices !== undefined, `${node.name}: indexed geometry is required`);
      for (const attr of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
        assert(primitive.attributes[attr] !== undefined, `${node.name}: missing ${attr}`);
      }
      triangles[level] += gltf.accessors[primitive.indices].count / 3;
      const material = gltf.materials?.[primitive.material];
      assert(material?.pbrMetallicRoughness?.baseColorTexture, `${node.name}: untextured hero part`);
      if (/hair|brow|beard|lash/i.test(material.name || '')) assert.equal(material.alphaMode, 'MASK');
    }
  }
  assert(hasLod1, 'human-jesus-v1: missing _LOD1 meshes');
  assert.deepEqual(triangles, asset.triangles);
  assert(triangles[0] >= 65000 && triangles[0] <= 105000, `LOD0 triangle budget out of range: ${triangles[0]}`);
  assert(triangles[1] >= 18000 && triangles[1] <= 45000, `LOD1 triangle budget out of range: ${triangles[1]}`);
  assert(triangles[1] < triangles[0] * 0.6, 'LOD1 must materially reduce geometry');

  for (const view of gltf.bufferViews || []) {
    assert.equal(view.buffer, 0);
    assert.equal((view.byteOffset || 0) % 4, 0);
    assert((view.byteOffset || 0) + view.byteLength <= binary.length, 'Buffer view overflow');
  }
  for (const image of gltf.images || []) {
    assert(!image.uri && image.bufferView !== undefined, 'Runtime textures must be embedded in the hero GLB');
    if (!['image/png', 'image/jpeg'].includes(image.mimeType)) continue;
    const view = gltf.bufferViews[image.bufferView];
    const bytes = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const decoded = await sharp(bytes).metadata();
    assert(decoded.width >= 64 && decoded.width <= 2048, `Texture width out of range: ${decoded.width}`);
    assert(decoded.height >= 64 && decoded.height <= 2048, `Texture height out of range: ${decoded.height}`);
  }

  console.log(`Validated human-jesus-v1: ${(data.length / 1048576).toFixed(2)} MiB, ${triangles.join(' / ')} triangles, ${morphNames.size} morphs.`);
}
