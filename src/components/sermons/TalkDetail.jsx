import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './Sermons.css';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';
import {
  ArrowLeft, BookOpen, User, Calendar as CalendarIcon, MessageSquare,
  Sparkles, FileText, Pencil, Trash2, Globe, Lock, Send, ExternalLink,
  CalendarCheck2, Mic2, BookOpenCheck,
} from 'lucide-react';
import { isAdminRole, isLeaderRole } from '../../lib/roles';
import { sanitizeHtml, isHtml } from '../../lib/sanitizeHtml';
import TalkEditor from './TalkEditor';
import BereanTab from './BereanTab';
import { getTalkCategory, formatTalkDate, normalizeTakeaways } from './talkUtils';

function formatCommentDate(str) {
  if (!str) return '';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TalkDetail({ session, userRole, activeOrgId }) {
  const { talkId } = useParams();
  const navigate = useNavigate();
  const userId = session?.user?.id;
  const userEmail = session?.user?.email;
  const userName = session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name
    || userEmail?.split('@')[0]
    || 'Member';
  const isAdmin = isAdminRole(userRole);
  const isConfigured = hasSupabaseConfig && !!userId;

  const [talk, setTalk] = useState(null);
  const [linkedEvent, setLinkedEvent] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [section, setSection] = useState('summary');
  const [editing, setEditing] = useState(false);

  const [commentText, setCommentText] = useState('');
  const [commentSending, setCommentSending] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canManage = talk && (talk.created_by === userId || isAdmin) && isLeaderRole(userRole);

  useEffect(() => {
    if (!isConfigured || !talkId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('sermon_talks')
        .select('*')
        .eq('id', talkId)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setTalk(data);
      setLoading(false);

      const [{ data: eventData }, { data: commentData }] = await Promise.all([
        data.event_id
          ? supabase.from('calendar_events').select('id, title, date, time_start, location').eq('id', data.event_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('sermon_talk_comments').select('*').eq('talk_id', talkId).order('created_at', { ascending: true }),
      ]);
      if (cancelled) return;
      setLinkedEvent(eventData || null);
      setComments(commentData || []);
    })();
    return () => { cancelled = true; };
  }, [isConfigured, talkId]);

  async function handleTogglePublish() {
    if (!talk) return;
    const next = !talk.is_published;
    const { error } = await supabase
      .from('sermon_talks')
      .update({ is_published: next, updated_at: new Date().toISOString() })
      .eq('id', talk.id);
    if (!error) setTalk(prev => ({ ...prev, is_published: next }));
  }

  async function handleDelete() {
    if (!talk) return;
    setDeleting(true);
    await supabase.from('sermon_talks').delete().eq('id', talk.id);
    setDeleting(false);
    navigate('/sermons');
  }

  async function handleAddComment(e) {
    e.preventDefault();
    if (!commentText.trim() || !talk) return;
    setCommentSending(true);
    setCommentError('');
    const { data, error } = await supabase
      .from('sermon_talk_comments')
      .insert({
        talk_id: talk.id,
        organization_id: activeOrgId,
        user_id: userId,
        user_name: userName,
        user_email: userEmail,
        content: commentText.trim(),
      })
      .select()
      .single();
    if (error) {
      setCommentError(error.message || 'Could not post your comment. Please try again.');
    } else {
      setComments(prev => [...prev, data]);
      setCommentText('');
    }
    setCommentSending(false);
  }

  async function handleDeleteComment(comment) {
    const { error } = await supabase.from('sermon_talk_comments').delete().eq('id', comment.id);
    if (!error) setComments(prev => prev.filter(c => c.id !== comment.id));
  }

  if (loading) {
    return <div className="sermons-page" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Loading…</div>;
  }

  if (notFound || !talk) {
    return (
      <div className="sermons-page">
        <button className="talk-detail-back" onClick={() => navigate('/sermons')}>
          <ArrowLeft size={15} /> Back to Sermons &amp; Messages
        </button>
        <div className="empty-state">
          <Mic2 size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
          <p>This sermon or message could not be found. It may have been removed or unpublished.</p>
        </div>
      </div>
    );
  }

  const cat = getTalkCategory(talk.category);
  const takeaways = normalizeTakeaways(talk.key_takeaways);

  return (
    <div className="sermons-page">
      <button className="talk-detail-back" onClick={() => navigate('/sermons')}>
        <ArrowLeft size={15} /> Back to Sermons &amp; Messages
      </button>

      {editing && canManage ? (
        <TalkEditor
          session={session}
          activeOrgId={activeOrgId}
          talk={talk}
          onSaved={(updated) => { setTalk(updated); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="talk-detail-header">
          <div className="talk-card-badges">
            <span className="talk-badge" style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>
            {!talk.is_published && <span className="talk-badge draft">Draft — only visible to leaders</span>}
          </div>
          <h1>{talk.title}</h1>
          <div className="talk-meta">
            {talk.speaker_name && <span><User size={13} /> {talk.speaker_name}</span>}
            {talk.talk_date && <span><CalendarIcon size={13} /> {formatTalkDate(talk.talk_date)}</span>}
            {talk.scripture_ref && <span><BookOpen size={13} /> {talk.scripture_ref}</span>}
            {talk.video_url && (
              <span>
                <ExternalLink size={13} />
                <a href={talk.video_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>
                  Watch / Listen
                </a>
              </span>
            )}
          </div>

          {canManage && (
            <div className="talk-detail-actions">
              <button className="btn-secondary" onClick={() => setEditing(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.83rem', padding: '0.35rem 0.85rem' }}>
                <Pencil size={14} /> Edit
              </button>
              <button className="btn-secondary" onClick={handleTogglePublish}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.83rem', padding: '0.35rem 0.85rem' }}>
                {talk.is_published ? <><Lock size={14} /> Unpublish</> : <><Globe size={14} /> Publish</>}
              </button>
              <button className="btn-secondary" onClick={() => setDeleteConfirm(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.83rem', padding: '0.35rem 0.85rem', color: '#dc2626' }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}

          {linkedEvent && (
            <button className="talk-event-banner" onClick={() => navigate('/calendar')}>
              <CalendarCheck2 size={18} style={{ color: 'var(--accent-gold)', flexShrink: 0 }} />
              <span>
                <strong>{linkedEvent.title}</strong>
                {' · '}{formatTalkDate(linkedEvent.date)}
                {linkedEvent.location ? ` · ${linkedEvent.location}` : ''}
                <span style={{ color: 'var(--text-muted)' }}> — view on the calendar</span>
              </span>
            </button>
          )}
        </div>
      )}

      {/* Section tabs */}
      <div className="talk-section-tabs">
        <button className={`talk-section-tab ${section === 'summary' ? 'active' : ''}`} onClick={() => setSection('summary')}>
          <Sparkles size={14} /> Summary &amp; Takeaways
        </button>
        <button className={`talk-section-tab ${section === 'transcript' ? 'active' : ''}`} onClick={() => setSection('transcript')}>
          <FileText size={14} /> Transcript
        </button>
        <button className={`talk-section-tab ${section === 'discussion' ? 'active' : ''}`} onClick={() => setSection('discussion')}>
          <MessageSquare size={14} /> Discussion ({comments.length})
        </button>
        {isLeaderRole(userRole) && (
          <button className={`talk-section-tab ${section === 'berean' ? 'active' : ''}`} onClick={() => setSection('berean')}>
            <BookOpenCheck size={14} /> Berean
          </button>
        )}
      </div>

      {section === 'summary' && (
        <div>
          {takeaways.length > 0 && (
            <>
              <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.75rem' }}>
                Key Takeaways
              </h2>
              <ol className="takeaway-list">
                {takeaways.map((takeaway, index) => (
                  <li className="takeaway-item" key={index}>{takeaway}</li>
                ))}
              </ol>
            </>
          )}
          {talk.summary ? (
            <>
              <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.75rem' }}>
                Summary Notes
              </h2>
              {isHtml(talk.summary)
                ? <div className="talk-summary-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(talk.summary) }} />
                : <p className="talk-summary-html" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{talk.summary}</p>}
            </>
          ) : takeaways.length === 0 ? (
            <div className="empty-state">
              <Sparkles size={40} style={{ marginBottom: '0.75rem', opacity: 0.3 }} />
              <p>No summary or takeaways have been added yet.</p>
            </div>
          ) : null}
        </div>
      )}

      {section === 'transcript' && (
        talk.transcript ? (
          <div className="talk-transcript">{talk.transcript}</div>
        ) : (
          <div className="empty-state">
            <FileText size={40} style={{ marginBottom: '0.75rem', opacity: 0.3 }} />
            <p>No transcript available for this {cat.label.toLowerCase()}.</p>
          </div>
        )
      )}

      {section === 'berean' && isLeaderRole(userRole) && (
        <BereanTab talk={talk} session={session} activeOrgId={activeOrgId} />
      )}

      {section === 'discussion' && (
        <div>
          {comments.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
              No comments yet — start the conversation! Share what stood out to you.
            </p>
          ) : (
            comments.map(comment => (
              <div className="talk-comment" key={comment.id}>
                <p className="talk-comment-meta">
                  {comment.user_name || comment.user_email || 'Member'}
                  <span className="talk-comment-date">· {formatCommentDate(comment.created_at)}</span>
                  {(comment.user_id === userId || isAdmin) && (
                    <button className="talk-comment-delete" title="Delete comment" onClick={() => handleDeleteComment(comment)}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </p>
                <p>{comment.content}</p>
              </div>
            ))
          )}

          {isConfigured && talk.is_published && (
            <form className="talk-comment-composer" onSubmit={handleAddComment}>
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Share a thought, question, or reflection…"
                rows={3}
              />
              {commentError && <p style={{ margin: 0, color: '#dc2626', fontSize: '0.83rem' }}>{commentError}</p>}
              <button type="submit" className="btn-primary" disabled={commentSending || !commentText.trim()}
                style={{ justifySelf: 'start', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.4rem 1rem' }}>
                <Send size={14} /> {commentSending ? 'Posting…' : 'Post Comment'}
              </button>
            </form>
          )}
          {!talk.is_published && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', marginTop: '1rem' }}>
              Discussion opens once this {cat.label.toLowerCase()} is published.
            </p>
          )}
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', overflowY: 'auto', padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '420px', width: '100%', margin: 'auto' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--text-primary)' }}>Delete this {cat.label.toLowerCase()}?</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              "{talk.title}" — including its transcript, summary, takeaways, and all discussion — will be permanently removed.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626' }}
                onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button className="btn-secondary" onClick={() => setDeleteConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
