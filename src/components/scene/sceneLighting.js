// Sky, sun and the hour of the day, shared by every scene.
//
// Each of the four builders used to carry its own near-identical copy of a sky
// shader and its own hardcoded sun, which meant every scene was permanently
// fixed at the one morning its author happened to choose. Pulling the four
// copies together costs nothing and buys the thing they could not have
// separately: the same site at dawn, at noon, at dusk and at night, from one
// table of numbers.
//
// That is not decoration. Half of what these places were is when you are
// standing in them — the temple at the hour of the evening sacrifice with the
// light coming in low along the colonnade, the tabernacle at night with the
// pillar of fire over it and the lamps burning inside because Exodus says they
// were never to go out. Those are readings of the text, and until now the
// scenes could not show them.
//
// --- where the sun actually is --------------------------------------------
//
// The scenes disagree about which way round their axes go: the temple has +X
// north and +Z east, Capernaum has +X east and +Z north. A sun placed by hand
// in one scene's coordinates is therefore in the wrong quarter of the sky in
// another, and — worse — it is wrong in a way that looks fine until you notice
// the shadows fall east in the morning.
//
// So the sun is placed by compass bearing and elevation, and converted into
// each scene's own axes using the two numbers the manifest already carries for
// the Google Maps links (see src/lib/googleMaps.js): `bearing`, the heading of
// -Z, and `xAxis`, the heading of +X. One number cannot distinguish the two
// handednesses; these two can.

const DEG = Math.PI / 180;

// The compass heading of +X and -Z for each scene, mirroring `geo` in
// src/lib/scenes.js and the three sibling manifests. A builder has no reason to
// import the manifests — they are prose — so the two numbers it needs are here,
// and sceneLighting.test.js asserts they still agree with the manifests.
export const SCENE_AXES = {
  'second-temple': { bearing: 270, xAxis: 0 },
  caesarea: { bearing: 180, xAxis: 90 },
  capernaum: { bearing: 180, xAxis: 90 },
  tabernacle: { bearing: 270, xAxis: 0 },
};

// A compass heading, in the scene's own horizontal axes. Both axes' headings
// are known, so the component along each is just the cosine of the angle
// between them — which stays correct whichever way round the scene is built.
export function headingToScene(headingDeg, axes) {
  const zHeading = axes.bearing + 180;
  return {
    x: Math.cos((headingDeg - axes.xAxis) * DEG),
    z: Math.cos((headingDeg - zHeading) * DEG),
  };
}

// Unit vector pointing at the sun: azimuth is a compass bearing, elevation is
// degrees above the horizon.
export function sunVector(azimuth, elevation, axes) {
  const flat = headingToScene(azimuth, axes);
  const horizontal = Math.cos(elevation * DEG);
  return {
    x: flat.x * horizontal,
    y: Math.sin(elevation * DEG),
    z: flat.z * horizontal,
  };
}

// --- the hours ------------------------------------------------------------
//
// `morning` reproduces what the scenes looked like before this module existed,
// so the default view of every site is unchanged and the other four hours are
// additions rather than a re-lighting.
//
// `lamps` is a multiplier the builders apply to their own lamp and firelight
// intensities — the tabernacle's menorah, the room light at Capernaum. Daylight
// drowns them; night is when they are the only thing there is.

export const TIMES_OF_DAY = [
  {
    id: 'dawn',
    label: 'Dawn',
    // First light, before the sun has cleared anything.
    azimuth: 78,
    elevation: 4,
    sun: { color: 0xffb46a, intensity: 1.9 },
    hemisphere: { sky: 0xa8bcd8, ground: 0x77604a, intensity: 0.95 },
    sky: {
      low: [0.99, 0.70, 0.45],
      high: [0.31, 0.41, 0.63],
      glow: [1.0, 0.55, 0.26],
      glowPower: 14,
      glowStrength: 0.9,
      disc: 1.4,
      stars: 0.18,
    },
    fog: { color: 0xdcc0a0, density: 0.0022 },
    exposure: 1.02,
    lamps: 0.55,
  },
  {
    id: 'morning',
    label: 'Morning',
    // Solved from the temple's original hand-placed sun at (-120, 130, 300),
    // so centralising the lighting left the default view of every scene
    // exactly where its author put it. sceneLighting.test.js checks it still
    // lands there.
    azimuth: 111.8,
    elevation: 21.9,
    sun: { color: 0xfff1d4, intensity: 2.6 },
    hemisphere: { sky: 0xbdd6f2, ground: 0xb59b74, intensity: 1.45 },
    sky: {
      low: [0.94, 0.83, 0.66],
      high: [0.29, 0.51, 0.75],
      glow: [1.0, 0.68, 0.32],
      glowPower: 28,
      glowStrength: 0.5,
      disc: 2.4,
      stars: 0,
    },
    fog: { color: 0xd8c8a6, density: 0.0013 },
    exposure: 1.05,
    lamps: 0.15,
  },
  {
    id: 'noon',
    label: 'Noon',
    // Nearly overhead at this latitude, which is why nothing has a shadow to
    // stand in and why the courts read as flat and hot.
    azimuth: 178,
    elevation: 74,
    sun: { color: 0xfffaf0, intensity: 3.05 },
    hemisphere: { sky: 0xcfe2fb, ground: 0xc4ad86, intensity: 1.7 },
    sky: {
      low: [0.84, 0.87, 0.87],
      high: [0.21, 0.45, 0.79],
      glow: [1.0, 0.95, 0.85],
      glowPower: 60,
      glowStrength: 0.28,
      disc: 3.0,
      stars: 0,
    },
    fog: { color: 0xd6d2c0, density: 0.0009 },
    exposure: 1.0,
    lamps: 0,
  },
  {
    id: 'dusk',
    label: 'Dusk',
    // The hour of the evening sacrifice, and the hour Luke puts Peter and John
    // going up to the temple to pray.
    azimuth: 283,
    elevation: 5,
    sun: { color: 0xff9a4e, intensity: 2.15 },
    hemisphere: { sky: 0x9382a8, ground: 0x6d5140, intensity: 0.8 },
    sky: {
      low: [1.0, 0.53, 0.29],
      high: [0.21, 0.24, 0.47],
      glow: [1.0, 0.42, 0.2],
      glowPower: 12,
      glowStrength: 1.0,
      disc: 1.6,
      stars: 0.3,
    },
    fog: { color: 0xc9906a, density: 0.0021 },
    exposure: 1.1,
    lamps: 0.85,
  },
  {
    id: 'night',
    label: 'Night',
    // Moonlight, not sunlight: the same directional light with the colour and
    // the intensity of a full moon, which is roughly where the eye puts it.
    azimuth: 300,
    elevation: 38,
    sun: { color: 0x9fb6e8, intensity: 0.5 },
    hemisphere: { sky: 0x2b3b5e, ground: 0x18181f, intensity: 0.32 },
    sky: {
      low: [0.07, 0.09, 0.15],
      high: [0.02, 0.03, 0.09],
      glow: [0.75, 0.82, 1.0],
      glowPower: 90,
      glowStrength: 0.35,
      disc: 1.1,
      stars: 1,
    },
    fog: { color: 0x141c2e, density: 0.0016 },
    exposure: 1.3,
    lamps: 1,
  },
];

export const DEFAULT_TIME_OF_DAY = 'morning';

export function resolveTimeOfDay(id) {
  return TIMES_OF_DAY.find((time) => time.id === id)
    || TIMES_OF_DAY.find((time) => time.id === DEFAULT_TIME_OF_DAY);
}

// --- the sky --------------------------------------------------------------

// One shader for all four scenes, driven entirely by uniforms so the hour can
// change without recompiling anything. It writes a final colour and then runs
// three's tone-mapping and colour-space chunks, exactly as the four shaders it
// replaces did — which are no-ops when the scene is being rendered into the
// post-processing chain's linear buffer, and are applied once at the end by
// OutputPass instead. See scenePostProcessing.js.
export const SKY_SHADER = {
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uSun;
    uniform vec3 uLow;
    uniform vec3 uHigh;
    uniform vec3 uGlow;
    uniform float uGlowPower;
    uniform float uGlowStrength;
    uniform float uDisc;
    uniform float uStars;
    varying vec3 vDir;

    float hash13(vec3 p) {
      return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    }

    void main() {
      vec3 d = normalize(vDir);

      // Horizon to zenith. The band is deliberately wide and starts slightly
      // below zero so the join with distant geometry is never a hard line.
      float h = smoothstep(-0.06, 0.66, d.y);
      vec3 colour = mix(uLow, uHigh, h);

      // The sun: a broad glow for the haze around it and a tight disc for the
      // sun itself. Two powers of the same dot product.
      float s = max(dot(d, normalize(uSun)), 0.0);
      colour += uGlow * pow(s, uGlowPower) * uGlowStrength;
      colour += uGlow * pow(s, 2000.0) * uDisc;

      // Stars, on a hashed grid, fading out toward the horizon where the haze
      // would swallow them and vanishing entirely below it.
      if (uStars > 0.001) {
        vec3 sd = d * 230.0;
        vec3 cell = floor(sd);
        vec3 offset = fract(sd) - 0.5;
        float pick = hash13(cell);
        float bright = smoothstep(0.9885, 1.0, pick);
        float point = bright * smoothstep(0.36, 0.0, length(offset));
        colour += vec3(0.92, 0.94, 1.0) * point * uStars * smoothstep(-0.02, 0.3, d.y);
      }

      gl_FragColor = vec4(colour, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

// How far out the sun is placed. Only the direction matters to a directional
// light, but the shadow camera is positioned from it, so it wants to be well
// clear of the geometry and not so far that the shadow frustum has no
// precision left.
const SUN_DISTANCE = 220;

// Builds the sky dome, the hemisphere fill and the sun, and returns a handle
// that can re-point all three at a different hour without rebuilding anything.
//
// The sun is returned rather than fully configured here because its shadow
// camera has to be sized to the scene it is lighting, and only the builder
// knows how big that is.
export function applyLighting(THREE, root, options = {}) {
  const {
    slug,
    axes = SCENE_AXES[slug] || { bearing: 270, xAxis: 0 },
    timeOfDay = DEFAULT_TIME_OF_DAY,
    skyRadius = 1500,
    low = false,
  } = options;

  let current = resolveTimeOfDay(timeOfDay);
  const direction = sunVector(current.azimuth, current.elevation, axes);

  const uniforms = {
    uSun: { value: new THREE.Vector3(direction.x, direction.y, direction.z) },
    uLow: { value: new THREE.Vector3(...current.sky.low) },
    uHigh: { value: new THREE.Vector3(...current.sky.high) },
    uGlow: { value: new THREE.Vector3(...current.sky.glow) },
    uGlowPower: { value: current.sky.glowPower },
    uGlowStrength: { value: current.sky.glowStrength },
    uDisc: { value: current.sky.disc },
    uStars: { value: current.sky.stars },
  };

  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: SKY_SHADER.vertexShader,
    fragmentShader: SKY_SHADER.fragmentShader,
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(skyRadius, low ? 24 : 32, low ? 12 : 16),
    skyMaterial,
  );
  sky.frustumCulled = false;
  sky.castShadow = false;
  sky.receiveShadow = false;
  root.add(sky);

  const hemisphere = new THREE.HemisphereLight(
    current.hemisphere.sky,
    current.hemisphere.ground,
    current.hemisphere.intensity,
  );
  root.add(hemisphere);

  const sun = new THREE.DirectionalLight(current.sun.color, current.sun.intensity);
  sun.position.set(
    direction.x * SUN_DISTANCE,
    direction.y * SUN_DISTANCE,
    direction.z * SUN_DISTANCE,
  );
  root.add(sun, sun.target);

  const point = (id) => {
    const time = resolveTimeOfDay(id);
    const next = sunVector(time.azimuth, time.elevation, axes);
    uniforms.uSun.value.set(next.x, next.y, next.z);
    uniforms.uLow.value.set(...time.sky.low);
    uniforms.uHigh.value.set(...time.sky.high);
    uniforms.uGlow.value.set(...time.sky.glow);
    uniforms.uGlowPower.value = time.sky.glowPower;
    uniforms.uGlowStrength.value = time.sky.glowStrength;
    uniforms.uDisc.value = time.sky.disc;
    uniforms.uStars.value = time.sky.stars;

    hemisphere.color.set(time.hemisphere.sky);
    hemisphere.groundColor.set(time.hemisphere.ground);
    hemisphere.intensity = time.hemisphere.intensity;

    sun.color.set(time.sun.color);
    sun.intensity = time.sun.intensity;
    // The shadow camera follows the light, and three recomputes it from the
    // light's world matrix — which will not have been updated yet this frame.
    sun.position.set(next.x * SUN_DISTANCE, next.y * SUN_DISTANCE, next.z * SUN_DISTANCE);
    sun.updateMatrixWorld?.(true);

    current = time;
    return time;
  };

  return {
    sky,
    skyMaterial,
    hemisphere,
    sun,
    direction,
    uniforms,
    // Read by the builders' update() so lamp and fire intensities track the
    // hour without every builder having to subscribe to anything.
    get current() {
      return current;
    },
    setTimeOfDay: point,
  };
}
