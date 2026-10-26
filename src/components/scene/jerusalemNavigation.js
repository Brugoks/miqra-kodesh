import { createNavigator, rectHit } from './sceneNavigation';
import { BOUNDS, BUILDINGS, CITY, SPECIAL_BUILDINGS, WALL_RECTS, TOWERS, TOMB_WALLS, PORTICO_COLUMNS, UPPER_COLUMNS } from './jerusalemDimensions';
import { surfaceHeight, topographicRegion } from './jerusalemTopography';

export const BARRIERS = {
  'city-wall': { id: 'city-wall', label: 'The city wall', body: 'Jerusalem’s defensive wall separated the city from the execution ground and nearby gardens.', refs: ['Hebrews 13:12'] },
  house: { id: 'house', label: 'A city house', body: 'Stone and plaster houses crowded the lanes of first-century Jerusalem.', refs: ['Mark 14:13-15'] },
  'upper-room': { id: 'upper-room', label: 'The Passover house', body: 'A furnished upper room was prepared for Jesus and the Twelve.', refs: ['Mark 14:12-17'] },
  'high-priest-house': { id: 'high-priest-house', label: 'The high priest’s house', body: 'Jesus was taken to the high priest while Peter waited in the courtyard.', refs: ['Mark 14:53-54'] },
  praetorium: { id: 'praetorium', label: 'The governor’s headquarters', body: 'Pilate heard the case at the praetorium, whose precise Jerusalem location remains debated.', refs: ['Mark 15:1-15'] },
  'temple-platform': { id: 'temple-platform', label: 'The Temple platform', body: 'Herod’s Temple stood within broad courts at the heart of Jerusalem’s Passover gathering.', refs: ['Mark 11:11'] },
  tomb: { id: 'tomb', label: 'The rock-cut tomb', body: 'The narrow entrance opens into a rock-cut chamber.', refs: ['Mark 15:46'] },
};

export function floorAt(x, z) {
  if (x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1) return null;
  return { height: surfaceHeight(x, z), region: x < CITY.x0 ? 'rocky-ground' : topographicRegion(x, z) };
}

const SOLID_RECTS = [...WALL_RECTS, ...TOWERS, ...BUILDINGS, ...SPECIAL_BUILDINGS, ...TOMB_WALLS,
  [-58, -42, 18, 18.35, 'upper-room']];

export function blockerAt(x, z) {
  if (PORTICO_COLUMNS.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 0.79)) return 'temple-platform';
  if (UPPER_COLUMNS.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 0.64)) return 'upper-room';
  return rectHit(SOLID_RECTS, x, z);
}

const navigator = createNavigator({ floorAt, blockerAt });
export const { stanceAt, move, groundPointAlongRay, probe } = navigator;
