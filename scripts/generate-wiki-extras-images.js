// Batch-generate default pictures for the two sets the core generator skips:
//   * the 6 Church-History creeds/confessions (kind: 'creed') in
//     src/assets/church-teachers.json — they have no `img` portrait prompt
//     because they're documents, not people, so they get symbolic scene art;
//   * the ~450 Bible events in src/assets/bible-events.json — each has a
//     WikiEntryImage slot on its detail page (EventEntry) but no generated art.
//
// Images land in the same public wiki-images bucket under _default/<slug>.jpg
// (+ a 128px thumb), so WikiEntryImage picks them up automatically.
//
// Usage:
//   node scripts/generate-wiki-extras-images.js            # creeds + events, all missing
//   node scripts/generate-wiki-extras-images.js --dry-run  # print prompts only
//   node scripts/generate-wiki-extras-images.js --creeds   # creeds only
//   node scripts/generate-wiki-extras-images.js --events   # events only
//   node scripts/generate-wiki-extras-images.js --limit 10
//   node scripts/generate-wiki-extras-images.js --only the-fall
//
// Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
// Idempotent and resumable: existing _default images are skipped.

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
const creedsOnly = args.includes('--creeds');
const eventsOnly = args.includes('--events');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : Infinity;
const onlyIdx = args.indexOf('--only');
const only = onlyIdx !== -1 ? args[onlyIdx + 1] : null;

const teachers = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/assets/church-teachers.json'), 'utf8')).teachers;
const events = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/assets/bible-events.json'), 'utf8')).events;

// Ancient-Near-East art direction shared with buildImagePrompt in
// src/lib/bibleWiki.js — keep visually consistent with the rest of the wiki.
const IMAGE_STYLE =
  'dignified realistic digital painting, warm natural light, historically accurate ancient Near East, '
  + 'Middle Eastern Semitic people, authentic period clothing and architecture, no anachronisms, '
  + 'no text, no words, no watermark, no halo';

// Creeds/confessions get a symbolic assembly scene rather than a portrait.
// Period matters: an early creed is a council of bishops; a Reformation
// confession is a hall of divines — so pick the setting from the entry's era
// instead of the anachronistic one-size prompt the in-app button falls back to.
function creedPrompt(t) {
  const era = t.era || '';
  const reformation = /reformation|post-reformation|modern/i.test(era);
  const assembly = reformation
    ? 'an assembly of Reformation-era theologians and divines drafting a confession of faith, '
      + 'quill pens, printed books and parchment on a long table, candlelit wood-panelled hall, '
      + 'sober 16th-to-17th century European scholarly dress'
    : 'an assembly of early-church bishops and scribes composing a confession of faith, '
      + 'ancient scrolls and manuscripts, oil lamps in a candlelit stone hall, '
      + 'authentic late-antique clerical dress';
  return `A symbolic scene evoking ${t.n}: ${assembly}, `
    + 'dignified realistic historical painting, warm candlelight, historically accurate period dress '
    + 'and architecture, no anachronisms, no text, no words, no watermark, no halo';
}

function eventPrompt(ev) {
  return `${ev.n}, a dramatic narrative scene from the Bible depicting the event, ${IMAGE_STYLE}`;
}

const targets = [];
if (!eventsOnly) {
  for (const t of teachers) {
    if (t.kind === 'creed' && !t.img) targets.push({ slug: t.s, name: t.n, prompt: creedPrompt(t) });
  }
}
if (!creedsOnly) {
  for (const ev of events) targets.push({ slug: ev.s, name: ev.n, prompt: eventPrompt(ev) });
}

// Stable per-slug seed so a re-run of a deleted image is reproducible.
function seedFor(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h % 1000000;
}

async function uploadThumb(slug, fullBytes) {
  const thumb = await sharp(fullBytes).resize(128, 128, { fit: 'cover' }).jpeg({ quality: 70 }).toBuffer();
  const { error } = await supabase.storage
    .from('wiki-images')
    .upload(`_default/thumbs/${slug}.jpg`, thumb, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
}

// list() caps at 100 rows/call and _default already holds hundreds of files,
// so page through with offset or the skip set is incomplete and we re-bill.
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

console.log(`${targets.length} extra entries (creeds + events), ${queue.length} to do${dryRun ? ' (dry run)' : ''}.`);

if (dryRun) {
  for (const t of queue.slice(0, 20)) console.log(`\n[${t.slug}] ${t.prompt}`);
  if (queue.length > 20) console.log(`\n… and ${queue.length - 20} more.`);
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
let failed = 0;
let quotaHits = 0;

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

function isQuotaError(message) {
  return /quota|rate|limit|429|capacity|neuron|allocation|billing/i.test(message);
}

function isDailyQuotaExhausted(message) {
  return /daily free allocation|used up.*allocation|limit:\s*0|billing details/i.test(message);
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
      const { error: upErr } = await supabase.storage
        .from('wiki-images')
        .upload(`_default/${t.slug}.jpg`, bytes, { contentType: mime, upsert: true });
      if (upErr) throw upErr;
      await uploadThumb(t.slug, bytes);
      console.log(`ok (${Math.round(bytes.length / 1024)}KB${json.provider ? `, ${json.provider}` : ''})`);
      ok += 1;
      done = true;
    } catch (err) {
      const quota = isQuotaError(err.message);
      const dailyQuotaExhausted = isDailyQuotaExhausted(err.message);
      if (quota) quotaHits += dailyQuotaExhausted ? 12 : 1;
      if (attempt === 2 || dailyQuotaExhausted) {
        console.log(`FAILED: ${err.message}`);
        failed += 1;
        if (dailyQuotaExhausted) break;
      } else {
        await sleep(quota ? 8000 : 3000);
      }
    }
  }
  if (quotaHits >= 12) {
    console.log('\nStopping: repeated quota/capacity errors — daily allotment likely exhausted. Re-run to resume.');
    break;
  }
  await sleep(1200);
}

console.log(`\nDone: ${ok} generated, ${failed} failed. Re-run to continue.`);
