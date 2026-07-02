import { useState, useEffect, useCallback } from 'react';
import { BookOpenCheck, Flame, Check, ChevronRight, X } from 'lucide-react';
import './ReadingPlanCard.css';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import { READING_PLANS, getPlan, getPlanReadings, computeStreak } from '../lib/readingPlans';

// Dashboard reading-plan card: pick a plan, read today's chapters (each chunk
// opens the Bible Lookup panel), mark the day done, keep a streak going.
// Progress is self-paced — "today" is always the next uncompleted day.

function openScripture(ref) {
  window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref } }));
}

export default function ReadingPlanCard({ session }) {
  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && !!userId;
  const [loading, setLoading] = useState(isConfigured);
  const [enrollment, setEnrollment] = useState(null);
  const [completedDays, setCompletedDays] = useState(new Set());
  const [streak, setStreak] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!isConfigured) return Promise.resolve();
    return Promise.all([
      supabase
        .from('reading_plan_enrollments')
        .select('plan_id, started_at')
        .order('started_at', { ascending: false })
        .limit(1),
      supabase
        .from('reading_plan_progress')
        .select('plan_id, day, completed_at')
        .order('completed_at', { ascending: false })
        .limit(400),
    ]).then(([{ data: enrollments }, { data: progress }]) => {
      const active = enrollments?.[0] || null;
      setEnrollment(active);
      setCompletedDays(new Set(
        (progress || [])
          .filter((row) => active && row.plan_id === active.plan_id)
          .map((row) => row.day)
      ));
      setStreak(computeStreak((progress || []).map((row) => row.completed_at)));
      setLoading(false);
    });
  }, [isConfigured]);

  useEffect(() => {
    load();
  }, [load]);

  const plan = enrollment ? getPlan(enrollment.plan_id) : null;

  const startPlan = async (planId) => {
    if (saving) return;
    setSaving(true);
    await supabase.from('reading_plan_enrollments').upsert({
      user_id: userId,
      plan_id: planId,
      started_at: new Date().toISOString(),
    }, { onConflict: 'user_id,plan_id' });
    setSaving(false);
    setShowPicker(false);
    await load();
  };

  const quitPlan = async () => {
    if (!enrollment || saving) return;
    setSaving(true);
    await supabase.from('reading_plan_progress').delete().eq('plan_id', enrollment.plan_id);
    await supabase.from('reading_plan_enrollments').delete().eq('plan_id', enrollment.plan_id);
    setEnrollment(null);
    setCompletedDays(new Set());
    setSaving(false);
  };

  if (!isConfigured || loading) return null;

  // Not enrolled: compact call-to-action + plan picker.
  if (!plan) {
    return (
      <section className="reading-plan card">
        <div className="reading-plan-header">
          <h2><BookOpenCheck size={18} /> Reading Plan</h2>
        </div>
        {!showPicker ? (
          <div className="reading-plan-cta">
            <p>Build a daily Bible habit — pick a plan and track your streak.</p>
            <button type="button" className="btn-primary" onClick={() => setShowPicker(true)}>
              Choose a plan <ChevronRight size={14} />
            </button>
          </div>
        ) : (
          <div className="reading-plan-picker">
            {READING_PLANS.map((p) => (
              <button key={p.id} type="button" className="reading-plan-option" onClick={() => startPlan(p.id)} disabled={saving}>
                <span className="reading-plan-option-name">{p.name}</span>
                <span className="reading-plan-option-desc">{p.description}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  // Next uncompleted day (self-paced).
  let currentDay = 1;
  while (completedDays.has(currentDay) && currentDay <= plan.days) currentDay += 1;
  const finished = currentDay > plan.days;
  const readings = finished ? [] : getPlanReadings(plan, currentDay);

  const markDone = async () => {
    if (saving || finished) return;
    setSaving(true);
    setCompletedDays((prev) => new Set([...prev, currentDay]));
    await supabase.from('reading_plan_progress').upsert({
      user_id: userId,
      plan_id: plan.id,
      day: currentDay,
    }, { onConflict: 'user_id,plan_id,day' });
    setSaving(false);
    // Refresh streak from the server-truth timestamps.
    const { data: progress } = await supabase
      .from('reading_plan_progress')
      .select('completed_at')
      .order('completed_at', { ascending: false })
      .limit(400);
    setStreak(computeStreak((progress || []).map((row) => row.completed_at)));
  };

  return (
    <section className="reading-plan card">
      <div className="reading-plan-header">
        <h2><BookOpenCheck size={18} /> {plan.name}</h2>
        <div className="reading-plan-header-right">
          {streak > 0 && (
            <span className="reading-plan-streak" title={`${streak}-day reading streak`}>
              <Flame size={14} /> {streak}
            </span>
          )}
          <button type="button" className="reading-plan-quit" onClick={quitPlan} title="Quit this plan" disabled={saving}>
            <X size={14} />
          </button>
        </div>
      </div>

      {finished ? (
        <p className="reading-plan-finished">🎉 Plan complete — all {plan.days} days done! Pick a new plan any time.</p>
      ) : (
        <>
          <div className="reading-plan-progressbar" role="progressbar" aria-valuenow={completedDays.size} aria-valuemin={0} aria-valuemax={plan.days}>
            <div className="reading-plan-progressfill" style={{ width: `${Math.round((completedDays.size / plan.days) * 100)}%` }} />
          </div>
          <p className="reading-plan-day">Day {currentDay} of {plan.days}</p>
          <div className="reading-plan-readings">
            {readings.map((reading) => (
              <button key={reading.label} type="button" className="reading-plan-chip" onClick={() => openScripture(reading.ref)}>
                {reading.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn-primary reading-plan-done" onClick={markDone} disabled={saving}>
            <Check size={15} /> Mark day {currentDay} done
          </button>
        </>
      )}
    </section>
  );
}
