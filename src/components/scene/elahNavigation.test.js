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

  it('blocks collisions with Goliath, David, and the shield-bearer', () => {
    // Exactly at Goliath (-4, -6)
    expect(elahNavigation.blockerAt(-4, -6)).toBe('goliath');
    // Close to Goliath within radius
    expect(elahNavigation.blockerAt(-3.5, -5.8)).toBe('goliath');

    // Exactly at David (3, 3)
    expect(elahNavigation.blockerAt(3, 3)).toBe('david');
    expect(elahNavigation.blockerAt(3.2, 3.1)).toBe('david');

    // Shield-bearer at (-2.6, -4.5)
    expect(elahNavigation.blockerAt(-2.6, -4.5)).toBe('goliath');

    // Clear open ground in the standoff corridor
    expect(elahNavigation.blockerAt(0, 5)).toBeNull();
    expect(elahNavigation.blockerAt(0, -5)).toBeNull();
  });

  it('allows safe movement across the valley floor and along the brook', () => {
    const start = elahNavigation.stanceAt(0, 14);
    expect(start).not.toBeNull();

    // Moving toward David (near brook)
    const stepTowardDavid = elahNavigation.move(start, 2, -6);
    expect(stepTowardDavid).not.toBeNull();
    expect(stepTowardDavid.x).toBeCloseTo(2, 1);
    expect(stepTowardDavid.z).toBeCloseTo(8, 1);

    // Attempting to walk directly into David should be blocked before entering
    const towardDavidDirect = elahNavigation.move(stepTowardDavid, 1, -5);
    const distToDavid = Math.hypot(towardDavidDirect.x - 3, towardDavidDirect.z - 3);
    expect(distToDavid).toBeGreaterThanOrEqual(0.7);
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
