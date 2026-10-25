import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import buildJerusalem from './buildJerusalem';

describe('buildJerusalem', () => {
  it('builds the city and stages one Gospel event at a time', () => {
    const built = buildJerusalem(THREE, { quality: 'low', reducedMotion: true });
    expect(built.root.getObjectByName('temple-sanctuary')).toBeTruthy();
    expect(built.root.getObjectByName('garden-tomb-rock')).toBeTruthy();
    expect(built.episodes).toHaveLength(12);

    built.setEpisode('last-supper');
    expect(built.getEpisode()).toBe('last-supper');
    expect(built.root.getObjectByName('event-last-supper').visible).toBe(true);
    expect(built.root.getObjectByName('event-crucifixion').visible).toBe(false);
    built.dispose();
  });
});
