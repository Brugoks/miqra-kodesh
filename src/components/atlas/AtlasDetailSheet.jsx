import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, MapPin, Milestone, ExternalLink, Swords, HelpCircle, BookOpen, DoorOpen, Satellite } from 'lucide-react';
import { formatYear } from '../../lib/bibleWiki';
import { passageIdToDisplay } from '../../lib/scripture';
import { primaryPlace, elevationFor, describeElevation, isInferredPlacement } from '../../lib/atlas';
import { wikiImageUrl } from '../../lib/wikiImageUrls';
import { sceneForPlace, scenePath } from '../../lib/scenes';
import { placeMapUrl } from '../../lib/googleMaps';
import './AtlasDetailSheet.css';

// Generated place art (see the PLACE_STYLE prompt fix in bibleWiki.js) for
// whichever place the sheet is currently showing. The full image is used
// because this artwork spans the width of the sheet; the 128px thumbnail is
// only a fallback when an older entry has not received a full-size asset.
// Only wiki-backed places (`place.w`) have art; the other ~1,100 map-only
// places degrade to the text-only sheet with no broken-image frame.
// `key={place.s}` on the call site resets the fallback state when the
// selection changes to a different place.
function AtlasSheetImage({ place }) {
  const [source, setSource] = useState('full');
  if (!place?.w || source === 'failed') return null;
  const full = wikiImageUrl(`_default/${place.s}.jpg`);
  const thumb = wikiImageUrl(`_default/thumbs/${place.s}.jpg`);
  const src = source === 'full' ? full : thumb;
  if (!src) return null;
  return (
    <img
      className="atlas-sheet-thumb"
      src={src}
      alt={place.n}
      loading="lazy"
      decoding="async"
      onError={() => setSource((current) => (current === 'full' && thumb ? 'thumb' : 'failed'))}
    />
  );
}

// Every atlas place carries real coordinates, so every one of them can answer
// "what is there now" — a satellite view rather than Street View, because
// imagery exists everywhere on earth and panoramas do not.
function TodayLink({ place }) {
  const url = placeMapUrl(place);
  if (!url) return null;
  return (
    <a className="atlas-sheet-maplink" href={url} target="_blank" rel="noopener noreferrer">
      <Satellite size={13} /> See {place.n} today
      <ExternalLink size={12} />
    </a>
  );
}

// Opens the passage in the global BibleLookup reader — the same event the
// wiki, studies, highlights and reading-plan chips all dispatch. BibleLookup
// is mounted outside <Layout> in App.jsx, so it renders over the immersive
// /atlas route too and this needs no plumbing of its own.
const openScripture = (ref) =>
  window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref } }));

// A tappable scripture reference. Returns null for a ref whose book code
// passageIdToDisplay doesn't recognise, so a malformed journey stop degrades
// to no line rather than an empty button.
function ScriptureRef({ passageId }) {
  const display = passageId ? passageIdToDisplay(passageId) : null;
  if (!display) return null;
  return (
    <button type="button" className="atlas-sheet-ref" onClick={() => openScripture(display)}>
      <BookOpen size={13} /> {display}
    </button>
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
    // A handful of places have a walkable 3D reconstruction behind them. Where
    // one exists it outranks the wiki link — it is the thing nobody expects to
    // find on a map pin — so the wiki button steps down to a ghost button.
    const scene = sceneForPlace(place.s);
    body = (
      <>
        <AtlasSheetImage key={place.s} place={place} />
        <div className="atlas-sheet-eyebrow"><MapPin size={13} /> Place</div>
        <h3 className="atlas-sheet-title">{place.n}</h3>
        <p className="atlas-sheet-meta">
          Mentioned in {place.cc} chapter{place.cc === 1 ? '' : 's'} of Scripture
        </p>
        {elevationText && <p className="atlas-sheet-meta">{elevationText}</p>}
        {scene && (
          <button
            type="button"
            className="atlas-sheet-cta atlas-sheet-cta--scene"
            onClick={() => navigate(scenePath(scene))}
          >
            <DoorOpen size={15} /> Step inside {scene.title}
          </button>
        )}
        {place.w ? (
          <button
            type="button"
            className={`atlas-sheet-cta${scene ? ' atlas-sheet-cta--ghost' : ''}`}
            onClick={() => openWiki(place.s)}
          >
            Open wiki page <ExternalLink size={14} />
          </button>
        ) : (
          <p className="atlas-sheet-note">Not yet a full Bible Wiki entry — geocoded from openbible.info.</p>
        )}
        <TodayLink place={place} />
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
        <AtlasSheetImage key={eventPlace?.s} place={eventPlace} />
        <div className="atlas-sheet-eyebrow"><Milestone size={13} /> {formatYear(event.y)}</div>
        <h3 className="atlas-sheet-title">{event.n}</h3>
        <ScriptureRef passageId={event.fv} />
        {placeNames.length > 0 && (
          <p className="atlas-sheet-meta"><MapPin size={13} /> {placeNames.join(', ')}</p>
        )}
        {event.k === 'battle' && attName && defName && (
          <p className="atlas-sheet-battle"><Swords size={13} /> {attName} against {defName}</p>
        )}
        {isInferredPlacement(event) && (
          <p className="atlas-sheet-inferred">
            <HelpCircle size={13} /> Location inferred from the chapters this event spans, not
            named in the text.
          </p>
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
        <ScriptureRef passageId={stop.ref} />
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
