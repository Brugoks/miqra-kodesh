import { describe, expect, it } from 'vitest';
import { buildAliasIndex, filterBooks, matchRank } from './bookFilter';
import { CANONICAL_ORDER } from '../../lib/scripture';

const aliasIndex = buildAliasIndex();

describe('buildAliasIndex', () => {
  it('collects every alias a book answers to', () => {
    expect(aliasIndex.get('1CO')).toEqual(expect.arrayContaining(['1 corinthians', '1co', '1 cor']));
    expect(aliasIndex.get('PSA')).toEqual(expect.arrayContaining(['psalms', 'psalm', 'ps']));
  });
});

describe('filterBooks', () => {
  it('returns the input untouched for an empty query', () => {
    expect(filterBooks(CANONICAL_ORDER, '   ', aliasIndex)).toBe(CANONICAL_ORDER);
  });

  it('matches abbreviations from BOOK_ABBR', () => {
    expect(filterBooks(CANONICAL_ORDER, '1co', aliasIndex)).toEqual(['1CO']);
    expect(filterBooks(CANONICAL_ORDER, 'phlm', aliasIndex)).toEqual(['PHM']);
  });

  it('ranks prefix matches above substring matches', () => {
    // "am" prefixes Amos, but only appears inside Lamentations and James.
    const result = filterBooks(CANONICAL_ORDER, 'am', aliasIndex);
    expect(result[0]).toBe('AMO');
    expect(result).toEqual(expect.arrayContaining(['LAM', 'JAS']));
    expect(result.indexOf('AMO')).toBeLessThan(result.indexOf('LAM'));
  });

  it('puts the exact book above its numbered siblings', () => {
    const result = filterBooks(CANONICAL_ORDER, 'john', aliasIndex);
    expect(result[0]).toBe('JHN');
    expect(result).toEqual(expect.arrayContaining(['1JN', '2JN', '3JN']));
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    expect(filterBooks(CANONICAL_ORDER, '  GeNeSiS ', aliasIndex)).toEqual(['GEN']);
  });

  it('returns nothing for a query that matches no book', () => {
    expect(filterBooks(CANONICAL_ORDER, 'zzzz', aliasIndex)).toEqual([]);
  });

  it('preserves canonical order within a rank', () => {
    const result = filterBooks(CANONICAL_ORDER, 'jo', aliasIndex);
    expect(result.indexOf('JOS')).toBeLessThan(result.indexOf('JOB'));
    expect(result.indexOf('JOB')).toBeLessThan(result.indexOf('JHN'));
  });
});

describe('matchRank', () => {
  it('scores name prefix best and no match as -1', () => {
    expect(matchRank('AMO', 'am', aliasIndex)).toBe(0);
    expect(matchRank('LAM', 'am', aliasIndex)).toBe(2);
    expect(matchRank('GEN', 'zzz', aliasIndex)).toBe(-1);
  });
});
