import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HumanAnimationController } from './sceneHumanAnimation';

describe('HumanAnimationController', () => {
  function createMockActor() {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.morphTargetDictionary = { blink_L: 0, blink_R: 1 };
    mesh.morphTargetInfluences = [0, 0];
    root.add(mesh);

    const track = new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 0, 0, 1]);
    const idleClip = new THREE.AnimationClip('idle', 3.0, [track]);
    const walkClip = new THREE.AnimationClip('walk', 1.2, [track]);
    const workClip = new THREE.AnimationClip('work', 4.0, [track]);

    const mixer = new THREE.AnimationMixer(root);

    const controller = new HumanAnimationController({
      mixer,
      clips: { idle: idleClip, walk: walkClip, work: workClip },
      morphMesh: mesh,
      morphNames: { blinkLeft: 'blink_L', blinkRight: 'blink_R' },
      locomotion: { walkMetersPerCycle: 1.25 },
      reducedMotion: false,
    });

    return { root, mesh, mixer, controller };
  }

  it('initializes with default idle state and can transition to work', () => {
    const { controller } = createMockActor();
    controller.transitionTo('work', 0.1);
    expect(controller.currentActionName).toBe('work');
  });

  it('synchronizes walk gait with physical distance traveled', () => {
    const { controller, mixer } = createMockActor();
    // Move forward 0.625m (half a cycle)
    controller.update(0.016, 0.625);
    expect(controller.state).toBe('walk');
    expect(controller.walkCyclePhase).toBeCloseTo(0.5);
    const gaitTime = controller.actions.walk.time;
    mixer.update(0.016);
    expect(controller.actions.walk.time).toBe(gaitTime);

    // Stop moving: transitions to idle
    controller.update(0.016, 0);
    expect(controller.state).toBe('idle');
  });

  it('schedules and drives Poisson-distributed blinks on morph targets', () => {
    const { mesh, controller } = createMockActor();
    controller.nextBlinkTime = 0.01; // Force immediate blink
    controller.update(0.02, 0);
    expect(controller.isBlinking).toBe(true);

    // Halfway through blink: influence should be positive
    controller.update(controller.blinkDuration * 0.5, 0);
    expect(mesh.morphTargetInfluences[0]).toBeGreaterThan(0.5);
    expect(mesh.morphTargetInfluences[1]).toBeGreaterThan(0.5);

    // Complete blink: influence returns to 0
    controller.update(controller.blinkDuration, 0);
    expect(controller.isBlinking).toBe(false);
    expect(mesh.morphTargetInfluences[0]).toBe(0);
    expect(mesh.morphTargetInfluences[1]).toBe(0);
  });

  it('respects reduced motion by maintaining calm posture without locomotion', () => {
    const { controller } = createMockActor();
    controller.reducedMotion = true;
    controller.update(0.1, 1.5);
    expect(controller.state).toBe('idle');
  });

  it('disposes cleanly and stops actions', () => {
    const { controller } = createMockActor();
    controller.transitionTo('work');
    controller.dispose();
    expect(Object.keys(controller.actions)).toHaveLength(0);
    expect(controller.mixer).toBeNull();
  });

  it('turns at a rate independent of frame rate', () => {
    // The old `delta * 5` was a fraction-per-frame with no time unit: a
    // figure at 144fps turned four times slower than the same figure at
    // 30fps for the same elapsed real time.
    const fine = createMockActor().controller;
    const coarse = createMockActor().controller;
    fine.currentFacing = 0;
    coarse.currentFacing = 0;
    const target = 1.2; // well under the hard turn-rate cap
    for (let i = 0; i < 60; i += 1) fine.update(1 / 60, 0, target);
    for (let i = 0; i < 6; i += 1) coarse.update(1 / 6, 0, target);
    expect(Math.abs(fine.currentFacing - coarse.currentFacing)).toBeLessThan(0.035); // ~2 degrees
  });

  it('caps the turn rate so a large facing change eases in rather than snapping', () => {
    const { controller } = createMockActor();
    controller.currentFacing = 0;
    controller.update(0.016, 0, Math.PI); // a full about-face
    expect(Math.abs(controller.currentFacing)).toBeLessThanOrEqual(HumanAnimationController.MAX_TURN_STEP * 0.016 + 1e-9);
  });
});
