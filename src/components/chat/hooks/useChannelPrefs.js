import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../../../lib/supabaseClient';

const defaultPref = { level: 'mentions', muted_until: null };

export default function useChannelPrefs({ activeChannelId, setError, userId }) {
  const [prefs, setPrefs] = useState({});
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setNowMs(Date.now()), 0);
    const interval = window.setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

  const loadPrefs = useCallback(async () => {
    if (!hasSupabaseConfig || !userId) return;
    const { data } = await supabase
      .from('chat_channel_prefs')
      .select('*')
      .eq('user_id', userId);
    setPrefs(Object.fromEntries((data || []).map((pref) => [pref.channel_id, pref])));
  }, [userId]);

  useEffect(() => {
    (async () => {
      await loadPrefs();
    })();
  }, [loadPrefs]);

  const savePref = useCallback(async (channelId, patch) => {
    if (!channelId || !userId) return;
    const next = { ...defaultPref, ...(prefs[channelId] || {}), ...patch };
    setPrefs((current) => ({ ...current, [channelId]: { ...next, channel_id: channelId, user_id: userId } }));
    const { error } = await supabase.from('chat_channel_prefs').upsert({
      channel_id: channelId,
      user_id: userId,
      level: next.level,
      muted_until: next.muted_until,
    }, { onConflict: 'channel_id,user_id' });
    if (error) {
      setError(error.message || 'Could not save notification preference.');
      await loadPrefs();
    }
  }, [loadPrefs, prefs, setError, userId]);

  const activePref = useMemo(
    () => ({ ...defaultPref, ...(prefs[activeChannelId] || {}) }),
    [activeChannelId, prefs]
  );

  const mutedChannelIds = useMemo(() => {
    return new Set(Object.entries(prefs)
      .filter(([, pref]) => pref.muted_until && new Date(pref.muted_until).getTime() > nowMs)
      .map(([channelId]) => channelId));
  }, [nowMs, prefs]);

  return {
    activePref,
    mutedChannelIds,
    prefs,
    savePref,
  };
}
