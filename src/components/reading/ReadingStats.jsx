import { useState, useEffect } from 'react';
import { X, Flame, BookOpen } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';
import { getHeatmapDays, getPlan } from '../../lib/readingPlans';
import { refToPassageIds } from '../../lib/scripture';
import {
  passageIdsToChapters,
  backfillLookupEngagement,
  getEngagedBooksProgress,
  parseLocalDate,
} from '../../lib/scriptureEngagement';
import './ReadingStats.css';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function heatLevel(count) {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return 3;
}

// Lifetime reading stats: a 12-week completion heatmap and a 66-book
// progress map that fills in across every plan ever read — the long-range,
// "collectible" view of the habit. `embedded` renders inline on the Reading
// Plan page instead of as a modal.
export default function ReadingStats({ session, streak, bestStreak, embedded = false, onClose }) {
  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && !!userId;
  const [loading, setLoading] = useState(isConfigured);
  const [planProgressRows, setPlanProgressRows] = useState([]);
  const [engagementRows, setEngagementRows] = useState([]);
  const [heatmapSource, setHeatmapSource] = useState('all');
  const [reflections, setReflections] = useState([]);

  useEffect(() => {
    if (!isConfigured) return;

    const run = async () => {
      setLoading(true);
      try {
        await backfillLookupEngagement(userId, (ref) => passageIdsToChapters(refToPassageIds(ref)));
      } catch (err) {
        console.error('[backfill] failed:', err);
      }

      const [{ data: progressData }, { data: engagementData }, { data: reflectionsData }] = await Promise.all([
        supabase
          .from('reading_plan_progress')
          .select('plan_id, day, completed_at, skipped')
          .order('completed_at', { ascending: false })
          .limit(5000),
        supabase
          .from('scripture_engagement')
          .select('book, chapter, source, engaged_on')
          .limit(10000),
        supabase
          .from('reading_plan_reflections')
          .select('id, plan_id, day, content, created_at')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      setPlanProgressRows((progressData || []).filter((r) => !r.skipped));
      setEngagementRows(engagementData || []);
      setReflections(reflectionsData || []);
      setLoading(false);
    };

    run();
  }, [isConfigured, userId]);

  const lookupChapterIds = engagementRows
    .filter((r) => r.source === 'lookup')
    .map((r) => `${r.book}.${r.chapter}`);

  const books = getEngagedBooksProgress(
    planProgressRows.map((r) => ({ plan_id: r.plan_id, day: r.day })),
    lookupChapterIds
  );

  const totalPlanChapters = books.reduce((sum, b) => sum + b.planRead, 0);

  let heatmapDatums = [];
  if (heatmapSource === 'all') {
    heatmapDatums = [
      ...planProgressRows.map((r) => r.completed_at),
      ...engagementRows.filter((r) => r.source === 'lookup').map((r) => parseLocalDate(r.engaged_on)),
    ];
  } else if (heatmapSource === 'plan') {
    heatmapDatums = planProgressRows.map((r) => r.completed_at);
  } else if (heatmapSource === 'lookup') {
    heatmapDatums = engagementRows.filter((r) => r.source === 'lookup').map((r) => parseLocalDate(r.engaged_on));
  }
  const heatmap = getHeatmapDays(heatmapDatums);

  const weeks = [];
  for (let i = 0; i < heatmap.length; i += 7) weeks.push(heatmap.slice(i, i + 7));

  const body = (
    <div className="rs-body">
      <div className="rs-totals">
        <div className="rs-total-item">
          <Flame size={16} />
          <span className="rs-total-value">{streak}</span>
          <span className="rs-total-label">current streak</span>
        </div>
        <div className="rs-total-item">
          <Flame size={16} />
          <span className="rs-total-value">{bestStreak}</span>
          <span className="rs-total-label">best streak</span>
        </div>
        <div className="rs-total-item">
          <BookOpen size={16} />
          <span className="rs-total-value">{totalPlanChapters}</span>
          <span className="rs-total-label">chapters read</span>
        </div>
        <div className="rs-total-item">
          <BookOpen size={16} />
          <span className="rs-total-value">{books.filter((b) => b.done).length}</span>
          <span className="rs-total-label">books finished</span>
        </div>
      </div>

      {!loading && heatmap.length > 0 && (
        <div className="rs-heatmap-wrap">
          <div className="rs-heatmap-header">
            <p className="rs-section-label">Last 12 weeks</p>
            <div className="rs-toggle-container">
              <button
                type="button"
                className={`rs-chip ${heatmapSource === 'all' ? 'active' : ''}`}
                onClick={() => setHeatmapSource('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`rs-chip ${heatmapSource === 'plan' ? 'active' : ''}`}
                onClick={() => setHeatmapSource('plan')}
              >
                Plans
              </button>
              <button
                type="button"
                className={`rs-chip ${heatmapSource === 'lookup' ? 'active' : ''}`}
                onClick={() => setHeatmapSource('lookup')}
              >
                Lookups
              </button>
            </div>
          </div>
          <div className="rs-heatmap">
            {weeks.map((week, wi) => (
              <div key={wi} className="rs-heatmap-col">
                {week.map((d, di) => (
                  <div
                    key={di}
                    className={`rs-heatmap-cell rs-heat-${heatLevel(d.count)}`}
                    title={`${MONTH_LABELS[d.date.getMonth()]} ${d.date.getDate()} — ${d.count} chapter${d.count === 1 ? '' : 's'} engaged`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && (
        <div className="rs-books-wrap">
          <p className="rs-section-label">Books of the Bible</p>
          <div className="rs-books-grid">
            {books.map((b) => (
              <div
                key={b.code}
                className={`rs-book-cell ${
                  b.done ? 'done' : b.exploredOnly ? 'explored' : b.planRead > 0 ? 'partial' : ''
                }`}
                title={`${b.name}: ${b.planRead}/${b.total} via plans · ${b.engaged - b.planRead} explored`}
              >
                {b.code}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && reflections.length > 0 && (
        <div className="rs-reflections-wrap">
          <p className="rs-section-label">My Reflections</p>
          <div className="rs-reflections-list">
            {reflections.map((ref) => (
              <div key={ref.id || `${ref.plan_id}-${ref.day}`} className="rs-reflection-card">
                <div className="rs-reflection-meta">
                  <span className="rs-reflection-plan">{getPlan(ref.plan_id)?.name || ref.plan_id}</span>
                  <span className="rs-reflection-day">Day {ref.day}</span>
                </div>
                <p className="rs-reflection-content">{ref.content}</p>
                <span className="rs-reflection-date">
                  {new Date(ref.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return <div className="rs-embedded">{body}</div>;
  }

  return (
    <div className="rs-overlay" onClick={onClose}>
      <div className="rs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rs-header">
          <h2>Reading Stats</h2>
          <button type="button" className="rs-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        {body}
      </div>
    </div>
  );
}
