import { useState, useEffect } from 'react';
import {
  BookOpenCheck, Flame, Check, CalendarDays, BarChart3, Bell,
  Pause, Play, Download, Users, X, RefreshCw,
} from 'lucide-react';
import './ReadingPlanPage.css';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import { READING_PLANS, getPlan, getPlanReadings, getPaceStatus, dateForDay } from '../lib/readingPlans';
import { downloadPlanICS } from '../lib/calendarExport';
import { joinReadingGroup, getGroupTodayStatus } from '../lib/readingGroups';
import { useReadingPlan } from './reading/useReadingPlan';
import { pushPermission } from '../lib/push';
import PlanBrowser from './reading/PlanBrowser';
import PlanCalendar from './reading/PlanCalendar';
import DailyReading from './reading/DailyReading';
import ReadingStats from './reading/ReadingStats';

// The dedicated Reading Plan page (left-nav "Reading Plan"): everything the
// Dashboard card doesn't have room for — browsing/switching plans, the full
// plan calendar with missed-day recovery, lifetime stats, reminders, and
// group reading. The Dashboard card stays a lightweight "today" widget that
// links here for anything beyond today's reading.
export default function ReadingPlanPage({ session, activeOrgId }) {
  const {
    loading, saving, enrollment, pausedEnrollment, plan, pausedPlan,
    completedDays, skippedDays, streak, bestStreak, pendingMilestones, clearMilestones,
    currentDay, finished, existingRow, startPlan, reenrollPlan, pausePlan, resumePlan, quitPlan,
    markDayDone, skipDay, catchMeUp, setScheduleMode, setReminderTime,
  } = useReadingPlan(session);

  const [readerDay, setReaderDay] = useState(null);
  const [deepLinkPlanId, setDeepLinkPlanId] = useState(null);
  const [extraPlans, setExtraPlans] = useState([]);
  const [groupInvite, setGroupInvite] = useState(null);
  const [groupStatus, setGroupStatus] = useState(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [showReminderInput, setShowReminderInput] = useState(false);
  const reminderDelivery = pushPermission();

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    const params = new URLSearchParams(window.location.search);
    const groupParam = params.get('group');
    const planParam = params.get('plan');
    if (groupParam) {
      supabase.from('reading_plan_groups').select('*').eq('id', groupParam).maybeSingle()
        .then(({ data }) => { if (data) setGroupInvite(data); });
    } else if (planParam?.startsWith('wiki-')) {
      // Character plans from the Bible Wiki ("Read the life of David") are
      // registered at runtime — resolve, surface in the browser, preselect.
      import('../lib/bibleWiki').then(async ({ ensureWikiPlans }) => {
        await ensureWikiPlans();
        const wikiPlan = getPlan(planParam);
        if (wikiPlan) {
          setExtraPlans([wikiPlan]);
          setDeepLinkPlanId(planParam);
        }
      }).catch(() => {});
    } else if (planParam) {
      Promise.resolve().then(() => setDeepLinkPlanId(planParam));
    }
  }, []);

  useEffect(() => {
    if (enrollment?.group_id) {
      getGroupTodayStatus({ groupId: enrollment.group_id, planId: enrollment.plan_id }).then(setGroupStatus);
    } else {
      Promise.resolve().then(() => setGroupStatus(null));
    }
  }, [enrollment?.group_id, enrollment?.plan_id, completedDays.size]);

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
    setDeepLinkPlanId(null);
  };

  const handleJoinGroup = async () => {
    if (!groupInvite || !session?.user?.id) return;
    await joinReadingGroup({ groupId: groupInvite.id, userId: session.user.id });
    setGroupInvite(null);
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
  };

  const handleQuit = async () => {
    await quitPlan();
    setConfirmQuit(false);
  };

  if (!hasSupabaseConfig) {
    return (
      <div className="rp-page">
        <section className="rp-header card">
          <div className="rp-title"><BookOpenCheck size={34} /><div><h1>Reading Plan</h1></div></div>
        </section>
        <p>Reading plans require Supabase to be configured.</p>
      </div>
    );
  }

  if (loading) return null;

  return (
    <div className="rp-page">
      <section className="rp-header card">
        <div className="rp-title">
          <BookOpenCheck size={34} />
          <div>
            <h1>Reading Plan</h1>
            <p>{plan ? plan.name : 'Build a daily Bible habit and track your progress.'}</p>
          </div>
        </div>
        {plan && streak > 0 && (
          <span className="rp-streak" title={`Best streak: ${bestStreak}`}>
            <Flame size={16} /> {streak}-day streak
          </span>
        )}
      </section>

      {pausedEnrollment && pausedPlan && (!plan || pausedPlan.id !== plan.id) && (
        <div className="rp-banner card">
          <span>“{pausedPlan.name}” is paused</span>
          <button type="button" className="btn-secondary" onClick={resumePlan} disabled={saving}>
            <Play size={13} /> Resume
          </button>
        </div>
      )}

      {groupInvite && (
        <div className="rp-banner card">
          <span>You've been invited to join “{groupInvite.name}”</span>
          <div className="rp-banner-actions">
            <button type="button" className="btn-primary" onClick={handleJoinGroup}>Join</button>
            <button type="button" className="btn-secondary" onClick={() => setGroupInvite(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {pendingMilestones.length > 0 && (
        <div className="rp-milestone-toast card" role="status" aria-live="polite">
          {pendingMilestones.map((m) => <span key={`${m.type}-${m.value}`}>🎉 {m.label}</span>)}
          <button type="button" onClick={clearMilestones} aria-label="Dismiss"><X size={13} /></button>
        </div>
      )}

      {plan ? (
        <>
          <section className="rp-today card">
            <div className="rp-today-header">
              <h2>Today</h2>
              {groupStatus && (
                <span className="rp-group-status"><Users size={13} /> {groupStatus.readToday} of {groupStatus.total} have read today</span>
              )}
            </div>

            {finished ? (
              <p className="rp-finished">🎉 Plan complete — all {plan.days} days done! Choose a new plan below any time.</p>
            ) : (
              <>
                <div className="rp-progressbar" role="progressbar" aria-valuenow={completedDays.size} aria-valuemin={0} aria-valuemax={plan.days}>
                  <div className="rp-progressfill" style={{ width: `${Math.round((completedDays.size / plan.days) * 100)}%` }} />
                </div>
                <p className="rp-day">
                  Day {currentDay} of {plan.days}
                  {enrollment.schedule_mode === 'flexible' && (() => {
                    const pace = getPaceStatus(enrollment, currentDay, plan);
                    return pace.delta !== 0 && (
                      <span className="rp-pace"> · {pace.delta > 0 ? `${pace.delta} day${pace.delta === 1 ? '' : 's'} ahead 🎯` : 'at your own pace'}</span>
                    );
                  })()}
                </p>
                <div className="rp-readings">
                  {getPlanReadings(plan, currentDay).map((reading) => (
                    <button key={reading.label} type="button" className="rp-chip" onClick={() => window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref: reading.ref } }))}>
                      {reading.label}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn-primary rp-start-btn" onClick={() => setReaderDay(currentDay)}>
                  <BookOpenCheck size={15} /> Start today's reading
                </button>
                <button type="button" className="rp-manual-done" onClick={() => markDayDone(currentDay)} disabled={saving}>
                  <Check size={13} /> Already read it — mark day {currentDay} done
                </button>
              </>
            )}
          </section>

          <section className="rp-actions card">
            <h2>Manage</h2>
            <div className="rp-actions-row">
              <button type="button" className="btn-secondary" onClick={handleExportICS}>
                <Download size={14} /> Export to calendar
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowReminderInput((v) => !v)}>
                <Bell size={14} /> {enrollment.reminder_time ? `Reminder · ${enrollment.reminder_time.slice(0, 5)}` : 'Daily reminder'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setScheduleMode(enrollment.schedule_mode === 'calendar' ? 'flexible' : 'calendar')}>
                <CalendarDays size={14} /> {enrollment.schedule_mode === 'calendar' ? 'Switch to flexible pace' : 'Switch to calendar mode'}
              </button>
              <button type="button" className="btn-secondary" onClick={pausePlan} disabled={saving}>
                <Pause size={14} /> Pause plan
              </button>
              {!confirmQuit ? (
                <button type="button" className="btn-secondary rp-danger" onClick={() => setConfirmQuit(true)}>
                  <X size={14} /> Quit plan
                </button>
              ) : (
                <span className="rp-quit-confirm">
                  Keep your {completedDays.size} completed day{completedDays.size === 1 ? '' : 's'}?
                  <button type="button" className="btn-secondary" onClick={handleQuit} disabled={saving}>Quit</button>
                  <button type="button" className="btn-secondary" onClick={() => setConfirmQuit(false)}>Cancel</button>
                </span>
              )}
            </div>
            {showReminderInput && (
              <div className="rp-reminder-row">
                <label htmlFor="rp-reminder-time">Remind me daily at</label>
                <input
                  id="rp-reminder-time"
                  type="time"
                  defaultValue={enrollment.reminder_time?.slice(0, 5) || ''}
                  onChange={(e) => setReminderTime(e.target.value)}
                />
                <span className={`rp-reminder-delivery ${reminderDelivery}`}>
                  {reminderDelivery === 'granted'
                    ? 'Browser delivery is on.'
                    : 'Saved in your inbox. Browser delivery is off.'}
                  <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('notifications:open-settings'))}>Manage delivery</button>
                </span>
              </div>
            )}
          </section>

          <section className="rp-section card">
            <h2><CalendarDays size={16} /> Plan Calendar</h2>
            <PlanCalendar
              plan={plan}
              enrollment={enrollment}
              completedDays={completedDays}
              skippedDays={skippedDays}
              currentDay={currentDay}
              saving={saving}
              embedded
              onOpenDay={(day) => setReaderDay(day)}
              onMarkDone={markDayDone}
              onSkip={skipDay}
              onCatchUp={catchMeUp}
              onExportICS={handleExportICS}
            />
          </section>

          <section className="rp-section card">
            <h2><BarChart3 size={16} /> Stats</h2>
            <ReadingStats session={session} streak={streak} bestStreak={bestStreak} embedded />
          </section>

          <section className="rp-section card">
            <div className="rp-browse-header">
              <h2><RefreshCw size={16} /> Browse other plans</h2>
            </div>
            <PlanBrowser
              plans={extraPlans.length ? [...READING_PLANS, ...extraPlans] : READING_PLANS}
              currentPlanName={plan.name}
              existingRow={existingRow}
              activeOrgId={activeOrgId}
              userId={session?.user?.id}
              initialPlanId={deepLinkPlanId}
              embedded
              onChoose={handleChoosePlan}
            />
          </section>
        </>
      ) : (
        <section className="rp-section card">
          <h2>Choose a Plan</h2>
          <PlanBrowser
            plans={extraPlans.length ? [...READING_PLANS, ...extraPlans] : READING_PLANS}
            currentPlanName={null}
            existingRow={existingRow}
            activeOrgId={activeOrgId}
            userId={session?.user?.id}
            initialPlanId={deepLinkPlanId}
            embedded
            onChoose={handleChoosePlan}
          />
        </section>
      )}

      {readerDay != null && plan && (
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
    </div>
  );
}
