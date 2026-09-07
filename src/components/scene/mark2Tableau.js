// A persistent mid-lowering tableau. The mat and all six principal actors
// remain one composition, independently of the ambient crowd's LOD pool.
import { LEVEL, HOUSE, ROOF_OPENING } from './capernaumDimensions.js';
import { cloneSkinnedMesh } from './sceneResources.js';
import { buildHumanClips, buildPoseClip } from './sceneHumanClips.js';
import { prepareHumanMaterials } from './sceneHumanMaterials.js';

export const TABLEAU = {
  centre: [(ROOF_OPENING.x0 + ROOF_OPENING.x1) / 2, LEVEL.ground + 1.2, (ROOF_OPENING.z0 + ROOF_OPENING.z1) / 2],
  width: 0.88, length: 2.12,
};
const roofY = LEVEL.ground + LEVEL.roof + 0.16;
export const TABLEAU_CAST = [
  { id: 'jesus', model: 'human-jesus', pose: 'teacher', position: [14.35, LEVEL.ground + 0.02, 11.65], target: [16, 12.5] },
  { id: 'paralytic', model: 'human-traveler', pose: 'recline', position: [0, 0.08, 0.88], onMat: true },
  { id: 'carrier-nw', model: 'human-artisan', pose: 'brace', position: [15.05, roofY, 10.56], target: [15.6, 12.2], corner: [-0.44, -1.06], phase: 0.2 },
  { id: 'carrier-ne', model: 'human-traveler', pose: 'brace', position: [17.94, roofY, 11.36], target: [16, 11.5], corner: [0.44, -1.06], phase: 1.8 },
  { id: 'carrier-sw', model: 'human-traveler', pose: 'brace', position: [14.06, roofY, 13.64], target: [16, 13.5], corner: [-0.44, 1.06], phase: 3.1 },
  { id: 'carrier-se', model: 'human-artisan', pose: 'brace', position: [17.0, roofY, 14.44], target: [16.4, 12.8], corner: [0.44, 1.06], phase: 4.6 },
  { id: 'scribe-west', model: 'human-artisan', pose: 'sit', position: [12.67, LEVEL.ground - 0.02, 10.7], target: [14.35, 11.65], audience: true },
  { id: 'scribe-east', model: 'human-traveler', pose: 'sit', position: [18.33, LEVEL.ground - 0.02, 10.6], target: [14.35, 11.65], audience: true },
  { id: 'listener-east', model: 'human-villager', pose: 'listen', position: [17.9, LEVEL.ground + 0.02, 14.35], target: [16, 12.5], audience: true },
  { id: 'seated-west', model: 'human-traveler', pose: 'sit', position: [12.67, LEVEL.ground - 0.02, 12.25], target: [16, 12.5], audience: true, phase: 2 },
  { id: 'seated-east', model: 'human-artisan', pose: 'sit', position: [18.33, LEVEL.ground - 0.02, 12.2], target: [14.35, 11.65], audience: true, phase: 3.3 },
  { id: 'door-listener', model: 'human-artisan', pose: 'listen', position: [14.6, LEVEL.ground + 0.02, 16.6], target: [14.35, 11.65], audience: true, phase: 1.8 },
  { id: 'door-onlooker', model: 'human-villager', pose: 'listen', position: [16.5, LEVEL.ground + 0.02, 16.7], target: [16, 12.5], audience: true, phase: 4.1 },
  { id: 'listener-west', model: 'human-villager', pose: 'listen', position: [13.25, LEVEL.ground + 0.02, 13.65], target: [16, 12.5], audience: true },
];

// Keep the ambient crowd out of the room and its doorway, including any
// future random placement that would otherwise overlap this fixed cast.
export function inTableauArea(x, z) {
  return x > HOUSE.x0 - 0.3 && x < HOUSE.x1 + 0.3 && z > HOUSE.z0 - 0.3 && z < HOUSE.z1 + 1.4;
}

function poseSample(name, t) {
  const breath = Math.sin(t * Math.PI * 2 / 6);
  if (name === 'brace') return {
    kneeling: true, spineLean: 14 + breath * 0.8, headPitch: 18,
    leftLeg: { thighFlex: -12, shinFlex: -95, ankleBend: -20 },
    rightLeg: { thighFlex: -8, shinFlex: -98, ankleBend: -18 },
    left: { armFlex: 32, armAbduct: 6, foreArmAbduct: -24, foreArmFlex: 80 + breath },
    right: { armFlex: 24, armAbduct: 6, foreArmAbduct: -24, foreArmFlex: 104 + breath },
    fingerCurl: 64,
  };
  if (name === 'recline') return {
    spineLean: -2 + breath * 0.35, headPitch: 7,
    left: { armFlex: 4, armAbduct: 3, foreArmFlex: 18, foreArmAbduct: -10, handTwist: 75 },
    right: { armFlex: 3, armAbduct: 3, foreArmFlex: 20, foreArmAbduct: -12, handTwist: -75 },
    leftLeg: { thighFlex: 2, shinFlex: 0 },
    rightLeg: { thighFlex: 3, shinFlex: 1 },
    fingerCurl: 14,
  };
  return {
    spineLean: 1 + breath * 0.4, headPitch: 9,
    left: { armFlex: -2, armAbduct: 5, foreArmFlex: 12 },
    right: { armFlex: 15, armAbduct: 8, foreArmFlex: 56 + breath * 1.2 },
    fingerCurl: 16,
  };
}

export function createMark2Tableau(THREE, { root, onReady } = {}) {
  const group = new THREE.Group(); group.name = 'mark-2-tableau'; group.visible = false; root.add(group);
  const mat = new THREE.Group(); mat.name = 'suspended-mat'; mat.position.fromArray(TABLEAU.centre); group.add(mat);
  const resources = new Set();
  const own = (resource) => { resources.add(resource); return resource; };
  const timber = own(new THREE.MeshStandardMaterial({ color: 0x765332, roughness: 0.93 }));
  const cloth = own(new THREE.MeshStandardMaterial({ color: 0xb7a07b, roughness: 1, side: THREE.DoubleSide }));
  const ropeMaterial = own(new THREE.MeshStandardMaterial({ color: 0xc5ab7a, roughness: 1 }));
  const addMesh = (geometry, material, parent, position = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(own(geometry), material); mesh.position.fromArray(position);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  // A lightly sagging woven surface, supported by two rails and crosspieces.
  const surface = new THREE.PlaneGeometry(TABLEAU.width, TABLEAU.length, 12, 24);
  surface.rotateX(-Math.PI / 2);
  const positions = surface.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i); const z = positions.getZ(i);
    positions.setY(i, -0.045 * (1 - (x / 0.44) ** 2) + 0.003 * Math.sin(z * 80));
  }
  surface.computeVertexNormals(); addMesh(surface, cloth, mat);
  for (const x of [-0.44, 0.44]) {
    const rail = addMesh(new THREE.CylinderGeometry(0.026, 0.032, 2.24, 10), timber, mat, [x, -0.025, 0]); rail.rotation.x = Math.PI / 2;
  }
  for (const z of [-1.06, 1.06]) {
    const bar = addMesh(new THREE.CylinderGeometry(0.021, 0.024, 0.96, 10), timber, mat, [0, -0.025, z]); bar.rotation.z = Math.PI / 2;
  }
  // Visible crosswise bindings also make the plain fabric read as woven.
  for (let i = 0; i < 25; i++) {
    const weave = addMesh(new THREE.CylinderGeometry(0.0025, 0.0025, TABLEAU.width, 4), ropeMaterial, mat, [0, -0.004, -1.01 + i * 0.084]);
    weave.rotation.z = Math.PI / 2;
  }
  const pillow = addMesh(new THREE.SphereGeometry(1, 16, 8), cloth, mat, [0, 0.035, -0.78]); pillow.scale.set(0.22, 0.07, 0.19);
  const models = new Map(); const actors = new Map(); const clipsByModel = new Map();
  let ready = false; let disposed = false; let time = 0;
  const up = new THREE.Vector3(0, 1, 0); const direction = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3(); const matCorner = new THREE.Vector3();
  const ropeGeometry = own(new THREE.CylinderGeometry(0.011, 0.011, 1, 6));

  function acceptAssets(assetGroup) {
    if (disposed || ready) return;
    for (const [id, model] of Object.entries(assetGroup?.models || {})) {
      let skinned = false; model.scene?.traverse((node) => { if (node.isSkinnedMesh) skinned = true; });
      if (skinned && ['Hips', 'LeftArm', 'LeftUpLeg', 'LeftHand', 'RightHand'].every((bone) => model.scene.getObjectByName(`mixamorig${bone}`))) models.set(id, model);
    }
    if (!TABLEAU_CAST.every((entry) => models.has(entry.model))) return;
    for (const entry of TABLEAU_CAST) {
      const model = models.get(entry.model);
      prepareHumanMaterials(model.scene);
      if (!clipsByModel.has(entry.model)) {
        const clips = buildHumanClips(THREE, model.scene);
        for (const name of ['brace', 'recline', 'teacher']) clips[name] = buildPoseClip(THREE, model.scene, name, 6, (t) => poseSample(name, t));
        clipsByModel.set(entry.model, clips);
      }
      const actorRoot = cloneSkinnedMesh(model.scene); actorRoot.name = `mark-2-${entry.id}`;
      actorRoot.position.fromArray(entry.position);
      if (entry.onMat) { actorRoot.rotation.x = -Math.PI / 2; mat.add(actorRoot); }
      else {
        actorRoot.rotation.y = Math.atan2(entry.target[0] - entry.position[0], entry.target[1] - entry.position[2]); group.add(actorRoot);
      }
      const meshes = [[], []];
      actorRoot.traverse((node) => {
        if (!node.isMesh) return;
        node.frustumCulled = false; node.castShadow = true; node.receiveShadow = true;
        meshes[node.name.includes('_LOD1') ? 1 : 0].push(node);
      });
      const mixer = new THREE.AnimationMixer(actorRoot);
      const clip = clipsByModel.get(entry.model)[entry.pose];
      if (clip) { const action = mixer.clipAction(clip).play(); action.time = entry.phase || 0; mixer.update(0); }
      const find = (name) => actorRoot.getObjectByName(`mixamorig${name}`);
      const rope = entry.corner ? Array.from({ length: 3 }, () => {
        const segment = new THREE.Mesh(ropeGeometry, ropeMaterial); segment.castShadow = true; group.add(segment); return segment;
      }) : null;
      const actor = { entry, root: actorRoot, mixer, meshes, rope, hands: [find('LeftHand'), find('RightHand')], points: Array.from({ length: 4 }, () => new THREE.Vector3()) };
      actors.set(entry.id, actor);
    }
    ready = true; group.visible = true; update({ delta: 0, reducedMotion: true }); onReady?.();
  }

  function update({ delta = 0.016, camera = null, quality = 'balanced', reducedMotion = false } = {}) {
    if (!ready || disposed) return;
    const dt = reducedMotion ? 0 : Math.min(0.1, Math.max(0, delta)); time += dt;
    const profile = quality?.name || quality;
    if (camera) camera.getWorldPosition(cameraPosition);
    const distance = camera ? cameraPosition.distanceTo(mat.position) : 0;
    group.visible = distance < 65;
    if (!group.visible) return;
    mat.position.x = TABLEAU.centre[0] + Math.sin(time * 0.65) * 0.009;
    mat.rotation.z = Math.sin(time * 0.52) * 0.004;
    for (const actor of actors.values()) {
      actor.root.visible = !actor.entry.audience || profile !== 'low' || actor.entry.id.startsWith('scribe');
      const lod = profile === 'high' && ['jesus', 'paralytic'].includes(actor.entry.id) && distance < 12 ? 0 : 1;
      const selected = actor.meshes[lod].length ? lod : 0;
      actor.meshes.forEach((meshes, i) => meshes.forEach((mesh) => { mesh.visible = i === selected; }));
      actor.mixer.update(dt);
    }
    group.updateMatrixWorld(true);
    for (const actor of actors.values()) {
      if (!actor.rope) continue;
      const points = actor.points;
      matCorner.set(actor.entry.corner[0], 0, actor.entry.corner[1]);
      points[0].copy(matCorner); mat.localToWorld(points[0]); group.worldToLocal(points[0]);
      actor.hands.forEach((hand, i) => {
        // Hand bones point along local Y; the rope passes through the palm,
        // not through the wrist. Both grips remain attached during breathing.
        points[i + 1].set(0, 0.055, 0); hand.localToWorld(points[i + 1]); group.worldToLocal(points[i + 1]);
      });
      points[3].set(actor.entry.position[0], roofY + 0.045, actor.entry.position[2] + 0.28);
      actor.rope.forEach((segment, i) => {
        direction.subVectors(points[i + 1], points[i]);
        segment.position.copy(points[i]).add(points[i + 1]).multiplyScalar(0.5);
        segment.scale.set(1, direction.length(), 1);
        segment.quaternion.setFromUnitVectors(up, direction.normalize());
      });
    }
  }

  function queryClearance(x, z, radius = 0.35, y = 0) {
    if (!ready || disposed) return { collides: false, pushX: 0, pushZ: 0 };
    const candidates = TABLEAU_CAST.filter((entry) => !entry.onMat && Math.abs(entry.position[1] - y) < 1.8)
      .map((entry) => ({ x: entry.position[0], z: entry.position[2], radius: entry.pose === 'brace' ? 0.5 : 0.3 }));
    if (Math.abs(y - LEVEL.ground) < 1) {
      for (const dz of [-0.65, 0, 0.65]) candidates.push({ x: TABLEAU.centre[0], z: TABLEAU.centre[2] + dz, radius: 0.5 });
    }
    for (const other of candidates) {
      const dx = x - other.x; const dz = z - other.z; const distance = Math.hypot(dx, dz); const gap = radius + other.radius;
      if (distance < gap) return { collides: true, pushX: distance > 0.001 ? dx / distance * (gap - distance) : gap, pushZ: distance > 0.001 ? dz / distance * (gap - distance) : 0 };
    }
    return { collides: false, pushX: 0, pushZ: 0 };
  }

  function dispose() {
    if (disposed) return; disposed = true;
    const skeletons = new Set();
    for (const actor of actors.values()) {
      actor.mixer.stopAllAction(); actor.mixer.uncacheRoot(actor.root);
      actor.root.traverse((node) => { if (node.skeleton) skeletons.add(node.skeleton); });
    }
    skeletons.forEach((skeleton) => skeleton.dispose());
    // Clones share asset geometry and materials; only locally created props
    // are owned here. Remove the group before the scenery disposal traversal.
    root.remove(group); resources.forEach((resource) => resource.dispose());
    actors.clear(); models.clear(); clipsByModel.clear();
  }
  return { group, mat, acceptAssets, update, queryClearance, dispose, getActors: () => actors, isReady: () => ready && !disposed, getElapsed: () => time };
}
