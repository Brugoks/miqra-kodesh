import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createResourceTracker, cloneSkinnedMesh } from './sceneResources';
import { configureTexture, createPbrMaterial, applyMetricRepeat } from './sceneMaterials';
import { createAssetSession } from './sceneAssets';

describe('sceneResources', () => {
  it('tracks and disposes geometries, materials, and textures deduplicated', () => {
    const tracker = createResourceTracker();
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const mat = new THREE.MeshStandardMaterial({ map: tex });

    tracker.track(geom);
    tracker.track(geom); // duplicate should not increase size
    tracker.track(mat); // should also track attached map

    expect(tracker.counts().geometries).toBe(1);
    expect(tracker.counts().textures).toBe(1);
    expect(tracker.counts().materials).toBe(1);

    const disposeGeomSpy = vi.spyOn(geom, 'dispose');
    const disposeTexSpy = vi.spyOn(tex, 'dispose');
    const disposeMatSpy = vi.spyOn(mat, 'dispose');

    tracker.dispose();

    expect(disposeGeomSpy).toHaveBeenCalledTimes(1);
    expect(disposeTexSpy).toHaveBeenCalledTimes(1);
    expect(disposeMatSpy).toHaveBeenCalledTimes(1);
    expect(tracker.counts().geometries).toBe(0);
  });

  it('clones skinned mesh preserving skeleton bones and bindings', () => {
    const root = new THREE.Group();
    const bone = new THREE.Bone();
    const skeleton = new THREE.Skeleton([bone]);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0], 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1], 4));
    const mesh = new THREE.SkinnedMesh(geom, new THREE.MeshBasicMaterial());
    mesh.bind(skeleton);
    root.add(bone);
    root.add(mesh);

    const cloned = cloneSkinnedMesh(root);
    expect(cloned).not.toBe(root);
    const clonedMesh = cloned.children.find((c) => c.isSkinnedMesh);
    expect(clonedMesh).toBeDefined();
    expect(clonedMesh.skeleton.bones.length).toBe(1);
    expect(clonedMesh.skeleton.bones[0]).not.toBe(bone);
  });
});

describe('sceneMaterials', () => {
  it('configures textures with appropriate color spaces and wrapping', () => {
    const texColor = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const texData = new THREE.DataTexture(new Uint8Array(4), 1, 1);

    configureTexture(texColor, true);
    configureTexture(texData, false);

    expect(texColor.wrapS).toBe(THREE.RepeatWrapping);
    expect(texColor.colorSpace).toBe(THREE.SRGBColorSpace || 'srgb');
    expect(texData.colorSpace).toBe(THREE.NoColorSpace);
  });

  it('creates PBR materials with metric scaling and repeat calculations', () => {
    const diffuse = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const normal = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const mat = createPbrMaterial(THREE, { scale: [2.0, 2.0] }, { diffuse, normal });

    expect(mat.map).toBe(diffuse);
    expect(mat.normalMap).toBe(normal);
    expect(mat.map.repeat.x).toBeCloseTo(0.5);

    applyMetricRepeat(mat, 6.0, 4.0, [2.0, 2.0]);
    expect(mat.map.repeat.x).toBeCloseTo(3.0);
    expect(mat.map.repeat.y).toBeCloseTo(2.0);
  });
});

describe('sceneAssets session', () => {
  it('handles partial failures gracefully without throwing', async () => {
    const errors = [];
    const mockTexLoader = {
      load: (_url, _onLoad, _onProgress, onError) => {
        onError(new Error('Network error 404'));
      },
    };

    const session = createAssetSession('capernaum', {
      textureLoader: mockTexLoader,
      onError: (err) => errors.push(err),
    });

    const result = await session.loadTexture('/assets/scenes/non-existent-file.png');
    expect(result).toBeNull();
    expect(errors.length).toBe(1);
    expect(errors[0].type).toBe('texture');

    session.dispose();
    expect(session.isDisposed()).toBe(true);
  });

  it('stops loading and prevents callbacks once disposed', async () => {
    let callbackCalled = false;
    const session = createAssetSession('capernaum', {
      onGroupLoaded: () => {
        callbackCalled = true;
      },
    });

    session.dispose();
    const res = await session.loadGroup('core');
    expect(res).toBeNull();
    expect(callbackCalled).toBe(false);
  });
});
