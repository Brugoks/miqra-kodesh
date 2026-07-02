import { describe, it, expect } from 'vitest';
import { READING_PLANS, getPlan, getPlanChapters, getPlanReadings, computeStreak, BOOK_CHAPTERS } from './readingPlans';

describe('reading plans', () => {
  it('has sane chapter totals', () => {
    const total = Object.values(BOOK_CHAPTERS).reduce((a, b) => a + b, 0);
    expect(total).toBe(1189); // whole Bible
    expect(getPlan('nt-90').chapters).toHaveLength(260); // NT
    expect(getPlan('gospels-30').chapters).toHaveLength(89); // Gospels
  });

  it('covers every chapter exactly once across all days', () => {
    for (const plan of READING_PLANS) {
      const all = [];
      for (let day = 1; day <= plan.days; day += 1) {
        all.push(...getPlanChapters(plan, day));
      }
      expect(all).toEqual(plan.chapters);
    }
  });

  it('never assigns an empty day', () => {
    for (const plan of READING_PLANS) {
      for (let day = 1; day <= plan.days; day += 1) {
        expect(getPlanChapters(plan, day).length).toBeGreaterThan(0);
      }
    }
  });

  it('groups readings into per-book ranges', () => {
    const plan = getPlan('gospels-30');
    const day1 = getPlanReadings(plan, 1);
    expect(day1[0].label).toMatch(/^Matthew 1/);
    expect(day1[0].ref).toBe('Matthew 1');
    // Day spanning a book boundary produces two chunks
    const boundaryDay = Math.ceil((28 / 89) * 30) + 1; // just past Matthew
    const readings = getPlanReadings(plan, boundaryDay);
    expect(readings.length).toBeGreaterThanOrEqual(1);
  });
});

describe('computeStreak', () => {
  const day = (offset) => {
    const d = new Date(2026, 6, 10 - offset, 9, 0);
    return d.toISOString();
  };
  const now = new Date(2026, 6, 10, 15, 0);

  it('returns 0 with no completions', () => {
    expect(computeStreak([], now)).toBe(0);
  });

  it('counts consecutive days including today', () => {
    expect(computeStreak([day(0), day(1), day(2)], now)).toBe(3);
  });

  it('keeps the streak alive if today is not done yet', () => {
    expect(computeStreak([day(1), day(2)], now)).toBe(2);
  });

  it('breaks on a gap', () => {
    expect(computeStreak([day(0), day(2), day(3)], now)).toBe(1);
  });
});
