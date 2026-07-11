import { describe, expect, it } from 'vitest';
import { groupHolidaysByDate } from './holidays';

describe('groupHolidaysByDate', () => {
  it('groups holidays by date and dedupes names', () => {
    expect(groupHolidaysByDate([
      { date: '2026-07-03', name: 'Independence Day' },
      { date: '2026-07-03', name: 'Independence Day' },
      { date: '2026-12-25', name: 'Christmas Day' },
    ])).toEqual({
      '2026-07-03': ['Independence Day'],
      '2026-12-25': ['Christmas Day'],
    });
  });

  it('ignores malformed entries and empty input', () => {
    expect(groupHolidaysByDate([{ date: '2026-01-01' }, { name: 'X' }, null])).toEqual({});
    expect(groupHolidaysByDate(null)).toEqual({});
  });
});
