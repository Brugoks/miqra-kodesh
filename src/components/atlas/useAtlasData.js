import { useEffect, useState } from 'react';
import { loadBibleAtlas, loadAtlasJourneys, loadAtlasPolities } from '../../lib/atlas';

// Loads the atlas foundation data once per app session (the underlying
// promises are memoized in lib/atlas.js) and exposes it as render state.
// Journeys and polities are small (~10KB combined) so they load alongside
// the core atlas rather than behind their own toggle — the route itself is
// already behind a lazy import (see App.jsx), which is where the real
// bundle-size win is.
export default function useAtlasData() {
  const [state, setState] = useState({ status: 'loading', atlas: null, journeys: null, polities: null, error: null });

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadBibleAtlas(), loadAtlasJourneys(), loadAtlasPolities()])
      .then(([atlas, journeys, polities]) => {
        if (cancelled) return;
        setState({ status: 'ready', atlas, journeys, polities, error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ status: 'error', atlas: null, journeys: null, polities: null, error });
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}
