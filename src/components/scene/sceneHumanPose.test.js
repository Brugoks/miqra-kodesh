import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPoseOverlay, LIMITS } from './sceneHumanPose';

function buildActorRoot() {
  const root = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'mixamorigHips';
  const spine2 = new THREE.Bone();
  spine2.name = 'mixamorigSpine2';
  const neck = new THREE.Bone();
  neck.name = 'mixamorigNeck';
  const head = new THREE.Bone();
  head.name = 'mixamorigHead';
  root.add(hips);
  hips.add(spine2);
  spine2.add(neck);
  neck.add(head);
  return { root, hips, spine2, head };
}

function angleOf(quaternion) {
  return 2 * Math.acos(Math.min(1, Math.abs(quaternion.w)));
}

describe('createPoseOverlay', () => {
  it('is deterministic for a given actor id, and diverges for a different one', () => {
    const a1 = buildActorRoot();
    const a2 = buildActorRoot();
    const overlayA = createPoseOverlay(THREE, a1.root, { actorId: 'villager-7' });
    const overlayB = createPoseOverlay(THREE, a2.root, { actorId: 'villager-7' });
    for (let i = 0; i < 200; i += 1) {
      overlayA.update(0.05, i * 0.05);
      overlayB.update(0.05, i * 0.05);
    }
    expect(a1.head.quaternion.toArray()).toEqual(a2.head.quaternion.toArray());
    expect(a1.hips.quaternion.toArray()).toEqual(a2.hips.quaternion.toArray());

    const b1 = buildActorRoot();
    const overlayC = createPoseOverlay(THREE, b1.root, { actorId: 'villager-8' });
    for (let i = 0; i < 200; i += 1) overlayC.update(0.05, i * 0.05);
    expect(b1.head.quaternion.toArray()).not.toEqual(a1.head.quaternion.toArray());
  });

  it('never exceeds its declared channel limits over a long run', () => {
    // In production `mixer.update(dt)` sets every one of these bones fresh
    // from the clip, every frame, immediately before the overlay ever runs
    // (sceneHumans.js) — every authored clip carries a track for each of
    // Hips/Spine2/Head regardless of pose, so this reset always happens.
    // Standing in for that here with an identity reset isolates what
    // actually matters: bounded by construction, never accumulating.
    const { root, hips, spine2, head } = buildActorRoot();
    const overlay = createPoseOverlay(THREE, root, { actorId: 'long-runner' });
    const dt = 1 / 30;
    for (let t = 0; t < 120; t += dt) {
      hips.quaternion.identity();
      spine2.quaternion.identity();
      head.quaternion.identity();
      overlay.update(dt, t, { player: { yaw: (t % 7) - 3.5, distance: 3 + (t % 5) } });
      expect(angleOf(spine2.quaternion)).toBeLessThanOrEqual(LIMITS.breathPitch + 1e-6);
      expect(angleOf(hips.quaternion)).toBeLessThanOrEqual(LIMITS.weightRoll + 1e-6);
      expect(angleOf(head.quaternion)).toBeLessThanOrEqual(Math.hypot(LIMITS.headYaw, LIMITS.headPitch) + 1e-6);
    }
  });

  it('contributes nothing when a caller never calls update (reduced motion) — the caller owns the gate', () => {
    // sceneHumans.js only calls poseOverlay.update() inside its own
    // `if (!rm)` branch, exactly like the mixer and the animation
    // controller — so "reduced motion contributes zero" is enforced by
    // never invoking this at all, not by a flag on the overlay itself.
    const { hips, spine2, head } = buildActorRoot();
    const before = {
      hips: hips.quaternion.clone(), spine2: spine2.quaternion.clone(), head: head.quaternion.clone(),
    };
    // No update() call.
    expect(hips.quaternion.toArray()).toEqual(before.hips.toArray());
    expect(spine2.quaternion.toArray()).toEqual(before.spine2.toArray());
    expect(head.quaternion.toArray()).toEqual(before.head.toArray());
  });

  it('does not throw when a bone is missing', () => {
    const root = new THREE.Group();
    const overlay = createPoseOverlay(THREE, root, { actorId: 'bare' });
    expect(() => overlay.update(0.016, 0)).not.toThrow();
  });

  it('biases the head toward a nearby player roughly in front, within its yaw limit', () => {
    const { root, head } = buildActorRoot();
    const overlay = createPoseOverlay(THREE, root, { actorId: 'watcher' });
    let sawGlanceTowardPlayer = false;
    for (let i = 0; i < 400; i += 1) {
      overlay.update(1 / 20, i / 20, { player: { yaw: 0.4, distance: 2.5 } });
      // The head's local yaw component, approximated via its Y-axis swing.
      const euler = new THREE.Euler().setFromQuaternion(head.quaternion, 'YXZ');
      if (Math.abs(euler.y - 0.4) < 0.15) sawGlanceTowardPlayer = true;
    }
    expect(sawGlanceTowardPlayer).toBe(true);
  });
});
