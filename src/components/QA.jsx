import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  CheckCircle2,
  BadgeCheck,
  Search,
  Bell,
  BellOff,
  BookOpen,
  Check,
  UserRound,
} from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { imageGenerationErrorMessage } from '../lib/imageGenerationErrors';
import Avatar from './ui/Avatar';
import { isAdminRole, isLeaderRole } from '../lib/roles';
import WikiEntitySuggest from './wiki/WikiEntitySuggest';
import WikiSaveObservationModal from './wiki/WikiSaveObservationModal';
import QASessionBar from './qa/QASessionBar';

const QA_PAGE_SIZE = 50;

const QA_TAGS = [
  { value: 'bible', label: 'Bible' },
  { value: 'faith-basics', label: 'Faith Basics' },
  { value: 'relationships', label: 'Relationships' },
  { value: 'church-life', label: 'Church Life' },
  { value: 'hard-questions', label: 'Hard Questions' },
  { value: 'other', label: 'Other' },
];

const QA_SORT_OPTIONS = [
  { value: 'top', label: 'Top' },
  { value: 'new', label: 'New' },
  { value: 'unanswered', label: 'Unanswered' },
  { value: 'open', label: 'Open' },
  { value: 'mine', label: 'Mine' },
];

const tagLabel = (value) => QA_TAGS.find((tag) => tag.value === value)?.label || 'Other';

const formatDateTime = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
};

const isMaskedAuthor = (row) => row.is_anonymous && !row.author_id && !row.author_name;

// Guests have no profile, so their display name lives in guest_name. qa_board
// already coalesces the two; raw realtime rows have to be read the same way or
// a guest who typed their name shows up as "Member".
const authorLabel = (row) => (
  isMaskedAuthor(row) ? 'Anonymous' : (row.author_name || row.guest_name || 'Member')
);

const maskRealtimeQaRow = (row, userId) => {
  // A null author_id (every guest row) must never match a null userId.
  const isMine = Boolean(userId) && row.author_id === userId;
  if (!row.is_anonymous || isMine) return { ...row, is_mine: isMine };
  return {
    ...row,
    author_id: null,
    author_name: null,
    guest_name: null,
    author_role: null,
    is_mine: false,
  };
};

const mergeById = (current, incoming) => {
  const map = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
};

const mergeVotes = (current, incoming, key) => {
  const map = new Map(current.map((item) => [`${item[key]}:${item.user_id}`, item]));
  incoming.forEach((item) => map.set(`${item[key]}:${item.user_id}`, item));
  return Array.from(map.values());
};

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
    throw new Error(await imageGenerationErrorMessage({ data: imgData, error: imgErr }));
  }

  const response = await fetch(imgData.image);
  const blob = await response.blob();
  return { url: imgData.image, blob };
};

export default function QA({ session, userRole, activeOrgId, displayName: profileDisplayName }) {
  const user = session?.user;
  const userId = user?.id;
  const displayName = profileDisplayName || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Member';
  const canModerate = isLeaderRole(userRole);

  const [avatarByUser, setAvatarByUser] = useState({});
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [qVotes, setQVotes] = useState([]);
  const [aVotes, setAVotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const deepLinkedQuestionRef = useRef(null);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreQuestions, setHasMoreQuestions] = useState(false);
  const [nextQuestionOffset, setNextQuestionOffset] = useState(0);
  const [error, setError] = useState('');
  const [activeTag, setActiveTag] = useState('all');
  const [sortMode, setSortMode] = useState('top');
  const [searchQuery, setSearchQuery] = useState('');

  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [moderatingId, setModeratingId] = useState(null);

  const [askOpen, setAskOpen] = useState(false);
  const [askForm, setAskForm] = useState({ title: '', body: '', anonymous: false, imagePath: null, tag: 'bible' });
  const [askSubmitting, setAskSubmitting] = useState(false);
  const [editQuestionId, setEditQuestionId] = useState(null);
  const [similarQuestions, setSimilarQuestions] = useState([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState('');
  const [qaImageUrl, setQaImageUrl] = useState('');
  const [qaImageBlob, setQaImageBlob] = useState(null);

  const closeAskModal = useCallback(() => {
    setAskOpen(false);
    setQaImageUrl('');
    setQaImageBlob(null);
    setEditQuestionId(null);
    setSimilarQuestions([]);
    setSimilarError('');
    setAskForm({ title: '', body: '', anonymous: false, imagePath: null, tag: 'bible' });
  }, []);

  const [answerBody, setAnswerBody] = useState('');
  const [answerAnon, setAnswerAnon] = useState(false);
  const [answerSubmitting, setAnswerSubmitting] = useState(false);

  const [editAnswerId, setEditAnswerId] = useState(null);
  const [editAnswerBody, setEditAnswerBody] = useState('');
  const [editAnswerSubmitting, setEditAnswerSubmitting] = useState(false);
  const [deleteAnswerConfirmId, setDeleteAnswerConfirmId] = useState(null);
  const [acceptingAnswerId, setAcceptingAnswerId] = useState(null);
  const [saveObsAnswer, setSaveObsAnswer] = useState(null); // answer being saved to the wiki

  const [qaAiLoading, setQaAiLoading] = useState(false);
  const [detailAiLoading, setDetailAiLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [relatedQuestions, setRelatedQuestions] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [followedQuestionIds, setFollowedQuestionIds] = useState(() => new Set());
  const [passageSuggestions, setPassageSuggestions] = useState(null);
  const [passageLoading, setPassageLoading] = useState(false);
  const [passageError, setPassageError] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);

  const loadFollowedQuestionIds = useCallback(async (questionIds, { append = false } = {}) => {
    if (!hasSupabaseConfig || !userId || questionIds.length === 0) {
      if (!append) setFollowedQuestionIds(new Set());
      return;
    }

    const { data, error: followError } = await supabase
      .from('qa_question_followers')
      .select('question_id')
      .in('question_id', questionIds);

    if (followError) return;

    const nextIds = (data || []).map((row) => row.question_id);
    setFollowedQuestionIds((cur) => {
      const next = append ? new Set(cur) : new Set();
      nextIds.forEach((id) => next.add(id));
      return next;
    });
  }, [userId]);

  const loadBoardPage = useCallback(async ({ offset = 0, append = false } = {}) => {
    if (!hasSupabaseConfig || !userId || !activeOrgId) {
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');

    const { data, error: boardError } = await supabase.rpc('qa_board', {
      org_id: activeOrgId,
      page_limit: QA_PAGE_SIZE,
      page_offset: offset,
    });

    if (boardError) {
      setError(boardError.message || 'Could not load the Q&R board.');
      if (!append) {
        setQuestions([]);
        setAnswers([]);
        setQVotes([]);
        setAVotes([]);
        setHasMoreQuestions(false);
        setNextQuestionOffset(0);
      }
    } else {
      const nextQuestions = data?.questions || [];
      const nextAnswers = data?.answers || [];
      const nextQVotes = data?.question_votes || [];
      const nextAVotes = data?.answer_votes || [];

      setQuestions((cur) => (append ? mergeById(cur, nextQuestions) : nextQuestions));
      setAnswers((cur) => (append ? mergeById(cur, nextAnswers) : nextAnswers));
      setQVotes((cur) => (append ? mergeVotes(cur, nextQVotes, 'question_id') : nextQVotes));
      setAVotes((cur) => (append ? mergeVotes(cur, nextAVotes, 'answer_id') : nextAVotes));
      setHasMoreQuestions(Boolean(data?.has_more));
      setNextQuestionOffset(offset + nextQuestions.length);
      await loadFollowedQuestionIds(nextQuestions.map((q) => q.id), { append });
    }
    setLoading(false);
    setLoadingMore(false);
  }, [activeOrgId, loadFollowedQuestionIds, userId]);

  const loadAll = useCallback(() => loadBoardPage(), [loadBoardPage]);

  const loadSessions = useCallback(async () => {
    if (!hasSupabaseConfig || !userId || !activeOrgId) {
      setSessions([]);
      return;
    }
    setSessionsLoading(true);
    const { data, error: sessionsError } = await supabase.rpc('qa_sessions_list', {
      org_id: activeOrgId,
    });
    setSessionsLoading(false);
    if (sessionsError) {
      // A failed session list must not block the board itself, which works
      // exactly as it did before sessions existed.
      setSessions([]);
      return;
    }
    setSessions(data || []);
  }, [activeOrgId, userId]);

  useEffect(() => {
    Promise.resolve().then(() => {
      loadSessions();
    });
  }, [loadSessions]);

  const loadMoreQuestions = useCallback(() => {
    loadBoardPage({ offset: nextQuestionOffset, append: true });
  }, [loadBoardPage, nextQuestionOffset]);

  const mergeBoardPayload = useCallback((data) => {
    const nextQuestions = data?.questions || [];
    const nextAnswers = data?.answers || [];
    const nextQVotes = data?.question_votes || [];
    const nextAVotes = data?.answer_votes || [];

    setQuestions((cur) => mergeById(cur, nextQuestions));
    setAnswers((cur) => mergeById(cur, nextAnswers));
    setQVotes((cur) => mergeVotes(cur, nextQVotes, 'question_id'));
    setAVotes((cur) => mergeVotes(cur, nextAVotes, 'answer_id'));
  }, []);

  const openQuestionById = useCallback(async (questionId) => {
    if (!questionId) return;
    if (questions.some((q) => q.id === questionId)) {
      setSelectedId(questionId);
      closeAskModal();
      return;
    }

    const { data, error: threadError } = await supabase.rpc('qa_thread', {
      target_question_id: questionId,
    });

    if (threadError) {
      setError(threadError.message || 'Could not open that question.');
      return;
    }

    mergeBoardPayload(data);
    await loadFollowedQuestionIds([questionId], { append: true });
    setSelectedId(questionId);
    closeAskModal();
  }, [closeAskModal, loadFollowedQuestionIds, mergeBoardPayload, questions]);

  useEffect(() => {
    if (!hasSupabaseConfig || loading) return;
    const params = new URLSearchParams(window.location.search);
    const questionId = params.get('question');
    if (!questionId || deepLinkedQuestionRef.current === questionId) return;
    deepLinkedQuestionRef.current = questionId;
    (async () => {
      await openQuestionById(questionId);
      params.delete('question');
      window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`);
    })();
  }, [loading, openQuestionById]);

  const followQuestion = useCallback(async (questionId) => {
    if (!questionId || !userId) return;
    const { error: followError } = await supabase
      .from('qa_question_followers')
      .upsert({ question_id: questionId, user_id: userId }, { onConflict: 'question_id,user_id' });

    if (!followError) {
      setFollowedQuestionIds((cur) => {
        const next = new Set(cur);
        next.add(questionId);
        return next;
      });
    }
  }, [userId]);

  const toggleFollowQuestion = useCallback(async (questionId) => {
    if (!questionId || !userId) return;
    const isFollowing = followedQuestionIds.has(questionId);
    setFollowedQuestionIds((cur) => {
      const next = new Set(cur);
      if (isFollowing) next.delete(questionId);
      else next.add(questionId);
      return next;
    });

    const res = isFollowing
      ? await supabase.from('qa_question_followers').delete().eq('question_id', questionId).eq('user_id', userId)
      : await supabase.from('qa_question_followers').upsert({ question_id: questionId, user_id: userId }, { onConflict: 'question_id,user_id' });

    if (res.error) {
      setError(res.error.message || 'Could not update follow status.');
      loadFollowedQuestionIds([questionId], { append: true });
    }
  }, [followedQuestionIds, loadFollowedQuestionIds, userId]);

  const saveQuestionEmbedding = useCallback(async (questionId, title, body) => {
    if (!questionId || !title?.trim()) return;
    try {
      const { data, error: embedError } = await supabase.functions.invoke('hf-proxy', {
        body: {
          prompt: `${title} ${body || ''}`.trim(),
          provider: 'huggingface',
          task: 'embed',
        },
      });

      if (embedError || !data?.embedding) return;

      await supabase
        .from('qa_questions')
        .update({ embedding: data.embedding })
        .eq('id', questionId);
    } catch (err) {
      console.error('Failed to save Q&R embedding:', err);
    }
  }, []);

  const findSimilarQuestions = useCallback(async (text, { excludeId = null, count = 5 } = {}) => {
    if (!activeOrgId || !text.trim()) return [];
    const { data: embedData, error: embedError } = await supabase.functions.invoke('hf-proxy', {
      body: {
        prompt: text.trim(),
        provider: 'huggingface',
        task: 'embed',
      },
    });

    if (embedError) throw new Error(embedError.message || 'Could not compare similar questions.');
    if (!embedData?.embedding) throw new Error('No embedding returned for similar question search.');

    const { data, error: matchError } = await supabase.rpc('match_qa_questions', {
      target_org_id: activeOrgId,
      query_embedding: embedData.embedding,
      match_count: count,
      exclude_question_id: excludeId,
    });

    if (matchError) throw new Error(matchError.message || 'Could not load similar questions.');
    return data || [];
  }, [activeOrgId]);

  useEffect(() => {
    Promise.resolve().then(() => {
      loadAll();
    });
  }, [loadAll]);

  // Load org members once per org for author avatars (non-anonymous posts).
  useEffect(() => {
    let active = true;
    if (!hasSupabaseConfig || !activeOrgId) {
      Promise.resolve().then(() => {
        if (active) setAvatarByUser({});
      });
      return () => { active = false; };
    }
    Promise.resolve().then(() => supabase.rpc('org_members', { org_id: activeOrgId })).then(({ data }) => {
      if (!active) return;
      const map = {};
      for (const p of data || []) if (p.avatar_url) map[p.id] = p.avatar_url;
      setAvatarByUser(map);
    });
    return () => { active = false; };
  }, [activeOrgId]);

  useEffect(() => {
    if (!hasSupabaseConfig || !activeOrgId || !userId) return undefined;

    const channel = supabase
      .channel(`qa-board-${activeOrgId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'qa_questions', filter: `organization_id=eq.${activeOrgId}` },
        (payload) => {
          // Realtime payloads are raw table rows: they skip qa_board, so both
          // its anonymity masking and its status filter have to be reapplied
          // here. Without the status check a guest question still awaiting a
          // leader's review would appear live on every member's board.
          if (payload.new?.status && payload.new.status !== 'published' && !canModerate) return;
          const row = maskRealtimeQaRow(payload.new, userId);
          setQuestions((cur) => (cur.some((q) => q.id === row.id) ? cur : [row, ...cur]));
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'qa_answers', filter: `organization_id=eq.${activeOrgId}` },
        (payload) => {
          const row = maskRealtimeQaRow(payload.new, userId);
          setAnswers((cur) => (cur.some((a) => a.id === row.id) ? cur : [...cur, row]));
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeOrgId, canModerate, userId]);

  // Author chip: anonymous keeps the privacy icon; otherwise show their avatar.
  const renderAuthor = (row) => (
    <span className="qa-author">
      {isMaskedAuthor(row)
        ? <EyeOff size={12} />
        : <Avatar src={avatarByUser[row.author_id]} name={authorLabel(row)} size={18} />}
      {authorLabel(row)}
    </span>
  );

  // Guests vote without an account, so their votes live in a separate table and
  // arrive pre-counted. Both sources have to be summed or the room's ranking
  // would only reflect the handful of students who have logins.
  const qVoteCount = useMemo(() => {
    const map = {};
    qVotes.forEach((v) => { map[v.question_id] = (map[v.question_id] || 0) + 1; });
    questions.forEach((q) => {
      if (q.guest_vote_count) map[q.id] = (map[q.id] || 0) + q.guest_vote_count;
    });
    return map;
  }, [qVotes, questions]);

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

  // A selection left over from another org — or from a session an admin just
  // deleted — would silently filter the board down to nothing, so only ids
  // still present in the loaded list count as selected.
  const effectiveSessionId = useMemo(
    () => (sessions.some((s) => s.id === activeSessionId) ? activeSessionId : null),
    [activeSessionId, sessions],
  );

  // Pending is leader-only, so a developer impersonating a student falls back
  // instead of sitting on a filter their role can no longer reach.
  const effectiveSortMode = (!canModerate && sortMode === 'pending') ? 'top' : sortMode;

  const sortOptions = useMemo(() => {
    if (!canModerate) return QA_SORT_OPTIONS;
    const pendingCount = questions.filter(
      (q) => q.status === 'pending' && (!effectiveSessionId || q.session_id === effectiveSessionId),
    ).length;
    return [
      ...QA_SORT_OPTIONS,
      { value: 'pending', label: pendingCount ? `Pending (${pendingCount})` : 'Pending' },
    ];
  }, [canModerate, effectiveSessionId, questions]);

  const sortedQuestions = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    const filtered = questions.filter((q) => {
      if (effectiveSessionId && q.session_id !== effectiveSessionId) return false;
      // Questions awaiting review are only ever reachable through the Pending
      // tab, so they can't be mistaken for part of the live board.
      if (effectiveSortMode === 'pending') {
        if (q.status !== 'pending') return false;
      } else if (q.status && q.status !== 'published') {
        return false;
      }
      if (activeTag !== 'all' && q.tag !== activeTag) return false;
      if (effectiveSortMode === 'unanswered' && (answersByQuestion[q.id] || []).length > 0) return false;
      if (effectiveSortMode === 'open' && q.resolved_at) return false;
      if (effectiveSortMode === 'mine' && !q.is_mine && !(answersByQuestion[q.id] || []).some((a) => a.is_mine)) return false;
      if (!term) return true;
      return `${q.title || ''} ${q.body || ''}`.toLowerCase().includes(term);
    });

    return filtered.sort((a, b) => {
      if (effectiveSortMode === 'new' || effectiveSortMode === 'pending') {
        return new Date(b.created_at) - new Date(a.created_at);
      }

      return (
        (qVoteCount[b.id] || 0) - (qVoteCount[a.id] || 0)
        || Number(Boolean(a.resolved_at)) - Number(Boolean(b.resolved_at))
        || new Date(b.created_at) - new Date(a.created_at)
      );
    });
  }, [activeTag, answersByQuestion, effectiveSessionId, effectiveSortMode, questions, qVoteCount, searchQuery]);

  const moderateQuestion = useCallback(async (questionId, patch) => {
    setModeratingId(questionId);
    setError('');
    const { data, error: moderateError } = await supabase.rpc('qa_moderate_question', {
      target_question_id: questionId,
      next_status: patch.status ?? null,
      next_bucket: patch.bucket ?? null,
      clear_bucket: Boolean(patch.clearBucket),
    });
    setModeratingId(null);

    if (moderateError) {
      setError(moderateError.message || 'Could not update that question.');
      return;
    }

    setQuestions((cur) => cur.map((q) => (
      q.id === questionId ? { ...q, status: data.status, bucket: data.bucket } : q
    )));
    loadSessions();
  }, [loadSessions]);

  const selectedQuestion = questions.find((q) => q.id === selectedId) || null;
  const selectedAnswers = useMemo(() => {
    const list = answersByQuestion[selectedId] || [];
    return [...list].sort((a, b) => (
      Number(Boolean(b.is_accepted)) - Number(Boolean(a.is_accepted))
      || (
        a.is_accepted || b.is_accepted
          ? new Date(a.created_at) - new Date(b.created_at)
          : 0
      )
      || (aVoteCount[b.id] || 0) - (aVoteCount[a.id] || 0)
      || new Date(a.created_at) - new Date(b.created_at)
    ));
  }, [answersByQuestion, selectedId, aVoteCount]);

  useEffect(() => {
    let active = true;
    const title = askForm.title.trim();

    if (!askOpen || editQuestionId || title.length <= 15) {
      Promise.resolve().then(() => {
        if (!active) return;
        setSimilarQuestions([]);
        setSimilarError('');
        setSimilarLoading(false);
      });
      return () => { active = false; };
    }

    const timer = window.setTimeout(() => {
      setSimilarLoading(true);
      setSimilarError('');
      findSimilarQuestions(`${title} ${askForm.body || ''}`, { count: 3 })
        .then((matches) => {
          if (!active) return;
          setSimilarQuestions(matches);
        })
        .catch((err) => {
          if (!active) return;
          setSimilarQuestions([]);
          setSimilarError(err.message || 'Could not compare similar questions.');
        })
        .finally(() => {
          if (active) setSimilarLoading(false);
        });
    }, 600);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [askForm.body, askForm.title, askOpen, editQuestionId, findSimilarQuestions]);

  useEffect(() => {
    let active = true;
    if (!selectedQuestion?.id) {
      Promise.resolve().then(() => {
        if (!active) return;
        setRelatedQuestions([]);
        setRelatedLoading(false);
      });
      return () => { active = false; };
    }

    Promise.resolve()
      .then(() => {
        setRelatedLoading(true);
        return supabase.rpc('qa_related_questions', {
          target_question_id: selectedQuestion.id,
          match_count: 4,
        });
      })
      .then(({ data, error: relatedError }) => {
        if (!active) return;
        if (relatedError) {
          setRelatedQuestions([]);
          return;
        }
        setRelatedQuestions(data || []);
      })
      .finally(() => {
        if (active) setRelatedLoading(false);
      });

    return () => { active = false; };
  }, [selectedQuestion?.id]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setPassageSuggestions(null);
      setPassageError('');
      setPassageLoading(false);
      setDraftLoading(false);
    });
    return () => { active = false; };
  }, [selectedQuestion?.id]);

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
      alert(err.message || 'Could not generate AI artwork. Please try again.');
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
      alert(err.message || 'Could not update AI artwork. Please try again.');
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
      tag: question.tag || 'other',
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
          tag: askForm.tag,
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

      const nextQuestion = { ...data, is_mine: data.author_id === userId };
      setQuestions((cur) => cur.map((q) => (q.id === editQuestionId ? nextQuestion : q)));
      saveQuestionEmbedding(editQuestionId, title, askForm.body);
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
        // Asking while a session is selected files the question under it; from
        // "All questions" it stays a plain board post, as before.
        session_id: effectiveSessionId,
        author_id: userId,
        author_name: displayName,
        is_anonymous: askForm.anonymous,
        title,
        body: askForm.body.trim() || null,
        tag: askForm.tag,
        image_path: imagePath,
      })
      .select('*')
      .single();

    if (insertError) {
      setError(insertError.message || 'Could not post your question.');
      setAskSubmitting(false);
      return;
    }
    const nextQuestion = {
      ...data,
      is_mine: true,
      session_title: sessions.find((s) => s.id === data.session_id)?.title || null,
    };
    setQuestions((cur) => [nextQuestion, ...cur]);
    setAskForm({ title: '', body: '', anonymous: false, imagePath: null, tag: 'bible' });
    closeAskModal();
    setAskSubmitting(false);
    setSelectedId(nextQuestion.id);
    followQuestion(nextQuestion.id);
    saveQuestionEmbedding(nextQuestion.id, title, askForm.body);
    if (data.session_id) loadSessions();
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
        author_role: !answerAnon && isLeaderRole(userRole) ? userRole : null,
        body,
      })
      .select('*')
      .single();

    if (insertError) {
      setError(insertError.message || 'Could not post your answer.');
      setAnswerSubmitting(false);
      return;
    }
    setAnswers((cur) => [...cur, { ...data, is_mine: true }]);
    followQuestion(selectedQuestion.id);
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
    const nextAnswer = { ...data, is_mine: data.author_id === userId };
    setAnswers((cur) => cur.map((a) => (a.id === editAnswerId ? nextAnswer : a)));
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

  const handleAcceptAnswer = async (answer) => {
    if (!answer?.id || !selectedQuestion) return;
    const nextAccepted = !answer.is_accepted;
    setAcceptingAnswerId(answer.id);
    setError('');

    const { data, error: acceptErr } = await supabase.rpc('qa_accept_answer', {
      target_answer_id: answer.id,
      accept: nextAccepted,
    });

    if (acceptErr) {
      setError(acceptErr.message || 'Could not update the accepted answer.');
      setAcceptingAnswerId(null);
      return;
    }

    setAnswers((cur) => cur.map((item) => {
      if (item.question_id !== answer.question_id) return item;
      if (nextAccepted) return { ...item, is_accepted: item.id === answer.id };
      return item.id === answer.id ? { ...item, is_accepted: false } : item;
    }));
    setQuestions((cur) => cur.map((q) => (
      q.id === data?.question_id ? { ...q, resolved_at: data?.resolved_at || null } : q
    )));
    setAcceptingAnswerId(null);
  };

  const handleExplorePassages = async () => {
    if (!selectedQuestion) return;
    setPassageLoading(true);
    setPassageError('');
    try {
      const { data, error: passageErr } = await supabase.functions.invoke('qa-passages', {
        body: { questionId: selectedQuestion.id, task: 'passages' },
      });
      if (passageErr) throw passageErr;
      setPassageSuggestions(data?.passages || []);
    } catch (err) {
      setPassageError(err.message || 'Could not load scripture suggestions.');
    } finally {
      setPassageLoading(false);
    }
  };

  const handleDraftAssist = async () => {
    if (!selectedQuestion || !isLeaderRole(userRole)) return;
    setDraftLoading(true);
    setError('');
    try {
      const { data, error: draftErr } = await supabase.functions.invoke('qa-passages', {
        body: { questionId: selectedQuestion.id, task: 'draft' },
      });
      if (draftErr) throw draftErr;
      const passageLines = (data?.passages || [])
        .map((item) => `${item.reference} - ${item.why}`)
        .join('\n');
      setAnswerBody([data?.draft || '', passageLines ? `Passages to consider:\n${passageLines}` : ''].filter(Boolean).join('\n\n'));
    } catch (err) {
      setError(err.message || 'Could not draft a starting point.');
    } finally {
      setDraftLoading(false);
    }
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

      <QASessionBar
        activeOrgId={activeOrgId}
        userRole={userRole}
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        onReloadSessions={loadSessions}
        activeSessionId={effectiveSessionId}
        onSelectSession={setActiveSessionId}
        questions={questions}
        answersByQuestion={answersByQuestion}
        onQuestionsChanged={loadAll}
      />

      <section className="qa-shell">
        <div className="qa-list card">
          <div className="qa-panel-heading">
            <h2>Questions</h2>
            <span>{loading ? 'Loading…' : `${sortedQuestions.length} question${sortedQuestions.length === 1 ? '' : 's'}`}</span>
          </div>
          <div className="qa-board-controls">
            <div className="qa-search-box">
              <Search size={15} />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search questions"
                aria-label="Search questions"
              />
            </div>
            <div className="qa-filter-row" aria-label="Question tags">
              <button
                type="button"
                className={`qa-filter-chip ${activeTag === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTag('all')}
              >
                All
              </button>
              {QA_TAGS.map((tag) => (
                <button
                  key={tag.value}
                  type="button"
                  className={`qa-filter-chip ${activeTag === tag.value ? 'active' : ''}`}
                  onClick={() => setActiveTag(tag.value)}
                >
                  {tag.label}
                </button>
              ))}
            </div>
            <div className="qa-sort-tabs" aria-label="Question sort">
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`qa-sort-tab ${effectiveSortMode === option.value ? 'active' : ''}`}
                  onClick={() => setSortMode(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
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
                  <div key={q.id} className={`qa-question-row ${selectedId === q.id ? 'active' : ''} ${q.resolved_at ? 'resolved' : ''}`}>
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
                      <div className="qa-question-title-line">
                        <span className="qa-question-title">{q.title}</span>
                        {q.resolved_at && (
                          <span className="qa-resolved-chip" title="Resolved">
                            <CheckCircle2 size={13} />
                          </span>
                        )}
                      </div>
                      <div className="qa-question-meta">
                        {!effectiveSessionId && q.session_title && (
                          <>
                            <span className="qa-session-tag-chip">{q.session_title}</span>
                            <span>·</span>
                          </>
                        )}
                        {q.tag && <span className="qa-tag-chip">{tagLabel(q.tag)}</span>}
                        {q.tag && <span>·</span>}
                        {renderAuthor(q)}
                        {q.source === 'guest' && (
                          <span className="qa-guest-chip" title="Submitted without an account">
                            <UserRound size={11} /> Guest
                          </span>
                        )}
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
                    {canModerate && (q.status === 'pending' || q.bucket) && (
                      <div className="qa-row-moderation">
                        {q.status === 'pending' ? (
                          <>
                            <span className="qa-pending-chip">Awaiting review</span>
                            <button
                              type="button"
                              className="qa-moderate-btn approve"
                              onClick={() => moderateQuestion(q.id, { status: 'published' })}
                              disabled={moderatingId === q.id}
                            >
                              <Check size={13} /> Approve
                            </button>
                            <button
                              type="button"
                              className="qa-moderate-btn"
                              onClick={() => moderateQuestion(q.id, { status: 'hidden' })}
                              disabled={moderatingId === q.id}
                            >
                              <EyeOff size={13} /> Hide
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="qa-bucket-chip">{q.bucket}</span>
                            <button
                              type="button"
                              className="qa-moderate-btn"
                              onClick={() => moderateQuestion(q.id, { clearBucket: true })}
                              disabled={moderatingId === q.id}
                            >
                              Clear
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {hasMoreQuestions && (
                <button
                  type="button"
                  className="btn-secondary qa-load-more"
                  onClick={loadMoreQuestions}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>

        <article className="qa-detail card">
          {selectedQuestion ? (() => {
            const detailImageUrl = selectedQuestion.image_path ? supabase.storage.from('prayer-images').getPublicUrl(selectedQuestion.image_path).data.publicUrl : null;
            const isAuthor = selectedQuestion.is_mine || isAdminRole(userRole);
            const isFollowing = followedQuestionIds.has(selectedQuestion.id);
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
                    <div className="qa-detail-title-row">
                      <h2>{selectedQuestion.title}</h2>
                      {selectedQuestion.resolved_at && (
                        <span className="qa-resolved-chip">
                          <CheckCircle2 size={13} />
                          <span>Resolved</span>
                        </span>
                      )}
                    </div>
                    {selectedQuestion.body && <p className="qa-detail-body">{selectedQuestion.body}</p>}
                    <div className="qa-question-meta">
                      {selectedQuestion.tag && (
                        <>
                          <span className="qa-tag-chip">{tagLabel(selectedQuestion.tag)}</span>
                          <span>·</span>
                        </>
                      )}
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
                      <span>·</span>
                      <button
                        type="button"
                        className={`qa-follow-btn ${isFollowing ? 'following' : ''}`}
                        onClick={() => toggleFollowQuestion(selectedQuestion.id)}
                        title={isFollowing ? 'Unfollow question' : 'Follow question'}
                      >
                        {isFollowing ? <BellOff size={12} /> : <Bell size={12} />}
                        <span>{isFollowing ? 'Following' : 'Follow'}</span>
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

                    {canModerate && selectedQuestion.session_id && (
                      <div className="qa-triage-row" aria-label="Session triage">
                        <span className="qa-triage-label">During the meeting:</span>
                        {[
                          { value: 'answered', label: 'Covered' },
                          { value: 'parked', label: 'Park' },
                        ].map((bucket) => {
                          const on = selectedQuestion.bucket === bucket.value;
                          return (
                            <button
                              key={bucket.value}
                              type="button"
                              className={`qa-triage-btn ${on ? 'on' : ''}`}
                              onClick={() => moderateQuestion(
                                selectedQuestion.id,
                                on ? { clearBucket: true } : { bucket: bucket.value },
                              )}
                              disabled={moderatingId === selectedQuestion.id}
                              aria-pressed={on}
                            >
                              {bucket.label}
                            </button>
                          );
                        })}
                        {selectedQuestion.status === 'pending' && (
                          <button
                            type="button"
                            className="qa-triage-btn approve"
                            onClick={() => moderateQuestion(selectedQuestion.id, { status: 'published' })}
                            disabled={moderatingId === selectedQuestion.id}
                          >
                            <Check size={13} /> Approve
                          </button>
                        )}
                        {selectedQuestion.status === 'published' && (
                          <button
                            type="button"
                            className="qa-triage-btn"
                            onClick={() => moderateQuestion(selectedQuestion.id, { status: 'hidden' })}
                            disabled={moderatingId === selectedQuestion.id}
                          >
                            <EyeOff size={13} /> Hide
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {(relatedLoading || relatedQuestions.length > 0) && (
                  <div className="qa-related-panel">
                    <div className="qa-related-heading">
                      <Sparkles size={14} />
                      <span>Related questions</span>
                    </div>
                    {relatedLoading ? (
                      <div className="qa-similar-loading">
                        <Loader2 className="spin" size={14} />
                        <span>Loading…</span>
                      </div>
                    ) : (
                      <div className="qa-related-list">
                        {relatedQuestions.map((match) => (
                          <button
                            key={match.id}
                            type="button"
                            className="qa-related-row"
                            onClick={() => openQuestionById(match.id)}
                          >
                            <span className="qa-related-title">{match.title}</span>
                            <span className="qa-related-meta">
                              {match.tag ? `${tagLabel(match.tag)} · ` : ''}
                              {match.answer_count || 0} answer{Number(match.answer_count) === 1 ? '' : 's'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="qa-scripture-panel">
                  <div className="qa-scripture-panel-header">
                    <div className="qa-related-heading">
                      <BookOpen size={14} />
                      <span>Explore the Scriptures</span>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary icon-text-btn"
                      onClick={handleExplorePassages}
                      disabled={passageLoading}
                    >
                      {passageLoading ? <Loader2 className="spin" size={14} /> : <Sparkles size={14} />}
                      <span>{passageSuggestions ? 'Refresh' : 'Explore'}</span>
                    </button>
                  </div>
                  <p className="qa-scripture-note">A starting point for your own study — weigh everything against Scripture.</p>
                  {passageError && <p className="qa-similar-error">{passageError}</p>}
                  {passageSuggestions && (
                    <div className="qa-passage-list">
                      {passageSuggestions.map((item) => (
                        <div key={`${item.reference}-${item.why}`} className="qa-passage-row">
                          <strong>{item.reference}</strong>
                          <span>{item.why}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="qa-answers-heading">
                {selectedAnswers.length} Answer{selectedAnswers.length === 1 ? '' : 's'}
              </div>

              <div className="qa-answer-list">
                {selectedAnswers.map((a) => {
                  const voted = myAVotes.has(a.id);
                  const canManage = a.is_mine || isAdminRole(userRole);
                  // A guest question has no author to accept on its behalf, so
                  // leaders stand in — matching qa_accept_answer's rule.
                  const canAccept = selectedQuestion.is_mine
                    || isAdminRole(userRole)
                    || (selectedQuestion.source === 'guest' && canModerate);
                  const isEditing = editAnswerId === a.id;
                  return (
                    <div key={a.id} className={`qa-answer-row ${a.is_accepted ? 'accepted' : ''}`}>
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
                            {(a.is_accepted || (a.author_role && !a.is_anonymous)) && (
                              <div className="qa-answer-badges">
                                {a.is_accepted && (
                                  <span className="qa-accepted-chip">
                                    <CheckCircle2 size={13} />
                                    <span>Accepted</span>
                                  </span>
                                )}
                                {a.author_role && !a.is_anonymous && (
                                  <span className="qa-leader-chip">
                                    <BadgeCheck size={13} />
                                    <span>Leader</span>
                                  </span>
                                )}
                              </div>
                            )}
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
                              {canAccept && (
                                <>
                                  <span>·</span>
                                  <button
                                    type="button"
                                    className={`qa-meta-action-btn ${a.is_accepted ? 'accepted' : ''}`}
                                    onClick={() => handleAcceptAnswer(a)}
                                    disabled={acceptingAnswerId === a.id}
                                  >
                                    {a.is_accepted ? 'Unaccept' : 'Accept'}
                                  </button>
                                </>
                              )}
                              {isLeaderRole(userRole) && (
                                <>
                                  <span>·</span>
                                  <button
                                    type="button"
                                    className="qa-meta-action-btn"
                                    onClick={() => setSaveObsAnswer(a)}
                                    title="Save this answer as a Bible Wiki observation"
                                  >
                                    Save to wiki
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
                {isLeaderRole(userRole) && (
                  <div className="qa-draft-assist-row">
                    <button
                      type="button"
                      className="btn-secondary icon-text-btn"
                      onClick={handleDraftAssist}
                      disabled={draftLoading}
                    >
                      {draftLoading ? <Loader2 className="spin" size={14} /> : <Sparkles size={14} />}
                      <span>{draftLoading ? 'Drafting…' : 'Suggest a starting point'}</span>
                    </button>
                  </div>
                )}
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
              {!editQuestionId && effectiveSessionId && (
                <p className="qa-ask-session-note">
                  Posting to <strong>{sessions.find((s) => s.id === effectiveSessionId)?.title}</strong>
                </p>
              )}
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

              <WikiEntitySuggest
                text={`${askForm.title} ${askForm.body}`}
                label="The wiki may already help with:"
              />

              <fieldset className="qa-tag-picker">
                <legend>Tag</legend>
                <div className="qa-tag-picker-options">
                  {QA_TAGS.map((tag) => (
                    <label
                      key={tag.value}
                      className={`qa-tag-option ${askForm.tag === tag.value ? 'active' : ''}`}
                    >
                      <input
                        type="radio"
                        name="qa-tag"
                        value={tag.value}
                        checked={askForm.tag === tag.value}
                        onChange={(e) => setAskForm((f) => ({ ...f, tag: e.target.value }))}
                      />
                      <span>{tag.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {(similarLoading || similarQuestions.length > 0 || similarError) && (
                <div className="qa-similar-box">
                  <div className="qa-similar-heading">
                    <Sparkles size={14} />
                    <span>Has this been asked?</span>
                  </div>
                  {similarLoading && (
                    <div className="qa-similar-loading">
                      <Loader2 className="spin" size={14} />
                      <span>Checking…</span>
                    </div>
                  )}
                  {similarError && <p className="qa-similar-error">{similarError}</p>}
                  {!similarLoading && similarQuestions.map((match) => (
                    <button
                      key={match.id}
                      type="button"
                      className="qa-related-row"
                      onClick={() => openQuestionById(match.id)}
                    >
                      <span className="qa-related-title">{match.title}</span>
                      <span className="qa-related-meta">
                        {Math.round((match.similarity || 0) * 100)}% match
                        {' · '}
                        {match.answer_count || 0} answer{Number(match.answer_count) === 1 ? '' : 's'}
                      </span>
                    </button>
                  ))}
                </div>
              )}

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

      {saveObsAnswer && (
        <WikiSaveObservationModal
          session={session}
          userRole={userRole}
          activeOrgId={activeOrgId}
          sourceText={saveObsAnswer.body}
          contextText={selectedQuestion?.title || ''}
          onClose={() => setSaveObsAnswer(null)}
        />
      )}
    </div>
  );
}
