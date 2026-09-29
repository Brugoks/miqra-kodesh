// Bake Adobe Mixamo motion into one rig-independent library the scenes load.
//
//   node scripts/humans/build_mixamo_library.mjs [mixamo-fbx-directory]
//
// The FBX donors are exported from Mixamo (skeleton only, 30 fps) into the
// ignored scripts/.cache/mixamo/ and never ship. What ships is the motion, and
// only as rotations relative to Mixamo's T-pose: for every body bone and every
// frame, the world-space rotation that carries the bone from where it lies in
// the T-pose to where the capture has it. That is independent of any one
// character, so a single library serves every rig in the app —
// src/components/scene/sceneMixamo.js retargets a clip onto a character in the
// browser by applying those rotations to the character's own T-pose, the same
// arithmetic scripts/humans/retarget_tabernacle_mixamo.mjs does offline per
// rig. Fingers are not carried: our hands are posed by the finger solver in
// sceneHumanClips.js, and a captured fist on a hand of different proportions
// reads worse than a relaxed curl.
//
// Hips translation is stored as a fraction of the donor's hip height, so it
// scales to each character; a clip that walks somewhere is stored in place,
// with its travel recorded as a stride in hip heights.
//
// Output: public/assets/scenes/shared/humans/mixamo-motion.json, quaternions
// quantised to 16 bits (base64).

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

T.TextureLoader.prototype.load = () => new T.Texture();

const SOURCE = path.resolve(process.argv[2] || 'scripts/.cache/mixamo');
const OUT = path.resolve('public/assets/scenes/shared/humans/mixamo-motion.json');
// Stored at 20 fps and at most 14 seconds a clip: these are ambient loops,
// and a 44-second capture of someone chatting at a water cooler is mostly the
// same four gestures. Interpolation between 20 fps keys is invisible at the
// speeds people move in these scenes.
const FPS = 20;
const MAX_SECONDS = 14;
// Only a walk goes somewhere; a man falling to his knees moves his hips
// forward too, and that is part of the motion, not travel.
const TRAVELS = /walk/;

// The body bones carried, parents before children.
export const BODY = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
];

const clips = JSON.parse(await fs.readFile(path.join(SOURCE, 'clips.json'), 'utf8'));
const meta = JSON.parse(await fs.readFile(path.join(SOURCE, 'manifest.json'), 'utf8').catch(() => '{}'));
const buffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');

const library = { version: 1, source: 'Adobe Mixamo', fps: FPS, bones: BODY, clips: {} };

for (const key of Object.keys(clips)) {
  const file = path.join(SOURCE, `${key}.fbx`);
  let bytes;
  try {
    bytes = await fs.readFile(file);
  } catch {
    console.warn(`missing ${key}.fbx — skipped`);
    continue;
  }
  const scene = new FBXLoader().parse(buffer(bytes), '');
  scene.updateMatrixWorld(true);
  const bones = new Map();
  scene.traverse((node) => { if (node.isBone && !bones.has(node.name)) bones.set(node.name, node); });
  const clip = scene.animations.find((c) => c.tracks.length);
  const hips = bones.get('mixamorigHips');
  if (!clip || !hips) throw new Error(`Not a Mixamo skeleton clip: ${key}`);
  // The FBX loads in its bind pose, which for Mixamo is the T-pose.
  const bindInverse = BODY.map((name) => bones.get(`mixamorig${name}`)?.getWorldQuaternion(new T.Quaternion()).invert() || null);
  const restHip = hips.getWorldPosition(new T.Vector3());
  // Hip height above the soles, in the donor's own units.
  let sole = Infinity;
  for (const name of ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot']) {
    const bone = bones.get(`mixamorig${name}`);
    if (bone) sole = Math.min(sole, bone.getWorldPosition(new T.Vector3()).y);
  }
  const hipHeight = restHip.y - (Number.isFinite(sole) ? sole : 0);

  const mixer = new T.AnimationMixer(scene);
  mixer.clipAction(clip).play();
  const seconds = Math.min(clip.duration, MAX_SECONDS);
  const frames = Math.max(2, Math.round(seconds * FPS) + 1);
  const rotations = new Int16Array(frames * BODY.length * 4);
  const hipsOut = new Float32Array(frames * 3);
  const q = new T.Quaternion();
  const p = new T.Vector3();
  for (let f = 0; f < frames; f += 1) {
    mixer.setTime(Math.min(f / FPS, clip.duration - 1e-6));
    scene.updateMatrixWorld(true);
    BODY.forEach((name, b) => {
      const bone = bones.get(`mixamorig${name}`);
      if (bone) bone.getWorldQuaternion(q).multiply(bindInverse[b]);
      else q.identity();
      // One hemisphere throughout, so interpolation never takes the long way.
      if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      const at = (f * BODY.length + b) * 4;
      rotations[at] = Math.round(q.x * 32767);
      rotations[at + 1] = Math.round(q.y * 32767);
      rotations[at + 2] = Math.round(q.z * 32767);
      rotations[at + 3] = Math.round(q.w * 32767);
    });
    hips.getWorldPosition(p).sub(restHip).divideScalar(hipHeight);
    hipsOut.set([p.x, p.y, p.z], f * 3);
  }
  // A clip that goes somewhere is stored in place: its travel is taken out of
  // the hips along the line from first frame to last, and kept as a stride.
  const dx = hipsOut[(frames - 1) * 3] - hipsOut[0];
  const dz = hipsOut[(frames - 1) * 3 + 2] - hipsOut[2];
  const travel = Math.hypot(dx, dz);
  const travels = TRAVELS.test(key) && travel > 0.1;
  if (travels) {
    for (let f = 0; f < frames; f += 1) {
      hipsOut[f * 3] -= (dx * f) / (frames - 1);
      hipsOut[f * 3 + 2] -= (dz * f) / (frames - 1);
    }
  }
  const hipsQ = new Int16Array(hipsOut.length);
  for (let i = 0; i < hipsOut.length; i += 1) hipsQ[i] = Math.max(-32767, Math.min(32767, Math.round(hipsOut[i] * 8192)));

  library.clips[key] = {
    title: meta[key]?.name || key,
    description: meta[key]?.description || '',
    frames,
    duration: +((frames - 1) / FPS).toFixed(4),
    ...(travels ? { stride: +travel.toFixed(4) } : {}),
    sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    rotations: b64(rotations),
    hips: b64(hipsQ),
  };
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
  console.log(`${key}: ${frames} frames${travels ? `, stride ${travel.toFixed(2)} hip heights` : ''}`);
}

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(library));
const size = (await fs.stat(OUT)).size;
console.log(`\n${Object.keys(library.clips).length} clips, ${(size / 1024).toFixed(0)} KB → ${path.relative(process.cwd(), OUT)}`);
