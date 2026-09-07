// Runtime biomechanical sanity checks for nearby skeletal humans.
// The scene root is floor-anchored; this module verifies that the animated
// skeleton still looks like an upright person before it is allowed to render.

const RAW_BONES = {
  hips: 'mixamorig:Hips',
  head: 'mixamorig:Head',
  leftFoot: 'mixamorig:LeftFoot',
  rightFoot: 'mixamorig:RightFoot',
};

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

  function isSane({ groundY = actorRoot.position.y, heightMeters = 1.7 } = {}) {
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
    if (points.head.y < points.hips.y + height * 0.16) return false;
    if (points.hips.y < feetY + height * 0.12) return false;
    if (points.head.y < feetY + height * 0.48) return false;

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
