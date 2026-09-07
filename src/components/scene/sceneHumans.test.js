import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createSceneHumans } from './sceneHumans';
import { createCrowd } from './sceneFigures';

describe('sceneHumans', () => {
  function createMockCharacterAsset(name) {
    const scene = new THREE.Group();
    scene.name = name;

    const bone = new THREE.Bone();
    bone.name = 'Hips';
    const skeleton = new THREE.Skeleton([bone]);

    const geometry = new THREE.BoxGeometry(0.5, 1.7, 0.3);
    const material = new THREE.MeshStandardMaterial({ color: 0xba8c68 });
    const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
    skinnedMesh.bind(skeleton);
    scene.add(bone);
    scene.add(skinnedMesh);

    const track = new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [0, 0, 0, 0, 0.1, 0]);
    const idleClip = new THREE.AnimationClip('idle', 3.0, [track]);
    const workClip = new THREE.AnimationClip('work', 4.0, [track]);

    return {
      scene,
      animations: [idleClip, workClip],
    };
  }

  it('instantiates actors from loaded assets and links independent mixers', () => {
    const root = new THREE.Group();
    const suppressed = [];
    const humans = createSceneHumans({
      sceneSlug: 'capernaum',
      THREE,
      root,
      onFallbackSuppressed: (id, isSuppressed) => {
        suppressed.push({ id, isSuppressed });
      },
    });

    const mockFisherman = createMockCharacterAsset('actor-fisherman');
    humans.acceptAssets({
      models: {
        'cap-actor-fisherman': mockFisherman,
      },
    });

    const actors = humans.getActors();
    expect(actors.has('cap-actor-fisherman')).toBe(true);

    const fishermanActor = actors.get('cap-actor-fisherman');
    expect(fishermanActor.mixer).toBeDefined();
    expect(fishermanActor.root.position.x).toBe(2.0);

    // Verify crowd fallback was atomically suppressed
    expect(suppressed.some((s) => s.id === 'villager-shore-net-0' && s.isSuppressed)).toBe(true);

    humans.dispose();
  });

  it('atomically suppresses crowd fallback figures without reallocating buffers', () => {
    const figures = [
      { id: 'fig-0', x: 0, z: 0, activity: 'standing' },
      { id: 'fig-1', x: 5, z: 5, activity: 'standing' },
    ];
    const crowd = createCrowd(THREE, { figures, name: 'test-crowd' });
    expect(crowd.isSuppressed('fig-0')).toBe(false);

    // Suppress fig-0
    crowd.suppress('fig-0', true);
    expect(crowd.isSuppressed('fig-0')).toBe(true);
    crowd.update(0);

    const mat = new THREE.Matrix4();
    crowd.meshes[0].getMatrixAt(0, mat);
    expect(mat.getMaxScaleOnAxis()).toBe(0);

    // fig-1 is unsuppressed and has normal non-zero scale
    crowd.meshes[0].getMatrixAt(1, mat);
    expect(mat.getMaxScaleOnAxis()).toBeGreaterThan(0.5);

    crowd.dispose();
  });

  it('enforces dynamic actor limits and updates LOD based on camera distance', () => {
    const root = new THREE.Group();
    const humans = createSceneHumans({
      sceneSlug: 'capernaum',
      THREE,
      root,
      qualityProfile: 'high',
    });

    humans.acceptAssets({
      models: {
        'cap-actor-fisherman': createMockCharacterAsset('actor-fisherman'),
        'cap-actor-grinder': createMockCharacterAsset('actor-grinder'),
        'cap-actor-carrier': createMockCharacterAsset('actor-carrier'),
      },
    });

    const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 100);
    // Position camera close to fisherman at (2, 0, -18)
    camera.position.set(2.0, 0.0, -16.0); // 2m away

    humans.update({
      elapsed: 1.0,
      delta: 0.016,
      camera,
      quality: 'high',
    });

    const fisherman = humans.getActors().get('cap-actor-fisherman');
    expect(fisherman.root.visible).toBe(true);
    expect(fisherman.lodLevel).toBe(0); // Near view (< 5m)

    // Switch to low quality: limits active actors
    humans.setQuality('low');
    humans.update({
      elapsed: 2.0,
      delta: 0.016,
      camera,
      quality: 'low',
    });
    // On low quality, budget is 2
    const visibleCount = Array.from(humans.getActors().values()).filter((a) => a.root.visible).length;
    expect(visibleCount).toBeLessThanOrEqual(2);

    humans.dispose();
  });

  it('detects player clearance violations to prevent camera clipping into actors', () => {
    const root = new THREE.Group();
    const humans = createSceneHumans({
      sceneSlug: 'capernaum',
      THREE,
      root,
    });

    humans.acceptAssets({
      models: {
        'cap-actor-fisherman': createMockCharacterAsset('actor-fisherman'),
      },
    });

    // Fisherman is at (2.0, LEVEL.beach, -18.0)
    // Query clearance very close to actor (e.g. at 2.1, -18.1)
    const clearance = humans.queryClearance(2.1, -18.1, 0.5);
    expect(clearance.collides).toBe(true);
    expect(Math.hypot(clearance.pushX, clearance.pushZ)).toBeGreaterThan(0);

    // Far away query
    const farClearance = humans.queryClearance(50.0, 50.0, 0.5);
    expect(farClearance.collides).toBe(false);

    humans.dispose();
  });

  it('performs complete lifecycle disposal without leaving uncollected roots or actions', () => {
    const root = new THREE.Group();
    const humans = createSceneHumans({
      sceneSlug: 'capernaum',
      THREE,
      root,
    });

    humans.acceptAssets({
      models: {
        'cap-actor-fisherman': createMockCharacterAsset('actor-fisherman'),
      },
    });

    expect(humans.getActors().size).toBe(1);
    humans.dispose();
    expect(humans.getActors().size).toBe(0);
    expect(root.children).toHaveLength(0);
  });
});

// These regressions exercise the replacement pool, not just placement metadata.
describe('crowd replacement continuity', () => {
  function setup(count = 12, reducedMotion = false) {
    const source = new THREE.Group();
    const bone = new THREE.Bone(); bone.name = 'Hips'; source.add(bone);
    const skeleton = new THREE.Skeleton([bone]);
    for (const lod of [0, 1]) {
      const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
      mesh.name = `Skin_LOD${lod}`; mesh.bind(skeleton); source.add(mesh);
    }
    const clip = new THREE.AnimationClip('idle', 1, [new THREE.NumberKeyframeTrack('Hips.position[y]', [0, 1], [0, 0.1])]);
    const model = { scene: source, animations: [clip] };
    const figures = Array.from({ length: count }, (_, i) => ({ id: `person-${i}`, x: i * 0.7, y: 3, z: 0 }));
    const suppressed = new Set();
    const humans = createSceneHumans({ THREE, root: new THREE.Group(), sceneSlug: 'capernaum',
      crowdFigures: figures, reducedMotion,
      onFallbackSuppressed: (id, value) => value ? suppressed.add(id) : suppressed.delete(id) });
    humans.acceptAssets({ models: { 'human-artisan': model, 'human-traveler': model, 'human-villager': model } });
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 4.7, 0);
    return { humans, camera, suppressed, figures };
  }

  it('keeps every person represented when quality drops or the camera moves away', () => {
    const { humans, camera, suppressed, figures } = setup();
    humans.update({ camera, quality: 'low' });
    expect(suppressed.size).toBe(8);
    const activeCount = [...humans.getActors().values()].filter((actor) => actor.root?.visible).length;
    expect(activeCount + figures.length - suppressed.size).toBe(figures.length);
    camera.position.set(200, 4, 200);
    humans.update({ camera, elapsed: 0.016 });
    expect(suppressed.size).toBe(0);
    humans.dispose();
  });

  it('switches actual mesh visibility and restores fallbacks on disposal', () => {
    const { humans, camera, suppressed } = setup(1);
    humans.update({ camera, quality: 'high' });
    const actor = [...humans.getActors().values()][0];
    expect(actor.root.getObjectByName('Skin_LOD0').visible).toBe(true);
    expect(actor.root.getObjectByName('Skin_LOD1').visible).toBe(false);
    camera.position.z = 12;
    humans.update({ camera, elapsed: 0.016 });
    expect(actor.root.getObjectByName('Skin_LOD0').visible).toBe(false);
    expect(actor.root.getObjectByName('Skin_LOD1').visible).toBe(true);
    humans.dispose(); humans.dispose();
    expect(suppressed.size).toBe(0);
  });

  it('freezes both route time and skeletal mixers while reduced motion is enabled', () => {
    const { humans, camera } = setup(1);
    humans.update({ camera, elapsed: 1 });
    const actor = [...humans.getActors().values()][0];
    const time = actor.mixer.time;
    humans.update({ camera, elapsed: 10, reducedMotion: true });
    expect(actor.mixer.time).toBe(time);
    expect(humans.getElapsed()).toBe(1);
    humans.update({ camera, elapsed: 10.016, reducedMotion: false });
    expect(humans.getElapsed()).toBeCloseTo(1.016);
    humans.dispose();
  });

  it('does not suppress any fallback for a static unrigged GLB', () => {
    const calls = [];
    const humans = createSceneHumans({ THREE, root: new THREE.Group(), sceneSlug: 'capernaum',
      onFallbackSuppressed: (...args) => calls.push(args) });
    humans.acceptAssets({ models: { 'human-artisan': { scene: new THREE.Group(), animations: [] } } });
    expect(humans.getActors().size).toBe(0);
    expect(calls).toEqual([]);
    humans.dispose();
  });
});
