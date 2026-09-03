// Fetches elevation (SRTM 90m resolution) for every place in the Ancient
// World Atlas and bakes it into src/assets/atlas-elevation.json. Kept as its
// own asset, separate from bible-atlas.json — see
// docs/atlas-enhancements-plan.md §3a: a failed/partial elevation run can
// never corrupt the main atlas asset this way, and build-atlas.js stays
// deterministic and offline.
//
// Usage:
//   node scripts/build-atlas-elevation.js            # fetches missing elevations
//   node scripts/build-atlas-elevation.js --check    # CI drift check (offline, see below)

import fs from 'fs';
import path from 'path';

const ASSETS_DIR = path.resolve(process.cwd(), 'src/assets');
const ATLAS_PATH = path.join(ASSETS_DIR, 'bible-atlas.json');
const OUT_PATH = path.join(ASSETS_DIR, 'atlas-elevation.json');

const ENDPOINT = 'https://api.opentopodata.org/v1/srtm90m';
const BATCH_SIZE = 100; // measured: 101 locations in one request returns INVALID_REQUEST
const REQUEST_DELAY_MS = 1100; // stay under the public API's 1 req/sec rate limit

export function roundElevation(metres) {
  return metres == null ? null : Math.round(metres);
}

// Which of the atlas's current place slugs have no entry yet (need
// fetching), and which entries in the elevation file no longer correspond
// to any current place (stale — the place was renamed/removed upstream).
export function diffElevations(placeSlugs, elevations) {
  const slugSet = new Set(placeSlugs);
  const known = new Set(Object.keys(elevations));
  return {
    missing: placeSlugs.filter((s) => !known.has(s)),
    stale: [...known].filter((s) => !slugSet.has(s)),
  };
}

function stableStringify(value) {
  const sorted = {};
  for (const key of Object.keys(value).sort()) sorted[key] = value[key];
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBatch(places) {
  const locations = places.map((p) => `${p.la},${p.lo}`).join('|');
  const res = await fetch(`${ENDPOINT}?locations=${locations}`);
  if (!res.ok) throw new Error(`opentopodata request failed: ${res.status} ${res.statusText}`);
  const body = await res.json();
  if (body.status !== 'OK') throw new Error(`opentopodata returned status "${body.status}"`);
  return body.results.map((r) => roundElevation(r.elevation));
}

async function main() {
  const atlas = JSON.parse(fs.readFileSync(ATLAS_PATH, 'utf8'));
  const placeSlugs = atlas.places.map((p) => p.s);
  const existing = fs.existsSync(OUT_PATH) ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')) : {};

  const { missing, stale } = diffElevations(placeSlugs, existing);

  if (process.argv.includes('--check')) {
    // Deliberately offline, unlike the fetch path below — an elevation value
    // doesn't drift once measured, so re-querying every place on every CI
    // run would only add network flakiness for no benefit. This just checks
    // the committed asset is in sync with the current place list.
    if (missing.length || stale.length) {
      console.error('atlas-elevation.json is out of sync with bible-atlas.json.');
      if (missing.length) {
        console.error(`  ${missing.length} place(s) missing an elevation, e.g. ${missing.slice(0, 5).join(', ')}`);
      }
      if (stale.length) {
        console.error(`  ${stale.length} stale entr${stale.length === 1 ? 'y' : 'ies'} for place(s) no longer in the atlas, e.g. ${stale.slice(0, 5).join(', ')}`);
      }
      console.error('Run `node scripts/build-atlas-elevation.js` and commit the result.');
      process.exit(1);
    }
    console.log('atlas-elevation.json is up to date.');
    return;
  }

  for (const slug of stale) delete existing[slug];

  if (!missing.length) {
    if (stale.length) fs.writeFileSync(OUT_PATH, stableStringify(existing));
    console.log('atlas-elevation.json already covers every atlas place.');
    return;
  }

  const placesBySlug = new Map(atlas.places.map((p) => [p.s, p]));
  const toFetch = missing.map((s) => placesBySlug.get(s));

  console.log(`Fetching elevation for ${toFetch.length} place(s) in batches of ${BATCH_SIZE}...`);
  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    const elevations = await fetchBatch(batch);
    batch.forEach((place, j) => { existing[place.s] = elevations[j]; });
    // Write after every batch, not just at the end, so a rate-limit failure
    // partway through a 13-request run keeps the progress already made —
    // the next invocation resumes from whatever is still missing.
    fs.writeFileSync(OUT_PATH, stableStringify(existing));
    console.log(`  ${Math.min(i + BATCH_SIZE, toFetch.length)}/${toFetch.length}`);
    if (i + BATCH_SIZE < toFetch.length) await sleep(REQUEST_DELAY_MS);
  }

  console.log(`Wrote ${OUT_PATH}`);
}

// Guarded so this file's pure helpers (roundElevation, diffElevations) can
// be imported and unit-tested without triggering a live network run.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
