import { useState, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, BookOpen, Mic2 } from 'lucide-react';
import './SermonTakeawayButton.css';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';

const MAX_CHARS = 400;

// localStorage key: per-user, per-sermon (or per-org if no sermon)
function getStorageKey(userId, sermonId, orgId) {
  const scope = sermonId || orgId;
  return `sermon_takeaway_done_${userId}_${scope}`;
}

export default function SermonTakeawayButton({ session, activeOrgId, displayName }) {
  const [open, setOpen] = useState(false);
  const [takeaway, setTakeaway] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [recentSermon, setRecentSermon] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [checkedKey, setCheckedKey] = useState(null);

  const userId = session?.user?.id;
  const authorName = displayName || session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'Member';

  useEffect(() => {
    if (!hasSupabaseConfig || !activeOrgId) return;
    let ignore = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('sermon_notes')
          .select('id, title, scripture_ref, created_at')
          .eq('organization_id', activeOrgId)
          .eq('is_shared', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!ignore) setRecentSermon(data || null);
      } catch {
        // silently ignore — sermon display is cosmetic only
      }
    })();
    return () => { ignore = true; };
  }, [activeOrgId]);

  const storageKey = userId ? getStorageKey(userId, recentSermon?.id, activeOrgId) : null;
  if (storageKey !== checkedKey) {
    setCheckedKey(storageKey);
    setDismissed(storageKey ? localStorage.getItem(storageKey) === 'done' : false);
  }

  const handleClose = useCallback(() => {
    if (sending) return;
    setOpen(false);
    setTakeaway('');
    setError('');
    setSuccess(false);
  }, [sending]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, handleClose]);

  const handleOpen = () => {
    setOpen(true);
    setTakeaway('');
    setError('');
    setSuccess(false);
  };

  // Find or create the #sermons channel for this org, return its id
  const getOrCreateSermonsChannel = async () => {
    const { data: existing } = await supabase
      .from('chat_channels')
      .select('id')
      .eq('organization_id', activeOrgId)
      .eq('name', 'sermons')
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: created, error: createErr } = await supabase
      .from('chat_channels')
      .insert({
        organization_id: activeOrgId,
        name: 'sermons',
        description: 'Share your sermon takeaways here 🙌',
        category: 'Sermons',
        is_private: false,
        created_by: userId,
        position: 999,
      })
      .select('id')
      .single();

    if (createErr) throw new Error(createErr.message || 'Could not create #sermons channel.');
    return created.id;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const text = takeaway.trim();
    if (!text) { setError('Please write your takeaway first!'); return; }
    if (!userId || !activeOrgId) { setError('You need to be signed in and in an organization.'); return; }

    setSending(true);
    setError('');

    try {
      const channelId = await getOrCreateSermonsChannel();

      const sermonRef = recentSermon?.title ? ` from "${recentSermon.title}"` : '';
      const body = `✨ My biggest takeaway${sermonRef}:\n\n${text}`;

      const { error: msgErr } = await supabase
        .from('chat_messages')
        .insert({
          channel_id: channelId,
          organization_id: activeOrgId,
          author_id: userId,
          author_name: authorName,
          body,
        });

      if (msgErr) throw new Error(msgErr.message || 'Could not post your takeaway.');

      // Mark as done in localStorage — hides the FAB until a new sermon is posted
      const key = getStorageKey(userId, recentSermon?.id, activeOrgId);
      localStorage.setItem(key, 'done');

      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
        setTakeaway('');
        setDismissed(true); // hide FAB immediately after success animation
      }, 2200);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Don't render if not configured, not logged in, or already submitted
  if (!hasSupabaseConfig || !userId || dismissed) return null;

  const charCount = takeaway.length;
  const charClass = charCount >= MAX_CHARS ? 'at-limit' : charCount >= MAX_CHARS * 0.85 ? 'near-limit' : '';

  return (
    <>
      {/* Floating Action Button */}
      <div className="sermon-fab-wrap" role="region" aria-label="Sermon takeaway">
        <span className="sermon-fab-tooltip">Share your takeaway</span>
        <button
          id="sermon-takeaway-fab"
          className="sermon-fab"
          onClick={handleOpen}
          aria-label="Share your sermon takeaway"
          title="Share your biggest takeaway"
        >
          <Sparkles size={22} />
        </button>
      </div>

      {/* Modal */}
      {open && (
        <div
          className="sermon-modal-overlay"
          role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div
            className="sermon-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Share sermon takeaway"
          >
            {/* Gradient Header */}
            <div className="sermon-modal-header">
              <button
                className="sermon-modal-close"
                onClick={handleClose}
                aria-label="Close"
                disabled={sending}
              >
                <X size={16} />
              </button>

              <div className="sermon-modal-header-icon">
                <Sparkles size={22} color="#fff" />
              </div>

              <h2 className="sermon-modal-title">What was your biggest takeaway?</h2>
              <p className="sermon-modal-subtitle">
                Share your heart with the community — it'll appear in&nbsp;
                <strong style={{ color: '#fff' }}>#sermons</strong>
              </p>

              {recentSermon && (
                <div className="sermon-modal-sermon-name">
                  <Mic2 size={12} />
                  {recentSermon.title}
                  {recentSermon.scripture_ref && ` · ${recentSermon.scripture_ref}`}
                </div>
              )}
            </div>

            {/* Body / Success State */}
            {success ? (
              <div className="sermon-success-state">
                <div className="sermon-success-icon">🙌</div>
                <h3 className="sermon-success-title">Takeaway shared!</h3>
                <p className="sermon-success-desc">
                  Your reflection is now live in <strong>#sermons</strong>. Thanks for sharing!
                </p>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} id="sermon-takeaway-form">
                  <div className="sermon-modal-body">
                    <label className="sermon-modal-label" htmlFor="sermon-takeaway-input">
                      <BookOpen size={11} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                      Your takeaway
                    </label>
                    <textarea
                      id="sermon-takeaway-input"
                      className="sermon-takeaway-textarea"
                      value={takeaway}
                      onChange={(e) => setTakeaway(e.target.value.slice(0, MAX_CHARS))}
                      placeholder="What truth hit you differently today? What are you walking away with?…"
                      rows={5}
                      autoFocus
                      disabled={sending}
                    />
                    <div className={`sermon-char-count ${charClass}`}>
                      {charCount}/{MAX_CHARS}
                    </div>
                    {error && <div className="sermon-modal-error">{error}</div>}
                  </div>

                  <div className="sermon-modal-footer">
                    <button
                      type="button"
                      className="sermon-cancel-btn"
                      onClick={handleClose}
                      disabled={sending}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="sermon-submit-btn"
                      disabled={sending || !takeaway.trim()}
                    >
                      <Send size={15} />
                      {sending ? 'Sharing…' : 'Share in #sermons'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
