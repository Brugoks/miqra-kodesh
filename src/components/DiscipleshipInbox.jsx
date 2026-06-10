import { useCallback, useEffect, useMemo, useState } from 'react';
import './DiscipleshipInbox.css';
import {
  ArchiveRestore,
  CheckCircle2,
  Clock3,
  Edit3,
  Inbox,
  Mail,
  MailOpen,
  PenLine,
  RefreshCw,
  Reply,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';

const folderMeta = {
  inbox: { label: 'Inbox', icon: Inbox },
  drafts: { label: 'Drafts', icon: Edit3 },
  sent: { label: 'Sent', icon: Send },
  trash: { label: 'Trash', icon: Trash2 },
};

const emptyComposer = {
  id: null,
  recipientEmail: '',
  recipientId: null,
  recipientName: '',
  subject: '',
  body: '',
};

const formatDateTime = (value) => {
  if (!value) return 'Not sent yet';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
};

const normalizeEmail = (value) => value.trim().toLowerCase();

export default function DiscipleshipInbox({ session }) {
  const user = session?.user;
  const userEmail = normalizeEmail(user?.email || '');
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Student';

  const [folder, setFolder] = useState('inbox');
  const [messages, setMessages] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [composer, setComposer] = useState(emptyComposer);
  const [isComposing, setIsComposing] = useState(false);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  const loadMailbox = useCallback(async () => {
    if (!hasSupabaseConfig || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const [{ data: mailData, error: mailError }, { data: profileData, error: profileError }] = await Promise.all([
      supabase
        .from('discipleship_messages')
        .select('*')
        .order('updated_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, email, full_name')
        .order('full_name', { ascending: true }),
    ]);

    if (mailError) {
      setError(mailError.message || 'Could not load your discipleship inbox.');
      setMessages([]);
    } else {
      setMessages(mailData || []);
    }

    if (!profileError) {
      setProfiles((profileData || []).filter((profile) => profile.email));
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    let isActive = true;

    const loadInitialMailbox = async () => {
      if (!hasSupabaseConfig || !user) {
        if (isActive) setLoading(false);
        return;
      }

      const [{ data: mailData, error: mailError }, { data: profileData, error: profileError }] = await Promise.all([
        supabase
          .from('discipleship_messages')
          .select('*')
          .order('updated_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, email, full_name')
          .order('full_name', { ascending: true }),
      ]);

      if (!isActive) return;

      if (mailError) {
        setError(mailError.message || 'Could not load your discipleship inbox.');
        setMessages([]);
      } else {
        setMessages(mailData || []);
      }

      if (!profileError) {
        setProfiles((profileData || []).filter((profile) => profile.email));
      }

      setLoading(false);
    };

    loadInitialMailbox();

    return () => {
      isActive = false;
    };
  }, [user]);

  const isSender = useCallback((message) => message.sender_id === user?.id, [user?.id]);
  const isRecipient = useCallback((message) => (
    message.recipient_id === user?.id || normalizeEmail(message.recipient_email || '') === userEmail
  ), [user?.id, userEmail]);

  const folderMessages = useMemo(() => messages.filter((message) => {
    const sender = isSender(message);
    const recipient = isRecipient(message);

    if (folder === 'inbox') {
      return recipient && message.status === 'sent' && !message.recipient_trashed_at;
    }

    if (folder === 'sent') {
      return sender && message.status === 'sent' && !message.sender_trashed_at;
    }

    if (folder === 'drafts') {
      return sender && message.status === 'draft' && !message.sender_trashed_at;
    }

    return (sender && message.sender_trashed_at) || (recipient && message.recipient_trashed_at);
  }), [folder, isRecipient, isSender, messages]);

  const unreadCount = useMemo(() => messages.filter((message) => (
    isRecipient(message) && message.status === 'sent' && !message.read_at && !message.recipient_trashed_at
  )).length, [isRecipient, messages]);

  const selectedMessage = folderMessages.find((message) => message.id === selectedId) || null;

  useEffect(() => {
    if (!selectedMessage) {
      return;
    }

    if (folder === 'inbox' && isRecipient(selectedMessage) && !selectedMessage.read_at) {
      const markRead = async () => {
        const readAt = new Date().toISOString();
        setMessages((current) => current.map((message) => (
          message.id === selectedMessage.id ? { ...message, read_at: readAt } : message
        )));
        await supabase
          .from('discipleship_messages')
          .update({ read_at: readAt, updated_at: readAt })
          .eq('id', selectedMessage.id);
      };

      markRead();
    }
  }, [folder, isRecipient, selectedId, selectedMessage]);

  const resetComposer = () => {
    setComposer(emptyComposer);
    setIsComposing(false);
    setError('');
    setStatusText('');
  };

  const handleRecipientChange = (value) => {
    const selectedProfile = profiles.find((profile) => profile.id === value);
    if (selectedProfile) {
      setComposer((current) => ({
        ...current,
        recipientId: selectedProfile.id,
        recipientEmail: selectedProfile.email || '',
        recipientName: selectedProfile.full_name || selectedProfile.email || '',
      }));
      return;
    }

    setComposer((current) => ({
      ...current,
      recipientId: null,
      recipientEmail: value,
      recipientName: '',
    }));
  };

  const openDraft = (message) => {
    setComposer({
      id: message.id,
      recipientEmail: message.recipient_email || '',
      recipientId: message.recipient_id || null,
      recipientName: message.recipient_name || '',
      subject: message.subject || '',
      body: message.body || '',
    });
    setIsComposing(true);
    setFolder('drafts');
    setSelectedId(message.id);
    setError('');
    setStatusText('');
  };

  const startReply = (message) => {
    setComposer({
      id: null,
      recipientEmail: message.sender_email || '',
      recipientId: message.sender_id || null,
      recipientName: message.sender_name || message.sender_email || '',
      subject: message.subject?.toLowerCase().startsWith('re:') ? message.subject : `Re: ${message.subject || 'Discipleship message'}`,
      body: '',
    });
    setIsComposing(true);
    setError('');
    setStatusText('');
  };

  const saveMessage = async (nextStatus) => {
    if (!user) return;

    const recipientEmail = normalizeEmail(composer.recipientEmail);
    const subject = composer.subject.trim();
    const body = composer.body.trim();

    if (nextStatus === 'sent' && (!recipientEmail || !subject || !body)) {
      setError('Recipient, subject, and message are required before sending.');
      return;
    }

    if (nextStatus === 'draft' && !recipientEmail && !subject && !body) {
      setError('Add a recipient, subject, or message before saving a draft.');
      return;
    }

    const matchedProfile = profiles.find((profile) => normalizeEmail(profile.email || '') === recipientEmail);
    const timestamp = new Date().toISOString();
    const payload = {
      sender_id: user.id,
      sender_email: user.email || '',
      sender_name: displayName,
      recipient_id: matchedProfile?.id || composer.recipientId || null,
      recipient_email: recipientEmail,
      recipient_name: matchedProfile?.full_name || composer.recipientName || recipientEmail,
      subject,
      body,
      status: nextStatus,
      sent_at: nextStatus === 'sent' ? timestamp : null,
      sender_trashed_at: null,
      updated_at: timestamp,
    };

    setSaving(true);
    setError('');
    setStatusText('');

    const query = composer.id
      ? supabase.from('discipleship_messages').update(payload).eq('id', composer.id).select('*').single()
      : supabase.from('discipleship_messages').insert(payload).select('*').single();

    const { data, error: saveError } = await query;

    if (saveError) {
      setError(saveError.message || 'Could not save this message.');
      setSaving(false);
      return;
    }

    setMessages((current) => {
      const remaining = current.filter((message) => message.id !== data.id);
      return [data, ...remaining];
    });
    setFolder(nextStatus === 'sent' ? 'sent' : 'drafts');
    setSelectedId(data.id);
    setComposer(emptyComposer);
    setIsComposing(false);
    setSaving(false);
    setStatusText(nextStatus === 'sent' ? 'Message sent.' : 'Draft saved.');
  };

  const moveMessage = async (message, action) => {
    const now = new Date().toISOString();
    const sender = isSender(message);
    const recipient = isRecipient(message);
    const payload = { updated_at: now };

    if (sender) payload.sender_trashed_at = action === 'trash' ? now : null;
    if (recipient) payload.recipient_trashed_at = action === 'trash' ? now : null;

    const { data, error: moveError } = await supabase
      .from('discipleship_messages')
      .update(payload)
      .eq('id', message.id)
      .select('*')
      .single();

    if (moveError) {
      setError(moveError.message || 'Could not update this message.');
      return;
    }

    setMessages((current) => current.map((item) => (item.id === message.id ? data : item)));
    setSelectedId(null);
    setStatusText(action === 'trash' ? 'Message moved to trash.' : 'Message restored.');
  };

  const folderCounts = useMemo(() => {
    const counts = { inbox: 0, drafts: 0, sent: 0, trash: 0 };
    messages.forEach((message) => {
      const sender = isSender(message);
      const recipient = isRecipient(message);
      if (recipient && message.status === 'sent' && !message.recipient_trashed_at) counts.inbox += 1;
      if (sender && message.status === 'draft' && !message.sender_trashed_at) counts.drafts += 1;
      if (sender && message.status === 'sent' && !message.sender_trashed_at) counts.sent += 1;
      if ((sender && message.sender_trashed_at) || (recipient && message.recipient_trashed_at)) counts.trash += 1;
    });
    return counts;
  }, [isRecipient, isSender, messages]);

  if (!hasSupabaseConfig) {
    return (
      <div className="discipleship-page">
        <section className="discipleship-header card">
          <Mail size={34} />
          <div>
            <h1>Discipleship Mail</h1>
            <p>Connect Supabase to use inbox, drafts, sent, and trash.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="discipleship-page">
      <section className="discipleship-header card">
        <div className="discipleship-title">
          <Mail size={34} />
          <div>
            <h1>Discipleship Mail</h1>
            <p>Send encouragement, questions, and follow-up notes as discipleship takes shape.</p>
          </div>
        </div>
        <div className="discipleship-actions">
          <button type="button" className="btn-secondary icon-btn" onClick={loadMailbox} disabled={loading} title="Refresh mailbox">
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            className="btn-primary compose-btn"
            onClick={() => {
              setComposer(emptyComposer);
              setIsComposing(true);
              setError('');
              setStatusText('');
            }}
          >
            <PenLine size={16} />
            <span>Compose</span>
          </button>
        </div>
      </section>

      <section className="discipleship-shell">
        <aside className="mail-folders card">
          {Object.entries(folderMeta).map(([key, item]) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={key}
                className={`folder-btn ${folder === key ? 'active' : ''}`}
                onClick={() => {
                  setFolder(key);
                  setSelectedId(null);
                  setStatusText('');
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                <strong>{key === 'inbox' && unreadCount ? unreadCount : folderCounts[key]}</strong>
              </button>
            );
          })}
        </aside>

        <div className="mail-list card">
          <div className="mail-panel-heading">
            <h2>{folderMeta[folder].label}</h2>
            <span>{loading ? 'Loading...' : `${folderMessages.length} message${folderMessages.length === 1 ? '' : 's'}`}</span>
          </div>
          {folderMessages.length === 0 ? (
            <div className="mail-empty">
              <MailOpen size={28} />
              <p>{loading ? 'Loading your messages...' : 'No messages here yet.'}</p>
            </div>
          ) : (
            <div className="message-list">
              {folderMessages.map((message) => {
                const unread = folder === 'inbox' && !message.read_at;
                const name = folder === 'sent' || folder === 'drafts'
                  ? message.recipient_name || message.recipient_email
                  : message.sender_name || message.sender_email;
                return (
                  <button
                    type="button"
                    key={message.id}
                    className={`message-row ${selectedMessage?.id === message.id ? 'active' : ''} ${unread ? 'unread' : ''}`}
                    onClick={() => setSelectedId(message.id)}
                    onDoubleClick={() => message.status === 'draft' && isSender(message) && openDraft(message)}
                  >
                    <div className="message-row-top">
                      <strong>{name || 'Unknown user'}</strong>
                      <span>{formatDateTime(message.sent_at || message.updated_at)}</span>
                    </div>
                    <div className="message-row-subject">{message.subject || '(No subject)'}</div>
                    <p>{message.body || 'Empty draft'}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <article className="mail-reader card">
          {isComposing ? (
            <form className="compose-form" onSubmit={(event) => { event.preventDefault(); saveMessage('sent'); }}>
              <div className="mail-panel-heading">
                <h2>{composer.id ? 'Edit Draft' : 'New Message'}</h2>
              </div>
              <label>
                <span>To</span>
                <select
                  value={composer.recipientId || composer.recipientEmail}
                  onChange={(event) => handleRecipientChange(event.target.value)}
                >
                  <option value="">Choose a user or type email below</option>
                  {profiles
                    .filter((profile) => normalizeEmail(profile.email || '') !== userEmail)
                    .map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.full_name || profile.email} ({profile.email})
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={composer.recipientEmail}
                  onChange={(event) => handleRecipientChange(event.target.value)}
                  placeholder="student@example.com"
                />
              </label>
              <label>
                <span>Subject</span>
                <input
                  type="text"
                  value={composer.subject}
                  onChange={(event) => setComposer((current) => ({ ...current, subject: event.target.value }))}
                  placeholder="Prayer follow-up"
                />
              </label>
              <label>
                <span>Message</span>
                <textarea
                  rows={10}
                  value={composer.body}
                  onChange={(event) => setComposer((current) => ({ ...current, body: event.target.value }))}
                  placeholder="Write your message..."
                />
              </label>
              <div className="compose-actions">
                <button type="button" className="btn-secondary" onClick={resetComposer}>Cancel</button>
                <button type="button" className="btn-secondary icon-text-btn" onClick={() => saveMessage('draft')} disabled={saving}>
                  <Save size={15} />
                  <span>{saving ? 'Saving...' : 'Save Draft'}</span>
                </button>
                <button type="submit" className="btn-primary icon-text-btn" disabled={saving}>
                  <Send size={15} />
                  <span>{saving ? 'Sending...' : 'Send'}</span>
                </button>
              </div>
            </form>
          ) : selectedMessage ? (
            <div className="reader-content">
              <div className="reader-header">
                <div>
                  <h2>{selectedMessage.subject || '(No subject)'}</h2>
                  <p>
                    <strong>From:</strong> {selectedMessage.sender_name || selectedMessage.sender_email || 'Unknown user'}
                  </p>
                  <p>
                    <strong>To:</strong> {selectedMessage.recipient_name || selectedMessage.recipient_email || 'No recipient yet'}
                  </p>
                </div>
                <span className={`message-status ${selectedMessage.status}`}>
                  {selectedMessage.status === 'draft' ? <Clock3 size={14} /> : <CheckCircle2 size={14} />}
                  {selectedMessage.status}
                </span>
              </div>
              <div className="reader-date">{formatDateTime(selectedMessage.sent_at || selectedMessage.updated_at)}</div>
              <div className="reader-body">
                {selectedMessage.body || 'No message body yet.'}
              </div>
              <div className="reader-actions">
                {selectedMessage.status === 'draft' && isSender(selectedMessage) && (
                  <button type="button" className="btn-primary icon-text-btn" onClick={() => openDraft(selectedMessage)}>
                    <Edit3 size={15} />
                    <span>Edit Draft</span>
                  </button>
                )}
                {selectedMessage.status === 'sent' && isRecipient(selectedMessage) && folder !== 'trash' && (
                  <button type="button" className="btn-secondary icon-text-btn" onClick={() => startReply(selectedMessage)}>
                    <Reply size={15} />
                    <span>Reply</span>
                  </button>
                )}
                {folder === 'trash' ? (
                  <button type="button" className="btn-secondary icon-text-btn" onClick={() => moveMessage(selectedMessage, 'restore')}>
                    <ArchiveRestore size={15} />
                    <span>Restore</span>
                  </button>
                ) : (
                  <button type="button" className="btn-danger icon-text-btn" onClick={() => moveMessage(selectedMessage, 'trash')}>
                    <Trash2 size={15} />
                    <span>Trash</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="mail-empty reader-empty">
              <Inbox size={30} />
              <p>Select a message or compose a new one.</p>
            </div>
          )}

          {(error || statusText) && (
            <p className={`mail-status ${error ? 'error' : 'success'}`}>
              {error || statusText}
            </p>
          )}
        </article>
      </section>
    </div>
  );
}
