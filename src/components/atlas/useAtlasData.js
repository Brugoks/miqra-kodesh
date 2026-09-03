import { useEffect, useState } from 'react';
import { loadBibleAtlas, loadAtlasJourneys, loadAtlasPolities, loadAtlasElevations } from '../../lib/atlas';

const INITIAL_STATE = { status: 'loading', atlas: null, journeys: null, polities: null, elevations: null, error: null };

// Loads the atlas foundation data once per app session (the underlying
// promises are memoized in lib/atlas.js) and exposes it as render state.
// Journeys, polities, and elevations are small (~15KB combined) so they load
// alongside the core atlas rather than behind their own toggle — the route
// itself is already behind a lazy import (see App.jsx), which is where the
// real bundle-size win is.
export default function useAtlasData() {
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadBibleAtlas(), loadAtlasJourneys(), loadAtlasPolities(), loadAtlasElevations()])
      .then(([atlas, journeys, polities, elevations]) => {
        if (cancelled) return;
        setState({ status: 'ready', atlas, journeys, polities, elevations, error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ ...INITIAL_STATE, status: 'error', error });
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}
