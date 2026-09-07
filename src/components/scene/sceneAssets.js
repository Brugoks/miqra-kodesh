// Asset session manager for immersive 3D scenes.
// Manages on-demand loader imports, per-visit caching, partial failure tolerance,
// and cancellation via AbortController and generation tokens.

import * as THREE from 'three';
import { SCENE_ASSET_MANIFEST } from './sceneAssetManifest';
import { createResourceTracker } from './sceneResources';
import { createPbrMaterial } from './sceneMaterials';

let GLTFLoaderClass = null;

async function getGLTFLoader() {
  if (!GLTFLoaderClass) {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    GLTFLoaderClass = GLTFLoader;
  }
  return new GLTFLoaderClass();
}

export function createAssetSession(sceneSlug, { textureLoader, gltfLoader, onGroupLoaded, onError } = {}) {
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
    return getGLTFLoader();
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
    for (const [key, url] of Object.entries(matDef.maps || {})) {
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

        const gltf = await new Promise((resolve, reject) => {
          loader.load(modelDef.url, resolve, undefined, reject);
        });

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
          console.warn(`[sceneAssets] Failed to load model: ${modelDef.url}`, err.message);
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
      ([, a], [, b]) => (a.priority || 99) - (b.priority || 99),
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
