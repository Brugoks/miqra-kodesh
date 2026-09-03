import { describe, it, expect } from 'vitest';
import {
  minZoomForTier,
  visiblePlaces,
  eraForYear,
  eventsInWindow,
  placeById,
  primaryPlace,
  searchAtlas,
  selectionCoords,
  greatCircleMiles,
  travelEstimate,
  TRAVEL_MODES,
} from './atlas';
import atlasAsset from '../assets/bible-atlas.json';
import journeysAsset from '../assets/atlas-journeys.json';

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

describe('searchAtlas', () => {
  const atlas = {
    ...atlasAsset,
    placesBySlug: new Map(atlasAsset.places.map((p) => [p.s, p])),
  };
  const journeys = journeysAsset.journeys;

  it('returns nothing for an empty or too-short query', () => {
    expect(searchAtlas(atlas, journeys, '')).toEqual([]);
    expect(searchAtlas(atlas, journeys, 'j')).toEqual([]);
  });

  it('finds a place by name and carries a jumpable minZoom', () => {
    const [top] = searchAtlas(atlas, journeys, 'jerusalem');
    expect(top).toMatchObject({ kind: 'place', slug: 'jerusalem', name: 'Jerusalem' });
    expect(Number.isFinite(top.la)).toBe(true);
    expect(Number.isFinite(top.lo)).toBe(true);
    expect(top.minZoom).toBe(3); // Jerusalem is tier 1
  });

  it('finds a mappable event by name and resolves coordinates from its place', () => {
    const results = searchAtlas(atlas, journeys, 'goliath');
    const event = results.find((r) => r.kind === 'event');
    expect(event).toMatchObject({ slug: 'david-kills-goliath', name: 'David Kills Goliath' });
    expect(Number.isFinite(event.la)).toBe(true);
    expect(Number.isFinite(event.lo)).toBe(true);
    expect(event.year).toBe(-1066);
  });

  it('excludes events with no resolved place', () => {
    const results = searchAtlas(atlas, journeys, 'the fall');
    expect(results.some((r) => r.kind === 'event' && r.slug === 'the-fall')).toBe(false);
  });

  it('finds a journey by name', () => {
    const results = searchAtlas(atlas, journeys, "paul's first");
    expect(results[0]).toMatchObject({ kind: 'journey', slug: 'paul-first-journey' });
  });

  it('ranks an exact match above a starts-with match above a contains match', () => {
    const places = [
      { s: 'a', n: 'Salem', la: 0, lo: 0, t: 1 },
      { s: 'b', n: 'Salem City', la: 0, lo: 0, t: 1 },
      { s: 'c', n: 'New Salem', la: 0, lo: 0, t: 1 },
    ];
    const results = searchAtlas(
      { places, events: [], placesBySlug: new Map() },
      [],
      'salem',
    );
    expect(results.map((r) => r.slug)).toEqual(['a', 'b', 'c']);
  });

  it('respects the limit', () => {
    const results = searchAtlas(atlas, journeys, 'a', 3);
    // 'a' is too short to search (min length 2) — use a common two-letter substring instead.
    const wider = searchAtlas(atlas, journeys, 'an', 3);
    expect(results).toEqual([]);
    expect(wider.length).toBeLessThanOrEqual(3);
  });

  it('narrows to only the requested kinds — the travel-time picker uses this to exclude events/journeys', () => {
    // "jerusalem" alone matches a place AND several events without the filter.
    const unfiltered = searchAtlas(atlas, journeys, 'jerusalem', 20);
    expect(unfiltered.some((r) => r.kind === 'event')).toBe(true);

    const placesOnly = searchAtlas(atlas, journeys, 'jerusalem', 20, ['place']);
    expect(placesOnly.length).toBeGreaterThan(0);
    expect(placesOnly.every((r) => r.kind === 'place')).toBe(true);
  });
});

describe('selectionCoords', () => {
  const atlas = {
    ...atlasAsset,
    placesBySlug: new Map(atlasAsset.places.map((p) => [p.s, p])),
    eventsBySlug: new Map(atlasAsset.events.map((e) => [e.s, e])),
  };

  it('returns null for no selection', () => {
    expect(selectionCoords(null, atlas)).toBeNull();
  });

  it('resolves a place selection to its own coordinates', () => {
    expect(selectionCoords({ kind: 'place', slug: 'jerusalem' }, atlas)).toEqual({ la: 31.7774, lo: 35.2349 });
  });

  it('resolves an event selection to its primary place\'s coordinates', () => {
    const coords = selectionCoords({ kind: 'event', slug: 'david-kills-goliath' }, atlas);
    expect(Number.isFinite(coords.la)).toBe(true);
    expect(Number.isFinite(coords.lo)).toBe(true);
  });

  it('resolves a journey stop selection directly from the stop', () => {
    const coords = selectionCoords({ kind: 'stop', stop: { la: 10, lo: 20 } }, atlas);
    expect(coords).toEqual({ la: 10, lo: 20 });
  });

  it('returns null for an unresolvable slug', () => {
    expect(selectionCoords({ kind: 'place', slug: 'nowhere' }, atlas)).toBeNull();
  });
});

describe('greatCircleMiles', () => {
  it('is zero for the same point', () => {
    expect(greatCircleMiles({ la: 31.7774, lo: 35.2349 }, { la: 31.7774, lo: 35.2349 })).toBeCloseTo(0, 5);
  });

  it('matches the well-known Jerusalem-Babylon straight-line distance (~540mi)', () => {
    const jerusalem = { la: 31.7774, lo: 35.2349 };
    const babylon = { la: 32.5355, lo: 44.4275 };
    expect(greatCircleMiles(jerusalem, babylon)).toBeGreaterThan(500);
    expect(greatCircleMiles(jerusalem, babylon)).toBeLessThan(580);
  });
});

describe('travelEstimate', () => {
  const jerusalem = { la: 31.7774, lo: 35.2349 };
  const babylon = { la: 32.5355, lo: 44.4275 };

  it('inflates the straight-line distance by the route-inefficiency factor', () => {
    const estimate = travelEstimate(jerusalem, babylon);
    expect(estimate.routeMiles).toBeGreaterThan(estimate.straightMiles);
  });

  it('returns one day estimate per travel mode, slower modes taking longer', () => {
    const estimate = travelEstimate(jerusalem, babylon);
    expect(estimate.modes).toHaveLength(TRAVEL_MODES.length);
    const byKey = Object.fromEntries(estimate.modes.map((m) => [m.key, m.days]));
    expect(byKey.horse).toBeLessThan(byKey.camel);
    expect(byKey.camel).toBeLessThan(byKey.foot);
    expect(byKey.foot).toBeLessThanOrEqual(byKey.donkey);
  });

  it('never returns fewer than 1 day even for a very short hop', () => {
    const nextDoor = { la: 31.78, lo: 35.24 };
    const estimate = travelEstimate(jerusalem, nextDoor);
    for (const mode of estimate.modes) expect(mode.days).toBeGreaterThanOrEqual(1);
  });

  it('lands around 40 days by donkey caravan for Jerusalem-Babylon, matching standard Bible-atlas figures for the exile route', () => {
    const estimate = travelEstimate(jerusalem, babylon);
    const donkeyDays = estimate.modes.find((m) => m.key === 'donkey').days;
    expect(donkeyDays).toBeGreaterThan(30);
    expect(donkeyDays).toBeLessThan(55);
  });
});
