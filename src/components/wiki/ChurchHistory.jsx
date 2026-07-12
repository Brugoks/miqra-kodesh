import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Landmark, Search, ArrowLeft, BookOpen, ScrollText, Quote, Library, Users, GitBranch, User } from 'lucide-react';
import { loadChurchTeachers, formatYearRange, TEACHER_ERAS, influencedBy, loadBibleWiki } from '../../lib/bibleWiki';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';
import WikiObservations from './WikiObservations';
import WikiEntryImage from './WikiEntryImage';
import './BibleWiki.css';

// Church History: theologians and church fathers — a sibling section to the
// Bible Wiki. These figures are NOT in Scripture; every page says so plainly.
// They share the wiki's slug-keyed observations and picture infrastructure.

const openScripture = (ref) =>
  window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref } }));

export default function ChurchHistory({ session, userRole, activeOrgId }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadChurchTeachers().then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, []);

  if (!data) {
    return <div className="bw-page"><div className="bw-loading">Loading church history…</div></div>;
  }

  const teacher = slug ? data.bySlug.get(slug) : null;
  if (slug && !teacher) {
    return (
      <div className="bw-page">
        <button className="bw-back" onClick={() => navigate('/church-history')}>
          <ArrowLeft size={16} /> Church History
        </button>
        <p className="bw-empty">No page found for “{slug}”.</p>
      </div>
    );
  }

  return teacher
    ? (
      <TeacherEntry
        key={teacher.s}
        teacher={teacher}
        allTeachers={data}
        session={session}
        userRole={userRole}
        activeOrgId={activeOrgId}
      />
    )
    : <TeacherIndex teachers={data.teachers} session={session} activeOrgId={activeOrgId} />;
}

const KIND_META = {
  council: { label: 'Council', Icon: Users },
  creed: { label: 'Creed & Confession', Icon: ScrollText },
  person: { label: 'Teacher', Icon: User },
};

function kindOf(t) {
  return KIND_META[t.kind] ? t.kind : 'person';
}

function TeacherIndex({ teachers, session, activeOrgId }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [orgImages, setOrgImages] = useState(() => new Map());
  const [brokenThumbs, setBrokenThumbs] = useState(() => new Set());

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

  const thumbUrl = (s) => {
    if (!hasSupabaseConfig || brokenThumbs.has(s)) return null;
    const path = orgImages.get(s) || `_default/thumbs/${s}.jpg`;
    return supabase.storage.from('wiki-images').getPublicUrl(path).data.publicUrl;
  };

  const q = query.trim().toLowerCase();
  const byEra = useMemo(() => {
    const filtered = teachers.filter((t) => !q
      || t.name.toLowerCase().includes(q)
      || (t.trad || '').toLowerCase().includes(q)
      || (t.region || '').toLowerCase().includes(q));
    return TEACHER_ERAS
      .map((era) => ({
        era,
        list: filtered.filter((t) => t.era === era).sort((a, b) => (a.y?.[0] || 0) - (b.y?.[0] || 0)),
      }))
      .filter((g) => g.list.length);
  }, [teachers, q]);

  return (
    <div className="bw-page">
      <div className="bw-hero">
        <Landmark size={32} className="bw-hero-icon" />
        <h1>Church History</h1>
        <p>
          Theologians, church fathers, reformers, and missionaries — voices from twenty
          centuries who shaped how Christians understand the Scriptures. They are not
          the Bible; they help us read it, and their teaching is always tested against it.
        </p>
      </div>

      <div className="bw-controls">
        <div className="bw-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search teachers, traditions, places…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {byEra.map(({ era, list }) => (
        <section key={era} className="bw-era-section">
          <h2 className="bw-section-title"><ScrollText size={15} /> {era}</h2>
          <div className="bw-grid">
            {list.map((t) => (
              <button key={t.s} className="bw-card" onClick={() => navigate(`/church-history/${t.s}`)}>
                {thumbUrl(t.s) ? (
                  <img
                    className="bw-card-thumb"
                    src={thumbUrl(t.s)}
                    alt=""
                    loading="lazy"
                    onError={() => setBrokenThumbs((prev) => new Set(prev).add(t.s))}
                  />
                ) : (
                  <span className="bw-type-icon teacher">
                    {(() => { const { Icon } = KIND_META[kindOf(t)]; return <Icon size={15} />; })()}
                  </span>
                )}
                <span className="bw-card-name">{t.name}</span>
                <span className="bw-card-meta">
                  {kindOf(t) !== 'person' ? `${KIND_META[kindOf(t)].label} · ` : ''}
                  {formatYearRange(t.y) || ''}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {!byEra.length && <p className="bw-empty">Nothing matches that search.</p>}
    </div>
  );
}

function TeacherEntry({ teacher, allTeachers, session, userRole, activeOrgId }) {
  const navigate = useNavigate();
  const [bibleFigures, setBibleFigures] = useState([]);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.body.dataset.wikiSelfSlug = teacher.s;
    return () => { delete document.body.dataset.wikiSelfSlug; };
  }, [teacher.s]);

  // Bible Wiki figures this teacher especially taught from (`bib` slugs).
  useEffect(() => {
    if (!teacher.bib?.length) return undefined;
    let cancelled = false;
    loadBibleWiki().then((wiki) => {
      if (!cancelled) setBibleFigures(teacher.bib.map((s) => wiki.bySlug.get(s)).filter(Boolean));
    });
    return () => { cancelled = true; };
  }, [teacher]);

  const lived = formatYearRange(teacher.y);
  const kind = kindOf(teacher);
  const { Icon: KindIcon } = KIND_META[kind];
  const shapedBy = (teacher.infl || []).map((s) => allTeachers.bySlug.get(s)).filter(Boolean);
  const shaped = influencedBy(allTeachers.teachers, teacher.s);

  return (
    <div className="bw-page">
      <button className="bw-back" onClick={() => navigate('/church-history')}>
        <ArrowLeft size={16} /> Church History
      </button>

      <header className="bw-entry-header">
        <span className="bw-type-badge teacher"><KindIcon size={13} /> {kind !== 'person' ? `${KIND_META[kind].label} · ` : ''}{teacher.era}</span>
        <h1>{teacher.name}</h1>
        {teacher.trad && <p className="bw-entry-sub">{teacher.trad}</p>}
      </header>

      <WikiEntryImage
        key={`image-${teacher.s}`}
        session={session}
        userRole={userRole}
        activeOrgId={activeOrgId}
        entry={teacher}
      />

      <section className="bw-foundation">
        <h2 className="bw-section-title"><Quote size={15} /> Contribution to Christian understanding</h2>
        <div className="bw-facts">
          {lived && (
            <div className="bw-fact">
              <span className="bw-fact-label">Lived</span>
              <span className="bw-fact-value">{lived}</span>
            </div>
          )}
          {teacher.region && (
            <div className="bw-fact">
              <span className="bw-fact-label">Where</span>
              <span className="bw-fact-value">{teacher.region}</span>
            </div>
          )}
        </div>
        <p className="bw-teacher-summary">{teacher.sum}</p>
        {teacher.ideas?.length > 0 && (
          <ul className="bw-idea-list">
            {teacher.ideas.map((idea) => <li key={idea}>{idea}</li>)}
          </ul>
        )}
      </section>

      {teacher.q?.length > 0 && (
        <section className="bw-quotes">
          <h2 className="bw-section-title"><Quote size={15} /> In their own words</h2>
          {teacher.q.map((quote) => (
            <blockquote key={quote.q} className="bw-quote">
              <p>“{quote.q}”</p>
              {quote.src && <cite>— {quote.src}</cite>}
            </blockquote>
          ))}
        </section>
      )}

      {(shapedBy.length > 0 || shaped.length > 0) && (
        <section className="bw-foundation">
          <h2 className="bw-section-title"><GitBranch size={15} /> A chain of influence</h2>
          {shapedBy.length > 0 && (
            <div className="bw-relation-row">
              <span className="bw-relation-label">Shaped by</span>
              <span className="bw-relation-chips" data-no-scripture>
                {shapedBy.map((t) => (
                  <button key={t.s} className="bw-entity-chip teacher" onClick={() => navigate(`/church-history/${t.s}`)}>{t.name}</button>
                ))}
              </span>
            </div>
          )}
          {shaped.length > 0 && (
            <div className="bw-relation-row">
              <span className="bw-relation-label">Went on to shape</span>
              <span className="bw-relation-chips" data-no-scripture>
                {shaped.map((t) => (
                  <button key={t.s} className="bw-entity-chip teacher" onClick={() => navigate(`/church-history/${t.s}`)}>{t.name}</button>
                ))}
              </span>
            </div>
          )}
        </section>
      )}

      {bibleFigures.length > 0 && (
        <section className="bw-foundation">
          <h2 className="bw-section-title"><User size={15} /> Taught especially from</h2>
          <div className="bw-relation-chips" data-no-scripture>
            {bibleFigures.map((f) => (
              <button key={f.s} className="bw-entity-chip" onClick={() => navigate(`/wiki/${f.s}`)}>{f.name}</button>
            ))}
          </div>
        </section>
      )}

      {teacher.works?.length > 0 && (
        <section className="bw-verse-index">
          <h2 className="bw-section-title"><Library size={15} /> Key works</h2>
          <div className="bw-chapter-chips">
            {teacher.works.map((w) => <span key={w} className="bw-work-chip">{w}</span>)}
          </div>
        </section>
      )}

      {teacher.refs?.length > 0 && (
        <section className="bw-verse-index">
          <h2 className="bw-section-title"><BookOpen size={15} /> Scriptures they held high</h2>
          <p className="bw-section-hint">Passages central to this teacher's life and work — tap to read.</p>
          <div className="bw-chapter-chips">
            {teacher.refs.map((r) => (
              <button key={r} className="bw-ref-chip" onClick={() => openScripture(r)}>{r}</button>
            ))}
          </div>
        </section>
      )}

      <p className="bw-tradition-note">
        Church history &amp; tradition — a summary of this teacher's influence, not Scripture.
        Like the Bereans, test every teacher against the Word (Acts 17:11).
      </p>

      <WikiObservations
        key={`obs-${teacher.s}`}
        session={session}
        userRole={userRole}
        activeOrgId={activeOrgId}
        entrySlug={teacher.s}
        entryName={teacher.name}
      />
    </div>
  );
}
