// The Mount of Olives itself, and everything that grows on it.
//
//   The ground is the elevation model (olivetTerrainData.js, baked by
//   scripts/build-olivet-landscape.py), a kilometre and more every way from
//   Gethsemane: the Kidron's bed, the western face climbing a hundred metres
//   to the summit, the plateau the Temple stands on across the valley and the
//   city's hills behind it. It is shaped where the first century differs from
//   the survey (olivetDimensions.js shapeGround), the same way for the ground
//   drawn here and the ground walked on.
//
//   The season is Passover, the middle of spring: the hills still green from
//   the winter rains, red anemones and yellow crown daisies in the grass, the
//   barley on the summit going from green to gold for the first sheaf, the
//   figs just putting out their leaves (Mark 13:28), the olives silver-grey as
//   they are all year. The olives are the point — terraced groves over the
//   whole face, and inside the garden's wall a few huge, hollow-hearted old
//   trees.
//
//   The far skyline is ribbons at true bearings and angular heights: the
//   hills west beyond the city, and from the summit the wilderness of Judea
//   falling to the Dead Sea, with the wall of Moab behind it and a strip of
//   the sea itself where the line of sight clears the desert.
//
// three.js is passed in, so the module stays importable in jsdom.

import { TERRAIN } from './olivetTerrainData.js';
import { HORIZON_RIBBONS } from './olivetHorizonData.js';
import {
  WALK, ROAD, GARDEN_OLIVES, FIGS, THRESHING_FLOOR, CLEARINGS, PLATFORM, CITY_QUARTERS,
  shapeGround, groundAt, groveOlives, roadDistance, insidePolygon,
} from './olivetDimensions.js';
import {
  smoothstep, makeRandom, hash2, triangleHeight, groundGeometry, buildHorizonRibbons,
  swaying as swayWith, oliveTreeGeometry, mergeSimple,
} from './sceneLandscape.js';
import { SCENE_AXES } from './sceneLighting.js';

// The spring wind comes off the sea, from the west.
export const WIND = { x: 0.96, z: -0.28 };

// The whole grid, shaped: what the landscape draws, and what anything standing
// off the walkable ground (the city, the far groves) stands on. On the
// walkable ground it is the same surface as groundAt.
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

// Slope, rise over run.
function slopeAt(x, z) {
  const e = 7.5;
  const dx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const dz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

// The Kidron's bed: lower than the ground twenty metres either side.
function inKidron(x, z) {
  if (x > 40 || x < -220) return false;
  const y = terrainHeight(x, z);
  return y < Math.min(terrainHeight(x - 24, z), terrainHeight(x + 24, z)) + 1.4;
}

const inCity = (x, z) => x < -225 && (insidePolygon(x, z, PLATFORM.corners)
  || CITY_QUARTERS.some((q) => insidePolygon(x, z, q.points)));

// What covers a patch of ground.
export function landUse(x, z) {
  if (inCity(x, z)) return 'city';
  if (roadDistance(x, z).distance < ROAD.width / 2 + 0.6) return 'road';
  if (inKidron(x, z)) return 'kidron';
  const y = terrainHeight(x, z);
  const slope = slopeAt(x, z);
  if (slope > 0.55) return 'rock';
  if (x > 300 && y > 96) return 'barley';
  const r = hash2(Math.floor(x / 34), Math.floor(z / 26));
  if (x < -225) return r < 0.5 ? 'meadow' : 'rock';
  if (slope > 0.4) return r < 0.6 ? 'rock' : 'grove';
  if (r < 0.12) return 'meadow';
  return 'grove';
}

const LAND_COLOURS = {
  city: 0xa39276, // dust and trodden limestone under the houses
  road: 0xb8a582, // packed pale earth
  kidron: 0x9a917f, // the brook's bed: limestone cobbles, a little green
  rock: 0x9c9585, // grey limestone, lichened, with grass in the joints
  barley: 0xa8a45e, // green going gold
  meadow: 0x6f8045, // spring grass, still green
  grove: 0x7c6a45, // red terra rossa under the olives, grassed
};

// Tones for the skyline (sceneLandscape.js buildHorizonRibbons).
const TONES = {
  near: { colour: [0.42, 0.39, 0.32], halfHaze: 7 }, // limestone hills, olive-grey
  far: { colour: [0.36, 0.35, 0.3], halfHaze: 9 },
  desert: { colour: [0.56, 0.47, 0.35], halfHaze: 11 }, // the wilderness: tawny chalk
  faint: { colour: [0.44, 0.38, 0.36], halfHaze: 16 }, // Moab, rose-grey at forty km
  sea: { colour: [0.22, 0.33, 0.42], halfHaze: 20 }, // the Dead Sea's steel blue
};

// A lobed leaf as an alpha mask, for the figs.
function leafTexture(THREE) {
  const s = 32;
  const data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y += 1) {
    for (let x = 0; x < s; x += 1) {
      const dx = (x / (s - 1)) * 2 - 1;
      const dy = (y / (s - 1)) * 2 - 1;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const lobes = 0.62 + 0.3 * Math.abs(Math.cos(a * 2.5));
      const i = (y * s + x) * 4;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = r < lobes ? 255 : 0;
    }
  }
  const texture = new THREE.DataTexture(data, s, s);
  texture.needsUpdate = true;
  return texture;
}

export function createOlivetLandscape(THREE, ctx = {}) {
  const { quality = 'high', lighting = null } = ctx;
  const low = quality === 'low';
  const high = quality === 'high';
  const random = makeRandom(ctx.seed ?? 3303);
  const group = new THREE.Group();
  group.name = 'olivet-landscape';
  const geometries = [];
  const materials = [];
  const textures = [];
  // Only wood stops the follow camera. Leaves and ground cover stay soft,
  // and the navigation's sampled floor keeps the lens above the hillside.
  const cameraColliders = [];
  const own = {
    g: (geometry) => { geometries.push(geometry); return geometry; },
    m: (material) => { materials.push(material); return material; },
    t: (texture) => { textures.push(texture); return texture; },
  };
  const sway = { uTime: { value: 0 } };
  const swaying = (material, options = {}) => swayWith(material, sway, { ...options, wind: WIND, key: 'olivet' });
  const shadows = !low;

  // --- the ground ---
  // One vertex per sample of the whole grid, so the triangles are the ones
  // groundAt walks on.
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
  // Close up, ground is never one colour: grit, grass and pale limestone
  // stones in the fragment shader, in world space so they stay put.
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
          // Green coming through: spring grass in the hollows, patchy.
          float grass = smoothstep(0.45, 0.8, groundNoise(vGround.xz * 0.35 + 3.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.4, 0.18), grass * 0.35);
          // Pale limestone stones through the soil.
          float stones = smoothstep(0.78, 0.94, groundNoise(vGround.xz * 5.6));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.51, 0.42), stones * 0.28 * near);
        }`);
  };
  terrainMaterial.customProgramCacheKey = () => 'olivet-terrain';
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.name = 'olivet-terrain';
  terrain.receiveShadow = shadows;
  group.add(terrain);

  // --- the road: a strip laid on the ground, so its edges are crisp at any
  // distance where the ground's colours are fifteen metres a sample ---
  {
    const half = ROAD.width / 2;
    const positions = [];
    const indices = [];
    const pts = ROAD.points;
    let row = 0;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const length = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.round(length / 2.5));
      for (let k = i === 0 ? 0 : 1; k <= steps; k += 1) {
        const t = k / steps;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        // Perpendicular, averaged across a bend so the strip does not pinch.
        const nx = -(bz - az) / length;
        const nz = (bx - ax) / length;
        for (const side of [-1, 1]) {
          const px = x + nx * half * side;
          const pz = z + nz * half * side;
          positions.push(px, terrainHeight(px, pz) + 0.07, pz);
        }
        if (row > 0) {
          const a = (row - 1) * 2;
          indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
        row += 1;
      }
    }
    const geometry = own.g(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const road = new THREE.Mesh(geometry, own.m(new THREE.MeshStandardMaterial({
      color: 0xbca985, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
    })));
    road.name = 'olivet-road';
    road.receiveShadow = shadows;
    group.add(road);
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
  // InstancedMesh: the camera — and the sun's tight shadow camera, which
  // follows the visitor — then cull whole blocks, instead of drawing every
  // tree on the Mount twice a frame. `pick` colours them, when given.
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
  const clear = (x, z, pad = 0) => CLEARINGS.every((c) => Math.hypot(x - c.x, z - c.z) > c.r + pad);
  const onWalk = (x, z) => x >= WALK.x0 && x <= WALK.x1 && z >= WALK.z0 && z <= WALK.z1;

  // --- the olive groves ---
  // The walkable face's trees are the navigation's own (their trunks are
  // solid); beyond it, groves over the rest of the Mount and its neighbours,
  // thinner, for the view.
  const near = groveOlives().map((tree) => ({ ...tree, y: groundAt(tree.x, tree.z) }));
  const far = [];
  {
    const spacing = low ? 26 : high ? 13 : 18;
    for (let z = -1150; z < 1150; z += spacing) {
      for (let x = -220; x < 1150; x += spacing) {
        const tx = x + (random() - 0.5) * spacing * 0.6;
        const tz = z + (random() - 0.5) * spacing * 0.6;
        if (onWalk(tx, tz) || Math.hypot(tx, tz) > 1150) continue;
        const use = landUse(tx, tz);
        if (use !== 'grove' || random() < 0.2) continue;
        far.push({ x: tx, z: tz, y: terrainHeight(tx, tz), s: 0.8 + random() * 0.45, r: random() * 6.28 });
      }
    }
  }
  const nearParts = oliveTreeGeometry(THREE);
  if (low) {
    // A phone draws the walkable face's four thousand crowns as lumps.
    nearParts.crown.dispose();
    nearParts.crown = new THREE.IcosahedronGeometry(1, 0).scale(2.1, 1.25, 2.1).translate(0, 2.9, 0);
  }
  const oldParts = oliveTreeGeometry(THREE, { age: 1 });
  // Far away a crown is a lump: twenty faces are plenty.
  const farCrown = new THREE.IcosahedronGeometry(1, 0);
  farCrown.scale(2.1, 1.25, 2.1);
  farCrown.translate(0, 2.9, 0);
  const bark = own.m(new THREE.MeshStandardMaterial({ color: 0x5c5046, roughness: 0.95 }));
  const oliveLeaf = own.m(swaying(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }), { amount: 0.05, flutter: 0.02 }));
  const olivePose = (o, p) => { o.position.set(p.x, p.y - 0.05, p.z); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s); };
  // The olive's grey-green, silvered underneath, a little different tree to tree.
  const oliveGreens = [0x7d8a66, 0x72805c, 0x88937a, 0x76835f, 0x818c6c];
  const greenOf = (p) => oliveGreens[Math.floor(p.r * 7) % 5];
  cameraColliders.push(...chunked(own.g(nearParts.trunk), bark, near, 'olive-trunks', olivePose, { cell: 180 }));
  chunked(own.g(nearParts.crown), oliveLeaf, near, 'olive-crowns', olivePose, { cell: 180, pick: greenOf });
  if (far.length) {
    chunked(own.g(new THREE.CylinderGeometry(0.2, 0.34, 1.9, 4).translate(0, 0.95, 0)), bark, far, 'olive-trunks-far', olivePose, { cast: false, cell: 600 });
    chunked(own.g(farCrown), oliveLeaf, far, 'olive-crowns-far', olivePose, { cast: false, cell: 600, pick: greenOf });
  } else {
    farCrown.dispose();
  }
  // The garden's own: few, huge and old.
  const garden = GARDEN_OLIVES.map(([x, z, girth], i) => ({ x, z, y: groundAt(x, z), s: 0.95 + girth * 0.2, r: i * 2.1, girth }));
  cameraColliders.push(instanced(own.g(oldParts.trunk), bark, garden, 'garden-olive-trunks', olivePose));
  colourAll(instanced(own.g(oldParts.crown), oliveLeaf, garden, 'garden-olive-crowns', olivePose), garden, (_, i) => oliveGreens[(i + 1) % 5]);

  // --- figs, just coming into leaf ---
  const figs = FIGS.map(([x, z, size]) => ({ x, z, y: groundAt(x, z), s: size }));
  const figTrunk = own.g(mergeSimple(THREE, [
    new THREE.CylinderGeometry(0.16, 0.26, 1.4, 6).translate(0, 0.7, 0),
    new THREE.CylinderGeometry(0.08, 0.13, 1.6, 5).rotateZ(0.6).translate(-0.45, 1.9, 0),
    new THREE.CylinderGeometry(0.08, 0.13, 1.6, 5).rotateZ(-0.55).translate(0.42, 1.95, 0.1),
    new THREE.CylinderGeometry(0.07, 0.12, 1.5, 5).rotateX(0.6).translate(0, 1.95, 0.45),
  ]));
  cameraColliders.push(instanced(figTrunk, own.m(new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.8 })), figs, 'fig-trunks',
    (o, p) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.x, 0); o.scale.setScalar(p.s); }));
  const leaves = [];
  figs.forEach((fig) => {
    // Sparse: the leaves are only half out.
    for (let i = 0; i < (low ? 40 : 110); i += 1) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * 2.2 * fig.s;
      // Figs branch low: the leaves start about head height.
      const y = (1.55 + (1 - (r / (2.2 * fig.s)) ** 2) * 1.3 + random() * 0.4) * fig.s;
      leaves.push({ x: fig.x + Math.cos(a) * r, y: fig.y + y, z: fig.z + Math.sin(a) * r, rx: random() * 3, ry: random() * 6, s: 0.22 + random() * 0.16 });
    }
  });
  instanced(own.g(new THREE.PlaneGeometry(1, 1)), own.m(swaying(new THREE.MeshStandardMaterial({
    color: 0x86a64a, map: own.t(leafTexture(THREE)), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75,
  }), { amount: 0.03, flutter: 0.07 })), leaves, 'fig-leaves',
  (o, p) => { o.position.set(p.x, p.y, p.z); o.rotation.set(p.rx, p.ry, 0); o.scale.setScalar(p.s); });

  // --- terrace walls: dry-stone courses along the contours of the groves ---
  const stones = [];
  if (!low) {
    const step = high ? 2.6 : 3.6;
    const every = 3.2;
    for (let z = WALK.z0; z < WALK.z1; z += step) {
      for (let x = WALK.x0 + 20; x < WALK.x1; x += step) {
        const a = Math.floor(groundAt(x, z) / every);
        const b = Math.floor(groundAt(x + step, z) / every);
        if (a === b) continue;
        const sx = x + step / 2;
        if (!clear(sx, z, 2) || roadDistance(sx, z).distance < ROAD.width / 2 + 1.5) continue;
        if (landUse(sx, z) !== 'grove' || hash2(Math.floor(sx / 30), Math.floor(z / 22)) < 0.45) continue;
        for (let k = 0; k < 2; k += 1) {
          const jz = z + (k - 0.5) * step * 0.5;
          stones.push({ x: sx + (random() - 0.5) * 0.4, z: jz, y: groundAt(sx, jz), s: 0.32 + random() * 0.18, r: random() * 6 });
        }
      }
    }
  }
  const limestone = own.m(new THREE.MeshStandardMaterial({ color: 0xb8b09c, roughness: 0.95, flatShading: true }));
  // Not every contour was walled, and a phone's budget is better spent on trees.
  const cap = high ? 7000 : 3000;
  if (stones.length > cap) {
    const keep = stones.length / cap;
    const thinned = [];
    for (let i = 0; i < stones.length; i += keep) thinned.push(stones[Math.floor(i)]);
    stones.length = 0;
    stones.push(...thinned);
  }
  if (stones.length) {
    chunked(own.g(new THREE.IcosahedronGeometry(1, 0)), limestone, stones, 'terrace-stones',
      (o, p) => { o.position.set(p.x, p.y + p.s * 0.3, p.z); o.rotation.set(0, p.r, 0); o.scale.set(p.s * 1.3, p.s * 0.8, p.s); }, { cast: false, cell: 180 });
  }

  // --- limestone: outcrops on the steep ground and cobbles in the brook ---
  const boulderGeometry = (() => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
      // Limestone weathers in shelves and pits, not in rounded lumps.
      const k = 1 + 0.2 * Math.sin(x * 4 + y * 6) + 0.1 * Math.cos(z * 7 - x * 3);
      p.setXYZ(i, x * k * 1.2, Math.max(y * k * 0.6, -0.2), z * k);
    }
    g.computeVertexNormals();
    return own.g(g);
  })();
  const boulders = [];
  for (let tries = 0; tries < (low ? 900 : 3000) && boulders.length < (low ? 120 : high ? 520 : 280); tries += 1) {
    const x = -200 + random() * 900;
    const z = -320 + random() * 820;
    const use = landUse(x, z);
    if (use !== 'rock' && use !== 'kidron' && !(use === 'grove' && random() < 0.08)) continue;
    if (!clear(x, z, 1) || roadDistance(x, z).distance < ROAD.width) continue;
    boulders.push({ x, z, y: terrainHeight(x, z), s: 0.35 + random() ** 2 * (use === 'rock' ? 1.6 : 0.8), r: random() * 6 });
  }
  instanced(boulderGeometry, limestone, boulders, 'limestone-boulders',
    (o, p) => { o.position.set(p.x, p.y + p.s * 0.05, p.z); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s); });

  // --- spring: grass tufts and flowers where the visitor walks ---
  const tuftGeometry = (() => {
    const parts = [];
    for (let i = 0; i < 7; i += 1) {
      const blade = new THREE.PlaneGeometry(0.05, 0.4, 1, 2);
      blade.translate(0, 0.2, 0);
      blade.rotateZ((i - 3) * 0.2);
      blade.rotateY((i / 7) * Math.PI);
      parts.push(blade);
    }
    return own.g(mergeSimple(THREE, parts));
  })();
  const tufts = [];
  for (let tries = 0; tries < (low ? 2400 : 9000) && tufts.length < (low ? 500 : high ? 3600 : 1800); tries += 1) {
    const x = WALK.x0 + random() * (WALK.x1 - WALK.x0);
    const z = WALK.z0 + random() * (WALK.z1 - WALK.z0);
    if (roadDistance(x, z).distance < ROAD.width / 2 + 0.3) continue;
    const use = landUse(x, z);
    if (use === 'rock' && random() < 0.7) continue;
    tufts.push({ x, z, y: groundAt(x, z), s: 0.7 + random() * 0.8, r: random() * 6, use });
  }
  const tuftMesh = instanced(tuftGeometry, own.m(swaying(new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 1 }), { amount: 0.5, flutter: 0.1 })),
    tufts, 'grass-tufts', (o, p) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s); }, { cast: false });
  colourAll(tuftMesh, tufts, (p, i) => (p.use === 'barley' ? 0xa8a45a : i % 5 === 0 ? 0x9a9a5a : 0x5f7a38));
  // Red anemones and poppies, yellow crown daisies, a few purple.
  const flowers = tufts.filter((p, i) => p.use !== 'barley' && i % 3 === 0)
    .map((p, i) => ({ x: p.x + 0.25, z: p.z - 0.15, y: p.y, c: i % 5 < 2 ? 0xc0282a : i % 5 < 4 ? 0xe4c23a : 0x8c5aa8 }));
  if (flowers.length) {
    colourAll(instanced(own.g(new THREE.IcosahedronGeometry(0.055, 0).translate(0, 0.34, 0)),
      own.m(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 })), flowers, 'spring-flowers',
      (o, p) => { o.position.set(p.x, p.y, p.z); o.scale.setScalar(1); }, { cast: false }), flowers, (p) => p.c);
  }

  // --- barley on the summit, and its threshing floor ---
  const barley = [];
  for (let tries = 0; tries < (low ? 1500 : 6000) && barley.length < (low ? 300 : high ? 2200 : 1000); tries += 1) {
    const x = 440 + random() * 200;
    const z = -300 + random() * 440;
    if (landUse(x, z) !== 'barley' || !clear(x, z) || roadDistance(x, z).distance < ROAD.width / 2 + 0.5) continue;
    barley.push({ x, z, y: groundAt(x, z), r: random() * 6, s: 0.8 + random() * 0.4 });
  }
  if (barley.length) {
    const stalks = (() => {
      const parts = [];
      for (let i = 0; i < 9; i += 1) {
        const stem = new THREE.PlaneGeometry(0.035, 0.85, 1, 2);
        stem.translate(0, 0.42, 0);
        stem.rotateZ((i - 4) * 0.07);
        stem.rotateY((i / 9) * Math.PI);
        stem.translate(Math.cos(i * 2.3) * 0.12, 0, Math.sin(i * 2.3) * 0.12);
        parts.push(stem);
      }
      return own.g(mergeSimple(THREE, parts));
    })();
    colourAll(instanced(stalks, own.m(swaying(new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 1 }), { amount: 0.6, flutter: 0.12 })),
      barley, 'barley', (o, p) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s); }, { cast: false }),
    barley, (_, i) => (i % 3 === 0 ? 0xb4ac62 : 0x98a05a));
  }
  {
    const { x, z, radius } = THRESHING_FLOOR;
    const floor = new THREE.Mesh(own.g(new THREE.CylinderGeometry(radius, radius + 0.2, 0.3, 24)),
      own.m(new THREE.MeshStandardMaterial({ color: 0xb8a67e, roughness: 1 })));
    floor.position.set(x, groundAt(x, z) + 0.05, z);
    floor.receiveShadow = shadows;
    floor.name = 'threshing-floor';
    group.add(floor);
  }

  // --- the far skyline, carried at the camera's height (relative bake) ---
  const ribbons = buildHorizonRibbons(THREE, { ribbons: HORIZON_RIBBONS, tones: TONES, lighting, axes: SCENE_AXES['mount-of-olives'], relative: true });
  own.g(ribbons.mesh.geometry);
  own.m(ribbons.mesh.material);
  // Distant silhouettes have no contact with the foreground. Including them
  // in GTAO turns the skyline into a dark band against the sky.
  ribbons.mesh.userData.excludeFromAO = true;
  group.add(ribbons.mesh);
  ribbons.setHour(lighting?.current);

  return {
    group,
    cameraColliders,
    terrainHeight,
    landUse,
    counts: { near: near.length, far: far.length, garden: garden.length, figs: figs.length, stones: stones.length, boulders: boulders.length, tufts: tufts.length, barley: barley.length },
    update(elapsed, delta, frame) {
      sway.uTime.value = elapsed;
      ribbons.follow(frame?.camera);
    },
    onTimeOfDay: (time) => ribbons.setHour(time),
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      group.removeFromParent();
    },
  };
}

// For tests: whether the drawn ground and the walked ground are the same
// surface wherever a visitor can stand.
export function sameGround(x, z) {
  return Math.abs(terrainHeight(x, z) - groundAt(x, z)) < 1e-6;
}

export { smoothstep };
