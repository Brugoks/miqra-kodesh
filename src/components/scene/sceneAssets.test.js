import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createResourceTracker, cloneSkinnedMesh } from './sceneResources';
import { configureTexture, createPbrMaterial, applyMetricRepeat } from './sceneMaterials';
import { createAssetSession } from './sceneAssets';
import { SCENE_ASSET_MANIFEST } from './sceneAssetManifest';

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

describe('sceneAssets texture tiers and load order', () => {
  // A loader that hands back a blank texture for any URL and remembers which.
  const recordingLoader = () => {
    const urls = [];
    return {
      urls,
      load: (url, onLoad) => {
        urls.push(url);
        onLoad(new THREE.DataTexture(new Uint8Array(4), 1, 1));
      },
    };
  };

  it('loads the full-size scans by default and the 512px set on a phone', async () => {
    const [def] = SCENE_ASSET_MANIFEST.caesarea.materials;
    expect(Object.keys(def.mapsLow)).toEqual(Object.keys(def.maps));

    const full = recordingLoader();
    const fullSession = createAssetSession('caesarea', { textureLoader: full });
    const fullGroup = await fullSession.loadGroup('surfaces');
    expect(fullGroup.materials[def.id].map).toBeTruthy();
    expect(full.urls).toContain(def.maps.diffuse);
    expect(full.urls).not.toContain(def.mapsLow.diffuse);
    fullSession.dispose();

    const small = recordingLoader();
    const smallSession = createAssetSession('caesarea', { textureLoader: small, textureTier: 'small' });
    const smallGroup = await smallSession.loadGroup('surfaces');
    expect(smallGroup.materials[def.id].map).toBeTruthy();
    expect(small.urls).toContain(def.mapsLow.diffuse);
    expect(small.urls).not.toContain(def.maps.diffuse);
    // Everything the small tier fetched is a 512px file, and the group is whole.
    expect(small.urls.every((url) => /-512-/.test(url) || !url.includes('shared/materials'))).toBe(true);
    expect(Object.keys(smallGroup.materials)).toEqual(SCENE_ASSET_MANIFEST.caesarea.groups.surfaces.materials);
    smallSession.dispose();
  });

  it('falls back to the full-size maps for a material that has no small set', async () => {
    const loader = recordingLoader();
    const session = createAssetSession('bethlehem', { textureLoader: loader, textureTier: 'small' });
    const group = await session.loadGroup('surfaces');
    const [def] = SCENE_ASSET_MANIFEST.bethlehem.materials;
    expect(def.mapsLow).toBeUndefined();
    expect(loader.urls).toContain(def.maps.diffuse);
    expect(group.materials[def.id].map).toBeTruthy();
    session.dispose();
  });

  it('delivers the scans before the people: a priority of 0 is first, not last', async () => {
    const delivered = [];
    const session = createAssetSession('caesarea', {
      textureLoader: recordingLoader(),
      gltfLoader: { load: (_url, onLoad) => onLoad({ scene: new THREE.Group() }) },
      onGroupLoaded: (group) => delivered.push(group.groupKey),
    });
    await session.loadAllGroupsSequentially();
    expect(delivered.length).toBeGreaterThan(1);
    expect(delivered[0]).toBe('surfaces');
    expect(delivered).toContain('actors');
    session.dispose();
  });

  it('keeps every scene’s small tier under a megabyte and a half, and the full tier honest', () => {
    for (const slug of ['second-temple', 'caesarea', 'capernaum', 'tabernacle', 'valley-of-elah', 'mount-of-olives', 'sinai']) {
      const defs = SCENE_ASSET_MANIFEST[slug].materials;
      const bytes = (key) => defs.flatMap((m) => Object.values(m[key])).reduce((n, f) => n + f.size, 0);
      expect(bytes('filesLow'), slug).toBeLessThan(1.5 * 1048576);
      expect(bytes('files'), slug).toBeLessThan(5.5 * 1048576);
      expect(bytes('filesLow'), slug).toBeLessThan(bytes('files') / 3);
    }
  });
});

