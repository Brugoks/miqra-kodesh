import { useEffect } from 'react';
import { hasSupabaseConfig, supabase } from '../../../lib/supabaseClient';
import { mergeMessagesById } from '../chatUtils';

export default function useChatRealtime({
  activeChannelId,
  activeOrgId,
  loadedMessageIdsRef,
  loadChannels,
  setMessages,
  setReactions,
  userId,
}) {
  useEffect(() => {
    if (!hasSupabaseConfig || !activeChannelId) return undefined;

    const channel = supabase
      .channel(`chat-messages-${activeChannelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${activeChannelId}` },
        (payload) => setMessages((current) => (
          current.some((message) => message.id === payload.new.id)
            ? current
            : mergeMessagesById(current, [payload.new])
        ))
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${activeChannelId}` },
        (payload) => setMessages((current) => current.map((message) => (
          message.id === payload.new.id ? payload.new : message
        )))
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${activeChannelId}` },
        (payload) => setMessages((current) => current.filter((message) => message.id !== payload.old.id))
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChannelId, setMessages]);

  useEffect(() => {
    if (!hasSupabaseConfig || !activeChannelId) return undefined;

    const channel = supabase
      .channel(`chat-reactions-${activeChannelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_message_reactions' },
        (payload) => {
          if (!loadedMessageIdsRef.current.has(payload.new.message_id)) return;
          setReactions((current) => (
            current.some((reaction) => (
              reaction.message_id === payload.new.message_id
              && reaction.user_id === payload.new.user_id
              && reaction.emoji === payload.new.emoji
            ))
              ? current
              : [...current, payload.new]
          ));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_message_reactions' },
        (payload) => setReactions((current) => current.filter((reaction) => !(
          reaction.message_id === payload.old.message_id
          && reaction.user_id === payload.old.user_id
          && reaction.emoji === payload.old.emoji
        )))
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChannelId, loadedMessageIdsRef, setReactions]);

  useEffect(() => {
    if (!hasSupabaseConfig || !activeOrgId) return undefined;

    const channel = supabase
      .channel(`chat-channels-${activeOrgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_channels', filter: `organization_id=eq.${activeOrgId}` },
        () => loadChannels()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOrgId, loadChannels]);

  useEffect(() => {
    if (!hasSupabaseConfig || !userId || typeof supabase.channel !== 'function') return undefined;

    const channel = supabase
      .channel(`chat-membership-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_channel_members', filter: `user_id=eq.${userId}` },
        () => loadChannels()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadChannels, userId]);
}
