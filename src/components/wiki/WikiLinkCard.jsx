import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, MapPin, Landmark, Milestone, BookOpen } from 'lucide-react';
import { loadBibleWikiFull, loadChurchTeachers, formatYearRange } from '../../lib/bibleWiki';
import { CODE_TO_NAME } from '../../lib/scripture';
import { passageIdToDisplay } from '../../lib/scripture';
import './WikiLinkCard.css';

const TYPE_ICON = { person: User, place: MapPin, teacher: Landmark, event: Milestone, book: BookOpen };

// Rich unfurl card for wiki links pasted into chat — the in-app sibling of
// LinkPreview. Shows the entry's type, name, and short description.
export default function WikiLinkCard({ slug, section }) {
  const navigate = useNavigate();
  const [entry, setEntry] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (slug.startsWith('book-')) {
        const code = slug.slice(5).toUpperCase();
        const name = CODE_TO_NAME[code];
        if (name && !cancelled) setEntry({ s: slug, type: 'book', name, desc: null });
        return;
      }
      if (section === 'church-history') {
        const teachers = await loadChurchTeachers();
        const t = teachers.bySlug.get(slug);
        if (t && !cancelled) setEntry(t);
        return;
      }
      const wiki = await loadBibleWikiFull();
      const e = wiki.bySlug.get(slug);
      if (e && !cancelled) setEntry(e);
    })();
    return () => { cancelled = true; };
  }, [slug, section]);

  if (!entry) return null;
  const Icon = TYPE_ICON[entry.type] || User;
  const desc = entry.desc || entry.sum || null;
  const meta = entry.type === 'teacher'
    ? [entry.era, formatYearRange(entry.y)].filter(Boolean).join(' · ')
    : entry.type === 'person'
      ? `${entry.vc} verses${entry.fv ? ` · first at ${passageIdToDisplay(entry.fv)}` : ''}`
      : entry.type === 'place'
        ? `${entry.p?.length || 0} chapters`
        : '';

  return (
    <button
      className="wlc-card"
      onClick={() => navigate(section === 'church-history' ? `/church-history/${entry.s}` : `/wiki/${entry.s}`)}
      data-no-scripture
    >
      <span className={`wlc-icon ${entry.type}`}><Icon size={15} /></span>
      <span className="wlc-body">
        <span className="wlc-name">{entry.name}</span>
        {meta && <span className="wlc-meta">{meta}</span>}
        {desc && <span className="wlc-desc">{desc.slice(0, 140)}{desc.length > 140 ? '…' : ''}</span>}
      </span>
    </button>
  );
}
