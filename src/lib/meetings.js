// Shared helpers for computing a small group's next meeting date from its
// recurring schedule (attendance_groups.meeting_day / frequency).

export const DAY_INDEX = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

export function parseTime(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.trim().match(/^(\d+)(?::(\d+))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3];

  if (ampm) {
    const isPm = ampm.toUpperCase() === 'PM';
    if (isPm && hours < 12) hours += 12;
    if (!isPm && hours === 12) hours = 0;
  }
  return { hours, minutes };
}

function hasMeetingPassed(meetingDate, group, from) {
  if (!meetingDate || !group) return false;
  const mDate = new Date(meetingDate);
  mDate.setHours(0, 0, 0, 0);
  const fromDate = new Date(from);
  fromDate.setHours(0, 0, 0, 0);
  if (mDate < fromDate) return true;
  if (mDate > fromDate) return false;

  // It's today, check the time
  const timeStr = group.meetingEndTime || group.meeting_end_time || group.meetingTime || group.meeting_time;
  const timeParsed = parseTime(timeStr);
  if (!timeParsed) return false;

  const meetingDateTime = new Date(meetingDate);
  meetingDateTime.setHours(timeParsed.hours, timeParsed.minutes, 0, 0);
  return from > meetingDateTime;
}

// Next occurrence of the group's meeting weekday on or after `from` (today counts).
// Frequency (Weekly/Biweekly/Monthly) has no stored anchor date, so we surface the
// nearest matching weekday as a best-effort default; leaders can confirm the date.
export function nextMeetingDate(groupOrDay, from = new Date()) {
  if (!groupOrDay) return null;

  let meetingDay = '';
  let frequency = 'Weekly';
  let manualNextMeeting = null;
  let groupObj = {};

  if (typeof groupOrDay === 'object') {
    groupObj = groupOrDay;
    meetingDay = groupOrDay.meeting_day || groupOrDay.meetingDay;
    frequency = groupOrDay.frequency;
    manualNextMeeting = groupOrDay.next_meeting_date || groupOrDay.nextMeetingDate;
  } else {
    meetingDay = groupOrDay;
  }

  if (!meetingDay) return null;

  const today = new Date(from);
  today.setHours(0, 0, 0, 0);

  if (manualNextMeeting) {
    let anchorLocal;
    if (typeof manualNextMeeting === 'string' && manualNextMeeting.includes('-')) {
      const [y, m, d] = manualNextMeeting.split('-').map(Number);
      anchorLocal = new Date(y, m - 1, d);
    } else {
      anchorLocal = new Date(manualNextMeeting);
    }
    anchorLocal.setHours(0, 0, 0, 0);

    const current = new Date(anchorLocal);
    while (hasMeetingPassed(current, groupObj, from)) {
      const freq = (frequency || 'Weekly').trim().toLowerCase();
      if (freq === 'every other week') {
        current.setDate(current.getDate() + 14);
      } else if (freq === 'once a month') {
        current.setMonth(current.getMonth() + 1);
      } else {
        current.setDate(current.getDate() + 7);
      }
    }
    return current;
  }

  const target = DAY_INDEX[meetingDay.trim().toLowerCase()];
  if (target === undefined) return null;
  const d = new Date(today);
  d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7));

  // If weekday calculation lands on today, but the meeting has passed, roll it forward by frequency
  if (hasMeetingPassed(d, groupObj, from)) {
    const freq = (frequency || 'Weekly').trim().toLowerCase();
    if (freq === 'every other week') {
      d.setDate(d.getDate() + 14);
    } else if (freq === 'once a month') {
      d.setMonth(d.getMonth() + 1);
    } else {
      d.setDate(d.getDate() + 7);
    }
  }

  return d;
}

// Local YYYY-MM-DD (avoids the UTC shift of toISOString) for the DB date key.
export function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const formatMeetingDate = (d) =>
  d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

export function nextNMeetings(group, n = 3, from = new Date()) {
  const list = [];
  const firstDate = nextMeetingDate(group, from);
  if (!firstDate) return list;
  list.push(firstDate);

  const frequency = group?.frequency || 'Weekly';
  const anchor = new Date(firstDate);

  for (let i = 1; i < n; i++) {
    const freq = frequency.trim().toLowerCase();
    if (freq === 'every other week') {
      anchor.setDate(anchor.getDate() + 14);
    } else if (freq === 'once a month') {
      anchor.setMonth(anchor.getMonth() + 1);
    } else {
      anchor.setDate(anchor.getDate() + 7);
    }
    list.push(new Date(anchor));
  }
  return list;
}
