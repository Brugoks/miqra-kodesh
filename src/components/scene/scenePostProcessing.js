// The image the scenes are rendered through.
//
// Until this existed every scene went straight from the renderer to the canvas,
// which is why the geometry read as an architectural model rather than as a
// place: a plain forward render has no contact. Nothing darkens where two
// surfaces meet, so a column stands *in front of* the pavement instead of *on*
// it, and every corner of every court is exactly as bright as its middle.
// Ambient occlusion is the single biggest correction available, and it costs
// nothing in geometry.
//
// Three passes, in this order, and the order matters:
//
//   GTAO       — contact darkening in the creases. This is the one that does
//                the work; bloom and grade are seasoning on top of it.
//   Bloom      — the gold on the temple facade and the sun off the water. Kept
//                deliberately tight (a high threshold) so it lights up the
//                things that were actually polished metal and leaves the stone
//                alone.
//   Output     — tone mapping and the sRGB conversion. Once a composer is in
//                the chain the renderer stops doing this itself, so removing
//                this pass does not lose an effect, it loses the picture.
//   Grade      — vignette and film grain, applied after the sRGB conversion
//                because that is the space they look right in.
//
// three.js and its postprocessing modules are passed in rather than imported,
// for the same reason the builders take THREE as an argument: this file stays
// importable in jsdom, where there is no WebGL, and the postprocessing chunk is
// only ever fetched by a device that got as far as building a renderer.

// Loads the postprocessing modules. Called from Scene.jsx's boot alongside
// three itself, so the whole 3D payload arrives in one waterfall rather than
// two.
export async function loadPostProcessing() {
  const [
    { EffectComposer },
    { RenderPass },
    { ShaderPass },
    { GTAOPass },
    { UnrealBloomPass },
    { OutputPass },
  ] = await Promise.all([
    import('three/examples/jsm/postprocessing/EffectComposer.js'),
    import('three/examples/jsm/postprocessing/RenderPass.js'),
    import('three/examples/jsm/postprocessing/ShaderPass.js'),
    import('three/examples/jsm/postprocessing/GTAOPass.js'),
    import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
    import('three/examples/jsm/postprocessing/OutputPass.js'),
  ]);
  return {
    EffectComposer, RenderPass, ShaderPass, GTAOPass, UnrealBloomPass, OutputPass,
  };
}

// Vignette and grain. Both are small enough to be deniable one frame at a time
// and obvious the moment you turn them off: the vignette keeps the eye in the
// middle of the frame where the architecture is, and the grain breaks up the
// flat gradients that a sky made of two colours and a shader otherwise shows in
// bands on an 8-bit display.
export const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.34 },
    uGrain: { value: 0.032 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Distance from centre, squared — a soft falloff rather than a ring.
      vec2 centred = vUv - 0.5;
      float falloff = dot(centred, centred);
      color.rgb *= clamp(1.0 - uVignette * falloff * 1.9, 0.0, 1.0);

      // Hash grain. Animated by uTime so it shimmers rather than sitting on
      // the image as a fixed pattern of dirt.
      float noise = fract(sin(dot(vUv * 1024.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      color.rgb += (noise - 0.5) * uGrain;

      gl_FragColor = color;
    }
  `,
};

// AO tuned for architecture at metre scale. The default radius is set for a
// scene a metre across; these courts are three hundred, and an AO radius that
// small never reaches the corner it is meant to darken.
const AO_PARAMETERS = {
  radius: 1.8,
  distanceExponent: 1.4,
  thickness: 1.4,
  // AO on a hill four hundred metres off is noise, not shading, so it is faded
  // out well before the far plane.
  distanceFallOff: 0.6,
  scale: 1.05,
  samples: 16,
};

const DENOISE_PARAMETERS = {
  lumaPhi: 10,
  depthPhi: 2,
  normalPhi: 3,
  radius: 4,
  radiusExponent: 1,
  rings: 2,
  samples: 8,
};

export function createPostProcessing(THREE, modules, options = {}) {
  const {
    renderer,
    world,
    camera,
    width,
    height,
    quality = 'high',
    reducedMotion = false,
    ao = true,
  } = options;

  if (!renderer || !world || !camera || !modules) return null;
  // The whole chain is a high-quality luxury. A phone spends its budget on
  // shadows, the crowd and the smoke instead — see detectQuality in Scene.jsx.
  if (quality === 'low') return null;

  const {
    EffectComposer, RenderPass, ShaderPass, GTAOPass, UnrealBloomPass, OutputPass,
  } = modules;

  const safeWidth = Math.max(1, width || 1);
  const safeHeight = Math.max(1, height || 1);

  const composer = new EffectComposer(renderer);
  composer.setSize(safeWidth, safeHeight);

  composer.addPass(new RenderPass(world, camera));

  let gtao = null;
  if (ao) {
    gtao = new GTAOPass(world, camera, safeWidth, safeHeight);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.9;
    gtao.updateGtaoMaterial(AO_PARAMETERS);
    gtao.updatePdMaterial?.(DENOISE_PARAMETERS);
    composer.addPass(gtao);
  }

  // Threshold high enough that only genuinely bright things bloom: gold in
  // direct sun, the sky at the horizon, a flame. Stone stays stone.
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(safeWidth, safeHeight),
    0.26,
    0.55,
    0.86,
  );
  composer.addPass(bloom);

  composer.addPass(new OutputPass());

  const grade = new ShaderPass({
    uniforms: THREE.UniformsUtils.clone(GRADE_SHADER.uniforms),
    vertexShader: GRADE_SHADER.vertexShader,
    fragmentShader: GRADE_SHADER.fragmentShader,
  });
  composer.addPass(grade);

  return {
    composer,
    gtao,
    bloom,
    grade,

    render(elapsed, delta) {
      // A still grain is a dirty lens; a moving one is film. Someone who asked
      // for reduced motion gets the dirty lens, which is the quieter of the
      // two.
      grade.uniforms.uTime.value = reducedMotion ? 0 : elapsed;
      composer.render(delta);
    },

    setSize(nextWidth, nextHeight) {
      const w = Math.max(1, nextWidth || 1);
      const h = Math.max(1, nextHeight || 1);
      composer.setSize(w, h);
      gtao?.setSize(w, h);
      bloom.setSize(w, h);
    },

    dispose() {
      // Passes own render targets and materials of their own; the composer
      // does not free them for you.
      for (const pass of composer.passes) pass.dispose?.();
      composer.renderTarget1?.dispose();
      composer.renderTarget2?.dispose();
    },
  };
}
