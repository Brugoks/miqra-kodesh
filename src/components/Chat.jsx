import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './Chat.css';
import {
  Hash,
  Send,
  Plus,
  SmilePlus,
  Trash2,
  X,
  MessagesSquare,
} from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { canAccessLeaderTools, isAdminRole } from '../lib/roles';

const REACTION_EMOJIS = ['🙏', '❤️', '🔥', '👍', '😂', '🎵', '🙌', '😮'];

const formatTime = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));
};

export default function Chat({ session, userRole, activeOrgId }) {
  const user = session?.user;
  const userId = user?.id;
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Member';
  const canManage = canAccessLeaderTools(userRole);
  const isModerator = isAdminRole(userRole);

  const [channels, setChannels] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [loadingChannels, setLoadingChannels] = useState(hasSupabaseConfig);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [reactingFor, setReactingFor] = useState(null);

  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [channelForm, setChannelForm] = useState({ name: '', description: '', category: 'Community' });
  const [creatingChannel, setCreatingChannel] = useState(false);

  const bottomRef = useRef(null);

  // ── Load channels ──────────────────────────────────────────────────────────
  const loadChannels = useCallback(async () => {
    if (!hasSupabaseConfig || !activeOrgId) { setLoadingChannels(false); return; }
    setLoadingChannels(true);
    const { data, error: chErr } = await supabase
      .from('chat_channels')
      .select('*')
      .eq('organization_id', activeOrgId)
      .order('position', { ascending: true })
      .order('name', { ascending: true });
    if (chErr) {
      setError(chErr.message || 'Could not load channels.');
    } else {
      setChannels(data || []);
      setActiveChannelId((cur) => cur || data?.[0]?.id || null);
    }
    setLoadingChannels(false);
  }, [activeOrgId]);

  useEffect(() => { (async () => { await loadChannels(); })(); }, [loadChannels]);

  // ── Load messages + reactions for the active channel ─────────────────────────
  const loadMessages = useCallback(async (channelId) => {
    if (!channelId) return;
    setLoadingMessages(true);
    setError('');
    const { data: msgs, error: msgErr } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true });
    if (msgErr) {
      setError(msgErr.message || 'Could not load messages.');
      setMessages([]);
      setReactions([]);
      setLoadingMessages(false);
      return;
    }
    setMessages(msgs || []);
    const ids = (msgs || []).map((m) => m.id);
    if (ids.length) {
      const { data: rx } = await supabase
        .from('chat_message_reactions')
        .select('*')
        .in('message_id', ids);
      setReactions(rx || []);
    } else {
      setReactions([]);
    }
    setLoadingMessages(false);
  }, []);

  useEffect(() => { (async () => { await loadMessages(activeChannelId); })(); }, [activeChannelId, loadMessages]);

  // ── Realtime: messages for the active channel ────────────────────────────────
  useEffect(() => {
    if (!hasSupabaseConfig || !activeChannelId) return undefined;
    const channel = supabase
      .channel(`chat-messages-${activeChannelId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${activeChannelId}` },
        (payload) => setMessages((cur) => (cur.some((m) => m.id === payload.new.id) ? cur : [...cur, payload.new])))
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${activeChannelId}` },
        (payload) => setMessages((cur) => cur.filter((m) => m.id !== payload.old.id)))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeChannelId]);

  // ── Realtime: reactions (filtered client-side to loaded messages) ────────────
  useEffect(() => {
    if (!hasSupabaseConfig || !activeChannelId) return undefined;
    const channel = supabase
      .channel(`chat-reactions-${activeChannelId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_message_reactions' },
        (payload) => setReactions((cur) => (
          cur.some((r) => r.message_id === payload.new.message_id && r.user_id === payload.new.user_id && r.emoji === payload.new.emoji)
            ? cur : [...cur, payload.new])))
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_message_reactions' },
        (payload) => setReactions((cur) => cur.filter((r) => !(
          r.message_id === payload.old.message_id && r.user_id === payload.old.user_id && r.emoji === payload.old.emoji))))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeChannelId]);

  // ── Realtime: new channels ───────────────────────────────────────────────────
  useEffect(() => {
    if (!hasSupabaseConfig || !activeOrgId) return undefined;
    const channel = supabase
      .channel(`chat-channels-${activeOrgId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'chat_channels', filter: `organization_id=eq.${activeOrgId}` },
        () => loadChannels())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeOrgId, loadChannels]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const activeChannel = channels.find((c) => c.id === activeChannelId) || null;

  const groupedChannels = useMemo(() => {
    const groups = {};
    channels.forEach((c) => { (groups[c.category || 'General'] ||= []).push(c); });
    return Object.entries(groups);
  }, [channels]);

  const reactionsByMessage = useMemo(() => {
    const map = {};
    reactions.forEach((r) => { (map[r.message_id] ||= []).push(r); });
    return map;
  }, [reactions]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const sendMessage = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !activeChannel) return;
    setSending(true);
    setError('');
    const { data, error: sendErr } = await supabase
      .from('chat_messages')
      .insert({
        channel_id: activeChannel.id,
        organization_id: activeOrgId,
        author_id: userId,
        author_name: displayName,
        body,
      })
      .select('*')
      .single();
    if (sendErr) {
      setError(sendErr.message || 'Could not send your message.');
    } else {
      setMessages((cur) => (cur.some((m) => m.id === data.id) ? cur : [...cur, data]));
      setDraft('');
    }
    setSending(false);
  };

  const deleteMessage = async (message) => {
    setMessages((cur) => cur.filter((m) => m.id !== message.id));
    const { error: delErr } = await supabase.from('chat_messages').delete().eq('id', message.id);
    if (delErr) {
      setError(delErr.message || 'Could not delete message.');
      loadMessages(activeChannelId);
    }
  };

  const toggleReaction = async (messageId, emoji) => {
    setReactingFor(null);
    const mine = reactions.find((r) => r.message_id === messageId && r.user_id === userId && r.emoji === emoji);
    if (mine) {
      setReactions((cur) => cur.filter((r) => !(r.message_id === messageId && r.user_id === userId && r.emoji === emoji)));
      await supabase.from('chat_message_reactions').delete()
        .eq('message_id', messageId).eq('user_id', userId).eq('emoji', emoji);
    } else {
      setReactions((cur) => [...cur, { message_id: messageId, user_id: userId, emoji }]);
      await supabase.from('chat_message_reactions').insert({ message_id: messageId, user_id: userId, emoji });
    }
  };

  const createChannel = async (event) => {
    event.preventDefault();
    const name = channelForm.name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!name) { setError('Please enter a channel name.'); return; }
    setCreatingChannel(true);
    setError('');
    const { data, error: createErr } = await supabase
      .from('chat_channels')
      .insert({
        organization_id: activeOrgId,
        name,
        description: channelForm.description.trim() || null,
        category: channelForm.category.trim() || 'Community',
        created_by: userId,
        position: channels.length + 1,
      })
      .select('*')
      .single();
    if (createErr) {
      setError(createErr.message?.includes('duplicate') ? 'A channel with that name already exists.' : (createErr.message || 'Could not create channel.'));
      setCreatingChannel(false);
      return;
    }
    setChannels((cur) => (cur.some((c) => c.id === data.id) ? cur : [...cur, data]));
    setActiveChannelId(data.id);
    setChannelForm({ name: '', description: '', category: 'Community' });
    setChannelModalOpen(false);
    setCreatingChannel(false);
  };

  if (!hasSupabaseConfig) {
    return (
      <div className="chat-page">
        <section className="chat-empty-page card">
          <MessagesSquare size={34} />
          <div>
            <h1>Chat</h1>
            <p>Connect Supabase to use channels and messaging.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <div className="chat-shell card">
        {/* Channel sidebar */}
        <aside className="chat-sidebar">
          <div className="chat-sidebar-head">
            <h2>Channels</h2>
            {canManage && (
              <button type="button" className="chat-new-channel" onClick={() => { setChannelModalOpen(true); setError(''); }} title="New channel">
                <Plus size={16} />
              </button>
            )}
          </div>
          <div className="chat-channel-scroll">
            {loadingChannels ? (
              <p className="chat-muted">Loading…</p>
            ) : groupedChannels.length === 0 ? (
              <p className="chat-muted">No channels yet.</p>
            ) : groupedChannels.map(([category, list]) => (
              <div key={category} className="chat-channel-group">
                <div className="chat-channel-category">{category}</div>
                {list.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`chat-channel-btn ${activeChannelId === c.id ? 'active' : ''}`}
                    onClick={() => setActiveChannelId(c.id)}
                  >
                    <Hash size={15} />
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        {/* Message pane */}
        <section className="chat-main">
          <header className="chat-main-head">
            {activeChannel ? (
              <>
                <div className="chat-main-title">
                  <Hash size={18} />
                  <strong>{activeChannel.name}</strong>
                </div>
                {activeChannel.description && <span className="chat-main-desc">{activeChannel.description}</span>}
              </>
            ) : <strong>Select a channel</strong>}
          </header>

          <div className="chat-messages">
            {loadingMessages ? (
              <p className="chat-muted chat-center">Loading messages…</p>
            ) : messages.length === 0 ? (
              <div className="chat-no-messages">
                <MessagesSquare size={26} />
                <p>{activeChannel ? 'No messages yet — say hello!' : 'Pick a channel to start chatting.'}</p>
              </div>
            ) : messages.map((m) => {
              const rx = reactionsByMessage[m.id] || [];
              const grouped = rx.reduce((acc, r) => { (acc[r.emoji] ||= []).push(r); return acc; }, {});
              const canDelete = m.author_id === userId || isModerator;
              return (
                <div key={m.id} className="chat-message">
                  <div className="chat-msg-avatar">{(m.author_name || 'M')[0].toUpperCase()}</div>
                  <div className="chat-msg-body">
                    <div className="chat-msg-meta">
                      <strong>{m.author_name || 'Member'}</strong>
                      <span>{formatTime(m.created_at)}</span>
                    </div>
                    <p className="chat-msg-text">{m.body}</p>
                    <div className="chat-msg-reactions">
                      {Object.entries(grouped).map(([emoji, list]) => {
                        const mine = list.some((r) => r.user_id === userId);
                        return (
                          <button
                            key={emoji}
                            type="button"
                            className={`chat-reaction ${mine ? 'mine' : ''}`}
                            onClick={() => toggleReaction(m.id, emoji)}
                          >
                            <span>{emoji}</span><strong>{list.length}</strong>
                          </button>
                        );
                      })}
                      <div className="chat-react-wrap">
                        <button type="button" className="chat-react-add" onClick={() => setReactingFor(reactingFor === m.id ? null : m.id)} title="Add reaction">
                          <SmilePlus size={15} />
                        </button>
                        {reactingFor === m.id && (
                          <div className="chat-emoji-picker">
                            {REACTION_EMOJIS.map((e) => (
                              <button key={e} type="button" onClick={() => toggleReaction(m.id, e)}>{e}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      {canDelete && (
                        <button type="button" className="chat-msg-delete" onClick={() => deleteMessage(m)} title="Delete message">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {error && <p className="chat-error">{error}</p>}

          <form className="chat-composer" onSubmit={sendMessage}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={activeChannel ? `Message #${activeChannel.name}` : 'Select a channel…'}
              disabled={!activeChannel}
            />
            <button type="submit" className="btn-primary chat-send" disabled={sending || !draft.trim() || !activeChannel}>
              <Send size={16} />
            </button>
          </form>
        </section>
      </div>

      {channelModalOpen && (
        <div className="chat-modal-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setChannelModalOpen(false); }}>
          <div className="chat-modal card" role="dialog" aria-modal="true" aria-label="Create channel">
            <form onSubmit={createChannel} className="chat-modal-form">
              <div className="chat-modal-head">
                <h2>New Channel</h2>
                <button type="button" className="chat-modal-close" onClick={() => setChannelModalOpen(false)} aria-label="Close"><X size={18} /></button>
              </div>
              <label>
                <span>Channel name</span>
                <input
                  type="text"
                  value={channelForm.name}
                  onChange={(e) => setChannelForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. youth-group"
                />
              </label>
              <label>
                <span>Category</span>
                <input
                  type="text"
                  value={channelForm.category}
                  onChange={(e) => setChannelForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. Community, Faith"
                />
              </label>
              <label>
                <span>Description (optional)</span>
                <input
                  type="text"
                  value={channelForm.description}
                  onChange={(e) => setChannelForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What's this channel for?"
                />
              </label>
              <div className="chat-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setChannelModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={creatingChannel || !channelForm.name.trim()}>
                  {creatingChannel ? 'Creating…' : 'Create Channel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
