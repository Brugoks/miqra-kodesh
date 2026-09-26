// The Sea of Galilee, as seen from its north shore.
//
// The water this replaces was a fixed teal with a fixed sheen: it had no
// lighting and no fog, so at night it was the brightest thing in the scene and
// in the haze it stayed saturated all the way to its edge, which was a straight
// line 900 m out. What a lake actually shows is mostly the sky, bent by its
// ripples — so this one reflects the same sky the dome draws, from the same
// uniforms, and takes its own colour only where you look down into it. The
// Kinneret is fresh water and clear: green-blue over the pebbles near the
// shore, deep blue-green further out.
//
// The swell is displaced from capernaumWeather.js's SWELL_GLSL, so a boat
// riding it on the CPU and the water under it are the same three waves.
//
// three.js is passed in, so the module stays importable in jsdom.

import { SWELL_GLSL, WIND } from './capernaumWeather.js';
import { LEVEL, SHORE } from './capernaumDimensions.js';

// Out to here, inside the 1500 m sky dome; the horizon ribbons stand at
// 900 m and beyond, so the water runs under their feet.
export const WATER_RADIUS = 1450;

const VERTEX = `
  uniform float uTime;
  varying vec3 vWorld;
  varying float vFade;
  ${SWELL_GLSL}
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    // The swell dies away with distance from the village: out where a pixel
    // is metres across, a displaced surface only aliases.
    vFade = 1.0 - smoothstep(180.0, 420.0, length(world.xz));
    world.y += swellAt(world.xz, uTime) * vFade;
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAGMENT = `
  uniform float uTime;
  uniform vec3 uSun;
  uniform vec3 uLow;
  uniform vec3 uHigh;
  uniform vec3 uGlow;
  uniform float uGlowPower;
  uniform float uGlowStrength;
  uniform float uDisc;
  uniform vec3 uSunColour;
  uniform float uSunStrength;
  uniform vec2 uWind;
  uniform float uShore;
  varying vec3 vWorld;
  varying float vFade;
  #include <fog_pars_fragment>

  float waterHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float waterNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(waterHash(i), waterHash(i + vec2(1.0, 0.0)), f.x),
               mix(waterHash(i + vec2(0.0, 1.0)), waterHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // The slope of a noise field, by finite difference: a ripple's normal.
  vec2 rippleSlope(vec2 p) {
    float e = 0.12;
    float c = waterNoise(p);
    return vec2(waterNoise(p + vec2(e, 0.0)) - c, waterNoise(p + vec2(0.0, e)) - c) / e;
  }

  vec3 skyAlong(vec3 d) {
    float h = smoothstep(-0.06, 0.66, d.y);
    vec3 colour = mix(uLow, uHigh, h);
    float s = max(dot(d, normalize(uSun)), 0.0);
    colour += uGlow * pow(s, uGlowPower) * uGlowStrength;
    return colour;
  }

  void main() {
    vec3 toEye = cameraPosition - vWorld;
    float dist = length(toEye);
    vec3 view = toEye / dist;

    // The long swell's normal, then three octaves of ripples scrolling with
    // the breeze at different speeds and angles, faded out where they would
    // be finer than a pixel.
    vec3 n = vec3(0.0, 1.0, 0.0);
    float detail = 1.0 - smoothstep(60.0, 420.0, dist);
    vec2 wind = uWind;
    vec2 across = vec2(-wind.y, wind.x);
    vec2 s1 = rippleSlope(vWorld.xz * 0.35 + wind * uTime * 0.4);
    vec2 s2 = rippleSlope(vWorld.xz * 0.9 + (wind * 0.7 + across * 0.3) * uTime * 0.7);
    vec2 s3 = rippleSlope(vWorld.xz * 2.3 - across * uTime * 1.1);
    // Cat's paws: patches where a gust has roughened the surface.
    float paws = smoothstep(0.55, 0.8, waterNoise(vWorld.xz * 0.012 + wind * uTime * 0.02));
    vec2 slope = s1 * 0.05 + s2 * 0.03 * detail + s3 * 0.018 * detail * detail;
    slope *= 0.8 + paws * 0.9;
    n = normalize(vec3(-slope.x, 1.0, -slope.y));

    // Fresnel: straight down you see into the water, toward the horizon you
    // see the sky in it.
    float cosTheta = max(dot(n, view), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 5.0);
    vec3 reflected = reflect(-view, n);
    reflected.y = abs(reflected.y);
    vec3 sky = skyAlong(reflected);

    // The water's own colour: clear over the pebbles near the shore, deep
    // further out, lit by the sky above it and the sun.
    vec3 sun = normalize(uSun);
    float daylight = smoothstep(-0.1, 0.3, sun.y);
    float depth = clamp((uShore - vWorld.z) / 45.0, 0.0, 1.0);
    vec3 shallow = vec3(0.21, 0.34, 0.3);
    vec3 deep = vec3(0.05, 0.14, 0.17);
    vec3 body = mix(shallow, deep, depth);
    vec3 ambient = mix(uHigh, uLow, 0.4);
    body *= ambient * 0.9 + uSunColour * uSunStrength * max(sun.y, 0.0) * 0.18;

    vec3 colour = mix(body, sky, fresnel);

    // The sun's track: a tight highlight broken up by the ripples into glints.
    vec3 h = normalize(sun + view);
    float spec = pow(max(dot(n, h), 0.0), 380.0);
    float glint = spec * (0.6 + 1.6 * step(0.72, waterNoise(vWorld.xz * 3.1 + uTime * 0.6)));
    colour += uSunColour * uSunStrength * glint * 1.2 * daylight;
    colour += uGlow * uDisc * pow(max(dot(n, h), 0.0), 60.0) * 0.04 * daylight;

    // Where the lake meets the village's beach, the wash runs up and back.
    float toShore = uShore - vWorld.z;
    float wash = sin(uTime * 0.55 + vWorld.x * 0.07) * 0.9;
    float foam = (1.0 - smoothstep(0.0, 2.6, toShore - wash * 0.6)) * step(abs(vWorld.x), 130.0);
    foam *= 0.55 + 0.45 * waterNoise(vWorld.xz * 2.4 + uTime * 0.3);
    colour = mix(colour, mix(ambient, vec3(0.9), daylight) * 0.95, clamp(foam, 0.0, 0.8) * vFade);

    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// A disc of water, dense near the village and coarse far out: rings spaced
// on a square law, so a vertex out at a kilometre covers what a pixel there
// can show and one near the beach can carry the swell.
function waterGeometry(THREE, { rings, segments }) {
  const positions = [0, 0, 0];
  for (let i = 1; i <= rings; i += 1) {
    const r = WATER_RADIUS * (i / rings) ** 2;
    for (let j = 0; j < segments; j += 1) {
      const a = (j / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  const indices = [];
  for (let j = 0; j < segments; j += 1) indices.push(0, 1 + ((j + 1) % segments), 1 + j);
  for (let i = 1; i < rings; i += 1) {
    const inner = 1 + (i - 1) * segments;
    const outer = 1 + i * segments;
    for (let j = 0; j < segments; j += 1) {
      const a = inner + j;
      const b = inner + ((j + 1) % segments);
      const c = outer + j;
      const d = outer + ((j + 1) % segments);
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createGalileeWater(THREE, ctx = {}) {
  const { quality = 'high', lighting = null } = ctx;
  const low = quality === 'low';
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(WIND.x, WIND.z) },
    uShore: { value: SHORE.beachSouth },
    uSunColour: { value: new THREE.Color(0xfff1d4) },
    uSunStrength: { value: 1 },
  }]);
  // Shared, not copied: when the hour changes, the sky dome's uniforms change
  // and the reflection in the water changes with them.
  const shared = lighting?.uniforms || {};
  for (const key of ['uSun', 'uLow', 'uHigh', 'uGlow', 'uGlowPower', 'uGlowStrength', 'uDisc']) {
    uniforms[key] = shared[key] ?? { value: key === 'uSun' ? new THREE.Vector3(0.4, 0.4, 0.8)
      : ['uGlowPower'].includes(key) ? 28 : ['uGlowStrength', 'uDisc'].includes(key) ? 0.5
        : new THREE.Vector3(0.6, 0.7, 0.8) };
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    fog: true,
  });
  const geometry = waterGeometry(THREE, low ? { rings: 36, segments: 72 } : { rings: 72, segments: 144 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'galilee-water';
  mesh.position.y = LEVEL.lake;
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.name = 'capernaum-water';
  group.add(mesh);

  const applyHour = (time) => {
    if (!time?.sun) return;
    uniforms.uSunColour.value.set(time.sun.color);
    uniforms.uSunStrength.value = time.sun.intensity / 2.6;
  };
  applyHour(lighting?.current);

  return {
    group,
    mesh,
    update(elapsed) {
      uniforms.uTime.value = elapsed;
    },
    onTimeOfDay: applyHour,
    dispose() {
      geometry.dispose();
      material.dispose();
      group.removeFromParent();
    },
  };
}
