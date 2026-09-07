// PBR Material factory and UV scaling manager for biblical scenes.
// Configures correct color spaces (sRGB for albedo, Linear for normal/data maps)
// and handles consistent metric texture tiling.

import * as THREE from 'three';

const sRgbColorSpace = THREE.SRGBColorSpace || 'srgb';

export function configureTexture(texture, isColor = false) {
  if (!texture) return texture;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = isColor ? sRgbColorSpace : THREE.NoColorSpace;
  texture.generateMipmaps = true;
  return texture;
}

export function createPbrMaterial(THREEInstance, matDef, textures = {}) {
  const { scale = [1, 1], roughness = 0.85, metalness = 0.05 } = matDef;

  const mat = new THREEInstance.MeshStandardMaterial({
    roughness,
    metalness,
  });

  if (textures.diffuse) {
    mat.map = configureTexture(textures.diffuse, true);
    mat.map.repeat.set(1 / scale[0], 1 / scale[1]);
  }
  if (textures.normal) {
    mat.normalMap = configureTexture(textures.normal, false);
    mat.normalScale = new THREEInstance.Vector2(1.0, 1.0);
    mat.normalMap.repeat.set(1 / scale[0], 1 / scale[1]);
  }
  if (textures.roughness) {
    mat.roughnessMap = configureTexture(textures.roughness, false);
    mat.roughnessMap.repeat.set(1 / scale[0], 1 / scale[1]);
  }
  if (textures.ao) {
    mat.aoMap = configureTexture(textures.ao, false);
    mat.aoMapIntensity = 0.9;
    mat.aoMap.repeat.set(1 / scale[0], 1 / scale[1]);
  }

  mat.needsUpdate = true;
  return mat;
}

// Adjusts material repeat to match a specific wall/surface geometry dimensions in meters
export function applyMetricRepeat(material, widthInMeters, heightInMeters, baseScale = [2.0, 2.0]) {
  const repeatX = widthInMeters / baseScale[0];
  const repeatY = heightInMeters / baseScale[1];

  ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach((key) => {
    if (material[key]) {
      material[key].repeat.set(repeatX, repeatY);
      material[key].needsUpdate = true;
    }
  });
}
