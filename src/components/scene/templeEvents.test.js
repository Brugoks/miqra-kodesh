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
  TEMPLE_EVENT_STAGES, TEMPLE_EVENT_AREAS, TEMPLE_POSES, CHESTS, inTempleEventArea,
} from './templeEvents.js';
import { POSE_SECONDS, SEAT_DROP } from './sceneTableau.js';
import { EYE_HEIGHT, LEVEL } from './templeDimensions.js';
import { floorAt, blockerAt, stanceAt } from './templeNavigation.js';
import {
  thirdPersonAim, desiredCameraPosition, PIVOT_HEIGHT, FOLLOW_DISTANCE,
} from './sceneThirdPerson.js';
import { decodeMotionLibrary, MOTION_URL } from './sceneMixamo.js';
import { getScene } from '../../lib/scenes.js';

// The Temple's staged moments, checked the way Capernaum's are
// (capernaumEvents.test.js): standing on the courts' own floors, out of the
// walls, the columns and each other; the ones they are about in frame from
// where the visitor is put; and the few gestures that must land on something
// landing on it — measured on the real bodies, most of them moving by
// captured motion.

const TEMPLE = getScene('second-temple');
const motionLibrary = decodeMotionLibrary(JSON.parse(readFileSync(resolve('public', MOTION_URL.slice(1)), 'utf8')));
const models = {};
beforeAll(async () => {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new THREE.Texture() }));
  const needed = new Set(Object.values(TEMPLE_EVENT_STAGES).flatMap((stage) => stage.cast.map((entry) => entry.model)));
  for (const asset of [...HUMAN_MODEL_ASSETS, ...TABLEAU_MODEL_ASSETS, ...TABERNACLE_CHARACTER_ASSETS]) {
    if (!needed.has(asset.id)) continue;
    const bytes = readFileSync(resolve('public', asset.url.slice(1)));
    models[asset.id] = await loader.parseAsync(new Uint8Array(bytes).buffer, '');
  }
});

const position = (object) => object.getWorldPosition(new THREE.Vector3());
const bone = (actor, name) => actor.root.getObjectByName(`mixamorig${name}`);
const palm = (actor, side) => bone(actor, `${side}Hand`).localToWorld(new THREE.Vector3(0, 0.07, 0));
function stage(id, options = {}) {
  const root = new THREE.Group();
  const tableau = TEMPLE_EVENT_STAGES[id].create(THREE, { root, motionLibrary, ...options });
  tableau.acceptAssets({ models });
  tableau.update({ delta: 0.1 });
  root.updateMatrixWorld(true);
  return { root, tableau, actors: tableau.getActors() };
}

describe.each(Object.keys(TEMPLE_EVENT_STAGES))('%s', (id) => {
  const { cast, floor } = TEMPLE_EVENT_STAGES[id];
  const event = TEMPLE.events.find((entry) => entry.id === id);

  it('is an event in the manifest, staged at the height it stands on', () => {
    expect(event).toBeTruthy();
    for (const entry of cast) {
      const [x, , z] = entry.position;
      expect(floorAt(x, z)?.height, `${entry.id} has a floor`).toBeCloseTo(floor, 5);
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
    for (const name of new Set(cast.map((entry) => entry.pose))) {
      expect(TEMPLE_POSES[name], name).toBeTypeOf('function');
      const end = numbers(TEMPLE_POSES[name](POSE_SECONDS));
      numbers(TEMPLE_POSES[name](0)).forEach((value, i) => expect(end[i], name).toBeCloseTo(value, 9));
    }
  });

  it('stands everyone on the courts’ own floors, out of the walls and out of each other', () => {
    const { tableau, actors } = stage(id);
    for (const actor of actors.values()) {
      const { entry } = actor;
      const [x, y, z] = entry.position;
      expect(blockerAt(x, z), `${entry.id} at (${x}, ${z})`).toBeNull();
      const surface = Math.max(floor, y);
      for (const side of ['Left', 'Right']) {
        const foot = position(bone(actor, `${side}Foot`));
        expect(foot.y, `${entry.id} ${side} foot`).toBeGreaterThan(surface - 0.1);
        expect(foot.y, `${entry.id} ${side} foot`).toBeLessThan(surface + 0.62);
      }
    }
    const list = [...actors.values()];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i].entry.position;
        const b = list[j].entry.position;
        expect(Math.hypot(a[0] - b[0], a[2] - b[2]), `${list[i].entry.id} / ${list[j].entry.id}`).toBeGreaterThan(0.5);
      }
    }
    tableau.dispose();
  });

  it('sits the seated on a seat at the height of the seat', () => {
    const { tableau, actors } = stage(id);
    for (const actor of actors.values()) {
      if (actor.entry.motion || !TEMPLE_POSES[actor.entry.pose](0).seated) continue;
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
    inFrame(first, 'first person', 12);

    const aim = thirdPersonAim(event.position, event.lookAt);
    const pivot = new THREE.Vector3(event.position[0], event.position[1] - EYE_HEIGHT + PIVOT_HEIGHT, event.position[2]);
    const third = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 2400);
    desiredCameraPosition(pivot, aim.yaw, aim.pitch, FOLLOW_DISTANCE, third.position);
    third.rotation.set(aim.pitch, aim.yaw, 0, 'YXZ');
    inFrame(third, 'third person', 15);

    // A standpoint someone can stand on, clear of the cast.
    const [x, eye, z] = event.position;
    const stance = stanceAt(x, z, eye - EYE_HEIGHT);
    expect(stance).toBeTruthy();
    expect(eye).toBeCloseTo(stance.height + EYE_HEIGHT, 1);
    expect(tableau.queryClearance(x, z, 0.35, stance.height).collides).toBe(false);
    tableau.dispose();
  });

  it('keeps to its own ground', () => {
    const [x0, x1, z0, z1] = TEMPLE_EVENT_AREAS[id];
    for (const entry of cast) {
      const [x, , z] = entry.position;
      expect(x > x0 && x < x1 && z > z0 && z < z1, entry.id).toBe(true);
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
  it('has Simeon holding the child in his arms (Luke 2:28)', () => {
    const { tableau, actors } = stage('simeon-anna');
    const simeon = actors.get('simeon');
    const child = simeon.held[0];
    expect(child.name).toBe('swaddled-child');
    for (let frame = 0; frame < 20; frame += 1) {
      tableau.update({ delta: 0.3 });
      const left = palm(simeon, 'Left');
      const right = palm(simeon, 'Right');
      expect(left.distanceTo(right)).toBeLessThan(0.3);
      expect(position(child).distanceTo(left.clone().add(right).multiplyScalar(0.5))).toBeLessThan(0.14);
    }
    tableau.dispose();
  });

  it('has the widow’s hand at the mouth of the chest (Mark 12:42)', () => {
    const { tableau, actors } = stage('widow');
    const chest = CHESTS[2];
    for (let frame = 0; frame < 20; frame += 1) {
      tableau.update({ delta: 0.3 });
      const hand = palm(actors.get('widow'), 'Right');
      expect(Math.hypot(hand.x - chest.x, hand.z - chest.z)).toBeLessThan(0.16);
      expect(hand.y - chest.mouth).toBeGreaterThan(-0.02);
      expect(hand.y - chest.mouth).toBeLessThan(0.2);
    }
    tableau.dispose();
  });

  it('has Jesus writing with his finger on the ground (John 8:6)', () => {
    const { tableau, actors } = stage('adulteress');
    const jesus = actors.get('jesus');
    for (let frame = 0; frame < 20; frame += 1) {
      tableau.update({ delta: 0.3 });
      const tip = position(bone(jesus, 'RightHandIndex3'));
      expect(tip.y - LEVEL.women).toBeGreaterThan(-0.01);
      expect(tip.y - LEVEL.women).toBeLessThan(0.07);
    }
    // And the woman stands before him, the accusers beyond her.
    expect(actors.get('woman').root.position.distanceTo(jesus.root.position)).toBeLessThan(2.5);
    tableau.dispose();
  });

  it('has Peter take the lame man by the right hand (Acts 3:7)', () => {
    const { tableau, actors } = stage('beautiful-gate');
    for (let frame = 0; frame < 20; frame += 1) {
      tableau.update({ delta: 0.3 });
      expect(palm(actors.get('peter'), 'Right').distanceTo(palm(actors.get('lame-man'), 'Right'))).toBeLessThan(0.16);
    }
    tableau.dispose();
  });

  it('has Paul held by both arms (Acts 21:30)', () => {
    const { tableau, actors } = stage('paul-seized');
    const paul = actors.get('paul');
    for (let frame = 0; frame < 20; frame += 1) {
      tableau.update({ delta: 0.3 });
      expect(position(bone(actors.get('captor-left'), 'RightHand')).distanceTo(position(bone(paul, 'LeftForeArm')))).toBeLessThan(0.16);
      expect(position(bone(actors.get('captor-right'), 'LeftHand')).distanceTo(position(bone(paul, 'RightForeArm')))).toBeLessThan(0.16);
    }
    tableau.dispose();
  });

  it('has the whip of cords raised over his head (John 2:15)', () => {
    const { tableau, actors } = stage('cleansing');
    const jesus = actors.get('jesus');
    expect(jesus.held[0].name).toBe('cords');
    expect(position(bone(jesus, 'RightHand')).y).toBeGreaterThan(position(bone(jesus, 'Head')).y);
    tableau.dispose();
  });

  it('moves most of its people by captured motion, fitted to their bodies', () => {
    const moving = Object.values(TEMPLE_EVENT_STAGES).flatMap((entry) => entry.cast).filter((entry) => entry.motion);
    expect(moving.length).toBeGreaterThan(30);
    for (const entry of moving) expect(motionLibrary.clips.has(entry.motion), entry.motion).toBe(true);
  });

  it('keeps the courts’ own crowd off every event’s ground', () => {
    expect(inTempleEventArea(-40, 224)).toBe(true);
    expect(inTempleEventArea(0, 222)).toBe(false); // the portico vantage
    expect(inTempleEventArea(0, 88)).toBe(false); // the Court of the Women vantage
  });
});
