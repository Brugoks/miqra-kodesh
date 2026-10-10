import { createNavigator, rectHit, createCircleIndex } from './sceneNavigation';
import { BOUNDS, CAVE_WALLS, ROCKS, SITES, groundAt, pathDistance } from './sinaiDimensions';
const R = 0.4;
export const BARRIERS = {
  edge: {
    id: 'sinai-edge',
    label: 'Beyond the Mountain Paths',
    body: 'This walk connects settings associated with Sinai and Horeb. Their arrangement and distances are interpretive. The biblical mountain has no universally accepted modern identification.',
    refs: ['Exodus 3:1', 'Exodus 19:1-2', '1 Kings 19:8'],
  },
};
export function enclosureAt(x, z, height = SITES.cave.height) {
  if (
    ![x, z, height].every(Number.isFinite) ||
    x < 41.5 ||
    x > 52.5 ||
    z < -102 ||
    z > -90 ||
    Math.abs(height - SITES.cave.height) > 1
  )
    return 0;
  return Math.min(1, (-90 - z) / 4) * 0.85;
}
export function floorAt(x, z) {
  if (
    ![x, z].every(Number.isFinite) ||
    x < BOUNDS.x0 + R ||
    x > BOUNDS.x1 - R ||
    z < BOUNDS.z0 + R ||
    z > BOUNDS.z1 - R
  )
    return null;
  return {
    height: groundAt(x, z),
    region:
      enclosureAt(x, z) > 0
        ? 'cave'
        : z < -15
          ? 'mountain'
          : pathDistance(x, z) < 3.3
            ? 'road'
            : 'wilderness',
  };
}
const walls = CAVE_WALLS.map((b) => [b.x0, b.x1, b.z0, b.z1, b.id]);
const rocks = createCircleIndex(ROCKS.map((r, i) => ({ ...r, id: `sinai-rock-${i}` })));
// Episode-dependent props are queried through the builder's humans clearance
// contract; this module contains only the landscape that exists in every era.
export const blockerAt = (x, z) => rectHit(walls, x, z, R) || rocks(x, z, R);
export const { stanceAt, move, groundPointAlongRay } = createNavigator({
  floorAt,
  blockerAt,
  bodyRadius: R,
  maxStep: 0.48,
});
