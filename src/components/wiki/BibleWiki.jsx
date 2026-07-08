import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BookMarked, MapPin, User, Search, ArrowLeft, BookOpen, Users, Baby, Heart,
} from 'lucide-react';
import { loadBibleWiki, groupChaptersByBook, formatYear } from '../../lib/bibleWiki';
import { passageIdToDisplay } from '../../lib/scripture';
import WikiObservations from './WikiObservations';
import WikiEntryImage from './WikiEntryImage';
import './BibleWiki.css';

// Opens the passage in the global BibleLookup modal (same event the app-wide
// scripture auto-linker dispatches).
const openScripture = (ref) =>
  window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref } }));

const entryWeight = (e) => e.vc || (e.p ? e.p.length : 0);

// Chapter chips shown per book before the "show all" toggle.
const CHAPTERS_PREVIEW = 20;

export default function BibleWiki({ session, userRole, activeOrgId }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [wiki, setWiki] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadBibleWiki().then((data) => { if (!cancelled) setWiki(data); });
    return () => { cancelled = true; };
  }, []);

  if (!wiki) {
    return <div className="bw-page"><div className="bw-loading">Loading the appendix…</div></div>;
  }

  const entry = slug ? wiki.bySlug.get(slug) : null;
  if (slug && !entry) {
    return (
      <div className="bw-page">
        <button className="bw-back" onClick={() => navigate('/wiki')}>
          <ArrowLeft size={16} /> Bible Wiki
        </button>
        <p className="bw-empty">No page found for “{slug}”.</p>
      </div>
    );
  }

  return entry
    ? <WikiEntry entry={entry} wiki={wiki} session={session} userRole={userRole} activeOrgId={activeOrgId} />
    : <WikiIndex wiki={wiki} />;
}

function WikiIndex({ wiki }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'person' | 'place'

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return wiki.entries
      .filter((e) => typeFilter === 'all' || e.type === typeFilter)
      .filter((e) => !q
        || e.name.toLowerCase().includes(q)
        || e.n.toLowerCase().includes(q)
        || (e.al || []).some((a) => a.toLowerCase().includes(q)))
      .sort((a, b) => entryWeight(b) - entryWeight(a));
  }, [wiki, query, typeFilter]);

  return (
    <div className="bw-page">
      <div className="bw-hero">
        <BookMarked size={32} className="bw-hero-icon" />
        <h1>Bible Wiki</h1>
        <p>
          People and places of Scripture, indexed from the text itself. Every page starts
          from the verses where its subject appears — and grows with what your church notices.
        </p>
      </div>

      <div className="bw-controls">
        <div className="bw-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search people and places…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="bw-filter-tabs">
          {[['all', 'All'], ['person', 'People'], ['place', 'Places']].map(([key, label]) => (
            <button
              key={key}
              className={`bw-filter-tab ${typeFilter === key ? 'active' : ''}`}
              onClick={() => setTypeFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bw-grid">
        {visible.map((e) => (
          <button key={e.s} className="bw-card" onClick={() => navigate(`/wiki/${e.s}`)}>
            <span className={`bw-type-icon ${e.type}`}>
              {e.type === 'person' ? <User size={15} /> : <MapPin size={15} />}
            </span>
            <span className="bw-card-name">{e.name}</span>
            <span className="bw-card-meta">
              {e.type === 'person'
                ? `${e.vc} verse${e.vc === 1 ? '' : 's'}`
                : `${e.p.length} chapter${e.p.length === 1 ? '' : 's'}`}
            </span>
          </button>
        ))}
        {!visible.length && <p className="bw-empty">Nothing matches that search.</p>}
      </div>

      <p className="bw-attribution">
        Foundation data: Theographic Bible Metadata &amp; OpenBible.info (CC-BY).
      </p>
    </div>
  );
}

const RELATION_LABELS = [
  ['fa', 'Father', User],
  ['mo', 'Mother', User],
  ['pt', 'Spouse', Heart],
  ['sib', 'Siblings', Users],
  ['ch', 'Children', Baby],
];

function WikiEntry({ entry, wiki, session, userRole, activeOrgId }) {
  const navigate = useNavigate();
  const [expandedBooks, setExpandedBooks] = useState(() => new Set());

  const books = useMemo(() => groupChaptersByBook(entry.p), [entry]);
  const firstRef = entry.fv ? passageIdToDisplay(entry.fv) : null;
  const lastRef = entry.lv ? passageIdToDisplay(entry.lv) : null;

  const relations = useMemo(() => {
    if (!entry.rel) return [];
    return RELATION_LABELS.flatMap(([key, label, Icon]) => {
      const slugs = [].concat(entry.rel[key] || []);
      const targets = slugs.map((s) => wiki.bySlug.get(s)).filter(Boolean);
      return targets.length ? [{ key, label, Icon, targets }] : [];
    });
  }, [entry, wiki]);

  const era = entry.y ? [formatYear(entry.y[0]), formatYear(entry.y[1])].filter(Boolean).join(' – ') : null;

  const toggleBook = (code) => {
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  return (
    <div className="bw-page">
      <button className="bw-back" onClick={() => navigate('/wiki')}>
        <ArrowLeft size={16} /> Bible Wiki
      </button>

      <header className="bw-entry-header">
        <span className={`bw-type-badge ${entry.type}`}>
          {entry.type === 'person' ? <User size={13} /> : <MapPin size={13} />}
          {entry.type === 'person' ? 'Person' : 'Place'}
        </span>
        <h1>{entry.name}</h1>
        {entry.t && entry.t !== entry.n && (
          <p className="bw-entry-sub">Named “{entry.n}” in the text</p>
        )}
        {entry.al?.length > 0 && (
          <p className="bw-entry-sub">Also called {entry.al.join(', ')}</p>
        )}
      </header>

      <WikiEntryImage
        key={entry.s}
        session={session}
        userRole={userRole}
        activeOrgId={activeOrgId}
        entry={entry}
      />

      <section className="bw-foundation">
        <h2 className="bw-section-title"><BookOpen size={15} /> From the text</h2>
        <div className="bw-facts">
          <div className="bw-fact">
            <span className="bw-fact-label">Mentioned in</span>
            <span className="bw-fact-value">
              {entry.type === 'person'
                ? `${entry.vc} verses across ${entry.p.length} chapters`
                : `${entry.p.length} chapters`}
            </span>
          </div>
          {firstRef && (
            <div className="bw-fact">
              <span className="bw-fact-label">First appearance</span>
              <button className="bw-ref-chip" onClick={() => openScripture(firstRef)}>{firstRef}</button>
            </div>
          )}
          {lastRef && lastRef !== firstRef && (
            <div className="bw-fact">
              <span className="bw-fact-label">Last appearance</span>
              <button className="bw-ref-chip" onClick={() => openScripture(lastRef)}>{lastRef}</button>
            </div>
          )}
          {era && (
            <div className="bw-fact">
              <span className="bw-fact-label">Lived (traditional dating)</span>
              <span className="bw-fact-value">{era}</span>
            </div>
          )}
        </div>

        {relations.length > 0 && (
          <div className="bw-relations">
            {relations.map(({ key, label, Icon, targets }) => (
              <div key={key} className="bw-relation-row">
                <span className="bw-relation-label"><Icon size={13} /> {label}</span>
                <span className="bw-relation-chips">
                  {targets.map((t) => (
                    <button key={t.s} className="bw-entity-chip" onClick={() => navigate(`/wiki/${t.s}`)}>
                      {t.name}
                    </button>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bw-verse-index">
        <h2 className="bw-section-title"><BookMarked size={15} /> Where to read</h2>
        <p className="bw-section-hint">Tap any chapter to open it.</p>
        {books.map(({ code, book, chapters }) => {
          const expanded = expandedBooks.has(code);
          const shown = expanded ? chapters : chapters.slice(0, CHAPTERS_PREVIEW);
          return (
            <div key={code} className="bw-book-group">
              <h3>{book}</h3>
              <div className="bw-chapter-chips">
                {shown.map((ch) => (
                  <button key={ch} className="bw-ref-chip" onClick={() => openScripture(`${book} ${ch}`)}>
                    {ch}
                  </button>
                ))}
                {chapters.length > CHAPTERS_PREVIEW && (
                  <button className="bw-ref-chip bw-more" onClick={() => toggleBook(code)}>
                    {expanded ? 'Show less' : `+${chapters.length - CHAPTERS_PREVIEW} more`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <WikiObservations
        key={entry.s}
        session={session}
        userRole={userRole}
        activeOrgId={activeOrgId}
        entrySlug={entry.s}
        entryName={entry.name}
      />

      <p className="bw-attribution">
        Foundation data: Theographic Bible Metadata &amp; OpenBible.info (CC-BY).
      </p>
    </div>
  );
}
