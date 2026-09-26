// The visitor's own body, seen from behind in the third-person view.
//
// Everyone else in the scene is glimpsed; this one person is watched from a few
// metres back for the whole visit, so the three things that betray a game
// character are the three this module is built around:
//
//   The feet. Walking and jogging are driven by distance, not by the clock —
//   the clip's phase is how far the body has actually gone, measured in the
//   planted foot's own stride (see scripts/humans/retarget_player_mixamo.mjs),
//   so a foot on the ground stays where it was put. Walk and jog share one
//   phase and cross-fade by speed, so changing pace never scissors the legs.
//
//   The silhouette. A third of the village is built from the same traveller
//   model, so from behind the visitor has to be picked out at a glance without
//   being dressed as anyone in particular: a tunic of darker undyed wool, a
//   cloth over the head against the sun, a bag on a strap, and a walking staff
//   held where the fingers actually close (the grip is measured on the skinned
//   hand when the clips are authored, not guessed here).
//
//   The body before the body. The skinned model arrives with the scene's
//   character assets, seconds after the scene itself; until then a light robed
//   figure walks in its place, so the visitor is never a floating camera.
//
// Period notes, since this is a claim about what a person looked like. Men in
// first-century Galilee wore a knee-length tunic of undyed wool or linen,
// belted, with a mantle over it for going out; they commonly went bareheaded,
// and a cloth over the head is the traveller's concession to the sun rather
// than a rule. A staff and a bag are what a traveller carried: Matthew 10:10
// and Luke 9:3 have Jesus tell the Twelve to take neither, while Mark 6:8 lets
// them keep the staff. There is no mantle here because the model has none, and faking
// cloth on a skeleton reads worse than its absence; for the same reason there
// are no tzitzit, which hang from a mantle's corners (Numbers 15:38).
//
// Contract (shared with Scene.jsx and sceneThirdPerson.js):
//
//   createPlayerAvatar(THREE, { parent, quality, reducedMotion }) → avatar
//
//   avatar.group                 THREE.Group, already added to `parent`
//   avatar.ready                 true once a skinned human model is in use
//   avatar.acceptAssets(group)   idempotent; takes a loaded asset group
//                                ({ groupKey, models: { id: gltf } }) and
//                                upgrades to a skinned model when one is there
//   avatar.update({ delta, x, y, z, heading, travelled, running, reducedMotion })
//                                → { footfalls }   heel strikes this frame
//     heading   — yaw of the body in three.js model convention:
//                 root.rotation.y = heading, so the avatar walks toward
//                 (sin(heading), cos(heading)) in world XZ.
//     travelled — metres actually covered this frame (after collision)
//   avatar.setOpacity(value)     0..1, for fading out as the camera closes in
//   avatar.setVisible(bool)
//   avatar.getHeadPosition(target) → target, world position of the head
//   avatar.metersPerStep         for callers that pace footsteps themselves
//   avatar.dispose()
//
// Also, for tests and tools: avatar.loaded (a promise that settles once the
// clips have been fetched or given up on) and avatar.gait (the live blend).
//
// three.js is passed in, as everywhere in this directory, so the module stays
// importable in jsdom.

import { cloneSkinnedMesh } from './sceneResources.js';
import { prepareHumanMaterials } from './sceneHumanMaterials.js';
import { createHumanPoseSafety } from './sceneHumanSafety.js';
import { FIGURE, SKIN, HEADCLOTH } from './sceneFigures.js';

// Which of the shipped characters to wear, best first. The traveller is the
// one whose clothes read as a man on a journey; the others are fallbacks for a
// scene whose asset group carries only them.
export const AVATAR_MODELS = ['human-traveler', 'human-artisan', 'human-villager'];

// Undyed wool from a darker fleece, warmer and deeper than the cream most of
// the crowd wears — the one thing about the visitor that should read at forty
// metres. It multiplies the tunic texture rather than replacing it.
export const TUNIC_TINT = 0x9c7a5c;
const LINEN = 0xd9cdb2;
const LEATHER = 0x5b4130;
const STRAP = 0x463324;
const STAFF_WOOD = 0x6b5035;

// Speeds, metres per second. Below IDLE the body is standing; the walk runs to
// WALK_TOP and the jog takes over by JOG_FROM, cross-faded in between.
export const GAIT = { idle: 0.15, walkTop: 2.1, jogFrom: 2.9 };
// How long it takes to settle into standing, and to start moving from it.
const SETTLE_SECONDS = 0.25;
const START_SECONDS = 0.15;
const JOG_BLEND_SECONDS = 0.2;

// A walking staff, shoulder high. The grip sits this far above the foot of it,
// which is where the hand was when the grip was measured in the idle pose.
const STAFF_LENGTH = 1.62;
const STAFF_GRIP_HEIGHT = 1.114;

// Metres per stride if the authored clips never arrive, from the baked walk in
// every shipped model (sceneHumanManifest.js's walkMetersPerCycle).
const BAKED_WALK_METERS = 1.3;

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const frac = (value) => value - Math.floor(value);

// Eases `current` toward `target` by a first-order lag with time constant
// `seconds`, exact for any frame length.
function approach(current, target, delta, seconds) {
  if (!(delta > 0)) return current;
  return target + (current - target) * Math.exp(-delta / Math.max(1e-3, seconds));
}

// Counts how many of the phases in `marks` were passed going from `from` to
// `to` (both in cycles, `to` ≥ `from`). A foot strikes once per cycle at its
// mark, so this is the number of footfalls in the step between two frames.
export function crossings(from, to, marks) {
  if (!(to > from)) return 0;
  let count = 0;
  for (const mark of marks) {
    count += Math.floor(to - mark) - Math.floor(from - mark);
  }
  return count;
}

// The clip JSON is fetched once per page, not once per scene visit.
let clipsPromise = null;
function loadClipData() {
  clipsPromise ||= import('./playerAvatarClips.json')
    .then((module) => module.default || module)
    .catch(() => null);
  return clipsPromise;
}

function findModel(assetGroup) {
  const models = assetGroup?.models || {};
  for (const id of AVATAR_MODELS) {
    const model = models[id];
    if (!model?.scene) continue;
    let skinned = false;
    model.scene.traverse((node) => { if (node.isSkinnedMesh) skinned = true; });
    if (skinned && model.animations?.some((clip) => clip.name === 'idle')) return { id, model };
  }
  return null;
}

// --- measuring the body ------------------------------------------------------
// Attachments are fitted to the skinned mesh as it stands, not to numbers
// someone wrote down for an average man: the skull, the flank and the back are
// read off the vertices, in the model's own space (+Y up, +Z forward, +X the
// figure's left).

function sampleVertices(THREE, root, filter, stride = 2) {
  const points = [];
  const point = new THREE.Vector3();
  root.traverse((node) => {
    if (!node.isSkinnedMesh || !node.visible || !filter(node)) return;
    const count = node.geometry.attributes.position.count;
    for (let i = 0; i < count; i += stride) {
      node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld);
      points.push(point.x, point.y, point.z);
    }
  });
  return points;
}

function extentNear(points, { axis, x, y, width = 0.05 }) {
  // The most extreme vertex along `axis` ('+x' | '-z') among those within
  // `width` of (x, y) — the surface of the body at that spot.
  let best = axis.startsWith('+') ? -Infinity : Infinity;
  const component = axis[1] === 'x' ? 0 : 2;
  for (let i = 0; i < points.length; i += 3) {
    if (Math.abs(points[i + 1] - y) > width) continue;
    if (x !== undefined && Math.abs(points[i] - x) > width) continue;
    const value = points[i + component];
    best = axis.startsWith('+') ? Math.max(best, value) : Math.min(best, value);
  }
  return Number.isFinite(best) ? best : null;
}

// --- the fallback body ---------------------------------------------------------
// The same proportions and colours as the village's instanced people
// (sceneFigures.js), as one small rig: a robe, a head, a cloth, two arms on
// shoulder pivots and a staff. Its arms swing with distance, as the real walk
// does, so the stand-in does not glide.

function createFallbackBody(THREE, own) {
  const group = new THREE.Group();
  group.name = 'player-avatar-fallback';
  const robeMaterial = own.material(new THREE.MeshStandardMaterial({ color: TUNIC_TINT, roughness: 0.95 }));
  const skinMaterial = own.material(new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.85 }));
  const clothMaterial = own.material(new THREE.MeshStandardMaterial({ color: HEADCLOTH, roughness: 0.95 }));
  const woodMaterial = own.material(new THREE.MeshStandardMaterial({ color: STAFF_WOOD, roughness: 0.8 }));

  const robe = new THREE.Mesh(own.geometry(new THREE.CylinderGeometry(
    FIGURE.robeTop, FIGURE.robeHem, FIGURE.robeHeight, 12, 1,
  )), robeMaterial);
  robe.position.y = FIGURE.robeBase + FIGURE.robeHeight / 2;
  const head = new THREE.Mesh(own.geometry(new THREE.SphereGeometry(FIGURE.headRadius, 12, 9)), skinMaterial);
  head.position.y = FIGURE.robeHeight + FIGURE.headY;
  const cloth = new THREE.Mesh(own.geometry(new THREE.SphereGeometry(
    FIGURE.clothRadius, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62,
  )), clothMaterial);
  cloth.position.y = FIGURE.robeHeight + FIGURE.clothY;
  cloth.rotation.x = -0.25;

  const armGeometry = own.geometry(new THREE.CylinderGeometry(FIGURE.armRadius, FIGURE.armRadius * 0.9, FIGURE.armLength, 6));
  armGeometry.translate(0, -FIGURE.armLength / 2, 0);
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * FIGURE.shoulderX, FIGURE.shoulderY, 0);
    pivot.add(new THREE.Mesh(armGeometry, robeMaterial));
    group.add(pivot);
    return pivot;
  });
  const staff = new THREE.Mesh(own.geometry(new THREE.CylinderGeometry(0.014, 0.017, STAFF_LENGTH, 6)), woodMaterial);
  staff.position.set(-FIGURE.shoulderX - 0.12, STAFF_LENGTH / 2, 0.16);

  group.add(robe, head, cloth, staff);
  group.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });

  return {
    group,
    pose(phase, moving) {
      // Arms swing against each other once per stride; standing, they hang.
      const swing = Math.sin(phase * Math.PI * 2) * 0.45 * moving;
      arms[0].rotation.x = swing;
      arms[1].rotation.x = -swing;
      robe.position.y = FIGURE.robeBase + FIGURE.robeHeight / 2 + Math.abs(Math.sin(phase * Math.PI * 2)) * 0.02 * moving;
    },
  };
}

// --- the traveller's things ---------------------------------------------------

function buildHeadCloth(THREE, own, points) {
  // The skull is everything above the jaw: its centre and radii from the
  // vertices, and a cap of cloth a little larger than it, drawn lower at the
  // back than the front, with a fall of cloth down the nape.
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity; let top = -Infinity;
  const jaw = 1.5;
  for (let i = 0; i < points.length; i += 3) {
    if (points[i + 1] < jaw) continue;
    minX = Math.min(minX, points[i]); maxX = Math.max(maxX, points[i]);
    minZ = Math.min(minZ, points[i + 2]); maxZ = Math.max(maxZ, points[i + 2]);
    top = Math.max(top, points[i + 1]);
  }
  if (!Number.isFinite(top)) return null;
  const centre = new THREE.Vector3((minX + maxX) / 2, (jaw + top) / 2 + 0.01, (minZ + maxZ) / 2);
  const radii = new THREE.Vector3((maxX - minX) / 2 + 0.018, (top - jaw) / 2 + 0.02, (maxZ - minZ) / 2 + 0.02);

  const material = own.material(new THREE.MeshStandardMaterial({ color: LINEN, roughness: 0.96, side: THREE.DoubleSide }));
  const group = new THREE.Group();
  group.name = 'player-avatar-headcloth';
  group.position.copy(centre);

  const cap = new THREE.Mesh(own.geometry(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.6)), material);
  cap.scale.copy(radii);
  // Tipped back, so the brow shows and the cloth covers the back of the head.
  cap.rotation.x = -0.32;
  group.add(cap);

  // The fall down the back of the neck: a curved sheet from the back of the
  // cap to the top of the shoulders.
  const fall = own.geometry(new THREE.PlaneGeometry(radii.x * 1.9, 0.2, 6, 4));
  const position = fall.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const u = position.getX(i) / (radii.x * 0.95);
    const v = (position.getY(i) + 0.1) / 0.2; // 0 at the hem, 1 at the cap
    // Wraps round the neck and flares out a little toward the hem.
    position.setZ(i, -Math.sqrt(Math.max(0, 1 - u * u * 0.8)) * radii.z * (0.95 + (1 - v) * 0.25));
  }
  fall.computeVertexNormals();
  const drape = new THREE.Mesh(fall, material);
  drape.position.set(0, -radii.y * 0.95, -0.01);
  group.add(drape);
  return group;
}

function buildBag(THREE, own, points, hipsY) {
  // A cloth bag on the left hip, hung from a strap over the right shoulder and
  // across the back. The flank and the back are read off the body so the bag
  // hangs against the tunic rather than through it.
  const flank = extentNear(points, { axis: '+x', y: hipsY - 0.06, width: 0.06 }) ?? 0.17;
  const bagMaterial = own.material(new THREE.MeshStandardMaterial({ color: LEATHER, roughness: 0.85 }));
  const strapMaterial = own.material(new THREE.MeshStandardMaterial({ color: STRAP, roughness: 0.8 }));

  const bag = new THREE.Mesh(own.geometry(new THREE.SphereGeometry(1, 12, 9)), bagMaterial);
  bag.scale.set(0.055, 0.13, 0.12);
  bag.position.set(flank + 0.045, hipsY - 0.1, 0.0);
  bag.name = 'player-avatar-bag';

  // The strap runs from the bag up the back to the right shoulder and over
  // it. Each point sits just proud of the back at its own height.
  const back = (x, y) => (extentNear(points, { axis: '-z', x, y, width: 0.05 }) ?? -0.12) - 0.014;
  const shoulderY = 1.4;
  const route = [
    new THREE.Vector3(flank + 0.03, hipsY + 0.02, 0.0),
    new THREE.Vector3(flank - 0.02, hipsY + 0.12, back(flank - 0.02, hipsY + 0.12) + 0.02),
    new THREE.Vector3(0.05, 1.18, back(0.05, 1.18)),
    new THREE.Vector3(-0.1, shoulderY - 0.04, back(-0.1, shoulderY - 0.04)),
    new THREE.Vector3(-0.15, shoulderY + 0.03, -0.02),
    new THREE.Vector3(-0.14, shoulderY - 0.03, 0.09),
  ];
  const strap = new THREE.Mesh(
    own.geometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(route), 28, 0.011, 4, false)),
    strapMaterial,
  );
  strap.name = 'player-avatar-strap';
  return { bag, strap };
}

function buildStaff(THREE, own, grip) {
  // Built along +Y with its foot at the origin, then set in the right hand so
  // the shaft passes through the fist along the measured grip axis.
  const material = own.material(new THREE.MeshStandardMaterial({ color: STAFF_WOOD, roughness: 0.78 }));
  const geometry = own.geometry(new THREE.CylinderGeometry(grip.radius * 0.9, grip.radius * 1.12, STAFF_LENGTH, 8));
  geometry.translate(0, STAFF_LENGTH / 2, 0);
  const staff = new THREE.Mesh(geometry, material);
  staff.name = 'player-avatar-staff';
  return staff;
}

// --- the avatar ---------------------------------------------------------------

// `quality` and `reducedMotion` are accepted for the contract's sake and not
// yet used: there is one visitor and it is always near, so there is nothing to
// thin out, and the gait is the body's own movement, not the camera's, so it
// stays under reduced motion.
export function createPlayerAvatar(THREE, { parent = null } = {}) {
  const group = new THREE.Group();
  group.name = 'player-avatar';
  if (parent) parent.add(group);

  // Everything this avatar created and must dispose — never the shared model's
  // own geometry or textures, which belong to the asset session.
  const ownedGeometries = new Set();
  const ownedMaterials = new Set();
  const own = {
    geometry: (g) => { ownedGeometries.add(g); return g; },
    material: (m) => { ownedMaterials.add(m); return m; },
  };

  const fallback = createFallbackBody(THREE, own);
  group.add(fallback.group);

  let disposed = false;
  let clipData;
  let pendingModel = null;
  let body = null; // the skinned model, once it is in use
  let visible = true;
  let opacity = 1;
  let transparentNow = false;
  const headPoint = new THREE.Vector3();

  // The live gait. `phase` is in walk cycles; everything else is a 0..1 blend.
  const gait = {
    phase: 0, move: 0, jog: 0, speed: 0,
    walkMeters: BAKED_WALK_METERS, jogMeters: BAKED_WALK_METERS * 1.35,
    // Heel strikes, in walk-phase cycles, for each foot at walk and at jog.
    walkMarks: [0, 0.5], jogMarks: [0, 0.5], jogOffset: 0,
  };

  function setMaterialsOpacity() {
    const wantTransparent = opacity < 0.999;
    const flip = wantTransparent !== transparentNow;
    transparentNow = wantTransparent;
    for (const material of ownedMaterials) {
      material.opacity = opacity;
      if (flip) {
        material.transparent = wantTransparent;
        material.needsUpdate = true;
      }
    }
  }

  function applyVisibility() {
    group.visible = visible && opacity > 0.02;
  }

  function instantiate() {
    if (disposed || body || !pendingModel || clipData === undefined) return;
    const { model } = pendingModel;
    const root = cloneSkinnedMesh(model.scene);
    root.name = 'player-avatar-body';

    // Own copies of every material, so the tint and the fade never touch the
    // crowd members who share this model. Normalised the same way the crowd's
    // are, whether or not that has happened on the shared source yet.
    const copies = new Map();
    root.traverse((node) => {
      if (!node.isMesh) return;
      const swap = (material) => {
        if (!copies.has(material)) copies.set(material, own.material(material.clone()));
        return copies.get(material);
      };
      node.material = Array.isArray(node.material) ? node.material.map(swap) : swap(node.material);
      // The visitor is always close to the lens: the detailed mesh only.
      if (node.name.includes('_LOD1')) node.visible = false;
      node.castShadow = true;
      node.receiveShadow = true;
      // Skinning moves the limbs well outside the bind-pose bounds.
      node.frustumCulled = false;
    });
    prepareHumanMaterials(root);
    for (const material of copies.values()) {
      if (/^cloth/i.test(material.name)) material.color.multiply(new THREE.Color(TUNIC_TINT));
    }

    // --- clips ---
    const mixer = new THREE.AnimationMixer(root);
    const baked = (name) => model.animations.find((clip) => clip.name === name) || null;
    let clips;
    if (clipData?.clips) {
      // AnimationClip.parse copies the JSON's uuid, and the authored JSON has
      // none — so all three would share `undefined`, and the mixer, which
      // caches actions by clip uuid, would hand back one action for all of
      // them. Each gets its own.
      const parse = (json) => {
        const clip = THREE.AnimationClip.parse(json);
        clip.uuid = THREE.MathUtils.generateUUID();
        return clip;
      };
      clips = {
        idle: parse(clipData.clips.idle.clip),
        walk: parse(clipData.clips.walk.clip),
        jog: parse(clipData.clips.jog.clip),
      };
      const { walk, jog } = clipData.clips;
      gait.walkMeters = walk.metersPerCycle;
      gait.jogMeters = jog.metersPerCycle;
      // Both clips are driven from one phase, counted in walk cycles. The jog
      // is offset so that its left heel strike lands where the walk's does —
      // then a cross-fade blends two legs doing the same thing at the same
      // moment, rather than one leg planting while the other swings.
      gait.walkMarks = walk.footfalls.slice(0, 2);
      gait.jogOffset = jog.footfalls[0] - walk.footfalls[0];
      gait.jogMarks = jog.footfalls.slice(0, 2).map((mark) => mark - gait.jogOffset);
    } else {
      clips = { idle: baked('idle'), walk: baked('walk'), jog: baked('walk') };
      gait.walkMeters = BAKED_WALK_METERS;
      gait.jogMeters = BAKED_WALK_METERS;
      gait.walkMarks = [0, 0.5];
      gait.jogMarks = [0, 0.5];
      gait.jogOffset = 0;
    }
    const actions = {};
    for (const [name, clip] of Object.entries(clips)) {
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      action.play();
      action.setEffectiveWeight(name === 'idle' ? 1 : 0);
      // Walk and jog are posed from distance; only the idle runs on the clock.
      if (name !== 'idle') action.paused = true;
      actions[name] = action;
    }
    mixer.update(0);
    root.updateMatrixWorld(true);

    // --- the traveller's things, fitted to this body in its idle pose ---
    // The body and its tunic for the bag and strap; the head and its hair for
    // the head cloth. Mesh names are the character pipeline's: 'Skin_LOD0',
    // 'Skinwdg_mycenaean_tunic_LOD0', 'Skinshort04_LOD0' and so on.
    const isDetailed = (node) => node.name.endsWith('_LOD0');
    const points = sampleVertices(THREE, root, (node) => isDetailed(node) && /^Skin(_|wdg_)/.test(node.name));
    const headPoints = sampleVertices(THREE, root, (node) => isDetailed(node) && /^Skin(_|short|long)/.test(node.name), 1);
    const find = (name) => root.getObjectByName(`mixamorig${name}`);
    const bones = { hips: find('Hips'), spine1: find('Spine1'), head: find('Head'), hand: find('RightHand') };
    const hipsY = bones.hips ? bones.hips.getWorldPosition(new THREE.Vector3()).y : 0.93;
    const attachments = {};

    const cloth = buildHeadCloth(THREE, own, headPoints);
    if (cloth && bones.head) {
      cloth.updateMatrixWorld(true);
      bones.head.attach(cloth);
      attachments.headCloth = cloth;
    }
    const { bag, strap } = buildBag(THREE, own, points, hipsY);
    if (bones.hips) {
      bag.updateMatrixWorld(true);
      bones.hips.attach(bag);
      attachments.bag = bag;
    }
    if (bones.spine1) {
      strap.updateMatrixWorld(true);
      bones.spine1.attach(strap);
      attachments.strap = strap;
    }
    // The staff only makes sense when the arm is posed to hold it, which the
    // authored clips do and the baked ones do not.
    const grip = clipData?.grip;
    if (grip && bones.hand) {
      const staff = buildStaff(THREE, own, grip);
      const axis = new THREE.Vector3().fromArray(grip.axis).normalize();
      // Which way along the grip axis is down, read in the idle pose.
      const worldAxis = axis.clone().transformDirection(bones.hand.matrixWorld);
      const down = worldAxis.y > 0 ? axis.clone().negate() : axis;
      // The shaft was built with its foot at the origin, pointing up (+Y): its
      // foot goes the grip height below the fist along the axis, and it is
      // turned to run from there back up through the grip.
      staff.position.fromArray(grip.position).addScaledVector(down, STAFF_GRIP_HEIGHT);
      staff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), down.clone().negate());
      bones.hand.add(staff);
      attachments.staff = staff;
    }
    for (const attachment of Object.values(attachments)) {
      attachment.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
    }

    group.add(root);
    fallback.group.visible = false;
    body = {
      root, mixer, actions, attachments, bones,
      poseSafety: createHumanPoseSafety(THREE, root),
      insane: 0,
    };
    setMaterialsOpacity();
    avatar.ready = true;
  }

  function poseBody(delta) {
    const { actions, mixer } = body;
    const idleWeight = 1 - gait.move;
    const walkWeight = gait.move * (1 - gait.jog);
    const jogWeight = gait.move * gait.jog;
    actions.idle?.setEffectiveWeight(idleWeight);
    if (actions.walk) {
      actions.walk.setEffectiveWeight(walkWeight);
      actions.walk.time = frac(gait.phase) * actions.walk.getClip().duration;
    }
    if (actions.jog) {
      actions.jog.setEffectiveWeight(jogWeight);
      actions.jog.time = frac(gait.phase + gait.jogOffset) * actions.jog.getClip().duration;
    }
    mixer.update(delta);
  }

  const avatar = {
    group,
    ready: false,
    get metersPerStep() {
      return gait.walkMeters / 2;
    },
    gait,
    loaded: null,

    acceptAssets(assetGroup) {
      if (disposed || body || pendingModel) return;
      const found = findModel(assetGroup);
      if (!found) return;
      pendingModel = found;
      instantiate();
    },

    update({
      delta = 0, x = 0, y = 0, z = 0, heading = 0, travelled = 0,
    } = {}) {
      if (disposed) return { footfalls: 0 };
      const dt = Math.min(Math.max(delta, 0), 0.1);
      group.position.set(x, y, z);
      group.rotation.set(0, heading, 0);

      // --- the gait ---
      const distance = Math.max(0, travelled) || 0;
      const speed = dt > 0 ? distance / dt : 0;
      gait.speed = approach(gait.speed, speed, dt, 0.08);
      const moving = distance > 0 && speed > GAIT.idle;
      gait.move = approach(gait.move, moving ? 1 : 0, dt, moving ? START_SECONDS / 3 : SETTLE_SECONDS / 3);
      if (gait.move < 1e-3) gait.move = 0;
      gait.jog = approach(gait.jog, smoothstep(GAIT.walkTop, GAIT.jogFrom, gait.speed), dt, JOG_BLEND_SECONDS / 3);

      // One phase for both clips, advanced by the ground actually covered in
      // the stride the blend is currently showing.
      const stride = gait.walkMeters + (gait.jogMeters - gait.walkMeters) * gait.jog;
      const before = gait.phase;
      gait.phase += distance / Math.max(0.2, stride);
      const marks = gait.jog < 0.5 ? gait.walkMarks : gait.jogMarks;
      const footfalls = moving ? crossings(before, gait.phase, marks) : 0;
      // Keep the number small without ever losing its fraction.
      if (gait.phase > 1e6) gait.phase = frac(gait.phase);

      if (body) {
        poseBody(dt);
        body.root.updateMatrixWorld(true);
        const sane = body.poseSafety.isSane({ groundY: y, heightMeters: 1.7 });
        if (!sane) {
          // Never show an impossible body: back to standing for this frame.
          body.insane += 1;
          body.actions.walk?.setEffectiveWeight(0);
          body.actions.jog?.setEffectiveWeight(0);
          body.actions.idle?.setEffectiveWeight(1);
          body.mixer.update(0);
        }
      } else {
        fallback.pose(gait.phase, gait.move);
      }
      return { footfalls };
    },

    setOpacity(value) {
      opacity = clamp01(Number.isFinite(value) ? value : 1);
      setMaterialsOpacity();
      applyVisibility();
    },

    setVisible(value) {
      visible = Boolean(value);
      applyVisibility();
    },

    getHeadPosition(target) {
      if (body?.bones.head) {
        return body.bones.head.getWorldPosition(target).add(headPoint.set(0, 0.1, 0));
      }
      return target.set(group.position.x, group.position.y + FIGURE.robeHeight + FIGURE.headY, group.position.z);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      if (body) {
        body.mixer.stopAllAction();
        body.mixer.uncacheRoot(body.root);
        const skeletons = new Set();
        body.root.traverse((node) => { if (node.skeleton) skeletons.add(node.skeleton); });
        skeletons.forEach((skeleton) => skeleton.dispose());
      }
      ownedGeometries.forEach((geometry) => geometry.dispose());
      ownedMaterials.forEach((material) => material.dispose());
      ownedGeometries.clear();
      ownedMaterials.clear();
      group.removeFromParent();
    },
  };

  // Fetch the authored motion straight away, alongside the character assets;
  // whichever arrives second builds the body.
  avatar.loaded = loadClipData().then((data) => {
    clipData = data;
    instantiate();
    return Boolean(data);
  });

  return avatar;
}
