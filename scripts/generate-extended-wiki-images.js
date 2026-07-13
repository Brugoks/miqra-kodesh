/* global process, Buffer */
// Batch-generate default pictures for the Bible Wiki LONG TAIL — the ~2,800
// people + ~1,100 places in src/assets/bible-wiki-extended.json that aren't in
// the curated core. These entries have no hand-written scene, so prompts come
// from a generic text-grounded builder (a port of buildImagePrompt in
// src/lib/bibleWiki.js — keep the two in sync) rather than wiki-image-prompts.js.
//
// Images land in the same public wiki-images bucket under _default/<slug>.jpg
// (+ a 128px thumb under _default/thumbs/<slug>.jpg), so WikiEntryImage and the
// wiki index pick them up automatically, exactly like the core set.
//
// Usage:
//   node scripts/generate-extended-wiki-images.js              # generate all missing
//   node scripts/generate-extended-wiki-images.js --dry-run    # print prompts only
//   node scripts/generate-extended-wiki-images.js --limit 20   # first 20 missing
//   node scripts/generate-extended-wiki-images.js --people     # people only
//   node scripts/generate-extended-wiki-images.js --places     # places only
//   node scripts/generate-extended-wiki-images.js --only ziba_3060
//
// Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
// Idempotent and resumable: existing _default images are skipped, so re-run
// after the daily Cloudflare quota runs out to pick up where it stopped.
// This is a MULTI-DAY job on the free tier — ~3,900 images total.

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const dotenvPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(dotenvPath)) {
  const envContent = fs.readFileSync(dotenvPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if (!val) return;
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const peopleOnly = args.includes('--people');
const placesOnly = args.includes('--places');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : Infinity;
const onlyIdx = args.indexOf('--only');
const only = onlyIdx !== -1 ? args[onlyIdx + 1] : null;

const extended = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/assets/bible-wiki-extended.json'), 'utf8'));

// Ported from buildImagePrompt / formatYear[Range] in src/lib/bibleWiki.js so
// batch art matches the in-app Generate button. God/Spirit/Jesus never appear
// in the extended tail, so the NO_GENERATED_IMAGE guard there is moot here.
const IMAGE_STYLE =
  'dignified realistic digital painting, warm natural light, historically accurate ancient Near East, '
  + 'Middle Eastern Semitic people, authentic period clothing and architecture, no anachronisms, '
  + 'no text, no words, no watermark, no halo';

function formatYear(year) {
  return year < 0 ? `${-year} BC` : `AD ${year}`;
}
function formatYearRange(y) {
  if (!Array.isArray(y)) return null;
  const [a, b] = y;
  if (a == null && b == null) return null;
  if (a != null && b != null) return `${formatYear(a)}–${formatYear(b)}`;
  return formatYear(a != null ? a : b);
}

function personPrompt(entry) {
  const era = formatYearRange(entry.y);
  const person = entry.g === 'F' ? 'a woman of the Bible' : entry.g === 'M' ? 'a man of the Bible' : 'a figure of the Bible';
  return `Reverent portrait of ${entry.n}, ${person}${era ? ` who lived around ${era}` : ''}, `
    + `in authentic ancient Near Eastern dress of the biblical era, ${IMAGE_STYLE}`;
}
function placePrompt(entry) {
  return `The biblical place ${entry.n}, an ancient Near Eastern landscape in the biblical era, `
    + `historically plausible terrain and settlement, ${IMAGE_STYLE}`;
}

const targets = [];
if (!placesOnly) {
  for (const p of (extended.people || [])) targets.push({ slug: p.s, name: p.n, prompt: personPrompt(p) });
}
if (!peopleOnly) {
  for (const pl of (extended.places || [])) targets.push({ slug: pl.s, name: pl.n, prompt: placePrompt(pl) });
}

// Stable per-slug seed so a re-run of a deleted image is reproducible.
function seedFor(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h % 1000000;
}

// ~4KB card thumbnail uploaded next to every full image; the wiki index loads
// these instead of the ~450KB originals.
async function uploadThumb(slug, fullBytes) {
  const thumb = await sharp(fullBytes).resize(128, 128, { fit: 'cover' }).jpeg({ quality: 70 }).toBuffer();
  const { error } = await supabase.storage
    .from('wiki-images')
    .upload(`_default/thumbs/${slug}.jpg`, thumb, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
}

// Storage list() caps at 100 rows per call regardless of `limit`, and there are
// thousands of files here, so page through with offset — otherwise the skip set
// is incomplete and we regenerate (and re-bill) images that already exist.
async function listAll(prefix) {
  const names = new Set();
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage
      .from('wiki-images')
      .list(prefix, { limit: pageSize, offset });
    if (error) throw error;
    for (const f of data || []) {
      if (f.name.endsWith('.jpg')) names.add(f.name.replace(/\.jpg$/, ''));
    }
    if (!data || data.length < pageSize) break;
  }
  return names;
}

let existing;
try {
  existing = await listAll('_default');
} catch (err) {
  console.error('Could not list existing default images:', err.message);
  process.exit(1);
}

let queue = targets.filter((t) => !existing.has(t.slug));
if (only) queue = targets.filter((t) => t.slug === only);
queue = queue.slice(0, limit);

console.log(`${targets.length} extended entries, ${existing.size} images already in _default, ${queue.length} to do${dryRun ? ' (dry run)' : ''}.`);

if (dryRun) {
  for (const t of queue.slice(0, 20)) console.log(`\n[${t.slug}] ${t.prompt}`);
  if (queue.length > 20) console.log(`\n… and ${queue.length - 20} more.`);
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
let failed = 0;
let quotaHits = 0;

for (const [i, t] of queue.entries()) {
  process.stdout.write(`(${i + 1}/${queue.length}) ${t.slug} ... `);
  let done = false;
  for (let attempt = 1; attempt <= 2 && !done; attempt++) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/image-proxy`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: t.prompt, steps: 8, seed: seedFor(t.slug) }),
      });
      const json = await res.json();
      if (!res.ok || !json?.image) throw new Error(json?.error || json?.detail || `HTTP ${res.status}`);

      const match = json.image.match(/^data:(image\/[a-z+]+);base64,(.+)$/s);
      if (!match) throw new Error('Unexpected image payload');
      const [, mime, b64] = match;
      const bytes = Buffer.from(b64, 'base64');
      const { error: upErr } = await supabase.storage
        .from('wiki-images')
        .upload(`_default/${t.slug}.jpg`, bytes, { contentType: mime, upsert: true });
      if (upErr) throw upErr;
      await uploadThumb(t.slug, bytes);
      console.log(`ok (${Math.round(bytes.length / 1024)}KB${json.provider ? `, ${json.provider}` : ''})`);
      ok += 1;
      done = true;
    } catch (err) {
      const quota = /quota|rate|limit|429|capacity|neuron/i.test(err.message);
      if (quota) quotaHits += 1;
      if (attempt === 2) {
        console.log(`FAILED: ${err.message}`);
        failed += 1;
      } else {
        await sleep(quota ? 8000 : 3000);
      }
    }
  }
  // Bail early on a run of quota errors — the rest will only fail too. Re-run
  // tomorrow to resume.
  if (quotaHits >= 12) {
    console.log('\nStopping: repeated quota/capacity errors — daily allotment likely exhausted. Re-run to resume.');
    break;
  }
  await sleep(1200);
}

console.log(`\nDone: ${ok} generated, ${failed} failed, ${existing.size} pre-existing. Re-run to continue.`);
