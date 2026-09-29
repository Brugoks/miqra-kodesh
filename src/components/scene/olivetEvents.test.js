import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  beforeAll, describe, it, expect, vi,
} from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { TABLEAU_MODEL_ASSETS } from './sceneTableauAssets.js';
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';
import {
  OLIVET_EVENT_STAGES, OLIVET_POSES, COLT_BACK, FIG, ASCENT_LIFT, DISCOURSE_SEAT, inOlivetEventArea,
} from './olivetEvents.js';
import { POSE_SECONDS } from './sceneTableau.js';
import { EYE_HEIGHT, EVENT_GROUND, groundAt } from './olivetDimensions.js';
import { blockerAt, stanceAt } from './olivetNavigation.js';
import {
  thirdPersonAim, desiredCameraPosition, PIVOT_HEIGHT, FOLLOW_DISTANCE,
} from './sceneThirdPerson.js';
import { decodeMotionLibrary, MOTION_URL } from './sceneMixamo.js';
import { getScene } from '../../lib/scenes.js';

// The Mount of Olives' staged moments, checked as the Temple's and
// Capernaum's are — but on a hillside, so the ground is asked for under every
// foot rather than read off one floor: everyone standing on the real ground,
// out of the trees, the wall and each other; who each moment is about in
// frame from where the visitor is put; and the gestures that must land on
// something (a rider on a colt, a kiss, a hand at an ear, a hand in a fig
// tree) landing on it, measured on the real bodies.

const OLIVET = getScene('mount-of-olives');
const motionLibrary = decodeMotionLibrary(JSON.parse(readFileSync(resolve('public', MOTION_URL.slice(1)), 'utf8')));
const models = {};
beforeAll(async () => {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new THREE.Texture() }));
  const needed = new Set(Object.values(OLIVET_EVENT_STAGES).flatMap((stage) => stage.cast.map((entry) => entry.model)));
  for (const asset of [...HUMAN_MODEL_ASSETS, ...TABLEAU_MODEL_ASSETS, ...TABERNACLE_CHARACTER_ASSETS]) {
    if (!needed.has(asset.id)) continue;
    const bytes = readFileSync(resolve('public', asset.url.slice(1)));
    models[asset.id] = await loader.parseAsync(new Uint8Array(bytes).buffer, '');
  }
});

const position = (object) => object.getWorldPosition(new THREE.Vector3());
const bone = (actor, name) => actor.root.getObjectByName(`mixamorig${name}`);
function stage(id, options = {}) {
  const root = new THREE.Group();
  const tableau = OLIVET_EVENT_STAGES[id].create(THREE, { root, motionLibrary, ...options });
  tableau.acceptAssets({ models });
  tableau.update({ delta: 0.1 });
  root.updateMatrixWorld(true);
  return { root, tableau, actors: tableau.getActors() };
}
const riding = (entry) => entry.pose === 'rider' || entry.pose === 'riderWeep';
// People allowed closer than arm's length: a kiss is a kiss.
const EMBRACE = new Set(['judas/jesus', 'jesus/judas']);

describe.each(Object.keys(OLIVET_EVENT_STAGES))('%s', (id) => {
  const { cast } = OLIVET_EVENT_STAGES[id];
  const event = OLIVET.events.find((entry) => entry.id === id);

  it('is an event in the manifest, its cast standing on the ground under them', () => {
    expect(event).toBeTruthy();
    for (const entry of cast) {
      const [x, y, z] = entry.position;
      const lift = id === 'ascension' && entry.id === 'jesus' ? ASCENT_LIFT : 0;
      expect(y - lift, `${entry.id} stands on the ground`).toBeCloseTo(groundAt(x, z), 5);
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
      expect(OLIVET_POSES[name], name).toBeTypeOf('function');
      const end = numbers(OLIVET_POSES[name](POSE_SECONDS));
      numbers(OLIVET_POSES[name](0)).forEach((value, i) => expect(end[i], name).toBeCloseTo(value, 9));
    }
  });

  it('stands everyone on the hillside, out of the trees and walls and out of each other', () => {
    const { tableau, actors } = stage(id);
    for (const actor of actors.values()) {
      const { entry } = actor;
      const [x, y, z] = entry.position;
      expect(blockerAt(x, z), `${entry.id} at (${x}, ${z})`).toBeNull();
      for (const side of ['Left', 'Right']) {
        const foot = position(bone(actor, `${side}Foot`));
        const under = Math.max(groundAt(foot.x, foot.z), y);
        // A rider's feet hang clear of the ground; everyone else's meet it.
        const [below, above] = riding(entry) ? [0.15, 0.75] : [-0.14, 0.62];
        expect(foot.y - under, `${entry.id} ${side} foot`).toBeGreaterThan(below);
        expect(foot.y - under, `${entry.id} ${side} foot`).toBeLessThan(above);
      }
    }
    const list = [...actors.values()];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i].entry;
        const b = list[j].entry;
        const gap = EMBRACE.has(`${a.id}/${b.id}`) ? 0.4 : 0.55;
        expect(Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]), `${a.id} / ${b.id}`).toBeGreaterThan(gap);
      }
    }
    tableau.dispose();
  });

  it('frames who it is about from where it puts the visitor, first person and third', () => {
    const { tableau, actors } = stage(id);
    const principals = [...actors.values()].filter((actor) => actor.entry.principal);
    expect(principals.length).toBeGreaterThanOrEqual(1);
    const inFrame = (camera, label, reach) => {
      camera.updateMatrixWorld(true);
      for (const principal of principals) {
        const head = position(bone(principal, 'Head'));
        const ndc = head.clone().project(camera);
        const who = `${label}: ${principal.entry.id}`;
        expect(ndc.z, `${who} is behind the camera`).toBeLessThan(1);
        expect(Math.abs(ndc.x), `${who} is off the side`).toBeLessThan(0.92);
        expect(Math.abs(ndc.y), `${who} is off the top or bottom`).toBeLessThan(0.92);
        expect(head.distanceTo(camera.position), `${who} is too far`).toBeLessThan(reach);
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
        // Nor by the hill: nothing of the ground rises into the line of sight.
        for (let t = 0.05; t < 0.95; t += 0.05) {
          const p = camera.position.clone().lerp(head, t);
          expect(p.y - groundAt(p.x, p.z), `${who} is behind the ground`).toBeGreaterThan(0.2);
        }
      }
    };
    const first = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 2400);
    first.position.fromArray(event.position);
    first.lookAt(new THREE.Vector3(...event.lookAt));
    inFrame(first, 'first person', 26);

    const aim = thirdPersonAim(event.position, event.lookAt);
    const pivot = new THREE.Vector3(event.position[0], event.position[1] - EYE_HEIGHT + PIVOT_HEIGHT, event.position[2]);
    const third = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 2400);
    desiredCameraPosition(pivot, aim.yaw, aim.pitch, FOLLOW_DISTANCE, third.position);
    third.rotation.set(aim.pitch, aim.yaw, 0, 'YXZ');
    inFrame(third, 'third person', 30);

    // A standpoint someone can stand on, clear of the cast.
    const [x, eye, z] = event.position;
    const stance = stanceAt(x, z, eye - EYE_HEIGHT);
    expect(stance).toBeTruthy();
    expect(eye).toBeCloseTo(stance.height + EYE_HEIGHT, 1);
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
  it('sets him astride the colt, on its back, going down the hill (Luke 19:35-37)', () => {
    for (const id of ['triumphal-entry', 'weeping']) {
      const { tableau, actors } = stage(id);
      const jesus = actors.get('jesus');
      const [x, , z] = jesus.entry.position;
      for (let frame = 0; frame < 12; frame += 1) {
        tableau.update({ delta: 0.3 });
        const hips = position(bone(jesus, 'Hips'));
        const back = groundAt(x, z) + COLT_BACK;
        expect(hips.y - back, id).toBeGreaterThan(0.03);
        expect(hips.y - back, id).toBeLessThan(0.2);
        // A leg down each side of the barrel.
        const left = position(bone(jesus, 'LeftLeg'));
        const right = position(bone(jesus, 'RightLeg'));
        expect(left.distanceTo(right), id).toBeGreaterThan(0.45);
      }
      const colt = tableau.group.getObjectByName('colt');
      expect(colt, id).toBeTruthy();
      tableau.dispose();
    }
  });

  it('has him bowed over, a hand at his face, where he saw the city (Luke 19:41)', () => {
    const { tableau, actors } = stage('weeping');
    const jesus = actors.get('jesus');
    const head = position(bone(jesus, 'Head'));
    const hand = position(bone(jesus, 'RightHand'));
    expect(hand.distanceTo(head)).toBeLessThan(0.3);
    tableau.dispose();
  });

  it('has his hand up in the fig tree’s branches, not at its trunk (Mark 11:13)', () => {
    const { tableau, actors } = stage('fig-tree');
    const jesus = actors.get('jesus');
    const [x, , z] = jesus.entry.position;
    for (let frame = 0; frame < 12; frame += 1) {
      tableau.update({ delta: 0.3 });
      // Fingertips at full stretch, among the lowest leaves (olivetLandscape.js).
      const tip = position(bone(jesus, 'RightHandIndex3'));
      expect(tip.y - groundAt(x, z)).toBeGreaterThan(1.85);
      expect(Math.hypot(tip.x - FIG[0], tip.z - FIG[1])).toBeLessThan(1.6);
    }
    tableau.dispose();
  });

  it('seats him on a rock opposite the Temple, the four at his feet (Mark 13:3)', () => {
    const { tableau, actors } = stage('olivet-discourse');
    const jesus = actors.get('jesus');
    const hips = position(bone(jesus, 'Hips'));
    const seat = groundAt(...DISCOURSE_SEAT.at) + DISCOURSE_SEAT.top;
    expect(hips.y - seat).toBeGreaterThan(0.03);
    expect(hips.y - seat).toBeLessThan(0.25);
    for (const id of ['peter', 'andrew', 'james', 'john']) expect(actors.get(id).root.position.distanceTo(jesus.root.position), id).toBeLessThan(4.6);
    tableau.dispose();
  });

  it('has Judas kiss him, and Peter’s sword up over Malchus holding his ear (John 18:10)', () => {
    const { tableau, actors } = stage('the-arrest');
    const jesus = actors.get('jesus');
    const judas = actors.get('judas');
    const peter = actors.get('peter');
    const malchus = actors.get('malchus');
    expect(peter.held[0].name).toBe('sword');
    for (let frame = 0; frame < 12; frame += 1) {
      tableau.update({ delta: 0.3 });
      expect(position(bone(judas, 'Head')).distanceTo(position(bone(jesus, 'Head')))).toBeLessThan(0.34);
      for (const side of ['Left', 'Right']) {
        const hand = position(bone(judas, `${side}Hand`));
        const arms = ['LeftArm', 'RightArm'].map((name) => position(bone(jesus, name)).distanceTo(hand));
        expect(Math.min(...arms), `Judas' ${side} hand`).toBeLessThan(0.24);
      }
      expect(position(bone(peter, 'RightHand')).y).toBeGreaterThan(position(bone(peter, 'Head')).y);
      const head = bone(malchus, 'Head');
      const ear = head.localToWorld(new THREE.Vector3(-0.085, 0.06, 0));
      expect(position(bone(malchus, 'RightHand')).distanceTo(ear)).toBeLessThan(0.16);
    }
    // Lanterns and torches (John 18:3), and a few that light the faces —
    // marked for the builder's fixed pool of lights, never lights of their
    // own, which would recompile every material in the scene when staged.
    const torches = [...actors.values()].filter((actor) => actor.held[0]?.name === 'torch');
    expect(torches.length).toBeGreaterThanOrEqual(4);
    let lights = 0;
    let anchors = 0;
    tableau.group.traverse((node) => {
      if (node.isLight) lights += 1;
      if (node.userData.light) anchors += 1;
    });
    expect(lights).toBe(0);
    expect(anchors).toBeGreaterThanOrEqual(2);
    expect(anchors).toBeLessThanOrEqual(3);
    tableau.dispose();
  });

  it('has him kneeling a stone’s throw from the three, who are asleep (Luke 22:41; Mark 14:37)', () => {
    const { tableau, actors } = stage('gethsemane');
    const jesus = actors.get('jesus');
    expect(position(bone(jesus, 'Hips')).y - jesus.entry.position[1]).toBeLessThan(0.7);
    for (const id of ['peter', 'james', 'john']) {
      const distance = actors.get(id).root.position.distanceTo(jesus.root.position);
      expect(distance, id).toBeGreaterThan(12);
      expect(distance, id).toBeLessThan(30);
      expect(position(bone(actors.get(id), 'Head')).y - actors.get(id).entry.position[1], id).toBeLessThan(0.9);
    }
    tableau.dispose();
  });

  it('has him lifted up, in the cloud, hands raised over them (Luke 24:50; Acts 1:9)', () => {
    const { tableau, actors } = stage('ascension');
    const jesus = actors.get('jesus');
    const [x, , z] = jesus.entry.position;
    for (const side of ['Left', 'Right']) {
      expect(position(bone(jesus, `${side}Foot`)).y - groundAt(x, z)).toBeGreaterThan(2);
      expect(position(bone(jesus, `${side}Hand`)).y).toBeGreaterThan(position(bone(jesus, 'Head')).y);
    }
    expect(tableau.group.getObjectByName('cloud')).toBeTruthy();
    tableau.dispose();
  });

  it('moves most of its people by captured motion, fitted to their bodies', () => {
    const moving = Object.values(OLIVET_EVENT_STAGES).flatMap((entry) => entry.cast).filter((entry) => entry.motion);
    expect(moving.length).toBeGreaterThan(60);
    for (const entry of moving) expect(motionLibrary.clips.has(entry.motion), entry.motion).toBe(true);
  });

  it('dresses the disciples alike wherever they appear', () => {
    const coats = new Map();
    for (const stage of Object.values(OLIVET_EVENT_STAGES)) {
      for (const entry of stage.cast) {
        if (!['peter', 'john', 'james', 'andrew', 'judas'].includes(entry.id)) continue;
        const coat = `${entry.model}:${entry.tint?.Cloth}`;
        if (coats.has(entry.id)) expect(coat, entry.id).toBe(coats.get(entry.id));
        else coats.set(entry.id, coat);
      }
    }
    expect(coats.get('peter')).toBe('human-artisan:6254462');
  });

  it('keeps the Mount’s own people off every event’s ground', () => {
    expect(inOlivetEventArea(345, 147)).toBe(true);
    expect(inOlivetEventArea(-6, 4)).toBe(true);
    expect(inOlivetEventArea(262, 186)).toBe(false); // the default vantage
  });
});
