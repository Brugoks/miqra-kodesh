// Navigation rules and collision bounds for the Valley of Elah (/scene/valley-of-elah).
//
// Ensures visitors can explore the valley floor, approach the brook, and view both
// champions and armies safely without falling through terrain or walking through figures.

import { createNavigator } from './sceneNavigation';
import { getTerrainInfo } from './elahTerrain';

export const BODY_RADIUS = 0.45;
export const MAX_STEP = 0.55;

export const NAV_BOUNDS = {
  xMin: -85,
  xMax: 85,
  zMin: -125,
  zMax: 125,
};

export const BARRIERS = {
  edge: {
    id: 'valley-bounds',
    label: 'Edge of the Valley',
    body:
      'The exploration corridor spans the valley floor between Socoh and Azekah, where the two armies '
      + 'stood on opposing ridges with the ravine between them.',
    refs: ['1 Samuel 17:1-3'],
  },
  goliath: {
    id: 'goliath-perimeter',
    label: 'Goliath of Gath',
    body:
      'The Philistine champion stands six cubits and a span tall with his spear and shield-bearer. '
      + 'Keep a safe vantage across the brook.',
    refs: ['1 Samuel 17:4-7', '1 Samuel 17:41'],
  },
  david: {
    id: 'david-perimeter',
    label: 'David of Bethlehem',
    body:
      'David stands at the edge of the brook with his shepherd’s staff, bag, and sling in hand.',
    refs: ['1 Samuel 17:40'],
  },
  'steep-slope': {
    id: 'steep-slope',
    label: 'Steep Rocky Ridge',
    body:
      'The limestone hills climb steeply toward the military encampments overlooking the valley.',
    refs: ['1 Samuel 17:3'],
  },
};

export function floorAt(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

  // Boundary check
  if (
    x < NAV_BOUNDS.xMin + BODY_RADIUS ||
    x > NAV_BOUNDS.xMax - BODY_RADIUS ||
    z < NAV_BOUNDS.zMin + BODY_RADIUS ||
    z > NAV_BOUNDS.zMax - BODY_RADIUS
  ) {
    return null;
  }

  const info = getTerrainInfo(x, z);

  // Refuse slopes that are excessively steep for walking
  if (info.slope > 0.68) {
    return null;
  }

  return { height: info.y, region: 'valley' };
}

export function blockerAt(x, z) {
  // Principal character collision cylinders
  // David at (3, 3)
  const dDavid = Math.hypot(x - 3, z - 3);
  if (dDavid < 0.85) return 'david';

  // Goliath at (-4, -6)
  const dGoliath = Math.hypot(x - (-4), z - (-6));
  if (dGoliath < 1.5) return 'goliath';

  // Shield-bearer at (-2.6, -4.5)
  const dShield = Math.hypot(x - (-2.6), z - (-4.5));
  if (dShield < 1.0) return 'goliath';

  // Boundary ridges near the army encampments
  if (x < -72 || x > 72) return 'steep-slope';

  return null;
}

const navigator = createNavigator({
  floorAt,
  blockerAt,
  maxStep: MAX_STEP,
  bodyRadius: BODY_RADIUS,
});

export const { stanceAt, move, groundPointAlongRay } = navigator;
