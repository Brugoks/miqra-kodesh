// Shared skeletal clips authored in model space, then converted to local
// joint rotations. Positive limb flexion points forward (+Z). Knees bend
// backward from the thigh; elbows bend FORWARD from the upper arm.
// THREE is injected to keep this usable by the scene and rig regression tests.

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

// Left stride phase in [0, 1); the right side follows half a cycle later.
// Knees flex back, elbows flex forward in the character's +Z facing frame.
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
  const foreArmFlex = armFlex + elbowBend;

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
    fingerCurl: 20,
  };
}

// --- standing poses ---------------------------------------------------
//
// Static, or lightly animated so idle is not a photograph (over its whole
// loop the shipped baked clip moves the arms by 0.2 degrees; the loop below
// moves them by several). Each returns the same shape as `gaitFrame().left`,
// plus `armAbduct` and `spineLean`/`spineYaw` where relevant, so one
// `applyFrame()` below can drive every clip without a special case per pose.
const REST_ARM = -2;
const REST_ELBOW = 12;
const relaxedArm = (flex = REST_ARM) => ({
  armFlex: flex, armAbduct: 5, foreArmFlex: flex + REST_ELBOW,
});

function idleFrame(t, period) {
  const breathe = Math.sin((2 * Math.PI * t) / period);
  return {
    spineLean: 1 + breathe * 0.6,
    left: relaxedArm(REST_ARM + breathe * 1.6),
    right: relaxedArm(REST_ARM - breathe * 1.2),
    fingerCurl: 18,
  };
}

function talkFrame(t, period) {
  const p = t / period;
  // Two brief, unequal gestures with several seconds of listening between.
  // Both return smoothly to rest before the loop boundary.
  const first = bump(p, 0.2, 0.12);
  const second = bump(p, 0.62, 0.09);
  return {
    spineLean: 1 + first * 2,
    spineYaw: first * 3 - second * 2,
    left: { armFlex: -2 + first * 20, armAbduct: 5 + first * 9,
      foreArmFlex: 10 + first * 52 },
    right: { armFlex: -2 + second * 14, armAbduct: 5 + second * 6,
      foreArmFlex: 10 + second * 38 },
    fingerCurl: 16,
  };
}

function listenFrame(t, period) {
  return { ...idleFrame(t, period), headPitch: 4 * bump(t / period, 0.55, 0.1), fingerCurl: 18 };
}

function carryFrame(t, period) {
  const breath = Math.sin(2 * Math.PI * t / period);
  return {
    spineLean: -2 + breath * 0.4,
    left: { armFlex: 12, armAbduct: 8, foreArmAbduct: -8, foreArmFlex: 88 },
    right: { armFlex: 12, armAbduct: 8, foreArmAbduct: -8, foreArmFlex: 88 },
    fingerCurl: 34,
  };
}

function workFrame(t, period) {
  // Small alternating movements over a basket held in front of the body.
  const p = t / period;
  const reach = bump(p, 0.3, 0.23);
  const sort = bump(p, 0.7, 0.18);
  return {
    spineLean: 10 + reach * 4,
    headPitch: 14,
    left: { armFlex: 16 + sort * 8, armAbduct: 8, foreArmAbduct: -10, foreArmFlex: 72 + sort * 12 },
    right: { armFlex: 16 + reach * 12, armAbduct: 8, foreArmAbduct: -10, foreArmFlex: 72 + reach * 14 },
    fingerCurl: 28,
  };
}

function sitFrame(t, period) {
  const leg = { thighFlex: 90, shinFlex: 0, ankleBend: 0 };
  return {
    spineLean: 3 + Math.sin(2 * Math.PI * t / period) * 0.7,
    seated: true,
    leftLeg: leg, rightLeg: leg,
    left: { armFlex: 12, armAbduct: 3, foreArmFlex: 76 },
    right: { armFlex: 10, armAbduct: 3, foreArmFlex: 72 },
    fingerCurl: 20,
  };
}

function kneelFrame() {
  const leg = { thighFlex: -12, shinFlex: -95, ankleBend: -20 };
  return {
    spineLean: 8, kneeling: true, headPitch: 8,
    leftLeg: leg, rightLeg: leg,
    left: { armFlex: 10, armAbduct: 4, foreArmFlex: 48 },
    right: { armFlex: 10, armAbduct: 4, foreArmFlex: 48 },
    fingerCurl: 20,
  };
}

function prayerFrame(t, period) {
  const breath = Math.sin(2 * Math.PI * t / period);
  return {
    spineLean: -2 + breath * 0.3,
    left: { armFlex: 65 + breath, armAbduct: 25, foreArmFlex: 115 + breath },
    right: { armFlex: 65 - breath, armAbduct: 25, foreArmFlex: 115 - breath },
    fingerCurl: 8,
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

const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];

// --- hand anatomy -------------------------------------------------------
//
// A finger is a hinge chain, and the hinge is NOT any of the bone's own local
// axes: in these rigs a finger bone aims along its local +Y and the knuckle
// line lands on local -Z, which makes local X the palm normal — the
// *abduction* axis. Curling a finger by rotating about local X (with a
// fudge factor of roll to try to compensate) is what made every hand read as
// broken: measured on the shipped artisan, it moved each fingertip AWAY from
// the palm and almost entirely sideways, so the fingers splayed and
// hyperextended instead of closing.
//
// So no axis is assumed here. Each hand's frame is measured from its own bind
// pose, and every joint's hinge is derived from that frame, which is why the
// same code poses the left and right hands with no mirrored sign constants.
function bindTransform(THREE, bone, cache) {
  if (!bone) return { q: new THREE.Quaternion(), p: new THREE.Vector3() };
  const hit = cache.get(bone);
  if (hit) return hit;
  const parent = bindTransform(THREE, bone.parent, cache);
  const entry = {
    q: parent.q.clone().multiply(bone.quaternion),
    p: bone.position.clone().applyQuaternion(parent.q).add(parent.p),
  };
  cache.set(bone, entry);
  return entry;
}

// The rotation axis that swings a bone aiming along `aim` toward `towards`.
// `null` when the two are parallel and no such axis exists.
function axisTowards(THREE, aim, towards) {
  const axis = new THREE.Vector3().crossVectors(aim, towards);
  return axis.lengthSq() < 1e-10 ? null : axis.normalize();
}

// A bone's aim in model space: a bone always points at its own next child,
// and every one of these finger bones is authored aiming along local +Y, so
// the tip joint (which has no child) falls back to exactly that.
function bindAim(THREE, bone, cache) {
  const child = bone.children.find((node) => node.isBone) || null;
  const local = child && child.position.lengthSq() > 1e-12
    ? child.position.clone().normalize()
    : new THREE.Vector3(0, 1, 0);
  return local.applyQuaternion(bindTransform(THREE, bone, cache).q);
}

// Measures one hand's own frame from the bind pose: which way its fingers
// point, which way its knuckles run, and — the part that cannot be guessed —
// which side of that plane the palm is on.
//
// The palm side is read off the thumb, the one digit that sits on the palmar
// side of the plane of the fingers. It is measured against a KNUCKLE, not
// against the wrist: the hand bone's own origin sits well off the knuckle
// plane (35 mm on these rigs, against the thumb's own 54 mm), so a
// wrist-relative test very nearly cancels the evidence it is reading. Failing
// a thumb entirely, it falls back to the fact that a resting arm hangs with
// its palm turned toward the body's midline. Both cues agree on all four
// shipped characters, which `sceneHumanRealRigs.test.js` asserts.
function handFrame(THREE, hand, digits, hips, cache) {
  if (!hand) return null;
  const at = (bone) => bindTransform(THREE, bone, cache).p;
  const knuckles = [digits.Index[0], digits.Pinky[0]];
  const along = digits.Middle[2] && digits.Middle[0] ? [digits.Middle[0], digits.Middle[2]]
    : [digits.Index[0], digits.Index[2]];
  if (!knuckles[0] || !knuckles[1] || !along[0] || !along[1]) return null;

  // From the index knuckle toward the pinky knuckle — the ulnar direction.
  const lateral = at(knuckles[1]).sub(at(knuckles[0]));
  const fingerDir = at(along[1]).sub(at(along[0]));
  if (lateral.lengthSq() < 1e-10 || fingerDir.lengthSq() < 1e-10) return null;
  lateral.normalize();
  fingerDir.normalize();
  const normal = new THREE.Vector3().crossVectors(lateral, fingerDir);
  if (normal.lengthSq() < 1e-10) return null;
  normal.normalize();

  const origin = at(knuckles[0]);
  const thumbTip = digits.Thumb[2] || digits.Thumb[1] || null;
  let palmSign = 0;
  if (thumbTip) palmSign = Math.sign(at(thumbTip).sub(origin).dot(normal));
  if (!palmSign && hips) palmSign = Math.sign(at(hips).sub(origin).dot(normal));
  if (!palmSign) palmSign = 1;

  const palm = normal.multiplyScalar(palmSign);
  // Opposition is not a curl and not a reach at where the fingers currently
  // are: it carries the thumb pad ACROSS the palm — ulnar, and a little
  // palmward — to where the fingers will be once they close. Aiming it at
  // the fingertips of the flat bind hand instead points it backwards, since
  // the resting thumb already stands proud of the knuckle plane.
  const oppose = lateral.clone().addScaledVector(palm, 0.3).normalize();
  return {
    palm,
    // From the pinky side toward the thumb side: the way a spread index
    // finger travels.
    radial: lateral.clone().negate(),
    oppose,
  };
}

// Flexion swings the fingertip into the palm; spread swings it toward the
// thumb. Both are returned in each bone's OWN local frame, so they ride along
// with whatever the parent joint is doing — which is how a real finger works:
// the joints past the knuckle hinge in the plane the knuckle set.
//
// The axis is therefore derived once, from the proximal bone, and then merely
// re-expressed for the others. Re-deriving it per bone against the palm tilts
// the plane at every joint (by nearly 20 degrees at the fingertip on these
// rigs, since each phalanx carries its own bind rotation) and puts back the
// sideways drift this exists to remove.
function chainAxes(THREE, chain, cache, towards) {
  const proximal = chain.find(Boolean);
  if (!proximal || !towards) return chain.map(() => ({}));
  const aim = bindAim(THREE, proximal, cache);
  const world = {};
  for (const [key, direction] of Object.entries(towards)) {
    const axis = direction && axisTowards(THREE, aim, direction);
    if (axis) world[key] = axis;
  }
  return chain.map((bone) => {
    if (!bone) return {};
    const inverse = bindTransform(THREE, bone, cache).q.clone().invert();
    const local = {};
    for (const [key, axis] of Object.entries(world)) local[key] = axis.clone().applyQuaternion(inverse);
    return local;
  });
}

// Flexion each joint contributes per degree of `fingerCurl`, and the range it
// can actually reach. A relaxed hand is not evenly curled: the middle joint
// carries most of it, which is why `fingerCurl: 18` reads as a resting hand
// rather than a flat board. The ceilings are the joints' real limits, so a
// hard grip closes into a fist instead of folding through itself.
const FINGER_JOINTS = {
  1: { gain: 0.95, min: -8, max: 90 }, // knuckle (MCP)
  2: { gain: 1.55, min: 0, max: 110 }, // middle (PIP)
  3: { gain: 0.72, min: 0, max: 80 }, // tip (DIP)
};
// The thumb keeps a standing opposition even in an open hand, then folds
// further as the hand closes.
const THUMB_JOINTS = {
  1: { gain: 0.55, min: 0, max: 45 }, // carpometacarpal — the opposition swing
  2: { gain: 0.70, min: 0, max: 55 },
  3: { gain: 0.85, min: 0, max: 70 },
};
// A relaxed hand curls unevenly across the four fingers, and splays a little.
// Positive splay is toward the thumb.
const FINGER_CASCADE = { Index: -4, Middle: 0, Ring: 5, Pinky: 10 };
const FINGER_SPLAY = { Index: 5, Middle: 1, Ring: -3, Pinky: -7 };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

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
  bones.fingers = [];
  bones.thumbs = [];
  const bindCache = new Map();
  for (const side of ['Left', 'Right']) {
    const digits = {};
    for (const digit of [...FINGERS, 'Thumb']) {
      digits[digit] = [1, 2, 3].map((joint) => get(`mixamorig:${side}Hand${digit}${joint}`));
    }
    const frame = handFrame(THREE, bones[`${side.toLowerCase()}Hand`], digits, bones.hips, bindCache);
    for (const finger of FINGERS) {
      const axes = chainAxes(THREE, digits[finger], bindCache, frame && { hinge: frame.palm, spread: frame.radial });
      digits[finger].forEach((bone, index) => {
        if (bone) bones.fingers.push({ bone, joint: index + 1, finger, side, ...axes[index] });
      });
    }
    const thumb = chainAxes(THREE, digits.Thumb, bindCache, frame && { hinge: frame.oppose });
    digits.Thumb.forEach((bone, index) => {
      if (bone) bones.thumbs.push({ bone, joint: index + 1, side, ...thumb[index] });
    });
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
  // Applies a rotation expressed in the bone's OWN local axes, on top of
  // whatever its bind pose already carried.
  function twist(bone, delta) {
    if (!bone) return;
    const local = bone.quaternion.clone().multiply(delta);
    localQuats.set(bone, local);
    modelCache.set(bone, modelOf(bone.parent).clone().multiply(local));
  }

  function nudge(bone, pitchDeg, yawDeg, rollDeg) {
    twist(bone, new THREE.Quaternion().setFromEuler(
      new THREE.Euler(deg(pitchDeg || 0), deg(yawDeg || 0), deg(rollDeg || 0), 'XYZ'),
    ));
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
  nudge(bones.head, lean * -0.05 + (frame.headPitch || 0), yaw * -0.15, 0);

  // --- hips: rotation as a small delta (a standing person's pelvis barely
  // tilts), position as a plain offset — Hips' own parent carries no
  // rotation on any of the shipped rigs, so a world-space offset is exactly
  // the right local offset too, with no conversion needed.
  nudge(bones.hips, 0, frame.pelvisYaw || 0, 0);
  // Every clip writes translation, including neutral keys at t=0. Omitting
  // that first zero used to discard the entire walk bob / seated-height track.
  const hipsPosition = bones.hips ? bones.hips.position.clone() : null;
  if (hipsPosition) {
    hipsPosition.x += frame.hipsX || 0;
    hipsPosition.y += frame.hipsY || 0;
    if (frame.seated) hipsPosition.y = 0.58;
    if (frame.kneeling && bones.leftLeg) hipsPosition.y = bones.leftLeg.position.length() * Math.cos(deg(12)) + 0.065;
  }

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
    if (foot) {
      const extra = new THREE.Quaternion().setFromAxisAngle(flexAxis, deg(legFrame.ankleBend || 0));
      setAbsolute(foot, extra.multiply(modelOf(foot)));
    }
  }

  // --- arms: absolute, per side.
  for (const side of ['left', 'right']) {
    const armFrame = frame[side] || {};
    const arm = bones[`${side}Arm`];
    const foreArm = bones[`${side}ForeArm`];
    const sideSign = side === 'left' ? 1 : -1;
    aimAbsolute(arm, foreArm, armFrame.armFlex || 0, (armFrame.armAbduct || 0) * sideSign);
    const hand = bones[`${side}Hand`];
    const foreFlex = armFrame.foreArmFlex ?? armFrame.armFlex ?? 0;
    const foreAbduct = armFrame.foreArmAbduct ?? armFrame.armAbduct ?? 0;
    aimAbsolute(foreArm, hand, foreFlex, foreAbduct * sideSign);
    const middle = hand?.children.find((child) => child.name.endsWith('HandMiddle1'));
    aimAbsolute(hand, middle, foreFlex + 4, foreAbduct * sideSign);
    if (hand && armFrame.handTwist) {
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deg(armFrame.handTwist));
      setAbsolute(hand, modelOf(hand).clone().multiply(rotation));
    }
  }

  // --- fingers and thumbs: a hinge chain about each joint's own measured
  // axis (see handFrame above), never a guessed local axis.
  const baseCurl = frame.fingerCurl ?? 20;
  for (const { bone, joint, finger, hinge, spread } of bones.fingers || []) {
    if (!hinge) continue;
    const limits = FINGER_JOINTS[joint];
    const curl = Math.max(2, baseCurl + FINGER_CASCADE[finger]);
    const delta = new THREE.Quaternion();
    // Only the knuckle abducts — the two joints beyond it are pure hinges,
    // and letting them yaw is half of what made a curled hand look wrong.
    // The splay closes up as the hand does, the way real fingers converge
    // onto a grip rather than staying fanned.
    if (spread && joint === 1) {
      delta.setFromAxisAngle(spread, deg(FINGER_SPLAY[finger] * Math.max(0, 1 - curl / 70)));
    }
    delta.multiply(new THREE.Quaternion().setFromAxisAngle(
      hinge, deg(clamp(curl * limits.gain, limits.min, limits.max)),
    ));
    twist(bone, delta);
  }

  // Opposition, not a curl: the thumb swings across the palm toward the
  // fingers it has to meet, and keeps a resting amount of it even when the
  // hand is open.
  const thumbCurl = 10 + Math.max(0, baseCurl) * 0.85;
  for (const { bone, joint, hinge } of bones.thumbs || []) {
    if (!hinge) continue;
    const limits = THUMB_JOINTS[joint];
    twist(bone, new THREE.Quaternion().setFromAxisAngle(
      hinge, deg(clamp(thumbCurl * limits.gain, limits.min, limits.max)),
    ));
  }

  return { quaternions: localQuats, hipsPosition };
}

// --- clip assembly ---------------------------------------------------

const CLIPS = {
  idle: { duration: 6, sample: (t) => idleFrame(t, 6) },
  work: { duration: 7, sample: (t) => workFrame(t, 7) },
  talk: { duration: 12, sample: (t) => talkFrame(t, 12) },
  listen: { duration: 9, sample: (t) => listenFrame(t, 9) },
  carry: { duration: 4, sample: (t) => carryFrame(t, 4) },
  sit: { duration: 7, sample: (t) => sitFrame(t, 7) },
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

// Pose-specific clips use the same anatomical targeting and finger relaxation
// as the village cast. Sample functions are authored here, not imported FBX.
export function buildPoseClip(THREE, sceneRoot, name, duration, sample, { fps = 24 } = {}) {
  const bones = findBones(THREE, sceneRoot);
  if (!bones.hips || !bones.leftArm || !bones.leftUpLeg) return null;
  return bakeClip(THREE, bones, name, duration, (t) => poseFrame(THREE, bones, sample(t)), fps);
}
