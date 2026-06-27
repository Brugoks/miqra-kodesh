import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import './QA.css';
import {
  MessageCircleQuestion,
  ChevronUp,
  Plus,
  RefreshCw,
  Send,
  X,
  MessagesSquare,
  EyeOff,
  Sparkles,
  Loader2,
  Image,
} from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import Avatar from './ui/Avatar';
import { isAdminRole } from '../lib/roles';

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

const getRandomSeed = () => Math.floor(Math.random() * 1000000);

const getQaImagePath = (userId, questionId) => {
  const suffix = questionId ? `qa-${questionId}` : 'qa';
  return `${userId}/${suffix}-${Date.now()}.jpg`;
};

const generateQuestionImage = async (title, body) => {
  let artPrompt = `A serene cinematic biblical painting representing: ${title.trim().slice(0, 150)}`;
  try {
    const { data: artData, error: artErr } = await supabase.functions.invoke('hf-proxy', {
      body: {
        prompt: `You are an art director creating a single text-to-image prompt that captures the visual themes of this question/topic: "${title.trim()}. ${body?.trim() || ''}". Write ONE concrete, cinematic scene under 50 words, with no readable text, words, or letters. Respond with ONLY the image description.`,
        max_new_tokens: 120
      }
    });
    if (!artErr && artData?.text) {
      artPrompt = artData.text.replace(/^["']|["']$/g, '').trim();
    }
  } catch (err) {
    console.error('Failed to generate Q&R art prompt:', err);
  }

  const finalPrompt = `${artPrompt}, oil painting style, fine art, reverent atmosphere, warm soft light, no text, no words, no watermark`;
  const seed = getRandomSeed();
  const { data: imgData, error: imgErr } = await supabase.functions.invoke('image-proxy', {
    body: { prompt: finalPrompt, seed, steps: 8 }
  });

  if (imgErr || !imgData?.image) {
    throw new Error(imgErr?.message || 'No image returned');
  }

  const response = await fetch(imgData.image);
  const blob = await response.blob();
  return { url: imgData.image, blob };
};

export default function QA({ session, userRole, activeOrgId, displayName: profileDisplayName }) {
  const user = session?.user;
  const userId = user?.id;
  const displayName = profileDisplayName || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Member';

  const [avatarByUser, setAvatarByUser] = useState({});
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [qVotes, setQVotes] = useState([]);
  const [aVotes, setAVotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [error, setError] = useState('');

  const [askOpen, setAskOpen] = useState(false);
  const [askForm, setAskForm] = useState({ title: '', body: '', anonymous: false, imagePath: null });
  const [askSubmitting, setAskSubmitting] = useState(false);
  const [editQuestionId, setEditQuestionId] = useState(null);

  const closeAskModal = () => {
    setAskOpen(false);
    setQaImageUrl('');
    setQaImageBlob(null);
    setEditQuestionId(null);
    setAskForm({ title: '', body: '', anonymous: false, imagePath: null });
  };

  const [answerBody, setAnswerBody] = useState('');
  const [answerAnon, setAnswerAnon] = useState(false);
  const [answerSubmitting, setAnswerSubmitting] = useState(false);

  const [editAnswerId, setEditAnswerId] = useState(null);
  const [editAnswerBody, setEditAnswerBody] = useState('');
  const [editAnswerSubmitting, setEditAnswerSubmitting] = useState(false);
  const [deleteAnswerConfirmId, setDeleteAnswerConfirmId] = useState(null);

  const [qaImageUrl, setQaImageUrl] = useState('');
  const [qaImageBlob, setQaImageBlob] = useState(null);
  const [qaAiLoading, setQaAiLoading] = useState(false);
  const [detailAiLoading, setDetailAiLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

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

  // Load org members once per org for author avatars (non-anonymous posts).
  useEffect(() => {
    let active = true;
    (async () => {
      if (!hasSupabaseConfig || !activeOrgId) { setAvatarByUser({}); return; }
      const { data } = await supabase.rpc('org_members', { org_id: activeOrgId });
      if (!active) return;
      const map = {};
      for (const p of data || []) if (p.avatar_url) map[p.id] = p.avatar_url;
      setAvatarByUser(map);
    })();
    return () => { active = false; };
  }, [activeOrgId]);

  // Author chip: anonymous keeps the privacy icon; otherwise show their avatar.
  const renderAuthor = (row) => (
    <span className="qa-author">
      {row.is_anonymous
        ? <EyeOff size={12} />
        : <Avatar src={avatarByUser[row.author_id]} name={authorLabel(row)} size={18} />}
      {authorLabel(row)}
    </span>
  );

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

  const handleGenerateImage = async () => {
    if (!askForm.title.trim()) return;
    setQaAiLoading(true);
    try {
      const res = await generateQuestionImage(askForm.title, askForm.body);
      setQaImageUrl(res.url);
      setQaImageBlob(res.blob);
    } catch (err) {
      console.error('Failed to generate AI image:', err);
      alert('Could not generate AI artwork. Please check your connection and try again.');
    } finally {
      setQaAiLoading(false);
    }
  };

  const handleRegenerateExistingImage = async () => {
    if (!selectedQuestion) return;
    setDetailAiLoading(true);
    try {
      const res = await generateQuestionImage(selectedQuestion.title, selectedQuestion.body);
      const path = getQaImagePath(userId, selectedQuestion.id);
      const { error: uploadErr } = await supabase.storage
        .from('prayer-images')
        .upload(path, res.blob, { contentType: 'image/jpeg' });
      if (uploadErr) throw uploadErr;

      const { error: dbErr } = await supabase
        .from('qa_questions')
        .update({ image_path: path })
        .eq('id', selectedQuestion.id);
      if (dbErr) throw dbErr;

      setQuestions((prev) => prev.map((q) => (q.id === selectedQuestion.id ? { ...q, image_path: path } : q)));
    } catch (err) {
      console.error('Failed to update QA image:', err);
      alert('Could not update AI artwork. Please check your connection and try again.');
    } finally {
      setDetailAiLoading(false);
    }
  };

  const handleOpenEditQuestion = (question) => {
    setAskForm({
      title: question.title,
      body: question.body || '',
      anonymous: question.is_anonymous,
      imagePath: question.image_path,
    });
    setQaImageUrl(question.image_path ? supabase.storage.from('prayer-images').getPublicUrl(question.image_path).data.publicUrl : '');
    setQaImageBlob(null);
    setEditQuestionId(question.id);
    setAskOpen(true);
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!questionId) return;
    setAskSubmitting(true);
    try {
      const { error: deleteErr } = await supabase
        .from('qa_questions')
        .delete()
        .eq('id', questionId);
      if (deleteErr) throw deleteErr;

      setQuestions((cur) => cur.filter((q) => q.id !== questionId));
      if (selectedId === questionId) {
        setSelectedId(null);
      }
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Failed to delete question:', err);
      alert(err.message || 'Could not delete the question.');
    } finally {
      setAskSubmitting(false);
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

    if (editQuestionId) {
      let finalImagePath = askForm.imagePath;
      if (qaImageBlob) {
        try {
          const path = getQaImagePath(userId, editQuestionId);
          const { error: uploadErr } = await supabase.storage
            .from('prayer-images')
            .upload(path, qaImageBlob, { contentType: 'image/jpeg', upsert: true });
          if (uploadErr) {
            console.error('Failed to upload QA image:', uploadErr);
          } else {
            finalImagePath = path;
          }
        } catch (err) {
          console.error('Failed uploading QA image:', err);
        }
      }

      const { data, error: updateError } = await supabase
        .from('qa_questions')
        .update({
          title,
          body: askForm.body.trim() || null,
          is_anonymous: askForm.anonymous,
          image_path: finalImagePath,
        })
        .eq('id', editQuestionId)
        .select('*')
        .single();

      if (updateError) {
        setError(updateError.message || 'Could not update your question.');
        setAskSubmitting(false);
        return;
      }

      setQuestions((cur) => cur.map((q) => (q.id === editQuestionId ? data : q)));
      closeAskModal();
      setAskSubmitting(false);
      return;
    }

    let imagePath = null;
    if (qaImageBlob) {
      try {
        const path = getQaImagePath(userId);
        const { error: uploadErr } = await supabase.storage
          .from('prayer-images')
          .upload(path, qaImageBlob, { contentType: 'image/jpeg' });
        if (uploadErr) {
          console.error('Failed to upload QA image:', uploadErr);
        } else {
          imagePath = path;
        }
      } catch (err) {
        console.error('Failed uploading QA image:', err);
      }
    }

    const { data, error: insertError } = await supabase
      .from('qa_questions')
      .insert({
        organization_id: activeOrgId,
        author_id: userId,
        author_name: displayName,
        is_anonymous: askForm.anonymous,
        title,
        body: askForm.body.trim() || null,
        image_path: imagePath,
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
    closeAskModal();
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

  const submitEditAnswer = async (event) => {
    event.preventDefault();
    const body = editAnswerBody.trim();
    if (!body || !editAnswerId) return;
    setEditAnswerSubmitting(true);
    setError('');
    const { data, error: updateErr } = await supabase
      .from('qa_answers')
      .update({ body, updated_at: new Date().toISOString() })
      .eq('id', editAnswerId)
      .select('*')
      .single();
    if (updateErr) {
      setError(updateErr.message || 'Could not update your answer.');
      setEditAnswerSubmitting(false);
      return;
    }
    setAnswers((cur) => cur.map((a) => (a.id === editAnswerId ? data : a)));
    setEditAnswerId(null);
    setEditAnswerBody('');
    setEditAnswerSubmitting(false);
  };

  const handleDeleteAnswer = async (answerId) => {
    if (!answerId) return;
    const { error: deleteErr } = await supabase
      .from('qa_answers')
      .delete()
      .eq('id', answerId);
    if (deleteErr) {
      alert(deleteErr.message || 'Could not delete the answer.');
      return;
    }
    setAnswers((cur) => cur.filter((a) => a.id !== answerId));
    setDeleteAnswerConfirmId(null);
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
                const imageUrl = q.image_path ? supabase.storage.from('prayer-images').getPublicUrl(q.image_path).data.publicUrl : null;
                return (
                  <div key={q.id} className={`qa-question-row ${selectedId === q.id ? 'active' : ''}`}>
                    <div className="qa-image-container">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt="AI Art"
                          className="qa-image-thumb zoomable"
                          onClick={() => setLightboxUrl(imageUrl)}
                          title="Click to zoom"
                        />
                      ) : (
                        <div className="qa-image-placeholder">
                          <Image size={18} />
                        </div>
                      )}
                    </div>
                    <button type="button" className="qa-question-main" onClick={() => setSelectedId(q.id)}>
                      <div className="qa-question-title">{q.title}</div>
                      <div className="qa-question-meta">
                        {renderAuthor(q)}
                        <span>·</span>
                        <span>{formatDateTime(q.created_at)}</span>
                        <span>·</span>
                        <span>{(answersByQuestion[q.id] || []).length} answer{(answersByQuestion[q.id] || []).length === 1 ? '' : 's'}</span>
                        <span>·</span>
                        <button
                          type="button"
                          className={`qa-vote-compact ${voted ? 'voted' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleQuestionVote(q.id);
                          }}
                          title={voted ? 'Remove upvote' : 'Upvote'}
                        >
                          <ChevronUp size={12} />
                          <span>{qVoteCount[q.id] || 0}</span>
                        </button>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <article className="qa-detail card">
          {selectedQuestion ? (() => {
            const detailImageUrl = selectedQuestion.image_path ? supabase.storage.from('prayer-images').getPublicUrl(selectedQuestion.image_path).data.publicUrl : null;
            const isAuthor = selectedQuestion.author_id === userId || isAdminRole(userRole);
            const voted = myQVotes.has(selectedQuestion.id);
            return (
              <div className="qa-detail-content">
                <div className="qa-detail-question">
                  <div className="qa-detail-image-wrapper">
                    {detailImageUrl ? (
                      <img
                        src={detailImageUrl}
                        alt="AI Artwork"
                        className="qa-detail-image zoomable"
                        onClick={() => setLightboxUrl(detailImageUrl)}
                        title="Click to zoom"
                      />
                    ) : (
                      <div className="qa-detail-image-placeholder">
                        <Image size={24} />
                      </div>
                    )}
                    {isAuthor && (
                      <button
                        type="button"
                        onClick={handleRegenerateExistingImage}
                        disabled={detailAiLoading}
                        className="qa-detail-image-edit-btn"
                        title="Generate/Regenerate AI Artwork"
                      >
                        {detailAiLoading ? (
                          <Loader2 className="spin" size={12} />
                        ) : (
                          <>
                            <Sparkles size={12} />
                            <span>{detailImageUrl ? 'Regenerate' : 'AI Generate'}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="qa-detail-main">
                    <h2>{selectedQuestion.title}</h2>
                    {selectedQuestion.body && <p className="qa-detail-body">{selectedQuestion.body}</p>}
                    <div className="qa-question-meta">
                      {renderAuthor(selectedQuestion)}
                      <span>·</span>
                      <span>{formatDateTime(selectedQuestion.created_at)}</span>
                      <span>·</span>
                      <button
                        type="button"
                        className={`qa-vote-compact ${voted ? 'voted' : ''}`}
                        onClick={() => toggleQuestionVote(selectedQuestion.id)}
                        title={voted ? 'Remove upvote' : 'Upvote'}
                      >
                        <ChevronUp size={12} />
                        <span>{qVoteCount[selectedQuestion.id] || 0}</span>
                      </button>
                      {isAuthor && (
                        <>
                          <span>·</span>
                          <button
                            type="button"
                            className="qa-meta-action-btn"
                            onClick={() => handleOpenEditQuestion(selectedQuestion)}
                          >
                            Edit
                          </button>
                          <span>·</span>
                          <button
                            type="button"
                            className="qa-meta-action-btn delete"
                            onClick={() => setDeleteConfirmId(selectedQuestion.id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="qa-answers-heading">
                {selectedAnswers.length} Answer{selectedAnswers.length === 1 ? '' : 's'}
              </div>

              <div className="qa-answer-list">
                {selectedAnswers.map((a) => {
                  const voted = myAVotes.has(a.id);
                  const canManage = a.author_id === userId || isAdminRole(userRole);
                  const isEditing = editAnswerId === a.id;
                  return (
                    <div key={a.id} className="qa-answer-row">
                      <button
                        type="button"
                        className={`qa-vote ${voted ? 'voted' : ''}`}
                        onClick={() => toggleAnswerVote(a.id)}
                        title={voted ? 'Remove upvote' : 'Upvote'}
                        disabled={isEditing}
                      >
                        <ChevronUp size={16} />
                        <strong>{aVoteCount[a.id] || 0}</strong>
                      </button>
                      <div className="qa-answer-main">
                        {isEditing ? (
                          <form className="qa-answer-edit-form" onSubmit={submitEditAnswer}>
                            <textarea
                              rows={3}
                              value={editAnswerBody}
                              onChange={(e) => setEditAnswerBody(e.target.value)}
                              autoFocus
                            />
                            <div className="qa-form-footer">
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => { setEditAnswerId(null); setEditAnswerBody(''); }}
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="btn-primary icon-text-btn"
                                disabled={editAnswerSubmitting || !editAnswerBody.trim()}
                              >
                                <Send size={15} />
                                <span>{editAnswerSubmitting ? 'Saving…' : 'Save'}</span>
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <p>{a.body}</p>
                            <div className="qa-question-meta">
                              {renderAuthor(a)}
                              <span>·</span>
                              <span>{formatDateTime(a.created_at)}</span>
                              {a.updated_at && a.updated_at !== a.created_at && (
                                <><span>·</span><span className="qa-edited-tag">edited</span></>
                              )}
                              {canManage && (
                                <>
                                  <span>·</span>
                                  <button
                                    type="button"
                                    className="qa-meta-action-btn"
                                    onClick={() => { setEditAnswerId(a.id); setEditAnswerBody(a.body); }}
                                  >
                                    Edit
                                  </button>
                                  <span>·</span>
                                  <button
                                    type="button"
                                    className="qa-meta-action-btn delete"
                                    onClick={() => setDeleteAnswerConfirmId(a.id)}
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
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
          );
        })() : (
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
          onClick={(e) => { if (e.target === e.currentTarget) closeAskModal(); }}
        >
          <div className="qa-modal card" role="dialog" aria-modal="true" aria-label="Ask a question">
            <form className="qa-ask-form" onSubmit={submitQuestion}>
              <div className="qa-panel-heading">
                <h2>{editQuestionId ? 'Edit Question' : 'Ask a Question'}</h2>
                <button type="button" className="qa-modal-close" onClick={closeAskModal} aria-label="Close">
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

              <div className="qa-ai-generator">
                <button
                  type="button"
                  onClick={handleGenerateImage}
                  disabled={qaAiLoading || !askForm.title.trim()}
                  className="btn-secondary qa-ai-btn"
                  title={!askForm.title.trim() ? "Enter a question title to enable image generation" : "AI Generate Artwork"}
                >
                  {qaAiLoading ? (
                    <>
                      <Loader2 className="spin" size={14} />
                      <span>Generating AI Image...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>AI Generate Artwork</span>
                    </>
                  )}
                </button>
                {!askForm.title.trim() && (
                  <p className="qa-ai-hint-text">Enter a question title above to generate AI artwork.</p>
                )}
              </div>

              {qaImageUrl && (
                <div className="qa-ai-preview-box">
                  <span className="qa-ai-preview-label">AI Image Preview</span>
                  <div className="qa-ai-preview-wrapper">
                    <img
                      src={qaImageUrl}
                      alt="Generated Q&R Art"
                      className="qa-ai-preview-image zoomable"
                      onClick={() => setLightboxUrl(qaImageUrl)}
                      title="Click to zoom"
                    />
                    <button
                      type="button"
                      onClick={handleGenerateImage}
                      disabled={qaAiLoading}
                      className="qa-ai-regenerate-btn"
                    >
                      {qaAiLoading ? <Loader2 className="spin" size={12} /> : <RefreshCw size={12} />}
                      <span>Regenerate Image</span>
                    </button>
                  </div>
                </div>
              )}

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
                  <button type="button" className="btn-secondary" onClick={closeAskModal}>Cancel</button>
                  <button type="submit" className="btn-primary icon-text-btn" disabled={askSubmitting || !askForm.title.trim()}>
                    <Send size={15} />
                    <span>{askSubmitting ? (editQuestionId ? 'Saving…' : 'Posting…') : (editQuestionId ? 'Save Changes' : 'Post Question')}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {lightboxUrl && createPortal(
        <div
          className="image-modal-backdrop"
          onClick={() => setLightboxUrl(null)}
          role="presentation"
        >
          <div
            className="image-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="image-modal-close"
              onClick={() => setLightboxUrl(null)}
              aria-label="Close image preview"
            >
              <X size={20} />
            </button>
            <img
              src={lightboxUrl}
              alt="Zoomed Q&R Art"
              className="image-modal-img"
            />
          </div>
        </div>,
        document.body
      )}

      {deleteAnswerConfirmId && (
        <div
          className="qa-modal-overlay"
          role="presentation"
          onClick={() => setDeleteAnswerConfirmId(null)}
        >
          <div className="qa-modal card qa-confirm-modal" role="dialog" aria-modal="true" aria-label="Confirm answer deletion">
            <div className="qa-panel-heading">
              <h2>Delete Answer</h2>
              <button type="button" className="qa-modal-close" onClick={() => setDeleteAnswerConfirmId(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className="qa-confirm-text">
              Are you sure you want to delete this answer? This action is permanent.
            </p>
            <div className="qa-confirm-actions">
              <button type="button" className="btn-secondary" onClick={() => setDeleteAnswerConfirmId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => handleDeleteAnswer(deleteAnswerConfirmId)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div
          className="qa-modal-overlay"
          role="presentation"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div className="qa-modal card qa-confirm-modal" role="dialog" aria-modal="true" aria-label="Confirm deletion">
            <div className="qa-panel-heading">
              <h2>Delete Question</h2>
              <button type="button" className="qa-modal-close" onClick={() => setDeleteConfirmId(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className="qa-confirm-text">
              Are you sure you want to delete this question? This action is permanent and will delete all answers and upvotes.
            </p>
            <div className="qa-confirm-actions">
              <button type="button" className="btn-secondary" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => handleDeleteQuestion(deleteConfirmId)}
                disabled={askSubmitting}
              >
                {askSubmitting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
