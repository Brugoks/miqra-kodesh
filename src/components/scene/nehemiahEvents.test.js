import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  beforeAll, afterEach, describe, it, expect, vi,
} from 'vitest';
import * as THREE from 'three';
import { createTestGltfLoader } from '../../test/gltf.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';
import {
  NEHEMIAH_CASTS, NEHEMIAH_STAGES, NEHEMIAH_POSES, createNehemiahStage, createNehemiahEventStages, standingHeight,
} from './nehemiahEvents.js';
import { PLATFORM } from './nehemiahCity.js';
import { POSE_SECONDS } from './sceneTableau.js';
import {
  EYE_HEIGHT, EVENT_GROUND, EVENT_WALL_STATE, groundAt,
} from './nehemiahDimensions.js';
import { PROFILE_BY_ID, frameAt, nearestWall } from './nehemiahWalls.js';
import { blockerAt, stanceAt, setWallState } from './nehemiahNavigation.js';
import { decodeMotionLibrary, MOTION_URL } from './sceneMixamo.js';
import { NEHEMIAH } from '../../lib/nehemiahScene.js';

// The staged moments of the book of Nehemiah, checked as the other scenes' are:
// everyone standing on the floor under them — the ground, the walkway, a
// platform — out of the walls and out of each other; who each moment is about
// in frame from where the visitor is put; and the things carried landing where
// they should, measured on the real bodies.

const motionLibrary = decodeMotionLibrary(JSON.parse(readFileSync(resolve('public', MOTION_URL.slice(1)), 'utf8')));
const models = {};
beforeAll(async () => {
  const loader = createTestGltfLoader();
  const needed = new Set(Object.values(NEHEMIAH_CASTS).flatMap((cast) => cast.map((entry) => entry.model)));
  for (const asset of [...HUMAN_MODEL_ASSETS, ...TABERNACLE_CHARACTER_ASSETS]) {
    if (!needed.has(asset.id)) continue;
    const bytes = readFileSync(resolve('public', asset.url.slice(1)));
    models[asset.id] = await loader.parseAsync(new Uint8Array(bytes).buffer, '');
  }
});
afterEach(() => setWallState('built'));

const position = (object) => object.getWorldPosition(new THREE.Vector3());
const bone = (actor, name) => actor.root.getObjectByName(`mixamorig${name}`);
function stage(event, options = {}) {
  setWallState(EVENT_WALL_STATE[event]);
  const root = new THREE.Group();
  const tableau = createNehemiahStage(THREE, event, { root, motionLibrary, active: true, ...options });
  tableau.acceptAssets({ models });
  tableau.update({ delta: 0.1 });
  root.updateMatrixWorld(true);
  return { root, tableau, actors: tableau.getActors() };
}

// How far a moment may be seen from. A reading to a whole square is seen from
// the back of it, over the people it is being read to.
const REACH = { 'water-gate': 36 };

describe.each(Object.keys(NEHEMIAH_STAGES))('%s', (id) => {
  const cast = NEHEMIAH_CASTS[NEHEMIAH_STAGES[id]];
  const event = NEHEMIAH.events.find((entry) => entry.id === id);

  it('is an event in the manifest, its cast standing on the floor under them', () => {
    expect(event).toBeTruthy();
    for (const entry of cast) {
      const [x, y, z] = entry.position;
      const expected = entry.y ?? standingHeight(x, z);
      expect(y, `${entry.id} stands on the floor`).toBeCloseTo(expected, 5);
    }
  });

  it('builds its cast only once it is staged, and then all of it', () => {
    const { tableau } = stage(id, { active: false });
    expect(tableau.isReady()).toBe(false);
    tableau.setActive(true);
    expect(tableau.isReady()).toBe(true);
    expect(tableau.getActors().size).toBe(cast.length);
    tableau.dispose();
  });

  it('loops every authored pose it uses without a jump', () => {
    const numbers = (value) => (typeof value === 'number' ? [value]
      : typeof value === 'object' ? Object.values(value).flatMap(numbers) : []);
    for (const name of new Set(cast.filter((entry) => entry.pose && !entry.motion).map((entry) => entry.pose))) {
      expect(NEHEMIAH_POSES[name], name).toBeTypeOf('function');
      const end = numbers(NEHEMIAH_POSES[name](POSE_SECONDS));
      numbers(NEHEMIAH_POSES[name](0)).forEach((value, i) => expect(end[i], name).toBeCloseTo(value, 9));
    }
  });

  it('stands everyone clear of the walls, the houses and each other, feet on their floor', () => {
    const { tableau, actors } = stage(id);
    for (const actor of actors.values()) {
      const { entry } = actor;
      const [x, y, z] = entry.position;
      expect(blockerAt(x, z, y), `${entry.id} at (${x}, ${z})`).toBeNull();
      for (const side of ['Left', 'Right']) {
        const foot = position(bone(actor, `${side}Foot`));
        const under = Math.max(standingHeight(foot.x, foot.z), y);
        expect(foot.y - under, `${entry.id} ${side} foot`).toBeGreaterThan(-0.14);
        expect(foot.y - under, `${entry.id} ${side} foot`).toBeLessThan(0.62);
      }
    }
    const list = [...actors.values()];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i].entry;
        const b = list[j].entry;
        expect(Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]), `${a.id} / ${b.id}`).toBeGreaterThan(a.scale || b.scale ? 0.4 : 0.55);
      }
    }
    tableau.dispose();
  });

  it('frames who it is about from where it puts the visitor, with nobody in the way', () => {
    const { tableau, actors } = stage(id);
    const principals = [...actors.values()].filter((actor) => actor.entry.principal);
    expect(principals.length).toBeGreaterThanOrEqual(1);
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 2400);
    camera.position.fromArray(event.position);
    camera.lookAt(new THREE.Vector3(...event.lookAt));
    camera.updateMatrixWorld(true);
    for (const principal of principals) {
      const head = position(bone(principal, 'Head'));
      const ndc = head.clone().project(camera);
      const who = `${principal.entry.id}`;
      expect(ndc.z, `${who} is behind the camera`).toBeLessThan(1);
      expect(Math.abs(ndc.x), `${who} is off the side`).toBeLessThan(0.92);
      expect(Math.abs(ndc.y), `${who} is off the top or bottom`).toBeLessThan(0.92);
      expect(head.distanceTo(camera.position), `${who} is too far`).toBeLessThan(REACH[id] || 26);
      const sight = new THREE.Line3(camera.position.clone(), head);
      const nearest = new THREE.Vector3();
      for (const other of actors.values()) {
        if (other === principal) continue;
        for (const part of ['Head', 'Spine2']) {
          const at = position(bone(other, part));
          sight.closestPointToPoint(at, true, nearest);
          if (nearest.distanceTo(head) < 0.05) continue;
          expect(nearest.distanceTo(at), `${who} is hidden by ${other.entry.id}`).toBeGreaterThan(0.26);
        }
      }
    }
    // A standpoint someone can stand on, clear of the cast.
    const [x, eye, z] = event.position;
    const stance = stanceAt(x, z, eye - EYE_HEIGHT);
    expect(stance).toBeTruthy();
    expect(eye).toBeCloseTo(stance.height + EYE_HEIGHT, 0);
    expect(tableau.queryClearance(x, z, 0.35, stance.height).collides).toBe(false);
    tableau.dispose();
  });

  it('keeps to its own ground', () => {
    const ground = EVENT_GROUND[id];
    for (const entry of cast) {
      const [x, , z] = entry.position;
      expect(Math.hypot(x - ground.x, z - ground.z), entry.id).toBeLessThan(ground.r);
    }
  });

  it('is deterministic, builds nothing with a NaN in it, and owns only its props', () => {
    const sample = () => {
      const { root, tableau } = stage(id);
      tableau.group.updateMatrixWorld(true);
      const values = [];
      tableau.group.traverse((node) => values.push(...node.matrixWorld.elements));
      return { root, tableau, values };
    };
    const first = sample();
    expect(first.values.every(Number.isFinite)).toBe(true);
    const shared = [...first.tableau.getActors().values()][0].meshes[1][0].geometry;
    const disposeShared = vi.spyOn(shared, 'dispose');
    first.tableau.dispose();
    expect(first.root.children).toHaveLength(0);
    expect(disposeShared).not.toHaveBeenCalled();
    disposeShared.mockRestore();
    const second = sample();
    expect(second.values).toEqual(first.values);
    second.tableau.dispose();
  });
});

describe('the moments themselves', () => {
  const actorsOf = (event) => stage(event).actors;

  it('stands Nehemiah in the same blue-grey robe wherever he appears, and Ezra as the priest he is', () => {
    const appearances = Object.entries(NEHEMIAH_CASTS).flatMap(([name, cast]) => cast.filter((entry) => entry.id === 'nehemiah').map((entry) => ({ name, entry })));
    expect(appearances.length).toBeGreaterThanOrEqual(5);
    for (const { name, entry } of appearances) {
      expect(entry.model, name).toBe('human-traveler');
      expect(entry.tint.Cloth, name).toBe(appearances[0].entry.tint.Cloth);
    }
    for (const cast of Object.values(NEHEMIAH_CASTS)) {
      for (const entry of cast.filter((e) => e.id === 'ezra')) expect(entry.model).toBe('human-tabernacle-priest');
    }
  });

  it('puts Ezra on the platform, above the people, facing them, with the book in his hand (8:4-5)', () => {
    const actors = actorsOf('water-gate');
    const ezra = actors.get('ezra');
    const [x, y, z] = ezra.entry.position;
    expect(Math.abs(x - PLATFORM.x)).toBeLessThan(PLATFORM.d / 2);
    expect(Math.abs(z - PLATFORM.z)).toBeLessThan(PLATFORM.w / 2);
    expect(y).toBeCloseTo(groundAt(PLATFORM.x, PLATFORM.z) + PLATFORM.height, 5);
    // Everyone else who sits is lower than he stands, and faces him.
    for (const actor of actors.values()) {
      if (!actor.entry.mat) continue;
      expect(actor.entry.position[1]).toBeLessThan(y - 1);
      const toward = Math.atan2(PLATFORM.x - actor.entry.position[0], PLATFORM.z - actor.entry.position[2]);
      const heading = actor.entry.target ? Math.atan2(actor.entry.target[0] - actor.entry.position[0], actor.entry.target[1] - actor.entry.position[2]) : toward;
      const turn = Math.abs(Math.atan2(Math.sin(heading - toward), Math.cos(heading - toward)));
      expect(turn, `${actor.entry.id} faces the platform`).toBeLessThan(0.5);
    }
    // The scroll is in his hand.
    const scroll = ezra.root.getObjectByName('scroll');
    expect(scroll).toBeTruthy();
    expect(position(scroll).distanceTo(position(bone(ezra, 'LeftHand')))).toBeLessThan(0.35);
    // And thirteen names stood beside him in the text, of whom two are staged.
    expect([...actors.keys()].filter((id) => id.startsWith('levite')).length).toBeGreaterThanOrEqual(2);
  });

  it('stands the two choirs on the walkway itself, in a line along the wall, facing the way they go (12:31-38)', () => {
    const actors = actorsOf('dedication');
    const profile = PROFILE_BY_ID.city;
    let lastS = -Infinity;
    for (const actor of actors.values()) {
      const [x, y, z] = actor.entry.position;
      const hit = nearestWall(x, z, 'city');
      expect(Math.abs(hit.lateral), `${actor.entry.id} on the walkway, not at its edge`).toBeLessThan(0.8);
      expect(y, `${actor.entry.id} on the walkway`).toBeCloseTo(frameAt(profile, hit.s).top, 1);
      expect(hit.s, `${actor.entry.id} in order along the wall`).toBeGreaterThan(lastS);
      lastS = hit.s;
    }
    expect(actors.get('trumpeter-a').root.getObjectByName('trumpet')).toBeTruthy();
    expect(actors.get('trumpeter-b').root.getObjectByName('trumpet')).toBeTruthy();
    expect(actors.get('singer-a').root.getObjectByName('cymbals')).toBeTruthy();
  });

  it('gives the night rider a lamp that lights a face, and carries nothing else (2:12)', () => {
    const actors = actorsOf('night-ride');
    const lamp = actors.get('nehemiah').root.getObjectByName('lamp');
    expect(lamp).toBeTruthy();
    expect(position(lamp).distanceTo(position(bone(actors.get('nehemiah'), 'RightHand')))).toBeLessThan(0.35);
    let anchors = 0;
    lamp.traverse((node) => { if (node.userData.light) anchors += 1; });
    expect(anchors).toBe(1);
    expect(actors.size).toBe(3);
  });

  it('arms half and sets half to work, the builder with trowel and sword, the trumpeter by Nehemiah (4:16-18)', () => {
    const actors = actorsOf('sword-and-trowel');
    const builder = actors.get('builder');
    const trowel = builder.root.getObjectByName('trowel');
    const sword = builder.root.getObjectByName('sword');
    expect(trowel).toBeTruthy();
    expect(sword).toBeTruthy();
    expect(position(trowel).distanceTo(position(bone(builder, 'LeftHand')))).toBeLessThan(0.35);
    // The sword hangs at his side, at the hip.
    const hips = position(bone(builder, 'Hips'));
    expect(position(sword).distanceTo(hips)).toBeLessThan(0.7);
    for (const id of ['guard-a', 'guard-b']) {
      const spear = actors.get(id).root.getObjectByName('spear');
      expect(spear, id).toBeTruthy();
      // The shaft's foot reaches the ground.
      const box = new THREE.Box3().setFromObject(spear);
      expect(box.min.y - actors.get(id).entry.position[1]).toBeLessThan(0.3);
    }
    const trumpeter = actors.get('trumpeter');
    const near = Math.hypot(trumpeter.entry.position[0] - actors.get('nehemiah').entry.position[0], trumpeter.entry.position[2] - actors.get('nehemiah').entry.position[2]);
    expect(near).toBeLessThan(4);
    // The trumpeter on whose call they rally (4:20) is a priest, as the trumpets were.
    expect(trumpeter.entry.model).toBe('human-tabernacle-priest');
  });

  it('keeps the nobles of Tekoa a few paces behind the two at work, arms folded (3:5)', () => {
    const actors = actorsOf('nobles-of-tekoa');
    const nobles = [...actors.values()].filter((a) => a.entry.id.startsWith('noble'));
    const workers = [...actors.values()].filter((a) => a.entry.id.startsWith('tekoite'));
    expect(nobles).toHaveLength(2);
    expect(workers).toHaveLength(2);
    const wall = (a) => Math.abs(nearestWall(a.entry.position[0], a.entry.position[2], 'city').distance);
    for (const noble of nobles) {
      expect(noble.entry.pose).toBe('stern');
      for (const worker of workers) expect(wall(noble), `${noble.entry.id} is further from the wall than ${worker.entry.id}`).toBeGreaterThan(wall(worker));
    }
  });

  it('puts Shallum and his daughters at the foot of the wall, working, three of them (3:12)', () => {
    const actors = actorsOf('daughters-of-shallum');
    expect([...actors.keys()].sort()).toEqual(['daughter-a', 'daughter-b', 'shallum']);
    for (const actor of actors.values()) {
      expect(actor.entry.pose).toBe('working');
      expect(nearestWall(actor.entry.position[0], actor.entry.position[2], 'city').distance, actor.entry.id).toBeLessThan(12);
    }
    expect(actors.get('daughter-a').entry.model).toBe('human-tabernacle-camp-woman');
  });

  it('has the Sheep Gate consecrated by the high priest and his brothers the priests (3:1)', () => {
    const actors = actorsOf('sheep-gate');
    expect(actors.get('eliashib').entry.model).toBe('human-tabernacle-high-priest');
    expect([...actors.values()].filter((a) => a.entry.model === 'human-tabernacle-priest').length).toBeGreaterThanOrEqual(3);
  });

  it('stands all twelve and no more, one stage each, and stages them through the director', () => {
    expect(Object.keys(NEHEMIAH_STAGES)).toHaveLength(12);
    expect(Object.keys(NEHEMIAH_STAGES).sort()).toEqual(NEHEMIAH.events.map((e) => e.id).sort());
    const root = new THREE.Group();
    const stages = createNehemiahEventStages(THREE, { root, motionLibrary });
    expect(Object.keys(stages)).toHaveLength(12);
    for (const tableau of Object.values(stages)) {
      expect(tableau.isReady()).toBe(false);
      tableau.dispose();
    }
  });
});
