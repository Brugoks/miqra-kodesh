import { describe, expect, it } from 'vitest';
import {
  defaultNotificationPreference,
  formatNotificationTime,
  notificationMatchesFilter,
} from './notificationUtils';

describe('notification utilities', () => {
  it('defaults new categories to visible instant delivery', () => {
    expect(defaultNotificationPreference('user-1', 'qa')).toMatchObject({
      user_id: 'user-1',
      category: 'qa',
      in_app_enabled: true,
      push_enabled: true,
      digest_mode: 'instant',
    });
  });

  it('keeps needs-attention limited to unread high-priority items', () => {
    expect(notificationMatchesFilter({ priority: 'high', read_at: null }, 'attention')).toBe(true);
    expect(notificationMatchesFilter({ priority: 'high', read_at: '2026-08-13T00:00:00Z' }, 'attention')).toBe(false);
    expect(notificationMatchesFilter({ priority: 'normal', read_at: null }, 'attention')).toBe(false);
  });

  it('distinguishes mentions from other chat activity', () => {
    expect(notificationMatchesFilter({ event_type: 'mention' }, 'mentions')).toBe(true);
    expect(notificationMatchesFilter({ event_type: 'reply' }, 'mentions')).toBe(false);
  });

  it('formats recent timestamps in relative time', () => {
    expect(formatNotificationTime('2026-08-13T11:55:00Z', Date.parse('2026-08-13T12:00:00Z'))).toBe('5 minutes ago');
  });
});
