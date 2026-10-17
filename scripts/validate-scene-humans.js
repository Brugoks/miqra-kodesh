// Validate the shipped binaries, not promises written in a manifest.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { TABLEAU_MODEL_ASSETS } from '../src/components/scene/sceneTableauAssets.js';
import { HUMAN_MODEL_ASSETS } from '../src/components/scene/sceneHumanAssets.js';
import { HUMAN_PRESET_ASSETS } from '../src/components/scene/scenePresetAssets.js';
import { TABERNACLE_CHARACTER_ASSETS } from '../src/components/scene/tabernacleCharacterAssets.js';
import { RIG_DEFINITIONS } from '../src/components/scene/sceneHumanManifest.js';
import { SCENE_ASSET_MANIFEST } from '../src/components/scene/sceneAssetManifest.js';
import {
  parseGlb, assertLayout, assertExtensions, decodeImages, assertTexturesMatch, assertWeightsNormalized, filesOf, sha256,
} from './lib/glb-check.mjs';
const root = path.resolve(import.meta.dirname, '..');
const rig = RIG_DEFINITIONS['makehuman-mixamo-v1'];
let total = 0;
for (const asset of [...HUMAN_MODEL_ASSETS, ...TABLEAU_MODEL_ASSETS, ...HUMAN_PRESET_ASSETS]) {
  for (const file of filesOf(asset)) {
    const data = await fs.readFile(path.join(root, 'public', file.url));
    assert.equal(data.length, file.size, `${asset.id} ${file.role}: size`);
    assert.equal(sha256(data), file.sha256, `${asset.id} ${file.role}: sha256`);
    const { gltf, binary } = parseGlb(data);
    assertLayout(gltf, binary);
    assertExtensions(gltf, file.compressed);
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
    assert(gltf.images.length >= 5, 'Skin, eyes, hair, eyebrows and clothing must have actual textures');
    const images = await decodeImages(gltf, binary);
    if (file.role === 'primary') assertTexturesMatch(asset.textures, images);
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
      }
    }
    await assertWeightsNormalized(data, `${asset.id} ${file.role}`);
    assert.deepEqual(triangles, asset.triangles);
    assert(triangles[0] > 10000 && triangles[0] <= 65000);
    assert(triangles[1] > 1000 && triangles[1] <= 12000 && triangles[1] < triangles[0] / 3);
    if (file.role === 'primary') {
      assert(data.length <= 7 * 1024 * 1024, 'Per-character transfer budget exceeded');
      total += data.length;
      console.log(`${asset.id}: ${(data.length / 1048576).toFixed(2)} MiB${asset.fallbackSize ? ` (fallback ${(asset.fallbackSize / 1048576).toFixed(2)} MiB)` : ''}, ${triangles.join(' / ')} triangles, ${images.map((i) => `${i.width}`).join('/')}px textures, textured + rigged, six clips`);
    }
  }
}
// What each scene's actors group must hold, in manifest order. The Tabernacle
// has its own cast; Capernaum and the Temple add principals to the shared
// library (sceneAssetManifest.js). The one female model is the Tabernacle camp
// woman, which is validated by validate-tabernacle-characters.js.
const byId = (id) => TABERNACLE_CHARACTER_ASSETS.find((asset) => asset.id === id);
const jesus = TABLEAU_MODEL_ASSETS.find((asset) => asset.id === 'human-jesus');
const woman = byId('human-tabernacle-camp-woman');
const EXPECTED_ACTORS = {
  capernaum: [...HUMAN_MODEL_ASSETS, ...TABLEAU_MODEL_ASSETS, woman, ...HUMAN_PRESET_ASSETS],
  caesarea: [...HUMAN_MODEL_ASSETS],
  'second-temple': [...HUMAN_MODEL_ASSETS, jesus, woman],
  tabernacle: [...TABERNACLE_CHARACTER_ASSETS],
};
for (const [slug, expected] of Object.entries(EXPECTED_ACTORS)) {
  assert(expected.every(Boolean), `${slug}: an expected actor asset does not exist`);
  assert.deepEqual(SCENE_ASSET_MANIFEST[slug].groups.actors.models, expected.map((asset) => asset.id), `${slug}: actors group`);
}
console.log(`Validated shared characters and the Capernaum tableau (${(total / 1048576).toFixed(2)} MiB shared library).`);
