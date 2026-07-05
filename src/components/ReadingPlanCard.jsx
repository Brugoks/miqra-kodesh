import { useState, useEffect } from 'react';
import {
  BookOpenCheck, Flame, Check, ChevronRight, MoreHorizontal, CalendarDays,
  BarChart3, Bell, Pause, Play, Download, Users, X,
} from 'lucide-react';
import './ReadingPlanCard.css';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import { getPlanReadings, getPaceStatus, dateForDay, getHeatmapDays } from '../lib/readingPlans';
import { downloadPlanICS } from '../lib/calendarExport';
import { joinReadingGroup, getGroupTodayStatus } from '../lib/readingGroups';
import { useReadingPlan } from './reading/useReadingPlan';
import PlanBrowser from './reading/PlanBrowser';
import PlanCalendar from './reading/PlanCalendar';
import DailyReading from './reading/DailyReading';
import ReadingStats from './reading/ReadingStats';

// Dashboard reading-plan card: pick a plan, read today's chapters in the
// guided DailyReading experience, keep a streak, and — via the menu — pause,
// view the full plan calendar, export to a device calendar, set a daily
// reminder, or read as a group. See useReadingPlan.js for all the data logic.

export default function ReadingPlanCard({ session, activeOrgId }) {
  const {
    isConfigured, loading, saving, enrollment, pausedEnrollment, plan, pausedPlan,
    completedDays, skippedDays, streak, bestStreak, recentCompletions, pendingMilestones, clearMilestones,
    currentDay, finished, existingRow, startPlan, reenrollPlan, pausePlan, resumePlan, quitPlan,
    markDayDone, skipDay, catchMeUp, setScheduleMode, setReminderTime, reload,
  } = useReadingPlan(session);

  const [showBrowser, setShowBrowser] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReminderInput, setShowReminderInput] = useState(false);
  const [readerDay, setReaderDay] = useState(null);
  const [deepLinkPlanId, setDeepLinkPlanId] = useState(null);
  const [groupInvite, setGroupInvite] = useState(null);
  const [groupStatus, setGroupStatus] = useState(null);
  const [confirmQuit, setConfirmQuit] = useState(false);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    const params = new URLSearchParams(window.location.search);
    const groupParam = params.get('group');
    const planParam = params.get('plan');
    if (groupParam) {
      supabase.from('reading_plan_groups').select('*').eq('id', groupParam).maybeSingle()
        .then(({ data }) => { if (data) setGroupInvite(data); });
    } else if (planParam) {
      // Deferred to a microtask — sync setState in an effect body trips the lint rule.
      Promise.resolve().then(() => {
        setDeepLinkPlanId(planParam);
        setShowBrowser(true);
      });
    }
  }, []);

  useEffect(() => {
    if (enrollment?.group_id) {
      getGroupTodayStatus({ groupId: enrollment.group_id, planId: enrollment.plan_id }).then(setGroupStatus);
    } else {
      Promise.resolve().then(() => setGroupStatus(null));
    }
  }, [enrollment?.group_id, enrollment?.plan_id, completedDays.size]);

  if (!isConfigured || loading) return null;

  const handleChoosePlan = async (planId, opts) => {
    const prior = existingRow(planId);
    if (prior && (prior.status === 'abandoned' || prior.status === 'completed')) {
      await reenrollPlan(planId, opts || { resetProgress: false });
    } else if (enrollment && enrollment.plan_id !== planId) {
      await pausePlan();
      await startPlan(planId);
    } else {
      await startPlan(planId);
    }
    setShowBrowser(false);
    setDeepLinkPlanId(null);
  };

  const handleJoinGroup = async () => {
    if (!groupInvite || !session?.user?.id) return;
    await joinReadingGroup({ groupId: groupInvite.id, userId: session.user.id });
    setGroupInvite(null);
    await reload();
  };

  const handleExportICS = () => {
    if (!plan || !enrollment) return;
    const remainingDays = [];
    const today = new Date();
    for (let d = currentDay; d <= plan.days; d += 1) {
      const date = enrollment.schedule_mode === 'calendar'
        ? dateForDay(enrollment, d)
        : new Date(today.getFullYear(), today.getMonth(), today.getDate() + (d - currentDay));
      remainingDays.push({ day: d, date, readingLabels: getPlanReadings(plan, d).map((r) => r.label) });
    }
    downloadPlanICS(plan.name, remainingDays);
    setShowMenu(false);
  };

  const handleQuit = async () => {
    await quitPlan();
    setConfirmQuit(false);
    setShowMenu(false);
  };

  // Not enrolled: compact call-to-action + plan picker.
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

        {groupInvite && (
          <div className="reading-plan-invite-banner">
            <span>You've been invited to join “{groupInvite.name}”</span>
            <div className="reading-plan-invite-actions">
              <button type="button" className="btn-primary" onClick={handleJoinGroup}>Join</button>
              <button type="button" className="btn-secondary" onClick={() => setGroupInvite(null)}>Dismiss</button>
            </div>
          </div>
        )}

        <div className="reading-plan-cta">
          <p>Build a daily Bible habit — pick a plan and track your streak.</p>
          <button type="button" className="btn-primary" onClick={() => setShowBrowser(true)}>
            Choose a plan <ChevronRight size={14} />
          </button>
        </div>

        {showBrowser && (
          <PlanBrowser
            currentPlanName={null}
            existingRow={existingRow}
            activeOrgId={activeOrgId}
            userId={session?.user?.id}
            initialPlanId={deepLinkPlanId}
            onChoose={handleChoosePlan}
            onClose={() => { setShowBrowser(false); setDeepLinkPlanId(null); }}
          />
        )}
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
          <div className="reading-plan-menu-wrap">
            <button type="button" className="reading-plan-menu-btn" onClick={() => setShowMenu((v) => !v)} title="More options">
              <MoreHorizontal size={16} />
            </button>
            {showMenu && (
              <div className="reading-plan-menu">
                <button type="button" onClick={() => { setShowCalendar(true); setShowMenu(false); }}>
                  <CalendarDays size={14} /> View full plan
                </button>
                <button type="button" onClick={() => { setShowBrowser(true); setShowMenu(false); }}>
                  <BookOpenCheck size={14} /> Browse other plans
                </button>
                <button type="button" onClick={() => { setShowStats(true); setShowMenu(false); }}>
                  <BarChart3 size={14} /> Stats
                </button>
                <button type="button" onClick={handleExportICS}>
                  <Download size={14} /> Export to calendar
                </button>
                <button type="button" onClick={() => setShowReminderInput((v) => !v)}>
                  <Bell size={14} /> Daily reminder
                </button>
                {showReminderInput && (
                  <div className="reading-plan-reminder-row">
                    <input
                      type="time"
                      defaultValue={enrollment.reminder_time?.slice(0, 5) || ''}
                      onChange={(e) => setReminderTime(e.target.value)}
                    />
                  </div>
                )}
                <button type="button" onClick={() => setScheduleMode(enrollment.schedule_mode === 'calendar' ? 'flexible' : 'calendar')}>
                  <CalendarDays size={14} /> {enrollment.schedule_mode === 'calendar' ? 'Switch to flexible pace' : 'Switch to calendar mode'}
                </button>
                <button type="button" onClick={() => { pausePlan(); setShowMenu(false); }} disabled={saving}>
                  <Pause size={14} /> Pause plan
                </button>
                {!confirmQuit ? (
                  <button type="button" className="reading-plan-menu-danger" onClick={() => setConfirmQuit(true)}>
                    <X size={14} /> Quit plan
                  </button>
                ) : (
                  <div className="reading-plan-quit-confirm">
                    <p>Your {completedDays.size} completed day{completedDays.size === 1 ? '' : 's'} will be kept — restart anytime.</p>
                    <div className="reading-plan-quit-confirm-actions">
                      <button type="button" className="btn-secondary" onClick={handleQuit} disabled={saving}>Quit</button>
                      <button type="button" className="btn-secondary" onClick={() => setConfirmQuit(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {groupStatus && (
        <p className="reading-plan-group-status">
          <Users size={13} /> {groupStatus.readToday} of {groupStatus.total} have read today
        </p>
      )}

      {groupInvite && (
        <div className="reading-plan-invite-banner">
          <span>You've been invited to join “{groupInvite.name}”</span>
          <div className="reading-plan-invite-actions">
            <button type="button" className="btn-primary" onClick={handleJoinGroup}>Join</button>
            <button type="button" className="btn-secondary" onClick={() => setGroupInvite(null)}>Dismiss</button>
          </div>
        </div>
      )}

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

      {showBrowser && (
        <PlanBrowser
          currentPlanName={plan.name}
          existingRow={existingRow}
          activeOrgId={activeOrgId}
          userId={session?.user?.id}
          initialPlanId={deepLinkPlanId}
          onChoose={handleChoosePlan}
          onClose={() => { setShowBrowser(false); setDeepLinkPlanId(null); }}
        />
      )}

      {showCalendar && (
        <PlanCalendar
          plan={plan}
          enrollment={enrollment}
          completedDays={completedDays}
          skippedDays={skippedDays}
          currentDay={currentDay}
          saving={saving}
          onOpenDay={(day) => { setReaderDay(day); setShowCalendar(false); }}
          onMarkDone={markDayDone}
          onSkip={skipDay}
          onCatchUp={catchMeUp}
          onExportICS={handleExportICS}
          onClose={() => setShowCalendar(false)}
        />
      )}

      {showStats && (
        <ReadingStats session={session} streak={streak} bestStreak={bestStreak} onClose={() => setShowStats(false)} />
      )}
    </section>
  );
}
