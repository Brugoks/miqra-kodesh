import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createTestGltfLoader } from '../../test/gltf.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { HUMAN_PRESET_ASSETS } from './scenePresetAssets.js';
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';
import { HUMAN_VARIANTS } from './sceneHumanManifest.js';
import {
  decodeMotionLibrary, retargetMotion, CROWD_MOTIONS, GROUND_SEATED, MOTION_URL,
} from './sceneMixamo.js';
import { motionPlanFor } from './sceneMotionLife.js';
import {
  createHumanPoseSafety, postureOf, POSTURES, CLIP_POSTURE,
} from './sceneHumanSafety.js';

// The near actors are checked every frame for a skeleton that no longer looks like a person, and one that does
// not is replaced with the baked idle pose. That check was written for people who stand and walk. A person
// sitting on the ground, bending to the ground or leaning in to speak failed it, and was snapped to the
// stiff idle every few frames: a loop of flashing into the A-pose. So this holds both halves: every clip a
// person in the crowd can be given passes the check for what it is, and the check still refuses what it is
// for (a body lying down, a body upside down, one that is not a number).

const library = decodeMotionLibrary(JSON.parse(readFileSync(resolve('public', MOTION_URL.slice(1)), 'utf8')));
// Every body a person can be dealt, adults, elders and children; and five of them that tell the story, for
// the checks that are about the check rather than about each body.
const BODIES = [...new Set(Object.values(HUMAN_VARIANTS).map((variant) => variant.modelId))];
const SOME = ['human-artisan', 'human-villager', 'human-woman-adult', 'human-man-elder', 'human-child-boy'];
const models = {};
beforeAll(async () => {
  const loader = createTestGltfLoader();
  for (const asset of [...HUMAN_MODEL_ASSETS, ...HUMAN_PRESET_ASSETS, ...TABERNACLE_CHARACTER_ASSETS]) {
    if (!BODIES.includes(asset.id)) continue;
    models[asset.id] = await loader.parseAsync(new Uint8Array(readFileSync(resolve('public', asset.url.slice(1)))).buffer, '');
  }
}, 60000);

const heightOf = (id) => Object.values(HUMAN_VARIANTS).find((variant) => variant.modelId === id).heightMeters;
const SAMPLES = 60;

// How many of the SAMPLES evenly spaced moments of a captured clip pass the check under a posture.
function sane(id, key, posture, { flip = false } = {}) {
  const clip = retargetMotion(THREE, models[id].scene, library, key);
  const root = models[id].scene.clone(true);
  if (flip) root.rotation.x = Math.PI;
  const safety = createHumanPoseSafety(THREE, root);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  let count = 0;
  for (let i = 0; i < SAMPLES; i += 1) {
    mixer.setTime((clip.duration * i) / SAMPLES);
    if (safety.isSane({ groundY: 0, heightMeters: heightOf(id), posture })) count += 1;
  }
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  return count;
}

// Everything a crowd person can be on, by the table that deals it out and by the schedules that play it.
const crowdClips = () => {
  const keys = new Set(Object.values(CROWD_MOTIONS).flat());
  for (const key of [...keys]) {
    const plan = motionPlanFor({ id: 'probe', motion: key });
    if (plan) { keys.add(plan.rest); keys.add(plan.gesture); }
  }
  return [...keys];
};

describe('the pose check', () => {
  it('holds every clip the crowd plays to what it is, on every body, all the way through', () => {
    expect(BODIES.length).toBeGreaterThanOrEqual(16);
    for (const key of crowdClips()) {
      expect(library.clips.has(key), key).toBe(true);
      for (const id of BODIES) {
        expect(sane(id, key, postureOf(`life:${key}`)), `${id} ${key} (${postureOf(`life:${key}`)})`).toBe(SAMPLES);
      }
    }
  });

  it('keeps standing and walking people to the strict check it always was', () => {
    expect(POSTURES.upright).toEqual({ headOverHips: 0.16, hipsOverFeet: 0.12, headOverFeet: 0.48 });
    expect(postureOf('idle')).toBe('upright');
    expect(postureOf('walk')).toBe('upright');
    expect(postureOf('life:breathing-idle')).toBe('upright');
    expect(postureOf(null)).toBe('upright');
    for (const id of BODIES) expect(sane(id, 'breathing-idle', 'upright'), id).toBe(SAMPLES);
  });

  it('needs each relaxed posture: every clip with one fails the strict check somewhere', () => {
    // Otherwise the table is decoration, and a clip could be listed that never needed it.
    for (const key of Object.keys(CLIP_POSTURE)) {
      const fails = SOME.some((id) => sane(id, key, 'upright') < SAMPLES);
      expect(fails, key).toBe(true);
    }
  });

  it('names a real clip and a real posture in every entry, and every ground-sit', () => {
    for (const [key, posture] of Object.entries(CLIP_POSTURE)) {
      expect(library.clips.has(key), key).toBe(true);
      expect(POSTURES[posture], `${key} ${posture}`).toBeTruthy();
    }
    for (const key of GROUND_SEATED) expect(CLIP_POSTURE[key]).toBe('ground-seat');
  });

  it('still refuses a body lying down, whatever it is allowed to be doing', () => {
    for (const id of SOME) {
      for (const key of ['lie-asleep', 'sleep-deep']) {
        for (const posture of Object.keys(POSTURES)) expect(sane(id, key, posture), `${id} ${key} as ${posture}`).toBe(0);
      }
    }
  });

  it('still refuses a body upside down, whatever it is allowed to be doing', () => {
    for (const key of ['breathing-idle', 'sit-floor', 'pick-up']) {
      for (const posture of Object.keys(POSTURES)) expect(sane('human-artisan', key, posture, { flip: true }), `${key} as ${posture}`).toBe(0);
    }
  });

  it('holds a body that is partway between two postures to the less demanding of them', () => {
    // Crossfading from standing to sitting on the ground: the pose in between is a bit of each.
    const root = models['human-artisan'].scene.clone(true);
    const safety = createHumanPoseSafety(THREE, root);
    const sit = retargetMotion(THREE, models['human-artisan'].scene, library, 'sit-floor');
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(sit).play();
    mixer.setTime(sit.duration / 2);
    const args = { groundY: 0, heightMeters: 1.7 };
    expect(safety.isSane({ ...args, posture: 'upright' })).toBe(false);
    expect(safety.isSane({ ...args, posture: 'ground-seat' })).toBe(true);
    expect(safety.isSane({ ...args, posture: ['upright', 'ground-seat'] })).toBe(true);
    expect(safety.isSane({ ...args, posture: ['upright'] })).toBe(false);
    // And a posture nobody has heard of is the strict one.
    expect(safety.isSane({ ...args, posture: 'no-such-posture' })).toBe(false);
    mixer.stopAllAction(); mixer.uncacheRoot(root);
  });

  it('still refuses a skeleton that is not a number', () => {
    const root = models['human-artisan'].scene.clone(true);
    const safety = createHumanPoseSafety(THREE, root);
    root.getObjectByName('mixamorigHead').position.set(Number.NaN, 0, 0);
    expect(safety.isSane({ groundY: 0, heightMeters: 1.7 })).toBe(false);
    expect(safety.isSane({ groundY: 0, heightMeters: 1.7, posture: 'ground-seat' })).toBe(false);
  });
});
