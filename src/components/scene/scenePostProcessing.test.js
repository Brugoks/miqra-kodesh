import { describe, it, expect, vi } from 'vitest';
import { createPostProcessing, GRADE_SHADER } from './scenePostProcessing';

// There is no WebGL in jsdom, so the chain is built against stand-ins for
// three's postprocessing passes. What is worth asserting here is not what the
// image looks like — nothing in CI can see it — but the things that break
// silently: the order of the passes, that the output conversion is present at
// all, that a resize reaches every pass that owns a render target, and that
// disposal frees them.

function makePass(name) {
  return class Pass {
    constructor(...args) {
      this.name = name;
      this.args = args;
      this.dispose = vi.fn();
      this.setSize = vi.fn();
      this.uniforms = args[0]?.uniforms;
    }
  };
}

function makeModules() {
  class Composer {
    constructor(renderer) {
      this.renderer = renderer;
      this.passes = [];
      this.renderTarget1 = { dispose: vi.fn() };
      this.renderTarget2 = { dispose: vi.fn() };
      this.setSize = vi.fn();
      this.render = vi.fn();
    }

    addPass(pass) {
      this.passes.push(pass);
    }
  }

  class GTAOPass {
    static OUTPUT = { Default: 0, AO: 4 };

    constructor(world, camera, width, height) {
      this.name = 'gtao';
      this.size = [width, height];
      this.output = -1;
      this.blendIntensity = 1;
      this.updateGtaoMaterial = vi.fn();
      this.updatePdMaterial = vi.fn();
      this.setSize = vi.fn();
      this.dispose = vi.fn();
    }
  }

  return {
    EffectComposer: Composer,
    RenderPass: makePass('render'),
    ShaderPass: makePass('shader'),
    GTAOPass,
    UnrealBloomPass: makePass('bloom'),
    OutputPass: makePass('output'),
  };
}

const THREE = {
  Vector2: class { constructor(x, y) { this.x = x; this.y = y; } },
  UniformsUtils: { clone: (uniforms) => JSON.parse(JSON.stringify(uniforms)) },
};

const options = () => ({
  renderer: { getPixelRatio: () => 1, getSize: () => ({ width: 800, height: 600 }) },
  world: {},
  camera: {},
  width: 800,
  height: 600,
  quality: 'high',
});

describe('createPostProcessing', () => {
  it('builds the chain in the order the image depends on', () => {
    const post = createPostProcessing(THREE, makeModules(), options());
    expect(post.composer.passes.map((p) => p.name)).toEqual([
      'render', 'gtao', 'bloom', 'output', 'shader',
    ]);
  });

  it('always includes the output conversion, without which there is no picture', () => {
    // Once a composer is in the chain the renderer stops applying tone mapping
    // and the sRGB conversion itself, so dropping this pass does not soften an
    // effect — it washes the whole scene out.
    const post = createPostProcessing(THREE, makeModules(), options());
    expect(post.composer.passes.some((p) => p.name === 'output')).toBe(true);
    // And it comes after everything that works in linear space.
    const names = post.composer.passes.map((p) => p.name);
    expect(names.indexOf('output')).toBeGreaterThan(names.indexOf('bloom'));
  });

  it('tunes the AO for a scene measured in hundreds of metres', () => {
    const post = createPostProcessing(THREE, makeModules(), options());
    const [parameters] = post.gtao.updateGtaoMaterial.mock.calls[0];
    // three's default radius is set for a scene about a metre across; these
    // courts are three hundred, and a radius that small never reaches the
    // corner it is meant to darken.
    expect(parameters.radius).toBeGreaterThan(1);
    expect(parameters.distanceFallOff).toBeGreaterThan(0);
    expect(parameters.distanceFallOff).toBeLessThan(1);
    expect(post.gtao.output).toBe(0);
  });

  it('keeps the bloom threshold high, so stone does not glow', () => {
    const post = createPostProcessing(THREE, makeModules(), options());
    const [, strength, , threshold] = post.bloom.args;
    expect(threshold).toBeGreaterThan(0.7);
    expect(strength).toBeLessThan(0.5);
  });

  it('is refused on a low-quality device, which spends its budget elsewhere', () => {
    expect(createPostProcessing(THREE, makeModules(), { ...options(), quality: 'low' })).toBeNull();
  });

  it('is refused rather than half-built when a dependency is missing', () => {
    expect(createPostProcessing(THREE, null, options())).toBeNull();
    expect(createPostProcessing(THREE, makeModules(), { ...options(), renderer: null })).toBeNull();
    expect(createPostProcessing(THREE, makeModules(), { ...options(), camera: null })).toBeNull();
  });

  it('can leave the AO out and still produce a chain', () => {
    const post = createPostProcessing(THREE, makeModules(), { ...options(), ao: false });
    expect(post.gtao).toBeNull();
    expect(post.composer.passes.map((p) => p.name)).toEqual(['render', 'bloom', 'output', 'shader']);
    expect(() => post.setSize(400, 300)).not.toThrow();
    expect(() => post.dispose()).not.toThrow();
  });

  it('carries a resize to every pass that owns a render target', () => {
    const post = createPostProcessing(THREE, makeModules(), options());
    post.setSize(1024, 768);
    expect(post.composer.setSize).toHaveBeenCalledWith(1024, 768);
    expect(post.gtao.setSize).toHaveBeenCalledWith(1024, 768);
    expect(post.bloom.setSize).toHaveBeenCalledWith(1024, 768);
  });

  it('refuses a zero-sized stage rather than building a zero-sized target', () => {
    const post = createPostProcessing(THREE, makeModules(), { ...options(), width: 0, height: 0 });
    expect(post.gtao.size).toEqual([1, 1]);
    post.setSize(0, 0);
    expect(post.composer.setSize).toHaveBeenCalledWith(1, 1);
  });

  it('animates the grain, and holds it still for reduced motion', () => {
    const moving = createPostProcessing(THREE, makeModules(), options());
    moving.render(12.5, 0.016);
    expect(moving.grade.uniforms.uTime.value).toBe(12.5);
    expect(moving.composer.render).toHaveBeenCalledWith(0.016);

    const still = createPostProcessing(THREE, makeModules(), { ...options(), reducedMotion: true });
    still.render(12.5, 0.016);
    expect(still.grade.uniforms.uTime.value).toBe(0);
  });

  it('frees every pass and both ping-pong buffers on disposal', () => {
    const post = createPostProcessing(THREE, makeModules(), options());
    const passes = [...post.composer.passes];
    post.dispose();
    for (const pass of passes) expect(pass.dispose).toHaveBeenCalled();
    expect(post.composer.renderTarget1.dispose).toHaveBeenCalled();
    expect(post.composer.renderTarget2.dispose).toHaveBeenCalled();
  });

  it('gives each chain its own grade uniforms', () => {
    const a = createPostProcessing(THREE, makeModules(), options());
    const b = createPostProcessing(THREE, makeModules(), options());
    a.grade.uniforms.uTime.value = 99;
    expect(b.grade.uniforms.uTime.value).toBe(0);
  });
});

describe('GRADE_SHADER', () => {
  it('declares every uniform its fragment shader reads', () => {
    for (const name of Object.keys(GRADE_SHADER.uniforms)) {
      expect(GRADE_SHADER.fragmentShader).toContain(name);
    }
  });

  it('writes gl_FragColor and passes uv through', () => {
    expect(GRADE_SHADER.fragmentShader).toContain('gl_FragColor');
    expect(GRADE_SHADER.vertexShader).toContain('vUv = uv');
    expect(GRADE_SHADER.fragmentShader).toContain('varying vec2 vUv');
  });

  it('keeps the vignette and grain subtle enough to be deniable', () => {
    expect(GRADE_SHADER.uniforms.uVignette.value).toBeLessThan(0.5);
    expect(GRADE_SHADER.uniforms.uGrain.value).toBeLessThan(0.1);
  });
});
