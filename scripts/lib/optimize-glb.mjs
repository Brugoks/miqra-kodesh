// Shrink a scene GLB without changing what it draws. Used by
// scripts/optimize-scene-glb.mjs and by the character packaging scripts in
// scripts/humans/, so a rebuilt character is born optimized.
//
// What it does, and why it stops there (measured on the shipped characters, see
// docs/scene-enhancement-progress.md section 5):
//
//  - Vertex and index streams get EXT_meshopt_compression, with `reorder` first. The
//    attributes stay float32, so this is lossless: every reader of
//    `geometry.attributes.position` still gets metres, and the output is verified here
//    to hold exactly the same triangles. No KHR_mesh_quantization: it folds a scale into
//    the skin and turns positions into normalised int16, which silently breaks the
//    headwear, drape, skull and cloth code that reads raw positions.
//  - NOT `dedup()`. It merges byte-identical meshes (the camp woman's LOD0 and LOD1 sash
//    are the same 96 vertices) and any materials that compare equal, which changes the
//    node -> mesh structure and the material *names* the runtime reads roles from.
//  - With `textures`: colour maps become lossy WebP (q80); normal maps become LOSSLESS
//    WebP. Lossy WebP is 4:2:0 chroma-subsampled, which wrecks normal-map vectors
//    (measured: 34 degrees mean error on the beard map). Three's GLTFLoader reads
//    EXT_texture_webp natively. `maxTexture` additionally limits every image to that
//    many pixels on its longer side (Lanczos); decoded texture memory is what it saves. `smallTextures`
//    gives the textures whose name matches a pattern a smaller limit still (an eye is a 24 mm ball: a
//    1024 px map of it costs 5 MiB of GPU memory to show detail no screen can resolve).
//
// The audit compares what the runtime depends on (node names, node -> mesh, skin joint
// lists, animation names and durations, material name/alphaMode/cutoff, triangle counts,
// attribute component types) and, independently of any library's claims, that the
// decoded triangles are identical. It returns the problems instead of throwing, so a
// caller decides what a failure means.

import crypto from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { reorder, compressTexture, listTextureSlots } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
});


const digest = (array) => crypto.createHash('sha256')
  .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex').slice(0, 24);

// What the runtime reads off a GLB, in a form two documents can be compared on.
export function summarize(doc) {
  const root = doc.getRoot();
  const skinKey = (skin) => skin.listJoints().map((joint) => joint.getName()).join('|');
  return {
    nodes: root.listNodes().map((node) => node.getName()).sort(),
    // The rig itself, exactly: every node's transform, each skin's inverse-bind matrices,
    // and every animation sample. Retargeted clips are fitted to this skeleton, so a
    // compressed file is only a drop-in if all of it is bit-identical.
    transforms: root.listNodes().map((node) => ({
      name: node.getName(), values: [...node.getTranslation(), ...node.getRotation(), ...node.getScale()],
    })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    inverseBind: root.listSkins().map((skin) => `${skinKey(skin)}#${digest(skin.getInverseBindMatrices().getArray())}`).sort(),
    animationData: root.listAnimations().map((animation) => `${animation.getName()}#${animation.listChannels()
      .map((channel) => {
        const sampler = channel.getSampler();
        return `${channel.getTargetNode()?.getName()}.${channel.getTargetPath()}:${digest(sampler.getInput().getArray())}:${digest(sampler.getOutput().getArray())}`;
      }).sort().join(',')}`).sort(),
    nodeMeshes: root.listNodes().filter((node) => node.getMesh())
      .map((node) => `${node.getName()}->${node.getMesh().getName()}`).sort(),
    skins: root.listSkins().map(skinKey).sort(),
    animations: root.listAnimations().map((animation) => ({
      name: animation.getName(),
      channels: animation.listChannels().length,
      duration: Math.max(...animation.listSamplers().map((sampler) => sampler.getInput().getMax([0])[0])),
    })),
    materials: root.listMaterials().map((m) => `${m.getName()}:${m.getAlphaMode()}:${m.getAlphaCutoff()}`).sort(),
    meshes: root.listMeshes().map((mesh) => ({
      name: mesh.getName(),
      primitives: mesh.listPrimitives().map((prim) => ({
        triangles: prim.getIndices().getCount() / 3,
        vertices: prim.getAttribute('POSITION').getCount(),
        types: prim.listSemantics().sort().map((s) => `${s}:${prim.getAttribute(s).getComponentType()}`).join(','),
      })),
    })),
  };
}

export function audit(before, after) {
  const problems = [];
  const same = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) problems.push(what); };
  same(before.nodes, after.nodes, 'node names');
  // Not bit-for-bit: the writer snaps near-identity scales (the Blender export leaves noise
  // like 1.0000015) to exactly 1. Measured at most 3.7e-6 on the characters, a few
  // micrometres on a metre-long bone; anything past this tolerance is a real change.
  const TRANSFORM_TOLERANCE = 1e-5;
  const afterByName = new Map(after.transforms.map((t) => [t.name, t.values]));
  if (before.transforms.length !== after.transforms.length) problems.push('node count');
  for (const { name, values } of before.transforms) {
    const other = afterByName.get(name);
    if (!other || values.some((v, i) => Math.abs(v - other[i]) > TRANSFORM_TOLERANCE)) { problems.push(`node transform of ${name} (the bind pose)`); break; }
  }
  same(before.inverseBind, after.inverseBind, 'skin inverse-bind matrices');
  same(before.animationData, after.animationData, 'animation sample data');
  same(before.nodeMeshes, after.nodeMeshes, 'which mesh each node draws');
  same(before.skins, after.skins, 'skin joint lists');
  same(before.animations, after.animations, 'animation names, channel counts or durations');
  same(before.materials, after.materials, 'material names, alpha modes or cutoffs');
  same(before.meshes.map((m) => [m.name, m.primitives.map((p) => [p.triangles, p.types])]),
    after.meshes.map((m) => [m.name, m.primitives.map((p) => [p.triangles, p.types])]),
    'mesh names, triangle counts or attribute types');
  before.meshes.forEach((mesh, i) => mesh.primitives.forEach((prim, j) => {
    if ((after.meshes[i]?.primitives[j]?.vertices ?? Infinity) > prim.vertices) problems.push(`vertex count grew in ${mesh.name}`);
  }));
  return problems;
}

// reorder() permutes vertices, so compare as multisets: each triangle becomes the sorted
// set of its three vertices' full attribute rows, and the sorted lists must be identical.
export function triangleSoup(doc) {
  const soups = [];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const attributes = prim.listSemantics().sort().map((s) => prim.getAttribute(s));
      const row = (v) => attributes.map((a) => Array.from(a.getElement(v, [])).join(',')).join(';');
      const index = prim.getIndices();
      const rows = new Map();
      const rowOf = (v) => rows.get(v) ?? rows.set(v, row(v)).get(v);
      const triangles = [];
      for (let t = 0; t < index.getCount(); t += 3) {
        triangles.push([index.getScalar(t), index.getScalar(t + 1), index.getScalar(t + 2)].map(rowOf).sort().join('|'));
      }
      soups.push(triangles.sort());
    }
  }
  return soups;
}

const sameSoup = (a, b) => a.length === b.length
  && a.every((soup, i) => soup.length === b[i].length && soup.every((t, k) => t === b[i][k]));

async function textureReport(doc) {
  const out = [];
  for (const texture of doc.getRoot().listTextures()) {
    const bytes = texture.getImage();
    const meta = await sharp(Buffer.from(bytes)).metadata();
    out.push({ name: texture.getName() || texture.getURI(), mime: texture.getMimeType(), width: meta.width, height: meta.height, bytes: bytes.byteLength });
  }
  return out;
}

/**
 * @param {Uint8Array|Buffer} bytes a GLB
 * @param {{ textures?: boolean, maxTexture?: number|null, smallTextures?: { pattern: RegExp, size: number }|null }} options
 * @returns {Promise<{ buffer: Buffer, problems: string[], primitives: number, textures: { before: object[], after: object[] } }>}
 */
export async function optimizeGlb(bytes, { textures = false, maxTexture = null, smallTextures = null } = {}) {
  const input = new Uint8Array(bytes);
  const original = await io.readBinary(input);
  const before = summarize(original);
  const soupBefore = triangleSoup(original);
  const texturesBefore = await textureReport(original);

  const doc = await io.readBinary(input);
  await doc.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  if (textures) {
    // One texture at a time, so each is encoded once, at the size and fidelity its role calls for:
    // colour maps lossy, normal maps lossless (see above), and the limit its name earns.
    for (const texture of doc.getRoot().listTextures()) {
      const isNormal = listTextureSlots(texture).includes('normalTexture');
      const label = `${texture.getName()} ${texture.getURI()}`;
      const limit = smallTextures && smallTextures.pattern.test(label) ? smallTextures.size : maxTexture;
      await compressTexture(texture, {
        encoder: sharp, targetFormat: 'webp', effort: 80,
        ...(isNormal ? { lossless: true } : { quality: 80 }),
        ...(limit ? { resize: [limit, limit] } : {}),
      });
    }
    // The `textureCompress` transform declares this itself; compressing a texture directly does not, and a
    // WebP image without EXT_texture_webp in the file is not valid glTF (a loader is entitled to refuse it).
    if (doc.getRoot().listTextures().some((texture) => texture.getMimeType() === 'image/webp')) {
      doc.createExtension(EXTTextureWebP).setRequired(true);
    }
  }

  const buffer = Buffer.from(await io.writeBinary(doc));
  const decoded = await io.readBinary(new Uint8Array(buffer));
  const problems = audit(before, summarize(decoded));
  if (!sameSoup(soupBefore, triangleSoup(decoded))) problems.push('decoded geometry is not identical to the input (not lossless)');
  return { buffer, problems, primitives: soupBefore.length, textures: { before: texturesBefore, after: await textureReport(decoded) } };
}
