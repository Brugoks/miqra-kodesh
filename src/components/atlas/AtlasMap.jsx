import { useEffect, useRef, useState } from 'react';
import {
  visiblePlaces, eventsInWindow, politiesForYear, isInferredPlacement, labelCandidates,
} from '../../lib/atlas';
import './AtlasMap.css';

// Label-free relief basemap (see docs/ancient-atlas-plan.md §01) — the same
// CARTO layer PassageMap.jsx falls back to without a Thunderforest key, used
// here deliberately rather than the labeled 'atlas' layer: modern city names
// and borders are exactly what a map of the ANCIENT world should not show.
// Never proxied through an edge function — a single pan fires dozens of tile
// requests (see the comment block in PassageMap.jsx, which also covers the
// required VITE_CARTO_API_KEY — CARTO enforces one on this endpoint as of
// late August 2026).
const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY || '';
const BASE_TILE_URL = `https://basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png${CARTO_KEY ? `?key=${CARTO_KEY}` : ''}`;
const BASE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const TIER_COLOR = { 1: '#1e3a8a', 2: '#2e52be', 3: '#5c78ca', 4: '#93a5d6' };
const TIER_RADIUS = { 1: 8, 2: 6, 3: 4.5, 4: 3 };
const EVENT_COLOR = '#c2410c';
const HIGHLIGHT_COLOR = '#fde047';
const ORIGIN_COLOR = '#4ade80';
const DESTINATION_COLOR = '#f87171';
const PINNED_COLOR = '#059669';
// How much the general place/event/pinned scatter fades once something is
// selected, so the glow highlight isn't competing with a map full of
// equally-weighted pins — see the `highlight`-gated opacity below.
const DIM_FACTOR = 0.2;

// A radar-ping DivIcon: two staggered expanding rings plus a solid glowing
// core, so whatever got tapped (or flown to via search) is unmistakable even
// after the fly animation settles — see AtlasMap's `highlight` prop below.
// `interactive: false` so the glow never steals a click from the real marker
// underneath it.
function glowDivIcon(L, color) {
  return L.divIcon({
    className: 'atlas-glow-icon',
    html: `<span class="atlas-glow-ring" style="--glow-color:${color}"></span>`
      + `<span class="atlas-glow-ring atlas-glow-ring--delay" style="--glow-color:${color}"></span>`
      + `<span class="atlas-glow-core" style="--glow-color:${color}"></span>`,
    iconSize: [1, 1],
  });
}

// Place names come from a bundled build artifact rather than user input, but
// this html string is injected raw into a DivIcon, so escape anyway.
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// A permanent name label pinned beside a place. Sized [1,1] and positioned by
// CSS relative to that point, exactly like the glow icon above, so the label
// can be any width without Leaflet needing to know it. `interactive: false`
// keeps it from stealing taps from the pin it names.
function labelDivIcon(L, place) {
  return L.divIcon({
    className: 'atlas-label-icon',
    html: `<span class="atlas-label atlas-label--t${place.t}">${escapeHtml(place.n)}</span>`,
    iconSize: [1, 1],
  });
}

function glowMarker(L, la, lo, color) {
  return L.marker([la, lo], { icon: glowDivIcon(L, color), interactive: false, zIndexOffset: 1000 });
}

// A tap on the map always resolves to one of three selection shapes, all
// handled by the same onSelect callback and rendered by AtlasDetailSheet:
//   { kind: 'place', slug }                     — a place pin or a polity fill
//   { kind: 'event', slug }                     — an event marker
//   { kind: 'stop', stop, journeyName, color }   — a journey stop, which may
//                                                   have no wiki slug at all
//                                                   (e.g. Malta, Appii Forum)
export default function AtlasMap({
  atlas, year, era, polities, showPolities, activeJourney, journeyStopIndex, onSelect, flyTo,
  highlight, originDestination, pinnedPlaces,
}) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const groupsRef = useRef({});
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(5);
  // Bumped on every settled pan/zoom, to re-run label placement only.
  const [view, setView] = useState(0);

  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // Mount once. React StrictMode double-fires effects, so guard against a
  // second init the same way WikiPlaceMap.jsx does.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ default: L }] = await Promise.all([
        import('leaflet'),
        import('leaflet/dist/leaflet.css'),
      ]);
      if (cancelled || !mapEl.current || mapRef.current) return;
      leafletRef.current = L;

      const map = L.map(mapEl.current, {
        center: [31.5, 40],
        zoom: 5,
        minZoom: 3,
        maxZoom: 12,
        worldCopyJump: true,
        // At z10 every tier is visible, which is 1,252 circleMarkers. As SVG
        // that is 1,252 DOM nodes; on canvas it is one. Labels are still
        // DivIcons (DOM) but there are only ever a few dozen of those.
        preferCanvas: true,
      });
      L.tileLayer(BASE_TILE_URL, { maxZoom: 12, detectRetina: true, attribution: BASE_ATTRIBUTION }).addTo(map);

      // Draw order: territories under everything, then journeys/distance
      // lines, then place pins, then events, with the highlight glow always
      // on top (it uses Leaflet's markerPane regardless of group order, but
      // keeping it last here too for clarity).
      groupsRef.current = {
        polities: L.layerGroup().addTo(map),
        journey: L.layerGroup().addTo(map),
        distance: L.layerGroup().addTo(map),
        places: L.layerGroup().addTo(map),
        labels: L.layerGroup().addTo(map),
        events: L.layerGroup().addTo(map),
        pinned: L.layerGroup().addTo(map),
        highlight: L.layerGroup().addTo(map),
      };

      map.on('zoomend', () => setZoom(map.getZoom()));
      // Labels are placed by projected pixel position, so they have to be
      // recomputed on pan as well as zoom. `moveend` covers both (a zoom also
      // moves), and fires once the animation settles rather than per frame.
      map.on('moveend', () => setView((v) => v + 1));
      mapRef.current = map;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // Places: recomputed only when the zoom-tier bucket actually changes (or
  // the selection itself does — see DIM_FACTOR), per
  // docs/ancient-atlas-plan.md §03 — never filter 1,252 rows on every pan
  // frame, but a tap is a discrete, infrequent action like a zoom change,
  // not a continuous one, so baking the current dim state in at creation
  // time here (rather than a separate always-on restyle effect) doesn't
  // reintroduce that cost.
  useEffect(() => {
    if (!ready || !atlas) return;
    const L = leafletRef.current;
    const group = groupsRef.current.places;
    group.clearLayers();
    const dim = !!highlight;
    for (const place of visiblePlaces(atlas.places, zoom)) {
      const marker = L.circleMarker([place.la, place.lo], {
        radius: TIER_RADIUS[place.t] || 3,
        color: TIER_COLOR[place.t] || TIER_COLOR[4],
        weight: place.t <= 2 ? 2 : 1,
        fillColor: TIER_COLOR[place.t] || TIER_COLOR[4],
        fillOpacity: dim ? 0.85 * DIM_FACTOR : 0.85,
        opacity: dim ? DIM_FACTOR : 1,
      });
      marker.bindTooltip(place.n, { direction: 'top', offset: [0, -4] });
      marker.on('click', () => onSelectRef.current?.({ kind: 'place', slug: place.s }));
      marker.addTo(group);
    }
  }, [ready, atlas, zoom, highlight]);

  // Labels: the thing that makes this read as an atlas rather than a map with
  // dots on it. Placed greedily, most-mentioned-first, rejecting any label that
  // would overlap one already placed — see labelCandidates in lib/atlas.js,
  // which owns the geometry so it can be tested without Leaflet. Recomputed on
  // pan and zoom (`view`) because placement depends on projected pixels, and
  // suppressed entirely while something is selected so the labels don't fight
  // the highlight glow for attention.
  useEffect(() => {
    if (!ready || !atlas || !mapRef.current) return;
    const L = leafletRef.current;
    const map = mapRef.current;
    const group = groupsRef.current.labels;
    group.clearLayers();
    if (highlight) return;
    const size = map.getSize();
    const kept = labelCandidates(
      atlas.places,
      zoom,
      (place) => map.latLngToContainerPoint([place.la, place.lo]),
      { width: size.x, height: size.y },
    );
    for (const place of kept) {
      L.marker([place.la, place.lo], { icon: labelDivIcon(L, place), interactive: false })
        .addTo(group);
    }
  }, [ready, atlas, zoom, view, highlight]);

  // Events: recomputed whenever the scrubber moves (or the selection
  // changes). Opacity fades from 1 at the exact year to 0.4 at the current
  // era's window edge — further dimmed on top of that once something is
  // selected, same DIM_FACTOR treatment as the places layer above.
  useEffect(() => {
    if (!ready || !atlas || !era) return;
    const L = leafletRef.current;
    const group = groupsRef.current.events;
    group.clearLayers();
    const dim = !!highlight;
    for (const event of eventsInWindow(atlas.events, year, era.window)) {
      const place = atlas.placesBySlug.get(event.pl[0]);
      if (!place) continue;
      const eventOpacity = dim ? event.opacity * DIM_FACTOR : event.opacity;
      // A pin the resolver guessed at is drawn hollow and dashed, so the map
      // itself distinguishes "Scripture places this here" from "this is our
      // best inference from the chapters involved" without anyone having to
      // tap it. See isInferredPlacement in lib/atlas.js.
      const inferred = isInferredPlacement(event);
      const marker = L.circleMarker([place.la, place.lo], {
        radius: 7,
        color: EVENT_COLOR,
        weight: 2,
        dashArray: inferred ? '3 3' : undefined,
        fillColor: EVENT_COLOR,
        fillOpacity: inferred ? 0 : eventOpacity,
        opacity: eventOpacity,
      });
      marker.bindTooltip(inferred ? `${event.n} (location inferred)` : event.n, { direction: 'top', offset: [0, -6] });
      marker.on('click', () => onSelectRef.current?.({ kind: 'event', slug: event.s }));
      marker.addTo(group);
    }
  }, [ready, atlas, year, era, highlight]);

  // Polities: coarse territory fills, filtered to whichever span covers the
  // current scrub year. See docs/ancient-atlas-plan.md §Phase 4 — these are
  // deliberately approximate teaching outlines, not survey boundaries.
  useEffect(() => {
    if (!ready) return;
    const L = leafletRef.current;
    const group = groupsRef.current.polities;
    group.clearLayers();
    if (!showPolities || !polities) return;
    for (const feature of politiesForYear(polities, year)) {
      const layer = L.geoJSON(feature, {
        style: {
          color: feature.properties.color,
          weight: 1.5,
          fillColor: feature.properties.color,
          fillOpacity: 0.22,
        },
      });
      layer.bindTooltip(feature.properties.n, { sticky: true });
      layer.on('click', () => {
        if (feature.properties.wiki) onSelectRef.current?.({ kind: 'place', slug: feature.properties.wiki });
      });
      layer.addTo(group);
    }
  }, [ready, polities, showPolities, year]);

  // Journey: a faint preview of the WHOLE route drawn the moment a journey
  // is selected (not only once playback has advanced past it), with the
  // traveled-so-far portion overlaid as a bold solid line on top — so the
  // trail is unmistakable and visible from the first stop, not just a
  // sparse "1 8" dash pattern that read as barely-there dots. Stops
  // themselves stay dim ahead, bright once reached. Refits bounds only when
  // the journey itself changes, not on every playback tick, so scrubbing
  // through stops doesn't fight the user's own pan/zoom.
  useEffect(() => {
    if (!ready) return;
    const L = leafletRef.current;
    const group = groupsRef.current.journey;
    group.clearLayers();
    if (!activeJourney) return;

    const stops = activeJourney.stops;
    const allCoords = stops.map((s) => [s.la, s.lo]);
    const reached = stops.slice(0, journeyStopIndex + 1);
    if (allCoords.length > 1) {
      L.polyline(allCoords, {
        color: activeJourney.color, weight: 3, opacity: 0.35, dashArray: '2 10', lineCap: 'round',
      }).addTo(group);
    }
    if (reached.length > 1) {
      L.polyline(reached.map((s) => [s.la, s.lo]), {
        color: activeJourney.color, weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round',
      }).addTo(group);
    }
    stops.forEach((stop, i) => {
      const isReached = i <= journeyStopIndex;
      const marker = L.circleMarker([stop.la, stop.lo], {
        radius: isReached ? (i === journeyStopIndex ? 8 : 5) : 4,
        color: activeJourney.color,
        weight: 2,
        fillColor: isReached ? activeJourney.color : '#ffffff',
        fillOpacity: isReached ? 0.9 : 0.5,
        opacity: isReached ? 1 : 0.45,
      });
      const placeName = stop.place ? atlas?.placesBySlug.get(stop.place)?.n : null;
      marker.bindTooltip(placeName || stop.ref, { direction: 'top', offset: [0, -4] });
      marker.on('click', () => onSelectRef.current?.({
        kind: 'stop', stop: { ...stop, n: placeName }, journeyName: activeJourney.n, color: activeJourney.color,
      }));
      marker.addTo(group);
    });
  }, [ready, atlas, activeJourney, journeyStopIndex]);

  // Fit bounds only on journey selection, not every playback tick.
  const journeySlugRef = useRef(null);
  useEffect(() => {
    if (!ready || !activeJourney || !mapRef.current) return;
    if (journeySlugRef.current === activeJourney.s) return;
    journeySlugRef.current = activeJourney.s;
    const L = leafletRef.current;
    const bounds = L.latLngBounds(activeJourney.stops.map((s) => [s.la, s.lo]));
    mapRef.current.fitBounds(bounds, { padding: [48, 48], maxZoom: 7 });
  }, [ready, activeJourney]);

  useEffect(() => {
    if (!activeJourney) journeySlugRef.current = null;
  }, [activeJourney]);

  // Highlight: an emanating glow at whatever `selection` currently is (see
  // selectionCoords in lib/atlas.js), so the thing that got tapped or flown
  // to via search stays unmistakable once the fly animation settles — not
  // just "the map moved somewhere," but "that pin, right there."
  useEffect(() => {
    if (!ready) return;
    const L = leafletRef.current;
    const group = groupsRef.current.highlight;
    group.clearLayers();
    if (!highlight) return;
    glowMarker(L, highlight.la, highlight.lo, HIGHLIGHT_COLOR).addTo(group);
  }, [ready, highlight]);

  // Origin/destination for the travel-time estimate: a straight dashed line
  // (deliberately undashed-and-colored differently from a real Journey route
  // — this is "as the crow flies" for the distance math, not a historically
  // attested path) plus a glow at each end, green for origin / red for
  // destination so the direction of travel reads at a glance.
  useEffect(() => {
    if (!ready) return;
    const L = leafletRef.current;
    const group = groupsRef.current.distance;
    group.clearLayers();
    if (!originDestination) return;
    const { origin, destination } = originDestination;
    L.polyline([[origin.la, origin.lo], [destination.la, destination.lo]], {
      color: '#e2e8f0', weight: 2, opacity: 0.85, dashArray: '6 8',
    }).addTo(group);
    glowMarker(L, origin.la, origin.lo, ORIGIN_COLOR).addTo(group);
    glowMarker(L, destination.la, destination.lo, DESTINATION_COLOR).addTo(group);
  }, [ready, originDestination]);

  // Fit bounds only when the origin/destination pair itself changes.
  const distancePairRef = useRef(null);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (!originDestination) { distancePairRef.current = null; return; }
    const { origin, destination } = originDestination;
    const key = `${origin.slug}|${destination.slug}`;
    if (distancePairRef.current === key) return;
    distancePairRef.current = key;
    const L = leafletRef.current;
    const bounds = L.latLngBounds([[origin.la, origin.lo], [destination.la, destination.lo]]);
    mapRef.current.fitBounds(bounds, { padding: [64, 64], maxZoom: 8 });
  }, [ready, originDestination]);

  // Pinned places: a reading-plan/sermon deep link's chapters resolved to
  // atlas places (see placesForChapters in lib/atlas.js and the /atlas
  // ?chapters= handling in Atlas.jsx). Deliberately its own layer rather than
  // reusing the tiered `places` layer — a linked chapter's places should
  // show up regardless of the current zoom tier, not just the ones that
  // would normally be visible (see visiblePlaces/TIER_MIN_ZOOM).
  useEffect(() => {
    if (!ready) return;
    const L = leafletRef.current;
    const group = groupsRef.current.pinned;
    group.clearLayers();
    if (!pinnedPlaces?.length) return;
    const dim = !!highlight;
    for (const place of pinnedPlaces) {
      const marker = L.circleMarker([place.la, place.lo], {
        radius: 8,
        color: PINNED_COLOR,
        weight: 2.5,
        fillColor: PINNED_COLOR,
        fillOpacity: dim ? 0.85 * DIM_FACTOR : 0.85,
        opacity: dim ? DIM_FACTOR : 1,
      });
      marker.bindTooltip(place.n, { direction: 'top', offset: [0, -4] });
      marker.on('click', () => onSelectRef.current?.({ kind: 'place', slug: place.s }));
      marker.addTo(group);
    }
  }, [ready, pinnedPlaces, highlight]);

  // Fit bounds only when the pinned set itself changes, not on every render.
  const pinnedKeyRef = useRef(null);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (!pinnedPlaces?.length) { pinnedKeyRef.current = null; return; }
    const key = pinnedPlaces.map((p) => p.s).join('|');
    if (pinnedKeyRef.current === key) return;
    pinnedKeyRef.current = key;
    const L = leafletRef.current;
    const bounds = L.latLngBounds(pinnedPlaces.map((p) => [p.la, p.lo]));
    mapRef.current.fitBounds(bounds, { padding: [56, 56], maxZoom: 9 });
  }, [ready, pinnedPlaces]);

  // Jump-to-result from AtlasSearch: `flyTo` is a fresh object on every
  // selection (even re-picking the same result), so this fires every time
  // regardless of whether the coordinates happen to repeat. Only zooms IN
  // when needed — a tier-4 village result forces enough zoom for its pin to
  // actually be visible (see visiblePlaces), but re-searching something in
  // the world view already on screen doesn't yank the zoom level around.
  useEffect(() => {
    if (!ready || !flyTo || !mapRef.current) return;
    const targetZoom = Math.max(mapRef.current.getZoom(), flyTo.minZoom || 0);
    mapRef.current.flyTo([flyTo.la, flyTo.lo], targetZoom, { duration: 0.8 });
  }, [ready, flyTo]);

  return <div ref={mapEl} className="atlas-map-canvas" role="application" aria-label="Map of the biblical world" />;
}
