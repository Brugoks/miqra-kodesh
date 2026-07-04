import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../../../lib/supabaseClient';

export default function usePinnedMessages({ activeChannelId, activeOrgId, setError, userId }) {
  const [pinnedRows, setPinnedRows] = useState([]);

  const loadPins = useCallback(async () => {
    if (!hasSupabaseConfig || !activeChannelId) {
      setPinnedRows([]);
      return;
    }

    const { data, error } = await supabase
      .from('chat_pinned_messages')
      .select('*, message:chat_messages(*)')
      .eq('channel_id', activeChannelId)
      .order('created_at', { ascending: false });

    if (error) {
      setError(error.message || 'Could not load pinned messages.');
      return;
    }

    setPinnedRows(data || []);
  }, [activeChannelId, setError]);

  useEffect(() => {
    (async () => {
      await loadPins();
    })();
  }, [loadPins]);

  useEffect(() => {
    if (!hasSupabaseConfig || !activeChannelId || typeof supabase.channel !== 'function') return undefined;

    const channel = supabase
      .channel(`chat-pins-${activeChannelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_pinned_messages', filter: `channel_id=eq.${activeChannelId}` },
        () => loadPins()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChannelId, loadPins]);

  const pinnedMessageIds = useMemo(() => new Set(pinnedRows.map((row) => row.message_id)), [pinnedRows]);

  const togglePin = useCallback(async (message) => {
    if (!message || !activeChannelId) return;

    if (pinnedMessageIds.has(message.id)) {
      setPinnedRows((current) => current.filter((row) => row.message_id !== message.id));
      const { error } = await supabase
        .from('chat_pinned_messages')
        .delete()
        .eq('channel_id', activeChannelId)
        .eq('message_id', message.id);
      if (error) {
        setError(error.message || 'Could not unpin message.');
        await loadPins();
      }
      return;
    }

    const optimisticRow = {
      organization_id: activeOrgId,
      channel_id: activeChannelId,
      message_id: message.id,
      pinned_by: userId,
      created_at: new Date().toISOString(),
      message,
    };
    setPinnedRows((current) => [optimisticRow, ...current]);

    const { error } = await supabase.from('chat_pinned_messages').insert({
      organization_id: activeOrgId,
      channel_id: activeChannelId,
      message_id: message.id,
      pinned_by: userId,
    });
    if (error) {
      setError(error.message || 'Could not pin message.');
      await loadPins();
    }
  }, [activeChannelId, activeOrgId, loadPins, pinnedMessageIds, setError, userId]);

  return {
    pinnedMessageIds,
    pinnedRows,
    togglePin,
  };
}
