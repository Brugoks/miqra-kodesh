import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import buildTabernacle from './buildTabernacle';
import {
  CUBIT,
  COURT,
  COURT_GATE,
  TENT,
  VEIL_Z,
  COVERINGS,
  BRONZE_ALTAR,
  ARK,
} from './tabernacleDimensions';
import { blockerAt } from './tabernacleNavigation';

// The Tabernacle is the one structure in Scripture given as a specification, so
// these tests can do something the other scenes' cannot: check the building
// against the text. If the court stops being a hundred cubits by fifty, or the
// Most Holy Place stops being a cube, that is not a matter of taste.

function build(options = {}) {
  return buildTabernacle(THREE, options);
}

function meshes(built) {
  const found = [];
  built.root.traverse((object) => {
    if (object.isMesh || object.isInstancedMesh) found.push(object);
  });
  return found;
}

function extentOf(built, name) {
  const box = new THREE.Box3();
  let found = false;
  built.root.updateMatrixWorld(true);
  built.root.traverse((object) => {
    if (!(object.isMesh || object.isInstancedMesh) || object.name !== name) return;
    box.expandByObject(object);
    found = true;
  });
  return found ? box : null;
}

describe('buildTabernacle', () => {
  it('builds without NaN, and with no box turned inside out', () => {
    const built = build();
    try {
      expect(built.root.children.length).toBeGreaterThan(30);
      built.root.traverse((object) => {
        expect(Number.isFinite(object.position.x)).toBe(true);
        expect(Number.isFinite(object.position.y)).toBe(true);
        expect(Number.isFinite(object.position.z)).toBe(true);
      });
      meshes(built).forEach((mesh) => {
        const parameters = mesh.geometry?.parameters;
        if (!parameters) return;
        ['width', 'height', 'depth', 'radius', 'radiusTop', 'radiusBottom'].forEach((key) => {
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
        expect(matrix.elements.some((value) => value !== 0), mesh.name).toBe(true);
        matrix.elements.forEach((value) => expect(Number.isFinite(value)).toBe(true));
      });
    } finally {
      built.dispose();
    }
  });

  // --- against the text ---------------------------------------------------

  describe('the measurements Exodus gives', () => {
    it('encloses a court of a hundred cubits by fifty', () => {
      expect((COURT.zEast - COURT.zWest) / CUBIT).toBeCloseTo(100, 6);
      expect((COURT.halfX * 2) / CUBIT).toBeCloseTo(50, 6);
      expect(COURT.height / CUBIT).toBeCloseTo(5, 6);
    });

    it('leaves a gate of twenty cubits in the middle of the east end', () => {
      expect((COURT_GATE.halfX * 2) / CUBIT).toBeCloseTo(20, 6);
      const built = build();
      try {
        built.root.updateMatrixWorld(true);
        const hangings = meshes(built)
          .filter((mesh) => mesh.name === 'hanging')
          .map((mesh) => new THREE.Box3().setFromObject(mesh));
        // Something is drawn across the gate — the embroidered screen — and it
        // is not the same run as the plain hanging either side of it.
        const acrossTheGate = hangings.filter((box) => box.min.x < 0 && box.max.x > 0
          && box.min.z < COURT.zEast + 0.6 && box.max.z > COURT.zEast - 0.6);
        expect(acrossTheGate).toHaveLength(1);
        expect(acrossTheGate[0].max.x - acrossTheGate[0].min.x).toBeCloseTo(COURT_GATE.halfX * 2, 0);
      } finally {
        built.dispose();
      }
    });

    it('makes the tent thirty cubits by ten by ten', () => {
      expect((TENT.zEast - TENT.zWest) / CUBIT).toBeCloseTo(30, 6);
      expect((TENT.halfX * 2) / CUBIT).toBeCloseTo(10, 6);
      expect(TENT.height / CUBIT).toBeCloseTo(10, 6);
    });

    it('makes the Most Holy Place a perfect ten-cubit cube', () => {
      expect((VEIL_Z - TENT.zWest) / CUBIT).toBeCloseTo(10, 6);
      expect((TENT.halfX * 2) / CUBIT).toBeCloseTo(10, 6);
      expect(TENT.height / CUBIT).toBeCloseTo(10, 6);
    });

    it('stands forty-eight boards in twice as many silver sockets', () => {
      const built = build();
      try {
        const boards = meshes(built).find((mesh) => mesh.name === 'boards');
        const sockets = meshes(built).find((mesh) => mesh.name === 'board-sockets');
        // Twenty a side and eight across the west end (Exodus 26:18-25) —
        // six for the west, plus two for the corners, which is the detail that
        // makes the total forty-eight rather than forty-six.
        expect(boards.count).toBe(48);
        // "Two sockets under one board" (26:19).
        expect(sockets.count).toBe(96);
      } finally {
        built.dispose();
      }
    });

    it('makes the bronze altar five cubits square and three high', () => {
      expect((BRONZE_ALTAR.half * 2) / CUBIT).toBeCloseTo(5, 6);
      expect(BRONZE_ALTAR.height / CUBIT).toBeCloseTo(3, 6);
      const built = build();
      try {
        const altar = extentOf(built, 'bronze-altar');
        expect(altar.max.x - altar.min.x).toBeCloseTo(BRONZE_ALTAR.half * 2, 3);
        expect(altar.max.y - altar.min.y).toBeCloseTo(BRONZE_ALTAR.height, 3);
      } finally {
        built.dispose();
      }
    });

    it('lays four coverings over the tent, in order', () => {
      const built = build();
      try {
        const heights = COVERINGS.map((covering) => {
          const box = extentOf(built, `covering-${covering.id}`);
          expect(box, covering.id).not.toBeNull();
          return box.max.y;
        });
        // Innermost lowest, outermost highest, and each oversailing the last so
        // the layering is visible from outside.
        for (let i = 1; i < heights.length; i += 1) {
          expect(heights[i]).toBeGreaterThan(heights[i - 1]);
        }
        const inner = extentOf(built, `covering-${COVERINGS[0].id}`);
        const outer = extentOf(built, `covering-${COVERINGS[3].id}`);
        expect(outer.max.x).toBeGreaterThan(inner.max.x);
      } finally {
        built.dispose();
      }
    });
  });

  // --- the lampstand ------------------------------------------------------

  describe('the lampstand', () => {
    it('has a shaft and six branches, and seven flames in a line', () => {
      const built = build();
      try {
        const branches = meshes(built).filter((mesh) => mesh.name === 'lamp-branch');
        expect(branches).toHaveLength(6);

        built.root.updateMatrixWorld(true);
        const flames = [];
        built.root.traverse((object) => {
          if (object.isMesh && object.geometry?.type === 'ConeGeometry'
            && object.material?.type === 'MeshBasicMaterial') flames.push(object);
        });
        expect(flames).toHaveLength(7);
        // All seven lamps stand level with the top of the shaft (Exodus 25:37).
        const worldY = flames.map((flame) => flame.getWorldPosition(new THREE.Vector3()).y);
        const spread = Math.max(...worldY) - Math.min(...worldY);
        expect(spread).toBeLessThan(0.02);
      } finally {
        built.dispose();
      }
    });

    it('carries knops, cups and flowers, as the text counts them', () => {
      const built = build();
      try {
        const knops = meshes(built).find((mesh) => mesh.name === 'lamp-knops');
        const cups = meshes(built).find((mesh) => mesh.name === 'lamp-cups');
        // Four on the shaft plus three on each of six branches.
        expect(knops.count).toBe(4 + 18);
        expect(cups.count).toBe(4 + 18);
      } finally {
        built.dispose();
      }
    });

    it('is the only thing lighting the Holy Place', () => {
      const built = build();
      try {
        const lights = [];
        built.root.traverse((object) => {
          if (object.isPointLight) lights.push(object);
        });
        // Three at the lampstand, one on the altar fire out in the court.
        const inside = lights.filter((light) => light.position.z > TENT.zWest && light.position.z < TENT.zEast);
        expect(inside.length).toBeGreaterThanOrEqual(3);
        inside.forEach((light) => {
          expect(Math.abs(light.position.x)).toBeLessThan(TENT.halfX);
          // None of them is behind the veil.
          expect(light.position.z).toBeGreaterThan(VEIL_Z);
        });
      } finally {
        built.dispose();
      }
    });
  });

  // --- behind the veil ----------------------------------------------------

  it('builds the ark, puts it in the Most Holy Place, and leaves it dark', () => {
    const built = build();
    try {
      built.root.updateMatrixWorld(true);
      const ark = built.root.getObjectByName('ark');
      expect(ark).toBeDefined();
      const position = ark.getWorldPosition(new THREE.Vector3());
      expect(position.z).toBeLessThan(VEIL_Z);
      expect(position.z).toBeGreaterThan(TENT.zWest);
      expect(position.z).toBeCloseTo(ARK.z, 5);
      expect(built.root.getObjectByName('mercy-seat')).toBeDefined();

      // And no light of any kind is put in there with it.
      const lightsBehindVeil = [];
      built.root.traverse((object) => {
        if (object.isLight && object.isPointLight && object.position.z < VEIL_Z) lightsBehindVeil.push(object);
      });
      expect(lightsBehindVeil).toHaveLength(0);

      // Nor can anyone walk in.
      expect(blockerAt(0, VEIL_Z)).toBe('veil');
    } finally {
      built.dispose();
    }
  });

  // --- motion -------------------------------------------------------------

  describe('the scene moves', () => {
    it('drives the cloth, the cloud and the smoke off the clock', () => {
      const built = build();
      try {
        built.update(3.5);
        const clocked = [];
        built.root.traverse((object) => {
          if (object.material?.uniforms?.uTime) clocked.push(object.material.uniforms.uTime.value);
        });
        expect(clocked.length).toBeGreaterThan(4);
        clocked.forEach((value) => expect(value).toBe(3.5));
      } finally {
        built.dispose();
      }
    });

    it('sends the smoke upward and keeps it finite', () => {
      const built = build();
      try {
        let points = null;
        built.root.traverse((object) => {
          if (object.isPoints && !points) points = object;
        });
        expect(points).not.toBeNull();
        built.update(0);
        const attribute = points.geometry.getAttribute('position');
        const first = attribute.getY(0);
        built.update(4);
        for (let i = 0; i < attribute.count; i += 1) {
          expect(Number.isFinite(attribute.getX(i))).toBe(true);
          expect(attribute.getY(i)).toBeGreaterThanOrEqual(0);
        }
        expect(attribute.getY(0)).not.toBe(first);
      } finally {
        built.dispose();
      }
    });

    it('makes the lamps flicker rather than burn flat', () => {
      const built = build();
      try {
        const lamp = [];
        built.root.traverse((object) => {
          if (object.isPointLight) lamp.push(object);
        });
        built.update(0.4);
        const before = lamp.map((light) => light.intensity);
        built.update(1.1);
        const after = lamp.map((light) => light.intensity);
        expect(after).not.toEqual(before);
        after.forEach((value) => expect(Number.isFinite(value)).toBe(true));
      } finally {
        built.dispose();
      }
    });
  });

  it('builds a cheaper tabernacle on low quality, and casts no shadows there', () => {
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

  it('is deterministic', () => {
    const a = build();
    const b = build();
    try {
      const one = meshes(a);
      const two = meshes(b);
      expect(one.length).toBe(two.length);
      one.forEach((mesh, index) => {
        expect(mesh.position.toArray()).toEqual(two[index].position.toArray());
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
