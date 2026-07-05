import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpenCheck, Flame, Check, ChevronRight, Play, X } from 'lucide-react';
import './ReadingPlanCard.css';
import { getPlanReadings, getPaceStatus, getHeatmapDays } from '../lib/readingPlans';
import { useReadingPlan } from './reading/useReadingPlan';
import DailyReading from './reading/DailyReading';

// Dashboard quick-access widget: today's reading in one tap, plus streak and
// progress at a glance. Everything else — browsing/switching plans, the
// full calendar, stats, reminders, groups — lives on the dedicated Reading
// Plan page (left nav). See useReadingPlan.js for the data logic.

export default function ReadingPlanCard({ session }) {
  const navigate = useNavigate();
  const {
    isConfigured, loading, saving, enrollment, pausedEnrollment, plan, pausedPlan,
    completedDays, streak, bestStreak, recentCompletions, pendingMilestones, clearMilestones,
    currentDay, finished, resumePlan, markDayDone,
  } = useReadingPlan(session);

  const [readerDay, setReaderDay] = useState(null);

  if (!isConfigured || loading) return null;

  // Not enrolled: compact call-to-action pointing at the full page.
  if (!plan) {
    return (
      <section className="reading-plan card">
        <div className="reading-plan-header">
          <h2><BookOpenCheck size={18} /> Reading Plan</h2>
        </div>

        {pausedEnrollment && pausedPlan && (
          <div className="reading-plan-paused-banner">
            <span>“{pausedPlan.name}” is paused</span>
            <button type="button" className="btn-secondary" onClick={resumePlan} disabled={saving}>
              <Play size={13} /> Resume
            </button>
          </div>
        )}

        <div className="reading-plan-cta">
          <p>Build a daily Bible habit — pick a plan and track your streak.</p>
          <button type="button" className="btn-primary" onClick={() => navigate('/reading-plans')}>
            Choose a plan <ChevronRight size={14} />
          </button>
        </div>
      </section>
    );
  }

  const readings = finished ? [] : getPlanReadings(plan, currentDay);
  const pace = enrollment.schedule_mode === 'flexible' && !finished
    ? getPaceStatus(enrollment, currentDay, plan)
    : null;
  const weekStrip = getHeatmapDays(recentCompletions, 1);

  return (
    <section className="reading-plan card">
      <div className="reading-plan-header">
        <h2><BookOpenCheck size={18} /> {plan.name}</h2>
        <div className="reading-plan-header-right">
          {streak > 0 && (
            <span className="reading-plan-streak" title={`${streak}-day reading streak (best: ${bestStreak})`}>
              <Flame size={14} /> {streak}
            </span>
          )}
          <button type="button" className="reading-plan-view-link" onClick={() => navigate('/reading-plans')}>
            View full plan <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {pendingMilestones.length > 0 && (
        <div className="reading-plan-milestone-toast" role="status" aria-live="polite">
          {pendingMilestones.map((m) => <span key={`${m.type}-${m.value}`}>🎉 {m.label}</span>)}
          <button type="button" onClick={clearMilestones} aria-label="Dismiss"><X size={13} /></button>
        </div>
      )}

      {finished ? (
        <p className="reading-plan-finished">🎉 Plan complete — all {plan.days} days done! Pick a new plan any time.</p>
      ) : (
        <>
          <div className="reading-plan-week-strip" aria-hidden="true">
            {weekStrip.map((d, i) => (
              <span key={i} className={`reading-plan-week-dot ${d.count > 0 ? 'read' : ''}`} />
            ))}
          </div>

          <div className="reading-plan-progressbar" role="progressbar" aria-valuenow={completedDays.size} aria-valuemin={0} aria-valuemax={plan.days}>
            <div className="reading-plan-progressfill" style={{ width: `${Math.round((completedDays.size / plan.days) * 100)}%` }} />
          </div>
          <p className="reading-plan-day">
            Day {currentDay} of {plan.days}
            {pace && pace.delta !== 0 && (
              <span className="reading-plan-pace"> · {pace.delta > 0 ? `${pace.delta} day${pace.delta === 1 ? '' : 's'} ahead 🎯` : 'at your own pace'}</span>
            )}
          </p>
          <div className="reading-plan-readings">
            {readings.map((reading) => (
              <button key={reading.label} type="button" className="reading-plan-chip" onClick={() => window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref: reading.ref } }))}>
                {reading.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn-primary reading-plan-done" onClick={() => setReaderDay(currentDay)}>
            <BookOpenCheck size={15} /> Start today's reading
          </button>
          <button type="button" className="reading-plan-manual-done" onClick={() => markDayDone(currentDay)} disabled={saving}>
            <Check size={13} /> Already read it — mark day {currentDay} done
          </button>
        </>
      )}

      {readerDay != null && (
        <DailyReading
          session={session}
          plan={plan}
          day={readerDay}
          streak={streak}
          completedCount={completedDays.size}
          onClose={() => setReaderDay(null)}
          onDone={markDayDone}
        />
      )}
    </section>
  );
}
