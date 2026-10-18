// The app-wide chat badges: unread @mentions and unread messages outside muted
// channels. Shared by the shell's realtime listener, which hears every message
// insert the user can see, so its cost is per message, per signed-in user.

// One round trip's worth of queries, in parallel.
export async function fetchChatUnread(client, userId, now = new Date()) {
  const [{ count: mentions }, { data: unreadRows }, { data: prefs }] = await Promise.all([
    client
      .from('chat_mentions')
      .select('id', { count: 'exact', head: true })
      .eq('mentioned_user_id', userId)
      .is('read_at', null),
    client.rpc('chat_unread_counts'),
    client.from('chat_channel_prefs').select('channel_id,muted_until').eq('user_id', userId),
  ]);
  const mutedIds = new Set((prefs || [])
    .filter((pref) => pref.muted_until && new Date(pref.muted_until) > now)
    .map((pref) => pref.channel_id));
  const messages = (unreadRows || []).reduce((sum, row) => (
    mutedIds.has(row.channel_id) ? sum : sum + Number(row.unread || 0)
  ), 0);
  return { mentions: mentions || 0, messages };
}

// Runs `run` once, `waitMs` after the first call, however many calls arrive in
// between — so a burst of chat messages costs one refresh, not one each.
export function coalesce(run, waitMs) {
  let timer = null;
  const trigger = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      run();
    }, waitMs);
  };
  trigger.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  return trigger;
}
