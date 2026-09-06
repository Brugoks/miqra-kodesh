import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ACTIVITIES,
  ACTIVITY_NAMES,
  FIGURE,
  ROBE_PALETTE,
  createCrowd,
  gather,
  poseFor,
  scatter,
} from './sceneFigures';

// The rig is built out of real three Object3Ds, so this suite uses the real
// three — it needs no WebGL, only matrix maths. What matters is that nobody
// ends up underground, inside out, or at the origin, and that a crowd of a
// hundred still costs four draw calls.

const seeded = (seed = 1) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const positionsOf = (mesh) => {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const out = [];
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, matrix);
    position.setFromMatrixPosition(matrix);
    out.push(position.clone());
  }
  return out;
};

const meshNamed = (crowd, suffix) => crowd.meshes.find((m) => m.name.endsWith(suffix));

describe('poseFor', () => {
  it('returns a complete pose for every activity', () => {
    for (const activity of ACTIVITY_NAMES) {
      const pose = poseFor(activity, 3.2, 0.7, 1.1);
      for (const key of ['lean', 'sway', 'rise', 'crouch']) {
        expect(Number.isFinite(pose[key]), `${activity}.${key}`).toBe(true);
      }
      expect(Number.isFinite(pose.armL.swing)).toBe(true);
      expect(Number.isFinite(pose.armR.raise)).toBe(true);
      // A body that scales to nothing vanishes; one that scales negative turns
      // inside out and renders with its normals reversed.
      expect(pose.crouch).toBeGreaterThan(0);
    }
  });

  it('never returns a NaN, at any time, for any activity', () => {
    for (const activity of ACTIVITY_NAMES) {
      for (let t = 0; t < 60; t += 0.37) {
        const pose = poseFor(activity, t, t * 0.31, t);
        const values = [pose.lean, pose.sway, pose.rise, pose.crouch,
          pose.armL.swing, pose.armL.raise, pose.armR.swing, pose.armR.raise];
        for (const value of values) expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('falls back to standing rather than throwing on an unknown activity', () => {
    const pose = poseFor('juggling', 1, 0);
    expect(Number.isFinite(pose.lean)).toBe(true);
    expect(pose.crouch).toBe(1);
  });

  it('distinguishes the postures it exists to distinguish', () => {
    // Prayer lifts the hands; that is the entire point of having arms.
    const praying = poseFor('praying', 0, 0);
    const standing = poseFor('standing', 0, 0);
    expect(praying.armL.swing).toBeLessThan(standing.armL.swing - 0.5);

    // Sitting and kneeling put the body lower than standing does.
    expect(poseFor('sitting', 0, 0).crouch).toBeLessThan(1);
    expect(poseFor('kneeling', 0, 0).crouch).toBeLessThan(1);
    // Kneeling upright is taller than sitting on the ground, not shorter.
    expect(poseFor('kneeling', 0, 0).crouch)
      .toBeGreaterThan(poseFor('sitting', 0, 0).crouch);

    // Working and bowing bend forward; standing does not.
    expect(poseFor('working', 0, 0).lean).toBeGreaterThan(0.4);
    expect(poseFor('bowing', 0, 0).lean).toBeGreaterThan(0.4);
    expect(Math.abs(poseFor('standing', 0, 0).lean)).toBeLessThan(0.1);
  });

  it('swings the arms in opposition when walking', () => {
    // Both arms swinging the same way is a march, not a walk.
    const pose = poseFor('walking', 0, 0, Math.PI / 2);
    expect(Math.sign(pose.armL.swing)).toBe(-Math.sign(pose.armR.swing));
    expect(Math.abs(pose.armL.swing)).toBeGreaterThan(0.3);
  });

  it('holds a walker still when there is no cadence', () => {
    const pose = poseFor('walking', 5, 0, 0);
    expect(pose.armL.swing).toBeCloseTo(0, 6);
    expect(pose.rise).toBeCloseTo(0, 6);
  });

  it('moves everyone at their own phase, not in lockstep', () => {
    const a = poseFor('standing', 4, 0);
    const b = poseFor('standing', 4, 2.3);
    expect(a.sway).not.toBeCloseTo(b.sway, 4);
  });
});

describe('gather', () => {
  it('puts everybody near the centre and facing it', () => {
    const random = seeded(9);
    const centre = [10, -4];
    const people = gather(random, centre, 5, { radius: 1.4 });
    expect(people).toHaveLength(5);
    for (const person of people) {
      const distance = Math.hypot(person.x - centre[0], person.z - centre[1]);
      expect(distance).toBeLessThan(1.4 * 1.2);
      // Facing the middle, give or take the jitter that stops it being a
      // committee photograph.
      const toCentre = Math.atan2(centre[0] - person.x, centre[1] - person.z);
      let delta = person.facing - toCentre;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      expect(Math.abs(delta)).toBeLessThan(0.4);
    }
  });

  it('does not stack two people on the same spot', () => {
    const people = gather(seeded(4), [0, 0], 6, { radius: 1.6 });
    for (let i = 0; i < people.length; i += 1) {
      for (let j = i + 1; j < people.length; j += 1) {
        const gap = Math.hypot(people[i].x - people[j].x, people[i].z - people[j].z);
        expect(gap).toBeGreaterThan(0.15);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const once = gather(seeded(77), [3, 3], 4);
    const twice = gather(seeded(77), [3, 3], 4);
    expect(once).toEqual(twice);
  });
});

describe('scatter', () => {
  it('stays inside the rectangle it was given', () => {
    const people = scatter(seeded(2), 30, {
      x0: -20, x1: 20, z0: 5, z1: 40,
    });
    expect(people).toHaveLength(30);
    for (const person of people) {
      expect(person.x).toBeGreaterThanOrEqual(-20);
      expect(person.x).toBeLessThanOrEqual(20);
      expect(person.z).toBeGreaterThanOrEqual(5);
      expect(person.z).toBeLessThanOrEqual(40);
    }
  });

  it('leaves the thoroughfare clear when asked', () => {
    const people = scatter(seeded(3), 40, {
      x0: -60, x1: 60, z0: 0, z1: 20, clearX: 8,
    });
    for (const person of people) expect(Math.abs(person.x)).toBeGreaterThanOrEqual(8);
  });

  it('gives up rather than looping forever when the rectangle is all cleared', () => {
    // Every candidate is rejected; the guard has to end the loop.
    const people = scatter(seeded(5), 10, {
      x0: -3, x1: 3, z0: 0, z1: 4, clearX: 50,
    });
    expect(people).toHaveLength(0);
  });
});

describe('createCrowd', () => {
  const figures = [
    { x: 0, z: 0, y: 0, facing: 0, activity: 'standing' },
    { x: 3, z: 1, y: 2.5, facing: 1, activity: 'praying' },
    { x: -2, z: 4, y: 0, facing: 2, activity: 'sitting' },
    { x: 5, z: -3, y: 0, facing: 0, activity: 'working' },
  ];

  it('builds one instanced mesh per body part, not one per person', () => {
    const crowd = createCrowd(THREE, { figures });
    try {
      // Four draw calls for any number of people is the whole reason for
      // instancing; a regression here is silent until the frame rate goes.
      expect(crowd.group.children).toHaveLength(4);
      for (const mesh of crowd.group.children) expect(mesh.isInstancedMesh).toBe(true);
      expect(meshNamed(crowd, 'crowd').count).toBe(figures.length);
      // Two arms per person, in one mesh.
      expect(meshNamed(crowd, '-arms').count).toBe(figures.length * 2);
    } finally {
      crowd.dispose();
    }
  });

  it('poses everybody at build time, so a still frame has people in it', () => {
    // update() may never be called — a test, a screenshot, a scene rendered
    // once. Everyone must already be standing where they belong.
    const crowd = createCrowd(THREE, { figures });
    try {
      const heads = positionsOf(meshNamed(crowd, '-heads'));
      expect(heads).toHaveLength(figures.length);
      const atOrigin = heads.filter((p) => p.length() < 0.01);
      expect(atOrigin).toHaveLength(0);
    } finally {
      crowd.dispose();
    }
  });

  it('stands people on their own ground, with their heads above their feet', () => {
    const crowd = createCrowd(THREE, { figures });
    try {
      const heads = positionsOf(meshNamed(crowd, '-heads'));
      const robes = positionsOf(meshNamed(crowd, 'crowd'));
      figures.forEach((figure, i) => {
        // Head somewhere near the top of a person standing on this floor.
        expect(heads[i].y).toBeGreaterThan(figure.y + 0.6);
        expect(heads[i].y).toBeLessThan(figure.y + FIGURE.height + 0.2);
        expect(robes[i].y).toBeLessThan(heads[i].y);
        // And over the right spot on the plan — but not exactly over it: a
        // figure bent over a net has their head well forward of their feet,
        // which is the whole reason the lean pivots at the hips. The bound is
        // the deepest bend any activity asks for.
        const drift = Math.hypot(heads[i].x - figure.x, heads[i].z - figure.z);
        expect(drift).toBeLessThan(0.9);
      });
    } finally {
      crowd.dispose();
    }
  });

  it('puts the arms on the shoulders rather than out in the field', () => {
    const crowd = createCrowd(THREE, { figures });
    try {
      const arms = positionsOf(meshNamed(crowd, '-arms'));
      const heads = positionsOf(meshNamed(crowd, '-heads'));
      figures.forEach((figure, i) => {
        for (const arm of [arms[i * 2], arms[i * 2 + 1]]) {
          const reach = Math.hypot(arm.x - heads[i].x, arm.z - heads[i].z);
          // An arm hangs from a shoulder: never more than a arm's length plus
          // a shoulder's width from the head, whatever the pose.
          expect(reach).toBeLessThan(FIGURE.armLength + FIGURE.shoulderX + 0.2);
          expect(arm.y).toBeGreaterThan(figure.y);
          expect(arm.y).toBeLessThan(figure.y + FIGURE.height);
        }
      });
    } finally {
      crowd.dispose();
    }
  });

  it('moves people when the clock does, and keeps them where they were put', () => {
    const crowd = createCrowd(THREE, { figures });
    try {
      crowd.update(0);
      const before = positionsOf(meshNamed(crowd, '-arms'));
      crowd.update(4.5);
      const after = positionsOf(meshNamed(crowd, '-arms'));
      // Something moved...
      expect(after.some((p, i) => p.distanceTo(before[i]) > 0.001)).toBe(true);
      // ...but nobody wandered off. These figures have no route.
      const feetBefore = positionsOf(meshNamed(crowd, 'crowd'));
      crowd.update(30);
      const feetAfter = positionsOf(meshNamed(crowd, 'crowd'));
      feetAfter.forEach((p, i) => {
        expect(Math.hypot(p.x - feetBefore[i].x, p.z - feetBefore[i].z)).toBeLessThan(0.35);
      });
    } finally {
      crowd.dispose();
    }
  });

  it('walks a figure that was given a route, and brings it back', () => {
    const crowd = createCrowd(THREE, {
      figures: [{ route: [[0, 0], [20, 0]], activity: 'walking', speed: 0.2, phase: 0 }],
    });
    try {
      const at = (t) => {
        crowd.update(t);
        return positionsOf(meshNamed(crowd, '-heads'))[0];
      };
      const start = at(0);
      const middle = at(2.5);
      expect(middle.x).toBeGreaterThan(start.x + 1);
      // Out and back: nobody teleports to the start of the line.
      const returned = at(10);
      expect(returned.x).toBeCloseTo(start.x, 1);
    } finally {
      crowd.dispose();
    }
  });

  it('asks the scene how high the ground is under a walker', () => {
    // Capernaum's routes run from the beach up into the village. A walker
    // carrying a fixed Y either wades or hovers.
    const crowd = createCrowd(THREE, {
      figures: [{ route: [[0, -10], [0, 30]], activity: 'walking', speed: 0.2, phase: 0 }],
      groundAt: (x, z) => (z < 0 ? -1.5 : 0),
    });
    try {
      crowd.update(0);
      const low = positionsOf(meshNamed(crowd, 'crowd'))[0];
      crowd.update(3.2);
      const high = positionsOf(meshNamed(crowd, 'crowd'))[0];
      expect(high.y).toBeGreaterThan(low.y + 1);
    } finally {
      crowd.dispose();
    }
  });

  it('never produces a NaN, over a long run, in any pose', () => {
    const everyActivity = ACTIVITY_NAMES.map((activity, i) => ({
      x: i * 2, z: 0, y: 0, facing: i, activity, phase: i * 0.9,
    }));
    const crowd = createCrowd(THREE, { figures: everyActivity });
    try {
      const matrix = new THREE.Matrix4();
      for (const t of [0, 0.5, 3, 17, 120, 3600]) {
        crowd.update(t);
        for (const mesh of crowd.meshes) {
          for (let i = 0; i < mesh.count; i += 1) {
            mesh.getMatrixAt(i, matrix);
            for (const value of matrix.elements) expect(Number.isFinite(value)).toBe(true);
          }
        }
      }
    } finally {
      crowd.dispose();
    }
  });

  it('never sinks anybody through the floor they were placed on', () => {
    const everyActivity = ACTIVITY_NAMES.map((activity, i) => ({
      x: i * 2, z: 0, y: 4, facing: i, activity, phase: i * 0.9,
    }));
    const crowd = createCrowd(THREE, { figures: everyActivity });
    try {
      for (const t of [0, 2, 9, 40]) {
        crowd.update(t);
        // Nobody's midriff is below the floor they were placed on. The robe
        // hem may settle a little into it — cloth pools — but the body must
        // not sink through.
        for (const robe of positionsOf(meshNamed(crowd, 'crowd'))) {
          expect(robe.y).toBeGreaterThan(4);
          expect(robe.y).toBeLessThan(4 + FIGURE.robeHeight);
        }
      }
    } finally {
      crowd.dispose();
    }
  });

  it('gives each figure its own robe colour', () => {
    const crowd = createCrowd(THREE, {
      figures: [
        { x: 0, z: 0, colour: 0xff0000 },
        { x: 1, z: 0, colour: 0x00ff00 },
      ],
    });
    try {
      const robes = meshNamed(crowd, 'crowd');
      const colour = new THREE.Color();
      robes.getColorAt(0, colour);
      expect(colour.getHex()).toBe(0xff0000);
      robes.getColorAt(1, colour);
      expect(colour.getHex()).toBe(0x00ff00);
    } finally {
      crowd.dispose();
    }
  });

  it('names its meshes so a scene can find its own crowd', () => {
    const crowd = createCrowd(THREE, { figures, name: 'walkers' });
    try {
      expect(crowd.group.name).toBe('walkers');
      expect(crowd.meshes.map((m) => m.name)).toEqual([
        'walkers', 'walkers-heads', 'walkers-cloths', 'walkers-arms',
      ]);
    } finally {
      crowd.dispose();
    }
  });

  it('handles an empty crowd without building anything', () => {
    const crowd = createCrowd(THREE, { figures: [] });
    expect(crowd.count).toBe(0);
    expect(crowd.group.children).toHaveLength(0);
    expect(() => crowd.update(3)).not.toThrow();
    expect(() => crowd.dispose()).not.toThrow();
  });

  it('builds a cheaper figure on a low-quality device', () => {
    const high = createCrowd(THREE, { figures, quality: 'high' });
    const low = createCrowd(THREE, { figures, quality: 'low' });
    try {
      const triangles = (crowd) => crowd.group.children
        .reduce((sum, m) => sum + m.geometry.index.count / 3, 0);
      expect(triangles(low)).toBeLessThan(triangles(high));
      // And it does not pay for shadows it will not render.
      expect(low.group.children[0].castShadow).toBe(false);
      expect(high.group.children[0].castShadow).toBe(true);
    } finally {
      high.dispose();
      low.dispose();
    }
  });

  it('frees its geometries and materials', () => {
    const crowd = createCrowd(THREE, { figures });
    const disposed = [];
    for (const mesh of crowd.group.children) {
      mesh.geometry.addEventListener('dispose', () => disposed.push(mesh.name));
    }
    crowd.dispose();
    expect(disposed.length).toBeGreaterThanOrEqual(4);
  });
});

describe('the palette', () => {
  it('is the colour undyed wool actually is', () => {
    // Bright dye was expensive; a crowd in primary colours is a pantomime.
    for (const colour of ROBE_PALETTE) {
      const c = new THREE.Color(colour);
      const { s } = c.getHSL({ h: 0, s: 0, l: 0 });
      expect(s).toBeLessThan(0.35);
    }
  });
});

describe('ACTIVITIES', () => {
  it('is a function per activity, all of them pure', () => {
    for (const [name, fn] of Object.entries(ACTIVITIES)) {
      expect(typeof fn, name).toBe('function');
      expect(fn(2, 0.5, 1)).toEqual(fn(2, 0.5, 1));
    }
  });
});
