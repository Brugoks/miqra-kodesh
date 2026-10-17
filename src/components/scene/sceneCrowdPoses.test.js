import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createTestGltfLoader } from '../../test/gltf.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { HUMAN_PRESET_ASSETS } from './scenePresetAssets.js';
import {
  decodeMotionLibrary, retargetMotion, assignCrowdMotion, CROWD_MOTIONS, GROUND_SEATED, MOTION_URL,
} from './sceneMixamo.js';
import { motionPlanFor, sampleMotionPlan } from './sceneMotionLife.js';

// The people standing, sitting and working about Capernaum used to be on the models' own baked clips, which
// hold the arms out in front with the palms open: four people in a row doing the same stiff pose. They are
// on captured clips now, and nobody can watch that happen in CI, so this checks what watching would: the
// people who sit are on the ground and not hovering over it, the people who work really bend to the ground
// and come back up, and nobody who is standing about is left on a baked clip.

const library = decodeMotionLibrary(JSON.parse(readFileSync(resolve('public', MOTION_URL.slice(1)), 'utf8')));
const BODIES = ['human-artisan', 'human-villager', 'human-woman-adult', 'human-man-elder', 'human-child-boy'];
const models = {};
beforeAll(async () => {
  const loader = createTestGltfLoader();
  for (const asset of [...HUMAN_MODEL_ASSETS, ...HUMAN_PRESET_ASSETS]) {
    if (!BODIES.includes(asset.id)) continue;
    models[asset.id] = await loader.parseAsync(new Uint8Array(readFileSync(resolve('public', asset.url.slice(1)))).buffer, '');
  }
}, 60000);

// Plays a clip on a clone, and reports where the pelvis, head and the lowest joint of the body are at time t.
function measure(model, clip, t) {
  const root = model.scene.clone(true);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  mixer.setTime(t);
  root.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  let lowest = Infinity;
  root.traverse((node) => { if (node.isBone) lowest = Math.min(lowest, node.getWorldPosition(point).y); });
  const result = {
    hips: root.getObjectByName('mixamorigHips').getWorldPosition(new THREE.Vector3()).y,
    head: root.getObjectByName('mixamorigHead').getWorldPosition(new THREE.Vector3()).y,
    lowest,
  };
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  return result;
}

describe.each(BODIES)('on %s', (id) => {
  it.each([...GROUND_SEATED])('sits %s on the ground, with nothing under it and the pelvis not in the air', (key) => {
    const clip = retargetMotion(THREE, models[id].scene, library, key);
    expect(clip, key).toBeTruthy();
    for (const t of [0, clip.duration * 0.4, clip.duration * 0.85]) {
      const now = measure(models[id], clip, t);
      // The seat is on the ground plane: the pelvis is a hand's breadth above it, and no joint is below it or
      // so far above it that the figure would be hovering.
      expect(now.hips, `${key} hips t=${t}`).toBeLessThan(0.25);
      expect(now.lowest, `${key} lowest t=${t}`).toBeGreaterThan(-0.02);
      expect(now.lowest, `${key} lowest t=${t}`).toBeLessThan(0.12);
      // Sitting up and not lying down, on a child's body as well as a grown man's.
      expect(now.head - now.hips, `${key} head over hips t=${t}`).toBeGreaterThan(0.12);
    }
  });

  it('bends to pick something up and comes all the way back', () => {
    const idle = retargetMotion(THREE, models[id].scene, library, 'breathing-idle');
    const pick = retargetMotion(THREE, models[id].scene, library, 'pick-up');
    expect(pick, 'pick-up').toBeTruthy();
    const standing = measure(models[id], idle, 0);
    const first = measure(models[id], pick, 0);
    const last = measure(models[id], pick, pick.duration);
    // It starts and ends standing as the rest clip does, so the cut back to it between spells cannot be seen.
    expect(Math.abs(first.head - standing.head)).toBeLessThan(0.06);
    expect(Math.abs(last.head - standing.head)).toBeLessThan(0.06);
    expect(Math.abs(first.hips - standing.hips)).toBeLessThan(0.05);
    expect(Math.abs(last.hips - standing.hips)).toBeLessThan(0.05);
    // And in between it really goes down, with the feet staying on the ground.
    let deepestHead = Infinity, deepestHips = Infinity;
    for (let step = 1; step < 20; step += 1) {
      const now = measure(models[id], pick, (pick.duration * step) / 20);
      deepestHead = Math.min(deepestHead, now.head);
      deepestHips = Math.min(deepestHips, now.hips);
      expect(now.lowest, `t=${step}`).toBeGreaterThan(-0.02);
      expect(now.lowest, `t=${step}`).toBeLessThan(0.12);
    }
    expect(standing.hips - deepestHips).toBeGreaterThan(0.08);
    expect(standing.head - deepestHead).toBeGreaterThan(0.25);
  });
});

describe('who is on which clip', () => {
  it('leaves no one who is standing about on a model’s own baked clip', () => {
    for (const activity of ['standing', 'attending', 'sitting', 'working', 'talking']) {
      expect(CROWD_MOTIONS[activity], activity).toBeTruthy();
      expect(CROWD_MOTIONS[activity].every((key) => typeof key === 'string' && library.clips.has(key)), activity).toBe(true);
    }
    // Every slot of every option list is a real captured clip, whoever is dealt it.
    for (const [activity, keys] of Object.entries(CROWD_MOTIONS)) {
      for (let index = 0; index < 40; index += 1) {
        const figure = assignCrowdMotion({ id: `p${index}`, activity }, index);
        expect(library.clips.has(figure.motion), `${activity} ${index}`).toBe(true);
        expect(keys).toContain(figure.motion);
      }
    }
  });

  it('keeps the baked sit for someone sitting on a step, who is lowered onto it and hangs their feet below', () => {
    const figure = assignCrowdMotion({ id: 'step-sitter', activity: 'sitting', onStep: true }, 0);
    expect(figure.motion).toBeUndefined();
  });

  it('does not touch someone going somewhere, or someone who already has a clip of their own', () => {
    expect(assignCrowdMotion({ id: 'walker', activity: 'standing', route: [[0, 0], [4, 0]] }, 0).motion).toBeUndefined();
    expect(assignCrowdMotion({ id: 'kept', activity: 'standing', motion: 'pray-sway' }, 3).motion).toBe('pray-sway');
    expect(assignCrowdMotion({ id: 'none', activity: 'standing', motion: null }, 3).motion).toBe(null);
  });
});

describe('the pauses between gestures', () => {
  it('spreads gestures over time even for people whose ids differ in one character', () => {
    const offsets = Array.from({ length: 12 }, (_, i) => motionPlanFor({ id: `shore-nets-${i}`, motion: 'look-around' }).offset).sort((a, b) => a - b);
    // The old hash put such ids a few hundredths of a second apart, so a group all gestured together. Now no
    // two seconds of the cycle hold more than a third of the group, and every quarter of it has someone.
    for (const start of offsets) expect(offsets.filter((o) => o >= start && o < start + 2).length).toBeLessThanOrEqual(4);
    for (let quarter = 0; quarter < 4; quarter += 1) expect(offsets.some((o) => o >= quarter * 4.25 && o < (quarter + 1) * 4.25), `quarter ${quarter}`).toBe(true);
    // And at any moment only some of them are mid-gesture.
    for (let t = 0; t < 120; t += 1.3) {
      const gesturing = Array.from({ length: 12 }, (_, i) => sampleMotionPlan(motionPlanFor({ id: `shore-nets-${i}`, motion: 'look-around' }), t).key === 'look-around').filter(Boolean).length;
      expect(gesturing, `t=${t}`).toBeLessThan(8);
    }
  });

  it('plays a work clip whole, between spells at ease', () => {
    const plan = motionPlanFor({ id: 'net-mender', motion: 'pick-up' });
    expect(plan).toBeTruthy();
    expect(plan.rest).toBe('breathing-idle');
    expect(plan.gesture).toBe('pick-up');
    const clip = library.clips.get('pick-up');
    // The gesture window holds the whole of the capture, and the period leaves long spells of standing.
    expect(plan.duration).toBeGreaterThanOrEqual(clip.frames / library.fps - 0.3);
    expect(plan.period).toBeGreaterThan(plan.duration + 10);
    let working = 0, standing = 0;
    for (let t = 0; t < plan.period * 3; t += 0.25) (sampleMotionPlan(plan, t).key === 'pick-up' ? working++ : standing++);
    expect(working).toBeGreaterThan(0);
    expect(standing).toBeGreaterThan(working * 1.5);
  });
});
