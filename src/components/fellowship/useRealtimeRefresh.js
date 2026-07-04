import { useEffect, useRef } from 'react';
import { hasSupabaseConfig, supabase } from '../../lib/supabaseClient';

// Subscribes to postgres_changes on the given tables and invokes onChange
// (debounced, so a burst of events triggers a single refetch). No-op when
// Supabase isn't configured or the section is disabled.
export default function useRealtimeRefresh(channelName, tables, onChange, enabled = true) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const tablesKey = tables.join(',');

  useEffect(() => {
    if (!hasSupabaseConfig || !enabled) return undefined;

    let timer = null;
    const trigger = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), 400);
    };

    let channel = supabase.channel(channelName);
    tablesKey.split(',').forEach((table) => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, trigger);
    });
    channel.subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [channelName, tablesKey, enabled]);
}
