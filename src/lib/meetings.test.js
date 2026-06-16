import { describe, it, expect } from 'vitest';
import { nextMeetingDate, parseTime, toDateKey } from './meetings';

describe('meetings helper logic', () => {
  describe('parseTime', () => {
    it('parses standard 12-hour formatted times', () => {
      expect(parseTime('6:30 PM')).toEqual({ hours: 18, minutes: 30 });
      expect(parseTime('9:30 AM')).toEqual({ hours: 9, minutes: 30 });
      expect(parseTime('12:00 PM')).toEqual({ hours: 12, minutes: 0 });
      expect(parseTime('12:00 AM')).toEqual({ hours: 0, minutes: 0 });
    });

    it('parses 24-hour formatted times', () => {
      expect(parseTime('18:30')).toEqual({ hours: 18, minutes: 30 });
      expect(parseTime('08:15')).toEqual({ hours: 8, minutes: 15 });
    });

    it('handles malformed time input', () => {
      expect(parseTime('')).toBeNull();
      expect(parseTime('invalid')).toBeNull();
    });
  });

  describe('nextMeetingDate', () => {
    it('returns null if input is empty or invalid', () => {
      expect(nextMeetingDate(null)).toBeNull();
      expect(nextMeetingDate('')).toBeNull();
    });

    it('calculates the next weekday when passed a string day name', () => {
      // Wednesday to Wednesday (today is Wednesday, 2026-06-17)
      const wednesday = new Date(2026, 5, 17, 12, 0, 0); // Wednesday
      const result = nextMeetingDate('Wednesday', wednesday);
      expect(toDateKey(result)).toBe('2026-06-17'); // lands on today
    });

    it('rolls today forward if the meeting time has passed', () => {
      // Today is Wednesday, 2026-06-17. The current time is 9:00 PM (21:00).
      // The meeting time was 6:30 PM (18:30).
      const wednesdayPast = new Date(2026, 5, 17, 21, 0, 0); 
      const group = {
        meeting_day: 'Wednesday',
        meetingTime: '6:30 PM',
        frequency: 'Weekly'
      };
      const result = nextMeetingDate(group, wednesdayPast);
      expect(toDateKey(result)).toBe('2026-06-24'); // rolled to next week Wednesday
    });

    it('keeps today if the meeting time is in the future', () => {
      // Today is Wednesday, 2026-06-17. The current time is 12:00 PM.
      // The meeting time is 6:30 PM (18:30).
      const wednesdayFuture = new Date(2026, 5, 17, 12, 0, 0); 
      const group = {
        meeting_day: 'Wednesday',
        meetingTime: '6:30 PM',
        frequency: 'Weekly'
      };
      const result = nextMeetingDate(group, wednesdayFuture);
      expect(toDateKey(result)).toBe('2026-06-17'); // remains today
    });

    it('handles manual next meeting dates that have passed', () => {
      // Today is Monday, 2026-06-15.
      // The manual next meeting date was Wednesday, 2026-06-10 (in the past).
      // Frequency: Every Other Week
      const today = new Date(2026, 5, 15, 12, 0, 0);
      const group = {
        meeting_day: 'Wednesday',
        frequency: 'Every Other Week',
        nextMeetingDate: '2026-06-10'
      };
      const result = nextMeetingDate(group, today);
      expect(toDateKey(result)).toBe('2026-06-24'); // 2026-06-10 + 14 days = 2026-06-24
    });
  });
});
