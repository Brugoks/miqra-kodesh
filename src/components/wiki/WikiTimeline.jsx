import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarRange, User, Milestone, Landmark, MapPin } from 'lucide-react';
import { loadBibleWiki, loadBibleEvents, loadChurchTeachers, formatYear, formatYearRange } from '../../lib/bibleWiki';
import './BibleWiki.css';
import './WikiTimeline.css';

// One continuous timeline from the patriarchs to the modern church — Bible
// figures and events (traditional datings from the foundation data) flowing
// into church history, making visible that the story didn't stop at
// Revelation. Grouped by century; tap anything to open its page.

const FILTERS = [
  ['all', 'Everything'],
  ['person', 'Bible people'],
  ['event', 'Bible events'],
  ['teacher', 'Church history'],
];

function centuryLabel(year) {
  if (year < 0) {
    const c = Math.ceil(-year / 100);
    return `${c}00s BC`;
  }
  const c = Math.floor(year / 100);
  return c === 0 ? 'First century AD' : `AD ${c}00s`;
}

const TYPE_ICON = { person: User, place: MapPin, event: Milestone, teacher: Landmark };

export default function WikiTimeline() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadBibleWiki(), loadBibleEvents(), loadChurchTeachers()]).then(([wiki, events, teachers]) => {
      if (cancelled) return;
      const all = [];
      for (const e of wiki.entries) {
        if (e.type === 'person' && e.y) {
          all.push({ slug: e.s, type: 'person', name: e.name, year: e.y[0], sub: formatYearRange(e.y), desc: e.desc });
        }
      }
      for (const ev of events.events) {
        if (ev.y) all.push({ slug: ev.s, type: 'event', name: ev.name, year: ev.y, sub: formatYear(ev.y) });
      }
      for (const t of teachers.teachers) {
        if (t.y) {
          all.push({ slug: t.s, type: 'teacher', name: t.name, year: t.y[0], sub: `${formatYearRange(t.y)} · ${t.era}`, desc: t.trad });
        }
      }
      all.sort((a, b) => a.year - b.year);
      setItems(all);
    });
    return () => { cancelled = true; };
  }, []);

  const centuries = useMemo(() => {
    if (!items) return [];
    const filtered = filter === 'all' ? items : items.filter((i) => i.type === filter);
    const groups = [];
    let current = null;
    for (const item of filtered) {
      const label = centuryLabel(item.year);
      if (!current || current.label !== label) {
        current = { label, items: [] };
        groups.push(current);
      }
      current.items.push(item);
    }
    return groups;
  }, [items, filter]);

  if (!items) {
    return <div className="bw-page"><div className="bw-loading">Assembling the timeline…</div></div>;
  }

  return (
    <div className="bw-page">
      <div className="bw-hero">
        <CalendarRange size={32} className="bw-hero-icon" />
        <h1>Timeline</h1>
        <p>
          From Abraham to the modern church — the people and events of Scripture flowing into
          twenty centuries of church history. One story, still going. Dates before the exile are
          traditional datings carried by the foundation data, not archaeology.
        </p>
      </div>

      <div className="bw-controls">
        <div className="bw-filter-tabs">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              className={`bw-filter-tab ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="wtl-line" data-no-scripture>
        {centuries.map(({ label, items: group }) => (
          <section key={label} className="wtl-century">
            <h2 className="wtl-century-label">{label}</h2>
            <div className="wtl-items">
              {group.map((item) => {
                const Icon = TYPE_ICON[item.type] || User;
                const path = item.type === 'teacher' ? `/church-history/${item.slug}` : `/wiki/${item.slug}`;
                return (
                  <button key={`${item.type}-${item.slug}`} className={`wtl-item ${item.type}`} onClick={() => navigate(path)}>
                    <span className="wtl-dot"><Icon size={12} /></span>
                    <span className="wtl-body">
                      <span className="wtl-name">{item.name}</span>
                      <span className="wtl-sub">{item.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <p className="bw-attribution">
        Foundation data: Theographic Bible Metadata &amp; OpenBible.info (CC-BY).
      </p>
    </div>
  );
}
