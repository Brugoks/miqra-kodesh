import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createTestGltfLoader } from '../../test/gltf.js';
import { HUMAN_MODEL_ASSETS } from './sceneHumanAssets.js';
import { HUMAN_PRESET_ASSETS } from './scenePresetAssets.js';
import { TABERNACLE_CHARACTER_ASSETS } from './tabernacleCharacterAssets.js';
import { MOTION_URL, decodeMotionLibrary } from './sceneMixamo.js';
import { PACE_BINS, WALK_FAMILIES, makeWalk, measureWalk, walkId, walkRequest } from './sceneGait.js';
import { createInstancedCrowd, WOMAN_MODEL } from './sceneInstancedHumans.js';
import { createSceneHumans } from './sceneHumans.js';
import { routePlan, sampleRoute } from './sceneRoutes.js';

// The gait audit. Numbers stand in for watching people walk: that a walk is a
// walk (the hips rise and fall, the feet leave the ground, the tempo is a
// human one, the cycle closes), that it is made for the pace it is asked for,
// that the planted foot stays planted in the world, and that the person seen
// close and the same person seen far are walking the same walk.

const models = {};
let library;
beforeAll(async () => {
  const loader = createTestGltfLoader();
  const assets = [...HUMAN_MODEL_ASSETS, ...HUMAN_PRESET_ASSETS, ...TABERNACLE_CHARACTER_ASSETS.filter((a) => /camp-(man|woman)$/.test(a.id))];
  for (const asset of assets) models[asset.id] = await loader.parseAsync(new Uint8Array(readFileSync(`public${asset.url}`)).buffer, '');
  library = decodeMotionLibrary(JSON.parse(readFileSync(resolve('public', MOTION_URL.slice(1)), 'utf8')));
}, 60000);

const BODIES = ['human-traveler', 'human-villager', 'human-artisan', 'human-tabernacle-camp-woman'];
const requests = () => Object.entries(WALK_FAMILIES).flatMap(([family, spec]) => {
  const paces = spec.fixed ? [0] : PACE_BINS.filter((bin) => bin >= spec.min - 1e-6 && bin <= spec.max + 1e-6);
  const styles = family === 'carry' || family === 'elder' ? ['easy'] : ['easy', 'spry'];
  return paces.flatMap((pace) => styles.map((style) => ({ family, pace, style })));
});

describe('measuring a walk', () => {
  it('agrees with the stride the Tabernacle’s own retarget recorded for its walks', () => {
    for (const id of ['human-tabernacle-camp-man', 'human-tabernacle-camp-woman']) {
      const asset = TABERNACLE_CHARACTER_ASSETS.find((a) => a.id === id);
      for (const name of ['mixamo-walk', 'mixamo-carryWalk']) {
        const clip = models[id].animations.find((c) => c.name === name);
        const gait = measureWalk(THREE, models[id].scene, clip);
        expect(gait.metersPerCycle / asset.motion[name].metersPerCycle, `${id} ${name}`).toBeGreaterThan(0.88);
        expect(gait.metersPerCycle / asset.motion[name].metersPerCycle, `${id} ${name}`).toBeLessThan(1.08);
      }
    }
  });

  it('is the same answer the second time, and for the same clip on another body a different one', () => {
    const clip = models['human-tabernacle-camp-man'].animations.find((c) => c.name === 'mixamo-walk');
    expect(measureWalk(THREE, models['human-tabernacle-camp-man'].scene, clip)).toBe(measureWalk(THREE, models['human-tabernacle-camp-man'].scene, clip));
    expect(measureWalk(THREE, models['human-tabernacle-camp-woman'].scene, clip)).not.toBe(measureWalk(THREE, models['human-tabernacle-camp-man'].scene, clip));
  });
});

describe.each(BODIES)('walks made for %s', (id) => {
  const scene = () => models[id].scene;

  it('are walks: the hips rise and fall, the feet leave the ground, at a human tempo', () => {
    for (const request of requests()) {
      const walk = makeWalk(THREE, scene(), library, request);
      const label = walkId(request);
      expect(walk, label).toBeTruthy();
      if (request.family === 'elder') continue;
      expect(walk.bob, `${label} hip bob`).toBeGreaterThan(0.03);
      expect(walk.bob, `${label} hip bob`).toBeLessThan(0.09);
      expect(walk.lift, `${label} foot lift`).toBeGreaterThan(0.07);
      expect(walk.lift, `${label} foot lift`).toBeLessThan(0.25);
      expect(walk.cadence, `${label} steps a minute`).toBeGreaterThan(74);
      expect(walk.cadence, `${label} steps a minute`).toBeLessThan(136);
      expect(walk.metersPerCycle, `${label} stride`).toBeGreaterThan(0.85);
      expect(walk.metersPerCycle, `${label} stride`).toBeLessThan(1.9);
      expect(walk.planted, `${label} share of frames with a foot down`).toBeGreaterThan(0.25);
    }
  });

  it('cover the pace they were made for', () => {
    for (const request of requests().filter((r) => !WALK_FAMILIES[r.family].fixed)) {
      const walk = makeWalk(THREE, scene(), library, request);
      expect(walk.pace / request.pace, walkId(request)).toBeGreaterThan(0.94);
      expect(walk.pace / request.pace, walkId(request)).toBeLessThan(1.06);
    }
  });

  it('keep the planted foot planted: its speed under the hips is steady', () => {
    for (const request of requests()) {
      const walk = makeWalk(THREE, scene(), library, request);
      expect(walk.skate, walkId(request)).toBeLessThan(0.22);
    }
  });

  it('are loops: the last frame is the first, so there is no hitch where the cycle wraps', () => {
    for (const request of requests()) {
      const { clip } = makeWalk(THREE, scene(), library, request);
      for (const track of clip.tracks) {
        const n = track.times.length;
        if (n < 3 || !/\.(quaternion|position)$/.test(track.name)) continue;
        const size = track.getValueSize();
        let gap = 0;
        for (let c = 0; c < size; c += 1) gap = Math.max(gap, Math.abs(track.values[c] - track.values[(n - 1) * size + c]));
        expect(gap, `${walkId(request)} ${track.name}`).toBeLessThan(0.012);
      }
    }
  });

  it('slow down by shortening the step and the tempo together, as people do', () => {
    const slow = makeWalk(THREE, scene(), library, { family: 'neutral', pace: 0.8, style: 'easy' });
    const fast = makeWalk(THREE, scene(), library, { family: 'neutral', pace: 1.6, style: 'easy' });
    expect(slow.metersPerCycle).toBeLessThan(fast.metersPerCycle * 0.9);
    expect(slow.cadence).toBeLessThan(fast.cadence * 0.92);
    expect(slow.bob).toBeLessThan(fast.bob);
    expect(slow.lift).toBeLessThan(fast.lift);
  });
});

describe('making a walk', () => {
  it('never changes the library’s own clip, and hands out each walk once', () => {
    const scene = models['human-traveler'].scene;
    const a = makeWalk(THREE, scene, library, { family: 'neutral', pace: 1.0, style: 'easy' });
    const b = makeWalk(THREE, scene, library, { family: 'neutral', pace: 1.0, style: 'easy' });
    expect(b).toBe(a);
    const first = makeWalk(THREE, scene, library, { family: 'neutral', pace: 1.6, style: 'spry' });
    const before = Array.from(first.clip.tracks[0].values);
    makeWalk(THREE, scene, library, { family: 'neutral', pace: 0.8, style: 'easy' });
    expect(Array.from(first.clip.tracks[0].values)).toEqual(before);
    expect(a.clip.name).toBe(walkId(a.request));
    expect(a.clip.userData.gait).toBe(a);
  });

  it('is null where the library has no such walk', () => {
    const empty = { fps: 20, bones: library.bones, clips: new Map() };
    expect(makeWalk(THREE, models['human-traveler'].scene, empty, { family: 'neutral', pace: 1.0, style: 'easy' })).toBe(null);
  });
});

describe('who walks which walk', () => {
  const route = [[0, 0], [0, 40]];
  it('only those with a route walk at all', () => {
    expect(walkRequest({ id: 'stander' })).toBe(null);
  });

  it('a man is neutral, a woman at a woman’s pace is a woman’s, and at a brisk pace neutral again', () => {
    expect(walkRequest({ route, speed: 1.1 }).family).toBe('neutral');
    expect(walkRequest({ route, speed: 1.0 }, { woman: true }).family).toBe('woman');
    expect(walkRequest({ route, speed: 1.6 }, { woman: true }).family).toBe('neutral');
  });

  it('someone carrying walks with their arms held', () => {
    expect(walkRequest({ route, speed: 1.1, activity: 'carrying' }).family).toBe('carry');
    expect(walkRequest({ route, speed: 1.1, carries: true }, { woman: true }).family).toBe('carry');
    expect(walkRequest({ route, speed: 1.1, gait: 'elder' }).family).toBe('elder');
  });

  it('is asked for the pace in the person’s own size, rounded to a bin and kept in the family’s range', () => {
    expect(walkRequest({ route, speed: 1.05 }).pace).toBe(1.0);
    expect(walkRequest({ route, speed: 1.15 }).pace).toBe(1.2);
    // A child at 0.6 covering 0.7 m/s is walking at 1.17 in a grown person's terms.
    expect(walkRequest({ route, speed: 0.7, scale: 0.6 }).pace).toBe(1.2);
    expect(walkRequest({ route, speed: 4 }).pace).toBe(1.6);
    expect(walkRequest({ route, speed: 0.2 }).pace).toBe(0.8);
    expect(walkRequest({ route, speed: 2, activity: 'carrying' }).pace).toBe(1.2);
    expect(walkRequest({ route, speed: 0.3, activity: 'carrying' }).pace).toBe(1.0);
  });

  it('is the same walker every time, and loose or spry by who they are', () => {
    expect(walkRequest({ route, speed: 1.1 }, { seed: 7 })).toEqual(walkRequest({ route, speed: 1.1 }, { seed: 7 }));
    expect(walkRequest({ route, speed: 1.1 }, { seed: 7 }).style).toBe('spry');
    expect(walkRequest({ route, speed: 1.1 }, { seed: 8 }).style).toBe('easy');
  });

  it('uses the route’s real top speed when the route is too short to reach the one asked for', () => {
    const short = { route: [[0, 0], [0, 1]], speed: 1.5 };
    expect(routePlan(short).topSpeed).toBeLessThan(1.5);
    expect(walkRequest(short).pace).toBeLessThan(1.6);
  });
});

// --- the walk in motion ----------------------------------------------------------

// How far a foot that is meant to be on the ground travels along it while it
// is: for each stretch of frames in which an ankle is low, the distance it
// moves, taken over the middle of the stretch (the heel coming down and the
// toe leaving are not the plant). Position, not speed, because the crowd holds
// each baked frame for a couple of refreshes and speed read off that is noise.
function plantedDrift(samples) {
  const low = Math.min(...samples.map((s) => s.y));
  const high = Math.max(...samples.map((s) => s.y));
  const near = low + Math.max(0.02, 0.25 * (high - low));
  const runs = [];
  let run = [];
  for (const sample of samples) {
    if (sample.y <= near) run.push(sample.z);
    else { if (run.length) runs.push(run); run = []; }
  }
  const drifts = runs.filter((r) => r.length >= 8).map((r) => {
    const from = Math.floor(r.length * 0.2); const to = Math.ceil(r.length * 0.8);
    const middle = r.slice(from, to);
    return Math.max(...middle) - Math.min(...middle);
  });
  return {
    mean: drifts.reduce((a, b) => a + b, 0) / Math.max(1, drifts.length),
    worst: Math.max(0, ...drifts),
    runs: drifts.length,
    lift: high - low,
  };
}

const ROUTE = { id: 'audit-walker', kind: 'man', route: [[0, 0], [0, 400]], speed: 1.2, phase: 0, activity: 'walking', x: 0, z: 0, ramp: 0.8 };

describe('a person walking, near', () => {
  const walkNear = (figure, { motionLibrary }) => {
    const near = createSceneHumans({
      THREE, root: new THREE.Group(), sceneSlug: 'capernaum', crowdFigures: [figure], qualityProfile: 'high', actorLimits: { high: 4 }, motionLibrary,
    });
    near.acceptAssets({ models });
    const camera = new THREE.PerspectiveCamera();
    const feet = { left: [], right: [] };
    const dt = 1 / 60;
    let actor = null;
    for (let step = 0; step < 60 * 14; step += 1) {
      const elapsed = step * dt;
      camera.position.set(0, 1.6, elapsed * figure.speed + 3);
      near.update({ camera, elapsed, delta: dt });
      actor = near.getActors().get(`human-${figure.id}`);
      if (elapsed < 6 || !actor?.root) continue;
      actor.root.updateMatrixWorld(true);
      for (const [side, name] of [['left', 'mixamorigLeftFoot'], ['right', 'mixamorigRightFoot']]) {
        const p = actor.root.getObjectByName(name).getWorldPosition(new THREE.Vector3());
        feet[side].push({ y: p.y, z: p.z });
      }
    }
    return { near, actor, feet };
  };

  it('plants its feet: the planted foot does not travel along the ground', () => {
    const { near, actor, feet } = walkNear({ ...ROUTE }, { motionLibrary: library });
    try {
      expect(actor.walk, 'it has a captured walk').toBeTruthy();
      for (const side of ['left', 'right']) {
        const { mean, worst, runs, lift } = plantedDrift(feet[side]);
        expect(runs, `${side} planted stretches`).toBeGreaterThan(3);
        expect(lift, `${side} lift`).toBeGreaterThan(0.07);
        // A planted foot stays where it is put: through the middle of a stance
        // it moves a couple of centimetres, not the length of a step. (The walk
        // this replaced moved it about twenty.)
        expect(mean, `${side} mean drift while planted, m`).toBeLessThan(0.035);
        expect(worst, `${side} worst drift while planted, m`).toBeLessThan(0.04);
      }
    } finally { near.dispose(); }
  }, 120000);

  it('does so at every size and build: the stride goes with the body', () => {
    for (const [id, scale] of [['small', 0.62], ['tall', 1.07]]) {
      const { near, feet } = walkNear({ ...ROUTE, id, scale, speed: 1.2 * scale }, { motionLibrary: library });
      try {
        for (const side of ['left', 'right']) {
          const { mean } = plantedDrift(feet[side]);
          expect(mean, `${id} ${side} mean drift while planted, m`).toBeLessThan(0.035);
        }
      } finally { near.dispose(); }
    }
  }, 240000);

  it('keeps the model’s own walk when there is no library, and waits for one that is coming', async () => {
    const without = walkNear({ ...ROUTE }, { motionLibrary: null });
    try { expect(without.actor.walk).toBe(null); } finally { without.near.dispose(); }

    let arrive;
    const pending = new Promise((resolveLibrary) => { arrive = resolveLibrary; });
    const near = createSceneHumans({
      THREE, root: new THREE.Group(), sceneSlug: 'capernaum', crowdFigures: [{ ...ROUTE }], qualityProfile: 'high', actorLimits: { high: 4 }, motionLibrary: pending,
    });
    try {
      near.acceptAssets({ models });
      const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.6, 2);
      near.update({ camera, elapsed: 0, delta: 0.016 });
      expect(near.getActors().get(`human-${ROUTE.id}`).root, 'not started before the library').toBeFalsy();
      arrive(library);
      await pending;
      await new Promise((done) => { setTimeout(done, 0); });
      near.update({ camera, elapsed: 0.1, delta: 0.016 });
      const actor = near.getActors().get(`human-${ROUTE.id}`);
      expect(actor.root).toBeTruthy();
      expect(actor.walk).toBeTruthy();
    } finally { near.dispose(); }
  }, 60000);
});

describe('a person walking, far', () => {
  // The crowd draws a person from a texture of baked bones. Follow a vertex of
  // the foot through it, on the instance's own matrix.
  it('plants its feet there too, in the baked texture, and at the same stride as near', () => {
    const figure = { ...ROUTE };
    const crowd = createInstancedCrowd(THREE, { figures: [figure], sceneSlug: 'capernaum', motionLibrary: library });
    try {
      crowd.acceptAssets({ models });
      expect(crowd.ready).toBe(true);
      const person = crowd.people[0];
      const model = crowd.models.get(person.model);
      expect(person.walkRow, 'it has a captured walk').toMatch(/^w:walk:/);
      const row = model.bake.rows[person.walkRow];
      // Baked at about thirty keys a second, spread over exactly the cycle.
      expect(row.fps).toBeGreaterThan(28);
      expect(row.fps).toBeLessThan(32);
      expect(row.frames / row.fps).toBeCloseTo(row.duration, 5);
      expect(model.bake.strides[person.walkRow]).toBeGreaterThan(0.85);

      // The ankle joint, as the near test follows it: its rest position carried
      // by its own baked matrix, then onto the instance.
      let skeleton = null;
      model.bake.root.traverse((node) => { if (node.isSkinnedMesh && !skeleton) skeleton = node.skeleton; });
      const joint = { left: skeleton.bones.findIndex((b) => b.name === 'mixamorigLeftFoot'), right: skeleton.bones.findIndex((b) => b.name === 'mixamorigRightFoot') };
      const rest = {
        left: model.bake.root.getObjectByName('mixamorigLeftFoot').getWorldPosition(new THREE.Vector3()),
        right: model.bake.root.getObjectByName('mixamorigRightFoot').getWorldPosition(new THREE.Vector3()),
      };
      const mesh = model.meshes.find((p) => p.partName === 'Skin_LOD1').mesh;
      const feet = { left: [], right: [] };
      const dt = 1 / 60;
      const matrix = new THREE.Matrix4();
      for (let step = 0; step < 60 * 12; step += 1) {
        const elapsed = step * dt;
        crowd.update(elapsed);
        if (elapsed < 6) continue;
        mesh.getMatrixAt(person.slot, matrix);
        // The two rows and the weight between them, as the shader blends them.
        const [rowA, rowB, blend] = [model.anim.getX(person.slot), model.anim.getY(person.slot), model.anim.getZ(person.slot)];
        for (const side of ['left', 'right']) {
          const at = (row) => new THREE.Matrix4().fromArray(model.bake.data, (row * model.bake.width + joint[side] * 4) * 4);
          const a = rest[side].clone().applyMatrix4(at(rowA));
          const b = rest[side].clone().applyMatrix4(at(rowB));
          const world = a.lerp(b, blend).applyMatrix4(matrix);
          feet[side].push({ y: world.y, z: world.z });
        }
      }
      for (const side of ['left', 'right']) {
        const { mean, worst, runs } = plantedDrift(feet[side]);
        expect(runs, `${side} planted stretches`).toBeGreaterThan(3);
        expect(mean, `${side} mean drift while planted, m`).toBeLessThan(0.035);
        expect(worst, `${side} worst drift while planted, m`).toBeLessThan(0.04);
      }
    } finally { crowd.dispose(); }
  }, 120000);

  it('draws each walker on the walk that fits their pace, one row set per distinct walk', () => {
    const figures = [
      { ...ROUTE, id: 'slow', speed: 0.8 },
      { ...ROUTE, id: 'slow-2', speed: 0.82, x: 1 },
      { ...ROUTE, id: 'brisk', speed: 1.6, x: 2 },
      { ...ROUTE, id: 'carrier', activity: 'carrying', x: 3 },
      { ...ROUTE, id: 'woman', kind: 'woman', speed: 1.0, x: 4 },
    ];
    const crowd = createInstancedCrowd(THREE, { figures, sceneSlug: 'capernaum', motionLibrary: library });
    try {
      crowd.acceptAssets({ models });
      const by = Object.fromEntries(crowd.people.map((p) => [p.figure.id, p]));
      expect(by.slow.walkRow).toContain(':0.8:');
      expect(by.brisk.walkRow).toContain(':1.6:');
      expect(by.carrier.walkRow).toContain('walk:carry:');
      expect(by.woman.walkRow).toContain('walk:woman:');
      // The two slow walkers are the same walk when they are the same person-kind.
      if (by.slow.model === by['slow-2'].model && by.slow.appearance.seed % 2 === by['slow-2'].appearance.seed % 2) {
        expect(by.slow.walkRow).toBe(by['slow-2'].walkRow);
      }
    } finally { crowd.dispose(); }
  }, 60000);

  it('keeps the shipped walk without a library', () => {
    const crowd = createInstancedCrowd(THREE, { figures: [{ ...ROUTE }], sceneSlug: 'capernaum' });
    try {
      crowd.acceptAssets({ models });
      expect(crowd.people[0].walkRow).toBeUndefined();
      expect(Object.keys(crowd.models.get(crowd.people[0].model).bake.rows).some((key) => key.startsWith('w:'))).toBe(false);
    } finally { crowd.dispose(); }
  });
});

describe('the same person, near and far', () => {
  it('walks the same walk, with the same stride, at either distance', () => {
    const figures = [
      { ...ROUTE, id: 'a', x: 0 },
      { ...ROUTE, id: 'b', x: 1, kind: 'woman', speed: 1.0, route: [[1, 0], [1, 400]] },
      { ...ROUTE, id: 'c', x: 2, activity: 'carrying', route: [[2, 0], [2, 400]] },
    ];
    const crowd = createInstancedCrowd(THREE, { figures, sceneSlug: 'capernaum', motionLibrary: library });
    const near = createSceneHumans({
      THREE, root: new THREE.Group(), sceneSlug: 'capernaum', crowdFigures: figures, qualityProfile: 'high', actorLimits: { high: 4 }, motionLibrary: library,
    });
    try {
      crowd.acceptAssets({ models }); near.acceptAssets({ models });
      const camera = new THREE.PerspectiveCamera(); camera.position.set(1, 1.6, 4);
      near.update({ camera, elapsed: 0, delta: 0.016 });
      for (const person of crowd.people) {
        const actor = near.getActors().get(`human-${person.figure.id}`);
        expect(actor.walk, person.figure.id).toBeTruthy();
        expect(`w:${actor.walk.id}`, person.figure.id).toBe(person.walkRow);
        const stride = crowd.models.get(person.model).bake.strides[person.walkRow];
        expect(actor.walk.metersPerCycle, person.figure.id).toBeCloseTo(stride, 5);
        expect(actor.animController.locomotion.walkMetersPerCycle, person.figure.id)
          .toBeCloseTo(stride * (person.figure.scale || 1) * person.appearance.build, 5);
      }
      expect(WOMAN_MODEL).toBeTruthy();
    } finally { crowd.dispose(); near.dispose(); }
  }, 60000);
});

describe('what the route does with it', () => {
  it('asks for a pace no faster than the walker’s own top speed', () => {
    const plan = routePlan({ ...ROUTE, route: [[0, 0], [0, 3]] });
    let top = 0;
    for (let t = 0; t < plan.period; t += 0.05) top = Math.max(top, sampleRoute(plan, t).speed);
    expect(top).toBeCloseTo(plan.topSpeed, 1);
  });
});
