import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, Headphones, Loader2, Play, Plus } from 'lucide-react';
import { requestCanvas } from '../../lib/studyCanvas';
import { JOURNEY_ENTRY_MAX, JOURNEY_TEXT_MAX } from '../../lib/canvasJourney';
import { signalsDistress } from '../../lib/canvasCare';
import { joinSuggestions, loadRecentInsightTalks, matchInsights, pulledKeys, sermonEntry, videoLink } from '../../lib/sermonInsights';
import CanvasModelPicker, { CanvasModelRun } from './CanvasModelPicker';
import { CareNote } from './FeelingPicker';
import { modelChoiceField, useCanvasModel } from './canvasModelContext';
import './SermonInsights.css';

const formatDate = (value) => (value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const keyOf = ({ talk, insight }) => `${talk.id}:${insight.id}`;

/** Where a Scripture entry came from, kept beside the person's own words on the card. */
export function SermonSource({ sermon }) {
  const watch = sermon.quote ? videoLink(sermon.videoUrl, sermon.quote.at) : null;
  return <aside className="moment-sermon-source" aria-label="From a sermon">
    <small><Headphones size={13} aria-hidden="true" /> From the sermon “{sermon.title}”{[sermon.speaker, formatDate(sermon.date)].filter(Boolean).map((part) => ` · ${part}`).join('')}</small>
    <p>{sermon.claim}</p>
    {sermon.quote && <blockquote>“{sermon.quote.text}”{watch && <a href={watch} target="_blank" rel="noreferrer"><Play size={12} aria-hidden="true" /> Watch{sermon.quote.at ? ` from ${sermon.quote.at}` : ''}</a>}</blockquote>}
    <p><strong>A question to sit with</strong> {sermon.question}</p>
  </aside>;
}

function Connection({ item, why, disabled, onAdd }) {
  const { talk, insight } = item;
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const watch = insight.quote ? videoLink(talk.videoUrl, insight.quote.at) : null;

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError('');
    try {
      if (!await onAdd(sermonEntry(item, words))) setError('This was not added. Your words are still here; try again once any save problem is resolved.');
    } catch (err) { setError(err.message || 'This could not be added. Your words are still here; try again.'); }
    finally { setSaving(false); }
  }

  return <article className="moment-suggestion moment-sermon" aria-label={`${talk.title}, ${insight.anchor}`}>
    <header className="moment-sermon__from"><strong>{talk.title}</strong><small>{[talk.speaker, formatDate(talk.date)].filter(Boolean).join(' · ')}</small></header>
    <p className="moment-sermon__claim">{insight.claim}</p>
    {insight.quote && <blockquote className="moment-sermon__quote">“{insight.quote.text}”
      {watch && <a href={watch} target="_blank" rel="noreferrer"><Play size={13} aria-hidden="true" /> Watch{insight.quote.at ? ` from ${insight.quote.at}` : ''}</a>}
    </blockquote>}
    <p><strong>{why ? 'How this may connect' : 'Why you are seeing this'}</strong> {why || `It shares ${item.via} with this canvas.`}</p>
    <p><strong>A question to sit with</strong> {insight.question}</p>
    <div className="moment-entry-actions">
      <button type="button" className="canvas-link" onClick={() => window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref: insight.anchor } }))}><BookOpen size={14} /> Read {insight.anchor}</button>
      {!open && <button type="button" className="btn-secondary" disabled={disabled} onClick={() => setOpen(true)}><Plus size={16} /> Bring this into my canvas</button>}
    </div>
    {open && <form className="moment-sermon__bring" onSubmit={save}>
      <label htmlFor={`sermon-words-${keyOf(item)}`}>In your own words</label>
      <textarea id={`sermon-words-${keyOf(item)}`} rows={4} required maxLength={JOURNEY_TEXT_MAX} value={words} onChange={(e) => setWords(e.target.value)} placeholder={insight.question} />
      <p className="moment-hint">Read the passage first and weigh it for yourself (Acts 17:11). The sermon is kept beside your words as where this came from; the words are yours.</p>
      {error && <p role="alert" className="moment-warning">{error}</p>}
      <div className="moment-entry-actions">
        <button type="submit" className="btn-primary" disabled={disabled || saving || !words.trim()}>{saving ? <><Loader2 size={16} className="spin" /> Adding…</> : <><Plus size={16} /> Add to canvas</>}</button>
        <button type="button" className="canvas-link" disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>}
  </article>;
}

/**
 * "Hear it in a sermon": recent sermons from this church that may speak into the
 * open moment. Matching by passage runs here, on the device, with no AI. The AI
 * only runs if the person presses the button, and then only their glimpse and
 * focus leave the device. Offered as connections to weigh, never as a message.
 */
export default function SermonInsights({ canvas, orgId, busy, onAdd }) {
  const [talks, setTalks] = useState(null); // null while loading
  const [focus, setFocus] = useState('');
  const [asked, setAsked] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState([]);
  const [run, setRun] = useState(null);
  const model = useCanvasModel();
  const pending = useRef(null);
  const journey = canvas.journey;

  useEffect(() => {
    const controller = new AbortController();
    loadRecentInsightTalks(orgId, controller.signal).then(setTalks).catch(() => { if (!controller.signal.aborted) setTalks([]); });
    return () => controller.abort();
  }, [orgId]);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);

  const matches = useMemo(() => (talks ? matchInsights(journey, talks) : []), [journey, talks]);
  if (!talks?.length) return null; // no sermons with insights yet: nothing to show, nothing to clutter

  const pulled = pulledKeys(journey);
  const matched = new Set(matches.map(keyOf));
  const picks = (asked || []).filter((item) => !pulled.has(keyOf(item)) && !matched.has(keyOf(item)));
  const full = journey.entries.length >= JOURNEY_ENTRY_MAX;

  async function ask(event) {
    event.preventDefault();
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    setLoading(true); setError('');
    try {
      const data = await requestCanvas({ action: 'sermons', glimpse: journey.moment, focus: focus.trim(), exclude: [...pulled], ...modelChoiceField(model) }, controller.signal);
      if (pending.current !== controller) return;
      if (!Array.isArray(data?.suggestions)) throw new Error('The sermon connections were incomplete. Please try again.');
      setAsked(joinSuggestions(data.suggestions, talks, journey)); setRun(data.diagnostics || null);
    } catch (err) {
      if (pending.current === controller && !controller.signal.aborted) setError(err.message || 'Could not look for sermon connections. Please try again.');
    } finally {
      if (pending.current === controller) { pending.current = null; setLoading(false); }
    }
  }
  function stop() { pending.current?.abort(); pending.current = null; setLoading(false); }
  async function add(item, entry) {
    const ok = await onAdd(entry);
    if (ok) setAdded((list) => [...list, { key: keyOf(item), title: item.talk.title, anchor: item.insight.anchor }]);
    return ok;
  }

  return <section className="moment-related moment-sermons" aria-labelledby="sermon-insights-heading">
    <span className="canvas-eyebrow">WHAT YOUR CHURCH HAS BEEN HEARING</span>
    <h2 id="sermon-insights-heading"><Headphones size={21} /> Hear it in a sermon</h2>
    <p>A recent message may speak into this. These are connections to consider and bring to God in prayer, not answers about what He is saying to you. Read the passage and weigh it for yourself.</p>

    {added.map((item) => <p key={item.key} role="status" className="moment-sermon__added"><Check size={15} aria-hidden="true" /> Added: {item.title} · {item.anchor}</p>)}

    {matches.length > 0 && <div className="moment-suggestions" aria-label="Sermons that share a passage with this canvas">
      <h3 className="moment-sermons__sub">Shares a passage with your canvas</h3>
      {matches.map((item) => <Connection key={keyOf(item)} item={item} disabled={busy || full} onAdd={(entry) => add(item, entry)} />)}
    </div>}

    <form onSubmit={ask}><fieldset disabled={busy || loading || full}>
      <label htmlFor="sermon-focus">{matches.length ? 'Looking for more? What are you exploring now? (optional)' : 'What are you exploring now? (optional)'}</label>
      <input id="sermon-focus" maxLength={1000} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Waiting to be seen, a hard decision…" />
      {signalsDistress(journey.moment, focus) && <CareNote />}
      <p className="moment-hint">Asking sends your original glimpse and this focus to AI, along with the titles and key points of your church’s recent sermons. Your other entries are not sent, and nothing is saved unless you choose it.</p>
      <CanvasModelPicker />
      <button className="btn-secondary" type="submit">{loading ? <><Loader2 size={16} className="spin" /> Listening for connections…</> : <><Headphones size={16} /> Ask what may speak into this</>}</button>
    </fieldset></form>
    {loading && <div className="moment-entry-actions"><span role="status">Looking through recent sermons…</span><button type="button" className="canvas-link" onClick={stop}>Stop</button></div>}
    {error && <p role="alert" className="moment-warning">{error}</p>}

    {asked !== null && <div className="moment-suggestions" aria-label="Sermon connections" aria-live="polite">
      <CanvasModelRun run={run} />
      {!picks.length && <p>Nothing in your church’s recent sermons clearly connects. That is a fine answer: try a different focus, or come back after the next message.</p>}
      {picks.map((item) => <Connection key={keyOf(item)} item={item} why={item.why} disabled={busy || full} onAdd={(entry) => add(item, entry)} />)}
    </div>}
  </section>;
}
