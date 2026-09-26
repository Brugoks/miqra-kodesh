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
  EVENT_STAGES, EVENT_AREAS, inEventArea, ROOM,
} from './capernaumEvents.js';
import { createBreadOfLifeTableau, BREAD_CAST, POSES as SYNAGOGUE_POSES } from './synagogueTableau.js';
import { POSE_SECONDS, SEAT_DROP } from './sceneTableau.js';
import { BOATS, EYE_HEIGHT } from './capernaumDimensions.js';
import { beachedPose, THWARTS } from './capernaumBoats.js';
import { blockerAt, stanceAt } from './capernaumNavigation.js';
import {
  thirdPersonAim, desiredCameraPosition, PIVOT_HEIGHT, FOLLOW_DISTANCE,
} from './sceneThirdPerson.js';
import { CAPERNAUM } from '../../lib/capernaumScene.js';

// Nobody looks at these moments in CI, so the tests check what looking would:
// that a hand said to hold another hand is holding it, that the seated sit on
// something, that nobody stands in a wall or in anyone else, that the two
// people each moment is about are in the frame the visitor lands on with
// nobody in the way, and that Peter is recognisably the same man in every one.

const models = {};
beforeAll(async () => {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new THREE.Texture() }));
  const needed = new Set([
    ...Object.values(EVENT_STAGES).flatMap((stage) => stage.cast.map((entry) => entry.model)),
    ...BREAD_CAST.map((entry) => entry.model),
  ]);
  const assets = [...HUMAN_MODEL_ASSETS, ...TABLEAU_MODEL_ASSETS, ...TABERNACLE_CHARACTER_ASSETS]
    .filter((asset) => needed.has(asset.id));
  for (const asset of assets) {
    const bytes = readFileSync(resolve('public', asset.url.slice(1)));
    models[asset.id] = await loader.parseAsync(new Uint8Array(bytes).buffer, '');
  }
});

const STAGES = {
  ...Object.fromEntries(Object.entries(EVENT_STAGES).map(([id, stage]) => [id, {
    create: stage.create, cast: stage.cast, poses: stage.poses, floor: stage.floor,
  }])),
  'bread-of-life': { create: createBreadOfLifeTableau, cast: BREAD_CAST, poses: SYNAGOGUE_POSES, floor: 0.9 },
};

const position = (object) => object.getWorldPosition(new THREE.Vector3());
const bone = (actor, name) => actor.root.getObjectByName(`mixamorig${name}`);
// Where the palm is: a little way along the hand from the wrist.
const palm = (actor, side) => bone(actor, `${side}Hand`).localToWorld(new THREE.Vector3(0, 0.07, 0));
function stage(id, options = {}) {
  const root = new THREE.Group();
  const tableau = STAGES[id].create(THREE, { root, ...options });
  tableau.acceptAssets({ models });
  tableau.update({ delta: 0.1 });
  root.updateMatrixWorld(true);
  return { root, tableau, actors: tableau.getActors() };
}

describe.each(Object.keys(STAGES))('%s', (id) => {
  const { cast, poses, floor } = STAGES[id];
  const event = CAPERNAUM.events.find((entry) => entry.id === id);

  it('is an event in the manifest', () => {
    expect(event).toBeTruthy();
  });

  it('builds its cast only once it is staged, and then all of it', () => {
    const onReady = vi.fn();
    const { tableau } = stage(id, { active: false, onReady });
    expect(tableau.isReady()).toBe(false);
    expect(tableau.group.visible).toBe(false);
    tableau.setActive(true);
    expect(tableau.isReady()).toBe(true);
    expect(tableau.getActors().size).toBe(cast.length);
    expect(onReady).toHaveBeenCalledTimes(1);
    // Unstaged, it draws and blocks nothing.
    tableau.setActive(false);
    expect(tableau.group.visible).toBe(false);
    const [x, , z] = cast[0].position;
    expect(tableau.queryClearance(x, z, 0.35, floor).collides).toBe(false);
    tableau.dispose();
  });

  it('loops every pose it uses without a jump', () => {
    const numbers = (value) => (typeof value === 'number' ? [value]
      : typeof value === 'object' ? Object.values(value).flatMap(numbers) : []);
    for (const name of new Set(cast.map((entry) => entry.pose))) {
      expect(poses[name], name).toBeTypeOf('function');
      const end = numbers(poses[name](POSE_SECONDS));
      numbers(poses[name](0)).forEach((value, i) => expect(end[i], name).toBeCloseTo(value, 9));
    }
  });

  it('stands everyone on the ground, out of the walls and out of each other', () => {
    const { tableau, actors } = stage(id);
    for (const actor of actors.values()) {
      const { entry } = actor;
      const [x, y, z] = entry.position;
      // Those seated are checked against their seats below.
      const standing = Math.abs(y - floor) < 0.05 && !entry.lying && !poses[entry.pose](0).seated;
      if (standing && !entry.inBoat) {
        expect([null, entry.blocked || null], `${entry.id} at (${x}, ${z})`).toContain(blockerAt(x, z, floor));
      }
      // Feet on whatever they stand on — not sunk into it, not hovering.
      if (!entry.lying && !entry.inBoat) {
        const surface = Math.max(floor, y);
        for (const side of ['Left', 'Right']) {
          const foot = position(bone(actor, `${side}Foot`));
          expect(foot.y, `${entry.id} ${side} foot`).toBeGreaterThan(surface - 0.1);
          expect(foot.y, `${entry.id} ${side} foot`).toBeLessThan(surface + 0.6);
        }
      }
    }
    const list = [...actors.values()];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i].entry;
        const b = list[j].entry;
        if (a.near?.includes(b.id) || b.near?.includes(a.id)) continue;
        const gap = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
        expect(gap, `${a.id} / ${b.id}`).toBeGreaterThan(0.5);
      }
    }
    tableau.dispose();
  });

  it('sits the seated on a seat at the height of the seat', () => {
    const { tableau, actors } = stage(id);
    for (const actor of actors.values()) {
      if (!STAGES[id].poses[actor.entry.pose](0).seated) continue;
      const hips = position(bone(actor, 'Hips'));
      const seatTop = actor.entry.position[1] + SEAT_DROP;
      expect(hips.y - seatTop, actor.entry.id).toBeGreaterThan(0.03);
      expect(hips.y - seatTop, actor.entry.id).toBeLessThan(0.25);
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
      }
    };
    const first = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 2400);
    first.position.fromArray(event.position);
    first.lookAt(new THREE.Vector3(...event.lookAt));
    inFrame(first, 'first person', 7.5);

    const standFloor = event.position[1] - EYE_HEIGHT;
    const aim = thirdPersonAim(event.position, event.lookAt);
    const pivot = new THREE.Vector3(event.position[0], standFloor + PIVOT_HEIGHT, event.position[2]);
    const third = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 2400);
    desiredCameraPosition(pivot, aim.yaw, aim.pitch, FOLLOW_DISTANCE, third.position);
    third.rotation.set(aim.pitch, aim.yaw, 0, 'YXZ');
    inFrame(third, 'third person', 10.5);

    // Landing in someone would shove the visitor straight back out.
    const [x, eye, z] = event.position;
    expect(stanceAt(x, z, eye - EYE_HEIGHT)).toBeTruthy();
    expect(tableau.queryClearance(x, z, 0.35, eye - EYE_HEIGHT).collides).toBe(false);
    tableau.dispose();
  });

  it('keeps its own ground, where it has some', () => {
    const area = EVENT_AREAS[id];
    if (!area) return;
    for (const entry of cast) {
      const [x, , z] = entry.position;
      const inside = Object.values(EVENT_AREAS).some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
      expect(inside, entry.id).toBe(true);
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
  it('has Jesus take her by the hand (Mark 1:31)', () => {
    const { tableau, actors } = stage('mother-in-law');
    for (let frame = 0; frame < 40; frame += 1) {
      tableau.update({ delta: 0.3 });
      expect(palm(actors.get('jesus'), 'Right').distanceTo(palm(actors.get('her'), 'Right'))).toBeLessThan(0.14);
    }
    tableau.dispose();
  });

  it('has his hand on the head of the woman kneeling at the door (Luke 4:40)', () => {
    const { tableau, actors } = stage('sundown');
    for (let frame = 0; frame < 40; frame += 1) {
      tableau.update({ delta: 0.3 });
      const hand = palm(actors.get('jesus'), 'Right');
      const head = position(bone(actors.get('kneeling'), 'Head'));
      expect(Math.hypot(hand.x - head.x, hand.z - head.z)).toBeLessThan(0.16);
      expect(hand.y - head.y).toBeGreaterThan(0.08);
      expect(hand.y - head.y).toBeLessThan(0.3);
    }
    // And the blind man has his hand on the shoulder of the boy leading him.
    const lead = bone(actors.get('boy'), 'RightArm').getWorldPosition(new THREE.Vector3());
    expect(position(bone(actors.get('blind'), 'LeftHand')).distanceTo(lead)).toBeLessThan(0.14);
    tableau.dispose();
  });

  it('has her hand at the fringe of his cloak, and the fringe has its cord of blue (Mark 5:27)', () => {
    const { tableau, actors } = stage('the-woman');
    const jesus = actors.get('jesus');
    const fringe = jesus.held[0];
    expect(fringe.name).toBe('tassel');
    let blue = false;
    fringe.traverse((node) => { if (node.material?.color?.b > node.material?.color?.r * 1.5) blue = true; });
    expect(blue).toBe(true);
    for (let frame = 0; frame < 40; frame += 1) {
      tableau.update({ delta: 0.3 });
      expect(position(bone(actors.get('woman'), 'RightHand')).distanceTo(position(fringe))).toBeLessThan(0.12);
    }
    // She came up behind him (5:27): she is at his back, not in front of him.
    const facing = new THREE.Vector3(Math.sin(jesus.root.rotation.y), 0, Math.cos(jesus.root.rotation.y));
    const toHer = position(actors.get('woman').root).sub(position(jesus.root)).setY(0);
    expect(facing.dot(toHer)).toBeLessThan(0);
    tableau.dispose();
  });

  it('has his arm round the child set in the midst of them (Mark 9:36)', () => {
    const { tableau, actors } = stage('the-child');
    const child = actors.get('child');
    for (let frame = 0; frame < 40; frame += 1) {
      tableau.update({ delta: 0.3 });
      expect(position(bone(actors.get('jesus'), 'RightHand')).distanceTo(position(bone(child, 'LeftArm')))).toBeLessThan(0.12);
    }
    // A child, standing: his head well below a seated man's shoulder height
    // plus a little, and above the floor-sitters'.
    expect(position(bone(child, 'Head')).y).toBeLessThan(1.1);
    // The disciples on the benches sit on the benches that are drawn.
    for (const actor of actors.values()) {
      const [x] = actor.entry.position;
      if (Math.abs(x - (ROOM.benchWest - 0.2)) < 0.01 || Math.abs(x - (ROOM.benchEast + 0.2)) < 0.01) {
        expect(actor.entry.position[1] + SEAT_DROP).toBeCloseTo(ROOM.benchTop, 6);
      }
    }
    tableau.dispose();
  });

  it('has the fish in Peter’s hands, the coin at its mouth, and the line running from it', () => {
    const { tableau, actors } = stage('temple-tax');
    const peter = actors.get('peter');
    const [fish, coin] = peter.held;
    expect(fish.name).toBe('barbel');
    expect(coin.name).toBe('shekel');
    tableau.update({ delta: 0.1 });
    const mouth = fish.localToWorld(fish.userData.mouth.clone());
    expect(mouth.distanceTo(position(bone(peter, 'LeftHand')))).toBeLessThan(0.12);
    expect(position(coin).distanceTo(palm(peter, 'Left'))).toBeLessThan(0.06);
    tableau.dispose();
  });

  it('seats the sons of Zebedee on the thwarts of the boat that is drawn', () => {
    const spec = BOATS.find((boat) => boat.id === 'boat-beach-a');
    const pose = beachedPose(spec, -0.55);
    const boat = new THREE.Object3D();
    boat.position.fromArray(pose.position);
    boat.rotation.set(...pose.rotation, 'YXZ');
    boat.updateMatrixWorld(true);
    const inBoat = STAGES.fishermen.cast.filter((entry) => entry.inBoat);
    expect(inBoat.map((entry) => entry.id).sort()).toEqual(['james', 'john', 'zebedee']);
    for (const entry of inBoat) {
      const seat = new THREE.Vector3(...entry.position).setY(entry.position[1] + SEAT_DROP);
      const local = boat.worldToLocal(seat.clone());
      expect(local.y, entry.id).toBeCloseTo(THWARTS.top, 2);
      expect(THWARTS.z.some((z) => Math.abs(local.z - z) < 0.05), entry.id).toBe(true);
      expect(Math.abs(local.x), entry.id).toBeLessThan(0.9);
    }
  });

  it('wears the centurion’s sword on his left, as centurions wore it', () => {
    const { tableau, actors } = stage('centurion');
    const centurion = actors.get('centurion');
    const sword = centurion.held[1];
    const local = centurion.root.worldToLocal(position(sword));
    // The model faces +Z, with its left hand on +X.
    expect(local.x).toBeGreaterThan(0.1);
    tableau.dispose();
  });

  it('dresses Peter the same wherever he appears', () => {
    const peters = Object.values(STAGES).flatMap((entry) => entry.cast)
      .filter((entry) => entry.id === 'peter' || entry.id === 'simon');
    expect(peters.length).toBeGreaterThanOrEqual(6);
    for (const entry of peters) {
      expect(entry.model).toBe(peters[0].model);
      expect(entry.tint).toEqual(peters[0].tint);
    }
  });

  it('keeps the village’s own people off every event’s ground', () => {
    expect(inEventArea(-11.5, -17)).toBe(true);
    expect(inEventArea(0, 4)).toBe(false); // the lane crossing
    expect(inEventArea(8, -16.5)).toBe(false); // the shore nets
    expect(inEventArea(-19, 24)).toBe(false); // the synagogue steps
    expect(inEventArea(24, 22.5)).toBe(false); // the courtyard's far corner
  });
});
