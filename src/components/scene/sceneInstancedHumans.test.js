import { readFileSync } from 'node:fs';
import { beforeAll, describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  bakeHumanModel, headwearGeometry, createInstancedCrowd, clipForActivity, WOMAN_MODEL,
} from './sceneInstancedHumans.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';
import { cloneSkinnedMesh } from './sceneResources.js';

// The crowd is skinned in a vertex shader nobody can watch in CI, from bone
// matrices baked into a texture. So the bake is checked against three.js's
// own skinning, vertex by vertex, on the real models: if the two agree, the
// shader — which does the same four-matrix sum — is drawing the real pose.

const models = {};
beforeAll(async () => {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new THREE.Texture() }));
  const wanted = [...HUMAN_MODEL_ASSETS.filter((a) => ['human-artisan', 'human-villager', 'human-traveler'].includes(a.id)),
    TABERNACLE_CHARACTER_ASSETS.find((a) => a.id === WOMAN_MODEL)];
  for (const asset of wanted) {
    models[asset.id] = await loader.parseAsync(new Uint8Array(readFileSync(`public${asset.url}`)).buffer, '');
  }
}, 60000);

// Where the bake puts a vertex of a part at a texture row, computed on the CPU
// exactly as the shader computes it.
function bakedVertex(bake, geometry, i, row, out) {
  const v = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i);
  const index = geometry.attributes.skinIndex;
  const weight = geometry.attributes.skinWeight;
  out.set(0, 0, 0);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  for (let k = 0; k < 4; k += 1) {
    const w = weight.getComponent(i, k);
    if (w === 0) continue;
    m.fromArray(bake.data, (row * bake.width + index.getComponent(i, k) * 4) * 4);
    out.addScaledVector(p.copy(v).applyMatrix4(m), w);
  }
  return out;
}

describe('bakeHumanModel', () => {
  for (const id of ['human-villager', WOMAN_MODEL]) {
    it(`reproduces three's own skinning of ${id}, frame by frame`, () => {
      const gltf = models[id];
      const bake = bakeHumanModel(THREE, gltf);
      expect(bake.parts.length).toBeGreaterThanOrEqual(4);
      expect(bake.texture.image.width).toBe(bake.boneCount * 4);
      expect(Array.from(bake.data).every(Number.isFinite)).toBe(true);

      const reference = cloneSkinnedMesh(gltf.scene);
      reference.updateMatrixWorld(true);
      const mixer = new THREE.AnimationMixer(reference);
      const clip = gltf.animations.find((c) => c.name === (id === WOMAN_MODEL ? 'mixamo-walk' : 'walk'));
      mixer.clipAction(clip).play();
      const skinPart = bake.parts.find((p) => /^Skin_LOD1$/.test(p.name));
      let referenceMesh = null;
      reference.traverse((n) => { if (n.name === 'Skin_LOD1') referenceMesh = n; });
      const { start, frames, fps } = bake.rows.walk;
      const expected = new THREE.Vector3();
      const actual = new THREE.Vector3();
      let worst = 0;
      for (const frame of [0, Math.floor(frames / 3), frames - 1]) {
        mixer.setTime(frame / fps);
        reference.updateMatrixWorld(true);
        const count = skinPart.geometry.attributes.position.count;
        for (let i = 0; i < count; i += 97) {
          referenceMesh.getVertexPosition(i, expected).applyMatrix4(referenceMesh.matrixWorld);
          bakedVertex(bake, skinPart.geometry, i, start + frame, actual);
          worst = Math.max(worst, expected.distanceTo(actual));
        }
      }
      // A millimetre, over a whole body in motion.
      expect(worst).toBeLessThan(0.001);
      expect(bake.metersPerCycle).toBeGreaterThan(0.9);
      expect(bake.metersPerCycle).toBeLessThan(2);
    }, 30000);
  }

  it('fits what is worn on the head over the head, and moves it with the head', () => {
    const bake = bakeHumanModel(THREE, models[WOMAN_MODEL]);
    const veil = headwearGeometry(THREE, bake, 'veil');
    const point = new THREE.Vector3();
    const box = new THREE.Box3();
    for (let i = 0; i < veil.attributes.position.count; i += 1) box.expandByPoint(bakedVertex(bake, veil, i, bake.restRow, point));
    const { centre, top } = bake.skull;
    // Over the crown, and falling below the jaw onto the shoulders.
    expect(box.max.y).toBeGreaterThan(top);
    expect(box.min.y).toBeLessThan(bake.skull.jaw - 0.1);
    expect(box.min.x).toBeLessThan(centre[0] - 0.1);
    expect(box.max.x).toBeGreaterThan(centre[0] + 0.1);
    // In a frame of the walk it has moved with the model: its highest point
    // stays within a few centimetres of the moving head's.
    const walkRow = bake.rows.walk.start + 5;
    let highest = -Infinity;
    for (let i = 0; i < veil.attributes.position.count; i += 1) highest = Math.max(highest, bakedVertex(bake, veil, i, walkRow, point).y);
    expect(Math.abs(highest - box.max.y)).toBeLessThan(0.12);
  });
});

describe('createInstancedCrowd', () => {
  const figures = [
    { id: 'man', x: 0, z: 0, facing: 0.5, activity: 'talking' },
    { id: 'bare', x: 2, z: 0, activity: 'standing', bareheaded: true },
    { id: 'woman', kind: 'woman', route: [[4, 0], [4, 12]], speed: 1, phase: 0, activity: 'walking' },
    { id: 'child', kind: 'child', x: 6, z: 0, scale: 0.6, activity: 'standing' },
    { id: 'sitter', x: 8, z: 0, activity: 'sitting' },
  ];

  const matrixOf = (mesh, slot) => mesh.getMatrixAt(slot, new THREE.Matrix4()) && (() => {
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(slot, m);
    return m;
  })();
  const shown = (mesh, slot) => new THREE.Vector3().setFromMatrixScale(matrixOf(mesh, slot)).length() > 0;

  it('waits for its models, then draws everyone as a real person', () => {
    const crowd = createInstancedCrowd(THREE, { figures, groundAt: () => 0 });
    try {
      expect(crowd.acceptAssets({ models: {} })).toBe(false);
      expect(crowd.group.visible).toBe(false);
      expect(crowd.acceptAssets({ models })).toBe(true);
      expect(crowd.ready).toBe(true);
      expect(crowd.group.visible).toBe(true);
      const woman = crowd.people.find((p) => p.figure.id === 'woman');
      expect(woman.model).toBe(WOMAN_MODEL);
      const parts = (person) => crowd.models.get(person.model).meshes;
      // The woman is veiled; the man in a head cloth; the bareheaded man and
      // the child without one.
      for (const person of crowd.people) {
        const veil = parts(person).find((p) => p.partName === 'veil');
        const cloth = parts(person).find((p) => p.partName === 'headcloth');
        const id = person.figure.id;
        if (veil) expect(shown(veil.mesh, person.slot), `${id} veil`).toBe(id === 'woman');
        if (cloth) expect(shown(cloth.mesh, person.slot), `${id} cloth`).toBe(id === 'man' || id === 'sitter');
        // Every body part of every person drawn, with a finite placement.
        for (const part of parts(person).filter((p) => !['veil', 'headcloth'].includes(p.partName))) {
          const m = matrixOf(part.mesh, person.slot);
          expect(m.elements.every(Number.isFinite)).toBe(true);
          expect(shown(part.mesh, person.slot), `${id} ${part.partName}`).toBe(true);
        }
      }
      // The child is child-sized.
      const child = crowd.people.find((p) => p.figure.id === 'child');
      const childScale = new THREE.Vector3().setFromMatrixScale(matrixOf(parts(child)[0].mesh, child.slot));
      expect(childScale.y).toBeCloseTo(0.6, 5);
      // The sitter has a stool.
      expect(crowd.group.getObjectByName('crowd-instanced-stools').count).toBe(1);
    } finally {
      crowd.dispose();
    }
  }, 30000);

  it('walks the route with the walk, stands with the idle, and fades between them', () => {
    const crowd = createInstancedCrowd(THREE, { figures, groundAt: () => 0 });
    try {
      crowd.acceptAssets({ models });
      const woman = crowd.people.find((p) => p.figure.id === 'woman');
      const model = crowd.models.get(woman.model);
      const inClip = (row, clip) => row >= model.bake.rows[clip].start && row < model.bake.rows[clip].start + model.bake.rows[clip].frames;
      let sawWalk = false;
      let sawIdle = false;
      let sawFade = false;
      for (let t = 0; t < 40; t += 0.05) {
        crowd.update(t);
        const row = model.anim.getX(woman.slot);
        if (inClip(row, 'walk')) sawWalk = true;
        if (inClip(row, 'idle')) sawIdle = true;
        if (model.anim.getZ(woman.slot) > 0) sawFade = true;
      }
      expect(sawWalk && sawIdle && sawFade).toBe(true);
      expect(clipForActivity('working')).toBe('work');
      expect(clipForActivity('talking')).toBe('idle');
    } finally {
      crowd.dispose();
    }
  }, 30000);

  it('hides a person while a near actor stands in for them', () => {
    const crowd = createInstancedCrowd(THREE, { figures, groundAt: () => 0 });
    try {
      crowd.acceptAssets({ models });
      const man = crowd.people.find((p) => p.figure.id === 'man');
      crowd.suppress('man', true);
      crowd.update(1);
      for (const part of crowd.models.get(man.model).meshes) expect(shown(part.mesh, man.slot)).toBe(false);
      crowd.suppress('man', false);
      crowd.update(2);
      expect(shown(crowd.models.get(man.model).meshes[0].mesh, man.slot)).toBe(true);
      // Every crowd mesh sits out the ambient-occlusion pass.
      crowd.group.traverse((o) => { if (o.isInstancedMesh && !o.name.endsWith('stools')) expect(o.userData.excludeFromAO).toBe(true); });
    } finally {
      crowd.dispose();
    }
  }, 30000);
});

describe('Capernaum with its character models', () => {
  it('draws every villager, walker, woman and child as a real person once the models arrive', async () => {
    const { default: buildCapernaum } = await import('./buildCapernaum.js');
    const built = buildCapernaum(THREE, { quality: 'high' });
    try {
      const real = built.root.getObjectByName('villagers-real');
      const standIns = ['villagers', 'walkers', 'capernaum-people'].map((name) => built.root.getObjectByName(name));
      expect(real.visible).toBe(false);
      standIns.forEach((group) => expect(group.visible).toBe(true));

      built.applyAssets({ groupKey: 'actors', models });
      expect(real.visible).toBe(true);
      standIns.forEach((group) => expect(group.visible).toBe(false));

      // Everyone the stand-ins drew is in the real crowd.
      const { villagers, walkerFigures } = built.debugCrowd;
      let instances = 0;
      let bodies = 0;
      let triangles = 0;
      real.traverse((o) => {
        if (!o.isInstancedMesh) return;
        if (/-Skin_LOD1$/.test(o.name)) bodies += o.count;
        const n = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
        triangles += n * o.count;
        instances += 1;
      });
      expect(bodies).toBeGreaterThanOrEqual(villagers.length + walkerFigures.length);
      // Every woman is drawn with the woman's model.
      expect(real.children.some((o) => o.name.includes('camp-woman') && o.count > 0)).toBe(true);
      // A couple of dozen draws for the whole crowd, and a budget that a
      // desktop carries comfortably.
      expect(instances).toBeLessThanOrEqual(30);
      expect(triangles).toBeLessThan(1_000_000);
      for (let t = 0; t < 10; t += 0.5) built.update(t, 0.5, {});
      console.info(`[crowd] ${bodies} people, ${instances} draws, ${Math.round(triangles / 1000)}k triangles`);
    } finally {
      built.dispose();
    }
  }, 60000);
});

describe('handing people between the real crowd and the stand-ins', () => {
  it('draws each person exactly once: real within reach, stand-in beyond it', async () => {
    const { default: buildCapernaum } = await import('./buildCapernaum.js');
    const built = buildCapernaum(THREE, { quality: 'balanced' });
    try {
      built.applyAssets({ groupKey: 'actors', models });
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(2, 2.5, -16); // the shore vantage
      built.update(1, 0.016, { camera });
      const shownIn = (mesh, index) => {
        const m = new THREE.Matrix4();
        mesh.getMatrixAt(index, m);
        return new THREE.Vector3().setFromMatrixScale(m).length() > 0;
      };
      const villagersStandIn = built.root.getObjectByName('villagers').children.find((o) => o.isInstancedMesh && o.name === 'villagers');
      const { villagers } = built.debugCrowd;
      let near = 0;
      let far = 0;
      villagers.forEach((figure, index) => {
        const distance = Math.hypot(figure.x - camera.position.x, figure.z - camera.position.z);
        const person = figure.id;
        const drawnReal = distance <= 60;
        const standIn = shownIn(villagersStandIn, index);
        if (drawnReal) near += 1; else far += 1;
        // Exactly one of the two draws them (a near skinned actor may take
        // over some near ones, in which case neither instanced system does).
        expect(standIn && drawnReal, `${person} drawn twice`).toBe(false);
        if (!drawnReal) expect(standIn, `${person} not drawn at all`).toBe(true);
      });
      expect(near).toBeGreaterThan(0);
      expect(far).toBeGreaterThan(0);
    } finally {
      built.dispose();
    }
  }, 60000);
});
