// Captured human motion, from Adobe Mixamo, on any of the scenes' characters.
//
// scripts/humans/build_mixamo_library.mjs bakes each Mixamo clip into a
// rig-independent form: per body bone and per frame, the world rotation that
// takes the bone from Mixamo's T-pose to where the capture has it, plus the
// hips' travel as a fraction of hip height. This module fits that onto a
// character: the character is put in its own T-pose once (arms out, from the
// pose solver in sceneHumanClips.js), each captured rotation is applied to it,
// and the result is read back as ordinary local-rotation keyframes — the same
// arithmetic scripts/humans/retarget_tabernacle_mixamo.mjs does offline. So a
// kneeling prayer captured once kneels any body in the app.
//
// Then the feet: a character of different proportions doing a captured motion
// floats or sinks, so every frame is grounded — the lowest of the joints that
// can bear weight (toes, heels, knees, the seat, the back, the hands) is set
// down on the floor, each at its own thickness. That one rule stands a walker
// on its soles, a kneeler on his knees, a sleeper on his back.
//
// Fingers are not captured (see the build script); each clip takes a relaxed
// curl from the finger solver instead, or whatever curl the caller asks for.
//
// three.js is passed in, so the module stays importable in jsdom.

import { buildPoseClip } from './sceneHumanClips.js';

export const MOTION_URL = '/assets/scenes/shared/humans/mixamo-motion.json';

const decodeBase64 = (text) => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

// The shipped JSON, unpacked into typed arrays on first use of each clip.
export function decodeMotionLibrary(json) {
  const clips = new Map();
  for (const [key, clip] of Object.entries(json.clips || {})) {
    let decoded = null;
    clips.set(key, {
      key,
      title: clip.title,
      description: clip.description,
      frames: clip.frames,
      duration: clip.duration,
      stride: clip.stride || 0,
      get data() {
        if (!decoded) {
          const rotations = new Int16Array(decodeBase64(clip.rotations).buffer);
          const hips = new Int16Array(decodeBase64(clip.hips).buffer);
          decoded = {
            rotations: Float32Array.from(rotations, (v) => v / 32767),
            hips: Float32Array.from(hips, (v) => v / 8192),
          };
        }
        return decoded;
      },
    });
  }
  return { fps: json.fps, bones: json.bones, clips };
}

let loading = null;
// Fetched once per session, and only by a scene that has someone to move.
export function loadMotionLibrary({ url = MOTION_URL, fetcher = globalThis.fetch } = {}) {
  if (!loading) {
    loading = fetcher(url)
      .then((response) => {
        if (!response.ok) throw new Error(`motion library ${response.status}`);
        return response.json();
      })
      .then(decodeMotionLibrary)
      .catch((error) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

// How far above the floor each weight-bearing joint sits when it is the thing
// touching it. The feet are measured off each character's own rest pose; the
// rest are anatomical.
const CONTACTS = {
  LeftToeBase: null, RightToeBase: null, LeftFoot: null, RightFoot: null,
  LeftLeg: 0.06, RightLeg: 0.06, Hips: 0.1, Spine1: 0.12, Head: 0.1, LeftHand: 0.03, RightHand: 0.03,
};

const rigs = new WeakMap();
// Everything about a character the retarget needs, measured once.
function rigOf(THREE, root, boneNames) {
  if (rigs.has(root)) return rigs.get(root);
  root.updateMatrixWorld(true);
  const bones = boneNames.map((name) => root.getObjectByName(`mixamorig${name}`) || null);
  const all = [];
  root.traverse((node) => { if (node.isBone) all.push(node); });
  const rest = new Map(all.map((bone) => [bone, { q: bone.quaternion.clone(), p: bone.position.clone() }]));
  const restore = () => {
    for (const [bone, pose] of rest) {
      bone.quaternion.copy(pose.q);
      bone.position.copy(pose.p);
    }
    root.updateMatrixWorld(true);
  };

  const hips = bones[boneNames.indexOf('Hips')];
  const restHip = hips.getWorldPosition(new THREE.Vector3());
  const feet = ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot']
    .map((name) => root.getObjectByName(`mixamorig${name}`))
    .filter(Boolean);
  const sole = Math.min(...feet.map((bone) => bone.getWorldPosition(new THREE.Vector3()).y));
  const contacts = Object.entries(CONTACTS)
    .map(([name, thickness]) => {
      const bone = root.getObjectByName(`mixamorig${name}`);
      if (!bone) return null;
      // A foot's own height above the ground at rest is its thickness.
      const measured = thickness ?? Math.max(0.01, bone.getWorldPosition(new THREE.Vector3()).y);
      return { bone, thickness: measured };
    })
    .filter(Boolean);

  // The character's T-pose, which is what Mixamo's rotations are relative to.
  const reference = buildPoseClip(THREE, root, 'mixamo-t-pose', 1, () => ({
    left: { armAbduct: 90 }, right: { armAbduct: 90 }, fingerCurl: 0,
  }));
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(reference).play();
  mixer.setTime(0);
  root.updateMatrixWorld(true);
  const tPose = bones.map((bone) => (bone ? bone.getWorldQuaternion(new THREE.Quaternion()) : null));
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  restore();

  const hipsParentInverse = hips.parent.matrixWorld.clone().invert();

  const rig = {
    bones, restore, restHip, hipHeight: restHip.y - sole, contacts, tPose, hipsParentInverse, fingers: new Map(), fitted: new Map(),
  };
  rigs.set(root, rig);
  return rig;
}

// Constant finger tracks for a given curl, from the finger solver.
function fingerTracks(THREE, root, rig, curl) {
  if (!rig.fingers.has(curl)) {
    const clip = buildPoseClip(THREE, root, `fingers-${curl}`, 1, () => ({ fingerCurl: curl }));
    rig.fingers.set(curl, (clip?.tracks || []).filter((track) => /Hand(Thumb|Index|Middle|Ring|Pinky)\d/.test(track.name)));
    rig.restore();
  }
  return rig.fingers.get(curl).map((track) => track.clone());
}

// A captured clip as an AnimationClip for this character. `root` is the
// character's shared scene (the asset, at the origin, in its rest pose); the
// clip plays on any clone of it, so it is fitted once per character and
// shared by every crowd, actor and cast that plays it. Returns null for a
// clip the library lacks.
export function retargetMotion(THREE, root, library, key, {
  fingerCurl = 18, name = `mixamo-${key}`, seam = 0.3,
} = {}) {
  const clip = library?.clips.get(key);
  if (!clip) return null;
  const rig = rigOf(THREE, root, library.bones);
  const cacheKey = `${key}|${fingerCurl}|${seam}|${name}`;
  if (rig.fitted.get(cacheKey)?.library === library) return rig.fitted.get(cacheKey).result;
  const result = fitMotion(THREE, root, rig, library, clip, { fingerCurl, name, seam });
  rig.fitted.set(cacheKey, { library, result });
  return result;
}

function fitMotion(THREE, root, rig, library, clip, { fingerCurl, name, seam }) {
  const { rotations, hips: hipOffsets } = clip.data;
  const count = library.bones.length;
  const { fps } = library;
  const frames = clip.frames;
  const times = new Float32Array(frames);
  const quaternions = library.bones.map(() => new Float32Array(frames * 4));
  const positions = new Float32Array(frames * 3);
  const hipsIndex = library.bones.indexOf('Hips');
  const hips = rig.bones[hipsIndex];

  const captured = new THREE.Quaternion();
  const world = new THREE.Quaternion();
  const local = new THREE.Quaternion();
  const parent = new THREE.Quaternion();
  const hip = new THREE.Vector3();
  const joint = new THREE.Vector3();
  for (let f = 0; f < frames; f += 1) {
    times[f] = f / fps;
    for (let b = 0; b < count; b += 1) {
      const bone = rig.bones[b];
      if (!bone) continue;
      const at = (f * count + b) * 4;
      captured.set(rotations[at], rotations[at + 1], rotations[at + 2], rotations[at + 3]).normalize();
      world.copy(captured).multiply(rig.tPose[b]);
      // Read off the live hierarchy, whose ancestors this frame are already
      // set (parents come first), so any bone between two carried ones — a
      // twist bone some rigs have — is accounted for rather than assumed away.
      bone.parent.getWorldQuaternion(parent);
      local.copy(parent).invert().multiply(world).normalize();
      bone.quaternion.copy(local);
      local.toArray(quaternions[b], f * 4);
    }
    hip.set(hipOffsets[f * 3], hipOffsets[f * 3 + 1], hipOffsets[f * 3 + 2])
      .multiplyScalar(rig.hipHeight).add(rig.restHip);
    hips.position.copy(hip).applyMatrix4(rig.hipsParentInverse);
    hips.updateMatrixWorld(true);
    // Set the lowest weight-bearing joint down on the floor.
    let lift = Infinity;
    for (const { bone, thickness } of rig.contacts) {
      lift = Math.min(lift, bone.getWorldPosition(joint).y - thickness);
    }
    hip.y -= lift;
    hips.position.copy(hip).applyMatrix4(rig.hipsParentInverse);
    hips.position.toArray(positions, f * 3);
  }
  rig.restore();

  // A loop that does not end where it began is closed with a short return to
  // its first frame, rather than a jump.
  let duration = (frames - 1) / fps;
  const closes = (values, size) => {
    let gap = 0;
    for (let i = 0; i < size; i += 1) gap = Math.max(gap, Math.abs(values[i] - values[(frames - 1) * size + i]));
    return gap;
  };
  const open = seam > 0 && (closes(positions, 3) > 0.01 || quaternions.some((values) => closes(values, 4) > 0.03));
  const withSeam = (values, size) => {
    if (!open) return values;
    const out = new Float32Array(values.length + size);
    out.set(values);
    out.set(values.subarray(0, size), values.length);
    return out;
  };
  const trackTimes = open ? Float32Array.from([...times, duration + seam]) : times;
  if (open) duration += seam;

  const tracks = [];
  library.bones.forEach((boneName, b) => {
    const bone = rig.bones[b];
    if (!bone) return;
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, trackTimes, withSeam(quaternions[b], 4)));
  });
  tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, trackTimes, withSeam(positions, 3)));
  tracks.push(...fingerTracks(THREE, root, rig, fingerCurl).map((track) => {
    // Read the stride before the times change: it is derived from them.
    const size = track.getValueSize();
    const first = Array.from(track.values.subarray(0, size));
    track.times = Float32Array.from([0, duration]);
    track.values = Float32Array.from([...first, ...first]);
    return track;
  }));
  const result = new THREE.AnimationClip(name, duration, tracks);
  result.userData = {
    source: 'Adobe Mixamo', title: clip.title, description: clip.description,
    ...(clip.stride ? { metersPerCycle: clip.stride * rig.hipHeight } : {}),
  };
  return result;
}

// Which captured clip a person in a crowd plays for what they are doing, so a
// square of people standing about is not everyone breathing the same breath.
// Varied by person, deterministically; `null` keeps the rig's own baked clip,
// which some people should still be doing. Walkers keep their tuned walk.
export const CROWD_MOTIONS = {
  standing: ['breathing-idle', 'weight-shift', null, 'look-around', 'breathing-idle', 'thinking'],
  attending: ['breathing-idle', 'nod-yes', null, 'thinking', 'weight-shift'],
  talking: ['talk-ask', 'talk-chat', 'talk-ask', 'talk-chat'],
  praying: ['pray-sway', 'pray-buckled', 'pray-sway'],
  bowing: ['pray-buckled'],
  carrying: ['carry-box'],
  kneeling: ['kneel-idle', 'kneel-pray'],
};

// Gives a crowd figure its captured clip, unless it already has one or is
// going somewhere. Returns the figure.
export function assignCrowdMotion(figure, index) {
  if (!figure || figure.motion !== undefined || figure.route) return figure;
  const options = CROWD_MOTIONS[figure.activity];
  if (options) figure.motion = options[index % options.length];
  return figure;
}
