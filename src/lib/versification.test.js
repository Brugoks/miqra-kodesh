import { describe, expect, it } from 'vitest';
import { BOOK_VERSES, versesIn } from './versification';
import { BOOK_CHAPTERS } from './scripture';

describe('BOOK_VERSES', () => {
  it('covers exactly the 66 canonical books', () => {
    expect(Object.keys(BOOK_VERSES).sort()).toEqual(Object.keys(BOOK_CHAPTERS).sort());
  });

  it('has one verse count per chapter of every book', () => {
    for (const [code, counts] of Object.entries(BOOK_VERSES)) {
      expect(counts).toHaveLength(BOOK_CHAPTERS[code]);
    }
  });

  it('has a positive integer count for every chapter', () => {
    for (const [code, counts] of Object.entries(BOOK_VERSES)) {
      for (const [i, n] of counts.entries()) {
        expect(Number.isInteger(n), `${code} ${i + 1} is not an integer`).toBe(true);
        expect(n, `${code} ${i + 1} has no verses`).toBeGreaterThan(0);
      }
    }
  });
});

describe('versesIn', () => {
  it('returns known chapter lengths', () => {
    expect(versesIn('GEN', 1)).toBe(31);
    expect(versesIn('JHN', 3)).toBe(36);
    expect(versesIn('PSA', 117)).toBe(2);
    expect(versesIn('PSA', 119)).toBe(176); // longest chapter in the Bible
    expect(versesIn('OBA', 1)).toBe(21);    // single-chapter book
  });

  it('returns 0 for unknown books and out-of-range chapters', () => {
    expect(versesIn('XXX', 1)).toBe(0);
    expect(versesIn('GEN', 0)).toBe(0);
    expect(versesIn('GEN', 51)).toBe(0);
    expect(versesIn('GEN', 1.5)).toBe(0);
    expect(versesIn(undefined, 1)).toBe(0);
  });
});
