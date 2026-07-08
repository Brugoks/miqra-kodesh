import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User, MapPin, Landmark, X } from 'lucide-react';
import { loadEntityLinkIndex } from '../../lib/wikiEntityLinker';
import { passageIdToDisplay } from '../../lib/scripture';
import { formatYear } from '../../lib/bibleWiki';
import './WikiEntityPeek.css';

const TYPE_ICON = { person: User, place: MapPin, teacher: Landmark };
const CARD_WIDTH = 280;
const CARD_HEIGHT_ESTIMATE = 100;
const MARGIN = 8;

function metaLine(entry) {
  if (entry.type === 'person') {
    const first = entry.fv ? passageIdToDisplay(entry.fv) : null;
    return `${entry.vc} verse${entry.vc === 1 ? '' : 's'}${first ? ` · first at ${first}` : ''}`;
  }
  if (entry.type === 'place') {
    return `${entry.p.length} chapter${entry.p.length === 1 ? '' : 's'}`;
  }
  // teacher
  const lived = entry.y
    ? (entry.y[0] === entry.y[1] ? formatYear(entry.y[0]) : [formatYear(entry.y[0]), formatYear(entry.y[1])].filter(Boolean).join(' – '))
    : null;
  return [entry.era, lived].filter(Boolean).join(' · ');
}

// App-wide preview popover for Bible Wiki / Church History names linked by
// the WikiEntityLinker DOM scanner. Mount once near the app root.
// Keyed-by-pathname wrapper so navigating away resets any open popover by
// remounting, rather than syncing state to a route change imperatively.
export default function WikiEntityPeek() {
  const location = useLocation();
  return <WikiEntityPeekSession key={location.pathname} />;
}

function WikiEntityPeekSession() {
  const [peek, setPeek] = useState(null); // { entry, rect }
  const cardRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onOpen = async (e) => {
      const { slug, rect } = e.detail || {};
      if (!slug) return;
      const index = await loadEntityLinkIndex();
      const entry = index.bySlug.get(slug);
      if (entry) setPeek({ entry, rect });
    };
    window.addEventListener('wiki-entity:open', onOpen);
    return () => window.removeEventListener('wiki-entity:open', onOpen);
  }, []);

  useEffect(() => {
    if (!peek) return undefined;
    const dismiss = (e) => {
      if (e.type === 'keydown') {
        if (e.key === 'Escape') setPeek(null);
        return;
      }
      if (cardRef.current && !cardRef.current.contains(e.target)) setPeek(null);
    };
    const onScroll = () => setPeek(null);
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', dismiss);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', dismiss);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [peek]);

  if (!peek) return null;
  const { entry, rect } = peek;
  const Icon = TYPE_ICON[entry.type] || User;
  const targetPath = entry.type === 'teacher' ? `/church-history/${entry.s}` : `/wiki/${entry.s}`;

  const left = Math.min(Math.max(rect.left, MARGIN), window.innerWidth - CARD_WIDTH - MARGIN);
  const fitsBelow = rect.bottom + CARD_HEIGHT_ESTIMATE + MARGIN <= window.innerHeight;
  const style = fitsBelow
    ? { left, top: rect.bottom + 6 }
    : { left, bottom: window.innerHeight - rect.top + 6 };

  return (
    <div className="wep-card" style={style} ref={cardRef}>
      <span className={`wep-type ${entry.type}`}>
        <Icon size={14} />
      </span>
      <div className="wep-main">
        <strong>{entry.name}</strong>
        <span className="wep-meta">{metaLine(entry)}</span>
      </div>
      <button
        type="button"
        className="wep-open"
        onClick={() => { setPeek(null); navigate(targetPath); }}
      >
        Open page
      </button>
      <button type="button" className="wep-close" onClick={() => setPeek(null)} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}
