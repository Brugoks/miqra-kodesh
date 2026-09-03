// Pure helpers for the Ancient World Atlas (/atlas). Kept free of React and
// Leaflet so the logic that actually matters — era lookup, zoom tiering, the
// scrubber's time window — gets real unit coverage; Leaflet itself is
// near-untestable in jsdom and gets only a render smoke test.
// See docs/ancient-atlas-plan.md for the design this implements.

let atlasPromise = null;

export function loadBibleAtlas() {
  if (!atlasPromise) {
    atlasPromise = import('../assets/bible-atlas.json').then((mod) => {
      const raw = mod.default;
      return {
        ...raw,
        placesBySlug: new Map(raw.places.map((p) => [p.s, p])),
        eventsBySlug: new Map(raw.events.map((e) => [e.s, e])),
        eraBySlug: new Map(raw.eras.map((e) => [e.s, e])),
      };
    });
  }
  return atlasPromise;
}

// Places below tier 1 stay hidden until the map is zoomed in enough that
// they won't just clutter a world view — see docs/ancient-atlas-plan.md §03.
export const TIER_MIN_ZOOM = { 1: 3, 2: 6, 3: 8, 4: 10 };

export function minZoomForTier(tier) {
  return TIER_MIN_ZOOM[tier] ?? TIER_MIN_ZOOM[4];
}

export function visiblePlaces(places, zoom) {
  return places.filter((p) => zoom >= minZoomForTier(p.t));
}

// Which era a year falls in. Eras are contiguous and sorted by `from`; a year
// before the first era's start or after the last era's end clamps to the
// nearest end rather than returning null, so the scrubber never has a "no
// era" state.
export function eraForYear(eras, year) {
  for (const era of eras) {
    if (year >= era.from && year <= era.to) return era;
  }
  if (!eras.length) return null;
  return year < eras[0].from ? eras[0] : eras[eras.length - 1];
}

// Events within the given era's window around `year`, each annotated with an
// opacity that fades from 1 at the centre year to 0.4 at the window's edge.
// Deliberately scans the whole event list rather than filtering by
// event.era first: a scrub position near an era boundary should let nearby
// events from the neighbouring era fade in too, not cut off hard at the
// boundary.
export function eventsInWindow(events, year, windowSize) {
  if (!windowSize) return [];
  const out = [];
  for (const event of events) {
    if (!event.pl?.length) continue; // unplaced events can't render on the map
    const dist = Math.abs(event.y - year);
    if (dist > windowSize) continue;
    const opacity = 1 - (dist / windowSize) * 0.6;
    out.push({ ...event, opacity });
  }
  return out.sort((a, b) => b.opacity - a.opacity);
}

let politiesPromise = null;

export function loadAtlasPolities() {
  if (!politiesPromise) {
    politiesPromise = import('../assets/atlas-polities.json').then((mod) => mod.default.features);
  }
  return politiesPromise;
}

// Polities active at `year` — a polity is shown for the whole scrub range it
// spans, not just a single instant, so dragging through its era doesn't flash
// the territory on and off between events.
export function politiesForYear(polities, year) {
  return polities.filter((f) => year >= f.properties.from && year <= f.properties.to);
}

let journeysPromise = null;

export function loadAtlasJourneys() {
  if (!journeysPromise) {
    journeysPromise = import('../assets/atlas-journeys.json').then((mod) => mod.default.journeys);
  }
  return journeysPromise;
}

export function placeById(placesBySlug, slug) {
  return placesBySlug.get(slug) || null;
}

// First valid place for an event — the "best" pin when only one can be shown
// (e.g. centering the map on a tapped event).
export function primaryPlace(placesBySlug, event) {
  for (const slug of event.pl || []) {
    const place = placesBySlug.get(slug);
    if (place) return place;
  }
  return null;
}
