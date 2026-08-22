import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronUp, Loader2, Maximize2, Minimize2, X, CheckCircle2 } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../../lib/supabaseClient';
import './QAPresent.css';

// Projector view for the room's second screen. Runs on the leader's laptop
// (authenticated) while the browser window is dragged onto the TV, the same
// way they already drive ProPresenter.
//
// Deliberately boring about data: it polls instead of holding a realtime
// socket, because a dropped subscription that silently stops updating is much
// worse on a screen nobody is looking at the console of. Nothing here can
// mutate a question — it is a read-only surface.

const POLL_MS = 5_000;
const MAX_VISIBLE = 8;

export default function QAPresent() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!hasSupabaseConfig || !sessionId) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('qa_session_board', {
      target_session_id: sessionId,
    });
    if (rpcError) {
      // Keep the last good frame on screen if a refresh fails mid-meeting.
      if (!quiet) setError(rpcError.message || 'Could not load this session.');
    } else {
      setBoard(data);
      setError('');
    }
    if (!quiet) setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    Promise.resolve().then(() => {
      load();
    });
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => load({ quiet: true }), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const session = board?.session;
  const joinUrl = session?.join_code
    ? `${window.location.origin}/q/${session.join_code}`
    : null;

  useEffect(() => {
    if (!joinUrl) return undefined;
    let cancelled = false;
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(joinUrl, { width: 420, margin: 1 }))
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [joinUrl]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'f' || event.key === 'F') toggleFullscreen();
      if (event.key === 'Escape' && !document.fullscreenElement) navigate('/qa');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, toggleFullscreen]);

  const answeredIds = useMemo(
    () => new Set((board?.answers || []).map((a) => a.question_id)),
    [board?.answers],
  );

  const voteCounts = useMemo(() => {
    const map = {};
    (board?.question_votes || []).forEach((v) => {
      map[v.question_id] = (map[v.question_id] || 0) + 1;
    });
    (board?.questions || []).forEach((q) => {
      map[q.id] = (map[q.id] || 0) + (q.guest_vote_count || 0);
    });
    return map;
  }, [board?.question_votes, board?.questions]);

  const ranked = useMemo(() => {
    const list = (board?.questions || []).filter(
      (q) => q.status === 'published' && q.bucket !== 'answered' && q.bucket !== 'parked',
    );
    return list
      .sort(
        (a, b) => (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0)
          || Number(answeredIds.has(a.id)) - Number(answeredIds.has(b.id))
          || new Date(b.created_at) - new Date(a.created_at),
      )
      .slice(0, MAX_VISIBLE);
  }, [answeredIds, board?.questions, voteCounts]);

  if (loading) {
    return (
      <div className="qap-stage qap-centered">
        <Loader2 size={40} className="qap-spin" />
      </div>
    );
  }

  if (error && !board) {
    return (
      <div className="qap-stage qap-centered">
        <p className="qap-error">{error}</p>
        <button type="button" className="qap-exit-btn" onClick={() => navigate('/qa')}>
          Back to Q&amp;R
        </button>
      </div>
    );
  }

  return (
    <div className="qap-stage">
      <div className="qap-controls">
        <button
          type="button"
          className="qap-control-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit full screen (F)' : 'Full screen (F)'}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        <button
          type="button"
          className="qap-control-btn"
          onClick={() => navigate('/qa')}
          title="Close present mode (Esc)"
        >
          <X size={18} />
        </button>
      </div>

      <header className="qap-header">
        <h1>{session?.title}</h1>
        {session?.topic && <p className="qap-topic">{session.topic}</p>}
      </header>

      <main className="qap-main">
        <ol className="qap-questions">
          {ranked.length === 0 && (
            <li className="qap-empty">Waiting for the first question…</li>
          )}
          {ranked.map((q, index) => (
            <li
              key={q.id}
              className={`qap-question ${index === 0 ? 'top' : ''} ${answeredIds.has(q.id) ? 'answered' : ''}`}
            >
              <span className="qap-votes">
                <ChevronUp size={22} />
                {voteCounts[q.id] || 0}
              </span>
              <span className="qap-question-text">
                {q.title}
                {answeredIds.has(q.id) && <CheckCircle2 className="qap-answered-icon" size={20} />}
              </span>
              <span className="qap-asker">
                {q.is_anonymous ? 'Anonymous' : (q.author_name || 'Anonymous')}
              </span>
            </li>
          ))}
        </ol>

        {joinUrl && (
          <aside className="qap-join">
            {qrDataUrl
              ? <img className="qap-qr" src={qrDataUrl} alt={`QR code linking to ${joinUrl}`} />
              : <div className="qap-qr qap-qr-placeholder" />}
            <p className="qap-join-label">Scan to ask a question</p>
            <p className="qap-join-code">{session.join_code}</p>
            <p className="qap-join-url">{joinUrl.replace(/^https?:\/\//, '')}</p>
          </aside>
        )}
      </main>
    </div>
  );
}
