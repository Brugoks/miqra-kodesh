import { useCallback, useEffect, useRef, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../../../lib/supabaseClient';

export default function useUnreadCounts({ activeChannelId, activeOrgId, channels, userId }) {
  const [unreadByChannel, setUnreadByChannel] = useState({});
  const [lastReadByChannel, setLastReadByChannel] = useState({});
  const activeChannelIdRef = useRef(activeChannelId);
  const readableChannelIdsRef = useRef(new Set());
  const capturePromisesRef = useRef({});

  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  useEffect(() => {
    readableChannelIdsRef.current = new Set(channels.map((channel) => channel.id));
  }, [channels]);

  const loadUnread = useCallback(async () => {
    if (!hasSupabaseConfig || !activeOrgId) return;

    const { data } = await supabase.rpc('chat_unread_counts');
    const map = {};
    (data || []).forEach((row) => {
      map[row.channel_id] = Number(row.unread);
    });
    setUnreadByChannel(map);
  }, [activeOrgId]);

  useEffect(() => {
    (async () => {
      await loadUnread();
    })();
  }, [loadUnread]);

  const markChannelRead = useCallback(async (channelId, options = {}) => {
    if (!channelId || !userId || !hasSupabaseConfig) return;

    if (options.capture) {
      const capturePromise = (async () => {
        const { data } = await supabase
          .from('chat_channel_reads')
          .select('last_read_at')
          .eq('channel_id', channelId)
          .eq('user_id', userId)
          .maybeSingle();
        setLastReadByChannel((current) => ({ ...current, [channelId]: data?.last_read_at || null }));
      })();

      capturePromisesRef.current[channelId] = capturePromise;
      await capturePromise;
      delete capturePromisesRef.current[channelId];
    } else if (capturePromisesRef.current[channelId]) {
      await capturePromisesRef.current[channelId];
    }

    setUnreadByChannel((current) => {
      if (!current[channelId]) return current;
      const next = { ...current };
      delete next[channelId];
      return next;
    });

    await supabase.from('chat_channel_reads').upsert(
      { channel_id: channelId, user_id: userId, last_read_at: new Date().toISOString() },
      { onConflict: 'channel_id,user_id' }
    );
  }, [userId]);

  useEffect(() => {
    if (!hasSupabaseConfig || !userId || typeof supabase.channel !== 'function') return undefined;

    const channel = supabase
      .channel(`chat-unread-side-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const message = payload.new;
          if (!message || message.author_id === userId || message.channel_id === activeChannelIdRef.current) return;
          if (readableChannelIdsRef.current.size && !readableChannelIdsRef.current.has(message.channel_id)) return;
          setUnreadByChannel((current) => ({
            ...current,
            [message.channel_id]: (current[message.channel_id] || 0) + 1,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return {
    lastReadByChannel,
    loadUnread,
    markChannelRead,
    unreadByChannel,
  };
}
