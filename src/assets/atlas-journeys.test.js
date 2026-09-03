import { describe, it, expect } from 'vitest';
import journeysAsset from './atlas-journeys.json';
import atlasAsset from './bible-atlas.json';

// Guards the hand-authored journey data: a typo'd place slug or a swapped
// lat/lon would silently break the map rather than fail loudly. See
// docs/ancient-atlas-plan.md §03 — stops carry explicit coordinates
// specifically so a missing wiki slug degrades gracefully, but the
// coordinates themselves must always be present and sane.
describe('atlas-journeys.json', () => {
  const placeSlugs = new Set(atlasAsset.places.map((p) => p.s));

  it('has at least one journey with multiple stops', () => {
    expect(journeysAsset.journeys.length).toBeGreaterThan(0);
    for (const journey of journeysAsset.journeys) {
      expect(journey.stops.length).toBeGreaterThan(1);
    }
  });

  it('gives every stop finite, plausible coordinates', () => {
    for (const journey of journeysAsset.journeys) {
      for (const stop of journey.stops) {
        expect(Number.isFinite(stop.la)).toBe(true);
        expect(Number.isFinite(stop.lo)).toBe(true);
        expect(stop.la).toBeGreaterThanOrEqual(-90);
        expect(stop.la).toBeLessThanOrEqual(90);
        expect(stop.lo).toBeGreaterThanOrEqual(-180);
        expect(stop.lo).toBeLessThanOrEqual(180);
      }
    }
  });

  it('resolves every non-null stop place to a real atlas place slug', () => {
    for (const journey of journeysAsset.journeys) {
      for (const stop of journey.stops) {
        if (stop.place === null) continue;
        expect(placeSlugs.has(stop.place), `${journey.s}: unknown place slug "${stop.place}"`).toBe(true);
      }
    }
  });

  it('gives every stop a scripture reference', () => {
    for (const journey of journeysAsset.journeys) {
      for (const stop of journey.stops) {
        expect(typeof stop.ref).toBe('string');
        expect(stop.ref.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives every journey a year range, era, color, and top-level reference', () => {
    for (const journey of journeysAsset.journeys) {
      expect(journey.y).toHaveLength(2);
      expect(journey.y[1]).toBeGreaterThanOrEqual(journey.y[0]);
      expect(atlasAsset.eras.some((e) => e.s === journey.era)).toBe(true);
      expect(journey.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(journey.ref.length).toBeGreaterThan(0);
    }
  });
});
