import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Minus, Download, BookOpen } from 'lucide-react';
import { getPlanReadings, dateForDay, getMissedDays } from '../../lib/readingPlans';
import './PlanCalendar.css';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_FMT = { month: 'long', year: 'numeric' };

function rawDayForDate(enrollment, date) {
  const started = new Date(enrollment.started_at);
  const s = new Date(started.getFullYear(), started.getMonth(), started.getDate());
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((d - s) / 86400000) + 1;
}

function monthCells(viewMonth) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(year, month, d));
  return cells;
}

// Full-plan graphical view: a real month grid in calendar mode (pinned
// dates), or a numbered day grid in flexible mode. Tapping any day opens a
// small sheet to read, mark done, or skip it — past or future, not just
// "today". This is what makes missed days recoverable instead of just lost.
// `embedded` renders inline on the Reading Plan page instead of as a modal.
export default function PlanCalendar({ plan, enrollment, completedDays, skippedDays, currentDay, onOpenDay, onMarkDone, onSkip, onCatchUp, onExportICS, saving, embedded = false, onClose }) {
  const isCalendarMode = enrollment.schedule_mode === 'calendar';
  const [viewMonth, setViewMonth] = useState(() => {
    const d = isCalendarMode ? dateForDay(enrollment, currentDay) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [openDay, setOpenDay] = useState(null);

  const resolvedDays = new Set([...completedDays, ...skippedDays]);
  const missed = isCalendarMode ? getMissedDays(enrollment, resolvedDays, plan, new Date()) : [];
  const missedSet = new Set(missed.map((m) => m.day));

  const dayState = (day) => {
    if (completedDays.has(day)) return 'completed';
    if (skippedDays.has(day)) return 'skipped';
    if (day === currentDay) return 'today';
    if (isCalendarMode && missedSet.has(day)) return 'missed';
    return 'future';
  };

  const sheet = openDay != null && (
    <div className="pc-sheet">
      <div className="pc-sheet-header">
        <span className="pc-sheet-day">Day {openDay}</span>
        <button type="button" className="pc-sheet-close" onClick={() => setOpenDay(null)} aria-label="Close"><X size={16} /></button>
      </div>
      <div className="pc-sheet-chips">
        {getPlanReadings(plan, openDay).map((r) => <span key={r.label} className="pc-sheet-chip">{r.label}</span>)}
      </div>
      <div className="pc-sheet-actions">
        <button type="button" className="btn-primary" onClick={() => { onOpenDay(openDay); setOpenDay(null); }}>
          <BookOpen size={14} /> Read this day
        </button>
        {!completedDays.has(openDay) && (
          <button type="button" className="btn-secondary" onClick={() => { onMarkDone(openDay); setOpenDay(null); }} disabled={saving}>
            <Check size={14} /> Mark done
          </button>
        )}
        {isCalendarMode && !completedDays.has(openDay) && !skippedDays.has(openDay) && (
          <button type="button" className="btn-secondary" onClick={() => { onSkip(openDay); setOpenDay(null); }} disabled={saving}>
            <Minus size={14} /> Skip
          </button>
        )}
      </div>
    </div>
  );

  const body = (
    <>
      {!embedded && (
        <div className="pc-header">
          <h2>{plan.name}</h2>
          <div className="pc-header-actions">
            <button type="button" className="pc-icon-btn" onClick={onExportICS} title="Export to calendar">
              <Download size={16} />
            </button>
            <button type="button" className="pc-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </div>
      )}

      {isCalendarMode && missed.length > 0 && (
        <div className="pc-missed-banner">
          <span>{missed.length} day{missed.length === 1 ? '' : 's'} to revisit</span>
          <button type="button" className="pc-catchup-btn" onClick={onCatchUp} disabled={saving}>
            Catch me up
          </button>
        </div>
      )}

      <div className="pc-body">
        {isCalendarMode ? (
          <>
            <div className="pc-month-nav">
              <button type="button" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} aria-label="Previous month">
                <ChevronLeft size={16} />
              </button>
              <span>{viewMonth.toLocaleDateString(undefined, MONTH_FMT)}</span>
              <button type="button" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} aria-label="Next month">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="pc-weekdays">
              {WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}
            </div>
            <div className="pc-grid pc-grid-month">
              {monthCells(viewMonth).map((date, i) => {
                if (!date) return <span key={i} className="pc-cell pc-cell-empty" />;
                const raw = rawDayForDate(enrollment, date);
                const inPlan = raw >= 1 && raw <= plan.days;
                return (
                  <button
                    key={i}
                    type="button"
                    className={`pc-cell ${inPlan ? `pc-state-${dayState(raw)}` : 'pc-cell-outside'}`}
                    disabled={!inPlan}
                    onClick={() => inPlan && setOpenDay(raw)}
                    title={inPlan ? `Day ${raw}` : ''}
                  >
                    <span className="pc-cell-date">{date.getDate()}</span>
                    {inPlan && dayState(raw) === 'completed' && <Check size={11} className="pc-cell-icon" />}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="pc-grid pc-grid-days">
            {Array.from({ length: plan.days }, (_, i) => i + 1).map((day) => (
              <button
                key={day}
                type="button"
                className={`pc-cell pc-state-${dayState(day)}`}
                onClick={() => setOpenDay(day)}
                title={`Day ${day}`}
              >
                <span className="pc-cell-date">{day}</span>
                {dayState(day) === 'completed' && <Check size={11} className="pc-cell-icon" />}
              </button>
            ))}
          </div>
        )}
        <p className="pc-summary">{completedDays.size} of {plan.days} days read</p>
      </div>

      {sheet}
    </>
  );

  // Embedded mode skips the modal chrome (title/export/close) — the host
  // page supplies its own section heading and export action.
  if (embedded) {
    return <div className="pc-embedded">{body}</div>;
  }

  return (
    <div className="pc-overlay" onClick={onClose}>
      <div className="pc-modal" onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>
  );
}
