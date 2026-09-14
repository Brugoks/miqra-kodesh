import { useState } from 'react';
import { ArrowUpRight, GitBranch, MessageSquarePlus, PenLine, Pin } from 'lucide-react';
import { KIND_LABELS, NOTE_MAX } from '../../lib/studyCanvasModel';

/**
 * One step of a study: its explanation cards with their evidence, and the
 * student's own words on it. Read-only on a shared canvas, where notes show as
 * text (and only when the owner chose to share them).
 */
export default function CanvasStep({ step, number, stepCount, branchFrom, isLatest, sources, pinnedIds, readOnly = false, supersededBy = '', onReveal, onPin, onNoteChange, onNoteCommit, onAsk, onBackToLatest }) {
  const { explanation } = step;
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  return <>
    <div className="canvas-insight-title">
      <span className="canvas-eyebrow">{stepCount > 1 ? `STEP ${number} OF ${stepCount}` : readOnly ? 'SHARED STUDY' : 'YOUR STUDY'}</span>
      <h2>{explanation.title}</h2>
      {step.focus && <p>Focus: {step.focus}</p>}
      {branchFrom && <p className="canvas-branch-note"><GitBranch size={13} /> Branches from step {branchFrom}</p>}
      {!readOnly && !isLatest && <small>You are looking back at an earlier step. A question asked from here starts a new branch. <button type="button" className="canvas-link" onClick={onBackToLatest}>Back to latest</button></small>}
      {!readOnly && isLatest && supersededBy && <small>Previous explanation shown while you explore a new focus.</small>}
    </div>

    {explanation.cards.map((card) => {
      const pinned = pinnedIds?.has(`${step.id}:${card.id}`);
      return <article className="canvas-card" key={card.id}>
        <div className="canvas-card-top"><span className={`canvas-kind ${card.kind}`}>{KIND_LABELS[card.kind] || 'Insight'}</span>
          {!readOnly && <button type="button" className={`canvas-pin${pinned ? ' is-pinned' : ''}`} aria-pressed={Boolean(pinned)} aria-label={`${pinned ? 'Unpin' : 'Pin'} ${card.title}`} onClick={() => onPin(step.id, card.id)}><Pin size={14} /> {pinned ? 'Pinned' : 'Pin'}</button>}</div>
        <h3>{card.title}</h3><p>{card.body}</p>
        <div className="canvas-citations" aria-label="Supporting sources">{card.sourceIds.map((id) => { const source = sourceById.get(id); return source ? <button key={id} type="button" onClick={() => onReveal(id)}>{source.title}</button> : null; })}</div>
        {readOnly ? step.cardNotes[card.id] && <p className="canvas-card-note"><strong>Note:</strong> {step.cardNotes[card.id]}</p>
          : <CardNote cardTitle={card.title} value={step.cardNotes[card.id] || ''} onChange={(value) => onNoteChange(step.id, { cardNotes: { ...step.cardNotes, [card.id]: value } })} onCommit={onNoteCommit} />}
      </article>;
    })}

    {readOnly ? step.note && <section className="canvas-reflection"><h3><PenLine size={15} /> Reflection</h3><p>{step.note}</p></section>
      : <div className="canvas-reflection"><label htmlFor={`canvas-reflection-${step.id}`}><PenLine size={15} /> Your reflection</label>
        <textarea id={`canvas-reflection-${step.id}`} rows={3} maxLength={NOTE_MAX} value={step.note} placeholder="What are you noticing? Where do you push back? Your next question will carry this with it."
          onChange={(event) => onNoteChange(step.id, { note: event.target.value })} onBlur={onNoteCommit} /></div>}

    {!readOnly && explanation.questions.length > 0 && <div className="canvas-next"><h3>Keep exploring</h3>{explanation.questions.map((text) => <button type="button" key={text} onClick={() => onAsk(text)}>{text}<ArrowUpRight size={16} /></button>)}</div>}
  </>;
}

function CardNote({ cardTitle, value, onChange, onCommit }) {
  const [open, setOpen] = useState(false);
  if (!open && !value) return <button type="button" className="canvas-note-toggle" onClick={() => setOpen(true)}><MessageSquarePlus size={14} /> Add a note</button>;
  return <textarea className="canvas-card-note-input" aria-label={`Note on ${cardTitle}`} rows={2} maxLength={NOTE_MAX} value={value} autoFocus={open && !value}
    placeholder="Your note on this insight" onChange={(event) => onChange(event.target.value)} onBlur={() => { if (!value) setOpen(false); onCommit(); }} />;
}
