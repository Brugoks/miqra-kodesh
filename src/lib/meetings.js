// Shared helpers for computing a small group's next meeting date from its
// recurring schedule (attendance_groups.meeting_day / frequency).

export const DAY_INDEX = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

// Next occurrence of the group's meeting weekday on or after `from` (today counts).
// Frequency (Weekly/Biweekly/Monthly) has no stored anchor date, so we surface the
// nearest matching weekday as a best-effort default; leaders can confirm the date.
export function nextMeetingDate(meetingDay, from = new Date()) {
  if (!meetingDay) return null;
  const target = DAY_INDEX[meetingDay.trim().toLowerCase()];
  if (target === undefined) return null;
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7));
  return d;
}

// Local YYYY-MM-DD (avoids the UTC shift of toISOString) for the DB date key.
export function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const formatMeetingDate = (d) =>
  d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
