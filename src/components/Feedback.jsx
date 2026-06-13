import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquarePlus, Search, ThumbsUp, MessageCircle, Image } from 'lucide-react';
import './Feedback.css';
import {
  fetchBoard,
  searchSimilar,
  fetchUserVotes,
  toggleVote,
  categoryDisplay,
  appAreaDisplay,
  statusLabel,
  FEEDBACK_STATUSES,
} from '../lib/feedbackApi';
import FeedbackSubmitForm from './FeedbackSubmitForm';
import FeedbackTicketDetail from './FeedbackTicketDetail';

const SORT_OPTIONS = [
  { value: 'trending', label: 'Trending' },
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
];

export default function Feedback({ session, userRole, activeOrgId }) {
  // view: 'board' | 'new' | { ticketId }
  const [view, setView] = useState('board');
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState('trending');
  const [statusFilter, setStatusFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [userVotes, setUserVotes] = useState(new Set());
  const searchTimer = useRef(null);

  const userId = session?.user?.id;

  const loadBoard = useCallback(async (query = '') => {
    setLoading(true);
    setError('');
    try {
      const trimmed = query.trim();
      const rows = trimmed
        ? await searchSimilar(trimmed, 50, activeOrgId)
        : await fetchBoard({ sort, status: statusFilter, activeOrgId });
      setTickets(rows);
    } catch {
      setError('Could not load feedback. Please try again.');
    }
    setLoading(false);
  }, [sort, statusFilter, activeOrgId]);

  // Reload immediately on view/sort/filter changes; debounce while typing a search.
  const prevSearch = useRef(search);
  useEffect(() => {
    if (view !== 'board') return undefined;
    const delay = search !== prevSearch.current ? 350 : 0;
    prevSearch.current = search;
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadBoard(search), delay);
    return () => clearTimeout(searchTimer.current);
  }, [view, sort, statusFilter, search, loadBoard]);

  useEffect(() => {
    let active = true;
    fetchUserVotes(userId).then((votes) => {
      if (active) setUserVotes(votes);
    }).catch(() => {});
    return () => { active = false; };
  }, [userId]);

  const handleVote = async (ticket) => {
    const hasVoted = userVotes.has(ticket.id);
    // Optimistic update
    setUserVotes((prev) => {
      const next = new Set(prev);
      if (hasVoted) next.delete(ticket.id);
      else next.add(ticket.id);
      return next;
    });
    setTickets((prev) => prev.map((t) =>
      t.id === ticket.id ? { ...t, votes: t.votes + (hasVoted ? -1 : 1) } : t
    ));
    try {
      await toggleVote(ticket.id, userId, hasVoted);
    } catch {
      // Roll back on failure
      setUserVotes((prev) => {
        const next = new Set(prev);
        if (hasVoted) next.add(ticket.id);
        else next.delete(ticket.id);
        return next;
      });
      setTickets((prev) => prev.map((t) =>
        t.id === ticket.id ? { ...t, votes: t.votes + (hasVoted ? 1 : -1) } : t
      ));
    }
  };

  if (view === 'new') {
    return (
      <FeedbackSubmitForm
        session={session}
        onCancel={() => setView('board')}
        onSubmitted={() => setView('board')}
        userVotes={userVotes}
        onVote={handleVote}
        activeOrgId={activeOrgId}
      />
    );
  }

  if (view !== 'board') {
    return (
      <FeedbackTicketDetail
        ticketId={view.ticketId}
        session={session}
        userRole={userRole}
        userVotes={userVotes}
        onVote={handleVote}
        onBack={() => setView('board')}
      />
    );
  }

  return (
    <div className="feedback-page">
      <div className="feedback-header">
        <div>
          <h1>Feedback Board</h1>
          <p>Report bugs, request features, and vote on what matters most.</p>
        </div>
        <button className="btn-primary feedback-new-btn" onClick={() => setView('new')}>
          <MessageSquarePlus size={16} />
          Submit Feedback
        </button>
      </div>

      <div className="feedback-toolbar">
        <div className="feedback-search">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search feedback…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="feedback-sorts">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`feedback-chip ${sort === opt.value && !search ? 'active' : ''}`}
              onClick={() => { setSearch(''); setSort(opt.value); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="feedback-status-filters">
        <button
          className={`feedback-chip ${statusFilter === 'active' ? 'active' : ''}`}
          onClick={() => setStatusFilter('active')}
        >
          Active
        </button>
        <button
          className={`feedback-chip ${statusFilter === 'all' ? 'active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          All
        </button>
        {FEEDBACK_STATUSES.map((s) => (
          <button
            key={s.value}
            className={`feedback-chip ${statusFilter === s.value ? 'active' : ''}`}
            onClick={() => setStatusFilter(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <p className="feedback-error">{error}</p>}

      {loading ? (
        <p className="feedback-muted">Loading feedback…</p>
      ) : tickets.length === 0 ? (
        <div className="card feedback-empty">
          <MessageSquarePlus size={32} />
          <p>{search ? 'No feedback matches your search.' : 'No feedback yet — be the first to share an idea!'}</p>
        </div>
      ) : (
        <div className="feedback-list">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="card feedback-card">
              <button
                className={`feedback-vote ${userVotes.has(ticket.id) ? 'voted' : ''}`}
                onClick={() => handleVote(ticket)}
                aria-label={userVotes.has(ticket.id) ? 'Remove vote' : 'Upvote'}
              >
                <ThumbsUp size={15} />
                <span>{ticket.votes}</span>
              </button>
              <div
                className="feedback-card-body"
                onClick={() => setView({ ticketId: ticket.id })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') setView({ ticketId: ticket.id }); }}
              >
                <div className="feedback-card-title">{ticket.title}</div>
                <div className="feedback-card-desc">{ticket.description}</div>
                <div className="feedback-card-meta">
                  <span className={`feedback-badge status-${ticket.status}`}>{statusLabel(ticket.status)}</span>
                  <span className="feedback-badge category">{categoryDisplay(ticket)}</span>
                  <span className="feedback-badge area">{appAreaDisplay(ticket)}</span>
                  {ticket.priority && (
                    <span className={`feedback-badge priority-${ticket.priority}`}>{ticket.priority}</span>
                  )}
                  <span className="feedback-meta-item">
                    <MessageCircle size={13} /> {ticket.comments}
                  </span>
                  {ticket.screenshot_paths?.length > 0 && (
                    <span className="feedback-meta-item">
                      <Image size={13} /> {ticket.screenshot_paths.length}
                    </span>
                  )}
                  <span className="feedback-meta-item author">
                    {ticket.author_name || 'Member'} · {new Date(ticket.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
