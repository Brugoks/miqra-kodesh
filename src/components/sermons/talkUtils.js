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
