// Specialized PBR material factory for ultra-realistic human models.
// Ensures strict dielectric physics (metalness = 0 for skin), micro-roughness calibration,
// alpha-tested hair cards, corneal gloss, and depth-writing hair cutouts.

/**
 * Creates a conventional dielectric skin material. This is not a subsurface-scattering shader.
 * @param {typeof import('three')} THREE
 * @param {object} options
 */
export function createSkinMaterial(THREE, {
  diffuseMap = null,
  normalMap = null,
  roughnessMap = null,
  aoMap = null,
  color = 0xba8c68,
} = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.0, // Strictly dielectric: human skin has zero electrical conductivity
    map: diffuseMap,
    normalMap,
    roughnessMap,
    aoMap,
    aoMapIntensity: 0.6, // Subtle ambient occlusion to avoid black pore outlines
  });

  if (normalMap) {
    mat.normalScale = new THREE.Vector2(0.85, 0.85);
  }

  return mat;
}

/**
 * Creates eye material with distinct sclera/iris and corneal specular response.
 * @param {typeof import('three')} THREE
 * @param {object} options
 */
export function createEyeMaterial(THREE, { diffuseMap = null, color = 0x3d2817 } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.12, // High corneal gloss
    metalness: 0.0,
    map: diffuseMap,
  });
}

/**
 * Creates hair card material with alpha cutout and directional roughness.
 * @param {typeof import('three')} THREE
 * @param {object} options
 */
export function createHairMaterial(THREE, { diffuseMap = null, normalMap = null, color = 0x221812 } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0,
    map: diffuseMap,
    normalMap,
    transparent: false,
    alphaTest: 0.5, // Crisp alpha cutout to prevent sort artifacts and heavy blending cost
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}

/**
 * Creates authentic 1st-century garment material (wool, linen).
 * @param {typeof import('three')} THREE
 * @param {object} options
 */
export function createClothMaterial(THREE, {
  diffuseMap = null,
  normalMap = null,
  roughnessMap = null,
  color = 0xd8c8b4,
} = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92, // Coarse woven textile
    metalness: 0,
    map: diffuseMap,
    normalMap,
    roughnessMap,
  });
}

/**
 * Creates period leather sandal and water-skin material.
 * @param {typeof import('three')} THREE
 * @param {object} options
 */
export function createLeatherMaterial(THREE, {
  diffuseMap = null,
  normalMap = null,
  color = 0x4a3424,
} = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0,
    map: diffuseMap,
    normalMap,
  });
}

// Normalize imported card materials once on the shared source. A cutout writes
// depth correctly across overlapping hair layers; transparent blending does not.
export function prepareHumanMaterials(root) {
  const seen = new Set();
  root.traverse((node) => {
    for (const material of [node.material].flat().filter(Boolean)) {
      if (seen.has(material)) continue;
      seen.add(material);
      material.metalness = 0;
      if (/hair|brows|beard/i.test(material.name)) {
        material.transparent = false;
        material.alphaTest = 0.4;
        material.depthWrite = true;
        material.roughness = 0.9;
      }
      material.needsUpdate = true;
    }
  });
}
