import { describe, it, expect } from 'vitest';
import {
  floorAt,
  blockerAt,
  move,
  stanceAt,
  groundPointAlongRay,
  BARRIERS,
} from './tabernacleNavigation';
import {
  LEVEL,
  COURT,
  COURT_GATE,
  TENT,
  VEIL_Z,
  DESERT,
  EYE_HEIGHT,
} from './tabernacleDimensions';
import { getScene } from '../../lib/scenes';

// The Tabernacle is an argument about access, so the collision model is where
// most of that argument actually lives. What is worth proving is not that walls
// are solid but that the sequence works: one way into the court, all the way to
// the veil, and no further.

function walkTo(start, target, { stride = 0.2, limit = 6000 } = {}) {
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
    expect(leg.arrived, `leg ${index + 1} to (${point.x}, ${point.z})`).toBe(true);
    stance = leg.stance;
  });
  return stance;
}

describe('floorAt', () => {
  it('is desert, and only desert', () => {
    expect(floorAt(0, 0)).toMatchObject({ height: LEVEL.ground, region: 'desert' });
    expect(floorAt(0, 40)).toMatchObject({ height: LEVEL.ground });
    // Inside the tent is the same ground as outside it.
    expect(floorAt(0, -5).height).toBe(LEVEL.ground);
  });

  it('runs out at the edge of the reconstruction', () => {
    expect(floorAt(0, DESERT.zNorth + 5)).toBeNull();
    expect(floorAt(DESERT.halfX + 5, 0)).toBeNull();
  });
});

describe('one way in', () => {
  // Exodus 27 puts a single twenty-cubit opening in a hundred-by-fifty
  // enclosure. If any other approach works, the scene is saying something the
  // text does not.
  it('lets you into the court through the gate', () => {
    const stance = walkRoute(stanceAt(0, 40), [{ x: 0, z: 30 }, { x: 0, z: 20 }]);
    expect(stance.z).toBeLessThan(COURT.zEast);
  });

  it('refuses every other side', () => {
    const approaches = [
      { from: { x: 30, z: 0 }, to: { x: 0, z: 0 } }, // from the north
      { from: { x: -30, z: 0 }, to: { x: 0, z: 0 } }, // from the south
      { from: { x: 0, z: -40 }, to: { x: 0, z: -20 } }, // from behind
      // Beside the gate but still on the east end: between the gate's edge at
      // ten cubits and the corner at twenty-five, where the plain hanging runs.
      { from: { x: 8, z: 40 }, to: { x: 8, z: 10 } },
    ];
    approaches.forEach(({ from, to }) => {
      const result = walkTo(stanceAt(from.x, from.z), to);
      expect(result.arrived, `got in from (${from.x}, ${from.z})`).toBe(false);
      expect(result.blocked).toBe('court-hanging');
    });
  });

  it('has a gate exactly twenty cubits wide', () => {
    // Clear in the middle, solid a shade outside it.
    expect(blockerAt(0, COURT.zEast)).toBeNull();
    expect(blockerAt(COURT_GATE.halfX - 1, COURT.zEast)).toBeNull();
    expect(blockerAt(COURT_GATE.halfX + 1, COURT.zEast)).toBe('court-hanging');
    expect(blockerAt(-COURT_GATE.halfX - 1, COURT.zEast)).toBe('court-hanging');
  });
});

describe('the way to the veil', () => {
  it('crosses the court, passes the altar and the laver, and enters the tent', () => {
    const stance = walkRoute(stanceAt(0, 40), [
      { x: 0, z: 20 }, // through the gate
      { x: 4, z: 12 }, // round the bronze altar
      { x: 4, z: 2 }, // past the laver
      { x: 0, z: -3 }, // through the screen at the door of the tent
    ]);
    expect(stance.z).toBeLessThan(TENT.zEast);
    expect(Math.abs(stance.x)).toBeLessThan(TENT.halfX);
  });

  it('gets between the lampstand and the table to reach the incense altar', () => {
    const stance = walkRoute(stanceAt(0, -3), [{ x: 0, z: -6 }, { x: 1.2, z: -9 }]);
    expect(stance.z).toBeLessThan(-8);
  });

  it('stops at the veil, and says why', () => {
    const result = walkTo(stanceAt(1.2, -9), { x: 1.2, z: -13 });
    expect(result.arrived).toBe(false);
    expect(result.blocked).toBe('veil');
    expect(result.stance.z).toBeGreaterThan(VEIL_Z);
    expect(BARRIERS.veil.refs).toContain('Hebrews 9:6-8');
    expect(BARRIERS.veil.refs).toContain('Matthew 27:51');
  });

  it('leaves the Most Holy Place unreachable from anywhere', () => {
    // Round the outside of the tent and in from the west, if it were possible.
    const result = walkTo(stanceAt(0, 40), { x: 0, z: -13 });
    expect(result.arrived).toBe(false);
    expect(result.stance.z).toBeGreaterThan(VEIL_Z);
  });
});

describe('the barriers', () => {
  it('names the wilderness at the edge of the world', () => {
    const result = walkTo(stanceAt(0, DESERT.zNorth - 6), { x: 0, z: DESERT.zNorth + 20 });
    expect(result.arrived).toBe(false);
    expect(result.blocked).toBe('edge');
  });

  it('gives every explained barrier prose and passages', () => {
    Object.values(BARRIERS).forEach((barrier) => {
      expect(barrier.label).toBeTruthy();
      expect(barrier.body.length).toBeGreaterThan(80);
      expect(barrier.refs.length).toBeGreaterThan(0);
    });
  });

  it('leaves the posts and pillars walkable, so the gate is not a squeeze', () => {
    // Court posts stand every two and a half cubits; with a body radius on top
    // they would close the gate to a few centimetres. The hangings are the
    // barrier, not the poles holding them up.
    for (let x = -COURT_GATE.halfX + 0.5; x < COURT_GATE.halfX; x += 0.5) {
      expect(blockerAt(x, COURT.zEast), `blocked in the gate at x=${x}`).toBeNull();
    }
  });
});

describe('tap to walk', () => {
  const down = { x: 0, y: -1, z: 0 };

  it('finds the desert floor inside and outside the court', () => {
    expect(groundPointAlongRay({ x: 0, y: 6, z: 40 }, down).height).toBe(LEVEL.ground);
    expect(groundPointAlongRay({ x: 6, y: 6, z: 15 }, down).height).toBe(LEVEL.ground);
  });

  it('refuses a tap on the altar, the veil and the sky', () => {
    expect(groundPointAlongRay({ x: 0, y: 6, z: 10 }, down)).toBeNull();
    expect(groundPointAlongRay({ x: 0, y: 6, z: VEIL_Z }, down)).toBeNull();
    expect(groundPointAlongRay({ x: 0, y: 6, z: 40 }, { x: 0, y: 1, z: 0 })).toBeNull();
  });
});

describe('the scene manifest agrees with the collision model', () => {
  const scene = getScene('tabernacle');

  it.each(scene.vantages.map((vantage) => [vantage.id, vantage]))(
    '%s is somewhere a visitor can actually stand',
    (_id, vantage) => {
      const [x, eye, z] = vantage.position;
      const stance = stanceAt(x, z);
      expect(stance).not.toBeNull();
      expect(blockerAt(x, z)).toBeNull();
      expect(eye).toBeCloseTo(stance.height + EYE_HEIGHT, 1);
    },
  );

  it('lets a visitor walk away from every vantage', () => {
    scene.vantages.forEach((vantage) => {
      const stance = stanceAt(vantage.position[0], vantage.position[2]);
      const escapes = [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]
        .map(([dx, dz]) => move(stance, dx, dz))
        .filter((result) => result.x !== stance.x || result.z !== stance.z);
      expect(escapes.length, `stuck at ${vantage.id}`).toBeGreaterThan(0);
    });
  });
});
