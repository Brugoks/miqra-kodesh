import { readFileSync } from 'node:fs';
import { beforeAll, describe, it, expect } from 'vitest';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import buildTabernacle from './buildTabernacle.js';
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';
import { createHumanPoseSafety } from './sceneHumanSafety.js';
import { sampleHumanPosition } from './sceneHumans.js';
import { cloneSkinnedMesh } from './sceneResources.js';
import { blockerAt } from './tabernacleNavigation.js';
const models = {};
beforeAll(async () => {
  const loader = new GLTFLoader(); loader.register(() => ({ name: 'HEADLESS', loadTexture: async () => new T.Texture() }));
  for (const asset of TABERNACLE_CHARACTER_ASSETS) {
    const b = readFileSync(`public${asset.url}`); models[asset.id] = await loader.parseAsync(new Uint8Array(b).buffer, '');
  }
});
function setup(quality = 'high') {
  const world = buildTabernacle(T, { quality }); world.applyAssets({ models });
  const camera = new T.PerspectiveCamera(); camera.position.set(-4, 1.7, 33);
  world.humans.update({ camera, elapsed: 0, delta: 0, quality });
  return { world, camera, actors: [...world.humans.getActors().values()] };
}
describe('Tabernacle captured motion and camp routines', () => {
  it('keeps every captured pose upright, grounded and inside its scene-owned anchor', () => {
    for (const asset of TABERNACLE_CHARACTER_ASSETS) {
      const model = cloneSkinnedMesh(models[asset.id].scene); const mixer = new T.AnimationMixer(model);
      const safety = createHumanPoseSafety(T, model);
      const soles = []; model.updateMatrixWorld(true);
      model.traverse(mesh => {
        if (!mesh.isSkinnedMesh || !mesh.name.startsWith('Skin') || !mesh.name.includes('_LOD0')) return;
        const indices = Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => i)
          .filter(i => new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld).y < .13);
        soles.push({ mesh, indices });
      });
      for (const clip of models[asset.id].animations.filter(c => c.name.startsWith('mixamo-'))) {
        mixer.stopAllAction(); mixer.clipAction(clip).play();
        for (let frame = 0; frame < 24; frame++) {
          mixer.setTime(clip.duration * frame / 24); model.updateMatrixWorld(true);
          expect(safety.isSane({ heightMeters: asset.bodyHeightMeters }), `${asset.id} ${clip.name} @ ${frame}`).toBe(true);
          const p = safety.sample();
          expect(Math.abs(p.hips.x)).toBeLessThan(.3);
          expect(Math.abs(p.hips.z)).toBeLessThan(.35);
          let floor = Infinity;
          for (const { mesh, indices } of soles) {
            mesh.skeleton.update();
            for (const i of indices) floor = Math.min(floor, mesh.getVertexPosition(i, new T.Vector3()).applyMatrix4(mesh.matrixWorld).y);
          }
          expect(Math.abs(floor), `${clip.name} sole contact`).toBeLessThan(.025);
          for (const bone of Object.values(safety.bones)) expect(Math.abs(bone.quaternion.length() - 1)).toBeLessThan(.0001);
        }
        const first = clip.tracks.find(t => t.name === 'mixamorigHips.position');
        expect([...first.values.slice(-3)]).toEqual([...first.values.slice(0, 3)]);
      }
      mixer.stopAllAction(); mixer.uncacheRoot(model);
    }
  });
  it('uses source-backed clips, truthful licenses and positive captured strides', () => {
    for (const asset of TABERNACLE_CHARACTER_ASSETS) {
      expect(asset.animationLicense).toBe('Adobe Mixamo');
      expect(asset.motion['mixamo-idle'].sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      for (const [name, record] of Object.entries(asset.motion)) {
        expect(models[asset.id].animations.some(c => c.name === name)).toBe(true);
        if (/walk/i.test(name)) expect(record.metersPerCycle).toBeGreaterThan(.7);
      }
    }
  });
  it('routes carriers and attendants clear of furnishings, tents, people and restricted areas', () => {
    const { world, actors } = setup();
    const walkers = actors.filter(a => a.placement.route); expect(walkers).toHaveLength(5);
    for (let time = 0; time < 100; time += .2) {
      const positions = actors.map(a => ({ actor: a, p: sampleHumanPosition(a.placement, time) }));
      for (const { actor, p } of positions.filter(v => v.actor.placement.route)) {
        expect(blockerAt(p.x, p.z), `${actor.id} blocked at ${p.x}, ${p.z}`).toBeFalsy();
        if (actor.placement.role === 'levite') expect(Math.abs(p.x)).toBeGreaterThan(12.5);
        if (actor.placement.role.startsWith('camp-')) expect(p.z).toBeGreaterThan(25);
        for (const other of positions.filter(v => v.actor !== actor)) {
          expect(Math.hypot(p.x - other.p.x, p.z - other.p.z), `${actor.id} crosses ${other.actor.id}`).toBeGreaterThan(.65);
        }
      }
    }
    world.dispose();
  });
  it('keeps held supplies between the hands, takes conversation turns, and freezes reduced motion', () => {
    const { world, camera, actors } = setup();
    const carrier = actors.find(a => a.placement.routine === 'basket-carrier');
    const pair = actors.filter(a => a.placement.routine === 'conversation').slice(0, 2);
    const seen = new Set();
    for (let i = 1; i <= 100; i++) {
      world.humans.update({ camera, elapsed: i * .1, delta: .1, quality: 'high' });
      const left = carrier.root.worldToLocal(carrier.life.left.getWorldPosition(new T.Vector3()));
      const right = carrier.root.worldToLocal(carrier.life.right.getWorldPosition(new T.Vector3()));
      expect(left.distanceTo(right)).toBeGreaterThan(.4);
      expect(left.distanceTo(right)).toBeLessThan(.6);
      expect(carrier.life.prop.position.distanceTo(left.add(right).multiplyScalar(.5))).toBeLessThan(.08);
      expect(carrier.animController.currentActionName).toMatch(/idle|walk/);
      seen.add(pair.map(a => a.animController.currentActionName).join(','));
    }
    expect(seen.has('talk,idle')).toBe(true); expect(seen.has('idle,talk')).toBe(true);
    expect(seen.has('talk,talk')).toBe(false);
    const position = carrier.root.position.clone(), hand = carrier.life.left.getWorldPosition(new T.Vector3());
    const elapsed = world.humans.getElapsed();
    for (let i = 0; i < 10; i++) world.humans.update({ camera, elapsed: 11 + i, delta: .1, reducedMotion: true });
    expect(world.humans.getElapsed()).toBe(elapsed); expect(carrier.root.position.distanceTo(position)).toBeLessThan(.00001);
    expect(carrier.life.left.getWorldPosition(new T.Vector3()).distanceTo(hand)).toBeLessThan(.00001);
    world.dispose(); expect(world.humans.getActors().size).toBe(0);
  });
  it('shows water only during a real reach above the basin, with pauses between pours', () => {
    const { world, camera, actors } = setup('low');
    const pourer = actors.find(a => a.placement.routine === 'pour');
    const states = new Set(); let sawWater = false;
    for (let i = 1; i <= 300; i++) {
      world.humans.update({ camera, elapsed: i * .1, delta: .1, quality: 'low' });
      states.add(pourer.animController.currentActionName);
      if (pourer.life.stream.visible) {
        sawWater = true;
        expect(Math.hypot(pourer.life.stream.position.x, pourer.life.stream.position.z - .67)).toBeLessThan(.38);
        expect(pourer.life.prop.rotation.x).toBeGreaterThan(.8);
      }
    }
    expect(states).toEqual(new Set(['idle', 'pour'])); expect(sawWater).toBe(true);
    world.humans.update({ camera, elapsed: 31, delta: .1, reducedMotion: true });
    expect(pourer.life.stream.visible).toBe(false); world.dispose();
  });
});
