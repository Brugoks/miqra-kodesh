import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCapernaumLandscape, terrainHeight, landUse, VILLAGE_FLOOR } from './capernaumLandscape';
import { TERRAIN } from './capernaumTerrainData';
import { HORIZON_RIBBONS } from './capernaumHorizonData';
import { LEVEL, SHORE, TREES } from './capernaumDimensions';
import { blockerAt } from './capernaumNavigation';
import { applyLighting } from './sceneLighting';
import { createCapernaumFleet, HULL } from './capernaumBoats';
import { BOATS, PIERS } from './capernaumDimensions';

// None of this can be eyeballed in CI, and all of it is a claim about a real
// place: so the checks are against the survey the data was baked from, and
// against the village the land has to meet without a seam.

const angleOf = (ribbon, bearing) => {
  const point = ribbon.points.find(([b]) => b === bearing);
  return point ? (Math.atan((point[1] - 0.85) / ribbon.D) * 180) / Math.PI : null;
};
const ribbon = (id) => HORIZON_RIBBONS.find((r) => r.id === id);

describe('the baked landscape data', () => {
  it('reproduces the survey heights of the slope behind the village', () => {
    expect(TERRAIN.nx * TERRAIN.nz).toBe(TERRAIN.heights.length);
    const at = (x, z) => TERRAIN.heights[((z - TERRAIN.z0) / TERRAIN.step) * TERRAIN.nx + (x - TERRAIN.x0) / TERRAIN.step];
    // Five or six per cent up toward the Korazim plateau.
    expect(at(0, 240)).toBeGreaterThan(8);
    expect(at(0, 240)).toBeLessThan(20);
    expect(at(0, 750)).toBeGreaterThan(35);
    expect(at(0, 750)).toBeLessThan(55);
    // And the lake to the south, below the first-century waterline.
    expect(at(0, -300)).toBeLessThan(LEVEL.lake);
  });

  it('puts the landmarks at their true angular heights, and leaves out what cannot be seen', () => {
    expect(angleOf(ribbon('arbel-nitai'), 228)).toBeCloseTo(2.28, 1);
    // Arbel's cliff drops away sharply to the notch beside it.
    expect(angleOf(ribbon('arbel-nitai'), 232)).toBeLessThan(1.2);
    expect(angleOf(ribbon('golan-escarpment'), 90)).toBeCloseTo(2.43, 1);
    expect(angleOf(ribbon('korazim-eremos-slope'), 318)).toBeCloseTo(6.2, 1);
    // Due south is open water all the way down the lake: nothing stands above
    // the waterline there.
    const south = HORIZON_RIBBONS.flatMap((r) => r.points).filter(([b]) => b >= 178 && b <= 181);
    south.forEach(([, yTop]) => expect(yTop).toBeLessThan(LEVEL.lake + 0.1));
    // Hermon (bearing ~24°) is hidden behind the Korazim shoulder: the only
    // skyline on that bearing is the near slope, well under three kilometres
    // off... or the shoulder itself, a few kilometres off. Nothing sixty
    // kilometres away is drawn anywhere to the north.
    const north = HORIZON_RIBBONS.flatMap((r) => r.points).filter(([b]) => b >= 14 && b <= 30);
    expect(north.length).toBeGreaterThan(0);
    north.forEach(([, , km]) => expect(km).toBeLessThan(10));
    HORIZON_RIBBONS.forEach((r) => {
      expect(r.D).toBeGreaterThanOrEqual(900);
      expect(r.D).toBeLessThan(1450); // inside the 1500 m sky dome
    });
  });
});

describe('terrainHeight', () => {
  it('sits just under the village floors, so the two never fight', () => {
    for (const [x, z] of [[0, 0], [60, 40], [-91, 110], [30, SHORE.rampNorth + 0.1]]) {
      const y = terrainHeight(x, z);
      expect(y).toBeLessThan(LEVEL.ground);
      expect(y).toBeGreaterThan(LEVEL.ground - 0.1);
    }
    expect(terrainHeight(0, -16)).toBeLessThan(LEVEL.beach);
    expect(terrainHeight(0, -40)).toBeLessThan(LEVEL.lake);
  });

  it('rises out of the village without a step', () => {
    // Walk out of each side of the floor: no jump bigger than the ground
    // itself could make in a metre.
    for (const [dx, dz, x0, z0] of [[1, 0, VILLAGE_FLOOR.x1 - 5, 30], [-1, 0, VILLAGE_FLOOR.x0 + 5, 30], [0, 1, 0, VILLAGE_FLOOR.z1 - 5]]) {
      let previous = terrainHeight(x0, z0);
      for (let i = 1; i < 300; i += 1) {
        const y = terrainHeight(x0 + dx * i, z0 + dz * i);
        expect(Math.abs(y - previous)).toBeLessThan(0.35);
        previous = y;
      }
    }
  });

  it('grows fields and groves on the slope, and nothing on the water', () => {
    expect(landUse(0, -200)).toBe('water');
    const uses = new Set();
    for (let x = -600; x <= 600; x += 40) for (let z = 150; z <= 700; z += 40) uses.add(landUse(x, z));
    ['wheat', 'stubble', 'olive'].forEach((use) => expect(uses.has(use), use).toBe(true));
  });
});

describe('createCapernaumLandscape', () => {
  const lighting = applyLighting(THREE, new THREE.Group(), { slug: 'capernaum', low: true });

  function build(quality) {
    return createCapernaumLandscape(THREE, { quality, lighting });
  }

  function stats(landscape) {
    let draws = 0;
    let triangles = 0;
    landscape.group.traverse((o) => {
      if (!o.isMesh) return;
      draws += 1;
      const n = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
      triangles += (n / 3) * (o.isInstancedMesh ? o.count : 1);
    });
    return { draws, triangles };
  }

  it('builds finite, fully written geometry, the same every time', () => {
    const a = build('high');
    const b = build('high');
    try {
      const matrix = new THREE.Matrix4();
      a.group.traverse((o) => {
        if (!o.isMesh) return;
        expect(Array.from(o.geometry.attributes.position.array).every(Number.isFinite), o.name).toBe(true);
        if (o.isInstancedMesh) {
          expect(o.count, o.name).toBeGreaterThan(0);
          o.getMatrixAt(o.count - 1, matrix);
          expect(matrix.elements.some((v) => v !== 0), o.name).toBe(true);
        }
      });
      const names = (g) => { const out = []; g.traverse((o) => { if (o.isInstancedMesh) out.push(`${o.name}:${o.count}`); }); return out.join(','); };
      expect(names(a.group)).toBe(names(b.group));
    } finally {
      a.dispose();
      b.dispose();
    }
  });

  it('keeps within its budget, and is genuinely lighter on low', () => {
    const high = build('high');
    const low = build('low');
    try {
      const h = stats(high);
      const l = stats(low);
      expect(h.draws).toBeLessThanOrEqual(22);
      expect(h.triangles).toBeLessThan(230000);
      expect(l.triangles).toBeLessThan(70000);
      expect(l.triangles).toBeLessThan(h.triangles / 2.5);
    } finally {
      high.dispose();
      low.dispose();
    }
  });

  it('stands the village trees where the navigation has them, and plants nothing else where people walk', () => {
    const landscape = build('high');
    try {
      const matrix = new THREE.Matrix4();
      const at = new THREE.Vector3();
      const trunks = [];
      landscape.group.traverse((o) => { if (o.name === 'palm-trunks' || o.name === 'fig-trunks') trunks.push(o); });
      const inVillage = [];
      for (const mesh of trunks) {
        for (let i = 0; i < mesh.count; i += 1) {
          mesh.getMatrixAt(i, matrix);
          at.setFromMatrixPosition(matrix);
          if (Math.abs(at.x) <= 62 && at.z >= SHORE.beachSouth && at.z <= 74) inVillage.push([at.x, at.z]);
        }
      }
      // Every trunk inside the walkable village is one of the listed trees,
      // which the navigation already blocks.
      expect(inVillage.length).toBe(TREES.length);
      inVillage.forEach(([x, z]) => expect(blockerAt(x, z, 0)).toBeTruthy());
    } finally {
      landscape.dispose();
    }
  });

  it('keeps the skyline centred on the camera and follows the hour', () => {
    const landscape = build('balanced');
    try {
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(40, 2, -12);
      landscape.update(1, 0.016, { camera });
      const ribbons = landscape.group.getObjectByName('horizon-ribbons');
      expect(ribbons.position.x).toBe(40);
      expect(ribbons.position.z).toBe(-12);
      landscape.onTimeOfDay({ id: 'night' });
      expect(ribbons.material.uniforms.uNight.value).toBe(1);
      landscape.onTimeOfDay({ id: 'dawn' });
      expect(ribbons.material.uniforms.uClarity.value).toBeLessThan(1);
    } finally {
      landscape.dispose();
    }
  });
});

describe('createCapernaumFleet', () => {
  it('builds hulls that face outward, rest the beached boats on the shingle, and keeps the lake boats offshore', () => {
    const fleet = createCapernaumFleet(THREE, { quality: 'high', boats: BOATS, piers: PIERS, levels: LEVEL });
    try {
      const hull = fleet.group.getObjectByName('boat-beach-a').getObjectByName('boat-hull');
      // Outward winding: the normal at the keel points down, not up into the boat.
      const { geometry } = hull;
      let lowest = 0;
      const position = geometry.attributes.position;
      for (let i = 1; i < position.count; i += 1) if (position.getY(i) < position.getY(lowest)) lowest = i;
      expect(geometry.attributes.normal.getY(lowest)).toBeLessThan(-0.5);
      // Resting on the beach, bedded a few centimetres — not half a metre deep.
      fleet.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(hull, true);
      expect(box.min.y).toBeGreaterThan(LEVEL.beach - 0.2);
      expect(box.min.y).toBeLessThan(LEVEL.beach + 0.05);
      expect(box.max.z - box.min.z).toBeGreaterThan(HULL.length * 0.7);
      // Out on the water for a long day of simulated time, the fleet stays
      // well off the beach and clear of the piers.
      for (let t = 0; t < 900; t += 7) {
        fleet.update(t);
        for (const boat of fleet.lakeBoats) {
          expect(boat.position.z).toBeLessThan(SHORE.beachSouth - 40);
          for (const pier of PIERS) {
            const clear = boat.position.x < pier.x0 - 6 || boat.position.x > pier.x1 + 6 || boat.position.z < pier.zEnd - 6;
            expect(clear).toBe(true);
          }
          expect(Number.isFinite(boat.rotation.x + boat.rotation.y + boat.rotation.z)).toBe(true);
        }
      }
    } finally {
      fleet.dispose();
    }
  });
});
