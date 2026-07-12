import { describe, it, expect } from 'vitest';
import {
  normalizeWiki, groupChaptersByBook, buildNameIndex, formatYear, applyCurated,
  buildChapterIndex, entitiesForChapters, coOccurring, buildWikiPlan, searchWikiEntries,
  formatYearRange, weeklyPick,
} from './bibleWiki';

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

describe('applyCurated', () => {
  it('merges curated fields onto entries by slug, appending aliases', () => {
    const curated = {
      aaron_1: { nm: 'mountain of strength', kv: ['Numbers 6:24-26'] },
      peter_1: { al: ['Simon Peter'] },
    };
    const merged = applyCurated(raw, curated);
    const aaron = merged.people.find((p) => p.s === 'aaron_1');
    expect(aaron.nm).toBe('mountain of strength');
    expect(aaron.kv).toEqual(['Numbers 6:24-26']);
    const peter = merged.people.find((p) => p.s === 'peter_1');
    expect(peter.al).toEqual(['Cephas', 'Simon Peter']);
    // untouched entries pass through
    expect(merged.places.find((p) => p.s === 'jerusalem').la).toBe(31.77);
  });
});

describe('buildChapterIndex / entitiesForChapters', () => {
  const { entries } = normalizeWiki(raw);
  const index = buildChapterIndex(entries);

  it('indexes every entry under each of its chapters', () => {
    expect(index.get('EXO.4').map((e) => e.s)).toContain('aaron_1');
    expect(index.get('JOS.10').map((e) => e.s)).toContain('jerusalem');
  });

  it('returns unique entities for a chapter set, best-attested first', () => {
    const cast = entitiesForChapters(index, ['EXO.4', 'EXO.5']);
    expect(cast.map((c) => c.entry.s)).toEqual(['aaron_1']);
  });

  it('flags first appearances when fv falls in the chapter set', () => {
    const withFv = normalizeWiki({
      people: [{ s: 'x', n: 'X', vc: 3, fv: 'EXO.4.14', p: ['EXO.4', 'EXO.9'] }],
      places: [],
    });
    const idx = buildChapterIndex(withFv.entries);
    expect(entitiesForChapters(idx, ['EXO.4'])[0].firstHere).toBe(true);
    expect(entitiesForChapters(idx, ['EXO.9'])[0].firstHere).toBe(false);
  });
});

describe('coOccurring', () => {
  it('ranks companions by shared chapters and requires at least two', () => {
    const { entries, bySlug } = normalizeWiki({
      people: [
        { s: 'a', n: 'A', vc: 10, p: ['GEN.1', 'GEN.2', 'GEN.3'] },
        { s: 'b', n: 'B', vc: 5, p: ['GEN.1', 'GEN.2'] },
        { s: 'c', n: 'C', vc: 5, p: ['GEN.1'] },
      ],
      places: [],
    });
    const companions = coOccurring(bySlug.get('a'), entries);
    expect(companions.map((c) => c.entry.s)).toEqual(['b']);
    expect(companions[0].shared).toBe(2);
  });
});

describe('buildWikiPlan', () => {
  it('turns an entry chapter index into a one-chapter-a-day plan', () => {
    const plan = buildWikiPlan({ s: 'aaron_1', name: 'Aaron', type: 'person', p: ['EXO.4', 'EXO.5', 'LEV.8'] });
    expect(plan.id).toBe('wiki-aaron_1');
    expect(plan.days).toBe(3);
    expect(plan.chapters).toEqual(['EXO.4', 'EXO.5', 'LEV.8']);
    expect(plan.category).toBe('character');
    expect(plan.name).toBe('The Life of Aaron');
  });

  it('declines entries with fewer than two chapters', () => {
    expect(buildWikiPlan({ s: 'x', name: 'X', type: 'person', p: ['GEN.1'] })).toBeNull();
  });
});

describe('searchWikiEntries', () => {
  const { entries } = normalizeWiki(raw);

  it('finds entries by exact and partial name', () => {
    expect(searchWikiEntries('aaron', entries)[0].s).toBe('aaron_1');
    expect(searchWikiEntries('who was cephas', entries)[0].s).toBe('peter_1');
  });

  it('matches description words for paraphrased queries', () => {
    const withDesc = [
      { s: 'jonah', name: 'Jonah', n: 'Jonah', type: 'person', vc: 10, desc: 'Swallowed by a great fish after fleeing to Tarshish.' },
      ...entries,
    ];
    const hits = searchWikiEntries('swallowed by a fish', withDesc);
    expect(hits[0]?.s).toBe('jonah');
  });

  it('returns nothing for too-short queries', () => {
    expect(searchWikiEntries('ab', entries)).toEqual([]);
  });
});

describe('formatYearRange / weeklyPick', () => {
  it('formats ranges and single years', () => {
    expect(formatYearRange([-1500, -1400])).toBe('1500 BC – 1400 BC');
    expect(formatYearRange([354, 430])).toBe('AD 354 – AD 430');
    expect(formatYearRange([354, 354])).toBe('AD 354');
    expect(formatYearRange(null)).toBeNull();
  });

  it('weeklyPick is stable within a week and honors salt', () => {
    const list = ['a', 'b', 'c'];
    const monday = new Date('2026-07-06T12:00:00Z');
    const friday = new Date('2026-07-10T12:00:00Z');
    expect(weeklyPick(list, monday)).toBe(weeklyPick(list, friday));
    expect(weeklyPick([], monday)).toBeNull();
  });
});
