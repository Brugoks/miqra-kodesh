import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCapernaumLife, VILLAGE_PEOPLE, FOLD } from './capernaumLife';
import { createHerd, createBirds, SPECIES, BIRDS } from './sceneAnimals';
import { createCrowd } from './sceneFigures';
import { floorAt, blockerAt, stanceAt } from './capernaumNavigation';
import { terrainHeight } from './capernaumLandscape';
import { inTableauArea } from './mark2Tableau';
import { inMatthewTableauArea } from './matthew9Tableau';
import { inSynagogueTableauArea } from './synagogueTableau';
import { LIFE_ANCHORS, LEVEL } from './capernaumDimensions';

// Nobody checks a goat in CI by looking at it, so these check what looking
// would: that everything alive stands on ground that exists, out of the
// walls, out of the two staged moments, and moves without going anywhere it
// could not.

const build = (quality = 'high') => createCapernaumLife(THREE, { quality, floorAt, terrainHeight });

// Samples an out-and-back route every 25 cm.
function routePoints(route) {
  const [[x0, z0], [x1, z1]] = route;
  const length = Math.hypot(x1 - x0, z1 - z0);
  const points = [];
  for (let s = 0; s <= length; s += 0.25) points.push([x0 + ((x1 - x0) * s) / length, z0 + ((z1 - z0) * s) / length]);
  return points;
}

describe('the village people', () => {
  it('stand and walk only where a person could, and never in a tableau', () => {
    for (const person of VILLAGE_PEOPLE) {
      const points = person.route ? routePoints(person.route) : [[person.x, person.z]];
      for (const [x, z] of points) {
        const where = `${person.id} at (${x.toFixed(1)}, ${z.toFixed(1)})`;
        expect(inTableauArea(x, z), where).toBe(false);
        expect(inMatthewTableauArea(x, z), where).toBe(false);
        expect(inSynagogueTableauArea(x, z), where).toBe(false);
        const floor = floorAt(x, z, 0);
        if (floor) {
          // In the village: on a floor the navigation reports, clear of walls.
          expect(blockerAt(x, z, floor.height), where).toBeNull();
        } else {
          // Beyond it, on the land above the village.
          expect(terrainHeight(x, z), where).toBeGreaterThan(LEVEL.ground - 0.2);
        }
      }
    }
  });

  it('includes the women and children the crowd used to lack', () => {
    const kinds = new Set(VILLAGE_PEOPLE.map((p) => p.kind));
    expect(kinds.has('woman')).toBe(true);
    expect(kinds.has('child')).toBe(true);
  });
});

describe('createCapernaumLife', () => {
  it('keeps the flock inside its fold, the donkeys at their post, and nothing in the lanes', () => {
    const life = build('high');
    try {
      const { herd, animals } = life;
      for (let t = 0; t < 600; t += 3.7) {
        animals.forEach((animal, i) => {
          const at = herd.positionOf(i, t);
          expect(Number.isFinite(at.x + at.z + at.facing), animal.species).toBe(true);
          if (animal.route) {
            // The dog on the promenade stays on walkable ground.
            const floor = floorAt(at.x, at.z, 0);
            expect(floor).toBeTruthy();
            expect(blockerAt(at.x, at.z, floor.height)).toBeNull();
          } else if (Math.hypot(at.x - (FOLD.x0 + FOLD.x1) / 2, at.z - (FOLD.z0 + FOLD.z1) / 2) < 6) {
            // Folded animals stay inside the walls.
            expect(at.x).toBeGreaterThan(FOLD.x0 + 0.3);
            expect(at.x).toBeLessThan(FOLD.x1 - 0.3);
            expect(at.z).toBeGreaterThan(FOLD.z0 + 0.3);
            expect(at.z).toBeLessThan(FOLD.z1 - 0.3);
          }
          expect(inTableauArea(at.x, at.z)).toBe(false);
        });
      }
      // The fold and the tether are solid to a walker.
      expect(blockerAt((FOLD.x0 + FOLD.x1) / 2, (FOLD.z0 + FOLD.z1) / 2, 0)).toBe('goat-pen');
      expect(blockerAt(LIFE_ANCHORS.donkeys.x, LIFE_ANCHORS.donkeys.z, 0)).toBe('donkeys');
      // And the approach to both is still open ground.
      expect(stanceAt(FOLD.x1 + 1.2, (FOLD.z0 + FOLD.z1) / 2, 0)).toBeTruthy();
    } finally {
      life.dispose();
    }
  });

  it('keeps its birds off the ground where they fly and on it where they peck', () => {
    const life = build('high');
    try {
      life.birds.forEach((bird, i) => {
        for (let t = 0; t < 120; t += 1.3) {
          const at = life.flock.positionOf(i, t);
          expect(Number.isFinite(at.x + at.y + at.z), bird.kind).toBe(true);
          if (bird.mode === 'soar') expect(at.y).toBeGreaterThan(6);
          if (bird.mode === 'dart') expect(at.y).toBeGreaterThan(3.3);
          if (bird.mode === 'peck') expect(at.y).toBeCloseTo(LEVEL.ground, 5);
        }
      });
    } finally {
      life.dispose();
    }
  });

  it('writes finite instances every frame, stays within budget, and is lighter on low', () => {
    const stats = (life) => {
      let draws = 0;
      let triangles = 0;
      life.group.traverse((o) => {
        if (!o.isMesh) return;
        draws += 1;
        const n = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
        triangles += (n / 3) * (o.isInstancedMesh ? o.count : 1);
      });
      return { draws, triangles };
    };
    const high = build('high');
    const low = build('low');
    try {
      for (let t = 0; t < 20; t += 0.5) high.update(t);
      const matrix = new THREE.Matrix4();
      high.group.traverse((o) => {
        if (!o.isInstancedMesh) return;
        for (let i = 0; i < o.count; i += 1) {
          o.getMatrixAt(i, matrix);
          expect(matrix.elements.every(Number.isFinite), o.name).toBe(true);
        }
      });
      const h = stats(high);
      const l = stats(low);
      expect(h.draws).toBeLessThanOrEqual(20);
      expect(h.triangles).toBeLessThan(60000);
      expect(l.triangles).toBeLessThan(h.triangles);
    } finally {
      high.dispose();
      low.dispose();
    }
  });
});

describe('sceneAnimals', () => {
  it('builds every species and bird deterministically', () => {
    const animals = Object.keys(SPECIES).map((species, i) => ({ species, x: i * 3, z: 0, pose: 'stand', phase: i }));
    const a = createHerd(THREE, { animals });
    const b = createHerd(THREE, { animals });
    const birds = createBirds(THREE, { birds: Object.keys(BIRDS).map((kind, i) => ({ kind, mode: 'peck', x: i, z: 0, y: 0 })) });
    try {
      const ma = new THREE.Matrix4();
      const mb = new THREE.Matrix4();
      a.update(3.3);
      b.update(3.3);
      a.meshes.forEach((mesh, k) => {
        for (let i = 0; i < mesh.count; i += 1) {
          mesh.getMatrixAt(i, ma);
          b.meshes[k].getMatrixAt(i, mb);
          expect(ma.equals(mb)).toBe(true);
        }
      });
      expect(birds.meshes[0].count).toBe(Object.keys(BIRDS).length);
    } finally {
      a.dispose();
      b.dispose();
      birds.dispose();
    }
  });
});

describe('sceneFigures kinds', () => {
  it('veils the women, leaves the children small and bareheaded, and draws the men as before', () => {
    const crowd = createCrowd(THREE, {
      figures: [
        { x: 0, z: 0, activity: 'standing' },
        { x: 2, z: 0, activity: 'standing', kind: 'woman' },
        { x: 4, z: 0, activity: 'standing', kind: 'child', scale: 0.6 },
      ],
    });
    try {
      const byName = Object.fromEntries(crowd.meshes.map((m) => [m.name.replace('crowd-', '').replace('crowd', 'robes'), m]));
      const scaleOf = (mesh, i) => {
        const m = new THREE.Matrix4();
        mesh.getMatrixAt(i, m);
        return new THREE.Vector3().setFromMatrixScale(m).length();
      };
      // Bearded heads for the man only; clean heads for the woman and child.
      expect(scaleOf(byName.heads, 0)).toBeGreaterThan(0);
      expect(scaleOf(byName.heads, 1)).toBe(0);
      expect(scaleOf(byName['heads-clean'], 1)).toBeGreaterThan(0);
      expect(scaleOf(byName['heads-clean'], 2)).toBeGreaterThan(0);
      // The woman is veiled, not in a man's head cloth; the child bareheaded.
      expect(scaleOf(byName.veils, 1)).toBeGreaterThan(0);
      expect(scaleOf(byName.cloths, 1)).toBe(0);
      expect(scaleOf(byName.cloths, 2)).toBe(0);
      expect(scaleOf(byName.cloths, 0)).toBeGreaterThan(0);
      // The child is smaller.
      expect(scaleOf(byName.robes, 2)).toBeLessThan(scaleOf(byName.robes, 0));
    } finally {
      crowd.dispose();
    }
  });

  it('keeps a bareheaded man bearded', () => {
    const crowd = createCrowd(THREE, {
      figures: [{ x: 0, z: 0, activity: 'standing', bareheaded: true }, { x: 2, z: 0, activity: 'standing' }],
    });
    try {
      const byName = Object.fromEntries(crowd.meshes.map((m) => [m.name.replace('crowd-', ''), m]));
      const scaleOf = (mesh, i) => {
        const m = new THREE.Matrix4();
        mesh.getMatrixAt(i, m);
        return new THREE.Vector3().setFromMatrixScale(m).length();
      };
      expect(scaleOf(byName['heads-bare'], 0)).toBeGreaterThan(0);
      expect(scaleOf(byName.heads, 0)).toBe(0);
      expect(scaleOf(byName.cloths, 0)).toBe(0);
      expect(scaleOf(byName.heads, 1)).toBeGreaterThan(0);
      expect(byName['heads-clean']).toBeUndefined();
    } finally {
      crowd.dispose();
    }
  });

  it('adds no parts to a crowd of men', () => {
    const crowd = createCrowd(THREE, { figures: [{ x: 0, z: 0, activity: 'standing' }] });
    try {
      expect(crowd.meshes).toHaveLength(4);
    } finally {
      crowd.dispose();
    }
  });
});
