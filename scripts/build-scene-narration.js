// Bake the guided-walk narration for every 3D scene into committed audio.
//
// The tour used to synthesise each vantage blurb the moment the visitor
// arrived there. That worked — fish-tts caches every line it makes, so the
// characters were paid for once — but it left three things wrong with it:
//
//   1. Every visitor still waited for a round-trip at every stop, on a line
//      that was already sitting in a bucket. Silence while the camera has
//      finished flying is the one moment the tour cannot afford.
//   2. A cache miss requires a signed-in user, so the first person to walk a
//      scene while logged out got no voice at all.
//   3. The voice we want — Rico — is a RESTRICTED voice in fish-tts, hidden
//      from the browser-facing picker. A visitor asking for it is silently
//      given the first unrestricted voice instead.
//
// All three go away if the narration is a build artefact rather than a runtime
// call. There are 22 blurbs in the whole app and they change about as often as
// the geometry does, so they are generated here, committed under
// public/assets/scenes/<slug>/narration/, and simply played — same treatment
// the materials, meshes and ambience loops already get from
// scripts/generate-scene-assets.js.
//
// Filenames carry a content hash of the exact text and voice, so editing a
// blurb produces a new file rather than a stale one that still says the old
// thing, and re-running this script after no edits does nothing at all.
//
// Usage:
//   node scripts/build-scene-narration.js             # generate what is missing
//   node scripts/build-scene-narration.js --check     # CI drift check, no calls
//   node scripts/build-scene-narration.js --prune     # also delete orphaned mp3s
//   node scripts/build-scene-narration.js --voice=Ram # a different voice
//
// Needs SUPABASE_SECRET_KEY in .env — see the note in supabase/functions/
// fish-tts/index.ts about which of the project's two service-role credentials
// the edge runtime actually recognises.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { execFileSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCENES_DIR = path.join(ROOT, 'public', 'assets', 'scenes');
const MANIFEST_PATH = path.join(ROOT, 'src', 'lib', 'sceneNarrationManifest.js');

const VOICE_LABEL = (process.argv.find((a) => a.startsWith('--voice=')) || '').slice(8) || 'Rico';
const CHECK_ONLY = process.argv.includes('--check');
const PRUNE = process.argv.includes('--prune');

// --- config ---------------------------------------------------------------

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) out[match[1]] = match[2];
  }
  return out;
}

const env = { ...loadEnv(), ...process.env };
const SUPABASE_URL = env.VITE_SUPABASE_URL;
// The NEW-format secret key (sb_secret_…). The legacy service_role JWT is a
// valid client everywhere else but is not what fish-tts compares against.
const SECRET_KEY = env.SUPABASE_SECRET_KEY;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/fish-tts`;

// --- scene manifests ------------------------------------------------------

// src/lib/scenes.js reaches the second-temple manifest, which is defined
// inline there rather than in its own file, and uses extension-less imports
// that bare node cannot resolve. Vite is already a devDependency and resolves
// them the same way the app does, so the script reads exactly the data the
// browser will.
async function loadScenes() {
  const { createServer } = await import('vite');
  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const scenes = await server.ssrLoadModule('/src/lib/scenes.js');
    const narration = await server.ssrLoadModule('/src/lib/sceneNarration.js');
    return {
      scenes: scenes.SCENES,
      // The same trim the runtime fallback would apply, so a blurb that is too
      // long for the synthesiser is cut identically in both paths.
      fitForSpeech: narration.fitForSpeech,
    };
  } finally {
    await server.close();
  }
}

// Every line the app needs, in tour order. Mirrors tourStops() in
// src/lib/sceneNarration.js — vantages, as authored, with their own blurbs.
function lineup(scenes, fitForSpeech) {
  const lines = [];
  for (const scene of Object.values(scenes)) {
    for (const vantage of scene.vantages || []) {
      const text = fitForSpeech(vantage.blurb);
      if (!text) continue;
      lines.push({ slug: scene.slug, id: vantage.id, label: vantage.label, text });
    }
  }
  return lines;
}

// --- synthesis ------------------------------------------------------------

async function fetchVoice() {
  const res = await fetch(FUNCTION_URL, {
    headers: { Authorization: `Bearer ${SECRET_KEY}`, apikey: SECRET_KEY },
  });
  if (!res.ok) throw new Error(`fish-tts GET ${res.status}: ${await res.text()}`);
  const { voices = [] } = await res.json();
  const wanted = voices.find((v) => v.label.toLowerCase() === VOICE_LABEL.toLowerCase());
  if (!wanted) {
    throw new Error(
      `No voice labelled "${VOICE_LABEL}". Available: ${voices.map((v) => v.label).join(', ') || 'none'}`,
    );
  }
  return wanted;
}

async function synthesise(text, voiceId) {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      apikey: SECRET_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, voice_id: voiceId }),
  });
  if (!res.ok) throw new Error(`fish-tts POST ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

// Fish returns 128 kb/s mono at 44.1 kHz, which is a music bitrate spent on one
// voice reading a paragraph. Half of that at 24 kHz is indistinguishable on
// speech and halves both what the repo carries and what a visitor on a phone
// downloads before the tour can start. A missing ffmpeg is not worth failing
// over — the original bytes play perfectly well.
function compress(bytes) {
  if (!ffmpegPath) return bytes;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'narration-'));
  const src = path.join(dir, 'in.mp3');
  const out = path.join(dir, 'out.mp3');
  try {
    fs.writeFileSync(src, bytes);
    execFileSync(ffmpegPath, [
      '-loglevel', 'error', '-y', '-i', src,
      '-ac', '1', '-ar', '24000', '-b:a', '64k', out,
    ]);
    const smaller = fs.readFileSync(out);
    return smaller.length && smaller.length < bytes.length ? smaller : bytes;
  } catch {
    return bytes;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// --- files ----------------------------------------------------------------

// The voice is in the hash as well as the text: switching voices has to
// produce different files, or the old one plays under the new manifest.
const contentHash = (voiceId, text) =>
  crypto.createHash('sha256').update(`${voiceId}:${text}`).digest('hex').slice(0, 8);

const fileFor = (line, voiceId) =>
  `/assets/scenes/${line.slug}/narration/${line.id}-${contentHash(voiceId, line.text)}.mp3`;

const diskPath = (publicPath) => path.join(ROOT, 'public', publicPath.replace(/^\//, ''));

function writeManifest(entries, voice) {
  const body = Object.entries(entries)
    .map(([slug, stops]) => {
      const rows = Object.entries(stops)
        .map(([id, row]) => `    '${id}': { file: '${row.file}', chars: ${row.chars} },`)
        .join('\n');
      return `  '${slug}': {\n${rows}\n  },`;
    })
    .join('\n');

  return `// GENERATED by scripts/build-scene-narration.js — do not edit by hand.
//
// Which pre-recorded line belongs to which vantage of which scene. The tour
// plays these straight off the origin; the fish-tts round-trip in
// src/lib/sceneNarration.js is only the fallback for a stop that is missing
// here (a blurb edited since the last build, most likely).
//
// Filenames carry a hash of the voice and the exact text, so a stale recording
// can never be served under an edited blurb: the lookup simply misses and the
// runtime path takes over until someone re-runs the script.

// The voice these were recorded in. Used to pick the nearest match when the
// runtime fallback does have to synthesise, so the tour does not change voice
// halfway through.
export const NARRATION_VOICE = '${voice.label}';

export const SCENE_NARRATION = {
${body}
};

// The recorded line for one vantage, or null if there isn't one.
export function narrationFor(slug, vantageId) {
  return SCENE_NARRATION[slug]?.[vantageId] || null;
}
`;
}

// --- main -----------------------------------------------------------------

async function main() {
  const { scenes, fitForSpeech } = await loadScenes();
  const lines = lineup(scenes, fitForSpeech);
  const chars = lines.reduce((sum, l) => sum + l.text.length, 0);
  console.log(`${lines.length} lines, ${chars} characters across ${Object.keys(scenes).length} scenes.`);

  if (!SUPABASE_URL || !SECRET_KEY) {
    throw new Error('VITE_SUPABASE_URL and SUPABASE_SECRET_KEY are required (see .env).');
  }

  const voice = await fetchVoice();
  console.log(`Voice: ${voice.label} (${voice.id}${voice.restricted ? ', restricted' : ''})`);

  const entries = {};
  const wanted = new Set();
  let made = 0;
  let kept = 0;

  for (const line of lines) {
    const file = fileFor(line, voice.id);
    wanted.add(diskPath(file));
    entries[line.slug] ??= {};
    entries[line.slug][line.id] = { file, chars: line.text.length };

    if (fs.existsSync(diskPath(file))) {
      kept += 1;
      continue;
    }
    if (CHECK_ONLY) {
      console.error(`missing: ${line.slug}/${line.id} — ${line.label}`);
      made += 1;
      continue;
    }

    process.stdout.write(`  ${line.slug}/${line.id} … `);
    const bytes = compress(await synthesise(line.text, voice.id));
    fs.mkdirSync(path.dirname(diskPath(file)), { recursive: true });
    fs.writeFileSync(diskPath(file), bytes);
    console.log(`${(bytes.length / 1024).toFixed(0)} KB`);
    made += 1;
  }

  // Anything left in a narration directory that no vantage points at is a
  // recording of a blurb that has since been edited.
  const orphans = [];
  for (const slug of Object.keys(scenes)) {
    const dir = path.join(SCENES_DIR, slug, 'narration');
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (!wanted.has(full)) orphans.push(full);
    }
  }
  for (const orphan of orphans) {
    if (PRUNE && !CHECK_ONLY) {
      fs.unlinkSync(orphan);
      console.log(`pruned ${path.relative(ROOT, orphan)}`);
    } else {
      console.log(`orphan (re-run with --prune): ${path.relative(ROOT, orphan)}`);
    }
  }

  const manifest = writeManifest(entries, voice);
  if (CHECK_ONLY) {
    const current = fs.existsSync(MANIFEST_PATH) ? fs.readFileSync(MANIFEST_PATH, 'utf8') : '';
    if (current !== manifest || made > 0) {
      console.error(`\nNarration is out of date: ${made} line(s) missing or changed.`);
      process.exitCode = 1;
      return;
    }
    console.log(`\nUp to date: ${kept} lines.`);
    return;
  }

  fs.writeFileSync(MANIFEST_PATH, manifest);
  console.log(`\n${made} generated, ${kept} already present. Wrote ${path.relative(ROOT, MANIFEST_PATH)}.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
