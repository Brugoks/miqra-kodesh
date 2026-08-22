import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarPlus,
  Check,
  Copy,
  Layers,
  Loader2,
  Lock,
  MonitorPlay,
  QrCode,
  Settings2,
  Unlock,
  X,
  ArrowRightLeft,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { isLeaderRole } from '../../lib/roles';
import './QASessionBar.css';

// Session chips above the Q&R board, plus the leader tooling behind them:
// create a session, hand out its QR code, open/close submissions, and sweep
// whatever the group didn't get to into the next session.
//
// Sessions are additive — a question with no session_id is a plain board post,
// which is what every question asked before this feature shipped looks like.

const guestUrlFor = (joinCode) => `${window.location.origin}/q/${joinCode}`;

const STATUS_LABEL = { open: 'Open', closed: 'Closed', archived: 'Archived' };

export default function QASessionBar({
  activeOrgId,
  userRole,
  sessions,
  sessionsLoading,
  onReloadSessions,
  activeSessionId,
  onSelectSession,
  questions,
  answersByQuestion,
  onQuestionsChanged,
}) {
  const canManage = isLeaderRole(userRole);

  const [createOpen, setCreateOpen] = useState(false);
  const [manageId, setManageId] = useState(null);
  const [form, setForm] = useState({ title: '', topic: '', description: '', requireApproval: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(null); // { url, dataUrl } — url guards staleness
  const [carrySelection, setCarrySelection] = useState(() => new Set());
  const [carryTarget, setCarryTarget] = useState('');
  const [carrying, setCarrying] = useState(false);

  const managed = useMemo(
    () => sessions.find((s) => s.id === manageId) || null,
    [manageId, sessions],
  );

  const joinUrl = managed ? guestUrlFor(managed.join_code) : null;

  useEffect(() => {
    if (!joinUrl) return undefined;
    let cancelled = false;
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(joinUrl, { width: 520, margin: 2 }))
      .then((dataUrl) => { if (!cancelled) setQr({ url: joinUrl, dataUrl }); })
      .catch(() => { if (!cancelled) setQr({ url: joinUrl, dataUrl: null }); });
    return () => { cancelled = true; };
  }, [joinUrl]);

  // Opening a second session renders before its QR finishes generating. Keying
  // the cached image to its URL means the placeholder shows instead of the
  // previous session's code — scanning the wrong session is not recoverable
  // from the guest's side.
  const qrDataUrl = qr?.url === joinUrl ? qr.dataUrl : null;

  // Reset the carry-forward picker with the session, rather than in an effect
  // that would also fire on unrelated re-renders.
  const openManage = useCallback((id) => {
    setCarrySelection(new Set());
    setCarryTarget('');
    setError('');
    setManageId(id);
  }, []);

  const unansweredInSession = useMemo(() => {
    if (!managed) return [];
    return questions.filter((q) => (
      q.session_id === managed.id
      && q.status === 'published'
      && (answersByQuestion[q.id] || []).length === 0
    ));
  }, [answersByQuestion, managed, questions]);

  const carryTargets = useMemo(
    () => sessions.filter((s) => s.id !== manageId && s.status !== 'archived'),
    [manageId, sessions],
  );

  const handleCreate = async (event) => {
    event.preventDefault();
    const title = form.title.trim();
    if (!title || saving) return;

    setSaving(true);
    setError('');
    const { data, error: insertError } = await supabase
      .from('qa_sessions')
      .insert({
        organization_id: activeOrgId,
        title,
        topic: form.topic.trim() || null,
        description: form.description.trim() || null,
        require_approval: form.requireApproval,
      })
      .select('id')
      .single();

    setSaving(false);
    if (insertError) {
      setError(insertError.message || 'Could not create the session.');
      return;
    }

    setForm({ title: '', topic: '', description: '', requireApproval: false });
    setCreateOpen(false);
    await onReloadSessions();
    onSelectSession(data.id);
    // Drop the leader straight into the QR sheet — creating a session is
    // almost always immediately followed by putting the code on a screen.
    openManage(data.id);
  };

  const patchSession = useCallback(async (id, patch) => {
    setError('');
    const { error: updateError } = await supabase
      .from('qa_sessions')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      setError(updateError.message || 'Could not update the session.');
      return;
    }
    await onReloadSessions();
  }, [onReloadSessions]);

  const handleCopy = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const toggleCarry = (id) => {
    setCarrySelection((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCarry = async () => {
    if (!carryTarget || carrySelection.size === 0 || carrying) return;
    setCarrying(true);
    setError('');
    const { error: carryError } = await supabase.rpc('qa_carry_questions', {
      question_ids: Array.from(carrySelection),
      target_session_id: carryTarget,
    });
    setCarrying(false);

    if (carryError) {
      setError(carryError.message || 'Could not carry those questions forward.');
      return;
    }
    setCarrySelection(new Set());
    await Promise.all([onReloadSessions(), onQuestionsChanged()]);
  };

  return (
    <>
      <div className="qa-session-bar">
        <div className="qa-session-chips" role="tablist" aria-label="Q&R sessions">
          <button
            type="button"
            role="tab"
            aria-selected={!activeSessionId}
            className={`qa-session-chip ${!activeSessionId ? 'active' : ''}`}
            onClick={() => onSelectSession(null)}
          >
            <Layers size={14} />
            All questions
          </button>

          {sessionsLoading && sessions.length === 0 && (
            <span className="qa-session-loading"><Loader2 size={14} className="qa-spin" /> Loading sessions…</span>
          )}

          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={activeSessionId === s.id}
              className={`qa-session-chip ${activeSessionId === s.id ? 'active' : ''} ${s.status !== 'open' ? 'closed' : ''}`}
              onClick={() => onSelectSession(s.id)}
            >
              {s.status !== 'open' && <Lock size={12} />}
              <span className="qa-session-chip-title">{s.title}</span>
              {s.topic && <span className="qa-session-chip-topic">{s.topic}</span>}
              <span className="qa-session-chip-count">{s.question_count}</span>
              {canManage && s.pending_count > 0 && (
                <span className="qa-session-chip-pending" title={`${s.pending_count} awaiting review`}>
                  {s.pending_count}
                </span>
              )}
            </button>
          ))}
        </div>

        {canManage && (
          <div className="qa-session-bar-actions">
            {activeSessionId && (
              <button
                type="button"
                className="btn-secondary qa-session-icon-btn"
                onClick={() => openManage(activeSessionId)}
                title="Session settings and QR code"
              >
                <Settings2 size={15} />
                <span>Manage</span>
              </button>
            )}
            <button type="button" className="btn-primary qa-session-icon-btn" onClick={() => setCreateOpen(true)}>
              <CalendarPlus size={15} />
              <span>New session</span>
            </button>
          </div>
        )}
      </div>

      {createOpen && (
        <div className="qa-modal-overlay" role="presentation" onClick={() => setCreateOpen(false)}>
          <div
            className="qa-modal card qa-session-modal"
            role="dialog"
            aria-modal="true"
            aria-label="New Q&R session"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleCreate}>
              <div className="qa-panel-heading">
                <h2>New Q&amp;R session</h2>
                <button type="button" className="qa-modal-close" onClick={() => setCreateOpen(false)} aria-label="Close">
                  <X size={18} />
                </button>
              </div>

              <label className="qa-session-field">
                <span>Session name</span>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="CV Students Q&R"
                  maxLength={120}
                  required
                  autoFocus
                />
              </label>

              <label className="qa-session-field">
                <span>Topic <em>(optional)</em></span>
                <input
                  type="text"
                  value={form.topic}
                  onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                  placeholder="The Book of Revelation"
                  maxLength={160}
                />
              </label>

              <label className="qa-session-field">
                <span>Description <em>(optional)</em></span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Shown to anyone who scans the code."
                  rows={2}
                  maxLength={500}
                />
              </label>

              <label className="qa-session-checkbox">
                <input
                  type="checkbox"
                  checked={form.requireApproval}
                  onChange={(e) => setForm((f) => ({ ...f, requireApproval: e.target.checked }))}
                />
                <span>
                  Review questions before they appear
                  <em>Guest questions wait in a queue until you approve them.</em>
                </span>
              </label>

              {error && <p className="qa-status error">{error}</p>}

              <div className="qa-session-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving || !form.title.trim()}>
                  {saving ? 'Creating…' : 'Create session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {managed && (
        <div className="qa-modal-overlay" role="presentation" onClick={() => openManage(null)}>
          <div
            className="qa-modal card qa-session-modal qa-session-manage"
            role="dialog"
            aria-modal="true"
            aria-label={`Manage ${managed.title}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="qa-panel-heading">
              <h2>{managed.title}</h2>
              <button type="button" className="qa-modal-close" onClick={() => openManage(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="qa-session-qr-block">
              {qrDataUrl
                ? <img className="qa-session-qr" src={qrDataUrl} alt={`QR code for ${joinUrl}`} />
                : <div className="qa-session-qr qa-session-qr-placeholder"><QrCode size={28} /></div>}
              <div className="qa-session-qr-meta">
                <p className="qa-session-qr-label">Scan to ask a question — no account needed</p>
                <p className="qa-session-code">{managed.join_code}</p>
                <button type="button" className="qa-session-copy" onClick={handleCopy}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{joinUrl?.replace(/^https?:\/\//, '')}</span>
                </button>
                <a
                  className="qa-session-kiosk-link"
                  href={`${joinUrl}?kiosk=1`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open kiosk mode for the shared laptop
                </a>
              </div>
            </div>

            <div className="qa-session-toggles">
              <button
                type="button"
                className={`qa-session-toggle ${managed.status === 'open' ? 'on' : ''}`}
                onClick={() => patchSession(managed.id, {
                  status: managed.status === 'open' ? 'closed' : 'open',
                  closed_at: managed.status === 'open' ? new Date().toISOString() : null,
                })}
              >
                {managed.status === 'open' ? <Unlock size={14} /> : <Lock size={14} />}
                <span>{STATUS_LABEL[managed.status]}</span>
              </button>

              <label className="qa-session-switch">
                <input
                  type="checkbox"
                  checked={managed.guest_submissions_enabled}
                  onChange={(e) => patchSession(managed.id, { guest_submissions_enabled: e.target.checked })}
                />
                <span>Guests can submit</span>
              </label>

              <label className="qa-session-switch">
                <input
                  type="checkbox"
                  checked={managed.guest_voting_enabled}
                  onChange={(e) => patchSession(managed.id, { guest_voting_enabled: e.target.checked })}
                />
                <span>Guests can upvote</span>
              </label>

              <label className="qa-session-switch">
                <input
                  type="checkbox"
                  checked={managed.require_approval}
                  onChange={(e) => patchSession(managed.id, { require_approval: e.target.checked })}
                />
                <span>Review before showing</span>
              </label>
            </div>

            <Link className="btn-secondary qa-session-present-link" to={`/qa/present/${managed.id}`}>
              <MonitorPlay size={15} />
              <span>Open present mode</span>
            </Link>

            <div className="qa-session-carry">
              <h3><ArrowRightLeft size={15} /> Carry questions forward</h3>
              {unansweredInSession.length === 0 ? (
                <p className="qa-session-carry-empty">
                  Nothing unanswered in this session
                  {questions.some((q) => q.session_id === managed.id) ? '.' : ' yet.'}
                </p>
              ) : (
                <>
                  <p className="qa-session-carry-note">
                    Move what you didn&apos;t get to into another session.
                  </p>
                  <ul className="qa-session-carry-list">
                    {unansweredInSession.map((q) => (
                      <li key={q.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={carrySelection.has(q.id)}
                            onChange={() => toggleCarry(q.id)}
                          />
                          <span>{q.title}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="qa-session-carry-actions">
                    <select value={carryTarget} onChange={(e) => setCarryTarget(e.target.value)}>
                      <option value="">Move to…</option>
                      {carryTargets.map((s) => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleCarry}
                      disabled={carrying || !carryTarget || carrySelection.size === 0}
                    >
                      {carrying ? 'Moving…' : `Move ${carrySelection.size || ''}`.trim()}
                    </button>
                  </div>
                  {carryTargets.length === 0 && (
                    <p className="qa-session-carry-empty">Create another session to move questions into.</p>
                  )}
                </>
              )}
            </div>

            {error && <p className="qa-status error">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
