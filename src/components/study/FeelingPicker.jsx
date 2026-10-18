import { LifeBuoy } from 'lucide-react';
import { CANVAS_FEELINGS, FOCUS_PROMPTS } from '../../lib/canvasFeelings';

/** One-choice chips for how someone feels. Choosing the one already chosen clears it. */
export default function FeelingPicker({ value, onChange, label }) {
  return <div className="moment-chips" role="group" aria-label={label}>
    {CANVAS_FEELINGS.map((feeling) => <button type="button" key={feeling.key} aria-pressed={value === feeling.key}
      onClick={() => onChange(value === feeling.key ? '' : feeling.key)}>{feeling.label}</button>)}
  </div>;
}

/** Questions that turn a feeling into something to explore; choosing one fills the focus box. */
export function FocusPrompts({ onPick }) {
  return <div className="moment-chips moment-chips--prompts" role="group" aria-label="Ways to begin exploring">
    {FOCUS_PROMPTS.map((prompt) => <button type="button" key={prompt} onClick={() => onPick(prompt)}>{prompt}</button>)}
  </div>;
}

/**
 * Real help, shown alongside the words rather than instead of them. It never
 * blocks or hides anything: Scripture stays available for anyone who wants it.
 */
export function CareNote() {
  return <aside className="moment-care" aria-label="Support">
    <LifeBuoy size={20} aria-hidden="true" />
    <div>
      <strong>You don’t have to carry this alone.</strong>
      <p>If you are thinking about hurting yourself or you are in danger, please call or text <a href="tel:988">988</a> (the Suicide &amp; Crisis Lifeline in the US) or your local emergency number right now. A pastor or leader you trust can also walk with you.</p>
      <p>Scripture is still here whenever you want it.</p>
    </div>
  </aside>;
}
