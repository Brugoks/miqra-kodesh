import { describe, it, expect } from 'vitest';
import {
  relationshipRole, checkInDue, daysSince, lastCheckinLabel, dmChannelName,
  buildDiscipleshipInviteEmail, discipleshipStage, covenantLabel,
  watchwordForDate, WATCHWORDS, bandPromptsForWeek, BAND_QUESTION_SETS, localDateISO,
} from './discipleship';

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

  it('treats peer relationships as equals on both sides', () => {
    const peerRel = { ...rel, kind: 'peer' };
    expect(relationshipRole(peerRel, 'user-a')).toEqual({ role: 'peer', otherId: 'user-b', roleLabel: 'Soul friend' });
    expect(relationshipRole(peerRel, 'user-b')).toEqual({ role: 'peer', otherId: 'user-a', roleLabel: 'Soul friend' });
    expect(relationshipRole(peerRel, 'user-c')).toBeNull();
  });
});

describe('discipleshipStage', () => {
  it('walks the experience ladder', () => {
    expect(discipleshipStage({ hasRelationship: false })).toBe(0);
    expect(discipleshipStage({ hasRelationship: false, myCheckinCount: 10, maxSessionsDone: 10 })).toBe(0);
    expect(discipleshipStage({ hasRelationship: true })).toBe(1);
    expect(discipleshipStage({ hasRelationship: true, myCheckinCount: 2 })).toBe(1);
    expect(discipleshipStage({ hasRelationship: true, myCheckinCount: 3 })).toBe(2);
    expect(discipleshipStage({ hasRelationship: true, myCheckinCount: 0, maxSessionsDone: 5 })).toBe(3);
  });
});

describe('covenantLabel', () => {
  it('resolves known keys and rejects unknown ones', () => {
    expect(covenantLabel('daily_word')).toBe('📖 Read Scripture daily');
    expect(covenantLabel('nope')).toBeNull();
  });
});

describe('watchwordForDate', () => {
  it('is deterministic per calendar day and cycles the list', () => {
    const a = watchwordForDate(new Date(2026, 6, 3, 8, 0));
    const b = watchwordForDate(new Date(2026, 6, 3, 22, 30));
    expect(a).toEqual(b);
    expect(WATCHWORDS).toContainEqual(a);
    const nextDay = watchwordForDate(new Date(2026, 6, 4));
    expect(nextDay).not.toEqual(a);
  });
});

describe('bandPromptsForWeek', () => {
  it('returns a full prompt set mapping onto the three check-in columns', () => {
    const set = bandPromptsForWeek(new Date(2026, 6, 3));
    expect(BAND_QUESTION_SETS).toContainEqual(set);
    expect(set.map((p) => p.key)).toEqual(['learning', 'struggle', 'prayer']);
  });

  it('is stable within a week', () => {
    expect(bandPromptsForWeek(new Date(2026, 5, 15))).toEqual(bandPromptsForWeek(new Date(2026, 5, 16)));
  });
});

describe('localDateISO', () => {
  it('formats a local calendar date', () => {
    expect(localDateISO(new Date(2026, 6, 3, 23, 59))).toBe('2026-07-03');
    expect(localDateISO(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
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

describe('buildDiscipleshipInviteEmail', () => {
  const base = {
    inviterName: 'Sarah Cohen',
    orgName: 'City Bible Church',
    inviteCode: 'CBC-STUDENTS-2026',
    appOrigin: 'https://app.example.com',
    inviterRole: 'discipler',
    inviteeEmail: 'friend@example.com',
  };

  it('includes the magic link, join code, and invitee email in both bodies', () => {
    const { subject, html, text } = buildDiscipleshipInviteEmail(base);
    expect(subject).toBe('Sarah Cohen invited you to join City Bible Church');
    for (const body of [html, text]) {
      expect(body).toContain('https://app.example.com/?invite=CBC-STUDENTS-2026');
      expect(body).toContain('CBC-STUDENTS-2026');
      expect(body).toContain('friend@example.com');
    }
  });

  it('phrases the invitation by the inviter role', () => {
    expect(buildDiscipleshipInviteEmail(base).text).toContain('walk with you in discipleship');
    expect(buildDiscipleshipInviteEmail({ ...base, inviterRole: 'disciple' }).text)
      .toContain('asking you to disciple them');
    expect(buildDiscipleshipInviteEmail({ ...base, inviterRole: 'peer' }).text)
      .toContain('soul friends');
  });

  it('escapes html in user-provided values', () => {
    const { html } = buildDiscipleshipInviteEmail({ ...base, inviterName: '<script>x</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('url-encodes the join code in the magic link', () => {
    const { html } = buildDiscipleshipInviteEmail({ ...base, inviteCode: 'A&B CODE' });
    expect(html).toContain('/?invite=A%26B%20CODE');
  });
});
