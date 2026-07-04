import { useCallback, useEffect, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../../../lib/supabaseClient';
import { mergeMessagesById, parseMentionIds } from '../chatUtils';

export default function useThreadMessages({ activeOrgId, displayName, rootMessage, setError, userId }) {
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [replies, setReplies] = useState([]);
  const [sending, setSending] = useState(false);
  const rootId = rootMessage?.id || null;

  const loadReplies = useCallback(async () => {
    if (!rootId) {
      setReplies([]);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('thread_root_id', rootId)
      .order('created_at', { ascending: true });

    if (error) {
      setError(error.message || 'Could not load thread.');
      setReplies([]);
    } else {
      setReplies(data || []);
    }
    setLoading(false);
  }, [rootId, setError]);

  useEffect(() => {
    (async () => {
      await loadReplies();
    })();
  }, [loadReplies]);

  useEffect(() => {
    if (!hasSupabaseConfig || !rootId || typeof supabase.channel !== 'function') return undefined;

    const channel = supabase
      .channel(`chat-thread-${rootId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_root_id=eq.${rootId}` },
        (payload) => setReplies((current) => (
          current.some((message) => message.id === payload.new.id) ? current : mergeMessagesById(current, [payload.new])
        ))
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `thread_root_id=eq.${rootId}` },
        (payload) => setReplies((current) => current.map((message) => (
          message.id === payload.new.id ? payload.new : message
        )))
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `thread_root_id=eq.${rootId}` },
        (payload) => setReplies((current) => current.filter((message) => message.id !== payload.old.id))
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [rootId]);

  const sendReply = useCallback(async (event) => {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || !rootMessage || sending) return;

    setSending(true);
    setError('');

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        channel_id: rootMessage.channel_id,
        organization_id: activeOrgId,
        author_id: userId,
        author_name: displayName,
        body,
        thread_root_id: rootMessage.id,
      })
      .select('*')
      .single();

    if (error) {
      setError(error.message || 'Could not send thread reply.');
      setSending(false);
      return;
    }

    setReplies((current) => (current.some((message) => message.id === data.id) ? current : [...current, data]));

    const mentionIds = parseMentionIds(body).filter((id) => id !== userId);
    if (mentionIds.length) {
      await supabase.from('chat_mentions').insert(mentionIds.map((id) => ({
        message_id: data.id,
        channel_id: rootMessage.channel_id,
        organization_id: activeOrgId,
        mentioned_user_id: id,
        actor_id: userId,
        actor_name: displayName,
      })));
    }

    setDraft('');
    setSending(false);
  }, [activeOrgId, displayName, draft, rootMessage, sending, setError, userId]);

  return {
    draft,
    loading,
    replies,
    sending,
    sendReply,
    setDraft,
  };
}
