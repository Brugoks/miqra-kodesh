import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MentionsInput, Mention } from 'react-mentions';
import './Chat.css';
import {
  Hash,
  Send,
  Plus,
  SmilePlus,
  Trash2,
  X,
  MessagesSquare,
  ImagePlus,
  Reply,
  CornerUpRight,
  Bell,
  Lock,
  UserPlus,
} from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { canAccessLeaderTools, isAdminRole } from '../lib/roles';
import { enablePushNotifications, isPushSupported, pushPermission } from '../lib/push';

const REACTION_EMOJIS = ['🙏', '❤️', '🔥', '👍', '😂', '🎵', '🙌', '😮'];
const MENTION_RE = /@\[([^\]]*)\]\(([^)]+)\)/g;

const formatTime = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));
};

// Stored mention markup "@[Name](id)" → highlighted @Name spans interleaved with text.
function renderBody(text) {
  if (!text) return null;
  const nodes = [];
  const re = new RegExp(MENTION_RE);
  let last = 0;
  let key = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(<span key={`m${key++}`} className="chat-mention">@{m[1]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function parseMentionIds(text) {
  const ids = [];
  const re = new RegExp(MENTION_RE);
  let m;
  while ((m = re.exec(text || '')) !== null) {
    if (!ids.includes(m[2])) ids.push(m[2]);
  }
  return ids;
}

// Plain-text preview (mentions shown as @Name) for reply quotes.
const previewText = (msg) => {
  if (!msg) return '';
  if (msg.body) return msg.body.replace(MENTION_RE, '@$1');
  if (msg.image_url) return '📷 photo';
  return '';
};

export default function Chat({ session, userRole, activeOrgId, onChatSeen }) {
  const user = session?.user;
  const userId = user?.id;
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Member';
  const canManage = canAccessLeaderTools(userRole);
  const isModerator = isAdminRole(userRole);

  const [channels, setChannels] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [members, setMembers] = useState([]);
  const [loadingChannels, setLoadingChannels] = useState(hasSupabaseConfig);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [reactingFor, setReactingFor] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [channelForm, setChannelForm] = useState({ name: '', description: '', category: 'Community', isPrivate: false });
  const [pickedMembers, setPickedMembers] = useState([]); // user ids selected for a private chat
  const [creatingChannel, setCreatingChannel] = useState(false);

  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [channelMemberIds, setChannelMemberIds] = useState([]); // members of the active private channel
  const [addPicked, setAddPicked] = useState([]);
  const [unreadByChannel, setUnreadByChannel] = useState({}); // channelId -> unread count

  const [pushState, setPushState] = useState(() => pushPermission());
  const [pushDismissed, setPushDismissed] = useState(false);
  const enablePush = async () => { setPushState(await enablePushNotifications(userId, activeOrgId)); };

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

  // ── Load mentionable org members ─────────────────────────────────────────────
  useEffect(() => {
    if (!hasSupabaseConfig || !activeOrgId) return;
    (async () => {
      // org_members() is a SECURITY DEFINER RPC that lists co-members by actual
      // membership (not just active org), so multi-org members are included.
      const { data } = await supabase.rpc('org_members', { org_id: activeOrgId });
      setMembers((data || []).map((p) => ({ id: p.id, display: p.full_name || p.email })));
    })();
  }, [activeOrgId]);

  // ── Mark chat as seen on entry: clear mentions + stamp last-read time ─────────
  useEffect(() => {
    if (!hasSupabaseConfig || !userId) return;
    (async () => {
      const now = new Date().toISOString();
      await supabase.from('chat_mentions')
        .update({ read_at: now })
        .eq('mentioned_user_id', userId)
        .is('read_at', null);
      await supabase.from('profiles').update({ chat_last_read_at: now }).eq('id', userId);
      onChatSeen?.();
    })();
  }, [userId, onChatSeen]);

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
      const { data: rx } = await supabase.from('chat_message_reactions').select('*').in('message_id', ids);
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

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const activeChannel = channels.find((c) => c.id === activeChannelId) || null;

  const groupedChannels = useMemo(() => {
    const groups = {};
    channels.forEach((c) => {
      const key = c.is_private ? 'Private' : (c.category || 'General');
      (groups[key] ||= []).push(c);
    });
    // Keep "Private" pinned to the bottom of the list.
    return Object.entries(groups).sort(([a], [b]) => (a === 'Private' ? 1 : b === 'Private' ? -1 : 0));
  }, [channels]);

  const reactionsByMessage = useMemo(() => {
    const map = {};
    reactions.forEach((r) => { (map[r.message_id] ||= []).push(r); });
    return map;
  }, [reactions]);

  const messagesById = useMemo(() => Object.fromEntries(messages.map((m) => [m.id, m])), [messages]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const attachImage = (file) => {
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const onPickImage = (event) => attachImage(event.target.files?.[0]);

  // Paste an image directly into the composer (clipboard screenshots, copied photos).
  const onPaste = (event) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type?.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          attachImage(file);
        }
        return;
      }
    }
  };

  const uploadImage = async (file) => {
    const ext = file.name.split('.').pop();
    const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('chat-images').upload(path, file);
    if (upErr) throw upErr;
    return supabase.storage.from('chat-images').getPublicUrl(path).data.publicUrl;
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if ((!body && !imageFile) || !activeChannel) return;
    setSending(true);
    setError('');

    let imageUrl = null;
    if (imageFile) {
      try {
        imageUrl = await uploadImage(imageFile);
      } catch (err) {
        setError(err.message || 'Could not upload image.');
        setSending(false);
        return;
      }
    }

    const { data, error: sendErr } = await supabase
      .from('chat_messages')
      .insert({
        channel_id: activeChannel.id,
        organization_id: activeOrgId,
        author_id: userId,
        author_name: displayName,
        body: body || null,
        image_url: imageUrl,
        reply_to_id: replyTo?.id || null,
      })
      .select('*')
      .single();

    if (sendErr) {
      setError(sendErr.message || 'Could not send your message.');
      setSending(false);
      return;
    }

    setMessages((cur) => (cur.some((m) => m.id === data.id) ? cur : [...cur, data]));

    const mentionIds = parseMentionIds(body).filter((id) => id !== userId);
    if (mentionIds.length) {
      await supabase.from('chat_mentions').insert(mentionIds.map((id) => ({
        message_id: data.id,
        channel_id: activeChannel.id,
        organization_id: activeOrgId,
        mentioned_user_id: id,
        actor_id: userId,
        actor_name: displayName,
      })));
      // Fire a web push to mentioned users (best-effort).
      supabase.functions.invoke('send-push', {
        body: {
          userIds: mentionIds,
          title: `${displayName} mentioned you in #${activeChannel.name}`,
          body: (body || 'sent a photo').replace(MENTION_RE, '@$1').slice(0, 120),
          url: '/chat',
        },
      }).catch(() => {});
    }

    setDraft('');
    setImageFile(null);
    setImagePreview(null);
    setReplyTo(null);
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
    const isPrivate = canManage ? channelForm.isPrivate : true; // non-leaders can only make private chats
    const name = channelForm.name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!name) { setError('Please enter a name.'); return; }
    setCreatingChannel(true);
    setError('');
    const { data, error: createErr } = await supabase
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
    if (createErr) {
      setError(createErr.message?.includes('duplicate') ? 'A chat with that name already exists.' : (createErr.message || 'Could not create chat.'));
      setCreatingChannel(false);
      return;
    }
    if (isPrivate) {
      const ids = Array.from(new Set([userId, ...pickedMembers]));
      await supabase.from('chat_channel_members').insert(ids.map((uid) => ({
        channel_id: data.id, user_id: uid, added_by: userId,
      })));
    }
    setChannels((cur) => (cur.some((c) => c.id === data.id) ? cur : [...cur, data]));
    setActiveChannelId(data.id);
    setChannelForm({ name: '', description: '', category: 'Community', isPrivate: false });
    setPickedMembers([]);
    setChannelModalOpen(false);
    setCreatingChannel(false);
  };

  // Load member ids for the active channel (used by the "add people" picker).
  useEffect(() => {
    (async () => {
      if (!hasSupabaseConfig || !activeChannelId) { setChannelMemberIds([]); return; }
      const { data } = await supabase.from('chat_channel_members').select('user_id').eq('channel_id', activeChannelId);
      setChannelMemberIds((data || []).map((m) => m.user_id));
    })();
  }, [activeChannelId]);

  const addPeopleToChannel = async () => {
    if (!activeChannel || !addPicked.length) { setAddPeopleOpen(false); return; }
    await supabase.from('chat_channel_members').insert(addPicked.map((uid) => ({
      channel_id: activeChannel.id, user_id: uid, added_by: userId,
    })));
    setChannelMemberIds((cur) => Array.from(new Set([...cur, ...addPicked])));
    setAddPicked([]);
    setAddPeopleOpen(false);
  };

  // Realtime: when I'm added to a private chat, refresh the channel list.
  useEffect(() => {
    if (!hasSupabaseConfig || !userId || typeof supabase.channel !== 'function') return undefined;
    const channel = supabase
      .channel(`chat-membership-${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_channel_members', filter: `user_id=eq.${userId}` },
        () => loadChannels())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, loadChannels]);

  // ── Per-channel unread badges ────────────────────────────────────────────────
  const loadUnread = useCallback(async () => {
    if (!hasSupabaseConfig || !activeOrgId) return;
    const { data } = await supabase.rpc('chat_unread_counts');
    const map = {};
    (data || []).forEach((r) => { map[r.channel_id] = Number(r.unread); });
    setUnreadByChannel(map);
  }, [activeOrgId]);

  useEffect(() => { (async () => { await loadUnread(); })(); }, [loadUnread]);

  const markChannelRead = useCallback(async (channelId) => {
    if (!channelId || !userId) return;
    setUnreadByChannel((cur) => {
      if (!cur[channelId]) return cur;
      const next = { ...cur };
      delete next[channelId];
      return next;
    });
    await supabase.from('chat_channel_reads').upsert(
      { channel_id: channelId, user_id: userId, last_read_at: new Date().toISOString() },
      { onConflict: 'channel_id,user_id' },
    );
  }, [userId]);

  // Mark the active channel read whenever it changes or receives messages.
  useEffect(() => {
    (async () => { if (activeChannelId) await markChannelRead(activeChannelId); })();
  }, [activeChannelId, messages.length, markChannelRead]);

  // Realtime: bump per-channel unread for messages arriving in other channels.
  useEffect(() => {
    if (!hasSupabaseConfig || !userId || typeof supabase.channel !== 'function') return undefined;
    const channel = supabase
      .channel(`chat-unread-side-${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const msg = payload.new;
          if (!msg || msg.author_id === userId || msg.channel_id === activeChannelId) return;
          setUnreadByChannel((cur) => ({ ...cur, [msg.channel_id]: (cur[msg.channel_id] || 0) + 1 }));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, activeChannelId]);

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

  const showPushBanner = isPushSupported() && pushState === 'default' && !pushDismissed;

  return (
    <div className="chat-page">
      {showPushBanner && (
        <div className="chat-push-banner card">
          <Bell size={18} />
          <span>Get notified when someone @mentions you.</span>
          <div className="chat-push-actions">
            <button type="button" className="btn-primary" onClick={enablePush}>Enable</button>
            <button type="button" className="btn-secondary" onClick={() => setPushDismissed(true)}>Not now</button>
          </div>
        </div>
      )}
      <div className="chat-shell card">
        {/* Channel sidebar */}
        <aside className="chat-sidebar">
          <div className="chat-sidebar-head">
            <h2>Channels</h2>
            <button
              type="button"
              className="chat-new-channel"
              onClick={() => { setChannelForm({ name: '', description: '', category: 'Community', isPrivate: !canManage }); setPickedMembers([]); setChannelModalOpen(true); setError(''); }}
              title={canManage ? 'New channel or private chat' : 'New private chat'}
            >
              <Plus size={16} />
            </button>
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
                    className={`chat-channel-btn ${activeChannelId === c.id ? 'active' : ''} ${unreadByChannel[c.id] && activeChannelId !== c.id ? 'has-unread' : ''}`}
                    onClick={() => setActiveChannelId(c.id)}
                  >
                    {c.is_private ? <Lock size={14} /> : <Hash size={15} />}
                    <span>{c.name}</span>
                    {unreadByChannel[c.id] > 0 && activeChannelId !== c.id && (
                      <span className="chat-channel-unread">{unreadByChannel[c.id] > 99 ? '99+' : unreadByChannel[c.id]}</span>
                    )}
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
                  {activeChannel.is_private ? <Lock size={16} /> : <Hash size={18} />}
                  <strong>{activeChannel.name}</strong>
                </div>
                {activeChannel.description && <span className="chat-main-desc">{activeChannel.description}</span>}
                {activeChannel.is_private && (
                  <button type="button" className="chat-add-people" onClick={() => { setAddPicked([]); setAddPeopleOpen(true); }} title="Add people">
                    <UserPlus size={15} />
                    <span>Add people</span>
                  </button>
                )}
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
              const parent = m.reply_to_id ? messagesById[m.reply_to_id] : null;
              return (
                <div key={m.id} className="chat-message">
                  <div className="chat-msg-avatar">{(m.author_name || 'M')[0].toUpperCase()}</div>
                  <div className="chat-msg-body">
                    {m.reply_to_id && (
                      <div className="chat-reply-quote">
                        <CornerUpRight size={12} />
                        {parent ? (
                          <><strong>{parent.author_name || 'Member'}</strong><span>{previewText(parent).slice(0, 90)}</span></>
                        ) : <span className="chat-muted">original message deleted</span>}
                      </div>
                    )}
                    <div className="chat-msg-meta">
                      <strong>{m.author_name || 'Member'}</strong>
                      <span>{formatTime(m.created_at)}</span>
                    </div>
                    {m.body && <p className="chat-msg-text">{renderBody(m.body)}</p>}
                    {m.image_url && (
                      <a href={m.image_url} target="_blank" rel="noreferrer" className="chat-msg-image-link">
                        <img src={m.image_url} alt="shared" className="chat-msg-image" />
                      </a>
                    )}
                    <div className="chat-msg-reactions">
                      {Object.entries(grouped).map(([emoji, list]) => {
                        const mine = list.some((r) => r.user_id === userId);
                        return (
                          <button key={emoji} type="button" className={`chat-reaction ${mine ? 'mine' : ''}`} onClick={() => toggleReaction(m.id, emoji)}>
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
                      <button type="button" className="chat-react-add" onClick={() => setReplyTo(m)} title="Reply">
                        <Reply size={15} />
                      </button>
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

          {replyTo && (
            <div className="chat-reply-bar">
              <CornerUpRight size={14} />
              <span>Replying to <strong>{replyTo.author_name || 'Member'}</strong>: {previewText(replyTo).slice(0, 60)}</span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={14} /></button>
            </div>
          )}

          {imagePreview && (
            <div className="chat-image-preview">
              <img src={imagePreview} alt="preview" />
              <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} aria-label="Remove image"><X size={14} /></button>
            </div>
          )}

          <form className="chat-composer" onSubmit={sendMessage} onPaste={onPaste}>
            <label className="chat-attach" title="Attach image">
              <ImagePlus size={18} />
              <input type="file" accept="image/*" onChange={onPickImage} disabled={!activeChannel} hidden />
            </label>
            <MentionsInput
              className="chat-mentions-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={activeChannel ? `Message #${activeChannel.name} — use @ to mention` : 'Select a channel…'}
              disabled={!activeChannel}
              allowSuggestionsAboveCursor
            >
              <Mention
                trigger="@"
                data={members}
                markup="@[__display__](__id__)"
                displayTransform={(id, display) => `@${display}`}
                onAdd={() => null}
                onRemove={() => null}
                appendSpaceOnAdd
              />
            </MentionsInput>
            <button type="submit" className="btn-primary chat-send" disabled={sending || (!draft.trim() && !imageFile) || !activeChannel}>
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
                <h2>{(canManage ? channelForm.isPrivate : true) ? 'New Private Chat' : 'New Channel'}</h2>
                <button type="button" className="chat-modal-close" onClick={() => setChannelModalOpen(false)} aria-label="Close"><X size={18} /></button>
              </div>
              {canManage && (
                <label className="chat-inline-check">
                  <input type="checkbox" checked={channelForm.isPrivate} onChange={(e) => setChannelForm((f) => ({ ...f, isPrivate: e.target.checked }))} />
                  <span>Private chat (only people you add can see it)</span>
                </label>
              )}
              <label>
                <span>{(canManage ? channelForm.isPrivate : true) ? 'Chat name' : 'Channel name'}</span>
                <input type="text" value={channelForm.name} onChange={(e) => setChannelForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. youth-group" />
              </label>
              {canManage && !channelForm.isPrivate && (
                <label>
                  <span>Category</span>
                  <input type="text" value={channelForm.category} onChange={(e) => setChannelForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. Community, Faith" />
                </label>
              )}
              <label>
                <span>Description (optional)</span>
                <input type="text" value={channelForm.description} onChange={(e) => setChannelForm((f) => ({ ...f, description: e.target.value }))} placeholder="What's this chat for?" />
              </label>
              {(canManage ? channelForm.isPrivate : true) && (
                <div className="chat-member-picker">
                  <span className="chat-member-picker-label">Add people</span>
                  <div className="chat-member-list">
                    {members.filter((m) => m.id !== userId).map((m) => {
                      const checked = pickedMembers.includes(m.id);
                      return (
                        <label key={m.id} className="chat-member-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setPickedMembers((cur) => (e.target.checked ? [...cur, m.id] : cur.filter((id) => id !== m.id)))}
                          />
                          <span>{m.display}</span>
                        </label>
                      );
                    })}
                    {members.filter((m) => m.id !== userId).length === 0 && <p className="chat-muted">No other members yet.</p>}
                  </div>
                </div>
              )}
              <div className="chat-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setChannelModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={creatingChannel || !channelForm.name.trim()}>
                  {creatingChannel ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {addPeopleOpen && activeChannel && (
        <div className="chat-modal-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setAddPeopleOpen(false); }}>
          <div className="chat-modal card" role="dialog" aria-modal="true" aria-label="Add people">
            <div className="chat-modal-form">
              <div className="chat-modal-head">
                <h2>Add people to #{activeChannel.name}</h2>
                <button type="button" className="chat-modal-close" onClick={() => setAddPeopleOpen(false)} aria-label="Close"><X size={18} /></button>
              </div>
              <div className="chat-member-picker">
                <div className="chat-member-list">
                  {members.filter((m) => !channelMemberIds.includes(m.id)).map((m) => {
                    const checked = addPicked.includes(m.id);
                    return (
                      <label key={m.id} className="chat-member-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setAddPicked((cur) => (e.target.checked ? [...cur, m.id] : cur.filter((id) => id !== m.id)))}
                        />
                        <span>{m.display}</span>
                      </label>
                    );
                  })}
                  {members.filter((m) => !channelMemberIds.includes(m.id)).length === 0 && <p className="chat-muted">Everyone is already in this chat.</p>}
                </div>
              </div>
              <div className="chat-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setAddPeopleOpen(false)}>Cancel</button>
                <button type="button" className="btn-primary" onClick={addPeopleToChannel} disabled={!addPicked.length}>Add</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
