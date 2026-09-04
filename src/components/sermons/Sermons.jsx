import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './Sermons.css';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';
import {
  Mic2, PlusCircle, Search, BookOpen, User, Calendar as CalendarIcon,
  MessageSquare, ListChecks, CalendarCheck2,
} from 'lucide-react';
import { isLeaderRole } from '../../lib/roles';
import SermonNotes from '../SermonNotes';
import TalkEditor from './TalkEditor';
import { TALK_CATEGORIES, getTalkCategory, formatTalkDate, normalizeTakeaways } from './talkUtils';

export default function Sermons({ session, userRole, activeOrgId }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isLeader = isLeaderRole(userRole);
  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && !!userId;

  const activeTab = searchParams.get('tab') === 'notes' ? 'notes' : 'explore';

  const [talks, setTalks] = useState([]);
  const [commentCounts, setCommentCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    if (!isConfigured || !activeOrgId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('sermon_talks')
        .select('id, title, category, speaker_name, scripture_ref, talk_date, key_takeaways, event_id, is_published, created_by, created_by_name, created_at')
        .eq('organization_id', activeOrgId)
        .order('talk_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (cancelled) return;
      const list = data || [];
      setTalks(list);
      setLoading(false);

      if (list.length > 0) {
        const { data: comments } = await supabase
          .from('sermon_talk_comments')
          .select('talk_id')
          .in('talk_id', list.map(t => t.id));
        if (cancelled) return;
        const counts = {};
        (comments || []).forEach(c => { counts[c.talk_id] = (counts[c.talk_id] || 0) + 1; });
        setCommentCounts(counts);
      }
    })();
    return () => { cancelled = true; };
  }, [isConfigured, activeOrgId]);

  function switchTab(tab) {
    setSearchParams(tab === 'notes' ? { tab: 'notes' } : {}, { replace: true });
  }

  const query = search.trim().toLowerCase();
  const visibleTalks = talks.filter(talk => {
    if (filterCat !== 'all' && talk.category !== filterCat) return false;
    if (!query) return true;
    return [talk.title, talk.speaker_name, talk.scripture_ref]
      .some(field => field && field.toLowerCase().includes(query));
  });

  return (
    <div className="sermons-page">
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '12px',
          background: 'linear-gradient(135deg, var(--navy-primary), var(--navy-dark))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Mic2 size={24} color="white" />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', fontSize: '1.6rem' }}>
            Sermons &amp; Messages
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Explore talks from your church — summaries, key takeaways, transcripts, and discussion
          </p>
        </div>
        {isLeader && activeTab === 'explore' && (
          <button onClick={() => setShowEditor(v => !v)} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PlusCircle size={17} />
            {showEditor ? 'Cancel' : 'New Talk'}
          </button>
        )}
      </div>

      {/* Top-level tabs */}
      <div className="sermons-tabs">
        <button className={`sermons-tab ${activeTab === 'explore' ? 'active' : ''}`} onClick={() => switchTab('explore')}>
          Explore
        </button>
        <button className={`sermons-tab ${activeTab === 'notes' ? 'active' : ''}`} onClick={() => switchTab('notes')}>
          My Notes
        </button>
      </div>

      {activeTab === 'notes' ? (
        <SermonNotes session={session} userRole={userRole} activeOrgId={activeOrgId} embedded />
      ) : (
        <>
          {showEditor && isLeader && (
            <TalkEditor
              session={session}
              activeOrgId={activeOrgId}
              onSaved={(talk) => navigate(`/sermons/${talk.id}`)}
              onCancel={() => setShowEditor(false)}
            />
          )}

          {/* Search + filters */}
          <div className="sermons-toolbar">
            <div className="sermons-search">
              <Search size={15} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by title, speaker, or scripture…"
              />
            </div>
            <button
              className={`sermons-filter-chip ${filterCat === 'all' ? 'active' : ''}`}
              style={filterCat === 'all' ? { borderColor: 'var(--accent-gold)', background: 'var(--accent-gold)', color: 'var(--on-accent, #fff)' } : undefined}
              onClick={() => setFilterCat('all')}>
              All
            </button>
            {TALK_CATEGORIES.map(c => (
              <button key={c.value}
                className={`sermons-filter-chip ${filterCat === c.value ? 'active' : ''}`}
                style={filterCat === c.value ? { borderColor: c.color, background: c.bg, color: c.color } : undefined}
                onClick={() => setFilterCat(c.value)}>
                {c.label}s
              </button>
            ))}
          </div>

          {/* Talk list */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Loading…</div>
          ) : !isConfigured ? (
            <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning-border)', borderRadius: '10px', padding: '1rem 1.25rem', color: 'var(--warning-strong)', fontSize: '0.9rem' }}>
              ⚠️ Supabase is not configured. Sermons will not load until you add your environment variables.
            </div>
          ) : visibleTalks.length === 0 ? (
            <div className="empty-state">
              <Mic2 size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
              <p>
                {talks.length === 0
                  ? (isLeader
                    ? 'No sermons or messages yet — create the first one!'
                    : 'No sermons or messages have been shared yet. Check back soon!')
                  : 'Nothing matches your search.'}
              </p>
            </div>
          ) : (
            <div className="talk-list">
              {visibleTalks.map(talk => (
                <TalkCard
                  key={talk.id}
                  talk={talk}
                  commentCount={commentCounts[talk.id] || 0}
                  onOpen={() => navigate(`/sermons/${talk.id}`)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TalkCard({ talk, commentCount, onOpen }) {
  const cat = getTalkCategory(talk.category);
  const takeawayCount = normalizeTakeaways(talk.key_takeaways).length;

  return (
    <button type="button" className="talk-card" onClick={onOpen}>
      <div className="talk-card-badges">
        <span className="talk-badge" style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>
        {!talk.is_published && <span className="talk-badge draft">Draft</span>}
        {talk.event_id && (
          <span className="talk-badge event-link"><CalendarCheck2 size={10} /> Event</span>
        )}
      </div>
      <h3>{talk.title}</h3>
      <div className="talk-meta">
        {talk.speaker_name && <span><User size={12} /> {talk.speaker_name}</span>}
        {talk.talk_date && <span><CalendarIcon size={12} /> {formatTalkDate(talk.talk_date)}</span>}
        {talk.scripture_ref && <span><BookOpen size={12} /> {talk.scripture_ref}</span>}
        {takeawayCount > 0 && <span><ListChecks size={12} /> {takeawayCount} takeaway{takeawayCount === 1 ? '' : 's'}</span>}
        <span><MessageSquare size={12} /> {commentCount} comment{commentCount === 1 ? '' : 's'}</span>
      </div>
    </button>
  );
}
