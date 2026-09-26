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
  createSynagogueTableau, SYNAGOGUE_CAST, POSES, POSE_SECONDS, TEACHER_SEAT, POSSESSED_AT,
  inSynagogueTableauArea, seesIntoSynagogue,
} from './synagogueTableau.js';
import {
  LEVEL, SYNAGOGUE, SYNAGOGUE_HALL, SYNAGOGUE_BENCHES, SYNAGOGUE_BENCH_BAND, READING_TABLE,
} from './capernaumDimensions.js';
import { blockerAt, synagogueFurniture } from './capernaumNavigation.js';
import {
  thirdPersonAim, desiredCameraPosition, PIVOT_HEIGHT, FOLLOW_DISTANCE,
} from './sceneThirdPerson.js';
import { CAPERNAUM } from '../../lib/capernaumScene.js';

// Nobody looks at this room in CI, so these check what looking would: that
// the people sitting are sitting on something, that nobody stands in a
// bench or a column, that the two the scene is about are in the frame the
// vantage lands on, and that the one gesture that carries the story — the
// raised hand of the rebuke — is actually raised and actually toward him.

const F = SYNAGOGUE_HALL.floor;
const models = {};
beforeAll(async () => {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new THREE.Texture() }));
  const needed = new Set(SYNAGOGUE_CAST.map((entry) => entry.model));
  const assets = [...HUMAN_MODEL_ASSETS, ...TABLEAU_MODEL_ASSETS, ...TABERNACLE_CHARACTER_ASSETS]
    .filter((asset) => needed.has(asset.id));
  for (const asset of assets) {
    const bytes = readFileSync(resolve('public', asset.url.slice(1)));
    models[asset.id] = await loader.parseAsync(new Uint8Array(bytes).buffer, '');
  }
});

const position = (object) => object.getWorldPosition(new THREE.Vector3());
const bone = (actor, name) => actor.root.getObjectByName(`mixamorig${name}`);
function setup() {
  const root = new THREE.Group();
  const onReady = vi.fn();
  const tableau = createSynagogueTableau(THREE, { root, onReady });
  tableau.acceptAssets({ models });
  return { root, tableau, onReady };
}

// Which wall's bench a seated actor is on, and how far in from that wall.
function benchOf([x, , z]) {
  const hall = SYNAGOGUE_HALL;
  const inset = [
    ['west', x - hall.x0], ['east', hall.x1 - x], ['south', z - hall.z0], ['north', hall.z1 - z],
  ].sort((a, b) => a[1] - b[1])[0];
  return { side: inset[0], inset: inset[1] };
}

describe('the sabbath in the synagogue at Capernaum', () => {
  it('waits for the whole cast, and instantiates once', () => {
    const onReady = vi.fn();
    const tableau = createSynagogueTableau(THREE, { root: new THREE.Group(), onReady });
    tableau.acceptAssets({
      models: Object.fromEntries(Object.entries(models).filter(([id]) => id !== 'human-jesus')),
    });
    expect(tableau.isReady()).toBe(false);
    expect(tableau.group.visible).toBe(false);
    tableau.acceptAssets({ models: { 'human-jesus': { scene: new THREE.Group() } } });
    expect(tableau.isReady()).toBe(false);
    tableau.acceptAssets({ models });
    tableau.acceptAssets({ models });
    expect(tableau.getActors().size).toBe(SYNAGOGUE_CAST.length);
    expect(onReady).toHaveBeenCalledTimes(1);
    tableau.dispose();
  });

  it('loops every pose without a jump', () => {
    // Every pose is baked as a loop; a motion that is not a whole number of
    // cycles of it would make a man twitch once every twelve seconds.
    const numbers = (value) => (typeof value === 'number' ? [value]
      : typeof value === 'object' ? Object.values(value).flatMap(numbers) : []);
    for (const [name, sample] of Object.entries(POSES)) {
      const end = numbers(sample(POSE_SECONDS));
      numbers(sample(0)).forEach((value, i) => expect(end[i], name).toBeCloseTo(value, 9));
    }
  });

  it('holds the rebuke: Jesus seated, his right hand raised toward the man', () => {
    const { tableau } = setup();
    const jesus = tableau.getActors().get('jesus');
    const man = tableau.getActors().get('possessed');
    for (let frame = 0; frame < 120; frame += 1) {
      tableau.update({ delta: 0.1 });
      const hand = position(bone(jesus, 'RightHand'));
      const shoulder = position(bone(jesus, 'RightArm'));
      const target = position(bone(man, 'Head'));
      // Seated, as a teacher sat: his head well below the standing man's.
      expect(position(bone(jesus, 'Head')).y).toBeLessThan(target.y - 0.25);
      // The hand is up and out: at least as high as the shoulder, and
      // carried toward the man rather than resting.
      expect(hand.y).toBeGreaterThan(shoulder.y - 0.05);
      expect(hand.distanceTo(target)).toBeLessThan(shoulder.distanceTo(target) - 0.25);
    }
    tableau.dispose();
  });

  it('keeps the man on his feet, arched and spread, and never still', () => {
    const { tableau } = setup();
    const man = tableau.getActors().get('possessed');
    const heads = [];
    for (let frame = 0; frame < 60; frame += 1) {
      tableau.update({ delta: 0.1 });
      const head = position(bone(man, 'Head'));
      heads.push(head);
      expect(head.y).toBeGreaterThan(F + 1.3);
      // Arms flung wide: the hands further apart than the shoulders by a lot.
      const hands = position(bone(man, 'LeftHand')).distanceTo(position(bone(man, 'RightHand')));
      const shoulders = position(bone(man, 'LeftArm')).distanceTo(position(bone(man, 'RightArm')));
      expect(hands).toBeGreaterThan(shoulders * 2.2);
    }
    const moved = heads.some((head) => head.distanceTo(heads[0]) > 0.02);
    expect(moved).toBe(true);
  });

  it('sits every seated actor on a seat that is there, and at its height', () => {
    const { tableau } = setup();
    tableau.update({ delta: 0.1 });
    let seated = 0;
    for (const actor of tableau.getActors().values()) {
      const { entry } = actor;
      if (!POSES[entry.pose](0).seated) continue;
      seated += 1;
      const hips = position(bone(actor, 'Hips'));
      const seatTop = entry.position[1] + 0.46;
      expect(hips.y - seatTop, `${entry.id} hips above the seat`).toBeGreaterThan(0.03);
      expect(hips.y - seatTop, `${entry.id} hips above the seat`).toBeLessThan(0.25);
      if (entry.seat === 'teacher') {
        expect(seatTop).toBeCloseTo(TEACHER_SEAT.top, 5);
        expect(Math.abs(hips.x - TEACHER_SEAT.x)).toBeLessThan(0.28);
        expect(Math.abs(hips.z - (TEACHER_SEAT.z + 0.05))).toBeLessThan(0.23);
        continue;
      }
      // On a bench: the navigation agrees there is a bench under them, the
      // tier they sit on is the tier whose top they sit at, and their hips
      // are over that tier rather than over the edge of it.
      expect(synagogueFurniture(entry.position[0], entry.position[2]), entry.id).toBe('bench');
      const { inset } = benchOf([hips.x, 0, hips.z]);
      const tier = Math.round((seatTop - F) / SYNAGOGUE_BENCHES.tier);
      expect([1, 2], entry.id).toContain(tier);
      const outer = SYNAGOGUE_BENCH_BAND - (tier - 1) * SYNAGOGUE_BENCHES.depth;
      expect(inset, `${entry.id} hips over its tier`).toBeLessThan(outer);
      expect(inset, `${entry.id} hips over its tier`).toBeGreaterThan(outer - SYNAGOGUE_BENCHES.depth);
    }
    expect(seated).toBeGreaterThan(8);
    tableau.dispose();
  });

  it('keeps everyone on the floor out of the benches, the columns, the table and each other', () => {
    const { tableau } = setup();
    tableau.update({ delta: 0.1 });
    const floorActors = SYNAGOGUE_CAST.filter((entry) => Math.abs(entry.position[1] - F) < 0.05);
    expect(floorActors.length).toBeGreaterThan(5);
    for (const entry of floorActors) {
      const [x, , z] = entry.position;
      if (!POSES[entry.pose](0).seated) expect(blockerAt(x, z, F), entry.id).toBeNull();
      expect(inSynagogueTableauArea(x, z)).toBe(true);
    }
    const cast = [...tableau.getActors().values()];
    for (let i = 0; i < cast.length; i += 1) {
      for (let j = i + 1; j < cast.length; j += 1) {
        const a = cast[i].entry.position;
        const b = cast[j].entry.position;
        expect(Math.hypot(a[0] - b[0], a[2] - b[2]), `${cast[i].entry.id}/${cast[j].entry.id}`)
          .toBeGreaterThan(0.55);
      }
    }
    // And nobody's feet are in the stone: every actor's feet sit on the
    // surface under them — the floor, or the lower tier for the upper one.
    for (const actor of cast) {
      const surface = Math.max(F, actor.entry.position[1]);
      for (const side of ['Left', 'Right']) {
        const foot = position(bone(actor, `${side}Foot`));
        expect(foot.y, `${actor.entry.id} ${side} foot`).toBeGreaterThan(surface - 0.1);
        expect(foot.y, `${actor.entry.id} ${side} foot`).toBeLessThan(surface + 0.6);
      }
    }
    tableau.dispose();
  });

  it('veils the women over their own heads, and keeps the veil on through the pose', () => {
    const { tableau } = setup();
    const point = new THREE.Vector3();
    for (let frame = 0; frame < 30; frame += 1) {
      tableau.update({ delta: 0.2 });
      for (const id of ['woman-a', 'woman-b']) {
        const actor = tableau.getActors().get(id);
        actor.root.updateMatrixWorld(true);
        let veil = null;
        let skullTop = -Infinity;
        actor.root.traverse((node) => {
          if (node.name === 'veil') veil = node;
          if (node.isSkinnedMesh && node.name.endsWith('_LOD1') && /^Skin/.test(node.name)) {
            for (let i = 0; i < node.geometry.attributes.position.count; i += 3) {
              skullTop = Math.max(skullTop, node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld).y);
            }
          }
        });
        expect(veil, id).toBeTruthy();
        expect(veil.isSkinnedMesh).toBe(true);
        let veilTop = -Infinity;
        let veilBottom = Infinity;
        for (let i = 0; i < veil.geometry.attributes.position.count; i += 1) {
          const y = veil.getVertexPosition(i, point).applyMatrix4(veil.matrixWorld).y;
          veilTop = Math.max(veilTop, y);
          veilBottom = Math.min(veilBottom, y);
        }
        // Over the crown, not floating above it or sunk into it...
        expect(veilTop - skullTop, id).toBeGreaterThan(0);
        expect(veilTop - skullTop, id).toBeLessThan(0.08);
        // ...and down onto the shoulders.
        expect(position(bone(actor, 'Head')).y - veilBottom, id).toBeGreaterThan(0.15);
      }
    }
    tableau.dispose();
  });

  it('frames the teacher and the man from the vantage, first person and third', () => {
    const { tableau } = setup();
    tableau.update({ delta: 0.1 });
    const vantage = CAPERNAUM.vantages.find((entry) => entry.id === 'the-synagogue');
    const heads = ['jesus', 'possessed'].map((id) => [id, position(bone(tableau.getActors().get(id), 'Head'))]);
    const inFrame = (camera, label, reach) => {
      camera.updateMatrixWorld(true);
      for (const [id, head] of heads) {
        const ndc = head.clone().project(camera);
        expect(ndc.z, `${label}: ${id} is behind the camera`).toBeLessThan(1);
        expect(Math.abs(ndc.x), `${label}: ${id} is off the side`).toBeLessThan(0.9);
        expect(Math.abs(ndc.y), `${label}: ${id} is off the top or bottom`).toBeLessThan(0.9);
        expect(head.distanceTo(camera.position), `${label}: ${id} is too far`).toBeLessThan(reach);
        // And nobody else is standing in the way of them.
        const sight = new THREE.Line3(camera.position.clone(), head);
        const nearest = new THREE.Vector3();
        for (const actor of tableau.getActors().values()) {
          if (actor.entry.id === id) continue;
          for (const part of ['Head', 'Spine2']) {
            const at = position(bone(actor, part));
            sight.closestPointToPoint(at, true, nearest);
            expect(nearest.distanceTo(at), `${label}: ${actor.entry.id} blocks ${id}`).toBeGreaterThan(0.3);
          }
        }
      }
    };
    const first = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 2400);
    first.position.fromArray(vantage.position);
    first.lookAt(new THREE.Vector3(...vantage.lookAt));
    inFrame(first, 'first person', 6.5);

    const aim = thirdPersonAim(vantage.position, vantage.lookAt);
    const pivot = new THREE.Vector3(vantage.position[0], F + PIVOT_HEIGHT, vantage.position[2]);
    const third = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 2400);
    desiredCameraPosition(pivot, aim.yaw, aim.pitch, FOLLOW_DISTANCE, third.position);
    third.rotation.set(aim.pitch, aim.yaw, 0, 'YXZ');
    inFrame(third, 'third person', 9.5);

    // Landing on an actor, the lamp or the teacher's seat would shove the
    // visitor straight back out.
    const [x, , z] = vantage.position;
    expect(tableau.queryClearance(x, z, 0.35, F).collides).toBe(false);
    expect(blockerAt(x, z, F)).toBeNull();
    tableau.dispose();
  });

  it('makes the man and the teacher solid, and only on the synagogue floor', () => {
    const { tableau } = setup();
    const blocked = tableau.queryClearance(POSSESSED_AT[0], POSSESSED_AT[2], 0.35, F);
    expect(blocked.collides).toBe(true);
    expect(Math.hypot(blocked.pushX, blocked.pushZ)).toBeGreaterThan(0);
    expect(tableau.queryClearance(TEACHER_SEAT.x, TEACHER_SEAT.z, 0.35, F).collides).toBe(true);
    // Not on the synagogue roof over their heads, nor in the street below.
    expect(tableau.queryClearance(POSSESSED_AT[0], POSSESSED_AT[2], 0.35, F + 5.5).collides).toBe(false);
    // The open nave between the door and the table is still walkable.
    expect(tableau.queryClearance(READING_TABLE.x, 34.2, 0.35, F).collides).toBe(false);
    tableau.dispose();
  });

  it('reserves the hall from the ambient crowd, but not the steps up to it', () => {
    expect(inSynagogueTableauArea(READING_TABLE.x, READING_TABLE.z)).toBe(true);
    expect(inSynagogueTableauArea(-19, SYNAGOGUE.z0 - 1)).toBe(false);
    expect(inSynagogueTableauArea(-19, 24)).toBe(false);
    expect(inSynagogueTableauArea(0, 0)).toBe(false);
  });

  it('is seen only from inside, or through the door', () => {
    const eye = F + 1.7;
    const door = (SYNAGOGUE.doorX0 + SYNAGOGUE.doorX1) / 2;
    // Inside, anywhere.
    expect(seesIntoSynagogue(-25, eye, 42)).toBe(true);
    // In the doorway, and on the steps in front of it.
    expect(seesIntoSynagogue(door, eye, SYNAGOGUE.z0 + 0.7)).toBe(true);
    expect(seesIntoSynagogue(door, F + 0.5, 26)).toBe(true);
    // Beside the wall, where no line through the reveal reaches the room.
    expect(seesIntoSynagogue(-26, eye, 29)).toBe(false);
    // Behind it, above it and a long way off.
    expect(seesIntoSynagogue(-19, eye, 50)).toBe(false);
    expect(seesIntoSynagogue(-19, 20, 38)).toBe(false);
    expect(seesIntoSynagogue(door, eye, -20)).toBe(false);
  });

  it('shows the cast only near the hall, keeps the principals at low quality, and owns only its props', () => {
    const { root, tableau } = setup();
    const near = new THREE.PerspectiveCamera();
    near.position.set(-19, 2.6, 30);
    near.updateMatrixWorld(true);
    tableau.update({ delta: 0.1, quality: 'low', camera: near });
    expect(tableau.group.visible).toBe(true);
    const actors = [...tableau.getActors().values()];
    for (const actor of actors) {
      expect(actor.root.visible, actor.entry.id).toBe(!actor.entry.audience);
    }
    const far = new THREE.PerspectiveCamera();
    far.position.set(-26, F + 1.7, 29);
    far.updateMatrixWorld(true);
    tableau.update({ delta: 0.1, camera: far });
    expect(tableau.group.visible).toBe(false);

    // Frozen under reduced motion.
    tableau.update({ delta: 0.1, camera: near });
    const hand = position(bone(tableau.getActors().get('possessed'), 'RightHand'));
    tableau.update({ delta: 5, reducedMotion: true, camera: near });
    expect(position(bone(tableau.getActors().get('possessed'), 'RightHand')).equals(hand)).toBe(true);

    const shared = actors[0].meshes[1][0].geometry;
    const sharedDispose = vi.spyOn(shared, 'dispose');
    let veilGeometry = null;
    tableau.getActors().get('woman-a').root.traverse((node) => { if (node.name === 'veil') veilGeometry = node.geometry; });
    const veilDispose = vi.spyOn(veilGeometry, 'dispose');
    tableau.dispose();
    tableau.dispose();
    expect(root.children).toHaveLength(0);
    expect(sharedDispose).not.toHaveBeenCalled();
    expect(veilDispose).toHaveBeenCalledTimes(1);
    expect(tableau.isReady()).toBe(false);
    expect(tableau.queryClearance(POSSESSED_AT[0], POSSESSED_AT[2], 0.35, F).collides).toBe(false);
  });

  it('is deterministic, and builds nothing with a NaN in it', () => {
    const sample = (tableau) => {
      tableau.update({ delta: 0.1 });
      tableau.group.updateMatrixWorld(true);
      const values = [];
      tableau.group.traverse((node) => values.push(...node.matrixWorld.elements));
      return values;
    };
    const first = setup().tableau;
    const before = sample(first);
    expect(before.every(Number.isFinite)).toBe(true);
    first.dispose();
    const second = setup().tableau;
    expect(sample(second)).toEqual(before);
    second.dispose();
  });

  it('stands on the podium the synagogue is built on', () => {
    expect(F).toBeCloseTo(LEVEL.platform, 6);
  });
});
