import { createNavigator, rectHit, createCircleIndex } from './sceneNavigation';
import {
  BOUNDS,
  HOUSES,
  WALLS,
  OLIVES,
  WELL,
  MANGER,
  SHELTER,
  groundAt,
  pathDistance,
} from './bethlehemDimensions';
const R = 0.4;
export const BARRIERS = {
  edge: {
    id: 'bethlehem-edge',
    label: 'Beyond the Village',
    body: 'The surrounding hills continue beyond this walkable reconstruction. The village plan and the location of the shepherds’ field are illustrative.',
    refs: ['Luke 2:4-8'],
  },
};
export function inShelter(x, z) {
  return x > SHELTER.x0 && x < SHELTER.x1 && z > SHELTER.z0 && z < SHELTER.z1;
}
// Fade outdoor ambience as the listener passes under the shelter roof.
export function enclosureAt(x, z, height = SHELTER.level) {
  if (!inShelter(x, z) || !Number.isFinite(height) || Math.abs(height - SHELTER.level) > 1) return 0;
  return Math.min(1, (SHELTER.z1 - z) / 3) * 0.8;
}
export function floorAt(x, z) {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    x < BOUNDS.x0 + R ||
    x > BOUNDS.x1 - R ||
    z < BOUNDS.z0 + R ||
    z > BOUNDS.z1 - R
  )
    return null;
  return {
    height: groundAt(x, z),
    region: inShelter(x, z) ? 'shelter' : pathDistance(x, z) < 3.5 ? 'road' : 'field',
  };
}
const rectangles = [...HOUSES, ...WALLS].map((b) => [b.x0, b.x1, b.z0, b.z1, b.id]);
rectangles.push([
  MANGER.x - MANGER.width / 2,
  MANGER.x + MANGER.width / 2,
  MANGER.z - MANGER.depth / 2,
  MANGER.z + MANGER.depth / 2,
  'manger',
]);
const circles = createCircleIndex([...OLIVES.map((t) => ({ ...t, id: 'olive' })), { ...WELL, id: 'well' }]);
export const blockerAt = (x, z) => rectHit(rectangles, x, z, R) || circles(x, z, R);
export const { stanceAt, move, groundPointAlongRay } = createNavigator({
  floorAt,
  blockerAt,
  bodyRadius: R,
  maxStep: 0.48,
});
