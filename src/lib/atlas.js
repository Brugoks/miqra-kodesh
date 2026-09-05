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

// Zoom at which each tier's places start carrying a permanent name label on
// the map, as opposed to a hover tooltip. Deliberately later than
// TIER_MIN_ZOOM — a pin can appear before its label does, because a label
// costs far more screen space than a 3px dot and 908 of the 1,252 places sit
// inside one 3x2 degree box around Israel. Collision rejection (see
// labelCandidates) thins whatever survives this gate.
export const TIER_LABEL_MIN_ZOOM = { 1: 4, 2: 7, 3: 9, 4: 11 };

export function labelMinZoomForTier(tier) {
  return TIER_LABEL_MIN_ZOOM[tier] ?? TIER_LABEL_MIN_ZOOM[4];
}

// Rough on-screen width of a label, in px, without measuring the DOM. Used
// only to reject overlaps, so it errs generous: a slightly oversized box drops
// a borderline label rather than letting two collide.
const LABEL_CHAR_PX = { 1: 7.4, 2: 6.6, 3: 6.2, 4: 6.2 };
const LABEL_PAD_PX = 10;
export const LABEL_HEIGHT_PX = 15;
export const LABEL_OFFSET_PX = 9; // clears the pin itself

export function labelWidthPx(name, tier) {
  return name.length * (LABEL_CHAR_PX[tier] ?? LABEL_CHAR_PX[4]) + LABEL_PAD_PX;
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Greedy label placement: walk the eligible places most-mentioned-first and
// keep each one whose box clears every box already kept. Most-mentioned-first
// is what makes the result stable and sensible — Jerusalem always wins its
// neighbourhood, and a one-chapter village only gets a label when nothing more
// significant wants that space.
//
// `project(place)` returns the place's { x, y } in container pixels; `within`
// is the container's { width, height }. Both come from Leaflet at the call
// site, which is why this stays pure and testable here.
export function labelCandidates(places, zoom, project, within, margin = 24) {
  const eligible = places
    .filter((p) => zoom >= labelMinZoomForTier(p.t))
    .sort((a, b) => b.cc - a.cc || a.s.localeCompare(b.s));

  const kept = [];
  const boxes = [];
  for (const place of eligible) {
    const point = project(place);
    if (!point) continue;
    if (point.x < -margin || point.y < -margin
      || point.x > within.width + margin || point.y > within.height + margin) continue;
    const box = {
      x: point.x + LABEL_OFFSET_PX,
      y: point.y - LABEL_HEIGHT_PX / 2,
      w: labelWidthPx(place.n, place.t),
      h: LABEL_HEIGHT_PX,
    };
    if (boxes.some((b) => overlaps(box, b))) continue;
    boxes.push(box);
    kept.push(place);
  }
  return kept;
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

// Years-per-tick for era autoplay (Atlas.jsx), derived from the current
// era's own scrubber `window` (see AtlasScrubber.jsx's equal-width-segment
// comment) so dense eras like the Gospels (window: 3) creep forward
// ~1yr/tick while sparse ones like Primeval (window: 150) sweep ~50yr/tick —
// proportional motion through eras of wildly different real-world length.
export function eraAutoplayStep(era) {
  return Math.max(1, Math.round(era.window / 3));
}

let elevationsPromise = null;

// A flat { slug: metres|null } map baked by scripts/build-atlas-elevation.js
// — see docs/atlas-enhancements-plan.md §3a for why it's a separate asset
// from bible-atlas.json rather than a field on each place.
export function loadAtlasElevations() {
  if (!elevationsPromise) {
    elevationsPromise = import('../assets/atlas-elevation.json').then((mod) => mod.default);
  }
  return elevationsPromise;
}

// Metres above sea level, or null when unmeasured or over open water.
// Never throws for an unknown slug — a caller renders "no data" rather than
// crashing on a place the elevation build hasn't covered yet.
export function elevationFor(elevations, slug) {
  return elevations?.[slug] ?? null;
}

export function elevationDelta(elevations, aSlug, bSlug) {
  const from = elevationFor(elevations, aSlug);
  const to = elevationFor(elevations, bSlug);
  if (from == null || to == null) return null;
  return { from, to, delta: to - from };
}

const METRES_PER_FOOT = 3.28084;
// Below this magnitude, "up"/"down" would claim more precision than the
// underlying 90m-resolution SRTM data actually supports.
const LEVEL_THRESHOLD_M = 75;

function formatMetresFeet(metres) {
  return `${metres.toLocaleString()} m (${Math.round(metres * METRES_PER_FOOT).toLocaleString()} ft)`;
}

// Scripture's own direction language — you go UP to Jerusalem, DOWN to
// Egypt or Jericho — rather than a neutral "elevation difference of Xm".
// `delta` is the signed value from elevationDelta (to - from): positive is
// a climb from origin to destination, negative a descent.
export function describeVertical(delta) {
  if (delta == null) return null;
  const magnitude = Math.abs(delta);
  if (magnitude < LEVEL_THRESHOLD_M) return 'roughly level';
  return delta > 0 ? `a climb of ${formatMetresFeet(magnitude)}` : `a descent of ${formatMetresFeet(magnitude)}`;
}

// A single place's own elevation, for the detail sheet's metadata line —
// distinct from describeVertical, which describes the relative climb/descent
// between two places rather than one place's absolute reading.
export function describeElevation(metres) {
  if (metres == null) return null;
  if (metres === 0) return 'at sea level';
  return `${formatMetresFeet(Math.abs(metres))} ${metres > 0 ? 'above' : 'below'} sea level`;
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

// scripts/build-atlas.js reserves cf === 1 for placements that came from
// curated data — bible-events.json's own `pl` field, or a hand correction in
// atlas-overrides.json. Its chapter-overlap fallback tops out at 0.946 by
// construction (coverage 1 x specificity 0.631 x fvBonus 1.5), so this is an
// exact test rather than a tuned threshold, and it costs no extra field on
// the 400 events in the payload.
export const CURATED_CF = 1;

// True when this event's pin is the resolver's best guess rather than a place
// the source data actually names. The map draws these hollow and the detail
// sheet says so out loud: a reading aid that quietly presents an inference as
// a fact is worse than one that admits the gap.
export function isInferredPlacement(event) {
  return !!event && (event.pl?.length || 0) > 0 && event.cf < CURATED_CF;
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

let biblePlacesPromise = null;

// openbible.info's geocoded places (also used by PassageMap.jsx) — see
// placesForChapters below for why the atlas reuses this asset instead of
// carrying its own chapter index.
export function loadBiblePlaces() {
  if (!biblePlacesPromise) {
    biblePlacesPromise = import('../assets/bible-places.json').then((mod) => mod.default);
  }
  return biblePlacesPromise;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Reading-plan/sermon deep link support (docs/atlas-enhancements-plan.md
// §5): resolve a set of chapter ids ('ACT.17') to atlas place slugs, most-
// mentioned-in-these-chapters first. bible-atlas.json deliberately strips
// each place's chapter list to keep the payload lean (see build-atlas.js),
// so this joins back to bible-places.json — which still carries it, and is
// already a shared build chunk via PassageMap.jsx — by normalized name, the
// same key scripts/build-atlas.js itself uses to attach wiki slugs.
export function placesForChapters(atlas, biblePlaces, chapterIds) {
  const chapters = new Set(chapterIds);
  if (!chapters.size) return [];
  const placeByNormName = new Map(atlas.places.map((p) => [norm(p.n), p]));
  const scored = [];
  for (const bp of biblePlaces) {
    const overlap = bp.p.filter((c) => chapters.has(c)).length;
    if (!overlap) continue;
    const place = placeByNormName.get(norm(bp.n));
    if (place) scored.push({ place, overlap });
  }
  scored.sort((a, b) => b.overlap - a.overlap || b.place.cc - a.place.cc);
  const seen = new Set();
  const out = [];
  for (const { place } of scored) {
    if (seen.has(place.s)) continue;
    seen.add(place.s);
    out.push(place.s);
  }
  return out;
}

// Neither of bibleWiki.js's existing exclusion sets fits a "travel route"
// feature (see docs/atlas-enhancements-plan.md §6): MATCH_EXCLUDED is just
// {god_1324}, and NO_GENERATED_IMAGE additionally excludes jesus_905 — right
// for *imagery* (an org may choose not to depict Jesus) but wrong here,
// since it would silently drop Jesus, the single richest trace in the
// dataset at 70 placed events. Tracing where Jesus travelled is not the
// same question as depicting him.
export const NO_TRACE = new Set(['god_1324', 'holy_spirit_7400']);

let traceablePeoplePromise = null;

// A tiny standalone list of person slugs that clear TRACE_MIN_EVENTS,
// generated by scripts/build-atlas.js — see the comment there. Kept
// separate from bible-atlas.json (300KB+) specifically so a Bible Wiki
// person page can cheaply decide whether to show a "trace this person"
// button at all, per docs/atlas-enhancements-plan.md §6's "not a universal
// button" requirement, without fetching the whole atlas just to ask that.
export function loadTraceablePeople() {
  if (!traceablePeoplePromise) {
    traceablePeoplePromise = import('../assets/atlas-traceable-people.json').then((mod) => new Set(mod.default));
  }
  return traceablePeoplePromise;
}

// Below this many placed events, a trace reads as a mostly-empty map rather
// than a life journey — see the plan's measured coverage table (18 people
// clear this bar; David, at 2-3, does not despite 190 chapters mentioning him).
export const TRACE_MIN_EVENTS = 5;

// Every dated, placed event mentioning this person, oldest first — the raw
// material for "everywhere X went." Deliberately built from events (each
// already TF-IDF-resolved to real place(s) by build-atlas.js), not from
// chapter membership: measured, that approach gives Moses 477 "places" and
// David 416, almost all of which they never visited — a chapter that
// mentions a person also "counts" every place that chapter happens to name.
//
// `lifespan` is optional `[from, to]` (a bible-wiki.json person's own `y`
// range) — pass it to clamp out anachronistic cameos like Moses appearing
// at the Transfiguration (AD 29) centuries after his own death, which would
// otherwise make a "life journey" read oddly. Omit it to see every placed
// mention regardless of era.
export function traceForPerson(atlas, personSlug, lifespan) {
  if (NO_TRACE.has(personSlug)) return [];
  let events = atlas.events.filter((e) => e.pe?.includes(personSlug) && e.pl?.length);
  if (lifespan) events = events.filter((e) => e.y >= lifespan[0] && e.y <= lifespan[1]);
  return events.slice().sort((a, b) => a.y - b.y);
}

export function canTracePerson(atlas, personSlug, lifespan) {
  return traceForPerson(atlas, personSlug, lifespan).length >= TRACE_MIN_EVENTS;
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
