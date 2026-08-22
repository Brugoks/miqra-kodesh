import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, RefreshCw, BookOpen } from 'lucide-react';
import './AskAiPanel.css';
import { supabase } from '../../lib/supabaseClient';
import { getFunctionErrorMessage } from '../../lib/functionErrors';

// "Ask AI" — a full-screen study companion for the passage currently open in
// the reader. The screen is split in half deliberately: the passage stays in
// view above while the conversation runs below, so the reader never has to
// choose between the text and the question they are asking about it.
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

const STARTERS = [
  'What is this passage saying, in plain words?',
  'What was going on when this was written?',
  'How does this connect to the rest of Scripture?',
  'What would living this out look like for me?',
];

// Model output is untrusted text: escape it before the **bold** pass so nothing
// it returns can inject live markup.
const escapeHtml = (value) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const renderMarkup = (text) =>
  escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

function passageToText(passage) {
  if (!passage) return '';
  if (passage.verses?.length) {
    return passage.verses
      .map((v) => (v.verse ? `[${v.verse}] ${v.text}` : v.text))
      .join('\n');
  }
  return passage.text || '';
}

function buildSystemPrompt(passage) {
  return [
    'You are a warm, careful Bible-study companion helping someone read a specific passage.',
    `They currently have ${passage.ref} open in the ${passage.label} translation. Here is the text they are looking at:`,
    '',
    passageToText(passage),
    '',
    'Ground every answer in this passage first. Quote from it when it helps, and name any other',
    'reference you bring in (book chapter:verse) so they can look it up themselves.',
    'Be concise — a few short paragraphs at most. Where faithful Christians read a verse differently,',
    'say so plainly instead of picking a side. If the passage does not answer their question, say that',
    'rather than inventing support for it.',
  ].join('\n');
}

export default function AskAiPanel({ passage, onClose, userId = null, organizationId = null }) {
  const [messages, setMessages] = useState([]); // [{ role: 'user' | 'assistant', content }]
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const threadRef = useRef(null);
  const inputRef = useRef(null);
  // Bumped on every send so a reply from an abandoned request can't land in a
  // thread the user has since reset.
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, []);

  // Follow the conversation as it grows, including while the "thinking" row is
  // showing, so the answer isn't written below the fold.
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages, loading]);

  // `base` is the thread the question is appended to. It defaults to what is on
  // screen; a retry passes the thread minus the turn that failed, because the
  // state reset that trims it has not landed by the time this runs.
  const ask = async (question, base = messages) => {
    const text = question.trim();
    if (!text || loading) return;

    const reqId = ++requestRef.current;
    const history = [...base, { role: 'user', content: text }];
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
          temperature: 0.4,
          maxTokens: 700,
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
    inputRef.current?.focus();
  };

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

        {/* ── Top half: the passage, stays put while you ask ── */}
        <section className="bl-ask-scripture" aria-label={`${passage.ref} (${passage.label})`}>
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

        {/* ── Bottom half: the conversation ── */}
        <section className="bl-ask-chat" aria-label="Conversation">
          <div className="bl-ask-thread" ref={threadRef}>
            {messages.length === 0 && !loading && (
              <div className="bl-ask-empty">
                <p className="bl-ask-empty-lead">
                  Ask anything about {passage.ref} — what it means, what was happening, how it lands today.
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
              <div key={i} className={`bl-ask-msg bl-ask-msg-${message.role}`}>
                {message.role === 'assistant' ? (
                  message.content.split('\n').filter((line) => line.trim()).map((para, p) => (
                    <p key={p} dangerouslySetInnerHTML={{ __html: renderMarkup(para) }} />
                  ))
                ) : (
                  <p>{message.content}</p>
                )}
              </div>
            ))}

            {loading && (
              <div className="bl-ask-msg bl-ask-msg-assistant bl-ask-thinking">
                <Loader2 size={14} className="bl-ask-spin" />
                <span>Thinking…</span>
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
            AI can be wrong — weigh what it says against the passage above.
          </p>
        </section>
      </div>
    </div>
  );
}
