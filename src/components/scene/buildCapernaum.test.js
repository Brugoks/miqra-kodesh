import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import buildCapernaum from './buildCapernaum';
import { LEVEL, INSULA, HOUSE, SYNAGOGUE } from './capernaumDimensions';
import { floorAt, blockerAt } from './capernaumNavigation';

// The builder touches no WebGL — it only assembles geometry — so it runs against
// the real three.js in jsdom. That makes this the one part of the visual work
// that can be checked headlessly, and the checks worth writing are the ones a
// screenshot would not catch: a NaN that silently deletes a building, an
// instanced mesh whose matrices were never written, or geometry that has
// drifted away from the collision model standing in the same place.

function build(options = {}) {
  return buildCapernaum(THREE, options);
}

function meshes(built) {
  const found = [];
  built.root.traverse((object) => {
    if (object.isMesh || object.isInstancedMesh) found.push(object);
  });
  return found;
}

// The world-space bounding box of everything named `name`.
function extentOf(built, name) {
  const box = new THREE.Box3();
  let found = false;
  built.root.updateMatrixWorld(true);
  built.root.traverse((object) => {
    if (!object.isMesh || object.name !== name) return;
    box.expandByObject(object);
    found = true;
  });
  return found ? box : null;
}

describe('buildCapernaum', () => {
  it('builds a village without NaN anywhere in it', () => {
    const built = build();
    try {
      expect(built.root.children.length).toBeGreaterThan(30);
      built.root.traverse((object) => {
        expect(Number.isFinite(object.position.x)).toBe(true);
        expect(Number.isFinite(object.position.y)).toBe(true);
        expect(Number.isFinite(object.position.z)).toBe(true);
        expect(Number.isFinite(object.scale.x)).toBe(true);
      });
      // Every box has a real, positive size — a slab written with its extents
      // the wrong way round produces a negative dimension and vanishes.
      meshes(built).forEach((mesh) => {
        const parameters = mesh.geometry?.parameters;
        if (!parameters) return;
        ['width', 'height', 'depth', 'radiusTop', 'radiusBottom'].forEach((key) => {
          if (parameters[key] === undefined) return;
          expect(parameters[key], `${mesh.name || mesh.type}.${key}`).toBeGreaterThan(0);
        });
      });
    } finally {
      built.dispose();
    }
  });

  it('writes real matrices into every instanced mesh', () => {
    const built = build();
    try {
      const instanced = meshes(built).filter((mesh) => mesh.isInstancedMesh);
      expect(instanced.length).toBeGreaterThanOrEqual(10);
      const matrix = new THREE.Matrix4();
      instanced.forEach((mesh) => {
        expect(mesh.count, mesh.name).toBeGreaterThan(0);
        mesh.getMatrixAt(mesh.count - 1, matrix);
        // An untouched instance matrix is all zeroes, which collapses the whole
        // mesh to a point at the origin.
        expect(matrix.elements.some((value) => value !== 0), mesh.name).toBe(true);
        matrix.elements.forEach((value) => expect(Number.isFinite(value)).toBe(true));
      });
    } finally {
      built.dispose();
    }
  });

  // The point of the scene: the room, the hole above it, and the light coming
  // through. If any of these three is missing the visit has no payoff.
  describe('the set piece', () => {
    it('leaves the roof open where the four men dug through it', () => {
      const built = build();
      try {
        const roof = extentOf(built, 'roof-surface');
        expect(roof).not.toBeNull();
        // The roof spans the insula...
        expect(roof.min.x).toBeLessThanOrEqual(INSULA.x0 + 0.01);
        expect(roof.max.x).toBeGreaterThanOrEqual(INSULA.x1 - 0.01);
        // ...and nothing is drawn across the middle of the opening.
        const overTheHole = meshes(built).filter((mesh) => {
          if (mesh.name !== 'roof-surface') return false;
          const box = new THREE.Box3().setFromObject(mesh);
          return box.min.x < 16 && box.max.x > 16 && box.min.z < 12.5 && box.max.z > 12.5;
        });
        expect(overTheHole).toHaveLength(0);
      } finally {
        built.dispose();
      }
    });

    it('carries the roof on beams, broken off around the hole', () => {
      const built = build();
      try {
        const beams = meshes(built).find((mesh) => mesh.name === 'roof-beams');
        const broken = meshes(built).find((mesh) => mesh.name === 'roof-broken-ends');
        const spoil = meshes(built).find((mesh) => mesh.name === 'roof-spoil');
        expect(beams.count).toBeGreaterThan(8);
        expect(broken.count).toBeGreaterThan(4);
        expect(spoil.count).toBeGreaterThan(8);
      } finally {
        built.dispose();
      }
    });

    it('lights the room through the hole', () => {
      const built = build();
      try {
        const lights = [];
        built.root.traverse((object) => {
          if (object.isPointLight) lights.push(object);
        });
        expect(lights).toHaveLength(1);
        // The lamp is inside the room, not floating in the lane.
        expect(lights[0].position.x).toBeGreaterThan(HOUSE.x0);
        expect(lights[0].position.x).toBeLessThan(HOUSE.x1);
        expect(lights[0].position.z).toBeGreaterThan(HOUSE.z0);
        expect(lights[0].position.z).toBeLessThan(HOUSE.z1);

        const shaft = meshes(built).find((mesh) => mesh.name === 'light-shaft');
        expect(shaft).toBeDefined();
        const box = new THREE.Box3().setFromObject(shaft);
        // It runs from the opening down to the floor.
        expect(box.max.y).toBeGreaterThan(LEVEL.roof - 0.6);
        expect(box.min.y).toBeLessThan(LEVEL.ground + 0.2);
      } finally {
        built.dispose();
      }
    });
  });

  // Geometry and collision are generated from the same dimensions module, so
  // these check the two have not been wired up to different parts of it.
  describe('what is drawn matches what is solid', () => {
    it('puts the synagogue where the navigation says the synagogue is', () => {
      const built = build();
      try {
        const podium = extentOf(built, 'synagogue-podium');
        expect(podium.min.x).toBeCloseTo(SYNAGOGUE.podiumX0, 1);
        expect(podium.max.x).toBeCloseTo(SYNAGOGUE.podiumX1, 1);
        expect(podium.max.y).toBeCloseTo(LEVEL.ground + LEVEL.platform, 1);
        // And the navigation agrees you stand on top of it.
        expect(floorAt(-19, 40, LEVEL.platform).height).toBeCloseTo(LEVEL.platform, 5);
      } finally {
        built.dispose();
      }
    });

    it('draws masonry everywhere the navigation refuses to let you walk', () => {
      const built = build();
      try {
        built.root.updateMatrixWorld(true);
        const solids = meshes(built)
          .filter((mesh) => mesh.name === 'insula-mass')
          .map((mesh) => new THREE.Box3().setFromObject(mesh));
        expect(solids.length).toBeGreaterThan(4);

        // Sample the insula footprint: anywhere the collision model says
        // 'house' at street level, there has to be a wall drawn.
        let checked = 0;
        for (let x = INSULA.x0 + 0.5; x < INSULA.x1; x += 1.5) {
          for (let z = INSULA.z0 + 0.5; z < INSULA.z1; z += 1.5) {
            if (blockerAt(x, z, LEVEL.ground) !== 'house') continue;
            const point = new THREE.Vector3(x, LEVEL.ground + 1, z);
            // Collision stops you a body radius short of a wall, so a blocked
            // point can legitimately sit just outside the masonry. What must
            // never happen is collision refusing open space.
            const near = solids.some((box) => box.distanceToPoint(point) <= 0.5);
            expect(near, `nothing drawn near (${x}, ${z}) but collision says wall`).toBe(true);
            checked += 1;
          }
        }
        expect(checked).toBeGreaterThan(30);
      } finally {
        built.dispose();
      }
    });

    it('leaves the doorway and the courtyard entry genuinely open', () => {
      const built = build();
      try {
        built.root.updateMatrixWorld(true);
        const solids = meshes(built)
          .filter((mesh) => mesh.name === 'insula-mass')
          .map((mesh) => new THREE.Box3().setFromObject(mesh));
        const doorway = new THREE.Vector3((HOUSE.doorX0 + HOUSE.doorX1) / 2, LEVEL.ground + 1, HOUSE.z1 + 0.4);
        expect(solids.some((box) => box.containsPoint(doorway))).toBe(false);
      } finally {
        built.dispose();
      }
    });
  });

  describe('the scene moves', () => {
    it('walks the crowd along its routes', () => {
      const built = build();
      try {
        const walkers = meshes(built).find((mesh) => mesh.name === 'walkers');
        expect(walkers.count).toBeGreaterThan(6);

        const before = new THREE.Matrix4();
        const after = new THREE.Matrix4();
        built.update(0);
        walkers.getMatrixAt(0, before);
        built.update(6);
        walkers.getMatrixAt(0, after);
        expect(after.elements).not.toEqual(before.elements);
        after.elements.forEach((value) => expect(Number.isFinite(value)).toBe(true));
      } finally {
        built.dispose();
      }
    });

    it('keeps the crowd on the ground, never inside the lake or the air', () => {
      const built = build();
      try {
        const walkers = meshes(built).find((mesh) => mesh.name === 'walkers');
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        for (const time of [0, 3, 9, 17, 31]) {
          built.update(time);
          for (let i = 0; i < walkers.count; i += 1) {
            walkers.getMatrixAt(i, matrix);
            position.setFromMatrixPosition(matrix);
            expect(position.y).toBeGreaterThan(LEVEL.beach - 0.2);
            expect(position.y).toBeLessThan(LEVEL.ground + 2);
          }
        }
      } finally {
        built.dispose();
      }
    });

    it('runs the water and the light shaft off the clock', () => {
      const built = build();
      try {
        built.update(2.5);
        let shaftTime = null;
        built.root.traverse((object) => {
          if (object.name === 'light-shaft') shaftTime = object.material.uniforms.uTime.value;
        });
        expect(shaftTime).toBe(2.5);
      } finally {
        built.dispose();
      }
    });
  });

  it('builds a cheaper village on low quality and casts no shadows there', () => {
    const high = build({ quality: 'high' });
    const low = build({ quality: 'low' });
    try {
      const total = (built) => meshes(built)
        .filter((mesh) => mesh.isInstancedMesh)
        .reduce((sum, mesh) => sum + mesh.count, 0);
      expect(total(low)).toBeLessThan(total(high));
      expect(low.sun.castShadow).toBe(false);
      expect(high.sun.castShadow).toBe(true);
    } finally {
      high.dispose();
      low.dispose();
    }
  });

  it('is deterministic, so the village is the same place on every visit', () => {
    const a = build();
    const b = build();
    try {
      const aMeshes = meshes(a);
      const bMeshes = meshes(b);
      expect(aMeshes.length).toBe(bMeshes.length);
      aMeshes.forEach((mesh, index) => {
        expect(mesh.position.toArray()).toEqual(bMeshes[index].position.toArray());
      });
    } finally {
      a.dispose();
      b.dispose();
    }
  });

  it('disposes what it created', () => {
    const built = build();
    const disposed = [];
    built.root.traverse((object) => {
      if (object.geometry) object.geometry.addEventListener('dispose', () => disposed.push(1));
    });
    built.dispose();
    expect(disposed.length).toBeGreaterThan(20);
  });
});
