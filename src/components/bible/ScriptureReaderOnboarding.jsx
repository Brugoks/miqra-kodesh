import { useState } from 'react';
import { BookOpen, Search, Type, Sparkles, Highlighter, ChevronLeft, ChevronRight, X } from 'lucide-react';
import './ScriptureReaderOnboarding.css';

// First-use walkthrough for the scripture reader, reopenable from the "How it
// works" button in its header. Requested as a video tutorial (ticket 032815b7
// follow-up); built in-app instead because the reader is the most-changed
// surface in the codebase — a recording goes stale the next time its toolbar
// moves, and this reaches every reader without them having to find a link.
//
// Dismissal is recorded by the caller through lib/onboarding, same as
// DiscipleshipOnboarding.

export const SCRIPTURE_READER_ONBOARDING_KEY = 'scriptureReader';

const STEPS = [
  {
    icon: BookOpen,
    title: 'It opens over whatever you were doing',
    body: 'The book icon in the top bar opens the reader from any page — a study, a chat, the calendar. Closing it, or pressing Back on your phone, puts you straight back where you were. You never lose your place.',
  },
  {
    icon: Search,
    title: 'Ask for a passage in plain words',
    body: 'Type what you would say out loud: “John 3”, “Romans 8:28”, “Psalm 23”. If you would rather browse, the navigator walks you through book, then chapter, then verse — and the reader remembers where you were last time.',
  },
  {
    icon: Type,
    title: 'Make it comfortable to read',
    body: 'A− and A+ step the text size up or down, and it stays that way next time. Compare puts two or three translations side by side, verse against verse, which is the fastest way to see what a difficult verse is actually saying.',
  },
  {
    icon: Sparkles,
    title: 'Ask why, not just what',
    body: 'Tap any verse number for a short explanation of what is happening and why it matters. Tap an underlined word for the Hebrew or Greek behind it. Neither one requires you to know the languages — that is the point.',
  },
  {
    icon: Highlighter,
    title: 'Keep what stands out',
    body: 'Highlight marks verses in colours you choose — a promise, a command, something that convicts — and you can add a note about why it mattered that day. Everything you mark collects in My Highlights in the menu.',
  },
];

export default function ScriptureReaderOnboarding({ onClose }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="sro-overlay"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="sro-modal" role="dialog" aria-modal="true" aria-label="How the scripture reader works">
        <div className="sro-head">
          <span className="sro-progress">{step + 1} of {STEPS.length}</span>
          <button type="button" className="sro-close" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <div className="sro-body">
          <div className="sro-icon"><Icon size={26} /></div>
          <h2>{current.title}</h2>
          <p>{current.body}</p>
        </div>

        <div className="sro-dots" role="presentation">
          {STEPS.map((s, i) => (
            <button
              key={s.title}
              type="button"
              className={i === step ? 'active' : ''}
              onClick={() => setStep(i)}
              aria-label={`Step ${i + 1}: ${s.title}`}
              aria-current={i === step}
            />
          ))}
        </div>

        <div className="sro-actions">
          {step > 0 ? (
            <button type="button" className="btn-secondary sro-btn" onClick={() => setStep(step - 1)}>
              <ChevronLeft size={15} /> Back
            </button>
          ) : (
            <button type="button" className="btn-secondary sro-btn" onClick={onClose}>Skip</button>
          )}
          {isLast ? (
            <button type="button" className="btn-primary sro-btn" onClick={onClose}>Start reading</button>
          ) : (
            <button type="button" className="btn-primary sro-btn" onClick={() => setStep(step + 1)}>
              Next <ChevronRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
