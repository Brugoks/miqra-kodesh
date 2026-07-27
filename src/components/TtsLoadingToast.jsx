import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AudioLines } from 'lucide-react';
import { formatEta } from '../lib/ttsEstimate';
import './TtsLoadingToast.css';

// Subtle, non-blocking status pill for "Read aloud" while the voice is being
// synthesized. It deliberately has no backdrop and no focus trap: the rest of
// the page stays clickable, and the X cancels the request for anyone who does
// not feel like waiting.
//
// The countdown is an estimate (see lib/ttsEstimate). Once it runs out we stop
// counting and say so rather than showing a bar frozen at 100%.
export default function TtsLoadingToast({
  open,
  voiceLabel,
  etaMs = 0,
  startedAt = 0,
  part = 1,
  totalParts = 1,
  onCancel,
}) {
  const [now, setNow] = useState(() => Date.now());

  // Tick the countdown. `now` may lag `startedAt` by up to one tick right
  // after opening; elapsed is floored at 0, so that just reads as "0s in".
  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [open, startedAt]);

  if (!open || typeof document === 'undefined') return null;

  const elapsed = Math.max(0, now - (startedAt || now));
  const eta = Math.max(1000, etaMs);
  const overrun = elapsed >= eta;
  const pct = overrun ? 100 : Math.min(93, Math.round((elapsed / eta) * 100));
  const meta = [
    voiceLabel,
    overrun ? 'taking longer than usual' : formatEta(eta - elapsed),
    totalParts > 1 ? `part ${part} of ${totalParts}` : '',
  ].filter(Boolean).join(' · ');

  return createPortal(
    <div className="tts-toast-layer">
      <div className={`tts-toast ${overrun ? 'tts-toast--overrun' : ''}`}>
        <div className="tts-toast-row">
          <AudioLines size={15} className="tts-toast-icon" aria-hidden="true" />
          <div className="tts-toast-text" role="status" aria-live="polite">
            <span className="tts-toast-label">Preparing narration…</span>
            {/* Hidden from assistive tech: it changes 4×/second. */}
            <span className="tts-toast-meta" aria-hidden="true">{meta}</span>
          </div>
          {onCancel && (
            <button
              type="button"
              className="tts-toast-cancel"
              onClick={onCancel}
              title="Stop preparing the narration"
              aria-label="Stop preparing the narration"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div
          className="tts-toast-track"
          role="progressbar"
          aria-label="Narration preparing"
          aria-valuemin={0}
          aria-valuemax={100}
          {...(overrun ? {} : { 'aria-valuenow': pct })}
        >
          <div className="tts-toast-bar" style={overrun ? undefined : { width: `${pct}%` }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
