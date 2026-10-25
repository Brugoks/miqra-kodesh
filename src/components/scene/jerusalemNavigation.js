import { createNavigator, rectHit } from './sceneNavigation';
import { BOUNDS, BUILDINGS, CITY, SPECIAL_BUILDINGS, WALL_RECTS } from './jerusalemDimensions';
import { terrainHeight, topographicRegion } from './jerusalemTopography';

export const BARRIERS = {
  'city-wall': { id: 'city-wall', label: 'The city wall', body: 'Jerusalem’s defensive wall separated the city from the execution ground and nearby gardens.', refs: ['Hebrews 13:12'] },
  house: { id: 'house', label: 'A city house', body: 'Stone and plaster houses crowded the lanes of first-century Jerusalem.', refs: ['Mark 14:13-15'] },
  'upper-room': { id: 'upper-room', label: 'The Passover house', body: 'A furnished upper room was prepared for Jesus and the Twelve.', refs: ['Mark 14:12-17'] },
  'high-priest-house': { id: 'high-priest-house', label: 'The high priest’s house', body: 'Jesus was taken to the high priest while Peter waited in the courtyard.', refs: ['Mark 14:53-54'] },
  praetorium: { id: 'praetorium', label: 'The governor’s headquarters', body: 'Pilate heard the case at the praetorium, whose precise Jerusalem location remains debated.', refs: ['Mark 15:1-15'] },
  'temple-platform': { id: 'temple-platform', label: 'The Temple platform', body: 'Herod’s Temple stood within broad courts at the heart of Jerusalem’s Passover gathering.', refs: ['Mark 11:11'] },
};

export function floorAt(x, z) {
  if (x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1) return null;
  return { height: terrainHeight(x, z), region: x < CITY.x0 ? 'rocky-ground' : topographicRegion(x, z) };
}

export function blockerAt(x, z) {
  return rectHit([...WALL_RECTS, ...BUILDINGS, ...SPECIAL_BUILDINGS], x, z);
}

const navigator = createNavigator({ floorAt, blockerAt });
export const { stanceAt, move, groundPointAlongRay, probe } = navigator;
