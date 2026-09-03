import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, MapPin, Milestone, ExternalLink, Swords } from 'lucide-react';
import { formatYear } from '../../lib/bibleWiki';
import { passageIdToDisplay } from '../../lib/scripture';
import { primaryPlace, elevationFor, describeElevation } from '../../lib/atlas';
import { wikiImageUrl } from '../../lib/wikiImageUrls';
import './AtlasDetailSheet.css';

// Generated place art (see the PLACE_STYLE prompt fix in bibleWiki.js) for
// whichever place the sheet is currently showing. Only wiki-backed places
// (`place.w`) have art; the other ~1,100 map-only places degrade to the
// text-only sheet with no broken-image frame. `key={place.s}` on the call
// site resets `failed` when the selection changes to a different place.
function AtlasSheetThumb({ place }) {
  const [failed, setFailed] = useState(false);
  if (!place?.w || failed) return null;
  const thumb = wikiImageUrl(`_default/thumbs/${place.s}.jpg`);
  if (!thumb) return null;
  return (
    <img
      className="atlas-sheet-thumb"
      src={thumb}
      alt={place.n}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

// Bottom sheet for whatever was last tapped on the map — a place pin, an
// event marker, a polity fill, or a journey stop. All three selection shapes
// funnel through here (see AtlasMap.jsx's onSelect contract) so there is one
// place that decides what "open the wiki page" means for each.
export default function AtlasDetailSheet({ selection, atlas, politiesBySlug, elevations, onClose }) {
  const navigate = useNavigate();
  if (!selection) return null;

  const openWiki = (slug) => navigate(`/wiki/${slug}`);

  let body = null;

  if (selection.kind === 'place') {
    const place = atlas.placesBySlug.get(selection.slug);
    if (!place) return null;
    const elevationText = describeElevation(elevationFor(elevations, place.s));
    body = (
      <>
        <AtlasSheetThumb key={place.s} place={place} />
        <div className="atlas-sheet-eyebrow"><MapPin size={13} /> Place</div>
        <h3 className="atlas-sheet-title">{place.n}</h3>
        <p className="atlas-sheet-meta">
          Mentioned in {place.cc} chapter{place.cc === 1 ? '' : 's'} of Scripture
        </p>
        {elevationText && <p className="atlas-sheet-meta">{elevationText}</p>}
        {place.w ? (
          <button type="button" className="atlas-sheet-cta" onClick={() => openWiki(place.s)}>
            Open wiki page <ExternalLink size={14} />
          </button>
        ) : (
          <p className="atlas-sheet-note">Not yet a full Bible Wiki entry — geocoded from openbible.info.</p>
        )}
      </>
    );
  }

  if (selection.kind === 'event') {
    const event = atlas.eventsBySlug.get(selection.slug);
    if (!event) return null;
    const attName = event.att ? politiesBySlug?.get(event.att)?.properties?.n || event.att : null;
    const defName = event.def ? politiesBySlug?.get(event.def)?.properties?.n || event.def : null;
    const placeNames = (event.pl || []).map((s) => atlas.placesBySlug.get(s)?.n).filter(Boolean);
    const eventPlace = primaryPlace(atlas.placesBySlug, event);
    body = (
      <>
        <AtlasSheetThumb key={eventPlace?.s} place={eventPlace} />
        <div className="atlas-sheet-eyebrow"><Milestone size={13} /> {formatYear(event.y)}</div>
        <h3 className="atlas-sheet-title">{event.n}</h3>
        {event.fv && <p className="atlas-sheet-meta">{passageIdToDisplay(event.fv)}</p>}
        {placeNames.length > 0 && (
          <p className="atlas-sheet-meta"><MapPin size={13} /> {placeNames.join(', ')}</p>
        )}
        {event.k === 'battle' && attName && defName && (
          <p className="atlas-sheet-battle"><Swords size={13} /> {attName} against {defName}</p>
        )}
        <button type="button" className="atlas-sheet-cta" onClick={() => openWiki(event.s)}>
          Open wiki page <ExternalLink size={14} />
        </button>
      </>
    );
  }

  if (selection.kind === 'stop') {
    const { stop, journeyName, color } = selection;
    body = (
      <>
        <div className="atlas-sheet-eyebrow" style={{ color }}><MapPin size={13} /> {journeyName}</div>
        <h3 className="atlas-sheet-title">{stop.n || passageIdToDisplay(stop.ref)}</h3>
        <p className="atlas-sheet-meta">{passageIdToDisplay(stop.ref)}</p>
        {stop.note && <p className="atlas-sheet-note">{stop.note}</p>}
        {stop.place && (
          <button type="button" className="atlas-sheet-cta" onClick={() => openWiki(stop.place)}>
            Open wiki page <ExternalLink size={14} />
          </button>
        )}
      </>
    );
  }

  if (!body) return null;

  return (
    <div className="atlas-sheet" role="dialog" aria-modal="false" aria-label="Map selection details">
      <button type="button" className="atlas-sheet-close" onClick={onClose} aria-label="Close">
        <X size={16} />
      </button>
      {body}
    </div>
  );
}
