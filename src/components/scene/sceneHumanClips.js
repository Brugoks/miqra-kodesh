// Procedural gait and pose authoring, built once per loaded character model
// and played through the ordinary AnimationMixer exactly like a baked studio
// clip would be.
//
// The baked clips (scripts/humans/build_characters.py) cannot be fixed
// without Blender, and two of them are unusable regardless of authoring tool:
// `walk` implies a 1.15m stride but the ankle only travels 0.31m over it —
// half of every metre walked was the feet sliding across the ground, because
// nothing synchronized the animated stride to the distance the skeleton is
// actually told to cover — and `idle` moves the arms by 0.2 degrees over its
// whole 4-second loop, which is a photograph, not a person standing still.
// The forearm defect in every clip (50-70 degrees off vertical, the sleepwalk
// pose in the screenshot the plan started from) has one specific cause:
// `set_world_rotation()` in that script poses each bone in WORLD axes with no
// regard for what its parent is doing, so the forearm is aimed independently
// of the elbow instead of hinging from it. See the plan's §1.4-1.6 for the
// measurements this module exists to fix.
//
// Every joint here is authored as an ABSOLUTE angle from vertical (for a limb)
// or a small delta on top of the bind pose (for the spine/head, where the
// motion is too small for this to matter) — never a delta relative to
// whatever the character's own bind pose happened to be, which is exactly
// what the baked clips got wrong. The three shipped characters were
// auto-rigged from three different body shapes, not posed from one canonical
// template: the artisan's hips sit 9 degrees off true in bind, the villager's
// spine 21 degrees straighter than the artisan's. A local delta produces a
// different absolute result on each one; "the forearm hangs within 20 degrees
// of the upper arm" means the same thing on every character however
// differently each one's skeleton happens to be tilted at rest.
//
// The technique: a limb bone's local bind translation to its own next child
// (LeftForeArm's position, as stored on the LeftArm→LeftForeArm bone itself)
// is already the direction from the bone to that child, expressed in the
// bone's own local frame — and that is independent of whatever the bind
// ROTATION was. Build the quaternion that rotates that local direction to the
// absolute model-space direction the pose wants
// (`THREE.Quaternion.setFromUnitVectors`), and that quaternion IS the bone's
// desired absolute orientation. Walk the chain from the rig's own root down
// to a leaf, and the LOCAL rotation actually written onto the bone is just
// (parent's desired orientation) inverse times (this bone's desired
// orientation) — ordinary forward kinematics, run backwards from an absolute
// target instead of forwards from a delta.
//
// THREE is passed in rather than imported, matching every other file in this
// directory, so this stays importable in jsdom.

// A rotation about this axis, by a positive angle, swings a hanging limb
// forward (+Z, the character's own forwardAxis — see sceneHumanManifest.js).
const FLEX_AXIS_ARR = [-1, 0, 0];
// A rotation about this axis, by a positive angle, swings a limb outward
// to the character's left (+X).
const ABDUCT_AXIS_ARR = [0, 0, 1];

const deg = (degrees) => (degrees * Math.PI) / 180;

// A raised-cosine bump, periodic on [0, 1) — used for the parts of the gait
// (the knee's swing-through, the ankle's push-off) that happen once per
// stride rather than following it the whole way round. C1 and periodic, so
// the clip loops without a seam.
function bump(p, centre, width) {
  let d = Math.abs(p - centre);
  d = Math.min(d, 1 - d);
  if (d >= width) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * d) / width));
}

// The absolute walk cycle, in degrees, for the LEFT side at phase p in
// [0, 1) — one full stride. The right side is the left at p + 0.5. Every
// joint's own bend SUBTRACTS from whichever angle its parent segment already
// has (rotations about the same fixed axis add and subtract exactly, not
// approximately, which is what makes this valid): the shin's absolute angle
// is the thigh's absolute angle minus how much the knee is bent, and the
// forearm's is the upper arm's minus how much the elbow is bent. See the
// plan's §4.2 for the target ranges these were tuned against.
function gaitAnglesLeft(p) {
  const thighFlex = 5 + 17 * Math.cos(2 * Math.PI * p);
  const kneeBend = Math.max(0, 5 + 12 * bump(p, 0.12, 0.18) + 58 * bump(p, 0.72, 0.22));
  const shinFlex = thighFlex - kneeBend;
  const ankleBend = 6 * Math.sin(2 * Math.PI * (p + 0.15)) - 14 * bump(p, 0.52, 0.12);

  // Amplitude and elbow-bend baseline are chosen so the forearm never swings
  // past 30 degrees from vertical even at the extreme of the stride (arm
  // swung fully back, elbow at its most bent, both at once, right at heel
  // strike) — the shipped baked clip's actual defect, at 50-70 degrees in
  // every clip, was this same combination with no such ceiling in mind.
  const armFlex = -14 * Math.cos(2 * Math.PI * p);
  const elbowBend = 11 + 3 * Math.max(0, Math.cos(2 * Math.PI * p));
  const foreArmFlex = armFlex - elbowBend;

  return {
    thighFlex, shinFlex, ankleBend, armFlex, foreArmFlex,
  };
}

function gaitFrame(p) {
  const left = gaitAnglesLeft(p);
  const right = gaitAnglesLeft((p + 0.5) % 1);
  const pelvisYaw = 4 * Math.sin(2 * Math.PI * p);
  return {
    left,
    right,
    pelvisYaw,
    spineYaw: -0.6 * pelvisYaw,
    // Two low points per stride (both heel strikes) and two high points
    // (both mid-swings) — the double bump of an actual gait, not a single
    // sine that would put one leg's heel strike at the high point.
    hipsY: -0.022 * Math.cos(4 * Math.PI * p),
    hipsX: 0.02 * Math.sin(2 * Math.PI * p),
  };
}

// --- standing poses ---------------------------------------------------
//
// Static, or lightly animated so idle is not a photograph (over its whole
// loop the shipped baked clip moves the arms by 0.2 degrees; the loop below
// moves them by several). Each returns the same shape as `gaitFrame().left`,
// plus `armAbduct` and `spineLean`/`spineYaw` where relevant, so one
// `applyFrame()` below can drive every clip without a special case per pose.
const REST_ARM = 6; // matches the one part of the baked idle clip that was fine
const REST_ELBOW = 18;

function idleFrame(t, period) {
  const breathe = Math.sin((2 * Math.PI * t) / period);
  return {
    spineLean: 2 + breathe * 1.4,
    left: { armFlex: REST_ARM + breathe * 3, foreArmFlex: REST_ARM + breathe * 3 - REST_ELBOW },
    right: { armFlex: REST_ARM - breathe * 3, foreArmFlex: REST_ARM - breathe * 3 - REST_ELBOW },
    hipsY: breathe * 0.006,
  };
}

function talkFrame(t, period) {
  const burst = Math.max(0, Math.sin((2 * Math.PI * t * 1.4) / period));
  return {
    spineLean: 4,
    left: {
      armFlex: REST_ARM - 26 * burst,
      armAbduct: 6 + 22 * burst,
      foreArmFlex: REST_ARM - 26 * burst - (REST_ELBOW + 45 * burst),
    },
    right: { armFlex: REST_ARM, foreArmFlex: REST_ARM - REST_ELBOW },
  };
}

function listenFrame() {
  return {
    spineLean: 5,
    left: { armFlex: REST_ARM, foreArmFlex: REST_ARM - REST_ELBOW },
    right: { armFlex: REST_ARM, foreArmFlex: REST_ARM - REST_ELBOW },
  };
}

function carryFrame(t, period) {
  const sway = Math.sin((2 * Math.PI * t * 0.6) / period) * 2;
  return {
    spineLean: 6 + sway * 0.4,
    left: { armFlex: 55, armAbduct: 14, foreArmFlex: 55 - 95 },
    right: { armFlex: 55, armAbduct: 14, foreArmFlex: 55 - 95 },
  };
}

function workFrame(t, period) {
  const cycle = Math.sin((2 * Math.PI * t * 1.3) / period);
  return {
    spineLean: 42 + cycle * 5,
    left: { armFlex: 55 + cycle * 12, foreArmFlex: 55 + cycle * 12 - 70 },
    right: { armFlex: 55 - cycle * 12, foreArmFlex: 55 - cycle * 12 - 70 },
  };
}

function sitFrame() {
  // Thigh raised to horizontal (90 degrees from hanging straight down), knee
  // bent back the same 90 so the shin hangs straight down again to the floor
  // — the seated pose the shipped `sit` clip actually got right.
  const leg = { thighFlex: 90, shinFlex: 0, ankleBend: 0 };
  return {
    spineLean: 8,
    leftLeg: leg,
    rightLeg: leg,
    left: { armFlex: 22, foreArmFlex: 22 - 35 },
    right: { armFlex: 18, foreArmFlex: 18 - 35 },
  };
}

function kneelFrame() {
  const leg = { thighFlex: -12, shinFlex: -128, ankleBend: -20 };
  return {
    spineLean: 12,
    leftLeg: leg,
    rightLeg: leg,
    left: { armFlex: 26, foreArmFlex: 26 - 40 },
    right: { armFlex: 26, foreArmFlex: 26 - 40 },
  };
}

function prayerFrame(t, period) {
  const sway = Math.sin((2 * Math.PI * t * 0.5) / period) * 2;
  // Standing prayer with hands lifted and open — 1 Timothy 2:8 — not the
  // folded hands of later Christian art.
  return {
    spineLean: -3 + sway * 0.3,
    left: { armFlex: 96 + sway, armAbduct: 30, foreArmFlex: 96 + sway - 22 },
    right: { armFlex: 96 - sway, armAbduct: 30, foreArmFlex: 96 - sway - 22 },
  };
}

// --- forward kinematics --------------------------------------------------

const BONE_NAMES = {
  hips: 'mixamorig:Hips',
  spine: 'mixamorig:Spine',
  spine1: 'mixamorig:Spine1',
  spine2: 'mixamorig:Spine2',
  neck: 'mixamorig:Neck',
  head: 'mixamorig:Head',
};
const sideBoneNames = (side) => ({
  upLeg: `mixamorig:${side}UpLeg`,
  leg: `mixamorig:${side}Leg`,
  foot: `mixamorig:${side}Foot`,
  arm: `mixamorig:${side}Arm`,
  foreArm: `mixamorig:${side}ForeArm`,
  hand: `mixamorig:${side}Hand`,
});

// GLTFLoader runs every node name through `PropertyBinding.sanitizeNodeName`
// on load (`createUniqueName`, so an animated node's name is guaranteed safe
// to embed in a track-name string), which strips `[ ] . : /` — the same
// characters an AnimationClip track name uses as syntax. A real loaded
// `mixamorig:Hips` bone is therefore actually named `mixamorigHips` at
// runtime, colon and all removed, even though the validator in
// scripts/validate-scene-humans.js checks the raw (unsanitized) glTF JSON
// and the docs and RIG_DEFINITIONS both write the name with its colon. Look
// up bones by the same sanitized name GLTFLoader actually assigned, or every
// lookup silently fails and `buildHumanClips()` falls back to nothing.
function findBones(THREE, sceneRoot) {
  const get = (name) => sceneRoot.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)) || null;
  const bones = {};
  for (const [key, name] of Object.entries(BONE_NAMES)) bones[key] = get(name);
  for (const side of ['Left', 'Right']) {
    const names = sideBoneNames(side);
    for (const [key, name] of Object.entries(names)) bones[`${side.toLowerCase()}${key[0].toUpperCase()}${key.slice(1)}`] = get(name);
  }
  return bones;
}

// Poses every authored bone for one instant and returns
// `{ quaternions: Map<Object3D, THREE.Quaternion>, hipsPosition: THREE.Vector3 | null }`,
// where the quaternions are LOCAL (ready to write straight onto the bone, or
// bake into a keyframe). Never mutates a bone — every read is of the bind
// pose the bone was loaded with, which is exactly what makes it safe to call
// this once per frame while building a clip, on the same live skeleton the
// character will actually use.
function poseFrame(THREE, bones, frame) {
  const identity = new THREE.Quaternion();
  const modelCache = new Map();
  const localQuats = new Map();
  const flexAxis = new THREE.Vector3(...FLEX_AXIS_ARR);
  const abductAxis = new THREE.Vector3(...ABDUCT_AXIS_ARR);
  const down = new THREE.Vector3(0, -1, 0);

  function modelOf(bone) {
    if (!bone) return identity;
    if (modelCache.has(bone)) return modelCache.get(bone);
    // Not authored below: pass its bind-local rotation straight through,
    // composed onto whatever its (possibly authored) parent is doing. This is
    // what lets an un-animated bone like the shoulder or the hand follow the
    // torso or forearm without ever being written to a track.
    const model = modelOf(bone.parent).clone().multiply(bone.quaternion);
    modelCache.set(bone, model);
    return model;
  }

  function setAbsolute(bone, model) {
    if (!bone) return;
    const local = modelOf(bone.parent).clone().invert().multiply(model);
    localQuats.set(bone, local);
    modelCache.set(bone, model);
  }

  // Small deltas on top of the bind pose. Valid here specifically because
  // these motions (a few degrees of lean, sway, turn) are small enough that
  // bind-pose differences between characters do not show — the technique
  // that has to be exact is reserved for the arms and legs, where the
  // baked-clip defect actually was.
  function nudge(bone, pitchDeg, yawDeg, rollDeg) {
    if (!bone) return;
    const delta = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(deg(pitchDeg || 0), deg(yawDeg || 0), deg(rollDeg || 0), 'XYZ'),
    );
    const local = bone.quaternion.clone().multiply(delta);
    localQuats.set(bone, local);
    modelCache.set(bone, modelOf(bone.parent).clone().multiply(local));
  }

  function limbTarget(flexDeg, abductDeg) {
    const q = new THREE.Quaternion()
      .setFromAxisAngle(flexAxis, deg(flexDeg || 0))
      .multiply(new THREE.Quaternion().setFromAxisAngle(abductAxis, deg(abductDeg || 0)));
    return down.clone().applyQuaternion(q);
  }

  // A limb bone's absolute orientation, aimed so the (bind, bone-local)
  // direction to its own next child ends up pointing at the absolute
  // direction the pose wants.
  //
  // The rotation is built as a delta from the bone's own BIND orientation,
  // not a "cold" vector-to-vector mapping from the bone's un-rotated local
  // frame — deliberately, because every leg bone's local aim direction is
  // exactly (0, 1, 0) (a bone always points straight at its own child before
  // any rotation is applied), and a standing pose's target is straight down,
  // (0, -1, 0): those two vectors are EXACTLY antiparallel. Antiparallel
  // vectors have no defined rotation axis, and THREE.Quaternion's own
  // implementation resolves that case with an arbitrary but very much
  // non-identity 180-degree twist about a fallback axis — invisible to any
  // test that only checks bone POSITIONS (a bone twisted about its own long
  // axis has its child in exactly the same place), but not invisible to the
  // skinned mesh, which visibly corkscrews. This was every standing figure's
  // legs, continuously, not a rare edge case: `thighFlex`/`shinFlex` default
  // to exactly 0 for every pose that doesn't touch the legs at all (idle,
  // talk, listen, carry, work, prayer), which is most of them.
  //
  // Starting the rotation from where the bone's aim direction ALREADY points
  // in the bind pose — almost never antiparallel to any sane target, since
  // the character is already standing in a broadly reasonable pose — sidesteps
  // the degenerate case entirely, and preserves whatever twist the bind pose
  // itself carried instead of replacing it with an arbitrary one.
  function aimAbsolute(bone, child, flexDeg, abductDeg) {
    if (!bone || !child) return;
    const bindModel = modelOf(bone);
    const localAim = child.position.clone().normalize();
    const bindAim = localAim.clone().applyQuaternion(bindModel);
    const target = limbTarget(flexDeg, abductDeg);
    const delta = new THREE.Quaternion().setFromUnitVectors(bindAim, target);
    setAbsolute(bone, delta.multiply(bindModel));
  }

  // --- spine and head: small deltas, distributed so more of the bend comes
  // from the upper spine than the lower, which is how a person actually
  // bends.
  const lean = frame.spineLean || 0;
  const yaw = frame.spineYaw || 0;
  nudge(bones.spine, lean * 0.15, yaw * 0.15, 0);
  nudge(bones.spine1, lean * 0.3, yaw * 0.25, 0);
  nudge(bones.spine2, lean * 0.55, yaw * 0.35, 0);
  nudge(bones.neck, lean * -0.1, yaw * -0.2, 0);
  nudge(bones.head, lean * -0.05, yaw * -0.15, 0);

  // --- hips: rotation as a small delta (a standing person's pelvis barely
  // tilts), position as a plain offset — Hips' own parent carries no
  // rotation on any of the shipped rigs, so a world-space offset is exactly
  // the right local offset too, with no conversion needed.
  nudge(bones.hips, 0, frame.pelvisYaw || 0, 0);
  const hipsPosition = (frame.hipsX || frame.hipsY)
    ? new THREE.Vector3(bones.hips.position.x + (frame.hipsX || 0), bones.hips.position.y + (frame.hipsY || 0), bones.hips.position.z)
    : null;

  // --- legs: absolute, per side.
  for (const side of ['left', 'right']) {
    const legFrame = frame[`${side}Leg`] || frame[side] || {};
    const upLeg = bones[`${side}UpLeg`];
    const leg = bones[`${side}Leg`];
    const foot = bones[`${side}Foot`];
    aimAbsolute(upLeg, leg, legFrame.thighFlex || 0, 0);
    aimAbsolute(leg, foot, legFrame.shinFlex ?? legFrame.thighFlex ?? 0, 0);
    // The foot has no further bone to aim at in this rig, so the ankle is an
    // extra rotation on top of the shin's own (already absolute) orientation
    // — proper hinge coupling, not a fixed-world rotation independent of it.
    if (foot && legFrame.ankleBend) {
      const extra = new THREE.Quaternion().setFromAxisAngle(flexAxis, deg(legFrame.ankleBend));
      setAbsolute(foot, extra.multiply(modelOf(leg)));
    }
  }

  // --- arms: absolute, per side.
  for (const side of ['left', 'right']) {
    const armFrame = frame[side] || {};
    const arm = bones[`${side}Arm`];
    const foreArm = bones[`${side}ForeArm`];
    const sideSign = side === 'left' ? 1 : -1;
    aimAbsolute(arm, foreArm, armFrame.armFlex || 0, (armFrame.armAbduct || 0) * sideSign);
    aimAbsolute(foreArm, bones[`${side}Hand`], armFrame.foreArmFlex ?? armFrame.armFlex ?? 0, (armFrame.armAbduct || 0) * sideSign);
  }

  return { quaternions: localQuats, hipsPosition };
}

// --- clip assembly ---------------------------------------------------

const CLIPS = {
  idle: { duration: 4, sample: (t) => idleFrame(t, 4) },
  work: { duration: 3, sample: (t) => workFrame(t, 3) },
  talk: { duration: 4, sample: (t) => talkFrame(t, 4) },
  listen: { duration: 4, sample: () => listenFrame() },
  carry: { duration: 4, sample: (t) => carryFrame(t, 4) },
  sit: { duration: 4, sample: () => sitFrame() },
  kneel: { duration: 4, sample: () => kneelFrame() },
  prayer: { duration: 4, sample: (t) => prayerFrame(t, 4) },
};
const WALK_DURATION = 1; // one stride per second of clip time; playback rate is set from actual distance walked, not the clock — see HumanAnimationController.

function bakeClip(THREE, bones, name, duration, sampleAt, fps) {
  const frameCount = Math.max(2, Math.round(duration * fps));
  const times = [];
  const tracksByBone = new Map();
  let hasHipsPosition = false;
  const hipsTimes = [];
  const hipsValues = [];

  for (let i = 0; i <= frameCount; i += 1) {
    const t = (i / frameCount) * duration;
    times.push(t);
    const { quaternions, hipsPosition } = sampleAt(t);
    for (const [bone, quat] of quaternions) {
      if (!tracksByBone.has(bone)) tracksByBone.set(bone, []);
      tracksByBone.get(bone).push(quat);
    }
    if (hipsPosition) {
      hasHipsPosition = true;
      hipsTimes.push(t);
      hipsValues.push(hipsPosition.x, hipsPosition.y, hipsPosition.z);
    }
  }

  const tracks = [];
  for (const [bone, quats] of tracksByBone) {
    if (quats.length !== times.length) continue; // a bone not authored every frame can't form a track
    const values = new Float32Array(quats.length * 4);
    quats.forEach((q, i) => q.toArray(values, i * 4));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values));
  }
  if (hasHipsPosition && hipsTimes.length === times.length) {
    // The bone's own (already-sanitized) name, not the raw BONE_NAMES
    // constant — see the comment on findBones().
    tracks.push(new THREE.VectorKeyframeTrack(`${bones.hips.name}.position`, hipsTimes, hipsValues));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

// Builds the full procedural clip set for one loaded model's skeleton. Call
// once per model (not per cloned actor — every clone shares the same bind
// pose and rig topology) and reuse the result across every actor using it.
// Returns `{}` if the rig does not have the bones this needs, so a caller can
// fall back to whatever the GLB shipped rather than throwing.
export function buildHumanClips(THREE, sceneRoot, { fps = 24 } = {}) {
  const bones = findBones(THREE, sceneRoot);
  if (!bones.hips || !bones.leftArm || !bones.leftUpLeg) return {};

  const clips = {};
  for (const [name, { duration, sample }] of Object.entries(CLIPS)) {
    clips[name] = bakeClip(THREE, bones, name, duration, (t) => poseFrame(THREE, bones, sample(t)), fps);
  }
  // The walk cycle is parameterized by phase 0..1, not by seconds — its
  // "duration" is a pure unit of clip-time that HumanAnimationController
  // maps distance walked onto directly (`walkAction.time = walkCyclePhase`),
  // so `fps` here just needs enough samples for a smooth loop, not any
  // particular real-world rate.
  clips.walk = bakeClip(
    THREE,
    bones,
    'walk',
    WALK_DURATION,
    (t) => poseFrame(THREE, bones, gaitFrame(t / WALK_DURATION)),
    Math.max(fps, 30),
  );
  return clips;
}

// Exported for testing against the real bind poses of the shipped models,
// and for anyone tuning the curves above without needing a full clip bake.
export const __internal = {
  bump, gaitFrame, poseFrame, findBones, BONE_NAMES,
};
