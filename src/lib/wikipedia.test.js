import { describe, expect, it } from 'vitest';
import { wikipediaTitleFromUrl } from './wikipedia';

describe('wikipediaTitleFromUrl', () => {
  it('extracts and decodes article titles', () => {
    expect(wikipediaTitleFromUrl('https://en.wikipedia.org/wiki/Nicodemus')).toBe('Nicodemus');
    expect(wikipediaTitleFromUrl('https://en.wikipedia.org/wiki/Pontius_Pilate')).toBe('Pontius_Pilate');
    expect(wikipediaTitleFromUrl('https://en.wikipedia.org/wiki/S%C3%A9phora')).toBe('Séphora');
  });

  it('rejects non-Wikipedia URLs and junk', () => {
    expect(wikipediaTitleFromUrl('https://example.com/wiki/Nicodemus')).toBeNull();
    expect(wikipediaTitleFromUrl('not a url')).toBeNull();
    expect(wikipediaTitleFromUrl('https://en.wikipedia.org/w/index.php?title=X')).toBeNull();
  });
});
