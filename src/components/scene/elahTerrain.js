import { ELAH_CAST } from './elahDimensions.js';
// Terrain and environment generation for the Valley of Elah (/scene/valley-of-elah).
//
// World axes (meters, Y up):
//   -Z  Northwest, down the valley toward the coastal plain
//   +Z  Southeast, up the valley toward the Judean hills
//   -X  Southwest, toward Socoh/Azekah and the Philistine hill
//   +X  Northeast, toward the Israelite hill

export const TERRAIN_BOUNDS = {
  xMin: -120,
  xMax: 120,
  zMin: -160,
  zMax: 160,
};

// Centerline of the meandering brook (Wadi es-Sant) as a function of Z
export function brookCenterline(z) {
  return 0.12 * z + Math.sin(z * 0.035) * 2.5;
}

// Shared analytical height function used by render geometry and collision navigation
export function terrainHeight(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;

  // Gentle regional gradient along the valley floor (falling toward -Z)
  const baseZ = -z * 0.015;

  // Brook channel depression (Wadi es-Sant)
  const bx = brookCenterline(z);
  const dx = x - bx;
  const channelWidth = 4.2;
  let streamDepression = 0;
  if (Math.abs(dx) < channelWidth) {
    const factor = Math.cos((dx / channelWidth) * (Math.PI / 2));
    streamDepression = 0.45 * Math.max(0, factor * factor);
  }

  // Southern / Philistine ridge on -X (climbing up to ~18-22m)
  let philistineSlope = 0;
  if (x < -12) {
    const d = -x - 12;
    const ridgeProfile = Math.pow(d * 0.16, 1.42) * 1.7;
    const crestVariation = Math.sin(z * 0.025 + 0.4) * 1.8 * Math.min(1, d * 0.04);
    philistineSlope = Math.min(22, ridgeProfile + crestVariation);
  }

  // Northern / Israelite ridge on +X (climbing up to ~20-25m)
  let israeliteSlope = 0;
  if (x > 12) {
    const d = x - 12;
    const ridgeProfile = Math.pow(d * 0.16, 1.42) * 1.8;
    const crestVariation = Math.cos(z * 0.022 - 0.2) * 2.0 * Math.min(1, d * 0.04);
    israeliteSlope = Math.min(25, ridgeProfile + crestVariation);
  }

  // Subtle natural undulating valley floor
  const undulation =
    Math.sin(x * 0.08 + z * 0.05) * 0.22 +
    Math.cos(x * 0.04 - z * 0.06) * 0.18 +
    Math.sin(x * 0.15) * 0.08;

  return baseZ + philistineSlope + israeliteSlope + undulation - streamDepression;
}

export function getTerrainInfo(x, z) {
  const y = terrainHeight(x, z);
  const eps = 0.5;
  const yX = terrainHeight(x + eps, z);
  const yZ = terrainHeight(x, z + eps);
  const slopeX = (yX - y) / eps;
  const slopeZ = (yZ - y) / eps;
  const bx = brookCenterline(z);
  const streamDist = Math.abs(x - bx);
  const inStream = streamDist < 4.2;
  const streamFactor = Math.max(0, 1 - streamDist / 4.2);

  return {
    y,
    slopeX,
    slopeZ,
    slope: Math.sqrt(slopeX * slopeX + slopeZ * slopeZ),
    inStream,
    streamDist,
    streamFactor,
  };
}

// Deterministic pseudo-random generator
function makeRandom(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Procedural ground terrain mesh with vertex-colored material zones
export function createTerrainMesh(THREE, { quality = 'high', materials, geometries }) {
  const isLow = quality === 'low';
  const isHigh = quality === 'high';

  // Subdivision resolution
  const segX = isHigh ? 160 : isLow ? 60 : 100;
  const segZ = isHigh ? 200 : isLow ? 80 : 140;

  const geom = new THREE.PlaneGeometry(
    TERRAIN_BOUNDS.xMax - TERRAIN_BOUNDS.xMin,
    TERRAIN_BOUNDS.zMax - TERRAIN_BOUNDS.zMin,
    segX,
    segZ
  );
  geometries.add(geom);

  // Rotate to lie on X-Z plane (originally on X-Y)
  geom.rotateX(-Math.PI / 2);

  const pos = geom.attributes.position;
  const count = pos.count;
  const colors = new Float32Array(count * 3);

  // Palette colors for Shephelah landscape
  // Arid sunlit earth (valley base): #c2ab87
  const colSoil = new THREE.Color(0xbda785);
  // Limestone rock outcrop on slopes: #d6ccbe
  const colRock = new THREE.Color(0xd2c6b4);
  // Streambed damp gravel / sediment: #8a7c6a
  const colBrook = new THREE.Color(0x827463);
  // Sparse dry shrub tone for patches: #9b9a7b
  const colScrub = new THREE.Color(0xa39d7c);

  const vertexCol = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const info = getTerrainInfo(x, z);
    pos.setY(i, info.y);

    // Blend vertex colors based on height, slope, and stream proximity
    if (info.streamFactor > 0) {
      vertexCol.copy(colSoil).lerp(colBrook, info.streamFactor * 0.85);
    } else {
      const slopeFactor = Math.min(1, Math.max(0, (info.slope - 0.15) * 2.5));
      vertexCol.copy(colSoil).lerp(colRock, slopeFactor * 0.7);

      // Subtle scrub vegetation noise on upper slopes
      const scrubNoise = Math.sin(x * 0.2) * Math.cos(z * 0.2);
      if (scrubNoise > 0.35 && info.y > 4) {
        vertexCol.lerp(colScrub, 0.4);
      }
    }

    colors[i * 3] = vertexCol.r;
    colors[i * 3 + 1] = vertexCol.g;
    colors[i * 3 + 2] = vertexCol.b;
  }

  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.05,
    flatShading: isLow,
  });
  materials.add(mat);

  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'elah-terrain';
  mesh.receiveShadow = true;

  return mesh;
}

// Shallow water ribbon representing the seasonal brook
export function createBrookMesh(THREE, { quality = 'high', materials, geometries }) {
  const isLow = quality === 'low';
  const zMin = TERRAIN_BOUNDS.zMin;
  const zMax = TERRAIN_BOUNDS.zMax;
  const steps = isLow ? 50 : 120;
  const width = 2.4;

  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array((steps + 1) * 2 * 3);
  const uvs = new Float32Array((steps + 1) * 2 * 2);
  const indices = [];

  let vIdx = 0;
  let uvIdx = 0;

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const z = zMin + t * (zMax - zMin);
    const cx = brookCenterline(z);
    // Water surface sits slightly below ground level but above the carved channel floor
    const channelY = terrainHeight(cx, z);
    const waterY = channelY + 0.16;

    // Left edge of water ribbon
    positions[vIdx * 3] = cx - width * 0.5;
    positions[vIdx * 3 + 1] = waterY;
    positions[vIdx * 3 + 2] = z;
    uvs[uvIdx * 2] = 0;
    uvs[uvIdx * 2 + 1] = t * 20;
    vIdx += 1;
    uvIdx += 1;

    // Right edge of water ribbon
    positions[vIdx * 3] = cx + width * 0.5;
    positions[vIdx * 3 + 1] = waterY;
    positions[vIdx * 3 + 2] = z;
    uvs[uvIdx * 2] = 1;
    uvs[uvIdx * 2 + 1] = t * 20;
    vIdx += 1;
    uvIdx += 1;

    if (i < steps) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geometries.add(geom);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x4f6c77,
    roughness: 0.18,
    metalness: 0.2,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  materials.add(mat);

  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'elah-brook-water';
  mesh.receiveShadow = true;

  return mesh;
}

// Stones along the streambed and foreground
export function createStones(THREE, { quality = 'high', count = 120, materials, geometries }) {
  const group = new THREE.Group();
  group.name = 'elah-stones';

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xcdc1ad,
    roughness: 0.82,
    metalness: 0.05,
  });
  materials.add(stoneMat);

  const smoothStoneMat = new THREE.MeshStandardMaterial({
    color: 0xa89f8d,
    roughness: 0.45,
    metalness: 0.1,
  });
  materials.add(smoothStoneMat);

  const rand = makeRandom(1337);
  const numStones = quality === 'low' ? Math.floor(count * 0.35) : count;

  // Instanced mesh for rounded limestone river pebbles along the brook
  const stoneGeom = new THREE.DodecahedronGeometry(1, 1);
  geometries.add(stoneGeom);

  const instancedStones = new THREE.InstancedMesh(stoneGeom, stoneMat, numStones);
  instancedStones.castShadow = quality !== 'low';
  instancedStones.receiveShadow = true;

  const dummy = new THREE.Object3D();

  for (let i = 0; i < numStones; i += 1) {
    // Concentrate stones around the brook corridor (z from -40 to 30)
    let x; let z;
    for (let attempt = 0; attempt < 30; attempt++) {
      z = -40 + rand() * 70;
      x = brookCenterline(z) + (rand() - 0.5) * 6.5;
      if (ELAH_CAST.every((actor) => Math.hypot(x - actor.x, z - actor.z) > 1.5)) break;
    }
    const y = terrainHeight(x, z);

    // Variable scales (from small pebbles 0.08m to boulders 0.65m)
    const isBoulder = rand() < 0.12;
    const sx = (isBoulder ? 0.4 + rand() * 0.4 : 0.08 + rand() * 0.18) * (0.8 + rand() * 0.4);
    const sy = (isBoulder ? 0.3 + rand() * 0.3 : 0.05 + rand() * 0.12) * (0.6 + rand() * 0.4);
    const sz = (isBoulder ? 0.4 + rand() * 0.4 : 0.08 + rand() * 0.18) * (0.8 + rand() * 0.4);

    dummy.position.set(x, y + sy * 0.3, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    dummy.updateMatrix();

    instancedStones.setMatrixAt(i, dummy.matrix);
  }

  instancedStones.instanceMatrix.needsUpdate = true;
  group.add(instancedStones);

  // Place five notable smooth stones right near David (foreground right: near (2.8, 3))
  const pebbleGeom = new THREE.SphereGeometry(0.06, 8, 6);
  geometries.add(pebbleGeom);

  const davidStonesGroup = new THREE.Group();
  davidStonesGroup.name = 'david-five-smooth-stones';

  const stoneOffsets = [
    [0.15, -0.1],
    [-0.12, 0.15],
    [0.22, 0.2],
    [-0.2, -0.18],
    [0.05, 0.28],
  ];

  stoneOffsets.forEach(([ox, oz], idx) => {
    const px = 2.7 + ox;
    const pz = 1.2 + oz;
    const py = terrainHeight(px, pz) + 0.03;
    const pebble = new THREE.Mesh(pebbleGeom, smoothStoneMat);
    pebble.position.set(px, py, pz);
    pebble.scale.set(1.2, 0.6, 0.9);
    pebble.castShadow = true;
    pebble.name = `smooth-stone-${idx + 1}`;
    davidStonesGroup.add(pebble);
  });

  group.add(davidStonesGroup);

  return group;
}
