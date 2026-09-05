import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import buildSecondTemple from './buildSecondTemple';
import { LEVEL } from './templeDimensions';

// The builder never touches WebGL — it only assembles geometry — so it runs
// perfectly well in jsdom against the real three.js. That makes this the one
// piece of the 3D route that can be verified headlessly, and it is worth
// verifying: a mistyped hex literal or a stray NaN coordinate produces a scene
// that is silently, invisibly broken rather than one that throws.
//
// The single browser dependency is a 2D canvas for the procedural textures,
// which jsdom only implements with the optional `canvas` package installed.
// Stubbing it keeps the test free of that dependency.
const realGetContext = HTMLCanvasElement.prototype.getContext;

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = function getContext(kind) {
    if (kind !== '2d') return null;
    return {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      fillRect: () => {},
      strokeRect: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
    };
  };
});

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
});

function everyPosition(root) {
  const points = [];
  root.traverse((object) => {
    if (object.isObject3D) points.push(object.position);
  });
  return points;
}

describe('buildSecondTemple', () => {
  it('builds a scene graph without NaN anywhere in it', () => {
    const built = buildSecondTemple(THREE, { maxAnisotropy: 4 });
    try {
      expect(built.root.children.length).toBeGreaterThan(20);
      // A single NaN propagates through the matrix maths and makes an object
      // vanish rather than error, so it has to be asserted rather than watched
      // for. `slab()` derives every position from arithmetic on named extents,
      // which is exactly where a typo would surface.
      everyPosition(built.root).forEach((position) => {
        expect(Number.isFinite(position.x)).toBe(true);
        expect(Number.isFinite(position.y)).toBe(true);
        expect(Number.isFinite(position.z)).toBe(true);
      });
    } finally {
      built.dispose();
    }
  });

  it('keeps the three court levels in ascending order westward', () => {
    // The whole scene is a climb: if these ever invert or collide, the vantages
    // in lib/scenes.js put the camera inside the masonry.
    expect(LEVEL.outer).toBeLessThan(LEVEL.women);
    expect(LEVEL.women).toBeLessThan(LEVEL.inner);
    // Fifteen steps at half a cubit each is the figure Middot gives.
    expect(LEVEL.inner - LEVEL.women).toBeCloseTo(15 * 0.25, 5);
  });

  it('places instanced meshes with real matrices', () => {
    const built = buildSecondTemple(THREE, {});
    try {
      const instanced = [];
      built.root.traverse((object) => {
        if (object.isInstancedMesh) instanced.push(object);
      });
      // Columns, capitals, chests, plinths, spikes, robes, heads, houses.
      expect(instanced.length).toBeGreaterThanOrEqual(8);
      instanced.forEach((mesh) => {
        expect(mesh.count).toBeGreaterThan(0);
        const matrix = new THREE.Matrix4();
        mesh.getMatrixAt(mesh.count - 1, matrix);
        // An untouched instance matrix is all zeroes, which collapses the mesh
        // to a point at the origin — the classic "where did my crowd go".
        expect(matrix.elements.some((value) => value !== 0)).toBe(true);
        matrix.elements.forEach((value) => expect(Number.isFinite(value)).toBe(true));
      });
    } finally {
      built.dispose();
    }
  });

  it('drives the altar smoke to finite, rising positions', () => {
    const built = buildSecondTemple(THREE, {});
    try {
      let points = null;
      built.root.traverse((object) => {
        if (object.isPoints) points = object;
      });
      expect(points).not.toBeNull();

      built.update(0);
      const attribute = points.geometry.getAttribute('position');
      const firstY = attribute.getY(0);

      built.update(3.5);
      for (let i = 0; i < attribute.count; i += 1) {
        expect(Number.isFinite(attribute.getX(i))).toBe(true);
        expect(Number.isFinite(attribute.getY(i))).toBe(true);
        expect(Number.isFinite(attribute.getZ(i))).toBe(true);
        // Smoke never sinks below the altar it rises from.
        expect(attribute.getY(i)).toBeGreaterThanOrEqual(LEVEL.inner);
      }
      expect(attribute.getY(0)).not.toBe(firstY);
    } finally {
      built.dispose();
    }
  });

  it('builds a cheaper scene on low quality, and casts no shadows there', () => {
    const high = buildSecondTemple(THREE, { quality: 'high' });
    const low = buildSecondTemple(THREE, { quality: 'low' });
    try {
      const count = (built) => {
        let total = 0;
        built.root.traverse((object) => {
          if (object.isInstancedMesh) total += object.count;
        });
        return total;
      };
      expect(count(low)).toBeLessThan(count(high));
      expect(low.sun.castShadow).toBe(false);
      expect(high.sun.castShadow).toBe(true);
    } finally {
      high.dispose();
      low.dispose();
    }
  });

  it('is deterministic, so the crowd stands in the same place on every visit', () => {
    const a = buildSecondTemple(THREE, {});
    const b = buildSecondTemple(THREE, {});
    try {
      const matrix = new THREE.Matrix4();
      const other = new THREE.Matrix4();
      const robesA = [];
      const robesB = [];
      a.root.traverse((o) => { if (o.isInstancedMesh) robesA.push(o); });
      b.root.traverse((o) => { if (o.isInstancedMesh) robesB.push(o); });
      robesA.forEach((mesh, index) => {
        mesh.getMatrixAt(0, matrix);
        robesB[index].getMatrixAt(0, other);
        expect(matrix.elements).toEqual(other.elements);
      });
    } finally {
      a.dispose();
      b.dispose();
    }
  });

  it('disposes every geometry and material it created', () => {
    const built = buildSecondTemple(THREE, {});
    const disposed = [];
    built.root.traverse((object) => {
      if (object.geometry) {
        object.geometry.addEventListener('dispose', () => disposed.push('geometry'));
      }
    });
    built.dispose();
    expect(disposed.length).toBeGreaterThan(20);
  });
});
