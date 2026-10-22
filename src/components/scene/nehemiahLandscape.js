// The ground of Nehemiah's Jerusalem, and what grows on it.
//
//   The ground is the elevation model (nehemiahTerrainData.js, baked by
//   scripts/build-nehemiah-landscape.py), a kilometre and more every way from
//   the Gihon: the city of David's ridge between the Kidron and the central
//   valley, the Temple Mount at its head, the Hinnom at its foot, the Mount of
//   Olives across the brook. It is shaped where the fifth century BC differs
//   from the survey (nehemiahDimensions.js shapeGround), the same way for the
//   ground drawn here and the ground walked on.
//
//   The season is the end of the dry year. Nehemiah's wall was finished on the
//   twenty-fifth of Elul — September, the month the figs are in — and the great
//   assembly at the Water Gate was the first of Tishri and the Feast of Booths
//   after it: October, the rains not yet come. So the land is the colour of the
//   stone: dust, dry grass, thorn on the rubble, the silver of the olives, and
//   the only green in the king's garden, which is watered.
//
//   The far skyline is ribbons at true bearings and angular heights: the hills
//   west of the city, and east, over the Mount of Olives, the Judean wilderness
//   and the wall of Moab.
//
// three.js is passed in, so the module stays importable in jsdom.

import { TERRAIN } from './nehemiahTerrainData.js';
import { HORIZON_RIBBONS } from './nehemiahHorizonData.js';
import {
  SLUG, WALK, WALLS, MOUNT, STREETS, GARDEN_ZONES, POOLS, RUBBLE_FIELDS,
  shapeGround, groundAt, groves, streetDistance, insidePolygon, inEventArea,
} from './nehemiahDimensions.js';
import {
  makeRandom, hash2, triangleHeight, groundGeometry, buildHorizonRibbons,
  swaying as swayWith, oliveTreeGeometry, mergeSimple,
} from './sceneLandscape.js';
import { SCENE_AXES } from './sceneLighting.js';

// The autumn wind off the sea, from the west.
export const WIND = { x: 0.96, z: -0.28 };

// The whole grid, shaped: what the landscape draws, and what anything standing
// off the walkable ground stands on. On the walkable ground it is the same
// surface as groundAt.
const SHAPED = {
  ...TERRAIN,
  heights: TERRAIN.heights.map((h, k) => shapeGround(
    TERRAIN.x0 + (k % TERRAIN.nx) * TERRAIN.step,
    TERRAIN.z0 + Math.floor(k / TERRAIN.nx) * TERRAIN.step,
    h,
  )),
};
export function terrainHeight(x, z) {
  return triangleHeight(SHAPED, x, z);
}

function slopeAt(x, z) {
  const e = 8;
  const dx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const dz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

const CITY = WALLS[0].vertices.map((v) => [v.x, v.z]);
const KINGS_GARDEN = GARDEN_ZONES.find((zone) => zone.id === 'kings-garden').polygon;

// What covers a patch of ground.
export function landUse(x, z) {
  if (insidePolygon(x, z, MOUNT.polygon)) return 'mount';
  if (insidePolygon(x, z, KINGS_GARDEN)) return 'garden';
  if (streetDistance(x, z).distance < 0.6) return 'road';
  if (insidePolygon(x, z, CITY)) return 'city';
  const slope = slopeAt(x, z);
  if (slope > 0.55) return 'rock';
  // The Western Hill, burned in 586 and not rebuilt.
  if (x < -290 && z > -480 && z < 420) return 'ruins';
  // The brook's bed: lower than the ground either side.
  if (x > -20 && x < 260) {
    const y = terrainHeight(x, z);
    if (y < Math.min(terrainHeight(x - 24, z), terrainHeight(x + 24, z)) + 1.2) return 'kidron';
  }
  const r = hash2(Math.floor(x / 34), Math.floor(z / 26));
  if (x > 110 && slope > 0.08 && r > 0.12) return 'grove';
  if (slope > 0.4) return r < 0.6 ? 'rock' : 'grove';
  return r < 0.7 ? 'meadow' : 'rock';
}

const LAND_COLOURS = {
  mount: 0xb8ac92, // the platform: pale paving dust
  city: 0xa39276, // trodden earth and rubble under the houses
  road: 0xb9a681, // packed pale earth
  garden: 0x7b8446, // the one green: the king's garden, watered
  kidron: 0x948b78, // the brook's bed, dry: cobbles, a little scrub
  rock: 0x9c9585, // grey limestone, lichened
  ruins: 0x9a8c72, // burned foundations and weeds
  grove: 0x7c6a45, // terra rossa under the olives
  meadow: 0x9a8f5c, // grass the colour of straw
};

// Tones for the skyline (sceneLandscape.js buildHorizonRibbons).
const TONES = {
  near: { colour: [0.42, 0.39, 0.32], halfHaze: 7 },
  far: { colour: [0.36, 0.35, 0.3], halfHaze: 9 },
  desert: { colour: [0.56, 0.47, 0.35], halfHaze: 11 },
  faint: { colour: [0.44, 0.38, 0.36], halfHaze: 16 },
};

export function createNehemiahLandscape(THREE, ctx = {}) {
  const { quality = 'high', lighting = null } = ctx;
  const low = quality === 'low';
  const high = quality === 'high';
  const random = makeRandom(ctx.seed ?? 4403);
  const group = new THREE.Group();
  group.name = 'nehemiah-landscape';
  const geometries = [];
  const materials = [];
  const cameraColliders = [];
  const own = {
    g: (geometry) => { geometries.push(geometry); return geometry; },
    m: (material) => { materials.push(material); return material; },
  };
  const sway = { uTime: { value: 0 } };
  const swaying = (material, options = {}) => swayWith(material, sway, { ...options, wind: WIND, key: 'nehemiah' });
  const shadows = !low;

  // --- the ground ---
  const terrainGeometry = own.g(groundGeometry(THREE, SHAPED, (x, z) => terrainHeight(x, z)));
  {
    const position = terrainGeometry.attributes.position;
    const colours = new Float32Array(position.count * 3);
    const colour = new THREE.Color();
    const tint = new THREE.Color();
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      colour.set(LAND_COLOURS[landUse(x, z)]);
      const n = hash2(Math.floor(x / 21), Math.floor(z / 17));
      tint.setRGB(0.9 + n * 0.2, 0.92 + n * 0.16, 0.9 + n * 0.12);
      colour.multiply(tint);
      colours.set([colour.r, colour.g, colour.b], i * 3);
    }
    terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  }
  const terrainMaterial = own.m(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  // Close up, ground is never one colour: grit, straw and pale stones in the
  // fragment shader, in world space so they stay put.
  terrainMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGround;
        float groundHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float groundNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(groundHash(i), groundHash(i + vec2(1.0, 0.0)), f.x),
                     mix(groundHash(i + vec2(0.0, 1.0)), groundHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float dist = length(vGround - cameraPosition);
          float near = 1.0 - smoothstep(40.0, 260.0, dist);
          float grit = groundNoise(vGround.xz * 1.7) * 0.5 + groundNoise(vGround.xz * 6.1) * 0.5;
          float patchy = groundNoise(vGround.xz * 0.09);
          diffuseColor.rgb *= 0.86 + patchy * 0.24 + (grit - 0.5) * 0.22 * near;
          // Straw coming through: dry grass in the hollows, patchy.
          float grass = smoothstep(0.45, 0.8, groundNoise(vGround.xz * 0.35 + 3.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.45, 0.26), grass * 0.28);
          // Pale limestone chips through the soil.
          float stones = smoothstep(0.78, 0.94, groundNoise(vGround.xz * 5.6));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.58, 0.54, 0.45), stones * 0.28 * near);
        }`);
  };
  terrainMaterial.customProgramCacheKey = () => 'nehemiah-terrain';
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.name = 'nehemiah-terrain';
  terrain.receiveShadow = shadows;
  group.add(terrain);

  // --- the streets: strips laid on the ground, crisp at any distance ---
  {
    const positions = [];
    const indices = [];
    let row = 0;
    for (const street of STREETS) {
      const half = street.width / 2;
      const pts = street.points;
      let first = true;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const length = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(1, Math.round(length / 2.5));
        for (let k = i === 0 ? 0 : 1; k <= steps; k += 1) {
          const t = k / steps;
          const x = ax + (bx - ax) * t;
          const z = az + (bz - az) * t;
          const nx = -(bz - az) / length;
          const nz = (bx - ax) / length;
          for (const side of [-1, 1]) {
            const px = x + nx * half * side;
            const pz = z + nz * half * side;
            positions.push(px, terrainHeight(px, pz) + 0.07, pz);
          }
          if (!first) {
            const a = (row - 1) * 2;
            indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
          }
          first = false;
          row += 1;
        }
      }
    }
    const geometry = own.g(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const streets = new THREE.Mesh(geometry, own.m(new THREE.MeshStandardMaterial({
      color: 0xbca985, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
    })));
    streets.name = 'nehemiah-streets';
    streets.receiveShadow = shadows;
    group.add(streets);
  }

  const dummy = new THREE.Object3D();
  const instanced = (geometry, material, placements, name, pose, { cast = true } = {}) => {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, placements.length));
    mesh.name = name;
    mesh.count = placements.length;
    placements.forEach((p, i) => {
      pose(dummy, p, i);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.castShadow = shadows && cast;
    mesh.receiveShadow = shadows;
    group.add(mesh);
    return mesh;
  };
  const colourAll = (mesh, placements, pick) => {
    const c = new THREE.Color();
    placements.forEach((p, i) => mesh.setColorAt(i, c.set(pick(p, i))));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  // Thousands of one thing over a kilometre, as blocks of ground each its own
  // InstancedMesh: the camera, and the sun's tight shadow camera that follows
  // the visitor, then cull whole blocks.
  const chunked = (geometry, material, placements, name, pose, { cast = true, cell = 160, pick = null } = {}) => {
    const buckets = new Map();
    placements.forEach((p) => {
      const key = `${Math.floor(p.x / cell)}:${Math.floor(p.z / cell)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    });
    const meshes = [];
    for (const [key, list] of buckets) {
      const mesh = instanced(geometry, material, list, `${name}-${key}`, pose, { cast });
      mesh.computeBoundingSphere();
      if (pick) colourAll(mesh, list, pick);
      meshes.push(mesh);
    }
    return meshes;
  };
  const onWalk = (x, z) => x >= WALK.x0 && x <= WALK.x1 && z >= WALK.z0 && z <= WALK.z1;

  // --- the groves: the Kidron's bank and the Mount across it, and the fruit
  // of the king's garden. The walkable ones are the navigation's own (their
  // trunks are solid); beyond the walk, thinner groves for the view.
  const all = groves().map((tree) => ({ ...tree, y: groundAt(tree.x, tree.z) }));
  const olives = all.filter((tree) => tree.kind === 'olive');
  const fruit = all.filter((tree) => tree.kind === 'fruit');
  const far = [];
  {
    const spacing = low ? 26 : high ? 13 : 18;
    for (let z = -1150; z < 1150; z += spacing) {
      for (let x = 100; x < 1150; x += spacing) {
        const tx = x + (random() - 0.5) * spacing * 0.6;
        const tz = z + (random() - 0.5) * spacing * 0.6;
        if (onWalk(tx, tz) || Math.hypot(tx, tz) > 1150) continue;
        if (landUse(tx, tz) !== 'grove' || random() < 0.25) continue;
        far.push({ x: tx, z: tz, y: terrainHeight(tx, tz), s: 0.8 + random() * 0.45, r: random() * 6.28 });
      }
    }
  }
  const parts = oliveTreeGeometry(THREE);
  if (low) {
    parts.crown.dispose();
    parts.crown = new THREE.IcosahedronGeometry(1, 0).scale(2.1, 1.25, 2.1).translate(0, 2.9, 0);
  }
  const farCrown = new THREE.IcosahedronGeometry(1, 0);
  farCrown.scale(2.1, 1.25, 2.1);
  farCrown.translate(0, 2.9, 0);
  const bark = own.m(new THREE.MeshStandardMaterial({ color: 0x5c5046, roughness: 0.95 }));
  const leaf = own.m(swaying(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }), { amount: 0.05, flutter: 0.02 }));
  const treePose = (o, p) => { o.position.set(p.x, p.y - 0.05, p.z); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s); };
  const greens = [0x7d8a66, 0x72805c, 0x88937a, 0x76835f, 0x818c6c];
  const greenOf = (p) => greens[Math.floor(p.r * 7) % 5];
  cameraColliders.push(...chunked(own.g(parts.trunk), bark, olives, 'olive-trunks', treePose, { cell: 180 }));
  chunked(own.g(parts.crown), leaf, olives, 'olive-crowns', treePose, { cell: 180, pick: greenOf });
  if (far.length) {
    chunked(own.g(new THREE.CylinderGeometry(0.2, 0.34, 1.9, 4).translate(0, 0.95, 0)), bark, far, 'olive-trunks-far', treePose, { cast: false, cell: 600 });
    chunked(own.g(farCrown), leaf, far, 'olive-crowns-far', treePose, { cast: false, cell: 600, pick: greenOf });
  } else {
    farCrown.dispose();
  }
  // Fig and pomegranate in the king's garden: short, wide, dark with summer.
  if (fruit.length) {
    const trunk = own.g(new THREE.CylinderGeometry(0.14, 0.22, 1.3, 6).translate(0, 0.65, 0));
    const crown = own.g(new THREE.IcosahedronGeometry(1, 1).scale(1.9, 1.2, 1.9).translate(0, 2.1, 0));
    cameraColliders.push(...chunked(trunk, bark, fruit, 'fruit-trunks', treePose, { cell: 180 }));
    const fruitLeaf = own.m(swaying(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }), { amount: 0.04, flutter: 0.03 }));
    chunked(crown, fruitLeaf, fruit, 'fruit-crowns', treePose, { cell: 180, pick: (p) => [0x5f7a38, 0x6a8340, 0x54703a][Math.floor(p.r * 5) % 3] });
  }

  // --- boulders on the steep ground and cobbles in the brook ---
  const limestone = own.m(new THREE.MeshStandardMaterial({ color: 0xb8b09c, roughness: 0.95, flatShading: true }));
  const boulderGeometry = (() => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
      const k = 1 + 0.2 * Math.sin(x * 4 + y * 6) + 0.1 * Math.cos(z * 7 - x * 3);
      p.setXYZ(i, x * k * 1.2, Math.max(y * k * 0.6, -0.2), z * k);
    }
    g.computeVertexNormals();
    return own.g(g);
  })();
  const boulders = [];
  for (let tries = 0; tries < (low ? 900 : 3600) && boulders.length < (low ? 120 : high ? 560 : 300); tries += 1) {
    const x = WALK.x0 + random() * (WALK.x1 - WALK.x0);
    const z = WALK.z0 + random() * (WALK.z1 - WALK.z0);
    const use = landUse(x, z);
    if (use !== 'rock' && use !== 'kidron' && use !== 'ruins' && !(use === 'grove' && random() < 0.08)) continue;
    if (inEventArea(x, z, 1) || streetDistance(x, z).distance < 1) continue;
    boulders.push({ x, z, y: terrainHeight(x, z), s: 0.35 + random() ** 2 * (use === 'rock' ? 1.6 : 0.8), r: random() * 6 });
  }
  instanced(boulderGeometry, limestone, boulders, 'limestone-boulders',
    (o, p) => { o.position.set(p.x, p.y + p.s * 0.05, p.z); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s); });

  // --- dry grass and thorn where the visitor walks ---
  const tuftGeometry = (() => {
    const blades = [];
    for (let i = 0; i < 7; i += 1) {
      const blade = new THREE.PlaneGeometry(0.05, 0.4, 1, 2);
      blade.translate(0, 0.2, 0);
      blade.rotateZ((i - 3) * 0.2);
      blade.rotateY((i / 7) * Math.PI);
      blades.push(blade);
    }
    return own.g(mergeSimple(THREE, blades));
  })();
  const tufts = [];
  for (let tries = 0; tries < (low ? 2400 : 9000) && tufts.length < (low ? 500 : high ? 3800 : 1900); tries += 1) {
    const x = WALK.x0 + random() * (WALK.x1 - WALK.x0);
    const z = WALK.z0 + random() * (WALK.z1 - WALK.z0);
    const use = landUse(x, z);
    if (use === 'road' || use === 'mount' || streetDistance(x, z).distance < 0.5) continue;
    if (use === 'rock' && random() < 0.7) continue;
    tufts.push({ x, z, y: groundAt(x, z), s: 0.7 + random() * 0.8, r: random() * 6, use });
  }
  const tuftMesh = instanced(tuftGeometry, own.m(swaying(new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 1 }), { amount: 0.5, flutter: 0.1 })),
    tufts, 'grass-tufts', (o, p) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s); }, { cast: false });
  // Straw, nearly: a few tufts still green by the garden.
  colourAll(tuftMesh, tufts, (p, i) => (p.use === 'garden' ? 0x6a7f3c : i % 4 === 0 ? 0x8a7a48 : i % 4 === 1 ? 0xa39560 : 0x948752));

  // Thorn bushes on the rubble: low, grey, spiny lumps.
  const thorns = [];
  for (const field of RUBBLE_FIELDS) {
    const n = Math.round((low ? 0.015 : 0.04) * field.density * Math.PI * field.rx * field.rz / 10);
    for (let k = 0; k < n; k += 1) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random());
      const x = field.x + Math.cos(a) * r * field.rx;
      const z = field.z + Math.sin(a) * r * field.rz;
      if (!onWalk(x, z) || inEventArea(x, z, 1) || streetDistance(x, z).distance < 1.2) continue;
      thorns.push({ x, z, y: groundAt(x, z), s: 0.5 + random() * 0.7, r: random() * 6 });
    }
  }
  if (thorns.length) {
    const thornGeometry = own.g(new THREE.IcosahedronGeometry(0.6, 0).scale(1.3, 0.8, 1.1).translate(0, 0.4, 0));
    colourAll(instanced(thornGeometry, own.m(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true })), thorns, 'thorn-scrub',
      (o, p) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s); }, { cast: false }),
    thorns, (_, i) => [0x7a7456, 0x8b8260, 0x6c6a4c][i % 3]);
  }

  // --- the far skyline, carried at the camera's height (relative bake) ---
  const ribbons = buildHorizonRibbons(THREE, {
    ribbons: HORIZON_RIBBONS, tones: TONES, lighting, axes: SCENE_AXES[SLUG], relative: true,
  });
  own.g(ribbons.mesh.geometry);
  own.m(ribbons.mesh.material);
  ribbons.mesh.userData.excludeFromAO = true;
  group.add(ribbons.mesh);
  ribbons.setHour(lighting?.current);

  return {
    group,
    cameraColliders,
    terrainHeight,
    landUse,
    // The surfaces a scan can go under: the ground, which is vertex-coloured
    // (the scan averages to white there, so those colours stay), and the
    // limestone of the boulders.
    materials: { terrain: terrainMaterial, limestone },
    counts: { olives: olives.length, fruit: fruit.length, far: far.length, boulders: boulders.length, tufts: tufts.length, thorns: thorns.length },
    pools: POOLS.length,
    update(elapsed, delta, frame) {
      sway.uTime.value = elapsed;
      ribbons.follow(frame?.camera);
    },
    onTimeOfDay: (time) => ribbons.setHour(time),
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      group.removeFromParent();
    },
  };
}

// For tests: whether the drawn ground and the walked ground are the same
// surface wherever a visitor can stand.
export function sameGround(x, z) {
  return Math.abs(terrainHeight(x, z) - groundAt(x, z)) < 1e-6;
}
