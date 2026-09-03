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

function nameMatchScore(name, q) {
  const n = name.toLowerCase();
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  if (n.includes(q)) return 50;
  return 0;
}

const SEARCHABLE_KINDS = ['place', 'event', 'journey'];

// Search box behind the atlas's "find something you have in mind" field.
// Searches places and mappable events (both carry coordinates directly) plus
// journeys by name, ranked exact > starts-with > contains. Each result
// already carries everything a caller needs to jump the map there — `minZoom`
// so a tier-4 village search doesn't zoom in on a pin that's still hidden
// (see visiblePlaces/TIER_MIN_ZOOM above) — so the UI never re-derives it.
// `kinds` narrows which of the three get searched at all — the travel-time
// picker passes ['place'] since a journey or event isn't a travel endpoint.
export function searchAtlas(atlas, journeys, query, limit = 8, kinds = SEARCHABLE_KINDS) {
  const q = (query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const scored = [];

  if (kinds.includes('place')) {
    for (const place of atlas.places) {
      const score = nameMatchScore(place.n, q);
      if (!score) continue;
      scored.push({
        kind: 'place', slug: place.s, name: place.n, la: place.la, lo: place.lo,
        minZoom: minZoomForTier(place.t), score,
      });
    }
  }

  if (kinds.includes('event')) {
    for (const event of atlas.events) {
      if (!event.pl.length) continue; // unplaced events have nowhere to jump to
      const score = nameMatchScore(event.n, q);
      if (!score) continue;
      const place = atlas.placesBySlug.get(event.pl[0]);
      if (!place) continue;
      scored.push({
        kind: 'event', slug: event.s, name: event.n, year: event.y,
        la: place.la, lo: place.lo, minZoom: minZoomForTier(place.t), score,
      });
    }
  }

  if (kinds.includes('journey')) {
    for (const journey of journeys || []) {
      const score = nameMatchScore(journey.n, q);
      if (!score) continue;
      scored.push({ kind: 'journey', slug: journey.s, name: journey.n, yearRange: journey.y, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// Map coordinate for whatever is currently selected on the atlas (a tapped
// place pin, event marker, or journey stop) — the single source of truth for
// where the "you tapped this" glow marker (AtlasMap's `highlight` prop)
// should sit. Kept pure/separate from AtlasMap's onSelect payload because a
// polity-fill tap only carries a slug, not the coordinate.
export function selectionCoords(selection, atlas) {
  if (!selection || !atlas) return null;
  if (selection.kind === 'place') {
    const place = atlas.placesBySlug.get(selection.slug);
    return place ? { la: place.la, lo: place.lo } : null;
  }
  if (selection.kind === 'event') {
    const event = atlas.eventsBySlug.get(selection.slug);
    if (!event) return null;
    const place = primaryPlace(atlas.placesBySlug, event);
    return place ? { la: place.la, lo: place.lo } : null;
  }
  if (selection.kind === 'stop') {
    return { la: selection.stop.la, lo: selection.stop.lo };
  }
  return null;
}

// ── Travel time estimate ────────────────────────────────────────────────────
// "What would it have felt like to travel from A to B?" — a deliberately
// rough teaching estimate, same spirit as the polity outlines: real ancient
// roads followed rivers, passes and known caravan routes rather than a
// straight line, so ROUTE_INEFFICIENCY inflates the great-circle distance by
// a commonly-cited rule-of-thumb multiplier before dividing by a travel
// mode's typical sustained daily distance (multi-day pace, not a single
// forced march). Sanity-checked against Jerusalem–Babylon (~540mi straight
// line, ~40 days by donkey caravan with this model) matching figures
// standard Bible atlases give for the exile route.
const EARTH_RADIUS_MI = 3958.8;
const ROUTE_INEFFICIENCY = 1.35;

export function greatCircleMiles(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.la - a.la);
  const dLo = toRad(b.lo - a.lo);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.la)) * Math.cos(toRad(b.la)) * Math.sin(dLo / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(Math.min(1, h)));
}

export const TRAVEL_MODES = [
  { key: 'foot', label: 'On foot', milesPerDay: 20 },
  { key: 'donkey', label: 'By donkey caravan', milesPerDay: 18 },
  { key: 'camel', label: 'By camel caravan', milesPerDay: 25 },
  { key: 'horse', label: 'By horse (messenger pace)', milesPerDay: 45 },
];

// `origin`/`destination` are `{ la, lo }`. Days are ceil'd — an ancient
// traveller counts whole day-marches, not "3.2 days".
export function travelEstimate(origin, destination) {
  const straightMiles = greatCircleMiles(origin, destination);
  const routeMiles = straightMiles * ROUTE_INEFFICIENCY;
  return {
    straightMiles,
    routeMiles,
    modes: TRAVEL_MODES.map((mode) => ({ ...mode, days: Math.max(1, Math.ceil(routeMiles / mode.milesPerDay)) })),
  };
}
