// The land around Capernaum, and everything that grows on it.
//
// The village used to end in a two-metre cliff of brown box at ±92 m with the
// sky's underside showing past it, and its "hills" were three scaled spheres —
// one buried, one sitting in the lake due south where the water runs to the
// horizon, and one leaving a hundred-and-fifty-metre void behind the houses. A
// camera three metres up and behind the visitor sees all of that in the first
// minute. This module replaces it with the real ground:
//
//   The terrain is sampled from SRTM elevation data (capernaumTerrainData.js,
//   baked by scripts/build-capernaum-landscape.py): the slope climbing north
//   at five or six per cent toward the Korazim plateau, the Eremos ridge
//   steeper to the west, the shore bending away south-west toward Tabgha and
//   north-east toward the Jordan. Inside the village it is held just under the
//   village's own floors so the two never fight.
//
//   The far skyline is a set of ribbons at true compass bearings and true
//   angular heights (capernaumHorizonData.js): Arbel's wedge and cliff to the
//   south-west, the Horns of Hattin in the notch beside it, the Golan as a
//   near-level wall across the water to the east, Hippos on its mesa, the
//   hills behind Tiberias, and Gilead faint down the length of the lake. What
//   cannot be seen from this shore — Hermon, Tabor, Meron, Chorazin — is not
//   drawn. The ribbons ride with the camera like the sky dome does, because a
//   mountain ten kilometres off does not move when you cross a village, and
//   they carry their own haze, driven by the live sky, rather than the scene's
//   fog, which would swallow anything that far away.
//
//   The season is late spring, around the grain harvest of Mark 2:23: wheat
//   ripening gold on the slope, barley already cut to stubble, olives in small
//   green fruit, figs in full leaf, oleander flowering pink in the wadi
//   mouths, thistles in purple flower. Olives, figs, vines, walnuts and palms
//   are the trees Josephus lists for this shore (War 3.516–519).
//
// three.js is passed in, so the module stays importable in jsdom.

import { TERRAIN } from './capernaumTerrainData.js';
import { HORIZON_RIBBONS } from './capernaumHorizonData.js';
import { SHORE, LEVEL, TREES } from './capernaumDimensions.js';
import { WIND } from './capernaumWeather.js';

// The village's own ground: a rectangle of flat floor (the builder's slab),
// the beach and the ramp south of it. The terrain is held at the village
// profile here and blends to the real ground over BLEND metres outside it.
export const VILLAGE_FLOOR = { x0: -92, x1: 92, z0: SHORE.rampNorth, z1: 114 };
const BLEND = 220;
// Under the builder's own floors inside the rectangle, by this much.
const TUCK = 0.05;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// A cheap deterministic hash in [0, 1) for a pair of integers.
function hash2(i, j) {
  let h = (i * 374761393 + j * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- the ground ------------------------------------------------------------------

// Bilinear height from the baked grid, scene metres. Outside the grid the
// nearest edge value stands in.
function gridHeight(x, z) {
  const { x0, z0, step, nx, nz, heights } = TERRAIN;
  const fx = clamp((x - x0) / step, 0, nx - 1.001);
  const fz = clamp((z - z0) / step, 0, nz - 1.001);
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const a = heights[j * nx + i];
  const b = heights[j * nx + i + 1];
  const c = heights[(j + 1) * nx + i];
  const d = heights[(j + 1) * nx + i + 1];
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

// The village's own profile, extended: flat floor north of the ramp, the ramp,
// the beach, and a shelf dropping away under the water past the waterline.
function villageProfile(z) {
  if (z >= SHORE.rampNorth) return LEVEL.ground;
  if (z >= SHORE.beachNorth) {
    const t = (z - SHORE.beachNorth) / (SHORE.rampNorth - SHORE.beachNorth);
    return LEVEL.beach + t * (LEVEL.ground - LEVEL.beach);
  }
  if (z >= SHORE.beachSouth) return LEVEL.beach;
  return Math.max(-3.2, LEVEL.beach - (SHORE.beachSouth - z) * 0.14);
}

// Distance outside the rectangle the village and its beach occupy.
function outside(x, z) {
  const dx = Math.max(VILLAGE_FLOOR.x0 - x, 0, x - VILLAGE_FLOOR.x1);
  const dz = Math.max(SHORE.beachSouth - z, 0, z - VILLAGE_FLOOR.z1);
  return Math.hypot(dx, dz);
}

// The height of the ground at (x, z), in scene metres. Inside the village it
// sits just under the builder's floors; outside, it becomes the real terrain
// over BLEND metres.
export function terrainHeight(x, z) {
  const profile = villageProfile(z);
  const insideFloor = x >= VILLAGE_FLOOR.x0 && x <= VILLAGE_FLOOR.x1 && z >= SHORE.beachSouth && z <= VILLAGE_FLOOR.z1;
  if (insideFloor) return profile - TUCK;
  const weight = smoothstep(0, BLEND, outside(x, z));
  // Near the village the elevation model's shoreline sits fifty metres south
  // of the scene's; the blend carries the scene's own shore out along the
  // waterfront before handing over to the survey.
  return profile * (1 - weight) + gridHeight(x, z) * weight;
}

// Slope of the ground, rise over run.
function slopeAt(x, z) {
  const e = 6;
  const dx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const dz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

// What grows on a patch of ground: fields in parcels on the gentler slope,
// olive groves, fallow, and rock where it is steep. Parcels are rotated a
// little off the grid, the way terraces follow a contour rather than a map.
const PARCEL_ANGLE = 0.21;
const PARCEL = { w: 64, d: 38 };
export function landUse(x, z) {
  const y = terrainHeight(x, z);
  if (y < LEVEL.lake + 0.25) return 'water';
  if (y < 0.9 && z < 60) return 'shore';
  if (outside(x, z) < 18) return 'trodden';
  const slope = slopeAt(x, z);
  if (slope > 0.3) return 'rock';
  const u = x * Math.cos(PARCEL_ANGLE) + z * Math.sin(PARCEL_ANGLE);
  const v = -x * Math.sin(PARCEL_ANGLE) + z * Math.cos(PARCEL_ANGLE);
  const r = hash2(Math.floor(u / PARCEL.w), Math.floor(v / PARCEL.d));
  if (slope > 0.18) return r < 0.5 ? 'olive' : 'rock';
  if (r < 0.34) return 'wheat';
  if (r < 0.52) return 'stubble';
  if (r < 0.74) return 'olive';
  if (r < 0.86) return 'fallow';
  return 'pasture';
}

const LAND_COLOURS = {
  water: 0x4a4436,
  shore: 0x6f675a, // wet basalt shingle
  trodden: 0x8a7458, // the village's own packed earth
  rock: 0x4a4038, // black basalt with dry grass between
  wheat: 0xc2a257, // ripening, gold going on white
  stubble: 0xb8a47d, // barley cut and gathered
  olive: 0x6a5a40, // red-brown soil under grey-green trees
  fallow: 0x76563f, // bare basalt soil, dark red-brown
  pasture: 0x9a8958, // dry spring grass going over
};

// --- the far skyline --------------------------------------------------------------

// Tone palettes for the ribbons: colour in full sun, and the distance (km)
// at which half of it has gone to haze on a clear morning.
const TONES = {
  near: { colour: [0.23, 0.2, 0.15], halfHaze: 7 },
  limestone: { colour: [0.46, 0.4, 0.31], halfHaze: 9 },
  golan: { colour: [0.27, 0.25, 0.21], halfHaze: 9 },
  far: { colour: [0.3, 0.29, 0.25], halfHaze: 9 },
  faint: { colour: [0.36, 0.36, 0.34], halfHaze: 12 },
};
// How clear each hour is: dawn haze and evening dust against the clearer
// middle of the day. Multiplies halfHaze.
const CLARITY = { dawn: 0.55, morning: 1, noon: 1.15, dusk: 0.7, night: 0.8 };

const RIBBON_SHADER = {
  vertexShader: `
    attribute vec3 aTone;
    attribute float aHaze;
    varying vec3 vTone;
    varying float vHaze;
    varying vec3 vDir;
    varying float vUp;
    void main() {
      vTone = aTone;
      vHaze = aHaze;
      vDir = normalize(vec3(position.x, 0.0, position.z));
      vUp = position.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uSun;
    uniform vec3 uLow;
    uniform vec3 uHigh;
    uniform vec3 uGlow;
    uniform float uClarity;
    uniform float uNight;
    varying vec3 vTone;
    varying float vHaze;
    varying vec3 vDir;
    varying float vUp;
    void main() {
      vec3 sun = normalize(uSun);
      float daylight = smoothstep(-0.12, 0.25, sun.y);
      // A slope facing back toward the viewer is lit when the sun is behind
      // the viewer; one with the sun behind it stands dark against the glow.
      float front = max(dot(-vDir, normalize(vec3(sun.x, 0.0, sun.z))), 0.0);
      float lit = mix(0.45, 1.25, front) * mix(0.25, 1.0, daylight);
      vec3 ground = vTone * lit;
      // Aerial perspective: the far thing takes the colour of the sky low on
      // the horizon behind it, brightened where it lies toward the sun.
      vec3 horizon = mix(uLow, uHigh, 0.08);
      float toward = pow(max(dot(vDir, normalize(vec3(sun.x, 0.0, sun.z))), 0.0), 6.0);
      horizon += uGlow * toward * 0.35;
      float haze = 1.0 - exp2(-vHaze / max(0.1, uClarity));
      vec3 colour = mix(ground, horizon, clamp(haze, 0.0, 0.97));
      // A little darker toward the foot of the ribbon, where nearer ground
      // overlaps it anyway, so its edge against the water never glows.
      colour *= mix(0.9, 1.0, smoothstep(-2.0, 8.0, vUp));
      colour *= mix(1.0, 0.35, uNight);
      gl_FragColor = vec4(colour, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

function buildRibbons(THREE, lighting) {
  const positions = [];
  const tones = [];
  const hazes = [];
  const indices = [];
  let base = 0;
  for (const ribbon of HORIZON_RIBBONS) {
    const tone = TONES[ribbon.tone] || TONES.far;
    ribbon.points.forEach(([bearing, yTop, km]) => {
      const radians = (bearing * Math.PI) / 180;
      // Compass bearing to scene axes: +X east, +Z north.
      const x = Math.sin(radians) * ribbon.D;
      const z = Math.cos(radians) * ribbon.D;
      positions.push(x, yTop, z, x, -8, z);
      tones.push(...tone.colour, ...tone.colour);
      const haze = km / tone.halfHaze;
      hazes.push(haze, haze);
    });
    for (let i = 0; i < ribbon.points.length - 1; i += 1) {
      const a = base + i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    base += ribbon.points.length * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aTone', new THREE.Float32BufferAttribute(tones, 3));
  geometry.setAttribute('aHaze', new THREE.Float32BufferAttribute(hazes, 1));
  geometry.setIndex(indices);
  const uniforms = {
    uSun: lighting?.uniforms?.uSun ?? { value: new THREE.Vector3(0.4, 0.4, 0.8) },
    uLow: lighting?.uniforms?.uLow ?? { value: new THREE.Vector3(0.94, 0.83, 0.66) },
    uHigh: lighting?.uniforms?.uHigh ?? { value: new THREE.Vector3(0.29, 0.51, 0.75) },
    uGlow: lighting?.uniforms?.uGlow ?? { value: new THREE.Vector3(1, 0.68, 0.32) },
    uClarity: { value: 1 },
    uNight: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: RIBBON_SHADER.vertexShader,
    fragmentShader: RIBBON_SHADER.fragmentShader,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'horizon-ribbons';
  mesh.frustumCulled = false;
  // Drawn after the sky dome, which writes no depth, so the hills sit on it.
  mesh.renderOrder = 1;
  return { mesh, uniforms };
}

// --- vegetation shapes --------------------------------------------------------------

// Leaflets for palm fronds and lobed leaves for figs, as alpha masks: a
// DataTexture works in jsdom and the browser alike.
function frondTexture(THREE) {
  const w = 64;
  const h = 16;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const u = x / w;
      const v = Math.abs(y / (h - 1) - 0.5) * 2; // 0 at the midrib
      // Leaflets angled forward off the rib, narrowing toward the tip.
      const leaflet = (u * 22 + v * 1.4) % 1 < 0.62;
      const reach = 1 - u * 0.55;
      const on = v < 0.12 || (leaflet && v < reach);
      const i = (y * w + x) * 4;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = on ? 255 : 0;
    }
  }
  const texture = new THREE.DataTexture(data, w, h);
  texture.needsUpdate = true;
  return texture;
}

function leafTexture(THREE) {
  const s = 32;
  const data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y += 1) {
    for (let x = 0; x < s; x += 1) {
      const dx = (x / (s - 1)) * 2 - 1;
      const dy = (y / (s - 1)) * 2 - 1;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      // Three to five deep lobes: the fig's hand-shaped leaf.
      const lobes = 0.62 + 0.3 * Math.abs(Math.cos(a * 2.5));
      const i = (y * s + x) * 4;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = r < lobes ? 255 : 0;
    }
  }
  const texture = new THREE.DataTexture(data, s, s);
  texture.needsUpdate = true;
  return texture;
}

// Bends a foliage material with the wind: displacement along WIND, growing
// with height above the object's own base, on a slow gust and a quick flutter.
function swaying(material, uniforms, { amount = 0.18, flutter = 0.03 } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 root = vec4(0.0, 0.0, 0.0, 1.0);
          #ifdef USE_INSTANCING
            root = instanceMatrix * root;
          #endif
          float h = max(position.y, 0.0);
          float phase = root.x * 0.13 + root.z * 0.17;
          float gust = sin(uTime * 0.9 + phase) * 0.6 + sin(uTime * 0.37 + phase * 1.7) * 0.4;
          float bend = (gust * ${amount.toFixed(3)} + sin(uTime * 4.1 + phase * 3.0 + position.x * 2.0) * ${flutter.toFixed(3)}) * h * h * 0.12;
          transformed.x += bend * ${WIND.x.toFixed(3)};
          transformed.z += bend * ${WIND.z.toFixed(3)};
        }`);
  };
  material.customProgramCacheKey = () => `capernaum-sway-${amount}-${flutter}`;
  return material;
}

// --- the module ----------------------------------------------------------------------

export function createCapernaumLandscape(THREE, ctx = {}) {
  const { quality = 'high', lighting = null } = ctx;
  const low = quality === 'low';
  const high = quality === 'high';
  const random = makeRandom(ctx.seed ?? 1998);
  const group = new THREE.Group();
  group.name = 'capernaum-landscape';

  const geometries = [];
  const materials = [];
  const textures = [];
  const own = {
    g: (geometry) => { geometries.push(geometry); return geometry; },
    m: (material) => { materials.push(material); return material; },
    t: (texture) => { textures.push(texture); return texture; },
  };
  const sway = { uTime: { value: 0 } };
  const shadows = !low;

  // --- terrain ---
  const step = low ? 30 : 15;
  const half = TERRAIN.x0 * -1;
  const count = Math.floor((2 * half) / step) + 1;
  const terrainGeometry = own.g(new THREE.PlaneGeometry(2 * half, 2 * half, count - 1, count - 1));
  terrainGeometry.rotateX(-Math.PI / 2);
  {
    const position = terrainGeometry.attributes.position;
    const colours = new Float32Array(position.count * 3);
    const colour = new THREE.Color();
    const tint = new THREE.Color();
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      let y = terrainHeight(x, z);
      // Under the water the ground falls away steeply rather than shelving
      // for metres just below the surface: a kilometre out, a third-person
      // camera's depth buffer cannot tell two surfaces 30 cm apart, and a
      // gently drowned shore would shimmer through the lake.
      if (y < LEVEL.lake) y = LEVEL.lake - 0.35 - (LEVEL.lake - y) * 2;
      position.setY(i, y);
      colour.set(LAND_COLOURS[landUse(x, z)]);
      // Large-scale variation so the parcels do not read as flat paint.
      const n = hash2(Math.floor(x / 23), Math.floor(z / 19));
      tint.setRGB(0.9 + n * 0.2, 0.9 + n * 0.18, 0.9 + n * 0.14);
      colour.multiply(tint);
      colours.set([colour.r, colour.g, colour.b], i * 3);
    }
    terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    terrainGeometry.computeVertexNormals();
  }
  const terrainMaterial = own.m(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  // Close up, ground is never one colour: grit, stones and furrows in the
  // fragment shader, in world space so they stay put as the camera moves.
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
          float patchy = groundNoise(vGround.xz * 0.11);
          diffuseColor.rgb *= 0.86 + patchy * 0.24 + (grit - 0.5) * 0.22 * near;
          // Black basalt stones through the soil, most on the rough ground.
          float stones = step(0.83, groundNoise(vGround.xz * 2.3));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.085, 0.08), stones * 0.55 * near);
        }`);
  };
  terrainMaterial.customProgramCacheKey = () => 'capernaum-terrain';
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.name = 'capernaum-terrain';
  terrain.receiveShadow = shadows;
  group.add(terrain);

  // Places things on the land: tries `wanted` random points in the box, keeps
  // those `accept` passes, each standing on the terrain.
  const scatterOn = (wanted, box, accept) => {
    const found = [];
    for (let tries = 0; tries < wanted * 12 && found.length < wanted; tries += 1) {
      const x = box.x0 + random() * (box.x1 - box.x0);
      const z = box.z0 + random() * (box.z1 - box.z0);
      if (!accept(x, z)) continue;
      found.push({ x, z, y: terrainHeight(x, z) });
    }
    return found;
  };
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

  // Where nobody walks and nothing is built: off the village floor, on land.
  const open = (x, z) => outside(x, z) > 6 && terrainHeight(x, z) > 0.3;

  // --- olive groves ---
  const olives = [];
  {
    const spacing = low ? 22 : 11;
    for (let z = 120; z < 720; z += spacing) {
      for (let x = -700; x < 700; x += spacing) {
        const jx = x + (random() - 0.5) * spacing * 0.5;
        const jz = z + (random() - 0.5) * spacing * 0.5;
        if (Math.hypot(jx, jz) > 820 || !open(jx, jz) || landUse(jx, jz) !== 'olive') continue;
        olives.push({ x: jx, z: jz, y: terrainHeight(jx, jz), s: 0.8 + random() * 0.5, r: random() * Math.PI * 2 });
      }
    }
    // Thinned evenly to what the device can carry: the groves read as groves
    // at a few hundred trees, and each one is a draw of its own triangles.
    const cap = low ? 70 : high ? 420 : 200;
    if (olives.length > cap) {
      const keep = olives.length / cap;
      const thinned = [];
      for (let i = 0; i < olives.length; i += keep) thinned.push(olives[Math.floor(i)]);
      olives.length = 0;
      olives.push(...thinned);
    }
    // A few old trees nearer the houses, on the terraces behind the synagogue.
    olives.push(...scatterOn(low ? 3 : 8, { x0: -80, x1: 80, z0: 118, z1: 170 }, open)
      .map((p) => ({ ...p, s: 1 + random() * 0.4, r: random() * 6 })));
  }
  const olivePart = (() => {
    const trunk = new THREE.CylinderGeometry(0.16, 0.34, 1.9, 5, 3, true);
    const position = trunk.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      // Gnarled: the trunk wanders and twists as it rises.
      const t = (y + 0.95) / 1.9;
      position.setX(i, position.getX(i) * (1 + 0.25 * Math.sin(t * 7 + position.getZ(i) * 9)) + Math.sin(t * 3.2) * 0.14);
      position.setZ(i, position.getZ(i) * (1 + 0.2 * Math.cos(t * 5 + position.getX(i) * 7)) + Math.cos(t * 2.6) * 0.1);
    }
    trunk.translate(0, 0.95, 0);
    trunk.computeVertexNormals();
    const crown = new THREE.IcosahedronGeometry(1, 1);
    const cp = crown.attributes.position;
    for (let i = 0; i < cp.count; i += 1) {
      // Broad and flat-bottomed, lumpy: an olive crown is several clumps.
      const x = cp.getX(i); const y = cp.getY(i); const z = cp.getZ(i);
      const lump = 1 + 0.22 * Math.sin(x * 4.1 + z * 3.3) + 0.16 * Math.cos(y * 5.2 + x * 2.1);
      cp.setXYZ(i, x * 2.1 * lump, Math.max(y, -0.35) * 1.25 * lump, z * 2.1 * lump);
    }
    crown.translate(0, 2.9, 0);
    crown.computeVertexNormals();
    return { trunk: own.g(trunk), crown: own.g(crown) };
  })();
  const bark = own.m(new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.95 }));
  const oliveLeaf = own.m(swaying(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }), sway, { amount: 0.05, flutter: 0.02 }));
  const olivePose = (o, p) => { o.position.set(p.x, p.y - 0.05, p.z); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s); };
  instanced(olivePart.trunk, bark, olives, 'olive-trunks', olivePose);
  const oliveCrowns = instanced(olivePart.crown, oliveLeaf, olives, 'olive-crowns', olivePose);
  // The olive's grey-green, silvered underneath, a little different tree to tree.
  colourAll(oliveCrowns, olives, (_, i) => [0x7a8660, 0x6f7d58, 0x86906a, 0x74805c][i % 4]);

  // --- date palms: the village's own and a line along the shore east and west ---
  const palms = TREES.filter((t) => t.kind === 'palm').map((t) => ({ x: t.x, z: t.z, y: LEVEL.ground, h: 6.2 + random() * 1.4 }));
  for (const side of [-1, 1]) {
    for (let i = 0; i < (low ? 3 : 8); i += 1) {
      const x = side * (100 + i * 26 + random() * 18);
      const z = -8 + random() * 30;
      const y = terrainHeight(x, z);
      if (y > 0.2) palms.push({ x, z, y, h: 6 + random() * 2.4 });
    }
  }
  const palmTrunk = (() => {
    const g = new THREE.CylinderGeometry(0.2, 0.3, 1, 7, 12);
    g.translate(0, 0.5, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const y = p.getY(i);
      // Rings of old frond bases, and a lean that curves back upright.
      const ring = 1 + 0.08 * Math.max(0, Math.sin(y * 70));
      p.setX(i, p.getX(i) * ring + Math.sin(y * Math.PI) * 0.035);
      p.setZ(i, p.getZ(i) * ring);
    }
    g.computeVertexNormals();
    return own.g(g);
  })();
  const frondGeometry = (() => {
    // A frond: a long strip arched down from the crown, leaflets in the alpha.
    const g = new THREE.PlaneGeometry(3.4, 0.9, 10, 1);
    g.translate(1.7, 0, 0);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i);
      p.setY(i, 0.55 * x - 0.13 * x * x);
      // Leaflets held in a shallow V either side of the rib.
      p.setY(i, p.getY(i) + Math.abs(p.getZ(i)) * 0.35);
    }
    g.computeVertexNormals();
    return own.g(g);
  })();
  const fronds = [];
  const dates = [];
  palms.forEach((palm, index) => {
    const tiers = [[8, 0.55], [7, 0.05], [5, -0.55]];
    let k = 0;
    for (const [n, tilt] of tiers) {
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2 + k * 0.4 + index;
        fronds.push({ x: palm.x, y: palm.y + palm.h, z: palm.z, a, tilt: tilt + (random() - 0.5) * 0.2, s: 0.9 + random() * 0.25 });
      }
      k += 1;
    }
    if (!low) {
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * Math.PI * 2 + index;
        dates.push({ x: palm.x + Math.cos(a) * 0.35, y: palm.y + palm.h - 0.45, z: palm.z + Math.sin(a) * 0.35 });
      }
    }
  });
  instanced(palmTrunk, own.m(new THREE.MeshStandardMaterial({ color: 0x7a6a55, roughness: 0.95 })), palms, 'palm-trunks',
    (o, p) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, 0, 0); o.scale.set(1, p.h, 1); });
  const frondMap = own.t(frondTexture(THREE));
  const frondMaterial = own.m(swaying(new THREE.MeshStandardMaterial({
    color: 0x6b7a3c, map: frondMap, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8,
  }), sway, { amount: 0.1, flutter: 0.05 }));
  const frondMesh = instanced(frondGeometry, frondMaterial, fronds, 'palm-fronds',
    (o, p) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.a, p.tilt, 'YZX'); o.scale.setScalar(p.s); });
  // The lowest tier is the dead skirt: grey-brown, not green.
  colourAll(frondMesh, fronds, (p) => (p.tilt < -0.3 ? 0x8a7a5a : 0x6b7a3c));
  if (dates.length) {
    instanced(own.g(new THREE.SphereGeometry(0.28, 6, 5)), own.m(new THREE.MeshStandardMaterial({ color: 0xa8641e, roughness: 0.7 })), dates, 'palm-dates',
      (o, p) => { o.position.set(p.x, p.y, p.z); o.scale.set(1, 1.5, 1); });
  }

  // --- figs: the two in the village, and a few among the fields ---
  const figs = TREES.filter((t) => t.kind === 'fig').map((t) => ({ x: t.x, z: t.z, y: LEVEL.ground }));
  figs.push(...scatterOn(low ? 2 : 7, { x0: -300, x1: 300, z0: 125, z1: 400 }, (x, z) => open(x, z) && landUse(x, z) !== 'rock'));
  instanced(own.g(new THREE.CylinderGeometry(0.22, 0.4, 2.2, 7).translate(0, 1.1, 0)), bark, figs, 'fig-trunks',
    (o, p) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, 0, 0); o.scale.setScalar(1); });
  const leaves = [];
  const leafCount = low ? 60 : 170;
  figs.forEach((fig) => {
    for (let i = 0; i < leafCount; i += 1) {
      // Leaves over a broad, low dome: a fig is wider than it is tall.
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * 2.9;
      const y = 2.3 + (1 - (r / 2.9) ** 2) * 1.9 + random() * 0.4;
      leaves.push({ x: fig.x + Math.cos(a) * r, y: fig.y + y, z: fig.z + Math.sin(a) * r, rx: random() * 3, ry: random() * 6, s: 0.45 + random() * 0.25 });
    }
  });
  const leafMaterial = own.m(swaying(new THREE.MeshStandardMaterial({
    color: 0x4f6b2f, map: own.t(leafTexture(THREE)), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75,
  }), sway, { amount: 0.03, flutter: 0.06 }));
  instanced(own.g(new THREE.PlaneGeometry(1, 1)), leafMaterial, leaves, 'fig-leaves',
    (o, p) => { o.position.set(p.x, p.y, p.z); o.rotation.set(p.rx, p.ry, 0); o.scale.setScalar(p.s); });

  // --- basalt: loose boulders, and the field walls built from them ---
  const boulderGeometry = (() => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
      // Rounded and pitted, as weathered basalt is; flattened where it sits.
      const k = 1 + 0.18 * Math.sin(x * 5 + y * 3) + 0.12 * Math.cos(z * 6 - x * 2);
      p.setXYZ(i, x * k, Math.max(y * k * 0.72, -0.25), z * k);
    }
    g.computeVertexNormals();
    return own.g(g);
  })();
  const basaltMaterial = own.m(new THREE.MeshStandardMaterial({ color: 0x2f2b28, roughness: 0.92, flatShading: true }));
  const boulders = scatterOn(low ? 90 : high ? 420 : 220, { x0: -800, x1: 800, z0: 90, z1: 800 },
    (x, z) => open(x, z) && Math.hypot(x, z) < 820 && ['rock', 'fallow', 'pasture', 'olive'].includes(landUse(x, z)))
    .map((p) => ({ ...p, s: 0.3 + random() ** 2 * 1.2, r: random() * 6 }));
  instanced(boulderGeometry, basaltMaterial, boulders, 'slope-boulders',
    (o, p) => { o.position.set(p.x, p.y + p.s * 0.1, p.z); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s); });

  const walls = [];
  if (high) {
    // Field walls along the parcel edges nearest the village, stone by stone.
    for (let v = 4; v < 14; v += 1) {
      for (let u = -7; u < 7; u += 1) {
        const bu = u * PARCEL.w;
        const bv = v * PARCEL.d;
        for (let s = 0; s < PARCEL.w; s += 1.8) {
          const x = (bu + s) * Math.cos(PARCEL_ANGLE) - bv * Math.sin(PARCEL_ANGLE);
          const z = (bu + s) * Math.sin(PARCEL_ANGLE) + bv * Math.cos(PARCEL_ANGLE);
          if (!open(x, z) || Math.hypot(x, z) > 360 || landUse(x, z) === 'rock') continue;
          if (hash2(u, v * 7) > 0.55) continue; // not every edge was walled
          walls.push({ x, z, y: terrainHeight(x, z), s: 0.42 + random() * 0.22, r: random() * 6 });
          if (random() < 0.6) walls.push({ x: x + (random() - 0.5) * 0.4, z: z + (random() - 0.5) * 0.4, y: terrainHeight(x, z) + 0.45, s: 0.3 + random() * 0.15, r: random() * 6 });
        }
      }
    }
  }
  if (walls.length) {
    // Twenty faces a stone: at a wall's worth of them, detail is in the count.
    const stone = own.g(new THREE.IcosahedronGeometry(1, 0));
    instanced(stone, basaltMaterial, walls, 'field-walls',
      (o, p) => { o.position.set(p.x, p.y + p.s * 0.35, p.z); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s); });
  }

  // --- the harvest: a threshing floor on the slope above the village ---
  const threshing = { x: -46, z: 168 };
  {
    const y = terrainHeight(threshing.x, threshing.z);
    const floor = new THREE.Mesh(own.g(new THREE.CylinderGeometry(6, 6.2, 0.2, 24)),
      own.m(new THREE.MeshStandardMaterial({ color: 0xb09a6a, roughness: 1 })));
    floor.position.set(threshing.x, y + 0.05, threshing.z);
    floor.receiveShadow = shadows;
    floor.name = 'threshing-floor';
    group.add(floor);
    const sheaves = [];
    for (let i = 0; i < (low ? 8 : 26); i += 1) {
      const a = random() * Math.PI * 2;
      const r = 6.6 + random() * 2.5;
      sheaves.push({ x: threshing.x + Math.cos(a) * r, z: threshing.z + Math.sin(a) * r, y: terrainHeight(threshing.x + Math.cos(a) * r, threshing.z + Math.sin(a) * r), r: random() * 3, lean: (random() - 0.5) * 0.3 });
    }
    // The grain heaped in the middle, waiting for the evening wind to winnow it.
    sheaves.push({ x: threshing.x, z: threshing.z, y: y + 0.15, r: 0, lean: 0, heap: true });
    instanced(own.g(new THREE.CylinderGeometry(0.22, 0.34, 1.1, 6).translate(0, 0.55, 0)),
      own.m(new THREE.MeshStandardMaterial({ color: 0xcaa95c, roughness: 1 })), sheaves, 'harvest-sheaves',
      (o, p) => {
        o.position.set(p.x, p.y, p.z);
        o.rotation.set(p.lean, p.r, 0);
        o.scale.set(p.heap ? 6 : 1, p.heap ? 0.7 : 1, p.heap ? 6 : 1);
      });
  }

  // --- the water's edge beyond the village: reeds, and oleander in flower ---
  const shoreline = [];
  for (let x = -840; x <= 840; x += low ? 9 : 4) {
    if (Math.abs(x) < 96) continue;
    // Walk south from well inland to find where the land meets the water —
    // east of the village the shore turns north-east, so "inland" is far up.
    for (let z = 760; z > -420; z -= 3) {
      if (terrainHeight(x, z) < LEVEL.lake + 0.1) {
        shoreline.push({ x, z: z + 3 });
        break;
      }
    }
  }
  const reeds = [];
  const oleanders = [];
  shoreline.forEach((p) => {
    if (random() < 0.55) reeds.push({ x: p.x + (random() - 0.5) * 3, z: p.z - random() * 3, y: LEVEL.lake - 0.1, s: 0.8 + random() * 0.6, r: random() * 6 });
    if (random() < 0.12) {
      const z = p.z + 3 + random() * 6;
      oleanders.push({ x: p.x, z, y: terrainHeight(p.x, z), s: 0.8 + random() * 0.5, r: random() * 6 });
    }
  });
  const reedGeometry = (() => {
    // A clump: a dozen stems, fanned, each a thin tapering blade.
    const parts = [];
    for (let i = 0; i < 12; i += 1) {
      const blade = new THREE.PlaneGeometry(0.06, 2.4, 1, 3);
      blade.translate(0, 1.2, 0);
      blade.rotateZ((i - 6) * 0.05);
      blade.rotateY((i / 12) * Math.PI);
      blade.translate(Math.cos(i * 2.4) * 0.25, 0, Math.sin(i * 2.4) * 0.25);
      parts.push(blade);
    }
    return own.g(mergeSimple(THREE, parts));
  })();
  if (reeds.length) {
    instanced(reedGeometry, own.m(swaying(new THREE.MeshStandardMaterial({ color: 0x8c8a4c, side: THREE.DoubleSide, roughness: 0.9 }), sway, { amount: 0.35, flutter: 0.08 })),
      reeds, 'shore-reeds', (o, p) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s); }, { cast: false });
  }
  if (oleanders.length) {
    const bush = own.g(new THREE.IcosahedronGeometry(1, 1).translate(0, 0.8, 0));
    const oleander = instanced(bush, own.m(swaying(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }), sway, { amount: 0.06, flutter: 0.03 })),
      oleanders, 'shore-oleander', (o, p) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.r, 0); o.scale.set(p.s * 1.3, p.s, p.s * 1.3); });
    // Dark leaves, and some bushes heavy with the pink flowers of late spring.
    colourAll(oleander, oleanders, (_, i) => (i % 3 === 0 ? 0xb86a78 : 0x3f5a32));
  }

  // --- ground cover at the edges of the village, where nobody walks ---
  const tufts = scatterOn(low ? 120 : 520, { x0: -130, x1: 130, z0: -12, z1: 160 },
    (x, z) => outside(x, z) > 0.5 || (Math.abs(x) > 64 && z > -6) || z > 76);
  const tuftGeometry = (() => {
    const parts = [];
    for (let i = 0; i < 7; i += 1) {
      const blade = new THREE.PlaneGeometry(0.05, 0.45, 1, 2);
      blade.translate(0, 0.22, 0);
      blade.rotateZ((i - 3) * 0.2);
      blade.rotateY((i / 7) * Math.PI);
      parts.push(blade);
    }
    return own.g(mergeSimple(THREE, parts));
  })();
  const tuftMesh = instanced(tuftGeometry, own.m(swaying(new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 1 }), sway, { amount: 0.5, flutter: 0.1 })),
    tufts, 'ground-tufts', (o, p) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, random() * 6, 0); o.scale.setScalar(0.8 + random() * 0.8); }, { cast: false });
  // Spring grass going over: straw and a few still green.
  colourAll(tuftMesh, tufts, (_, i) => (i % 4 === 0 ? 0x7d8a4a : 0xb8a570));
  // Thistles in purple flower, the Galilee spring's last show.
  const thistles = tufts.filter((_, i) => i % 5 === 0).map((p) => ({ ...p, x: p.x + 0.3, z: p.z + 0.2 }));
  if (!low && thistles.length) {
    instanced(own.g(new THREE.IcosahedronGeometry(0.07, 0).translate(0, 0.62, 0)),
      own.m(new THREE.MeshStandardMaterial({ color: 0x8a4f9a, roughness: 0.7 })), thistles, 'thistle-heads',
      (o, p) => { o.position.set(p.x, p.y, p.z); o.scale.setScalar(1); }, { cast: false });
  }

  // --- the far skyline ---
  const ribbons = buildRibbons(THREE, lighting);
  own.g(ribbons.mesh.geometry);
  own.m(ribbons.mesh.material);
  group.add(ribbons.mesh);
  const applyHour = (time) => {
    ribbons.uniforms.uClarity.value = CLARITY[time?.id] ?? 1;
    ribbons.uniforms.uNight.value = time?.id === 'night' ? 1 : 0;
  };
  applyHour(lighting?.current);

  return {
    group,
    terrainHeight,
    landUse,
    // Trees stand in the navigation already (as circles); nothing here needs
    // to stop a camera — the terrain itself is below the rig's floor clamp.
    cameraColliders: [],
    update(elapsed, delta, frame) {
      sway.uTime.value = elapsed;
      const camera = frame?.camera;
      // The mountains keep their bearing wherever you stand.
      if (camera) ribbons.mesh.position.set(camera.position.x, 0, camera.position.z);
    },
    onTimeOfDay: applyHour,
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      group.removeFromParent();
    },
  };
}

// Merges plain position/normal/uv geometries into one — enough for the little
// composite shapes here, without pulling in BufferGeometryUtils.
function mergeSimple(THREE, parts) {
  const merged = new THREE.BufferGeometry();
  const flat = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const total = flat.reduce((sum, g) => sum + g.attributes.position.count, 0);
  for (const name of ['position', 'normal', 'uv']) {
    const size = flat[0].attributes[name].itemSize;
    const array = new Float32Array(total * size);
    let offset = 0;
    for (const g of flat) {
      array.set(g.attributes[name].array, offset);
      offset += g.attributes[name].array.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  parts.forEach((part) => part.dispose());
  flat.forEach((g) => g.dispose());
  return merged;
}
