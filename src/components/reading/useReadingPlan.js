// Data + actions for the reading-plan feature, shared by ReadingPlanCard,
// DailyReading, and PlanCalendar. Centralizes enrollment lifecycle
// (active/paused/completed/abandoned) so leaving a plan never silently
// deletes progress — only an explicit "start over" does that.
import { useState, useEffect, useCallback } from 'react';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';
import { getPlan, getPlanChapters, computeStreak, getBestStreak, getMissedDays, detectMilestones } from '../../lib/readingPlans';
import { recordEngagement } from '../../lib/scriptureEngagement';

const STREAK_GRACE_DAYS = 1;

export function useReadingPlan(session) {
  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && !!userId;
  const [loading, setLoading] = useState(isConfigured);
  const [enrollments, setEnrollments] = useState([]); // all rows, any status
  const [completedDays, setCompletedDays] = useState(new Set());
  const [skippedDays, setSkippedDays] = useState(new Set());
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [recentCompletions, setRecentCompletions] = useState([]); // ISO timestamps, non-skipped
  const [pendingMilestones, setPendingMilestones] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!isConfigured) return Promise.resolve();
    return Promise.all([
      supabase.from('reading_plan_enrollments').select('*').order('started_at', { ascending: false }),
      supabase
        .from('reading_plan_progress')
        .select('plan_id, day, completed_at, skipped')
        .order('completed_at', { ascending: false })
        .limit(2000),
    ]).then(([{ data: enrollmentRows }, { data: progress }]) => {
      const active = (enrollmentRows || []).find((e) => e.status === 'active') || null;
      setEnrollments(enrollmentRows || []);
      const planProgress = (progress || []).filter((row) => active && row.plan_id === active.plan_id);
      setCompletedDays(new Set(planProgress.filter((r) => !r.skipped).map((r) => r.day)));
      setSkippedDays(new Set(planProgress.filter((r) => r.skipped).map((r) => r.day)));
      const completions = (progress || []).filter((r) => !r.skipped).map((r) => r.completed_at);
      setStreak(computeStreak(completions, new Date(), { graceDays: STREAK_GRACE_DAYS }));
      setBestStreak(getBestStreak(completions));
      setTotalCompleted(completions.length);
      setRecentCompletions(completions);
      setLoading(false);
    });
  }, [isConfigured]);

  useEffect(() => { load(); }, [load]);

  const enrollment = enrollments.find((e) => e.status === 'active') || null;
  const pausedEnrollment = enrollments.find((e) => e.status === 'paused') || null;
  const plan = enrollment ? getPlan(enrollment.plan_id) : null;
  const pausedPlan = pausedEnrollment ? getPlan(pausedEnrollment.plan_id) : null;

  // Next uncompleted (and unskipped) day — the self-paced "today".
  let currentDay = 1;
  const resolvedDays = new Set([...completedDays, ...skippedDays]);
  if (plan) {
    while (resolvedDays.has(currentDay) && currentDay <= plan.days) currentDay += 1;
  }
  const finished = plan ? currentDay > plan.days : false;

  const existingRow = useCallback(
    (planId) => enrollments.find((e) => e.plan_id === planId) || null,
    [enrollments],
  );

  // First-time enrollment in a plan the user has never tried before.
  // group_id is explicitly cleared — this is always a solo (re-)start; join
  // a group via joinReadingGroup() instead, which sets its own group_id.
  const startPlan = async (planId, { scheduleMode = 'flexible' } = {}) => {
    if (saving) return;
    setSaving(true);
    await supabase.from('reading_plan_enrollments').upsert({
      user_id: userId,
      plan_id: planId,
      status: 'active',
      started_at: new Date().toISOString(),
      schedule_mode: scheduleMode,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      group_id: null,
    }, { onConflict: 'user_id,plan_id' });
    setSaving(false);
    await load();
  };

  // Re-enrolling in a plan with a prior (abandoned/completed) row.
  const reenrollPlan = async (planId, { resetProgress }) => {
    if (saving) return;
    setSaving(true);
    if (resetProgress) {
      await supabase.from('reading_plan_progress').delete().eq('plan_id', planId).eq('user_id', userId);
    }
    const prior = existingRow(planId);
    await supabase.from('reading_plan_enrollments').upsert({
      user_id: userId,
      plan_id: planId,
      status: 'active',
      started_at: resetProgress ? new Date().toISOString() : (prior?.started_at || new Date().toISOString()),
      schedule_mode: prior?.schedule_mode || 'flexible',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      group_id: null,
    }, { onConflict: 'user_id,plan_id' });
    setSaving(false);
    await load();
  };

  const pausePlan = async () => {
    if (!enrollment || saving) return;
    setSaving(true);
    await supabase.from('reading_plan_enrollments')
      .update({ status: 'paused' })
      .eq('user_id', userId)
      .eq('plan_id', enrollment.plan_id);
    setSaving(false);
    await load();
  };

  const resumePlan = async () => {
    if (!pausedEnrollment || saving) return;
    setSaving(true);
    await supabase.from('reading_plan_enrollments')
      .update({ status: 'active' })
      .eq('user_id', userId)
      .eq('plan_id', pausedEnrollment.plan_id);
    setSaving(false);
    await load();
  };

  // Quit keeps all progress rows — only reenrollPlan(id, { resetProgress: true }) deletes them.
  const quitPlan = async () => {
    if (!enrollment || saving) return;
    setSaving(true);
    await supabase.from('reading_plan_enrollments')
      .update({ status: 'abandoned' })
      .eq('user_id', userId)
      .eq('plan_id', enrollment.plan_id);
    setSaving(false);
    await load();
  };

  const refreshStreak = async () => {
    const { data: progress } = await supabase
      .from('reading_plan_progress')
      .select('completed_at, skipped')
      .order('completed_at', { ascending: false })
      .limit(2000);
    const completions = (progress || []).filter((r) => !r.skipped).map((r) => r.completed_at);
    const next = {
      streak: computeStreak(completions, new Date(), { graceDays: STREAK_GRACE_DAYS }),
      bestStreak: getBestStreak(completions),
      totalCompleted: completions.length,
    };
    setStreak(next.streak);
    setBestStreak(next.bestStreak);
    setTotalCompleted(next.totalCompleted);
    setRecentCompletions(completions);
    return next;
  };

  const markDayDone = async (day) => {
    if (!enrollment || saving) return;
    const targetDay = day ?? currentDay;
    const alreadyDone = completedDays.has(targetDay);
    const before = {
      streak,
      totalCompleted,
      percent: plan ? Math.round((completedDays.size / plan.days) * 100) : 0,
    };
    setSaving(true);
    setCompletedDays((prev) => new Set([...prev, targetDay]));
    setSkippedDays((prev) => {
      if (!prev.has(targetDay)) return prev;
      const next = new Set(prev);
      next.delete(targetDay);
      return next;
    });
    await supabase.from('reading_plan_progress').upsert({
      user_id: userId,
      plan_id: enrollment.plan_id,
      day: targetDay,
      skipped: false,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,plan_id,day' });
    setSaving(false);
    if (plan) recordEngagement(userId, getPlanChapters(plan, targetDay), 'plan').catch(() => {});
    const after = await refreshStreak();
    if (!alreadyDone && plan) {
      const afterPercent = Math.round((Math.min(completedDays.size + 1, plan.days) / plan.days) * 100);
      const milestones = detectMilestones(before, { ...after, percent: afterPercent });
      if (milestones.length) setPendingMilestones((prev) => [...prev, ...milestones]);
    }
  };

  const clearMilestones = () => setPendingMilestones([]);

  const skipDay = async (day) => {
    if (!enrollment || saving) return;
    setSaving(true);
    setSkippedDays((prev) => new Set([...prev, day]));
    await supabase.from('reading_plan_progress').upsert({
      user_id: userId,
      plan_id: enrollment.plan_id,
      day,
      skipped: true,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,plan_id,day' });
    setSaving(false);
  };

  // Re-anchor a calendar-mode plan's schedule so today becomes the next
  // unresolved day — missed days vanish because the mapping moved, not
  // because history was rewritten.
  const catchMeUp = async () => {
    if (!enrollment || saving || enrollment.schedule_mode !== 'calendar') return;
    setSaving(true);
    const missed = getMissedDays(enrollment, new Set([...completedDays, ...skippedDays]), plan, new Date());
    if (missed.length) {
      const started = new Date(enrollment.started_at);
      started.setDate(started.getDate() + missed.length);
      await supabase.from('reading_plan_enrollments')
        .update({ started_at: started.toISOString() })
        .eq('user_id', userId)
        .eq('plan_id', enrollment.plan_id);
    }
    setSaving(false);
    await load();
  };

  const setScheduleMode = async (mode) => {
    if (!enrollment || saving) return;
    setSaving(true);
    await supabase.from('reading_plan_enrollments')
      .update({ schedule_mode: mode })
      .eq('user_id', userId)
      .eq('plan_id', enrollment.plan_id);
    setSaving(false);
    await load();
  };

  const setReminderTime = async (time) => {
    if (!enrollment || saving) return;
    setSaving(true);
    await supabase.from('reading_plan_enrollments')
      .update({
        reminder_time: time || null,
        timezone: time ? Intl.DateTimeFormat().resolvedOptions().timeZone : enrollment.timezone,
      })
      .eq('user_id', userId)
      .eq('plan_id', enrollment.plan_id);
    setSaving(false);
    await load();
  };

  return {
    isConfigured,
    loading,
    saving,
    enrollment,
    pausedEnrollment,
    plan,
    pausedPlan,
    completedDays,
    skippedDays,
    streak,
    bestStreak,
    totalCompleted,
    recentCompletions,
    pendingMilestones,
    clearMilestones,
    currentDay,
    finished,
    existingRow,
    startPlan,
    reenrollPlan,
    pausePlan,
    resumePlan,
    quitPlan,
    markDayDone,
    skipDay,
    catchMeUp,
    setScheduleMode,
    setReminderTime,
    reload: load,
  };
}
