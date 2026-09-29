// What every scene built on real ground shares: sampling a baked elevation
// grid, the far skyline as ribbons at true bearings, foliage that moves with
// the wind, and the olive tree.
//
// Capernaum's landscape was the first of these and the Mount of Olives the
// second; the parts that are about land in general rather than one shore live
// here, so a third costs a data bake and a dimensions module rather than a
// copy of the shader.
//
// three.js is passed in, so the module stays importable in jsdom.

import { headingToScene } from './sceneLighting.js';

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// A cheap deterministic hash in [0, 1) for a pair of integers.
export function hash2(i, j) {
  let h = (i * 374761393 + j * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- the ground ---------------------------------------------------------------

// A baked grid is { x0, z0, step, nx, nz, heights }, row by row from (x0, z0)
// with x varying fastest. Outside it the nearest edge value stands in.
function cell(grid, x, z) {
  const { x0, z0, step, nx, nz } = grid;
  const fx = clamp((x - x0) / step, 0, nx - 1.000001);
  const fz = clamp((z - z0) / step, 0, nz - 1.000001);
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  return { i, j, u: fx - i, v: fz - j };
}

// Bilinear: smooth, and what a scene uses when its ground mesh is finer than
// its data or not built from the grid at all.
export function bilinearHeight(grid, x, z) {
  const { nx, heights } = grid;
  const { i, j, u, v } = cell(grid, x, z);
  const a = heights[j * nx + i];
  const b = heights[j * nx + i + 1];
  const c = heights[(j + 1) * nx + i];
  const d = heights[(j + 1) * nx + i + 1];
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

// Exactly the surface a PlaneGeometry built on the grid draws (see
// groundGeometry below): each cell is two triangles split along the diagonal
// from its (x0, z1) corner to its (x1, z0) corner. A bilinear patch bulges
// away from those triangles by up to a quarter of the cell's twist, which on
// fifteen-metre cells of hillside is a foot sunk to the ankle or standing on
// air — so where feet meet the ground, this is the height to ask for.
export function triangleHeight(grid, x, z) {
  const { nx, heights } = grid;
  const { i, j, u, v } = cell(grid, x, z);
  const a = heights[j * nx + i]; // (x0, z0)
  const b = heights[(j + 1) * nx + i]; // (x0, z1)
  const c = heights[(j + 1) * nx + i + 1]; // (x1, z1)
  const d = heights[j * nx + i + 1]; // (x1, z0)
  if (u + v <= 1) return a + u * (d - a) + v * (b - a);
  return c + (1 - u) * (b - c) + (1 - v) * (d - c);
}

// A PlaneGeometry laid on the grid, one vertex per sample, so triangleHeight
// is the surface it draws. `heightAt` may differ from the raw grid (a scene
// flattening a platform, say) provided it is sampled at the grid's own points.
export function groundGeometry(THREE, grid, heightAt = (x, z) => triangleHeight(grid, x, z)) {
  const { x0, z0, step, nx, nz } = grid;
  const width = (nx - 1) * step;
  const depth = (nz - 1) * step;
  const geometry = new THREE.PlaneGeometry(width, depth, nx - 1, nz - 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(x0 + width / 2, 0, z0 + depth / 2);
  const position = geometry.attributes.position;
  for (let k = 0; k < position.count; k += 1) {
    position.setY(k, heightAt(position.getX(k), position.getZ(k)));
  }
  geometry.computeVertexNormals();
  return geometry;
}

// --- the far skyline --------------------------------------------------------------

// How clear each hour is: dawn haze and evening dust against the clearer
// middle of the day. Multiplies a tone's halfHaze.
export const HORIZON_CLARITY = { dawn: 0.55, morning: 1, noon: 1.15, dusk: 0.7, night: 0.8 };

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

// The skyline as one mesh. `ribbons` are a bake's HORIZON_RIBBONS — each
// point [compass bearing, top in scene metres at the ribbon's stand-in
// distance D, real distance in km] — and `tones` maps a ribbon's tone to a
// colour in full sun and the km at which half of it has gone to haze.
// `axes` is the scene's { bearing, xAxis } (sceneLighting.js SCENE_AXES), so a
// bearing lands the same way round the scene is built. The mesh rides with
// the camera (see `follow`), because a mountain ten kilometres off does not
// move when you cross a village.
//
// A flat scene can give heights as absolute scene y. One whose visitor climbs
// a hundred metres cannot — the angle to a fixed height changes with the eye —
// so `relative` heights are metres above the eye they were measured from, and
// the mesh follows the camera up and down as well. A point may carry a fourth
// value, the height of the band's lower edge (a sea seen between a desert and
// the hills beyond it); otherwise a ribbon reaches down under the ground.
export function buildHorizonRibbons(THREE, {
  ribbons, tones, lighting = null, axes = { bearing: 180, xAxis: 90 }, relative = false,
}) {
  const foot = relative ? -200 : -8;
  const positions = [];
  const toneValues = [];
  const hazes = [];
  const indices = [];
  let base = 0;
  const fallback = tones.far || Object.values(tones)[0];
  for (const ribbon of ribbons) {
    const tone = tones[ribbon.tone] || fallback;
    ribbon.points.forEach(([bearing, yTop, km, yBottom = foot]) => {
      const { x: ux, z: uz } = headingToScene(bearing, axes);
      const x = ux * ribbon.D;
      const z = uz * ribbon.D;
      positions.push(x, yTop, z, x, yBottom, z);
      toneValues.push(...tone.colour, ...tone.colour);
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
  geometry.setAttribute('aTone', new THREE.Float32BufferAttribute(toneValues, 3));
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
  return {
    mesh,
    uniforms,
    setHour(time) {
      uniforms.uClarity.value = HORIZON_CLARITY[time?.id] ?? 1;
      uniforms.uNight.value = time?.id === 'night' ? 1 : 0;
    },
    // The mountains keep their bearing wherever you stand.
    follow(camera) {
      if (camera) mesh.position.set(camera.position.x, relative ? camera.position.y : 0, camera.position.z);
    },
  };
}

// --- vegetation -------------------------------------------------------------------

// Bends a foliage material with the wind: displacement along `wind`, growing
// with height above the object's own base, on a slow gust and a quick flutter.
export function swaying(material, uniforms, { amount = 0.18, flutter = 0.03, wind = { x: 1, z: 0 }, key = 'scene' } = {}) {
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
          transformed.x += bend * ${wind.x.toFixed(3)};
          transformed.z += bend * ${wind.z.toFixed(3)};
        }`);
  };
  material.customProgramCacheKey = () => `${key}-sway-${amount}-${flutter}`;
  return material;
}

// The olive: a gnarled trunk that wanders and twists as it rises, and a broad,
// flat-bottomed crown of several lumpy clumps. `age` thickens and hollows the
// trunk toward the old trees of Gethsemane, whose trunks are wider than they
// are tall and split into several stems round an empty heart.
export function oliveTreeGeometry(THREE, { age = 0 } = {}) {
  const girth = 1 + age * 1.6;
  const trunk = new THREE.CylinderGeometry(0.16 * girth, 0.34 * girth, 1.9 - age * 0.35, 5 + Math.round(age * 4), 3, true);
  const position = trunk.attributes.position;
  const height = 1.9 - age * 0.35;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const t = (y + height / 2) / height;
    const x = position.getX(i);
    const z = position.getZ(i);
    const a = Math.atan2(z, x);
    // Old trunks split into stems: deep grooves around the girth.
    const fluting = 1 - age * 0.28 * Math.max(0, Math.cos(a * 3 + t * 2));
    const bentX = x * fluting * (1 + 0.25 * Math.sin(t * 7 + z * 9)) + Math.sin(t * 3.2) * 0.14 * girth;
    position.setX(i, bentX);
    position.setZ(i, z * fluting * (1 + 0.2 * Math.cos(t * 5 + bentX * 7)) + Math.cos(t * 2.6) * 0.1 * girth);
  }
  trunk.translate(0, height / 2, 0);
  trunk.computeVertexNormals();
  const crown = new THREE.IcosahedronGeometry(1, 1);
  const cp = crown.attributes.position;
  for (let i = 0; i < cp.count; i += 1) {
    const x = cp.getX(i); const y = cp.getY(i); const z = cp.getZ(i);
    const lump = 1 + 0.22 * Math.sin(x * 4.1 + z * 3.3) + 0.16 * Math.cos(y * 5.2 + x * 2.1);
    cp.setXYZ(i, x * 2.1 * lump, Math.max(y, -0.35) * 1.25 * lump, z * 2.1 * lump);
  }
  crown.translate(0, 2.9 - age * 0.2, 0);
  crown.computeVertexNormals();
  return { trunk, crown };
}

// Merges plain position/normal/uv geometries into one — enough for the little
// composite shapes the landscapes build, without pulling in BufferGeometryUtils.
export function mergeSimple(THREE, parts) {
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
