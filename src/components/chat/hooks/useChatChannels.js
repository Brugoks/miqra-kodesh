import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dmChannelName, isDmChannelName } from '../../../lib/discipleship';
import { hasSupabaseConfig, supabase } from '../../../lib/supabaseClient';

const cleanChannelName = (value) => (
  value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
);

export default function useChatChannels({ activeOrgId, userId, canManage, setError, onDeepLinkOpen }) {
  const [channels, setChannels] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [loadingChannels, setLoadingChannels] = useState(hasSupabaseConfig);
  const [dmLabels, setDmLabels] = useState({});
  const dmHandledRef = useRef(false);
  // Ref so the deep-link effects don't re-run every render from a fresh arrow prop.
  const onDeepLinkOpenRef = useRef(onDeepLinkOpen);
  useEffect(() => {
    onDeepLinkOpenRef.current = onDeepLinkOpen;
  });

  const loadChannels = useCallback(async () => {
    if (!hasSupabaseConfig || !activeOrgId) {
      setLoadingChannels(false);
      return;
    }

    setLoadingChannels(true);
    const { data, error } = await supabase
      .from('chat_channels')
      .select('*')
      .eq('organization_id', activeOrgId)
      .order('position', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      setError(error.message || 'Could not load channels.');
    } else {
      const nextChannels = data || [];
      setChannels(nextChannels);
      setActiveChannelId((current) => (
        current && nextChannels.some((channel) => channel.id === current)
          ? current
          : nextChannels[0]?.id || null
      ));
    }

    setLoadingChannels(false);
  }, [activeOrgId, setError]);

  useEffect(() => {
    (async () => {
      await loadChannels();
    })();
  }, [loadChannels]);

  useEffect(() => {
    dmHandledRef.current = false;
  }, [activeOrgId, userId]);

  // DM channels are named with an opaque slug (dm-xxxxxxxx-xxxxxxxx); show the
  // other member's name instead.
  useEffect(() => {
    const dmIds = channels
      .filter((channel) => channel.is_private && isDmChannelName(channel.name))
      .map((channel) => channel.id);
    let cancelled = false;
    if (!hasSupabaseConfig || !userId || !dmIds.length) {
      // Clear in a microtask (sync setState in effects trips the lint rule).
      Promise.resolve().then(() => {
        if (!cancelled) setDmLabels({});
      });
      return () => { cancelled = true; };
    }

    (async () => {
      // org_members is security definer, so names resolve even when the other
      // person's active org differs (direct profiles reads are RLS-gated on it).
      const [{ data: memberRows }, { data: orgMembers }] = await Promise.all([
        supabase.from('chat_channel_members').select('channel_id, user_id').in('channel_id', dmIds),
        supabase.rpc('org_members', { org_id: activeOrgId }),
      ]);
      if (cancelled || !memberRows) return;
      const nameById = {};
      (orgMembers || []).forEach((profile) => {
        nameById[profile.id] = profile.full_name || profile.email;
      });
      const labels = {};
      memberRows.forEach((row) => {
        if (row.user_id === userId) return;
        const name = nameById[row.user_id];
        if (!name) return;
        labels[row.channel_id] = labels[row.channel_id] ? `${labels[row.channel_id]}, ${name}` : name;
      });
      setDmLabels(labels);
    })();
    return () => { cancelled = true; };
  }, [activeOrgId, channels, userId]);

  useEffect(() => {
    if (loadingChannels || !channels.length) return;
    const params = new URLSearchParams(window.location.search);
    const channelId = params.get('channel');
    if (!channelId) return;
    if (channels.some((channel) => channel.id === channelId)) {
      const timeout = window.setTimeout(() => {
        setActiveChannelId(channelId);
        onDeepLinkOpenRef.current?.();
        params.delete('channel');
        window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [channels, loadingChannels]);

  useEffect(() => {
    if (dmHandledRef.current || loadingChannels || !hasSupabaseConfig || !userId || !activeOrgId) return;

    const params = new URLSearchParams(window.location.search);
    const dmTarget = params.get('dm');
    if (!dmTarget || dmTarget === userId) return;

    dmHandledRef.current = true;

    (async () => {
      const name = dmChannelName(userId, dmTarget);

      // Look the DM up in the database, not local state — on a fresh load the
      // channel list can still be empty, and trusting it created duplicates.
      const findByName = async () => {
        const { data } = await supabase
          .from('chat_channels')
          .select('*')
          .eq('organization_id', activeOrgId)
          .eq('name', name)
          .eq('is_private', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        return data || null;
      };

      let channel = await findByName();

      if (!channel) {
        // Legacy fallback: a private channel with exactly the two of us,
        // created before DM names were deterministic.
        const privateChannelIds = channels.filter((candidate) => candidate.is_private).map((candidate) => candidate.id);
        if (privateChannelIds.length) {
          const { data: shared } = await supabase
            .from('chat_channel_members')
            .select('channel_id')
            .eq('user_id', dmTarget)
            .in('channel_id', privateChannelIds);

          for (const row of shared || []) {
            const { count } = await supabase
              .from('chat_channel_members')
              .select('user_id', { count: 'exact', head: true })
              .eq('channel_id', row.channel_id);
            if (count === 2) {
              channel = channels.find((candidate) => candidate.id === row.channel_id) || null;
              if (channel) break;
            }
          }
        }
      }

      if (!channel) {
        const { data: created, error: createError } = await supabase
          .from('chat_channels')
          .insert({
            organization_id: activeOrgId,
            name,
            description: 'Direct message',
            category: 'Private',
            is_private: true,
            created_by: userId,
            position: channels.length + 1,
          })
          .select('*')
          .single();

        if (createError?.code === '23505') {
          // The other person created the same DM at the same moment — use theirs.
          channel = await findByName();
        } else if (createError || !created) {
          setError(createError?.message || 'Could not open that direct message.');
          return;
        } else {
          const { error: memberError } = await supabase.from('chat_channel_members').insert([
            { channel_id: created.id, user_id: userId, added_by: userId },
            { channel_id: created.id, user_id: dmTarget, added_by: userId },
          ]);
          if (memberError) {
            setError(memberError.message || 'Could not add you both to that direct message.');
          }
          channel = created;
        }

        if (!channel) {
          setError('Could not open that direct message.');
          return;
        }
      }

      const resolved = channel;
      setChannels((current) => (current.some((item) => item.id === resolved.id) ? current : [...current, resolved]));
      setActiveChannelId(resolved.id);
      onDeepLinkOpenRef.current?.();
      params.delete('dm');
      window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`);
    })();
  }, [activeOrgId, channels, loadingChannels, setError, userId]);

  const createChannel = useCallback(async ({ channelForm, pickedMembers }) => {
    const isPrivate = canManage ? channelForm.isPrivate : true;
    const name = cleanChannelName(channelForm.name);

    if (!name) {
      setError('Please enter a name.');
      return null;
    }

    setError('');
    const { data, error } = await supabase
      .from('chat_channels')
      .insert({
        organization_id: activeOrgId,
        name,
        description: channelForm.description.trim() || null,
        category: isPrivate ? 'Private' : (channelForm.category.trim() || 'Community'),
        is_private: isPrivate,
        created_by: userId,
        position: channels.length + 1,
      })
      .select('*')
      .single();

    if (error) {
      setError(error.message?.includes('duplicate') ? 'A chat with that name already exists.' : (error.message || 'Could not create chat.'));
      return null;
    }

    if (isPrivate) {
      const ids = Array.from(new Set([userId, ...pickedMembers]));
      await supabase.from('chat_channel_members').insert(ids.map((uid) => ({
        channel_id: data.id,
        user_id: uid,
        added_by: userId,
      })));
    }

    setChannels((current) => (current.some((channel) => channel.id === data.id) ? current : [...current, data]));
    setActiveChannelId(data.id);
    return data;
  }, [activeOrgId, canManage, channels.length, setError, userId]);

  const deleteChannel = useCallback(async (channel) => {
    if (!channel) return false;
    if (!window.confirm(`Delete "${channel.display_name || channel.name}"? This permanently removes the chat and all its messages for everyone.`)) return false;

    const { error } = await supabase.from('chat_channels').delete().eq('id', channel.id);
    if (error) {
      setError(error.message || 'Could not delete this chat.');
      return false;
    }

    setChannels((current) => {
      const remaining = current.filter((candidate) => candidate.id !== channel.id);
      setActiveChannelId((activeId) => (activeId === channel.id ? (remaining[0]?.id || null) : activeId));
      return remaining;
    });
    return true;
  }, [setError]);

  const renameChannel = useCallback(async (channelId, value) => {
    const name = cleanChannelName(value);
    if (!name) {
      setError('Please enter a valid name.');
      return false;
    }

    setError('');
    const { error } = await supabase
      .from('chat_channels')
      .update({ name })
      .eq('id', channelId);

    if (error) {
      setError(error.message || 'Could not rename chat.');
      return false;
    }

    setChannels((current) => current.map((channel) => (
      channel.id === channelId ? { ...channel, name } : channel
    )));
    return true;
  }, [setError]);

  // Channels as the UI should show them: DMs get the other member's name.
  const displayChannels = useMemo(() => channels.map((channel) => {
    const isDm = channel.is_private && isDmChannelName(channel.name);
    return {
      ...channel,
      is_dm: isDm,
      display_name: (isDm && dmLabels[channel.id]) || channel.name,
    };
  }), [channels, dmLabels]);

  const groupedChannels = useMemo(() => {
    const groups = {};
    displayChannels.forEach((channel) => {
      const key = channel.is_private ? 'Private' : (channel.category || 'General');
      (groups[key] ||= []).push(channel);
    });
    return Object.entries(groups).sort(([left], [right]) => (
      left === 'Private' ? 1 : right === 'Private' ? -1 : 0
    ));
  }, [displayChannels]);

  const activeChannel = useMemo(
    () => displayChannels.find((channel) => channel.id === activeChannelId) || null,
    [activeChannelId, displayChannels]
  );

  return {
    activeChannel,
    activeChannelId,
    channels,
    createChannel,
    deleteChannel,
    groupedChannels,
    loadChannels,
    loadingChannels,
    renameChannel,
    setActiveChannelId,
    setChannels,
  };
}
