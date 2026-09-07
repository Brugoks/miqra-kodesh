import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { TABLEAU_MODEL_ASSETS } from './sceneTableauAssets.js';
import { createMark2Tableau, TABLEAU, TABLEAU_CAST, inTableauArea } from './mark2Tableau.js';
import { LEVEL, ROOF_OPENING } from './capernaumDimensions.js';

const models = {};
beforeAll(async () => {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new THREE.Texture() }));
  for (const asset of [...HUMAN_MODEL_ASSETS, ...TABLEAU_MODEL_ASSETS]) {
    const bytes = readFileSync(resolve('public', asset.url.slice(1)));
    models[asset.id] = await loader.parseAsync(new Uint8Array(bytes).buffer, '');
  }
});
const position = (object) => object.getWorldPosition(new THREE.Vector3());
function setup() {
  const root = new THREE.Group(); const onReady = vi.fn();
  const tableau = createMark2Tableau(THREE, { root, onReady });
  tableau.acceptAssets({ models });
  return { root, tableau, onReady };
}

describe('Mark 2 persistent tableau with shipped human rigs', () => {
  it('waits for the entire cast, rejects incomplete rigs, and instantiates only once', () => {
    const onReady = vi.fn(); const tableau = createMark2Tableau(THREE, { root: new THREE.Group(), onReady });
    tableau.acceptAssets({ models: Object.fromEntries(Object.entries(models).filter(([id]) => id !== 'human-jesus')) });
    expect(tableau.isReady()).toBe(false); expect(tableau.group.visible).toBe(false);
    tableau.acceptAssets({ models: { 'human-jesus': { scene: new THREE.Group() } } });
    expect(tableau.isReady()).toBe(false);
    tableau.acceptAssets({ models }); tableau.acceptAssets({ models });
    expect(tableau.getActors().size).toBe(TABLEAU_CAST.length);
    expect(onReady).toHaveBeenCalledTimes(1); tableau.dispose();
  });

  it('keeps the mat suspended and four separate rope paths attached to both hands', () => {
    const { tableau } = setup();
    const carriers = [...tableau.getActors().values()].filter((actor) => actor.rope);
    expect(carriers).toHaveLength(4);
    for (let frame = 0; frame < 120; frame++) {
      tableau.update({ delta: 0.1 });
      expect(tableau.mat.position.y).toBe(TABLEAU.centre[1]);
      for (const actor of carriers) {
        expect(actor.entry.position[0] < ROOF_OPENING.x0 || actor.entry.position[0] > ROOF_OPENING.x1 || actor.entry.position[2] < ROOF_OPENING.z0 || actor.entry.position[2] > ROOF_OPENING.z1).toBe(true);
        actor.hands.forEach((hand, i) => {
          const palm = hand.localToWorld(new THREE.Vector3(0, 0.055, 0));
          expect(palm.distanceTo(actor.points[i + 1])).toBeLessThan(0.00001);
        });
        actor.rope.forEach((rope, i) => {
          const half = new THREE.Vector3(0, rope.scale.y / 2, 0).applyQuaternion(rope.quaternion);
          expect(rope.position.clone().sub(half).distanceTo(actor.points[i])).toBeLessThan(0.00001);
          expect(rope.position.clone().add(half).distanceTo(actor.points[i + 1])).toBeLessThan(0.00001);
        });
      }
    }
    const patient = tableau.getActors().get('paralytic').root;
    const head = position(patient.getObjectByName('mixamorigHead'));
    const foot = position(patient.getObjectByName('mixamorigLeftFoot'));
    expect(Math.abs(head.y - foot.y)).toBeLessThan(0.3);
    expect(head.z).toBeLessThan(foot.z);
    expect(head.y).toBeGreaterThan(TABLEAU.centre[1]);
    tableau.dispose();
  });

  it('freezes reduced motion, preserves all six principal actors at low quality, and releases only owned resources', () => {
    const { root, tableau } = setup();
    tableau.update({ delta: 0.1, quality: 'low' });
    const actors = [...tableau.getActors().values()];
    for (const actor of actors.filter((actor) => !actor.entry.audience)) {
      expect(actor.root.visible).toBe(true);
      expect(actor.meshes[1].every((mesh) => mesh.visible)).toBe(true);
    }
    const elapsed = tableau.getElapsed(); const matMatrix = tableau.mat.matrix.clone();
    const grips = actors.filter((actor) => actor.rope).map((actor) => position(actor.hands[0]));
    tableau.update({ delta: 5, reducedMotion: true });
    expect(tableau.getElapsed()).toBe(elapsed); expect(tableau.mat.matrix.equals(matMatrix)).toBe(true);
    actors.filter((actor) => actor.rope).forEach((actor, i) => expect(position(actor.hands[0]).equals(grips[i])).toBe(true));
    const shared = actors[0].meshes[1][0].geometry; const dispose = vi.spyOn(shared, 'dispose');
    tableau.dispose(); tableau.dispose();
    expect(root.children).toHaveLength(0); expect(dispose).not.toHaveBeenCalled(); expect(tableau.isReady()).toBe(false);
    expect(tableau.queryClearance(16, 12.5).collides).toBe(false); dispose.mockRestore();
  });

  it('reserves the room, protects the full mat, and separates rooftop from interior collisions', () => {
    const { tableau } = setup();
    expect(inTableauArea(16, 12.5)).toBe(true); expect(inTableauArea(0, 0)).toBe(false);
    for (const z of [11.5, 12.5, 13.5]) expect(tableau.queryClearance(16, z, 0.35, LEVEL.ground).collides).toBe(true);
    const carrier = TABLEAU_CAST.find((actor) => actor.corner);
    expect(tableau.queryClearance(carrier.position[0], carrier.position[2], 0.35, LEVEL.roof).collides).toBe(true);
    expect(tableau.queryClearance(16, 12.5, 0.35, LEVEL.roof).collides).toBe(false);
    tableau.dispose();
  });
});
