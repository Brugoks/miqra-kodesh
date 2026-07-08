import { describe, it, expect } from 'vitest';
import { normalizeWiki, groupChaptersByBook, buildNameIndex, formatYear } from './bibleWiki';

const raw = {
  people: [
    { s: 'aaron_1', n: 'Aaron', vc: 331, p: ['EXO.4', 'EXO.5', 'LEV.8'] },
    { s: 'peter_1', n: 'Simon', t: 'Peter', vc: 175, al: ['Cephas'], p: ['MAT.4'] },
    { s: 'god_1324', n: 'God', vc: 8587, p: ['GEN.1'] },
    { s: 'israel_682', n: 'Israel', vc: 1009, p: ['GEN.25'] },
    { s: 'judah_1', n: 'Judah', vc: 245, p: ['GEN.29'] },
  ],
  places: [
    { s: 'jerusalem', n: 'Jerusalem', la: 31.77, lo: 35.23, p: ['JOS.10', '2SA.5'] },
    { s: 'judah-place', n: 'Judah', la: 31.5, lo: 35.0, p: ['JOS.11'] },
    { s: 'mount-sinai', n: 'Mount Sinai', la: 28.5, lo: 33.9, p: ['EXO.19'] },
  ],
};

describe('normalizeWiki', () => {
  it('merges people and places with types and display names', () => {
    const { entries, bySlug } = normalizeWiki(raw);
    expect(entries).toHaveLength(8);
    expect(bySlug.get('aaron_1').type).toBe('person');
    expect(bySlug.get('jerusalem').type).toBe('place');
    // display title wins over the as-written name
    expect(bySlug.get('peter_1').name).toBe('Peter');
    expect(bySlug.get('aaron_1').name).toBe('Aaron');
  });
});

describe('groupChaptersByBook', () => {
  it('groups consecutive chapter refs under their book', () => {
    expect(groupChaptersByBook(['EXO.4', 'EXO.5', 'LEV.8'])).toEqual([
      { code: 'EXO', book: 'Exodus', chapters: [4, 5] },
      { code: 'LEV', book: 'Leviticus', chapters: [8] },
    ]);
  });

  it('handles empty and missing input', () => {
    expect(groupChaptersByBook([])).toEqual([]);
    expect(groupChaptersByBook(undefined)).toEqual([]);
  });
});

describe('buildNameIndex', () => {
  const { entries } = normalizeWiki(raw);
  const index = buildNameIndex(entries);

  it('matches names and aliases case-insensitively via lowercase keys', () => {
    expect(index.get('aaron').s).toBe('aaron_1');
    expect(index.get('cephas').s).toBe('peter_1');
    expect(index.get('peter').s).toBe('peter_1');
  });

  it('excludes God and Israel from auto-matching', () => {
    expect(index.has('god')).toBe(false);
    expect(index.has('israel')).toBe(false);
  });

  it('skips multi-word names', () => {
    expect(index.has('mount sinai')).toBe(false);
    expect(index.has('sinai')).toBe(false);
  });

  it('prefers the better-attested entry for shared names', () => {
    // person Judah (245 verses) beats place Judah (1 chapter)
    expect(index.get('judah').s).toBe('judah_1');
  });
});

describe('formatYear', () => {
  it('formats BC/AD and rejects non-years', () => {
    expect(formatYear(-1574)).toBe('1574 BC');
    expect(formatYear(64)).toBe('AD 64');
    expect(formatYear(0)).toBeNull();
    expect(formatYear(undefined)).toBeNull();
  });
});
