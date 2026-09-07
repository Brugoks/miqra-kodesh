import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  beforeAll, describe, it, expect, vi,
} from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { TABLEAU_MODEL_ASSETS } from './sceneTableauAssets.js';
import {
  createMatthew9Tableau, MATTHEW_CAST, TAX_TABLE, inMatthewTableauArea,
} from './matthew9Tableau.js';
import { LEVEL, TAX_BOOTH } from './capernaumDimensions.js';
import { blockerAt } from './capernaumNavigation.js';
import { CAPERNAUM } from '../../lib/capernaumScene.js';

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
  const root = new THREE.Group();
  const onReady = vi.fn();
  const tableau = createMatthew9Tableau(THREE, { root, onReady });
  tableau.acceptAssets({ models });
  return { root, tableau, onReady };
}

describe('the call of Matthew, staged at the customs post', () => {
  it('waits for the whole cast, rejects an incomplete rig, and instantiates once', () => {
    const onReady = vi.fn();
    const tableau = createMatthew9Tableau(THREE, { root: new THREE.Group(), onReady });
    tableau.acceptAssets({
      models: Object.fromEntries(Object.entries(models).filter(([id]) => id !== 'human-matthew')),
    });
    expect(tableau.isReady()).toBe(false);
    expect(tableau.group.visible).toBe(false);
    // A model without the bones the poses need must not be accepted as Matthew.
    tableau.acceptAssets({ models: { 'human-matthew': { scene: new THREE.Group() } } });
    expect(tableau.isReady()).toBe(false);
    tableau.acceptAssets({ models });
    tableau.acceptAssets({ models });
    expect(tableau.getActors().size).toBe(MATTHEW_CAST.length);
    expect(onReady).toHaveBeenCalledTimes(1);
    tableau.dispose();
  });

  it('gives Matthew a character of his own rather than reusing a villager', () => {
    // The point of the scene is that you can tell which one he is. He is the
    // only actor on his own model, and nobody else in Capernaum uses it.
    const matthew = MATTHEW_CAST.find((entry) => entry.id === 'matthew');
    expect(matthew.model).toBe('human-matthew');
    expect(MATTHEW_CAST.filter((entry) => entry.model === matthew.model)).toHaveLength(1);
    expect(HUMAN_MODEL_ASSETS.some((asset) => asset.id === matthew.model)).toBe(false);
    expect(TABLEAU_MODEL_ASSETS.some((asset) => asset.id === matthew.model)).toBe(true);
    // And the shipped rig really is a distinct build: it carries the girdle
    // and purse no other character has.
    const named = [];
    models[matthew.model].scene.traverse((node) => { if (node.isMesh) named.push(node.name); });
    expect(named.some((name) => /girdle/i.test(name))).toBe(true);
    for (const other of ['human-jesus', 'human-artisan', 'human-villager', 'human-traveler']) {
      const otherNames = [];
      models[other].scene.traverse((node) => { if (node.isMesh) otherNames.push(node.name); });
      expect(otherNames.some((name) => /girdle/i.test(name))).toBe(false);
    }
  });

  it('holds the encounter: Jesus reaching for a seated Matthew across his own table', () => {
    const { tableau } = setup();
    const matthew = tableau.getActors().get('matthew');
    const jesus = tableau.getActors().get('jesus');
    for (let frame = 0; frame < 120; frame += 1) {
      tableau.update({ delta: 0.1 });
      const head = position(matthew.head);
      const shoulder = position(jesus.shoulder);
      const reaching = position(jesus.hands[1]);
      // Matthew is sitting: his head is well below a standing man's.
      expect(head.y).toBeLessThan(position(jesus.head).y - 0.2);
      expect(head.y).toBeGreaterThan(LEVEL.ground + 0.9);
      // The extended hand is genuinely extended — nearer to Matthew than the
      // shoulder it hangs off, and within arm's reach of him rather than
      // pointing off into the road.
      expect(reaching.distanceTo(head)).toBeLessThan(shoulder.distanceTo(head));
      expect(reaching.distanceTo(head)).toBeLessThan(1.2);
      // Both men are behind/in front of the table, not standing in it.
      expect(position(matthew.root).x).toBeLessThan(TAX_TABLE.x - TAX_TABLE.depth / 2);
      expect(position(jesus.root).x).toBeGreaterThan(TAX_TABLE.x + TAX_TABLE.depth / 2);
    }
    tableau.dispose();
  });

  it('keeps the stylus in the writing hand and the balance pans on their threads', () => {
    const { tableau } = setup();
    const matthew = tableau.getActors().get('matthew');
    for (let frame = 0; frame < 90; frame += 1) {
      tableau.update({ delta: 0.1 });
      const stylus = tableau.getStylus();
      const palm = matthew.hands[1].localToWorld(new THREE.Vector3(0, 0.06, 0));
      expect(position(stylus).distanceTo(palm)).toBeLessThan(0.00001);
      const { beam, pans } = tableau.getBalance();
      for (const entry of pans) {
        // The pan hangs plumb below the beam end, and the thread joins the two.
        expect(entry.pan.position.x).toBeCloseTo(entry.end.x, 6);
        expect(entry.pan.position.z).toBeCloseTo(entry.end.z, 6);
        expect(entry.pan.position.y).toBeLessThan(entry.end.y);
        const half = new THREE.Vector3(0, entry.thread.scale.y / 2, 0)
          .applyQuaternion(entry.thread.quaternion);
        expect(entry.thread.position.clone().sub(half).distanceTo(entry.end)).toBeLessThan(0.00001);
        expect(entry.thread.position.clone().add(half).distanceTo(entry.pan.position))
          .toBeLessThan(0.00001);
      }
      expect(Number.isFinite(beam.rotation.z)).toBe(true);
    }
    tableau.dispose();
  });

  it('rests both seated men\u2019s hands on the table rather than in their laps', () => {
    // The sit pose parks the hands on the thighs, a good 15cm below the top
    // and behind its edge. Everything that makes this a tax booth — the
    // tablet, the stylus, the coins being counted — depends on the hands
    // actually being on the table, so it is measured rather than eyeballed.
    const { tableau } = setup();
    tableau.update({ delta: 0.1 });
    for (const id of ['matthew', 'clerk']) {
      for (const hand of tableau.getActors().get(id).hands) {
        const palm = position(hand);
        expect(palm.y).toBeGreaterThan(TAX_TABLE.top - 0.02);
        expect(palm.y).toBeLessThan(TAX_TABLE.top + 0.12);
        expect(Math.abs(palm.x - TAX_TABLE.x)).toBeLessThan(TAX_TABLE.depth / 2);
        expect(Math.abs(palm.z - TAX_TABLE.z)).toBeLessThan(TAX_TABLE.length / 2);
      }
    }
    tableau.dispose();
  });

  it('frames both men from the tax-booth vantage, and does not land the visitor in the furniture', () => {
    // The failure this exists to catch does not look like a failure: the scene
    // renders perfectly and is simply pointed somewhere else. The first cut of
    // this vantage was aimed 38 degrees off the composition.
    const { tableau } = setup();
    tableau.update({ delta: 0.1 });
    const vantage = CAPERNAUM.vantages.find((entry) => entry.id === 'the-tax-booth');
    // Same vertical FOV as Scene.jsx's camera, at 4:3 — the narrowest ordinary
    // desktop window, and so the tightest horizontal framing it has to survive.
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.5, 2400);
    camera.position.fromArray(vantage.position);
    camera.lookAt(new THREE.Vector3(...vantage.lookAt));
    camera.updateMatrixWorld(true);
    for (const id of ['matthew', 'jesus']) {
      const head = position(tableau.getActors().get(id).head);
      const ndc = head.clone().project(camera);
      expect(ndc.z, `${id} is behind the camera`).toBeLessThan(1);
      expect(Math.abs(ndc.x), `${id} is off the side of the frame`).toBeLessThan(0.95);
      expect(Math.abs(ndc.y), `${id} is off the top or bottom of the frame`).toBeLessThan(0.95);
      expect(head.distanceTo(camera.position), `${id} is too far to read`).toBeLessThan(4);
    }
    // Arriving inside the table or on top of an actor would shove the visitor
    // back out the moment the flight lands.
    const [x, , z] = vantage.position;
    expect(tableau.queryClearance(x, z, 0.35, LEVEL.ground).collides).toBe(false);
    tableau.dispose();
  });

  it('stands the whole cast on the ground, under the awning, and out of the booth wall', () => {
    const { tableau } = setup();
    tableau.update({ delta: 0.1 });
    for (const actor of tableau.getActors().values()) {
      const [x, , z] = actor.entry.position;
      // Clear of the booth's masonry and inside the awning it shelters under.
      expect(x).toBeGreaterThan(TAX_BOOTH.x1);
      expect(x).toBeLessThan(TAX_BOOTH.x1 + 3.6);
      expect(z).toBeGreaterThan(TAX_BOOTH.z0);
      expect(z).toBeLessThan(TAX_BOOTH.z1);
      expect(blockerAt(x, z, LEVEL.ground)).toBeNull();
      // Feet on the floor: an actor's lowest bone sits at ground level, not
      // sunk into it or hovering over it.
      const foot = position(actor.root.getObjectByName('mixamorigLeftFoot'));
      expect(foot.y).toBeGreaterThan(LEVEL.ground - 0.15);
      expect(foot.y).toBeLessThan(LEVEL.ground + 0.65);
      expect(Number.isFinite(foot.x) && Number.isFinite(foot.z)).toBe(true);
    }
    tableau.dispose();
  });

  it('freezes under reduced motion, keeps both principals at low quality, and owns only its props', () => {
    const { root, tableau } = setup();
    tableau.update({ delta: 0.1, quality: 'low' });
    const actors = [...tableau.getActors().values()];
    for (const actor of actors.filter((entry) => entry.entry.principal)) {
      expect(actor.root.visible).toBe(true);
      expect(actor.meshes[1].every((mesh) => mesh.visible)).toBe(true);
    }
    const elapsed = tableau.getElapsed();
    const hand = position(tableau.getActors().get('jesus').hands[1]);
    const stylus = tableau.getStylus().position.clone();
    tableau.update({ delta: 5, reducedMotion: true });
    expect(tableau.getElapsed()).toBe(elapsed);
    expect(position(tableau.getActors().get('jesus').hands[1]).equals(hand)).toBe(true);
    expect(tableau.getStylus().position.equals(stylus)).toBe(true);

    const shared = actors[0].meshes[1][0].geometry;
    const dispose = vi.spyOn(shared, 'dispose');
    tableau.dispose();
    tableau.dispose();
    expect(root.children).toHaveLength(0);
    expect(dispose).not.toHaveBeenCalled();
    expect(tableau.isReady()).toBe(false);
    expect(tableau.queryClearance(TAX_TABLE.x, TAX_TABLE.z).collides).toBe(false);
    dispose.mockRestore();
  });

  it('makes the table and the people standing at it solid, and only at their own height', () => {
    const { tableau } = setup();
    for (const z of [TAX_TABLE.z - 1.2, TAX_TABLE.z, TAX_TABLE.z + 1.2]) {
      expect(tableau.queryClearance(TAX_TABLE.x, z, 0.35, LEVEL.ground).collides).toBe(true);
    }
    const jesus = MATTHEW_CAST.find((entry) => entry.id === 'jesus');
    const blocked = tableau.queryClearance(jesus.position[0], jesus.position[2], 0.35, LEVEL.ground);
    expect(blocked.collides).toBe(true);
    expect(Math.hypot(blocked.pushX, blocked.pushZ)).toBeGreaterThan(0);
    // Nothing here reaches the roofs, so it must not block anyone up there.
    expect(tableau.queryClearance(TAX_TABLE.x, TAX_TABLE.z, 0.35, LEVEL.roof).collides).toBe(false);
    tableau.dispose();
  });

  it('reserves the booth from the ambient crowd without swallowing the queue behind it', () => {
    expect(inMatthewTableauArea(TAX_TABLE.x, TAX_TABLE.z)).toBe(true);
    expect(inMatthewTableauArea(-47.5, 0)).toBe(true);
    // The tax-booth-queue haunt and the lane walkers live north of this.
    expect(inMatthewTableauArea(-48, 4)).toBe(false);
    expect(inMatthewTableauArea(-47.6, 2.2)).toBe(false);
    expect(inMatthewTableauArea(0, 0)).toBe(false);
  });

  it('is deterministic, and builds nothing with a NaN in it', () => {
    const first = setup().tableau;
    first.update({ delta: 0.1 });
    const sample = () => {
      const values = [];
      first.group.updateMatrixWorld(true);
      first.group.traverse((node) => values.push(...node.matrixWorld.elements));
      return values;
    };
    const before = sample();
    expect(before.every(Number.isFinite)).toBe(true);
    first.dispose();

    const second = setup().tableau;
    second.update({ delta: 0.1 });
    second.group.updateMatrixWorld(true);
    const after = [];
    second.group.traverse((node) => after.push(...node.matrixWorld.elements));
    expect(after).toEqual(before);
    second.dispose();
  });
});
