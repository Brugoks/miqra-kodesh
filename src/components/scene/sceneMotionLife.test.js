import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createTestGltfLoader } from '../../test/gltf.js';
import { motionPlanFor, motionKeysFor, sampleMotionPlan } from './sceneMotionLife';
import { decodeMotionLibrary, MOTION_URL } from './sceneMixamo';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets';
import { createSceneHumans } from './sceneHumans';
import { createTableau } from './sceneTableau';
import { COMMON_POSES } from './tableauPoses';

const library = decodeMotionLibrary(JSON.parse(readFileSync(`public${MOTION_URL}`, 'utf8')));
let model;
beforeAll(async () => {
  const loader = createTestGltfLoader();
  const asset = HUMAN_MODEL_ASSETS.find((a) => a.id === 'human-artisan');
  model = await loader.parseAsync(new Uint8Array(readFileSync(`public${asset.url}`)).buffer, '');
});

describe('captured performances with pauses', () => {
  it('lets paired speakers take turns, leaving time for listening', () => {
    const plans = [0, 1].map((conversationSlot) => motionPlanFor({ id: `speaker-${conversationSlot}`, motion: 'talk-chat', conversationId: 'well', conversationSlot }));
    const spoken = [0, 0]; let silent = 0;
    for (let t = 0; t < 48; t += 0.1) {
      const talking = plans.map((p) => sampleMotionPlan(p, t).key === 'talk-chat');
      expect(talking.every(Boolean)).toBe(false);
      talking.forEach((value, i) => { if (value) spoken[i]++; });
      if (!talking.some(Boolean)) silent++;
    }
    expect(Math.min(...spoken)).toBeGreaterThan(100);
    expect(silent).toBeGreaterThan(200);
  });

  it('preserves authored grips, custom poses, posture and explicit opt-outs', () => {
    const base = { id: 'moses', pose: 'standListen', motionLife: true };
    for (const extra of [{ hold: [{}] }, { props: [{}] }, { carryChild: true }, { lying: true }, { motionLife: false }, { motion: null }, { pose: 'coveredFace' }]) {
      expect(motionPlanFor({ ...base, ...extra })).toBeNull();
    }
    const kneeling = motionKeysFor({ ...base, pose: 'kneelBowed' });
    expect(kneeling).toEqual(['kneel-idle', 'kneel-pray']);
    for (const key of [...kneeling, ...motionKeysFor(base)]) expect(library.clips.has(key)).toBe(true);
    expect(motionPlanFor({ id: 'listener', motion: 'nod-yes' })).toEqual(motionPlanFor({ id: 'human-listener', fallbackId: 'listener', motion: 'nod-yes' }));
  });

  it('keeps a single idle capture continuous across the schedule boundary', () => {
    const plan = motionPlanFor({ id: 'mary', pose: 'kneelListen', motionLife: true });
    for (let t = 0; t < 80; t += 0.1) {
      const current = sampleMotionPlan(plan, t), next = sampleMotionPlan(plan, t + 0.1);
      expect(next.time - current.time).toBeCloseTo(0.1);
      expect(current.once).toBe(false);
    }
  });

  it('keeps the authored pose when a performance is missing one of its captures', async () => {
    const tableau = createTableau(THREE, { root: new THREE.Group(), name: 'missing-capture',
      cast: [{ id: 'listener', model: 'human-artisan', position: [0, 0, 0], target: [0, 2], pose: 'standListen', motionLife: true }],
      poses: COMMON_POSES, focus: [0, 0, 0], motionLibrary: { ...library, clips: new Map([['nod-yes', library.clips.get('nod-yes')]]) } });
    try {
      tableau.acceptAssets({ models: { 'human-artisan': model } });
      await tableau.whenReady();
      const actor = tableau.getActors().get('listener');
      tableau.update({ delta: 0.1 });
      expect(actor.motionPlan).toBeNull();
      expect(actor.mixer._actions.some((action) => action.getClip().name === 'standListen' && action.isRunning())).toBe(true);
    } finally { tableau.dispose(); }
  });

  it('upgrades actors when the motion library arrives after their models and freezes reduced motion', async () => {
    let deliver;
    const pending = new Promise((resolve) => { deliver = resolve; });
    const humans = createSceneHumans({ THREE, root: new THREE.Group(), sceneSlug: 'test',
      crowdFigures: [{ id: 'listener', x: 0, z: 0, activity: 'talking', motion: 'talk-ask', variantId: 'galilee-fisherman-a' }],
      groundAt: () => 0, motionLibrary: pending });
    try {
      humans.acceptAssets({ models: { 'human-artisan': model } });
      humans.update({ elapsed: 0, delta: 0 });
      const actor = [...humans.getActors().values()][0];
      expect(actor.animController.currentActionName).toBe('idle');
      deliver(library); await pending; await Promise.resolve();
      const actions = new Set();
      for (let i = 1; i < 300; i++) {
        humans.update({ elapsed: i / 10, delta: 0.1 });
        actions.add(actor.animController.currentActionName);
        expect(actor.root.visible).toBe(true);
      }
      expect(actions).toEqual(new Set(['life:talk-ask', 'life:breathing-idle']));
      const before = actor.root.getObjectByName('mixamorigRightHand').quaternion.clone();
      const clock = humans.getElapsed();
      humans.update({ elapsed: 100, delta: 0.1, reducedMotion: true });
      expect(humans.getElapsed()).toBe(clock);
      expect(actor.root.getObjectByName('mixamorigRightHand').quaternion.equals(before)).toBe(true);
      humans.update({ elapsed: 100.05, delta: 0.05 });
      expect(humans.getElapsed() - clock).toBeCloseTo(0.05);
    } finally { humans.dispose(); }
  });

  it('takes the stool from someone whose captured clip sits them on the ground, and only once it has arrived', async () => {
    let deliver;
    const pending = new Promise((resolve) => { deliver = resolve; });
    const humans = createSceneHumans({ THREE, root: new THREE.Group(), sceneSlug: 'test',
      crowdFigures: [{ id: 'sitter', x: 0, z: 0, activity: 'sitting', motion: 'sit-floor', variantId: 'galilee-fisherman-a' }],
      groundAt: () => 0, motionLibrary: pending });
    try {
      humans.acceptAssets({ models: { 'human-artisan': model } });
      humans.update({ elapsed: 0, delta: 0 });
      const actor = [...humans.getActors().values()][0];
      const seat = actor.root.children.filter((child) => child.userData.seat);
      // A stool seat and its three legs, shown while the baked sit (which is posed for a stool) is all they have.
      expect(seat).toHaveLength(4);
      expect(seat.every((part) => part.visible)).toBe(true);
      deliver(library); await pending; await Promise.resolve();
      humans.update({ elapsed: 0.1, delta: 0.1 });
      expect(actor.animController.currentActionName).toBe('life:sit-floor');
      expect(seat.every((part) => !part.visible)).toBe(true);
    } finally { humans.dispose(); }
  });

  it('keeps the stool for a sitter whose captured clip never came', async () => {
    const humans = createSceneHumans({ THREE, root: new THREE.Group(), sceneSlug: 'test',
      crowdFigures: [{ id: 'sitter', x: 0, z: 0, activity: 'sitting', motion: 'sit-floor', variantId: 'galilee-fisherman-a' }],
      groundAt: () => 0, motionLibrary: { ...library, clips: new Map() } });
    try {
      humans.acceptAssets({ models: { 'human-artisan': model } });
      humans.update({ elapsed: 0, delta: 0 });
      humans.update({ elapsed: 0.1, delta: 0.1 });
      const actor = [...humans.getActors().values()][0];
      expect(actor.animController.currentActionName).toBe('sit');
      expect(actor.root.children.filter((child) => child.userData.seat).every((part) => part.visible)).toBe(true);
    } finally { humans.dispose(); }
  });

  it('never snaps someone sitting on the ground, bending to it, leaning in to speak or kneeling to the baked idle pose', async () => {
    // The pose check that replaces an inverted rig with the baked idle (sceneHumanSafety.js) once took each of
    // these for one, so they flashed into the stiff A-pose every few frames, in a loop.
    const people = [
      { id: 'sitter', x: 0, z: 0, activity: 'sitting', motion: 'sit-floor-reclined' },
      { id: 'sitter-up', x: 2, z: 0, activity: 'sitting', motion: 'sit-floor' },
      { id: 'worker', x: 4, z: 0, activity: 'working', motion: 'pick-up' },
      { id: 'talker', x: 6, z: 0, activity: 'talking', motion: 'talk-chat' },
      { id: 'kneeler', x: 8, z: 0, activity: 'kneeling', motion: 'kneel-idle' },
    ].map((person) => ({ ...person, variantId: 'galilee-fisherman-a' }));
    const humans = createSceneHumans({ THREE, root: new THREE.Group(), sceneSlug: 'test', crowdFigures: people, groundAt: () => 0, motionLibrary: library });
    try {
      humans.acceptAssets({ models: { 'human-artisan': model } });
      const shown = new Map();
      for (let i = 0; i < 1000; i++) {
        humans.update({ elapsed: i / 10, delta: 0.1, camera: new THREE.PerspectiveCamera() });
        if (i < 3) continue;
        for (const actor of humans.getActors().values()) {
          if (!shown.has(actor.id)) shown.set(actor.id, new Set());
          shown.get(actor.id).add(actor.animController.currentActionName);
          expect(actor.root.visible, `${actor.id} @ ${i}`).toBe(true);
        }
      }
      expect(shown.size).toBe(people.length);
      for (const [id, names] of shown) expect(names.has('idle'), `${id} was snapped to the idle pose: ${[...names]}`).toBe(false);
      // And each really did what it is for: the clips that failed the check were played, not avoided.
      expect(shown.get('human-sitter')).toContain('life:sit-floor-reclined');
      expect(shown.get('human-sitter-up')).toContain('life:sit-floor');
      expect(shown.get('human-worker')).toContain('life:pick-up');
      expect(shown.get('human-talker')).toContain('life:talk-chat');
      expect(shown.get('human-kneeler')).toContain('life:kneel-idle');
    } finally { humans.dispose(); }
  }, 60000);

  it('keeps standing and kneeling story characters grounded through captures and crossfades', async () => {
    const cast = ['standListen', 'kneelBowed'].map((pose, i) => ({
      id: pose, model: 'human-artisan', position: [i * 2, 0, 0], target: [i * 2, 2], pose, motionLife: true,
    }));
    const tableau = createTableau(THREE, { root: new THREE.Group(), name: 'life-test', cast, poses: COMMON_POSES, focus: [0, 0, 0], motionLibrary: library });
    try {
      tableau.acceptAssets({ models: { 'human-artisan': model } });
      await tableau.whenReady();
      const clips = new Set();
      for (let i = 0; i < 320; i++) {
        tableau.update({ delta: 0.1 });
        for (const actor of tableau.getActors().values()) {
          actor.root.updateMatrixWorld(true);
          clips.add(actor.motionAction.getClip().name);
          const y = (bone) => actor.root.getObjectByName(`mixamorig${bone}`).getWorldPosition(new THREE.Vector3()).y;
          if (actor.entry.pose === 'standListen') {
            expect(Math.min(y('LeftFoot'), y('RightFoot'))).toBeGreaterThan(0);
            expect(y('Head') - y('Hips')).toBeGreaterThan(0.4);
          } else {
            expect(Math.min(y('LeftLeg'), y('RightLeg'))).toBeLessThan(0.2);
            expect(y('Head')).toBeGreaterThan(0.8);
          }
        }
      }
      expect(clips).toEqual(new Set(['mixamo-breathing-idle', 'mixamo-nod-yes', 'mixamo-kneel-idle', 'mixamo-kneel-pray']));
      const clock = tableau.getElapsed();
      tableau.update({ delta: 10, reducedMotion: true });
      expect(tableau.getElapsed()).toBe(clock);
      tableau.setActive(false); tableau.update({ delta: 0.1 });
      expect(tableau.getElapsed()).toBe(clock);
    } finally { tableau.dispose(); }
  });
});
