import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Paperclip, Pencil, SendHorizontal, ThumbsUp } from 'lucide-react';
import Select from './ui/Select';
import { MentionsInput, Mention } from 'react-mentions';
import { isDeveloperRole } from '../lib/roles';
import {
  fetchTicket,
  fetchTicketTimeline,
  addComment,
  editTicket,
  updateTicket,
  FEEDBACK_CATEGORIES,
  FEEDBACK_APP_AREAS,
  getSignedScreenshotUrls,
  fetchMentionableProfiles,
  categoryDisplay,
  appAreaDisplay,
  statusLabel,
  FEEDBACK_STATUSES,
  FEEDBACK_PRIORITIES,
} from '../lib/feedbackApi';

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function eventText(event) {
  const actor = event.actor_name || 'Dev Team';
  switch (event.event_type) {
    case 'created':
      return `${actor} created this request`;
    case 'status_changed':
      return `${actor} changed status from "${statusLabel(event.old_value) || '—'}" to "${statusLabel(event.new_value)}"`;
    case 'assigned':
      return event.new_value
        ? `${actor} assigned this to ${event.new_value}`
        : `${actor} removed the assignee`;
    case 'priority_changed':
      return `${actor} changed priority from ${event.old_value || 'none'} to ${event.new_value || 'none'}`;
    case 'title_changed':
      return `${actor} changed the title from "${event.old_value}" to "${event.new_value}"`;
    case 'description_changed':
      return `${actor} updated the description`;
    case 'category_changed':
      return `${actor} changed the feedback type from "${event.old_value}" to "${event.new_value}"`;
    case 'area_changed':
      return `${actor} changed the location from "${event.old_value}" to "${event.new_value}"`;
    default:
      return `${actor} updated this request`;
  }
}

// Render stored react-mentions markup "@[Name](id)" as highlighted text.
function renderCommentBody(body) {
  const parts = [];
  const regex = /@\[([^\]]*)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(body || '')) !== null) {
    if (match.index > lastIndex) parts.push(body.slice(lastIndex, match.index));
    parts.push(<span key={key++} className="mention">@{match[1]}</span>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < (body || '').length) parts.push(body.slice(lastIndex));
  return parts;
}

export default function FeedbackTicketDetail({ ticketId, session, userRole, userVotes, onVote, onBack }) {
  const [ticket, setTicket] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [screenshotUrls, setScreenshotUrls] = useState([]);
  const [mentionables, setMentionables] = useState([]);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);

  const isDeveloper = isDeveloperRole(userRole);
  const userId = session?.user?.id || 'local-user';
  const isAuthor = ticket?.author_id === userId;

  const load = useCallback(async () => {
    try {
      const [t, tl] = await Promise.all([fetchTicket(ticketId), fetchTicketTimeline(ticketId)]);
      setTicket(t);
      setTimeline(tl);
      setError('');
      if (t?.screenshot_paths?.length) {
        getSignedScreenshotUrls(t.screenshot_paths).then(setScreenshotUrls).catch(() => {});
      }
    } catch {
      setError('Could not load this request.');
    }
    setLoading(false);
  }, [ticketId]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    fetchMentionableProfiles().then(setMentionables).catch(() => {});
  }, []);

  const handleComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setPosting(true);
    setError('');
    try {
      await addComment({ ticketId, author: session?.user, body: comment.trim() });
      setComment('');
      await load();
    } catch {
      setError('Could not post your comment.');
    }
    setPosting(false);
  };

  const startEdit = () => {
    setDraft({
      title: ticket.title,
      description: ticket.description,
      category: ticket.category,
      categoryDetail: ticket.category_detail || '',
      appArea: ticket.app_area,
      appAreaDetail: ticket.app_area_detail || '',
    });
    setEditing(true);
    setError('');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!draft.title.trim()) {
      setError('Please add a title.');
      return;
    }
    if (!draft.description.trim()) {
      setError('Please describe your feedback.');
      return;
    }
    setSavingEdit(true);
    setError('');
    try {
      await editTicket(
        ticketId,
        { ...draft, title: draft.title.trim(), description: draft.description.trim() },
        session?.user
      );
      setEditing(false);
      await load();
    } catch {
      setError('Could not save your changes.');
    }
    setSavingEdit(false);
  };

  const handleDevUpdate = async (fields) => {
    setUpdating(true);
    setError('');
    try {
      // localStorage fallback logs assignee by name; resolve it for parity
      if ('assignee_id' in fields) {
        fields.assignee_name = mentionables.find((p) => p.id === fields.assignee_id)?.full_name || null;
      }
      await updateTicket(ticketId, fields, session?.user);
      await load();
    } catch {
      setError('Could not update this request. Only developers can change it.');
    }
    setUpdating(false);
  };

  if (loading) {
    return <p className="feedback-muted">Loading request…</p>;
  }

  if (!ticket) {
    return (
      <div className="feedback-detail">
        <button className="feedback-back" onClick={onBack}>
          <ChevronLeft size={15} /> Back to board
        </button>
        <p className="feedback-muted">This request could not be found.</p>
      </div>
    );
  }

  return (
    <div className="feedback-detail">
      <button className="feedback-back" onClick={onBack}>
        <ChevronLeft size={15} /> Back to board
      </button>

      <div className="feedback-detail-grid">
        <div className="card feedback-detail-card">
        {editing ? (
          <form onSubmit={handleSaveEdit}>
            <h2 style={{ marginTop: 0 }}>Edit Request</h2>
            <div className="feedback-form-row">
              <div className="form-group">
                <label htmlFor="edit-category">Feedback Type</label>
                <Select
                  id="edit-category"
                  value={draft.category}
                  onValueChange={(value) =>
                    setDraft((d) => ({
                      ...d,
                      category: value,
                      categoryDetail: value === 'other' ? d.categoryDetail : '',
                    }))
                  }
                  options={FEEDBACK_CATEGORIES}
                />
              </div>
              {draft.category === 'other' && (
                <div className="form-group">
                  <label htmlFor="edit-category-other">Other type</label>
                  <input
                    id="edit-category-other"
                    type="text"
                    placeholder="What kind of feedback is this?"
                    value={draft.categoryDetail}
                    onChange={(e) => setDraft((d) => ({ ...d, categoryDetail: e.target.value }))}
                    maxLength={80}
                  />
                </div>
              )}
            </div>
            <div className="feedback-form-row">
              <div className="form-group">
                <label htmlFor="edit-area">Location Within The App</label>
                <Select
                  id="edit-area"
                  value={draft.appArea}
                  onValueChange={(value) =>
                    setDraft((d) => ({
                      ...d,
                      appArea: value,
                      appAreaDetail: value === 'other' ? d.appAreaDetail : '',
                    }))
                  }
                  options={FEEDBACK_APP_AREAS}
                />
              </div>
              {draft.appArea === 'other' && (
                <div className="form-group">
                  <label htmlFor="edit-area-other">Other location</label>
                  <input
                    id="edit-area-other"
                    type="text"
                    placeholder="Where in the app?"
                    value={draft.appAreaDetail}
                    onChange={(e) => setDraft((d) => ({ ...d, appAreaDetail: e.target.value }))}
                    maxLength={80}
                  />
                </div>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="edit-title">Title</label>
              <input
                id="edit-title"
                type="text"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                maxLength={140}
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-description">Description</label>
              <textarea
                id="edit-description"
                rows={5}
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditing(false)}
                disabled={savingEdit}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={savingEdit}>
                {savingEdit ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="feedback-detail-header">
              <button
                className={`feedback-vote ${userVotes?.has(ticket.id) ? 'voted' : ''}`}
                onClick={() => {
                  onVote(ticket);
                  setTicket((prev) => ({
                    ...prev,
                    votes: prev.votes + (userVotes?.has(ticket.id) ? -1 : 1),
                  }));
                }}
              >
                <ThumbsUp size={15} />
                <span>{ticket.votes}</span>
              </button>
              <h2>{ticket.title}</h2>
              <div className="feedback-detail-actions">
                {ticket.screenshot_paths?.length > 0 && (
                  <button
                    type="button"
                    className={`btn-secondary feedback-attachments-btn ${showAttachments ? 'active' : ''}`}
                    onClick={() => setShowAttachments((v) => !v)}
                    aria-label={`${showAttachments ? 'Hide' : 'Show'} ${ticket.screenshot_paths.length} attachments`}
                    title={`${ticket.screenshot_paths.length} attachment${ticket.screenshot_paths.length === 1 ? '' : 's'}`}
                  >
                    <Paperclip size={15} />
                    <span className="feedback-attachments-count">{ticket.screenshot_paths.length}</span>
                  </button>
                )}
                {isAuthor && (
                  <button
                    type="button"
                    className="btn-secondary feedback-edit-btn"
                    onClick={startEdit}
                  >
                    <Pencil size={14} /> Edit
                  </button>
                )}
              </div>
            </div>

            <div className="feedback-detail-badges">
              <span className={`feedback-badge status-${ticket.status}`}>{statusLabel(ticket.status)}</span>
              <span className="feedback-badge category">{categoryDisplay(ticket)}</span>
              <span className="feedback-badge area">{appAreaDisplay(ticket)}</span>
              {ticket.priority && (
                <span className={`feedback-badge priority-${ticket.priority}`}>{ticket.priority}</span>
              )}
            </div>

          </>
        )}

        {!editing && isDeveloper && (
          <div className="feedback-dev-controls">
            <div className="feedback-dev-controls-title">Developer Only</div>
            <div className="feedback-dev-fields">
              <div className="feedback-dev-field">
                <label htmlFor="feedback-status">Status</label>
                <Select
                  id="feedback-status"
                  value={ticket.status}
                  disabled={updating}
                  variant="dark"
                  onValueChange={(value) => handleDevUpdate({ status: value })}
                  options={FEEDBACK_STATUSES}
                />
              </div>
              <div className="feedback-dev-field">
                <label htmlFor="feedback-priority">Priority</label>
                <Select
                  id="feedback-priority"
                  value={ticket.priority || 'none'}
                  disabled={updating}
                  variant="dark"
                  onValueChange={(value) => handleDevUpdate({ priority: value === 'none' ? null : value })}
                  options={[{ value: 'none', label: 'None' }, ...FEEDBACK_PRIORITIES]}
                />
              </div>
              <div className="feedback-dev-field">
                <label htmlFor="feedback-assignee">Assignee</label>
                <Select
                  id="feedback-assignee"
                  value={ticket.assignee_id || 'unassigned'}
                  disabled={updating}
                  variant="dark"
                  onValueChange={(value) =>
                    handleDevUpdate({ assignee_id: value === 'unassigned' ? null : value })
                  }
                  options={[
                    { value: 'unassigned', label: 'Unassigned' },
                    ...mentionables
                      .filter((p) => p.role === 'developer')
                      .map((p) => ({ value: p.id, label: p.full_name || p.email })),
                  ]}
                />
              </div>
            </div>
          </div>
        )}

        {!editing && (
          <>
            <p className="feedback-detail-desc">{ticket.description}</p>

            {showAttachments && screenshotUrls.length > 0 && (
              <div className="feedback-gallery">
                {screenshotUrls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="Screenshot" />
                  </a>
                ))}
              </div>
            )}

            <div className="feedback-detail-attribution">
              {ticket.assignee_name && <div>Assigned to {ticket.assignee_name}</div>}
              <div>Created by {ticket.author_name || 'Member'} · {formatTime(ticket.created_at)}</div>
            </div>
          </>
        )}

        {error && <p className="feedback-error">{error}</p>}
        </div>

        <div className="card feedback-detail-card feedback-detail-side">
        <h3 className="feedback-timeline-title">Discussion & Activity</h3>

        <form className="feedback-composer" onSubmit={handleComment}>
          <MentionsInput
            className="mentions-input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment… use @ to mention admins and developers"
            allowSuggestionsAboveCursor
          >
            <Mention
              trigger="@"
              data={mentionables.map((p) => ({ id: p.id, display: p.full_name || p.email }))}
              markup="@[__display__](__id__)"
              // React 19 no longer applies function-component defaultProps, so
              // react-mentions' defaults must be passed explicitly.
              displayTransform={(id, display) => `@${display}`}
              onAdd={() => null}
              onRemove={() => null}
              appendSpaceOnAdd
            />
          </MentionsInput>
          <div className="feedback-composer-actions">
            <button
              type="submit"
              className="btn-primary feedback-send-btn"
              disabled={posting || !comment.trim()}
              aria-label="Post comment"
              title="Post comment"
            >
              <SendHorizontal size={16} />
            </button>
          </div>
        </form>

        <div className="feedback-timeline">
          {timeline.length === 0 && (
            <p className="feedback-muted" style={{ padding: '0.5rem 0' }}>No activity yet.</p>
          )}
          {/* Timeline is merged oldest-first; show newest activity at the top. */}
          {[...timeline].reverse().map((item) => (
            item.kind === 'comment' ? (
              <div key={`c-${item.id}`} className="feedback-comment">
                <div className="feedback-comment-head">
                  <span className="feedback-comment-author">{item.author_name || 'Member'}</span>
                  <span className="feedback-comment-time">{formatTime(item.created_at)}</span>
                </div>
                <div className="feedback-comment-body">{renderCommentBody(item.body)}</div>
              </div>
            ) : (
              <div key={`e-${item.id}`} className="feedback-event">
                <div className="feedback-event-text">{eventText(item)}</div>
                <div className="feedback-event-time">{formatTime(item.created_at)}</div>
              </div>
            )
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}
