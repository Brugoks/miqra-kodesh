import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createLeafCrowns } from './sceneFoliage';
import { makeRandom } from './sceneLandscape';
import buildElah from './buildElah';
import buildOlivet from './buildOlivet';

const trees = [
  { x: 0, z: 0, y: 0, height: 3.4 },
  { x: 40, z: -12, y: 2, height: 3, scale: 1.2 },
];
const make = (options = {}) => createLeafCrowns(THREE, { trees, random: makeRandom(9), ...options });

function matrices(mesh) {
  const m = new THREE.Matrix4();
  const out = [];
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, m);
    out.push(new THREE.Vector3().setFromMatrixPosition(m));
  }
  return out;
}

describe('createLeafCrowns', () => {
  it('places a full crown of sprays on every tree, all inside its spread', () => {
    const crowns = make({ density: 200 });
    expect(crowns.count).toBe(400);
    expect(crowns.leaves.count).toBe(400);
    const spots = matrices(crowns.leaves);
    expect(spots.every((p) => [p.x, p.y, p.z].every(Number.isFinite))).toBe(true);
    for (const [i, tree] of trees.entries()) {
      const mine = spots.slice(i * 200, (i + 1) * 200);
      const scale = tree.scale ?? 1;
      const centreY = tree.y + tree.height;
      for (const p of mine) {
        expect(Math.hypot(p.x - tree.x, p.z - tree.z)).toBeLessThanOrEqual(2.55 * scale + 1e-6);
        expect(Math.abs(p.y - centreY)).toBeLessThanOrEqual(2.1 * scale / 2 + 1e-6);
      }
      // A crown, not a column: the sprays reach well out from the trunk.
      expect(Math.max(...mine.map((p) => Math.hypot(p.x - tree.x, p.z - tree.z)))).toBeGreaterThan(1.8 * scale);
    }
  });

  it('is deterministic for a given seed, and different trees get different sprays', () => {
    const a = matrices(make({ density: 50 }).leaves);
    const b = matrices(make({ density: 50 }).leaves);
    expect(a).toEqual(b);
    expect(a[0]).not.toEqual(a[50]);
  });

  it('colours each spray and thins out on a phone', () => {
    const high = make();
    const low = make({ low: true });
    expect(high.count).toBe(trees.length * 520);
    expect(low.count).toBe(trees.length * 240);
    expect(high.leaves.instanceColor.count).toBe(high.count);
    expect(high.leaves.castShadow).toBe(true);
    expect(low.leaves.castShadow).toBe(false);
  });

  it('adds a darker inner core per tree unless told not to', () => {
    expect(make().cores.count).toBe(trees.length);
    expect(make({ core: false }).cores).toBeNull();
    expect(make().meshes).toHaveLength(2);
    expect(make({ core: false }).meshes).toHaveLength(1);
  });

  it('moves in one shared wind, in the shadow pass as well', () => {
    const crowns = make({ density: 10 });
    const run = (material) => {
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader };
      material.onBeforeCompile(shader);
      expect(shader.vertexShader).toContain('instanceMatrix[3].xyz');
      return shader.uniforms.leafTime;
    };
    const surface = run(crowns.leaves.material);
    const shadow = run(crowns.leaves.customDepthMaterial);
    expect(surface).toBe(shadow);
    crowns.update(7.5);
    expect(surface.value).toBe(7.5);
  });

  it('rejects an unknown kind and disposes cleanly twice', () => {
    expect(() => make({ kind: 'cedar' })).toThrow(/unknown leaf kind/);
    const crowns = make({ density: 10 });
    crowns.dispose();
    expect(() => crowns.dispose()).not.toThrow();
  });
});

describe('crowns in the scenes', () => {
  it('stands the Valley of Elah’s terebinths under open leaves', () => {
    const world = buildElah(THREE, { quality: 'high' });
    const crowns = world.root.getObjectByName('elah-leaf-crowns');
    expect(crowns.count).toBe(8 * 520);
    expect(world.root.getObjectByName('tree-1')).toBeTruthy();
    expect(matrices(crowns).every((p) => [p.x, p.y, p.z].every(Number.isFinite))).toBe(true);
    // The wind reaches them, and reduced motion leaves them still.
    world.update(4);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader };
    crowns.material.onBeforeCompile(shader);
    expect(shader.uniforms.leafTime.value).toBe(4);
    world.dispose();
  });

  it('gives Gethsemane’s fourteen old olives leaves round their shrunken crowns', () => {
    const built = buildOlivet(THREE, { quality: 'high', motionLibrary: null });
    const leaves = built.root.getObjectByName('garden-olive-leaves');
    expect(leaves.count).toBe(14 * 420);
    expect(built.root.getObjectByName('garden-olive-crowns').count).toBe(14);
    // Each spray sits above its own tree's ground.
    expect(matrices(leaves).every((p) => Number.isFinite(p.y))).toBe(true);
    const thin = buildOlivet(THREE, { quality: 'low', motionLibrary: null });
    expect(thin.root.getObjectByName('garden-olive-leaves').count).toBe(14 * 120);
    built.dispose();
    thin.dispose();
  });
});
