import { useEffect, useRef, useState } from 'react';
import { X, MapPin, Loader2 } from 'lucide-react';
import './PassageMap.css';
import { refToPassageIds } from '../lib/scripture';

// Interactive map of places mentioned in the looked-up passage's chapter(s).
// Data: openbible.info geocoded places (CC-BY), bundled at build time by
// scripts/build-bible-places.js. Tiles: CARTO's label-free basemap. Biblical
// places sit in the modern Middle East, where OpenStreetMap's standard tiles
// bake Hebrew/Arabic place labels into the image — unreadable for most readers
// here. A label-free basemap sidesteps that entirely: our own pins carry the
// English names. Leaflet and the places JSON are both loaded lazily so the
// main bundle stays untouched.

// Chapter keys ('JHN.3') covered by a reference.
function chapterKeys(reference) {
  const ids = refToPassageIds(reference || '');
  const keys = new Set();
  for (const id of ids) {
    for (const part of id.split('-')) {
      const segments = part.split('.');
      if (segments.length >= 2) keys.add(`${segments[0]}.${segments[1]}`);
    }
  }
  return keys;
}

export default function PassageMap({ reference, onClose, onOpenPlace }) {
  const onOpenPlaceRef = useRef(null);
  useEffect(() => { onOpenPlaceRef.current = onOpenPlace; }, [onOpenPlace]);
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'empty' | 'error'
  const [placeCount, setPlaceCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function build() {
      try {
        const [{ default: L }, placesModule] = await Promise.all([
          import('leaflet'),
          import('../assets/bible-places.json'),
          import('leaflet/dist/leaflet.css'),
        ]);
        if (cancelled || !mapEl.current) return;

        const keys = chapterKeys(reference);
        const matches = placesModule.default.filter((place) =>
          place.p.some((chapter) => keys.has(chapter))
        );
        if (!matches.length) {
          setStatus('empty');
          return;
        }

        const map = L.map(mapEl.current, { scrollWheelZoom: true });
        mapRef.current = map;
        // {r} + detectRetina serves @2x tiles on phone screens for crisp coastlines.
        L.tileLayer('https://basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
          maxZoom: 12,
          detectRetina: true,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        }).addTo(map);

        const bounds = [];
        for (const place of matches) {
          bounds.push([place.la, place.lo]);
          const marker = L.circleMarker([place.la, place.lo], {
            radius: 7,
            color: '#1e3a8a',
            weight: 2,
            fillColor: '#3b82f6',
            fillOpacity: 0.75,
          })
            .addTo(map)
            .bindTooltip(place.n);
          if (onOpenPlaceRef.current) {
            // Popup content is a real DOM node so the wiki link gets a proper
            // click handler instead of injected-HTML event delegation.
            const content = document.createElement('div');
            content.className = 'passage-map-popup';
            const title = document.createElement('strong');
            title.textContent = place.n;
            const link = document.createElement('button');
            link.type = 'button';
            link.className = 'passage-map-wiki-link';
            link.textContent = 'Open wiki page →';
            link.addEventListener('click', () => onOpenPlaceRef.current?.(place.n));
            content.append(title, link);
            marker.bindPopup(content);
          } else {
            marker.bindPopup(`<strong>${place.n}</strong>`);
          }
        }
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 9 });

        setPlaceCount(matches.length);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    build();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [reference]);

  return (
    <div className="passage-map-overlay" role="presentation" onClick={onClose}>
      <div className="passage-map-dialog" role="dialog" aria-modal="true" aria-label="Passage map" onClick={(e) => e.stopPropagation()}>
        <div className="passage-map-header">
          <span className="passage-map-title">
            <MapPin size={15} /> Places in {reference}
            {status === 'ready' && <span className="passage-map-count">{placeCount} location{placeCount === 1 ? '' : 's'}</span>}
          </span>
          <button type="button" className="passage-map-close" onClick={onClose} aria-label="Close map">
            <X size={18} />
          </button>
        </div>
        {status === 'loading' && (
          <div className="passage-map-status"><Loader2 size={18} className="bl-spin" /> Loading map…</div>
        )}
        {status === 'empty' && (
          <div className="passage-map-status">No mapped places found for this passage.</div>
        )}
        {status === 'error' && (
          <div className="passage-map-status">Could not load the map. Check your connection and try again.</div>
        )}
        <div ref={mapEl} className="passage-map-canvas" style={{ display: status === 'ready' || status === 'loading' ? 'block' : 'none' }} />
        <p className="passage-map-credit">Place data: openbible.info (CC-BY) · Map: CARTO / OpenStreetMap</p>
      </div>
    </div>
  );
}
