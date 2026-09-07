import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  X, Flag, Globe, Users, Route, Play, Pause, SkipBack, Info, ArrowRightLeft, ChevronDown, DoorOpen,
} from 'lucide-react';
import AtlasSearch from './AtlasSearch';
import AtlasDistancePanel from './AtlasDistancePanel';
import { SCENES, formatScenePeriod } from '../../lib/scenes';
import { enterScene } from './enterScene';
import './AtlasControls.css';

const CHRONOLOGY_DISMISSED_KEY = 'miqra_atlas_chronology_note_v1';

// Floating chrome for the immersive /atlas route: exit (the route hides the
// normal drawer/topbar, so this is the only way back — same reasoning as
// Character Reels' own Exit chip), search, the territory / modern-country /
// tribal-allotment toggles, the journey picker with playback, the
// travel-time estimator, the 3D-scenes menu, and the one-time chronology
// disclaimer.
//
// The scenes menu is the only place in the app that lists every walkable
// reconstruction at once: elsewhere a scene is found by tapping the one pin
// that happens to have one, which means a visitor who never taps Capernaum
// never learns the scenes exist. It reads straight off the SCENES registry in
// lib/scenes.js, so a new scene appears here the moment its manifest is
// added — there is no second list to keep in step.
//
// All of it lives in one flex-column wrapper (.atlas-chrome) rather than each
// piece being independently top-positioned — the search dropdown, journey
// panel, distance panel, and chronology note all vary in height, and
// stacking them in normal flow means none of them can land on top of each
// other the way independently-`top:`-offset overlays eventually would.
export default function AtlasControls({
  atlas, journeys, showPolities, onTogglePolities, showCountries, onToggleCountries,
  showTribes, onToggleTribes, onSearchSelect,
  activeJourneyId, hasActiveJourney, onSelectJourney, playing, onTogglePlay, onResetJourney,
  distanceOrigin, distanceDestination, onSetDistanceOrigin, onSetDistanceDestination, elevations,
  collapsed, onExpand, year,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [journeysOpen, setJourneysOpen] = useState(false);
  const [distanceOpen, setDistanceOpen] = useState(false);
  const [scenesOpen, setScenesOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(
    () => typeof window === 'undefined' || !window.localStorage.getItem(CHRONOLOGY_DISMISSED_KEY),
  );

  const dismissNote = () => {
    setNoteOpen(false);
    try { window.localStorage.setItem(CHRONOLOGY_DISMISSED_KEY, '1'); } catch { /* private mode */ }
  };

  return (
    <div className="atlas-chrome">
      <div className="atlas-topbar">
        <button type="button" className="atlas-exit" onClick={() => navigate('/')} aria-label="Exit the atlas">
          <X size={16} /> Exit
        </button>

        {collapsed ? (
          <button type="button" className="atlas-chip atlas-expand-chip" onClick={onExpand} aria-label="Show map controls">
            <ChevronDown size={14} /> Controls
          </button>
        ) : (
          <>
            <AtlasSearch atlas={atlas} journeys={journeys} onSelectResult={onSearchSelect} />

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
                className={`atlas-chip${showCountries ? ' is-active' : ''}`}
                onClick={onToggleCountries}
                aria-pressed={showCountries}
              >
                <Globe size={14} /> Countries
              </button>
              <button
                type="button"
                className={`atlas-chip${showTribes ? ' is-active' : ''}`}
                onClick={onToggleTribes}
                aria-pressed={showTribes}
              >
                <Users size={14} /> Tribes
              </button>
              <button
                type="button"
                className={`atlas-chip${journeysOpen ? ' is-active' : ''}`}
                onClick={() => setJourneysOpen((v) => !v)}
                aria-expanded={journeysOpen}
              >
                <Route size={14} /> Journeys
              </button>
              <button
                type="button"
                className={`atlas-chip${scenesOpen ? ' is-active' : ''}`}
                onClick={() => setScenesOpen((v) => !v)}
                aria-expanded={scenesOpen}
              >
                <DoorOpen size={14} /> 3D Scenes
              </button>
              <button
                type="button"
                className={`atlas-chip${distanceOpen ? ' is-active' : ''}`}
                onClick={() => setDistanceOpen((v) => !v)}
                aria-expanded={distanceOpen}
              >
                <ArrowRightLeft size={14} /> Travel Time
              </button>
              <button type="button" className="atlas-chip atlas-chip-icon" onClick={() => setNoteOpen((v) => !v)} aria-label="About this map">
                <Info size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      {!collapsed && distanceOpen && (
        <AtlasDistancePanel
          atlas={atlas}
          origin={distanceOrigin}
          destination={distanceDestination}
          onSetOrigin={onSetDistanceOrigin}
          onSetDestination={onSetDistanceDestination}
          elevations={elevations}
        />
      )}

      {!collapsed && scenesOpen && (
        <div className="atlas-scene-panel">
          <p className="atlas-scene-panel-intro">
            Walkable reconstructions you can step inside from the map.
          </p>
          <div className="atlas-journey-list">
            {SCENES.map((scene) => (
              <button
                key={scene.slug}
                type="button"
                className="atlas-journey-item atlas-scene-item"
                onClick={() => {
                  setScenesOpen(false);
                  enterScene({ navigate, location, scene, year });
                }}
              >
                <span className="atlas-scene-item-title">{scene.title}</span>
                <span className="atlas-scene-item-period">{formatScenePeriod(scene)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!collapsed && journeysOpen && (
        <div className="atlas-journey-panel">
          <div className="atlas-journey-list">
            <button
              type="button"
              className={`atlas-journey-item${!hasActiveJourney ? ' is-active' : ''}`}
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
          {hasActiveJourney && (
            <div className="atlas-journey-transport">
              <button type="button" onClick={onResetJourney} aria-label="Restart journey"><SkipBack size={15} /></button>
              <button type="button" onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
            </div>
          )}
        </div>
      )}

      {!collapsed && noteOpen && (
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
    </div>
  );
}
