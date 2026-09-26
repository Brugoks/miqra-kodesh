// A staged moment: a fixed cast of real skinned characters and the few props
// the moment needs, held as one composition.
//
// Capernaum's events (see capernaumEvents.js and synagogueTableau.js) are each
// one of these. mark2Tableau.js and matthew9Tableau.js predate this module and
// keep their own code, because each carries per-frame work of its own (the
// ropes to the mat, the balance and the stylus); everything they have in
// common with the rest lives here.
//
// A cast entry says who stands where doing what:
//   id, model            the actor, and which shipped GLB plays them
//   pose                 a key into `poses`: (t) => a sceneHumanClips pose frame
//   position             [x, y, z] of the root — the feet, or for someone seated
//                        the seat top less SEAT_DROP
//   target               [x, z] they face toward, or `facing` in radians
//   lying                laid on their back, head toward `target`
//   phase, scale         where in their loop they start; a child is scaled down
//   veil                 colour of a woman's veil, fitted to her own skull
//   tint                 { materialName: colour } — to tell one man from another
//                        across several events (Peter is always in the same
//                        coat), or grey an old woman's hair
//   mat                  a reed mat laid under them
//   hold                 props carried by a bone: [{ bone, build, at | offset,
//                        euler }] — `at` in the bone's own frame, `offset` in
//                        the actor's (+Z ahead, +X to their left); build(kit,
//                        ctx) gets the grip and the posed body to fit against
//   principal, audience  principals get full detail up close; the audience is
//                        dropped on 'low'
//   solid, radius        whether a walker bumps into them, and how wide they are
//
// Poses are baked once per (model, pose) as a loop of POSE_SECONDS, and every
// motion in a pose is a whole number of cycles of it (`wave`), so nobody
// visibly jumps when a loop wraps.
//
// three.js is passed in, so the module stays importable in jsdom.

import { cloneSkinnedMesh } from './sceneResources.js';
import { buildPoseClip } from './sceneHumanClips.js';
import { prepareHumanMaterials } from './sceneHumanMaterials.js';
import { measureSkull, shapeHeadwear } from './sceneInstancedHumans.js';

export const POSE_SECONDS = 12;
export const wave = (t, cycles, offset = 0) => Math.sin((t * Math.PI * 2 * cycles) / POSE_SECONDS + offset);

// A seated actor's root sits this far below the seat it is sitting on: the
// shared sit pose drives the hips to 0.58 above the root.
export const SEAT_DROP = 0.46;

const REQUIRED_BONES = ['Hips', 'LeftArm', 'LeftUpLeg', 'LeftHand', 'RightHand', 'Head'];

// Which way an entry faces, as a model heading (root.rotation.y).
export function headingOf(entry) {
  if (Number.isFinite(entry.facing)) return entry.facing;
  return Math.atan2(entry.target[0] - entry.position[0], entry.target[1] - entry.position[2]);
}

// A woman's veil, as a skinned part of this actor: the same shape the
// instanced crowd's women wear (shapeHeadwear), fitted over this body's own
// skull in its rest pose and bound to its own skeleton, so it turns with the
// head and falls with the shoulders through whatever the pose does.
export function skinnedVeil(THREE, actorRoot, material) {
  actorRoot.updateMatrixWorld(true);
  let host = null;
  actorRoot.traverse((node) => { if (!host && node.isSkinnedMesh && node.name.endsWith('_LOD1')) host = node; });
  if (!host) actorRoot.traverse((node) => { if (!host && node.isSkinnedMesh) host = node; });
  if (!host) return null;
  const { bones, boneInverses } = host.skeleton;
  const head = bones.findIndex((bone) => bone.name === 'mixamorigHead');
  if (head < 0) return null;
  const spineAt = bones.findIndex((bone) => bone.name === 'mixamorigSpine2');
  const spine = spineAt >= 0 ? spineAt : head;

  const { shell, spineWeight } = shapeHeadwear(THREE, measureSkull(THREE, actorRoot), 'veil');
  // The rest-pose skinning transform of a bone for this host: a point p in
  // the geometry lands at S·p. The veil's points are known where they should
  // land, so each is carried back through the inverse of its bone's S.
  const skinning = (bone) => new THREE.Matrix4()
    .copy(host.matrixWorld).multiply(host.bindMatrixInverse)
    .multiply(bones[bone].matrixWorld).multiply(boneInverses[bone])
    .multiply(host.bindMatrix)
    .invert();
  const headInverse = skinning(head);
  const spineInverse = skinning(spine);
  const position = shell.attributes.position;
  const skinIndex = new Float32Array(position.count * 4);
  const skinWeight = new Float32Array(position.count * 4);
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    const toSpine = spineWeight[i];
    skinIndex.set([head, spine, 0, 0], i * 4);
    skinWeight.set([1 - toSpine, toSpine, 0, 0], i * 4);
    point.fromBufferAttribute(position, i).applyMatrix4(toSpine > 0.5 ? spineInverse : headInverse);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  shell.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  shell.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  shell.computeVertexNormals();

  const veil = new THREE.SkinnedMesh(shell, material);
  veil.name = 'veil';
  // A sibling of the body it is fitted to, so it shares that body's
  // transform and bind.
  veil.position.copy(host.position);
  veil.quaternion.copy(host.quaternion);
  veil.scale.copy(host.scale);
  veil.bindMode = host.bindMode;
  host.parent.add(veil);
  veil.bind(host.skeleton, host.bindMatrix);
  veil.frustumCulled = false;
  return veil;
}

// The shared palette for props. Created on demand, owned by the tableau.
const PALETTE = {
  basalt: { color: 0x3f3e42, roughness: 0.85 },
  timber: { color: 0x6d4c2c, roughness: 0.9 },
  darkTimber: { color: 0x4a3320, roughness: 0.9 },
  reed: { color: 0xa99160, roughness: 1 },
  clay: { color: 0x9a6a44, roughness: 0.85 },
  parchment: { color: 0xd8c7a0, roughness: 0.92, double: true },
  linen: { color: 0xd9cfbb, roughness: 1, double: true },
  wool: { color: 0x8b6f4e, roughness: 1, double: true },
  bronze: { color: 0xa8813f, roughness: 0.42, metalness: 0.55 },
  silver: { color: 0xc3c0b4, roughness: 0.35, metalness: 0.6 },
  iron: { color: 0x5b5d61, roughness: 0.45, metalness: 0.7 },
  leather: { color: 0x54402a, roughness: 0.72 },
  cord: { color: 0xbca97c, roughness: 1 },
};

export function createTableau(THREE, {
  root,
  name,
  cast,
  poses,
  focus,
  floor = 0,
  drawDistance = 60,
  visibleFrom = null,
  clearanceHeight = 1.2,
  principalDetail = 14,
  props = null,
  active: startActive = true,
  onReady,
} = {}) {
  const group = new THREE.Group();
  group.name = name;
  group.visible = false;
  root.add(group);

  const resources = new Set();
  const own = (resource) => { resources.add(resource); return resource; };
  const materials = new Map();
  const material = (key) => {
    if (!materials.has(key)) {
      const spec = PALETTE[key];
      if (key === 'flame') {
        materials.set(key, own(new THREE.MeshBasicMaterial({
          color: 0xffb257, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
        })));
      } else {
        materials.set(key, own(new THREE.MeshStandardMaterial({
          color: spec.color,
          roughness: spec.roughness,
          metalness: spec.metalness || 0,
          side: spec.double ? THREE.DoubleSide : THREE.FrontSide,
        })));
      }
    }
    return materials.get(key);
  };
  const addMesh = (geometry, mat, position = [0, 0, 0], parent = group) => {
    const mesh = new THREE.Mesh(own(geometry), typeof mat === 'string' ? material(mat) : mat);
    mesh.position.fromArray(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // Flames, flickered every frame wherever they are.
  const flames = [];
  const flicker = (mesh) => {
    mesh.userData.flickerPhase = flames.length * 1.7;
    flames.push(mesh);
    return mesh;
  };
  // Everything a props builder or a held prop needs.
  const kit = { THREE, group, own, material, addMesh, flicker };

  // Reed mats under whoever needs one.
  for (const entry of cast.filter((actor) => actor.mat)) {
    const size = entry.mat === true ? { w: 0.9, d: 1.1 } : entry.mat;
    const heading = headingOf(entry);
    const mat = addMesh(new THREE.BoxGeometry(size.w, 0.02, size.d), 'reed',
      [entry.position[0], floor + 0.01, entry.position[2]]);
    mat.rotation.y = heading;
    if (size.offset) mat.position.add(new THREE.Vector3(0, 0, size.offset).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading));
  }
  const staged = props ? props(kit) || {} : {};

  // --- the cast ---------------------------------------------------------------
  const models = new Map();
  const actors = new Map();
  const clips = new Map();
  let ready = false;
  let disposed = false;
  let active = startActive;
  let time = 0;
  const cameraPosition = new THREE.Vector3();
  const centre = new THREE.Vector3(...focus);

  function instantiate() {
    for (const entry of cast) {
      const model = models.get(entry.model);
      prepareHumanMaterials(model.scene);
      const key = `${entry.model}:${entry.pose}`;
      if (!clips.has(key)) {
        clips.set(key, buildPoseClip(THREE, model.scene, entry.pose, POSE_SECONDS, poses[entry.pose], { fps: 15 }));
      }
      const actorRoot = cloneSkinnedMesh(model.scene);
      actorRoot.name = `${name}-${entry.id}`;
      if (entry.veil !== undefined) {
        // Fitted at rest, before the actor is placed or posed.
        const veilMaterial = own(new THREE.MeshStandardMaterial({ color: entry.veil, roughness: 0.94, side: THREE.DoubleSide }));
        const veil = skinnedVeil(THREE, actorRoot, veilMaterial);
        if (veil) own(veil.geometry);
      }
      if (entry.tint) {
        // Clones share the asset's materials, so a tint is a material of its
        // own for this actor alone.
        actorRoot.traverse((node) => {
          if (!node.isMesh || node.name === 'veil') return;
          const base = node.material?.name?.replace(/\.\d+$/, '');
          if (base && entry.tint[base] !== undefined) {
            const tinted = own(node.material.clone());
            tinted.color = new THREE.Color(entry.tint[base]);
            node.material = tinted;
          }
        });
      }
      actorRoot.scale.setScalar(entry.scale || 1);
      actorRoot.position.fromArray(entry.position);
      if (entry.lying) actorRoot.rotation.set(-Math.PI / 2, headingOf(entry) + Math.PI, 0, 'YXZ');
      else actorRoot.rotation.set(0, headingOf(entry), 0);
      group.add(actorRoot);

      const meshes = [[], []];
      actorRoot.traverse((node) => {
        if (!node.isMesh) return;
        node.frustumCulled = false;
        node.castShadow = true;
        node.receiveShadow = true;
        if (node.name === 'veil') return;
        meshes[node.name.includes('_LOD1') ? 1 : 0].push(node);
      });
      const mixer = new THREE.AnimationMixer(actorRoot);
      const clip = clips.get(key);
      if (clip) {
        const action = mixer.clipAction(clip).play();
        action.time = (entry.phase || 0) % clip.duration;
        mixer.update(0);
      }
      const actor = { entry, root: actorRoot, mixer, meshes, held: [] };
      actors.set(entry.id, actor);

      // Held props are placed in the world against the posed hand, then
      // handed to the bone — attach() keeps where they are — so they stay in
      // the grip through the pose's breathing without a guessed bone offset.
      if (entry.hold?.length) {
        group.updateMatrixWorld(true);
        const heading = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), headingOf(entry));
        const boneAt = (boneName) => actorRoot.getObjectByName(`mixamorig${boneName}`)
          ?.getWorldPosition(new THREE.Vector3());
        for (const spec of entry.hold) {
          const bone = actorRoot.getObjectByName(`mixamorig${spec.bone}`);
          if (!bone) continue;
          const grip = spec.offset
            ? bone.getWorldPosition(new THREE.Vector3())
              .add(new THREE.Vector3(...spec.offset).multiplyScalar(entry.scale || 1).applyQuaternion(heading))
            : bone.localToWorld(new THREE.Vector3(...(spec.at || [0, 0.06, 0])));
          const prop = spec.build(kit, { grip, heading, floor, bone: boneAt, entry });
          group.add(prop);
          prop.position.copy(group.worldToLocal(grip.clone()));
          if (!prop.userData.aimed) {
            prop.quaternion.setFromEuler(new THREE.Euler(...(spec.euler || [0, 0, 0]), 'YXZ')).premultiply(heading);
          }
          prop.updateMatrixWorld(true);
          bone.attach(prop);
          actor.held.push(prop);
        }
      }
    }
    ready = true;
    group.visible = true;
    update({ delta: 0, reducedMotion: true });
    onReady?.();
  }

  function acceptAssets(assetGroup) {
    if (disposed || ready) return;
    for (const [id, model] of Object.entries(assetGroup?.models || {})) {
      let skinned = false;
      model.scene?.traverse((node) => { if (node.isSkinnedMesh) skinned = true; });
      if (skinned && REQUIRED_BONES.every((bone) => model.scene.getObjectByName(`mixamorig${bone}`))) models.set(id, model);
    }
    if (active && cast.every((entry) => models.has(entry.model))) instantiate();
  }

  // Only one moment is staged at a time; an inactive one keeps its props and,
  // once built, its cast, but draws and animates nothing. The cast is built
  // the first time the moment is staged, so nobody pays for the ones never
  // visited.
  function setActive(value) {
    if (disposed) return;
    active = Boolean(value);
    if (active && !ready && cast.every((entry) => models.has(entry.model))) instantiate();
    if (!active) group.visible = false;
  }

  function update({ delta = 0.016, camera = null, quality = 'balanced', reducedMotion = false } = {}) {
    if (!ready || disposed || !active) return;
    const dt = reducedMotion ? 0 : Math.min(0.1, Math.max(0, delta));
    time += dt;
    const profile = quality?.name || quality;
    if (camera) camera.getWorldPosition(cameraPosition);
    const distance = camera ? cameraPosition.distanceTo(centre) : 0;
    group.visible = !camera || (distance < drawDistance
      && (!visibleFrom || visibleFrom(cameraPosition.x, cameraPosition.y, cameraPosition.z)));
    if (!group.visible) return;
    for (const actor of actors.values()) {
      actor.root.visible = !actor.entry.audience || profile !== 'low';
      const lod = profile !== 'low' && actor.entry.principal && distance < principalDetail ? 0 : 1;
      const selected = actor.meshes[lod].length ? lod : 0;
      actor.meshes.forEach((meshes, i) => meshes.forEach((mesh) => { mesh.visible = i === selected; }));
      actor.mixer.update(dt);
    }
    for (const flame of flames) {
      const phase = flame.userData.flickerPhase;
      flame.scale.y = 0.85 + Math.sin(time * 9.1 + phase) * 0.1 + Math.sin(time * 4.3 + phase * 0.7) * 0.06;
    }
    staged.update?.(time, dt, actors);
  }

  // Those standing, kneeling or lying on the floor are obstacles, and so is
  // any furniture the props declare; a walker only ever asks whether one
  // point is free, so circles serve.
  const solids = [
    ...cast
      .filter((entry) => entry.solid ?? Math.abs(entry.position[1] - floor) < 0.3)
      .map((entry) => ({
        x: entry.position[0],
        z: entry.position[2],
        radius: entry.radius ?? (entry.lying ? 0.5 : entry.mat ? 0.42 : 0.32),
      })),
    ...(staged.clearance || []),
  ];
  function queryClearance(x, z, radius = 0.35, y = floor) {
    if (!ready || disposed || !active) return { collides: false, pushX: 0, pushZ: 0 };
    if (Math.abs(y - floor) > clearanceHeight) return { collides: false, pushX: 0, pushZ: 0 };
    for (const other of solids) {
      const dx = x - other.x;
      const dz = z - other.z;
      const distance = Math.hypot(dx, dz);
      const gap = radius + other.radius;
      if (distance < gap) {
        return {
          collides: true,
          pushX: distance > 0.001 ? (dx / distance) * (gap - distance) : gap,
          pushZ: distance > 0.001 ? (dz / distance) * (gap - distance) : 0,
        };
      }
    }
    return { collides: false, pushX: 0, pushZ: 0 };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const skeletons = new Set();
    for (const actor of actors.values()) {
      actor.mixer.stopAllAction();
      actor.mixer.uncacheRoot(actor.root);
      actor.root.traverse((node) => { if (node.skeleton) skeletons.add(node.skeleton); });
    }
    skeletons.forEach((skeleton) => skeleton.dispose());
    // Clones share the asset's geometry and materials; only what was created
    // here is owned. Detach before the scenery's disposal traversal runs.
    root.remove(group);
    resources.forEach((resource) => resource.dispose());
    actors.clear();
    models.clear();
    clips.clear();
  }

  return {
    group,
    cast,
    acceptAssets,
    setActive,
    update,
    queryClearance,
    dispose,
    getActors: () => actors,
    getProps: () => staged,
    isReady: () => ready && !disposed,
    isActive: () => active && !disposed,
    getElapsed: () => time,
  };
}
