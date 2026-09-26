// Offline: authors the visitor's own locomotion for the third-person view.
//
// The visitor is the one person in the scene who is watched for the whole
// visit, from a few metres behind, so the three clips that carry them are
// built here with more care than a crowd loop gets:
//
//   idle — Mixamo "Idle", retargeted onto the shipped traveler rig;
//   walk — Mixamo "Walking", retargeted the same way, travel taken out of the
//          hips so the scene (not the clip) moves the body;
//   jog  — authored procedurally for the same rig, because a person jogging
//          with a staff and a bag is not a motion anyone captured for us.
//
// All three hold a walking staff in the right hand: the arm is posed with the
// same anatomical solver as the village cast (sceneHumanClips.js), the fingers
// close around the shaft, and the grip itself — where the shaft runs through
// the fist and which way — is measured against the skinned hand and written
// out beside the clips, so the runtime attaches the staff where the fingers
// actually are rather than where someone guessed they would be.
//
// The Adobe FBX donors stay in the ignored authoring cache and never ship;
// only motion already bound to our own rig is written, as AnimationClip JSON
// with its provenance, to src/components/scene/playerAvatarClips.json.
//
// Usage: node scripts/humans/retarget_player_mixamo.mjs [mixamo-source-directory]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildPoseClip } from '../../src/components/scene/sceneHumanClips.js';
import { HUMAN_MODEL_ASSETS } from '../../src/components/scene/sceneHumanAssets.js';

const sourceDir = path.resolve(process.argv[2] || 'scripts/.cache/tabernacle/mixamo');
const output = path.resolve('src/components/scene/playerAvatarClips.json');
const RIG = 'makehuman-mixamo-v1';
const TARGET = HUMAN_MODEL_ASSETS.find((asset) => asset.id === 'human-traveler');
const FPS = 30;
// Breathing is slow; a tenth of a second between keys loses nothing an eye
// could see and keeps an eight-second capture small.
const IDLE_FPS = 10;
// A jog's knee and ankle turn through a hundred degrees in a few frames; at
// thirty keys a second the slerp between two keys swept the swinging foot
// through the ground halfway between them. Sixty keeps every in-between pose
// close to a solved one.
const JOG_FPS = 60;
const BUDGET_BYTES = 300 * 1024;

// --- headless loading ----------------------------------------------------
// No WebGL and no image decoding here: textures are stubbed, which is all a
// retarget needs, since it reads bones and vertex positions and nothing else.
THREE.TextureLoader.prototype.load = () => new THREE.Texture();
const gltfLoader = new GLTFLoader();
gltfLoader.register(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new THREE.Texture() }));
const arrayBuffer = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const deg = (degrees) => degrees * Math.PI / 180;

async function loadDonor(file) {
  const bytes = await fs.readFile(path.join(sourceDir, file));
  const scene = new FBXLoader().parse(arrayBuffer(bytes), '');
  scene.updateMatrixWorld(true);
  const bones = new Map();
  scene.traverse((node) => { if (node.isBone && !bones.has(node.name)) bones.set(node.name, node); });
  const clip = scene.animations.find((candidate) => candidate.tracks.length);
  if (!clip || !bones.has('mixamorigHips')) throw new Error(`Not a Mixamo capture: ${file}`);
  return {
    file, scene, bones, clip, sha256: sha256(bytes),
    bind: new Map([...bones].map(([name, bone]) => [name, bone.getWorldQuaternion(new THREE.Quaternion())])),
    hip: bones.get('mixamorigHips').getWorldPosition(new THREE.Vector3()),
  };
}

const donors = { idle: await loadDonor('Idle.fbx'), walk: await loadDonor('Walking.fbx') };

// --- the target rig ------------------------------------------------------
const targetBytes = await fs.readFile(path.resolve(`public${TARGET.url}`));
if (sha256(targetBytes) !== TARGET.sha256) throw new Error('Traveler GLB does not match sceneHumanAssets.js');
const model = (await gltfLoader.parseAsync(arrayBuffer(targetBytes), '')).scene;
model.updateMatrixWorld(true);
const bones = [];
model.traverse((node) => { if (node.isBone) bones.push(node); });
const rest = new Map(bones.map((bone) => [bone, { q: bone.quaternion.clone(), p: bone.position.clone() }]));
function restore() {
  for (const [bone, pose] of rest) { bone.quaternion.copy(pose.q); bone.position.copy(pose.p); }
  model.updateMatrixWorld(true);
}
const bone = (name) => model.getObjectByName(`mixamorig${name}`);
const hips = bone('Hips');
const restHip = hips.getWorldPosition(new THREE.Vector3());

// A clip's pose at one instant, applied to the live skeleton. The caller
// restores the bind pose afterwards; poseFrame-based authoring reads it.
function withClip(clip, run) {
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).play();
  const result = run((time) => { mixer.setTime(time); model.updateMatrixWorld(true); });
  mixer.stopAllAction(); mixer.uncacheRoot(model); restore();
  return result;
}

// Put the A-pose character into an anatomical T reference before computing
// world-space offsets, as the Tabernacle and Elah retargets do — Mixamo's own
// bind is a T-pose, and copying local FBX rotations twists this MPFB rig.
restore();
const reference = buildPoseClip(THREE, model, 'retarget-reference', 1, () => ({
  left: { armAbduct: 90 }, right: { armAbduct: 90 }, fingerCurl: 0,
}));
const targetReference = withClip(reference, (at) => {
  at(0);
  return new Map(bones.map((b) => [b.name, b.getWorldQuaternion(new THREE.Quaternion())]));
});

// --- the staff hold ------------------------------------------------------
// The right forearm is carried forward a little above horizontal with the
// fist closed around the shaft. Those numbers are not taste: they were found
// by searching the solver's arm parameters for the pose in which the line of
// the knuckles — the line a shaft takes through a closed fist — stands
// vertical, which on this rig it does to within about a degree. A hanging
// arm cannot hold a vertical staff at all; its fist runs front to back.
const STAFF_ARM = { armFlex: 8, armAbduct: 8, foreArmFlex: 100, foreArmAbduct: 0, handTwist: 10 };
// Firm enough to enclose a 26-28 mm shaft, not a clenched fist.
const STAFF_CURL = 46;
const RELAXED_CURL = 18;
const staffFrame = (sway = 0, curl = STAFF_CURL) => ({
  left: { armFlex: -2, armAbduct: 5, foreArmFlex: 10 },
  right: { ...STAFF_ARM, armFlex: STAFF_ARM.armFlex + sway, foreArmFlex: STAFF_ARM.foreArmFlex + sway },
  fingerCurl: curl,
});
const RIGHT_ARM = /^mixamorigRight(Arm|ForeArm|Hand)$/;
const RIGHT_FINGERS = /^mixamorigRightHand(Thumb|Index|Middle|Ring|Pinky)\d$/;
const LEFT_FINGERS = /^mixamorigLeftHand(Thumb|Index|Middle|Ring|Pinky)\d$/;

// Local joint rotations for one pose, keyed by bone name. poseFrame reads
// the bind pose, so this always starts from it.
function poseRotations(frame) {
  restore();
  const clip = buildPoseClip(THREE, model, 'pose', 1, () => frame, { fps: 1 });
  return new Map(clip.tracks.filter((track) => track.name.endsWith('.quaternion'))
    .map((track) => [track.name.split('.')[0], new THREE.Quaternion().fromArray(track.values, 0)]));
}
const relaxedHands = poseRotations(staffFrame(0, RELAXED_CURL));

// --- skinned landmarks -----------------------------------------------------
const skinMeshes = [];
model.traverse((node) => { if (node.isSkinnedMesh && node.name.includes('_LOD0')) skinMeshes.push(node); });
const body = skinMeshes.find((mesh) => mesh.name === 'Skin_LOD0');
if (!body) throw new Error('Traveler has no Skin_LOD0 body mesh');
const bindPoint = new THREE.Vector3();
// Only a sole can be the lowest point of an upright clip, so grounding reads
// the body's own foot vertices and never a hem, a hand or anything carried.
const soles = { left: [], right: [] };
for (let i = 0; i < body.geometry.attributes.position.count; i++) {
  bindPoint.fromBufferAttribute(body.geometry.attributes.position, i).applyMatrix4(body.matrixWorld);
  if (bindPoint.y < 0.13) soles[bindPoint.x > 0 ? 'left' : 'right'].push(i);
}
const point = new THREE.Vector3();
function soleHeight(side) {
  let lowest = Infinity;
  for (const i of soles[side]) lowest = Math.min(lowest, body.getVertexPosition(i, point).applyMatrix4(body.matrixWorld).y);
  return lowest;
}
// The arch — midway between ankle and ball — is rigid with the foot, so while
// the foot is flat on the ground it is the point that must not slide.
function arch(side) {
  const ankle = bone(`${side}Foot`).getWorldPosition(new THREE.Vector3());
  return ankle.add(bone(`${side}ToeBase`).getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
}

// --- Mixamo retarget --------------------------------------------------------
function retarget(key, { fps, travel = false, sway = null }) {
  const donor = donors[key];
  const scale = restHip.y / donor.hip.y;
  const mixer = new THREE.AnimationMixer(donor.scene);
  mixer.clipAction(donor.clip).play();
  const frames = Math.round(donor.clip.duration * fps);
  const duration = frames / fps;
  const first = new THREE.Vector3(); const last = new THREE.Vector3();
  const donorHips = donor.bones.get('mixamorigHips');
  mixer.setTime(0); donor.scene.updateMatrixWorld(true); donorHips.getWorldPosition(first);
  mixer.setTime(donor.clip.duration - 1e-6); donor.scene.updateMatrixWorld(true); donorHips.getWorldPosition(last);
  const displacement = last.clone().sub(first);
  const metersPerCycle = Math.hypot(displacement.x, displacement.z) * scale;
  // The staff arm sways with the stride only a little: a walker's free arm
  // swings, a hand that is carrying something mostly rides along.
  const staffPoses = sway ? Array.from({ length: frames + 1 }, (_, frame) => poseRotations(staffFrame(sway(frame / frames)))) : null;
  const still = poseRotations(staffFrame(0));
  restore();
  const times = []; const rotations = new Map(bones.map((b) => [b, []])); const positions = [];
  for (let frame = 0; frame <= frames; frame++) {
    const t = Math.min(frame / fps, donor.clip.duration - 1e-6);
    times.push(frame / fps);
    mixer.setTime(t); donor.scene.updateMatrixWorld(true);
    const staff = staffPoses ? staffPoses[frame] : still;
    for (const target of bones) {
      const name = target.name; const source = donor.bones.get(name);
      const authored = RIGHT_ARM.test(name) || RIGHT_FINGERS.test(name) ? staff.get(name)
        : LEFT_FINGERS.test(name) ? relaxedHands.get(name) : null;
      if (authored) target.quaternion.copy(authored);
      else if (source) {
        const world = source.getWorldQuaternion(new THREE.Quaternion())
          .multiply(donor.bind.get(name).clone().invert()).multiply(targetReference.get(name));
        target.quaternion.copy(target.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)).normalize();
      }
      target.updateMatrixWorld(true);
    }
    const hip = donorHips.getWorldPosition(new THREE.Vector3()).sub(donor.hip);
    // Remove the distance travelled — the scene moves the body, not the
    // clip — while keeping the lateral weight shift and the bob.
    if (travel) {
      hip.x -= displacement.x * frame / frames + first.x - donor.hip.x;
      hip.z -= displacement.z * frame / frames + first.z - donor.hip.z;
    }
    hip.multiplyScalar(scale).add(restHip);
    hips.position.copy(hips.parent.worldToLocal(hip)); model.updateMatrixWorld(true);
    const floor = Math.min(soleHeight('left'), soleHeight('right'));
    hips.position.y -= floor; model.updateMatrixWorld(true);
    positions.push(...hips.position.toArray());
    for (const b of bones) rotations.get(b).push(...b.quaternion.toArray());
  }
  mixer.stopAllAction(); mixer.uncacheRoot(donor.scene); restore();
  const tracks = bones.map((b) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, rotations.get(b)));
  tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, positions));
  closeLoop(tracks);
  return { clip: new THREE.AnimationClip(key, duration, tracks), metersPerCycle, scale };
}

// Both captures are loops. Their last frame is replaced by their first so
// the seam is exact rather than a short interpolated return.
function closeLoop(tracks) {
  for (const track of tracks) {
    const size = track.getValueSize();
    const values = Array.from(track.values);
    values.splice(values.length - size, size, ...values.slice(0, size));
    track.values = new Float32Array(values);
  }
}

// --- the jog, authored ------------------------------------------------------
//
// Phase p runs 0..1 over one stride and starts at the LEFT heel strike; the
// right leg is the left half a cycle later. Angles follow sceneHumanClips'
// conventions: thighFlex/shinFlex are the absolute directions of thigh and
// shin from vertical, positive forward; ankleBend rides on the shin, positive
// lifting the toes.
//
// The stance is solved, not keyed. While a foot bears weight it is planted:
// in the body's frame it moves straight back at constant speed from where it
// lands to where it leaves, and a two-bone solve on the real thigh and shin
// lengths finds the hip and knee that put the ankle there. That is what lets
// the scene carry the body at constant speed without the foot sliding, and it
// is why the stride below is measured off the result rather than chosen. The
// swing is keyed — a smooth curve that leaves toe-off and arrives at touchdown
// with the stance's own angles and angular speeds, tucking the heel under the
// seat on the way through.
//
// What is not a matter of taste:
//   - each foot is down for 36% of the stride (a jog's duty factor), so twice
//     a stride nobody touches the ground — the flight phase that makes this a
//     jog and not a fast walk;
//   - the landing leg is nearly straight and the loaded one bends (~50° at the
//     knee in mid-stance, the spring in a runner's leg), so the hips are lowest
//     over the planted foot and highest in the air;
//   - the knee folds to ~100° in mid-swing; the thigh drives to ~35° ahead;
//   - the elbows hold ~85°, the free arm swings ~±30° against the legs, and
//     the trunk leans ~9° forward from the hips.
// The heel-first landing is a choice: a forefoot or midfoot strike would be
// just as period-plausible for someone in sandals.
const JOG = {
  duty: 0.36,
  seconds: 0.68, // ~176 steps a minute: a jog's cadence, not a sprint's
  // Ankle ahead of (+) or behind (-) the hip joint, metres.
  reach: { contact: 0.30, toeOff: -0.44 },
  // Hip joint above the ground, metres.
  hip: { contact: 0.85, mid: 0.815, toeOff: 0.845 },
  // Ankle above the ground: rocking on the heel, flat, up on the ball.
  ankle: { contact: 0.08, flat: 0.069, toeOff: 0.13 },
  // The foot against the ground, toes up positive.
  pitch: { contact: 10, toeOff: -32 },
  swing: { thighPeak: 35, thighPeakAt: 0.78, kneePeak: 100, kneePeakAt: 0.36, ankle: 6, ankleAt: 0.45 },
  lean: 9, elbow: 85, freeArm: 30, staffArm: 9, pelvisYaw: 5, sway: 0.012, fingerCurl: 34,
};
const FREE_ARM_SWING = JOG.freeArm;
const STAFF_ARM_SWING = JOG.staffArm;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hermite = (y0, m0, y1, m1, h, s) => {
  const s2 = s * s; const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * m1;
};
// Piecewise cubic through [phase, value, slope] knots (slope per unit phase).
function knotted(knots, p) {
  let i = 0; while (i < knots.length - 2 && knots[i + 1][0] <= p) i += 1;
  const [p0, y0, m0] = knots[i]; const [p1, y1, m1] = knots[i + 1];
  return hermite(y0, m0, y1, m1, p1 - p0, (p - p0) / (p1 - p0));
}

const legBones = {
  left: { upLeg: bone('LeftUpLeg'), leg: bone('LeftLeg'), foot: bone('LeftFoot'), toe: bone('LeftToeBase') },
  right: { upLeg: bone('RightUpLeg'), leg: bone('RightLeg'), foot: bone('RightFoot'), toe: bone('RightToeBase') },
};
const THIGH_LENGTH = legBones.left.leg.position.length();
const SHIN_LENGTH = legBones.left.foot.position.length();
const hipJointBind = legBones.left.upLeg.getWorldPosition(new THREE.Vector3());
const hipsBindQuaternion = hips.quaternion.clone();
// Where a hip joint is, given the pelvis offset and yaw poseFrame will apply.
function hipJoint(side, hipsX, hipsY, yawDegrees) {
  const q = hipsBindQuaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, deg(yawDegrees), 0)));
  return legBones[side].upLeg.position.clone().applyQuaternion(q).add(rest.get(hips).p).add(new THREE.Vector3(hipsX, hipsY, 0));
}
// Two-bone solve in the sagittal plane: the knee bends forward.
function solveLeg(reach, drop) {
  const d = THREE.MathUtils.clamp(Math.hypot(reach, drop), Math.abs(THIGH_LENGTH - SHIN_LENGTH) + 1e-4, THIGH_LENGTH + SHIN_LENGTH - 1e-4);
  const line = THREE.MathUtils.radToDeg(Math.atan2(reach, drop));
  const alpha = THREE.MathUtils.radToDeg(Math.acos((THIGH_LENGTH ** 2 + d * d - SHIN_LENGTH ** 2) / (2 * THIGH_LENGTH * d)));
  const beta = THREE.MathUtils.radToDeg(Math.acos((SHIN_LENGTH ** 2 + d * d - THIGH_LENGTH ** 2) / (2 * SHIN_LENGTH * d)));
  return { thighFlex: line + alpha, shinFlex: line - beta };
}
// The foot's pitch against the ground, from the live skeleton: zero when the
// sole is flat as it is in the bind pose.
const footBindPitch = (() => {
  const d = legBones.left.toe.getWorldPosition(new THREE.Vector3()).sub(legBones.left.foot.getWorldPosition(new THREE.Vector3()));
  return THREE.MathUtils.radToDeg(Math.atan2(d.y, d.z));
})();
// With the ankle unbent, a foot inherits the shin's pitch plus a constant the
// bind pose sets; measure that constant once rather than assume it.
const footPitchOffset = (() => {
  const clip = buildPoseClip(THREE, model, 'foot-probe', 1, () => ({ leftLeg: { thighFlex: 0, shinFlex: 0, ankleBend: 0 } }), { fps: 1 });
  return withClip(clip, (at) => {
    at(0);
    const d = legBones.left.toe.getWorldPosition(new THREE.Vector3()).sub(legBones.left.foot.getWorldPosition(new THREE.Vector3()));
    return THREE.MathUtils.radToDeg(Math.atan2(d.y, d.z)) - footBindPitch;
  });
})();

const pelvisYawAt = (p) => -JOG.pelvisYaw * Math.cos(2 * Math.PI * p);
const hipsXAt = (p) => JOG.sway * Math.sin(2 * Math.PI * (p + 0.06));
// Stance, s = 0 at touchdown to 1 at toe-off. Returns the leg angles and the
// hip-joint height the solve assumed.
function stance(side, p, s) {
  const dip = (JOG.hip.contact + JOG.hip.toeOff) / 2 - JOG.hip.mid;
  const height = lerp(JOG.hip.contact, JOG.hip.toeOff, s) - dip * Math.sin(Math.PI * s);
  const roll = smoothstep(0, 0.16, s); const push = smoothstep(0.55, 1, s);
  const pitch = JOG.pitch.contact * (1 - roll) + JOG.pitch.toeOff * push;
  const ankle = lerp(lerp(JOG.ankle.contact, JOG.ankle.flat, roll), JOG.ankle.toeOff, push);
  // Planted: straight back at constant speed relative to the body's centre,
  // so the pelvis turning over the stance leg does not slide the foot.
  const footZ = hipJointBind.z + lerp(JOG.reach.contact, JOG.reach.toeOff, s);
  const joint = hipJoint(side, hipsXAt(p), height - hipJointBind.y, pelvisYawAt(p));
  const { thighFlex, shinFlex } = solveLeg(footZ - joint.z, joint.y - ankle);
  return { thighFlex, shinFlex, ankleBend: pitch - shinFlex - footPitchOffset, height };
}
// Extra knee bend through the swing, as a function of how far through the
// swing the leg is (0 at toe-off, 1 at touchdown). The knot curves above are
// the gait's shape; this is the correction that keeps the swinging foot off
// the ground on THIS skeleton, solved against its real skinned soles in
// authorJog() rather than against an idealised two-bone leg. Shared by both
// legs so the gait stays symmetric.
const TUCK_BINS = 48;
const swingTuck = new Float64Array(TUCK_BINS + 1);
function tuckAt(s) {
  const x = Math.min(1, Math.max(0, s)) * TUCK_BINS;
  const i = Math.min(TUCK_BINS - 1, Math.floor(x));
  return swingTuck[i] + (swingTuck[i + 1] - swingTuck[i]) * (x - i);
}

function jogLeg(side, phase) {
  const offset = side === 'left' ? 0 : 0.5;
  const p = ((phase - offset) % 1 + 1) % 1; // this leg's own phase
  const at = (local) => stance(side, (local + offset) % 1, local / JOG.duty);
  if (p < JOG.duty) return at(p);
  // Swing: leave toe-off and arrive at touchdown with the stance's own angles
  // and angular speeds, so neither end has a kink.
  const e = 1e-4;
  const off = at(JOG.duty - e); const offBefore = at(JOG.duty - 2 * e);
  const on = at(0); const onAfter = at(e);
  const slope = (a, b, key) => (a[key] - b[key]) / e;
  const span = 1 - JOG.duty; const w = JOG.swing;
  const thighFlex = knotted([
    [JOG.duty, off.thighFlex, slope(off, offBefore, 'thighFlex')],
    [JOG.duty + w.thighPeakAt * span, w.thighPeak, 0],
    [1, on.thighFlex, slope(onAfter, on, 'thighFlex')],
  ], p);
  const kneeOf = (pose) => pose.thighFlex - pose.shinFlex;
  const tuck = tuckAt((p - JOG.duty) / span);
  const knee = Math.max(3, knotted([
    [JOG.duty, kneeOf(off), (kneeOf(off) - kneeOf(offBefore)) / e],
    [JOG.duty + w.kneePeakAt * span, w.kneePeak, 0],
    [1, kneeOf(on), (kneeOf(onAfter) - kneeOf(on)) / e],
  ], p)) + tuck;
  // The ankle is bent relative to the shin, so folding the knee further would
  // also tip the toes down — and give back much of the height it gained. The
  // same angle goes into the ankle, so the correction lifts the foot without
  // changing which way it points.
  const ankleBend = knotted([
    [JOG.duty, off.ankleBend, slope(off, offBefore, 'ankleBend')],
    [JOG.duty + w.ankleAt * span, w.ankle, 0],
    [1, on.ankleBend, slope(onAfter, on, 'ankleBend')],
  ], p) + tuck;
  return { thighFlex, shinFlex: thighFlex - knee, ankleBend, height: null };
}
function jogFrame(p) {
  const left = jogLeg('left', p);
  const right = jogLeg('right', p);
  // A free arm swings against its own leg: back as the left thigh drives
  // through late in its swing, forward as it pushes off.
  const leftArm = -FREE_ARM_SWING * Math.cos(2 * Math.PI * (p - 0.9));
  const staffSway = STAFF_ARM_SWING * Math.cos(2 * Math.PI * (p - 0.9));
  const pelvisYaw = pelvisYawAt(p);
  const height = left.height ?? right.height ?? hipJointBind.y;
  return {
    leftLeg: left,
    rightLeg: right,
    left: { armFlex: leftArm, armAbduct: 10, foreArmFlex: leftArm + JOG.elbow, foreArmAbduct: -12 },
    right: { ...STAFF_ARM, armFlex: STAFF_ARM.armFlex + staffSway, foreArmFlex: STAFF_ARM.foreArmFlex + staffSway },
    spineLean: JOG.lean,
    headPitch: -6,
    pelvisYaw,
    spineYaw: -0.8 * pelvisYaw,
    hipsX: hipsXAt(p),
    hipsY: height - hipJointBind.y,
    fingerCurl: JOG.fingerCurl,
  };
}

function buildJog() {
  restore();
  const frames = Math.round(JOG.seconds * JOG_FPS);
  const duration = frames / JOG_FPS;
  const baked = buildPoseClip(THREE, model, 'jog', duration, (t) => jogFrame(t / duration), { fps: JOG_FPS });
  const staff = buildPoseClip(THREE, model, 'jog-staff', duration,
    (t) => staffFrame(STAFF_ARM_SWING * Math.cos(2 * Math.PI * (t / duration - 0.9))), { fps: JOG_FPS });
  // The free hand is a loose jogging fist; the staff hand keeps its grip.
  const tracks = baked.tracks.map((track) => {
    const name = track.name.split('.')[0];
    return RIGHT_ARM.test(name) || RIGHT_FINGERS.test(name) ? staff.tracks.find((other) => other.name === track.name) : track;
  });
  const hipTrack = tracks.find((track) => track.name === `${hips.name}.position`);
  const clip = new THREE.AnimationClip('jog', duration, tracks);
  // Where each sole actually sits, frame by frame, with the solved legs.
  const sole = withClip(clip, (at) => Array.from(hipTrack.times, (time) => {
    at(time);
    return { left: soleHeight('left'), right: soleHeight('right') };
  }));
  const n = hipTrack.times.length - 1; // the last frame repeats the first
  const idx = (i) => ((i % n) + n) % n;
  const bearing = (i) => {
    const p = i / n;
    if (p % 1 < JOG.duty) return 'left';
    if (((p - 0.5) % 1 + 1) % 1 < JOG.duty) return 'right';
    return null;
  };
  // In stance the loaded sole is set exactly on the ground (the solve gets it
  // within a few millimetres; this takes out the rest). In flight the hips
  // carry on along a cubic that leaves toe-off and meets touchdown with the
  // stance curve's own height and vertical speed — a hop, not a teleport —
  // and are never allowed low enough to push either foot into the ground.
  const lift = Array.from({ length: n }, (_, i) => (bearing(i) ? -sole[i][bearing(i)] : NaN));
  for (let start = 0; start < n; start++) {
    if (Number.isNaN(lift[start]) || !Number.isNaN(lift[idx(start + 1)])) continue;
    let end = start + 1;
    while (Number.isNaN(lift[idx(end)])) end += 1;
    const values = Array.from(hipTrack.values);
    const y = (i) => values[idx(i) * 3 + 1] + lift[idx(i)];
    const span = end - start;
    const v0 = y(start) - y(start - 1); const v1 = y(end + 1) - y(end);
    for (let k = 1; k < span; k++) {
      const i = idx(start + k);
      const hop = hermite(y(start), v0, y(end), v1, span, k / span) - values[i * 3 + 1];
      lift[i] = Math.max(hop, -Math.min(sole[i].left, sole[i].right));
    }
  }
  const values = Array.from(hipTrack.values);
  for (let i = 0; i <= n; i++) values[i * 3 + 1] += lift[idx(i)];
  hipTrack.values = new Float32Array(values);
  return new THREE.AnimationClip('jog', duration, tracks);
}

// The swinging foot must clear the ground by this much everywhere except the
// last and first moments of the swing, where it is leaving or meeting it.
const SWING_CLEARANCE = 0.012;

// Builds the jog, then measures where each swinging sole actually goes on the
// skinned mesh and folds the knee a little more wherever it would have dipped
// into the ground — repeated until nothing does. The correction is smoothed
// and tapered to nothing at toe-off and touchdown, so it changes the height of
// the swing and never the contacts the stance was solved for.
function authorJog() {
  swingTuck.fill(0);
  let clip = null;
  for (let round = 0; round < 40; round += 1) {
    clip = buildJog();
    // Sampled between the keys as well as on them, since the in-betweens are
    // where an interpolated swing dips.
    const keyTimes = clip.tracks.find((track) => track.name === `${hips.name}.position`).times;
    const times = Array.from({ length: (keyTimes.length - 1) * 3 + 1 }, (_, i) => (clip.duration * i) / ((keyTimes.length - 1) * 3));
    const soles = withClip(clip, (at) => times.map((time) => {
      at(time);
      return { left: soleHeight('left'), right: soleHeight('right') };
    }));
    const needed = new Float64Array(TUCK_BINS + 1);
    let worst = 0;
    soles.forEach((row, i) => {
      const phase = i / (times.length - 1);
      for (const side of ['left', 'right']) {
        const local = ((phase - (side === 'left' ? 0 : 0.5)) % 1 + 1) % 1;
        if (local < JOG.duty) continue;
        const s = (local - JOG.duty) / (1 - JOG.duty);
        if (s < 0.04 || s > 0.98) continue;
        // Full clearance through the middle of the swing, tapering to "just
        // not below the ground" as the foot leaves it and comes back to it.
        const wanted = SWING_CLEARANCE * smoothstep(0.04, 0.2, s) * (1 - smoothstep(0.8, 0.98, s));
        const deficit = wanted - row[side];
        if (deficit <= 0) continue;
        worst = Math.max(worst, deficit);
        const bin = Math.round(s * TUCK_BINS);
        needed[bin] = Math.max(needed[bin], deficit);
      }
    });
    if (worst < 0.002) break;
    // About five millimetres of foot height per degree of knee at mid-swing;
    // over-correct slightly so the loop converges from below in a few rounds.
    for (let b = 0; b <= TUCK_BINS; b += 1) swingTuck[b] += needed[b] * 260;
    for (let pass = 0; pass < 3; pass += 1) {
      const copy = Float64Array.from(swingTuck);
      for (let b = 1; b < TUCK_BINS; b += 1) swingTuck[b] = Math.max(copy[b], (copy[b - 1] + 2 * copy[b] + copy[b + 1]) / 4);
    }
    for (let b = 0; b <= TUCK_BINS; b += 1) swingTuck[b] *= Math.sin(Math.PI * b / TUCK_BINS) ** 0.2;
  }
  return clip;
}

// --- measurement ------------------------------------------------------------
// Samples a finished clip the way the runtime will play it and reads back the
// things the runtime needs and the things worth reporting.
//
// The heel is the rearmost sole vertex of each foot. A heel strike is the
// moment it stops: in the world, with the body carried forward at the clip's
// own stride, a foot that was swinging comes to rest on the ground.
const heels = Object.fromEntries(['left', 'right'].map((side) => {
  let best = null; let rearmost = Infinity;
  for (const i of soles[side]) {
    bindPoint.fromBufferAttribute(body.geometry.attributes.position, i).applyMatrix4(body.matrixWorld);
    if (bindPoint.y < 0.02 && bindPoint.z < rearmost) { rearmost = bindPoint.z; best = i; }
  }
  return [side, best];
}));
const heelAt = (side) => body.getVertexPosition(heels[side], new THREE.Vector3()).applyMatrix4(body.matrixWorld);
function measure(clip, { metersPerCycle = null, samples = 240 } = {}) {
  const rows = withClip(clip, (at) => Array.from({ length: samples }, (_, i) => {
    at(clip.duration * i / samples);
    return {
      p: i / samples, left: soleHeight('left'), right: soleHeight('right'),
      archLeft: arch('Left'), archRight: arch('Right'), heelLeft: heelAt('left'), heelRight: heelAt('right'),
      hipY: hips.getWorldPosition(new THREE.Vector3()).y,
    };
  }));
  const touch = 0.004;
  const lowestSole = Math.min(...rows.map((row) => Math.min(row.left, row.right)));
  const hipYs = rows.map((row) => row.hipY);
  const hipBob = Math.max(...hipYs) - Math.min(...hipYs);
  const key = (side, name) => `${name}${side === 'left' ? 'Left' : 'Right'}`;
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  // Underfoot speed: over the longest run of samples where a foot is loaded,
  // how fast its arch moves back under the body, in metres per stride.
  const loadedRun = (side) => {
    const loaded = rows.map((row) => row[side] < 0.006);
    if (loaded.every(Boolean) || !loaded.some(Boolean)) return null;
    let start = loaded.findIndex((value, i) => value && !loaded[(i - 1 + samples) % samples]);
    let best = null;
    for (let tries = 0; tries < samples && start >= 0; tries++) {
      let length = 0; while (loaded[(start + length) % samples] && length < samples) length += 1;
      if (!best || length > best.length) best = { start, length };
      const next = loaded.findIndex((value, i) => i > start && value && !loaded[(i - 1 + samples) % samples]);
      if (next < 0) break;
      start = next;
    }
    return best;
  };
  const underfootOf = (side) => {
    const run = loadedRun(side);
    if (!run) return null;
    const picked = [];
    for (let k = Math.floor(run.length * 0.2); k < Math.ceil(run.length * 0.8); k++) {
      const row = rows[(run.start + k) % samples];
      picked.push({ p: run.start / samples + k / samples, z: row[key(side, 'arch')].z });
    }
    const mp = mean(picked.map((r) => r.p)); const mz = mean(picked.map((r) => r.z));
    return -picked.reduce((a, r) => a + (r.p - mp) * (r.z - mz), 0) / picked.reduce((a, r) => a + (r.p - mp) ** 2, 0);
  };
  const perFoot = ['left', 'right'].map(underfootOf);
  if (perFoot.some((value) => value === null)) return { footfalls: [], lowestSole, hipBob };
  const underfoot = mean(perFoot);
  const cycle = metersPerCycle ?? underfoot;
  const strikes = {};
  let skate = 0;
  for (const side of ['left', 'right']) {
    const world = rows.map((row) => row[key(side, 'heel')].z + cycle * row.p);
    const speed = rows.map((_, i) => {
      const a = world[(i - 1 + samples) % samples] - (i === 0 ? cycle : 0);
      const b = world[(i + 1) % samples] + (i === samples - 1 ? cycle : 0);
      return (b - a) * samples / 2;
    });
    const resting = (i) => speed[i] < 0.2 * cycle && rows[i][side] < 0.02;
    for (let i = 0; i < samples; i++) {
      const prev = (i - 1 + samples) % samples;
      if (resting(i) && !resting(prev)) {
        const f = speed[prev] > speed[i] ? (speed[prev] - 0.2 * cycle) / (speed[prev] - speed[i]) : 1;
        strikes[side] = ((i - 1 + Math.min(1, Math.max(0, f))) / samples + 1) % 1;
        break;
      }
    }
    // Skate: how far the planted arch drifts in the world over the middle of
    // its loaded run, with the body carried at the clip's stride.
    const run = loadedRun(side);
    const drift = [];
    for (let k = Math.floor(run.length * 0.15); k < Math.ceil(run.length * 0.85); k++) {
      const i = (run.start + k) % samples;
      drift.push(rows[i][key(side, 'arch')].z + cycle * (run.start + k) / samples);
    }
    skate = Math.max(skate, Math.max(...drift) - Math.min(...drift));
  }
  const airborne = rows.filter((row) => row.left > touch && row.right > touch).length / samples;
  const swingClearance = Math.min(...['left', 'right'].map((side) => Math.max(...rows.map((row) => row[side]))));
  return {
    footfalls: [strikes.left, strikes.right],
    underfootMetersPerCycle: underfoot,
    skate, airborne, hipBob, swingClearance, lowestSole,
  };
}

// The staff grip, measured in the idle clip's first frame: the axis of the
// shaft is the line through the fist that is vertical in that pose (which is
// within a degree or two of the line of the knuckles, by construction of the
// arm pose above), and its centre is the point in the fist farthest from every
// finger and palm vertex — the largest shaft the closed hand actually holds.
function measureGrip(clip) {
  return withClip(clip, (at) => {
    at(0);
    const hand = bone('RightHand');
    const handBones = new Set(body.skeleton.bones
      .map((b, i) => (/^mixamorigRightHand/.test(b.name) ? i : -1)).filter((i) => i >= 0));
    const skinIndex = body.geometry.attributes.skinIndex; const skinWeight = body.geometry.attributes.skinWeight;
    const hull = [];
    for (let i = 0; i < skinIndex.count; i++) {
      if (skinWeight.getX(i) < 0.5 || !handBones.has(skinIndex.getX(i))) continue;
      hull.push(body.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(body.matrixWorld));
    }
    const knuckle = bone('RightHandIndex1').getWorldPosition(new THREE.Vector3());
    const pinky = bone('RightHandPinky1').getWorldPosition(new THREE.Vector3());
    const fist = knuckle.clone().sub(pinky).normalize(); // up the shaft
    const up = new THREE.Vector3(0, 1, 0);
    const tilt = THREE.MathUtils.radToDeg(fist.angleTo(up));
    const middle = bone('RightHandMiddle1').getWorldPosition(new THREE.Vector3())
      .add(bone('RightHandMiddle2').getWorldPosition(new THREE.Vector3()))
      .add(bone('RightHandMiddle3').getWorldPosition(new THREE.Vector3())).multiplyScalar(1 / 3);
    const u = new THREE.Vector3(1, 0, 0); const v = new THREE.Vector3(0, 0, 1);
    let best = { clearance: -1, centre: middle.clone() };
    for (let a = -0.04; a <= 0.04; a += 0.0015) {
      for (let b = -0.04; b <= 0.04; b += 0.0015) {
        const centre = middle.clone().addScaledVector(u, a).addScaledVector(v, b);
        let clearance = Infinity;
        for (const vertex of hull) {
          const rel = vertex.clone().sub(centre);
          if (Math.abs(rel.y) > 0.045) continue;
          clearance = Math.min(clearance, Math.hypot(rel.x, rel.z));
        }
        if (clearance > best.clearance) best = { clearance, centre };
      }
    }
    hand.updateMatrixWorld(true);
    const inverse = hand.matrixWorld.clone().invert();
    const local = best.centre.clone().applyMatrix4(inverse);
    const axis = up.clone().transformDirection(inverse);
    return {
      bone: 'mixamorigRightHand',
      position: local.toArray(),
      axis: axis.toArray(),
      radius: Math.min(0.015, best.clearance - 0.001),
      heightAboveGround: best.centre.y,
      fistTiltDegrees: tilt,
    };
  });
}

// --- compaction -------------------------------------------------------------
// A track that never moves is dropped when it holds the bind pose (the mixer
// already restores exactly that for any bone a clip leaves alone), otherwise
// kept as a single key. Moving tracks lose every key a straight line (a slerp,
// for rotations) could put back within a tenth of a degree or half a
// millimetre, then are rounded to five decimals.
const ROT_TOLERANCE = 0.0009; // quaternion component, ~0.1°
const POS_TOLERANCE = 0.0005;
function compact(clip) {
  const kept = [];
  for (const track of clip.tracks) {
    const size = track.getValueSize();
    const isRotation = size === 4;
    const tolerance = isRotation ? ROT_TOLERANCE : POS_TOLERANCE;
    const values = Array.from(track.values); const times = Array.from(track.times);
    const count = times.length;
    const key = (i) => values.slice(i * size, i * size + size);
    const constant = Array.from({ length: count }, (_, i) => i).every((i) => key(i).every((value, c) => Math.abs(value - values[c]) < tolerance));
    const name = track.name.split('.')[0];
    const target = model.getObjectByName(name);
    if (constant) {
      const bind = isRotation ? target.quaternion.toArray() : target.position.toArray();
      if (key(0).every((value, c) => Math.abs(value - bind[c]) < tolerance)) continue;
      kept.push({ track, times: [0], values: key(0) });
      continue;
    }
    // Ramer-Douglas-Peucker on the key sequence, first and last always kept —
    // except down the legs. Each bone's error is within tolerance on its own,
    // but hip, thigh, shin and foot errors add up at the sole, and in the jog
    // that sum put the swinging foot five centimetres into the ground. The legs
    // are a dozen tracks; keeping every key costs a few kilobytes.
    const keep = new Array(count).fill(/(Hips|UpLeg|Leg|Foot|ToeBase)$/.test(name)); keep[0] = true; keep[count - 1] = true;
    const q0 = new THREE.Quaternion(); const q1 = new THREE.Quaternion(); const qi = new THREE.Quaternion();
    const error = (a, b, i) => {
      const s = (times[i] - times[a]) / (times[b] - times[a]);
      if (isRotation) {
        q0.fromArray(values, a * size); q1.fromArray(values, b * size); qi.fromArray(values, i * size);
        const q = q0.clone().slerp(q1, s);
        if (q.dot(qi) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        return Math.max(Math.abs(q.x - qi.x), Math.abs(q.y - qi.y), Math.abs(q.z - qi.z), Math.abs(q.w - qi.w));
      }
      let worst = 0;
      for (let c = 0; c < size; c++) worst = Math.max(worst, Math.abs(values[a * size + c] + (values[b * size + c] - values[a * size + c]) * s - values[i * size + c]));
      return worst;
    };
    const split = (a, b) => {
      let worst = 0; let at = -1;
      for (let i = a + 1; i < b; i++) { const e = error(a, b, i); if (e > worst) { worst = e; at = i; } }
      if (at >= 0 && worst > tolerance) { keep[at] = true; split(a, at); split(at, b); }
    };
    split(0, count - 1);
    const keptTimes = []; const keptValues = [];
    for (let i = 0; i < count; i++) if (keep[i]) { keptTimes.push(times[i]); keptValues.push(...key(i)); }
    kept.push({ track, times: keptTimes, values: keptValues });
  }
  const round = (value, places) => +value.toFixed(places);
  return {
    name: clip.name,
    duration: round(clip.duration, 5),
    blendMode: THREE.NormalAnimationBlendMode,
    tracks: kept.map(({ track, times, values }) => ({
      name: track.name,
      type: track.ValueTypeName,
      times: times.map((t) => round(t, 4)),
      values: values.map((v) => round(v, 5)),
    })),
  };
}

// --- build ------------------------------------------------------------------
const idle = retarget('idle', { fps: IDLE_FPS });
// First pass finds which way round the capture's stride runs, so the staff
// arm can swing forward with the opposite (left) leg as a walker's arm does.
const provisional = measure(retarget('walk', { fps: FPS, travel: true }).clip);
const walkStrike = provisional.footfalls[0];
const walk = retarget('walk', {
  fps: FPS, travel: true,
  sway: (p) => 5 * Math.cos(2 * Math.PI * (p - walkStrike)),
});
const jogClip = authorJog();

const clips = { idle: compact(idle.clip), walk: compact(walk.clip), jog: compact(jogClip) };
// Everything is measured again from what will actually ship: the compacted,
// rounded clips, parsed back exactly as the runtime parses them.
const shipped = Object.fromEntries(Object.entries(clips).map(([key, json]) => [key, THREE.AnimationClip.parse(json)]));
const walkMeasured = measure(shipped.walk, { metersPerCycle: walk.metersPerCycle });
const jogMeasured = measure(shipped.jog);
const idleMeasured = measure(shipped.idle, { metersPerCycle: 0 });
console.log(JSON.stringify({ walkMeasured, jogMeasured, idleMeasured }));
const grip = measureGrip(shipped.idle);
const round = (value, places = 5) => +value.toFixed(places);

const payload = {
  rig: RIG,
  target: path.basename(TARGET.url),
  targetSha256: TARGET.sha256,
  generator: 'scripts/humans/retarget_player_mixamo.mjs',
  grip: {
    bone: grip.bone,
    position: grip.position.map((v) => round(v)),
    axis: grip.axis.map((v) => round(v)),
    radius: round(grip.radius, 4),
    note: 'Staff shaft through the closed right fist, in the RightHand bone frame; measured on the skinned hand in the idle pose.',
  },
  clips: {
    idle: {
      clip: clips.idle,
      source: 'Adobe Mixamo', title: 'Idle', sourceSha256: donors.idle.sha256,
      sourceDuration: round(donors.idle.clip.duration), fps: IDLE_FPS,
      adaptation: 'Target proportions, sole grounding, relaxed left hand; right arm replaced by an authored staff hold',
    },
    walk: {
      clip: clips.walk,
      // The planted foot's own backward speed under the body, not the donor's
      // root travel: the runtime carries the body at a steady speed and drives
      // the clip from distance, and the foot stays put only when that distance
      // is measured the way the foot actually moves on this skeleton.
      metersPerCycle: round(walkMeasured.underfootMetersPerCycle, 4),
      footfalls: walkMeasured.footfalls.map((p) => round(p, 4)),
      source: 'Adobe Mixamo', title: 'Walking', sourceSha256: donors.walk.sha256,
      sourceDuration: round(donors.walk.clip.duration), fps: FPS,
      adaptation: 'Travel removed from the hips, sole grounding, relaxed left hand; right arm replaced by an authored staff hold that sways with the stride',
      measured: {
        metersPerCycleFrom: 'backward speed of the planted arch under the body',
        donorRootMetersPerCycle: round(walk.metersPerCycle, 4),
        skateMeters: round(walkMeasured.skate, 4),
        hipBobMeters: round(walkMeasured.hipBob, 4),
      },
    },
    jog: {
      clip: clips.jog,
      metersPerCycle: round(jogMeasured.underfootMetersPerCycle, 4),
      // Symmetric by construction (the right leg is the left half a cycle
      // later), so the second strike is the first plus a half. The detector
      // fires a little early on the right because that foot decelerates close
      // over the ground before touching it; half a cycle is the truth.
      footfalls: [round(jogMeasured.footfalls[0], 4), round((jogMeasured.footfalls[0] + 0.5) % 1, 4)],
      source: 'Miqra Kodesh authored',
      description: 'Procedural jog for the traveler rig: 36% duty factor with two flight phases, knee ~40° loaded / ~100° in swing (folded further where needed to clear the ground on this skeleton), elbows ~85°, free arm ±30°, trunk lean ~9°; staff arm steadied',
      nominalSeconds: JOG.seconds, fps: JOG_FPS,
      measured: {
        metersPerCycleFrom: 'backward speed of the flat, loaded foot under the body',
        skateMeters: round(jogMeasured.skate, 4),
        airborneFraction: round(jogMeasured.airborne, 4),
        hipBobMeters: round(jogMeasured.hipBob, 4),
        swingClearanceMeters: round(jogMeasured.swingClearance, 4),
      },
    },
  },
};
const text = JSON.stringify(payload);
if (text.length > BUDGET_BYTES) throw new Error(`playerAvatarClips.json is ${text.length} bytes, over the ${BUDGET_BYTES} byte budget`);
await fs.writeFile(output, text);

const report = (name, m, extra = '') => console.log(`${name}: footfalls ${m.footfalls.map((p) => p?.toFixed(3)).join('/')}`
  + ` underfoot ${m.underfootMetersPerCycle.toFixed(3)} m/cycle, skate ${(m.skate * 100).toFixed(1)} cm,`
  + ` airborne ${(m.airborne * 100).toFixed(1)}%, hip bob ${(m.hipBob * 100).toFixed(1)} cm,`
  + ` lowest sole ${(m.lowestSole * 1000).toFixed(1)} mm, swing clearance ${(m.swingClearance * 100).toFixed(1)} cm${extra}`);
console.log(`idle: ${shipped.idle.duration.toFixed(2)}s, lowest sole ${(idleMeasured.lowestSole * 1000).toFixed(1)} mm`);
report('walk', walkMeasured, `; donor root ${walk.metersPerCycle.toFixed(3)} m/cycle`);
report('jog', jogMeasured);
console.log(`grip: fist tilt ${grip.fistTiltDegrees.toFixed(1)}°, shaft radius ${(grip.radius * 1000).toFixed(1)} mm, ${grip.heightAboveGround.toFixed(3)} m up`);
console.log(`wrote ${path.relative(process.cwd(), output)} (${(text.length / 1024).toFixed(1)} KB)`);
