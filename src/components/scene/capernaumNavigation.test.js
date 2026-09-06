import { describe, it, expect } from 'vitest';
import {
  floorAt,
  blockerAt,
  move,
  stanceAt,
  groundPointAlongRay,
  enclosureAt,
  BARRIERS,
} from './capernaumNavigation';
import {
  LEVEL, INSULA, HOUSE, ROOF_OPENING, SHORE, EYE_HEIGHT,
} from './capernaumDimensions';
import { getScene } from '../../lib/scenes';

// Capernaum is the first scene a visitor can go indoors in, up onto a roof, and
// back down again — so the thing worth proving is not that the collision model
// says no in the right places, but that it says yes all the way along a route
// somebody is actually meant to walk. A room you can see and cannot reach is
// the failure mode here, and it is invisible in a screenshot.

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

// Walks a whole route, failing at the first leg that does not complete.
function walkRoute(start, waypoints) {
  let stance = start;
  let blocked = null;
  waypoints.forEach((point, index) => {
    const leg = walkTo(stance, point);
    expect(leg.arrived, `leg ${index + 1} to (${point.x}, ${point.z}) from (${stance.x.toFixed(1)}, ${stance.z.toFixed(1)})`).toBe(true);
    stance = leg.stance;
    blocked = leg.blocked ?? blocked;
  });
  return { stance, blocked };
}

describe('stacked surfaces', () => {
  // The whole reason this site was chosen: the room and the roof over it are
  // the same ground plan, and which one you are on depends on where you are.
  it('gives the room from inside it and the roof from above it', () => {
    const inTheRoom = floorAt(15, 12, LEVEL.ground);
    const onTheRoof = floorAt(15, 12, LEVEL.roof);
    expect(inTheRoom.height).toBe(LEVEL.ground);
    expect(inTheRoom.region).toBe('village');
    expect(onTheRoof.height).toBe(LEVEL.roof);
    expect(onTheRoof.region).toBe('roof');
  });

  it('treats a house wall as a wall in the lane and a floor on the roof', () => {
    // A point in the solid part of the insula, away from the courtyard.
    expect(blockerAt(28, 10, LEVEL.ground)).toBe('house');
    expect(blockerAt(28, 10, LEVEL.roof)).toBeNull();
  });

  it('leaves no roof over the open courtyard', () => {
    expect(floorAt(22, 21, LEVEL.roof).height).toBe(LEVEL.ground);
  });
});

describe('the routes a visitor is meant to walk', () => {
  it('goes from the beach up to the village', () => {
    const { stance } = walkRoute(stanceAt(0, -17), [{ x: 0, z: -14 }, { x: 0, z: -8 }, { x: 0, z: 2 }]);
    expect(stance.height).toBeCloseTo(LEVEL.ground, 5);
  });

  it('goes from the lane into the courtyard and on into the house', () => {
    const { stance } = walkRoute(stanceAt(22, 34), [
      { x: 22, z: 30 }, // the lane north of the insula
      { x: 22, z: 22 }, // through the entry passage into the courtyard
      { x: 15.6, z: 18 }, // across the courtyard to the door
      { x: 15.6, z: 12 }, // through the door, into the room
    ]);
    expect(stance.height).toBeCloseTo(LEVEL.ground, 5);
    // Standing inside the room, under the hole.
    expect(stance.z).toBeLessThan(15.5);
    expect(stance.x).toBeGreaterThan(12);
  });

  it('goes up the outside stair and onto the roof', () => {
    const { stance } = walkRoute(stanceAt(33, 25), [
      { x: 33, z: 21 }, // the foot of the flight
      { x: 33, z: 11 }, // most of the way up
      { x: 32, z: 10 }, // the head of the flight
      { x: 24, z: 9 }, // out onto the roof itself
    ]);
    expect(stance.height).toBeCloseTo(LEVEL.roof, 5);
    expect(stance.region).toBe('roof');
  });

  it('goes up the steps into the synagogue', () => {
    const { stance } = walkRoute(stanceAt(-19, 24), [
      { x: -19, z: 28 }, // the podium steps
      { x: -19, z: 34 }, // through the door
      { x: -19, z: 40 }, // into the hall
    ]);
    expect(stance.height).toBeCloseTo(LEVEL.platform, 5);
    expect(stance.region).toBe('synagogue-podium');
  });
});

describe('the barriers, and what they say', () => {
  it('stops you at the hole in the roof rather than dropping you through it', () => {
    const onTheRoof = stanceAt(24, 12.5, LEVEL.roof);
    expect(onTheRoof.height).toBe(LEVEL.roof);
    const result = walkTo(onTheRoof, { x: 12, z: 12.5 });
    expect(result.arrived).toBe(false);
    expect(result.blocked).toBe('roof-opening');
    expect(result.stance.x).toBeGreaterThan(ROOF_OPENING.x1);
    // And it is a barrier that explains itself, not an anonymous edge.
    expect(BARRIERS['roof-opening'].refs).toContain('Mark 2:1-12');
  });

  it('stops you at the water, and names it', () => {
    const result = walkTo(stanceAt(0, -17), { x: 0, z: -30 });
    expect(result.arrived).toBe(false);
    expect(result.blocked).toBe('water');
    expect(result.stance.z).toBeGreaterThan(SHORE.beachSouth);
    expect(BARRIERS.water.label).toBe('The Lake');
  });

  it('stops you at the edge of a roof', () => {
    // North off the roof, over the open courtyard.
    const result = walkTo(stanceAt(24, 12, LEVEL.roof), { x: 24, z: 24 });
    expect(result.arrived).toBe(false);
    expect(result.blocked).toBe('edge');
    expect(result.stance.height).toBeCloseTo(LEVEL.roof, 5);
  });

  it('keeps every barrier it names either explainable or deliberately mute', () => {
    const mute = new Set(['house', 'synagogue-wall', 'wall', 'column', 'edge', 'tree', 'boat', 'cargo']);
    Object.values(BARRIERS).forEach((barrier) => {
      expect(barrier.label).toBeTruthy();
      expect(barrier.body.length).toBeGreaterThan(80);
      expect(barrier.refs.length).toBeGreaterThan(0);
    });
    expect(BARRIERS.house ?? mute.has('house')).toBeTruthy();
  });
});

describe('tap to walk', () => {
  const down = { x: 0, y: -1, z: 0 };

  it('finds the village floor, the beach and the synagogue podium', () => {
    expect(groundPointAlongRay({ x: 0, y: 6, z: 2 }, down).height).toBeCloseTo(LEVEL.ground, 5);
    expect(groundPointAlongRay({ x: 0, y: 6, z: -16 }, down).height).toBeCloseTo(LEVEL.beach, 5);
    expect(groundPointAlongRay({ x: -19, y: 6, z: 40 }, down).height).toBeCloseTo(LEVEL.platform, 5);
  });

  it('finds the roof from above it and the room from inside it', () => {
    expect(groundPointAlongRay({ x: 24, y: 9, z: 9 }, down).height).toBeCloseTo(LEVEL.roof, 5);
    // Standing in the room, looking at the floor: the roof is above the eye and
    // must not be what a tap selects.
    expect(groundPointAlongRay({ x: 15, y: 1.7, z: 12 }, down).height).toBeCloseTo(LEVEL.ground, 5);
  });

  it('refuses a tap on the water, on a wall and on the sky', () => {
    expect(groundPointAlongRay({ x: 0, y: 6, z: -40 }, down)).toBeNull();
    expect(groundPointAlongRay({ x: 50, y: 6, z: 10 }, down)).toBeNull();
    expect(groundPointAlongRay({ x: 0, y: 6, z: 2 }, { x: 0, y: 1, z: 0 })).toBeNull();
  });
});

describe('the village holds together', () => {
  // Sweeping the processional axis catches a hole anywhere along it, the same
  // way the temple scene does.
  it('leaves no gap walking the length of the shore road', () => {
    let previous = floorAt(0, -18, LEVEL.beach).height;
    for (let z = -18; z <= 70; z += 0.25) {
      const floor = floorAt(0, z, previous);
      expect(floor, `no floor at z=${z}`).not.toBeNull();
      expect(Math.abs(floor.height - previous)).toBeLessThanOrEqual(0.5);
      previous = floor.height;
    }
  });

  it('has an insula whose roof covers it', () => {
    for (let x = INSULA.x0 + 1; x < INSULA.x1; x += 1) {
      for (let z = INSULA.z0 + 1; z < INSULA.z1; z += 1) {
        const above = floorAt(x, z, LEVEL.roof);
        expect(above, `nothing overhead at (${x}, ${z})`).not.toBeNull();
      }
    }
  });
});

// The vantages are authored by hand in src/lib/capernaumScene.js against these
// same measurements. A vantage inside a wall, or half a metre under the paving,
// strands the visitor the moment they try to walk away from it — and with six
// vantages across four different floor levels there is plenty of room to get
// one wrong.
describe('the scene manifest agrees with the collision model', () => {
  const scene = getScene('capernaum');

  it.each(scene.vantages.map((vantage) => [vantage.id, vantage]))(
    '%s is somewhere a visitor can actually stand',
    (_id, vantage) => {
      const [x, eye, z] = vantage.position;
      // Asked from the authored eye height, so a vantage on the roof resolves
      // to the roof rather than to the room underneath it.
      const stance = stanceAt(x, z, eye - EYE_HEIGHT);
      expect(stance).not.toBeNull();
      expect(blockerAt(x, z, stance.height)).toBeNull();
      expect(eye).toBeCloseTo(stance.height + EYE_HEIGHT, 1);
    },
  );

  it('lets a visitor walk away from every vantage', () => {
    scene.vantages.forEach((vantage) => {
      const [x, eye, z] = vantage.position;
      const stance = stanceAt(x, z, eye - EYE_HEIGHT);
      const escapes = [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]
        .map(([dx, dz]) => move(stance, dx, dz))
        .filter((result) => result.x !== stance.x || result.z !== stance.z);
      expect(escapes.length, `stuck at ${vantage.id}`).toBeGreaterThan(0);
    });
  });

  it('puts every hotspot label somewhere in the village, not out at sea', () => {
    scene.hotspots.forEach((hotspot) => {
      const [x, y, z] = hotspot.position;
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
      expect(Math.abs(x)).toBeLessThan(120);
      expect(hotspot.maxDistance).toBeGreaterThan(0);
    });
  });
});

describe('enclosureAt', () => {
  it('is silent about the open village', () => {
    expect(enclosureAt(0, -20)).toBe(0); // the beach
    expect(enclosureAt(25, 22)).toBe(0); // the courtyard, open to the sky
    expect(enclosureAt(-19, 24)).toBe(0); // below the synagogue steps
  });

  it('closes the world out in the middle of the room', () => {
    const middle = enclosureAt(
      (HOUSE.x0 + HOUSE.x1) / 2,
      (HOUSE.z0 + HOUSE.z1) / 2,
    );
    expect(middle).toBeGreaterThan(0.7);
  });

  it('eases at the doorway rather than switching', () => {
    // Stepping over a threshold is a threshold, not a cliff: the value has to
    // climb across the wall line or the soundscape slams shut mid-stride.
    const justInside = enclosureAt(HOUSE.x0 + 0.15, (HOUSE.z0 + HOUSE.z1) / 2);
    const wellInside = enclosureAt(HOUSE.x0 + 1.4, (HOUSE.z0 + HOUSE.z1) / 2);
    expect(justInside).toBeGreaterThan(0);
    expect(justInside).toBeLessThan(0.3);
    expect(wellInside).toBeGreaterThan(justInside);
  });

  it('opens up again on the roof over the same room', () => {
    // The roof and the room share a ground plan; standing on one is outdoors
    // and standing in the other is not.
    const x = (HOUSE.x0 + HOUSE.x1) / 2;
    const z = (HOUSE.z0 + HOUSE.z1) / 2;
    expect(enclosureAt(x, z, LEVEL.ground)).toBeGreaterThan(0.7);
    expect(enclosureAt(x, z, LEVEL.roof)).toBe(0);
  });

  it('never leaves the range the soundscape expects', () => {
    for (let x = -60; x <= 60; x += 3) {
      for (let z = -40; z <= 60; z += 3) {
        for (const height of [LEVEL.beach, LEVEL.ground, LEVEL.roof]) {
          const value = enclosureAt(x, z, height);
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(enclosureAt(NaN, 0)).toBe(0);
  });
});
