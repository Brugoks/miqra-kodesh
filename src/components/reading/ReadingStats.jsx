import { useState, useEffect } from 'react';
import { X, Flame, BookOpen } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';
import { getHeatmapDays, getLifetimeBooksProgress } from '../../lib/readingPlans';
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
// "collectible" view of the habit, opened from the card's menu.
export default function ReadingStats({ session, streak, bestStreak, onClose }) {
  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && !!userId;
  const [loading, setLoading] = useState(isConfigured);
  const [heatmap, setHeatmap] = useState([]);
  const [books, setBooks] = useState([]);
  const [totalChapters, setTotalChapters] = useState(0);

  useEffect(() => {
    if (!isConfigured) return;
    supabase
      .from('reading_plan_progress')
      .select('plan_id, day, completed_at, skipped')
      .order('completed_at', { ascending: false })
      .limit(5000)
      .then(({ data }) => {
        const rows = (data || []).filter((r) => !r.skipped);
        setHeatmap(getHeatmapDays(rows.map((r) => r.completed_at)));
        const progress = getLifetimeBooksProgress(rows.map((r) => ({ plan_id: r.plan_id, day: r.day })));
        setBooks(progress);
        setTotalChapters(progress.reduce((sum, b) => sum + b.read, 0));
        setLoading(false);
      });
  }, [isConfigured, userId]);

  const weeks = [];
  for (let i = 0; i < heatmap.length; i += 7) weeks.push(heatmap.slice(i, i + 7));

  return (
    <div className="rs-overlay" onClick={onClose}>
      <div className="rs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rs-header">
          <h2>Reading Stats</h2>
          <button type="button" className="rs-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

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
              <span className="rs-total-value">{totalChapters}</span>
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
              <p className="rs-section-label">Last 12 weeks</p>
              <div className="rs-heatmap">
                {weeks.map((week, wi) => (
                  <div key={wi} className="rs-heatmap-col">
                    {week.map((d, di) => (
                      <div
                        key={di}
                        className={`rs-heatmap-cell rs-heat-${heatLevel(d.count)}`}
                        title={`${MONTH_LABELS[d.date.getMonth()]} ${d.date.getDate()} — ${d.count} day${d.count === 1 ? '' : 's'} read`}
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
                  <div key={b.code} className={`rs-book-cell ${b.done ? 'done' : b.read > 0 ? 'partial' : ''}`} title={`${b.name}: ${b.read}/${b.total} chapters`}>
                    {b.code}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
