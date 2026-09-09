// Offline retargeting: keep the Adobe donor FBXs in ignored authoring cache.
// Usage: node scripts/humans/retarget_elah_mixamo.mjs [source-directory]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildPoseClip } from '../../src/components/scene/sceneHumanClips.js';
import { ELAH_CHARACTER_ASSETS } from '../../src/components/scene/elahCharacterAssets.js';

const sourceDir = path.resolve(process.argv[2] || 'scripts/.cache/elah/mixamo');
const output = 'src/components/scene/elahMixamoClips.json';
const definitions = { david: 'Bouncing Fight Idle', goliath: 'Standing Taunt Chest Thump' };
const records = {};
const buffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
THREE.TextureLoader.prototype.load = () => new THREE.Texture();
const loader = new GLTFLoader();
loader.register(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new THREE.Texture() }));
for (const [id, title] of Object.entries(definitions)) {
  const bytes = await fs.readFile(path.join(sourceDir, `${title}.fbx`));
  const source = new FBXLoader().parse(buffer(bytes), '');
  const sourceClip = source.animations.find((clip) => clip.tracks.length);
  if (!sourceClip) throw new Error(`No animation in ${title}`);
  source.updateMatrixWorld(true);
  const sourceBones = new Map();
  source.traverse((node) => { if (node.isBone && !sourceBones.has(node.name)) sourceBones.set(node.name, node); });
  const sourceBind = new Map([...sourceBones].map(([name, bone]) => [name, bone.getWorldQuaternion(new THREE.Quaternion())]));
  const sourceHip = sourceBones.get('mixamorigHips').getWorldPosition(new THREE.Vector3());
  const asset = ELAH_CHARACTER_ASSETS.find((entry) => entry.id === `human-${id}`);
  const target = (await loader.parseAsync(buffer(await fs.readFile(`public${asset.url}`)), '')).scene;
  const targetBones = []; target.traverse((node) => { if (node.isBone) targetBones.push(node); });
  const original = new Map(targetBones.map((bone) => [bone, { q: bone.quaternion.clone(), p: bone.position.clone() }]));
  // Put the A-pose character into an anatomical T reference before computing
  // world-space offsets. Copying local FBX quaternions twists this MPFB rig.
  const reference = buildPoseClip(THREE, target, 'retarget-reference', 1, () => ({
    left: { armAbduct: 90 }, right: { armAbduct: 90 }, fingerCurl: 0,
  }));
  const referenceMixer = new THREE.AnimationMixer(target);
  referenceMixer.clipAction(reference).play(); referenceMixer.setTime(0); target.updateMatrixWorld(true);
  const targetReference = new Map(targetBones.map((bone) => [bone.name, bone.getWorldQuaternion(new THREE.Quaternion())]));
  referenceMixer.stopAllAction(); referenceMixer.uncacheRoot(target);
  for (const [bone, pose] of original) { bone.quaternion.copy(pose.q); bone.position.copy(pose.p); }
  // Fingers use the target's anatomical hinges for a closed, non-distorted grip.
  // Goliath's left arm is reserved for the spear; right-hand capture is retained.
  const grip = buildPoseClip(THREE, target, 'equipment-grip', 1, () => ({
    left: { armFlex: 5, armAbduct: 21, foreArmFlex: 72, foreArmAbduct: 24 }, fingerCurl: 58,
  }));
  const gripTracks = new Map(grip.tracks.map((track) => [track.name, track]));
  target.updateMatrixWorld(true);
  const hip = target.getObjectByName('mixamorigHips');
  const restHip = hip.getWorldPosition(new THREE.Vector3());
  const motionScale = restHip.y / sourceHip.y;
  const mixer = new THREE.AnimationMixer(source); mixer.clipAction(sourceClip).setLoop(THREE.LoopOnce, 1).play();
  const fps = 30; const frames = Math.round(sourceClip.duration * fps);
  const times = []; const rotations = new Map(targetBones.map((bone) => [bone, []])); const positions = [];
  const skin = []; target.traverse((n) => { if (n.isSkinnedMesh && n.name.includes('Skin_LOD0')) skin.push(n); });
  const point = new THREE.Vector3();
  function placeHand(side, desired) {
    const arm = target.getObjectByName(`mixamorig${side}Arm`);
    const forearm = target.getObjectByName(`mixamorig${side}ForeArm`);
    const hand = target.getObjectByName(`mixamorig${side}Hand`);
    const a = arm.getWorldPosition(new THREE.Vector3());
    const b = forearm.getWorldPosition(new THREE.Vector3());
    const c = hand.getWorldPosition(new THREE.Vector3());
    const handRotation = hand.getWorldQuaternion(new THREE.Quaternion());
    const upper = a.distanceTo(b); const lower = b.distanceTo(c);
    const axis = desired.clone().sub(a).normalize();
    const distance = THREE.MathUtils.clamp(a.distanceTo(desired), Math.abs(upper - lower) + .001, upper + lower - .001);
    const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
    const bend = b.clone().sub(a); bend.addScaledVector(axis, -bend.dot(axis)).normalize();
    const elbow = a.clone().addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - along * along)));
    const aim = (bone, child, destination) => {
      const origin = bone.getWorldPosition(new THREE.Vector3());
      const from = child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
      const to = destination.clone().sub(origin).normalize();
      const rotation = new THREE.Quaternion().setFromUnitVectors(from, to).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
      bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
      bone.updateMatrixWorld(true);
    };
    aim(arm, forearm, elbow); aim(forearm, hand, a.clone().addScaledVector(axis, distance));
    hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handRotation));
    hand.updateMatrixWorld(true);
  }
  for (let frame = 0; frame <= frames; frame++) {
    const t = Math.min(frame / fps, sourceClip.duration - 1e-6); times.push(frame / fps);
    mixer.setTime(t); source.updateMatrixWorld(true);
    for (const bone of targetBones) {
      const name = bone.name; const donor = sourceBones.get(name);
      const locked = /Hand(Thumb|Index|Middle|Ring|Pinky)/.test(name) || (id === 'goliath' && /Left(Arm|ForeArm|Hand)$/.test(name));
      const fixed = locked && gripTracks.get(`${name}.quaternion`);
      if (fixed) bone.quaternion.fromArray(fixed.values, 0);
      else if (donor) {
        const world = donor.getWorldQuaternion(new THREE.Quaternion()).multiply(sourceBind.get(name).clone().invert()).multiply(targetReference.get(name));
        bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)).normalize();
      }
      bone.updateMatrixWorld(true);
    }
    const p = sourceBones.get('mixamorigHips').getWorldPosition(new THREE.Vector3()).sub(sourceHip).multiplyScalar(motionScale).add(restHip);
    hip.position.copy(hip.parent.worldToLocal(p)); target.updateMatrixWorld(true);
    if (id === 'goliath') {
      // Preserve chest-contact intent across different torso/arm proportions.
      // A rotation-only retarget leaves the fist hovering ahead of the armor.
      const chest = target.getObjectByName('mixamorigSpine2').getWorldPosition(new THREE.Vector3());
      const offset = sourceBones.get('mixamorigRightHand').getWorldPosition(new THREE.Vector3())
        .sub(sourceBones.get('mixamorigSpine2').getWorldPosition(new THREE.Vector3())).multiplyScalar(motionScale);
      placeHand('Right', chest.add(offset));
    }
    // Ground using the actual deformed sole, not a box including equipment.
    let floor = Infinity;
    for (const mesh of skin) {
      mesh.skeleton.update();
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld); floor = Math.min(floor, point.y);
      }
    }
    if (!Number.isFinite(floor)) throw new Error('Missing skin for foot grounding');
    const grounded = hip.getWorldPosition(point).clone(); grounded.y -= floor;
    hip.position.copy(hip.parent.worldToLocal(grounded));
    positions.push(...hip.position.toArray());
    for (const bone of targetBones) rotations.get(bone).push(...bone.quaternion.toArray());
  }
  const tracks = targetBones.map((bone) => new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, rotations.get(bone)));
  tracks.push(new THREE.VectorKeyframeTrack('mixamorigHips.position', times, positions));
  // Short interpolated return avoids a pop when the one-shot taunt repeats.
  const seam = id === 'goliath' ? .4 : .16;
  for (const track of tracks) {
    const size = track.getValueSize(); const values = Array.from(track.values);
    values.push(...values.slice(0, size));
    track.times = new Float32Array([...track.times, frames / fps + seam]); track.values = new Float32Array(values);
  }
  const clip = new THREE.AnimationClip(title, frames / fps + seam, tracks).optimize();
  const json = THREE.AnimationClip.toJSON(clip); delete json.uuid;
  // Quantize to six decimal places for compact, deterministic source output.
  for (const track of json.tracks) for (const key of ['times', 'values']) track[key] = track[key].map((v) => +v.toFixed(6));
  records[id] = { source: 'Adobe Mixamo', title, sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    targetSha256: asset.sha256, sourceDuration: sourceClip.duration, fps, clip: json };
  console.log(`${id}: ${title}, ${frames + 1} captured frames, ${clip.duration.toFixed(2)}s loop`);
}
await fs.writeFile(output, JSON.stringify(records));
