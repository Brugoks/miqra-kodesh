import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createGalileeWater, WATER_RADIUS } from './capernaumWater';
import { createCapernaumSky, fogFor, WEATHER, SMOKE_SOURCES } from './capernaumSky';
import { SWELL_GLSL, swellAt, swellSlopeAt, WIND } from './capernaumWeather';
import { applyLighting, TIMES_OF_DAY } from './sceneLighting';
import { LEVEL } from './capernaumDimensions';
import { blockerAt, floorAt } from './capernaumNavigation';

const lighting = () => applyLighting(THREE, new THREE.Group(), { slug: 'capernaum', low: true });

describe('the lake swell', () => {
  it('is one function on the CPU and in the shader', () => {
    // The GLSL is generated from the same table the CPU function reads, so a
    // boat and the water under it cannot drift apart.
    expect(SWELL_GLSL).toContain('float swellAt(vec2 p, float t)');
    expect(swellAt(0, 0, 0)).toBeCloseTo(0, 9);
    const slope = swellSlopeAt(3, -40, 2);
    const e = 1e-4;
    expect(slope.x).toBeCloseTo((swellAt(3 + e, -40, 2) - swellAt(3 - e, -40, 2)) / (2 * e), 5);
    expect(slope.z).toBeCloseTo((swellAt(3, -40 + e, 2) - swellAt(3, -40 - e, 2)) / (2 * e), 5);
    expect(Math.hypot(WIND.x, WIND.z)).toBeCloseTo(1, 5);
  });
});

describe('createGalileeWater', () => {
  it('displaces with the shared swell, is lit and fogged, and ends inside the sky dome', () => {
    const light = lighting();
    const water = createGalileeWater(THREE, { quality: 'high', lighting: light });
    try {
      const { material, geometry } = water.mesh;
      expect(material.vertexShader).toContain(SWELL_GLSL.trim().split('\n')[0]);
      expect(material.fog).toBe(true);
      expect(material.transparent).toBe(false);
      // It reflects the dome's own sky: the very same uniform objects.
      expect(material.uniforms.uLow).toBe(light.uniforms.uLow);
      expect(material.uniforms.uSun).toBe(light.uniforms.uSun);
      geometry.computeBoundingSphere();
      expect(geometry.boundingSphere.radius).toBeLessThanOrEqual(WATER_RADIUS + 0.01);
      expect(WATER_RADIUS).toBeLessThan(1500);
      expect(water.mesh.position.y).toBe(LEVEL.lake);
      expect(Array.from(geometry.attributes.position.array).every(Number.isFinite)).toBe(true);
      // Night takes the sun out of the water.
      water.onTimeOfDay(TIMES_OF_DAY.find((t) => t.id === 'night'));
      expect(material.uniforms.uSunStrength.value).toBeLessThan(0.3);
      water.update(12.5);
      expect(material.uniforms.uTime.value).toBe(12.5);
    } finally {
      water.dispose();
    }
  });

  it('is lighter on low', () => {
    const high = createGalileeWater(THREE, { quality: 'high' });
    const low = createGalileeWater(THREE, { quality: 'low' });
    try {
      expect(low.mesh.geometry.index.count).toBeLessThan(high.mesh.geometry.index.count / 3);
    } finally {
      high.dispose();
      low.dispose();
    }
  });
});

describe('the sky over Capernaum', () => {
  it('makes haze the colour of its own horizon, at every hour', () => {
    for (const time of TIMES_OF_DAY) {
      const fog = fogFor(time);
      expect(fog.color).toHaveLength(3);
      fog.color.forEach((channel, i) => {
        expect(Number.isFinite(channel)).toBe(true);
        // Close to the horizon colour, never the separately-picked brown.
        expect(Math.abs(channel - time.sky.low[i])).toBeLessThan(0.1);
      });
      expect(fog.density).toBe(WEATHER[time.id].fog);
      expect(fog.density).toBeLessThan(time.fog.density + 1e-9);
    }
  });

  it('keeps its fires where fires can be', () => {
    for (const source of SMOKE_SOURCES) {
      expect(Number.isFinite(source.x + source.y + source.z)).toBe(true);
      // Either on open ground somebody could stand by, or inside a block's
      // own courtyard (which the navigation keeps visitors out of).
      const floor = floorAt(source.x, source.z, 0);
      expect(floor || blockerAt(source.x, source.z, 0)).toBeTruthy();
    }
  });

  it('builds clouds, smoke, mist and motes within budget, follows the hour, and disposes cleanly', () => {
    const light = lighting();
    for (const quality of ['low', 'high']) {
      const sky = createCapernaumSky(THREE, { quality, lighting: light });
      try {
        let draws = 0;
        sky.group.traverse((o) => { if (o.isMesh || o.isPoints) draws += 1; });
        expect(draws).toBeLessThanOrEqual(8);
        const smoke = sky.group.getObjectByName('village-smoke');
        expect(smoke.geometry.instanceCount).toBeGreaterThan(SMOKE_SOURCES.length);
        expect(smoke.geometry.instanceCount).toBeLessThanOrEqual(quality === 'low' ? 120 : 400);
        const seeds = smoke.geometry.attributes.aSeed.array;
        expect(Array.from(seeds).every(Number.isFinite)).toBe(true);
        const clouds = sky.group.getObjectByName('sky-clouds');
        expect(clouds.material.uniforms.uSun).toBe(light.uniforms.uSun);
        sky.onTimeOfDay(TIMES_OF_DAY.find((t) => t.id === 'dawn'));
        expect(clouds.material.uniforms.uCover.value).toBe(WEATHER.dawn.cover);
        sky.onTimeOfDay(TIMES_OF_DAY.find((t) => t.id === 'noon'));
        const mistSheets = sky.group.getObjectByName('lake-mist').children;
        expect(mistSheets[0].material.uniforms.uAmount.value).toBe(0);
        for (let t = 0; t < 30; t += 0.5) sky.update(t, 0.5, {});
        const motes = sky.group.getObjectByName('house-motes');
        if (quality === 'high') {
          expect(Array.from(motes.geometry.attributes.position.array).every(Number.isFinite)).toBe(true);
        } else {
          expect(motes).toBeUndefined();
        }
        // No renderer, no environment map — and no error.
        expect(() => sky.prepareRenderer(null, null)).not.toThrow();
      } finally {
        sky.dispose();
      }
    }
  });
});
