import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BookMarked, MapPin, User, Search, ArrowLeft, BookOpen, Landmark, Sparkles,
  BookOpenCheck, FileText, Milestone, Users, CalendarRange, Award,
} from 'lucide-react';
import {
  loadBibleWiki, loadBibleWikiFull, groupChaptersByBook, formatYear, formatYearRange,
  buildChapterIndex, entitiesForChapters, coOccurring, loadChurchTeachers, teachersForBibleFigure,
} from '../../lib/bibleWiki';
import { passageIdToDisplay, CODE_TO_NAME } from '../../lib/scripture';
import { BOOK_CHAPTERS } from '../../lib/readingPlans';
import { BOOK_INTROS } from '../../lib/bookIntros';
import { canAccessLeaderTools } from '../../lib/roles';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';
import { wikiImageUrl } from '../../lib/wikiImageUrls';
import WikiObservations from './WikiObservations';
import WikiEntryImage from './WikiEntryImage';
import WikiFamilyTree from './WikiFamilyTree';
import WikiPlaceMap from './WikiPlaceMap';
import WikiVideos from './WikiVideos';
import WikiMemoryVerses from './WikiMemoryVerses';
import WikiStudyPack from './WikiStudyPack';
import WikiQuizCard from './WikiQuizCard';
import './BibleWiki.css';

// Opens the passage in the global BibleLookup modal (same event the app-wide
// scripture auto-linker dispatches).
const openScripture = (ref) =>
  window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref } }));

const entryWeight = (e) => e.vc || (e.p ? e.p.length : 0);

// Chapter chips shown per book before the "show all" toggle.
const CHAPTERS_PREVIEW = 20;
const INDEX_PAGE_SIZE = 60;

// Book pseudo-entries live at /wiki/book-<usfm code, lowercased>.
const bookSlug = (code) => `book-${code.toLowerCase()}`;
const codeFromBookSlug = (slug) => (slug?.startsWith('book-') ? slug.slice(5).toUpperCase() : null);

export default function BibleWiki({ session, userRole, activeOrgId }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [wiki, setWiki] = useState(null); // full set (core renders first via placeholder below)
  const [coreWiki, setCoreWiki] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadBibleWiki().then((data) => { if (!cancelled) setCoreWiki(data); });
    loadBibleWikiFull().then((data) => { if (!cancelled) setWiki(data); });
    return () => { cancelled = true; };
  }, []);

  const available = wiki || coreWiki;
  if (!available) {
    return <div className="bw-page"><div className="bw-loading">Loading the appendix…</div></div>;
  }

  const bookCode = codeFromBookSlug(slug);
  if (bookCode && BOOK_CHAPTERS[bookCode]) {
    return (
      <BookEntry
        key={bookCode}
        code={bookCode}
        wiki={available}
        session={session}
        userRole={userRole}
        activeOrgId={activeOrgId}
      />
    );
  }

  const entry = slug ? available.bySlug.get(slug) : null;
  if (slug && !entry) {
    // The slug may live in the extended set that hasn't finished loading.
    if (!wiki) {
      return <div className="bw-page"><div className="bw-loading">Loading the appendix…</div></div>;
    }
    return (
      <div className="bw-page">
        <button className="bw-back" onClick={() => navigate('/wiki')}>
          <ArrowLeft size={16} /> Bible Wiki
        </button>
        <p className="bw-empty">No page found for “{slug}”.</p>
      </div>
    );
  }

  if (entry?.type === 'event') {
    return (
      <EventEntry
        key={entry.s}
        entry={entry}
        wiki={available}
        session={session}
        userRole={userRole}
        activeOrgId={activeOrgId}
      />
    );
  }

  return entry
    ? (
      <WikiEntry
        key={entry.s}
        entry={entry}
        wiki={available}
        session={session}
        userRole={userRole}
        activeOrgId={activeOrgId}
      />
    )
    : <WikiIndex wiki={available} session={session} activeOrgId={activeOrgId} />;
}

// ── Index ────────────────────────────────────────────────────────────────────

const BOOKS = Object.keys(BOOK_CHAPTERS).map((code) => ({
  s: bookSlug(code),
  code,
  type: 'book',
  name: CODE_TO_NAME[code] || code,
  chapters: BOOK_CHAPTERS[code],
}));

function WikiIndex({ wiki, session, activeOrgId }) {
  const navigate = useNavigate();
  // ?q= deep link (e.g. from the passage map for long-tail places)
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [typeFilter, setTypeFilter] = useState('all'); // all | person | place | event | book | met
  const [visibleCount, setVisibleCount] = useState(INDEX_PAGE_SIZE);
  // slug → org-specific image path (overrides the generated default thumb)
  const [orgImages, setOrgImages] = useState(() => new Map());
  const [brokenThumbs, setBrokenThumbs] = useState(() => new Set());
  const [engagedChapters, setEngagedChapters] = useState(null); // Set<'GEN.12'> | null

  useEffect(() => {
    if (!hasSupabaseConfig || !session || !activeOrgId) return undefined;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('wiki_entry_images')
        .select('entry_slug, image_path')
        .eq('organization_id', activeOrgId);
      if (!cancelled && data) setOrgImages(new Map(data.map((r) => [r.entry_slug, r.image_path])));
    })();
    return () => { cancelled = true; };
  }, [session, activeOrgId]);

  // Chapters the user has actually read (reading plans + lookups) — the basis
  // of the "people you've met" collection.
  useEffect(() => {
    if (!hasSupabaseConfig || !session?.user?.id) return undefined;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('scripture_engagement')
        .select('book, chapter')
        .eq('user_id', session.user.id)
        .limit(5000);
      if (!cancelled) setEngagedChapters(new Set((data || []).map((r) => `${r.book}.${r.chapter}`)));
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const metSlugs = useMemo(() => {
    if (!engagedChapters?.size) return new Set();
    const met = new Set();
    for (const e of wiki.entries) {
      if ((e.p || []).some((ref) => engagedChapters.has(ref))) met.add(e.s);
    }
    return met;
  }, [wiki, engagedChapters]);

  // Org picture wins; otherwise the ~4KB generated default thumbnail.
  const thumbUrl = (slug) => {
    if (brokenThumbs.has(slug)) return null;
    const orgPath = orgImages.get(slug);
    const path = orgPath || `_default/thumbs/${slug}.jpg`;
    return wikiImageUrl(path);
  };

  const events = useMemo(() => wiki.events || [], [wiki]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (e) => !q
      || e.name.toLowerCase().includes(q)
      || (e.n || '').toLowerCase().includes(q)
      || (e.al || []).some((a) => a.toLowerCase().includes(q))
      || (q.length >= 4 && (e.desc || '').toLowerCase().includes(q));
    if (typeFilter === 'book') {
      return BOOKS.filter((b) => !q || b.name.toLowerCase().includes(q));
    }
    if (typeFilter === 'event') {
      return events.filter(matches);
    }
    let pool = wiki.entries;
    if (typeFilter === 'met') pool = pool.filter((e) => metSlugs.has(e.s));
    else if (typeFilter !== 'all') pool = pool.filter((e) => e.type === typeFilter);
    return pool.filter(matches).sort((a, b) => entryWeight(b) - entryWeight(a));
  }, [wiki, events, query, typeFilter, metSlugs]);

  const shown = visible.slice(0, visibleCount);
  const peopleTotal = wiki.entries.filter((e) => e.type === 'person').length;
  const metPeople = [...metSlugs].filter((s) => wiki.bySlug.get(s)?.type === 'person').length;

  const setFilter = (key) => { setTypeFilter(key); setVisibleCount(INDEX_PAGE_SIZE); };

  return (
    <div className="bw-page">
      <div className="bw-hero">
        <BookMarked size={32} className="bw-hero-icon" />
        <h1>Bible Wiki</h1>
        <p>
          People, places, events, and books of Scripture, indexed from the text itself. Every page
          starts from the verses where its subject appears — and grows with what your church notices.
        </p>
      </div>

      {session && engagedChapters && metSlugs.size > 0 && (
        <button className="bw-collection" onClick={() => setFilter(typeFilter === 'met' ? 'all' : 'met')}>
          <Award size={16} />
          <span>
            You've met <strong>{metPeople}</strong> of the {peopleTotal.toLocaleString()} people in
            Scripture through your reading.
          </span>
          <span className="bw-collection-cta">{typeFilter === 'met' ? 'Show everyone' : 'See who'}</span>
        </button>
      )}

      <div className="bw-controls">
        <div className="bw-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search people, places, events, books…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisibleCount(INDEX_PAGE_SIZE); }}
          />
        </div>
        <div className="bw-filter-tabs">
          {[['all', 'All'], ['person', 'People'], ['place', 'Places'], ['event', 'Events'], ['book', 'Books']].map(([key, label]) => (
            <button
              key={key}
              className={`bw-filter-tab ${typeFilter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {typeFilter === 'all' && !query && (
        <WikiQuizCard wiki={{ entries: wiki.entries.slice(0, 400), bySlug: wiki.bySlug }} onOpenEntry={(s) => navigate(`/wiki/${s}`)} />
      )}

      <div className="bw-grid">
        {shown.map((e) => (
          <button key={e.s} className="bw-card" onClick={() => navigate(`/wiki/${e.s}`)}>
            {e.type !== 'book' && e.type !== 'event' && thumbUrl(e.s) ? (
              <img
                className="bw-card-thumb"
                src={thumbUrl(e.s)}
                alt=""
                loading="lazy"
                onError={() => setBrokenThumbs((prev) => new Set(prev).add(e.s))}
              />
            ) : (
              <span className={`bw-type-icon ${e.type}`}>
                {e.type === 'person' && <User size={15} />}
                {e.type === 'place' && <MapPin size={15} />}
                {e.type === 'event' && <Milestone size={15} />}
                {e.type === 'book' && <BookOpen size={15} />}
              </span>
            )}
            <span className="bw-card-name">
              {e.name}
              {metSlugs.has(e.s) && <Sparkles size={11} className="bw-met-badge" title="Met in your reading" />}
            </span>
            <span className="bw-card-meta">
              {e.type === 'person' && `${e.vc} verse${e.vc === 1 ? '' : 's'}`}
              {e.type === 'place' && `${e.p.length} chapter${e.p.length === 1 ? '' : 's'}`}
              {e.type === 'event' && (e.y ? formatYear(e.y) : passageIdToDisplay(e.fv) || '')}
              {e.type === 'book' && `${e.chapters} chapters`}
            </span>
          </button>
        ))}
        {!shown.length && (
          <p className="bw-empty">
            {typeFilter === 'met' ? 'Complete a reading-plan day or look up a passage to start meeting people.' : 'Nothing matches that search.'}
          </p>
        )}
      </div>
      {visible.length > visibleCount && (
        <button className="bw-load-more" onClick={() => setVisibleCount((c) => c + INDEX_PAGE_SIZE * 2)}>
          Show more ({(visible.length - visibleCount).toLocaleString()} remaining)
        </button>
      )}

      <p className="bw-attribution">
        Foundation data: Theographic Bible Metadata &amp; OpenBible.info (CC-BY).
      </p>
    </div>
  );
}

// ── Person / place entry ─────────────────────────────────────────────────────

function WikiEntry({ entry, wiki, session, userRole, activeOrgId }) {
  const navigate = useNavigate();
  const [expandedBooks, setExpandedBooks] = useState(() => new Set());
  const [teachers, setTeachers] = useState([]);
  const [showStudyPack, setShowStudyPack] = useState(false);
  const isLeader = canAccessLeaderTools(userRole);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.body.dataset.wikiSelfSlug = entry.s;
    return () => { delete document.body.dataset.wikiSelfSlug; };
  }, [entry.s]);

  useEffect(() => {
    let cancelled = false;
    loadChurchTeachers().then(({ teachers: list }) => {
      if (!cancelled) setTeachers(teachersForBibleFigure(list, entry.s));
    });
    return () => { cancelled = true; };
  }, [entry.s]);

  const books = useMemo(() => groupChaptersByBook(entry.p), [entry]);
  const firstRef = entry.fv ? passageIdToDisplay(entry.fv) : null;
  const lastRef = entry.lv ? passageIdToDisplay(entry.lv) : null;
  const companions = useMemo(
    () => coOccurring(entry, wiki.entries.slice(0, wiki.coreCount || wiki.entries.length)),
    [entry, wiki],
  );

  const era = entry.y ? formatYearRange(entry.y) : null;
  const canPlan = (entry.p?.length || 0) >= 2;

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

      <div className="bw-entry-actions" data-no-scripture>
        {canPlan && (
          <button
            className="btn-primary bw-plan-btn"
            onClick={() => navigate(`/reading-plans?plan=wiki-${entry.s}`)}
          >
            <BookOpenCheck size={14} />
            {entry.type === 'person' ? `Read the life of ${entry.name}` : `Read about ${entry.name}`}
            <span className="bw-plan-days">{entry.p.length} chapters</span>
          </button>
        )}
        {isLeader && (
          <button className="btn-secondary bw-pack-btn" onClick={() => setShowStudyPack(true)}>
            <FileText size={14} /> Study pack
          </button>
        )}
      </div>

      <WikiEntryImage
        key={entry.s}
        session={session}
        userRole={userRole}
        activeOrgId={activeOrgId}
        entry={entry}
      />

      {entry.desc && <p className="bw-entry-desc">{entry.desc}</p>}

      <section className="bw-foundation">
        <h2 className="bw-section-title"><BookOpen size={15} /> From the text</h2>
        <div className="bw-facts">
          {entry.nm && (
            <div className="bw-fact">
              <span className="bw-fact-label">Name meaning</span>
              <span className="bw-fact-value">{entry.nm}</span>
            </div>
          )}
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
      </section>

      {entry.arc?.length > 0 && (
        <section className="bw-arc-section">
          <h2 className="bw-section-title"><Milestone size={15} /> The story arc</h2>
          <ol className="bw-arc">
            {entry.arc.map((step, i) => (
              <li key={step.r} className="bw-arc-step">
                <span className="bw-arc-num">{i + 1}</span>
                <span className="bw-arc-title">{step.t}</span>
                <button className="bw-ref-chip" onClick={() => openScripture(step.r)}>{step.r}</button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <WikiFamilyTree entry={entry} bySlug={wiki.bySlug} />
      <WikiPlaceMap entry={entry} />

      {companions.length > 0 && (
        <section className="bw-companions">
          <h2 className="bw-section-title"><Users size={15} /> Often appears with</h2>
          <div className="bw-chapter-chips" data-no-scripture>
            {companions.map(({ entry: other, shared }) => (
              <button
                key={other.s}
                className="bw-entity-chip"
                onClick={() => navigate(`/wiki/${other.s}`)}
                title={`${shared} shared chapters`}
              >
                {other.type === 'place' ? <MapPin size={11} /> : <User size={11} />} {other.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <WikiMemoryVerses session={session} entry={entry} />

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

      {teachers.length > 0 && (
        <section className="bw-voices">
          <h2 className="bw-section-title"><Landmark size={15} /> Voices from church history</h2>
          <p className="bw-section-hint">Teachers across the centuries especially shaped by {entry.name}'s writings and story.</p>
          <div className="bw-chapter-chips" data-no-scripture>
            {teachers.map((t) => (
              <button key={t.s} className="bw-entity-chip teacher" onClick={() => navigate(`/church-history/${t.s}`)}>
                <Landmark size={11} /> {t.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <WikiVideos query={entry.name} />

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

      {showStudyPack && (
        <WikiStudyPack entry={entry} activeOrgId={activeOrgId} onClose={() => setShowStudyPack(false)} />
      )}
    </div>
  );
}

// ── Event entry ──────────────────────────────────────────────────────────────

function EventEntry({ entry, wiki, session, userRole, activeOrgId }) {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
    document.body.dataset.wikiSelfSlug = entry.s;
    return () => { delete document.body.dataset.wikiSelfSlug; };
  }, [entry.s]);

  const events = wiki.events || [];
  const idx = events.findIndex((e) => e.s === entry.s);
  const prev = idx > 0 ? events[idx - 1] : null;
  const next = idx >= 0 && idx < events.length - 1 ? events[idx + 1] : null;

  const people = (entry.pe || []).map((s) => wiki.bySlug.get(s)).filter(Boolean);
  const places = (entry.pl || []).map((s) => wiki.bySlug.get(s)).filter(Boolean);
  const books = groupChaptersByBook(entry.p);
  const firstRef = entry.fv ? passageIdToDisplay(entry.fv) : null;

  return (
    <div className="bw-page">
      <button className="bw-back" onClick={() => navigate('/wiki')}>
        <ArrowLeft size={16} /> Bible Wiki
      </button>

      <header className="bw-entry-header">
        <span className="bw-type-badge event"><Milestone size={13} /> Event</span>
        <h1>{entry.name}</h1>
        {entry.y && <p className="bw-entry-sub">Around {formatYear(entry.y)} (traditional dating)</p>}
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
          {firstRef && (
            <div className="bw-fact">
              <span className="bw-fact-label">Begins at</span>
              <button className="bw-ref-chip" onClick={() => openScripture(firstRef)}>{firstRef}</button>
            </div>
          )}
          {entry.y && (
            <div className="bw-fact">
              <span className="bw-fact-label">When (traditional dating)</span>
              <span className="bw-fact-value">{formatYear(entry.y)}</span>
            </div>
          )}
        </div>

        {people.length > 0 && (
          <div className="bw-relation-row">
            <span className="bw-relation-label"><User size={13} /> Who was there</span>
            <span className="bw-relation-chips" data-no-scripture>
              {people.map((p) => (
                <button key={p.s} className="bw-entity-chip" onClick={() => navigate(`/wiki/${p.s}`)}>{p.name}</button>
              ))}
            </span>
          </div>
        )}
        {places.length > 0 && (
          <div className="bw-relation-row">
            <span className="bw-relation-label"><MapPin size={13} /> Where</span>
            <span className="bw-relation-chips" data-no-scripture>
              {places.map((p) => (
                <button key={p.s} className="bw-entity-chip" onClick={() => navigate(`/wiki/${p.s}`)}>{p.name}</button>
              ))}
            </span>
          </div>
        )}
      </section>

      <section className="bw-verse-index">
        <h2 className="bw-section-title"><BookMarked size={15} /> Where to read</h2>
        {books.map(({ code, book, chapters }) => (
          <div key={code} className="bw-book-group">
            <h3>{book}</h3>
            <div className="bw-chapter-chips">
              {chapters.map((ch) => (
                <button key={ch} className="bw-ref-chip" onClick={() => openScripture(`${book} ${ch}`)}>{ch}</button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {(prev || next) && (
        <nav className="bw-event-nav" data-no-scripture>
          {prev ? (
            <button className="bw-event-nav-btn" onClick={() => navigate(`/wiki/${prev.s}`)}>
              <ArrowLeft size={13} /> {prev.name}
            </button>
          ) : <span />}
          {next && (
            <button className="bw-event-nav-btn next" onClick={() => navigate(`/wiki/${next.s}`)}>
              {next.name} →
            </button>
          )}
        </nav>
      )}

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

// ── Book entry ───────────────────────────────────────────────────────────────

function BookEntry({ code, wiki, session, userRole, activeOrgId }) {
  const navigate = useNavigate();
  const name = CODE_TO_NAME[code] || code;
  const chapterCount = BOOK_CHAPTERS[code];
  const intro = BOOK_INTROS[code];

  useEffect(() => {
    window.scrollTo(0, 0);
    document.body.dataset.wikiSelfSlug = bookSlug(code);
    return () => { delete document.body.dataset.wikiSelfSlug; };
  }, [code]);

  const bookChapters = useMemo(
    () => Array.from({ length: chapterCount }, (_, i) => `${code}.${i + 1}`),
    [code, chapterCount],
  );

  const cast = useMemo(() => {
    const coreEntries = wiki.entries.slice(0, wiki.coreCount || wiki.entries.length);
    const index = buildChapterIndex(coreEntries);
    return entitiesForChapters(index, bookChapters)
      .filter(({ entry }) => entry.s !== 'god_1324')
      .slice(0, 14);
  }, [wiki, bookChapters]);

  return (
    <div className="bw-page">
      <button className="bw-back" onClick={() => navigate('/wiki')}>
        <ArrowLeft size={16} /> Bible Wiki
      </button>

      <header className="bw-entry-header">
        <span className="bw-type-badge book"><BookOpen size={13} /> Book</span>
        <h1>{name}</h1>
        <p className="bw-entry-sub">{chapterCount} chapters</p>
      </header>

      {intro && <p className="bw-entry-desc">{intro}</p>}

      {cast.length > 0 && (
        <section className="bw-foundation">
          <h2 className="bw-section-title"><Users size={15} /> The cast</h2>
          <div className="bw-chapter-chips" data-no-scripture>
            {cast.map(({ entry }) => (
              <button key={entry.s} className="bw-entity-chip" onClick={() => navigate(`/wiki/${entry.s}`)}>
                {entry.type === 'place' ? <MapPin size={11} /> : <User size={11} />} {entry.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="bw-verse-index">
        <h2 className="bw-section-title"><CalendarRange size={15} /> Chapters</h2>
        <p className="bw-section-hint">Tap any chapter to read it.</p>
        <div className="bw-chapter-chips">
          {bookChapters.map((id, i) => (
            <button key={id} className="bw-ref-chip" onClick={() => openScripture(`${name} ${i + 1}`)}>
              {i + 1}
            </button>
          ))}
        </div>
      </section>

      <WikiVideos query={`${name} overview`} label={`the BibleProject overview of ${name}`} />

      <WikiObservations
        key={code}
        session={session}
        userRole={userRole}
        activeOrgId={activeOrgId}
        entrySlug={bookSlug(code)}
        entryName={name}
      />
    </div>
  );
}
