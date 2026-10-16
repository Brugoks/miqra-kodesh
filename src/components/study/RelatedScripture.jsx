import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, Loader2, Plus } from 'lucide-react';
import { requestCanvas } from '../../lib/studyCanvas';
import { JOURNEY_ENTRY_MAX, normalizeRelatedScripture } from '../../lib/canvasJourney';

function Verses({ verses }) {
  return <blockquote className="moment-verses">{verses.map((verse) => <p key={verse.reference}><span>{verse.reference}</span> {verse.text}</p>)}</blockquote>;
}

export function ScriptureEvidence({ scripture, currentGlimpse }) {
  return <div className="moment-evidence">
    <p className="moment-source">Berean Standard Bible</p>
    <Verses verses={scripture.verses} />
    <details className="moment-context-verses"><summary>Read surrounding verses · {scripture.contextReference}</summary>
      <Verses verses={scripture.contextVerses} />
      <button className="canvas-link" onClick={() => window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref: scripture.contextReference } }))}>Open in Bible reader</button>
    </details>
    <h4>In its context</h4><p>{scripture.context}</p>
    <h4>Connection to your glimpse</h4><p>{scripture.connection}</p>
    <p className="moment-hint">Context and connection are AI-assisted interpretations you can refine. Weigh them against the passage.</p>
    {currentGlimpse !== scripture.glimpse && <details><summary>Connected to an earlier version of your glimpse</summary><p className="moment-words">{scripture.glimpse}</p></details>}
  </div>;
}

export default function RelatedScripture({ canvas, busy, onAdd }) {
  const [focus, setFocus] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(null);
  const pending = useRef(null);
  const saving = useRef(false);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  const full = canvas.journey.entries.length >= JOURNEY_ENTRY_MAX;
  const savedReferences = new Set(canvas.journey.entries.filter((e) => e.kind === 'scripture').map((e) => e.reference));
  async function pull(event) {
    event.preventDefault();
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    setLoading(true); setError('');
    try {
      const data = await requestCanvas({ action: 'related', glimpse: canvas.journey.moment, focus: focus.trim(), exclude: [...savedReferences] }, controller.signal);
      if (pending.current !== controller) return;
      if (!Array.isArray(data?.suggestions) || data.suggestions.length > 3) throw new Error('The Scripture suggestions were incomplete. Please try again.');
      const items = data.suggestions.map((item) => {
        const scripture = normalizeRelatedScripture(item.scripture);
        if (!scripture || typeof item.reference !== 'string' || !item.reference.trim() || item.reference.length > 100 || scripture.glimpse !== canvas.journey.moment) throw new Error('The Scripture suggestions were incomplete. Please try again.');
        return { id: crypto.randomUUID(), kind: 'scripture', reference: item.reference, scripture, text: '', createdAt: new Date().toISOString() };
      });
      setSuggestions(items);
    } catch (err) {
      if (pending.current === controller && !controller.signal.aborted) setError(err.message || 'Could not pull related Scripture. Please try again.');
    } finally {
      if (pending.current === controller) { pending.current = null; setLoading(false); }
    }
  }
  function stop() { pending.current?.abort(); pending.current = null; setLoading(false); }
  async function add(entry) {
    if (saving.current || busy || full || savedReferences.has(entry.reference)) return;
    saving.current = true; setAdding(entry.id); setError('');
    try {
      if (!await onAdd(entry)) setError('This passage was not added. Your suggestion is still here; try again after resolving the save error.');
    } catch { setError('This passage could not be saved. Your suggestion is still here; try again.'); }
    finally { saving.current = false; setAdding(null); }
  }
  return <section className="moment-related" aria-labelledby="related-scripture-heading">
    <span className="canvas-eyebrow">LET SCRIPTURE DEEPEN THE GLIMPSE</span>
    <h2 id="related-scripture-heading"><BookOpen size={21} /> Pull related Scripture</h2>
    <p>Explore passages, read them in context, and choose what belongs in this canvas. Return for more as your understanding grows.</p>
    <form onSubmit={pull}><fieldset disabled={busy || loading || Boolean(adding) || full}>
      <label htmlFor="related-focus">What are you exploring now? (optional)</label>
      <input id="related-focus" maxLength={1000} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Receiving kindness, learning to trust…" />
      <p className="moment-hint">Pulling sends your original glimpse and this focus to AI. Your other entries are not sent. You choose which suggestions to save.</p>
      <button className="btn-secondary" type="submit">{loading ? <><Loader2 size={16} className="spin" /> Finding passages…</> : <><BookOpen size={16} /> Pull related Scripture</>}</button>
    </fieldset></form>
    {loading && <div className="moment-entry-actions"><span role="status">Finding passages and reading their context…</span><button className="canvas-link" onClick={stop}>Stop search</button></div>}
    {error && <p role="alert" className="moment-warning">{error}</p>}
    {full && <p role="status">This thread holds 100 entries. Keep a new glimpse to continue.</p>}
    {suggestions !== null && <div className="moment-suggestions" aria-label="Related Scripture suggestions" aria-live="polite">
      {!suggestions.length && <p>No new passages were returned. Try a different focus.</p>}
      {suggestions.map((entry) => {
        const added = savedReferences.has(entry.reference);
        return <article className="moment-suggestion" key={entry.id} aria-label={entry.reference}>
          <h3>{entry.reference}</h3><ScriptureEvidence scripture={entry.scripture} currentGlimpse={canvas.journey.moment} />
          <button className="btn-secondary" disabled={busy || loading || Boolean(adding) || full || added} onClick={() => add(entry)} aria-label={added ? `${entry.reference} added to canvas` : `Add ${entry.reference} to canvas`}>
            {added ? <><Check size={16} /> Added to canvas</> : <><Plus size={16} /> {adding === entry.id ? 'Adding…' : 'Add to canvas'}</>}
          </button>
        </article>;
      })}
    </div>}
  </section>;
}
