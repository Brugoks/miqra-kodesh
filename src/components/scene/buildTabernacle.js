// Procedural geometry for the Tabernacle (/scene/tabernacle).
//
// Built from primitives and shader maths, with no downloaded models or images.
// This scene gets more shader work than the others for a reason: almost
// everything in it is either woven cloth or hammered metal, and both of those
// are materials rather than shapes. A linen hanging modelled as a flat rectangle
// with a flat colour reads as painted cardboard no matter how many polygons go
// into it; the same rectangle with a weave, a sag between its hooks and a slow
// ripple along its free edge reads as fabric immediately.
//
// So: a woven-cloth shader for the hangings, the two screens and the veil; a
// hammered-gold shader for the boards and the furniture; the lampstand built as
// real geometry down to the almond cups, because Exodus 25 describes it in that
// much detail and it is the only source of light in the room.
//
// three.js is passed in rather than imported, so this module stays importable
// in jsdom and the 3D chunk is only fetched by the route that renders it.

import { applyLighting, resolveTimeOfDay } from './sceneLighting';
import { ROBE_PALETTE, createCrowd, gather, scatter } from './sceneFigures';
import { createProps, heap } from './sceneProps';
import {
  COURT,
  COURT_GATE,
  TENT,
  VEIL_Z,
  COVERINGS,
  BRONZE_ALTAR,
  LAVER,
  TABLE,
  LAMPSTAND,
  INCENSE_ALTAR,
  ARK,
  CAMP,
  campTents,
} from './tabernacleDimensions';

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Shared GLSL: a cheap value-noise field, used by the sand, the cloud and the
// hammer dimples in the gold.
const NOISE_GLSL = `
  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      total += valueNoise(p) * amplitude;
      p *= 2.03;
      amplitude *= 0.5;
    }
    return total;
  }
`;

export default function buildTabernacle(THREE, options = {}) {
  const { quality = 'high', timeOfDay } = options;
  const low = quality === 'low';

  const root = new THREE.Group();
  root.name = 'tabernacle';
  const random = makeRandom(19450401);
  const dummy = new THREE.Object3D();
  const materialSet = new Set();
  const clocked = []; // materials with a uTime uniform

  const track = (material) => {
    materialSet.add(material);
    return material;
  };
  const standard = (parameters) => track(new THREE.MeshStandardMaterial(parameters));

  const add = (geometry, material, [x, y, z], { cast = true, receive = true, parent = root, name = '' } = {}) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.name = name;
    if (!low) {
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
    }
    parent.add(mesh);
    return mesh;
  };

  // Extents, normalised — a face written as `wall + dir * thickness` runs
  // backwards when dir is -1, and a box with a negative dimension vanishes
  // silently rather than looking wrong.
  const slab = (material, x0, x1, y0, y1, z0, z1, opts) => {
    const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
    const [az, bz] = z0 <= z1 ? [z0, z1] : [z1, z0];
    return add(new THREE.BoxGeometry(bx - ax, by - ay, bz - az), material,
      [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2], opts);
  };

  const instances = (geometry, material, transforms, name, { cast = true } = {}) => {
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    mesh.name = name;
    transforms.forEach((t, i) => {
      dummy.position.set(...t.p);
      dummy.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
      dummy.scale.set(...(t.s || [1, 1, 1]));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    dummy.scale.set(1, 1, 1);
    if (!low) {
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
    }
    root.add(mesh);
    return mesh;
  };

  // --- cloth ---------------------------------------------------------------
  // Linen, on hooks, in a desert. Three things make it read as fabric: the
  // weave itself, the sag between one hook and the next, and the fact that the
  // free bottom edge never stops moving.

  function clothMaterial({ colour = 0xe9e3d3, runLength = 10, height = 2.5, sag = 0.09, embroidered = false, cherubim = false }) {
    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uColour: { value: new THREE.Color(colour) },
        uRun: { value: runLength },
        uHeight: { value: height },
        uSag: { value: sag },
        uSpacing: { value: COURT.postSpacing },
        uEmbroidered: { value: embroidered ? 1 : 0 },
        uCherubim: { value: cherubim ? 1 : 0 },
        uLight: { value: new THREE.Vector3(0.42, 0.72, 0.55) },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uRun;
        uniform float uHeight;
        uniform float uSag;
        uniform float uSpacing;
        varying vec2 vUv;
        varying vec3 vNormalW;
        void main() {
          vUv = uv;
          float along = uv.x * uRun;
          // Hung on hooks a fixed distance apart, so it dips once per bay.
          float bay = fract(along / uSpacing);
          float droop = sin(bay * 3.14159265) * uSag;
          // The top edge is held; the bottom edge is free, and moves most.
          float freedom = 1.0 - uv.y;
          float ripple = sin(along * 1.6 + uTime * 1.5) * 0.055
                       + sin(along * 3.3 - uTime * 2.1) * 0.028;
          vec3 pos = position;
          pos.y -= droop;
          pos.z += ripple * freedom;
          vNormalW = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColour;
        uniform float uRun;
        uniform float uHeight;
        uniform float uEmbroidered;
        uniform float uCherubim;
        uniform vec3 uLight;
        varying vec2 vUv;
        varying vec3 vNormalW;

        void main() {
          vec3 colour = uColour;

          // Bands of blue, purple and scarlet on a linen ground — the three
          // dyes Exodus names for the screens and the veil, every time.
          if (uEmbroidered > 0.5) {
            float band = fract(vUv.x * uRun / 1.6);
            vec3 blue = vec3(0.16, 0.26, 0.50);
            vec3 purple = vec3(0.36, 0.17, 0.38);
            vec3 scarlet = vec3(0.60, 0.15, 0.15);
            vec3 dye = band < 0.33 ? blue : (band < 0.66 ? purple : scarlet);
            float inField = smoothstep(0.07, 0.13, vUv.y) * (1.0 - smoothstep(0.87, 0.93, vUv.y));
            colour = mix(uColour, dye, inField * 0.72);
          }

          // Figures worked into the veil. Deliberately a suggestion of winged
          // forms rather than an attempt at accuracy — nobody knows what they
          // looked like, and a bad guess drawn sharply is worse than a good one
          // drawn softly.
          if (uCherubim > 0.5) {
            vec2 cell = vec2(fract(vUv.x * uRun / 2.5) - 0.5, vUv.y - 0.55);
            float body = 1.0 - smoothstep(0.02, 0.10, abs(cell.x) + abs(cell.y) * 0.4);
            float wingL = 1.0 - smoothstep(0.015, 0.05, abs(length(cell * vec2(1.0, 1.6) + vec2(0.16, 0.0)) - 0.17));
            float wingR = 1.0 - smoothstep(0.015, 0.05, abs(length(cell * vec2(1.0, 1.6) - vec2(0.16, 0.0)) - 0.17));
            float figure = clamp(body + wingL + wingR, 0.0, 1.0);
            figure *= smoothstep(0.16, 0.26, vUv.y) * (1.0 - smoothstep(0.80, 0.90, vUv.y));
            colour = mix(colour, vec3(0.78, 0.63, 0.30), figure * 0.85);
          }

          // The weave: warp over weft, alternating, at roughly thread scale.
          vec2 threads = vec2(vUv.x * uRun, vUv.y * uHeight) * 62.0;
          float over = abs(step(0.5, fract(threads.x * 0.5)) - step(0.5, fract(threads.y * 0.5)));
          colour *= mix(0.90, 1.07, over);
          colour *= 0.97 + 0.03 * sin(threads.y * 3.14159);

          // Lit cheaply and from both sides, because a hanging in a desert is
          // as much backlit as lit — the sun comes through it.
          float facing = abs(dot(normalize(vNormalW), normalize(uLight)));
          colour *= 0.72 + 0.45 * facing;

          gl_FragColor = vec4(colour, 0.985);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    track(material);
    clocked.push(material);
    return material;
  }

  // A hanging run: a subdivided plane so the sag and the ripple have vertices
  // to move. `axis` is which way the run travels.
  function hanging(material, { from, to, height, y = 0, axis }) {
    const length = Math.abs(axis === 'x' ? to[0] - from[0] : to[1] - from[1]);
    const geometry = new THREE.PlaneGeometry(length, height, Math.max(2, Math.round(length * (low ? 1 : 3))), low ? 3 : 8);
    // Lifted by a little more than the sag, so the dip between two hooks does
    // not sink through the sand.
    const mesh = add(geometry, material, [
      (from[0] + to[0]) / 2,
      y + height / 2 + 0.11,
      (from[1] + to[1]) / 2,
    ], { name: 'hanging' });
    if (axis === 'z') mesh.rotation.y = Math.PI / 2;
    return mesh;
  }

  // --- gold ----------------------------------------------------------------
  // "Overlaid with gold" is the most repeated instruction in Exodus. Beaten
  // gold over acacia is not a mirror: it is dimpled, and it catches light in
  // patches rather than evenly.

  function hammered(material, { scale = 26.0, depth = 0.16 } = {}) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uHammerScale = { value: scale };
      shader.uniforms.uHammerDepth = { value: depth };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGoldPos;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 goldPos = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            goldPos = instanceMatrix * goldPos;
          #endif
          vGoldPos = (modelMatrix * goldPos).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vGoldPos;
          uniform float uHammerScale;
          uniform float uHammerDepth;
          ${NOISE_GLSL}`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          // Dimples, in world space so the pattern does not swim across a
          // shape when it is instanced or scaled.
          vec2 hammerUv = vGoldPos.xz * uHammerScale + vGoldPos.y * uHammerScale * 0.7;
          float hx = valueNoise(hammerUv + vec2(0.7, 0.0)) - valueNoise(hammerUv - vec2(0.7, 0.0));
          float hz = valueNoise(hammerUv + vec2(0.0, 0.7)) - valueNoise(hammerUv - vec2(0.0, 0.7));
          normal = normalize(normal + vec3(hx, 0.0, hz) * uHammerDepth);`);
    };
    material.customProgramCacheKey = () => `tabernacle-hammered-${scale}-${depth}`;
    return material;
  }

  const M = {
    gold: hammered(standard({ color: 0xc9a13c, metalness: 0.94, roughness: 0.3 })),
    goldBright: hammered(standard({ color: 0xe0bd63, metalness: 0.95, roughness: 0.22 }), { scale: 44, depth: 0.22 }),
    silver: standard({ color: 0xb9bcc0, metalness: 0.9, roughness: 0.34 }),
    bronze: hammered(standard({ color: 0x7d5a2c, metalness: 0.85, roughness: 0.45 }), { scale: 18, depth: 0.2 }),
    acacia: standard({ color: 0x6b5334, roughness: 0.92 }),
    goatsHair: standard({ color: 0x6c6152, roughness: 1 }),
    ramsSkin: standard({ color: 0x8f3f34, roughness: 0.85 }),
    outerSkin: standard({ color: 0x4f4740, roughness: 0.95 }),
    linenSolid: standard({ color: 0xe8e2d2, roughness: 0.95 }),
    rock: standard({ color: 0x8a6a52, roughness: 1 }),
    ash: standard({ color: 0x4a4038, roughness: 1 }),
    water: standard({ color: 0x4f7d86, roughness: 0.2, metalness: 0.1 }),
    tentCloth: standard({ color: 0x776b56, roughness: 1, side: THREE.DoubleSide }),
    bread: standard({ color: 0xc9a86b, roughness: 0.9 }),
  };

  // --- sky, sun and sand ---------------------------------------------------
  // Sinai, and the sun placed by compass bearing in sceneLighting.js. Night
  // here is the one that matters most: Exodus has the cloud over the dwelling
  // by day and fire in it by night, and the lamps inside were never to go out.

  const lighting = applyLighting(THREE, root, {
    slug: 'tabernacle',
    timeOfDay,
    skyRadius: 1500,
    low,
  });
  const { sun } = lighting;
  sun.target.position.set(0, 2, -4);
  if (!low) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 40;
    sun.shadow.camera.far = 480;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
  }

  // Sand: wind ripples running across the prevailing direction, and enough
  // colour variation that a very large flat plane does not read as a floor.
  const sandMaterial = standard({ color: 0xc0a276, roughness: 1 });
  sandMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSandPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSandPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSandPos;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float ripple = sin(vSandPos.x * 1.9 + fbm(vSandPos.xz * 0.06) * 7.0) * 0.5 + 0.5;
        float drift = fbm(vSandPos.xz * 0.035);
        diffuseColor.rgb *= 0.86 + ripple * 0.10 + drift * 0.16;`);
  };
  sandMaterial.customProgramCacheKey = () => 'tabernacle-sand-v1';

  const sand = add(new THREE.PlaneGeometry(1600, 1600), sandMaterial, [0, 0, 0], { cast: false });
  sand.rotation.x = -Math.PI / 2;

  // Stones scattered about, thicker further from the camp.
  const stones = [];
  for (let i = 0; i < (low ? 70 : 200); i += 1) {
    const angle = random() * Math.PI * 2;
    const distance = 40 + random() * 260;
    stones.push({
      p: [Math.cos(angle) * distance, -0.1 - random() * 0.2, Math.sin(angle) * distance],
      ry: random() * 3,
      s: [0.5 + random() * 2.2, 0.35 + random() * 1.1, 0.5 + random() * 2.0],
    });
  }
  instances(new THREE.DodecahedronGeometry(1, 0), M.rock, stones, 'stones');

  // Sinai itself, and the ranges behind it. Granite, not limestone.
  const mountain = add(new THREE.ConeGeometry(240, 300, 7, 1), M.rock, [-120, -40, -560], { cast: false });
  mountain.rotation.y = 0.4;
  const range = add(new THREE.SphereGeometry(420, 20, 12), M.rock, [340, -290, -520], { cast: false });
  range.scale.set(1.6, 0.8, 1);
  const rangeEast = add(new THREE.SphereGeometry(380, 18, 11), M.rock, [-460, -280, 340], { cast: false });
  rangeEast.scale.set(1.5, 0.72, 1);

  // --- the camp ------------------------------------------------------------

  const tents = campTents();
  instances(
    new THREE.ConeGeometry(1, 1, low ? 5 : 7),
    M.tentCloth,
    tents.map((tent) => ({ p: [tent.x, tent.radius * 0.55, tent.z], ry: tent.rotation, s: [tent.radius, tent.radius * 1.1, tent.radius] })),
    'camp-tents',
  );

  // A standard for each of the four quarters (Numbers 2:2).
  for (const quarter of CAMP) {
    const poleX = quarter.x * 0.72;
    const poleZ = quarter.z * 0.72;
    add(new THREE.CylinderGeometry(0.12, 0.16, 9, 7), M.acacia, [poleX, 4.5, poleZ], { name: `standard-${quarter.id}` });
    const banner = add(new THREE.PlaneGeometry(3.2, 2.2), M.tentCloth, [poleX + 1.7, 7.6, poleZ], { receive: false });
    banner.rotation.y = quarter.id === 'north' || quarter.id === 'south' ? Math.PI / 2 : 0;
  }

  // --- the court -----------------------------------------------------------

  const courtRuns = [
    { from: [COURT.halfX, COURT.zWest], to: [COURT.halfX, COURT.zEast], axis: 'z' },
    { from: [-COURT.halfX, COURT.zWest], to: [-COURT.halfX, COURT.zEast], axis: 'z' },
    { from: [-COURT.halfX, COURT.zWest], to: [COURT.halfX, COURT.zWest], axis: 'x' },
    { from: [-COURT.halfX, COURT.zEast], to: [-COURT_GATE.halfX, COURT.zEast], axis: 'x' },
    { from: [COURT_GATE.halfX, COURT.zEast], to: [COURT.halfX, COURT.zEast], axis: 'x' },
  ];
  for (const run of courtRuns) {
    const length = Math.abs(run.axis === 'x' ? run.to[0] - run.from[0] : run.to[1] - run.from[1]);
    hanging(clothMaterial({ runLength: length, height: COURT.height }), {
      ...run, height: COURT.height,
    });
  }

  // The gate: twenty cubits of colour in the middle of the east end.
  hanging(
    clothMaterial({ runLength: COURT_GATE.halfX * 2, height: COURT.height, embroidered: true, sag: 0.06 }),
    { from: [-COURT_GATE.halfX, COURT.zEast], to: [COURT_GATE.halfX, COURT.zEast], height: COURT.height, axis: 'x' },
  );

  // Posts, with bronze sockets and silver capitals and hooks (27:10-11, 17).
  const posts = [];
  const sockets = [];
  const capitals = [];
  const pushPost = (x, z) => {
    posts.push({ p: [x, COURT.postHeight / 2, z] });
    sockets.push({ p: [x, 0.09, z] });
    capitals.push({ p: [x, COURT.postHeight, z] });
  };
  for (let z = COURT.zWest; z <= COURT.zEast + 0.001; z += COURT.postSpacing) {
    pushPost(COURT.halfX, z);
    pushPost(-COURT.halfX, z);
  }
  for (let x = -COURT.halfX + COURT.postSpacing; x < COURT.halfX - 0.001; x += COURT.postSpacing) {
    pushPost(x, COURT.zWest);
    pushPost(x, COURT.zEast);
  }
  instances(new THREE.CylinderGeometry(COURT.postRadius, COURT.postRadius, COURT.postHeight, low ? 6 : 10), M.acacia, posts, 'court-posts');
  instances(new THREE.CylinderGeometry(0.2, 0.22, 0.18, 8), M.bronze, sockets, 'court-sockets');
  instances(new THREE.SphereGeometry(0.15, 8, 6), M.silver, capitals, 'court-capitals');

  // --- the bronze altar ----------------------------------------------------

  const altarTop = BRONZE_ALTAR.height;
  slab(M.bronze, BRONZE_ALTAR.x - BRONZE_ALTAR.half, BRONZE_ALTAR.x + BRONZE_ALTAR.half,
    0, altarTop, BRONZE_ALTAR.z - BRONZE_ALTAR.half, BRONZE_ALTAR.z + BRONZE_ALTAR.half, { name: 'bronze-altar' });
  // The horns, of one piece with it (27:2).
  for (const hx of [-1, 1]) {
    for (const hz of [-1, 1]) {
      const cornerX = BRONZE_ALTAR.x + hx * (BRONZE_ALTAR.half - 0.14);
      const cornerZ = BRONZE_ALTAR.z + hz * (BRONZE_ALTAR.half - 0.14);
      const horn = add(new THREE.CylinderGeometry(0.07, 0.15, 0.42, 7), M.bronze, [cornerX, altarTop + 0.21, cornerZ]);
      horn.rotation.set(hz * 0.16, 0, -hx * 0.16);
    }
  }
  // The ledge and the grating of network (27:4-5).
  slab(M.bronze, BRONZE_ALTAR.x - BRONZE_ALTAR.half - 0.16, BRONZE_ALTAR.x + BRONZE_ALTAR.half + 0.16,
    altarTop * 0.5, altarTop * 0.5 + 0.1, BRONZE_ALTAR.z - BRONZE_ALTAR.half - 0.16, BRONZE_ALTAR.z + BRONZE_ALTAR.half + 0.16);
  slab(M.ash, BRONZE_ALTAR.x - BRONZE_ALTAR.half + 0.2, BRONZE_ALTAR.x + BRONZE_ALTAR.half - 0.2,
    altarTop - 0.12, altarTop - 0.02, BRONZE_ALTAR.z - BRONZE_ALTAR.half + 0.2, BRONZE_ALTAR.z + BRONZE_ALTAR.half - 0.2, { cast: false });
  // Poles through the rings, because it travelled.
  for (const side of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.06, 0.06, BRONZE_ALTAR.half * 2 + 1.4, 7), M.bronze,
      [BRONZE_ALTAR.x + side * (BRONZE_ALTAR.half + 0.22), altarTop * 0.62, BRONZE_ALTAR.z])
      .rotation.set(Math.PI / 2, 0, 0);
  }

  const altarFire = new THREE.PointLight(0xff9b46, 9, 9, 2);
  altarFire.position.set(BRONZE_ALTAR.x, altarTop + 0.4, BRONZE_ALTAR.z);
  root.add(altarFire);

  // --- the laver -----------------------------------------------------------

  add(new THREE.CylinderGeometry(LAVER.radius * 0.45, LAVER.radius * 0.62, LAVER.height * 0.55, 14), M.bronze,
    [LAVER.x, LAVER.height * 0.28, LAVER.z], { name: 'laver-base' });
  add(new THREE.CylinderGeometry(LAVER.radius, LAVER.radius * 0.78, LAVER.height * 0.5, 18), M.bronze,
    [LAVER.x, LAVER.height * 0.78, LAVER.z], { name: 'laver' });
  const laverWater = add(new THREE.CircleGeometry(LAVER.radius * 0.9, 18), M.water,
    [LAVER.x, LAVER.height * 1.0, LAVER.z], { cast: false });
  laverWater.rotation.x = -Math.PI / 2;

  // --- the tabernacle ------------------------------------------------------
  // Forty-eight boards of acacia plated with gold, each in two sockets of
  // silver, held by five bars a side.

  const boards = [];
  const boardSockets = [];
  const pushBoard = (x, z, ry) => {
    boards.push({ p: [x, TENT.height / 2, z], ry });
    // "Two sockets under one board for its two tenons" (26:19). Ninety-six of
    // them, and the silver was weighed out of the census tax.
    const spread = TENT.boardWidth * 0.28;
    const offset = ry === 0 ? [0, spread] : [spread, 0];
    for (const sign of [-1, 1]) {
      boardSockets.push({ p: [x + sign * offset[0], 0.11, z + sign * offset[1]], ry });
    }
  };

  // Twenty boards on the south side and twenty on the north (26:18, 20).
  for (let z = TENT.zWest + TENT.boardWidth / 2; z < TENT.zEast; z += TENT.boardWidth) {
    pushBoard(TENT.halfX, z, 0);
    pushBoard(-TENT.halfX, z, 0);
  }
  // Six for the west end, and two more for the corners (26:22-23) — which is
  // why the count is forty-eight and not forty-six.
  for (let i = 0; i < 6; i += 1) {
    pushBoard(-TENT.halfX + 0.25 + TENT.boardWidth * (i + 0.5), TENT.zWest, Math.PI / 2);
  }
  for (const side of [-1, 1]) {
    pushBoard(side * (TENT.halfX - TENT.boardWidth * 0.28), TENT.zWest, Math.PI / 2);
  }
  instances(new THREE.BoxGeometry(TENT.boardThickness, TENT.height, TENT.boardWidth * 0.97), M.gold, boards, 'boards');
  instances(new THREE.BoxGeometry(TENT.boardThickness * 2.4, 0.22, TENT.boardWidth * 0.9), M.silver, boardSockets, 'board-sockets');

  // Five bars a side, through rings of gold (26:26-29).
  for (let i = 0; i < 5; i += 1) {
    const y = 0.7 + i * (TENT.height - 1.4) / 4;
    for (const side of [-1, 1]) {
      slab(M.gold, side * TENT.halfX - 0.05, side * TENT.halfX + 0.05, y - 0.06, y + 0.06, TENT.zWest, TENT.zEast, { receive: false });
    }
    slab(M.gold, -TENT.halfX, TENT.halfX, y - 0.06, y + 0.06, TENT.zWest - 0.05, TENT.zWest + 0.05, { receive: false });
  }

  // The four coverings. Their edges are the only place the layering shows, so
  // each one oversails the one beneath it.
  let coverY = TENT.height;
  let oversail = 0.1;
  const coveringMaterials = [M.linenSolid, M.goatsHair, M.ramsSkin, M.outerSkin];
  COVERINGS.forEach((covering, index) => {
    const material = coveringMaterials[index];
    slab(material,
      -TENT.halfX - oversail, TENT.halfX + oversail,
      coverY, coverY + covering.thickness,
      TENT.zWest - oversail, TENT.zEast + oversail,
      { name: `covering-${covering.id}`, receive: index === 0 });
    // and down the outside, where you see the same stack from the side
    if (index > 0) {
      for (const side of [-1, 1]) {
        slab(material,
          side * (TENT.halfX + oversail) - covering.thickness, side * (TENT.halfX + oversail),
          TENT.height * 0.25, coverY, TENT.zWest - oversail, TENT.zEast + oversail, { receive: false });
      }
      slab(material, -TENT.halfX - oversail, TENT.halfX + oversail, TENT.height * 0.25, coverY,
        TENT.zWest - oversail - covering.thickness, TENT.zWest - oversail, { receive: false });
    }
    coverY += covering.thickness;
    oversail += 0.11;
  });

  // The screen at the door, on five pillars.
  hanging(
    clothMaterial({ runLength: TENT.halfX * 2, height: TENT.height, embroidered: true, sag: 0.05 }),
    { from: [-TENT.halfX, TENT.zEast], to: [TENT.halfX, TENT.zEast], height: TENT.height, axis: 'x' },
  );
  for (let i = 0; i < 5; i += 1) {
    const x = -TENT.halfX + (i * TENT.halfX * 2) / 4;
    add(new THREE.CylinderGeometry(0.09, 0.09, TENT.height, 8), M.gold, [x, TENT.height / 2, TENT.zEast + 0.12]);
    add(new THREE.CylinderGeometry(0.17, 0.19, 0.16, 8), M.bronze, [x, 0.08, TENT.zEast + 0.12]);
  }

  // The veil, on four pillars of gold in sockets of silver (26:31-32).
  hanging(
    clothMaterial({ runLength: TENT.halfX * 2, height: TENT.height, embroidered: true, cherubim: true, sag: 0.04 }),
    { from: [-TENT.halfX, VEIL_Z], to: [TENT.halfX, VEIL_Z], height: TENT.height, axis: 'x' },
  );
  for (let i = 0; i < 4; i += 1) {
    const x = -TENT.halfX + 0.3 + (i * (TENT.halfX * 2 - 0.6)) / 3;
    add(new THREE.CylinderGeometry(0.1, 0.1, TENT.height, 8), M.gold, [x, TENT.height / 2, VEIL_Z + 0.14]);
    add(new THREE.CylinderGeometry(0.18, 0.2, 0.18, 8), M.silver, [x, 0.09, VEIL_Z + 0.14]);
  }

  // --- inside the Holy Place -----------------------------------------------

  // The table of showbread: acacia plated with gold, a border a handbreadth
  // wide, and twelve loaves in two rows.
  const tableTop = TABLE.height;
  slab(M.gold, TABLE.x - TABLE.width / 2, TABLE.x + TABLE.width / 2, tableTop - 0.06, tableTop,
    TABLE.z - TABLE.depth / 2, TABLE.z + TABLE.depth / 2, { name: 'table' });
  slab(M.goldBright, TABLE.x - TABLE.width / 2 - 0.03, TABLE.x + TABLE.width / 2 + 0.03, tableTop, tableTop + 0.05,
    TABLE.z - TABLE.depth / 2 - 0.03, TABLE.z + TABLE.depth / 2 + 0.03, { receive: false });
  for (const lx of [-1, 1]) {
    for (const lz of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.04, 0.05, tableTop, 7), M.gold,
        [TABLE.x + lx * (TABLE.width / 2 - 0.07), tableTop / 2, TABLE.z + lz * (TABLE.depth / 2 - 0.06)]);
    }
  }
  const loaves = [];
  for (let row = 0; row < 2; row += 1) {
    for (let i = 0; i < 6; i += 1) {
      loaves.push({
        p: [TABLE.x - TABLE.width / 2 + 0.12 + i * 0.15, tableTop + 0.06 + row * 0.001, TABLE.z + (row ? 0.1 : -0.1)],
        s: [0.12, 0.05, 0.16],
      });
    }
  }
  instances(new THREE.BoxGeometry(1, 1, 1), M.bread, loaves, 'showbread');

  // The altar of incense.
  slab(M.gold, INCENSE_ALTAR.x - INCENSE_ALTAR.half, INCENSE_ALTAR.x + INCENSE_ALTAR.half, 0, INCENSE_ALTAR.height,
    INCENSE_ALTAR.z - INCENSE_ALTAR.half, INCENSE_ALTAR.z + INCENSE_ALTAR.half, { name: 'incense-altar' });
  for (const hx of [-1, 1]) {
    for (const hz of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.03, 0.055, 0.16, 6), M.gold, [
        INCENSE_ALTAR.x + hx * (INCENSE_ALTAR.half - 0.05),
        INCENSE_ALTAR.height + 0.08,
        INCENSE_ALTAR.z + hz * (INCENSE_ALTAR.half - 0.05),
      ]);
    }
  }

  // --- the lampstand -------------------------------------------------------
  // One talent of pure gold, hammered out of a single piece: a shaft, six
  // branches, and on all seven cups made like almond blossoms with their buds
  // and their flowers. The most closely described object in the building, and
  // the only light in the room — so it is built properly.

  const lamp = new THREE.Group();
  lamp.position.set(LAMPSTAND.x, 0, LAMPSTAND.z);
  lamp.name = 'lampstand';
  root.add(lamp);

  const stemRadius = 0.045;
  const shaftHeight = LAMPSTAND.height;

  // Base and shaft.
  add(new THREE.CylinderGeometry(0.1, 0.3, 0.14, 16), M.goldBright, [0, 0.07, 0], { parent: lamp });
  add(new THREE.CylinderGeometry(stemRadius, 0.1, 0.3, 12), M.goldBright, [0, 0.28, 0], { parent: lamp });
  add(new THREE.CylinderGeometry(stemRadius, stemRadius, shaftHeight - 0.4, 12), M.goldBright, [0, shaftHeight / 2 + 0.1, 0], { parent: lamp });

  // A knop (a bud) and its cup. Exodus counts these; the shaft carries four,
  // each branch three.
  const knopGeometry = new THREE.SphereGeometry(0.075, 10, 8);
  const cupGeometry = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.012, 0),
      new THREE.Vector2(0.05, 0.03),
      new THREE.Vector2(0.075, 0.09),
      new THREE.Vector2(0.055, 0.13),
    ],
    low ? 7 : 12,
  );
  const flowerGeometry = new THREE.TorusGeometry(0.055, 0.018, 6, 10);

  const knops = [];
  const cups = [];
  const flowers = [];
  for (let i = 0; i < 4; i += 1) {
    const y = 0.55 + i * (shaftHeight - 0.9) / 3.4;
    knops.push({ p: [0, y, 0] });
    cups.push({ p: [0, y + 0.08, 0] });
    if (i < 3) flowers.push({ p: [0, y - 0.09, 0], rx: Math.PI / 2 });
  }

  // Six branches, three a side, curving out of the shaft and turning up level
  // with its top so all seven lamps stand in a line.
  const branchCurves = [];
  for (let pair = 0; pair < 3; pair += 1) {
    const rise = 0.72 + pair * 0.46;
    const reach = 0.62 - pair * 0.16;
    for (const side of [-1, 1]) {
      const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(0, rise, 0),
        new THREE.Vector3(side * reach * 0.6, rise + 0.05, 0),
        new THREE.Vector3(side * reach, shaftHeight * 0.72, 0),
        new THREE.Vector3(side * reach, shaftHeight - 0.1, 0),
      );
      branchCurves.push({ curve, x: side * reach });
      const tube = add(
        new THREE.TubeGeometry(curve, low ? 12 : 28, stemRadius * 0.86, low ? 5 : 8, false),
        M.goldBright, [0, 0, 0], { parent: lamp },
      );
      tube.name = 'lamp-branch';
      // Three cups, a knop and a flower on every branch (25:33).
      for (let k = 0; k < 3; k += 1) {
        const at = curve.getPoint(0.32 + k * 0.22);
        knops.push({ p: [at.x, at.y, at.z] });
        cups.push({ p: [at.x, at.y + 0.07, at.z] });
      }
    }
  }

  instances(knopGeometry, M.goldBright, knops, 'lamp-knops');
  instances(cupGeometry, M.goldBright, cups, 'lamp-cups');
  instances(flowerGeometry, M.goldBright, flowers, 'lamp-flowers');

  // The seven lamps, and the seven flames.
  const flameMaterial = track(new THREE.MeshBasicMaterial({ color: 0xffd79a, transparent: true, opacity: 0.95 }));
  const lampTops = [0, ...branchCurves.map((branch) => branch.x)];
  const flames = [];
  for (const x of lampTops) {
    const y = shaftHeight - 0.02;
    add(new THREE.LatheGeometry([
      new THREE.Vector2(0.02, 0),
      new THREE.Vector2(0.09, 0.03),
      new THREE.Vector2(0.085, 0.08),
      new THREE.Vector2(0.055, 0.1),
    ], low ? 7 : 12), M.goldBright, [x, y, 0], { parent: lamp });
    const flame = add(new THREE.ConeGeometry(0.03, 0.14, 6), flameMaterial, [x, y + 0.14, 0], { parent: lamp, cast: false, receive: false });
    flames.push(flame);
  }

  // Three lights rather than seven: a row of point lights reads the same at
  // this scale and costs less than half as much.
  const lampLights = [];
  for (const x of [-0.55, 0, 0.55]) {
    const light = new THREE.PointLight(0xffcf8a, 11, 11, 2);
    light.position.set(LAMPSTAND.x + x, shaftHeight, LAMPSTAND.z);
    root.add(light);
    lampLights.push(light);
  }

  // --- behind the veil -----------------------------------------------------
  // Built, and never seen. The room has no light in it and no way into it, and
  // that is the whole argument of the building.

  const ark = new THREE.Group();
  ark.position.set(ARK.x, 0, ARK.z);
  ark.name = 'ark';
  root.add(ark);
  add(new THREE.BoxGeometry(ARK.length, ARK.height, ARK.width), M.gold, [0, ARK.height / 2, 0], { parent: ark });
  add(new THREE.BoxGeometry(ARK.length + 0.06, 0.05, ARK.width + 0.06), M.goldBright, [0, ARK.height + 0.02, 0], { parent: ark, name: 'mercy-seat' });
  for (const side of [-1, 1]) {
    // A cherub of hammered gold at each end, facing inward, wings spread over.
    add(new THREE.ConeGeometry(0.1, 0.34, 8), M.goldBright, [side * (ARK.length / 2 - 0.16), ARK.height + 0.2, 0], { parent: ark });
    add(new THREE.SphereGeometry(0.06, 8, 6), M.goldBright, [side * (ARK.length / 2 - 0.16), ARK.height + 0.42, 0], { parent: ark });
    const wing = add(new THREE.CylinderGeometry(0.015, 0.05, 0.5, 6), M.goldBright,
      [side * (ARK.length / 2 - 0.3), ARK.height + 0.42, 0], { parent: ark });
    wing.rotation.z = side * 1.1;
  }
  for (const side of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.035, 0.035, ARK.length + 0.9, 7), M.gold,
      [0, ARK.height * 0.6, side * (ARK.width / 2 + 0.08)], { parent: ark })
      .rotation.set(0, 0, Math.PI / 2);
  }

  // --- the pillar of cloud -------------------------------------------------
  // The one thing in the scene that everyone in the camp could see.

  const cloudMaterial = track(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vPos;
      varying vec2 vUv;
      void main() { vPos = position; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vPos;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        // Turning slowly, and rising.
        vec2 p = vec2(atan(vPos.z, vPos.x) * 2.2 + uTime * 0.06, vPos.y * 0.045 - uTime * 0.035);
        float density = fbm(p * 3.0) * 0.75 + fbm(p * 7.0) * 0.35;
        // Thin at the top, gathered over the tent, soft at the rim.
        float column = 1.0 - smoothstep(0.35, 1.0, vUv.y);
        float rim = smoothstep(0.0, 0.28, vUv.y);
        float alpha = clamp(density * column * (0.35 + rim * 0.65), 0.0, 0.86);
        vec3 lit = mix(vec3(0.55, 0.57, 0.62), vec3(0.97, 0.95, 0.92), density);
        gl_FragColor = vec4(lit, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  clocked.push(cloudMaterial);
  const cloud = add(
    new THREE.CylinderGeometry(9, 15, 96, low ? 16 : 32, low ? 8 : 20, true),
    cloudMaterial,
    [0, 56, (TENT.zWest + TENT.zEast) / 2],
    { cast: false, receive: false, name: 'pillar-of-cloud' },
  );
  cloud.renderOrder = 3;

  // --- smoke ---------------------------------------------------------------
  // Off the bronze altar in the court, and off the altar of incense inside.

  function smokeColumn(origin, count, spread, rise, size) {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      seeds[i] = random();
      positions[i * 3] = origin[0];
      positions[i * 3 + 1] = origin[1];
      positions[i * 3 + 2] = origin[2];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = track(new THREE.PointsMaterial({
      color: 0xd8d2c6, size, transparent: true, opacity: 0.32, depthWrite: false,
    }));
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    root.add(points);
    return { points, seeds, origin, spread, rise, attribute: geometry.getAttribute('position') };
  }

  const altarSmoke = smokeColumn([BRONZE_ALTAR.x, altarTop + 0.1, BRONZE_ALTAR.z], low ? 60 : 150, 2.6, 26, 2.4);
  const incenseSmoke = smokeColumn([INCENSE_ALTAR.x, INCENSE_ALTAR.height + 0.1, INCENSE_ALTAR.z], low ? 26 : 64, 0.5, 3.4, 0.32);
  const smokes = [altarSmoke, incenseSmoke];
  const SMOKE_LIFE = 11;

  // --- priests and the camp ------------------------------------------------
  // Inside the court: priests in white linen, at the altar and the laver and
  // about the door of the tent. Outside it, Israel — kept at a distance, which
  // is the whole architecture of the thing. Only priests came inside the
  // hangings, so the crowd stops at the gate.

  const figures = [];
  const pick = (list) => list[Math.floor(random() * list.length)];

  // At the altar of burnt offering, which is what the court was mostly for.
  gather(random, [BRONZE_ALTAR.x, BRONZE_ALTAR.z + 2.6], 3, { radius: 1.5 })
    .forEach((spot, i) => figures.push({
      ...spot,
      activity: i === 0 ? 'working' : 'attending',
      colour: 0xf2eee1,
      phase: random() * 12,
    }));

  // At the laver between the altar and the tent — Exodus 30:18-21 has them
  // washing hands and feet there before they go in, on pain of death.
  figures.push({
    x: LAVER.x + 0.75,
    z: LAVER.z,
    y: 0,
    facing: -Math.PI / 2,
    activity: 'working',
    colour: 0xf2eee1,
    phase: random() * 12,
  });

  // At the door of the tent, and along the court inside the hangings.
  for (const spot of [[1.9, 1.2], [-2.4, 4.5], [3.4, 8.5], [-4.1, 12.5]]) {
    figures.push({
      x: spot[0],
      z: spot[1],
      y: 0,
      facing: Math.PI + (random() - 0.5) * 1.4,
      activity: pick(['standing', 'praying', 'bowing']),
      colour: 0xf2eee1,
      phase: random() * 12,
    });
  }

  // Israel, outside the gate at the east end. They are the reason the court
  // has exactly one opening, and they are standing where the text puts them.
  const outsideGroups = low ? 3 : 6;
  for (let g = 0; g < outsideGroups; g += 1) {
    const centre = [
      (random() - 0.5) * 44,
      COURT.zEast + 5 + random() * 22,
    ];
    gather(random, centre, 2 + Math.floor(random() * 4), { radius: 1.1 })
      .forEach((spot, i) => figures.push({
        ...spot,
        activity: i === 0 ? 'talking' : pick(['attending', 'standing']),
        colour: pick(ROBE_PALETTE),
        phase: random() * 12,
        scale: 0.93 + random() * 0.14,
      }));
  }
  // And a few facing the gate, looking in, which is as close as they get.
  scatter(random, low ? 4 : 9, {
    x0: -COURT_GATE.halfX - 3, x1: COURT_GATE.halfX + 3, z0: COURT.zEast + 3, z1: COURT.zEast + 12,
  }).forEach((spot) => figures.push({
    ...spot,
    facing: Math.PI,
    activity: pick(['standing', 'praying', 'kneeling']),
    colour: pick(ROBE_PALETTE),
    phase: random() * 12,
  }));

  const crowd = createCrowd(THREE, { figures, quality, headcloth: 0xeee8da });
  root.add(crowd.group);

  // A camp is a place people live in. Water jars, bundles of firewood for the
  // altar, and baskets, out beyond the court where the tents would be.
  const propItems = [];
  for (let i = 0; i < (low ? 5 : 11); i += 1) {
    const side = random() < 0.5 ? -1 : 1;
    propItems.push(...heap(random, ['waterJar', 'basket', 'sack', 'bundle', 'jar'], {
      at: [side * (COURT.halfX + 6 + random() * 26), COURT.zEast + 4 + random() * 34],
      count: 2 + Math.floor(random() * 4),
      radius: 1.1,
    }));
  }
  // Firewood stacked by the altar: the fire on it was never to go out, and it
  // had to be fed from somewhere. Leviticus 6:12-13.
  propItems.push(...heap(random, ['bundle'], {
    at: [BRONZE_ALTAR.x - 3.2, BRONZE_ALTAR.z - 1.4], count: low ? 3 : 6, radius: 0.75,
  }));

  const props = createProps(THREE, { items: propItems, quality });
  root.add(props.group);

  // --- animation -----------------------------------------------------------

  function update(elapsed) {
    crowd.update(elapsed);
    clocked.forEach((material) => {
      if (material.uniforms?.uTime) material.uniforms.uTime.value = elapsed;
    });

    for (const smoke of smokes) {
      const { attribute, seeds, origin, spread, rise } = smoke;
      for (let i = 0; i < seeds.length; i += 1) {
        const t = ((elapsed + seeds[i] * SMOKE_LIFE) % SMOKE_LIFE) / SMOKE_LIFE;
        const drift = seeds[i] * 6.2831;
        attribute.setXYZ(
          i,
          origin[0] + Math.sin(drift + t * 2.4) * (0.2 + t * spread),
          origin[1] + t * rise,
          origin[2] + Math.cos(drift * 1.6 + t * 1.8) * (0.2 + t * spread * 0.8),
        );
      }
      attribute.needsUpdate = true;
    }

    // The lamps do not burn steadily, and neither does the fire on the altar.
    const flicker = 1 + Math.sin(elapsed * 7.3) * 0.06 + Math.sin(elapsed * 3.1) * 0.04;
    // Lamplight is worth almost nothing at noon and is the whole scene at
    // night, so both the menorah and the altar scale with the hour. The floor
    // of 0.3 is there because the Holy Place has no windows: the lamps are the
    // only light in it whatever the sky is doing.
    const lamp = 0.3 + lighting.current.lamps * 1.4;
    lampLights.forEach((light, index) => {
      light.intensity = 11 * lamp * (flicker + Math.sin(elapsed * 5 + index) * 0.05);
    });
    altarFire.intensity = 9 * (0.5 + lighting.current.lamps) * (1 + Math.sin(elapsed * 4.7) * 0.14);
    flames.forEach((flame, index) => {
      flame.scale.setY(1 + Math.sin(elapsed * 8 + index * 1.7) * 0.16);
    });
  }

  function dispose() {
    root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else if (material) material.dispose();
    });
    materialSet.forEach((material) => material.dispose());
    crowd.dispose();
    props.dispose();
  }

  return {
    root,
    sun,
    lighting,
    update,
    dispose,
    fog: resolveTimeOfDay(timeOfDay).fog,
    exposure: resolveTimeOfDay(timeOfDay).exposure,
  };
}
