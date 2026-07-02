import { useState, useEffect } from 'react';
import { Brain, Eye, Check, RotateCcw, Zap, Trash2 } from 'lucide-react';
import './MemoryReview.css';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import { reviewCard } from '../lib/srs';

// Daily verse-memorization review card for the Dashboard. Shows cards whose
// due_at has passed; each review reschedules the card via the SM-2 logic in
// lib/srs.js. Renders nothing when the user has no cards at all.

export default function MemoryReview({ session }) {
  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && !!userId;
  const [dueCards, setDueCards] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(isConfigured);
  const [reviewedToday, setReviewedToday] = useState(0);

  useEffect(() => {
    if (!isConfigured) return undefined;
    let cancelled = false;
    const nowIso = new Date().toISOString();
    Promise.all([
      supabase
        .from('memory_verses')
        .select('*')
        .lte('due_at', nowIso)
        .order('due_at', { ascending: true })
        .limit(20),
      supabase
        .from('memory_verses')
        .select('id', { count: 'exact', head: true }),
    ]).then(([{ data: due }, { count }]) => {
      if (cancelled) return;
      setDueCards(due || []);
      setTotalCount(count || 0);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isConfigured]);

  const current = dueCards[0] || null;

  const handleGrade = async (grade) => {
    if (!current) return;
    const next = reviewCard(current, grade);
    setDueCards((prev) => prev.slice(1));
    setRevealed(false);
    setReviewedToday((n) => n + 1);
    await supabase
      .from('memory_verses')
      .update({
        repetitions: next.repetitions,
        interval_days: next.interval_days,
        ease: next.ease,
        due_at: next.due_at,
        last_reviewed: new Date().toISOString(),
      })
      .eq('id', current.id);
  };

  const handleRemove = async () => {
    if (!current) return;
    setDueCards((prev) => prev.slice(1));
    setRevealed(false);
    setTotalCount((n) => Math.max(0, n - 1));
    await supabase.from('memory_verses').delete().eq('id', current.id);
  };

  if (!isConfigured || loading || totalCount === 0) return null;

  return (
    <section className="memory-review card">
      <div className="memory-review-header">
        <h2><Brain size={18} /> Verse Memory</h2>
        <span className="memory-review-stats">
          {dueCards.length > 0
            ? `${dueCards.length} due · ${totalCount} verse${totalCount === 1 ? '' : 's'} total`
            : `${totalCount} verse${totalCount === 1 ? '' : 's'} total`}
        </span>
      </div>

      {!current && (
        <p className="memory-review-done">
          {reviewedToday > 0
            ? `Nice work — ${reviewedToday} verse${reviewedToday === 1 ? '' : 's'} reviewed. Come back when the next review is due.`
            : 'All caught up! No verses due for review right now.'}
        </p>
      )}

      {current && (
        <div className="memory-review-card">
          <p className="memory-review-ref">{current.reference}</p>
          {!revealed ? (
            <>
              <p className="memory-review-prompt">Recite it from memory, then check yourself.</p>
              <button type="button" className="btn-primary memory-review-reveal" onClick={() => setRevealed(true)}>
                <Eye size={15} /> Show verse
              </button>
            </>
          ) : (
            <>
              <blockquote className="memory-review-text">
                {current.verse_text}
                {current.translation && <cite> — {current.translation}</cite>}
              </blockquote>
              <div className="memory-review-grades">
                <button type="button" className="memory-grade again" onClick={() => handleGrade('again')}>
                  <RotateCcw size={14} /> Again
                </button>
                <button type="button" className="memory-grade good" onClick={() => handleGrade('good')}>
                  <Check size={14} /> Good
                </button>
                <button type="button" className="memory-grade easy" onClick={() => handleGrade('easy')}>
                  <Zap size={14} /> Easy
                </button>
                <button type="button" className="memory-grade remove" onClick={handleRemove} title="Stop memorizing this verse">
                  <Trash2 size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
