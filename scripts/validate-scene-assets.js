// Verification script for biblical scene realism assets.
// Checks existence, file sizes, content hashes, format restrictions, and license/source metadata.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SCENE_ASSET_MANIFEST } from '../src/components/scene/sceneAssetManifest.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const ALLOWED_FORMATS = new Set(['.png', '.webp', '.glb', '.ogg', '.wav']);
const ALLOWED_LICENSES = new Set(['CC0', 'CC-BY-4.0', 'Public Domain', 'MIT']);

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
        for (const [mapType, mapUrl] of Object.entries(mat.maps || {})) {
          const res = checkFile(mapUrl);
          if (!res.ok) errors.push(`[${sceneSlug}] Mat ${mat.id} ${mapType}: ${res.error}`);
          else {
            totalChecked += 1;
            totalBytes += res.size;
          }
        }
      }
    }

    // Models
    if (sceneData.models) {
      for (const model of sceneData.models) {
        if (!model.source) errors.push(`Model ${model.id} missing source evidence ID`);
        if (!model.license || !ALLOWED_LICENSES.has(model.license)) {
          errors.push(`Model ${model.id} has invalid license: ${model.license}`);
        }
        const res = checkFile(model.url, model.size, model.hash);
        if (!res.ok) errors.push(`[${sceneSlug}] Model ${model.id}: ${res.error}`);
        else {
          totalChecked += 1;
          totalBytes += res.size;
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
