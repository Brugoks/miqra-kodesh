import { describe, it, expect } from 'vitest';
import { ELAH } from '../../lib/elahScene';
import * as elahNavigation from './elahNavigation';

describe('Valley of Elah navigation', () => {
  it('provides safe standing positions for every scripture vantage', () => {
    expect(elahNavigation).toBeDefined();
    for (const v of ELAH.vantages) {
      const p = elahNavigation.stanceAt(v.position[0], v.position[2]);
      expect(p, `Vantage ${v.id} at [${v.position}] must be a valid stance`).not.toBeNull();
      expect(p.region).toBe('valley');
      expect(Number.isFinite(p.height)).toBe(true);
      // Vantage eye position Y should be above the ground floor height
      expect(v.position[1]).toBeGreaterThanOrEqual(p.height);
    }
  });

  it('bounds walkable space within the valley and rejects out-of-bounds queries', () => {
    // Within valley floor
    const center = elahNavigation.floorAt(0, 0);
    expect(center).not.toBeNull();
    expect(center.region).toBe('valley');

    // Far outside bounds
    expect(elahNavigation.floorAt(200, 0)).toBeNull();
    expect(elahNavigation.floorAt(-200, 0)).toBeNull();
    expect(elahNavigation.floorAt(0, 300)).toBeNull();
    expect(elahNavigation.floorAt(0, -300)).toBeNull();
    expect(elahNavigation.floorAt(NaN, 0)).toBeNull();
  });

  it('blocks the same principal placements that the renderer uses', () => {
    expect(elahNavigation.blockerAt(-3, -1)).toBe('goliath');
    expect(elahNavigation.blockerAt(3, 1)).toBe('david');
    expect(elahNavigation.blockerAt(-1.3, -.4)).toBe('goliath');
    expect(elahNavigation.blockerAt(0, 5)).toBeNull();
  });

  it('stops a walking visitor before entering David’s footprint', () => {
    const start = elahNavigation.stanceAt(3, 6);
    const end = elahNavigation.move(start, 0, -5);
    expect(end).not.toBeNull();
    expect(Math.hypot(end.x - 3, end.z - 1)).toBeGreaterThanOrEqual(.8);
  });

  it('handles downward ground raycasts for tap-to-move navigation', () => {
    expect(elahNavigation.groundPointAlongRay).toBeTypeOf('function');

    // Downward ray over valley center
    const hit = elahNavigation.groundPointAlongRay(
      { x: 0, y: 10, z: 0 },
      { x: 0, y: -1, z: 0 },
      50
    );
    expect(hit).not.toBeNull();
    expect(hit.region).toBe('valley');
    expect(Number.isFinite(hit.height)).toBe(true);

    // Upward ray points into sky (no hit)
    const upHit = elahNavigation.groundPointAlongRay(
      { x: 0, y: 2, z: 0 },
      { x: 0, y: 1, z: 0 },
      50
    );
    expect(upHit).toBeNull();
  });
});
