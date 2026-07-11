// Public holidays via the Nager.Date API — keyless, free. Shown on the
// calendar grid so leaders don't schedule meetings against a holiday.

// Group an API holiday list into { 'YYYY-MM-DD': [names] }.
export function groupHolidaysByDate(holidays) {
  const byDate = {};
  for (const holiday of holidays || []) {
    if (!holiday?.date || !holiday?.name) continue;
    if (!byDate[holiday.date]) byDate[holiday.date] = [];
    if (!byDate[holiday.date].includes(holiday.name)) byDate[holiday.date].push(holiday.name);
  }
  return byDate;
}

// Session cache: one request per year+country.
const holidayCache = new Map();

export async function fetchPublicHolidays(year, countryCode = 'US') {
  const cacheKey = `${year}:${countryCode}`;
  if (holidayCache.has(cacheKey)) return holidayCache.get(cacheKey);
  const promise = fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`)
    .then((res) => (res.ok ? res.json() : []))
    .then(groupHolidaysByDate)
    .catch(() => {
      holidayCache.delete(cacheKey); // best-effort; retry on next mount
      return {};
    });
  holidayCache.set(cacheKey, promise);
  return promise;
}
