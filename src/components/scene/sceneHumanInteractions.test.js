import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createSceneHumans } from './sceneHumans';
import { attachHumanProp, resolveHumanSocket } from './sceneHumanAttachments';
import { createPoseOverlay } from './sceneHumanPose';

function makeCharacter() {
  const scene = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = THREE.PropertyBinding.sanitizeNodeName('mixamorig:Hips');
  const spine2 = new THREE.Bone();
  spine2.name = THREE.PropertyBinding.sanitizeNodeName('mixamorig:Spine2');
  const rightHand = new THREE.Bone();
  rightHand.name = THREE.PropertyBinding.sanitizeNodeName('mixamorig:RightHand');
  hips.add(spine2);
  spine2.add(rightHand);
  scene.add(hips);

  const skeleton = new THREE.Skeleton([hips, spine2, rightHand]);
  const mesh = new THREE.SkinnedMesh(
    new THREE.BoxGeometry(0.4, 1.7, 0.3),
    new THREE.MeshStandardMaterial(),
  );
  mesh.bind(skeleton);
  scene.add(mesh);

  const track = new THREE.VectorKeyframeTrack(
    `${hips.name}.position`,
    [0, 1],
    [0, 0, 0, 0, 0.01, 0],
  );
  return {
    scene,
    animations: [
      new THREE.AnimationClip('idle', 1, [track]),
      new THREE.AnimationClip('walk', 1, [track]),
    ],
  };
}

function makeProp(name = 'jar') {
  const scene = new THREE.Group();
  scene.name = name;
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2), new THREE.MeshStandardMaterial()));
  return { scene, animations: [] };
}

describe('human prop sockets', () => {
  it('resolves semantic sockets onto the shipped Mixamo bone names', () => {
    const root = new THREE.Group();
    const hand = new THREE.Bone();
    hand.name = THREE.PropertyBinding.sanitizeNodeName('mixamorig:RightHand');
    root.add(hand);
    expect(resolveHumanSocket(THREE, root, 'makehuman-mixamo-v1', 'rightGrip')).toBe(hand);
  });

  it('parents a prop clone to the requested socket without taking resource ownership', () => {
    const root = new THREE.Group();
    const hand = new THREE.Bone();
    hand.name = THREE.PropertyBinding.sanitizeNodeName('mixamorig:RightHand');
    root.add(hand);
    const propSource = makeProp().scene;
    const attached = attachHumanProp(THREE, root, 'makehuman-mixamo-v1', {
      modelId: 'prop-galilean-jar', socket: 'rightGrip', position: [0, -0.2, 0.1], scale: 0.8,
    }, propSource);
    expect(attached.parent).toBe(hand);
    expect(attached.position.y).toBeCloseTo(-0.2);
    expect(attached.scale.x).toBeCloseTo(0.8);
    expect(attached.children[0].geometry).toBe(propSource.children[0].geometry);
  });
});

describe('crowd-to-authored interaction mapping', () => {
  it('enriches the real Capernaum carrier and attaches a prop that loads later', () => {
    const root = new THREE.Group();
    const humans = createSceneHumans({
      sceneSlug: 'capernaum',
      THREE,
      root,
      crowdFigures: [{
        id: 'walker-north-lane-0', x: 12, y: 1.2, z: 28,
        activity: 'walking', facing: 0, scale: 1,
      }],
      qualityProfile: 'high',
    });

    const model = makeCharacter();
    humans.acceptAssets({
      models: {
        'human-traveler': model,
        'human-artisan': model,
        'human-villager': model,
      },
    });

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(12, 2, 28);
    humans.update({ camera, quality: 'high', elapsed: 1, delta: 0.016 });

    const actor = humans.getActors().get('human-walker-north-lane-0');
    expect(actor).toBeDefined();
    expect(actor.variant.id).toBe('galilee-carrier-a');
    expect(actor.placement.props[0].modelId).toBe('prop-galilean-jar');
    expect(actor.attachments.size).toBe(0);

    humans.acceptPropAssets({ models: { 'prop-galilean-jar': makeProp('jar') } });
    expect(actor.attachments.size).toBe(1);
    const hand = actor.root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName('mixamorig:RightHand'));
    expect(hand.getObjectByName('human-prop-prop-galilean-jar')).toBeTruthy();

    humans.dispose();
  });
});

describe('carried-load pose overlay', () => {
  it('pulls a walking arm back toward the captured carry pose', () => {
    const root = new THREE.Group();
    const arm = new THREE.Bone();
    arm.name = THREE.PropertyBinding.sanitizeNodeName('mixamorig:RightArm');
    root.add(arm);
    const target = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.8);
    arm.quaternion.copy(target);
    const overlay = createPoseOverlay(THREE, root, { actorId: 'carrier', holdPose: true });

    arm.quaternion.identity();
    const before = arm.quaternion.angleTo(target);
    overlay.update(0.016, 1);
    const after = arm.quaternion.angleTo(target);
    expect(after).toBeLessThan(before * 0.2);
  });
});
