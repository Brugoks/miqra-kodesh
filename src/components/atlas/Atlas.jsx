import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import useAtlasData from './useAtlasData';
import AtlasMap from './AtlasMap';
import AtlasScrubber from './AtlasScrubber';
import AtlasDetailSheet from './AtlasDetailSheet';
import AtlasControls from './AtlasControls';
import { eraForYear } from '../../lib/atlas';
import './Atlas.css';

const JOURNEY_PLAYBACK_MS = 1400;

// The Ancient World Atlas: a pannable, zoomable, time-scrubbable map of the
// biblical world at /atlas. See docs/ancient-atlas-plan.md for the full
// design — this component is the Phase 1-4 shell that owns scrub position,
// selection, and journey/territory layer state; AtlasMap owns the Leaflet
// instance itself.
export default function Atlas() {
  const { status, atlas, journeys, polities } = useAtlasData();

  const [year, setYear] = useState(-4003);
  const [selection, setSelection] = useState(null);
  const [showPolities, setShowPolities] = useState(false);
  const [activeJourneyId, setActiveJourneyId] = useState(null);
  const [journeyStopIndex, setJourneyStopIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const era = useMemo(() => (atlas ? eraForYear(atlas.eras, year) : null), [atlas, year]);
  const activeJourney = useMemo(
    () => (activeJourneyId ? journeys?.find((j) => j.s === activeJourneyId) || null : null),
    [journeys, activeJourneyId],
  );
  const politiesBySlug = useMemo(
    () => (polities ? new Map(polities.map((f) => [f.properties.s, f])) : null),
    [polities],
  );

  // Selecting a journey: jump the scrubber to its start year and reset playback.
  const handleSelectJourney = (journeyId) => {
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
      />

      <AtlasControls
        journeys={journeys}
        showPolities={showPolities}
        onTogglePolities={() => setShowPolities((v) => !v)}
        activeJourneyId={activeJourneyId}
        onSelectJourney={handleSelectJourney}
        playing={isJourneyPlaying}
        onTogglePlay={handleToggleJourneyPlay}
        onResetJourney={handleResetJourney}
      />

      <AtlasDetailSheet
        selection={selection}
        atlas={atlas}
        politiesBySlug={politiesBySlug}
        onClose={() => setSelection(null)}
      />

      <AtlasScrubber eras={atlas.eras} year={year} era={era} onYearChange={setYear} />
    </div>
  );
}
