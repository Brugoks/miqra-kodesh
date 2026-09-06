import { describe, it, expect } from 'vitest';
import {
  SCENE_AXES,
  SKY_SHADER,
  TIMES_OF_DAY,
  DEFAULT_TIME_OF_DAY,
  applyLighting,
  headingToScene,
  resolveTimeOfDay,
  sunVector,
} from './sceneLighting';
import { knownSceneSlugs } from './sceneModules';
import { resolveScene } from '../../lib/scenes';

// A tiny stand-in for the parts of three this module touches. The real
// question here is arithmetic — where the sun ends up — and that does not need
// WebGL to answer.
class FakeVector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }

  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

class FakeColor {
  constructor(value) { this.value = value; }

  set(value) { this.value = value; return this; }
}

class FakeObject {
  constructor() { this.children = []; this.position = new FakeVector3(); }

  add(...objects) { this.children.push(...objects); return this; }
}

const THREE = {
  Vector3: FakeVector3,
  BackSide: 'back',
  ShaderMaterial: class { constructor(p) { Object.assign(this, p); } },
  SphereGeometry: class { constructor(r, w, h) { this.parameters = { radius: r, widthSegments: w, heightSegments: h }; } },
  Mesh: class extends FakeObject {
    constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
  },
  HemisphereLight: class extends FakeObject {
    constructor(sky, ground, intensity) {
      super();
      this.color = new FakeColor(sky);
      this.groundColor = new FakeColor(ground);
      this.intensity = intensity;
    }
  },
  DirectionalLight: class extends FakeObject {
    constructor(color, intensity) {
      super();
      this.color = new FakeColor(color);
      this.intensity = intensity;
      this.target = new FakeObject();
      this.shadow = { camera: {}, mapSize: { set() {} } };
    }
  },
};

const DEG = Math.PI / 180;

describe('SCENE_AXES', () => {
  it('agrees with the compass data in the scene manifests', () => {
    // The manifests are the source of truth — googleMaps.js converts a scene
    // standpoint to a real-world heading with the same two numbers — and this
    // module keeps a copy so the builders need not import prose. A drift here
    // mirrors every shadow in the scene without breaking anything visibly,
    // which is exactly the sort of bug that survives a review.
    for (const slug of knownSceneSlugs()) {
      const scene = resolveScene(slug);
      expect(SCENE_AXES[slug], `no axes for ${slug}`).toBeTruthy();
      expect(SCENE_AXES[slug].bearing).toBe(scene.geo.bearing);
      expect(SCENE_AXES[slug].xAxis).toBe(scene.geo.xAxis);
    }
  });

  it('covers every scene the app can route to', () => {
    for (const slug of knownSceneSlugs()) expect(SCENE_AXES[slug]).toBeTruthy();
  });

  it('describes axes that are actually perpendicular', () => {
    for (const [slug, axes] of Object.entries(SCENE_AXES)) {
      const zHeading = (axes.bearing + 180) % 360;
      const between = Math.abs(((zHeading - axes.xAxis) % 360 + 360) % 360);
      expect([90, 270], `${slug} axes are not at right angles`).toContain(between);
    }
  });
});

describe('headingToScene', () => {
  it('puts north where the temple says north is', () => {
    // Temple: +X is north, -Z is west, so +Z is east.
    const north = headingToScene(0, SCENE_AXES['second-temple']);
    expect(north.x).toBeCloseTo(1, 6);
    expect(north.z).toBeCloseTo(0, 6);
    const east = headingToScene(90, SCENE_AXES['second-temple']);
    expect(east.x).toBeCloseTo(0, 6);
    expect(east.z).toBeCloseTo(1, 6);
  });

  it('puts north where Capernaum says north is, which is the other way round', () => {
    // Capernaum: +X is east, +Z is north. Nothing but the two headings can
    // tell these two scenes apart, which is why both numbers are carried.
    const north = headingToScene(0, SCENE_AXES.capernaum);
    expect(north.x).toBeCloseTo(0, 6);
    expect(north.z).toBeCloseTo(1, 6);
    const east = headingToScene(90, SCENE_AXES.capernaum);
    expect(east.x).toBeCloseTo(1, 6);
    expect(east.z).toBeCloseTo(0, 6);
  });

  it('returns a unit vector for every bearing', () => {
    for (const axes of Object.values(SCENE_AXES)) {
      for (let heading = 0; heading < 360; heading += 17) {
        const { x, z } = headingToScene(heading, axes);
        expect(Math.hypot(x, z)).toBeCloseTo(1, 6);
      }
    }
  });
});

describe('sunVector', () => {
  it('is a unit vector at every hour, in every scene', () => {
    for (const axes of Object.values(SCENE_AXES)) {
      for (const time of TIMES_OF_DAY) {
        const v = sunVector(time.azimuth, time.elevation, axes);
        expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 6);
      }
    }
  });

  it('keeps the sun above the horizon at every hour, moon included', () => {
    for (const time of TIMES_OF_DAY) {
      expect(time.elevation, `${time.id} is below the horizon`).toBeGreaterThan(0);
    }
  });

  it('reproduces the hand-placed morning sun the temple used to have', () => {
    // The old code read `sun.position.set(-120, 130, 300)` with the comment
    // "morning sun in the east-southeast". If the bearing maths did not land
    // in the same place, every shadow in the scene would have moved when the
    // lighting was centralised.
    const morning = resolveTimeOfDay('morning');
    const v = sunVector(morning.azimuth, morning.elevation, SCENE_AXES['second-temple']);
    const scale = 345;
    expect(v.x * scale).toBeCloseTo(-120, -1);
    expect(v.y * scale).toBeCloseTo(130, -1);
    expect(v.z * scale).toBeCloseTo(300, -1);
  });

  it('moves the sun across the sky as the day goes on', () => {
    const axes = SCENE_AXES['second-temple'];
    const dawn = sunVector(resolveTimeOfDay('dawn').azimuth, 10, axes);
    const dusk = sunVector(resolveTimeOfDay('dusk').azimuth, 10, axes);
    // East in the morning, west in the evening: the two must be on opposite
    // sides of the scene, not merely different.
    expect(Math.sign(dawn.z)).toBe(1);
    expect(Math.sign(dusk.z)).toBe(-1);
  });

  it('climbs with elevation', () => {
    const axes = SCENE_AXES.caesarea;
    const low = sunVector(180, 5, axes);
    const high = sunVector(180, 74, axes);
    expect(high.y).toBeGreaterThan(low.y);
    expect(high.y).toBeCloseTo(Math.sin(74 * DEG), 6);
  });
});

describe('TIMES_OF_DAY', () => {
  it('has a default that exists', () => {
    expect(TIMES_OF_DAY.some((t) => t.id === DEFAULT_TIME_OF_DAY)).toBe(true);
    expect(resolveTimeOfDay(DEFAULT_TIME_OF_DAY).id).toBe(DEFAULT_TIME_OF_DAY);
  });

  it('falls back to the default rather than returning nothing', () => {
    expect(resolveTimeOfDay('the-third-watch').id).toBe(DEFAULT_TIME_OF_DAY);
    expect(resolveTimeOfDay(undefined).id).toBe(DEFAULT_TIME_OF_DAY);
  });

  it('gives every hour a complete description', () => {
    for (const time of TIMES_OF_DAY) {
      expect(time.label).toBeTruthy();
      expect(time.sun.intensity).toBeGreaterThan(0);
      expect(time.hemisphere.intensity).toBeGreaterThan(0);
      expect(time.fog.density).toBeGreaterThan(0);
      expect(time.exposure).toBeGreaterThan(0);
      expect(time.lamps).toBeGreaterThanOrEqual(0);
      expect(time.lamps).toBeLessThanOrEqual(1);
      for (const channel of [...time.sky.low, ...time.sky.high, ...time.sky.glow]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gets darker toward night and lights the lamps as it does', () => {
    const byId = Object.fromEntries(TIMES_OF_DAY.map((t) => [t.id, t]));
    expect(byId.noon.sun.intensity).toBeGreaterThan(byId.dusk.sun.intensity);
    expect(byId.dusk.sun.intensity).toBeGreaterThan(byId.night.sun.intensity);
    expect(byId.night.lamps).toBeGreaterThan(byId.dusk.lamps);
    expect(byId.dusk.lamps).toBeGreaterThan(byId.noon.lamps);
    expect(byId.noon.lamps).toBe(0);
    // And only the dark hours have stars.
    expect(byId.night.sky.stars).toBeGreaterThan(0);
    expect(byId.noon.sky.stars).toBe(0);
    expect(byId.morning.sky.stars).toBe(0);
  });
});

describe('applyLighting', () => {
  const build = (options = {}) => {
    const root = new FakeObject();
    const handle = applyLighting(THREE, root, { slug: 'second-temple', ...options });
    return { root, handle };
  };

  it('adds a sky, a fill and a sun to the scene root', () => {
    const { root, handle } = build();
    expect(root.children).toContain(handle.sky);
    expect(root.children).toContain(handle.hemisphere);
    expect(root.children).toContain(handle.sun);
    // The target has to be in the graph too, or the light points at the origin
    // regardless of where the builder puts it.
    expect(root.children).toContain(handle.sun.target);
  });

  it('starts at the requested hour', () => {
    const { handle } = build({ timeOfDay: 'night' });
    const night = resolveTimeOfDay('night');
    expect(handle.current.id).toBe('night');
    expect(handle.sun.intensity).toBe(night.sun.intensity);
    expect(handle.uniforms.uStars.value).toBe(night.sky.stars);
  });

  it('defaults to morning, so a builder that says nothing gets what it had', () => {
    expect(build().handle.current.id).toBe(DEFAULT_TIME_OF_DAY);
  });

  it('re-points everything at another hour without rebuilding', () => {
    const { handle } = build({ timeOfDay: 'morning' });
    const skyBefore = handle.sky;
    const sunBefore = handle.sun;
    const positionBefore = { ...handle.sun.position };

    const dusk = handle.setTimeOfDay('dusk');

    expect(dusk.id).toBe('dusk');
    expect(handle.current.id).toBe('dusk');
    // Same objects: the geometry of the scene is unchanged at another hour.
    expect(handle.sky).toBe(skyBefore);
    expect(handle.sun).toBe(sunBefore);
    // But the sun has moved and changed colour.
    expect(handle.sun.position.z).not.toBeCloseTo(positionBefore.z, 3);
    expect(handle.sun.color.value).toBe(resolveTimeOfDay('dusk').sun.color);
    expect(handle.sun.intensity).toBe(resolveTimeOfDay('dusk').sun.intensity);
    expect(handle.hemisphere.intensity).toBe(resolveTimeOfDay('dusk').hemisphere.intensity);
  });

  it('keeps the sky uniforms in step with the hour', () => {
    const { handle } = build({ timeOfDay: 'noon' });
    handle.setTimeOfDay('night');
    const night = resolveTimeOfDay('night');
    expect(handle.uniforms.uLow.value.x).toBeCloseTo(night.sky.low[0], 6);
    expect(handle.uniforms.uHigh.value.z).toBeCloseTo(night.sky.high[2], 6);
    expect(handle.uniforms.uGlowPower.value).toBe(night.sky.glowPower);
    expect(handle.uniforms.uStars.value).toBe(night.sky.stars);
  });

  it('moves the sky uniform vector in place, so shaders sharing it follow', () => {
    // Capernaum's water and the tabernacle's sand read the sun direction
    // straight off this uniform rather than keeping a copy — re-pointing the
    // sun has to move the glitter on the lake with it.
    const { handle } = build({ slug: 'capernaum', timeOfDay: 'morning' });
    const shared = handle.uniforms.uSun.value;
    handle.setTimeOfDay('dusk');
    expect(handle.uniforms.uSun.value).toBe(shared);
    expect(Math.hypot(shared.x, shared.y, shared.z)).toBeCloseTo(1, 6);
  });

  it('places the sun using the scene’s own handedness', () => {
    const temple = build({ slug: 'second-temple', timeOfDay: 'morning' }).handle;
    const capernaum = build({ slug: 'capernaum', timeOfDay: 'morning' }).handle;
    // Same compass bearing, two scenes built the other way round, so the
    // coordinates must differ — this is the bug the whole indirection exists
    // to prevent.
    expect(temple.sun.position.x).not.toBeCloseTo(capernaum.sun.position.x, 1);
  });

  it('tolerates a slug it has never heard of', () => {
    const { handle } = build({ slug: 'nineveh' });
    expect(Number.isFinite(handle.sun.position.x)).toBe(true);
    expect(Number.isFinite(handle.sun.position.y)).toBe(true);
  });

  it('never produces a NaN anywhere in the graph, at any hour, in any scene', () => {
    for (const slug of knownSceneSlugs()) {
      for (const time of TIMES_OF_DAY) {
        const { handle } = build({ slug, timeOfDay: time.id });
        for (const value of Object.values(handle.uniforms)) {
          if (typeof value.value === 'number') {
            expect(Number.isFinite(value.value)).toBe(true);
          } else {
            expect(Number.isFinite(value.value.x)).toBe(true);
            expect(Number.isFinite(value.value.y ?? 0)).toBe(true);
            expect(Number.isFinite(value.value.z)).toBe(true);
          }
        }
        for (const axis of ['x', 'y', 'z']) {
          expect(Number.isFinite(handle.sun.position[axis])).toBe(true);
        }
      }
    }
  });
});

describe('SKY_SHADER', () => {
  it('declares every uniform applyLighting supplies', () => {
    const root = new FakeObject();
    const handle = applyLighting(THREE, root, { slug: 'tabernacle' });
    for (const name of Object.keys(handle.uniforms)) {
      expect(SKY_SHADER.fragmentShader, `${name} is unused by the shader`).toContain(name);
    }
  });

  it('runs three’s tone-mapping and colour-space chunks, as the shaders it replaced did', () => {
    // Without these the sky is in a different colour space from everything
    // else in the frame, which reads as a sky that does not belong to the
    // scene under it.
    expect(SKY_SHADER.fragmentShader).toContain('#include <tonemapping_fragment>');
    expect(SKY_SHADER.fragmentShader).toContain('#include <colorspace_fragment>');
  });

  it('guards the star field so daylight scenes pay nothing for it', () => {
    expect(SKY_SHADER.fragmentShader).toContain('if (uStars > 0.001)');
  });
});
