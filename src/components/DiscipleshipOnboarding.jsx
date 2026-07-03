import { useState } from 'react';
import { X, UserPlus, PenLine, MessageCircle, Sprout, PartyPopper, ChevronLeft, ChevronRight } from 'lucide-react';

// First-visit walkthrough for the Discipleship module. Shown automatically
// until dismissed (localStorage flag), and reopenable any time from the
// "How it works" button in the page header.

export const ONBOARDING_KEY = 'miqra_discipleship_onboarding_v1';

const STEPS = [
  {
    icon: UserPlus,
    title: 'Walk with someone',
    body: 'Discipleship here is a two-person relationship, not a program. Invite someone you want to disciple — or ask someone you trust to disciple you. They accept, and you’re walking together. Everything inside the relationship stays between the two of you.',
  },
  {
    icon: PenLine,
    title: 'Keep a rhythm, not a schedule',
    body: 'Pick a rhythm — weekly works for most people. When your check-in is due, the app nudges you with three short prompts: What’s God been teaching you? Where are you struggling? How can I pray for you? Thirty honest seconds beats an essay you never write.',
  },
  {
    icon: MessageCircle,
    title: 'Talk where you already talk',
    body: 'The Message button opens a private chat with your person — the same chat you already use, with reactions, photos, and notifications. Check-ins give the relationship structure; chat gives it life between check-ins.',
  },
  {
    icon: Sprout,
    title: 'Grow together',
    body: 'When you’re on a reading plan or memorizing verses (from the Dashboard), your discipleship partner can see your streak and cheer you on at the moment it matters. You control this — flip “Share my growth” off any time.',
  },
  {
    icon: PartyPopper,
    title: 'Celebrate — then multiply',
    body: 'Record milestones as they happen: baptism, praying aloud for the first time, sharing a testimony, leading a study. The finish line isn’t a streak — it’s the day the person you’re discipling starts discipling someone else. (2 Timothy 2:2)',
  },
];

export default function DiscipleshipOnboarding({ onClose }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  const dismiss = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, 'done');
    } catch { /* storage unavailable */ }
    onClose();
  };

  return (
    <div className="disc-modal-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}>
      <div className="disc-modal card disc-onboarding" role="dialog" aria-modal="true" aria-label="How discipleship works">
        <div className="disc-modal-head">
          <span className="disc-onboarding-progress">{step + 1} of {STEPS.length}</span>
          <button type="button" onClick={dismiss} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="disc-onboarding-body">
          <div className="disc-onboarding-icon"><Icon size={30} /></div>
          <h2>{current.title}</h2>
          <p>{current.body}</p>
        </div>

        <div className="disc-onboarding-dots" role="presentation">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              className={i === step ? 'active' : ''}
              onClick={() => setStep(i)}
              aria-label={`Step ${i + 1}`}
            />
          ))}
        </div>

        <div className="disc-modal-actions disc-onboarding-actions">
          {step > 0 ? (
            <button type="button" className="btn-secondary icon-text-btn" onClick={() => setStep(step - 1)}>
              <ChevronLeft size={15} /> Back
            </button>
          ) : (
            <button type="button" className="btn-secondary" onClick={dismiss}>Skip</button>
          )}
          {isLast ? (
            <button type="button" className="btn-primary" onClick={dismiss}>Let&rsquo;s go</button>
          ) : (
            <button type="button" className="btn-primary icon-text-btn" onClick={() => setStep(step + 1)}>
              Next <ChevronRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
