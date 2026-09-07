// Exercise shipped assets, including fingers and rig proportions omitted from
// the small historical fixtures. No WebGL or texture decoding is necessary.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildHumanClips } from './sceneHumanClips';
import { createPoseOverlay, LIMITS } from './sceneHumanPose';

const directory = resolve('public/assets/scenes/shared/humans');
function loadRig(filename) {
  const bytes = readFileSync(resolve(directory, filename));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const nodes = gltf.nodes.map((data) => {
    const node = new THREE.Bone();
    node.name = THREE.PropertyBinding.sanitizeNodeName(data.name || '');
    if (data.translation) node.position.fromArray(data.translation);
    if (data.rotation) node.quaternion.fromArray(data.rotation);
    if (data.scale) node.scale.fromArray(data.scale);
    return node;
  });
  gltf.nodes.forEach((data, i) => data.children?.forEach((child) => nodes[i].add(nodes[child])));
  const root = new THREE.Group();
  nodes.filter((node) => !node.parent).forEach((node) => root.add(node));
  return root;
}
const position = (bone) => bone.getWorldPosition(new THREE.Vector3());
const angle = (from, to) => {
  const d = position(to).sub(position(from));
  return Math.atan2(d.z, -d.y);
};
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];

// The hand's own measured frame, in the hand bone's local space: `ulnar` runs
// from the index knuckle toward the pinky, `palm` points out of the palm.
// Which side the palm is on is read off the thumb — the one digit standing
// off the plane of the fingers — measured against a KNUCKLE, since the wrist
// bone itself sits well off that plane. This mirrors what sceneHumanClips.js
// derives, so a sign error there would show up as every assertion below
// inverting at once rather than as a quiet mirrored hand.
function handFrame(root, side) {
  const bone = (name) => root.getObjectByName(`mixamorig${name}`);
  const hand = bone(`${side}Hand`);
  const knuckle = position(bone(`${side}HandIndex1`));
  const ulnar = position(bone(`${side}HandPinky1`)).sub(knuckle).normalize();
  const along = position(bone(`${side}HandMiddle3`)).sub(position(bone(`${side}HandMiddle1`))).normalize();
  const palm = new THREE.Vector3().crossVectors(ulnar, along).normalize();
  palm.multiplyScalar(Math.sign(position(bone(`${side}HandThumb3`)).sub(knuckle).dot(palm)));
  const inverse = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
  return {
    palmWorld: palm.clone(),
    midline: position(bone('Hips')).sub(knuckle),
    ulnar: ulnar.applyQuaternion(inverse),
    palm: palm.applyQuaternion(inverse),
    tip: (digit) => hand.worldToLocal(position(bone(`${side}Hand${digit}3`))),
  };
}

for (const filename of readdirSync(directory).filter((name) => name.endsWith('.glb'))) {
  describe(filename, () => {
    it('loops every joint continuously and keys neutral hip positions', () => {
      const clips = buildHumanClips(THREE, loadRig(filename), { fps: 12 });
      for (const clip of Object.values(clips)) {
        expect(clip.tracks.some((track) => track.name === 'mixamorigHips.position')).toBe(true);
        for (const track of clip.tracks) {
          const size = track.getValueSize();
          const first = Array.from(track.values.slice(0, size));
          const last = Array.from(track.values.slice(-size));
          if (size === 4) {
            expect(new THREE.Quaternion(...first).normalize().angleTo(new THREE.Quaternion(...last).normalize())).toBeLessThan(0.001);
          } else first.forEach((value, i) => expect(value).toBeCloseTo(last[i], 5));
        }
      }
    });

    it('bends elbows forward, relaxes fingers, and seats hips on the stool with feet near the floor', () => {
      const root = loadRig(filename);
      const clips = buildHumanClips(THREE, root, { fps: 12 });
      const bone = (name) => root.getObjectByName(`mixamorig${name}`);
      const bindFinger = bone('LeftHandIndex2').quaternion.clone();
      const bindThumb = bone('LeftHandThumb1').quaternion.clone();
      const mixer = new THREE.AnimationMixer(root);
      for (const name of ['idle', 'talk', 'carry', 'work', 'sit']) {
        mixer.stopAllAction();
        const action = mixer.clipAction(clips[name]).play();
        for (const phase of [0, 0.2, 0.5, 0.8]) {
          action.time = clips[name].duration * phase;
          mixer.update(0); root.updateMatrixWorld(true);
          for (const side of ['Left', 'Right']) {
            const elbow = angle(bone(`${side}ForeArm`), bone(`${side}Hand`))
              - angle(bone(`${side}Arm`), bone(`${side}ForeArm`));
            expect(elbow).toBeGreaterThan(0);
            expect(elbow).toBeLessThan(Math.PI * 0.6);
          }
        }
        if (name === 'idle') {
          expect(bone('LeftHandIndex2').quaternion.angleTo(bindFinger)).toBeGreaterThan(0.2);
          expect(bone('LeftHandThumb1').quaternion.angleTo(bindThumb)).toBeGreaterThan(0.15);
        }
      }
      expect(position(bone('Hips')).y).toBeCloseTo(0.58, 3);
      for (const side of ['Left', 'Right']) {
        expect(position(bone(`${side}Foot`)).y).toBeGreaterThan(0.015);
        expect(position(bone(`${side}Foot`)).y).toBeLessThan(0.22);
      }
    });

    // The defect this replaced: measured on the shipped artisan, the old
    // solver moved every fingertip AWAY from the palm and almost entirely
    // sideways — hands that splayed and hyperextended rather than closing.
    // Bone rotations alone cannot catch that (a wrong axis still rotates the
    // bone), so these assertions are about where the fingertips end up, in
    // the hand's own measured frame.
    it('curls fingers into the palm, keeps them apart, and opposes the thumb', () => {
      const bindRoot = loadRig(filename);
      bindRoot.updateMatrixWorld(true);
      const bindFrames = { Left: handFrame(bindRoot, 'Left'), Right: handFrame(bindRoot, 'Right') };
      for (const side of ['Left', 'Right']) {
        // The palm side has to be the same fact whichever way the bind pose
        // is read: off the thumb, or off an arm hanging with its palm turned
        // toward the body. sceneHumanClips.js uses the first and falls back
        // to the second, so they must not disagree here.
        expect(bindFrames[side].palmWorld.dot(bindFrames[side].midline)).toBeGreaterThan(0);
      }

      const root = loadRig(filename);
      const clips = buildHumanClips(THREE, root, { fps: 12 });
      const mixer = new THREE.AnimationMixer(root);
      for (const clip of Object.values(clips)) {
        mixer.stopAllAction();
        const action = mixer.clipAction(clip).play();
        for (const phase of [0, 0.25, 0.5, 0.75]) {
          action.time = clip.duration * phase;
          mixer.update(0); root.updateMatrixWorld(true);
          for (const side of ['Left', 'Right']) {
            const bind = bindFrames[side];
            const frame = handFrame(root, side);
            const across = FINGERS.map((digit) => frame.tip(digit).dot(bind.ulnar));
            for (let i = 0; i < FINGERS.length - 1; i += 1) {
              // Adjacent fingertips keep real clearance across the hand —
              // they never converge into each other, let alone cross.
              expect(across[i + 1] - across[i]).toBeGreaterThan(0.01);
            }
            for (const digit of FINGERS) {
              const moved = frame.tip(digit).sub(bind.tip(digit));
              expect(moved.dot(bind.palm)).toBeGreaterThan(0.004);
            }
            // Opposition carries the thumb across the palm, not backwards.
            const thumb = frame.tip('Thumb').sub(bind.tip('Thumb'));
            expect(thumb.dot(bind.ulnar)).toBeGreaterThan(0.008);
            expect(thumb.dot(bind.palm)).toBeGreaterThan(0);
          }
        }
      }

      // A firmer grip closes the hand: `carry` holds something, `prayer` is
      // the open palm, and the pinch has to reflect that ordering.
      const pinch = (name) => {
        mixer.stopAllAction();
        mixer.clipAction(clips[name]).play();
        mixer.update(0); root.updateMatrixWorld(true);
        return position(root.getObjectByName('mixamorigLeftHandThumb3'))
          .distanceTo(position(root.getObjectByName('mixamorigLeftHandIndex3')));
      };
      expect(pinch('carry')).toBeLessThan(pinch('idle'));
      expect(pinch('idle')).toBeLessThan(pinch('prayer'));
    });

    it('does not accumulate overlay rotation when the mixer skips constant tracks', () => {
      const root = loadRig(filename);
      const clips = buildHumanClips(THREE, root, { fps: 12 });
      const mixer = new THREE.AnimationMixer(root);
      mixer.clipAction(clips.idle).play(); mixer.update(0);
      const overlay = createPoseOverlay(THREE, root, { actorId: filename });
      const hips = overlay.bones.hips;
      const base = hips.quaternion.clone();
      for (let i = 0; i < 3600; i++) {
        overlay.reset(); mixer.update(1 / 30);
        overlay.update(1 / 30, i / 30);
        expect(hips.quaternion.angleTo(base)).toBeLessThan(LIMITS.weightRoll + 0.001);
      }
      overlay.reset();
      expect(hips.quaternion.angleTo(base)).toBeLessThan(0.001);
    });
  });
}
