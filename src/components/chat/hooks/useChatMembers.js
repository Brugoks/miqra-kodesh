import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../../../lib/supabaseClient';

export default function useChatMembers({ activeOrgId, activeChannel, activeChannelId, displayName, myAvatarUrl, userId }) {
  const [members, setMembers] = useState([]);
  const [channelMemberIds, setChannelMemberIds] = useState([]);

  useEffect(() => {
    if (!hasSupabaseConfig || !activeOrgId) return;

    (async () => {
      const { data } = await supabase.rpc('org_members', { org_id: activeOrgId });
      setMembers((data || []).map((profile) => ({
        id: profile.id,
        display: profile.id === userId ? displayName : (profile.full_name || profile.email),
        avatar_url: profile.avatar_url || null,
      })));
    })();
  }, [activeOrgId, displayName, userId]);

  useEffect(() => {
    (async () => {
      if (!hasSupabaseConfig || !activeChannelId) {
        setChannelMemberIds([]);
        return;
      }

      const { data } = await supabase
        .from('chat_channel_members')
        .select('user_id')
        .eq('channel_id', activeChannelId);
      setChannelMemberIds((data || []).map((member) => member.user_id));
    })();
  }, [activeChannelId]);

  const avatarByUser = useMemo(() => {
    const map = {};
    members.forEach((member) => {
      if (member.avatar_url) map[member.id] = member.avatar_url;
    });
    if (userId && myAvatarUrl) map[userId] = myAvatarUrl;
    return map;
  }, [members, myAvatarUrl, userId]);

  const mentionableMembers = useMemo(() => {
    if (!activeChannel) return [];
    if (activeChannel.is_private) {
      return members.filter((member) => channelMemberIds.includes(member.id));
    }
    return members;
  }, [activeChannel, channelMemberIds, members]);

  const addPeopleToChannel = useCallback(async (channel, addPicked) => {
    if (!channel || !addPicked.length) return false;

    await supabase.from('chat_channel_members').insert(addPicked.map((uid) => ({
      channel_id: channel.id,
      user_id: uid,
      added_by: userId,
    })));
    setChannelMemberIds((current) => Array.from(new Set([...current, ...addPicked])));
    return true;
  }, [userId]);

  return {
    addPeopleToChannel,
    avatarByUser,
    channelMemberIds,
    members,
    mentionableMembers,
  };
}
