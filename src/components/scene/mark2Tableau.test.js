import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { TABLEAU_MODEL_ASSETS } from './sceneTableauAssets.js';
import { createMark2Tableau, TABLEAU, TABLEAU_CAST, inTableauArea, doorGaps } from './mark2Tableau.js';
import { LEVEL, ROOF_OPENING, HOUSE, COURTYARD } from './capernaumDimensions.js';
import { BARRIERS, blockerAt } from './capernaumNavigation.js';
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

  // --- "no more room, not even at the door" (Mark 2:2) -------------------
  //
  // The four men going up on the roof only makes sense if the door was
  // genuinely impassable, so the press at it is staged as a measurable fact
  // rather than a suggestion, and these are the measurements.

  it('leaves no gap across the doorway that the mat could have been carried through', () => {
    const gaps = doorGaps();
    expect(gaps.length).toBeGreaterThan(2);
    // The mat is the thing that has to fail to fit. Nothing else about the
    // scene explains why four men climbed a wall carrying a fifth.
    expect(Math.max(...gaps)).toBeLessThan(TABLEAU.width);
    // And the bodies really are inside the opening, not lined up beside it.
    const inDoor = TABLEAU_CAST.filter((entry) => entry.plug
      && entry.position[0] > HOUSE.doorX0 && entry.position[0] < HOUSE.doorX1);
    expect(inDoor.length).toBeGreaterThanOrEqual(5);
    expect(inDoor.some((entry) => entry.position[2] < COURTYARD.z0)).toBe(true);
  });

  it('closes the door with people, and only with people', () => {
    // A flood fill from the courtyard to the middle of the room. Run twice:
    // once against the crowd, once against the bare map. The first must fail
    // and the second must succeed — otherwise the doorway has quietly become
    // a wall, which is a different scene and breaks the walk into the house
    // that capernaumNavigation.test.js guarantees.
    const { tableau } = setup();
    const STEP = 0.05;
    const x0 = 13.8; const x1 = 17.4; const z0 = 14.2; const z1 = 21.4;
    const cols = Math.round((x1 - x0) / STEP); const rows = Math.round((z1 - z0) / STEP);
    const reaches = (withCrowd) => {
      const seen = new Set();
      const key = (c, r) => c * 10000 + r;
      const free = (c, r) => {
        const x = x0 + c * STEP; const z = z0 + r * STEP;
        if (blockerAt(x, z, LEVEL.ground)) return false;
        return !(withCrowd && tableau.queryClearance(x, z, 0.35, LEVEL.ground).collides);
      };
      const startC = Math.round((15.6 - x0) / STEP); const startR = rows - 1;
      if (!free(startC, startR)) return false;
      const queue = [[startC, startR]];
      seen.add(key(startC, startR));
      const goalR = Math.round((14.6 - z0) / STEP);
      while (queue.length) {
        const [c, r] = queue.pop();
        if (r <= goalR) return true;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc; const nr = r + dr;
          if (nc < 0 || nr < 0 || nc > cols || nr > rows) continue;
          if (seen.has(key(nc, nr)) || !free(nc, nr)) continue;
          seen.add(key(nc, nr));
          queue.push([nc, nr]);
        }
      }
      return false;
    };
    expect(reaches(false), 'the doorway itself must stay open geometry').toBe(true);
    expect(reaches(true), 'the crowd must actually close it').toBe(false);
    tableau.dispose();
  });

  it('tells the visitor why it will not let them past, and keeps saying it at low quality', () => {
    const { tableau } = setup();
    // Refused, and the refusal names a barrier the scene can read out.
    const stopped = tableau.queryClearance(15.6, 16.4, 0.35, LEVEL.ground);
    expect(stopped.collides).toBe(true);
    expect(stopped.barrier).toBe('door-crowd');
    expect(BARRIERS['door-crowd'].refs).toContain('Mark 2:1-4');
    expect(BARRIERS['door-crowd'].body.length).toBeGreaterThan(80);
    // Someone standing well clear is not told anything.
    expect(tableau.queryClearance(15.6, 21.4, 0.35, LEVEL.ground).collides).toBe(false);
    // The press is what carries the point, so it survives the quality cut
    // that reduces mesh detail.
    tableau.update({ delta: 0.1, quality: 'low' });
    for (const actor of tableau.getActors().values()) {
      if (actor.entry.plug) expect(actor.root.visible, `${actor.entry.id} vanished`).toBe(true);
    }
    tableau.dispose();
  });

  it('fills the doorway from the At the Door vantage', () => {
    const { tableau } = setup();
    tableau.update({ delta: 0.1 });
    const vantage = CAPERNAUM.vantages.find((entry) => entry.id === 'the-doorway');
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.5, 2400);
    camera.position.fromArray(vantage.position);
    camera.lookAt(new THREE.Vector3(...vantage.lookAt));
    camera.updateMatrixWorld(true);
    const jamb = (x) => new THREE.Vector3(x, LEVEL.ground + 1, COURTYARD.z0).project(camera).x;
    const [west, east] = [jamb(HOUSE.doorX0), jamb(HOUSE.doorX1)];
    expect(west).toBeLessThan(0);
    expect(east).toBeGreaterThan(0);
    // Every body standing in the opening projects inside it from here, so the
    // visitor is looking at a plugged door rather than at a crowd beside one.
    const across = [...tableau.getActors().values()]
      .filter((actor) => actor.entry.plug)
      .map((actor) => position(actor.root.getObjectByName('mixamorigHead')).project(camera));
    expect(across).toHaveLength(5);
    for (const point of across) {
      expect(point.z).toBeLessThan(1);
      expect(point.x).toBeGreaterThan(west - 0.08);
      expect(point.x).toBeLessThan(east + 0.08);
    }
    // Shoulders span the opening; heads stay clear of its stone jambs.
    const xs = [...tableau.getActors().values()].filter((actor) => actor.entry.plug)
      .flatMap((actor) => [-0.24, 0.24].map((dx) => new THREE.Vector3(
        actor.entry.position[0] + dx, 1.4, actor.entry.position[2],
      ).project(camera).x)).sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(west * 0.7);
    expect(xs[xs.length - 1]).toBeGreaterThan(east * 0.7);
    expect(Math.min(...xs.map(Math.abs))).toBeLessThan(0.15);
    tableau.dispose();
  });

  it('gives every exterior listener a sightline to Jesus through both jamb planes', () => {
    const jesus = TABLEAU_CAST.find((entry) => entry.id === 'jesus');
    const outside = TABLEAU_CAST.filter((entry) => entry.id.startsWith('door-'));
    expect(outside.length).toBeGreaterThanOrEqual(25);
    for (const entry of outside) {
      expect(entry.target).toEqual([jesus.position[0], jesus.position[2]]);
      for (const z of [HOUSE.z1, COURTYARD.z0]) {
        if (z > entry.position[2]) continue;
        const t = (z - jesus.position[2]) / (entry.position[2] - jesus.position[2]);
        const x = jesus.position[0] + t * (entry.position[0] - jesus.position[0]);
        expect(x, entry.id).toBeGreaterThan(HOUSE.doorX0 + 0.04);
        expect(x, entry.id).toBeLessThan(HOUSE.doorX1 - 0.04);
      }
    }
  });

  it('packs the room and court without overlapping bodies or occupying arrival views', () => {
    const ground = TABLEAU_CAST.filter((entry) => !entry.onMat && !entry.corner);
    expect(ground.filter((entry) => entry.position[2] < HOUSE.z1).length).toBeGreaterThanOrEqual(20);
    for (let i = 0; i < ground.length; i++) {
      const [x, , z] = ground[i].position;
      expect(blockerAt(x, z, LEVEL.ground), ground[i].id).toBeNull();
      for (const other of ground.slice(i + 1)) {
        expect(Math.hypot(x - other.position[0], z - other.position[2]), `${ground[i].id}/${other.id}`).toBeGreaterThanOrEqual(0.57);
      }
    }
    const { tableau } = setup();
    for (const id of ['the-doorway', 'inside-the-house']) {
      const [x, , z] = CAPERNAUM.vantages.find((entry) => entry.id === id).position;
      expect(tableau.queryClearance(x, z, 0.35, LEVEL.ground).collides, id).toBe(false);
    }
    tableau.update({ quality: 'low', reducedMotion: true });
    expect([...tableau.getActors().values()].every((actor) => actor.root.visible)).toBe(true);
    tableau.dispose();
  });

  it('animates every actor at the door with arms held close to their sides', () => {
    const { tableau } = setup();
    tableau.update({ delta: 0.1 });
    const doorActors = [...tableau.getActors().values()]
      .filter((actor) => actor.entry.id.startsWith('door-'));
    expect(doorActors.length).toBeGreaterThanOrEqual(10);
    for (const actor of doorActors) {
      const actions = actor.mixer._actions;
      expect(actions.length).toBeGreaterThan(0);
      const playing = actions.some((action) => action.isRunning());
      expect(playing, `${actor.entry.id} is not playing clip for pose ${actor.entry.pose}`).toBe(true);

      actor.root.updateMatrixWorld(true);
      const armL = actor.root.getObjectByName('mixamorigLeftArm');
      const handL = actor.root.getObjectByName('mixamorigLeftHand');
      const armR = actor.root.getObjectByName('mixamorigRightArm');
      const handR = actor.root.getObjectByName('mixamorigRightHand');
      const localArmL = actor.root.worldToLocal(armL.getWorldPosition(new THREE.Vector3()));
      const localHandL = actor.root.worldToLocal(handL.getWorldPosition(new THREE.Vector3()));
      const localArmR = actor.root.worldToLocal(armR.getWorldPosition(new THREE.Vector3()));
      const localHandR = actor.root.worldToLocal(handR.getWorldPosition(new THREE.Vector3()));
      expect(Math.abs(localHandL.x - localArmL.x), `${actor.entry.id} left arm spread out`).toBeLessThan(0.08);
      expect(Math.abs(localHandR.x - localArmR.x), `${actor.entry.id} right arm spread out`).toBeLessThan(0.08);
    }
    tableau.dispose();
  });
});
