import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../../../lib/supabaseClient';

export default function useReadReceipts({ activeChannelId, userId }) {
  const [readRows, setReadRows] = useState([]);

  const loadReads = useCallback(async () => {
    if (!hasSupabaseConfig || !activeChannelId) {
      setReadRows([]);
      return;
    }

    const { data } = await supabase
      .from('chat_channel_reads')
      .select('channel_id,user_id,last_read_at')
      .eq('channel_id', activeChannelId);
    setReadRows(data || []);
  }, [activeChannelId]);

  useEffect(() => {
    (async () => {
      await loadReads();
    })();
  }, [loadReads]);

  useEffect(() => {
    if (!hasSupabaseConfig || !activeChannelId || typeof supabase.channel !== 'function') return undefined;

    const channel = supabase
      .channel(`chat-reads-${activeChannelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_channel_reads', filter: `channel_id=eq.${activeChannelId}` },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row) return;
          setReadRows((current) => {
            if (payload.eventType === 'DELETE') {
              return current.filter((read) => read.user_id !== row.user_id);
            }
            const without = current.filter((read) => read.user_id !== row.user_id);
            return [...without, row];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChannelId]);

  const readByUserId = useMemo(() => {
    const map = {};
    readRows.forEach((row) => {
      if (row.user_id !== userId) map[row.user_id] = row.last_read_at;
    });
    return map;
  }, [readRows, userId]);

  return { readByUserId };
}
