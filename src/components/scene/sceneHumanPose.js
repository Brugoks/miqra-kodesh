// A thin per-frame overlay on top of the mixer's own pose, so a figure
// standing next to the visitor for ten seconds does not read as a loop —
// which a baked or authored clip always eventually does, however good it is.
// Breathing, an occasional weight shift, and a head that glances around (and
// sometimes at the visitor) are cheap: a handful of quaternion multiplies a
// frame, applied AFTER `mixer.update(dt)` has already set the bone fresh
// from the clip.
//
// The offsets are multiplied into the bone, so the caller MUST call `reset()`
// before `mixer.update(dt)` rather than trusting the mixer to overwrite them.
// Three's PropertyMixer compares the accumulated value against the bone's
// current one and skips `binding.setValue` when nothing changed — which is
// exactly what happens to a frozen skeleton (reduced motion, the Mark 2
// tableau) or a track that is momentarily static. Without the reset those
// frames compound the offset instead of replacing it, and a figure slowly
// screws itself into the ground.
//
// A prop-carrying actor can also capture its authored carry pose when this
// overlay is created. While the legs continue to use the distance-driven walk
// cycle, the arm chain is pulled strongly back toward that pose each frame,
// so a jar or basket does not swing like an empty hand.
//
// Every actor gets its own seed (hashed from its id) and its own small rate
// jitter, so two figures standing side by side never breathe or shift in
// step — a `sceneHumans.js` actor is exactly one call of this per actor.
//
// THREE is passed in, as everywhere else in this directory, so this stays
// importable in jsdom.

export function hashSeed(id) {
  let h = 2166136261 >>> 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const deg = (d) => (d * Math.PI) / 180;

// Every channel is clamped to one of these, so the overlay can only ever be a
// nudge on top of the clip — a bounded offset applied to a fresh bone pose,
// never an unbounded accumulator.
export const LIMITS = {
  breathPitch: deg(1.2),
  weightRoll: deg(0.8),
  headYaw: deg(24),
  headPitch: deg(10),
};

// Builds one actor's overlay. `actorRoot` is the actor's own cloned scene
// graph (sceneHumans.js's `actor.root`); bones are looked up once and reused
// every frame. Missing bones simply skip their channel rather than throwing.
export function createPoseOverlay(THREE, actorRoot, { actorId, holdPose = false } = {}) {
  const rand = mulberry32(hashSeed(actorId));
  const rateJitter = 0.88 + rand() * 0.24;
  const breathPeriod = (4.2 + rand() * 1.6) / rateJitter; // seconds per full breath

  const find = (name) => actorRoot.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)) || null;
  const bones = {
    head: find('mixamorig:Head'),
    spine2: find('mixamorig:Spine2'),
    hips: find('mixamorig:Hips'),
    leftArm: find('mixamorig:LeftArm'),
    leftForeArm: find('mixamorig:LeftForeArm'),
    leftHand: find('mixamorig:LeftHand'),
    rightArm: find('mixamorig:RightArm'),
    rightForeArm: find('mixamorig:RightForeArm'),
    rightHand: find('mixamorig:RightHand'),
  };
  const heldArmPose = holdPose
    ? ['leftArm', 'leftForeArm', 'leftHand', 'rightArm', 'rightForeArm', 'rightHand']
      .filter((key) => bones[key])
      .map((key) => [bones[key], bones[key].quaternion.clone()])
    : [];

  const xAxis = new THREE.Vector3(1, 0, 0);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const offset = new THREE.Quaternion();
  const pitchOffset = new THREE.Quaternion();
  const breathOffset = rand() * Math.PI * 2;
  // Every bone this overlay touches — the held arm chain included, since its
  // slerp mutates the bone just as the nudges do.
  const basePose = Object.values(bones).filter(Boolean).map((bone) => ({ bone, rotation: bone.quaternion.clone() }));
  function reset() {
    for (const { bone, rotation } of basePose) bone.quaternion.copy(rotation);
  }

  let weightTimer = 1 + rand() * breathPeriod;
  let weightTarget = 0; // 0 = centred, 1 = shifted — the state this cycles between
  let weightPhase = 0; // eases toward weightTarget every frame
  let weightSign = rand() < 0.5 ? -1 : 1;

  let glanceTimer = 0.6 + rand() * 2.4;
  let glanceYaw = 0;
  let glancePitch = 0;
  let targetYaw = 0;
  let targetPitch = 0;

  function pickGlanceTarget(towardsPlayer) {
    if (towardsPlayer) {
      targetYaw = towardsPlayer.yaw + (rand() - 0.5) * deg(6);
      targetPitch = towardsPlayer.pitch + (rand() - 0.5) * deg(4);
    } else {
      targetYaw = (rand() - 0.5) * 2 * LIMITS.headYaw;
      targetPitch = (rand() - 0.5) * 2 * LIMITS.headPitch * 0.5;
    }
  }

  // `player`, if given, is `{ yaw, pitch, distance }` relative to this actor in
  // its own facing frame — sceneHumans.js computes this once per actor per
  // frame, since it already tracks camera position there.
  function update(dt, elapsed, { player = null, activity = 'idle' } = {}) {
    // Whatever the mixer just wrote is this frame's base; `reset()` puts the
    // bone back here before the next `mixer.update`.
    for (const entry of basePose) entry.rotation.copy(entry.bone.quaternion);
    const clampedDt = Math.min(Math.max(dt, 0), 0.1);

    // --- breathing: a small, continuous chest lift. ---
    if (bones.spine2) {
      const phase = (elapsed / breathPeriod) * Math.PI * 2 + breathOffset;
      const pitch = Math.sin(phase) * LIMITS.breathPitch;
      bones.spine2.quaternion.multiply(offset.setFromAxisAngle(xAxis, pitch));
    }

    // --- weight shift: an occasional, eased lateral list, not a continuous
    // side-to-side oscillation — a real weight shift is "move, hold, relax
    // back," and this alternates between two dwell states (centred,
    // shifted) with the actual motion just the ease between them. Only a
    // figure standing still has weight to shift. ---
    if (bones.hips && ['idle', 'listen', 'talk'].includes(activity)) {
      weightTimer -= clampedDt;
      if (weightTimer <= 0) {
        if (weightTarget === 0) {
          weightTarget = 1;
          weightSign = rand() < 0.5 ? -1 : 1;
          weightTimer = 2.5 + rand() * 4;
        } else {
          weightTarget = 0;
          weightTimer = 1.5 + rand() * 3;
        }
      }
      const ease = 1 - Math.exp(-2.4 * clampedDt);
      weightPhase += (weightTarget - weightPhase) * ease;
      const roll = weightSign * weightPhase * LIMITS.weightRoll;
      bones.hips.quaternion.multiply(offset.setFromAxisAngle(zAxis, roll));
    }

    // --- head glance: a damped random walk with real dwell, biased toward
    // the visitor when they are close and in front. ---
    if (bones.head) {
      glanceTimer -= clampedDt;
      if (glanceTimer <= 0) {
        const towardsPlayer = !['work', 'prayer', 'walk'].includes(activity) && player && player.distance < 6 && Math.abs(player.yaw) < deg(100)
          ? { yaw: player.yaw, pitch: player.pitch || 0 }
          : null;
        // Occasionally notice a visitor without having the entire crowd
        // stare at them or interrupt a focused task.
        pickGlanceTarget(towardsPlayer && rand() < 0.3 ? towardsPlayer : null);
        glanceTimer = 1.2 + rand() * 3.2;
      }
      const ease = 1 - Math.exp(-2.2 * clampedDt);
      glanceYaw += (targetYaw - glanceYaw) * ease;
      glancePitch += (targetPitch - glancePitch) * ease;
      glanceYaw = Math.max(-LIMITS.headYaw, Math.min(LIMITS.headYaw, glanceYaw));
      glancePitch = Math.max(-LIMITS.headPitch, Math.min(LIMITS.headPitch, glancePitch));
      const attention = ['work', 'prayer', 'walk'].includes(activity) ? 0.35 : 1;
      offset.setFromAxisAngle(yAxis, glanceYaw * attention)
        .multiply(pitchOffset.setFromAxisAngle(xAxis, glancePitch * attention));
      bones.head.quaternion.multiply(offset);
    }

    // --- carried load: legs still come from the real walk cycle, but arms
    // remain near the carry pose captured after the carry clip was evaluated.
    // A strong slerp leaves a little natural motion without letting the held
    // prop swing through a full empty-handed gait arc.
    for (const [bone, target] of heldArmPose) {
      bone.quaternion.slerp(target, 0.9);
    }
  }

  return { reset, update, bones, heldArmPose };
}
