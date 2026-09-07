import { describe, it, expect } from 'vitest';
import { routePlan, sampleRoute, WALK_SPEED } from './sceneRoutes';

describe('routePlan / sampleRoute', () => {
  it('never exceeds the configured speed, and reaches it through the cruise', () => {
    const plan = routePlan({ route: [[0, 0], [30, 0]], speed: 1.2 });
    let sawCruise = false;
    for (let t = 0; t <= plan.period; t += 0.05) {
      const { speed } = sampleRoute(plan, t);
      expect(speed).toBeLessThanOrEqual(1.2 + 1e-9);
      if (Math.abs(speed - 1.2) < 1e-6) sawCruise = true;
    }
    expect(sawCruise).toBe(true);
  });

  it('is at rest at both ends of a leg', () => {
    const plan = routePlan({ route: [[0, 0], [20, 5]], speed: 1.0 });
    expect(sampleRoute(plan, 0).speed).toBeCloseTo(0, 5);
    expect(sampleRoute(plan, plan.legDuration).speed).toBeCloseTo(0, 5);
  });

  it('is not moving for exactly twice the dwell out of each period', () => {
    const plan = routePlan({ route: [[0, 0], [20, 0]], speed: 1.1, dwell: 2 });
    let dwelling = 0;
    const step = 0.02;
    for (let t = 0; t < plan.period; t += step) {
      if (!sampleRoute(plan, t).moving) dwelling += step;
    }
    expect(dwelling).toBeCloseTo(2 * plan.dwell, 0);
  });

  it('is periodic', () => {
    const plan = routePlan({ route: [[3, -4], [18, 9]], speed: 1.3, phase: 0.4 });
    for (const t of [0, 1.7, plan.legDuration, plan.period * 0.5, plan.period * 1.5]) {
      const a = sampleRoute(plan, t);
      const b = sampleRoute(plan, t + plan.period);
      expect(a.x).toBeCloseTo(b.x, 6);
      expect(a.z).toBeCloseTo(b.z, 6);
      expect(a.facing).toBeCloseTo(b.facing, 6);
    }
  });

  it('advances monotonically along a leg', () => {
    const plan = routePlan({ route: [[0, 0], [40, 0]], speed: 1.0 });
    let last = -Infinity;
    for (let t = 0; t < plan.legDuration; t += 0.1) {
      const { along } = sampleRoute(plan, t);
      expect(along).toBeGreaterThanOrEqual(last - 1e-9);
      last = along;
    }
  });

  it('reaches both ends of the route exactly', () => {
    const plan = routePlan({ route: [[5, 5], [25, -10]], speed: 1.0 });
    const atFrom = sampleRoute(plan, 0);
    expect(atFrom.x).toBeCloseTo(5, 5);
    expect(atFrom.z).toBeCloseTo(5, 5);
    const atTo = sampleRoute(plan, plan.legDuration);
    expect(atTo.x).toBeCloseTo(25, 5);
    expect(atTo.z).toBeCloseTo(-10, 5);
  });

  it('degrades a too-short route to a triangle profile without NaN', () => {
    // A 0.5m route can never reach 1.15 m/s over a 0.8s ramp (that needs
    // 0.92m just to get up to speed and back down), so it must degrade.
    const plan = routePlan({ route: [[0, 0], [0.5, 0]], speed: 1.15, ramp: 0.8 });
    expect(plan.cruiseTime).toBe(0);
    expect(Number.isFinite(plan.topSpeed)).toBe(true);
    expect(plan.topSpeed).toBeLessThan(1.15);
    for (let t = 0; t <= plan.period; t += 0.05) {
      const sample = sampleRoute(plan, t);
      for (const value of Object.values(sample)) {
        if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('never jumps position, including across every dwell-to-leg boundary', () => {
    // A lane offset that flips sign between the outbound and return legs
    // (so each direction keeps to "its own side") is a real teleport if the
    // dwell in between held the other sign for its whole duration — the
    // position would jump by 2x the lane offset the instant the dwell ends.
    // Sweep finely across two full periods and demand every step is small.
    const plan = routePlan({
      route: [[0, 0], [20, 0]], speed: 1.0, lane: 1.3, dwell: 1.5,
    });
    const step = 0.01;
    let previous = sampleRoute(plan, 0);
    for (let t = step; t <= plan.period * 2; t += step) {
      const current = sampleRoute(plan, t);
      const moved = Math.hypot(current.x - previous.x, current.z - previous.z);
      // Even at full speed this route cannot cover more than ~0.02m in 0.01s.
      expect(moved).toBeLessThan(0.05);
      previous = current;
    }
  });

  it('keeps a lane offset visibly off the centreline throughout', () => {
    const plan = routePlan({ route: [[0, 0], [20, 0]], speed: 1.0, lane: 1.3 });
    for (let t = 0; t <= plan.period; t += 0.3) {
      const { z } = sampleRoute(plan, t);
      expect(Math.abs(z)).toBeGreaterThan(1.0);
    }
  });

  it('turns on the spot during the dwell rather than snapping', () => {
    const plan = routePlan({ route: [[0, 0], [20, 0]], speed: 1.0, dwell: 2 });
    const justArrived = sampleRoute(plan, plan.legDuration + 0.01);
    const midDwell = sampleRoute(plan, plan.legDuration + 1.0);
    const aboutToLeave = sampleRoute(plan, plan.legDuration + 1.99);
    // Facing should move smoothly from the outbound heading toward the
    // return heading over the course of the dwell, not jump instantly.
    expect(justArrived.facing).toBeCloseTo(Math.atan2(20, 0), 1);
    expect(aboutToLeave.facing).not.toBeCloseTo(justArrived.facing, 1);
    expect(midDwell.facing).toBeGreaterThan(Math.min(justArrived.facing, aboutToLeave.facing) - 0.01);
    expect(midDwell.facing).toBeLessThan(Math.max(justArrived.facing, aboutToLeave.facing) + 0.01);
  });

  it('defaults to a real walking pace when no speed is given', () => {
    const plan = routePlan({ route: [[0, 0], [10, 0]] });
    expect(plan.topSpeed).toBeCloseTo(WALK_SPEED, 5);
  });
});
