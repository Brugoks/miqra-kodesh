import { describe, it, expect } from 'vitest';
import { relationshipRole, checkInDue, daysSince, lastCheckinLabel, dmChannelName } from './discipleship';

const rel = { discipler_id: 'user-a', disciple_id: 'user-b' };
const now = new Date(2026, 6, 10, 12, 0);
const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe('relationshipRole', () => {
  it('identifies the discipler side', () => {
    expect(relationshipRole(rel, 'user-a')).toEqual({ role: 'discipler', otherId: 'user-b', roleLabel: 'You disciple' });
  });

  it('identifies the disciple side', () => {
    expect(relationshipRole(rel, 'user-b')).toEqual({ role: 'disciple', otherId: 'user-a', roleLabel: 'Discipling you' });
  });

  it('returns null for non-participants', () => {
    expect(relationshipRole(rel, 'user-c')).toBeNull();
  });
});

describe('checkInDue', () => {
  it('is due when the last check-in is older than the cadence', () => {
    expect(checkInDue(daysAgo(8), daysAgo(30), 7, now)).toBe(true);
  });

  it('is not due within the cadence window', () => {
    expect(checkInDue(daysAgo(3), daysAgo(30), 7, now)).toBe(false);
  });

  it('falls back to the relationship start when never checked in', () => {
    expect(checkInDue(null, daysAgo(10), 7, now)).toBe(true);
    expect(checkInDue(null, daysAgo(2), 7, now)).toBe(false);
  });

  it('is due when no reference exists at all', () => {
    expect(checkInDue(null, null, 7, now)).toBe(true);
  });
});

describe('daysSince / lastCheckinLabel', () => {
  it('computes whole days', () => {
    expect(daysSince(daysAgo(5), now)).toBe(5);
    expect(daysSince(null, now)).toBeNull();
  });

  it('labels recency in human terms', () => {
    expect(lastCheckinLabel(null, now)).toBe('No check-ins yet');
    expect(lastCheckinLabel(daysAgo(0), now)).toBe('Checked in today');
    expect(lastCheckinLabel(daysAgo(1), now)).toBe('Checked in yesterday');
    expect(lastCheckinLabel(daysAgo(9), now)).toBe('Last check-in 9 days ago');
  });
});

describe('dmChannelName', () => {
  it('is deterministic regardless of argument order', () => {
    const a = '06cdc182-b1fe-43c0-bbf6-089bbedc2dcf';
    const b = 'f3f9f8a1-1234-4bcd-9ef0-abcdefabcdef';
    expect(dmChannelName(a, b)).toBe(dmChannelName(b, a));
    expect(dmChannelName(a, b)).toBe('dm-06cdc182-f3f9f8a1');
  });
});
