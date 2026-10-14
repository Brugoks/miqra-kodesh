import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { applyScannedSurface, applyScannedSurfaces } from './sceneSurfaces';
import { sameBalanceAsBaseline, shaderSketch } from './scanFixtures';

function scan({ mean = [0.2, 0.2, 0.2] } = {}) {
  const source = new THREE.MeshStandardMaterial();
  source.map = new THREE.Texture();
  source.normalMap = new THREE.Texture();
  source.roughnessMap = new THREE.Texture();
  source.userData.mean = mean;
  return source;
}

describe('applyScannedSurface', () => {
  it('does nothing without a scan, and only ever once per material', () => {
    const target = new THREE.MeshStandardMaterial({ color: 0x884422 });
    expect(applyScannedSurface(THREE, target, undefined)).toBe(false);
    expect(applyScannedSurface(THREE, target, { map: null })).toBe(false);
    expect(target.map).toBeNull();
    const source = scan();
    expect(applyScannedSurface(THREE, target, source)).toBe(true);
    expect(applyScannedSurface(THREE, target, scan())).toBe(false);
    expect(target.map).toBe(source.map);
    expect(target.normalMap).toBe(source.normalMap);
    expect(target.roughnessMap).toBe(source.roughnessMap);
    expect(target.userData.scanned).toBe(true);
  });

  it('solves the tint that keeps the material’s own colour on average', () => {
    // Chroma 1 and strength 1: the scan averages to `mean`, so the multiplier
    // is simply goal / mean.
    const target = new THREE.MeshStandardMaterial({ color: 0x808080 });
    const goal = new THREE.Color(0x808080);
    applyScannedSurface(THREE, target, scan({ mean: [0.2, 0.1, 0.4] }), { chroma: 1, strength: 1 });
    expect(target.color.r).toBeCloseTo(goal.r / 0.2, 5);
    expect(target.color.g).toBeCloseTo(goal.g / 0.1, 5);
    expect(target.color.b).toBeCloseTo(goal.b / 0.4, 5);
  });

  it('accounts for the flattening and the desaturation it applies', () => {
    const target = new THREE.MeshStandardMaterial({ color: 0x808080 });
    const mean = [0.3, 0.2, 0.1];
    const luma = mean[0] * 0.2126 + mean[1] * 0.7152 + mean[2] * 0.0722;
    const expected = mean.map((v) => 0.2 * 0.65 + 0.8 * (0.45 * v + 0.55 * luma));
    applyScannedSurface(THREE, target, scan({ mean }), { strength: 0.8, chroma: 0.45 });
    const goal = new THREE.Color(0x808080);
    expect(target.color.r).toBeCloseTo(goal.r / expected[0], 5);
    expect(target.color.b).toBeCloseTo(goal.b / expected[2], 5);
  });

  it('lands on an explicit albedo instead of the current colour', () => {
    const target = new THREE.MeshStandardMaterial({ color: 0xffffff });
    applyScannedSurface(THREE, target, scan(), { albedo: 0x404040, chroma: 1, strength: 1 });
    expect(target.color.r).toBeCloseTo(new THREE.Color(0x404040).r / 0.2, 5);
  });

  it('caps a runaway multiplier instead of blowing the surface out', () => {
    const target = new THREE.MeshStandardMaterial({ color: 0xffffff });
    applyScannedSurface(THREE, target, scan({ mean: [0.0001, 0.0001, 0.0001] }), { chroma: 1, strength: 1 });
    expect(target.color.r).toBeLessThanOrEqual(8);
  });

  it('uses an explicit tint, and leaves the colour alone when there is no average to solve with', () => {
    const tinted = new THREE.MeshStandardMaterial({ color: 0x123456 });
    applyScannedSurface(THREE, tinted, scan(), { tint: 0xd4b58d });
    expect(tinted.color.getHex()).toBe(0xd4b58d);
    const untouched = new THREE.MeshStandardMaterial({ color: 0x123456 });
    const noMean = scan();
    delete noMean.userData.mean;
    applyScannedSurface(THREE, untouched, noMean);
    expect(untouched.color.getHex()).toBe(0x123456);
  });

  it('projects the scan from world position, in metres, for every instance', () => {
    const target = new THREE.MeshStandardMaterial();
    applyScannedSurface(THREE, target, scan(), { metres: 2.5 });
    const sketch = shaderSketch(THREE, target);
    const { vertex, fragment } = sketch;
    expect(vertex).toContain('vScannedPosition=(modelMatrix*scanPosition).xyz');
    expect(vertex).toContain('instanceMatrix*scanPosition');
    expect(fragment).toContain('scanUv/=2.50');
    // The scan is sampled by the projected UV, never the mesh's own.
    expect(fragment).toContain('texture2D( map, scanUv )');
    expect(fragment).not.toContain('texture2D( map, vMapUv )');
    expect(fragment).toContain('texture2D( roughnessMap, scanUv )');
    expect(fragment).toContain('texture2D(normalMap,scanUv)');
    expect(fragment.match(/vec2 scanUv=/g)).toHaveLength(1);
    expect(fragment).not.toContain('MISSING');
    expect(sameBalanceAsBaseline(sketch)).toBe(true);
  });

  it('adds a second, rotated sample only when asked to break the tiling', () => {
    const plain = new THREE.MeshStandardMaterial();
    const varied = new THREE.MeshStandardMaterial();
    applyScannedSurface(THREE, plain, scan());
    applyScannedSurface(THREE, varied, scan(), { breakTiling: true });
    const a = shaderSketch(THREE, plain).fragment;
    const variedSketch = shaderSketch(THREE, varied);
    const b = variedSketch.fragment;
    expect(a).not.toContain('scanFar');
    expect(b).toContain('texture2D(map,scanFar)');
    // Helper functions are declared once, ahead of use.
    expect(b.match(/float scanNoise\(/g)).toHaveLength(1);
    expect(b.indexOf('float scanNoise(')).toBeLessThan(b.indexOf('scanNoise(vScannedPosition'));
    expect(sameBalanceAsBaseline(variedSketch)).toBe(true);
  });

  it('runs a material’s own shader first and keeps its work when asked to preserve it', () => {
    const target = new THREE.MeshStandardMaterial();
    const order = [];
    target.onBeforeCompile = (shader) => {
      order.push('own');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb*=vec3(0.5);')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal=normalize(normal+vec3(0.01));');
    };
    target.customProgramCacheKey = () => 'own-key';
    applyScannedSurface(THREE, target, scan(), { preserveShader: true });
    const { fragment } = shaderSketch(THREE, target);
    expect(order).toEqual(['own']);
    expect(fragment).toContain('diffuseColor.rgb*=vec3(0.5);');
    // Its normal work lands after the scanned normal, so it perturbs it.
    expect(fragment.indexOf('normal=normalize(normal+vec3(0.01));')).toBeGreaterThan(fragment.indexOf('texture2D(normalMap,scanUv)'));
    expect(target.customProgramCacheKey()).toContain('own-key');

    const replaced = new THREE.MeshStandardMaterial();
    replaced.onBeforeCompile = () => order.push('replaced');
    applyScannedSurface(THREE, replaced, scan());
    shaderSketch(THREE, replaced);
    expect(order).not.toContain('replaced');
  });

  it('gives different settings different programs', () => {
    const keys = new Set();
    for (const options of [{}, { metres: 4 }, { strength: 0.6 }, { relief: 1 }, { chroma: 0.9 }, { breakTiling: true }]) {
      const target = new THREE.MeshStandardMaterial();
      applyScannedSurface(THREE, target, scan(), options);
      keys.add(target.customProgramCacheKey());
    }
    expect(keys.size).toBe(6);
  });
});

describe('applyScannedSurfaces', () => {
  it('binds by `<slug>-<role>`, skips what failed to load, and counts what took', () => {
    const wall = new THREE.MeshStandardMaterial();
    const floor = new THREE.MeshStandardMaterial();
    const missing = new THREE.MeshStandardMaterial();
    const loaded = { 'x-wall': scan(), 'x-floor': scan(), 'other-wall': scan() };
    const applied = applyScannedSurfaces(THREE, loaded, 'x', [
      [wall, 'wall'], [floor, 'floor'], [missing, 'thatch'],
    ]);
    expect(applied).toBe(2);
    expect(wall.map).toBe(loaded['x-wall'].map);
    expect(missing.map).toBeNull();
    expect(applyScannedSurfaces(THREE, undefined, 'x', [[missing, 'wall']])).toBe(0);
    expect(applyScannedSurfaces(THREE, {}, 'x', [[missing, 'wall']])).toBe(0);
  });

  it('raises anisotropy on the session’s textures, never lowers it, and frees nothing', () => {
    const source = scan();
    source.map.anisotropy = 16;
    source.normalMap.anisotropy = 1;
    const disposeSpy = vi.spyOn(source.map, 'dispose');
    applyScannedSurfaces(THREE, { 'x-wall': source }, 'x', [[new THREE.MeshStandardMaterial(), 'wall']], { anisotropy: 8 });
    expect(source.map.anisotropy).toBe(16);
    expect(source.normalMap.anisotropy).toBe(8);
    expect(source.roughnessMap.anisotropy).toBe(8);
    expect(disposeSpy).not.toHaveBeenCalled();
  });
});
