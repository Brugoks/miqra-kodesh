import { describe, it, expect } from 'vitest';
import { parseReference, toPassageId } from './reference.ts';

describe('parseReference', () => {
  it('parses a single verse', () => {
    expect(parseReference('John 3:16')).toEqual({
      code: 'JHN', book: 'John', chapter: 3, startVerse: 16, endVerse: 16,
    });
  });

  it('parses a verse range and numbered books', () => {
    expect(parseReference('1 Corinthians 13:4-7')).toEqual({
      code: '1CO', book: '1 Corinthians', chapter: 13, startVerse: 4, endVerse: 7,
    });
  });

  it('parses whole chapters and Psalm/Psalms aliases', () => {
    expect(parseReference('Psalm 23')).toMatchObject({ code: 'PSA', chapter: 23, startVerse: undefined });
    expect(parseReference('Psalms 23')).toMatchObject({ code: 'PSA', chapter: 23 });
  });

  it('treats a bare number in a single-chapter book as a verse, not a chapter', () => {
    expect(parseReference('Jude 5')).toEqual({
      code: 'JUD', book: 'Jude', chapter: 1, startVerse: 5, endVerse: 5,
    });
    expect(parseReference('Obadiah 3')).toMatchObject({ code: 'OBA', chapter: 1, startVerse: 3 });
    expect(parseReference('Philemon 6')).toMatchObject({ code: 'PHM', chapter: 1, startVerse: 6 });
  });

  it('parses colon-less verse ranges in single-chapter books', () => {
    expect(parseReference('Jude 5-7')).toEqual({
      code: 'JUD', book: 'Jude', chapter: 1, startVerse: 5, endVerse: 7,
    });
  });

  it('still accepts explicit chapter 1 forms for single-chapter books', () => {
    expect(parseReference('Jude 1:5')).toMatchObject({ code: 'JUD', chapter: 1, startVerse: 5 });
    expect(parseReference('Jude 1')).toMatchObject({ code: 'JUD', chapter: 1, startVerse: undefined });
  });

  it('is case-insensitive and tolerates trailing periods and extra spaces', () => {
    expect(parseReference(' john  3:16. ')).toMatchObject({ code: 'JHN', chapter: 3, startVerse: 16 });
  });

  it('returns null for unknown books and unparseable strings', () => {
    expect(parseReference('Hezekiah 3:16')).toBeNull();
    expect(parseReference('John')).toBeNull();
    expect(parseReference('')).toBeNull();
    // colon-less ranges are only valid for single-chapter books
    expect(parseReference('John 3-4')).toBeNull();
  });
});

describe('toPassageId', () => {
  const john316 = { code: 'JHN', book: 'John', chapter: 3, startVerse: 16, endVerse: 16 };

  it('builds exact and context-expanded passage ids', () => {
    expect(toPassageId(john316, 0)).toBe('JHN.3.16');
    expect(toPassageId(john316, 2)).toBe('JHN.3.14-JHN.3.18');
  });

  it('clamps the context window at verse 1', () => {
    const john31 = { code: 'JHN', book: 'John', chapter: 3, startVerse: 1, endVerse: 2 };
    expect(toPassageId(john31, 2)).toBe('JHN.3.1-JHN.3.4');
  });

  it('uses a chapter id when no verse is given', () => {
    expect(toPassageId({ code: 'PSA', book: 'Psalm', chapter: 23 }, 2)).toBe('PSA.23');
  });

  it('maps single-chapter book verses to chapter 1', () => {
    expect(toPassageId(parseReference('Jude 5'), 0)).toBe('JUD.1.5');
  });
});
