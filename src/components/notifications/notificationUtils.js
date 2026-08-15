export const NOTIFICATION_CATEGORIES = [
  { id: 'chat', label: 'Chat' },
  { id: 'fellowship', label: 'Fellowship' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'qa', label: 'Q&R' },
  { id: 'reading', label: 'Reading' },
  { id: 'discipleship', label: 'Discipleship' },
  { id: 'announcements', label: 'Announcements' },
];

export function defaultNotificationPreference(userId, category) {
  return {
    user_id: userId,
    category,
    in_app_enabled: true,
    push_enabled: true,
    email_enabled: false,
    digest_mode: 'instant',
  };
}

export function notificationMatchesFilter(notification, filter) {
  if (filter === 'unread') return !notification.read_at;
  if (filter === 'attention') return notification.priority === 'high' && !notification.read_at;
  if (filter === 'mentions') return notification.event_type === 'mention';
  return true;
}

export function formatNotificationTime(value, now = Date.now()) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const seconds = Math.round((time - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return formatter.format(days, 'day');
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(time));
}
