// Asset session manager for immersive 3D scenes.
// Manages on-demand loader imports, per-visit caching, partial failure tolerance,
// and cancellation via AbortController and generation tokens.

import * as THREE from 'three';
import { SCENE_ASSET_MANIFEST } from './sceneAssetManifest';
import { createResourceTracker } from './sceneResources';
import { createPbrMaterial } from './sceneMaterials';

let GLTFLoaderClass = null;
let meshoptDecoder = null;

// The decoder is three's own, a self-contained module with its wasm inlined, so
// it adds code to this lazy chunk and no network request. It is attached to every
// loader because a model that needs it says so only inside its own file
// (EXT_meshopt_compression "required"); a loader without it fails on that file.
// WebP images in a GLB (EXT_texture_webp) are read by GLTFLoader without help.
export async function createGltfLoader() {
  if (!GLTFLoaderClass) {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    ]);
    GLTFLoaderClass = GLTFLoader;
    meshoptDecoder = MeshoptDecoder;
  }
  const loader = new GLTFLoaderClass();
  loader.setMeshoptDecoder(meshoptDecoder);
  return loader;
}

// `textureTier` is 'small' on a phone or the low profile: a material that has a
// `mapsLow` set (the 512px scans, a quarter of the bytes and of the GPU memory)
// loads that instead of its full-size `maps`. Anything without one loads as ever.
export function createAssetSession(sceneSlug, {
  textureLoader, gltfLoader, onGroupLoaded, onError, textureTier = 'full',
} = {}) {
  let disposed = false;
  const abortController = new AbortController();
  const tracker = createResourceTracker();
  const manifest = SCENE_ASSET_MANIFEST[sceneSlug];

  const loadedTextures = new Map();
  const loadedModels = new Map();
  const loadedMaterials = new Map();
  const inFlightTextures = new Map();
  const inFlightModels = new Map();

  const texLoader = textureLoader || new THREE.TextureLoader();

  async function getLoader() {
    if (gltfLoader) return gltfLoader;
    return createGltfLoader();
  }

  async function loadTexture(url) {
    if (loadedTextures.has(url)) return loadedTextures.get(url);
    if (inFlightTextures.has(url)) return inFlightTextures.get(url);
    if (disposed) return null;

    const promise = (async () => {
      try {
        const tex = await new Promise((resolve, reject) => {
          texLoader.load(url, resolve, undefined, reject);
        });
        if (disposed) {
          tex.dispose();
          return null;
        }
        tracker.track(tex);
        loadedTextures.set(url, tex);
        return tex;
      } catch (err) {
        if (!disposed) {
          console.warn(`[sceneAssets] Failed to load texture: ${url}`, err.message);
          onError?.({ type: 'texture', url, error: err });
        }
        return null;
      } finally {
        inFlightTextures.delete(url);
      }
    })();

    inFlightTextures.set(url, promise);
    return promise;
  }

  async function loadMaterial(matId) {
    if (loadedMaterials.has(matId)) return loadedMaterials.get(matId);
    const matDef = (manifest?.materials || []).find((m) => m.id === matId);
    if (!matDef) return null;

    const mapPromises = {};
    const small = textureTier === 'small' && Object.keys(matDef.mapsLow || {}).length > 0;
    for (const [key, url] of Object.entries(small ? matDef.mapsLow : matDef.maps || {})) {
      mapPromises[key] = loadTexture(url);
    }
    const resolvedMaps = {};
    for (const [key, promise] of Object.entries(mapPromises)) {
      resolvedMaps[key] = await promise;
    }

    if (disposed) return null;
    const material = createPbrMaterial(THREE, matDef, resolvedMaps);
    tracker.track(material);
    loadedMaterials.set(matId, material);
    return material;
  }

  async function loadModel(modelId) {
    if (loadedModels.has(modelId)) return loadedModels.get(modelId);
    if (inFlightModels.has(modelId)) return inFlightModels.get(modelId);
    const modelDef = (manifest?.models || []).find((m) => m.id === modelId);
    if (!modelDef) return null;

    const promise = (async () => {
      try {
        const loader = await getLoader();
        if (disposed) return null;

        // A model migrated to a compressed encoding keeps its original file as an
        // explicit `fallback`. Only one of the two is ever fetched unless the first
        // fails to load or decode, so a visit never downloads both.
        let gltf = null;
        let failure = null;
        for (const url of [modelDef.url, modelDef.fallback].filter(Boolean)) {
          try {
            gltf = await new Promise((resolve, reject) => {
              loader.load(url, resolve, undefined, reject);
            });
            break;
          } catch (err) {
            failure = err;
            if (disposed) return null;
            console.warn(`[sceneAssets] Failed to load model: ${url}`, err?.message);
          }
        }
        if (!gltf) throw failure;

        if (disposed) {
          tracker.trackObject(gltf.scene);
          tracker.dispose();
          return null;
        }

        tracker.trackObject(gltf.scene);
        loadedModels.set(modelId, gltf);
        return gltf;
      } catch (err) {
        if (!disposed) {
          onError?.({ type: 'model', id: modelId, url: modelDef.url, error: err });
        }
        return null;
      } finally {
        inFlightModels.delete(modelId);
      }
    })();

    inFlightModels.set(modelId, promise);
    return promise;
  }

  async function loadGroup(groupKey) {
    if (disposed || !manifest?.groups?.[groupKey]) return null;
    const groupDef = manifest.groups[groupKey];

    const materialPromises = (groupDef.materials || []).map(loadMaterial);
    const modelPromises = (groupDef.models || []).map(loadModel);

    const [materials, models] = await Promise.all([
      Promise.all(materialPromises),
      Promise.all(modelPromises),
    ]);

    if (disposed) return null;

    const result = {
      id: groupDef.id,
      groupKey,
      materials: Object.fromEntries(
        (groupDef.materials || []).map((id, i) => [id, materials[i]]).filter(([, v]) => Boolean(v)),
      ),
      models: Object.fromEntries(
        (groupDef.models || []).map((id, i) => [id, models[i]]).filter(([, v]) => Boolean(v)),
      ),
    };

    onGroupLoaded?.(result);
    return result;
  }

  async function loadAllGroupsSequentially() {
    if (!manifest?.groups) return;
    const sortedGroups = Object.entries(manifest.groups).sort(
      // `??`, not `||`: a priority of 0 is the first group, not the last.
      ([, a], [, b]) => (a.priority ?? 99) - (b.priority ?? 99),
    );

    for (const [key] of sortedGroups) {
      if (disposed) break;
      await loadGroup(key);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    abortController.abort();
    tracker.dispose();
    loadedTextures.clear();
    loadedModels.clear();
    loadedMaterials.clear();
    inFlightTextures.clear();
    inFlightModels.clear();
  }

  return {
    loadGroup,
    loadAllGroupsSequentially,
    loadTexture,
    loadMaterial,
    loadModel,
    dispose,
    isDisposed: () => disposed,
  };
}
