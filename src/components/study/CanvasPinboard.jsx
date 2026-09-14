import { useState } from 'react';
import { GitCompare, Pin } from 'lucide-react';
import { KIND_LABELS } from '../../lib/studyCanvasModel';

/**
 * Cards set aside from any step. Choosing two lays them side by side, and the
 * owner can hand that pair back to the canvas as a question — truth by contrast.
 */
export default function CanvasPinboard({ steps, pins, readOnly = false, busy = false, onUnpin, onContrast, onOpenStep }) {
  const [selected, setSelected] = useState([]);
  const numbers = new Map(steps.map((step, index) => [step.id, index + 1]));
  const items = pins.map((pin) => {
    const step = steps.find((s) => s.id === pin.stepId);
    const card = step?.explanation.cards.find((c) => c.id === pin.cardId);
    return card ? { pin, step, card, number: numbers.get(step.id) } : null;
  }).filter(Boolean);
  if (!items.length) return null;
  const chosen = selected.map((id) => items.find((item) => item.pin.id === id)).filter(Boolean);
  const toggle = (id) => setSelected((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id].slice(-2));

  return <section className="canvas-pinboard" aria-label="Pinned insights">
    <div className="canvas-pinboard-head"><h2><Pin size={18} /> Pinned insights</h2><p>Choose two to set them side by side.</p></div>
    <div className="canvas-pin-grid">{items.map(({ pin, step, card, number }) => <article key={pin.id} className={`canvas-card canvas-pin-card${selected.includes(pin.id) ? ' canvas-selected' : ''}`}>
      <span className={`canvas-kind ${card.kind}`}>Step {number} · {KIND_LABELS[card.kind] || 'Insight'}</span>
      <h3>{card.title}</h3><p>{card.body}</p>
      <div className="canvas-pin-actions">
        <label className="canvas-check"><input type="checkbox" checked={selected.includes(pin.id)} onChange={() => toggle(pin.id)} aria-label={`Compare ${card.title}`} /> Compare</label>
        <button type="button" className="canvas-link" onClick={() => onOpenStep(step.id)}>Open step {number}</button>
        {!readOnly && <button type="button" className="canvas-link" onClick={() => onUnpin(step.id, card.id)}>Unpin</button>}
      </div>
    </article>)}</div>
    {chosen.length === 2 && <div className="canvas-compare" role="group" aria-label="Side-by-side comparison">
      <div className="canvas-compare-cols">{chosen.map(({ pin, step, card, number }) => <article key={pin.id}>
        <span className="canvas-eyebrow">STEP {number} · {step.explanation.title}</span><h3>{card.title}</h3><p>{card.body}</p>
        {step.cardNotes[card.id] && <p className="canvas-card-note"><strong>Note:</strong> {step.cardNotes[card.id]}</p>}
      </article>)}</div>
      {!readOnly && <button className="btn-primary" type="button" disabled={busy} onClick={() => { onContrast(chosen[0], chosen[1]); setSelected([]); }}><GitCompare size={16} /> Ask the canvas to contrast these</button>}
    </div>}
  </section>;
}
