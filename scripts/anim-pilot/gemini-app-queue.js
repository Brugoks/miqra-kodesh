#!/usr/bin/env node

import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUEUE_DIR = path.join(ROOT, 'scripts/anim-pilot/browser-queue');
const QUEUE_PATH = path.join(QUEUE_DIR, 'queue.json');
const IMAGE_DIR = path.join(QUEUE_DIR, 'images');
const DEFAULT_IMAGE_BASE = 'https://wiki-images.miqra-kodesh.com';
const VALID_STATUSES = new Set(['queued', 'submitted', 'downloaded', 'published', 'rejected']);
const STATUS_ORDER = new Map([
  ['queued', 0],
  ['submitted', 1],
  ['downloaded', 2],
  ['published', 3],
  ['rejected', 3],
]);

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(`Usage:
  node scripts/anim-pilot/gemini-app-queue.js prepare --manifest <file|-> [--replace] [--force]
  node scripts/anim-pilot/gemini-app-queue.js status [--json]
  node scripts/anim-pilot/gemini-app-queue.js next [--json]
  node scripts/anim-pilot/gemini-app-queue.js prompt <slug>
  node scripts/anim-pilot/gemini-app-queue.js mark <slug> submitted [--note <text>]
  node scripts/anim-pilot/gemini-app-queue.js attach <slug> <downloaded.mp4>
  node scripts/anim-pilot/gemini-app-queue.js reject <slug> [--note <text>]
  node scripts/anim-pilot/gemini-app-queue.js publish <slug> [--boomerang] [--square]
  node scripts/anim-pilot/gemini-app-queue.js publish-ready [--boomerang] [--square]
  node scripts/anim-pilot/gemini-app-queue.js clear [--force]

Manifest shape:
  { "items": [{ "slug": "rachel_2402", "name": "Rachel",
    "image": "/absolute/path/rachel.png", "prompt": "Animate..." }] }

The image field may be a local path or an HTTPS URL. When omitted, the
current Wiki image at _default/<slug>.jpg is staged automatically.`);
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return { positional, flags };
}

async function readStdin() {
  let value = '';
  for await (const chunk of process.stdin) value += chunk;
  return value;
}

async function readJson(file) {
  const raw = file === '-' ? await readStdin() : await fsp.readFile(path.resolve(file), 'utf8');
  return JSON.parse(raw);
}

async function readQueue({ required = true } = {}) {
  try {
    return JSON.parse(await fsp.readFile(QUEUE_PATH, 'utf8'));
  } catch (error) {
    if (!required && error.code === 'ENOENT') return null;
    if (error.code === 'ENOENT') usage('no Gemini App queue exists; run prepare first');
    throw error;
  }
}

async function writeQueue(queue) {
  await fsp.mkdir(QUEUE_DIR, { recursive: true });
  queue.updatedAt = new Date().toISOString();
  const temp = `${QUEUE_PATH}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(queue, null, 2)}\n`);
  await fsp.rename(temp, QUEUE_PATH);
}

function assertSlug(slug) {
  if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(slug || '')) {
    usage(`invalid slug: ${slug || '(missing)'}`);
  }
}

function findItem(queue, slug) {
  const item = queue.items.find((candidate) => candidate.slug === slug);
  if (!item) usage(`slug is not in the active queue: ${slug}`);
  return item;
}

function resolveLocalPath(file) {
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

async function sourceBytes(source) {
  if (/^https:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`could not download ${source}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  return fsp.readFile(resolveLocalPath(source));
}

async function stageImage(slug, source) {
  const bytes = await sourceBytes(source);
  const output = path.join(IMAGE_DIR, `${slug}.jpg`);
  await sharp(bytes).rotate().jpeg({ quality: 95, mozjpeg: true }).toFile(output);
  const metadata = await sharp(output).metadata();
  return {
    sourceImage: source,
    stagedImage: output,
    width: metadata.width,
    height: metadata.height,
  };
}

async function prepare(flags) {
  if (!flags.manifest || flags.manifest === true) usage('prepare requires --manifest <file|->');

  const current = await readQueue({ required: false });
  const active = current?.items?.filter((item) => !['published', 'rejected'].includes(item.status)) || [];
  if (active.length && !flags.replace) {
    usage(`an active queue already contains ${active.length} item(s); finish it or pass --replace`);
  }

  const manifest = await readJson(flags.manifest);
  const items = Array.isArray(manifest) ? manifest : manifest.items;
  if (!Array.isArray(items) || items.length === 0) usage('manifest must contain at least one item');
  if (items.length > 3) usage('Gemini App queues are capped at the three daily subscription generations');

  const animated = JSON.parse(
    await fsp.readFile(path.join(ROOT, 'src/assets/wiki-animations.json'), 'utf8')
  );
  const seen = new Set();
  await fsp.mkdir(IMAGE_DIR, { recursive: true });

  const staged = [];
  for (const input of items) {
    assertSlug(input.slug);
    if (seen.has(input.slug)) usage(`duplicate slug in manifest: ${input.slug}`);
    seen.add(input.slug);
    if (animated[input.slug] && !flags.force) {
      usage(`${input.slug} is already animated; pass --force only to intentionally replace it`);
    }
    if (typeof input.prompt !== 'string' || input.prompt.trim().length < 40) {
      usage(`${input.slug} needs a complete motion prompt (at least 40 characters)`);
    }

    const imageBase = (process.env.VITE_WIKI_IMAGE_BASE_URL || DEFAULT_IMAGE_BASE).replace(/\/+$/, '');
    const source = input.image || `${imageBase}/_default/${input.slug}.jpg`;
    const image = await stageImage(input.slug, source);
    staged.push({
      slug: input.slug,
      name: input.name || input.slug,
      prompt: input.prompt.trim(),
      status: 'queued',
      attempts: 0,
      video: null,
      note: null,
      ...image,
      createdAt: new Date().toISOString(),
      submittedAt: null,
      downloadedAt: null,
      publishedAt: null,
    });
  }

  const now = new Date().toISOString();
  const queue = { version: 1, createdAt: now, updatedAt: now, items: staged };
  await writeQueue(queue);
  console.log(`Prepared ${staged.length} Gemini App job(s):`);
  for (const item of staged) {
    console.log(`  ${item.slug}: ${item.stagedImage} (${item.width}x${item.height})`);
  }
  console.log('\nRun `node scripts/anim-pilot/gemini-app-queue.js next` for the first job.');
}

function printItem(item) {
  console.log(`${item.name} (${item.slug})`);
  console.log(`status: ${item.status}`);
  console.log(`image: ${item.stagedImage}`);
  if (item.video) console.log(`video: ${item.video}`);
  if (item.note) console.log(`note: ${item.note}`);
  console.log('\nprompt:\n');
  console.log(item.prompt);
}

async function status(flags) {
  const queue = await readQueue();
  if (flags.json) {
    console.log(JSON.stringify(queue, null, 2));
    return;
  }
  console.log(`Gemini App queue (${queue.items.length}/3)`);
  for (const item of queue.items) {
    const detail = item.video ? ` -> ${item.video}` : '';
    console.log(`  ${item.status.padEnd(10)} ${item.slug}${detail}`);
  }
}

async function next(flags) {
  const queue = await readQueue();
  const item = queue.items.find((candidate) => candidate.status === 'queued');
  if (!item) {
    console.log('No queued jobs remain. Check submitted jobs before using another generation.');
    return;
  }
  if (flags.json) console.log(JSON.stringify(item, null, 2));
  else printItem(item);
}

async function prompt(slug) {
  const queue = await readQueue();
  console.log(findItem(queue, slug).prompt);
}

async function mark(slug, target, flags = {}) {
  if (!VALID_STATUSES.has(target)) usage(`invalid status: ${target}`);
  const queue = await readQueue();
  const item = findItem(queue, slug);
  if (!flags.force && STATUS_ORDER.get(target) < STATUS_ORDER.get(item.status)) {
    usage(`refusing to move ${slug} backward from ${item.status} to ${target} without --force`);
  }
  if (target === 'submitted' && item.status !== 'queued' && !flags.force) {
    usage(`${slug} was already ${item.status}; refusing to spend another generation without --force`);
  }
  item.status = target;
  item.note = flags.note && flags.note !== true ? flags.note : item.note;
  if (target === 'submitted') {
    item.attempts += 1;
    item.submittedAt = new Date().toISOString();
  }
  if (target === 'rejected') item.rejectedAt = new Date().toISOString();
  await writeQueue(queue);
  console.log(`${slug} -> ${target}`);
}

async function attach(slug, videoFile) {
  if (!videoFile) usage('attach requires a downloaded MP4 path');
  const absolute = resolveLocalPath(videoFile);
  const stat = await fsp.stat(absolute).catch(() => null);
  if (!stat?.isFile() || stat.size === 0) usage(`video does not exist or is empty: ${absolute}`);
  if (path.extname(absolute).toLowerCase() !== '.mp4') usage('downloaded video must be an .mp4 file');

  const queue = await readQueue();
  const item = findItem(queue, slug);
  if (!['submitted', 'downloaded'].includes(item.status)) {
    usage(`${slug} must be submitted before a download can be attached`);
  }
  item.video = absolute;
  item.status = 'downloaded';
  item.downloadedAt = new Date().toISOString();
  await writeQueue(queue);
  console.log(`${slug} -> downloaded (${absolute})`);
}

async function publishItem(queue, item, flags) {
  if (item.status !== 'downloaded' || !item.video) {
    usage(`${item.slug} has no downloaded video ready to publish`);
  }
  const command = path.join(ROOT, 'scripts/anim-pilot/process-and-upload.sh');
  const args = [item.slug, item.video];
  if (flags.square) args.push('--square');
  if (flags.boomerang) args.push('--boomerang');
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`publisher failed for ${item.slug}`);
  item.status = 'published';
  item.publishedAt = new Date().toISOString();
  await writeQueue(queue);
}

async function publish(slug, flags) {
  const queue = await readQueue();
  await publishItem(queue, findItem(queue, slug), flags);
}

async function publishReady(flags) {
  const queue = await readQueue();
  const ready = queue.items.filter((item) => item.status === 'downloaded');
  if (!ready.length) usage('no downloaded videos are ready to publish');
  for (const item of ready) await publishItem(queue, item, flags);
}

async function clear(flags) {
  const queue = await readQueue({ required: false });
  const active = queue?.items?.filter((item) => !['published', 'rejected'].includes(item.status)) || [];
  if (active.length && !flags.force) {
    usage(`queue still has ${active.length} active item(s); pass --force to discard it`);
  }
  await fsp.rm(QUEUE_DIR, { recursive: true, force: true });
  console.log('Cleared the Gemini App queue.');
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  if (!command || flags.help) usage();
  if (command === 'prepare') return prepare(flags);
  if (command === 'status') return status(flags);
  if (command === 'next') return next(flags);
  if (command === 'prompt') return prompt(positional[0]);
  if (command === 'mark') return mark(positional[0], positional[1], flags);
  if (command === 'attach') return attach(positional[0], positional[1]);
  if (command === 'reject') return mark(positional[0], 'rejected', flags);
  if (command === 'publish') return publish(positional[0], flags);
  if (command === 'publish-ready') return publishReady(flags);
  if (command === 'clear') return clear(flags);
  usage(`unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
