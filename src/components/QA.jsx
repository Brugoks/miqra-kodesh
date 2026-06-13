import { useCallback, useEffect, useMemo, useState } from 'react';
import './QA.css';
import {
  MessageCircleQuestion,
  ChevronUp,
  Plus,
  RefreshCw,
  Send,
  X,
  MessagesSquare,
  UserRound,
  EyeOff,
} from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';

const formatDateTime = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
};

const authorLabel = (row) => (row.is_anonymous ? 'Anonymous' : (row.author_name || 'Member'));

export default function QA({ session, activeOrgId }) {
  const user = session?.user;
  const userId = user?.id;
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Member';

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [qVotes, setQVotes] = useState([]);
  const [aVotes, setAVotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [error, setError] = useState('');

  const [askOpen, setAskOpen] = useState(false);
  const [askForm, setAskForm] = useState({ title: '', body: '', anonymous: false });
  const [askSubmitting, setAskSubmitting] = useState(false);

  const [answerBody, setAnswerBody] = useState('');
  const [answerAnon, setAnswerAnon] = useState(false);
  const [answerSubmitting, setAnswerSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    if (!hasSupabaseConfig || !user || !activeOrgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');

    const [questionsRes, answersRes, qVotesRes, aVotesRes] = await Promise.all([
      supabase.from('qa_questions').select('*').eq('organization_id', activeOrgId).order('created_at', { ascending: false }),
      supabase.from('qa_answers').select('*').eq('organization_id', activeOrgId).order('created_at', { ascending: true }),
      supabase.from('qa_question_votes').select('question_id, user_id'),
      supabase.from('qa_answer_votes').select('answer_id, user_id'),
    ]);

    if (questionsRes.error) {
      setError(questionsRes.error.message || 'Could not load the Q&R board.');
      setQuestions([]);
    } else {
      setQuestions(questionsRes.data || []);
    }
    setAnswers(answersRes.data || []);
    setQVotes(qVotesRes.data || []);
    setAVotes(aVotesRes.data || []);
    setLoading(false);
  }, [user, activeOrgId]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!hasSupabaseConfig || !user || !activeOrgId) {
        if (active) setLoading(false);
        return;
      }
      await loadAll();
    })();
    return () => { active = false; };
  }, [loadAll, user, activeOrgId]);

  const qVoteCount = useMemo(() => {
    const map = {};
    qVotes.forEach((v) => { map[v.question_id] = (map[v.question_id] || 0) + 1; });
    return map;
  }, [qVotes]);

  const aVoteCount = useMemo(() => {
    const map = {};
    aVotes.forEach((v) => { map[v.answer_id] = (map[v.answer_id] || 0) + 1; });
    return map;
  }, [aVotes]);

  const myQVotes = useMemo(() => new Set(qVotes.filter((v) => v.user_id === userId).map((v) => v.question_id)), [qVotes, userId]);
  const myAVotes = useMemo(() => new Set(aVotes.filter((v) => v.user_id === userId).map((v) => v.answer_id)), [aVotes, userId]);

  const answersByQuestion = useMemo(() => {
    const map = {};
    answers.forEach((a) => { (map[a.question_id] ||= []).push(a); });
    return map;
  }, [answers]);

  const sortedQuestions = useMemo(() => (
    [...questions].sort((a, b) => (
      (qVoteCount[b.id] || 0) - (qVoteCount[a.id] || 0)
      || new Date(b.created_at) - new Date(a.created_at)
    ))
  ), [questions, qVoteCount]);

  const selectedQuestion = questions.find((q) => q.id === selectedId) || null;
  const selectedAnswers = useMemo(() => {
    const list = answersByQuestion[selectedId] || [];
    return [...list].sort((a, b) => (
      (aVoteCount[b.id] || 0) - (aVoteCount[a.id] || 0)
      || new Date(a.created_at) - new Date(b.created_at)
    ));
  }, [answersByQuestion, selectedId, aVoteCount]);

  const toggleQuestionVote = async (questionId) => {
    if (!userId) return;
    const hasVoted = myQVotes.has(questionId);
    // optimistic
    setQVotes((cur) => (hasVoted
      ? cur.filter((v) => !(v.question_id === questionId && v.user_id === userId))
      : [...cur, { question_id: questionId, user_id: userId }]));

    const res = hasVoted
      ? await supabase.from('qa_question_votes').delete().eq('question_id', questionId).eq('user_id', userId)
      : await supabase.from('qa_question_votes').insert({ question_id: questionId, user_id: userId });
    if (res.error) {
      setError(res.error.message || 'Could not update your vote.');
      loadAll();
    }
  };

  const toggleAnswerVote = async (answerId) => {
    if (!userId) return;
    const hasVoted = myAVotes.has(answerId);
    setAVotes((cur) => (hasVoted
      ? cur.filter((v) => !(v.answer_id === answerId && v.user_id === userId))
      : [...cur, { answer_id: answerId, user_id: userId }]));

    const res = hasVoted
      ? await supabase.from('qa_answer_votes').delete().eq('answer_id', answerId).eq('user_id', userId)
      : await supabase.from('qa_answer_votes').insert({ answer_id: answerId, user_id: userId });
    if (res.error) {
      setError(res.error.message || 'Could not update your vote.');
      loadAll();
    }
  };

  const submitQuestion = async (event) => {
    event.preventDefault();
    const title = askForm.title.trim();
    if (!title) {
      setError('Please enter a question.');
      return;
    }
    setAskSubmitting(true);
    setError('');
    const { data, error: insertError } = await supabase
      .from('qa_questions')
      .insert({
        organization_id: activeOrgId,
        author_id: userId,
        author_name: displayName,
        is_anonymous: askForm.anonymous,
        title,
        body: askForm.body.trim() || null,
      })
      .select('*')
      .single();

    if (insertError) {
      setError(insertError.message || 'Could not post your question.');
      setAskSubmitting(false);
      return;
    }
    setQuestions((cur) => [data, ...cur]);
    setAskForm({ title: '', body: '', anonymous: false });
    setAskOpen(false);
    setAskSubmitting(false);
    setSelectedId(data.id);
  };

  const submitAnswer = async (event) => {
    event.preventDefault();
    const body = answerBody.trim();
    if (!body || !selectedQuestion) return;
    setAnswerSubmitting(true);
    setError('');
    const { data, error: insertError } = await supabase
      .from('qa_answers')
      .insert({
        question_id: selectedQuestion.id,
        organization_id: activeOrgId,
        author_id: userId,
        author_name: displayName,
        is_anonymous: answerAnon,
        body,
      })
      .select('*')
      .single();

    if (insertError) {
      setError(insertError.message || 'Could not post your answer.');
      setAnswerSubmitting(false);
      return;
    }
    setAnswers((cur) => [...cur, data]);
    setAnswerBody('');
    setAnswerAnon(false);
    setAnswerSubmitting(false);
  };

  if (!hasSupabaseConfig) {
    return (
      <div className="qa-page">
        <section className="qa-header card">
          <MessageCircleQuestion size={34} />
          <div>
            <h1>Q&amp;R</h1>
            <p>Connect Supabase to ask questions and post answers.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="qa-page">
      <section className="qa-header card">
        <div className="qa-title">
          <MessageCircleQuestion size={34} />
          <div>
            <h1>Questions &amp; Responses</h1>
            <p>Ask anything, answer one another, and upvote what matters most.</p>
          </div>
        </div>
        <div className="qa-actions">
          <button type="button" className="btn-secondary icon-btn" onClick={loadAll} disabled={loading} title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button type="button" className="btn-primary qa-ask-btn" onClick={() => { setAskOpen(true); setError(''); }}>
            <Plus size={16} />
            <span>Ask a Question</span>
          </button>
        </div>
      </section>

      <section className="qa-shell">
        <div className="qa-list card">
          <div className="qa-panel-heading">
            <h2>Questions</h2>
            <span>{loading ? 'Loading…' : `${sortedQuestions.length} question${sortedQuestions.length === 1 ? '' : 's'}`}</span>
          </div>
          {sortedQuestions.length === 0 ? (
            <div className="qa-empty">
              <MessagesSquare size={28} />
              <p>{loading ? 'Loading…' : 'No questions yet. Be the first to ask!'}</p>
            </div>
          ) : (
            <div className="qa-question-list">
              {sortedQuestions.map((q) => {
                const voted = myQVotes.has(q.id);
                return (
                  <div key={q.id} className={`qa-question-row ${selectedId === q.id ? 'active' : ''}`}>
                    <button
                      type="button"
                      className={`qa-vote ${voted ? 'voted' : ''}`}
                      onClick={() => toggleQuestionVote(q.id)}
                      title={voted ? 'Remove upvote' : 'Upvote'}
                    >
                      <ChevronUp size={18} />
                      <strong>{qVoteCount[q.id] || 0}</strong>
                    </button>
                    <button type="button" className="qa-question-main" onClick={() => setSelectedId(q.id)}>
                      <div className="qa-question-title">{q.title}</div>
                      <div className="qa-question-meta">
                        <span className="qa-author">
                          {q.is_anonymous ? <EyeOff size={12} /> : <UserRound size={12} />}
                          {authorLabel(q)}
                        </span>
                        <span>·</span>
                        <span>{formatDateTime(q.created_at)}</span>
                        <span>·</span>
                        <span>{(answersByQuestion[q.id] || []).length} answer{(answersByQuestion[q.id] || []).length === 1 ? '' : 's'}</span>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <article className="qa-detail card">
          {selectedQuestion ? (
            <div className="qa-detail-content">
              <div className="qa-detail-question">
                <button
                  type="button"
                  className={`qa-vote ${myQVotes.has(selectedQuestion.id) ? 'voted' : ''}`}
                  onClick={() => toggleQuestionVote(selectedQuestion.id)}
                >
                  <ChevronUp size={20} />
                  <strong>{qVoteCount[selectedQuestion.id] || 0}</strong>
                </button>
                <div>
                  <h2>{selectedQuestion.title}</h2>
                  {selectedQuestion.body && <p className="qa-detail-body">{selectedQuestion.body}</p>}
                  <div className="qa-question-meta">
                    <span className="qa-author">
                      {selectedQuestion.is_anonymous ? <EyeOff size={12} /> : <UserRound size={12} />}
                      {authorLabel(selectedQuestion)}
                    </span>
                    <span>·</span>
                    <span>{formatDateTime(selectedQuestion.created_at)}</span>
                  </div>
                </div>
              </div>

              <div className="qa-answers-heading">
                {selectedAnswers.length} Answer{selectedAnswers.length === 1 ? '' : 's'}
              </div>

              <div className="qa-answer-list">
                {selectedAnswers.map((a) => {
                  const voted = myAVotes.has(a.id);
                  return (
                    <div key={a.id} className="qa-answer-row">
                      <button
                        type="button"
                        className={`qa-vote ${voted ? 'voted' : ''}`}
                        onClick={() => toggleAnswerVote(a.id)}
                        title={voted ? 'Remove upvote' : 'Upvote'}
                      >
                        <ChevronUp size={16} />
                        <strong>{aVoteCount[a.id] || 0}</strong>
                      </button>
                      <div className="qa-answer-main">
                        <p>{a.body}</p>
                        <div className="qa-question-meta">
                          <span className="qa-author">
                            {a.is_anonymous ? <EyeOff size={12} /> : <UserRound size={12} />}
                            {authorLabel(a)}
                          </span>
                          <span>·</span>
                          <span>{formatDateTime(a.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {selectedAnswers.length === 0 && (
                  <p className="qa-no-answers">No answers yet — share yours below.</p>
                )}
              </div>

              <form className="qa-answer-form" onSubmit={submitAnswer}>
                <textarea
                  rows={3}
                  value={answerBody}
                  onChange={(e) => setAnswerBody(e.target.value)}
                  placeholder="Write an answer…"
                />
                <div className="qa-form-footer">
                  <label className="qa-anon-toggle">
                    <input type="checkbox" checked={answerAnon} onChange={(e) => setAnswerAnon(e.target.checked)} />
                    <span>Answer anonymously</span>
                  </label>
                  <button type="submit" className="btn-primary icon-text-btn" disabled={answerSubmitting || !answerBody.trim()}>
                    <Send size={15} />
                    <span>{answerSubmitting ? 'Posting…' : 'Post Answer'}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="qa-empty qa-detail-empty">
              <MessageCircleQuestion size={30} />
              <p>Select a question to read answers, or ask a new one.</p>
            </div>
          )}
        </article>
      </section>

      {error && <p className="qa-status error">{error}</p>}

      {askOpen && (
        <div
          className="qa-modal-overlay"
          role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) setAskOpen(false); }}
        >
          <div className="qa-modal card" role="dialog" aria-modal="true" aria-label="Ask a question">
            <form className="qa-ask-form" onSubmit={submitQuestion}>
              <div className="qa-panel-heading">
                <h2>Ask a Question</h2>
                <button type="button" className="qa-modal-close" onClick={() => setAskOpen(false)} aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              <label>
                <span>Question</span>
                <input
                  type="text"
                  value={askForm.title}
                  onChange={(e) => setAskForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="What would you like to ask?"
                />
              </label>
              <label>
                <span>Details (optional)</span>
                <textarea
                  rows={5}
                  value={askForm.body}
                  onChange={(e) => setAskForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="Add context if it helps…"
                />
              </label>
              <div className="qa-form-footer">
                <label className="qa-anon-toggle">
                  <input
                    type="checkbox"
                    checked={askForm.anonymous}
                    onChange={(e) => setAskForm((f) => ({ ...f, anonymous: e.target.checked }))}
                  />
                  <span>Ask anonymously</span>
                </label>
                <div className="qa-ask-actions">
                  <button type="button" className="btn-secondary" onClick={() => setAskOpen(false)}>Cancel</button>
                  <button type="submit" className="btn-primary icon-text-btn" disabled={askSubmitting || !askForm.title.trim()}>
                    <Send size={15} />
                    <span>{askSubmitting ? 'Posting…' : 'Post Question'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
