import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { motionPlanFor, motionKeysFor, sampleMotionPlan } from './sceneMotionLife';
import { decodeMotionLibrary, MOTION_URL } from './sceneMixamo';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets';
import { createSceneHumans } from './sceneHumans';
import { createTableau } from './sceneTableau';
import { COMMON_POSES } from './tableauPoses';

const library = decodeMotionLibrary(JSON.parse(readFileSync(`public${MOTION_URL}`, 'utf8')));
let model;
beforeAll(async () => {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new THREE.Texture() }));
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
