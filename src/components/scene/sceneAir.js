// The air over a scene: clouds, haze, mist, smoke from fires, dust in a
// sunbeam, and the sky's own light on everything.
//
// sceneLighting.js owns the sky dome and the sun for every scene and is not
// touched here. This module layers on what a place in the open needs, reading
// the dome's live uniforms so that changing the hour changes all of it at once:
//
//   Clouds. One draw, fbm in the fragment shader, drifting with the wind, and
//   building more over one side of the sky (`land`) than the other.
//
//   Haze. The fog colour is derived from the sky's own horizon colour, so the
//   distance dissolves into the sky rather than into a separately chosen
//   brown. It is thin: the far hills carry their own aerial perspective (see
//   sceneLandscape.js), and scene fog that thick would swallow them.
//
//   Mist. Flat noisy sheets at a height: on a lake they lie on the water; in
//   hill country the ground hides them everywhere but the valley bottoms.
//
//   Smoke. From every fire the scene names, built in the vertex shader from
//   time alone: nothing per particle is touched on the CPU.
//
//   Light. A small environment map baked from the same sky, so stone, jars
//   and timber pick up the sky's colour in their shade and a little of its
//   sheen, instead of reading as matte plastic.
//
// capernaumSky.js is this module with the lakeside village's weather, fires,
// mist and sunbeam. three.js is passed in, so the module stays importable in
// jsdom.

import { SKY_SHADER } from './sceneLighting.js';

// The haze's colour in linear RGB (the sky just above the horizon), and a
// density per hour from a scene's weather table.
export function makeFogFor(weather) {
  const weatherFor = (time) => weather[time?.id] || weather.morning;
  return (time) => {
    const low = time?.sky?.low || [0.94, 0.83, 0.66];
    const high = time?.sky?.high || [0.29, 0.51, 0.75];
    const mix = 0.1;
    return {
      color: low.map((value, i) => value + (high[i] - value) * mix),
      density: weatherFor(time).fog,
    };
  };
}

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
  uniform vec2 uLand;
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
    // Cumulus builds over high ground more than over open water or desert:
    // uLand points toward the side of the sky that gets more of it.
    float overLand = 0.55 + 0.45 * smoothstep(-0.3, 0.8, dot(normalize(d.xz + 1e-4), normalize(uLand)));
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
  attribute float aScale; // a hearth is 1; an altar fire seen across a valley, more
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
    centre.y += age * (6.0 + aSeed.y * 4.0) * aScale;
    // Leaning out along the breeze, more the higher it gets, and wandering.
    float lean = pow(age, 1.4) * (5.0 + aSeed.z * 4.0) * aScale;
    centre.xz += uWind * lean + vec2(sin(age * 6.0 + aSeed.x * 40.0), cos(age * 5.0 + aSeed.y * 30.0)) * age * 0.6 * aScale;
    float size = mix(0.35, 2.6, age) * (0.8 + aSeed.z * 0.5) * aScale;
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

// Mist: a few stacked, noisy sheets. Where the ground rises through a sheet
// the depth test hides it, so a flat sheet lies only on water or pools in a
// valley bottom, which is where mist is.
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
  uniform vec3 uReach; // centre x, z; the radius it starts to fade out at
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
    // Thickest a little way out from a shore (when there is one), thinning
    // with distance and never lying on the shingle itself.
    float offshore = smoothstep(4.0, 30.0, uShore - vWorld.z)
      * (1.0 - smoothstep(uReach.z, uReach.z * 3.0, length(vWorld.xz - uReach.xy)));
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

// ctx:
//   weather      { [hour]: { cover, fog, mist, smoke } } — required
//   wind         { x, z }: the way smoke leans and clouds drift
//   land         { x, z }: the side of the sky clouds build over
//   smokeSources [{ x, y, z, strength, scale? }]
//   mist         { level, heights, heightsLow?, centre: [x, z], size: [w, d], shoreZ?, reach? } or null
//   motes        { centre: [x, y, z], spread: [x, y, z] } or null
//   names        what to call the smoke, mist and motes objects
export function createSceneAir(THREE, ctx = {}) {
  const {
    quality = 'high', lighting = null, weather, name = 'scene-air',
    wind: windDirection = { x: 1, z: 0 }, land = { x: 0.6, z: 0.8 },
    smokeSources = [], mist: mistSpec = null, motes: moteSpec = null,
  } = ctx;
  const names = { smoke: `${name}-smoke`, mist: `${name}-mist`, motes: `${name}-motes`, ...ctx.names };
  const low = quality === 'low';
  const random = makeRandom(ctx.seed ?? 4417);
  const weatherFor = (time) => weather[time?.id] || weather.morning;
  const fogFor = makeFogFor(weather);
  const group = new THREE.Group();
  group.name = name;
  const disposables = [];
  const keep = (thing) => { disposables.push(thing); return thing; };
  const shared = lighting?.uniforms || {};
  const live = (key, fallback) => shared[key] ?? { value: fallback };
  const wind = { value: new THREE.Vector2(windDirection.x, windDirection.z) };
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
    uLand: { value: new THREE.Vector2(land.x, land.z) },
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
  const scales = [];
  for (const source of smokeSources) {
    const count = Math.round(perSource * source.strength);
    for (let i = 0; i < count; i += 1) {
      sources.push(source.x, source.y, source.z);
      seeds.push(i / count + random() * 0.02, random(), random());
      scales.push(source.scale ?? 1);
    }
  }
  smokeGeometry.setAttribute('aSource', new THREE.InstancedBufferAttribute(new Float32Array(sources), 3));
  smokeGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 3));
  smokeGeometry.setAttribute('aScale', new THREE.InstancedBufferAttribute(new Float32Array(scales), 1));
  smokeGeometry.instanceCount = sources.length / 3;
  const smoke = new THREE.Mesh(smokeGeometry, keep(new THREE.ShaderMaterial({
    uniforms: smokeUniforms,
    vertexShader: SMOKE_VERTEX,
    fragmentShader: SMOKE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
  })));
  smoke.name = names.smoke;
  smoke.frustumCulled = false;
  smoke.visible = sources.length > 0;
  smoke.renderOrder = 3;
  group.add(smoke);

  // --- mist ---
  const mistUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uAmount: { value: 0 },
    uColour: { value: new THREE.Color(0xe8e2d6) },
    uShore: { value: mistSpec?.shoreZ ?? 1e6 },
    uReach: { value: new THREE.Vector3(...(mistSpec?.reach ?? [0, 0, 300])) },
  }]);
  mistUniforms.uTime = time;
  mistUniforms.uWind = wind;
  const mist = new THREE.Group();
  mist.name = names.mist;
  if (mistSpec) {
    const mistMaterial = keep(new THREE.ShaderMaterial({
      uniforms: mistUniforms,
      vertexShader: MIST_VERTEX,
      fragmentShader: MIST_FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide,
    }));
    const mistSheet = keep(new THREE.PlaneGeometry(mistSpec.size[0], mistSpec.size[1]));
    mistSheet.rotateX(-Math.PI / 2);
    const heights = low ? (mistSpec.heightsLow ?? mistSpec.heights.slice(0, 1)) : mistSpec.heights;
    heights.forEach((height, i) => {
      const sheet = new THREE.Mesh(mistSheet, mistMaterial);
      sheet.position.set(mistSpec.centre[0], mistSpec.level + height, mistSpec.centre[1] - i * 3);
      sheet.renderOrder = 3;
      mist.add(sheet);
    });
  }
  group.add(mist);

  // --- dust in a sunbeam ---
  let motes = null;
  if (!low && moteSpec) {
    const count = 140;
    const positions = new Float32Array(count * 3);
    const [cx, cy, cz] = moteSpec.centre;
    const [sx, sy, sz] = moteSpec.spread;
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = cx + (random() - 0.5) * sx;
      positions[i * 3 + 1] = cy + random() * sy;
      positions[i * 3 + 2] = cz + (random() - 0.5) * sz;
    }
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    motes = new THREE.Points(geometry, keep(new THREE.PointsMaterial({
      color: 0xffe7c0, size: 0.018, transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    motes.name = names.motes;
    motes.userData.base = Float32Array.from(positions);
    group.add(motes);
  }

  const applyHour = (hour) => {
    const current = weatherFor(hour);
    cloudUniforms.uCover.value = current.cover;
    mistUniforms.uAmount.value = current.mist;
    smokeUniforms.uStrength.value = current.smoke;
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
    // The ground under the sky, which is most of what shade is lit by.
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
