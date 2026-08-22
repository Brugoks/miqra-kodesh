import { useState, useEffect } from 'react';
import { Brain, Eye, Check, RotateCcw, Zap, Trash2, Edit3 } from 'lucide-react';
import './MemoryReview.css';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import { reviewCard } from '../lib/srs';

// Daily verse-memorization review card for the Dashboard. Shows cards whose
// due_at has passed; each review reschedules the card via the SM-2 logic in
// lib/srs.js. Below the active review, the full deck is listed so the card
// space always shows every verse the user is memorizing. Renders nothing
// when the user has no cards at all.

function dueLabel(dueAt) {
  const due = new Date(dueAt);
  const now = new Date();
  if (due <= now) return 'due now';
  const days = Math.ceil((due - now) / 86400000);
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}

export default function MemoryReview({ session }) {
  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && !!userId;
  const [cards, setCards] = useState([]);
  const [queue, setQueue] = useState([]);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(isConfigured);
  const [reviewedToday, setReviewedToday] = useState(0);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isConfigured || !userId) return undefined;
    let cancelled = false;

    const loadCards = () => {
      const nowIso = new Date().toISOString();
      supabase
        .from('memory_verses')
        .select('*')
        .eq('user_id', userId)
        .order('due_at', { ascending: true })
        .then(({ data }) => {
          if (cancelled) return;
          const all = data || [];
          setCards(all);
          setQueue(all.filter((c) => c.due_at <= nowIso).slice(0, 20).map((c) => c.id));
          setLoading(false);
        });
    };

    loadCards();

    const handleUpdated = () => {
      loadCards();
    };

    window.addEventListener('memory-verse:updated', handleUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener('memory-verse:updated', handleUpdated);
    };
  }, [isConfigured, userId]);

  const current = queue.length > 0 ? cards.find((c) => c.id === queue[0]) : null;

  const handleGrade = async (grade) => {
    if (!current || !userId) return;
    const next = reviewCard(current, grade);
    setQueue((prev) => prev.slice(1));
    setCards((prev) => prev.map((c) => (c.id === current.id ? { ...c, ...next } : c)));
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
      .eq('id', current.id)
      .eq('user_id', userId);
  };

  const handleRemove = async (id) => {
    if (!userId) return;
    setQueue((prev) => prev.filter((qid) => qid !== id));
    setCards((prev) => prev.filter((c) => c.id !== id));
    setRevealed(false);
    await supabase.from('memory_verses').delete().eq('id', id).eq('user_id', userId);
    window.dispatchEvent(new CustomEvent('memory-verse:updated'));
  };

  if (!isConfigured || loading || cards.length === 0) return null;

  const deck = [...cards].sort((a, b) => new Date(a.due_at) - new Date(b.due_at));

  return (
    <section className="memory-review card">
      <div className="memory-review-header">
        <h2><Brain size={18} /> Verse Memory</h2>
        <div className="memory-review-actions">
          <span className="memory-review-stats">
            {queue.length > 0
              ? `${queue.length} due · ${cards.length} verse${cards.length === 1 ? '' : 's'} total`
              : `${cards.length} verse${cards.length === 1 ? '' : 's'} total`}
          </span>
          <button
            type="button"
            className={`memory-edit-btn${isEditing ? ' active' : ''}`}
            onClick={() => setIsEditing(!isEditing)}
            title={isEditing ? 'Done editing deck' : 'Edit memory deck'}
          >
            {isEditing ? <><Check size={13} /> Done</> : <><Edit3 size={13} /> Edit</>}
          </button>
        </div>
      </div>

      {!isEditing && !current && (
        <p className="memory-review-done">
          {reviewedToday > 0
            ? `Nice work — ${reviewedToday} verse${reviewedToday === 1 ? '' : 's'} reviewed. Come back when the next review is due.`
            : 'All caught up! No verses due for review right now.'}
        </p>
      )}

      {!isEditing && current && (
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
                <button type="button" className="memory-grade remove" onClick={() => handleRemove(current.id)} title="Stop memorizing this verse">
                  <Trash2 size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="memory-review-deck">
        <p className="memory-review-deck-label">
          {isEditing ? 'Manage deck (tap trash to delete)' : 'In your deck'}
        </p>
        <ul className="memory-deck-list">
          {deck.map((c) => {
            const isDue = new Date(c.due_at) <= new Date();
            const isCurrent = !isEditing && current && c.id === current.id;
            return (
              <li
                key={c.id}
                className={`memory-deck-item${isDue ? ' is-due' : ''}${isCurrent ? ' is-current' : ''}${isEditing ? ' is-editing' : ''}`}
              >
                <span className="memory-deck-ref" title={c.reference}>{c.reference}</span>
                <span className="memory-deck-due">
                  {isCurrent ? 'reviewing' : dueLabel(c.due_at)}
                </span>
                {isEditing && (
                  <button
                    type="button"
                    className="memory-deck-item-delete"
                    onClick={() => handleRemove(c.id)}
                    title={`Delete ${c.reference} from deck`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
