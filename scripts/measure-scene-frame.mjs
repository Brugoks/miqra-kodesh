// What does a frame of the real scene cost? Builds Capernaum exactly as the route does, loads its real assets
// through the real asset session, renders each of the scene's own vantages in headless Chrome (SwiftShader),
// and reports draw calls, triangles and shader programs from `renderer.info`.
//
//   node scripts/measure-scene-frame.mjs                       # this checkout
//   node scripts/measure-scene-frame.mjs --root ../old-checkout # another source tree, for a before/after
//   node scripts/measure-scene-frame.mjs --images               # also keep a 160x90 luminance image per vantage
//
// The other tree needs its own node_modules (a symlink to this one will do) and its own public/assets, which
// is where its models and textures are served from. Counts only: SwiftShader is software rendering, so its
// frame times say nothing about a phone's GPU, and this is not a substitute for measuring on a device. What
// it can show is that a change costs more draws, more programs to compile, or more GPU resources, and
// (with --images, run on two builds of the same assets) that a refactor changed no pixel.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const root = path.resolve(option('--root') || path.join(import.meta.dirname, '..'));
const withImages = flag('--images');
const outFile = option('--out');

const chromeCandidates = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const chrome = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!chrome) { console.error('No Chrome found. Set CHROME to its executable.'); process.exit(2); }
for (const needed of ['src/components/scene/buildCapernaum.js', 'src/lib/capernaumScene.js', 'public/assets', 'node_modules/.bin/rolldown']) {
  if (!fs.existsSync(path.join(root, needed))) { console.error(`${root} has no ${needed}`); process.exit(2); }
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-frame-'));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(work, 'node_modules'));
fs.writeFileSync(path.join(work, 'entry.mjs'), `
import * as THREE from 'three';
import buildCapernaum from ${JSON.stringify(path.join(root, 'src/components/scene/buildCapernaum.js'))};
import { createAssetSession } from ${JSON.stringify(path.join(root, 'src/components/scene/sceneAssets.js'))};
import { CAPERNAUM } from ${JSON.stringify(path.join(root, 'src/lib/capernaumScene.js'))};

const WITH_IMAGES = ${withImages};
const result = { runs: {} };
try {
  for (const quality of ['balanced', 'high']) {
    const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: WITH_IMAGES });
    const shaderErrors = []; renderer.debug.onShaderError = (gl, program) => shaderErrors.push(String(gl.getProgramInfoLog(program)).slice(0, 200));
    renderer.setSize(1280, 720, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const world = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1280 / 720, 0.1, 2400); camera.rotation.order = 'YXZ';
    const built = buildCapernaum(THREE, { quality, maxAnisotropy: 4, reducedMotion: false, timeOfDay: 'morning' });
    if (built.fog) world.fog = new THREE.FogExp2(built.fog.color, built.fog.density);
    world.add(built.root);
    try { built.prepareRenderer?.(renderer, world); } catch { /* the nicety, not the scene */ }
    const session = createAssetSession('capernaum', { textureTier: 'full', onGroupLoaded: (group) => built.applyAssets?.(group) });
    const started = performance.now();
    await session.loadAllGroupsSequentially();
    const loadMs = Math.round(performance.now() - started);
    let elapsed = 0;
    const step = (dt) => {
      elapsed += dt;
      built.humans?.update({ elapsed, delta: dt, camera, quality, reducedMotion: false });
      built.update(built.humans?.getElapsed?.() ?? elapsed, dt, { camera, walker: null, view: 'first' });
    };
    // Let the motion library arrive and the crowd build, as the route would.
    for (let i = 0; i < 40; i++) { step(1 / 20); await new Promise((r) => setTimeout(r, 40)); }
    const views = {};
    for (const vantage of CAPERNAUM.vantages) {
      camera.position.set(...vantage.position); camera.lookAt(...vantage.lookAt); camera.updateMatrixWorld(true);
      for (let i = 0; i < 40; i++) step(1 / 20);
      renderer.info.reset();
      renderer.render(world, camera);
      views[vantage.id] = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
      if (WITH_IMAGES) {
        const gl = renderer.getContext(); const w = 1280, h = 720; const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const small = []; for (let y = 0; y < 90; y++) for (let x = 0; x < 160; x++) { let a = 0; for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) { const i = ((y * 8 + dy) * w + x * 8 + dx) * 4; a += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11; } small.push(Math.round(a / 64)); }
        views[vantage.id].image = small;
      }
    }
    result.runs[quality] = {
      loadMs, views, shaderErrors, glError: renderer.getContext().getError(),
      resources: { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length },
    };
    built.dispose?.(); session.dispose(); renderer.dispose(); canvas.remove();
  }
  result.ok = true;
} catch (error) { result.ok = false; result.error = String((error && error.stack) || error).slice(0, 800); }
await fetch('/result', { method: 'POST', body: JSON.stringify(result) });
`);
fs.writeFileSync(path.join(work, 'index.html'), '<!doctype html><meta charset="utf-8"><title>frame</title><script type="module" src="/dist/entry.js"></script>');

execFileSync(path.join(root, 'node_modules/.bin/rolldown'), ['entry.mjs', '--dir', 'dist', '--format', 'esm', '--platform', 'browser'], { cwd: work, stdio: 'ignore' });

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
let finish;
const done = new Promise((resolve) => { finish = resolve; });
const server = http.createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/result') {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => { response.end('ok'); finish(JSON.parse(Buffer.concat(chunks).toString())); });
    return;
  }
  const url = decodeURIComponent(request.url.split('?')[0]);
  const file = url === '/' ? path.join(work, 'index.html')
    : url.startsWith('/dist/') ? path.join(work, url)
      : path.join(root, 'public', url);
  if (!file.startsWith(work) && !file.startsWith(path.join(root, 'public'))) { response.statusCode = 403; response.end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { response.statusCode = 404; response.end(); return; }
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    response.end(data);
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const profile = path.join(work, 'profile');
const browser = spawn(chrome, [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions',
  `http://127.0.0.1:${server.address().port}/`,
], { stdio: 'ignore' });
const timeout = setTimeout(() => finish({ ok: false, error: 'timed out after 8 minutes' }), 8 * 60 * 1000);
const result = await done;
clearTimeout(timeout);
// Chrome keeps writing into its profile while it shuts down, so wait for it before removing anything, and
// treat a folder that will not go as harmless: the measurement is already in hand.
const exited = new Promise((resolve) => { browser.once('exit', resolve); setTimeout(resolve, 5000); });
browser.kill();
await exited;
server.close();
if (outFile) fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
try { fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* left in the temp folder */ }
if (!result.ok) { console.error(`measurement failed: ${result.error}`); process.exit(1); }
console.log(`Capernaum, ${root}`);
for (const [quality, run] of Object.entries(result.runs)) {
  console.log(`\n${quality}: assets loaded in ${run.loadMs} ms; ${run.resources.geometries} geometries, ${run.resources.textures} textures, ${run.resources.programs} shader programs; shader errors ${run.shaderErrors.length}, GL error ${run.glError}`);
  for (const [id, view] of Object.entries(run.views)) console.log(`  ${id.padEnd(18)} ${String(view.calls).padStart(4)} draws  ${(view.triangles / 1e6).toFixed(2)} M triangles`);
}
