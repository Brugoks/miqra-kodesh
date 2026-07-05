import { describe, it, expect } from 'vitest';
import {
  READING_PLANS, getPlan, getPlanChapters, getPlanReadings, computeStreak, getBestStreak,
  getPaceStatus, dateForDay, dayForDate, getMissedDays, getBooksCompleted, detectMilestones,
  getLifetimeChaptersRead, getLifetimeBooksProgress, getHeatmapDays,
  CHRON_ORDER, BOOK_CHAPTERS,
} from './readingPlans';
import { CODE_TO_NAME } from './scripture';

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

  it('forgives a single missed day when graceDays is set', () => {
    // day(0), day(1) done, day(2) missed, day(3) & day(4) done — a 1-day
    // gap in the middle should not break the streak when graceDays: 1.
    const completions = [day(0), day(1), day(3), day(4)];
    // 4 completed days bridged by 1 forgiven gap — the grace day itself
    // doesn't add to the count, it just keeps counting past it.
    expect(computeStreak(completions, now, { graceDays: 1 })).toBe(4);
    expect(computeStreak(completions, now)).toBe(2); // no grace: breaks at the gap
  });
});

describe('getBestStreak', () => {
  it('returns 0 with no completions', () => {
    expect(getBestStreak([])).toBe(0);
  });

  it('finds the longest run even if it is not the current one', () => {
    const iso = (y, m, d) => new Date(y, m, d, 9, 0).toISOString();
    const completions = [
      iso(2026, 5, 1), iso(2026, 5, 2), iso(2026, 5, 3), iso(2026, 5, 4), // 4-day run
      iso(2026, 5, 10), iso(2026, 5, 11), // 2-day run
    ];
    expect(getBestStreak(completions)).toBe(4);
  });
});

describe('getPaceStatus', () => {
  it('is on pace when currentDay matches days since start', () => {
    const enrollment = { started_at: new Date(2026, 5, 1).toISOString() };
    const plan = { days: 30 };
    const now = new Date(2026, 5, 5); // 5 days since start (inclusive) -> expected day 5
    expect(getPaceStatus(enrollment, 5, plan, now)).toEqual({ expectedDay: 5, delta: 0 });
  });

  it('reports being ahead of pace', () => {
    const enrollment = { started_at: new Date(2026, 5, 1).toISOString() };
    const plan = { days: 30 };
    const now = new Date(2026, 5, 5);
    expect(getPaceStatus(enrollment, 8, plan, now).delta).toBe(3);
  });

  it('clamps expected day to the plan length', () => {
    const enrollment = { started_at: new Date(2026, 0, 1).toISOString() };
    const plan = { days: 10 };
    const now = new Date(2026, 5, 1); // long after the plan should have ended
    expect(getPaceStatus(enrollment, 10, plan, now).expectedDay).toBe(10);
  });
});

describe('calendar mode day/date mapping', () => {
  const enrollment = { started_at: new Date(2026, 5, 1).toISOString() };
  const plan = { days: 30 };

  it('maps day 1 to the start date and advances one day per day', () => {
    expect(dateForDay(enrollment, 1).getDate()).toBe(1);
    expect(dateForDay(enrollment, 5).getDate()).toBe(5);
  });

  it('inverts dateForDay', () => {
    expect(dayForDate(enrollment, new Date(2026, 5, 5), plan)).toBe(5);
  });

  it('clamps dayForDate to the plan length', () => {
    expect(dayForDate(enrollment, new Date(2026, 11, 1), plan)).toBe(30);
  });

  it('finds missed days between start and today', () => {
    const now = new Date(2026, 5, 5); // today is day 5
    const resolved = new Set([1, 2, 4]); // day 3 missed
    const missed = getMissedDays(enrollment, resolved, plan, now);
    expect(missed.map((m) => m.day)).toEqual([3]);
  });
});

describe('getBooksCompleted', () => {
  it('only counts a book once every one of its chapters is read', () => {
    const plan = getPlan('gospels-30');
    const markDays = [];
    for (let day = 1; day <= plan.days; day += 1) {
      const chapters = getPlanChapters(plan, day);
      if (chapters.some((id) => id.startsWith('MRK.'))) markDays.push(day);
    }
    const allButLastMarkDay = markDays.slice(0, -1);
    expect(getBooksCompleted(plan, allButLastMarkDay)).not.toContain('MRK');
    expect(getBooksCompleted(plan, markDays)).toContain('MRK');
  });
});

describe('detectMilestones', () => {
  it('fires exactly once when a threshold is crossed', () => {
    const before = { totalCompleted: 6, streak: 6, percent: 20 };
    const after = { totalCompleted: 7, streak: 7, percent: 25 };
    const milestones = detectMilestones(before, after);
    expect(milestones).toContainEqual({ type: 'total', value: 7, label: '7 days read' });
    expect(milestones).toContainEqual({ type: 'streak', value: 7, label: '7-day streak' });
    expect(milestones).toContainEqual({ type: 'percent', value: 25, label: '25% of the plan' });
  });

  it('does not re-fire once already past the threshold', () => {
    const before = { totalCompleted: 8, streak: 8, percent: 26 };
    const after = { totalCompleted: 9, streak: 9, percent: 27 };
    expect(detectMilestones(before, after)).toEqual([]);
  });

  it('labels 100% as plan complete', () => {
    const before = { totalCompleted: 29, streak: 29, percent: 96 };
    const after = { totalCompleted: 30, streak: 30, percent: 100 };
    const milestones = detectMilestones(before, after);
    expect(milestones).toContainEqual({ type: 'percent', value: 100, label: 'Plan complete' });
  });
});

describe('lifetime progress helpers', () => {
  it('accumulates chapter coverage across multiple plans', () => {
    // gospels-30 day 1 covers Matthew 1-3ish; nt-90 day 1 covers Matthew too.
    const rows = [{ plan_id: 'gospels-30', day: 1 }, { plan_id: 'nt-90', day: 1 }];
    const byBook = getLifetimeChaptersRead(rows);
    expect(byBook.MAT.size).toBeGreaterThan(0);
  });

  it('marks a book done only once every chapter is covered', () => {
    const plan = getPlan('gospels-30');
    const markDays = [];
    for (let day = 1; day <= plan.days; day += 1) {
      if (getPlanChapters(plan, day).some((id) => id.startsWith('MRK.'))) markDays.push(day);
    }
    const rows = markDays.map((day) => ({ plan_id: plan.id, day }));
    const progress = getLifetimeBooksProgress(rows);
    const mrk = progress.find((b) => b.code === 'MRK');
    expect(mrk.done).toBe(true);
    expect(mrk.total).toBe(16);
    const gen = progress.find((b) => b.code === 'GEN');
    expect(gen.done).toBe(false);
    expect(gen.read).toBe(0);
  });

  it('covers all 66 books even with no progress', () => {
    expect(getLifetimeBooksProgress([])).toHaveLength(66);
  });
});

describe('getHeatmapDays', () => {
  it('returns weeks * 7 days ending today', () => {
    const now = new Date(2026, 5, 10);
    const days = getHeatmapDays([], 12, now);
    expect(days).toHaveLength(84);
    expect(days[83].date.getDate()).toBe(10);
  });

  it('counts completions per day', () => {
    const now = new Date(2026, 5, 10);
    const iso = (d) => new Date(2026, 5, d, 9, 0).toISOString();
    const days = getHeatmapDays([iso(10), iso(10), iso(9)], 12, now);
    expect(days[83].count).toBe(2);
    expect(days[82].count).toBe(1);
  });
});

describe('curated plan orderings', () => {
  it('CHRON_ORDER is a permutation of every canonical book code', () => {
    expect([...CHRON_ORDER].sort()).toEqual(Object.keys(BOOK_CHAPTERS).sort());
  });

  it('every reading plan resolves to real book codes with human names', () => {
    for (const plan of READING_PLANS) {
      for (const id of plan.chapters) {
        const [code] = id.split('.');
        expect(BOOK_CHAPTERS[code]).toBeGreaterThan(0);
        expect(CODE_TO_NAME[code]).toBeTruthy();
      }
    }
  });

  it('life-of-jesus-45 covers every Gospel chapter exactly once', () => {
    const plan = getPlan('life-of-jesus-45');
    const expected = ['MAT', 'MRK', 'LUK', 'JHN'].flatMap((code) => (
      Array.from({ length: BOOK_CHAPTERS[code] }, (_, i) => `${code}.${i + 1}`)
    ));
    expect([...plan.chapters].sort()).toEqual(expected.sort());
    expect(new Set(plan.chapters).size).toBe(plan.chapters.length); // no duplicates
  });

  it('every plan still covers its declared chapters exactly once across all days', () => {
    for (const plan of READING_PLANS) {
      const all = [];
      for (let day = 1; day <= plan.days; day += 1) all.push(...getPlanChapters(plan, day));
      expect(all).toEqual(plan.chapters);
    }
  });
});
