import { useState } from 'react';
import { Brain, Check, Loader2 } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';
import { refToPassageIds } from '../../lib/scripture';

const openScripture = (ref) =>
  window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref } }));

// Key verses for a wiki entry with one-tap "memorize" — saves into the same
// memory_verses deck the SRS review (MemoryReview) drills, using the same
// fetch-and-clean flow as DailyReading's suggestion.
export default function WikiMemoryVerses({ session, entry }) {
  const [saveState, setSaveState] = useState({}); // ref -> 'saving' | 'saved' | 'error'
  const refs = entry.kv || [];
  const canSave = hasSupabaseConfig && !!session?.user?.id;

  if (!refs.length) return null;

  const memorize = async (ref) => {
    if (!canSave || saveState[ref] === 'saving' || saveState[ref] === 'saved') return;
    setSaveState((prev) => ({ ...prev, [ref]: 'saving' }));
    try {
      const passageIds = refToPassageIds(ref);
      if (!passageIds.length) throw new Error('bad ref');
      const { data, error } = await supabase.functions.invoke('bible-proxy', {
        body: { bibleId: 'a761ca71e0b3ddcf-01', passageId: passageIds[0] },
      });
      if (error || !data?.data?.content) throw new Error('No content');
      const cleanText = data.data.content.replace(/\[\d+(?::\d+)?]\s*/g, '').replace(/\s+/g, ' ').trim();
      const { error: upsertErr } = await supabase.from('memory_verses').upsert({
        user_id: session.user.id,
        reference: ref,
        verse_text: cleanText,
        translation: 'NASB',
      }, { onConflict: 'user_id,reference', ignoreDuplicates: true });
      if (upsertErr) throw upsertErr;
      setSaveState((prev) => ({ ...prev, [ref]: 'saved' }));
      window.dispatchEvent(new CustomEvent('memory-verse:updated'));
    } catch {
      setSaveState((prev) => ({ ...prev, [ref]: 'error' }));
    }
  };

  return (
    <section className="wmv-section">
      <h2 className="bw-section-title"><Brain size={15} /> Verses worth carrying</h2>
      <p className="bw-section-hint">
        Key verses from {entry.name}'s story — add one to your memory deck and it joins your daily review.
      </p>
      <ul className="wmv-list">
        {refs.map((ref) => (
          <li key={ref} className="wmv-item">
            <button className="bw-ref-chip" onClick={() => openScripture(ref)}>{ref}</button>
            {canSave && (
              <button
                className={`wmv-memorize ${saveState[ref] || ''}`}
                onClick={() => memorize(ref)}
                disabled={saveState[ref] === 'saving' || saveState[ref] === 'saved'}
              >
                {saveState[ref] === 'saving' && <><Loader2 size={13} className="wv-spin" /> Saving…</>}
                {saveState[ref] === 'saved' && <><Check size={13} /> In your deck</>}
                {saveState[ref] === 'error' && 'Try again'}
                {!saveState[ref] && <><Brain size={13} /> Memorize</>}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
