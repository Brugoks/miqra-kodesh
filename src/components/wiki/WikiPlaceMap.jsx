import { useEffect, useRef, useState } from 'react';
import { MapPin, Satellite, ExternalLink } from 'lucide-react';
import { placeMapUrl } from '../../lib/googleMaps';

// Map for a place entry page — the foundation data already carries lat/lon,
// and Leaflet is already a dependency (PassageMap). Loaded lazily so the wiki
// route stays light for people pages.
export default function WikiPlaceMap({ entry }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(entry?.la) || !Number.isFinite(entry?.lo)) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const [{ default: L }] = await Promise.all([
          import('leaflet'),
          import('leaflet/dist/leaflet.css'),
        ]);
        if (cancelled || !mapEl.current || mapRef.current) return;
        const map = L.map(mapEl.current, { scrollWheelZoom: false }).setView([entry.la, entry.lo], 7);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 12,
        }).addTo(map);
        L.circleMarker([entry.la, entry.lo], {
          radius: 8, color: '#b8860b', fillColor: '#f0c545', fillOpacity: 0.9, weight: 2,
        }).addTo(map).bindPopup(entry.name);
        mapRef.current = map;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [entry]);

  if (!Number.isFinite(entry?.la) || !Number.isFinite(entry?.lo)) return null;

  // The map above shows where it is; this shows what is there now.
  const todayUrl = placeMapUrl(entry);

  return (
    <section className="wpm-section">
      <h2 className="bw-section-title"><MapPin size={15} /> Where it is</h2>
      {!failed && <div className="wpm-map" ref={mapEl} />}
      {todayUrl && (
        <a className="wpm-maplink" href={todayUrl} target="_blank" rel="noopener noreferrer">
          <Satellite size={13} /> See {entry.n} today
          <ExternalLink size={12} />
        </a>
      )}
    </section>
  );
}
