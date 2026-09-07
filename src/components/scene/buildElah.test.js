import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import buildElah from './buildElah';

describe('Valley of Elah scene builder (Milestone 1)', () => {
  it('builds an explorable scene contract with terrain, brook, and lighting', () => {
    const world = buildElah(THREE, { quality: 'high' });
    expect(world).not.toBeNull();
    expect(world.root.isGroup).toBe(true);
    expect(world.root.name).toBe('valley-of-elah');

    expect(world.lighting).toBeDefined();
    expect(world.sun).toBeDefined();
    expect(world.fog).toBeDefined();
    expect(Number.isFinite(world.exposure)).toBe(true);
    expect(Array.isArray(world.occluders)).toBe(true);
    expect(world.occluders.length).toBeGreaterThanOrEqual(1);

    // Verify terrain and water elements
    const terrain = world.root.getObjectByName('elah-terrain');
    expect(terrain).toBeDefined();
    expect(terrain.isMesh).toBe(true);

    const brook = world.root.getObjectByName('elah-brook-water');
    expect(brook).toBeDefined();
    expect(brook.isMesh).toBe(true);

    const stones = world.root.getObjectByName('elah-stones');
    expect(stones).toBeDefined();

    world.dispose();
  });

  it('stages David, Goliath, and shield-bearer with biblical scale contrast and props', () => {
    const world = buildElah(THREE, { quality: 'high' });

    // David proxy (~1.65m)
    const david = world.root.getObjectByName('principal-david');
    expect(david, 'David proxy must be present in scene').toBeDefined();
    expect(david.position.x).toBeCloseTo(3, 0.5);
    expect(david.position.z).toBeCloseTo(3, 0.5);

    // Five smooth stones near David
    const davidStones = world.root.getObjectByName('david-five-smooth-stones');
    expect(davidStones, 'Five smooth stones must be near David').toBeDefined();
    expect(davidStones.children.length).toBe(5);

    // Goliath proxy (~2.9m)
    const goliath = world.root.getObjectByName('principal-goliath');
    expect(goliath, 'Goliath proxy must be present in scene').toBeDefined();
    expect(goliath.position.x).toBeCloseTo(-4, 0.5);
    expect(goliath.position.z).toBeCloseTo(-6, 0.5);

    // Scale contrast: Goliath is notably taller and more massive than David
    const goliathBox = new THREE.Box3().setFromObject(goliath);
    const davidBox = new THREE.Box3().setFromObject(david);
    const goliathHeight = goliathBox.max.y - goliathBox.min.y;
    const davidHeight = davidBox.max.y - davidBox.min.y;

    // Goliath should be substantially taller (approx 2.9m vs 1.65m target)
    expect(goliathHeight).toBeGreaterThan(2.5);
    expect(davidHeight).toBeLessThan(2.0);
    expect(goliathHeight / davidHeight).toBeGreaterThan(1.5);

    // Shield-bearer proxy
    const shieldBearer = world.root.getObjectByName('principal-shield-bearer');
    expect(shieldBearer, 'Shield-bearer proxy must precede Goliath').toBeDefined();
    expect(shieldBearer.position.x).toBeCloseTo(-2.6, 0.5);
    expect(shieldBearer.position.z).toBeCloseTo(-4.5, 0.5);

    world.dispose();
  });

  it('stages opposing army formations and banners on the flanking ridges', () => {
    const world = buildElah(THREE, { quality: 'high' });

    const philistines = world.root.getObjectByName('army-philistine');
    expect(philistines).toBeDefined();

    const israelites = world.root.getObjectByName('army-israelite');
    expect(israelites).toBeDefined();

    // Philistines positioned along the left ridge (-X)
    let hasPhilistineInstanced = false;
    philistines.traverse((child) => {
      if (child.isInstancedMesh) hasPhilistineInstanced = true;
    });
    expect(hasPhilistineInstanced).toBe(true);

    // Israelites positioned along the right ridge (+X)
    let hasIsraeliteInstanced = false;
    israelites.traverse((child) => {
      if (child.isInstancedMesh) hasIsraeliteInstanced = true;
    });
    expect(hasIsraeliteInstanced).toBe(true);

    world.dispose();
  });

  it('respects reduced motion and updates animations deterministically', () => {
    const worldNormal = buildElah(THREE, { quality: 'high', reducedMotion: false });
    const david = worldNormal.root.getObjectByName('principal-david');
    const startY = david.position.y;

    worldNormal.update(1.2);
    expect(david.position.y).not.toBe(startY);
    worldNormal.dispose();

    const worldReduced = buildElah(THREE, { quality: 'high', reducedMotion: true });
    const davidReduced = worldReduced.root.getObjectByName('principal-david');
    const reducedStartY = davidReduced.position.y;

    worldReduced.update(1.2);
    expect(davidReduced.position.y).toBe(reducedStartY);
    worldReduced.dispose();
  });

  it('ensures all generated geometries have finite vertex coordinates and disposes cleanly', () => {
    const world = buildElah(THREE, { quality: 'high' });

    let triangleCount = 0;
    world.root.traverse((obj) => {
      if (obj.geometry) {
        const pos = obj.geometry.getAttribute('position');
        expect(pos).toBeDefined();
        for (let i = 0; i < pos.array.length; i += 1) {
          expect(Number.isFinite(pos.array[i])).toBe(true);
        }
        triangleCount += (obj.geometry.index?.count || pos.count) / 3 * (obj.count || 1);
      }
    });

    // Milestone 1 triangle budget well within performance budget (< 350k triangles)
    expect(triangleCount).toBeLessThan(350000);

    const terrain = world.root.getObjectByName('elah-terrain');
    const geoSpy = vi.spyOn(terrain.geometry, 'dispose');
    const matSpy = vi.spyOn(terrain.material, 'dispose');

    world.dispose();
    world.dispose(); // Calling dispose twice must be idempotent

    expect(geoSpy).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
  });
});
