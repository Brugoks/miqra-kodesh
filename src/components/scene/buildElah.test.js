import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import buildElah from './buildElah';

describe('Valley of Elah scene builder', () => {
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

  it('loads principals through the scene asset contract and retains the five stones', () => {
    const world = buildElah(THREE, { quality: 'high' });
    expect(world.principals.isReady()).toBe(false);
    expect(world.applyAssets).toBeTypeOf('function');
    expect(world.root.getObjectByName('david-five-smooth-stones').children).toHaveLength(5);
    world.dispose();
  });

  it('stages opposing army formations, encampments, and animated banners on the flanking ridges', () => {
    const world = buildElah(THREE, { quality: 'high', reducedMotion: false });

    const philistines = world.root.getObjectByName('army-philistine');
    expect(philistines).toBeDefined();

    const israelites = world.root.getObjectByName('army-israelite');
    expect(israelites).toBeDefined();

    // Verify multiple instanced layers (bodies, heads/helmets, shields, spears, tents)
    let philistineInstancedCount = 0;
    philistines.traverse((child) => {
      if (child.isInstancedMesh) philistineInstancedCount += 1;
    });
    expect(philistineInstancedCount).toBeGreaterThanOrEqual(5);

    let israeliteInstancedCount = 0;
    israelites.traverse((child) => {
      if (child.isInstancedMesh) israeliteInstancedCount += 1;
    });
    expect(israeliteInstancedCount).toBeGreaterThanOrEqual(5);

    // Verify banners exist and sway with wind during animation
    const banner = philistines.getObjectByName('philistine-banner-1');
    expect(banner).toBeDefined();
    const initRotZ = banner.rotation.z;
    world.update(1.5);
    expect(banner.rotation.z).not.toBe(initRotZ);

    world.dispose();
  });

  it('freezes the brook and banners under reduced motion', () => {
    const world = buildElah(THREE, { reducedMotion: true });
    const brook = world.root.getObjectByName('elah-brook-water');
    const y = brook.position.y;
    const banner = world.root.getObjectByName('philistine-banner-1');
    const bannerRotZ = banner.rotation.z;

    world.update(1.2);
    expect(brook.position.y).toBe(y);
    expect(banner.rotation.z).toBe(bannerRotZ);
    world.dispose();
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
