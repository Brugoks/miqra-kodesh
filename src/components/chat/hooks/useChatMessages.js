import { useCallback, useEffect, useRef, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../../../lib/supabaseClient';
import { MESSAGE_PAGE_SIZE, mergeMessagesById } from '../chatUtils';

const mergeReactions = (current, incoming) => {
  const keyFor = (reaction) => `${reaction.message_id}:${reaction.user_id}:${reaction.emoji}`;
  const byKey = new Map(current.map((reaction) => [keyFor(reaction), reaction]));
  incoming.forEach((reaction) => byKey.set(keyFor(reaction), reaction));
  return Array.from(byKey.values());
};

export default function useChatMessages({ activeChannelId, setError, userId }) {
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingEarlierMessages, setLoadingEarlierMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const loadedMessageIdsRef = useRef(new Set());
  const focusedLoadChannelRef = useRef(null);
  const loadSeqRef = useRef(0);

  useEffect(() => {
    loadedMessageIdsRef.current = new Set(messages.map((message) => message.id));
  }, [messages]);

  const loadReactionsForIds = useCallback(async (ids, replace = false) => {
    if (!ids.length) {
      if (replace) setReactions([]);
      return;
    }

    const { data } = await supabase
      .from('chat_message_reactions')
      .select('*')
      .in('message_id', ids);

    if (replace) {
      setReactions(data || []);
    } else {
      setReactions((current) => mergeReactions(current, data || []));
    }
  }, []);

  const loadMessages = useCallback(async (channelId) => {
    const requestId = ++loadSeqRef.current;

    if (!channelId || !hasSupabaseConfig) {
      setMessages([]);
      setReactions([]);
      setHasMoreMessages(false);
      setLoadingMessages(false);
      return;
    }

    setLoadingMessages(true);
    setError('');

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel_id', channelId)
      .is('thread_root_id', null)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);

    if (requestId !== loadSeqRef.current) return;

    if (error) {
      setError(error.message || 'Could not load messages.');
      setMessages([]);
      setReactions([]);
      setHasMoreMessages(false);
      setLoadingMessages(false);
      return;
    }

    const nextMessages = [...(data || [])].reverse();
    setMessages(nextMessages);
    setHasMoreMessages((data || []).length === MESSAGE_PAGE_SIZE);
    await loadReactionsForIds(nextMessages.map((message) => message.id), true);
    setLoadingMessages(false);
  }, [loadReactionsForIds, setError]);

  useEffect(() => {
    if (activeChannelId && focusedLoadChannelRef.current === activeChannelId) {
      focusedLoadChannelRef.current = null;
      return;
    }
    (async () => {
      await loadMessages(activeChannelId);
    })();
  }, [activeChannelId, loadMessages]);

  const loadMessagesAround = useCallback(async (channelId, createdAt) => {
    if (!channelId || !createdAt || !hasSupabaseConfig) return;
    const requestId = ++loadSeqRef.current;
    focusedLoadChannelRef.current = channelId;
    setLoadingMessages(true);
    setError('');

    const [olderResult, newerResult] = await Promise.all([
      supabase
        .from('chat_messages')
        .select('*')
        .eq('channel_id', channelId)
        .is('thread_root_id', null)
        .lte('created_at', createdAt)
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('chat_messages')
        .select('*')
        .eq('channel_id', channelId)
        .is('thread_root_id', null)
        .gt('created_at', createdAt)
        .order('created_at', { ascending: true })
        .limit(25),
    ]);

    if (requestId !== loadSeqRef.current) return;
    if (olderResult.error || newerResult.error) {
      setError(olderResult.error?.message || newerResult.error?.message || 'Could not load that message.');
      setLoadingMessages(false);
      return;
    }

    const nextMessages = mergeMessagesById([...(olderResult.data || [])].reverse(), newerResult.data || []);
    setMessages(nextMessages);
    setHasMoreMessages((olderResult.data || []).length === 25);
    await loadReactionsForIds(nextMessages.map((message) => message.id), true);
    setLoadingMessages(false);
  }, [loadReactionsForIds, setError]);

  const loadEarlierMessages = useCallback(async () => {
    if (!activeChannelId || loadingEarlierMessages || !hasMoreMessages || !messages.length) return 0;

    const oldestMessage = messages[0];
    setLoadingEarlierMessages(true);

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel_id', activeChannelId)
      .is('thread_root_id', null)
      .lt('created_at', oldestMessage.created_at)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);

    if (error) {
      setError(error.message || 'Could not load earlier messages.');
      setLoadingEarlierMessages(false);
      return 0;
    }

    const earlierMessages = [...(data || [])].reverse();
    setMessages((current) => mergeMessagesById(earlierMessages, current));
    setHasMoreMessages((data || []).length === MESSAGE_PAGE_SIZE);
    await loadReactionsForIds(earlierMessages.map((message) => message.id));
    setLoadingEarlierMessages(false);
    return earlierMessages.length;
  }, [activeChannelId, hasMoreMessages, loadReactionsForIds, loadingEarlierMessages, messages, setError]);

  const insertMessage = useCallback(async (message) => {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert(message)
      .select('*')
      .single();

    if (error) throw error;

    setMessages((current) => (current.some((item) => item.id === data.id) ? current : [...current, data]));
    return data;
  }, []);

  const appendOptimisticMessage = useCallback((message) => {
    setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
  }, []);

  const replaceOptimisticMessage = useCallback((tempId, message) => {
    setMessages((current) => current.map((item) => (item.id === tempId ? message : item)));
  }, []);

  const markOptimisticMessageFailed = useCallback((tempId, errorMessage) => {
    setMessages((current) => current.map((item) => (
      item.id === tempId ? { ...item, failed: true, pending: false, errorMessage } : item
    )));
  }, []);

  const discardOptimisticMessage = useCallback((tempId) => {
    setMessages((current) => current.filter((item) => item.id !== tempId));
  }, []);

  const deleteMessage = useCallback(async (message, options = {}) => {
    if (options.hardDelete) {
      setMessages((current) => current.filter((item) => item.id !== message.id));
      const { error } = await supabase.from('chat_messages').delete().eq('id', message.id);

      if (error) {
        setError(error.message || 'Could not delete message.');
        await loadMessages(activeChannelId);
      }
      return;
    }

    const deletedAt = new Date().toISOString();
    setMessages((current) => current.map((item) => (
      item.id === message.id ? { ...item, deleted_at: deletedAt } : item
    )));
    const { error } = await supabase.from('chat_messages').update({ deleted_at: deletedAt }).eq('id', message.id);
    if (error) {
      setError(error.message || 'Could not delete message.');
      await loadMessages(activeChannelId);
    }
  }, [activeChannelId, loadMessages, setError]);

  const saveEdit = useCallback(async (messageId, text) => {
    const body = text.trim();
    if (!body) return false;

    setMessages((current) => current.map((message) => (
      message.id === messageId ? { ...message, body, edited_at: new Date().toISOString() } : message
    )));

    const { error } = await supabase
      .from('chat_messages')
      .update({ body, edited_at: new Date().toISOString() })
      .eq('id', messageId);

    if (error) {
      setError(error.message || 'Could not save edits.');
      await loadMessages(activeChannelId);
      return false;
    }

    return true;
  }, [activeChannelId, loadMessages, setError]);

  const toggleReaction = useCallback(async (messageId, emoji) => {
    const mine = reactions.find((reaction) => (
      reaction.message_id === messageId && reaction.user_id === userId && reaction.emoji === emoji
    ));

    if (mine) {
      const previous = reactions;
      setReactions((current) => current.filter((reaction) => !(
        reaction.message_id === messageId && reaction.user_id === userId && reaction.emoji === emoji
      )));
      const { error } = await supabase
        .from('chat_message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('emoji', emoji);
      if (error) {
        setError(error.message || 'Could not update reaction.');
        setReactions(previous);
      }
      return;
    }

    const optimisticReaction = { message_id: messageId, user_id: userId, emoji };
    setReactions((current) => [...current, optimisticReaction]);
    const { error } = await supabase.from('chat_message_reactions').insert(optimisticReaction);
    if (error) {
      setError(error.message || 'Could not update reaction.');
      setReactions((current) => current.filter((reaction) => !(
        reaction.message_id === messageId && reaction.user_id === userId && reaction.emoji === emoji
      )));
    }
  }, [reactions, setError, userId]);

  return {
    appendOptimisticMessage,
    deleteMessage,
    discardOptimisticMessage,
    hasMoreMessages,
    insertMessage,
    loadedMessageIdsRef,
    loadingEarlierMessages,
    loadingMessages,
    loadMessagesAround,
    loadEarlierMessages,
    loadMessages,
    messages,
    markOptimisticMessageFailed,
    reactions,
    replaceOptimisticMessage,
    saveEdit,
    setMessages,
    setReactions,
    toggleReaction,
  };
}
