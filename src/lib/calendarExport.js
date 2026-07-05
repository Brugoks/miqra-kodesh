// Build "Add to calendar" artifacts (ICS files and Google Calendar links) from a
// calendar_events row. Events store separate date (YYYY-MM-DD) and time (HH:MM[:SS])
// columns; timed events are exported as floating local times so they land at the
// right wall-clock hour for attendees, and untimed events become all-day entries.

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateDigits(dateStr) {
  return String(dateStr).replaceAll('-', '');
}

function timeDigits(timeStr) {
  const match = String(timeStr || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${pad2(match[1])}${match[2]}00`;
}

function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// One hour after a HHMMSS stamp, capped at end of day — default duration when an
// event has a start time but no end time.
function plusOneHour(timeStamp) {
  const hours = Math.min(parseInt(timeStamp.slice(0, 2), 10) + 1, 23);
  return `${pad2(hours)}${timeStamp.slice(2)}`;
}

// Resolve DTSTART/DTEND values plus whether the event is all-day.
export function eventDates(ev) {
  const startDate = ev.date;
  if (!startDate) return null;
  const endDate = ev.date_end || ev.date;
  const startTime = timeDigits(ev.time_start);

  if (!startTime) {
    // All-day: DTEND is exclusive, so add one day past the final date.
    return {
      allDay: true,
      start: dateDigits(startDate),
      end: dateDigits(addDays(endDate, 1)),
    };
  }

  const endTime = timeDigits(ev.time_end) || plusOneHour(startTime);
  return {
    allDay: false,
    start: `${dateDigits(startDate)}T${startTime}`,
    end: `${dateDigits(endDate)}T${endTime}`,
  };
}

function icsEscape(value) {
  return String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r?\n/g, '\\n');
}

// RFC 5545 lines must stay under 75 octets; fold with CRLF + space.
function foldLine(line) {
  const chunks = [];
  let rest = line;
  while (rest.length > 73) {
    chunks.push(rest.slice(0, 73));
    rest = ' ' + rest.slice(73);
  }
  chunks.push(rest);
  return chunks.join('\r\n');
}

export function buildICS(ev) {
  const dates = eventDates(ev);
  if (!dates) return null;

  const locationParts = [ev.location, ev.address].filter(Boolean);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Miqra Kodesh//Calendar//EN',
    'BEGIN:VEVENT',
    `UID:miqra-kodesh-event-${ev.id}@miqra-kodesh`,
    `DTSTAMP:${dates.allDay ? dates.start + 'T000000' : dates.start}`,
    dates.allDay ? `DTSTART;VALUE=DATE:${dates.start}` : `DTSTART:${dates.start}`,
    dates.allDay ? `DTEND;VALUE=DATE:${dates.end}` : `DTEND:${dates.end}`,
    `SUMMARY:${icsEscape(ev.title)}`,
  ];
  if (ev.description) lines.push(`DESCRIPTION:${icsEscape(ev.description)}`);
  if (locationParts.length) lines.push(`LOCATION:${icsEscape(locationParts.join(', '))}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export function googleCalendarUrl(ev) {
  const dates = eventDates(ev);
  if (!dates) return null;

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', ev.title || 'Event');
  url.searchParams.set('dates', `${dates.start}/${dates.end}`);
  if (ev.description) url.searchParams.set('details', ev.description);
  const locationParts = [ev.location, ev.address].filter(Boolean);
  if (locationParts.length) url.searchParams.set('location', locationParts.join(', '));
  return url.toString();
}

export function downloadICS(ev) {
  const ics = buildICS(ev);
  if (!ics) return;
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(ev.title || 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// One all-day VEVENT per reading-plan day, for exporting a plan's remaining
// schedule to a device calendar. `days`: [{ day, date: Date, readingLabels: string[] }].
export function buildPlanICS(planName, days) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Miqra Kodesh//ReadingPlan//EN'];
  for (const { day, date, readingLabels } of days) {
    const dateStr = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:miqra-kodesh-plan-${planName}-day-${day}@miqra-kodesh`,
      `DTSTAMP:${dateDigits(dateStr)}T000000`,
      `DTSTART;VALUE=DATE:${dateDigits(dateStr)}`,
      `DTEND;VALUE=DATE:${dateDigits(addDays(dateStr, 1))}`,
      `SUMMARY:${icsEscape(`Day ${day} · ${planName}`)}`,
      `DESCRIPTION:${icsEscape((readingLabels || []).join(', '))}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export function downloadPlanICS(planName, days) {
  const ics = buildPlanICS(planName, days);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${planName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
