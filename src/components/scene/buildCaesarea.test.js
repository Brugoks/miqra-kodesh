import { it, expect, vi } from 'vitest';
import * as THREE from 'three';
import buildCaesarea from './buildCaesarea';
import { BUILDINGS } from './caesareaDimensions';
it('uses per-instance transforms in procedural masonry', () => {
  const world = buildCaesarea(THREE);
  const material = world.root.getObjectByName('column-capitals').material;
  const shader = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
  material.onBeforeCompile(shader);
  expect(shader.vertexShader).toContain('instanceMatrix');
  world.dispose();
});
it('keeps low-quality reduced-motion worlds still and disposes only once', () => {
  const world = buildCaesarea(THREE, { quality: 'low', reducedMotion: true });
  const sea = world.root.getObjectByName('sea');
  const ship = world.root.getObjectByName('merchant-ship');
  const before = ship.position.clone();
  world.update(100);
  expect(sea.material.uniforms.time.value).toBe(0);
  expect(ship.position.equals(before)).toBe(true);
  expect(sea.geometry.getAttribute('position').count).toBeLessThan(1000);
  const spy = vi.spyOn(sea.material, 'dispose');
  world.dispose(); world.dispose();
  expect(spy).toHaveBeenCalledTimes(1);
});
it('builds a finite harbor world with matching solids, animated sea and disposal', () => {
  const world = buildCaesarea(THREE, { quality: 'high' });
  expect(world).not.toBeNull();
  expect(world.root.isGroup).toBe(true);
  for (const b of BUILDINGS) {
    const mesh = world.root.getObjectByName(b.id);
    expect(mesh).toBeDefined();
    expect(mesh.position.x).toBe((b.x0 + b.x1) / 2);
  }
  const sea = world.root.getObjectByName('sea');
  expect(sea.material.isShaderMaterial).toBe(true);
  world.update(3);
  expect(sea.material.uniforms.time.value).toBe(3);
  let triangles = 0;
  world.root.traverse(o => {
    if (!o.geometry) return;
    const p = o.geometry.getAttribute('position');
    for (const n of p.array) expect(Number.isFinite(n)).toBe(true);
    triangles += (o.geometry.index?.count || p.count) / 3 * (o.count || 1);
  });
  expect(triangles).toBeLessThan(250000);
  const spy = vi.spyOn(sea.geometry, 'dispose');
  world.dispose();
  expect(spy).toHaveBeenCalledTimes(1);
});
