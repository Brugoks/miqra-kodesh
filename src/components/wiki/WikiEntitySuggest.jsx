import { useState, useEffect, useMemo } from 'react';
import { BookMarked } from 'lucide-react';
import { loadEntityLinkIndex, matchEntitySegments, dispatchWikiEntityOpen } from '../../lib/wikiEntityLinker';
import './WikiSaveObservationModal.css';

// Detects Bible Wiki / Church History names in free text and offers them as
// tappable chips — used under the Q&A ask form so askers discover that the
// wiki may already answer "who was X?" before they post.
export default function WikiEntitySuggest({ text, label = 'From the Bible Wiki:' }) {
  const [index, setIndex] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadEntityLinkIndex().then((idx) => { if (!cancelled) setIndex(idx); });
    return () => { cancelled = true; };
  }, []);

  const entities = useMemo(() => {
    if (!index || !text?.trim()) return [];
    const seen = new Set();
    const out = [];
    for (const seg of matchEntitySegments(text, index)) {
      if (!seg.slug || seen.has(seg.slug)) continue;
      seen.add(seg.slug);
      const entry = index.bySlug.get(seg.slug);
      if (entry) out.push(entry);
      if (out.length >= 5) break;
    }
    return out;
  }, [index, text]);

  if (!entities.length) return null;

  return (
    <div className="wes-strip" data-no-scripture>
      <span className="wes-label"><BookMarked size={13} /> {label}</span>
      {entities.map((entry) => (
        <button
          key={entry.s}
          type="button"
          className="wes-chip"
          onClick={(e) => dispatchWikiEntityOpen(e.currentTarget, entry.s, entry.type, entry.name)}
        >
          {entry.name}
        </button>
      ))}
    </div>
  );
}
