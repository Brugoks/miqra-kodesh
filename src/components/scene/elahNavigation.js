// Navigation rules and collision bounds for the Valley of Elah (/scene/valley-of-elah).
//
// Ensures visitors can explore the valley floor, approach the brook, and view both
// champions and armies safely without falling through terrain or walking through figures.

import { ELAH_CAST } from './elahDimensions.js';
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
  // Same placements as the visible, rigged cast.
  for (const actor of ELAH_CAST) {
    const radius = actor.id === 'david' ? .85 : actor.id === 'goliath' ? 1.5 : 1;
    if (Math.hypot(x - actor.x, z - actor.z) < radius) return actor.id === 'david' ? 'david' : 'goliath';
  }

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
