/* global process, Buffer */
// Batch-generate default pictures for Bible Wiki entries via the image-proxy
// edge function (FLUX / Cloudflare Workers AI, with server-side fallbacks) and
// upload them to the public wiki-images bucket under _default/<slug>.jpg.
// The app shows these as fallbacks wherever an org hasn't set its own picture.
//
// Only entries with a curated prompt run: every place (curated hint or generic
// fallback), but people ONLY when they have a hand-written scene in
// scripts/wiki-image-prompts.js — everyone else is left to the in-app
// admin Generate button. God / Holy Spirit / Jesus are never generated here.
//
// Usage:
//   node scripts/generate-wiki-images.js               # generate all missing
//   node scripts/generate-wiki-images.js --dry-run     # print prompts only
//   node scripts/generate-wiki-images.js --limit 5     # first 5 missing
//   node scripts/generate-wiki-images.js --only david_994
//
// Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
// Idempotent: existing _default images are skipped, so it can be re-run to
// resume after failures. Delete a _default/<slug>.jpg to force a redo.

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { NO_BATCH_IMAGE, STYLE, PERSON_SCENES, PLACE_HINTS, DEFAULT_PLACE_HINT_SUFFIX } from './wiki-image-prompts.js';

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
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : Infinity;
const offsetIdx = args.indexOf('--offset');
const offsetVal = offsetIdx !== -1 ? Number(args[offsetIdx + 1]) : 0;
const onlyIdx = args.indexOf('--only');
const only = onlyIdx !== -1 ? args[onlyIdx + 1] : null;

const wiki = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/assets/bible-wiki.json'), 'utf8'));
const churchTeachers = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/assets/church-teachers.json'), 'utf8'));

// Post-biblical figures get period-accurate art direction, not ancient Near East.
const TEACHER_STYLE =
  'dignified realistic portrait painting, warm natural light, historically accurate period dress and setting, '
  + 'no anachronisms, no text, no words, no watermark, no halo';

function promptFor(entry, type) {
  if (NO_BATCH_IMAGE.has(entry.s)) return null;
  if (type === 'person') {
    const scene = PERSON_SCENES[entry.s];
    return scene ? `${scene}, ${STYLE}` : null;
  }
  const hint = PLACE_HINTS[entry.s] || `${entry.n}, ${DEFAULT_PLACE_HINT_SUFFIX}`;
  return `${hint}, ${STYLE}`;
}

// Stable per-slug seed so re-runs of a deleted image are reproducible.
function seedFor(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h % 1000000;
}

const targets = [];
for (const p of wiki.people) {
  const prompt = promptFor(p, 'person');
  if (prompt) targets.push({ slug: p.s, name: p.t || p.n, prompt });
}
for (const pl of wiki.places) {
  const prompt = promptFor(pl, 'place');
  if (prompt) targets.push({ slug: pl.s, name: pl.n, prompt });
}
for (const t of churchTeachers.teachers) {
  if (t.img) targets.push({ slug: t.s, name: t.n, prompt: `${t.img}, ${TEACHER_STYLE}` });
}

// ~4KB card thumbnail uploaded next to every full image; the wiki index
// loads these instead of the ~450KB originals.
async function uploadThumb(slug, fullBytes) {
  const thumb = await sharp(fullBytes).resize(128, 128, { fit: 'cover' }).jpeg({ quality: 70 }).toBuffer();
  const { error } = await supabase.storage
    .from('wiki-images')
    .upload(`_default/thumbs/${slug}.jpg`, thumb, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
}

const existing = new Set();
const existingThumbs = new Set();
{
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from('wiki-images')
      .list('_default', { limit: 100, offset });
    if (error) {
      console.error('Could not list existing default images:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const f of data) {
      if (f.name.endsWith('.jpg')) existing.add(f.name.replace(/\.jpg$/, ''));
    }
    offset += data.length;
  }

  let offsetThumbs = 0;
  while (true) {
    const { data: thumbs, error } = await supabase.storage
      .from('wiki-images')
      .list('_default/thumbs', { limit: 100, offset: offsetThumbs });
    if (error) break;
    if (!thumbs || thumbs.length === 0) break;
    for (const f of thumbs) existingThumbs.add(f.name.replace(/\.jpg$/, ''));
    offsetThumbs += thumbs.length;
  }
}

// Backfill thumbnails for full images generated before thumbs existed.
if (!dryRun) {
  const missingThumbs = [...existing].filter((slug) => !existingThumbs.has(slug));
  if (missingThumbs.length) {
    console.log(`Backfilling ${missingThumbs.length} thumbnails...`);
    for (const slug of missingThumbs) {
      try {
        const { data, error } = await supabase.storage.from('wiki-images').download(`_default/${slug}.jpg`);
        if (error) throw error;
        await uploadThumb(slug, Buffer.from(await data.arrayBuffer()));
      } catch (err) {
        console.log(`  thumb FAILED for ${slug}: ${err.message}`);
      }
    }
    console.log('Thumbnail backfill done.');
  }
}

let queue = targets.filter((t) => !existing.has(t.slug));
if (only) queue = targets.filter((t) => t.slug === only);
queue = queue.slice(offsetVal, offsetVal + limit);

console.log(`${targets.length} eligible entries, ${existing.size} already generated, ${queue.length} to do${dryRun ? ' (dry run)' : ''}.`);

if (dryRun) {
  for (const t of queue) console.log(`\n[${t.slug}] ${t.prompt}`);
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
let failed = 0;

function imageErrorMessage(json, status) {
  const parts = [
    json?.error,
    json?.detail,
    ...(json?.providerErrors || []).flatMap((e) => [
      e?.provider ? `${e.provider}${e.status ? ` ${e.status}` : ''}` : null,
      e?.error,
      e?.detail,
    ]),
  ].filter(Boolean);
  return [...new Set(parts)].join(' | ') || `HTTP ${status}`;
}

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
      if (!res.ok || !json?.image) throw new Error(imageErrorMessage(json, res.status));

      const match = json.image.match(/^data:(image\/[a-z+]+);base64,(.+)$/s);
      if (!match) throw new Error('Unexpected image payload');
      const [, mime, b64] = match;
      const bytes = Buffer.from(b64, 'base64');
      // Path is always .jpg for a predictable client fallback URL; browsers
      // render by the stored Content-Type, so a webp/png payload still works.
      const { error: upErr } = await supabase.storage
        .from('wiki-images')
        .upload(`_default/${t.slug}.jpg`, bytes, { contentType: mime, upsert: true });
      if (upErr) throw upErr;
      await uploadThumb(t.slug, bytes);
      console.log(`ok (${Math.round(bytes.length / 1024)}KB${json.provider ? `, ${json.provider}` : ''})`);
      ok += 1;
      done = true;
    } catch (err) {
      if (attempt === 2) {
        console.log(`FAILED: ${err.message}`);
        failed += 1;
      } else {
        await sleep(3000);
      }
    }
  }
  await sleep(1200);
}

console.log(`\nDone: ${ok} generated, ${failed} failed, ${existing.size} pre-existing. Re-run to retry failures.`);
