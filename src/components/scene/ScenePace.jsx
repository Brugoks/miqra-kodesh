import { PACES, paceSpeedAt, formatSpeed } from './sceneGaits';
import { travelSpeedFor } from './sceneModules';

const PACE_LABELS = { natural: 'Natural', brisk: 'Brisk', travel: 'Travel' };

// The walk-pace row of the scene's settings: three paces, each with the speed it
// actually gives in the view the visitor is in. A component of its own so the
// label arithmetic is not part of the route's render (which React's compiler
// keeps memoized by hand elsewhere), and so the one honest caveat — travel is
// capped at the figure's jog seen from behind — sits beside the number it
// qualifies.
export default function ScenePaceRow({ pace, onPace, slug, third, canSwitchView }) {
  const travelSpeed = travelSpeedFor(slug);
  return (
    <div className="scene-settings-row">
      <span className="scene-settings-label">Walk Pace</span>
      <div className="scene-settings-options">
        {PACES.map((id) => (
          <button
            key={id}
            type="button"
            className={`scene-settings-opt-btn scene-settings-opt-btn--stacked${pace === id ? ' scene-settings-opt-btn--active' : ''}`}
            aria-pressed={pace === id}
            onClick={() => onPace(id)}
          >
            <span>{PACE_LABELS[id]}</span>
            <span className="scene-settings-opt-speed">{formatSpeed(paceSpeedAt(id, travelSpeed, third))}</span>
          </button>
        ))}
      </div>
      {third && canSwitchView && (
        <p className="scene-settings-note">
          Seen from behind, travel is capped at the figure’s jog. Press V for first person to go faster.
        </p>
      )}
    </div>
  );
}
