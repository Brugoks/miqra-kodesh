import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ELAH_CHARACTER_ASSETS } from './elahCharacterAssets.js';
import { createElahPrincipals, ELAH_CAST } from './elahPrincipals.js';
import { createDavidGoliathTableau } from './davidGoliathTableau.js';
import { terrainHeight } from './elahTerrain.js';
import mixamoClips from './elahMixamoClips.json' with { type: 'json' };

const models = {};
beforeAll(async () => {
  const loader = new GLTFLoader();
  // The separate validator decodes shipped images; here exercise actual skinning.
  loader.register(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new THREE.Texture() }));
  for (const asset of ELAH_CHARACTER_ASSETS) {
    const bytes = readFileSync(resolve('public', asset.url.slice(1)));
    models[asset.id] = await loader.parseAsync(new Uint8Array(bytes).buffer, '');
  }
});
function setup(options) {
  const root = new THREE.Group(); const cast = createElahPrincipals(THREE, root, options);
  cast.acceptAssets({ models }); return cast;
}
function bodyBounds(actor) {
  const box = new THREE.Box3(); const p = new THREE.Vector3();
  actor.model.updateMatrixWorld(true);
  actor.model.traverse((node) => {
    if (!node.isSkinnedMesh || !node.name.includes('_LOD0') || !/Skin|short|Hair/.test(node.name)) return;
    node.skeleton.update();
    for (let i = 0; i < node.geometry.attributes.position.count; i++) {
      node.getVertexPosition(i, p); p.applyMatrix4(node.matrixWorld); box.expandByPoint(p);
    }
  });
  return box;
}

describe('Elah asset-backed principals', () => {
  it('ships anatomical skinned meshes and maintains the body ratio without measuring spear/helmet', () => {
    const cast = setup({ reducedMotion: true });
    expect(cast.isReady()).toBe(true);
    const heights = {};
    for (const entry of ELAH_CAST) {
      const actor = cast.getActors().get(entry.id); const box = bodyBounds(actor);
      heights[entry.id] = box.max.y - box.min.y;
      // Hair/helmet removal and a slight posed head tilt can move the crown a few cm.
      expect(Math.abs(heights[entry.id] - entry.height)).toBeLessThan(.03);
      expect(Math.abs(box.min.y - terrainHeight(entry.x, entry.z))).toBeLessThan(.035);
      expect(actor.model.getObjectByName('mixamorigLeftHand')).toBeDefined();
      expect(actor.model.getObjectByName('mixamorigRightHandMiddle3')).toBeDefined();
    }
    expect(heights.goliath / heights.david).toBeGreaterThan(1.70);
    expect(heights.goliath / heights.david).toBeLessThan(1.83);
    const goliath = cast.getActors().get('goliath');
    expect(new THREE.Box3().setFromObject(goliath.container).max.y - bodyBounds(goliath).max.y).toBeGreaterThan(.4);
    const metals = []; goliath.model.traverse((n) => { if (n.material?.name.includes('bronze')) metals.push(n.material.metalness); });
    expect(metals.length).toBeGreaterThan(0); expect(metals.every((v) => v > .7)).toBe(true);
    cast.dispose();
  });
  it('keeps equipment attached to live hands throughout both captured motions', () => {
    const cast = setup(); const initialY = [...cast.getActors().values()].map((a) => a.container.position.y);
    for (let frame = 0; frame <= 60; frame++) {
      cast.update(frame / 10);
      for (const actor of cast.getActors().values()) for (const prop of actor.props) {
        const hand = actor.model.getObjectByName(`mixamorig${prop.hand}Hand`).getWorldPosition(new THREE.Vector3());
        const finger = actor.model.getObjectByName(`mixamorig${prop.hand}HandMiddle1`).getWorldPosition(new THREE.Vector3());
        const expected = hand.lerp(finger, .65);
        expect(prop.object.getWorldPosition(new THREE.Vector3()).distanceTo(expected)).toBeLessThan(.0001);
      }
    }
    expect([...cast.getActors().values()].map((a) => a.container.position.y)).toEqual(initialY);
    cast.dispose();
  });
  it('plays the requested captures with a free thumping hand, a held spear, and a bouncing guard', () => {
    const cast = setup();
    const goliath = cast.getActors().get('goliath'); const david = cast.getActors().get('david');
    expect(goliath.motionSource).toBe('Standing Taunt Chest Thump');
    expect(david.motionSource).toBe('Bouncing Fight Idle');
    expect(goliath.props.find((p) => p.object.name === 'goliath-spear').hand).toBe('Left');
    expect(david.props.map((p) => p.object.name)).toEqual(['woven-sling']);
    expect(david.container.getObjectByName('shepherd-staff')).toBeDefined();
    const local = (actor, name) => actor.container.worldToLocal(actor.model.getObjectByName(`mixamorig${name}`).getWorldPosition(new THREE.Vector3()));
    let handMin = Infinity; let handMax = -Infinity; let hipMin = Infinity; let hipMax = -Infinity;
    let nearestChest = Infinity;
    for (let frame = 0; frame < 90; frame++) {
      cast.update(frame / 30);
      const hand = local(goliath, 'RightHand');
      handMin = Math.min(handMin, hand.y); handMax = Math.max(handMax, hand.y);
      nearestChest = Math.min(nearestChest, hand.distanceTo(local(goliath, 'Spine2')));
      const hip = local(david, 'Hips'); hipMin = Math.min(hipMin, hip.y); hipMax = Math.max(hipMax, hip.y);
    }
    expect(handMax - handMin).toBeGreaterThan(.35);
    expect(nearestChest).toBeLessThan(.5);
    expect(hipMax - hipMin).toBeGreaterThan(.012);
    for (const actor of [david, goliath]) {
      cast.update(0); const start = local(actor, 'RightHand');
      cast.update(actor.clip.duration - .0001);
      expect(local(actor, 'RightHand').distanceTo(start)).toBeLessThan(.002);
      for (const track of actor.clip.tracks.filter((t) => t.name.endsWith('.quaternion'))) {
        for (let i = 0; i < track.values.length; i += 4) expect(new THREE.Quaternion().fromArray(track.values, i).length()).toBeCloseTo(1, 5);
      }
      const source = mixamoClips[actor.id];
      expect(source.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(source.targetSha256).toBe(ELAH_CHARACTER_ASSETS.find((a) => a.id === `human-${actor.id}`).sha256);
    }
    cast.dispose();
  });
  it('grounds deformed feet during the captured poses without changing physical scale', () => {
    const cast = setup();
    for (const time of [0, .5, 1, 1.5, 2, 2.5]) {
      cast.update(time);
      for (const id of ['david', 'goliath']) {
        const actor = cast.getActors().get(id); const box = bodyBounds(actor);
        expect(Math.abs(box.min.y - terrainHeight(actor.x, actor.z))).toBeLessThan(.035);
        expect(actor.model.getObjectByName('PhysicalHeight').userData.bodyHeightMeters).toBe(actor.height);
      }
    }
    cast.dispose();
  });
  it('retains all principals on low quality and freezes reduced motion', () => {
    const cast = setup({ reducedMotion: true });
    const hand = cast.getActors().get('david').model.getObjectByName('mixamorigRightHand');
    const q = hand.quaternion.clone(); cast.update(3); expect(hand.quaternion.equals(q)).toBe(true);
    cast.setQuality({ name: 'low' });
    expect(cast.getActors().size).toBe(3);
    cast.getActors().forEach((actor) => actor.model.traverse((n) => {
      if (n.name.includes('_LOD0')) expect(n.visible).toBe(false);
      if (n.name.includes('_LOD1')) expect(n.visible).toBe(true);
    }));
    cast.dispose();
  });
  it('allows partial asset recovery, avoids duplicate actors, and owns only clone resources', () => {
    const root = new THREE.Group(); const cast = createElahPrincipals(THREE, root);
    cast.acceptAssets({ models: { 'human-david': models['human-david'] } });
    expect(cast.isReady()).toBe(false); expect(cast.getActors().size).toBe(1);
    cast.acceptAssets({ models }); cast.acceptAssets({ models }); expect(cast.getActors().size).toBe(3);
    const sourceMesh = models['human-david'].scene.getObjectByProperty('isSkinnedMesh', true);
    const geometryDispose = vi.spyOn(sourceMesh.geometry, 'dispose');
    const skeleton = cast.getActors().get('david').model.getObjectByProperty('isSkinnedMesh', true).skeleton;
    const skeletonDispose = vi.spyOn(skeleton, 'dispose');
    cast.dispose(); cast.dispose(); cast.acceptAssets({ models });
    expect(geometryDispose).not.toHaveBeenCalled(); expect(skeletonDispose).toHaveBeenCalledTimes(1);
    expect(root.children).toHaveLength(0); expect(cast.getActors().size).toBe(0);
    expect(createDavidGoliathTableau).toBe(createElahPrincipals);
  });
});
