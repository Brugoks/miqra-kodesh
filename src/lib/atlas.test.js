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
  eraAutoplayStep,
  elevationFor,
  elevationDelta,
  describeVertical,
  describeElevation,
  placesForChapters,
  traceForPerson,
  canTracePerson,
  NO_TRACE,
  TRACE_MIN_EVENTS,
  countriesForZoom,
  smoothRing,
  ringCentroid,
} from './atlas';
import atlasAsset from '../assets/bible-atlas.json';
import journeysAsset from '../assets/atlas-journeys.json';
import biblePlacesAsset from '../assets/bible-places.json';

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

describe('eraAutoplayStep', () => {
  it('advances the dense Gospels era ~1yr/tick', () => {
    expect(eraAutoplayStep({ window: 3 })).toBe(1);
  });

  it('sweeps the sparse Primeval era ~50yr/tick', () => {
    expect(eraAutoplayStep({ window: 150 })).toBe(50);
  });

  it('never returns less than 1 even for a very narrow window', () => {
    expect(eraAutoplayStep({ window: 1 })).toBeGreaterThanOrEqual(1);
    expect(eraAutoplayStep({ window: 0 })).toBeGreaterThanOrEqual(1);
  });
});

describe('elevationFor / elevationDelta / describeVertical / describeElevation', () => {
  // Real measured values (see docs/atlas-enhancements-plan.md §3a spot-check):
  // Jerusalem 744m, the Salt Sea -415m below sea level.
  const elevations = { jerusalem: 744, 'salt-sea': -415, tyre: 2, atlantis: null };

  it('elevationFor resolves a slug to its elevation, or null when unmeasured', () => {
    expect(elevationFor(elevations, 'jerusalem')).toBe(744);
    expect(elevationFor(elevations, 'nowhere')).toBeNull();
  });

  it('elevationFor returns null explicitly for a measured open-water point', () => {
    expect(elevationFor(elevations, 'atlantis')).toBeNull();
  });

  it('elevationDelta computes a positive delta for a climb', () => {
    expect(elevationDelta(elevations, 'salt-sea', 'jerusalem')).toEqual({ from: -415, to: 744, delta: 1159 });
  });

  it('elevationDelta computes a negative delta for a descent', () => {
    expect(elevationDelta(elevations, 'jerusalem', 'salt-sea')).toEqual({ from: 744, to: -415, delta: -1159 });
  });

  it('elevationDelta returns null when either endpoint is unmeasured', () => {
    expect(elevationDelta(elevations, 'jerusalem', 'nowhere')).toBeNull();
    expect(elevationDelta(elevations, 'jerusalem', 'atlantis')).toBeNull();
  });

  it('describeVertical reads in Scripture\'s own up/down direction language', () => {
    expect(describeVertical(1159)).toBe('a climb of 1,159 m (3,802 ft)');
    expect(describeVertical(-1159)).toBe('a descent of 1,159 m (3,802 ft)');
  });

  it('describeVertical treats anything under 75m as level rather than implying false precision', () => {
    expect(describeVertical(40)).toBe('roughly level');
    expect(describeVertical(-40)).toBe('roughly level');
  });

  it('describeVertical returns null for a missing delta', () => {
    expect(describeVertical(null)).toBeNull();
  });

  it('describeElevation names above/below sea level with both units', () => {
    expect(describeElevation(744)).toBe('744 m (2,441 ft) above sea level');
    expect(describeElevation(-415)).toBe('415 m (1,362 ft) below sea level');
  });

  it('describeElevation returns null for unmeasured places', () => {
    expect(describeElevation(null)).toBeNull();
  });
});

describe('placesForChapters', () => {
  const atlas = { ...atlasAsset, placesBySlug: new Map(atlasAsset.places.map((p) => [p.s, p])) };

  it('returns nothing for an empty chapter list', () => {
    expect(placesForChapters(atlas, biblePlacesAsset, [])).toEqual([]);
  });

  it('resolves Acts 17 to its real places, best-attested (by total chapter count) first', () => {
    // bible-places.json carries no atlas slug of its own — this joins by
    // normalized name against the real bible-atlas.json places, the same
    // way build-atlas.js itself attaches wiki slugs.
    const slugs = placesForChapters(atlas, biblePlacesAsset, ['ACT.17']);
    expect(slugs).toEqual([
      'map-thessalonica', 'map-athens', 'map-amphipolis', 'map-apollonia', 'map-areopagus', 'map-berea',
    ]);
  });

  it('merges places across several chapters without duplicates', () => {
    const slugs = placesForChapters(atlas, biblePlacesAsset, ['ACT.17', 'ACT.18']);
    expect(new Set(slugs).size).toBe(slugs.length); // no slug appears twice
    expect(slugs).toContain('map-athens'); // ACT.17
    expect(slugs).toContain('map-corinth'); // ACT.18
  });

  it('skips a bible-places entry whose name has no matching atlas place', () => {
    const biblePlaces = [{ n: 'Nowhereville', la: 0, lo: 0, p: ['ACT.17'] }];
    expect(placesForChapters(atlas, biblePlaces, ['ACT.17'])).toEqual([]);
  });
});

describe('traceForPerson / canTracePerson', () => {
  const atlas = atlasAsset;

  it('finds every placed event for a well-attested figure, oldest first (real measured counts)', () => {
    // See docs/atlas-enhancements-plan.md §6's measured coverage table.
    expect(traceForPerson(atlas, 'jesus_905')).toHaveLength(70);
    expect(traceForPerson(atlas, 'paul_2479')).toHaveLength(30);
    expect(traceForPerson(atlas, 'peter_2745')).toHaveLength(27);

    const trace = traceForPerson(atlas, 'paul_2479');
    for (let i = 1; i < trace.length; i += 1) expect(trace[i].y).toBeGreaterThanOrEqual(trace[i - 1].y);
  });

  it('excludes God and the Holy Spirit even though both clear the placed-event threshold', () => {
    expect(NO_TRACE.has('god_1324')).toBe(true);
    expect(NO_TRACE.has('holy_spirit_7400')).toBe(true);
    // Both have >= TRACE_MIN_EVENTS placed events for real — the exclusion
    // is a deliberate theological call, not an artifact of low coverage.
    expect(traceForPerson(atlas, 'god_1324')).toEqual([]);
    expect(traceForPerson(atlas, 'holy_spirit_7400')).toEqual([]);
    expect(canTracePerson(atlas, 'god_1324')).toBe(false);
  });

  it('does NOT silently exclude Jesus the way NO_GENERATED_IMAGE would', () => {
    expect(NO_TRACE.has('jesus_905')).toBe(false);
    expect(canTracePerson(atlas, 'jesus_905')).toBe(true);
  });

  it('offers a trace only once a person clears TRACE_MIN_EVENTS placed events', () => {
    expect(canTracePerson(atlas, 'paul_2479')).toBe(true); // 30, well clear
    expect(canTracePerson(atlas, 'david_994')).toBe(false); // measured at 2-3, below the bar
  });

  it('clamps to a lifespan when provided, dropping cameos outside a person\'s own lifetime', () => {
    // Moses (traditional lifespan roughly -1571 to -1452) appears at the
    // Transfiguration (AD 29) — real, but centuries after his own death.
    const unclamped = traceForPerson(atlas, 'moses_2108');
    const clamped = traceForPerson(atlas, 'moses_2108', [-1571, -1452]);
    expect(clamped.length).toBeLessThan(unclamped.length);
    for (const event of clamped) {
      expect(event.y).toBeGreaterThanOrEqual(-1571);
      expect(event.y).toBeLessThanOrEqual(-1452);
    }
  });

  it('returns an empty trace for a person with no placed events at all', () => {
    expect(traceForPerson(atlas, 'not-a-real-person-slug')).toEqual([]);
  });

  it('draws the line at exactly TRACE_MIN_EVENTS placed events', () => {
    const makeEvents = (count) => Array.from({ length: count }, (_, i) => ({
      s: `e${i}`, y: i, pe: ['someone'], pl: ['jerusalem'],
    }));
    const justBelow = { events: makeEvents(TRACE_MIN_EVENTS - 1) };
    const exactly = { events: makeEvents(TRACE_MIN_EVENTS) };
    expect(canTracePerson(justBelow, 'someone')).toBe(false);
    expect(canTracePerson(exactly, 'someone')).toBe(true);
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

describe('countriesForZoom', () => {
  const countries = [
    { n: 'Egypt', la: 26.5, lo: 29.5, minZoom: 3 },
    { n: 'Israel', la: 31, lo: 34.9, minZoom: 5 },
    { n: 'Malta', la: 35.9, lo: 14.4, minZoom: 8 },
  ];

  it('shows only the countries whose minZoom the current zoom has reached', () => {
    expect(countriesForZoom(countries, 3).map((c) => c.n)).toEqual(['Egypt']);
    expect(countriesForZoom(countries, 5).map((c) => c.n)).toEqual(['Egypt', 'Israel']);
    expect(countriesForZoom(countries, 8).map((c) => c.n)).toEqual(['Egypt', 'Israel', 'Malta']);
  });

  it('includes a country at exactly its own minZoom, not one step past it', () => {
    expect(countriesForZoom(countries, 4).map((c) => c.n)).not.toContain('Israel');
    expect(countriesForZoom(countries, 5).map((c) => c.n)).toContain('Israel');
  });

  it('hides everything below the shallowest minZoom rather than throwing', () => {
    expect(countriesForZoom(countries, 1)).toEqual([]);
  });
});

describe('smoothRing', () => {
  // A closed unit square: the smallest shape whose "geometric" look is the
  // whole problem smoothing exists to solve.
  const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];

  it('quadruples the vertex count per pass and closes the ring again', () => {
    expect(smoothRing(square, 1)).toHaveLength(4 * 2 + 1);
    expect(smoothRing(square, 2)).toHaveLength(4 * 4 + 1);
    const smoothed = smoothRing(square, 2);
    expect(smoothed[0]).toEqual(smoothed[smoothed.length - 1]);
  });

  it('cuts the corners off — no output point sits on the original vertex', () => {
    for (const [x, y] of smoothRing(square, 1)) {
      const onCorner = square.some(([cx, cy]) => cx === x && cy === y);
      expect(onCorner).toBe(false);
    }
  });

  it('stays inside the original bounding box, so a coastline can never drift out to sea', () => {
    for (const [x, y] of smoothRing(square, 3)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(10);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(10);
    }
  });

  it('leaves a ring too small to smooth alone rather than throwing', () => {
    const degenerate = [[0, 0], [1, 1], [0, 0]];
    expect(smoothRing(degenerate)).toBe(degenerate);
    expect(smoothRing([])).toEqual([]);
  });
});

describe('ringCentroid', () => {
  it('finds the centre of a square', () => {
    const centre = ringCentroid([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
    expect(centre.lo).toBeCloseTo(5);
    expect(centre.la).toBeCloseTo(5);
  });

  it('is area-weighted, not a vertex average — extra vertices along one edge do not drag it', () => {
    const plain = ringCentroid([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
    const denseTopEdge = ringCentroid([
      [0, 0], [10, 0], [10, 10], [7, 10], [5, 10], [3, 10], [0, 10], [0, 0],
    ]);
    expect(denseTopEdge.lo).toBeCloseTo(plain.lo);
    expect(denseTopEdge.la).toBeCloseTo(plain.la);
  });

  it('falls back to the vertex average for a zero-area ring instead of dividing by zero', () => {
    const centre = ringCentroid([[0, 0], [10, 10], [0, 0]]);
    expect(Number.isFinite(centre.lo)).toBe(true);
    expect(Number.isFinite(centre.la)).toBe(true);
  });
});
