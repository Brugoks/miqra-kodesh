import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { JOURNEY_ENTRY_MAX, JOURNEY_KINDS, JOURNEY_TEXT_MAX } from '../../../lib/canvasJourney';
import { cardKindLabel } from '../../../lib/canvasBoard';
import { refToPassageIds } from '../../../lib/scripture';
import { planSplit } from '../../../lib/canvasSplit';
import useMomentDraft from '../useMomentDraft';

const ENTRY_DRAFT = { text: '', kind: 'reflection', reference: '' };

/**
 * Adds a thought, prayer, question, response or Scripture connection. The draft
 * is kept per person and canvas as they type, so closing this never loses words.
 * `variant="panel"` is the compact form inside the board's details panel.
 */
export default function EntryComposer({ canvas, userId, disabled = false, onAdd, onAddMany, variant = 'outline', initialKind, position, connectFrom, onDone }) {
  const [draft, setDraft, clearDraft, available] = useMomentDraft(`miqra_moment_entry_v1:${userId}:${canvas.id}`, ENTRY_DRAFT);
  const kind = Object.hasOwn(JOURNEY_KINDS, draft.kind) ? draft.kind : 'reflection';
  const guidance = JOURNEY_KINDS[kind];
  const [error, setError] = useState('');
  const full = canvas.journey.entries.length >= JOURNEY_ENTRY_MAX;
  const panel = variant === 'panel';
  // Several pasted paragraphs can become several thoughts, but only if the person says so: the default is one thought, unchanged.
  const plan = useMemo(() => (onAddMany && !connectFrom && kind !== 'scripture' ? planSplit(draft.text, canvas.journey.entries.length) : null), [onAddMany, connectFrom, kind, draft.text, canvas.journey.entries.length]);
  // Choosing "Prayer" from the Add menu opens the form already on Prayer.
  useEffect(() => {
    if (initialKind && Object.hasOwn(JOURNEY_KINDS, initialKind) && draft.kind !== initialKind) setDraft({ ...draft, kind: initialKind });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKind]);

  async function submit(event) {
    event.preventDefault();
    if (!draft.text.trim() || full) return;
    if (kind === 'scripture' && !refToPassageIds(draft.reference.trim()).length) {
      setError('Use a Bible reference such as Ephesians 2:8–10.'); return;
    }
    setError('');
    const entry = { id: crypto.randomUUID(), kind, text: draft.text.trim(), createdAt: new Date().toISOString(), ...(kind === 'scripture' ? { reference: draft.reference.trim() } : {}) };
    if (await onAdd(entry, { position, connectFrom })) { clearDraft(); onDone?.(entry); }
  }

  async function split() {
    if (!plan?.ok) return;
    const now = new Date().toISOString();
    const entries = plan.pieces.map((piece) => ({ id: crypto.randomUUID(), kind, text: piece, createdAt: now }));
    if (await onAddMany(entries, { position })) { clearDraft(); onDone?.(entries); }
  }

  const idBase = panel ? 'panel' : 'moment';
  return <section className={panel ? 'moment-composer moment-composer--panel' : 'moment-composer'} aria-labelledby={`${idBase}-grow-heading`}>
    {panel ? <h2 id={`${idBase}-grow-heading`} tabIndex={-1}>{connectFrom ? 'Branch a thought' : `New ${cardKindLabel(kind).toLowerCase()}`}</h2> : <>
      <span className="canvas-eyebrow">{canvas.journey.entries.length ? 'RETURN & DEEPEN' : 'WHEN YOU ARE READY'}</span>
      <h2 id="moment-grow-heading">{canvas.journey.entries.length ? 'What is becoming clearer?' : 'Let this moment grow'}</h2>
      <p>{canvas.journey.entries.length ? 'Add what you are learning now, or edit an earlier entry as your understanding grows.' : 'Your glimpse is enough for today. Or choose one way to explore it below.'}</p>
    </>}
    <form onSubmit={submit}>
      <fieldset disabled={disabled || full}>
        <legend className="moment-legend">What would you like to add?</legend>
        <div className="moment-kinds">{Object.entries(JOURNEY_KINDS).map(([key]) => <label key={key} className={kind === key ? 'selected' : ''}>
          <input type="radio" name={`${idBase}-kind`} value={key} checked={kind === key} onChange={() => { setDraft({ ...draft, kind: key }); setError(''); }} />{panel ? cardKindLabel(key) : JOURNEY_KINDS[key].label}
        </label>)}</div>
        {kind === 'scripture' && <><label htmlFor={`${idBase}-scripture`}>Passage to explore</label><input id={`${idBase}-scripture`} maxLength={100} required placeholder="Ephesians 2:8–10" value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} /></>}
        <label htmlFor={`${idBase}-entry`}>{guidance.prompt}</label>
        <textarea id={`${idBase}-entry`} rows={panel ? 5 : 4} required maxLength={JOURNEY_TEXT_MAX} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} aria-describedby={`${idBase}-entry-hint`} />
        <p className="moment-hint" id={`${idBase}-entry-hint`}>{guidance.hint}</p>
        {plan && <div className="lc-split" role="group" aria-label="Split into thoughts">
          <p><strong>This looks like {plan.pieces.length} thoughts.</strong> Add it as one, or split it at the blank lines. No words are changed.</p>
          <ol>{plan.previews.map((preview, index) => <li key={index}>{preview}</li>)}</ol>
          {plan.problem && <p role="status" className="moment-warning">{plan.problem}</p>}
          <button className="btn-secondary" type="button" disabled={!plan.ok || disabled || full} onClick={split}>Split into {plan.pieces.length} thoughts</button>
        </div>}
        {error && <p role="alert" className="moment-warning">{error}</p>}
        <button className="btn-primary" type="submit" disabled={disabled || full || !draft.text.trim()}><Plus size={16} /> {panel ? (connectFrom ? 'Add and connect' : 'Add to canvas') : `Add ${guidance.label.toLowerCase()}`}</button>
      </fieldset>
    </form>
    {full && <p role="status">This canvas holds 100 later thoughts. Keep a new glimpse to continue your journey.</p>}
    {!available && <p role="status" className="moment-warning">Your draft is only in this open page. Save it before leaving.</p>}
  </section>;
}
