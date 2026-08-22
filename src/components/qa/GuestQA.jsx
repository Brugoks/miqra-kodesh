import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  ChevronUp,
  Loader2,
  MessageCircleQuestion,
  Send,
  CheckCircle2,
  Clock,
  Lock,
} from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../../lib/supabaseClient';
import { getGuestToken, rotateGuestToken } from '../../lib/guestToken';
import './GuestQA.css';

// Account-free Q&R submission, reached by scanning the session QR code. This
// route mounts above the app's auth gate, so it must not read session, org, or
// profile state — everything comes from the `qa-guest` edge function keyed by
// the join code in the URL.
//
// `?kiosk=1` is for the shared laptop at the side of the room: it rotates the
// device token after each submission so the next student in line starts clean
// and cannot see or undo the previous person's votes.

const REFRESH_MS = 8_000;

// functions.invoke surfaces non-2xx as FunctionsHttpError with the body left
// unread, so the server's message has to be pulled off the context.
const invokeGuest = async (payload) => {
  const { data, error } = await supabase.functions.invoke('qa-guest', { body: payload });
  if (!error) return data;

  let message = error.message || 'Something went wrong.';
  try {
    const body = await error.context?.json();
    if (body?.error) message = body.error;
  } catch { /* non-JSON error body — keep the generic message */ }
  throw new Error(message);
};

const formatTime = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
};

export default function GuestQA() {
  const { code: rawCode } = useParams();
  const [searchParams] = useSearchParams();
  const kioskMode = searchParams.get('kiosk') === '1';
  const code = (rawCode || '').trim().toUpperCase();

  const [token, setToken] = useState(() => getGuestToken());
  const [loading, setLoading] = useState(true);
  const [board, setBoard] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [name, setName] = useState('');
  const [withName, setWithName] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [justSent, setJustSent] = useState(null);
  const [votingId, setVotingId] = useState(null);

  const titleRef = useRef(null);

  // The confirmation banner clears itself on a timer. Without tracking the id,
  // a guest who submits and immediately closes the tab (or, at the kiosk, is
  // navigated away by the next person) leaves a timer holding this component
  // alive to set state on something already unmounted.
  const sentTimerRef = useRef(null);
  useEffect(() => () => window.clearTimeout(sentTimerRef.current), []);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!hasSupabaseConfig || !code) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    try {
      const data = await invokeGuest({ action: 'load', code, deviceToken: token });
      setBoard(data);
      setLoadError('');
    } catch (err) {
      // A background refresh must never blank out a board the room is looking
      // at; only a foreground load surfaces the failure.
      if (!quiet) setLoadError(err.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [code, token]);

  useEffect(() => {
    Promise.resolve().then(() => {
      load();
    });
  }, [load]);

  // Poll rather than subscribe: this page has no authenticated realtime
  // channel, and a projector-adjacent screen benefits more from a boring
  // refresh than from socket reconnection logic.
  useEffect(() => {
    if (!board?.found) return undefined;
    const id = window.setInterval(() => load({ quiet: true }), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [board?.found, load]);

  const session = board?.session;
  const org = board?.organization;
  const questions = useMemo(() => {
    const list = board?.questions || [];
    return [...list].sort(
      (a, b) => (b.vote_count || 0) - (a.vote_count || 0)
        || new Date(b.created_at) - new Date(a.created_at),
    );
  }, [board?.questions]);

  const accepting = Boolean(session?.accepting);

  const resetForm = () => {
    setTitle('');
    setBody('');
    if (kioskMode) {
      setName('');
      setWithName(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const clean = title.trim();
    if (!clean || submitting) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      const data = await invokeGuest({
        action: 'submit',
        code,
        deviceToken: token,
        title: clean,
        body: body.trim(),
        name: withName ? name.trim() : '',
      });

      setBoard((cur) => ({ ...cur, ...data }));
      setJustSent({ pending: data?.submitted?.status === 'pending' });
      resetForm();

      if (kioskMode) {
        // Hand the next person a fresh device: their votes and rate limit
        // start over, and they can't touch what the last student submitted.
        const next = rotateGuestToken();
        setToken(next);
      }

      window.clearTimeout(sentTimerRef.current);
      sentTimerRef.current = window.setTimeout(() => setJustSent(null), 6_000);
      titleRef.current?.focus();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (questionId) => {
    if (!session?.voting_enabled || votingId) return;
    setVotingId(questionId);

    // Optimistic: the room taps these while the list is re-polling.
    setBoard((cur) => ({
      ...cur,
      questions: (cur?.questions || []).map((q) => (
        q.id === questionId
          ? { ...q, voted: !q.voted, vote_count: (q.vote_count || 0) + (q.voted ? -1 : 1) }
          : q
      )),
    }));

    try {
      const data = await invokeGuest({ action: 'vote', code, deviceToken: token, questionId });
      setBoard((cur) => ({
        ...cur,
        questions: (cur?.questions || []).map((q) => (
          q.id === questionId ? { ...q, voted: data.voted, vote_count: data.vote_count } : q
        )),
      }));
    } catch {
      load({ quiet: true });
    } finally {
      setVotingId(null);
    }
  };

  if (!hasSupabaseConfig) {
    return (
      <div className="guest-qa">
        <div className="guest-qa-card guest-qa-message">
          <MessageCircleQuestion size={32} />
          <h1>Not available</h1>
          <p>This link needs a live connection to work.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="guest-qa">
        <div className="guest-qa-card guest-qa-message">
          <Loader2 size={28} className="guest-qa-spin" />
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (loadError || !session) {
    return (
      <div className="guest-qa">
        <div className="guest-qa-card guest-qa-message">
          <MessageCircleQuestion size={32} />
          <h1>We couldn&apos;t find that session</h1>
          <p>{loadError || 'Double-check the code or scan the QR code again.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="guest-qa"
      style={org?.primary_color ? { '--guest-accent': org.primary_color } : undefined}
    >
      <header className="guest-qa-header">
        {org?.logo_url && <img className="guest-qa-logo" src={org.logo_url} alt="" />}
        <p className="guest-qa-org">{org?.name}</p>
        <h1>{session.title}</h1>
        {session.topic && <p className="guest-qa-topic">{session.topic}</p>}
        {session.description && <p className="guest-qa-description">{session.description}</p>}
      </header>

      {accepting ? (
        <form className="guest-qa-card guest-qa-form" onSubmit={handleSubmit}>
          <label className="guest-qa-label" htmlFor="guest-qa-title">Your question</label>
          <textarea
            id="guest-qa-title"
            ref={titleRef}
            className="guest-qa-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ask anything…"
            rows={3}
            maxLength={300}
            required
          />

          <textarea
            className="guest-qa-body-input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add more detail (optional)"
            rows={2}
            maxLength={2000}
          />

          <div className="guest-qa-identity">
            <label className="guest-qa-toggle">
              <input
                type="checkbox"
                checked={withName}
                onChange={(e) => setWithName(e.target.checked)}
              />
              <span>Add my name</span>
            </label>
            {withName ? (
              <input
                type="text"
                className="guest-qa-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={60}
                autoComplete={kioskMode ? 'off' : 'given-name'}
              />
            ) : (
              <span className="guest-qa-anon-note">Sending anonymously</span>
            )}
          </div>

          {submitError && <p className="guest-qa-error">{submitError}</p>}

          <button type="submit" className="guest-qa-submit" disabled={submitting || !title.trim()}>
            {submitting ? <Loader2 size={17} className="guest-qa-spin" /> : <Send size={17} />}
            <span>{submitting ? 'Sending…' : 'Send question'}</span>
          </button>

          {justSent && (
            <p className="guest-qa-sent">
              {justSent.pending ? <Clock size={15} /> : <CheckCircle2 size={15} />}
              {justSent.pending
                ? 'Sent — a leader will review it before it shows up.'
                : 'Sent! Thanks for asking.'}
              {kioskMode && ' Pass it on to the next person.'}
            </p>
          )}
        </form>
      ) : (
        <div className="guest-qa-card guest-qa-closed">
          <Lock size={20} />
          <p>This session isn&apos;t taking new questions right now.</p>
        </div>
      )}

      <section className="guest-qa-list-section">
        <div className="guest-qa-list-heading">
          <h2>Questions so far</h2>
          <span>{questions.length}</span>
        </div>

        {questions.length === 0 ? (
          <div className="guest-qa-card guest-qa-empty">
            <MessageCircleQuestion size={24} />
            <p>Nothing yet — ask the first one.</p>
          </div>
        ) : (
          <ul className="guest-qa-list">
            {questions.map((q) => (
              <li key={q.id} className="guest-qa-item">
                {session.voting_enabled && (
                  <button
                    type="button"
                    className={`guest-qa-vote ${q.voted ? 'voted' : ''}`}
                    onClick={() => handleVote(q.id)}
                    disabled={votingId === q.id}
                    aria-pressed={Boolean(q.voted)}
                    aria-label={q.voted ? 'Remove your upvote' : 'Upvote this question'}
                  >
                    <ChevronUp size={18} />
                    <span>{q.vote_count || 0}</span>
                  </button>
                )}
                <div className="guest-qa-item-main">
                  <p className="guest-qa-item-title">{q.title}</p>
                  {q.body && <p className="guest-qa-item-body">{q.body}</p>}
                  <p className="guest-qa-item-meta">
                    <span>{q.author_label || 'Anonymous'}</span>
                    <span>·</span>
                    <span>{formatTime(q.created_at)}</span>
                    {q.answered && (
                      <>
                        <span>·</span>
                        <span className="guest-qa-answered"><CheckCircle2 size={12} /> Answered</span>
                      </>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="guest-qa-footer">
        <p>Questions are shared with your group&apos;s leaders.</p>
      </footer>
    </div>
  );
}
