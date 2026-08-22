import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, X, Send, Loader2, RefreshCw, BookOpen, Copy, Check, GripHorizontal } from 'lucide-react';
import './AskAiPanel.css';
import { supabase } from '../../lib/supabaseClient';
import { getFunctionErrorMessage } from '../../lib/functionErrors';

// "Ask AI" — a full-screen study companion for the passage currently open in
// the reader: the passage above, the conversation below.
//
// The two halves are NOT a fixed 50/50. A split that never moves is wrong at
// both ends of the interaction — the moment the panel opens there is nothing to
// read below, and the moment an answer arrives the passage is no longer what
// the reader is looking at. So the divider follows attention: passage-dominant
// until the first question, conversation-dominant once there are answers, and
// draggable at any point, after which it stops moving on its own.
//
// Routed through the openrouter-proxy edge function, which holds the API key
// server-side and refuses anything that isn't a free model. Passing
// 'openrouter/free' also lets the proxy substitute whichever free model an
// admin has picked as the app-wide default (app_ai_settings.openrouter_model).
const FREE_MODEL = 'openrouter/free';

// How many previous turns to replay to the model. Free models run on small
// context windows and the passage itself already takes a slice of it, so the
// thread is trimmed rather than sent whole.
const HISTORY_TURNS = 8;

// A hard token ceiling backs up the "be brief" instruction: prompts drift,
// budgets don't. ~420 tokens is comfortably above the 120-word target and well
// below anything that would fill the conversation pane.
const MAX_TOKENS = 420;

// Fraction of the split area given to the passage. The two auto stops are what
// the panel moves between on its own; the bounds are what a drag can reach.
const SPLIT_READING = 0.66;     // opened, nothing asked yet — here to read
const SPLIT_COMPOSING = 0.45;   // cursor in the box, question not sent yet
const SPLIT_CONVERSING = 0.3;   // answers on screen — here to read those
const SPLIT_MIN = 0.14;
const SPLIT_MAX = 0.82;
const SPLIT_STEP = 0.05;

// Below this the passage pane is too short for one verse per line, so it flows
// as continuous prose instead and fits three or four times as much text.
const COMPACT_PASSAGE_BELOW = 0.26;
// Above this the conversation pane is short enough that the footnote under the
// composer is costing more than it is worth.
const COMPACT_CHAT_ABOVE = 0.58;

const STARTERS = [
  'What does this mean?',
  'What was going on here?',
  'How does this fit the bigger story?',
  'What do I do with this?',
];

const clampSplit = (value) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, value));

// Model output is untrusted text: escape it before the **bold** pass so nothing
// it returns can inject live markup.
const escapeHtml = (value) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const renderMarkup = (text) =>
  escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

// Split an answer into renderable blocks so short lists read as lists rather
// than as a wall of dashes.
function toBlocks(content) {
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  const blocks = [];
  for (const line of lines) {
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      const last = blocks[blocks.length - 1];
      if (last?.type === 'list') last.items.push(bullet[1]);
      else blocks.push({ type: 'list', items: [bullet[1]] });
    } else {
      blocks.push({ type: 'p', text: line });
    }
  }
  return blocks;
}

function passageToText(passage) {
  if (!passage) return '';
  if (passage.verses?.length) {
    return passage.verses
      .map((v) => (v.verse ? `[${v.verse}] ${v.text}` : v.text))
      .join('\n');
  }
  return passage.text || '';
}

// The brevity rules are the point of this prompt. A free model left to its own
// devices opens with a paragraph of throat-clearing and closes by offering to
// say more, which on a phone pushes the actual answer off screen.
function buildSystemPrompt(passage) {
  return [
    'You are a Bible-study companion answering questions about one specific passage.',
    '',
    `The reader has ${passage.ref} open in the ${passage.label} translation:`,
    passageToText(passage),
    '',
    'HOW TO ANSWER',
    '- Put the answer in the first sentence. No preamble, no restating the question, no "Great question".',
    '- Stay under 120 words. Either two or three short paragraphs, or up to four bullets — never both.',
    '- Answer from the passage above first. Quote at most one short phrase from it.',
    '- Give any other reference as Book chapter:verse so the reader can look it up.',
    '- If the passage does not answer the question, say so in one line rather than speculating.',
    '- Where faithful Christians read it differently, give each reading one line and do not pick a side.',
    '- No sign-off, no "let me know if", no offering to say more.',
    '- Go longer only if the reader explicitly asks you to expand.',
  ].join('\n');
}

export default function AskAiPanel({ passage, onClose, userId = null, organizationId = null }) {
  const [messages, setMessages] = useState([]); // [{ role: 'user' | 'assistant', content }]
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [split, setSplit] = useState(SPLIT_READING);
  const [dragging, setDragging] = useState(false);

  const threadRef = useRef(null);
  const inputRef = useRef(null);
  const splitAreaRef = useRef(null);
  // Once the reader sizes the panes themselves, the panel stops second-guessing
  // them — no auto-move on the next question or reset.
  const splitPinnedRef = useRef(false);
  // Bumped on every send so a reply from an abandoned request can't land in a
  // thread the user has since reset.
  const requestRef = useRef(0);
  // Whether the thread was scrolled to the bottom before this render. Someone
  // who has scrolled back up to re-read an answer should not be yanked down.
  const followRef = useRef(true);

  const compactPassage = split < COMPACT_PASSAGE_BELOW;
  const compactChat = split > COMPACT_CHAT_ABOVE;

  // Hand the panes their share of the split area. Two properties rather than a
  // calc() so the transition has plain numbers to interpolate.
  const splitStyle = { '--bl-ask-top': split, '--bl-ask-bottom': 1 - split };

  const moveSplit = useCallback((next, { pin = true } = {}) => {
    if (pin) splitPinnedRef.current = true;
    setSplit(clampSplit(next));
  }, []);

  // Shift focus to whichever half is currently the small one.
  const swapFocusedPane = () => moveSplit(split > 0.5 ? SPLIT_CONVERSING : SPLIT_READING);

  // The passage is the whole point until there is an answer to read; then the
  // answer is. Skipped entirely once the reader has dragged the divider.
  useEffect(() => {
    if (splitPinnedRef.current) return;
    setSplit(messages.length ? SPLIT_CONVERSING : SPLIT_READING);
  }, [messages.length]);

  // Deliberately no autofocus on mount: this panel opens onto a passage to
  // read, and popping the phone keyboard over it would bury the thing the
  // reader just asked to see.
  const handleComposerFocus = () => {
    if (splitPinnedRef.current || messages.length) return;
    setSplit(SPLIT_COMPOSING);
  };

  // Grow the box with the question, up to the cap the stylesheet sets.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  // Follow the conversation as it grows — including while the "thinking" row is
  // showing — but only for a reader who was already at the bottom.
  useEffect(() => {
    const thread = threadRef.current;
    if (thread && followRef.current) thread.scrollTop = thread.scrollHeight;
  }, [messages, loading, split]);

  const handleThreadScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    followRef.current = scrollHeight - scrollTop - clientHeight < 48;
  };

  // ── Divider ──────────────────────────────────────────────────────────────
  const applyPointer = (clientY) => {
    const rect = splitAreaRef.current?.getBoundingClientRect();
    if (!rect?.height) return;
    moveSplit((clientY - rect.top) / rect.height);
  };

  const handleDividerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
  };

  const handleDividerMove = (e) => {
    if (!dragging) return;
    applyPointer(e.clientY);
  };

  const endDrag = (e) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(false);
  };

  const handleDividerKey = (e) => {
    if (e.key === 'ArrowUp') moveSplit(split - SPLIT_STEP);
    else if (e.key === 'ArrowDown') moveSplit(split + SPLIT_STEP);
    else if (e.key === 'Home') moveSplit(SPLIT_MIN);
    else if (e.key === 'End') moveSplit(SPLIT_MAX);
    else if (e.key === 'Enter' || e.key === ' ') swapFocusedPane();
    else return;
    e.preventDefault();
  };

  // ── Asking ───────────────────────────────────────────────────────────────
  // `base` is the thread the question is appended to. It defaults to what is on
  // screen; a retry passes the thread minus the turn that failed, because the
  // state reset that trims it has not landed by the time this runs.
  const ask = async (question, base = messages) => {
    const text = question.trim();
    if (!text || loading) return;

    const reqId = ++requestRef.current;
    const history = [...base, { role: 'user', content: text }];
    followRef.current = true; // their own question always scrolls into view
    setMessages(history);
    setDraft('');
    setError('');
    setLoading(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('openrouter-proxy', {
        body: {
          model: FREE_MODEL,
          feature: 'scripture-ask-ai',
          userId,
          organizationId,
          temperature: 0.3,
          maxTokens: MAX_TOKENS,
          messages: [
            { role: 'system', content: buildSystemPrompt(passage) },
            ...history.slice(-HISTORY_TURNS),
          ],
        },
      });
      if (requestRef.current !== reqId) return;
      if (fnError) {
        throw new Error(await getFunctionErrorMessage(fnError, 'The AI helper is unavailable right now.'));
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.content) throw new Error('No answer came back. Please try again.');
      setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);
    } catch (err) {
      if (requestRef.current !== reqId) return;
      setError(err?.message || 'The AI helper is unavailable right now.');
    } finally {
      if (requestRef.current === reqId) setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    ask(draft);
  };

  const handleKeyDown = (e) => {
    // Enter sends, Shift+Enter starts a new line.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(draft);
    }
  };

  const retryLast = () => {
    const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');
    if (lastUserIndex === -1) return;
    setError('');
    // Resend from before the failed turn so it is replaced, not duplicated.
    ask(messages[lastUserIndex].content, messages.slice(0, lastUserIndex));
  };

  const resetThread = () => {
    requestRef.current += 1;
    setMessages([]);
    setError('');
    setLoading(false);
    setCopiedIndex(null);
  };

  const copyAnswer = async (content, index) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1600);
    } catch { /* clipboard blocked — nothing useful to say about it */ }
  };

  const splitPercent = Math.round(split * 100);

  return (
    <div className="bl-ask-overlay" role="dialog" aria-modal="true" aria-label={`Ask AI about ${passage.ref}`}>
      <div className="bl-ask-surface">
        <div className="bl-ask-header">
          <div className="bl-ask-title">
            <Bot size={16} />
            <span>Ask AI</span>
            <span className="bl-ask-title-ref">· {passage.ref}</span>
          </div>
          <div className="bl-ask-header-actions">
            {messages.length > 0 && (
              <button
                type="button"
                className="bl-ask-icon-btn"
                onClick={resetThread}
                aria-label="Start a new conversation"
                title="Start over"
              >
                <RefreshCw size={15} />
              </button>
            )}
            <button
              type="button"
              className="bl-ask-icon-btn"
              onClick={onClose}
              aria-label="Close Ask AI"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        <div
          className="bl-ask-split"
          ref={splitAreaRef}
          style={splitStyle}
          data-dragging={dragging ? 'true' : undefined}
        >
          {/* ── The passage ── */}
          <section
            className="bl-ask-scripture"
            data-compact={compactPassage ? 'true' : undefined}
            aria-label={`${passage.ref} (${passage.label})`}
          >
            <div className="bl-ask-scripture-head">
              <BookOpen size={13} />
              <span className="bl-ask-scripture-ref">{passage.ref}</span>
              <span className="bl-ask-scripture-trans">{passage.label}</span>
            </div>
            <div className="bl-ask-scripture-body">
              {passage.verses?.length ? (
                passage.verses.map((v, i) => (
                  <p key={`${v.chapter ?? ''}-${v.verse ?? i}`} className="bl-ask-verse">
                    {v.verse ? <span className="bl-ask-verse-num">{v.verse}</span> : null}
                    {v.text}
                  </p>
                ))
              ) : (
                <p className="bl-ask-verse">{passage.text}</p>
              )}
            </div>
          </section>

          {/* ── Resize handle ── */}
          <div
            className="bl-ask-divider"
            role="separator"
            tabIndex={0}
            aria-orientation="horizontal"
            aria-label="Resize the passage and the conversation"
            aria-valuemin={Math.round(SPLIT_MIN * 100)}
            aria-valuemax={Math.round(SPLIT_MAX * 100)}
            aria-valuenow={splitPercent}
            aria-valuetext={`Passage fills ${splitPercent}% of the screen`}
            title="Drag to resize · double-tap to swap focus"
            onPointerDown={handleDividerDown}
            onPointerMove={handleDividerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={swapFocusedPane}
            onKeyDown={handleDividerKey}
          >
            <GripHorizontal size={16} aria-hidden="true" />
          </div>

          {/* ── The conversation ── */}
          <section
            className="bl-ask-chat"
            data-compact={compactChat ? 'true' : undefined}
            aria-label="Conversation"
          >
            <div className="bl-ask-thread" ref={threadRef} onScroll={handleThreadScroll}>
              {messages.length === 0 && !loading && (
                <div className="bl-ask-empty">
                  <p className="bl-ask-empty-lead">
                    Ask about {passage.ref} — short, straight answers.
                  </p>
                  <div className="bl-ask-starters">
                    {STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        className="bl-ask-starter"
                        onClick={() => ask(starter)}
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message, i) => (
                <div key={i} className={`bl-ask-row bl-ask-row-${message.role}`}>
                  <div className={`bl-ask-msg bl-ask-msg-${message.role}`}>
                    {message.role === 'assistant' ? (
                      toBlocks(message.content).map((block, b) => (
                        block.type === 'list' ? (
                          <ul key={b}>
                            {block.items.map((item, li) => (
                              <li key={li} dangerouslySetInnerHTML={{ __html: renderMarkup(item) }} />
                            ))}
                          </ul>
                        ) : (
                          <p key={b} dangerouslySetInnerHTML={{ __html: renderMarkup(block.text) }} />
                        )
                      ))
                    ) : (
                      <p>{message.content}</p>
                    )}
                  </div>
                  {message.role === 'assistant' && (
                    <button
                      type="button"
                      className="bl-ask-copy"
                      onClick={() => copyAnswer(message.content, i)}
                      aria-label={copiedIndex === i ? 'Answer copied' : 'Copy this answer'}
                      title={copiedIndex === i ? 'Copied' : 'Copy'}
                    >
                      {copiedIndex === i ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  )}
                </div>
              ))}

              {loading && (
                <div className="bl-ask-row bl-ask-row-assistant">
                  <div className="bl-ask-msg bl-ask-msg-assistant bl-ask-thinking">
                    <Loader2 size={14} className="bl-ask-spin" />
                    <span>Thinking…</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="bl-ask-error">
                  <p>{error}</p>
                  <button type="button" className="bl-ask-retry" onClick={retryLast}>
                    <RefreshCw size={13} />
                    Try again
                  </button>
                </div>
              )}
            </div>

            <form className="bl-ask-composer" onSubmit={handleSubmit}>
              <textarea
                ref={inputRef}
                className="bl-ask-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={handleComposerFocus}
                placeholder={`Ask about ${passage.ref}…`}
                rows={1}
                aria-label={`Ask a question about ${passage.ref}`}
              />
              <button
                type="submit"
                className="bl-ask-send"
                disabled={!draft.trim() || loading}
                aria-label="Send question"
              >
                {loading ? <Loader2 size={16} className="bl-ask-spin" /> : <Send size={16} />}
              </button>
            </form>
            <p className="bl-ask-disclaimer">
              AI can be wrong — weigh it against the passage above.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
