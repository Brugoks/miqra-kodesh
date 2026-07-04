import { useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../../../lib/supabaseClient';

export default function useChatPresence({ activeOrgId, userId }) {
  const [presenceState, setPresenceState] = useState({});
  const canUsePresence = Boolean(hasSupabaseConfig && activeOrgId && userId && typeof supabase.channel === 'function');

  useEffect(() => {
    if (!canUsePresence) return undefined;

    const channel = supabase.channel(`chat-presence-${activeOrgId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        setPresenceState(channel.presenceState());
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId, onlineAt: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOrgId, canUsePresence, userId]);

  const onlineUserIds = useMemo(() => {
    if (!canUsePresence) return new Set();
    const ids = new Set();
    Object.values(presenceState).forEach((metas) => {
      metas.forEach((meta) => {
        if (meta.userId) ids.add(meta.userId);
      });
    });
    return ids;
  }, [canUsePresence, presenceState]);

  return {
    onlineCount: onlineUserIds.size,
    onlineUserIds,
  };
}
