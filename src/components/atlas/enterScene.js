import { scenePath } from '../../lib/scenes';

// Entering a walkable scene from the atlas is two navigations, not one, and
// both are load-bearing:
//
//   1. A `replace` back onto the atlas URL itself, stamping the map state the
//      visitor is leaving (`atlasSavedState`) onto the history entry they will
//      come back to. Browser Back from the scene lands on that entry, and
//      Atlas.jsx reads the year and place back off it.
//   2. The push into /scene/:slug, carrying the same thing as
//      `sceneReturnContext` so the scene's own Exit button can navigate back
//      with it rather than dropping the visitor at a reset map.
//
// Two callers — the detail sheet's "Step inside" (which already has a place
// selected) and the 3D-scenes menu in AtlasControls (which does not, and falls
// back to the scene's own place) — so this lives apart from either.
export function enterScene({ navigate, location, scene, year, placeSlug }) {
  if (!scene) return;
  const returnPlace = placeSlug || scene.placeSlug;
  navigate(`${location.pathname}${location.search}`, {
    replace: true,
    state: {
      ...location.state,
      atlasSavedState: { year, placeSlug: returnPlace },
    },
  });
  navigate(scenePath(scene), {
    state: {
      sceneReturnContext: { source: 'atlas', year, placeSlug: returnPlace },
    },
  });
}

export default enterScene;
