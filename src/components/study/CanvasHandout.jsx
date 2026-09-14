import { createPortal } from 'react-dom';
import { KIND_LABELS, canvasReference, combinedSources, orderTree } from '../../lib/studyCanvasModel';

/**
 * The printable study handout. Portalled to <body> so the print stylesheet can
 * hide the whole app beside it (no blank pages from hidden app height), and
 * mounted only while printing — see usePrintHandout.
 */
export default function CanvasHandout({ canvas, includeNotes = true, ownerName = '' }) {
  const sources = new Map(combinedSources(canvas.passages).map((source) => [source.id, source]));
  const numbers = new Map(canvas.steps.map((step, index) => [step.id, index + 1]));
  const pinned = canvas.pins.map((pin) => {
    const step = canvas.steps.find((s) => s.id === pin.stepId);
    const card = step?.explanation.cards.find((c) => c.id === pin.cardId);
    return card ? { pin, card, number: numbers.get(step.id) } : null;
  }).filter(Boolean);

  return createPortal(<article className="canvas-handout">
    <header><p>Living Study Canvas{ownerName ? ` · ${ownerName}` : ''}</p><h1>{canvas.title}</h1><p>{canvasReference(canvas.passages)}</p></header>
    {orderTree(canvas.steps).map(({ step, number, branchFrom }) => <section key={step.id}>
      <h2>Step {number}: {step.explanation.title}</h2>
      {branchFrom && <p><em>Branches from step {branchFrom}</em></p>}
      {step.focus && <p><strong>Question:</strong> {step.focus}</p>}
      {step.explanation.cards.map((card) => <div key={card.id} className="canvas-handout-card">
        <h3>{card.title} <small>{KIND_LABELS[card.kind] || 'Insight'}</small></h3><p>{card.body}</p>
        <p className="canvas-handout-sources">Sources: {card.sourceIds.map((id) => sources.get(id)?.title).filter(Boolean).join(', ')}</p>
        {includeNotes && step.cardNotes[card.id] && <blockquote><strong>Note:</strong> {step.cardNotes[card.id]}</blockquote>}
      </div>)}
      {includeNotes && step.note.trim() && <blockquote><strong>Reflection:</strong> {step.note}</blockquote>}
    </section>)}
    {pinned.length > 0 && <section><h2>Pinned insights</h2><ul>{pinned.map(({ pin, card, number }) => <li key={pin.id}><strong>{card.title}</strong> (step {number}): {card.body}</li>)}</ul></section>}
    <section><h2>Scripture</h2>{canvas.passages.map((passage) => <div key={passage.reference}><h3>{passage.reference}</h3>
      <p>{passage.sources.filter((s) => s.kind === 'verse').map((verse) => <span key={verse.id}><sup>{verse.ref.split(':').at(-1)}</sup>{verse.text} </span>)}</p></div>)}</section>
    <footer>Scripture: Berean Standard Bible (public domain). Explanations are AI-generated interpretations; weigh them against the text.</footer>
  </article>, document.body);
}
