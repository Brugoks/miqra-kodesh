import { describe, it, expect } from 'vitest';
import {
  passageIdsToChapters, localDateStr, parseLocalDate, getEngagedBooksProgress,
} from './scriptureEngagement';
import { refToPassageIds } from './scripture';
import { getPlan, getPlanChapters } from './readingPlans';

describe('passageIdsToChapters', () => {
  it('extracts the chapter from whole-chapter, verse, and verse-range ids', () => {
    expect(passageIdsToChapters(['PSA.23'])).toEqual(['PSA.23']);
    expect(passageIdsToChapters(['JHN.3.16'])).toEqual(['JHN.3']);
    expect(passageIdsToChapters(['JHN.3.16-JHN.3.18'])).toEqual(['JHN.3']);
  });

  it('dedupes verses from the same chapter and keeps distinct chapters', () => {
    // "Revelation 3:5;13:8" style multi-passage lookup
    const ids = refToPassageIds('Revelation 3:5;13:8');
    expect(passageIdsToChapters(ids).sort()).toEqual(['REV.13', 'REV.3']);
    expect(passageIdsToChapters(['JHN.3.16', 'JHN.3.17'])).toEqual(['JHN.3']);
  });

  it('drops ids with unknown book codes and handles empty input', () => {
    expect(passageIdsToChapters(['XYZ.1', 'JHN.1'])).toEqual(['JHN.1']);
    expect(passageIdsToChapters([])).toEqual([]);
    expect(passageIdsToChapters(undefined)).toEqual([]);
  });
});

describe('local date helpers', () => {
  it('formats and reparses as the same local day', () => {
    const d = new Date(2026, 6, 4, 23, 30); // 11:30pm local July 4
    expect(localDateStr(d)).toBe('2026-07-04');
    const back = parseLocalDate('2026-07-04');
    expect(back.getFullYear()).toBe(2026);
    expect(back.getMonth()).toBe(6);
    expect(back.getDate()).toBe(4);
    expect(back.getHours()).toBe(0); // local midnight, not UTC
  });
});

describe('getEngagedBooksProgress', () => {
  it('covers all 66 books with zero engagement', () => {
    const books = getEngagedBooksProgress([], []);
    expect(books).toHaveLength(66);
    expect(books.every((b) => b.engaged === 0 && !b.done && !b.exploredOnly)).toBe(true);
  });

  it('marks a book exploredOnly when touched by lookups but not plans', () => {
    const books = getEngagedBooksProgress([], ['JHN.3', 'JHN.4']);
    const jhn = books.find((b) => b.code === 'JHN');
    expect(jhn.exploredOnly).toBe(true);
    expect(jhn.engaged).toBe(2);
    expect(jhn.planRead).toBe(0);
  });

  it('unions plan and lookup chapters without double counting', () => {
    const plan = getPlan('gospels-30');
    const day1Chapters = getPlanChapters(plan, 1); // Matthew 1..n
    const books = getEngagedBooksProgress(
      [{ plan_id: 'gospels-30', day: 1 }],
      [day1Chapters[0], 'MAT.20'], // one overlap + one new
    );
    const mat = books.find((b) => b.code === 'MAT');
    expect(mat.planRead).toBe(day1Chapters.length);
    expect(mat.engaged).toBe(day1Chapters.length + 1);
    expect(mat.exploredOnly).toBe(false);
  });

  it('ignores lookup chapters with unknown book codes', () => {
    const books = getEngagedBooksProgress([], ['NOPE.1']);
    expect(books.every((b) => b.engaged === 0)).toBe(true);
  });
});
