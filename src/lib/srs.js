// Spaced-repetition scheduling for memory verses — a simplified SM-2 with
// three grades instead of six:
//   'again' — couldn't recall: reset repetitions, review again tomorrow
//   'good'  — recalled with effort: grow the interval by the ease factor
//   'easy'  — instant recall: grow faster and raise the ease factor
// Ease stays clamped to [1.3, 3.0] so a hard verse never death-spirals into
// daily reviews forever, and an easy one never vanishes for years.

const MIN_EASE = 1.3;
const MAX_EASE = 3.0;

export const REVIEW_GRADES = ['again', 'good', 'easy'];

// Compute the next SRS state for a card given a review grade.
// card: { repetitions, interval_days, ease } → { repetitions, interval_days, ease, due_at }
export function reviewCard(card, grade, now = new Date()) {
  const ease = Number(card.ease) || 2.5;
  const repetitions = card.repetitions || 0;
  const interval = card.interval_days || 0;

  let next;
  if (grade === 'again') {
    next = { repetitions: 0, interval_days: 1, ease: Math.max(MIN_EASE, ease - 0.2) };
  } else if (grade === 'easy') {
    const grown = repetitions === 0 ? 3 : Math.round(interval * ease * 1.3);
    next = {
      repetitions: repetitions + 1,
      interval_days: Math.max(3, grown),
      ease: Math.min(MAX_EASE, ease + 0.15),
    };
  } else { // 'good'
    const grown = repetitions === 0 ? 1 : repetitions === 1 ? 3 : Math.round(interval * ease);
    next = {
      repetitions: repetitions + 1,
      interval_days: Math.max(1, grown),
      ease,
    };
  }

  const due = new Date(now);
  due.setDate(due.getDate() + next.interval_days);
  return { ...next, due_at: due.toISOString() };
}
