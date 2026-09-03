import { describe, it, expect } from 'vitest';
import { roundElevation, diffElevations } from './build-atlas-elevation.js';

describe('roundElevation', () => {
  it('rounds to the nearest whole metre', () => {
    expect(roundElevation(743.6)).toBe(744);
    expect(roundElevation(-232.6)).toBe(-233);
  });

  it('preserves null explicitly for points with no SRTM data (open water)', () => {
    expect(roundElevation(null)).toBeNull();
  });
});

describe('diffElevations', () => {
  it('finds every place slug missing from the elevation map', () => {
    const { missing } = diffElevations(['jerusalem', 'jericho', 'babylon'], { jerusalem: 744 });
    expect(missing.sort()).toEqual(['babylon', 'jericho']);
  });

  it('finds stale entries for places no longer in the atlas', () => {
    const { stale } = diffElevations(['jerusalem'], { jerusalem: 744, 'old-slug': 12 });
    expect(stale).toEqual(['old-slug']);
  });

  it('reports nothing missing or stale once the map is fully in sync', () => {
    const result = diffElevations(['jerusalem', 'jericho'], { jerusalem: 744, jericho: -233 });
    expect(result).toEqual({ missing: [], stale: [] });
  });

  it('treats an explicit null (an open-water point already measured) as present, not missing', () => {
    const { missing } = diffElevations(['tyre'], { tyre: null });
    expect(missing).toEqual([]);
  });
});
