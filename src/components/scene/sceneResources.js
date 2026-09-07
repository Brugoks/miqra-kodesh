// Resource tracker and deduplicating disposal manager for 3D scene resources.
// Ensures each geometry, texture, and material is disposed exactly once,
// preventing premature disposal of shared resources or GPU leaks.


export function createResourceTracker() {
  const geometries = new Set();
  const textures = new Set();
  const materials = new Set();
  const mixers = new Set();

  function track(resource) {
    if (!resource) return resource;
    if (resource.isGeometry || resource.isBufferGeometry) geometries.add(resource);
    else if (resource.isTexture) textures.add(resource);
    else if (resource.isMaterial) {
      materials.add(resource);
      // Track maps attached to material
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'].forEach((key) => {
        if (resource[key]?.isTexture) textures.add(resource[key]);
      });
      if (resource.userData?.thicknessMap?.value?.isTexture) {
        textures.add(resource.userData.thicknessMap.value);
      }
    } else if (resource.isAnimationMixer || (typeof resource.stopAllAction === 'function' && typeof resource.uncacheRoot === 'function')) {
      mixers.add(resource);
    }
    return resource;
  }

  function trackMixer(mixer) {
    if (mixer) mixers.add(mixer);
    return mixer;
  }

  function trackObject(root) {
    if (!root) return root;
    root.traverse((child) => {
      if (child.geometry) track(child.geometry);
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(track);
        else track(child.material);
      }
    });
    return root;
  }

  function dispose() {
    mixers.forEach((mixer) => {
      mixer.stopAllAction();
      mixer.uncacheRoot(mixer.getRoot());
    });
    mixers.clear();

    materials.forEach((mat) => {
      try {
        mat.dispose();
      } catch {
        // Safe disposal fallback
      }
    });
    materials.clear();

    textures.forEach((tex) => {
      try {
        tex.dispose();
      } catch {
        // Safe disposal fallback
      }
    });
    textures.clear();

    geometries.forEach((geom) => {
      try {
        geom.dispose();
      } catch {
        // Safe disposal fallback
      }
    });
    geometries.clear();
  }

  return {
    track,
    trackMixer,
    trackObject,
    dispose,
    counts: () => ({
      geometries: geometries.size,
      textures: textures.size,
      materials: materials.size,
      mixers: mixers.size,
    }),
  };
}

import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Skeleton-aware clone so that animated actors share heavy geometries and textures
// while getting their own bone hierarchy and animation mixer.
export function cloneSkinnedMesh(source) {
  return skeletonClone(source);
}
