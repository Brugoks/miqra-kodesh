import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Compass, X } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { useOnboarding } from '../lib/onboarding';
import './GettingStarted.css';

// A short list of things that mean "this person has found their way around":
// they have a face, they have opened scripture, they know a gathering is
// happening, they have said something, and they have kept something. Feedback
// ticket 032815b7.
//
// Every item is ticked by what the user has ACTUALLY done — onboarding_checklist()
// reads the real tables — so the card can never claim someone has done
// something they haven't, and it needs no per-step bookkeeping of its own.

export const GETTING_STARTED_KEY = 'gettingStarted';

const STEPS = [
  {
    key: 'photo',
    label: 'Add a profile photo',
    hint: 'So people recognise you in chat and prayer requests.',
    // The avatar lives in the profile menu, which is not a route.
    action: { kind: 'profile' },
  },
  {
    key: 'reading',
    label: 'Start a reading plan',
    hint: 'Pick a plan and the app keeps your place day to day.',
    action: { kind: 'route', to: '/reading-plans' },
  },
  {
    key: 'rsvp',
    label: 'RSVP to something',
    hint: 'Let your leaders know to expect you.',
    action: { kind: 'route', to: '/calendar' },
  },
  {
    key: 'chat',
    label: 'Say hello in chat',
    hint: 'Every group here has a channel — introduce yourself.',
    action: { kind: 'route', to: '/chat' },
  },
  {
    key: 'highlight',
    label: 'Highlight a verse',
    hint: 'Tap Highlight above any passage, then tap a verse to keep it.',
    action: { kind: 'route', to: '/highlights' },
  },
];

export default function GettingStarted({ session }) {
  const navigate = useNavigate();
  const { ready: onboardingReady, isDone, markDone } = useOnboarding(session);
  const [progress, setProgress] = useState(null);

  const dismissed = isDone(GETTING_STARTED_KEY);
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    // Don't spend a round trip on a card the user has already put away.
    if (!hasSupabaseConfig || !userId || !onboardingReady || dismissed) return undefined;

    let cancelled = false;
    supabase
      .rpc('onboarding_checklist')
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setProgress(data);
      });
    return () => { cancelled = true; };
  }, [userId, onboardingReady, dismissed]);

  const done = progress ? STEPS.filter((step) => progress[step.key]) : [];
  const allDone = Boolean(progress) && done.length === STEPS.length;

  // Finished is finished: record it so the card doesn't reappear on the next
  // device. In an effect, not in render — this writes to the profile.
  useEffect(() => {
    if (allDone && !dismissed) markDone(GETTING_STARTED_KEY);
  }, [allDone, dismissed, markDone]);

  if (!onboardingReady || dismissed || !progress || allDone) return null;

  const openStep = (step) => {
    if (step.action.kind === 'route') {
      navigate(step.action.to);
      return;
    }
    // Nudge the profile menu open rather than duplicating the avatar uploader.
    window.dispatchEvent(new CustomEvent('profile:open'));
  };

  return (
    <section className="gs-card card" aria-labelledby="gs-heading">
      <div className="gs-head">
        <div className="gs-title">
          <Compass size={18} />
          <h2 id="gs-heading">Getting started</h2>
        </div>
        <button
          type="button"
          className="gs-dismiss"
          onClick={() => markDone(GETTING_STARTED_KEY)}
          aria-label="Hide getting started"
          title="Hide this"
        >
          <X size={16} />
        </button>
      </div>

      <div className="gs-progress">
        <div className="gs-progress-track">
          <div
            className="gs-progress-fill"
            style={{ width: `${(done.length / STEPS.length) * 100}%` }}
          />
        </div>
        <span className="gs-progress-label">{done.length} of {STEPS.length}</span>
      </div>

      <ul className="gs-steps">
        {STEPS.map((step) => {
          const complete = Boolean(progress[step.key]);
          return (
            <li key={step.key} className={`gs-step${complete ? ' complete' : ''}`}>
              <span className="gs-step-mark" aria-hidden="true">
                {complete ? <Check size={13} /> : <span className="gs-step-dot" />}
              </span>
              {complete ? (
                <span className="gs-step-body">
                  <span className="gs-step-label">{step.label}</span>
                </span>
              ) : (
                <button type="button" className="gs-step-body" onClick={() => openStep(step)}>
                  <span className="gs-step-label">{step.label}</span>
                  <span className="gs-step-hint">{step.hint}</span>
                  <ChevronRight size={15} className="gs-step-chevron" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
