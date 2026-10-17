// Runtime biomechanical sanity checks for nearby skeletal humans.
// The scene root is floor-anchored; this module verifies that the animated
// skeleton still looks like an upright person before it is allowed to render.

const RAW_BONES = {
  hips: 'mixamorig:Hips',
  head: 'mixamorig:Head',
  leftFoot: 'mixamorig:LeftFoot',
  rightFoot: 'mixamorig:RightFoot',
};

// What a pose may look like, as fractions of the person's height: how far the head must stay over the pelvis,
// the pelvis over the feet, and the head over the feet. `upright` is the check as it was written, for a person
// standing or walking. The others are for captured clips that legitimately go somewhere an upright person does
// not, with the least they measured on every body (adults, elders and children), so a pose that is only a
// person doing what the clip says is not mistaken for an inverted rig, and replaced for a frame with the baked
// idle: that was a person flashing into the stiff A-pose in a loop. Every posture still keeps the head clear of
// the floor and the feet near the surface, which is what an inverted or displaced skeleton breaks.
export const POSTURES = {
  upright: { headOverHips: 0.16, hipsOverFeet: 0.12, headOverFeet: 0.48 },
  // Leaning in to speak: the head may be only a hand's breadth over the pelvis (talk-chat, 0.10 of a height).
  lean: { headOverHips: 0.04, hipsOverFeet: 0.12, headOverFeet: 0.48 },
  // Bent at the waist to something at the feet: the head goes level with, and a little below, the pelvis.
  stoop: { headOverHips: -0.15, hipsOverFeet: 0.2, headOverFeet: 0.2 },
  // On the knees: the head lower than a standing person's is by right.
  kneel: { headOverHips: 0.16, hipsOverFeet: 0.1, headOverFeet: 0.38 },
  // Sitting on the ground: the pelvis is at the feet's height, which is what sitting on the ground is.
  'ground-seat': { headOverHips: 0.06, hipsOverFeet: -0.08, headOverFeet: 0.1 },
};

// The posture of each captured clip that is not upright. A clip not named here is upright, and is held to it.
export const CLIP_POSTURE = {
  'talk-chat': 'lean',
  'pick-up': 'stoop',
  'kneel-idle': 'kneel',
  'kneel-pray': 'kneel',
  'sit-floor': 'ground-seat',
  'sit-floor-reclined': 'ground-seat',
};

// The posture of a named action: a captured clip's `life:` prefix is the controller's, not the clip's.
export function postureOf(actionName) {
  return CLIP_POSTURE[String(actionName || '').replace(/^life:/, '')] || 'upright';
}

function finiteVector(v) {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

export function createHumanPoseSafety(THREE, actorRoot) {
  const find = (name) => actorRoot.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)) || null;
  const bones = Object.fromEntries(Object.entries(RAW_BONES).map(([key, name]) => [key, find(name)]));
  const points = {
    hips: new THREE.Vector3(), head: new THREE.Vector3(), leftFoot: new THREE.Vector3(), rightFoot: new THREE.Vector3(),
  };

  function sample() {
    actorRoot.updateMatrixWorld(true);
    for (const key of Object.keys(points)) {
      if (bones[key]) bones[key].getWorldPosition(points[key]);
    }
    return points;
  }

  // `posture` is a name from POSTURES, or several: while one action fades into another the body is partway
  // between them, so it is held to the least demanding of the postures that are showing.
  function isSane({ groundY = actorRoot.position.y, heightMeters = 1.7, posture = 'upright' } = {}) {
    // Minimal/mock rigs keep working; this guard only judges a pose when all
    // landmarks needed for an upright-body check are present.
    if (!bones.hips || !bones.head || !bones.leftFoot || !bones.rightFoot) return true;
    sample();
    if (Object.values(points).some((point) => !finiteVector(point))) return false;

    const feetY = (points.leftFoot.y + points.rightFoot.y) * 0.5;
    const height = Math.max(1.2, heightMeters || 1.7);

    // Head must remain above pelvis, pelvis above feet, and the overall
    // vertical ordering must still resemble a standing/kneeling human rather
    // than a somersaulted rig. Thresholds are intentionally generous enough
    // for walking, kneeling and stair/ramp motion.
    const limits = [].concat(posture).map((name) => POSTURES[name] || POSTURES.upright);
    const least = (field) => Math.min(...limits.map((limit) => limit[field]));
    if (points.head.y < points.hips.y + height * least('headOverHips')) return false;
    if (points.hips.y < feetY + height * least('hipsOverFeet')) return false;
    if (points.head.y < feetY + height * least('headOverFeet')) return false;

    // Because the actor root itself is placed on floorAt(), both feet should
    // stay in a broad human-scale band around that surface. This catches a
    // whole skeleton translating upward/downward inside an otherwise anchored
    // scene root without falsely rejecting a normal swing foot.
    const low = groundY - height * 0.18;
    const high = groundY + height * 0.42;
    if (points.leftFoot.y < low || points.rightFoot.y < low) return false;
    if (points.leftFoot.y > high && points.rightFoot.y > high) return false;

    return true;
  }

  return { bones, sample, isSane };
}
