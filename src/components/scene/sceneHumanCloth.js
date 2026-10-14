// What makes a person's cloth read as cloth rather than as painted plastic.
// Four things, all of them cheap enough for the instanced crowd, and all of
// them through the same hooks the dye and the skinning already use:
//
//   * a weave — a small tiling thread pattern, as colour and as relief, so a
//     veil has a grain where it was a flat tint;
//   * light through thin cloth — a veil with the sun behind it glows, and the
//     tint it glows with is its own dye;
//   * a fuzz at grazing angles, which is what separates wool and linen from
//     a plastic sheet in a way nothing else does;
//   * occlusion in the folds and a stir at the hem — a per-vertex `aCloth`
//     (occlusion, how free to move), baked once from the geometry.
//
// None of it is cloth simulation. The cloth still follows the skeleton; it
// only looks like it was woven, and shifts a centimetre or two in the air.

// --- the shared clock ---------------------------------------------------------

// One clock for every cloth in the scene. Whoever updates the people writes
// it; every material reads it. A frozen clock (reduced motion hands the
// builders a time of 0) is the rest pose, because the flutter below is
// measured against the cloth's own position at time zero.
export const CLOTH_CLOCK = { uClothTime: { value: 0 } };

export function setClothTime(seconds) {
  CLOTH_CLOCK.uClothTime.value = Number.isFinite(seconds) ? seconds : 0;
}

// --- the weave ----------------------------------------------------------------

// Metres one tile of the weave covers, and the threads across it. Sixteen
// threads over eight centimetres is a coarse hand-spun cloth: five millimetres
// a thread, which is as fine as the eye resolves at the distance these people
// are seen from. Finer would only shimmer.
export const WEAVE_TILE = 0.08;
const WEAVE_THREADS = 16;
const WEAVE_SIZE = 128;
// The pattern averages a little under one so it can be brighter than a thread
// ever is, and this brings the average back to one: a scan or a weave must
// add grain, never change the colour of the dye it sits under.
export const WEAVE_GAIN = 1.1;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The pattern as bytes: a plain weave (each thread over one, under one) in
// which every thread has its own thickness, and a slow mottling of how evenly
// it was spun. Exported for the tests, which check that it tiles and that it
// averages to one.
export function weaveBytes(size = WEAVE_SIZE, threads = WEAVE_THREADS, seed = 20) {
  const random = mulberry32(seed);
  const warp = Array.from({ length: threads }, () => 0.86 + random() * 0.28);
  const weft = Array.from({ length: threads }, () => 0.86 + random() * 0.28);
  // Value noise on a small wrapping lattice: the mottling tiles by construction.
  const lattice = 4;
  const cells = Array.from({ length: lattice * lattice }, () => random());
  const smooth = (t) => t * t * (3 - 2 * t);
  const mottle = (x, y) => {
    const fx = (x / size) * lattice;
    const fy = (y / size) * lattice;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const at = (i, j) => cells[(((j % lattice) + lattice) % lattice) * lattice + (((i % lattice) + lattice) % lattice)];
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
  const bytes = new Uint8Array(size * size * 4);
  const cell = size / threads;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cx = x / cell;
      const cy = y / cell;
      const i = Math.floor(cx);
      const j = Math.floor(cy);
      // Where this crossing has the warp on top, the visible thread runs one
      // way and is round across its width; where the weft is, the other.
      const warpOver = (i + j) % 2 === 0;
      const across = warpOver ? cx - i : cy - j;
      const round = Math.sin(Math.PI * across);
      const thread = warpOver ? warp[i] : weft[j];
      const height = (0.4 + 0.6 * round) * thread;
      const grain = 0.94 + 0.12 * mottle(x, y);
      const value = Math.min(1, (0.7 + 0.3 * Math.min(1, height)) * grain);
      const byte = Math.round(value * 255);
      const k = (y * size + x) * 4;
      bytes[k] = byte;
      bytes[k + 1] = byte;
      bytes[k + 2] = byte;
      bytes[k + 3] = 255;
    }
  }
  return bytes;
}

const weaves = new WeakMap();

// The one weave texture, shared by every cloth for as long as the page lives.
// It is 64 KiB and tiles at the same scale everywhere, so nothing owns it:
// nothing disposes it, and it is built at most once per three.js.
export function weaveTexture(THREE) {
  if (!weaves.has(THREE)) {
    const texture = new THREE.DataTexture(weaveBytes(), WEAVE_SIZE, WEAVE_SIZE, THREE.RGBAFormat);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.name = 'cloth-weave';
    texture.needsUpdate = true;
    weaves.set(THREE, texture);
  }
  return weaves.get(THREE);
}

// --- what each kind of cloth is -----------------------------------------------

// `through` is how much of the light on the far face shows on this one (a
// veil is thin; a wool tunic nearly is not); `fuzz` the grazing-angle sheen;
// `sway` the metres of flutter at the freest part of the cloth; `occlusion`
// how far the baked fold darkening is believed. `weave: true` lays the
// procedural weave under the dye; without it the cloth keeps the texture it
// came with and takes its relief from that (`relief`).
export const CLOTH_KINDS = {
  veil: { weave: true, relief: 1.5, through: 0.75, fuzz: 0.1, sway: 0.008, occlusion: 1 },
  headcloth: { weave: true, relief: 1.5, through: 0.5, fuzz: 0.1, sway: 0.005, occlusion: 1 },
  wrap: { weave: true, relief: 1.5, through: 0.3, fuzz: 0.1, sway: 0.006, occlusion: 1 },
  belt: { weave: true, relief: 1.3, through: 0, fuzz: 0.06, sway: 0, occlusion: 1 },
  tunic: { weave: false, relief: 0.8, through: 0.1, fuzz: 0.08, sway: 0.005, occlusion: 1 },
};

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// --- the material -------------------------------------------------------------

const VERTEX_PARS = `
  attribute vec2 aCloth;
  varying float vClothOcc;
  uniform float uClothTime;
`;

function swayCode(amount) {
  return `
    {
      #ifdef USE_INSTANCING
        vec2 clothSeed = instanceMatrix[3].xz;
      #else
        vec2 clothSeed = modelMatrix[3].xz;
      #endif
      float clothBase = dot(transformed.xz, vec2(9.0, 7.0)) + transformed.y * 4.0 + clothSeed.x * 12.9898 + clothSeed.y * 78.233;
      float clothNow = clothBase + uClothTime * 1.9;
      float flutter = sin(clothNow) + 0.45 * sin(clothNow * 2.3 + 1.3)
        - sin(clothBase) - 0.45 * sin(clothBase * 2.3 + 1.3);
      transformed += objectNormal * (aCloth.y * ${amount.toFixed(4)} * flutter);
    }
  `;
}

// Light that reaches the far face of the cloth and the fuzz of its fibres,
// added to the standard direct term. `directLight.color` has already been
// through the shadow map, so a veil in the shade of a wall does not glow.
function directCode(spec) {
  return `
    #include <lights_physical_pars_fragment>
    void RE_Direct_Cloth( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
      RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
      float facing = dot( geometryNormal, directLight.direction );
      vec3 lit = directLight.color * BRDF_Lambert( material.diffuseContribution );
      reflectedLight.directDiffuse += lit * saturate( -facing ) * ${spec.through.toFixed(3)};
      float rim = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 3.0 );
      reflectedLight.directDiffuse += lit * saturate( facing + 0.25 ) * rim * ${spec.fuzz.toFixed(3)};
    }
    #undef RE_Direct
    #define RE_Direct RE_Direct_Cloth
  `;
}

// Gives a material the look of woven cloth. Composes with whatever
// onBeforeCompile the material already has (skinning, dye) and runs after it;
// `THREE` is needed only for the procedural weave. Safe on a geometry with no
// `aCloth`: an unbound attribute reads zero, which is no occlusion and no sway.
export function clothify(THREE, material, kind) {
  const spec = CLOTH_KINDS[kind];
  if (!spec || !material) return material;
  const woven = Boolean(spec.weave && THREE);
  if (woven) {
    const weave = weaveTexture(THREE);
    material.map = weave;
    material.bumpMap = weave;
    material.bumpScale = spec.relief;
  } else if (material.map) {
    // The imported texture already has the weave and the folds in it; its
    // brightness is a fair height map for them.
    material.bumpMap = material.map;
    material.bumpScale = spec.relief;
  }
  material.roughness = 0.94;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uClothTime = CLOTH_CLOCK.uClothTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace(
        '#include <displacementmap_vertex>',
        `#include <displacementmap_vertex>\n  vClothOcc = aCloth.x;\n${spec.sway > 0 ? swayCode(spec.sway) : ''}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n  varying float vClothOcc;')
      .replace('#include <lights_physical_pars_fragment>', directCode(spec))
      // Part of the darkness in a fold is the cloth's own colour, the rest is
      // the light it does not get.
      .replace('#include <color_fragment>', `#include <color_fragment>\n  diffuseColor.rgb *= mix(1.0, 1.0 - vClothOcc, ${(0.45 * spec.occlusion).toFixed(3)});`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
  reflectedLight.indirectDiffuse *= mix(1.0, 1.0 - vClothOcc, ${(0.85 * spec.occlusion).toFixed(3)});
  reflectedLight.directDiffuse *= mix(1.0, 1.0 - vClothOcc, ${(0.3 * spec.occlusion).toFixed(3)});`);
    if (woven) {
      // The weave averages a little under one; bring it back so it never
      // re-colours the dye.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>\n  diffuseColor.rgb *= ${WEAVE_GAIN.toFixed(3)};`);
    }
  };
  material.customProgramCacheKey = () => `${previousKey}-cloth-${kind}-v1`;
  material.needsUpdate = true;
  return material;
}

// --- per-vertex occlusion and flutter ----------------------------------------

// How far round a point the surface is looked at to decide whether it lies
// in a hollow. A distance, not a number of edges, so the dense mesh a person
// is drawn with up close and the coarse one in the crowd agree about where
// the folds are: otherwise someone changing between them would change shade.
const HOLLOW_REACH = 0.07;

// Bakes `aCloth` for a garment that arrived as a mesh (the tunic and sash a
// character was exported with): occlusion where the surface lies in a hollow
// — the armpit, the neck, the crease between the legs, the gap between the
// cloth and the thigh under it — and flutter weight toward the hem.
// Idempotent, because the geometry is the asset's and is shared by every
// person wearing it.
export function ensureClothAttributes(THREE, geometry, kind = 'tunic') {
  if (!geometry || geometry.attributes.aCloth) return geometry;
  const { position, normal } = geometry.attributes;
  if (!position || !normal) return geometry;
  const count = position.count;
  // Seams in the UVs split vertices that are one point on the cloth; weld by
  // position so a seam is not read as the edge of the garment.
  const canon = new Int32Array(count);
  const welded = new Map();
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const key = `${Math.round(position.getX(i) * 2000)}_${Math.round(position.getY(i) * 2000)}_${Math.round(position.getZ(i) * 2000)}`;
    let id = welded.get(key);
    if (id === undefined) {
      id = points.length;
      welded.set(key, id);
      points.push({ x: position.getX(i), y: position.getY(i), z: position.getZ(i), nx: 0, ny: 0, nz: 0, near: [] });
    }
    canon[i] = id;
    const p = points[id];
    p.nx += normal.getX(i);
    p.ny += normal.getY(i);
    p.nz += normal.getZ(i);
  }
  let yMin = Infinity;
  let yMax = -Infinity;
  const cells = new Map();
  const cellOf = (v) => Math.floor(v / HOLLOW_REACH);
  points.forEach((p, id) => {
    const length = Math.hypot(p.nx, p.ny, p.nz) || 1;
    p.nx /= length;
    p.ny /= length;
    p.nz /= length;
    yMin = Math.min(yMin, p.y);
    yMax = Math.max(yMax, p.y);
    const key = `${cellOf(p.x)},${cellOf(p.y)},${cellOf(p.z)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(id);
  });
  // For each point: the cosine of the angle between its normal and the
  // direction to each neighbour within reach, the nearer the more. On a plane
  // that is zero; on a swell, negative; in a hollow, positive — and across the
  // gap between two layers of cloth it is close to one.
  let occlusion = points.map((p, id) => {
    let sum = 0;
    let weight = 0;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          for (const other of cells.get(`${cellOf(p.x) + dx},${cellOf(p.y) + dy},${cellOf(p.z) + dz}`) || []) {
            if (other === id) continue;
            const q = points[other];
            const ox = q.x - p.x; const oy = q.y - p.y; const oz = q.z - p.z;
            const distance = Math.hypot(ox, oy, oz);
            if (distance < 1e-6 || distance > HOLLOW_REACH) continue;
            const w = 1 - distance / HOLLOW_REACH;
            p.near.push(other);
            sum += w * ((ox * p.nx + oy * p.ny + oz * p.nz) / distance);
            weight += w;
          }
        }
      }
    }
    return weight ? Math.min(0.7, Math.max(0, (sum / weight) * 2.6)) : 0;
  });
  // Two passes of smoothing over the same neighbours, so one noisy vertex is
  // not a dark speck.
  for (let pass = 0; pass < 2; pass += 1) {
    occlusion = points.map((p, i) => {
      if (!p.near.length) return occlusion[i];
      let sum = 0;
      for (const id of p.near) sum += occlusion[id];
      return 0.5 * occlusion[i] + 0.5 * (sum / p.near.length);
    });
  }
  const height = yMax - yMin || 1;
  const cloth = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    const p = points[canon[i]];
    cloth[i * 2] = occlusion[canon[i]];
    // Free at the hem and still at the shoulder.
    cloth[i * 2 + 1] = kind === 'tunic' ? 1 - smoothstep(0, 0.45, (p.y - yMin) / height) : 0;
  }
  geometry.setAttribute('aCloth', new THREE.BufferAttribute(cloth, 2));
  return geometry;
}

// --- UVs in metres ------------------------------------------------------------

// A grid of vertices (rows from a pole or an edge, columns around), given a
// texture coordinate in weave tiles measured along the cloth: down each
// column by distance, and around each row by its own length rounded to whole
// tiles so the weave meets itself at the seam. The cloth looks woven at one
// scale however it was stretched into shape.
export function gridWeaveUv(THREE, geometry, columns, rows) {
  const { position } = geometry.attributes;
  const point = (row, column) => [position.getX(row * columns + column), position.getY(row * columns + column), position.getZ(row * columns + column)];
  const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const uv = new Float32Array(position.count * 2);
  const along = new Float32Array(columns);
  for (let row = 0; row < rows; row += 1) {
    let round = 0;
    for (let column = 0; column + 1 < columns; column += 1) round += gap(point(row, column), point(row, column + 1));
    const tiles = Math.max(1, Math.round(round / WEAVE_TILE));
    for (let column = 0; column < columns; column += 1) {
      if (row > 0) along[column] += gap(point(row - 1, column), point(row, column));
      const k = (row * columns + column) * 2;
      uv[k] = (column / (columns - 1)) * tiles;
      uv[k + 1] = along[column] / WEAVE_TILE;
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}
