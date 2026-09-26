import { readFileSync, statSync } from 'node:fs';
import { beforeAll, describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createPlayerAvatar, crossings, GAIT } from './scenePlayerAvatar.js';
import { createHumanPoseSafety } from './sceneHumanSafety.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import clipData from './playerAvatarClips.json';

// The visitor's body is the one character watched for the whole visit, and
// none of it can be eyeballed in CI — so these run the real traveller model
// through the real clips and check the things a screenshot would catch: feet
// on the ground, a staff in the hand, a body the right way round, and a gait
// whose footsteps land where its feet do.

const TRAVELER = HUMAN_MODEL_ASSETS.find((asset) => asset.id === 'human-traveler');
let traveler;

beforeAll(async () => {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new THREE.Texture() }));
  const bytes = readFileSync(`public${TRAVELER.url}`);
  traveler = await loader.parseAsync(new Uint8Array(bytes).buffer, '');
}, 60000);

const actorsGroup = () => ({ groupKey: 'actors', models: { 'human-traveler': traveler } });

async function readyAvatar(options = {}) {
  const parent = new THREE.Group();
  const avatar = createPlayerAvatar(THREE, { parent, ...options });
  avatar.acceptAssets(actorsGroup());
  await avatar.loaded;
  return { avatar, parent };
}

// Walks the avatar straight ahead at `speed` for `seconds` at 60 fps and
// returns the heel strikes it reported.
function walk(avatar, speed, seconds, { heading = 0, onFrame } = {}) {
  const dt = 1 / 60;
  let x = 0;
  let z = 0;
  let footfalls = 0;
  for (let t = 0; t < seconds; t += dt) {
    x += Math.sin(heading) * speed * dt;
    z += Math.cos(heading) * speed * dt;
    footfalls += avatar.update({ delta: dt, x, y: 0, z, heading, travelled: speed * dt }).footfalls;
    onFrame?.(t);
  }
  return footfalls;
}

const named = (root, name) => root.getObjectByName(name);
const worldY = (object, local = new THREE.Vector3()) => object.localToWorld(local.clone()).y;

describe('crossings', () => {
  it('counts each mark once per cycle passed', () => {
    expect(crossings(0, 1, [0.3, 0.8])).toBe(2);
    expect(crossings(0.25, 0.35, [0.3, 0.8])).toBe(1);
    expect(crossings(0.31, 0.79, [0.3, 0.8])).toBe(0);
    expect(crossings(0.9, 2.95, [0.3, 0.8])).toBe(4);
    expect(crossings(0.5, 0.5, [0.3])).toBe(0);
  });
});

describe('the authored clips', () => {
  it('parse into clips whose every track drives a bone of the traveller rig', () => {
    const names = new Set();
    traveler.scene.traverse((node) => names.add(node.name));
    for (const key of ['idle', 'walk', 'jog']) {
      const clip = THREE.AnimationClip.parse(clipData.clips[key].clip);
      expect(clip.duration).toBeGreaterThan(0.3);
      expect(clip.tracks.length).toBeGreaterThan(10);
      for (const track of clip.tracks) {
        expect(names.has(track.name.split('.')[0]), track.name).toBe(true);
        expect(Array.from(track.values).every(Number.isFinite), track.name).toBe(true);
      }
    }
  });

  it('carries plausible strides and a symmetric jog, within its size budget', () => {
    const { walk: w, jog: j } = clipData.clips;
    expect(w.metersPerCycle).toBeGreaterThan(1.2);
    expect(w.metersPerCycle).toBeLessThan(1.7);
    expect(j.metersPerCycle).toBeGreaterThan(1.8);
    expect(j.metersPerCycle).toBeLessThan(2.8);
    expect(Math.abs(((j.footfalls[1] - j.footfalls[0]) + 1) % 1 - 0.5)).toBeLessThan(0.02);
    expect(statSync('src/components/scene/playerAvatarClips.json').size).toBeLessThan(300 * 1024);
    expect(clipData.grip.bone).toBe('mixamorigRightHand');
  });
});

describe('createPlayerAvatar', () => {
  it('has a body from the first frame, before any character asset arrives', () => {
    const parent = new THREE.Group();
    const avatar = createPlayerAvatar(THREE, { parent });
    try {
      expect(avatar.group.parent).toBe(parent);
      expect(avatar.ready).toBe(false);
      const fallback = named(avatar.group, 'player-avatar-fallback');
      expect(fallback.visible).toBe(true);
      expect(avatar.update({ delta: 1 / 60, x: 3, y: 0.5, z: -2, heading: 1, travelled: 0.02 }).footfalls).toBe(0);
      expect(avatar.group.position.toArray()).toEqual([3, 0.5, -2]);
    } finally {
      avatar.dispose();
    }
  });

  it('upgrades to the skinned traveller once, and ignores groups without one', async () => {
    const parent = new THREE.Group();
    const avatar = createPlayerAvatar(THREE, { parent });
    try {
      avatar.acceptAssets({ groupKey: 'props', models: { jar: { scene: new THREE.Group(), animations: [] } } });
      await avatar.loaded;
      expect(avatar.ready).toBe(false);
      avatar.acceptAssets(actorsGroup());
      avatar.acceptAssets(actorsGroup());
      expect(avatar.ready).toBe(true);
      const bodies = [];
      avatar.group.traverse((node) => { if (node.name === 'player-avatar-body') bodies.push(node); });
      expect(bodies).toHaveLength(1);
      expect(named(avatar.group, 'player-avatar-fallback').visible).toBe(false);
    } finally {
      avatar.dispose();
    }
  });

  it('faces the heading it is given, in three.js model convention', async () => {
    const { avatar } = await readyAvatar();
    try {
      for (const heading of [0, 0.7, -2.4, Math.PI]) {
        avatar.update({ delta: 1 / 60, x: 1, y: 0, z: 2, heading, travelled: 0 });
        avatar.group.updateMatrixWorld(true);
        const ahead = avatar.group.localToWorld(new THREE.Vector3(0, 0, 1)).sub(avatar.group.position);
        expect(ahead.x).toBeCloseTo(Math.sin(heading), 5);
        expect(ahead.z).toBeCloseTo(Math.cos(heading), 5);
      }
      // The staff hand is the right one, which for a figure facing +Z is -X.
      avatar.update({ delta: 1 / 60, x: 0, y: 0, z: 0, heading: 0, travelled: 0 });
      avatar.group.updateMatrixWorld(true);
      const hand = named(avatar.group, 'mixamorigRightHand').getWorldPosition(new THREE.Vector3());
      expect(hand.x).toBeLessThan(0);
    } finally {
      avatar.dispose();
    }
  });

  it('stands, walks and jogs by speed, and settles when it stops', async () => {
    const { avatar } = await readyAvatar();
    try {
      walk(avatar, 1.4, 1.2);
      expect(avatar.gait.move).toBeGreaterThan(0.95);
      expect(avatar.gait.jog).toBeLessThan(0.05);
      walk(avatar, 4.2, 1.5);
      expect(avatar.gait.jog).toBeGreaterThan(0.95);
      walk(avatar, 0, 0.6);
      expect(avatar.gait.move).toBeLessThan(0.02);
      expect(GAIT.walkTop).toBeLessThan(GAIT.jogFrom);
    } finally {
      avatar.dispose();
    }
  });

  it('reports two heel strikes per stride at a walk and at a jog', async () => {
    for (const [speed, meters] of [[1.4, clipData.clips.walk.metersPerCycle], [4.2, clipData.clips.jog.metersPerCycle]]) {
      const { avatar } = await readyAvatar();
      try {
        walk(avatar, speed, 0.5); // come up to pace before counting
        const seconds = 20 / speed;
        const strikes = walk(avatar, speed, seconds);
        const expected = (2 * 20) / meters;
        expect(Math.abs(strikes - expected), `at ${speed} m/s`).toBeLessThanOrEqual(2);
        expect(avatar.metersPerStep).toBeCloseTo(clipData.clips.walk.metersPerCycle / 2, 5);
      } finally {
        avatar.dispose();
      }
    }
  });

  it('keeps an upright, grounded body with finite bones through every gait', async () => {
    const { avatar } = await readyAvatar();
    try {
      const body = named(avatar.group, 'player-avatar-body');
      const safety = createHumanPoseSafety(THREE, body);
      const matrix = new THREE.Matrix4();
      let checked = 0;
      const check = () => {
        body.updateMatrixWorld(true);
        expect(safety.isSane({ groundY: 0, heightMeters: 1.7 })).toBe(true);
        body.traverse((node) => {
          if (!node.isBone) return;
          matrix.copy(node.matrixWorld);
          expect(matrix.elements.every(Number.isFinite), node.name).toBe(true);
        });
        checked += 1;
      };
      // Standing, walking, jogging, and the blend between them.
      for (const speed of [0, 1.4, 2.5, 4.2]) {
        let frame = 0;
        walk(avatar, speed, 1.4, {
          onFrame: () => {
            frame += 1;
            if (frame % 9 === 0) check();
          },
        });
      }
      expect(checked).toBeGreaterThan(20);
    } finally {
      avatar.dispose();
    }
  }, 20000);

  it('holds its things where they are claimed to be', async () => {
    const { avatar } = await readyAvatar();
    try {
      const staff = named(avatar.group, 'player-avatar-staff');
      const cloth = named(avatar.group, 'player-avatar-headcloth');
      const bag = named(avatar.group, 'player-avatar-bag');
      expect(staff.parent.name).toBe('mixamorigRightHand');
      expect(cloth.parent.name).toBe('mixamorigHead');
      expect(bag.parent.name).toBe('mixamorigHips');

      // Standing: the foot of the staff is on the ground beside the visitor,
      // not hanging in the air or buried in it.
      walk(avatar, 0, 1);
      avatar.group.updateMatrixWorld(true);
      const foot = worldY(staff);
      expect(foot).toBeGreaterThan(-0.06);
      expect(foot).toBeLessThan(0.15);

      // Walking and jogging it swings, but is never driven deep underground.
      let lowest = Infinity;
      for (const speed of [1.4, 4.2]) {
        walk(avatar, speed, 1.5, {
          onFrame: () => {
            avatar.group.updateMatrixWorld(true);
            lowest = Math.min(lowest, worldY(staff));
          },
        });
      }
      expect(lowest).toBeGreaterThan(-0.12);

      // The bag hangs on the left flank, outside the body; the cloth covers
      // the head.
      walk(avatar, 0, 1);
      avatar.group.updateMatrixWorld(true);
      const hips = named(avatar.group, 'mixamorigHips').getWorldPosition(new THREE.Vector3());
      const bagAt = bag.getWorldPosition(new THREE.Vector3());
      expect(bagAt.x - hips.x).toBeGreaterThan(0.14);
      const head = named(avatar.group, 'mixamorigHead').getWorldPosition(new THREE.Vector3());
      const clothBox = new THREE.Box3().setFromObject(cloth);
      expect(clothBox.max.y).toBeGreaterThan(head.y + 0.15);
      expect(clothBox.min.x).toBeLessThan(head.x);
      expect(clothBox.max.x).toBeGreaterThan(head.x);
    } finally {
      avatar.dispose();
    }
  }, 20000);

  it('tints only its own copies of the materials', async () => {
    const shared = new Set();
    traveler.scene.traverse((node) => {
      if (node.isMesh) [node.material].flat().forEach((material) => shared.add(material));
    });
    const before = new Map([...shared].map((material) => [material, material.color.getHex()]));
    const { avatar } = await readyAvatar();
    try {
      avatar.setOpacity(0.5);
      let tinted = false;
      named(avatar.group, 'player-avatar-body').traverse((node) => {
        if (!node.isMesh) return;
        for (const material of [node.material].flat()) {
          expect(shared.has(material)).toBe(false);
          expect(material.opacity).toBe(0.5);
          if (/^cloth/i.test(material.name) && material.color.getHex() !== 0xffffff) tinted = true;
        }
      });
      expect(tinted).toBe(true);
      for (const [material, hex] of before) {
        expect(material.color.getHex()).toBe(hex);
        expect(material.opacity).toBe(1);
      }
    } finally {
      avatar.dispose();
    }
  });

  it('composes fading with visibility', async () => {
    const { avatar } = await readyAvatar();
    try {
      avatar.setOpacity(0);
      expect(avatar.group.visible).toBe(false);
      avatar.setOpacity(1);
      expect(avatar.group.visible).toBe(true);
      avatar.setVisible(false);
      avatar.setOpacity(1);
      expect(avatar.group.visible).toBe(false);
      avatar.setVisible(true);
      expect(avatar.group.visible).toBe(true);
    } finally {
      avatar.dispose();
    }
  });

  it('gives a head position near the top of the body', async () => {
    const { avatar } = await readyAvatar();
    try {
      avatar.update({ delta: 1 / 60, x: 5, y: 3.3, z: 12, heading: 0, travelled: 0 });
      avatar.group.updateMatrixWorld(true);
      const head = avatar.getHeadPosition(new THREE.Vector3());
      expect(head.y - 3.3).toBeGreaterThan(1.45);
      expect(head.y - 3.3).toBeLessThan(1.8);
      expect(Math.hypot(head.x - 5, head.z - 12)).toBeLessThan(0.25);
    } finally {
      avatar.dispose();
    }
  });

  it('disposes what it made and nothing it borrowed', async () => {
    let borrowedDisposed = false;
    traveler.scene.traverse((node) => {
      if (!node.isMesh) return;
      [node.material].flat().forEach((material) => material.addEventListener('dispose', () => { borrowedDisposed = true; }));
      node.geometry.addEventListener('dispose', () => { borrowedDisposed = true; });
    });
    const { avatar, parent } = await readyAvatar();
    avatar.dispose();
    expect(borrowedDisposed).toBe(false);
    expect(parent.children).not.toContain(avatar.group);
    // Safe to call twice, and inert afterwards.
    avatar.dispose();
    expect(avatar.update({ delta: 0.016, travelled: 0.1 }).footfalls).toBe(0);
  });
});
