import { useState, useEffect, useMemo } from 'react';
import { User, MapPin, Sparkles } from 'lucide-react';
import { loadBibleWiki, buildChapterIndex, entitiesForChapters } from '../../lib/bibleWiki';
import { dispatchWikiEntityOpen } from '../../lib/wikiEntityLinker';

// "Meet the cast" — the people and places present in a set of chapters,
// derived from the wiki's chapter index. Used by the daily reading (today's
// chapters) and the Bible Lookup panel (the looked-up chapter). Tapping a
// chip opens the app-wide entity peek popover; first appearances in Scripture
// get a spark badge.
let chapterIndexPromise = null;
function loadChapterIndex() {
  if (!chapterIndexPromise) {
    chapterIndexPromise = loadBibleWiki().then((wiki) => buildChapterIndex(wiki.entries));
  }
  return chapterIndexPromise;
}

export default function WikiCastStrip({ chapters, title = 'Meet the cast', limit = 10, compact = false }) {
  const [chapterIndex, setChapterIndex] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadChapterIndex().then((idx) => { if (!cancelled) setChapterIndex(idx); });
    return () => { cancelled = true; };
  }, []);

  const cast = useMemo(() => {
    if (!chapterIndex || !chapters?.length) return [];
    return entitiesForChapters(chapterIndex, chapters).filter(({ entry }) => entry.s !== 'god_1324');
  }, [chapterIndex, chapters]);

  if (!cast.length) return null;
  const shown = expanded ? cast : cast.slice(0, limit);
  const firstTimers = cast.filter((c) => c.firstHere);

  return (
    <div className={`wcs-strip ${compact ? 'compact' : ''}`} data-no-scripture>
      <span className="wcs-title">{title}</span>
      {!compact && firstTimers.length > 0 && (
        <span className="wcs-first-note">
          <Sparkles size={12} /> {firstTimers.length === 1
            ? `You meet ${firstTimers[0].entry.name} for the first time here.`
            : `${firstTimers.length} figures make their first appearance here.`}
        </span>
      )}
      <span className="wcs-chips">
        {shown.map(({ entry, firstHere }) => (
          <button
            key={entry.s}
            className={`wcs-chip ${entry.type} ${firstHere ? 'first' : ''}`}
            onClick={(e) => dispatchWikiEntityOpen(e.currentTarget, entry.s, entry.type, entry.name)}
          >
            {entry.type === 'place' ? <MapPin size={11} /> : <User size={11} />}
            {entry.name}
            {firstHere && <Sparkles size={11} className="wcs-spark" />}
          </button>
        ))}
        {cast.length > limit && (
          <button className="wcs-chip wcs-more" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Show less' : `+${cast.length - limit} more`}
          </button>
        )}
      </span>
    </div>
  );
}
