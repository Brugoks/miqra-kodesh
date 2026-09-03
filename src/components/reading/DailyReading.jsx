import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, Check, Loader2, AlertCircle, Brain, Flame, Sparkles, Volume2, Square, MapPin } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';
import { refToPassageIds, CODE_TO_NAME } from '../../lib/scripture';
import { getPlanChapters, getMemoryVerseSuggestion } from '../../lib/readingPlans';
import { BOOK_INTROS } from '../../lib/bookIntros';
import { estimateSynthesisMs, recordSynthesis } from '../../lib/ttsEstimate';
import ScriptureImage from '../ScriptureImage';
import StudyResources from '../StudyResources';
import TtsLoadingToast from '../TtsLoadingToast';
import WikiCastStrip from '../wiki/WikiCastStrip';
import './DailyReading.css';

const TRANSLATIONS = [
  { id: 'free:web', label: 'WEB' },
  { id: 'a761ca71e0b3ddcf-01', label: 'NASB' },
  { id: 'esv', label: 'ESV' },
];

const TEXT_SIZES = { S: '1rem', M: '1.15rem', L: '1.35rem' };

function progressKey(planId, day) {
  return `dailyReading:${planId}:${day}`;
}

// Turn "[12] text" verse markers into muted superscript numbers.
function renderVerses(content) {
  if (!content) return null;
  return content.split(/(\[\d+(?::\d+)?\])/g).map((part, i) => {
    const m = part.match(/^\[(\d+)(?::\d+)?\]$/);
    if (m) return <sup key={i} className="dr-verse-num">{m[1]}</sup>;
    return <span key={i}>{part}</span>;
  });
}

// Split a long passage into sentence-bounded chunks under the function's cap
// so each Fish TTS request stays small and reliable.
function chunkText(text, max = 1000) {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      chunks.push(cur.trim());
      cur = s;
    } else {
      cur += s;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

// Full-screen guided reader for one plan day: steps through each chapter,
// fetching text on demand, then celebrates completion with a streak/progress
// recap and an optional memory-verse suggestion. Reading itself is the
// product here — chips in the card still exist for anyone who'd rather use
// the Bible Lookup panel.
// A book's chapter 1 starting today, where yesterday's reading ended in a
// different book (or this is day 1) — the moment to show a book intro.
function newBookStarting(plan, day, chapters) {
  if (!chapters.length) return null;
  const [code, num] = chapters[0].split('.');
  if (num !== '1') return null;
  if (day === 1) return code;
  const prevChapters = getPlanChapters(plan, day - 1);
  const prevLast = prevChapters[prevChapters.length - 1];
  if (!prevLast) return code;
  return prevLast.split('.')[0] !== code ? code : null;
}

export default function DailyReading({ session, plan, day, streak, completedCount, onClose, onDone }) {
  const navigate = useNavigate();
  const chapters = getPlanChapters(plan, day);
  const newBookCode = newBookStarting(plan, day, chapters);
  const introKey = newBookCode ? `bookIntroShown:${newBookCode}` : null;
  const [chunkIndex, setChunkIndex] = useState(0);
  const [textCache, setTextCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [translation, setTranslation] = useState(() => localStorage.getItem('readingTranslation') || 'free:web');
  const [textSize, setTextSize] = useState(() => localStorage.getItem('readingTextSize') || 'M');
  const [phase, setPhase] = useState(() => (introKey && !localStorage.getItem(introKey) ? 'intro' : 'reading'));
  const [finishing, setFinishing] = useState(false);
  const [memorizeState, setMemorizeState] = useState('idle'); // idle | saving | saved | error
  const [reflection, setReflection] = useState('');
  const [reflectionSaved, setReflectionSaved] = useState(false);
  const [questions, setQuestions] = useState(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState('');
  const audioRef = useRef(null);
  // Monotonic id for the current narration run: stopping (or starting a new
  // one) bumps it, so an in-flight synthesis knows it has been superseded and
  // two runs can never talk over each other.
  const ttsRunRef = useRef(0);
  const [ttsState, setTtsState] = useState('idle'); // idle | loading | playing | error
  const [ttsError, setTtsError] = useState('');
  const [voices, setVoices] = useState([]); // { id, label } from fish-tts
  const [voiceId, setVoiceId] = useState(() => localStorage.getItem('readingVoiceId') || '');
  // Drives the non-blocking "preparing the voice" pill: null whenever audio is
  // actually playing, set while a chunk is being synthesized.
  const [ttsPending, setTtsPending] = useState(null);

  const isConfigured = hasSupabaseConfig && !!session?.user?.id;
  const chapterId = chapters[chunkIndex];
  const isLast = chunkIndex === chapters.length - 1;

  const startReading = () => {
    if (introKey) localStorage.setItem(introKey, '1');
    setPhase('reading');
  };

  // Deep-links into the Ancient World Atlas pinned to wherever today's
  // reading takes place — see /atlas's ?chapters= handling in Atlas.jsx.
  // Closes this modal first so the route swap underneath isn't left showing
  // a stale overlay.
  const openOnMap = () => {
    onClose();
    navigate(`/atlas?chapters=${encodeURIComponent(chapters.join(','))}`);
  };

  useEffect(() => {
    if (!isConfigured) return;
    supabase
      .from('reading_plan_reflections')
      .select('content')
      .eq('user_id', session.user.id)
      .eq('plan_id', plan.id)
      .eq('day', day)
      .maybeSingle()
      .then(({ data }) => { if (data?.content) setReflection(data.content); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id, day]);

  useEffect(() => {
    const saved = localStorage.getItem(progressKey(plan.id, day));
    const idx = saved ? parseInt(saved, 10) : 0;
    // Deferred to a microtask — sync setState in an effect body trips the lint rule.
    if (idx > 0 && idx < chapters.length) Promise.resolve().then(() => setChunkIndex(idx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id, day]);

  useEffect(() => {
    if (phase === 'reading') localStorage.setItem(progressKey(plan.id, day), String(chunkIndex));
  }, [plan.id, day, chunkIndex, phase]);

  useEffect(() => {
    localStorage.setItem('readingTranslation', translation);
  }, [translation]);

  useEffect(() => {
    localStorage.setItem('readingTextSize', textSize);
  }, [textSize]);

  // Fetch the list of available cloned voices from fish-tts (no keys exposed).
  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    supabase.functions
      .invoke('fish-tts', { method: 'GET' })
      .then(({ data, error }) => {
        if (cancelled || error || !Array.isArray(data?.voices)) return;
        setVoices(data.voices);
        // Default to the first voice if none chosen yet.
        setVoiceId((prev) => {
          if (prev && data.voices.some((v) => v.id === prev)) return prev;
          return data.voices[0]?.id || '';
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isConfigured]);

  useEffect(() => {
    if (voiceId) localStorage.setItem('readingVoiceId', voiceId);
  }, [voiceId]);

  // Closing the reader must silence any in-flight narration.
  useEffect(() => () => {
    ttsRunRef.current += 1;
    audioRef.current?.pause();
  }, []);

  const loadChapter = useCallback(async (id, transId) => {
    if (!id || textCache[`${transId}:${id}`]) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('bible-proxy', {
        body: { bibleId: transId, passageId: id },
      });
      if (fnErr || !data?.data?.content) throw new Error(fnErr?.message || 'No content');
      setTextCache((prev) => ({ ...prev, [`${transId}:${id}`]: data.data.content }));
    } catch {
      setError('Could not load this chapter. Try again or switch translation.');
    } finally {
      setLoading(false);
    }
  }, [textCache]);

  useEffect(() => {
    if (phase === 'reading' && chapterId) Promise.resolve().then(() => loadChapter(chapterId, translation));
  }, [chapterId, translation, phase, loadChapter]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const content = textCache[`${translation}:${chapterId}`];
  const chapterTitle = chapterId
    ? (() => {
      const [code, num] = chapterId.split('.');
      return `${CODE_TO_NAME[code]} ${num}`;
    })()
    : '';

  const handleNext = async () => {
    if (!isLast) {
      setChunkIndex((i) => i + 1);
      return;
    }
    setFinishing(true);
    await onDone(day);
    localStorage.removeItem(progressKey(plan.id, day));
    setFinishing(false);
    setPhase('complete');
  };

  const handlePrev = () => setChunkIndex((i) => Math.max(0, i - 1));

  // Bail out of narration at any point — used by the Stop button and by the
  // cancel affordance on the "preparing" pill, so a slow synthesis never traps
  // the reader.
  const stopReadAloud = useCallback(() => {
    ttsRunRef.current += 1;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended?.();
      audioRef.current = null;
    }
    setTtsPending(null);
    setTtsState('idle');
  }, []);

  // "Read aloud": synthesize the current chapter in the cloned voice, playing
  // chunk-by-chunk. Toggles to a Stop control while speaking.
  const handleReadAloud = async () => {
    if (ttsState === 'playing' || ttsState === 'loading') {
      stopReadAloud();
      return;
    }
    if (!content) return;
    const clean = content
      .replace(/\[\d+(?::\d+)?\]\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return;

    ttsRunRef.current += 1;
    const runId = ttsRunRef.current;
    setTtsError('');
    setTtsState('loading');
    const chunks = chunkText(clean);
    const voiceLabel = voices.find((v) => v.id === voiceId)?.label || '';
    try {
      for (let i = 0; i < chunks.length; i += 1) {
        if (ttsRunRef.current !== runId) return;
        const ch = chunks[i];
        // Each chunk is a fresh round-trip (and a possible gap in playback), so
        // the pill reappears between parts with a fresh estimate.
        const startedAt = Date.now();
        setTtsPending({
          voiceLabel,
          part: i + 1,
          totalParts: chunks.length,
          etaMs: estimateSynthesisMs(ch.length, 'fish'),
          startedAt,
        });
        const { data, error } = await supabase.functions.invoke('fish-tts', {
          body: { text: ch, voice_id: voiceId },
        });
        if (ttsRunRef.current !== runId) return;
        if (error || !data) throw new Error(error?.message || 'TTS request failed');
        recordSynthesis(ch.length, Date.now() - startedAt, 'fish');
        // fish-tts returns an octet-stream Blob; wrap it as audio/mpeg for <audio>.
        const blob = new Blob([data], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        await new Promise((resolve, reject) => {
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onplay = () => {
            if (ttsRunRef.current !== runId) return;
            setTtsPending(null);
            setTtsState('playing');
          };
          audio.onended = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Playback failed'));
          };
          audio.play().catch(reject);
        });
      }
      setTtsPending(null);
      setTtsState('idle');
    } catch {
      if (ttsRunRef.current !== runId) return; // superseded — the new run owns the UI
      setTtsPending(null);
      setTtsState('error');
      setTtsError('Could not read this passage aloud. Try again.');
    }
  };

  const suggestion = getMemoryVerseSuggestion(chapters);

  const handleMemorize = async () => {
    if (!suggestion || memorizeState === 'saving' || !isConfigured) return;
    setMemorizeState('saving');
    const passageIds = refToPassageIds(suggestion);
    if (!passageIds.length) { setMemorizeState('error'); return; }
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('bible-proxy', {
        body: { bibleId: 'a761ca71e0b3ddcf-01', passageId: passageIds[0] },
      });
      if (fnErr || !data?.data?.content) throw new Error('No content');
      const cleanText = data.data.content.replace(/\[\d+(?::\d+)?]\s*/g, '').replace(/\s+/g, ' ').trim();
      const { error: upsertErr } = await supabase.from('memory_verses').upsert({
        user_id: session.user.id,
        reference: suggestion,
        verse_text: cleanText,
        translation: 'NASB',
      }, { onConflict: 'user_id,reference', ignoreDuplicates: true });
      setMemorizeState(upsertErr ? 'error' : 'saved');
      if (!upsertErr) {
        window.dispatchEvent(new CustomEvent('memory-verse:updated'));
      }
    } catch {
      setMemorizeState('error');
    }
  };

  const saveReflection = async () => {
    if (!isConfigured || !reflection.trim()) return;
    await supabase.from('reading_plan_reflections').upsert({
      user_id: session.user.id,
      plan_id: plan.id,
      day,
      content: reflection.trim(),
    }, { onConflict: 'user_id,plan_id,day' });
    setReflectionSaved(true);
  };

  const questionsCacheKey = `readingQuestions:${plan.id}:${day}`;

  const fetchQuestions = async () => {
    if (questionsLoading || !content) return;
    const cached = localStorage.getItem(questionsCacheKey);
    if (cached) { setQuestions(JSON.parse(cached)); return; }
    setQuestionsLoading(true);
    setQuestionsError('');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('gemini-proxy', {
        body: {
          reference: chapterTitle,
          passageText: content,
          userId: session?.user?.id ?? null,
          task: 'questions',
        },
      });
      if (fnErr || !data?.questions) throw new Error('No questions returned');
      setQuestions(data.questions);
      localStorage.setItem(questionsCacheKey, JSON.stringify(data.questions));
    } catch {
      setQuestionsError('Could not load reflection questions.');
    } finally {
      setQuestionsLoading(false);
    }
  };

  const percent = plan.days ? Math.round((completedCount / plan.days) * 100) : 0;

  const modal = (
    <div className="dr-overlay">
      <div className="dr-modal">
        <div className="dr-header">
          <div className="dr-header-title">
            <span className="dr-plan-name">{plan.name}</span>
            <span className="dr-day-label">Day {day} of {plan.days}</span>
          </div>
          <button type="button" className="dr-close" onClick={onClose} aria-label="Close reader">
            <X size={20} />
          </button>
        </div>

        {phase === 'intro' ? (
          <div className="dr-intro">
            <h3 className="dr-intro-title">{CODE_TO_NAME[newBookCode]}</h3>
            <p className="dr-intro-text">{BOOK_INTROS[newBookCode]}</p>
            <div className="dr-intro-video">
              <StudyResources book={CODE_TO_NAME[newBookCode]} />
            </div>
            <button type="button" className="btn-primary dr-intro-start" onClick={startReading}>
              Start reading <ChevronRight size={15} />
            </button>
          </div>
        ) : phase === 'reading' ? (
          <>
            <div className="dr-stepper">
              {chapters.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  className={`dr-step-dot ${i === chunkIndex ? 'active' : ''} ${i < chunkIndex ? 'done' : ''}`}
                  onClick={() => setChunkIndex(i)}
                  aria-label={`Go to chapter ${i + 1} of ${chapters.length}`}
                />
              ))}
            </div>

            <div className="dr-toolbar">
              <div className="dr-translation-picker">
                {TRANSLATIONS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`dr-chip ${translation === t.id ? 'active' : ''}`}
                    onClick={() => setTranslation(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="dr-size-picker">
                {Object.keys(TEXT_SIZES).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`dr-chip dr-size-chip ${textSize === s ? 'active' : ''}`}
                    onClick={() => setTextSize(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {voices.length > 1 && (
                <div className="dr-voice-picker" role="group" aria-label="Narrator voice">
                  {voices.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className={`dr-chip ${voiceId === v.id ? 'active' : ''}`}
                      onClick={() => setVoiceId(v.id)}
                      disabled={ttsState === 'playing' || ttsState === 'loading'}
                      title={
                        v.restricted
                          ? `Narrate in ${v.label} — admins and developers only`
                          : `Narrate in ${v.label}`
                      }
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                className={`dr-chip dr-read-aloud ${ttsState === 'playing' ? 'active' : ''}`}
                onClick={handleReadAloud}
                disabled={!content || !isConfigured || !voiceId}
                title={
                  !isConfigured
                    ? 'Sign in to enable read-aloud'
                    : ttsState === 'loading'
                      ? 'Stop preparing the narration'
                      : ttsState === 'playing'
                        ? 'Stop reading'
                        : 'Read this chapter aloud in your voice'
                }
              >
                {ttsState === 'loading' ? <Loader2 size={14} className="dr-spin" /> : ttsState === 'playing' ? <Square size={14} /> : <Volume2 size={14} />}
                {ttsState === 'playing' ? 'Stop' : ttsState === 'loading' ? 'Preparing…' : 'Read aloud'}
              </button>

              <button
                type="button"
                className="dr-chip"
                onClick={openOnMap}
                title="See today's reading on the map"
              >
                <MapPin size={14} /> Map
              </button>
            </div>

            <div className="dr-body" style={{ fontSize: TEXT_SIZES[textSize] }}>
              <h3 className="dr-chapter-title">{chapterTitle}</h3>
              {chunkIndex === 0 && (
                <WikiCastStrip chapters={chapters} title="Meet today's cast" limit={8} compact />
              )}
              {loading && (
                <div className="dr-loading"><Loader2 size={22} className="dr-spin" /> Loading chapter…</div>
              )}
              {!loading && error && (
                <div className="dr-error"><AlertCircle size={16} /> {error}</div>
              )}
              {ttsState === 'error' && ttsError && (
                <div className="dr-error"><AlertCircle size={16} /> {ttsError}</div>
              )}
              {!loading && !error && content && (
                <p className="dr-passage">{renderVerses(content)}</p>
              )}
            </div>

            <div className="dr-footer">
              <button type="button" className="btn-secondary" onClick={handlePrev} disabled={chunkIndex === 0}>
                <ChevronLeft size={15} /> Previous
              </button>
              <button type="button" className="btn-primary dr-next-btn" onClick={handleNext} disabled={finishing}>
                {finishing ? <Loader2 size={15} className="dr-spin" /> : isLast ? <Check size={15} /> : <ChevronRight size={15} />}
                {isLast ? `Finish day ${day}` : 'Next chapter'}
              </button>
            </div>
          </>
        ) : (
          <div className="dr-complete">
            <div className="dr-ring" style={{ '--pct': percent }}>
              <span className="dr-ring-pct">{percent}%</span>
            </div>
            <h3 className="dr-complete-title">Day {day} complete 🎉</h3>
            {streak > 0 && (
              <p className="dr-complete-streak"><Flame size={16} /> {streak}-day streak</p>
            )}

            {content && (
              <div className="dr-verse-of-day">
                <ScriptureImage reference={chapterTitle} content={content} translation={translation} />
              </div>
            )}

            {suggestion && (
              <button
                type="button"
                className="btn-secondary dr-memorize-btn"
                onClick={handleMemorize}
                disabled={memorizeState === 'saving' || memorizeState === 'saved'}
              >
                {memorizeState === 'saving' ? <Loader2 size={14} className="dr-spin" /> : <Brain size={14} />}
                {memorizeState === 'saved' ? `${suggestion} added` : `Add ${suggestion} to memory verses`}
              </button>
            )}

            {isConfigured && (
              <div className="dr-reflection">
                <label htmlFor="dr-reflection-input" className="dr-reflection-label">
                  What stood out to you today?
                </label>
                <textarea
                  id="dr-reflection-input"
                  className="dr-reflection-input"
                  rows={2}
                  value={reflection}
                  onChange={(e) => { setReflection(e.target.value); setReflectionSaved(false); }}
                  onBlur={saveReflection}
                  placeholder="A verse, a question, a prayer…"
                />
                {reflectionSaved && <span className="dr-reflection-saved">Saved</span>}
              </div>
            )}

            {!questions && !questionsLoading && !questionsError && content && (
              <button type="button" className="btn-secondary dr-reflect-btn" onClick={fetchQuestions}>
                <Sparkles size={14} /> Reflect deeper
              </button>
            )}
            {questionsLoading && (
              <div className="dr-loading"><Loader2 size={16} className="dr-spin" /> Generating questions…</div>
            )}
            {questionsError && <p className="dr-error">{questionsError}</p>}
            {questions && (
              <ul className="dr-questions-list">
                {questions.map((q, i) => <li key={i}>{q.question}</li>)}
              </ul>
            )}

            <button type="button" className="btn-primary dr-done-btn" onClick={onClose}>
              Done for today
            </button>
          </div>
        )}
      </div>

      <TtsLoadingToast
        open={!!ttsPending}
        voiceLabel={ttsPending?.voiceLabel}
        etaMs={ttsPending?.etaMs}
        startedAt={ttsPending?.startedAt}
        part={ttsPending?.part}
        totalParts={ttsPending?.totalParts}
        onCancel={stopReadAloud}
      />
    </div>
  );

  return createPortal(modal, document.body);
}
