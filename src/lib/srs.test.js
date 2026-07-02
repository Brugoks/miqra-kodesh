import { describe, it, expect } from 'vitest';
import { reviewCard } from './srs';

const fresh = { repetitions: 0, interval_days: 0, ease: 2.5 };
const now = new Date(2026, 6, 1, 12, 0);

describe('reviewCard', () => {
  it('schedules a fresh card graded good for tomorrow', () => {
    const next = reviewCard(fresh, 'good', now);
    expect(next.repetitions).toBe(1);
    expect(next.interval_days).toBe(1);
    expect(next.due_at).toBe(new Date(2026, 6, 2, 12, 0).toISOString());
  });

  it('grows intervals across consecutive good reviews', () => {
    let card = reviewCard(fresh, 'good', now);           // 1 day
    card = reviewCard(card, 'good', now);                // 3 days
    expect(card.interval_days).toBe(3);
    card = reviewCard(card, 'good', now);                // 3 * 2.5 ≈ 8
    expect(card.interval_days).toBe(8);
  });

  it('resets on again and reduces ease', () => {
    const mature = { repetitions: 4, interval_days: 20, ease: 2.5 };
    const next = reviewCard(mature, 'again', now);
    expect(next.repetitions).toBe(0);
    expect(next.interval_days).toBe(1);
    expect(next.ease).toBe(2.3);
  });

  it('never drops ease below 1.3', () => {
    const struggling = { repetitions: 0, interval_days: 1, ease: 1.35 };
    expect(reviewCard(struggling, 'again', now).ease).toBe(1.3);
  });

  it('easy grows faster and raises ease, capped at 3.0', () => {
    const card = { repetitions: 2, interval_days: 6, ease: 2.95 };
    const next = reviewCard(card, 'easy', now);
    expect(next.interval_days).toBe(Math.round(6 * 2.95 * 1.3));
    expect(next.ease).toBe(3.0);
  });

  it('easy on a fresh card jumps to 3 days', () => {
    expect(reviewCard(fresh, 'easy', now).interval_days).toBe(3);
  });
});
