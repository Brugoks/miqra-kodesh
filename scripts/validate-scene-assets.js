// Verification script for biblical scene realism assets.
// Checks existence, file sizes, content hashes, format restrictions, and license/source metadata.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SCENE_ASSET_MANIFEST } from '../src/components/scene/sceneAssetManifest.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const ALLOWED_FORMATS = new Set(['.png', '.webp', '.glb', '.ogg', '.wav']);
const ALLOWED_LICENSES = new Set(['CC0', 'CC-BY-3.0', 'CC-BY-4.0', 'Public Domain', 'MIT']);

function checkFile(relUrl, expectedSize = null, expectedHash = null) {
  const filePath = path.join(PUBLIC_DIR, relUrl.replace(/^\//, ''));
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `File missing: ${relUrl}` };
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_FORMATS.has(ext)) {
    return { ok: false, error: `Disallowed format: ${ext} for ${relUrl}` };
  }
  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    return { ok: false, error: `File empty: ${relUrl}` };
  }
  if (expectedSize !== null && stat.size !== expectedSize) {
    return { ok: false, error: `Size mismatch on ${relUrl}: expected ${expectedSize}, got ${stat.size}` };
  }
  if (expectedHash !== null) {
    const buf = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
    if (hash !== expectedHash) {
      return { ok: false, error: `Hash mismatch on ${relUrl}: expected ${expectedHash}, got ${hash}` };
    }
  }
  return { ok: true, size: stat.size };
}

// The extensions a GLB says a loader must understand, read from its JSON chunk.
function glbJson(relUrl) {
  const buf = fs.readFileSync(path.join(PUBLIC_DIR, relUrl.replace(/^\//, '')));
  if (buf.toString('ascii', 0, 4) !== 'glTF') return null;
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
}
function requiredExtensions(relUrl) {
  const json = glbJson(relUrl);
  return json ? json.extensionsRequired || [] : null;
}

// A model is either plain or compressed, and the manifest has to say which, because
// the loader's decoder is the only thing standing between a compressed file and an
// error. A compressed model also names an uncompressed `fallback`: the asset session
// tries it only if the compressed file fails, so it must not need the decoder itself.
function checkCompression(sceneSlug, model, errors) {
  const required = model.url.endsWith('.glb') ? requiredExtensions(model.url) : [];
  if (required === null) { errors.push(`[${sceneSlug}] Model ${model.id}: ${model.url} is not a GLB`); return; }
  const needsMeshopt = required.includes('EXT_meshopt_compression');
  const declared = model.compression === 'meshopt';
  if (model.compression && model.compression !== 'meshopt') {
    errors.push(`[${sceneSlug}] Model ${model.id}: unknown compression "${model.compression}"`);
  }
  if (needsMeshopt !== declared) {
    errors.push(`[${sceneSlug}] Model ${model.id}: file ${needsMeshopt ? 'requires' : 'does not use'} EXT_meshopt_compression but the manifest ${declared ? 'declares' : 'does not declare'} compression: 'meshopt'`);
  }
  const unsupported = required.filter((name) => !['EXT_meshopt_compression', 'EXT_texture_webp'].includes(name));
  if (unsupported.length) errors.push(`[${sceneSlug}] Model ${model.id}: requires ${unsupported.join(', ')}, which the loader is not set up for`);
  // WebP images are valid glTF only with EXT_texture_webp declared, and not otherwise.
  const usesWebp = (glbJson(model.url)?.images || []).some((image) => image.mimeType === 'image/webp');
  if (usesWebp !== required.includes('EXT_texture_webp')) {
    errors.push(`[${sceneSlug}] Model ${model.id}: ${usesWebp ? 'has WebP images but does not declare EXT_texture_webp' : 'declares EXT_texture_webp but has no WebP images'}`);
  }
  if (declared && !model.fallback) errors.push(`[${sceneSlug}] Model ${model.id}: a compressed model needs an uncompressed fallback`);
  if (model.fallback) {
    const res = checkFile(model.fallback);
    if (!res.ok) errors.push(`[${sceneSlug}] Model ${model.id} fallback: ${res.error}`);
    else if (requiredExtensions(model.fallback)?.includes('EXT_meshopt_compression')) {
      errors.push(`[${sceneSlug}] Model ${model.id}: the fallback ${model.fallback} also needs the meshopt decoder`);
    }
  }
}

function runValidation() {
  console.log('Validating scene asset manifest and files...');
  let totalChecked = 0;
  let totalBytes = 0;
  const errors = [];

  for (const [sceneSlug, sceneData] of Object.entries(SCENE_ASSET_MANIFEST)) {
    // Materials
    if (sceneData.materials) {
      for (const mat of sceneData.materials) {
        if (!mat.source) errors.push(`Material ${mat.id} missing source evidence ID`);
        if (!mat.license || !ALLOWED_LICENSES.has(mat.license)) {
          errors.push(`Material ${mat.id} has invalid license: ${mat.license}`);
        }
        // The full-size maps, and the small tier phones load instead.
        for (const [tier, maps, files] of [['', mat.maps, mat.files], [' (small)', mat.mapsLow, mat.filesLow]]) {
          for (const [mapType, mapUrl] of Object.entries(maps || {})) {
            const file = files?.[mapType];
            const res = checkFile(mapUrl, file?.size ?? null, file?.hash ?? null);
            if (!res.ok) errors.push(`[${sceneSlug}] Mat ${mat.id} ${mapType}${tier}: ${res.error}`);
            else {
              totalChecked += 1;
              totalBytes += res.size;
            }
          }
        }
      }
    }

    // Models
    if (sceneData.models) {
      for (const model of sceneData.models) {
        if (!model.source) errors.push(`Model ${model.id} missing source evidence ID`);
        const mixedCharacter = model.license === 'CC0 + Adobe Mixamo'
          && model.geometryLicense === 'CC0' && model.animationLicense === 'Adobe Mixamo'
          && Object.values(model.motion || {}).some(motion => motion.source === 'Adobe Mixamo' && /^[a-f0-9]{64}$/.test(motion.sourceSha256));
        if (!model.license || (!ALLOWED_LICENSES.has(model.license) && !mixedCharacter)) {
          errors.push(`Model ${model.id} has invalid license: ${model.license}`);
        }
        const res = checkFile(model.url, model.size, model.hash);
        if (!res.ok) errors.push(`[${sceneSlug}] Model ${model.id}: ${res.error}`);
        else {
          totalChecked += 1;
          totalBytes += res.size;
          checkCompression(sceneSlug, model, errors);
        }
      }
    }

    // Audio
    if (sceneData.audio) {
      for (const snd of sceneData.audio) {
        if (!snd.license || !ALLOWED_LICENSES.has(snd.license)) {
          errors.push(`Audio ${snd.id} has invalid license: ${snd.license}`);
        }
        const res = checkFile(snd.url, snd.size, snd.hash);
        if (!res.ok) errors.push(`[${sceneSlug}] Audio ${snd.id}: ${res.error}`);
        else {
          totalChecked += 1;
          totalBytes += res.size;
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`Asset validation FAILED with ${errors.length} errors:`);
    errors.forEach((err) => console.error('  - ' + err));
    process.exit(1);
  }

  const mb = (totalBytes / (1024 * 1024)).toFixed(2);
  console.log(`Asset validation PASSED! Verified ${totalChecked} assets (${mb} MB total payload).`);
}

runValidation();
