import { describe, it, expect } from 'vitest';
import { eventDates, buildICS, googleCalendarUrl } from './calendarExport';

const timedEvent = {
  id: 'abc-123',
  title: 'Sunday Morning Service',
  date: '2026-07-05',
  date_end: null,
  time_start: '09:30:00',
  time_end: '11:00:00',
  location: 'Student Center',
  address: '13 San Miguel Rd',
  description: 'Worship, then donuts',
};

describe('eventDates', () => {
  it('returns floating local times for timed events', () => {
    expect(eventDates(timedEvent)).toEqual({
      allDay: false,
      start: '20260705T093000',
      end: '20260705T110000',
    });
  });

  it('defaults to a one-hour duration when time_end is missing', () => {
    expect(eventDates({ ...timedEvent, time_end: null })).toEqual({
      allDay: false,
      start: '20260705T093000',
      end: '20260705T103000',
    });
  });

  it('returns an all-day range with exclusive end when no start time', () => {
    expect(eventDates({ ...timedEvent, time_start: null, time_end: null, date_end: '2026-07-07' })).toEqual({
      allDay: true,
      start: '20260705',
      end: '20260708',
    });
  });

  it('handles month rollover in all-day exclusive end', () => {
    expect(eventDates({ id: 1, title: 'x', date: '2026-07-31', time_start: null }).end).toBe('20260801');
  });

  it('returns null without a date', () => {
    expect(eventDates({ id: 1, title: 'x' })).toBeNull();
  });
});

describe('buildICS', () => {
  it('produces a valid VEVENT with escaped fields', () => {
    const ics = buildICS({ ...timedEvent, description: 'Line one\nsemi; comma,' });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20260705T093000');
    expect(ics).toContain('DTEND:20260705T110000');
    expect(ics).toContain('SUMMARY:Sunday Morning Service');
    expect(ics).toContain('DESCRIPTION:Line one\\nsemi\\; comma\\,');
    expect(ics).toContain('LOCATION:Student Center\\, 13 San Miguel Rd');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('uses VALUE=DATE for all-day events', () => {
    const ics = buildICS({ ...timedEvent, time_start: null });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260705');
    expect(ics).toContain('DTEND;VALUE=DATE:20260706');
  });

  it('folds lines longer than 75 octets', () => {
    const ics = buildICS({ ...timedEvent, description: 'x'.repeat(200) });
    for (const line of ics.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(74);
    }
  });
});

describe('googleCalendarUrl', () => {
  it('builds a render template link', () => {
    const url = new URL(googleCalendarUrl(timedEvent));
    expect(url.hostname).toBe('calendar.google.com');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Sunday Morning Service');
    expect(url.searchParams.get('dates')).toBe('20260705T093000/20260705T110000');
    expect(url.searchParams.get('location')).toBe('Student Center, 13 San Miguel Rd');
  });
});
