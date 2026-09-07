// A thin per-frame overlay on top of the mixer's own pose, so a figure
// standing next to the visitor for ten seconds does not read as a loop —
// which a baked or authored clip always eventually does, however good it is.
// Breathing, an occasional weight shift, and a head that glances around (and
// sometimes at the visitor) are cheap: a handful of quaternion multiplies a
// frame, applied AFTER `mixer.update(dt)` has already set the bone fresh
// from the clip, so there is nothing to reset before the next frame — the
// mixer overwrites the bone first, and this only ever nudges on top of that.
//
// Every actor gets its own seed (hashed from its id) and its own small rate
// jitter, so two figures standing side by side never breathe or shift in
// step — a `sceneHumans.js` actor is exactly one call of this per actor.
//
// THREE is passed in, as everywhere else in this directory, so this stays
// importable in jsdom.

function hashSeed(id) {
  let h = 2166136261 >>> 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// A small, dependency-free seeded PRNG (mulberry32) — deterministic per
// actor id, which is what makes this testable at all.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const deg = (degrees) => (degrees * Math.PI) / 180;

// Declared bounds per channel, in radians — asserted against in
// sceneHumanPose.test.js over a long simulated run. An overlay with no such
// ceiling is how a "small nudge" turns into a figure slowly rotating into
// the ground; every channel here is a bounded oscillation or a clamped walk,
// never an unbounded accumulator.
export const LIMITS = {
  breathPitch: deg(1.2),
  weightRoll: deg(3.5),
  headYaw: deg(38),
  headPitch: deg(14),
};

// Builds one actor's overlay. `actorRoot` is the actor's own cloned scene
// graph (sceneHumans.js's `actor.root`); bones are looked up once and reused
// every frame. `bones.head`/`bones.spine2`/`bones.hips`, whichever exist, are
// nudged — a rig missing one of them (a minimal test mock, say) just skips
// that channel rather than throwing.
export function createPoseOverlay(THREE, actorRoot, { actorId } = {}) {
  const rand = mulberry32(hashSeed(actorId));
  const rateJitter = 0.88 + rand() * 0.24;
  const breathPeriod = (4.2 + rand() * 1.6) / rateJitter; // seconds per full breath

  const find = (name) => actorRoot.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)) || null;
  const bones = {
    head: find('mixamorig:Head'),
    spine2: find('mixamorig:Spine2'),
    hips: find('mixamorig:Hips'),
  };

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

  // `player`, if given, is `{ x, z, distance }` relative to this actor in its
  // own facing frame — sceneHumans.js computes this once per actor per
  // frame, since it already tracks camera position there.
  function update(dt, elapsed, { player = null } = {}) {
    const clampedDt = Math.min(Math.max(dt, 0), 0.1);

    // --- breathing: a small, continuous chest lift. ---
    if (bones.spine2) {
      const phase = (elapsed / breathPeriod) * Math.PI * 2;
      const pitch = Math.sin(phase) * LIMITS.breathPitch;
      bones.spine2.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch));
    }

    // --- weight shift: an occasional, eased lateral list, not a continuous
    // side-to-side oscillation — a real weight shift is "move, hold, relax
    // back," and this alternates between two dwell states (centred,
    // shifted) with the actual motion just the ease between them. ---
    if (bones.hips) {
      weightTimer -= clampedDt;
      if (weightTimer <= 0) {
        if (weightTarget === 0) {
          weightSign = rand() < 0.5 ? -1 : 1;
          weightTarget = 1;
          weightTimer = (1.1 + rand() * 0.7) / rateJitter; // how long the shift is held
        } else {
          weightTarget = 0;
          weightTimer = (4 + rand() * 5) / rateJitter; // dwell before the next shift
        }
      }
      const ease = 1 - Math.exp(-2.4 * clampedDt);
      weightPhase += (weightTarget - weightPhase) * ease;
      const roll = weightSign * weightPhase * LIMITS.weightRoll;
      bones.hips.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
    }

    // --- head glance: a damped random walk with real dwell, biased toward
    // the visitor when they are near and roughly in front. ---
    if (bones.head) {
      glanceTimer -= clampedDt;
      if (glanceTimer <= 0) {
        const towardsPlayer = player && player.distance < 6 && Math.abs(player.yaw) < deg(100)
          ? { yaw: player.yaw, pitch: player.pitch || 0 }
          : null;
        // Noticing a nearby visitor is worth more than routine variety —
        // most glances go to them when they qualify, not all, so a figure
        // still looks around sometimes even with the visitor standing near.
        pickGlanceTarget(towardsPlayer && rand() < 0.7 ? towardsPlayer : null);
        glanceTimer = 1.2 + rand() * 3.2;
      }
      const ease = 1 - Math.exp(-2.2 * clampedDt);
      glanceYaw += (targetYaw - glanceYaw) * ease;
      glancePitch += (targetPitch - glancePitch) * ease;
      glanceYaw = Math.max(-LIMITS.headYaw, Math.min(LIMITS.headYaw, glanceYaw));
      glancePitch = Math.max(-LIMITS.headPitch, Math.min(LIMITS.headPitch, glancePitch));
      const q = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), glanceYaw)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), glancePitch));
      bones.head.quaternion.multiply(q);
    }
  }

  return { update, bones };
}
