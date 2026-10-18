import { afterEach, describe, expect, it, vi } from 'vitest';
import { coalesce, fetchChatUnread } from './chatUnread';

function fakeClient({ mentions = 0, unread = [], prefs = [] } = {}) {
  const started = [];
  const query = (name, result) => {
    started.push(name);
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  };
  return {
    started,
    from: (table) => query(table, table === 'chat_mentions' ? { count: mentions } : { data: prefs }),
    rpc: (name) => query(name, { data: unread }),
  };
}

describe('fetchChatUnread', () => {
  const now = new Date('2026-10-17T12:00:00Z');

  it('counts unread messages outside muted channels, and mentions', async () => {
    const client = fakeClient({
      mentions: 2,
      unread: [
        { channel_id: 'a', unread: 3 },
        { channel_id: 'muted', unread: 9 },
        { channel_id: 'lapsed', unread: '4' },
      ],
      prefs: [
        { channel_id: 'muted', muted_until: '2026-10-18T00:00:00Z' },
        { channel_id: 'lapsed', muted_until: '2026-10-16T00:00:00Z' },
      ],
    });
    await expect(fetchChatUnread(client, 'u1', now)).resolves.toEqual({ mentions: 2, messages: 7 });
  });

  it('starts all three queries before awaiting any', async () => {
    const client = fakeClient();
    const pending = fetchChatUnread(client, 'u1', now);
    expect(client.started).toEqual(['chat_mentions', 'chat_unread_counts', 'chat_channel_prefs']);
    await expect(pending).resolves.toEqual({ mentions: 0, messages: 0 });
  });
});

describe('coalesce', () => {
  afterEach(() => vi.useRealTimers());

  it('runs once for a burst, then again for a later burst', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const trigger = coalesce(run, 1000);
    trigger(); trigger(); trigger();
    vi.advanceTimersByTime(999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    trigger();
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('runs nothing after cancel', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const trigger = coalesce(run, 1000);
    trigger();
    trigger.cancel();
    vi.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
  });
});
