/*
  SUPABASE SETUP — run this SQL in your Supabase SQL editor once:

  create table public.sermon_notes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    user_email text,
    user_name text,
    title text not null,
    category text not null default 'sermon',
    scripture_ref text,
    content text,
    is_shared boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table public.sermon_feedback_requests (
    id uuid primary key default gen_random_uuid(),
    note_id uuid references public.sermon_notes(id) on delete cascade,
    note_title text,
    requester_id uuid references auth.users(id) on delete cascade,
    requester_email text,
    requester_name text,
    recipient_email text not null,
    message text,
    status text not null default 'pending',
    created_at timestamptz not null default now()
  );

  create table public.sermon_feedback (
    id uuid primary key default gen_random_uuid(),
    note_id uuid references public.sermon_notes(id) on delete cascade,
    request_id uuid references public.sermon_feedback_requests(id) on delete set null,
    responder_id uuid references auth.users(id) on delete cascade,
    responder_email text,
    responder_name text,
    content text not null,
    created_at timestamptz not null default now()
  );

  alter table public.sermon_notes enable row level security;
  alter table public.sermon_feedback_requests enable row level security;
  alter table public.sermon_feedback enable row level security;

  create policy "View shared or own notes" on public.sermon_notes
    for select using (is_shared = true or user_id = auth.uid());
  create policy "Insert own notes" on public.sermon_notes
    for insert with check (user_id = auth.uid());
  create policy "Update own notes" on public.sermon_notes
    for update using (user_id = auth.uid());
  create policy "Delete own notes" on public.sermon_notes
    for delete using (user_id = auth.uid());

  create policy "View own requests" on public.sermon_feedback_requests
    for select using (requester_id = auth.uid() or recipient_email = auth.email());
  create policy "Insert feedback requests" on public.sermon_feedback_requests
    for insert with check (requester_id = auth.uid());
  create policy "Update request status" on public.sermon_feedback_requests
    for update using (recipient_email = auth.email());

  create policy "View feedback on visible notes" on public.sermon_feedback
    for select using (
      exists (select 1 from public.sermon_notes where id = note_id and (is_shared = true or user_id = auth.uid()))
      or responder_id = auth.uid()
    );
  create policy "Insert feedback" on public.sermon_feedback
    for insert with check (responder_id = auth.uid());
*/

import { useState, useEffect } from 'react';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import {
  Mic2, PlusCircle, ChevronDown, ChevronUp, Trash2, Edit3,
  Share2, MessageSquare, Send, Globe, Lock, BookOpen, X, Check,
  InboxIcon, CornerDownRight
} from 'lucide-react';

const LEADER_ROLES = ['admin', 'student_leader', 'parent_leader'];

const CATEGORIES = [
  { value: 'message',  label: 'Message',  color: '#1e40af', bg: '#dbeafe' },
  { value: 'sermon',   label: 'Sermon',   color: '#065f46', bg: '#d1fae5' },
  { value: 'bumper',   label: 'Bumper',   color: '#7c3aed', bg: '#ede9fe' },
];

function getCat(val) {
  return CATEGORIES.find(c => c.value === val) || CATEGORIES[0];
}

function formatDate(str) {
  if (!str) return '';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const BLANK_FORM = { title: '', category: 'sermon', scripture_ref: '', content: '', is_shared: false };

export default function SermonNotes({ session, userRole }) {
  const isLeader = LEADER_ROLES.includes(userRole);
  const userId = session?.user?.id;
  const userEmail = session?.user?.email;
  const userName = session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name
    || userEmail?.split('@')[0]
    || 'Unknown';
  const isConfigured = hasSupabaseConfig && !!userId;

  const [activeTab, setActiveTab] = useState(isLeader ? 'my' : 'shared');
  const [myNotes, setMyNotes] = useState([]);
  const [sharedNotes, setSharedNotes] = useState([]);
  const [inboxRequests, setInboxRequests] = useState([]);
  const [feedbackByNote, setFeedbackByNote] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Create / edit form
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Feedback request form (per note)
  const [requestingFor, setRequestingFor] = useState(null);
  const [reqEmail, setReqEmail] = useState('');
  const [reqMessage, setReqMessage] = useState('');
  const [reqSending, setReqSending] = useState(false);
  const [reqError, setReqError] = useState('');

  // Inbox response form
  const [respondingTo, setRespondingTo] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [responseSending, setResponseSending] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isConfigured) {
      loadAll();
    } else {
      setLoading(false);
    }
  }, [isConfigured]);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadMyNotes(), loadSharedNotes(), isLeader ? loadInbox() : Promise.resolve()]);
    setLoading(false);
  }

  async function loadMyNotes() {
    if (!userId) return;
    const { data } = await supabase
      .from('sermon_notes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (data) {
      setMyNotes(data);
      await loadFeedbackForNotes(data.map(n => n.id));
    }
  }

  async function loadSharedNotes() {
    const { data } = await supabase
      .from('sermon_notes')
      .select('*')
      .eq('is_shared', true)
      .order('created_at', { ascending: false });
    if (data) setSharedNotes(data);
  }

  async function loadInbox() {
    if (!userEmail) return;
    const { data } = await supabase
      .from('sermon_feedback_requests')
      .select('*')
      .eq('recipient_email', userEmail)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (data) setInboxRequests(data);
  }

  async function loadFeedbackForNotes(noteIds) {
    if (!noteIds.length) return;
    const { data } = await supabase
      .from('sermon_feedback')
      .select('*')
      .in('note_id', noteIds)
      .order('created_at', { ascending: true });
    if (data) {
      const map = {};
      data.forEach(f => {
        if (!map[f.note_id]) map[f.note_id] = [];
        map[f.note_id].push(f);
      });
      setFeedbackByNote(map);
    }
  }

  async function loadFeedbackForNote(noteId) {
    const { data } = await supabase
      .from('sermon_feedback')
      .select('*')
      .eq('note_id', noteId)
      .order('created_at', { ascending: true });
    if (data) setFeedbackByNote(prev => ({ ...prev, [noteId]: data }));
  }

  function openCreate() {
    setEditingNote(null);
    setForm(BLANK_FORM);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(note) {
    setEditingNote(note);
    setForm({
      title: note.title,
      category: note.category,
      scripture_ref: note.scripture_ref || '',
      content: note.content || '',
      is_shared: note.is_shared,
    });
    setFormError('');
    setShowForm(true);
    setExpandedId(null);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    setSaving(true);
    setFormError('');
    const payload = {
      title: form.title.trim(),
      category: form.category,
      scripture_ref: form.scripture_ref.trim() || null,
      content: form.content.trim() || null,
      is_shared: form.is_shared,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (editingNote) {
      ({ error } = await supabase.from('sermon_notes').update(payload).eq('id', editingNote.id));
    } else {
      ({ error } = await supabase.from('sermon_notes').insert({
        ...payload, user_id: userId, user_email: userEmail, user_name: userName,
      }));
    }
    if (error) {
      setFormError(`Save failed: ${error.message}`);
    } else {
      setShowForm(false);
      setEditingNote(null);
      await loadMyNotes();
      await loadSharedNotes();
    }
    setSaving(false);
  }

  async function handleToggleShare(note) {
    await supabase.from('sermon_notes')
      .update({ is_shared: !note.is_shared, updated_at: new Date().toISOString() })
      .eq('id', note.id);
    await loadMyNotes();
    await loadSharedNotes();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    await supabase.from('sermon_feedback').delete().eq('note_id', deleteTarget.id);
    await supabase.from('sermon_feedback_requests').delete().eq('note_id', deleteTarget.id);
    await supabase.from('sermon_notes').delete().eq('id', deleteTarget.id);
    setMyNotes(prev => prev.filter(n => n.id !== deleteTarget.id));
    setSharedNotes(prev => prev.filter(n => n.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleting(false);
  }

  async function handleRequestFeedback(e) {
    e.preventDefault();
    if (!reqEmail.trim()) { setReqError('Enter a recipient email.'); return; }
    if (reqEmail.trim().toLowerCase() === userEmail?.toLowerCase()) { setReqError("You can't request feedback from yourself."); return; }
    setReqSending(true);
    setReqError('');
    const note = myNotes.find(n => n.id === requestingFor);
    const { error } = await supabase.from('sermon_feedback_requests').insert({
      note_id: requestingFor,
      note_title: note?.title || '',
      requester_id: userId,
      requester_email: userEmail,
      requester_name: userName,
      recipient_email: reqEmail.trim().toLowerCase(),
      message: reqMessage.trim() || null,
      status: 'pending',
    });
    if (error) {
      setReqError('Could not send. Please try again.');
    } else {
      setRequestingFor(null);
      setReqEmail('');
      setReqMessage('');
    }
    setReqSending(false);
  }

  async function handleRespondToRequest(request) {
    if (!responseText.trim()) return;
    setResponseSending(true);
    const { error } = await supabase.from('sermon_feedback').insert({
      note_id: request.note_id,
      request_id: request.id,
      responder_id: userId,
      responder_email: userEmail,
      responder_name: userName,
      content: responseText.trim(),
    });
    if (!error) {
      await supabase.from('sermon_feedback_requests').update({ status: 'responded' }).eq('id', request.id);
      setInboxRequests(prev => prev.filter(r => r.id !== request.id));
      setRespondingTo(null);
      setResponseText('');
    }
    setResponseSending(false);
  }

  const displayNotes = activeTab === 'my' ? myNotes : sharedNotes;

  return (
    <div style={{ padding: '2rem', maxWidth: '860px', margin: '0 auto' }}>

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--text-primary)' }}>Delete Note?</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              "{deleteTarget.title}" and all its feedback will be permanently removed.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626' }}
                onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '12px',
          background: 'linear-gradient(135deg, var(--navy-primary), var(--navy-dark))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Mic2 size={24} color="white" />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', fontSize: '1.6rem' }}>
            Message &amp; Sermon Notes
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {isLeader ? 'Write, share, and gather feedback on your messages' : 'Dive deeper into shared sermon notes and scripture'}
          </p>
        </div>
        {isLeader && activeTab === 'my' && (
          <button onClick={showForm ? () => setShowForm(false) : openCreate}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PlusCircle size={17} />
            {showForm ? 'Cancel' : 'New Note'}
          </button>
        )}
      </div>

      {/* Feedback Inbox (leaders only) */}
      {isLeader && inboxRequests.length > 0 && (
        <div className="card" style={{ marginBottom: '1.75rem', borderLeft: '4px solid var(--accent-gold)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <InboxIcon size={16} style={{ color: 'var(--accent-gold)' }} />
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem' }}>
              Feedback Requests ({inboxRequests.length})
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {inboxRequests.map(req => (
              <div key={req.id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.9rem 1rem' }}>
                <p style={{ margin: '0 0 0.25rem', fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {req.requester_name || req.requester_email} requested feedback on <em>"{req.note_title}"</em>
                </p>
                {req.message && (
                  <p style={{ margin: '0 0 0.6rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>"{req.message}"</p>
                )}
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{formatDate(req.created_at)}</p>
                {respondingTo === req.id ? (
                  <div>
                    <textarea
                      value={responseText}
                      onChange={e => setResponseText(e.target.value)}
                      placeholder="Write your feedback…"
                      rows={3}
                      style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem', marginBottom: '0.5rem', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn-primary" style={{ fontSize: '0.83rem', padding: '0.35rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                        onClick={() => handleRespondToRequest(req)} disabled={responseSending || !responseText.trim()}>
                        <Send size={13} /> {responseSending ? 'Sending…' : 'Send Feedback'}
                      </button>
                      <button className="btn-secondary" style={{ fontSize: '0.83rem', padding: '0.35rem 0.85rem' }}
                        onClick={() => { setRespondingTo(null); setResponseText(''); }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn-secondary" style={{ fontSize: '0.82rem', padding: '0.3rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    onClick={() => setRespondingTo(req.id)}>
                    <CornerDownRight size={13} /> Respond
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit Form */}
      {showForm && isLeader && (
        <div className="card" style={{ marginBottom: '1.75rem', borderLeft: '4px solid var(--navy-primary)' }}>
          <h3 style={{ margin: '0 0 1.25rem', color: 'var(--text-primary)' }}>
            {editingNote ? 'Edit Note' : 'New Note'}
          </h3>
          <form onSubmit={handleSave} style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Title *
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Walking by Faith" required />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Type
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
            </div>
            <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Scripture Reference
              <input value={form.scripture_ref} onChange={e => setForm(p => ({ ...p, scripture_ref: e.target.value }))}
                placeholder="e.g. Hebrews 11:1-6" />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Notes / Outline
              <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                placeholder="Write your message outline, key points, or sermon notes here…"
                rows={6} style={{ resize: 'vertical', fontFamily: 'inherit' }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.is_shared}
                onChange={e => setForm(p => ({ ...p, is_shared: e.target.checked }))}
                style={{ width: '16px', height: '16px' }} />
              Share with everyone (visible under Shared Notes)
            </label>
            {formError && <p style={{ color: '#dc2626', fontSize: '0.88rem', margin: 0 }}>{formError}</p>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editingNote ? 'Save Changes' : 'Create Note'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditingNote(null); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Tab Switcher */}
      {isLeader && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {[{ id: 'my', label: 'My Notes' }, { id: 'shared', label: 'Shared Notes' }].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                padding: '0.4rem 1.1rem', borderRadius: '20px', border: '1.5px solid',
                borderColor: activeTab === t.id ? 'var(--navy-primary)' : 'var(--border-color)',
                background: activeTab === t.id ? 'var(--navy-primary)' : 'var(--bg-secondary)',
                color: activeTab === t.id ? '#fff' : 'var(--text-secondary)',
                fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {!isLeader && (
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>
          Shared Notes
        </h2>
      )}

      {/* Note List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Loading…</div>
      ) : !isConfigured ? (
        <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: '10px', padding: '1rem 1.25rem', color: '#78350f', fontSize: '0.9rem' }}>
          ⚠️ Supabase is not configured. Notes will not load until you add your environment variables.
        </div>
      ) : displayNotes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
          <Mic2 size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
          <p style={{ fontWeight: 600 }}>
            {activeTab === 'my'
              ? 'No notes yet — create your first one!'
              : 'No shared notes yet. Leaders can share their notes here for everyone to read.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {displayNotes.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              isOwner={note.user_id === userId}
              isLeader={isLeader}
              expanded={expandedId === note.id}
              onToggleExpand={() => setExpandedId(expandedId === note.id ? null : note.id)}
              onEdit={() => openEdit(note)}
              onDelete={() => setDeleteTarget(note)}
              onToggleShare={() => handleToggleShare(note)}
              feedback={feedbackByNote[note.id] || []}
              onLoadFeedback={() => loadFeedbackForNote(note.id)}
              requestingFeedback={requestingFor === note.id}
              onOpenRequest={() => { setRequestingFor(note.id); setReqEmail(''); setReqMessage(''); setReqError(''); }}
              onCloseRequest={() => setRequestingFor(null)}
              reqEmail={reqEmail} setReqEmail={setReqEmail}
              reqMessage={reqMessage} setReqMessage={setReqMessage}
              reqSending={reqSending} reqError={reqError}
              onSubmitRequest={handleRequestFeedback}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({
  note, isOwner, isLeader, expanded, onToggleExpand,
  onEdit, onDelete, onToggleShare,
  feedback, onLoadFeedback,
  requestingFeedback, onOpenRequest, onCloseRequest,
  reqEmail, setReqEmail, reqMessage, setReqMessage,
  reqSending, reqError, onSubmitRequest,
}) {
  const cat = getCat(note.category);

  function handleExpand() {
    onToggleExpand();
    if (!expanded) onLoadFeedback();
  }

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      overflow: 'hidden',
      transition: 'box-shadow 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Card Header Row */}
      <div style={{ padding: '1rem 1.1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
            <span style={{ background: cat.bg, color: cat.color, borderRadius: '20px', padding: '0.15rem 0.6rem', fontSize: '0.72rem', fontWeight: 700 }}>
              {cat.label}
            </span>
            {note.is_shared
              ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#d1fae5', color: '#065f46', borderRadius: '20px', padding: '0.15rem 0.6rem', fontSize: '0.72rem', fontWeight: 700 }}>
                  <Globe size={10} /> Shared
                </span>
              : isOwner && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--bg-primary)', color: 'var(--text-muted)', borderRadius: '20px', padding: '0.15rem 0.6rem', fontSize: '0.72rem', fontWeight: 600, border: '1px solid var(--border-color)' }}>
                  <Lock size={10} /> Private
                </span>
              )
            }
          </div>
          <h3 style={{ margin: '0 0 0.2rem', color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 700 }}>{note.title}</h3>
          {note.scripture_ref && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '0.15rem' }}>
              <BookOpen size={12} /> {note.scripture_ref}
            </div>
          )}
          {!isOwner && note.user_name && (
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>by {note.user_name} · {formatDate(note.created_at)}</p>
          )}
          {isOwner && (
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>{formatDate(note.created_at)}</p>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          {isOwner && isLeader && (
            <>
              <button onClick={onToggleShare} title={note.is_shared ? 'Make private' : 'Share with everyone'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: note.is_shared ? '#065f46' : 'var(--text-muted)', padding: '0.3rem' }}>
                {note.is_shared ? <Globe size={15} /> : <Share2 size={15} />}
              </button>
              <button onClick={onEdit} title="Edit"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.3rem' }}>
                <Edit3 size={15} />
              </button>
              <button onClick={onDelete} title="Delete"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.3rem' }}>
                <Trash2 size={15} />
              </button>
            </>
          )}
          <button onClick={handleExpand}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.3rem' }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded Panel */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)', padding: '1.1rem 1.25rem' }}>
          {/* Content */}
          {note.content ? (
            <div style={{ marginBottom: '1.25rem' }}>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notes</p>
              <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.92rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{note.content}</p>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1rem', fontStyle: 'italic' }}>No notes content added.</p>
          )}

          {/* Feedback Thread */}
          {(feedback.length > 0 || isOwner) && (
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <MessageSquare size={12} /> Feedback ({feedback.length})
              </p>
              {feedback.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.75rem' }}>No feedback yet.</p>
              )}
              {feedback.map(fb => (
                <div key={fb.id} style={{ marginBottom: '0.75rem', paddingLeft: '0.75rem', borderLeft: '2px solid var(--accent-gold)' }}>
                  <p style={{ margin: '0 0 0.2rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {fb.responder_name || fb.responder_email} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>· {formatDate(fb.created_at)}</span>
                  </p>
                  <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.88rem', lineHeight: 1.6 }}>{fb.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* Request Feedback (only owner, only leaders) */}
          {isOwner && isLeader && (
            <div style={{ marginTop: '0.75rem' }}>
              {requestingFeedback ? (
                <form onSubmit={onSubmitRequest} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Request Feedback</p>
                  <input
                    type="email" value={reqEmail} onChange={e => setReqEmail(e.target.value)}
                    placeholder="Recipient's email address" required
                    style={{ fontSize: '0.88rem' }}
                  />
                  <textarea
                    value={reqMessage} onChange={e => setReqMessage(e.target.value)}
                    placeholder="Optional message to include…" rows={2}
                    style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '0.88rem' }}
                  />
                  {reqError && <p style={{ margin: 0, color: '#dc2626', fontSize: '0.83rem' }}>{reqError}</p>}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="btn-primary"
                      style={{ fontSize: '0.83rem', padding: '0.35rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      disabled={reqSending}>
                      <Send size={13} /> {reqSending ? 'Sending…' : 'Send Request'}
                    </button>
                    <button type="button" className="btn-secondary"
                      style={{ fontSize: '0.83rem', padding: '0.35rem 0.85rem' }}
                      onClick={onCloseRequest}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button onClick={onOpenRequest}
                  className="btn-secondary"
                  style={{ fontSize: '0.82rem', padding: '0.35rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <MessageSquare size={13} /> Request Feedback
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
