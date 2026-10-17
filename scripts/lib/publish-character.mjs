// Publish one packaged character as two files: the plain GLB exactly as the packaging
// script built it (the explicit fallback the asset session loads only if the optimized
// file fails), and the optimized one (scripts/lib/optimize-glb.mjs). Returns the
// manifest fields for both. Refuses to publish if the optimizer's audit finds that
// anything the runtime depends on changed.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { optimizeGlb } from './optimize-glb.mjs';

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

export async function publishCharacter({ id, plain, outputDir, urlBase, maxTexture = null, smallTextures = null }) {
  const plainHash = sha256(plain);
  const plainName = `${id}-${plainHash.slice(0, 12)}.glb`;
  const { buffer, problems, textures } = await optimizeGlb(plain, { textures: true, maxTexture, smallTextures });
  if (problems.length) throw new Error(`${id}: optimization changed what the runtime depends on:\n  - ${problems.join('\n  - ')}`);
  const hash = sha256(buffer);
  const name = `${id}-${hash.slice(0, 12)}.opt.glb`;
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, plainName), plain);
  await fs.writeFile(path.join(outputDir, name), buffer);
  // Drop this character's superseded OPTIMIZED files, the only ones this tool makes. The
  // plain GLBs are never removed here: they are earlier pipeline outputs that older
  // manifests may still name as fallbacks, and deleting them is a decision for a person.
  const mine = new RegExp(`^${id}-[0-9a-f]{12}\\.opt\\.glb$`);
  for (const file of await fs.readdir(outputDir)) {
    if (mine.test(file) && file !== name) await fs.rm(path.join(outputDir, file));
  }
  return {
    url: `${urlBase}/${name}`, size: buffer.length, hash: hash.slice(0, 8), sha256: hash,
    compression: 'meshopt',
    fallback: `${urlBase}/${plainName}`, fallbackSize: plain.length, fallbackSha256: plainHash,
    textures: textures.after.map(({ name: texture, width, height, mime }) => ({ name: texture, width, height, mime })),
  };
}
