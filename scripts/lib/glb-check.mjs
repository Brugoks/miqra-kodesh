// Shared checks for the shipped character GLBs, used by validate-scene-humans.js,
// validate-tabernacle-characters.js and validate-elah-characters.js. They validate the
// bytes on disk, not the manifest's account of them, and they work on both forms a
// character ships in: the plain GLB (the fallback) and the meshopt + WebP one.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { io } from './optimize-glb.mjs';

export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export function parseGlb(data) {
  assert.equal(data.toString('ascii', 0, 4), 'glTF');
  assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length);
  const jsonLength = data.readUInt32LE(12);
  const gltf = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
  assert.equal(gltf.asset.version, '2.0');
  return { gltf, binary: data.subarray(28 + jsonLength) };
}

// Where a buffer view's bytes really are. A meshopt view keeps its compressed stream
// in an extension and points `buffer` at an empty fallback buffer.
export function storedRange(view) {
  const ext = view.extensions?.EXT_meshopt_compression;
  return ext
    ? { buffer: ext.buffer, offset: ext.byteOffset || 0, length: ext.byteLength }
    : { buffer: view.buffer, offset: view.byteOffset || 0, length: view.byteLength };
}

export function assertLayout(gltf, binary) {
  const real = gltf.buffers.filter((buffer) => !buffer.extensions?.EXT_meshopt_compression?.fallback);
  assert.equal(real.length, 1, 'exactly one buffer holds data');
  assert.equal(gltf.buffers.indexOf(real[0]), 0);
  assert.equal(real[0].byteLength, binary.length);
  assert(!real[0].uri, 'No external runtime buffers');
  for (const view of gltf.bufferViews) {
    const range = storedRange(view);
    assert.equal(range.buffer, 0);
    assert.equal(range.offset % 4, 0);
    assert(range.offset + range.length <= binary.length, 'Buffer view overflow');
  }
}

// What the file must declare so the loader's decoder is the only thing between it and
// the screen. `compressed` is whether the manifest says it is the meshopt file.
export function assertExtensions(gltf, compressed) {
  const required = gltf.extensionsRequired || [];
  assert.equal(required.includes('EXT_meshopt_compression'), compressed, 'meshopt must be required exactly when the manifest says compressed');
  for (const name of required) assert(['EXT_meshopt_compression', 'EXT_texture_webp'].includes(name), `unsupported required extension ${name}`);
  // A WebP image is only valid glTF with EXT_texture_webp, and the extension is only meant when there is one.
  const usesWebp = (gltf.images || []).some((image) => image.mimeType === 'image/webp');
  assert.equal(required.includes('EXT_texture_webp'), usesWebp, usesWebp ? 'WebP images without EXT_texture_webp' : 'EXT_texture_webp without WebP images');
}

// Every embedded image must decode, whatever its format, within the size limits.
export async function decodeImages(gltf, binary, { maxSide = 2048 } = {}) {
  const out = [];
  for (const image of gltf.images) {
    assert(!image.uri && image.bufferView !== undefined, 'All textures must be embedded');
    const range = storedRange(gltf.bufferViews[image.bufferView]);
    const decoded = await sharp(binary.subarray(range.offset, range.offset + range.length)).raw().toBuffer({ resolveWithObject: true });
    assert(decoded.info.width >= 64 && decoded.info.width <= maxSide, `${image.name}: width ${decoded.info.width}`);
    assert(decoded.info.height >= 64 && decoded.info.height <= maxSide, `${image.name}: height ${decoded.info.height}`);
    out.push({ name: image.name, width: decoded.info.width, height: decoded.info.height, mime: image.mimeType });
  }
  return out;
}

// The manifest records what the optimizer left each texture as; the file must agree.
export function assertTexturesMatch(recorded, decoded) {
  if (!recorded) return;
  const byName = new Map(decoded.map((t) => [t.name, t]));
  assert.equal(recorded.length, decoded.length, 'texture count differs from the manifest');
  for (const t of recorded) {
    const actual = byName.get(t.name);
    assert(actual, `manifest lists texture ${t.name} that the file does not hold`);
    assert.deepEqual({ w: actual.width, h: actual.height, m: actual.mime }, { w: t.width, h: t.height, m: t.mime }, `${t.name}: size or format differs from the manifest`);
  }
}

// Skin weights are float32 in every shipped file and must sum to one per vertex. Read
// through a decoder, because a compressed file's raw bytes are not the weights.
export async function assertWeightsNormalized(data, label) {
  const doc = await io.readBinary(new Uint8Array(data));
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const weights = prim.getAttribute('WEIGHTS_0');
      assert.equal(weights.getComponentType(), 5126, `${label}: weights must be float32`);
      const element = [0, 0, 0, 0];
      for (let i = 0; i < weights.getCount(); i++) {
        weights.getElement(i, element);
        let sum = 0;
        for (const w of element) { assert(Number.isFinite(w) && w >= 0, `${label}: bad weight`); sum += w; }
        assert(Math.abs(sum - 1) < 0.001, `${label}: unnormalized weights (${mesh.getName()} vertex ${i})`);
      }
    }
  }
}

// The files a manifest record ships: the one that loads, and the fallback it names.
export function filesOf(asset) {
  const files = [{ role: 'primary', url: asset.url, size: asset.size, sha256: asset.sha256, compressed: asset.compression === 'meshopt' }];
  if (asset.fallback) files.push({ role: 'fallback', url: asset.fallback, size: asset.fallbackSize, sha256: asset.fallbackSha256, compressed: false });
  else assert.notEqual(asset.compression, 'meshopt', `${asset.id}: a compressed model needs a fallback`);
  return files;
}
