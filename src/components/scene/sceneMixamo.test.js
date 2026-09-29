import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  beforeAll, describe, it, expect,
} from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { TABLEAU_MODEL_ASSETS } from './sceneTableauAssets.js';
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';
import { decodeMotionLibrary, retargetMotion, MOTION_URL } from './sceneMixamo.js';

// The captured motion is fitted onto characters it was never recorded on, in
// the browser, and nobody watches it happen in CI. So this checks what
// watching would: a standing clip stands on its soles, a kneeling one kneels
// on its knees, a sleeper lies down, nothing floats or sinks — and every limb
// points where the capture says it points.

const library = decodeMotionLibrary(JSON.parse(readFileSync(resolve('public', MOTION_URL.slice(1)), 'utf8')));
const models = {};
beforeAll(async () => {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new THREE.Texture() }));
  const wanted = ['human-artisan', 'human-villager', 'human-jesus', 'human-tabernacle-camp-woman'];
  for (const asset of [...HUMAN_MODEL_ASSETS, ...TABLEAU_MODEL_ASSETS, ...TABERNACLE_CHARACTER_ASSETS]) {
    if (!wanted.includes(asset.id)) continue;
    const bytes = readFileSync(resolve('public', asset.url.slice(1)));
    models[asset.id] = await loader.parseAsync(new Uint8Array(bytes).buffer, '');
  }
});

// Plays a clip on a clone and reports where the named bones are at time t.
function pose(model, clip, t) {
  const root = model.scene.clone(true);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  mixer.setTime(t);
  root.updateMatrixWorld(true);
  const at = (name) => root.getObjectByName(`mixamorig${name}`).getWorldPosition(new THREE.Vector3());
  return { root, at, done: () => { mixer.stopAllAction(); mixer.uncacheRoot(root); } };
}
const lowestFoot = (at) => Math.min(...['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'].map((name) => at(name).y));

describe('the motion library', () => {
  it('carries the clips the scenes use, each well formed', () => {
    for (const key of ['breathing-idle', 'talk-ask', 'kneel-pray', 'sit-idle', 'pray-sway', 'old-man-idle']) {
      const clip = library.clips.get(key);
      expect(clip, key).toBeTruthy();
      expect(clip.data.rotations.length).toBe(clip.frames * library.bones.length * 4);
      expect(clip.data.hips.length).toBe(clip.frames * 3);
      expect(clip.data.rotations.every(Number.isFinite)).toBe(true);
    }
    expect(library.bones[0]).toBe('Hips');
  });
});

describe.each(['human-artisan', 'human-villager', 'human-jesus', 'human-tabernacle-camp-woman'])('on %s', (id) => {
  it('stands a standing clip on its soles, upright, all the way through', () => {
    const model = models[id];
    const clip = retargetMotion(THREE, model.scene, library, 'breathing-idle');
    expect(clip.tracks.length).toBeGreaterThan(library.bones.length);
    for (const t of [0, clip.duration * 0.37, clip.duration * 0.81]) {
      const { at, done } = pose(model, clip, t);
      const foot = lowestFoot(at);
      expect(foot, `t=${t}`).toBeGreaterThan(0.005);
      expect(foot, `t=${t}`).toBeLessThan(0.12);
      // Upright: the head well above the hips, which are well above the feet.
      expect(at('Head').y - at('Hips').y).toBeGreaterThan(0.45);
      expect(at('Hips').y).toBeGreaterThan(0.7);
      done();
    }
  });

  it('kneels a kneeling clip on its knees', () => {
    const model = models[id];
    const clip = retargetMotion(THREE, model.scene, library, 'kneel-pray');
    const { at, done } = pose(model, clip, clip.duration / 2);
    expect(Math.min(at('LeftLeg').y, at('RightLeg').y)).toBeLessThan(0.14);
    expect(Math.min(at('LeftLeg').y, at('RightLeg').y)).toBeGreaterThan(0.02);
    expect(at('Head').y).toBeGreaterThan(0.9);
    done();
  });

  it('points every limb where the capture points it', () => {
    const model = models[id];
    const clip = retargetMotion(THREE, model.scene, library, 'talk-ask');
    const frame = Math.floor(library.clips.get('talk-ask').frames / 2);
    const { root, done } = pose(model, clip, frame / library.fps);
    // Where the capture puts a limb: its captured rotation applied to the
    // limb's T-pose direction. Arms lie along ±X in a T-pose, legs down −Y.
    const { rotations } = library.clips.get('talk-ask').data;
    const expected = (bone, tDirection) => {
      const b = library.bones.indexOf(bone);
      const at = (frame * library.bones.length + b) * 4;
      const q = new THREE.Quaternion(rotations[at], rotations[at + 1], rotations[at + 2], rotations[at + 3]).normalize();
      return new THREE.Vector3(...tDirection).applyQuaternion(q);
    };
    const actual = (from, to) => root.getObjectByName(`mixamorig${to}`).getWorldPosition(new THREE.Vector3())
      .sub(root.getObjectByName(`mixamorig${from}`).getWorldPosition(new THREE.Vector3())).normalize();
    const cases = [
      ['LeftArm', 'LeftForeArm', [1, 0, 0]],
      ['LeftForeArm', 'LeftHand', [1, 0, 0]],
      ['RightArm', 'RightForeArm', [-1, 0, 0]],
      ['RightForeArm', 'RightHand', [-1, 0, 0]],
      ['LeftUpLeg', 'LeftLeg', [0, -1, 0]],
      ['RightLeg', 'RightFoot', [0, -1, 0]],
    ];
    for (const [from, to, direction] of cases) {
      const angle = THREE.MathUtils.radToDeg(actual(from, to).angleTo(expected(from, direction)));
      expect(angle, `${from}`).toBeLessThan(12);
    }
    done();
  });

  it('builds nothing with a NaN in it, and leaves the shared model as it was', () => {
    const model = models[id];
    const before = [];
    model.scene.traverse((node) => { if (node.isBone) before.push(...node.quaternion.toArray(), ...node.position.toArray()); });
    for (const key of ['sit-idle', 'pray-sway', 'old-man-idle']) {
      const clip = retargetMotion(THREE, model.scene, library, key);
      for (const track of clip.tracks) expect(Array.from(track.values).every(Number.isFinite), `${key} ${track.name}`).toBe(true);
    }
    const after = [];
    model.scene.traverse((node) => { if (node.isBone) after.push(...node.quaternion.toArray(), ...node.position.toArray()); });
    expect(after).toEqual(before);
  });
});

describe('the whole body at rest', () => {
  it('lies a sleeper down on the ground, and sits a floor-sitter on it', () => {
    const model = models['human-artisan'];
    const sleep = retargetMotion(THREE, model.scene, library, 'lie-asleep');
    let { at, done } = pose(model, sleep, sleep.duration / 2);
    expect(at('Head').y).toBeLessThan(0.4);
    expect(at('Hips').y).toBeLessThan(0.4);
    done();
    const sit = retargetMotion(THREE, model.scene, library, 'sit-floor');
    ({ at, done } = pose(model, sit, sit.duration / 2));
    // Sitting, not lying: the seat on the ground and the head well up,
    // though this capture sits hunched over its knees.
    expect(at('Hips').y).toBeLessThan(0.35);
    expect(at('Head').y).toBeGreaterThan(0.5);
    done();
  });

  it('walks in place, and knows how far a stride carries', () => {
    const clip = retargetMotion(THREE, models['human-artisan'].scene, library, 'old-man-walk');
    expect(clip.userData.metersPerCycle).toBeGreaterThan(0.3);
    expect(clip.userData.metersPerCycle).toBeLessThan(1.6);
    const hips = clip.tracks.find((track) => track.name.endsWith('Hips.position'));
    const first = Array.from(hips.values.slice(0, 3));
    const last = Array.from(hips.values.slice(-3));
    expect(Math.hypot(first[0] - last[0], first[2] - last[2])).toBeLessThan(0.08);
  });

  it('returns null for a clip it does not have', () => {
    expect(retargetMotion(THREE, models['human-artisan'].scene, library, 'no-such-clip')).toBeNull();
  });
});
