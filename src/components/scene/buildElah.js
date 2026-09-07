// Procedural builder and graybox staging for the Valley of Elah (/scene/valley-of-elah).
//
// Re-creates the confrontation between David and Goliath (1 Samuel 17).
// Coordinates match elahScene.js and elahTerrain.js (meters, Y up):
//   -Z  Northwest down the valley
//   +Z  Southeast up the valley
//   -X  Southwest toward Philistine camp at Ephes-dammim
//   +X  Northeast toward Israelite camp

import { applyLighting, resolveTimeOfDay } from './sceneLighting';
import {
  terrainHeight,
  createTerrainMesh,
  createBrookMesh,
  createStones,
} from './elahTerrain';

// Procedural graybox builder for principals and armies
function createMaterialHelper(THREE, materials) {
  return (color, options = {}) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...options });
    materials.add(mat);
    return mat;
  };
}

// Builds a stylized anatomical graybox humanoid proxy with proper proportions and limb joints
function buildProxyFigure(THREE, {
  height = 1.75,
  skinColor = 0xc49b78,
  tunicColor = 0xd5cca8,
  armorColor = null,
  helmetColor = null,
  geometries,
  materials,
}) {
  const group = new THREE.Group();
  const std = createMaterialHelper(THREE, materials);

  const skinMat = std(skinColor, { roughness: 0.75 });
  const tunicMat = std(tunicColor, { roughness: 0.88 });
  const armorMat = armorColor ? std(armorColor, { metalness: 0.58, roughness: 0.38 }) : null;
  const helmetMat = helmetColor ? std(helmetColor, { metalness: 0.65, roughness: 0.32 }) : null;
  const hairMat = std(0x2a2118, { roughness: 0.95 });
  const leatherMat = std(0x4a3424, { roughness: 0.7 });

  const s = height / 1.75; // Scale relative to 1.75m standard human

  // Torso / Tunic
  const torsoH = 0.52 * s;
  const torsoW = 0.32 * s;
  const torsoD = 0.22 * s;
  const torsoGeom = new THREE.BoxGeometry(torsoW, torsoH, torsoD);
  geometries.add(torsoGeom);
  const torso = new THREE.Mesh(torsoGeom, armorMat || tunicMat);
  torso.position.y = 0.98 * s;
  torso.castShadow = true;
  group.add(torso);

  // Belt
  const beltGeom = new THREE.BoxGeometry(torsoW * 1.04, 0.08 * s, torsoD * 1.04);
  geometries.add(beltGeom);
  const belt = new THREE.Mesh(beltGeom, leatherMat);
  belt.position.y = 0.74 * s;
  group.add(belt);

  // Tunic Skirt
  const skirtGeom = new THREE.CylinderGeometry(torsoW * 0.55, torsoW * 0.65, 0.35 * s, 8);
  geometries.add(skirtGeom);
  const skirt = new THREE.Mesh(skirtGeom, tunicMat);
  skirt.position.y = 0.56 * s;
  skirt.castShadow = true;
  group.add(skirt);

  // Neck and Head
  const headSize = 0.12 * s;
  const headGeom = new THREE.SphereGeometry(headSize, 12, 10);
  geometries.add(headGeom);
  const head = new THREE.Mesh(headGeom, skinMat);
  head.position.y = 1.38 * s;
  head.scale.set(0.9, 1.15, 0.95);
  head.castShadow = true;
  group.add(head);

  // Hair or Helmet
  if (helmetMat) {
    const helmetGeom = new THREE.CylinderGeometry(0.12 * s, 0.14 * s, 0.16 * s, 10);
    geometries.add(helmetGeom);
    const helmet = new THREE.Mesh(helmetGeom, helmetMat);
    helmet.position.y = 1.45 * s;
    helmet.castShadow = true;
    group.add(helmet);
  } else {
    const hairGeom = new THREE.SphereGeometry(headSize * 1.04, 8, 8);
    geometries.add(hairGeom);
    const hair = new THREE.Mesh(hairGeom, hairMat);
    hair.position.set(0, 1.41 * s, -0.02 * s);
    hair.scale.set(0.95, 0.9, 1.0);
    group.add(hair);
  }

  // Legs & Feet
  const legR = 0.055 * s;
  const legH = 0.65 * s;
  const legGeom = new THREE.CylinderGeometry(legR, legR * 0.85, legH, 6);
  geometries.add(legGeom);

  // Left Leg
  const leftLeg = new THREE.Mesh(legGeom, skinMat);
  leftLeg.position.set(-0.1 * s, 0.35 * s, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  // Right Leg
  const rightLeg = new THREE.Mesh(legGeom, skinMat);
  rightLeg.position.set(0.1 * s, 0.35 * s, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  // Greaves if armored
  if (armorMat) {
    const greaveGeom = new THREE.CylinderGeometry(legR * 1.15, legR * 0.95, legH * 0.6, 6);
    geometries.add(greaveGeom);
    const leftGreave = new THREE.Mesh(greaveGeom, armorMat);
    leftGreave.position.set(-0.1 * s, 0.28 * s, 0);
    group.add(leftGreave);

    const rightGreave = new THREE.Mesh(greaveGeom, armorMat);
    rightGreave.position.set(0.1 * s, 0.28 * s, 0);
    group.add(rightGreave);
  }

  // Arms
  const armR = 0.045 * s;
  const armH = 0.55 * s;
  const armGeom = new THREE.CylinderGeometry(armR, armR * 0.8, armH, 6);
  geometries.add(armGeom);

  const leftArm = new THREE.Mesh(armGeom, skinMat);
  leftArm.position.set(-0.21 * s, 0.95 * s, 0);
  leftArm.rotation.z = 0.12;
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeom, skinMat);
  rightArm.position.set(0.21 * s, 0.95 * s, 0);
  rightArm.rotation.z = -0.12;
  rightArm.castShadow = true;
  group.add(rightArm);

  return { group, torso, head, leftArm, rightArm, s };
}

// Principal figure: David
function createDavidProxy(THREE, { geometries, materials }) {
  const fig = buildProxyFigure(THREE, {
    height: 1.65, // ~1.65 m target
    skinColor: 0xc49b78,
    tunicColor: 0xd9cca9, // Undyed rough wool/linen
    geometries,
    materials,
  });

  const std = createMaterialHelper(THREE, materials);
  const leatherMat = std(0x4b3524, { roughness: 0.7 });
  const woodMat = std(0x5c3e26, { roughness: 0.85 });

  // Cross-body shepherd's bag
  const bagGeom = new THREE.BoxGeometry(0.16, 0.18, 0.09);
  geometries.add(bagGeom);
  const bag = new THREE.Mesh(bagGeom, leatherMat);
  bag.position.set(-0.16, 0.78, 0.06);
  bag.rotation.z = -0.2;
  fig.group.add(bag);

  // Shepherd's staff
  const staffGeom = new THREE.CylinderGeometry(0.016, 0.014, 1.75, 6);
  geometries.add(staffGeom);
  const staff = new THREE.Mesh(staffGeom, woodMat);
  staff.position.set(-0.25, 0.86, 0.12);
  staff.rotation.z = 0.15;
  staff.castShadow = true;
  fig.group.add(staff);

  // Woven sling in right hand
  const slingGeom = new THREE.CylinderGeometry(0.008, 0.008, 0.75, 4);
  geometries.add(slingGeom);
  const slingMat = std(0x73614d, { roughness: 0.9 });
  const sling = new THREE.Mesh(slingGeom, slingMat);
  sling.position.set(0.22, 0.55, 0.08);
  sling.rotation.z = -0.1;
  fig.group.add(sling);

  fig.group.name = 'principal-david';
  return fig.group;
}

// Principal figure: Goliath
function createGoliathProxy(THREE, { geometries, materials }) {
  const fig = buildProxyFigure(THREE, {
    height: 2.9, // ~2.9 m art target (six cubits and a span)
    skinColor: 0xa87e5b,
    tunicColor: 0x3d352e,
    armorColor: 0xa87e38, // Bronze scale cuirass
    helmetColor: 0xb58c42, // Bronze helmet
    geometries,
    materials,
  });

  const std = createMaterialHelper(THREE, materials);
  const ironMat = std(0x585d63, { metalness: 0.75, roughness: 0.35 });
  const woodMat = std(0x3e2b1d, { roughness: 0.82 });

  // Massive spear with iron spearhead (weaver's beam)
  const spearShaftGeom = new THREE.CylinderGeometry(0.042, 0.038, 3.6, 8);
  geometries.add(spearShaftGeom);
  const spearShaft = new THREE.Mesh(spearShaftGeom, woodMat);
  spearShaft.position.set(0.5, 1.8, 0.15);
  spearShaft.castShadow = true;

  const spearHeadGeom = new THREE.ConeGeometry(0.09, 0.45, 6);
  geometries.add(spearHeadGeom);
  const spearHead = new THREE.Mesh(spearHeadGeom, ironMat);
  spearHead.position.set(0.5, 3.75, 0.15);
  spearHead.castShadow = true;

  fig.group.add(spearShaft);
  fig.group.add(spearHead);

  // Sheathed sword at waist
  const scabbardGeom = new THREE.BoxGeometry(0.09, 1.1, 0.05);
  geometries.add(scabbardGeom);
  const scabbard = new THREE.Mesh(scabbardGeom, ironMat);
  scabbard.position.set(-0.35, 1.3, 0);
  scabbard.rotation.z = -0.3;
  fig.group.add(scabbard);

  fig.group.name = 'principal-goliath';
  return fig.group;
}

// Principal figure: Shield-bearer
function createShieldBearerProxy(THREE, { geometries, materials }) {
  const fig = buildProxyFigure(THREE, {
    height: 1.75,
    skinColor: 0xb38662,
    tunicColor: 0x4a4338,
    armorColor: 0x8a6e3c,
    helmetColor: 0x9e7c3e,
    geometries,
    materials,
  });

  const std = createMaterialHelper(THREE, materials);
  const shieldMat = std(0x69543b, { roughness: 0.7 });
  const rimMat = std(0x9e7c3e, { metalness: 0.6, roughness: 0.4 });

  // Body-length tower shield held in front
  const shieldGeom = new THREE.BoxGeometry(0.85, 1.55, 0.06);
  geometries.add(shieldGeom);
  const shield = new THREE.Mesh(shieldGeom, shieldMat);
  shield.position.set(0, 0.85, 0.35);
  shield.castShadow = true;

  const rimGeom = new THREE.BoxGeometry(0.88, 1.58, 0.04);
  geometries.add(rimGeom);
  const rim = new THREE.Mesh(rimGeom, rimMat);
  rim.position.set(0, 0.85, 0.33);

  fig.group.add(shield);
  fig.group.add(rim);

  fig.group.name = 'principal-shield-bearer';
  return fig.group;
}

// Army ranks deployed along the opposing ridge slopes
function createArmyRanks(THREE, { quality = 'high', faction = 'philistine', geometries, materials }) {
  const group = new THREE.Group();
  group.name = `army-${faction}`;
  const isLow = quality === 'low';
  const isHigh = quality === 'high';

  const count = isLow ? 45 : isHigh ? 160 : 95;

  const bodyGeom = new THREE.CylinderGeometry(0.18, 0.14, 1.65, 5);
  geometries.add(bodyGeom);

  const spearGeom = new THREE.CylinderGeometry(0.015, 0.015, 2.8, 4);
  geometries.add(spearGeom);

  const isPhilistine = faction === 'philistine';
  // Philistine palette: bronze helmet tone, leather, reddish brown
  const bodyMat = new THREE.MeshStandardMaterial({
    color: isPhilistine ? 0x7a5234 : 0x5a6368,
    roughness: 0.85,
  });
  materials.add(bodyMat);

  const spearMat = new THREE.MeshStandardMaterial({
    color: isPhilistine ? 0xa87e38 : 0x4a3b2b,
    metalness: isPhilistine ? 0.45 : 0.1,
    roughness: 0.6,
  });
  materials.add(spearMat);

  const bodyMesh = new THREE.InstancedMesh(bodyGeom, bodyMat, count);
  const spearMesh = new THREE.InstancedMesh(spearGeom, spearMat, count);

  bodyMesh.castShadow = isHigh;
  bodyMesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const spearDummy = new THREE.Object3D();

  // Army deployment coordinates:
  // Philistine on left hill (-X between -45 and -85, Z between -65 and +40)
  // Israelite on right hill (+X between +45 and +85, Z between -45 and +60)
  const xBase = isPhilistine ? -48 : 48;
  const xSpan = isPhilistine ? -35 : 35;

  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / 18);
    const col = i % 18;

    const x = xBase + (xSpan * (row + 0.3 * (col % 3))) / (count / 18);
    const z = -45 + col * 5.2 + (row % 2) * 2.1;
    const y = terrainHeight(x, z);

    dummy.position.set(x, y + 0.82, z);
    // Faces down into the valley toward the confrontation corridor
    dummy.rotation.y = isPhilistine ? Math.PI * 0.45 : -Math.PI * 0.45;
    dummy.updateMatrix();
    bodyMesh.setMatrixAt(i, dummy.matrix);

    // Upright spear held beside soldier
    spearDummy.position.set(x + (isPhilistine ? 0.22 : -0.22), y + 1.4, z + 0.1);
    spearDummy.rotation.set(0.08, 0, (isPhilistine ? 0.05 : -0.05));
    spearDummy.updateMatrix();
    spearMesh.setMatrixAt(i, spearDummy.matrix);
  }

  bodyMesh.instanceMatrix.needsUpdate = true;
  spearMesh.instanceMatrix.needsUpdate = true;

  group.add(bodyMesh);
  group.add(spearMesh);

  // Add army banners along the crest
  const bannerMat = new THREE.MeshStandardMaterial({
    color: isPhilistine ? 0x942d22 : 0x2e4b78,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  materials.add(bannerMat);

  const bannerGeom = new THREE.PlaneGeometry(0.8, 2.2);
  geometries.add(bannerGeom);

  const numBanners = isLow ? 3 : 8;
  for (let b = 0; b < numBanners; b += 1) {
    const bx = xBase + (xSpan * 0.8);
    const bz = -35 + b * 11;
    const by = terrainHeight(bx, bz);
    const banner = new THREE.Mesh(bannerGeom, bannerMat);
    banner.position.set(bx, by + 2.4, bz);
    banner.rotation.y = isPhilistine ? Math.PI * 0.5 : -Math.PI * 0.5;
    banner.name = `${faction}-banner-${b + 1}`;
    group.add(banner);
  }

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

  // 6. Principal Figures staged according to brief coordinates
  // David: Foreground right at (3, terrainHeight(3, 3), 3)
  const david = createDavidProxy(THREE, { geometries, materials });
  const davidY = terrainHeight(3, 3);
  david.position.set(3, davidY, 3);
  // David faces toward Goliath (-4, -6)
  const angleToGoliath = Math.atan2(-4 - 3, -6 - 3);
  david.rotation.y = angleToGoliath;
  root.add(david);

  // Goliath: Midground left at (-4, terrainHeight(-4, -6), -6)
  const goliath = createGoliathProxy(THREE, { geometries, materials });
  const goliathY = terrainHeight(-4, -6);
  goliath.position.set(-4, goliathY, -6);
  // Goliath faces toward David (3, 3)
  const angleToDavid = Math.atan2(3 - (-4), 3 - (-6));
  goliath.rotation.y = angleToDavid;
  root.add(goliath);

  // Shield-Bearer: Forward and outside Goliath's silhouette at (-2.6, terrainHeight(-2.6, -4.5), -4.5)
  const shieldBearer = createShieldBearerProxy(THREE, { geometries, materials });
  const shieldY = terrainHeight(-2.6, -4.5);
  shieldBearer.position.set(-2.6, shieldY, -4.5);
  shieldBearer.rotation.y = angleToDavid;
  root.add(shieldBearer);

  // 7. Armies on opposing slopes
  const philistines = createArmyRanks(THREE, { quality, faction: 'philistine', geometries, materials });
  root.add(philistines);

  const israelites = createArmyRanks(THREE, { quality, faction: 'israelite', geometries, materials });
  root.add(israelites);

  // Occluders for hotspot occlusion testing
  const occluders = [terrainMesh];

  // 8. Animation update loop
  function update(elapsed) {
    if (reducedMotion) return;

    // Subtle gentle water shimmer
    if (brookMesh && brookMesh.material) {
      brookMesh.position.y = Math.sin(elapsed * 1.5) * 0.008;
    }

    // Subtle breathing posture sway on David and Goliath
    if (david) {
      david.position.y = davidY + Math.sin(elapsed * 1.8) * 0.005;
    }
    if (goliath) {
      goliath.position.y = goliathY + Math.sin(elapsed * 1.4 + 0.5) * 0.006;
    }
  }

  update(0);

  // 9. Resource disposal
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;

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
    fog: timeData.fog,
    exposure: timeData.exposure,
    occluders,
    applyAssets: () => {
      // Prepared for Milestones 2-3 when runtime GLBs arrive
    },
    applyQuality: (profile) => {
      // Adjusts shadow maps or detail tier
      if (sun && sun.shadow && sun.shadow.mapSize) {
        sun.shadow.mapSize.set(profile.shadowMapSize || 512, profile.shadowMapSize || 512);
      }
    },
  };
}
