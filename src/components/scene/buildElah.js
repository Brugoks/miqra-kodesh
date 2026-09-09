// Terrain builder and asset-backed character staging for the Valley of Elah (/scene/valley-of-elah).
//
// Re-creates the confrontation between David and Goliath (1 Samuel 17).
// Coordinates match elahScene.js and elahTerrain.js (meters, Y up):
//   -Z  Northwest down the valley
//   +Z  Southeast up the valley
//   -X  Southwest toward Philistine camp at Ephes-dammim
//   +X  Northeast toward Israelite camp

import { createElahPrincipals } from './elahPrincipals.js';
import { applyLighting, resolveTimeOfDay } from './sceneLighting';
import {
  terrainHeight,
  createTerrainMesh,
  createBrookMesh,
  createStones,
} from './elahTerrain';

// Army ranks deployed along the opposing ridge slopes
function createArmyRanks(THREE, { quality = 'high', faction = 'philistine', geometries, materials }) {
  const group = new THREE.Group();
  group.name = `army-${faction}`;
  const isLow = quality === 'low';
  const isHigh = quality === 'high';

  const count = isLow ? 45 : isHigh ? 160 : 95;
  const isPhilistine = faction === 'philistine';

  // 1. Soldier Body
  const bodyGeom = new THREE.CylinderGeometry(0.18, 0.14, 1.65, 5);
  geometries.add(bodyGeom);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: isPhilistine ? 0x73553a : 0x5e6366,
    roughness: isPhilistine ? 0.72 : 0.88,
    metalness: isPhilistine ? 0.25 : 0.02,
  });
  materials.add(bodyMat);

  const bodyMesh = new THREE.InstancedMesh(bodyGeom, bodyMat, count);
  bodyMesh.castShadow = isHigh;
  bodyMesh.receiveShadow = true;

  // 2. Head / Helmet
  const headGeom = new THREE.SphereGeometry(0.125, 7, 5);
  geometries.add(headGeom);

  const headMat = new THREE.MeshStandardMaterial({
    color: isPhilistine ? 0x9b723d : 0xd8cebd,
    metalness: isPhilistine ? 0.75 : 0.04,
    roughness: isPhilistine ? 0.42 : 0.9,
  });
  materials.add(headMat);

  const headMesh = new THREE.InstancedMesh(headGeom, headMat, count);
  headMesh.castShadow = isHigh;

  // 3. Shield
  const shieldGeom = isPhilistine
    ? new THREE.CylinderGeometry(0.32, 0.32, 0.03, 10)
    : new THREE.BoxGeometry(0.36, 0.56, 0.03);
  geometries.add(shieldGeom);

  const shieldMat = new THREE.MeshStandardMaterial({
    color: isPhilistine ? 0x7f5f37 : 0x483726,
    metalness: isPhilistine ? 0.55 : 0.05,
    roughness: isPhilistine ? 0.48 : 0.85,
  });
  materials.add(shieldMat);

  const shieldMesh = new THREE.InstancedMesh(shieldGeom, shieldMat, count);
  shieldMesh.castShadow = isHigh;

  // 4. Spear
  const spearGeom = new THREE.CylinderGeometry(0.015, 0.015, 2.8, 4);
  geometries.add(spearGeom);

  const spearMat = new THREE.MeshStandardMaterial({
    color: isPhilistine ? 0xa87e38 : 0x4a3b2b,
    metalness: isPhilistine ? 0.45 : 0.1,
    roughness: 0.6,
  });
  materials.add(spearMat);

  const spearMesh = new THREE.InstancedMesh(spearGeom, spearMat, count);

  const dummy = new THREE.Object3D();
  const headDummy = new THREE.Object3D();
  const shieldDummy = new THREE.Object3D();
  const spearDummy = new THREE.Object3D();

  // Army deployment coordinates:
  // Philistine on left hill (-X between -45 and -85, Z between -65 and +40)
  // Israelite on right hill (+X between +45 and +85, Z between -45 and +60)
  const xBase = isPhilistine ? -48 : 48;
  const xSpan = isPhilistine ? -35 : 35;
  const facingY = isPhilistine ? Math.PI * 0.45 : -Math.PI * 0.45;

  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / 18);
    const col = i % 18;

    const x = xBase + (xSpan * (row + 0.3 * (col % 3))) / (count / 18);
    const z = -45 + col * 5.2 + (row % 2) * 2.1;
    const y = terrainHeight(x, z);

    // Body
    dummy.position.set(x, y + 0.82, z);
    dummy.rotation.y = facingY + ((i % 5) - 2) * 0.04;
    dummy.updateMatrix();
    bodyMesh.setMatrixAt(i, dummy.matrix);

    // Head / Helmet
    headDummy.position.set(x, y + 1.68, z);
    headDummy.rotation.y = dummy.rotation.y;
    headDummy.updateMatrix();
    headMesh.setMatrixAt(i, headDummy.matrix);

    // Shield held on left arm
    const shieldOffset = isPhilistine ? 0.28 : -0.28;
    shieldDummy.position.set(x + shieldOffset, y + 1.05, z + 0.15);
    shieldDummy.rotation.set(0, dummy.rotation.y + (isPhilistine ? -0.2 : 0.2), isPhilistine ? Math.PI / 2 : 0);
    shieldDummy.updateMatrix();
    shieldMesh.setMatrixAt(i, shieldDummy.matrix);

    // Upright spear held on right side
    const spearOffset = isPhilistine ? -0.25 : 0.25;
    spearDummy.position.set(x + spearOffset, y + 1.4, z + 0.1);
    spearDummy.rotation.set(0.08, 0, (isPhilistine ? 0.05 : -0.05) + ((i % 3) - 1) * 0.02);
    spearDummy.updateMatrix();
    spearMesh.setMatrixAt(i, spearDummy.matrix);
  }

  bodyMesh.instanceMatrix.needsUpdate = true;
  headMesh.instanceMatrix.needsUpdate = true;
  shieldMesh.instanceMatrix.needsUpdate = true;
  spearMesh.instanceMatrix.needsUpdate = true;

  group.add(bodyMesh);
  group.add(headMesh);
  group.add(shieldMesh);
  group.add(spearMesh);

  // 5. Military Encampment Wedge Tents along the crest
  const tentCount = isLow ? 6 : isHigh ? 18 : 12;
  const tentGeom = new THREE.CylinderGeometry(0.02, 1.4, 2.6, 3);
  geometries.add(tentGeom);

  const tentMat = new THREE.MeshStandardMaterial({
    color: isPhilistine ? 0xb5a78c : 0xc7bea9,
    roughness: 0.94,
  });
  materials.add(tentMat);

  const tentMesh = new THREE.InstancedMesh(tentGeom, tentMat, tentCount);
  tentMesh.receiveShadow = true;
  const tentDummy = new THREE.Object3D();

  for (let t = 0; t < tentCount; t += 1) {
    const tx = xBase + (xSpan * (0.92 + (t % 2) * 0.1));
    const tz = -40 + t * 6.5;
    const ty = terrainHeight(tx, tz);

    tentDummy.position.set(tx, ty + 0.7, tz);
    tentDummy.rotation.set(Math.PI / 2, 0, isPhilistine ? Math.PI * 0.45 : -Math.PI * 0.45);
    tentDummy.updateMatrix();
    tentMesh.setMatrixAt(t, tentDummy.matrix);
  }
  tentMesh.instanceMatrix.needsUpdate = true;
  group.add(tentMesh);

  // 6. Army banners along the crest
  const bannerMat = new THREE.MeshStandardMaterial({
    color: isPhilistine ? 0x942d22 : 0x2e4b78,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  materials.add(bannerMat);

  const bannerGeom = new THREE.PlaneGeometry(0.8, 2.2);
  geometries.add(bannerGeom);

  const banners = [];
  const numBanners = isLow ? 3 : 8;
  for (let b = 0; b < numBanners; b += 1) {
    const bx = xBase + (xSpan * 0.78);
    const bz = -35 + b * 11;
    const by = terrainHeight(bx, bz);
    const banner = new THREE.Mesh(bannerGeom, bannerMat);
    banner.position.set(bx, by + 2.4, bz);
    banner.rotation.y = isPhilistine ? Math.PI * 0.5 : -Math.PI * 0.5;
    banner.name = `${faction}-banner-${b + 1}`;
    group.add(banner);
    banners.push({
      mesh: banner,
      baseRotZ: banner.rotation.z,
      phase: b * 0.85 + (isPhilistine ? 0 : 1.2),
    });
  }

  group.userData.banners = banners;
  return group;
}

// Sparse vegetation: Terebinth / acacia trees on outer slopes
function createVegetation(THREE, { quality = 'high', geometries, materials }) {
  const group = new THREE.Group();
  group.name = 'elah-vegetation';

  if (quality === 'low') return group;

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2b, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a5438, roughness: 0.85 });
  materials.add(trunkMat);
  materials.add(leafMat);

  const trunkGeom = new THREE.CylinderGeometry(0.2, 0.35, 3.2, 6);
  const foliageGeom = new THREE.DodecahedronGeometry(1.6, 1);
  geometries.add(trunkGeom);
  geometries.add(foliageGeom);

  // Pre-determined positions outside the duel corridor (keep valley center clear)
  const treePositions = [
    [-28, 45],
    [-34, -55],
    [26, -42],
    [32, 50],
    [-18, 75],
    [22, 70],
    [-42, 10],
    [38, -15],
  ];

  treePositions.forEach(([tx, tz], i) => {
    const ty = terrainHeight(tx, tz);
    const treeGroup = new THREE.Group();
    treeGroup.position.set(tx, ty, tz);

    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 1.6;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const foliage = new THREE.Mesh(foliageGeom, leafMat);
    foliage.position.y = 3.6;
    foliage.scale.set(1.1, 0.85, 1.2);
    foliage.castShadow = true;
    treeGroup.add(foliage);

    treeGroup.name = `tree-${i + 1}`;
    group.add(treeGroup);
  });

  return group;
}

export default function buildElah(THREE, options = {}) {
  const {
    quality = 'high',
    reducedMotion = false,
    timeOfDay = 'morning',
  } = options;

  const root = new THREE.Group();
  root.name = 'valley-of-elah';

  const materials = new Set();
  const geometries = new Set();

  // 1. Shared Lighting (warm low sun, cool fill sky)
  const lighting = applyLighting(THREE, root, {
    sceneSlug: 'valley-of-elah',
    timeOfDay,
    quality,
  });
  const sun = lighting.sun;

  // 2. Terrain mesh with Shephelah landscape shaders/coloring
  const terrainMesh = createTerrainMesh(THREE, { quality, materials, geometries });
  root.add(terrainMesh);

  // 3. Meandering shallow brook (Wadi es-Sant)
  const brookMesh = createBrookMesh(THREE, { quality, materials, geometries });
  root.add(brookMesh);

  // 4. Rounded limestone gravel, boulders, and David's five smooth stones
  const stones = createStones(THREE, { quality, count: 140, materials, geometries });
  root.add(stones);

  // 5. Sparse vegetation outside duel corridor
  const vegetation = createVegetation(THREE, { quality, geometries, materials });
  root.add(vegetation);

  // Dedicated textured, skinned assets are supplied by the scene asset session.
  const principals = createElahPrincipals(THREE, root, { quality, reducedMotion, sun });

  // 7. Armies on opposing slopes
  const philistines = createArmyRanks(THREE, { quality, faction: 'philistine', geometries, materials });
  root.add(philistines);

  const israelites = createArmyRanks(THREE, { quality, faction: 'israelite', geometries, materials });
  root.add(israelites);

  // Occluders for hotspot occlusion testing
  const occluders = [terrainMesh];

  // Banners for dynamic ridge wind sway
  const banners = [
    ...(philistines.userData.banners || []),
    ...(israelites.userData.banners || []),
  ];

  // 8. Animation update loop
  function update(elapsed) {
    if (reducedMotion) return;

    // Subtle gentle water shimmer
    if (brookMesh && brookMesh.material) {
      brookMesh.position.y = Math.sin(elapsed * 1.5) * 0.008;
    }

    // Dynamic ridge banners fluttering in the wind
    for (let i = 0; i < banners.length; i += 1) {
      const b = banners[i];
      b.mesh.rotation.z = b.baseRotZ + Math.sin(elapsed * 2.2 + b.phase) * 0.08;
    }

    principals.update(elapsed);
  }

  update(0);

  // 9. Resource disposal
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;

    principals.dispose();
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());

    if (sun && sun.shadow && sun.shadow.map) {
      sun.shadow.map.dispose();
    }
    if (lighting && lighting.sky) {
      lighting.sky.geometry.dispose();
      lighting.skyMaterial.dispose();
    }
  }

  const timeData = resolveTimeOfDay(timeOfDay);

  return {
    root,
    sun,
    lighting,
    update,
    dispose,
    principals,
    fog: timeData.fog,
    exposure: timeData.exposure,
    occluders,
    applyAssets: principals.acceptAssets,
    applyQuality: (profile) => {
      principals.setQuality(profile);
      // Adjusts shadow maps or detail tier
      if (sun && sun.shadow && sun.shadow.mapSize) {
        sun.shadow.mapSize.set(profile.shadowMapSize || 512, profile.shadowMapSize || 512);
      }
    },
  };
}
