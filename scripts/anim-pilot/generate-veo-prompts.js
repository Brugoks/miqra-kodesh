// Generate copy-paste-ready Veo image-to-video prompts for every Bible Wiki
// character that does NOT yet have a published animation.
//
// Your manual step today is: ChatGPT (image) -> Gemini (image-to-video). This
// script removes the first half of the thinking — it produces a per-character
// prompt file you paste straight into the video model, plus a manifest of what
// to generate. Save each model output as <slug>.mp4 in one folder, then run
// scripts/anim-pilot/process-batch.sh on that folder to publish them all.
//
// Usage:
//   node scripts/anim-pilot/generate-veo-prompts.js [--out prompts/] [--limit N] [--force]
//
//   --out    where to write the per-character .txt prompt files (default: scripts/anim-pilot/veo-prompts)
//   --limit  cap the number of characters (handy for a first pass)
//   --force  include slugs already in wiki-animations.json (to regenerate)
//
// The Step-1 image prompt is character-specific (props, dress, and a hint of
// the figure's signature scene) via src/lib/characterIconography.js — the same
// builder the in-app Generate button uses. The Step-2 video prompt keeps the
// README's style verbatim so clips match the pipeline: locked camera, ambient
// looping motion, 5-10s, full frame.

import fs from 'fs';
import path from 'path';
import { buildPersonPortraitPrompt } from '../../src/lib/characterIconography.js';

const ROOT = process.cwd();
const core = JSON.parse(
  fs.readFileSync(path.resolve(ROOT, 'src/assets/bible-wiki.json'), 'utf8')
);
const extended = JSON.parse(
  fs.readFileSync(path.resolve(ROOT, 'src/assets/bible-wiki-extended.json'), 'utf8')
);
const curated = JSON.parse(
  fs.readFileSync(path.resolve(ROOT, 'src/assets/bible-wiki-curated.json'), 'utf8')
);

// Candidate roster: core people first (already weight-ranked — the recognizable
// figures whose iconography matters most), then the extended long tail. Deduped
// by slug so a core entry wins. Mirrors loadBibleWikiFull's ordering.
const roster = [];
const rosterSeen = new Set();
for (const p of [...(core.people || []), ...(extended.people || [])]) {
  if (rosterSeen.has(p.s)) continue;
  rosterSeen.add(p.s);
  roster.push(p);
}
const manifest = JSON.parse(
  fs.readFileSync(path.resolve(ROOT, 'src/assets/wiki-animations.json'), 'utf8')
);

const NO_GENERATED_IMAGE = new Set(['god_1324', 'holy_spirit_7400', 'jesus_905']);

function formatYear(year) {
  if (year == null) return null;
  return year < 0 ? `${-year} BC` : `AD ${year}`;
}
function formatYearRange(y) {
  if (!Array.isArray(y)) return formatYear(y);
  const [a, b] = y;
  if (a == null && b == null) return null;
  if (a != null && b != null) return `${formatYear(a)}–${formatYear(b)}`;
  return formatYear(a != null ? a : b);
}

// Pull the richest data we have per slug from either source (core wins).
const personById = new Map();
for (const p of roster) personById.set(p.s, p);
const curatedById = new Map(Object.entries(curated).filter(([, v]) => v && v.t));

function personInfo(slug) {
  const ext = personById.get(slug);
  const cur = curatedById.get(slug);
  const name = ext?.n || cur?.t || cur?.n || slug;
  const gender = ext?.g || cur?.g || null;
  const era = formatYearRange(ext?.y ?? cur?.y);
  const desc = cur?.desc || '';
  const arc = cur?.arc || null;
  return { name, gender, era, desc, arc };
}

// Short, reusable environmental cue — kept generic so it doesn't fight the
// character's own scene (the README stresses ambient motion, not re-imagining).
const AMBIENT =
  'Animate this exact image with subtle looping ambient motion. Keep the composition, ' +
  'character, and art style unchanged. The camera is completely locked — no zoom, no pan, ' +
  'no cuts. Motion should be ambient (wind through robes and hair, drifting dust or light, ' +
  'slow cloud or shadow movement) so the loop seam dissolves cleanly. ' +
  'Continuous, slow, majestic motion throughout. 6 seconds.';

function buildPrompt(slug, info) {
  const scene =
    info.desc && info.desc.length > 20
      ? ` Subject context: ${info.desc.slice(0, 220).trim()}.`
      : '';
  // Character-specific portrait shared with the in-app Generate button so the
  // still carries visual hints of who the figure is (props, dress, key scene).
  const imagePrompt = `${buildPersonPortraitPrompt({
    slug,
    name: info.name,
    gender: info.gender,
    era: info.era,
    arc: info.arc,
  })}.`;
  return { imagePrompt, videoPrompt: `${AMBIENT}${scene}` };
}

// Flags
let outDir = path.resolve(ROOT, 'scripts/anim-pilot/veo-prompts');
let limit = Infinity;
let force = false;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--out') outDir = path.resolve(process.argv[++i]);
  else if (a === '--limit') limit = parseInt(process.argv[++i], 10);
  else if (a === '--force') force = true;
}

// Collect candidate people from the merged roster (core first, then long tail).
const candidates = roster
  .filter((p) => !NO_GENERATED_IMAGE.has(p.s))
  .filter((p) => force || !(p.s in manifest))
  .slice(0, limit);

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(outDir, 'meta'), { recursive: true });

const queue = [];
for (const p of candidates) {
  const info = personInfo(p.s);
  const { imagePrompt, videoPrompt } = buildPrompt(p.s, info);
  const txt = [
    `# ${info.name} (${p.s})`,
    info.era ? `# Era: ${info.era}` : '',
    '',
    '## Step 1 — Image (paste into your image model, e.g. Codex)',
    imagePrompt,
    '',
    '## Step 2 — Video (paste image + prompt into Gemini Veo)',
    videoPrompt,
    '',
    `## Save output as: ${p.s}.mp4`,
    '',
  ].filter(Boolean).join('\n');
  fs.writeFileSync(path.join(outDir, `${p.s}.txt`), txt);
  queue.push({ slug: p.s, name: info.name, era: info.era, promptFile: `${p.s}.txt` });
}

fs.writeFileSync(
  path.join(outDir, 'meta', 'queue.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), count: queue.length, items: queue }, null, 2)
);

console.log(`Wrote ${queue.length} Veo prompt file(s) to ${outDir}`);
console.log('Next: generate the clips, drop each <slug>.mp4 into one folder, then:');
console.log(`  ./scripts/anim-pilot/process-batch.sh <clips-folder>`);
if (!force && candidates.length === 0) {
  console.log('(all candidates already have animations — use --force to regenerate)');
}
