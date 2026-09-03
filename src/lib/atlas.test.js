import { describe, it, expect } from 'vitest';
import {
  minZoomForTier,
  visiblePlaces,
  eraForYear,
  eventsInWindow,
  placeById,
  primaryPlace,
} from './atlas';
import atlasAsset from '../assets/bible-atlas.json';

describe('minZoomForTier', () => {
  it('maps each tier to its reveal zoom', () => {
    expect(minZoomForTier(1)).toBe(3);
    expect(minZoomForTier(2)).toBe(6);
    expect(minZoomForTier(3)).toBe(8);
    expect(minZoomForTier(4)).toBe(10);
  });

  it('falls back to the deepest tier for an unknown value', () => {
    expect(minZoomForTier(99)).toBe(10);
  });
});

describe('visiblePlaces', () => {
  // Real generated counts (see docs/ancient-atlas-plan.md §03) — re-verify
  // these if bible-places.json or the wiki foundation changes.
  it('reveals places cumulatively as zoom increases', () => {
    expect(visiblePlaces(atlasAsset.places, 3)).toHaveLength(32);
    expect(visiblePlaces(atlasAsset.places, 6)).toHaveLength(163);
    expect(visiblePlaces(atlasAsset.places, 8)).toHaveLength(543);
    expect(visiblePlaces(atlasAsset.places, 10)).toHaveLength(1252);
  });

  it('shows nothing below the lowest tier', () => {
    expect(visiblePlaces(atlasAsset.places, 2)).toHaveLength(0);
  });
});

describe('eraForYear', () => {
  const eras = atlasAsset.eras;

  it('resolves a year to its containing era', () => {
    expect(eraForYear(eras, -4003).s).toBe('primeval');
    expect(eraForYear(eras, -1000).s).toBe('united-kingdom');
    expect(eraForYear(eras, 100).s).toBe('acts-church');
  });

  it('resolves every era boundary — eras are listed earliest-first and boundary years are inclusive on both sides, so a shared boundary belongs to the earlier era', () => {
    expect(eraForYear(eras, -2100).s).toBe('primeval');
    expect(eraForYear(eras, -1500).s).toBe('patriarchs');
    expect(eraForYear(eras, -5).s).toBe('intertestamental');
    expect(eraForYear(eras, 0).s).toBe('gospels');
    expect(eraForYear(eras, 33).s).toBe('gospels');
  });

  it('clamps out-of-range years to the nearest era instead of returning null', () => {
    expect(eraForYear(eras, -999999).s).toBe('primeval');
    expect(eraForYear(eras, 999999).s).toBe('acts-church');
  });
});

describe('eventsInWindow', () => {
  const events = [
    { s: 'centre', y: 0, pl: ['jerusalem'] },
    { s: 'edge', y: 10, pl: ['jerusalem'] },
    { s: 'outside', y: 11, pl: ['jerusalem'] },
    { s: 'unplaced', y: 0, pl: [] },
  ];

  it('keeps events within the window and drops those past its edge', () => {
    const visible = eventsInWindow(events, 0, 10);
    expect(visible.map((e) => e.s).sort()).toEqual(['centre', 'edge']);
  });

  it('excludes events with no resolved place even inside the window', () => {
    const visible = eventsInWindow(events, 0, 10);
    expect(visible.find((e) => e.s === 'unplaced')).toBeUndefined();
  });

  it('fades opacity from 1 at centre to 0.4 at the window edge', () => {
    const [centre] = eventsInWindow(events, 0, 10).filter((e) => e.s === 'centre');
    const [edge] = eventsInWindow(events, 0, 10).filter((e) => e.s === 'edge');
    expect(centre.opacity).toBe(1);
    expect(edge.opacity).toBeCloseTo(0.4, 5);
  });

  it('returns nothing for a zero-length window', () => {
    expect(eventsInWindow(events, 0, 0)).toEqual([]);
  });
});

describe('placeById / primaryPlace', () => {
  const placesBySlug = new Map([
    ['jerusalem', { s: 'jerusalem', n: 'Jerusalem' }],
  ]);

  it('looks up a place by slug', () => {
    expect(placeById(placesBySlug, 'jerusalem')).toEqual({ s: 'jerusalem', n: 'Jerusalem' });
    expect(placeById(placesBySlug, 'nowhere')).toBeNull();
  });

  it('returns the first resolvable place for an event', () => {
    expect(primaryPlace(placesBySlug, { pl: ['nowhere', 'jerusalem'] })).toEqual({ s: 'jerusalem', n: 'Jerusalem' });
  });

  it('returns null when no listed place resolves', () => {
    expect(primaryPlace(placesBySlug, { pl: ['nowhere'] })).toBeNull();
    expect(primaryPlace(placesBySlug, { pl: [] })).toBeNull();
  });
});
