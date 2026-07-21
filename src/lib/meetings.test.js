import { describe, it, expect } from 'vitest';
import { nextMeetingDate, nextNMeetings, parseTime, toDateKey, getNextMeetingDateTime, getClosestGroupMeeting } from './meetings';

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

  describe('nextNMeetings', () => {
    it('generates the next N meetings from a given date', () => {
      // Today is Wednesday, 2026-06-17.
      // Frequency: Weekly
      const today = new Date(2026, 5, 17, 12, 0, 0);
      const group = {
        meeting_day: 'Wednesday',
        frequency: 'Weekly'
      };
      const result = nextNMeetings(group, 3, today);
      expect(result.map(toDateKey)).toEqual([
        '2026-06-17',
        '2026-06-24',
        '2026-07-01'
      ]);
    });

    it('rolls occurrences based on custom frequencies like biweekly', () => {
      const today = new Date(2026, 5, 17, 12, 0, 0); // Wednesday
      const group = {
        meeting_day: 'Wednesday',
        frequency: 'Every Other Week'
      };
      const result = nextNMeetings(group, 3, today);
      expect(result.map(toDateKey)).toEqual([
        '2026-06-17',
        '2026-07-01',
        '2026-07-15'
      ]);
    });
  });

  describe('getNextMeetingDateTime', () => {
    it('returns exact Date object with hours and minutes parsed', () => {
      const today = new Date(2026, 5, 15, 10, 0, 0); // Monday, June 15 2026
      const group = { meeting_day: 'Tuesday', meeting_time: '7:30 PM' };
      const dt = getNextMeetingDateTime(group, today);
      expect(dt).not.toBeNull();
      expect(toDateKey(dt)).toBe('2026-06-16');
      expect(dt.getHours()).toBe(19);
      expect(dt.getMinutes()).toBe(30);
    });

    it('returns null if group has no valid meeting schedule', () => {
      expect(getNextMeetingDateTime(null)).toBeNull();
      expect(getNextMeetingDateTime({})).toBeNull();
    });
  });

  describe('getClosestGroupMeeting', () => {
    it('finds the group with the earliest upcoming meeting date & time', () => {
      const today = new Date(2026, 5, 15, 10, 0, 0); // Monday, June 15 2026

      const groupThursday = { id: 'g_thu', name: 'Thursday Group', meeting_day: 'Thursday', meeting_time: '6:00 PM' };
      const groupTuesday = { id: 'g_tue', name: 'Tuesday Group', meeting_day: 'Tuesday', meeting_time: '7:00 PM' };
      const groupWednesday = { id: 'g_wed', name: 'Wednesday Group', meeting_day: 'Wednesday', meeting_time: '6:30 PM' };

      const closest = getClosestGroupMeeting([groupThursday, groupTuesday, groupWednesday], today);
      expect(closest).toEqual(groupTuesday);
    });

    it('distinguishes between meeting times on the same day', () => {
      const today = new Date(2026, 5, 15, 8, 0, 0); // Monday, June 15 2026

      const groupEvening = { id: 'g_eve', name: 'Evening Tuesday', meeting_day: 'Tuesday', meeting_time: '7:00 PM' };
      const groupMorning = { id: 'g_morn', name: 'Morning Tuesday', meeting_day: 'Tuesday', meeting_time: '9:00 AM' };

      const closest = getClosestGroupMeeting([groupEvening, groupMorning], today);
      expect(closest).toEqual(groupMorning);
    });

    it('returns null if no groups have valid upcoming meetings', () => {
      expect(getClosestGroupMeeting([])).toBeNull();
      expect(getClosestGroupMeeting([{ name: 'No Schedule' }])).toBeNull();
    });
  });
});

