import { useEffect, useRef, useState } from 'react';
import { visiblePlaces, eventsInWindow, politiesForYear } from '../../lib/atlas';
import './AtlasMap.css';

// Label-free relief basemap (see docs/ancient-atlas-plan.md §01) — the same
// CARTO layer PassageMap.jsx falls back to without a Thunderforest key, used
// here deliberately rather than the labeled 'atlas' layer: modern city names
// and borders are exactly what a map of the ANCIENT world should not show.
// Never proxied through an edge function — a single pan fires dozens of tile
// requests (see the comment block in PassageMap.jsx).
const BASE_TILE_URL = 'https://basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png';
const BASE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const TIER_COLOR = { 1: '#1e3a8a', 2: '#2e52be', 3: '#5c78ca', 4: '#93a5d6' };
const TIER_RADIUS = { 1: 8, 2: 6, 3: 4.5, 4: 3 };
const EVENT_COLOR = '#c2410c';

// A tap on the map always resolves to one of three selection shapes, all
// handled by the same onSelect callback and rendered by AtlasDetailSheet:
//   { kind: 'place', slug }                     — a place pin or a polity fill
//   { kind: 'event', slug }                     — an event marker
//   { kind: 'stop', stop, journeyName, color }   — a journey stop, which may
//                                                   have no wiki slug at all
//                                                   (e.g. Malta, Appii Forum)
export default function AtlasMap({
  atlas, year, era, polities, showPolities, activeJourney, journeyStopIndex, onSelect,
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

      // Draw order: territories under everything, then journeys, then place
      // pins, then events on top (the layer someone is most likely scrubbing for).
      groupsRef.current = {
        polities: L.layerGroup().addTo(map),
        journey: L.layerGroup().addTo(map),
        places: L.layerGroup().addTo(map),
        events: L.layerGroup().addTo(map),
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

  return <div ref={mapEl} className="atlas-map-canvas" role="application" aria-label="Map of the biblical world" />;
}
