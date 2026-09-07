import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createHumanPoseSafety } from './sceneHumanSafety';
import { createSceneHumans } from './sceneHumans';

function addNamedBone(parent, rawName, position) {
  const bone = new THREE.Bone();
  bone.name = THREE.PropertyBinding.sanitizeNodeName(rawName);
  bone.position.fromArray(position);
  parent.add(bone);
  return bone;
}

function buildUprightRig() {
  const root = new THREE.Group();
  const hips = addNamedBone(root, 'mixamorig:Hips', [0, 0.9, 0]);
  const head = addNamedBone(hips, 'mixamorig:Head', [0, 0.7, 0]);
  const leftFoot = addNamedBone(hips, 'mixamorig:LeftFoot', [-0.12, -0.86, 0]);
  const rightFoot = addNamedBone(hips, 'mixamorig:RightFoot', [0.12, -0.86, 0]);
  root.updateMatrixWorld(true);
  return { root, hips, head, leftFoot, rightFoot };
}

function mockCharacter() {
  const { root, hips, head, leftFoot, rightFoot } = buildUprightRig();
  const skeleton = new THREE.Skeleton([hips, head, leftFoot, rightFoot]);
  const mesh = new THREE.SkinnedMesh(
    new THREE.BoxGeometry(0.4, 1.7, 0.25),
    new THREE.MeshStandardMaterial(),
  );
  mesh.bind(skeleton);
  root.add(mesh);

  const idle = new THREE.AnimationClip('idle', 1, []);
  const walk = new THREE.AnimationClip('walk', 1, []);
  const proceduralWalk = new THREE.AnimationClip('procedural-walk', 1, []);
  return {
    scene: root,
    animations: [idle, walk],
    // Deliberately present: production must ignore this runtime-generated set.
    __proceduralClips: { idle, walk: proceduralWalk },
    bakedWalk: walk,
    proceduralWalk,
  };
}

describe('human pose safety', () => {
  it('accepts an upright floor-anchored skeleton', () => {
    const { root } = buildUprightRig();
    const safety = createHumanPoseSafety(THREE, root);
    expect(safety.isSane({ groundY: 0, heightMeters: 1.7 })).toBe(true);
  });

  it('rejects the screenshot failure mode where the head is below the feet', () => {
    const { root, head } = buildUprightRig();
    head.position.y = -1.5;
    const safety = createHumanPoseSafety(THREE, root);
    expect(safety.isSane({ groundY: 0, heightMeters: 1.7 })).toBe(false);
  });

  it('does not reject minimal test/future rigs when landmarks are unavailable', () => {
    const root = new THREE.Group();
    root.add(addNamedBone(new THREE.Group(), 'mixamorig:Hips', [0, 1, 0]));
    expect(createHumanPoseSafety(THREE, root).isSane({ groundY: 0 })).toBe(true);
  });
});

describe('production human motion source', () => {
  it('prefers baked GLB clips even when procedural clips exist on the model', () => {
    const asset = mockCharacter();
    const humans = createSceneHumans({
      sceneSlug: 'capernaum',
      THREE,
      root: new THREE.Group(),
      crowdFigures: [{ id: 'person-0', x: 0, y: 0, z: 0, activity: 'walking' }],
    });
    humans.acceptAssets({ models: { 'human-artisan': asset } });
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 2);
    humans.update({ elapsed: 1, delta: 1 / 60, camera, quality: 'high' });

    const actor = [...humans.getActors().values()][0];
    expect(actor.animController.actions.walk.getClip()).toBe(asset.bakedWalk);
    expect(actor.animController.actions.walk.getClip()).not.toBe(asset.proceduralWalk);
    humans.dispose();
  });

  it('hard-locks the actor root to floor position plus yaw only', () => {
    const asset = mockCharacter();
    const humans = createSceneHumans({
      sceneSlug: 'capernaum',
      THREE,
      root: new THREE.Group(),
      crowdFigures: [{ id: 'person-0', x: 0, y: 0, z: 0, facing: 0.4, activity: 'standing' }],
    });
    humans.acceptAssets({ models: { 'human-artisan': asset } });
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 2);
    humans.update({ elapsed: 1, delta: 1 / 60, camera, quality: 'high' });
    const actor = [...humans.getActors().values()][0];

    actor.root.rotation.x = 1.2;
    actor.root.rotation.z = -0.8;
    humans.update({ elapsed: 1.016, delta: 0.016, camera, quality: 'high' });
    expect(actor.root.rotation.x).toBe(0);
    expect(actor.root.rotation.z).toBe(0);
    expect(actor.root.position.y).toBeCloseTo(0);
    humans.dispose();
  });
});
