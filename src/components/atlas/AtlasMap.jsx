import { useEffect, useRef, useState } from 'react';
import { visiblePlaces, eventsInWindow, politiesForYear } from '../../lib/atlas';
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
  highlight, originDestination,
}) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const groupsRef = useRef({});
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(5);

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
        events: L.layerGroup().addTo(map),
        highlight: L.layerGroup().addTo(map),
      };

      map.on('zoomend', () => setZoom(map.getZoom()));
      mapRef.current = map;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // Places: recomputed only when the zoom-tier bucket actually changes, per
  // docs/ancient-atlas-plan.md §03 — never filter 1,252 rows on every pan frame.
  useEffect(() => {
    if (!ready || !atlas) return;
    const L = leafletRef.current;
    const group = groupsRef.current.places;
    group.clearLayers();
    for (const place of visiblePlaces(atlas.places, zoom)) {
      const marker = L.circleMarker([place.la, place.lo], {
        radius: TIER_RADIUS[place.t] || 3,
        color: TIER_COLOR[place.t] || TIER_COLOR[4],
        weight: place.t <= 2 ? 2 : 1,
        fillColor: TIER_COLOR[place.t] || TIER_COLOR[4],
        fillOpacity: 0.85,
      });
      marker.bindTooltip(place.n, { direction: 'top', offset: [0, -4] });
      marker.on('click', () => onSelectRef.current?.({ kind: 'place', slug: place.s }));
      marker.addTo(group);
    }
  }, [ready, atlas, zoom]);

  // Events: recomputed whenever the scrubber moves. Opacity fades from 1 at
  // the exact year to 0.4 at the current era's window edge.
  useEffect(() => {
    if (!ready || !atlas || !era) return;
    const L = leafletRef.current;
    const group = groupsRef.current.events;
    group.clearLayers();
    for (const event of eventsInWindow(atlas.events, year, era.window)) {
      const place = atlas.placesBySlug.get(event.pl[0]);
      if (!place) continue;
      const marker = L.circleMarker([place.la, place.lo], {
        radius: 7,
        color: EVENT_COLOR,
        weight: 2,
        fillColor: EVENT_COLOR,
        fillOpacity: event.opacity,
        opacity: event.opacity,
      });
      marker.bindTooltip(`${event.n}`, { direction: 'top', offset: [0, -6] });
      marker.on('click', () => onSelectRef.current?.({ kind: 'event', slug: event.s }));
      marker.addTo(group);
    }
  }, [ready, atlas, year, era]);

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

  // Journey: an accreting polyline up to the current stop, with all stops
  // dotted (dim ahead, bright once reached). Refits bounds only when the
  // journey itself changes, not on every playback tick, so scrubbing through
  // stops doesn't fight the user's own pan/zoom.
  useEffect(() => {
    if (!ready) return;
    const L = leafletRef.current;
    const group = groupsRef.current.journey;
    group.clearLayers();
    if (!activeJourney) return;

    const stops = activeJourney.stops;
    const reached = stops.slice(0, journeyStopIndex + 1);
    if (reached.length > 1) {
      L.polyline(reached.map((s) => [s.la, s.lo]), {
        color: activeJourney.color, weight: 3, opacity: 0.85, dashArray: '1 8', lineCap: 'round',
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
