import { describe, expect, it } from 'vitest';
import { readerLocationForRef, scenePlacesForVerse } from './sceneScriptureJourney';

describe('scenePlacesForVerse', () => {
  it('prefers visible places over the broader event for a verse', () => {
    const places = scenePlacesForVerse('nehemiahs-wall', 'NEH.3.1');
    expect(places.length).toBeGreaterThan(0);
    expect(places.every((place) => place.kind === 'hotspot')).toBe(true);
    expect(places.map((place) => place.id)).toContain('sheep-gate');
  });

  it('returns the places named by later parts of the wall circuit', () => {
    expect(scenePlacesForVerse('nehemiahs-wall', 'NEH.3.15').map((place) => place.id))
      .toContain('fountain-gate');
    expect(scenePlacesForVerse('nehemiahs-wall', 'NEH.3.26').map((place) => place.id))
      .toContain('water-gate');
  });

  it('falls back to a staged moment when there is no permanent place pin', () => {
    expect(scenePlacesForVerse('nehemiahs-wall', 'NEH.5.2')[0])
      .toMatchObject({ kind: 'event', id: 'outcry' });
  });

  it('offers a precise event-scoped place and lets its link stage the event', () => {
    expect(scenePlacesForVerse('nehemiahs-wall', 'NEH.8.4')[0])
      .toMatchObject({ kind: 'hotspot', id: 'wooden-platform' });
  });

  it('does not leak matches from another environment', () => {
    expect(scenePlacesForVerse('nehemiahs-wall', 'MRK.1.29')).toEqual([]);
  });
});

describe('readerLocationForRef', () => {
  it('resumes a range at its first verse', () => {
    expect(readerLocationForRef('Nehemiah 3:13-14', 'NEH')).toEqual({ chapter: 3, verse: 13 });
  });

  it('opens a whole chapter without selecting a verse', () => {
    expect(readerLocationForRef('Nehemiah 8', 'NEH')).toEqual({ chapter: 8, verse: null });
  });

  it('rejects a reference from another book', () => {
    expect(readerLocationForRef('Mark 1:29-31', 'NEH')).toBeNull();
  });
});
