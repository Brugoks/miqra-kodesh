import { useCallback, useEffect, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../../../lib/supabaseClient';

export default function useActivityInbox({ setError }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadActivity = useCallback(async () => {
    if (!hasSupabaseConfig) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('chat_activity_items');
    if (error) {
      setError(error.message || 'Could not load activity.');
      setItems([]);
    } else {
      setItems(data || []);
    }
    setLoading(false);
  }, [setError]);

  useEffect(() => {
    (async () => {
      await loadActivity();
    })();
  }, [loadActivity]);

  return {
    activityItems: items,
    activityLoading: loading,
    loadActivity,
  };
}
