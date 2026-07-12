import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb, BadgeCheck } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';
import { loadBibleWikiFull, loadChurchTeachers } from '../../lib/bibleWiki';
import { CODE_TO_NAME } from '../../lib/scripture';
import './WikiSpotlight.css';

const SEEN_KEY = 'wikiObsFeedSeenAt';

function entryLabel(slug, wiki, teachers) {
  if (slug.startsWith('book-')) return CODE_TO_NAME[slug.slice(5).toUpperCase()] || slug;
  return wiki?.bySlug.get(slug)?.name || teachers?.bySlug.get(slug)?.name || slug;
}

// Dashboard card: the church's recently confirmed wiki observations — the
// distribution channel for the community layer. Your own newly confirmed
// observations are highlighted since your last visit.
export default function WikiObservationsFeed({ session, activeOrgId }) {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [names, setNames] = useState(null); // { wiki, teachers }
  const [lastSeen] = useState(() => localStorage.getItem(SEEN_KEY));

  useEffect(() => {
    if (!hasSupabaseConfig || !session || !activeOrgId) return undefined;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('wiki_observations')
        .select('id, entry_slug, content, refs, user_id, confirmed_at, author:profiles!wiki_observations_user_id_fkey(full_name)')
        .eq('organization_id', activeOrgId)
        .eq('status', 'confirmed')
        .order('confirmed_at', { ascending: false })
        .limit(5);
      if (cancelled) return;
      setItems(data || []);
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
    })();
    return () => { cancelled = true; };
  }, [session, activeOrgId]);

  useEffect(() => {
    if (!items?.length) return undefined;
    let cancelled = false;
    Promise.all([loadBibleWikiFull(), loadChurchTeachers()]).then(([wiki, teachers]) => {
      if (!cancelled) setNames({ wiki, teachers });
    });
    return () => { cancelled = true; };
  }, [items]);

  if (!items?.length) return null;

  const entryPath = (slug) => {
    if (names?.teachers?.bySlug.has(slug)) return `/church-history/${slug}`;
    return `/wiki/${slug}`;
  };

  return (
    <section className="ws-card card">
      <h2 className="ws-title"><Lightbulb size={16} /> What your church is noticing</h2>
      {items.map((obs) => {
        const mine = obs.user_id === session?.user?.id;
        const freshMine = mine && lastSeen && obs.confirmed_at && obs.confirmed_at > lastSeen;
        return (
          <div key={obs.id} className={`wof-item ${mine ? 'mine' : ''}`}>
            <button className="wof-entry-link" onClick={() => navigate(entryPath(obs.entry_slug))}>
              {entryLabel(obs.entry_slug, names?.wiki, names?.teachers)}
            </button>
            <p className="wof-content">{obs.content}</p>
            <div className="wof-meta">
              <span>{obs.author?.full_name || 'Someone'}</span>
              <span><BadgeCheck size={12} /> Confirmed</span>
              <span>{(obs.refs || []).join(' · ')}</span>
              {freshMine && <span className="wof-mine-note">Your observation was confirmed 🎉</span>}
            </div>
          </div>
        );
      })}
    </section>
  );
}
