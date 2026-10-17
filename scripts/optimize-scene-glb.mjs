// Shrink a scene GLB without changing what it draws. The method, and why it stops
// where it does, is documented in scripts/lib/optimize-glb.mjs.
//
//   node scripts/optimize-scene-glb.mjs public/assets/scenes/capernaum/models/jar-85d866df.glb
//   node scripts/optimize-scene-glb.mjs <input.glb> --textures            # also re-encode images
//   node scripts/optimize-scene-glb.mjs <input.glb> --textures --max-texture 1024
//   node scripts/optimize-scene-glb.mjs <input.glb> --dry-run             # report only, write nothing
//
// Writes `<name>-<hash8>.glb` beside the input (the repository's content-hashed naming)
// and prints the manifest fields to paste. It never overwrites the input, which stays
// as the explicit fallback the asset session can load if the compressed file fails.
// The character packaging scripts call the same module and write their own manifests.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { optimizeGlb } from './lib/optimize-glb.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const limitAt = args.indexOf('--max-texture');
const limitValueAt = limitAt >= 0 ? limitAt + 1 : -1;
const maxTexture = limitAt >= 0 ? Number(args[limitValueAt]) : null;
const input = args.find((a, i) => !a.startsWith('--') && i !== limitValueAt);
if (!input || (limitAt >= 0 && !(maxTexture > 0))) {
  console.error('usage: node scripts/optimize-scene-glb.mjs <input.glb> [--textures [--max-texture N]] [--dry-run]');
  process.exit(2);
}

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const kib = (n) => `${(n / 1024).toFixed(1)} KiB`;

const originalBytes = fs.readFileSync(input);
const { buffer, problems, primitives, textures } = await optimizeGlb(originalBytes, { textures: flags.has('--textures'), maxTexture });
const hash = sha(buffer).slice(0, 8);
const base = path.basename(input, '.glb').replace(/-[0-9a-f]{8,}$/, '');
const outPath = path.join(path.dirname(input), `${base}-${hash}.glb`);
const publicRoot = path.resolve(import.meta.dirname, '..', 'public');

console.log(`${path.basename(input)}: ${kib(originalBytes.length)} -> ${kib(buffer.length)} (${((buffer.length / originalBytes.length) * 100).toFixed(0)}%)${flags.has('--textures') ? ', textures re-encoded' : ''}${maxTexture ? `, limited to ${maxTexture}px` : ''}`);
for (const [i, before] of textures.before.entries()) {
  const after = textures.after[i];
  if (before.width !== after.width) console.log(`  ${before.name}: ${before.width}x${before.height} -> ${after.width}x${after.height}`);
}
if (problems.length) {
  console.error('AUDIT FAILED, nothing written:');
  problems.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}
console.log(`audit passed: node names, node->mesh, skin joints, animations, materials, ${primitives} primitive(s) of identical triangles, attribute types unchanged`);
if (flags.has('--dry-run')) process.exit(0);

fs.writeFileSync(outPath, buffer);
console.log(`wrote ${path.relative(process.cwd(), outPath)}`);
console.log(`manifest fields: url: '/${path.relative(publicRoot, outPath)}', size: ${buffer.length}, hash: '${hash}', sha256: '${sha(buffer)}'`);
console.log(`fallback (keep the input file): '/${path.relative(publicRoot, path.resolve(input))}'`);
