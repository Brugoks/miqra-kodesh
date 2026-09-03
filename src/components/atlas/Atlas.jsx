import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import useAtlasData from './useAtlasData';
import AtlasMap from './AtlasMap';
import AtlasScrubber from './AtlasScrubber';
import AtlasDetailSheet from './AtlasDetailSheet';
import AtlasControls from './AtlasControls';
import {
  eraForYear, selectionCoords, eraAutoplayStep, loadBiblePlaces, placesForChapters,
  primaryPlace, traceForPerson, TRACE_MIN_EVENTS,
} from '../../lib/atlas';
import { loadBibleWikiFull, formatYear } from '../../lib/bibleWiki';
import './Atlas.css';

const JOURNEY_PLAYBACK_MS = 1400;

const prefersReducedMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Slower rather than disabled outright for prefers-reduced-motion, per
// docs/atlas-enhancements-plan.md Phase 2.
const ERA_TICK_MS = prefersReducedMotion ? 1800 : 700;

// The Ancient World Atlas: a pannable, zoomable, time-scrubbable map of the
// biblical world at /atlas. See docs/ancient-atlas-plan.md for the full
// design — this component is the Phase 1-4 shell that owns scrub position,
// selection, and journey/territory layer state; AtlasMap owns the Leaflet
// instance itself.
export default function Atlas() {
  const { status, atlas, journeys, polities, elevations } = useAtlasData();
  const [searchParams] = useSearchParams();

  const [year, setYear] = useState(-4003);
  const [selection, setSelection] = useState(null);
  const [showPolities, setShowPolities] = useState(false);
  const [activeJourneyId, setActiveJourneyId] = useState(null);
  const [journeyStopIndex, setJourneyStopIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [eraPlaying, setEraPlaying] = useState(false);
  const [flyTo, setFlyTo] = useState(null);
  const [distanceOrigin, setDistanceOrigin] = useState(null);
  const [distanceDestination, setDistanceDestination] = useState(null);
  const [pinnedPlaces, setPinnedPlaces] = useState(null);
  const [personTraceJourney, setPersonTraceJourney] = useState(null);

  // Character trace deep link: /atlas?person=paul_2479 — see traceForPerson
  // in lib/atlas.js and docs/atlas-enhancements-plan.md §6. Reuses the
  // existing journey machinery entirely (a trace is shaped exactly like a
  // journey: an ordered list of placed stops) rather than a parallel
  // rendering path — this synthetic journey object flows through the same
  // `activeJourney` used by curated journeys below, so AtlasMap's polyline,
  // stop markers, and fitBounds-on-selection all apply to it for free.
  // The Bible Wiki page that links here has already gated the button behind
  // loadTraceablePeople(), so a person with too little data to trace is not
  // expected here — this silently no-ops rather than showing an error state
  // for that edge case (e.g. a stale/hand-typed link).
  const resolvedPersonRef = useRef(null);
  useEffect(() => {
    const personSlug = searchParams.get('person');
    if (!atlas || !personSlug || resolvedPersonRef.current === personSlug) return;
    resolvedPersonRef.current = personSlug;
    let cancelled = false;
    loadBibleWikiFull().then(({ bySlug }) => {
      if (cancelled) return;
      const person = bySlug.get(personSlug);
      const trace = traceForPerson(atlas, personSlug, person?.y);
      if (trace.length < TRACE_MIN_EVENTS) return; // below the bar loadTraceablePeople() also gates on
      const stops = trace.map((event) => {
        const place = primaryPlace(atlas.placesBySlug, event);
        return place && {
          place: place.s,
          la: place.la,
          lo: place.lo,
          ref: event.fv || null,
          note: [formatYear(event.y), event.n].filter(Boolean).join(' — '),
        };
      }).filter(Boolean);
      if (stops.length < 2) return; // not enough resolvable stops to draw a route
      setPersonTraceJourney({
        s: `trace-${personSlug}`,
        // "Places associated with" rather than "X's route" — traces inherit
        // the event-place resolution's ~81.5% accuracy, so this is
        // deliberately not framed as a claim to X's literal itinerary.
        n: `Places associated with ${person?.name || personSlug} in Scripture`,
        y: [trace[0].y, trace[trace.length - 1].y],
        era: trace[0].era,
        color: '#7c3aed',
        ref: '',
        stops,
      });
      setYear(trace[0].y);
      setJourneyStopIndex(stops.length - 1); // draw the whole trace immediately, not just its first stop
    });
    return () => { cancelled = true; };
  }, [atlas, searchParams]);

  // Reading-plan/sermon deep link: /atlas?chapters=ACT.17,ACT.18 pins every
  // place those chapters mention and frames the map around them — see
  // placesForChapters in lib/atlas.js and docs/atlas-enhancements-plan.md §5.
  // Guarded by a ref (not just the `atlas` dependency) so this resolves
  // exactly once per distinct `chapters` value rather than re-running every
  // time `atlas` identity changes for unrelated reasons.
  const resolvedChaptersRef = useRef(null);
  useEffect(() => {
    const chaptersParam = searchParams.get('chapters');
    if (!atlas || !chaptersParam || resolvedChaptersRef.current === chaptersParam) return;
    resolvedChaptersRef.current = chaptersParam;
    const chapterIds = chaptersParam.split(',').map((s) => s.trim()).filter(Boolean);
    if (!chapterIds.length) return;
    let cancelled = false;
    loadBiblePlaces().then((biblePlaces) => {
      if (cancelled) return;
      const slugs = placesForChapters(atlas, biblePlaces, chapterIds);
      const places = slugs.map((s) => atlas.placesBySlug.get(s)).filter(Boolean);
      if (places.length) setPinnedPlaces(places);
    });
    return () => { cancelled = true; };
  }, [atlas, searchParams]);

  const era = useMemo(() => (atlas ? eraForYear(atlas.eras, year) : null), [atlas, year]);
  // A person trace (if one was deep-linked in) takes over the same slot a
  // curated journey selection would occupy — see the effect above.
  const activeJourney = useMemo(
    () => personTraceJourney || (activeJourneyId ? journeys?.find((j) => j.s === activeJourneyId) || null : null),
    [journeys, activeJourneyId, personTraceJourney],
  );
  const politiesBySlug = useMemo(
    () => (polities ? new Map(polities.map((f) => [f.properties.s, f])) : null),
    [polities],
  );
  // The "you tapped this" glow — wherever `selection` currently points to.
  const highlight = useMemo(() => selectionCoords(selection, atlas), [selection, atlas]);
  const originDestination = useMemo(
    () => (distanceOrigin && distanceDestination ? { origin: distanceOrigin, destination: distanceDestination } : null),
    [distanceOrigin, distanceDestination],
  );

  // Selecting a journey: jump the scrubber to its start year and reset playback.
  // Also clears any active person trace — the journey picker's "None" and
  // curated-journey buttons are the way out of a deep-linked trace too.
  const handleSelectJourney = (journeyId) => {
    setPersonTraceJourney(null);
    resolvedPersonRef.current = null;
    setActiveJourneyId(journeyId);
    setJourneyStopIndex(0);
    setPlaying(false);
    if (journeyId) {
      const journey = journeys.find((j) => j.s === journeyId);
      if (journey) setYear(journey.y[0]);
    }
  };

  const handleResetJourney = () => {
    setJourneyStopIndex(0);
    setPlaying(false);
  };

  // AtlasSearch hands back a place/event/journey result — see searchAtlas in
  // lib/atlas.js for the shape. Places and events jump the map (and, for
  // events, the scrubber year so the marker actually falls in the current
  // window); journeys reuse the existing journey-selection path, which
  // already jumps the year and lets AtlasMap's own fitBounds effect frame it.
  const handleSearchSelect = (result) => {
    if (result.kind === 'journey') {
      handleSelectJourney(result.slug);
      return;
    }
    if (result.kind === 'event') setYear(result.year);
    setSelection({ kind: result.kind, slug: result.slug });
    setFlyTo({ la: result.la, lo: result.lo, minZoom: result.minZoom });
  };

  const atJourneyEnd = !!activeJourney && journeyStopIndex >= activeJourney.stops.length - 1;
  // Reaching the end doesn't setState from inside the advance effect below
  // (react-hooks/set-state-in-effect) — instead "playing" just stops having
  // any effect once atJourneyEnd is true, and pressing play again restarts
  // from the first stop.
  const isJourneyPlaying = playing && !atJourneyEnd;
  const handleToggleJourneyPlay = () => {
    if (atJourneyEnd) {
      setJourneyStopIndex(0);
      setPlaying(true);
    } else {
      setPlaying((v) => !v);
    }
  };

  // Advances one stop at a time while playing.
  useEffect(() => {
    if (!isJourneyPlaying) return undefined;
    const timer = setTimeout(() => setJourneyStopIndex((i) => i + 1), JOURNEY_PLAYBACK_MS);
    return () => clearTimeout(timer);
  }, [isJourneyPlaying, journeyStopIndex]);

  // Era autoplay: same derived-state shape as journey playback above, so
  // reaching the end never calls setState from inside the advance effect
  // itself (react-hooks/set-state-in-effect). `atlas` is still null while
  // status !== 'ready' (this component returns early below, but the hooks
  // above that early return must still run unconditionally).
  const atEraEnd = !!atlas && year >= atlas.eras[atlas.eras.length - 1].to;
  const isEraPlaying = eraPlaying && !atEraEnd;
  const handleToggleEraPlay = () => {
    if (!atlas) return;
    if (atEraEnd) {
      setYear(atlas.eras[0].from);
      setEraPlaying(true);
    } else {
      setEraPlaying((v) => !v);
    }
  };

  useEffect(() => {
    if (!isEraPlaying || !atlas) return undefined;
    const maxYear = atlas.eras[atlas.eras.length - 1].to;
    const timer = setTimeout(() => setYear((y) => Math.min(maxYear, y + eraAutoplayStep(era))), ERA_TICK_MS);
    return () => clearTimeout(timer);
  }, [isEraPlaying, year, era, atlas]);

  if (status === 'error') {
    return (
      <div className="atlas-page atlas-page--message">
        <p>Could not load the atlas. Check your connection and try again.</p>
      </div>
    );
  }

  if (status !== 'ready') {
    return (
      <div className="atlas-page atlas-page--message">
        <Loader2 size={22} className="atlas-spin" />
        <p>Loading the ancient world…</p>
      </div>
    );
  }

  return (
    <div className="atlas-page">
      <AtlasMap
        atlas={atlas}
        year={year}
        era={era}
        polities={polities}
        showPolities={showPolities}
        activeJourney={activeJourney}
        journeyStopIndex={journeyStopIndex}
        onSelect={setSelection}
        flyTo={flyTo}
        highlight={highlight}
        originDestination={originDestination}
        pinnedPlaces={pinnedPlaces}
      />

      <AtlasControls
        atlas={atlas}
        journeys={journeys}
        showPolities={showPolities}
        onTogglePolities={() => setShowPolities((v) => !v)}
        onSearchSelect={handleSearchSelect}
        activeJourneyId={activeJourneyId}
        hasActiveJourney={!!activeJourney}
        onSelectJourney={handleSelectJourney}
        playing={isJourneyPlaying}
        onTogglePlay={handleToggleJourneyPlay}
        onResetJourney={handleResetJourney}
        distanceOrigin={distanceOrigin}
        distanceDestination={distanceDestination}
        onSetDistanceOrigin={setDistanceOrigin}
        onSetDistanceDestination={setDistanceDestination}
        elevations={elevations}
      />

      <AtlasDetailSheet
        selection={selection}
        atlas={atlas}
        politiesBySlug={politiesBySlug}
        elevations={elevations}
        onClose={() => setSelection(null)}
      />

      <AtlasScrubber
        eras={atlas.eras}
        year={year}
        era={era}
        onYearChange={setYear}
        playing={isEraPlaying}
        onTogglePlay={handleToggleEraPlay}
      />
    </div>
  );
}
