import { createNavigator, rectHit, createCircleIndex } from './sceneNavigation';
import { BOUNDS, GROUND, BUILDINGS, COLUMNS, PALMS, CARGO } from './caesareaDimensions';

const R = 0.45;

export const BARRIERS = {
  edge: { id: 'waterfront-edge', label: 'The Edge of the Walkable District', body: 'The harbor is a route for ships, not for walking. This compact reconstruction ends at the quay and the district boundaries. Paul\u2019s journey continues by sea in Acts 27.', refs: ['Acts 27:1-6'] },
  palace: { id: 'palace-boundary', label: 'The Governor\u2019s Precinct', body: 'The facade is an illustrative boundary, not an accessible reconstruction of Paul\u2019s cell. Acts places him in Herod\u2019s praetorium but does not describe the room.', refs: ['Acts 23:35'] },
};

// One flat quay, bounded by the water on the west and the district edge
// elsewhere. `region` is constant here; scenes with stairs use it to tell
// their levels apart.
export function floorAt(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const inside = x >= BOUNDS.x0 + R && x <= BOUNDS.x1 - R && z >= BOUNDS.z0 + R && z <= BOUNDS.z1 - R;
  return inside ? { height: GROUND, region: 'waterfront' } : null;
}

const BUILDING_RECTS = BUILDINGS.map((b) => [b.x0, b.x1, b.z0, b.z1, b.id]);
const CARGO_RECTS = CARGO.map((c) => [c.x - c.w / 2, c.x + c.w / 2, c.z - c.d / 2, c.z + c.d / 2, 'cargo']);
const roundThings = createCircleIndex([
  ...COLUMNS.map((c) => ({ x: c.x, z: c.z, radius: c.radius + 0.2, id: 'column' })),
  ...PALMS.map((p) => ({ x: p.x, z: p.z, radius: 0.55, id: 'palm' })),
]);

export function blockerAt(x, z) {
  return rectHit(BUILDING_RECTS, x, z, R) || rectHit(CARGO_RECTS, x, z, R) || roundThings(x, z, R);
}

// The quay is a single level, so the step rule never fires here — but the
// substepping and wall-sliding it comes with are the reason a jog along the
// warehouses does not end up inside one.
const navigator = createNavigator({ floorAt, blockerAt, maxStep: 0.5, bodyRadius: R });

export const { stanceAt, move, groundPointAlongRay } = navigator;
