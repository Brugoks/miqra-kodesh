import { describe, expect, it } from 'vitest';
import { JERUSALEM } from './jerusalemScene';
import { sceneMomentsForPassage } from './sceneScripture';

describe('Jerusalem Synoptic Gospel scene', () => {
  it('carries the final-week path from entry through resurrection morning', () => {
    expect(JERUSALEM.events.map((event) => event.id)).toEqual([
      'entry-gate', 'temple-cleansing', 'temple-teaching', 'widows-offering',
      'last-supper', 'gethsemane', 'caiaphas-courtyard', 'before-pilate', 'road-to-golgotha',
      'crucifixion', 'burial', 'empty-tomb',
    ]);
  });

  it('offers Matthew, Mark and Luke as one in-scene reading journey', () => {
    expect(JERUSALEM.scriptureJourney.books.map((book) => book.bookCode))
      .toEqual(['MAT', 'MRK', 'LUK']);
  });

  it('links a Scripture Lookup passage directly to its Jerusalem moment', () => {
    const match = sceneMomentsForPassage(['MRK.14.12', 'MRK.14.13'])
      .find((moment) => moment.slug === 'jerusalem');
    expect(match).toMatchObject({ kind: 'event', id: 'last-supper' });
  });
});
