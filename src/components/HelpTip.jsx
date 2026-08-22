import { useEffect, useId, useRef, useState } from 'react';
import { HELP_BY_ID } from '../lib/helpContent';
import { useHelpMode } from '../lib/helpMode';
import './HelpTip.css';

// A `?` badge beside a real control, explaining it in a sentence or two.
// Feedback ticket 032815b7.
//
// Renders nothing at all unless help mode is on, so the normal app is never
// speckled with question marks — and nothing if the id is unknown, so a typo
// or a retired topic degrades to silence instead of a crash or an empty bubble.

export default function HelpTip({ id, align = 'start' }) {
  const helpMode = useHelpMode();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const bubbleId = useId();
  const topic = HELP_BY_ID.get(id);

  // Close on outside tap or Escape — a bubble left open over the thing it
  // describes is worse than no bubble.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Leaving help mode with a bubble open would leave it open underneath, ready
  // to reappear the next time help is switched on. Reset during render rather
  // than in an effect, so there is no cascading second pass.
  const [prevHelpMode, setPrevHelpMode] = useState(helpMode);
  if (helpMode !== prevHelpMode) {
    setPrevHelpMode(helpMode);
    if (!helpMode) setOpen(false);
  }

  if (!helpMode || !topic) return null;

  return (
    <span className="help-tip" ref={wrapRef}>
      <button
        type="button"
        className={`help-tip-badge${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? bubbleId : undefined}
        aria-label={`What is ${topic.title}?`}
      >
        ?
      </button>
      {open && (
        <span className={`help-tip-bubble help-tip-bubble--${align}`} id={bubbleId} role="tooltip">
          <span className="help-tip-title">{topic.title}</span>
          <span className="help-tip-body">{topic.body}</span>
        </span>
      )}
    </span>
  );
}
