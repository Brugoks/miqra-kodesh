import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Flag, Route, Play, Pause, SkipBack, Info } from 'lucide-react';
import './AtlasControls.css';

const CHRONOLOGY_DISMISSED_KEY = 'miqra_atlas_chronology_note_v1';

// Floating top-bar chrome for the immersive /atlas route: exit (the route
// hides the normal drawer/topbar, so this is the only way back — same
// reasoning as Character Reels' own Exit chip), the territories toggle, the
// journey picker with playback, and the one-time chronology disclaimer.
export default function AtlasControls({
  journeys, showPolities, onTogglePolities,
  activeJourneyId, onSelectJourney, playing, onTogglePlay, onResetJourney,
}) {
  const navigate = useNavigate();
  const [journeysOpen, setJourneysOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(
    () => typeof window === 'undefined' || !window.localStorage.getItem(CHRONOLOGY_DISMISSED_KEY),
  );

  const dismissNote = () => {
    setNoteOpen(false);
    try { window.localStorage.setItem(CHRONOLOGY_DISMISSED_KEY, '1'); } catch { /* private mode */ }
  };

  return (
    <>
      <div className="atlas-topbar">
        <button type="button" className="atlas-exit" onClick={() => navigate('/')} aria-label="Exit the atlas">
          <X size={16} /> Exit
        </button>

        <div className="atlas-topbar-actions">
          <button
            type="button"
            className={`atlas-chip${showPolities ? ' is-active' : ''}`}
            onClick={onTogglePolities}
            aria-pressed={showPolities}
          >
            <Flag size={14} /> Territories
          </button>
          <button
            type="button"
            className={`atlas-chip${journeysOpen ? ' is-active' : ''}`}
            onClick={() => setJourneysOpen((v) => !v)}
            aria-expanded={journeysOpen}
          >
            <Route size={14} /> Journeys
          </button>
          <button type="button" className="atlas-chip atlas-chip-icon" onClick={() => setNoteOpen((v) => !v)} aria-label="About this map">
            <Info size={14} />
          </button>
        </div>
      </div>

      {journeysOpen && (
        <div className="atlas-journey-panel">
          <div className="atlas-journey-list">
            <button
              type="button"
              className={`atlas-journey-item${!activeJourneyId ? ' is-active' : ''}`}
              onClick={() => onSelectJourney(null)}
            >
              None
            </button>
            {journeys.map((j) => (
              <button
                key={j.s}
                type="button"
                className={`atlas-journey-item${activeJourneyId === j.s ? ' is-active' : ''}`}
                style={activeJourneyId === j.s ? { borderColor: j.color, color: j.color } : undefined}
                onClick={() => onSelectJourney(j.s)}
              >
                {j.n}
              </button>
            ))}
          </div>
          {activeJourneyId && (
            <div className="atlas-journey-transport">
              <button type="button" onClick={onResetJourney} aria-label="Restart journey"><SkipBack size={15} /></button>
              <button type="button" onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
            </div>
          )}
        </div>
      )}

      {noteOpen && (
        <div className="atlas-chronology-note">
          <p>
            Dates follow the traditional chronology already used across the Bible Wiki — a
            conservative, internally-consistent reading of Scripture's own genealogies and
            reign-lengths, not a claim to settled secular history. Territory outlines are coarse
            teaching shapes, not survey boundaries; ancient borders shifted constantly and are
            genuinely disputed among historians.
          </p>
          <button type="button" onClick={dismissNote}>Got it</button>
        </div>
      )}
    </>
  );
}
