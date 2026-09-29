import { describe, it, expect } from 'vitest';
import {
  BARRIERS, PRESS_LEVEL, TOMB_LEVELS, floorAt, blockerAt, stanceAt, move, gardenWallSegments,
} from './olivetNavigation';
import {
  EYE_HEIGHT, GARDEN, PRESS, ROAD, TOMBS, WALK, PLATFORM, TEMPLE_FRAME, ANTONIA, groundAt, groveOlives, roadDistance,
} from './olivetDimensions';
import { GROUND } from './olivetGroundData';
import { TERRAIN } from './olivetTerrainData';
import { OLIVET } from '../../lib/olivetScene';

// Walking the Mount of Olives: the real hillside underfoot, the garden's wall
// with its gates, a few thousand olive trunks, the press and the monuments,
// and edges that say what lies beyond them.

function walkTo(start, target, { stride = 0.2, limit = 12000 } = {}) {
  let stance = start;
  let blocked = null;
  for (let i = 0; i < limit; i += 1) {
    const dx = target.x - stance.x;
    const dz = target.z - stance.z;
    const distance = Math.hypot(dx, dz);
    if (distance < stride) return { stance, blocked, arrived: true };
    const next = move(stance, (dx / distance) * stride, (dz / distance) * stride);
    if (next.blocked) blocked = next.blocked;
    if (next.x === stance.x && next.z === stance.z) return { stance, blocked, arrived: false };
    stance = next;
  }
  return { stance, blocked, arrived: false };
}
function walkRoute(start, waypoints) {
  let stance = start;
  waypoints.forEach((point, index) => {
    const leg = walkTo(stance, point);
    expect(leg.arrived, `leg ${index + 1} to (${point.x}, ${point.z}) from (${stance.x.toFixed(1)}, ${stance.z.toFixed(1)})`).toBe(true);
    stance = leg.stance;
  });
  return stance;
}
const point = ([x, z]) => ({ x, z });
// The middle of a gate in the garden wall: [side, from, to] along that side.
function gate(index) {
  const [side, from, to] = GARDEN.gates[index];
  const [ax, az] = GARDEN.corners[side];
  const [bx, bz] = GARDEN.corners[(side + 1) % GARDEN.corners.length];
  const length = Math.hypot(bx - ax, bz - az);
  const t = (from + to) / 2 / length;
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, nx: -(bz - az) / length, nz: (bx - ax) / length };
}

describe('the ground', () => {
  it('walks on the landscape’s own samples: the walkable grid is the whole grid, cut down', () => {
    const offsetX = (GROUND.x0 - TERRAIN.x0) / TERRAIN.step;
    const offsetZ = (GROUND.z0 - TERRAIN.z0) / TERRAIN.step;
    expect(GROUND.step).toBe(TERRAIN.step);
    expect(Number.isInteger(offsetX) && Number.isInteger(offsetZ)).toBe(true);
    for (let j = 0; j < GROUND.nz; j += 1) {
      for (let i = 0; i < GROUND.nx; i += 1) {
        expect(GROUND.heights[j * GROUND.nx + i]).toBe(TERRAIN.heights[(j + offsetZ) * TERRAIN.nx + (i + offsetX)]);
      }
    }
  });

  it('puts Gethsemane at the foot of the slope, the Kidron below it and the summit a hundred metres up', () => {
    expect(groundAt(0, 0)).toBeCloseTo(0, 0);
    expect(groundAt(-90, 0)).toBeLessThan(-6);
    expect(groundAt(520, 60)).toBeGreaterThan(95);
  });

  it('is built the right way round: facing north, east is on your right', () => {
    // -Z north, +X east. The Temple is west across the valley, the Antonia at
    // its north-west corner — north of the sanctuary, which a +Z-north frame
    // would have put south of it.
    expect(TEMPLE_FRAME.x).toBeLessThan(PLATFORM.corners[0][0]);
    expect((ANTONIA.z0 + ANTONIA.z1) / 2).toBeLessThan(TEMPLE_FRAME.z);
    expect(OLIVET.geo.bearing).toBe(0);
    expect(OLIVET.geo.xAxis).toBe(90);
  });
});

describe('standing places', () => {
  it('stands every vantage and every event’s visitor on the ground, at eye height, in the clear', () => {
    for (const item of [...OLIVET.vantages, ...OLIVET.events]) {
      const [x, eye, z] = item.position;
      const floor = floorAt(x, z);
      expect(floor, item.id).toBeTruthy();
      expect(eye, item.id).toBeCloseTo(floor.height + EYE_HEIGHT, 1);
      expect(blockerAt(x, z), item.id).toBeNull();
      expect(stanceAt(x, z, floor.height), item.id).toBeTruthy();
    }
  });

  it('paves the press yard level and quarries the tombs’ courts down to the valley', () => {
    expect(floorAt(PRESS.x, PRESS.z)).toEqual({ height: PRESS_LEVEL, region: 'press' });
    const absalom = TOMBS.absalom;
    expect(floorAt(absalom.x - absalom.half - 2, absalom.z)).toEqual({ height: TOMB_LEVELS.absalom, region: 'tombs' });
    expect(blockerAt(absalom.x, absalom.z)).toBe('the-tomb');
  });
});

describe('routes a visitor is meant to walk', () => {
  it('walks down the road from the summit to the garden, in at its gate and up to the rock', () => {
    const start = stanceAt(556, 10, groundAt(556, 10));
    const road = ROAD.points.slice(2, 13).map(point);
    const south = gate(1);
    const end = walkRoute(start, [
      ...road,
      { x: south.x - south.nx * 3, z: south.z - south.nz * 3 },
      { x: south.x + south.nx * 4, z: south.z + south.nz * 4 },
      // Round the old trees rather than through them.
      { x: 13, z: 22 },
      { x: 13, z: 8 },
      { x: 4, z: -2 },
      { x: 6, z: -8 },
    ]);
    expect(end.region).toBe('garden');
    expect(end.height).toBeCloseTo(floorAt(6, -8).height, 5);
  });

  it('goes out of the garden’s west gate, down to the brook and along it to the tombs', () => {
    const west = gate(0);
    const start = stanceAt(west.x + 4, west.z, groundAt(west.x + 4, west.z));
    const end = walkRoute(start, [
      { x: west.x - 4, z: west.z },
      { x: -70, z: 20 },
      { x: -96, z: 120 },
      { x: -108, z: 240 },
      { x: -104, z: 298 },
      { x: -88, z: 298 },
    ]);
    expect(end.region).toBe('tombs');
  });

  it('goes out of the north gate to the press', () => {
    const north = gate(2);
    const start = stanceAt(north.x, north.z + 4, groundAt(north.x, north.z + 4));
    const end = walkRoute(start, [
      { x: north.x, z: north.z - 4 },
      { x: -16, z: -48 },
      { x: PRESS.x + 1, z: PRESS.z + 2 },
    ]);
    expect(end.region).toBe('press');
  });

  it('refuses the wall between the gates, and says why', () => {
    const [ax, az, bx, bz] = gardenWallSegments()[0];
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const outside = stanceAt(mx, mz - 3, groundAt(mx, mz - 3));
    const leg = walkTo(outside, { x: mx, z: mz + 3 });
    expect(leg.arrived).toBe(false);
    expect(leg.blocked).toBe('garden-wall');
  });

  it('stops at every edge with something to say', () => {
    const edges = [
      [{ x: WALK.x0 + 3, z: 120 }, { x: WALK.x0 - 4, z: 120 }, 'the-brook'],
      [{ x: WALK.x1 - 3, z: -100 }, { x: WALK.x1 + 4, z: -100 }, 'the-road-to-bethany'],
      [{ x: 300, z: WALK.z1 - 3 }, { x: 300, z: WALK.z1 + 4 }, 'the-mount'],
    ];
    for (const [from, to, id] of edges) {
      let start = stanceAt(from.x, from.z, groundAt(from.x, from.z));
      // Nudge off a tree if one stands exactly there.
      for (let k = 0; !start && k < 10; k += 1) start = stanceAt(from.x, from.z + k, groundAt(from.x, from.z + k));
      const leg = walkTo(start, { x: to.x === from.x ? start.x : to.x, z: to.z === from.z ? start.z : to.z });
      expect(leg.arrived, id).toBe(false);
      expect(leg.blocked, id).toBe(id);
      expect(BARRIERS[id].body.length, id).toBeGreaterThan(120);
      expect(BARRIERS[id].refs.length, id).toBeGreaterThan(0);
    }
  });
});

describe('the olive groves', () => {
  it('fills the western face with trees and keeps them off the road and the garden', () => {
    const trees = groveOlives();
    expect(trees.length).toBeGreaterThan(3000);
    for (const tree of trees) {
      expect(roadDistance(tree.x, tree.z).distance).toBeGreaterThan(ROAD.width / 2 + 2);
      expect(Math.hypot(tree.x, tree.z)).toBeGreaterThan(40);
    }
    // And every trunk is solid.
    const sample = trees.filter((_, i) => i % 97 === 0);
    for (const tree of sample) expect(blockerAt(tree.x, tree.z)).toBe('olive');
  });

  it('is the same grove every time', () => {
    expect(groveOlives()).toBe(groveOlives());
  });
});

describe('barriers', () => {
  it('carries prose and scripture for every one', () => {
    for (const barrier of Object.values(BARRIERS)) {
      expect(barrier.label).toBeTruthy();
      expect(barrier.body.length).toBeGreaterThan(120);
      expect(barrier.refs.length).toBeGreaterThan(0);
    }
  });
});
