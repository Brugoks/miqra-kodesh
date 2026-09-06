import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  PROP_KINDS, PROP_NAMES, alongWall, createProps, heap,
} from './sceneProps';

const seeded = (seed = 1) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

describe('PROP_KINDS', () => {
  it('builds real geometry for every kind, at both qualities', () => {
    for (const name of PROP_NAMES) {
      for (const low of [false, true]) {
        const geometry = PROP_KINDS[name].geometry(THREE, low);
        const position = geometry.getAttribute('position');
        expect(position, `${name} has no vertices`).toBeTruthy();
        expect(position.count).toBeGreaterThan(3);
        for (let i = 0; i < position.count * 3; i += 1) {
          expect(Number.isFinite(position.array[i]), `${name} has a NaN vertex`).toBe(true);
        }
        geometry.dispose();
      }
    }
  });

  it('keeps every prop a plausible size for the thing it is', () => {
    // A jar the size of a house, or a post you could step over, is worse than
    // no prop at all — it destroys the scale reading of everything near it.
    for (const name of PROP_NAMES) {
      const geometry = PROP_KINDS[name].geometry(THREE, false);
      geometry.computeBoundingBox();
      const size = new THREE.Vector3();
      geometry.boundingBox.getSize(size);
      expect(size.y, `${name} is too tall`).toBeLessThan(2.6);
      expect(Math.max(size.x, size.z), `${name} is too wide`).toBeLessThan(2.6);
      expect(Math.max(size.x, size.y, size.z), `${name} is too small to see`)
        .toBeGreaterThan(0.05);
      geometry.dispose();
    }
  });

  it('stands each prop on the ground rather than half buried in it', () => {
    // Everything except the flat cloth and the coil is authored with its base
    // at y=0, so an instance placed at floor level sits on the floor.
    const standing = PROP_NAMES;
    for (const name of standing) {
      const geometry = PROP_KINDS[name].geometry(THREE, false);
      geometry.computeBoundingBox();
      const size = new THREE.Vector3();
      geometry.boundingBox.getSize(size);
      // Either based at zero (the lathes) or centred on it (the primitives),
      // never floating well above.
      expect(geometry.boundingBox.min.y).toBeLessThanOrEqual(0.001);
      expect(Math.abs(geometry.boundingBox.min.y)).toBeLessThanOrEqual(size.y / 2 + 0.001);
      geometry.dispose();
    }
  });

  it('declares a height that matches the geometry it builds', () => {
    for (const name of PROP_NAMES) {
      const geometry = PROP_KINDS[name].geometry(THREE, false);
      geometry.computeBoundingBox();
      const size = new THREE.Vector3();
      geometry.boundingBox.getSize(size);
      expect(size.y, `${name}.height is wrong`).toBeCloseTo(PROP_KINDS[name].height, 1);
      geometry.dispose();
    }
  });

  it('gives every kind a material', () => {
    for (const name of PROP_NAMES) {
      expect(PROP_KINDS[name].material.color).toBeTruthy();
      expect(PROP_KINDS[name].material.roughness).toBeGreaterThan(0);
    }
  });
});

describe('alongWall', () => {
  it('lines things up against the wall it was given', () => {
    const items = alongWall(seeded(3), ['jar'], {
      from: 0, to: 20, at: 5, axis: 'z', count: 6, offset: 0.4,
    });
    expect(items).toHaveLength(6);
    for (const item of items) {
      // The wall runs along z, so x hugs the wall line.
      expect(Math.abs(item.x - 5)).toBeLessThan(0.5);
      expect(item.z).toBeGreaterThan(-1);
      expect(item.z).toBeLessThan(21);
    }
  });

  it('runs the other way round on the other axis', () => {
    const items = alongWall(seeded(3), ['jar'], {
      from: -10, to: 10, at: 7, axis: 'x', count: 4,
    });
    for (const item of items) {
      expect(Math.abs(item.z - 7)).toBeLessThan(0.5);
      expect(Math.abs(item.x)).toBeLessThan(11);
    }
  });

  it('pushes props to the other side of the wall on a negative offset', () => {
    const inside = alongWall(seeded(3), ['jar'], {
      from: 0, to: 10, at: 0, axis: 'z', count: 3, offset: 0.8,
    });
    const outside = alongWall(seeded(3), ['jar'], {
      from: 0, to: 10, at: 0, axis: 'z', count: 3, offset: -0.8,
    });
    expect(inside[0].x).toBeGreaterThan(0);
    expect(outside[0].x).toBeLessThan(0);
  });

  it('only ever names kinds it was given', () => {
    const items = alongWall(seeded(8), ['jar', 'basket'], {
      from: 0, to: 10, at: 0, axis: 'z', count: 20,
    });
    for (const item of items) expect(['jar', 'basket']).toContain(item.kind);
  });
});

describe('heap', () => {
  it('piles things around a point, with some on top of others', () => {
    const items = heap(seeded(11), ['crate', 'sack'], { at: [4, -6], count: 8, radius: 0.8 });
    expect(items).toHaveLength(8);
    for (const item of items) {
      expect(Math.hypot(item.x - 4, item.z + 6)).toBeLessThanOrEqual(0.8);
      expect(item.lift).toBeGreaterThanOrEqual(0);
    }
    expect(items.some((item) => item.lift > 0)).toBe(true);
  });

  it('leans some of the pile, because a heap is not a shelf', () => {
    const items = heap(seeded(12), ['crate'], { at: [0, 0], count: 6 });
    expect(items.some((item) => Math.abs(item.tilt) > 0.05)).toBe(true);
    for (const item of items) expect(Math.abs(item.tilt)).toBeLessThan(0.5);
  });

  it('is deterministic for a given seed', () => {
    expect(heap(seeded(20), ['jar'], { at: [1, 1], count: 4 }))
      .toEqual(heap(seeded(20), ['jar'], { at: [1, 1], count: 4 }));
  });
});

describe('createProps', () => {
  const items = [
    { kind: 'jar', x: 1, z: 2, y: 0 },
    { kind: 'jar', x: 3, z: 2, y: 0 },
    { kind: 'jar', x: 5, z: 2, y: 0 },
    { kind: 'crate', x: 0, z: 0, y: 4 },
    { kind: 'basket', x: -2, z: 6, y: 0, rotation: 1.2, scale: 1.3 },
  ];

  it('draws one instanced mesh per kind, not one per object', () => {
    const props = createProps(THREE, { items });
    try {
      // Three jars, one crate, one basket — three meshes, five instances.
      expect(props.group.children).toHaveLength(3);
      expect(props.count).toBe(5);
      const jars = props.group.children.find((m) => m.count === 3);
      expect(jars.isInstancedMesh).toBe(true);
    } finally {
      props.dispose();
    }
  });

  it('puts each prop where it was asked for', () => {
    const props = createProps(THREE, { items });
    try {
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const placed = [];
      for (const mesh of props.group.children) {
        for (let i = 0; i < mesh.count; i += 1) {
          mesh.getMatrixAt(i, matrix);
          position.setFromMatrixPosition(matrix);
          placed.push(position.clone());
        }
      }
      for (const item of items) {
        const match = placed.find(
          (p) => Math.abs(p.x - item.x) < 0.01 && Math.abs(p.z - item.z) < 0.01,
        );
        expect(match, `nothing placed at ${item.x},${item.z}`).toBeTruthy();
        expect(match.y).toBeCloseTo(item.y, 5);
      }
    } finally {
      props.dispose();
    }
  });

  it('produces no NaN in any instance matrix', () => {
    const everyKind = PROP_NAMES.map((kind, i) => ({
      kind, x: i, z: -i, y: 1, rotation: i * 0.4, tilt: 0.2, scale: 0.9,
    }));
    const props = createProps(THREE, { items: everyKind });
    try {
      const matrix = new THREE.Matrix4();
      for (const mesh of props.group.children) {
        for (let i = 0; i < mesh.count; i += 1) {
          mesh.getMatrixAt(i, matrix);
          for (const value of matrix.elements) expect(Number.isFinite(value)).toBe(true);
        }
      }
    } finally {
      props.dispose();
    }
  });

  it('ignores a kind it has never heard of rather than crashing the scene', () => {
    const props = createProps(THREE, {
      items: [{ kind: 'ark-of-the-covenant', x: 0, z: 0 }, { kind: 'jar', x: 1, z: 1 }],
    });
    try {
      expect(props.count).toBe(1);
      expect(props.kinds).toEqual(['jar']);
    } finally {
      props.dispose();
    }
  });

  it('builds nothing at all from an empty list', () => {
    const props = createProps(THREE, { items: [] });
    expect(props.group.children).toHaveLength(0);
    expect(props.count).toBe(0);
    expect(() => props.dispose()).not.toThrow();
  });

  it('spends less on a low-quality device', () => {
    const detailed = PROP_NAMES.map((kind, i) => ({ kind, x: i, z: 0 }));
    const high = createProps(THREE, { items: detailed, quality: 'high' });
    const low = createProps(THREE, { items: detailed, quality: 'low' });
    try {
      const vertices = (props) => props.group.children
        .reduce((sum, m) => sum + m.geometry.getAttribute('position').count, 0);
      expect(vertices(low)).toBeLessThan(vertices(high));
      expect(low.group.children[0].castShadow).toBe(false);
    } finally {
      high.dispose();
      low.dispose();
    }
  });

  it('frees its geometries and materials', () => {
    const props = createProps(THREE, { items });
    const freed = [];
    for (const mesh of props.group.children) {
      mesh.geometry.addEventListener('dispose', () => freed.push('geometry'));
      mesh.material.addEventListener('dispose', () => freed.push('material'));
    }
    props.dispose();
    expect(freed.filter((f) => f === 'geometry')).toHaveLength(3);
    expect(freed.filter((f) => f === 'material')).toHaveLength(3);
  });
});
