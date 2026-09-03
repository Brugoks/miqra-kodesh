import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { travelEstimate } from '../../lib/atlas';
import AtlasPlacePicker from './AtlasPlacePicker';
import './AtlasDistancePanel.css';

// "What would it have felt like to travel from A to B?" — pick two places
// and see a rough day-count per travel mode. See travelEstimate in
// lib/atlas.js for the model (great-circle distance x a route-inefficiency
// allowance, divided by each mode's typical sustained daily pace) and its
// sanity-check against Jerusalem-Babylon.
export default function AtlasDistancePanel({ atlas, origin, destination, onSetOrigin, onSetDestination }) {
  const sameSlug = !!origin && !!destination && origin.slug === destination.slug;
  const estimate = useMemo(
    () => (origin && destination && !sameSlug ? travelEstimate(origin, destination) : null),
    [origin, destination, sameSlug],
  );

  return (
    <div className="atlas-distance-panel">
      <div className="atlas-distance-fields">
        <div className="atlas-distance-field">
          <span className="atlas-distance-label">From</span>
          <AtlasPlacePicker atlas={atlas} value={origin} onChange={onSetOrigin} placeholder="Choose a starting place…" />
        </div>
        <ArrowRight size={15} className="atlas-distance-arrow" />
        <div className="atlas-distance-field">
          <span className="atlas-distance-label">To</span>
          <AtlasPlacePicker atlas={atlas} value={destination} onChange={onSetDestination} placeholder="Choose a destination…" />
        </div>
      </div>

      {sameSlug && <p className="atlas-distance-note">Choose two different places to compare.</p>}

      {estimate && (
        <div className="atlas-distance-result">
          <p className="atlas-distance-miles">
            about {Math.round(estimate.routeMiles)} mi ({Math.round(estimate.routeMiles * 1.60934)} km) by common ancient routes
          </p>
          <ul className="atlas-distance-modes">
            {estimate.modes.map((mode) => (
              <li key={mode.key}>
                <span className="atlas-distance-mode-label">{mode.label}</span>
                <span className="atlas-distance-mode-days">{mode.days} day{mode.days === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ul>
          <p className="atlas-distance-caveat">
            Estimated from straight-line distance with an allowance for real terrain — a teaching
            approximation of the feel of the journey, not a claim to the exact road taken.
          </p>
        </div>
      )}
    </div>
  );
}
