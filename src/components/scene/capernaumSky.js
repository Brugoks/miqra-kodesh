// The air over Capernaum: clouds, haze, mist on the water, smoke from the
// village's fires, dust in the sunbeam, and the sky's own light on everything.
//
// sceneLighting.js owns the sky dome and the sun for every scene and is not
// touched here. This module layers on what one lakeside village at one season
// needs, reading the dome's live uniforms so that changing the hour changes
// all of it at once:
//
//   Clouds. Late spring on the Kinneret is mostly fair: a scatter of cumulus
//   building over the Golan and the hills by day, a little high cirrus, pink
//   and gold underneath at the ends of the day. One draw, fbm in the fragment
//   shader, drifting with the land breeze.
//
//   Haze. The fog colour is derived from the sky's own horizon colour, so the
//   distance dissolves into the sky rather than into a separately chosen
//   brown that sat a quarter darker than it. It is also thinner than the
//   shared default: the far hills carry their own aerial perspective now (see
//   capernaumLandscape.js), and scene fog that thick would swallow them.
//
//   Mist. At dawn the lake breathes a thin mist that lies on the water and
//   burns off through the morning.
//
//   Smoke. A village that bakes its bread at first light sends up smoke from
//   every courtyard oven, and it leans out over the water on the morning land
//   breeze. Built in the vertex shader from time alone: nothing per particle
//   is touched on the CPU.
//
//   Light. A small environment map baked from the same sky, so dark basalt,
//   water jars and timber pick up the sky's colour in their shade and a little
//   of its sheen, instead of reading as matte plastic.
//
// three.js is passed in, so the module stays importable in jsdom.

import { WIND } from './capernaumWeather.js';
import { SKY_SHADER } from './sceneLighting.js';
import { ROOF_OPENING, LEVEL } from './capernaumDimensions.js';

// Per hour: cloud cover and how hazy the air is. Densities are FogExp2's.
export const WEATHER = {
  dawn: { cover: 0.36, fog: 0.0011, mist: 1, smoke: 1 },
  morning: { cover: 0.3, fog: 0.0007, mist: 0.45, smoke: 0.75 },
  noon: { cover: 0.24, fog: 0.0006, mist: 0, smoke: 0.35 },
  dusk: { cover: 0.42, fog: 0.0009, mist: 0.1, smoke: 1 },
  night: { cover: 0.2, fog: 0.0008, mist: 0.25, smoke: 0.55 },
};
const weatherFor = (time) => WEATHER[time?.id] || WEATHER.morning;

// The haze's colour in linear RGB: the sky just above the horizon.
export function fogFor(time) {
  const low = time?.sky?.low || [0.94, 0.83, 0.66];
  const high = time?.sky?.high || [0.29, 0.51, 0.75];
  const mix = 0.1;
  return {
    color: low.map((value, i) => value + (high[i] - value) * mix),
    density: weatherFor(time).fog,
  };
}

// Where the village's fires are: the courtyard ovens and hearths, and a fire
// on the beach where the night's catch is being cooked. Heights are the
// ground the fire stands on.
export const SMOKE_SOURCES = [
  { x: -12, y: 0.9, z: 26, strength: 1 }, // tabun in the yard west of the synagogue lane
  { x: -2, y: 0.9, z: 34, strength: 0.9 }, // tabun north of the lane crossing
  { x: 27, y: 0.4, z: 18, strength: 0.8 }, // the insula courtyard hearth
  { x: 16, y: 1.5, z: 47, strength: 0.7 }, // a court inside the north block
  { x: 49, y: 1.5, z: 11, strength: 0.7 }, // a court inside the east block
  { x: -13, y: 1.5, z: 12, strength: 0.6 }, // a court inside the west block
  { x: -24, y: -0.4, z: -15.5, strength: 0.8 }, // the fishermen's fire on the beach
];

const CLOUD_VERTEX = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const CLOUD_FRAGMENT = `
  uniform vec3 uSun;
  uniform vec3 uLow;
  uniform vec3 uHigh;
  uniform vec3 uGlow;
  uniform float uTime;
  uniform float uCover;
  uniform vec2 uWind;
  varying vec3 vDir;
  float cloudHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float cloudNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(cloudHash(i), cloudHash(i + vec2(1.0, 0.0)), f.x),
               mix(cloudHash(i + vec2(0.0, 1.0)), cloudHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float value = 0.0; float amp = 0.5;
    for (int i = 0; i < 5; i++) { value += cloudNoise(p) * amp; p = p * 2.03 + 11.7; amp *= 0.5; }
    return value;
  }
  void main() {
    vec3 d = normalize(vDir);
    if (d.y < 0.0) discard;
    // Project the dome onto a flat ceiling of cloud, so clouds shrink and
    // crowd together toward the horizon as real ones do.
    vec2 p = d.xz / (d.y + 0.08) * 0.9 + uWind * uTime * 0.004;
    float shape = fbm(p);
    // Cumulus builds over land — the hills to the north, the Golan east —
    // more than over the open water south and south-west.
    float overLand = 0.55 + 0.45 * smoothstep(-0.3, 0.8, dot(normalize(d.xz + 1e-4), normalize(vec2(0.6, 0.8))));
    float cover = uCover * overLand;
    float density = smoothstep(1.0 - cover, 1.0 - cover + 0.22, shape);
    // A few thin streaks of cirrus, much higher.
    float cirrus = smoothstep(0.6, 0.9, fbm(vec2(p.x * 0.35, p.y * 2.2) + 7.0)) * 0.25;
    density = max(density, cirrus * (1.0 - density));
    density *= smoothstep(0.02, 0.2, d.y);
    if (density < 0.01) discard;

    vec3 sun = normalize(uSun);
    float daylight = smoothstep(-0.12, 0.25, sun.y);
    // Lit tops toward the sun, shaded bellies away from it; at the ends of
    // the day the undersides take the glow.
    float facing = max(dot(d, sun), 0.0);
    vec3 lit = mix(uHigh * 0.6 + vec3(0.25), vec3(1.0, 0.98, 0.95), daylight) + uGlow * pow(facing, 3.0) * 0.6;
    vec3 shade = mix(uHigh, uLow, 0.35) * mix(0.35, 0.8, daylight) + uGlow * 0.25 * (1.0 - daylight) * daylight * 4.0;
    vec3 colour = mix(shade, lit, smoothstep(0.35, 0.9, shape));
    colour *= mix(0.25, 1.0, daylight);
    gl_FragColor = vec4(colour, density * 0.92);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Smoke: each particle's whole life is a function of the clock, so the CPU
// never touches one after it is built.
const SMOKE_VERTEX = `
  uniform float uTime;
  uniform vec2 uWind;
  uniform float uStrength;
  attribute vec3 aSource;
  attribute vec3 aSeed; // phase, drift, size
  attribute vec2 aCorner;
  varying float vAlpha;
  varying vec2 vUv;
  varying float vAge;
  #include <fog_pars_vertex>
  void main() {
    float life = 9.0 + aSeed.y * 5.0;
    float age = fract(uTime / life + aSeed.x);
    vAge = age;
    vec3 centre = aSource;
    centre.y += age * (6.0 + aSeed.y * 4.0);
    // Leaning out along the breeze, more the higher it gets, and wandering.
    float lean = pow(age, 1.4) * (5.0 + aSeed.z * 4.0);
    centre.xz += uWind * lean + vec2(sin(age * 6.0 + aSeed.x * 40.0), cos(age * 5.0 + aSeed.y * 30.0)) * age * 0.6;
    float size = mix(0.35, 2.6, age) * (0.8 + aSeed.z * 0.5);
    vec4 mvPosition = viewMatrix * modelMatrix * vec4(centre, 1.0);
    mvPosition.xy += aCorner * size;
    vUv = aCorner * 0.5 + 0.5;
    vAlpha = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.45, 1.0, age)) * uStrength;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const SMOKE_FRAGMENT = `
  uniform vec3 uLight;
  uniform float uEmber;
  varying float vAlpha;
  varying vec2 vUv;
  varying float vAge;
  #include <fog_pars_fragment>
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float puff = (1.0 - smoothstep(0.35, 1.0, r));
    float alpha = puff * vAlpha * 0.42;
    if (alpha < 0.004) discard;
    vec3 colour = uLight * vec3(0.72, 0.7, 0.68);
    // At night the fire lights the foot of its own smoke.
    colour += vec3(1.0, 0.5, 0.2) * uEmber * (1.0 - smoothstep(0.0, 0.18, vAge));
    gl_FragColor = vec4(colour, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// Mist on the water: a few stacked, noisy sheets lying on the lake.
const MIST_VERTEX = `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const MIST_FRAGMENT = `
  uniform float uTime;
  uniform float uAmount;
  uniform vec3 uColour;
  uniform vec2 uWind;
  uniform float uShore;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  float mistHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float mistNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mistHash(i), mistHash(i + vec2(1.0, 0.0)), f.x),
               mix(mistHash(i + vec2(0.0, 1.0)), mistHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    vec2 p = vWorld.xz * 0.02 + uWind * uTime * 0.01;
    float n = mistNoise(p) * 0.6 + mistNoise(p * 2.7) * 0.4;
    // Thickest a little way out from the beach, thinning toward the far water
    // and never lying on the shingle itself.
    float offshore = smoothstep(4.0, 30.0, uShore - vWorld.z) * (1.0 - smoothstep(300.0, 900.0, length(vWorld.xz)));
    float nearCamera = smoothstep(4.0, 26.0, distance(vWorld, cameraPosition));
    float alpha = smoothstep(0.35, 0.85, n) * offshore * nearCamera * uAmount * 0.32;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColour, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function createCapernaumSky(THREE, ctx = {}) {
  const { quality = 'high', lighting = null } = ctx;
  const low = quality === 'low';
  const random = makeRandom(ctx.seed ?? 4417);
  const group = new THREE.Group();
  group.name = 'capernaum-sky';
  const disposables = [];
  const keep = (thing) => { disposables.push(thing); return thing; };
  const shared = lighting?.uniforms || {};
  const live = (key, fallback) => shared[key] ?? { value: fallback };
  const wind = { value: new THREE.Vector2(WIND.x, WIND.z) };
  const time = { value: 0 };

  // --- clouds ---
  const cloudUniforms = {
    uSun: live('uSun', new THREE.Vector3(0.4, 0.4, 0.8)),
    uLow: live('uLow', new THREE.Vector3(0.94, 0.83, 0.66)),
    uHigh: live('uHigh', new THREE.Vector3(0.29, 0.51, 0.75)),
    uGlow: live('uGlow', new THREE.Vector3(1, 0.68, 0.32)),
    uTime: time,
    uCover: { value: 0.3 },
    uWind: wind,
  };
  const clouds = new THREE.Mesh(
    keep(new THREE.SphereGeometry(1400, low ? 24 : 40, low ? 8 : 14, 0, Math.PI * 2, 0, Math.PI / 2)),
    keep(new THREE.ShaderMaterial({
      uniforms: cloudUniforms,
      vertexShader: CLOUD_VERTEX,
      fragmentShader: CLOUD_FRAGMENT,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    })),
  );
  clouds.name = 'sky-clouds';
  clouds.frustumCulled = false;
  clouds.renderOrder = 2;
  group.add(clouds);

  // --- smoke ---
  const smokeUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uStrength: { value: 0.75 },
    uLight: { value: new THREE.Color(0xd8d2c8) },
    uEmber: { value: 0 },
  }]);
  smokeUniforms.uTime = time;
  smokeUniforms.uWind = wind;
  const perSource = low ? 10 : 30;
  const smokeGeometry = keep(new THREE.InstancedBufferGeometry());
  smokeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  smokeGeometry.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
  smokeGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  const sources = [];
  const seeds = [];
  for (const source of SMOKE_SOURCES) {
    const count = Math.round(perSource * source.strength);
    for (let i = 0; i < count; i += 1) {
      sources.push(source.x, source.y, source.z);
      seeds.push(i / count + random() * 0.02, random(), random());
    }
  }
  smokeGeometry.setAttribute('aSource', new THREE.InstancedBufferAttribute(new Float32Array(sources), 3));
  smokeGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 3));
  smokeGeometry.instanceCount = sources.length / 3;
  const smoke = new THREE.Mesh(smokeGeometry, keep(new THREE.ShaderMaterial({
    uniforms: smokeUniforms,
    vertexShader: SMOKE_VERTEX,
    fragmentShader: SMOKE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
  })));
  smoke.name = 'village-smoke';
  smoke.frustumCulled = false;
  smoke.renderOrder = 3;
  group.add(smoke);

  // --- mist on the lake ---
  const mistUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uAmount: { value: 0 },
    uColour: { value: new THREE.Color(0xe8e2d6) },
    uShore: { value: -19 },
  }]);
  mistUniforms.uTime = time;
  mistUniforms.uWind = wind;
  const mistMaterial = keep(new THREE.ShaderMaterial({
    uniforms: mistUniforms,
    vertexShader: MIST_VERTEX,
    fragmentShader: MIST_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  }));
  const mistSheet = keep(new THREE.PlaneGeometry(1800, 1000));
  mistSheet.rotateX(-Math.PI / 2);
  const mist = new THREE.Group();
  mist.name = 'lake-mist';
  for (const [i, height] of (low ? [0.25] : [0.2, 0.9, 1.8]).entries()) {
    const sheet = new THREE.Mesh(mistSheet, mistMaterial);
    sheet.position.set(0, LEVEL.lake + height, -519 - i * 3);
    sheet.renderOrder = 3;
    mist.add(sheet);
  }
  group.add(mist);

  // --- dust in the sunbeam through the roof ---
  let motes = null;
  if (!low) {
    const count = 140;
    const positions = new Float32Array(count * 3);
    const cx = (ROOF_OPENING.x0 + ROOF_OPENING.x1) / 2;
    const cz = (ROOF_OPENING.z0 + ROOF_OPENING.z1) / 2;
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = cx - 0.9 + (random() - 0.5) * 3.2;
      positions[i * 3 + 1] = LEVEL.ground + 0.2 + random() * 2.9;
      positions[i * 3 + 2] = cz + 0.6 + (random() - 0.5) * 2.8;
    }
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    motes = new THREE.Points(geometry, keep(new THREE.PointsMaterial({
      color: 0xffe7c0, size: 0.018, transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    motes.name = 'house-motes';
    motes.userData.base = Float32Array.from(positions);
    group.add(motes);
  }

  const applyHour = (hour) => {
    const weather = weatherFor(hour);
    cloudUniforms.uCover.value = weather.cover;
    mistUniforms.uAmount.value = weather.mist;
    smokeUniforms.uStrength.value = weather.smoke;
    const night = hour?.id === 'night';
    smokeUniforms.uEmber.value = night ? 0.8 : hour?.id === 'dusk' ? 0.3 : 0;
    const light = hour?.hemisphere?.sky ?? 0xbdd6f2;
    smokeUniforms.uLight.value.set(light).lerp(new THREE.Color(0xd8d2c8), 0.5).multiplyScalar(night ? 0.25 : 1);
    mistUniforms.uColour.value.setRGB(...fogFor(hour).color, THREE.LinearSRGBColorSpace);
    if (motes) motes.material.opacity = hour?.id === 'morning' || hour?.id === 'dawn' ? 0.7 : hour?.id === 'noon' ? 0.5 : 0.15;
  };
  applyHour(lighting?.current);

  // --- the sky's light on everything ---
  let environment = null;
  let pmrem = null;
  let renderer = null;
  let world = null;
  function bake() {
    if (!renderer || !world || low) return;
    const envScene = new THREE.Scene();
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: lighting.uniforms,
      vertexShader: SKY_SHADER.vertexShader,
      fragmentShader: SKY_SHADER.fragmentShader,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial);
    envScene.add(dome);
    // The ground under the sky: the dark basalt and dry earth the light comes
    // back off, which is most of what shade is lit by here.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(99, 32), new THREE.MeshBasicMaterial({
      color: lighting.hemisphere?.groundColor ?? 0x6a5a45,
    }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    envScene.add(ground);
    pmrem ||= new THREE.PMREMGenerator(renderer);
    const target = pmrem.fromScene(envScene, 0, 1, 1000);
    environment?.dispose();
    environment = target;
    world.environment = target.texture;
    // A supplement to the hemisphere light, not a second sun.
    if ('environmentIntensity' in world) world.environmentIntensity = 0.45;
    dome.geometry.dispose();
    skyMaterial.dispose();
    ground.geometry.dispose();
    ground.material.dispose();
  }

  return {
    group,
    fogFor,
    onTimeOfDay(hour) {
      applyHour(hour);
      try {
        bake();
      } catch {
        // The environment is a nicety; an hour without it is still an hour.
      }
    },
    prepareRenderer(nextRenderer, nextWorld) {
      if (low || !lighting?.uniforms) return;
      renderer = nextRenderer;
      world = nextWorld;
      bake();
    },
    update(elapsed) {
      time.value = elapsed;
      if (motes) {
        // Turning slowly in the beam: each mote on its own small orbit.
        const position = motes.geometry.attributes.position;
        const base = motes.userData.base;
        for (let i = 0; i < position.count; i += 1) {
          const phase = i * 1.7;
          position.setXYZ(
            i,
            base[i * 3] + Math.sin(elapsed * 0.13 + phase) * 0.25,
            base[i * 3 + 1] + Math.sin(elapsed * 0.07 + phase * 0.5) * 0.3,
            base[i * 3 + 2] + Math.cos(elapsed * 0.11 + phase) * 0.25,
          );
        }
        position.needsUpdate = true;
      }
    },
    dispose() {
      disposables.forEach((thing) => thing.dispose());
      if (world && environment && world.environment === environment.texture) world.environment = null;
      environment?.dispose();
      pmrem?.dispose();
      group.removeFromParent();
    },
  };
}
