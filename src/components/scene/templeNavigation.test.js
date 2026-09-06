import { describe, it, expect } from 'vitest';
import {
  floorAt,
  blockerAt,
  move,
  stanceAt,
  groundPointAlongRay,
  BARRIERS,
  MAX_STEP,
} from './templeNavigation';
import {
  LEVEL,
  INNER,
  WOMEN,
  SOREG,
  GATE,
  EYE_HEIGHT,
  colonnadePositions,
} from './templeDimensions';
import { getScene } from '../../lib/scenes';

// Walking is the feature most likely to be quietly broken — you clip a wall at
// one corner, or a stair leaves a lip you cannot mount, and neither shows up in
// a screenshot. Because the collision model is arithmetic rather than raycasts,
// all of it can be checked here.

// Steps toward a target the way the render loop does, and reports where it got
// to and what stopped it.
function walkTo(start, target, { stride = 0.25, limit = 4000 } = {}) {
  let stance = start;
  let blocked = null;
  for (let i = 0; i < limit; i += 1) {
    const dx = target.x - stance.x;
    const dz = target.z - stance.z;
    const distance = Math.hypot(dx, dz);
    if (distance < stride) return { stance, blocked, arrived: true, steps: i };
    const next = move(stance, (dx / distance) * stride, (dz / distance) * stride);
    if (next.blocked) blocked = next.blocked;
    // Standing still while still short of the target means genuinely stuck.
    if (next.x === stance.x && next.z === stance.z) {
      return { stance, blocked, arrived: false, steps: i };
    }
    stance = next;
  }
  return { stance, blocked, arrived: false, steps: limit };
}

describe('floorAt', () => {
  it('reports the three court levels', () => {
    expect(floorAt(0, 200)).toMatchObject({ height: LEVEL.outer, region: 'outer' });
    expect(floorAt(0, 70)).toMatchObject({ height: LEVEL.women, region: 'women' });
    expect(floorAt(0, 10)).toMatchObject({ height: LEVEL.inner, region: 'inner' });
  });

  it('has no floor beyond the platform', () => {
    expect(floorAt(0, 400)).toBeNull();
    expect(floorAt(400, 0)).toBeNull();
    expect(floorAt(0, -400)).toBeNull();
  });

  it('ramps up the fifteen steps from the women’s court to the inner court', () => {
    const bottom = floorAt(0, 37);
    const middle = floorAt(0, 31);
    const top = floorAt(0, 27);
    expect(bottom.height).toBeCloseTo(LEVEL.women, 5);
    expect(middle.height).toBeGreaterThan(bottom.height);
    expect(top.height).toBeGreaterThan(middle.height);
    expect(top.height).toBeCloseTo(LEVEL.inner, 5);
  });

  it('ramps down the twelve steps to the outer court', () => {
    expect(floorAt(0, 106.5).height).toBeCloseTo(LEVEL.women, 5);
    expect(floorAt(0, 116.9).height).toBeCloseTo(LEVEL.outer, 5);
    expect(floorAt(0, 112).height).toBeGreaterThan(LEVEL.outer);
    expect(floorAt(0, 112).height).toBeLessThan(LEVEL.women);
  });

  // Every region boundary is a place the visitor can fall through if the
  // numbers in templeDimensions.js drift apart. Sampling the whole processional
  // axis catches a gap anywhere along it.
  it('leaves no hole along the processional way', () => {
    let previous = floorAt(0, 230).height;
    for (let z = 230; z >= -60; z -= 0.25) {
      const floor = floorAt(0, z);
      expect(floor).not.toBeNull();
      expect(Math.abs(floor.height - previous)).toBeLessThanOrEqual(MAX_STEP);
      previous = floor.height;
    }
  });
});

describe('blockerAt', () => {
  it('stops you at the soreg, but lets you through its openings', () => {
    const [gapFrom, gapTo] = SOREG.gaps[0];
    const middleOfGap = (gapFrom + gapTo) / 2;
    expect(blockerAt(middleOfGap, SOREG.zEast)).toBeNull();
    expect(blockerAt(20, SOREG.zEast)).toBe('soreg');
    // The returns, so the screen cannot simply be walked around.
    expect(blockerAt(SOREG.halfX, 40)).toBe('soreg');
    expect(blockerAt(0, SOREG.zWest)).toBe('soreg');
  });

  it('stops laymen at the rail and at the sanctuary', () => {
    expect(blockerAt(0, 19.8)).toBe('rail');
    expect(blockerAt(0, -20)).toBe('sanctuary');
  });

  it('stops you at the altar and its ramp', () => {
    expect(blockerAt(0, 9)).toBe('altar');
    expect(blockerAt(-16, 9)).toBe('altar');
  });

  it('makes the colonnade solid', () => {
    // Taken from the generated layout rather than a guessed coordinate: the
    // columns the visitor bumps into must be the columns that were drawn.
    const [x, z] = colonnadePositions()[0];
    expect(blockerAt(x, z)).toBe('column');
    expect(blockerAt(x + 3, z + 3)).toBeNull();
  });

  it('walls off the women’s court except at the Beautiful Gate', () => {
    expect(blockerAt(0, 105.8)).toBeNull();
    expect(blockerAt(GATE.beautifulHalfWidth + 6, 105.8)).toBe('wall');
  });

  it('walls off the inner court except at the Nicanor Gate', () => {
    expect(blockerAt(0, INNER.zEast - 1)).toBeNull();
    expect(blockerAt(GATE.nicanorHalfWidth + 6, INNER.zEast - 1)).toBe('wall');
  });
});

describe('move', () => {
  it('refuses to walk off the edge of the inner court', () => {
    // Due north out of the Court of the Priests, where the platform simply
    // ends in a 6.95m drop to the outer court and no wall is listed — the step
    // rule is the only thing standing there. Substepping walks right up to the
    // brink, so what matters is that the brink is where it stops.
    const stance = stanceAt(30, 10);
    const result = move(stance, 4, 0);
    expect(result.blocked).toBe('edge');
    expect(result.x).toBeLessThanOrEqual(INNER.halfX);
    expect(result.height).toBeCloseTo(stance.height, 5);
  });

  it('slides along a wall rather than stopping dead', () => {
    const stance = stanceAt(20, 119);
    // Pushing into the solid part of the soreg: the move toward it is refused,
    // the move along it survives, and the visitor ends up against the screen
    // rather than stuck a stride short of it.
    const result = move(stance, 0.3, -0.3);
    expect(result.blocked).toBe('soreg');
    expect(result.x).toBeGreaterThan(stance.x);
    expect(result.z).toBeLessThan(stance.z);
    expect(result.z).toBeGreaterThan(SOREG.zEast);
  });

  it('reports the barrier even while sliding past it', () => {
    const stance = stanceAt(20, 119);
    expect(BARRIERS[move(stance, 0, -0.3).blocked]).toBeDefined();
  });
});

// The route a pilgrim actually took, walked step by step. If any of this fails
// the scene has a place you can see but cannot reach.
describe('the processional way is walkable', () => {
  const outerCourt = stanceAt(0, 150);

  it('reaches the Court of Israel from the outer court', () => {
    const throughSoreg = walkTo(outerCourt, { x: 0, z: 112 });
    expect(throughSoreg.arrived).toBe(true);

    const upTwelveSteps = walkTo(throughSoreg.stance, { x: 0, z: 100 });
    expect(upTwelveSteps.arrived).toBe(true);
    expect(upTwelveSteps.stance.region).toBe('women');
    expect(upTwelveSteps.stance.height).toBeCloseTo(LEVEL.women, 1);

    const acrossTheCourt = walkTo(upTwelveSteps.stance, { x: 0, z: 40 });
    expect(acrossTheCourt.arrived).toBe(true);

    const upFifteenSteps = walkTo(acrossTheCourt.stance, { x: 0, z: 24 });
    expect(upFifteenSteps.arrived).toBe(true);
    expect(upFifteenSteps.stance.region).toBe('inner');
    expect(upFifteenSteps.stance.height).toBeCloseTo(LEVEL.inner, 1);
  });

  it('stops a layman at the rail, and says why', () => {
    const courtOfIsrael = stanceAt(0, 24);
    const result = walkTo(courtOfIsrael, { x: 0, z: 10 });
    expect(result.arrived).toBe(false);
    expect(result.blocked).toBe('rail');
    expect(BARRIERS.rail.label).toBe('The Court of the Priests');
    expect(result.stance.z).toBeGreaterThan(20);
  });

  it('will not let you cross the soreg anywhere but an opening', () => {
    // x = 20 is a solid run between two of the openings.
    const result = walkTo(stanceAt(20, 130), { x: 20, z: 100 });
    expect(result.arrived).toBe(false);
    expect(result.blocked).toBe('soreg');
    expect(result.stance.z).toBeGreaterThan(SOREG.zEast);
  });

  it('cannot be walked around the end of the soreg', () => {
    // Approaching from due north, outside the screen, and pushing straight in:
    // the northern return has to hold or the whole boundary is decorative.
    const result = walkTo(stanceAt(100, 60), { x: 0, z: 60 });
    expect(result.arrived).toBe(false);
    expect(result.blocked).toBe('soreg');
    expect(result.stance.x).toBeGreaterThan(SOREG.halfX);
  });

  it('keeps every barrier it reports explainable or silent, never unexplained', () => {
    // A barrier id either carries prose for the panel or is deliberately mute
    // (a wall, a column). Anything else would surface an empty panel.
    const mute = new Set(['wall', 'column', 'edge', 'altar']);
    const ids = ['soreg', 'rail', 'sanctuary', 'wall', 'column', 'edge', 'altar'];
    ids.forEach((id) => {
      expect(Boolean(BARRIERS[id]) || mute.has(id)).toBe(true);
    });
    Object.values(BARRIERS).forEach((barrier) => {
      expect(barrier.label).toBeTruthy();
      expect(barrier.body.length).toBeGreaterThan(80);
      expect(barrier.refs.length).toBeGreaterThan(0);
    });
  });
});

describe('groundPointAlongRay', () => {
  const down = { x: 0, y: -1, z: 0 };

  it('finds the floor directly below', () => {
    expect(groundPointAlongRay({ x: 0, y: 12, z: 60 }, down).height).toBeCloseTo(LEVEL.women, 5);
    expect(groundPointAlongRay({ x: 0, y: 12, z: 200 }, down).height).toBeCloseTo(LEVEL.outer, 5);
    expect(groundPointAlongRay({ x: 0, y: 12, z: 23 }, down).height).toBeCloseTo(LEVEL.inner, 5);
  });

  it('finds the stairs ahead when looking along the ground', () => {
    const origin = { x: 0, y: 1.7, z: 130 };
    const hit = groundPointAlongRay(origin, { x: 0, y: -0.06, z: -0.998 });
    expect(hit).not.toBeNull();
    expect(hit.z).toBeLessThan(130);
  });

  // Standing in the outer court your eye is below the floor of the women's
  // court, so that floor is behind a wall from here. Returning a point on it
  // would send the visitor walking into masonry.
  it('never targets a floor above the eye that aims at it', () => {
    const origin = { x: 0, y: 1.7, z: 120 };
    for (const slope of [-0.01, -0.03, -0.08, -0.2]) {
      const hit = groundPointAlongRay(origin, { x: 0, y: slope, z: -1 });
      if (hit) expect(hit.height).toBeLessThanOrEqual(origin.y);
    }
  });

  it('returns nothing for a tap on the sky', () => {
    expect(groundPointAlongRay({ x: 0, y: 2, z: 150 }, { x: 0, y: 0.3, z: -1 })).toBeNull();
  });

  it('returns nothing for a tap on something solid', () => {
    expect(groundPointAlongRay({ x: 0, y: 30, z: -20 }, down)).toBeNull();
  });

  it('returns nothing for a tap past the edge of the world', () => {
    expect(groundPointAlongRay({ x: 0, y: 2, z: 400 }, down)).toBeNull();
  });
});

describe('stanceAt', () => {
  it('places a visitor on the floor, or nowhere', () => {
    expect(stanceAt(0, 200)).toMatchObject({ height: LEVEL.outer, region: 'outer' });
    expect(stanceAt(0, WOMEN.zWest + 20)).toMatchObject({ height: LEVEL.women });
    expect(stanceAt(0, 4000)).toBeNull();
  });
});

// The vantages are authored by hand in src/lib/scenes.js, against these same
// measurements. A vantage that lands inside a column or half a metre under the
// paving would strand the visitor the moment they tried to walk away from it.
describe('the scene manifest agrees with the collision model', () => {
  const scene = getScene('second-temple');

  it.each(scene.vantages.map((vantage) => [vantage.id, vantage]))(
    '%s is somewhere a visitor can actually stand',
    (_id, vantage) => {
      const [x, eye, z] = vantage.position;
      const stance = stanceAt(x, z);
      expect(stance).not.toBeNull();
      expect(blockerAt(x, z)).toBeNull();
      // The authored eye height has to match the floor it is standing on, or
      // arriving there drops the camera through the ground.
      expect(eye).toBeCloseTo(stance.height + EYE_HEIGHT, 0);
    },
  );

  it('lets a visitor walk away from every vantage', () => {
    scene.vantages.forEach((vantage) => {
      const stance = stanceAt(vantage.position[0], vantage.position[2]);
      const escapes = [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]
        .map(([dx, dz]) => move(stance, dx, dz))
        .filter((result) => result.x !== stance.x || result.z !== stance.z);
      expect(escapes.length).toBeGreaterThan(0);
    });
  });
});
