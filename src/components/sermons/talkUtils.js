export const TALK_CATEGORIES = [
  { value: 'sermon',  label: 'Sermon',  color: '#065f46', bg: '#d1fae5' },
  { value: 'message', label: 'Message', color: '#1e40af', bg: '#dbeafe' },
];

export function getTalkCategory(value) {
  return TALK_CATEGORIES.find(c => c.value === value) || TALK_CATEGORIES[0];
}

// talk_date is a date-only column; append midnight so it doesn't shift a day in local time.
export function formatTalkDate(str) {
  if (!str) return '';
  const date = str.includes('T') ? new Date(str) : new Date(`${str}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Milk → solid food spectrum (Heb 5:12-14). Scores run 1 (pure milk) to 5
// (solid food); bands split the range in thirds. Milk is not a bad rating —
// the profile describes audience fit, not quality (1 Pet 2:2).
export const MATURITY_BANDS = [
  { max: 2.34, label: 'Milk', color: '#0369a1', bg: '#e0f2fe' },
  { max: 3.67, label: 'Transitional', color: '#92400e', bg: '#fef3c7' },
  { max: Infinity, label: 'Solid food', color: '#065f46', bg: '#d1fae5' },
];

export function getMaturityBand(score) {
  const value = typeof score === 'number' ? score : NaN;
  if (!Number.isFinite(value)) return null;
  return MATURITY_BANDS.find(band => value < band.max) || MATURITY_BANDS[MATURITY_BANDS.length - 1];
}

// Position of a 1-5 score along the meter, as a 0-100 percentage.
export function maturityPercent(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.min(5, Math.max(1, value));
  return ((clamped - 1) / 4) * 100;
}

// key_takeaways is jsonb — normalize whatever comes back into a clean array of strings.
export function normalizeTakeaways(value) {
  let list = value;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { list = []; }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}
