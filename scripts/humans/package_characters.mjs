// Quantize embedded PNGs to palettes and rebuild buffer views on four-byte boundaries;
// that plain GLB is the fallback. Then publish the meshopt + WebP file the scenes load
// (scripts/lib/optimize-glb.mjs), both under content hashes.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { publishCharacter } from '../lib/publish-character.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const cache = path.join(root, 'scripts/.cache/humans');
const output = path.join(root, 'public/assets/scenes/shared/humans');
const records = [];
// Longest side of any texture in the optimized file. The crowd's bodies are seen from a
// distance and in numbers; the named principals (Jesus, Matthew) are staged up close, so
// they keep their 2048px skin and hair until someone looks at them side by side.
const MAX_TEXTURE = { artisan: 1024, villager: 1024, traveler: 1024 };
// An eye is a ball 24 mm across: a 1024 px map of it is 5 MiB of GPU memory for detail no screen can resolve
// (the iris at 256 px is still about 0.1 mm a texel). Eyebrows stay as they are, their strands are the detail.
const SMALL_TEXTURES = { pattern: /(?<!brow)eye(?!brow)/i, size: 256 };
// The identity presets (build_characters.py PRESETS) are all crowd bodies.
const PRESET_IDS = ['woman-young', 'woman-adult', 'woman-elder', 'man-elder', 'man-young', 'man-lean', 'child-boy', 'child-girl'];
for (const id of PRESET_IDS) MAX_TEXTURE[id] = 1024;
const tableauOnly = process.argv.includes('--tableau');
const presetsOnly = process.argv.includes('--presets');
for (const id of (tableauOnly ? ['jesus', 'matthew'] : presetsOnly ? PRESET_IDS : ['artisan', 'villager', 'traveler'])) {
  const bytes = await fs.readFile(path.join(cache, `${id}.glb`));
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binary = bytes.subarray(28 + jsonLength);
  const pngViews = new Set(gltf.images.filter((image) => image.mimeType === 'image/png').map((image) => image.bufferView));
  const buffers = []; let offset = 0;
  for (const [index, view] of gltf.bufferViews.entries()) {
    let data = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    if (pngViews.has(index)) data = await sharp(data).png({ palette: true, colours: 256, effort: 10 }).toBuffer();
    view.byteOffset = offset; view.byteLength = data.length;
    buffers.push(data); offset += data.length;
    const padding = (4 - offset % 4) % 4;
    if (padding) { buffers.push(Buffer.alloc(padding)); offset += padding; }
  }
  gltf.buffers[0].byteLength = offset;
  // glTF alpha cutouts render hair reliably without per-card transparency sorting.
  for (const material of gltf.materials) {
    if (/Hair|Brows|Beard/i.test(material.name)) {
      material.alphaMode = 'MASK'; material.alphaCutoff = 0.4;
    }
  }
  // A preset's body as built, and exactly which authored inputs made it (build_characters.py writes it).
  const measurements = presetsOnly ? JSON.parse(await fs.readFile(path.join(cache, `${id}-measurements.json`), 'utf8')) : {};
  gltf.asset.extras = { source: 'MakeHuman Community CC0 assets', provenance: 'docs/scene-humans-assets.md',
    authoring: 'Blender 5.1 / MPFB2; Miqra Kodesh character adaptations',
    historicalStatus: ['jesus', 'matthew'].includes(id)
      ? `Interpretive portrayal of ${id === 'jesus' ? 'Jesus' : 'Matthew the tax collector'}, not a verified portrait or period costume replica`
      : 'Interpretive background people, not portraits or verified period costume replicas',
    ...measurements };
  const rawJson = Buffer.from(JSON.stringify(gltf));
  const json = Buffer.concat([rawJson, Buffer.alloc((4 - rawJson.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20); header.write('glTF'); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + offset, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(offset); binHeader.writeUInt32LE(0x004e4942, 4);
  const result = Buffer.concat([header, json, binHeader, ...buffers]);
  const published = await publishCharacter({ id, plain: result, outputDir: output, urlBase: '/assets/scenes/shared/humans', maxTexture: MAX_TEXTURE[id] ?? null, smallTextures: MAX_TEXTURE[id] ? SMALL_TEXTURES : null });
  const triangles = [0, 0];
  for (const node of gltf.nodes.filter((node) => node.mesh !== undefined)) {
    const lod = node.name.includes('_LOD1') ? 1 : 0;
    for (const primitive of gltf.meshes[node.mesh].primitives) triangles[lod] += gltf.accessors[primitive.indices].count / 3;
  }
  const { preset, ...body } = measurements;
  records.push({ id: `human-${id}`, ...published, source: 'makehuman-community-cc0', license: 'CC0', ...body, triangles, ...(preset ? { preset } : {}) });
}
const [outFile, outName] = tableauOnly ? ['sceneTableauAssets', 'TABLEAU_MODEL_ASSETS']
  : presetsOnly ? ['scenePresetAssets', 'HUMAN_PRESET_ASSETS'] : ['sceneHumanAssets', 'HUMAN_MODEL_ASSETS'];
await fs.writeFile(path.join(root, `src/components/scene/${outFile}.js`),
  '// Generated by scripts/humans/package_characters.mjs. Source notices accompany the GLBs.\n' +
  `export const ${outName} = ${JSON.stringify(records, null, 2)};\n`);
console.log(records.map(({ id, size, triangles }) => ({ id, bytes: size, triangles })));
