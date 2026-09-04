import { useEffect, useState } from 'react';
import { Plus, BookOpen, Trash2, Calendar, Sparkles, Pencil, Users, ChevronDown, ChevronUp, Lock, Unlock, Loader2, RefreshCw, MessageCircle, CornerDownRight, Send, ImagePlus, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { imageGenerationErrorMessage } from '../../lib/imageGenerationErrors';
import ImageLightbox from './ImageLightbox';
import useRealtimeRefresh from './useRealtimeRefresh';

const formatDate = (dateValue) => (
  new Date(dateValue).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
);

const defaultJournal = [
  {
    id: 'j1',
    title: "Meditation on Loving God & Others",
    scripture: "Mark 12:30-31",
    body: "Today I meditated on Jesus' call to love God with all our heart, soul, mind, and strength, and our neighbors as ourselves. It's a reminder that Christianity isn't just about rules; it's a deep relationship with our Creator that overflows into how we treat others in our daily life. I feel challenged to show real grace to my school peers this week.",
    date: "June 6, 2026"
  }
];

export default function StudyJournal({ session, userId, isConfigured, activeOrgId, refreshTrigger }) {
  const [journalTab, setJournalTab] = useState('mine'); // 'mine' | 'shared'
  const [journalEntries, setJournalEntries] = useState([]);
  const [sharedEntries, setSharedEntries] = useState([]);
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [journalTitle, setJournalTitle] = useState('');
  const [journalScripture, setJournalScripture] = useState('');
  const [journalBody, setJournalBody] = useState('');
  const [editingJournalId, setEditingJournalId] = useState(null);
  const [expandedJournal, setExpandedJournal] = useState({});
  const [journalSummary, setJournalSummary] = useState('');
  const [journalImageUrl, setJournalImageUrl] = useState('');
  const [journalImageBlob, setJournalImageBlob] = useState(null);
  const [journalSummaryLoading, setJournalSummaryLoading] = useState(false);
  const [journalArtLoading, setJournalArtLoading] = useState(false);
  const [journalAiError, setJournalAiError] = useState('');
  const [journalVisibility, setJournalVisibility] = useState('private');
  const [activeImageUrl, setActiveImageUrl] = useState(null);

  // Comments
  const [journalComments, setJournalComments] = useState({}); // { [journalId]: [comment, ...] }
  const [expandedComments, setExpandedComments] = useState({});
  const [commentReplyText, setCommentReplyText] = useState({});
  const [commentNewText, setCommentNewText] = useState({});
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyingToComment, setReplyingToComment] = useState(null);

  const journalAiLoading = journalSummaryLoading || journalArtLoading;

  const toggleExpandJournal = (id) => {
    setExpandedJournal((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleExpandComments = (journalId) => {
    setExpandedComments((prev) => ({ ...prev, [journalId]: !prev[journalId] }));
  };

  const loadCommentsFor = async (journalIds) => {
    if (!isConfigured || journalIds.length === 0) return;
    const { data: commentRows, error: commentError } = await supabase
      .from('journal_comments')
      .select('*, profiles:user_id(full_name)')
      .in('journal_id', journalIds)
      .order('created_at', { ascending: true });

    if (commentError) {
      console.error('Error loading journal comments:', commentError);
      return;
    }
    const grouped = {};
    (commentRows || []).forEach((c) => {
      if (!grouped[c.journal_id]) grouped[c.journal_id] = [];
      grouped[c.journal_id].push(c);
    });
    setJournalComments((prev) => {
      const next = { ...prev };
      journalIds.forEach((id) => { next[id] = grouped[id] || []; });
      return next;
    });
  };

  const loadMyJournal = async () => {
    if (!isConfigured) {
      const savedJournal = localStorage.getItem('miqra_journal');
      if (savedJournal) {
        try { setJournalEntries(JSON.parse(savedJournal)); } catch { setJournalEntries(defaultJournal); }
      } else {
        setJournalEntries(defaultJournal);
        localStorage.setItem('miqra_journal', JSON.stringify(defaultJournal));
      }
      return;
    }

    let journalQuery = supabase.from('journal_entries').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (activeOrgId) journalQuery = journalQuery.eq('organization_id', activeOrgId);

    const { data: journalRows, error: journalError } = await journalQuery;
    if (journalError) {
      console.error('Error loading journal from Supabase:', journalError);
      setJournalEntries([]);
      return;
    }

    setJournalEntries((journalRows || []).map((entry) => ({
      id: entry.id,
      title: entry.title,
      scripture: entry.scripture || 'General Reflections',
      body: entry.body,
      summary: entry.summary,
      imagePath: entry.image_path,
      visibility: entry.visibility || 'private',
      date: formatDate(entry.created_at),
    })));

    await loadCommentsFor((journalRows || []).map((e) => e.id));
  };

  const loadSharedJournal = async () => {
    if (!isConfigured) {
      setSharedEntries([]);
      return;
    }

    // RLS filters what the user is allowed to see ('public' entries plus
    // 'groups' entries from people they share a small group with).
    const { data, error } = await supabase
      .from('journal_entries')
      .select('id, user_id, title, scripture, body, summary, image_path, visibility, created_at, profiles(full_name)')
      .neq('visibility', 'private')
      .neq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error('Error loading shared journal entries:', error);
      setSharedEntries([]);
      return;
    }

    setSharedEntries((data || []).map((entry) => ({
      id: entry.id,
      title: entry.title,
      scripture: entry.scripture || 'General Reflections',
      body: entry.body,
      summary: entry.summary,
      imagePath: entry.image_path,
      visibility: entry.visibility || 'private',
      date: formatDate(entry.created_at),
      authorName: entry.profiles?.full_name || 'Anonymous',
    })));

    await loadCommentsFor((data || []).map((e) => e.id));
  };

  useEffect(() => {
    // Hydrates journal state from local/Supabase storage when the session context changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMyJournal();
    loadSharedJournal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, userId, activeOrgId, refreshTrigger]);

  useRealtimeRefresh(
    `fellowship-journal-${activeOrgId || 'local'}`,
    ['journal_comments'],
    () => loadCommentsFor([...journalEntries, ...sharedEntries].map((e) => e.id)),
    isConfigured,
  );

  const saveJournalLocal = (updatedJournal) => {
    setJournalEntries(updatedJournal);
    localStorage.setItem('miqra_journal', JSON.stringify(updatedJournal));
  };

  const resetJournalForm = () => {
    setJournalTitle('');
    setJournalScripture('');
    setJournalBody('');
    setEditingJournalId(null);
    setJournalSummary('');
    setJournalImageUrl('');
    setJournalImageBlob(null);
    setJournalVisibility('private');
    setJournalAiError('');
  };

  // --- COMMENT ACTIONS ---
  const handlePostComment = async (journalId) => {
    const text = (commentNewText[journalId] || '').trim();
    if (!text || !userId) return;
    setCommentSubmitting(true);
    try {
      const { data, error } = await supabase.from('journal_comments').insert({
        journal_id: journalId,
        user_id: userId,
        body: text,
        organization_id: activeOrgId || null,
      }).select('*, profiles:user_id(full_name)');
      if (error) throw error;
      if (data?.[0]) {
        setJournalComments((prev) => ({
          ...prev,
          [journalId]: [...(prev[journalId] || []), data[0]],
        }));
      }
      setCommentNewText((prev) => ({ ...prev, [journalId]: '' }));
    } catch (err) {
      console.error('Error posting comment:', err.message);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleReplyComment = async (journalId, parentId) => {
    const text = (commentReplyText[parentId] || '').trim();
    if (!text || !userId) return;
    setCommentSubmitting(true);
    try {
      const { data, error } = await supabase.from('journal_comments').insert({
        journal_id: journalId,
        user_id: userId,
        parent_id: parentId,
        body: text,
        organization_id: activeOrgId || null,
      }).select('*, profiles:user_id(full_name)');
      if (error) throw error;
      if (data?.[0]) {
        setJournalComments((prev) => ({
          ...prev,
          [journalId]: [...(prev[journalId] || []), data[0]],
        }));
      }
      setCommentReplyText((prev) => ({ ...prev, [parentId]: '' }));
      setReplyingToComment(null);
    } catch (err) {
      console.error('Error posting reply:', err.message);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeleteComment = async (journalId, commentId) => {
    try {
      const { error } = await supabase.from('journal_comments').delete().eq('id', commentId);
      if (error) throw error;
      setJournalComments((prev) => ({
        ...prev,
        [journalId]: (prev[journalId] || []).filter((c) => c.id !== commentId),
      }));
    } catch (err) {
      console.error('Error deleting comment:', err.message);
    }
  };

  // --- AI ACTIONS ---
  const handleGenerateSummary = async () => {
    if (!journalBody.trim()) return;
    setJournalSummaryLoading(true);
    setJournalAiError('');
    try {
      const { data: sumData, error: sumErr } = await supabase.functions.invoke('hf-proxy', {
        body: {
          prompt: `Summarize this journal reflection in a single short sentence (under 12 words) that captures all key thoughts. Do not include any introductory text, prefix, or signature. Just output the summary. Reflection: "${journalBody.trim()}"`,
          max_new_tokens: 60
        }
      });
      if (sumErr || !sumData?.text) throw new Error(sumErr?.message || 'No summary returned');
      setJournalSummary(sumData.text.replace(/^["']|["']$/g, '').trim());
    } catch (err) {
      console.error('Failed to generate journal summary:', err);
      setJournalAiError('Could not generate a summary. Please check your connection and try again.');
    } finally {
      setJournalSummaryLoading(false);
    }
  };

  const handleGenerateArtwork = async () => {
    if (!journalBody.trim()) return;
    setJournalArtLoading(true);
    setJournalAiError('');

    try {
      // 1. Generate visual prompt via hf-proxy
      let artPrompt = `A serene cinematic biblical painting capturing the inner peace and reflection of: ${journalBody.trim().slice(0, 150)}`;
      try {
        const { data: artData, error: artErr } = await supabase.functions.invoke('hf-proxy', {
          body: {
            prompt: `You are an art director creating a single text-to-image prompt that captures the visual themes of this journal reflection: "${journalBody.trim()}". Write ONE concrete, cinematic scene under 50 words, with no readable text, words, or letters. Respond with ONLY the image description.`,
            max_new_tokens: 120
          }
        });
        if (!artErr && artData?.text) {
          artPrompt = artData.text.replace(/^["']|["']$/g, '').trim();
        }
      } catch (err) {
        console.error('Failed to generate journal art prompt:', err);
      }

      // 2. Generate image via image-proxy
      const finalPrompt = `${artPrompt}, oil painting style, fine art, reverent atmosphere, warm soft light, no text, no words, no watermark`;
      const seed = Math.floor(Math.random() * 1000000);
      const { data: imgData, error: imgErr } = await supabase.functions.invoke('image-proxy', {
        body: { prompt: finalPrompt, seed, steps: 8 }
      });

      if (imgErr || !imgData?.image) {
        throw new Error(await imageGenerationErrorMessage({ data: imgData, error: imgErr }));
      }

      // 3. Load the image and convert it to a blob for storage upload
      const response = await fetch(imgData.image);
      const blob = await response.blob();
      setJournalImageBlob(blob);
      setJournalImageUrl(imgData.image);
    } catch (err) {
      console.error('Failed to generate journal artwork:', err);
      setJournalAiError(err.message || 'Could not generate AI artwork. Please try again.');
    } finally {
      setJournalArtLoading(false);
    }
  };

  // --- JOURNAL CRUD ---
  const handleJournalSubmit = async (e) => {
    e.preventDefault();
    if (!journalTitle.trim() || !journalBody.trim()) return;

    let imagePath = null;
    if (editingJournalId) {
      const existing = journalEntries.find(j => j.id === editingJournalId);
      imagePath = existing?.imagePath || null;
    }

    const entryId = editingJournalId || `j_${crypto.randomUUID()}`;

    if (isConfigured && journalImageBlob) {
      const path = `${userId}/journal-${entryId}-${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('prayer-images')
        .upload(path, journalImageBlob, { contentType: 'image/jpeg' });
      if (!uploadErr) {
        imagePath = path;
      } else {
        console.error('Journal image upload error:', uploadErr);
      }
    }

    const entrySummary = journalSummary.trim() || null;

    if (editingJournalId) {
      const updatedEntry = {
        title: journalTitle.trim(),
        scripture: journalScripture.trim() || 'General Reflections',
        body: journalBody.trim(),
        summary: entrySummary,
        image_path: imagePath,
        visibility: journalVisibility,
      };
      const updatedJournal = journalEntries.map((entry) => (
        entry.id === editingJournalId ? {
          ...entry,
          title: updatedEntry.title,
          scripture: updatedEntry.scripture,
          body: updatedEntry.body,
          summary: updatedEntry.summary,
          imagePath: updatedEntry.image_path,
          visibility: updatedEntry.visibility,
        } : entry
      ));

      if (isConfigured) {
        const { error } = await supabase
          .from('journal_entries')
          .update(updatedEntry)
          .eq('id', editingJournalId)
          .eq('user_id', userId);

        if (error) {
          console.error('Journal update error:', error);
          return;
        }

        setJournalEntries(updatedJournal);
      } else {
        saveJournalLocal(updatedJournal);
      }

      resetJournalForm();
      setShowJournalForm(false);
      return;
    }

    const newEntry = {
      id: entryId,
      title: journalTitle.trim(),
      scripture: journalScripture.trim() || 'General Reflections',
      body: journalBody.trim(),
      summary: entrySummary,
      imagePath,
      visibility: journalVisibility,
      date: formatDate(new Date())
    };

    if (isConfigured) {
      const { error } = await supabase.from('journal_entries').insert({
        id: newEntry.id,
        user_id: userId,
        title: newEntry.title,
        scripture: newEntry.scripture,
        body: newEntry.body,
        summary: newEntry.summary,
        image_path: newEntry.imagePath,
        visibility: newEntry.visibility,
      });

      if (!error) setJournalEntries([newEntry, ...journalEntries]);
    } else {
      saveJournalLocal([newEntry, ...journalEntries]);
    }

    resetJournalForm();
    setShowJournalForm(false);
  };

  const startEditingJournalEntry = (entry) => {
    setEditingJournalId(entry.id);
    setJournalTitle(entry.title);
    setJournalScripture(entry.scripture === 'General Reflections' ? '' : entry.scripture);
    setJournalBody(entry.body);
    setJournalSummary(entry.summary || '');
    setJournalVisibility(entry.visibility || 'private');
    if (entry.imagePath) {
      const { data } = supabase.storage.from('prayer-images').getPublicUrl(entry.imagePath);
      setJournalImageUrl(data?.publicUrl || '');
    } else {
      setJournalImageUrl('');
    }
    setJournalImageBlob(null);
    setJournalTab('mine');
    setShowJournalForm(true);
  };

  const cancelJournalForm = () => {
    resetJournalForm();
    setShowJournalForm(false);
  };

  const toggleJournalForm = () => {
    if (showJournalForm) {
      cancelJournalForm();
      return;
    }
    resetJournalForm();
    setJournalTab('mine');
    setShowJournalForm(true);
  };

  const deleteJournalEntry = async (id) => {
    if (window.confirm("Are you sure you want to delete this journal entry?")) {
      const updated = journalEntries.filter(j => j.id !== id);
      setJournalEntries(updated);

      if (isConfigured) {
        await supabase.from('journal_entries').delete().eq('id', id).eq('user_id', userId);
      } else {
        localStorage.setItem('miqra_journal', JSON.stringify(updated));
      }
    }
  };

  const renderCommentsSection = (entry) => {
    const comments = journalComments[entry.id] || [];
    const topLevel = comments.filter((c) => !c.parent_id);
    const replies = comments.filter((c) => c.parent_id);
    const commentCount = comments.length;
    return (
      <div className="journal-comments-section">
        <button
          type="button"
          className="journal-comments-toggle"
          onClick={() => toggleExpandComments(entry.id)}
        >
          <MessageCircle size={13} />
          <span>Comments{commentCount > 0 ? ` (${commentCount})` : ''}</span>
          {expandedComments[entry.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {expandedComments[entry.id] && (
          <div className="journal-comments-list">
            {topLevel.length === 0 && (
              <p className="journal-comments-empty">No comments yet. Share this entry to get feedback!</p>
            )}

            {topLevel.map((comment) => {
              const commenterName = comment.profiles?.full_name || 'Anonymous';
              const isOwn = comment.user_id === session?.user?.id;
              const commentReplies = replies.filter((r) => r.parent_id === comment.id);

              return (
                <div key={comment.id} className="journal-comment-item">
                  <div className="journal-comment-header">
                    <span className="journal-comment-author">{commenterName}</span>
                    <span className="journal-comment-date">
                      {new Date(comment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p className="journal-comment-body">{comment.body}</p>
                  <div className="journal-comment-actions">
                    <button
                      type="button"
                      className="journal-comment-reply-btn"
                      onClick={() => setReplyingToComment(replyingToComment === comment.id ? null : comment.id)}
                    >
                      <CornerDownRight size={11} /> Reply
                    </button>
                    {isOwn && (
                      <button
                        type="button"
                        className="journal-comment-delete-btn"
                        onClick={() => handleDeleteComment(entry.id, comment.id)}
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    )}
                  </div>

                  {/* Reply Input */}
                  {replyingToComment === comment.id && (
                    <div className="journal-comment-reply-form">
                      <input
                        type="text"
                        className="journal-comment-reply-input"
                        placeholder={`Reply to ${commenterName}…`}
                        value={commentReplyText[comment.id] || ''}
                        onChange={(e) => setCommentReplyText((prev) => ({ ...prev, [comment.id]: e.target.value }))}
                        disabled={commentSubmitting}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleReplyComment(entry.id, comment.id);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                        onClick={() => handleReplyComment(entry.id, comment.id)}
                        disabled={commentSubmitting || !(commentReplyText[comment.id] || '').trim()}
                      >
                        {commentSubmitting ? <Loader2 size={10} className="spin" /> : <Send size={10} />}
                        Send
                      </button>
                    </div>
                  )}

                  {/* Nested Replies */}
                  {commentReplies.map((reply) => {
                    const replyName = reply.profiles?.full_name || 'Anonymous';
                    const isOwnReply = reply.user_id === session?.user?.id;
                    return (
                      <div key={reply.id} className="journal-comment-reply">
                        <CornerDownRight size={11} className="reply-indent-icon" />
                        <div className="journal-comment-reply-content">
                          <div className="journal-comment-header">
                            <span className="journal-comment-author">{replyName}</span>
                            <span className="journal-comment-date">
                              {new Date(reply.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                          <p className="journal-comment-body">{reply.body}</p>
                          {isOwnReply && (
                            <button
                              type="button"
                              className="journal-comment-delete-btn"
                              onClick={() => handleDeleteComment(entry.id, reply.id)}
                            >
                              <Trash2 size={11} /> Delete
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* New Comment Form */}
            <div className="journal-comment-new-form">
              <input
                type="text"
                className="journal-comment-new-input"
                placeholder="Write a comment…"
                value={commentNewText[entry.id] || ''}
                onChange={(e) => setCommentNewText((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                disabled={commentSubmitting}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handlePostComment(entry.id);
                  }
                }}
              />
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.55rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                onClick={() => handlePostComment(entry.id)}
                disabled={commentSubmitting || !(commentNewText[entry.id] || '').trim()}
              >
                {commentSubmitting ? <Loader2 size={11} className="spin" /> : <Send size={11} />}
                Post
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderEntryBody = (entry) => {
    const previewLimit = entry.imagePath || entry.summary ? 150 : 200;
    return (
      <>
        {expandedJournal[entry.id] ? (
          <p className="journal-body" style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{entry.body}</p>
        ) : (
          <p className="journal-body-preview" style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {entry.body.length > previewLimit ? `${entry.body.substring(0, previewLimit)}...` : entry.body}
          </p>
        )}

        {entry.body.length > previewLimit && (
          <button
            onClick={() => toggleExpandJournal(entry.id)}
            className="btn-link journal-expand-btn"
          >
            {expandedJournal[entry.id] ? (
              <>
                <ChevronUp size={12} />
                <span>Show less</span>
              </>
            ) : (
              <>
                <ChevronDown size={12} />
                <span>Read full reflection</span>
              </>
            )}
          </button>
        )}
      </>
    );
  };

  const renderEntry = (entry, { readOnly }) => (
    <div id={`journal-entry-${entry.id}`} key={entry.id} className="journal-card">
      <div className="journal-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 className="journal-title" style={{ margin: 0 }}>{entry.title}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
            {readOnly && entry.authorName && (
              <span className="journal-author-name">{entry.authorName}</span>
            )}
            <span className="journal-date" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <Calendar size={12} />
              {entry.date}
            </span>
            <span className="journal-visibility" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {entry.visibility === 'public' && <Unlock size={12} style={{ color: 'var(--success-green)' }} />}
              {entry.visibility === 'groups' && <Users size={12} style={{ color: 'var(--info-blue)' }} />}
              {(entry.visibility === 'private' || !entry.visibility) && <Lock size={12} style={{ color: 'var(--accent-gold)' }} />}
              <span style={{ textTransform: 'capitalize' }}>
                {entry.visibility === 'groups' ? 'Groups Only' : entry.visibility || 'Private'}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="journal-scripture-focus" style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <BookOpen size={12} />
        <span>{entry.scripture}</span>
      </div>

      {/* Split/Regular Layout for Image & Summary */}
      {entry.imagePath || entry.summary ? (
        <div className="journal-split-content" style={{ display: 'flex', gap: '1rem', marginTop: '1rem', alignItems: 'flex-start' }}>
          {entry.imagePath && (() => {
            const { data: imgData } = supabase.storage.from('prayer-images').getPublicUrl(entry.imagePath);
            return (
              <div
                className="journal-card-image-container"
                onClick={() => setActiveImageUrl(imgData?.publicUrl)}
              >
                <img
                  src={imgData?.publicUrl}
                  alt="AI reflection artwork"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            );
          })()}
          <div className="journal-card-text" style={{ flexGrow: 1 }}>
            {entry.summary && (
              <div style={{ fontStyle: 'italic', color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: '500' }}>
                "{entry.summary}"
              </div>
            )}
            {renderEntryBody(entry)}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: '1rem' }}>
          {renderEntryBody(entry)}
        </div>
      )}

      {!readOnly && (
        <div className="journal-actions" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => startEditingJournalEntry(entry)}
            className="btn-secondary"
            style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Pencil size={12} />
            <span>Edit</span>
          </button>
          <button
            onClick={() => deleteJournalEntry(entry.id)}
            className="btn-danger"
            style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Trash2 size={12} />
            <span>Delete</span>
          </button>
        </div>
      )}

      {isConfigured && renderCommentsSection(entry)}
    </div>
  );

  const listedEntries = journalTab === 'mine' ? journalEntries : sharedEntries;

  return (
    <section id="study-journal" className="card">
      <div className="journal-header">
        <h2>Study Journal</h2>
        <button
          onClick={toggleJournalForm}
          className="btn-primary"
          style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <Plus size={16} />
          <span>{showJournalForm ? 'Close Form' : 'New Entry'}</span>
        </button>
      </div>

      {isConfigured && (
        <div className="groups-filter-pills" style={{ marginBottom: '1rem' }}>
          <button
            className={`group-filter-pill ${journalTab === 'mine' ? 'active' : ''}`}
            onClick={() => setJournalTab('mine')}
          >
            My Journal
          </button>
          <button
            className={`group-filter-pill ${journalTab === 'shared' ? 'active' : ''}`}
            onClick={() => setJournalTab('shared')}
          >
            Shared with Me{sharedEntries.length > 0 ? ` (${sharedEntries.length})` : ''}
          </button>
        </div>
      )}

      {/* New Journal Form */}
      {showJournalForm && journalTab === 'mine' && (
        <form onSubmit={handleJournalSubmit} className="journal-form animate-fade-in">
          <div className="form-group">
            <label htmlFor="journal-title">Entry Title</label>
            <input
              id="journal-title"
              type="text"
              placeholder="e.g. Insights from Sunday small group"
              value={journalTitle}
              onChange={(e) => setJournalTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="journal-scripture">Scripture Focus</label>
            <input
              id="journal-scripture"
              type="text"
              placeholder="e.g. Numbers 8:4"
              value={journalScripture}
              onChange={(e) => setJournalScripture(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="journal-reflections">Reflections</label>
            <textarea
              id="journal-reflections"
              rows={4}
              placeholder="Write down what you learned, notes, or prayer thoughts..."
              value={journalBody}
              onChange={(e) => setJournalBody(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="journal-visibility">Visibility</label>
            <select
              id="journal-visibility"
              value={journalVisibility}
              onChange={(e) => setJournalVisibility(e.target.value)}
              className="journal-visibility-select"
            >
              <option value="private">Private</option>
              <option value="groups">Share with groups only</option>
              <option value="public">Public</option>
            </select>
          </div>

          {isConfigured && journalBody.trim() && (
            <div className="form-group journal-ai-actions">
              <button
                type="button"
                onClick={handleGenerateSummary}
                disabled={journalAiLoading}
                className="btn-secondary journal-ai-btn"
              >
                {journalSummaryLoading ? (
                  <>
                    <Loader2 className="spin" size={14} />
                    <span>Summarizing…</span>
                  </>
                ) : (
                  <>
                    <FileText size={14} style={{ color: 'var(--accent-gold)' }} />
                    <span>AI Summary</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleGenerateArtwork}
                disabled={journalAiLoading}
                className="btn-secondary journal-ai-btn"
              >
                {journalArtLoading ? (
                  <>
                    <Loader2 className="spin" size={14} />
                    <span>Painting…</span>
                  </>
                ) : (
                  <>
                    <ImagePlus size={14} style={{ color: 'var(--accent-gold)' }} />
                    <span>AI Artwork</span>
                  </>
                )}
              </button>
            </div>
          )}

          {journalAiError && (
            <p className="section-error" style={{ marginTop: '0.5rem' }}>{journalAiError}</p>
          )}

          {/* Preview Generated AI Content */}
          {(journalSummary || journalImageUrl) && (
            <div className="form-group ai-preview-box">
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Draft Preview</span>
              {journalImageUrl && (
                <div style={{ marginTop: '0.5rem', position: 'relative', width: '100%', height: '140px', borderRadius: '6px', overflow: 'hidden' }}>
                  <img src={journalImageUrl} alt="Generated reflection art" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    type="button"
                    onClick={handleGenerateArtwork}
                    disabled={journalAiLoading}
                    className="btn-secondary journal-regenerate-btn"
                  >
                    {journalArtLoading ? <Loader2 className="spin" size={12} /> : <RefreshCw size={12} />}
                    <span>Regenerate Image</span>
                  </button>
                </div>
              )}
              {journalSummary && (
                <div style={{ marginTop: '0.75rem' }}>
                  <label htmlFor="journal-summary-edit" style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>AI Summary</label>
                  <input
                    id="journal-summary-edit"
                    type="text"
                    value={journalSummary}
                    onChange={(e) => setJournalSummary(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.4rem',
                      fontSize: '0.85rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              onClick={cancelJournalForm}
              className="btn-secondary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Sparkles size={14} />
              <span>{editingJournalId ? 'Save Changes' : 'Save Entry'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Journal Entries List */}
      <div className="journal-list">
        {listedEntries.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
            {journalTab === 'shared'
              ? 'Nothing shared with you yet. Entries your group members share will appear here.'
              : 'Your study journal is empty. Click "New Entry" above to start documenting your studies!'}
          </p>
        ) : (
          listedEntries.map((entry) => renderEntry(entry, { readOnly: journalTab === 'shared' }))
        )}
      </div>

      <ImageLightbox url={activeImageUrl} alt="Journal artwork" onClose={() => setActiveImageUrl(null)} />
    </section>
  );
}
