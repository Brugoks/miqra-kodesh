import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import buildJerusalem, { WEATHER, fogFor } from './buildJerusalem';
import { JERUSALEM_EVENT_STAGES, JERUSALEM_POSES } from './jerusalemEvents';
import { terrainHeight, eventFloorAt, topographicRegion } from './jerusalemTopography';
import { MOTION_URL } from './sceneMixamo';
import { JERUSALEM } from '../../lib/jerusalemScene';

const matrixValues = (root) => {
  const values = [];
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (node.isInstancedMesh) values.push(...node.instanceMatrix.array.slice(0, node.count * 16));
    else if (node.isMesh) values.push(...node.matrixWorld.elements);
  });
  return values;
};

describe('Jerusalem topography', () => {
  it('keeps the historically meaningful ridges and valleys in their relative places', () => {
    const templeRidge = terrainHeight(52, -35);
    const cityOfDavid = terrainHeight(52, 130);
    const tyropoeon = terrainHeight(-12, 25);
    const westernHill = terrainHeight(-70, 25);
    const kidron = terrainHeight(132, -5);
    const olives = terrainHeight(205, -5);
    expect(templeRidge).toBeGreaterThan(cityOfDavid);
    expect(westernHill).toBeGreaterThan(tyropoeon);
    expect(olives).toBeGreaterThan(kidron + 15);
    expect(topographicRegion(132, 0)).toBe('kidron-valley');
    expect(topographicRegion(205, 0)).toBe('mount-of-olives');
  });

  it('places elevated Temple and upper-room tableaus on their own floors', () => {
    expect(eventFloorAt(62, -12)).toBe(12);
    expect(eventFloorAt(-50, 25)).toBeGreaterThan(terrainHeight(-50, 25) + 4);
  });
});

describe('immersive Jerusalem build', () => {
  it.each(['low', 'balanced', 'high'])('builds finite geometry at %s quality', (quality) => {
    const built = buildJerusalem(THREE, { quality, motionLibrary: null });
    expect(matrixValues(built.root).every(Number.isFinite)).toBe(true);
    expect(built.root.getObjectByName('jerusalem-topography')).toBeTruthy();
    expect(built.root.getObjectByName('tyropoeon-stepped-street')).toBeTruthy();
    expect(built.root.getObjectByName('kidron-channel')).toBeTruthy();
    expect(built.root.getObjectByName('temple-sanctuary')).toBeTruthy();
    expect(built.root.getObjectByName('jerusalem-air')).toBeTruthy();
    expect(built.figures.length).toBeGreaterThan(20);
    built.dispose();
  });

  it('offers every Gospel event as a lazily staged tableau', () => {
    const built = buildJerusalem(THREE, { quality: 'low', motionLibrary: null });
    expect(built.episodes).toEqual(JERUSALEM.events.map((event) => event.id));
    expect(built.setEpisode('gethsemane')).toBe('gethsemane');
    expect(built.getEpisode()).toBe('gethsemane');
    expect(built.getEpisodeStage('gethsemane').isActive()).toBe(true);
    built.dispose();
  });

  it('updates air, people, animals and birds without moving in reduced motion', () => {
    const built = buildJerusalem(THREE, { quality: 'balanced', motionLibrary: null, reducedMotion: true });
    expect(() => built.update(4, 0.016, { camera: new THREE.PerspectiveCamera() })).not.toThrow();
    built.dispose();
  });

  it('provides hour-specific haze for the scene atmosphere', () => {
    expect(Object.keys(WEATHER)).toEqual(expect.arrayContaining(['dawn', 'morning', 'noon', 'dusk', 'night']));
    expect(fogFor({ id: 'dawn', sky: { low: [1, 0.8, 0.6], high: [0.2, 0.4, 0.7] } }).density)
      .toBeGreaterThan(fogFor({ id: 'noon', sky: { low: [1, 0.8, 0.6], high: [0.2, 0.4, 0.7] } }).density);
  });
});

describe('Jerusalem event motion', () => {
  const library = JSON.parse(readFileSync(resolve('public', MOTION_URL.slice(1)), 'utf8'));
  const keys = new Set(Object.keys(library.clips));

  it('uses only shipped Mixamo captures and authored poses', () => {
    for (const [id, stage] of Object.entries(JERUSALEM_EVENT_STAGES)) {
      expect(stage.cast.some((entry) => entry.principal), id).toBe(true);
      for (const entry of stage.cast) {
        if (entry.motion) expect(keys.has(entry.motion), `${id}: ${entry.motion}`).toBe(true);
        if (entry.pose) expect(JERUSALEM_POSES[entry.pose], `${id}: ${entry.pose}`).toBeTypeOf('function');
      }
    }
  });
});
