// The whole crowd as real people.
//
// Only the handful of villagers nearest the camera used to be skinned human
// models (sceneHumans.js); everyone else — every walker, every woman, every
// child, everyone more than a few metres off — was sceneFigures.js's stand-in:
// a cone of robe, a ball of head and two sticks of arm. From a camera three
// metres behind the visitor that is most of the people in the frame, and they
// read as what they are.
//
// This module draws every one of them with the same MakeHuman models the near
// actors use, at the models' own lower level of detail, for a couple of dozen
// draw calls in all. The technique is baked skinning: once a model arrives,
// each of its animation clips is played through on a hidden copy and the
// matrix of every bone at every frame is written into a float texture, one
// row per frame. Each part of the model then becomes one InstancedMesh whose
// vertex shader skins each instance by fetching its bone matrices from that
// texture, at the row its person is up to. A person costs a matrix and four
// numbers a frame on the CPU; there is no skeleton to update and no mixer.
//
// What a person is doing comes from the same descriptors the stand-ins read —
// activity, route, phase, facing, scale, kind — so nothing about where the
// village's people stand changes. Walking is driven by distance along the
// route, as it is for the near actors, so feet do not skate, and a change of
// clip (arriving and stopping, setting off again) cross-fades over a third of
// a second rather than cutting.
//
// Women use the one female model the project ships (the Tabernacle camp woman:
// undyed woven tunic and sash, long hair) with a veil drawn over her head and
// shoulders, and a man may wear a head cloth or go bareheaded; both are extra
// meshes skinned to the model's own head and upper spine, fitted to its
// measured skull, so they turn with the head and settle on the shoulders.
// Children are the village models at a child's scale — a smaller person, not a
// different body; the stand-ins' larger head for a child's size is the one
// thing given up.
//
// three.js is passed in, so the module stays importable in jsdom.

import { cloneSkinnedMesh } from './sceneResources.js';
import { retargetMotion } from './sceneMixamo.js';
import { routePlan, sampleRoute } from './sceneRoutes.js';
import { HUMAN_VARIANTS, CROWD_VARIANTS } from './sceneHumanManifest.js';

// Which clip plays for which activity, and where each is found: the first
// name a model actually has wins, so the camp woman's captured Mixamo walk
// and idle are used where they exist and the baked ones everywhere else.
export const CROWD_CLIPS = {
  idle: ['mixamo-idle', 'idle'],
  walk: ['mixamo-walk', 'walk'],
  work: ['work'],
  sit: ['sit'],
  kneel: ['kneel'],
  prayer: ['prayer'],
};

const ACTIVITY_CLIP = {
  walking: 'walk',
  working: 'work',
  sitting: 'sit',
  kneeling: 'kneel',
  praying: 'prayer',
  bowing: 'prayer',
};
export const clipForActivity = (activity) => ACTIVITY_CLIP[activity] || 'idle';

export const WOMAN_MODEL = 'human-tabernacle-camp-woman';
const BAKE_FPS = 30;
// An idle is long and slow; a third the keys lose nothing and keep the
// texture small.
const IDLE_FPS = 15;
const CROSSFADE_SECONDS = 0.3;
const CAPTURED_FPS = 12;
// How high the sit clip's seat is above the sitter's feet.
const STOOL_SEAT = 0.37;
const CAPTURED_SECONDS = 8;
const WALK_METERS_PER_CYCLE = 1.3;

// Instance tints. Undyed wool and linen for most tunics — the colour of the
// sheep — and the few dyes a household could afford among the women's veils.
// Multiplied into the model's own cloth texture, so they are kept light.
const TUNIC_TINTS = [0xffffff, 0xf2e9d8, 0xe6d9bf, 0xd8c7a6, 0xcfbd9a, 0xbfae8e, 0xfbf3e6, 0xe0d0b8, 0xb9a88c, 0xd2c3a8];
const HEADCLOTH_TINTS = [0xfaf4ea, 0xece2cf, 0xe0d4bc, 0xd6c6a6, 0xf2e9d8];
const VEIL_TINTS = [0xe6ddc9, 0xc4b79a, 0x8a4b3c, 0xd8cdb4, 0x4a5c74, 0xa8967d, 0x6b5340, 0xd9cfbd];

const frac = (value) => value - Math.floor(value);

// --- the vertex shader ------------------------------------------------------
// Replaces three's skinning chunks. `aAnim` is (row A, row B, weight of B):
// two frames of the bone texture, from the clip playing now and the clip being
// faded from. Rows are whole frames — the crowd is baked at 30 fps and nobody
// sits close enough to see a frame held for one extra refresh.
const VAT_PARS = `
  attribute vec4 skinIndex;
  attribute vec4 skinWeight;
  attribute vec4 aAnim;
  uniform highp sampler2D uVatTexture;
  mat4 vatBone(float row, float bone) {
    int x = int(bone + 0.5) * 4;
    int y = int(row + 0.5);
    return mat4(
      texelFetch(uVatTexture, ivec2(x, y), 0),
      texelFetch(uVatTexture, ivec2(x + 1, y), 0),
      texelFetch(uVatTexture, ivec2(x + 2, y), 0),
      texelFetch(uVatTexture, ivec2(x + 3, y), 0)
    );
  }
  mat4 vatSkin(float row) {
    return vatBone(row, skinIndex.x) * skinWeight.x
      + vatBone(row, skinIndex.y) * skinWeight.y
      + vatBone(row, skinIndex.z) * skinWeight.z
      + vatBone(row, skinIndex.w) * skinWeight.w;
  }
`;
const VAT_BASE = `
  mat4 vatMatrix = vatSkin(aAnim.x);
  if (aAnim.z > 0.001) vatMatrix = vatMatrix * (1.0 - aAnim.z) + vatSkin(aAnim.y) * aAnim.z;
`;

function vatShaded(material, uniforms, key) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uVatTexture = uniforms.uVatTexture;
    shader.vertexShader = shader.vertexShader
      .replace('#include <skinning_pars_vertex>', VAT_PARS)
      .replace('#include <skinbase_vertex>', VAT_BASE)
      .replace('#include <skinnormal_vertex>', 'objectNormal = normalize(mat3(vatMatrix) * objectNormal);')
      .replace('#include <skinning_vertex>', 'transformed = (vatMatrix * vec4(transformed, 1.0)).xyz;');
  };
  material.customProgramCacheKey = () => `vat-${key}`;
  return material;
}

// --- baking -------------------------------------------------------------------

// The skinned meshes that make up one level of detail of a model.
function modelParts(root, lod) {
  const parts = [];
  root.traverse((node) => {
    if (node.isSkinnedMesh && node.name.endsWith(`_LOD${lod}`)) parts.push(node);
  });
  return parts;
}

// Bakes every crowd clip of a loaded model into a bone-matrix texture. What is
// stored for bone b at a frame is the whole transform from a vertex of the
// part's geometry, as authored, to where it is in the model's own space at
// that frame — mesh placement, bind, bone and inverse bind multiplied out —
// so the shader's skinning is a weighted sum of four matrices and nothing
// else. Every part of the shipped models shares one skeleton and one bind, so
// one texture serves them all; a part that did not is refused rather than
// drawn wrongly.
export function bakeHumanModel(THREE, gltf, { lod = 1, extraClips = {} } = {}) {
  const root = cloneSkinnedMesh(gltf.scene);
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const parts = modelParts(root, lod).length ? modelParts(root, lod) : modelParts(root, 0);
  if (!parts.length) return null;
  const { skeleton } = parts[0];
  const bones = skeleton.bones;
  const boneCount = bones.length;

  // pre = mesh placement × inverse bind; post = bind. Identical for every
  // part of the shipped rigs.
  const pre = new THREE.Matrix4().multiplyMatrices(parts[0].matrixWorld, parts[0].bindMatrixInverse);
  const post = parts[0].bindMatrix.clone();
  const usable = parts.filter((part) => part.skeleton.bones.length === boneCount
    && new THREE.Matrix4().multiplyMatrices(part.matrixWorld, part.bindMatrixInverse).equals(pre)
    && part.bindMatrix.equals(post));

  const clips = {};
  for (const [semantic, names] of Object.entries(CROWD_CLIPS)) {
    const clip = names.map((name) => gltf.animations.find((c) => c.name === name)).find(Boolean);
    if (clip) clips[semantic] = clip;
  }
  if (!clips.idle) return null;
  clips.walk ||= clips.idle;
  // Captured Mixamo clips already fitted to this model (sceneMixamo.js), each
  // baked as a row set of its own under its own name.
  for (const [semantic, clip] of Object.entries(extraClips)) if (clip) clips[semantic] = clip;

  const rows = {};
  let total = 0;
  for (const [semantic, clip] of Object.entries(clips)) {
    // Idles and captured loops are slow; fewer keys lose nothing and keep the
    // texture small. A captured loop is baked no longer than it needs to be
    // to read as a loop.
    const captured = semantic.startsWith('m:');
    const fps = semantic === 'idle' ? IDLE_FPS : captured ? CAPTURED_FPS : BAKE_FPS;
    const frames = Math.max(2, Math.round(Math.min(clip.duration, captured ? CAPTURED_SECONDS : Infinity) * fps));
    rows[semantic] = { start: total, frames, fps, duration: clip.duration };
    total += frames;
  }
  // One more row: the model at rest, which the accessories are fitted to.
  const restRow = total;
  total += 1;

  const width = boneCount * 4;
  const data = new Float32Array(width * total * 4);
  const mixer = new THREE.AnimationMixer(root);
  const skin = new THREE.Matrix4();
  const writeRow = (row) => {
    root.updateMatrixWorld(true);
    for (let b = 0; b < boneCount; b += 1) {
      skin.multiplyMatrices(bones[b].matrixWorld, skeleton.boneInverses[b]);
      skin.premultiply(pre).multiply(post);
      data.set(skin.elements, (row * width + b * 4) * 4);
    }
  };
  writeRow(restRow);
  const footLeft = root.getObjectByName('mixamorigLeftFoot');
  const hips = root.getObjectByName('mixamorigHips');
  const stride = { walk: null };
  for (const [semantic, clip] of Object.entries(clips)) {
    const { start, frames, fps } = rows[semantic];
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.reset().play();
    let minZ = Infinity;
    let maxZ = -Infinity;
    const foot = new THREE.Vector3();
    const hip = new THREE.Vector3();
    for (let f = 0; f < frames; f += 1) {
      mixer.setTime(f / fps);
      writeRow(start + f);
      if (semantic === 'walk' && footLeft && hips) {
        footLeft.getWorldPosition(foot);
        hips.getWorldPosition(hip);
        minZ = Math.min(minZ, foot.z - hip.z);
        maxZ = Math.max(maxZ, foot.z - hip.z);
      }
    }
    // The baked walk every shipped model carries has a tuned stride
    // (sceneHumanManifest.js walkMetersPerCycle), shared with the near actors
    // so a person handed between the two does not change step. A captured
    // walk is measured: a foot's travel under the hips over one cycle, twice
    // over (left, then right), on this clip on this rig.
    if (semantic === 'walk') {
      stride.walk = clip.name === 'walk' || !Number.isFinite(maxZ)
        ? WALK_METERS_PER_CYCLE
        : Math.max(0.8, (maxZ - minZ) * 2);
    }
    action.stop();
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);

  const texture = new THREE.DataTexture(data, width, total, THREE.RGBAFormat, THREE.FloatType);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  // The rest pose, for fitting what is worn on the head.
  const headIndex = bones.findIndex((b) => b.name === 'mixamorigHead');
  const neckIndex = bones.findIndex((b) => b.name === 'mixamorigNeck');
  const spineIndex = bones.findIndex((b) => b.name === 'mixamorigSpine2');
  const skull = measureSkull(THREE, root);

  return {
    parts: usable.map((part) => ({ name: part.name, geometry: part.geometry, material: part.material })),
    texture,
    data,
    width,
    rows,
    restRow,
    boneCount,
    metersPerCycle: stride.walk ?? 1.3,
    bones: { head: headIndex, neck: neckIndex, spine: spineIndex },
    skull,
    pre,
    // Kept for tests that check the bake against three's own skinning.
    root,
  };
}

// The skull's extent in the model's rest pose, from the head and hair
// vertices above the jaw — what a head cloth or a veil is fitted over.
export function measureSkull(THREE, root) {
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity; let top = -Infinity;
  const jaw = 1.5;
  const point = new THREE.Vector3();
  root.traverse((node) => {
    if (!node.isSkinnedMesh || !node.name.endsWith('_LOD1') || !/^Skin(_|long|short)/.test(node.name)) return;
    const count = node.geometry.attributes.position.count;
    for (let i = 0; i < count; i += 1) {
      node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld);
      if (point.y < jaw) continue;
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
      top = Math.max(top, point.y);
    }
  });
  if (!Number.isFinite(top)) return { centre: [0, 1.6, 0.02], radii: [0.1, 0.12, 0.11], jaw };
  return {
    centre: [(minX + maxX) / 2, (jaw + top) / 2, (minZ + maxZ) / 2],
    radii: [(maxX - minX) / 2, (top - jaw) / 2, (maxZ - minZ) / 2],
    jaw,
    top,
  };
}

// The shape of what is worn on the head, in the model's rest pose: a shell a
// little larger than the skull, tipped back so the brow shows. `kind` is
// 'cloth' (a man's head cloth, to the nape) or 'veil' (a woman's, over the
// head and down onto the shoulders). Returns the shell and, per vertex, how
// much of it should follow the shoulders rather than the head — a veil falls
// with the upper spine; a cloth moves with the head alone.
export function shapeHeadwear(THREE, skull, kind) {
  const { centre, radii } = skull;
  const veil = kind === 'veil';
  const shell = new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI * (veil ? 0.78 : 0.6));
  const position = shell.attributes.position;
  const count = position.count;
  const spineWeight = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    v.fromBufferAttribute(position, i);
    const below = Math.max(0, -v.y);
    let x = v.x * (radii[0] + 0.02);
    let y = v.y * (radii[1] + 0.025);
    let z = v.z * (radii[2] + 0.025) - 0.01;
    if (veil) {
      // Drawn down and out from the widest point of the head over the neck
      // and onto the shoulders, longer behind than in front.
      y -= below * (z < 0 ? 0.32 : 0.2);
      x *= 1 + below * 1.6;
      z *= 1 + below * 0.9;
    } else if (z < 0) {
      // A man's cloth falls to the nape at the back.
      y -= below * 0.08;
    }
    v.set(centre[0] + x, centre[1] + y, centre[2] + z);
    position.setXYZ(i, v.x, v.y, v.z);
    // Near the head it moves with the head; lower down, with the shoulders.
    spineWeight[i] = veil ? Math.min(1, Math.max(0, (centre[1] - 0.06 - v.y) / 0.2)) : 0;
  }
  return { shell, spineWeight };
}

// What is worn on the head, as a skinned part of the baked model: the shape
// above, carried into the geometry's own authored space through the
// rest-pose transform of the bones it follows, so the baked matrices move it
// exactly as they move the head beneath it.
export function headwearGeometry(THREE, bake, kind) {
  const { shell, spineWeight } = shapeHeadwear(THREE, bake.skull, kind);
  const position = shell.attributes.position;
  const count = position.count;
  const skinIndex = new Float32Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const rest = (bone) => new THREE.Matrix4().fromArray(bake.data, (bake.restRow * bake.width + bone * 4) * 4);
  const spineBone = bake.bones.spine >= 0 ? bake.bones.spine : bake.bones.head;
  const headInverse = rest(bake.bones.head).invert();
  const spineInverse = rest(spineBone).invert();
  const local = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    const toSpine = spineWeight[i];
    skinIndex.set([bake.bones.head, spineBone, 0, 0], i * 4);
    skinWeight.set([1 - toSpine, toSpine, 0, 0], i * 4);
    // Into the geometry's authored space. The head and the spine agree on it
    // in the rest pose (the rest pose is the bind), so either inverse serves.
    local.fromBufferAttribute(position, i).applyMatrix4(toSpine > 0.5 ? spineInverse : headInverse);
    position.setXYZ(i, local.x, local.y, local.z);
  }
  shell.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  shell.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  shell.computeVertexNormals();
  return shell;
}

// --- the crowd ------------------------------------------------------------------

function modelFor(figure, index) {
  if (figure.kind === 'woman') return WOMAN_MODEL;
  const variant = HUMAN_VARIANTS[figure.variantId] || HUMAN_VARIANTS[CROWD_VARIANTS[index % CROWD_VARIANTS.length]];
  return variant?.modelId || 'human-villager';
}

// How far from the camera the real crowd draws people, by quality. Past it a
// person is a few pixels tall and the caller's stand-in takes over (see
// onReach); on 'high' everyone is always real.
export const REACH = { low: 35, balanced: 60, high: Infinity };

export function createInstancedCrowd(THREE, {
  figures = [], groundAt = null, quality = 'high', name = 'crowd-instanced',
  reach = REACH[quality] ?? Infinity,
  // Called with (figureId, inReach) whenever a person moves into or out of the
  // real crowd's reach, and for everyone once the crowd is built.
  onReach = null,
  // The captured-motion library (or a promise of it) for figures that have a
  // `motion` (sceneMixamo.js assignCrowdMotion). The crowd waits for it before
  // building, and builds without it if it will not come.
  motionLibrary = null,
  // Called once the crowd is built, if it was built later than acceptAssets.
  onBuilt = null,
} = {}) {
  const low = quality === 'low';
  const group = new THREE.Group();
  group.name = name;
  group.visible = false;
  const disposables = [];
  const models = new Map();
  // Every usable human model any asset group has delivered so far: the crowd
  // builds once all the ones it needs have arrived, whichever group they came in.
  const accepted = new Map();
  let stoolMesh = null;
  let everUpdated = false;
  let built = false;
  let disposed = false;

  // Who wears which model, and each person's place in its instance order.
  const people = figures.map((figure, index) => ({
    figure,
    index,
    model: modelFor(figure, index),
    slot: -1,
    suppressed: false,
    inReach: false,
    clip: null,
    fadeFrom: null,
    fadeFromRow: 0,
    changedAt: -Infinity,
  }));
  const idToPerson = new Map(people.filter((p) => p.figure.id).map((p) => [p.figure.id, p]));

  function wantedModels() {
    return new Set(people.map((p) => p.model));
  }
  let motions = motionLibrary && typeof motionLibrary.then !== 'function' ? motionLibrary : null;
  const wantsMotion = Boolean(motionLibrary) && people.some((p) => p.figure.motion);
  let motionsSettled = !wantsMotion || Boolean(motions);
  let pendingAssets = null;
  if (wantsMotion && !motions) {
    Promise.resolve(motionLibrary)
      .then((library) => { motions = library; })
      .catch(() => {})
      .finally(() => {
        motionsSettled = true;
        if (pendingAssets && !built && !disposed && build(pendingAssets)) onBuilt?.();
      });
  }
  // The captured clips each model's people need, fitted to that model.
  function capturedFor(gltf, modelId) {
    if (!motions) return {};
    const keys = new Set(people.filter((p) => p.model === modelId && p.figure.motion).map((p) => p.figure.motion));
    const clips = {};
    for (const key of keys) {
      const clip = retargetMotion(THREE, gltf.scene, motions, key);
      if (clip) clips[`m:${key}`] = clip;
    }
    return clips;
  }

  function build(assets) {
    // Women need the woman's model; if it is not among the assets, they wear
    // the villager's and keep their veil.
    if (!assets.has(WOMAN_MODEL)) for (const p of people) if (p.model === WOMAN_MODEL) p.model = 'human-villager';
    for (const modelId of wantedModels()) {
      const gltf = assets.get(modelId);
      const bake = gltf ? bakeHumanModel(THREE, gltf, { lod: 1, extraClips: capturedFor(gltf, modelId) }) : null;
      if (!bake) {
        // Not buildable after all: leave nothing half made behind.
        models.forEach((model) => model.bake.texture.dispose());
        models.clear();
        return false;
      }
      models.set(modelId, { id: modelId, bake, people: [], meshes: [], anim: null });
    }
    for (const person of people) {
      const model = models.get(person.model);
      person.slot = model.people.length;
      model.people.push(person);
    }
    const tint = new THREE.Color();
    for (const model of models.values()) {
      const n = model.people.length;
      const { bake } = model;
      const uniforms = { uVatTexture: { value: bake.texture } };
      disposables.push(bake.texture);
      const anim = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
      anim.setUsage(THREE.DynamicDrawUsage);
      model.anim = anim;
      const addPart = (geometry, sourceMaterial, partName, tintFor) => {
        const g = geometry.clone();
        g.setAttribute('aAnim', anim);
        const material = vatShaded(sourceMaterial.clone(), uniforms, `${model.id}-${partName}`);
        const depth = vatShaded(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), uniforms, `${model.id}-${partName}-depth`);
        const mesh = new THREE.InstancedMesh(g, material, n);
        mesh.name = `${name}-${model.id}-${partName}`;
        mesh.customDepthMaterial = depth;
        mesh.frustumCulled = false;
        mesh.castShadow = !low;
        mesh.receiveShadow = !low;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // The ambient-occlusion pass renders with its own material, which
        // knows nothing of this skinning; the crowd sits that pass out.
        mesh.userData.excludeFromAO = true;
        if (tintFor) {
          model.people.forEach((person, slot) => mesh.setColorAt(slot, tint.setHex(tintFor(person))));
          mesh.instanceColor.needsUpdate = true;
        }
        disposables.push(g, material, depth);
        group.add(mesh);
        model.meshes.push({ mesh, partName, only: null });
        return model.meshes[model.meshes.length - 1];
      };
      for (const part of bake.parts) {
        const isCloth = /cloth|skirt|sash/i.test(part.material.name) || /tunic|skirt|sash/i.test(part.name);
        const isSkin = /^skin/i.test(part.material.name);
        addPart(part.geometry, part.material, part.name, isCloth
          ? (person) => person.figure.tunicTint ?? TUNIC_TINTS[(person.index * 7 + 3) % TUNIC_TINTS.length]
          : isSkin ? (person) => [0xffffff, 0xf2e6dc, 0xe8d6c6, 0xfff4ea][person.index % 4] : null);
      }
      // What is worn on the head: a veil for every woman, a cloth for the men
      // who are not bareheaded; nobody else draws the part.
      const needsVeil = model.people.some((p) => p.figure.kind === 'woman');
      const needsCloth = model.people.some((p) => p.figure.kind !== 'woman' && p.figure.kind !== 'child' && !p.figure.bareheaded);
      const woven = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, side: THREE.DoubleSide });
      disposables.push(woven);
      if (needsVeil) {
        const veilGeometry = headwearGeometry(THREE, bake, 'veil');
        disposables.push(veilGeometry);
        addPart(veilGeometry, woven, 'veil', (person) => person.figure.veil ?? VEIL_TINTS[(person.index * 5) % VEIL_TINTS.length])
          .only = (person) => person.figure.kind === 'woman';
      }
      if (needsCloth) {
        const clothGeometry = headwearGeometry(THREE, bake, 'cloth');
        disposables.push(clothGeometry);
        addPart(clothGeometry, woven, 'headcloth', (person) => person.figure.headcloth ?? HEADCLOTH_TINTS[person.index % HEADCLOTH_TINTS.length])
          .only = (person) => person.figure.kind !== 'woman' && person.figure.kind !== 'child' && !person.figure.bareheaded;
      }
    }
    // A stool under everyone who sits: the sit clip is posed for a seat about
    // 0.37 m up, and without one a seated man sits on air.
    // Someone sitting on a step sits on the step, not on a stool (below).
    const sitters = people.filter((p) => clipForActivity(p.figure.activity) === 'sit' && !p.figure.onStep);
    if (sitters.length) {
      const seat = new THREE.CylinderGeometry(0.18, 0.18, 0.04, 12).translate(0, 0.37, -0.09);
      const legs = [0, 1, 2].map((k) => {
        const a = (k * Math.PI * 2) / 3;
        return new THREE.CylinderGeometry(0.02, 0.024, 0.35, 5).translate(Math.cos(a) * 0.12, 0.175, Math.sin(a) * 0.12 - 0.09);
      });
      const stoolGeometry = mergeGeometries(THREE, [seat, ...legs]);
      const stoolMaterial = new THREE.MeshStandardMaterial({ color: 0x68513b, roughness: 0.94 });
      disposables.push(stoolGeometry, stoolMaterial);
      const stools = new THREE.InstancedMesh(stoolGeometry, stoolMaterial, sitters.length);
      stools.name = `${name}-stools`;
      stools.castShadow = !low;
      stools.receiveShadow = !low;
      stools.frustumCulled = false;
      stools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(stools);
      sitters.forEach((person, i) => { person.stool = i; });
      stoolMesh = stools;
    }
    built = true;
    group.visible = true;
    update(0);
    return true;
  }

  const matrix = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // The texture row for a clip at a moment: `cycle` counts whole loops of the
  // clip (for a walk, the distance walked over the stride).
  function rowOf(bake, clip, cycle) {
    const r = bake.rows[clip] || bake.rows.idle;
    return r.start + Math.min(r.frames - 1, Math.floor(frac(cycle) * r.frames));
  }

  function update(elapsed = 0, cameraPosition = null) {
    if (!built || disposed) return;
    const t = elapsed || 0;
    const firstFrame = !everUpdated;
    everUpdated = true;
    for (const model of models.values()) {
      const { bake, anim } = model;
      for (const person of model.people) {
        const { figure } = person;
        let { x, z } = figure;
        let facing = figure.facing || 0;
        let clip = figure.motion && bake.rows[`m:${figure.motion}`] ? `m:${figure.motion}` : clipForActivity(figure.activity);
        let cycle;
        if (figure.route) {
          figure.__routePlan ||= routePlan(figure);
          const sample = sampleRoute(figure.__routePlan, t);
          x = sample.x;
          z = sample.z;
          facing = sample.facing;
          clip = sample.moving ? 'walk' : 'idle';
          cycle = sample.moving
            ? (sample.along * figure.__routePlan.length) / (bake.metersPerCycle * (figure.scale || 1))
            : (t + (figure.phase || 0) * 7) / bake.rows.idle.duration;
        } else {
          // Everyone at their own point in their own loop, so a group does
          // not breathe in unison.
          const r = bake.rows[clip] || bake.rows.idle;
          cycle = (t + (figure.phase ?? person.index * 1.37) * 3.1) / r.duration;
        }
        if (person.clip !== clip) {
          if (person.clip !== null) {
            person.fadeFrom = person.clip;
            person.fadeFromRow = anim.getX(person.slot);
            person.changedAt = t;
          }
          person.clip = clip;
        }
        const row = rowOf(bake, clip, cycle);
        const fade = person.fadeFrom ? 1 - (t - person.changedAt) / CROSSFADE_SECONDS : 0;
        if (fade <= 0) person.fadeFrom = null;
        anim.setXYZW(person.slot, row, person.fadeFromRow, Math.max(0, fade), 0);

        const near = !Number.isFinite(reach) || !cameraPosition
          || Math.hypot(x - cameraPosition.x, z - cameraPosition.z) <= reach;
        if (near !== person.inReach || firstFrame) {
          person.inReach = near;
          if (figure.id) onReach?.(figure.id, near);
        }
        const s = figure.scale || 1;
        // On a step, the seat is the step itself: the sit clip's seat is
        // STOOL_SEAT up, so the body goes that far below the step's surface
        // and the feet hang down onto the steps beneath.
        const ground = (groundAt ? groundAt(x, z) : (figure.y || 0)) - (figure.onStep ? STOOL_SEAT * s : 0);
        position.set(x, ground, z);
        quaternion.setFromAxisAngle(up, facing);
        scale.set(s, s, s);
        matrix.compose(position, quaternion, scale);
        for (const part of model.meshes) {
          const shown = !person.suppressed && person.inReach && (!part.only || part.only(person));
          part.mesh.setMatrixAt(person.slot, shown ? matrix : zero);
        }
        if (stoolMesh && person.stool !== undefined) stoolMesh.setMatrixAt(person.stool, person.suppressed || !person.inReach ? zero : matrix);
      }
      anim.needsUpdate = true;
      for (const part of model.meshes) part.mesh.instanceMatrix.needsUpdate = true;
    }
    if (stoolMesh) stoolMesh.instanceMatrix.needsUpdate = true;
  }

  return {
    group,
    get ready() { return built; },
    people,
    models,
    // Takes a loaded asset group; builds the crowd the first time every model
    // it needs is present. Returns whether it is now built.
    acceptAssets(assetGroup) {
      if (built || disposed || !assetGroup?.models) return built;
      const assets = new Map();
      for (const [id, model] of Object.entries(assetGroup.models)) {
        let skinned = false;
        model?.scene?.traverse((node) => { if (node.isSkinnedMesh) skinned = true; });
        if (skinned && model.animations?.some((clip) => clip.name === 'idle')) assets.set(id, model);
      }
      accepted.forEach((model, id) => { if (!assets.has(id)) assets.set(id, model); });
      assets.forEach((model, id) => accepted.set(id, model));
      const needed = [...wantedModels()].filter((id) => id !== WOMAN_MODEL);
      if (!needed.every((id) => assets.has(id))) return false;
      if (!motionsSettled) {
        pendingAssets = assets;
        return false;
      }
      return build(assets);
    },
    // A near actor (sceneHumans.js) standing in for this person: hide them.
    suppress(id, value = true) {
      const person = idToPerson.get(id);
      if (person) person.suppressed = value;
    },
    // Whether the real crowd is drawing this person (built, and within reach).
    inReach(id) {
      return built && Boolean(idToPerson.get(id)?.inReach);
    },
    reach,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      disposables.forEach((thing) => thing.dispose());
      group.removeFromParent();
    },
  };
}

// Merges plain geometries into one, for the stool.
function mergeGeometries(THREE, parts) {
  const flat = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const total = flat.reduce((sum, g) => sum + g.attributes.position.count, 0);
  const merged = new THREE.BufferGeometry();
  for (const attribute of ['position', 'normal']) {
    const array = new Float32Array(total * 3);
    let offset = 0;
    for (const g of flat) {
      array.set(g.attributes[attribute].array, offset);
      offset += g.attributes[attribute].array.length;
    }
    merged.setAttribute(attribute, new THREE.BufferAttribute(array, 3));
  }
  parts.forEach((part) => part.dispose());
  flat.forEach((g) => g.dispose());
  return merged;
}
