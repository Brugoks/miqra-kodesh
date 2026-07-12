import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Trash2, Lightbulb, ExternalLink } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';
import { loadBibleWikiFull, loadChurchTeachers } from '../../lib/bibleWiki';
import { CODE_TO_NAME } from '../../lib/scripture';

const openScripture = (ref) =>
  window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref } }));

// Leader Portal tab: every pending wiki observation in the org in one queue,
// so review doesn't depend on leaders stumbling onto the right entry page.
export default function WikiReviewQueue({ session, activeOrgId }) {
  const [pending, setPending] = useState(null);
  const [names, setNames] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!hasSupabaseConfig || !activeOrgId) return undefined;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from('wiki_observations')
        .select('*, author:profiles!wiki_observations_user_id_fkey(full_name)')
        .eq('organization_id', activeOrgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (err) setError('Could not load pending observations.');
      else setPending(data || []);
    })();
    return () => { cancelled = true; };
  }, [activeOrgId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadBibleWikiFull(), loadChurchTeachers()]).then(([wiki, teachers]) => {
      if (!cancelled) setNames({ wiki, teachers });
    });
    return () => { cancelled = true; };
  }, []);

  const entryName = (slug) => {
    if (slug.startsWith('book-')) return CODE_TO_NAME[slug.slice(5).toUpperCase()] || slug;
    return names?.wiki?.bySlug.get(slug)?.name || names?.teachers?.bySlug.get(slug)?.name || slug;
  };
  const entryPath = (slug) =>
    (names?.teachers?.bySlug.has(slug) ? `/church-history/${slug}` : `/wiki/${slug}`);

  const confirm = async (obs) => {
    const { error: err } = await supabase
      .from('wiki_observations')
      .update({ status: 'confirmed', confirmed_by: session.user.id, confirmed_at: new Date().toISOString() })
      .eq('id', obs.id);
    if (!err) setPending((prev) => prev.filter((o) => o.id !== obs.id));
  };

  const remove = async (obs) => {
    const { error: err } = await supabase.from('wiki_observations').delete().eq('id', obs.id);
    if (!err) setPending((prev) => prev.filter((o) => o.id !== obs.id));
  };

  return (
    <div className="wrq-panel">
      <h3 className="wrq-title"><Lightbulb size={16} /> Wiki observations awaiting review</h3>
      <p className="wrq-hint">
        Confirming an observation gives it the church-visible badge on its wiki page and surfaces
        it on the Dashboard feed. Every observation cites Scripture — check the citations, not just the sentiment.
      </p>
      {error && <p className="wrq-error">{error}</p>}
      {pending && !pending.length && <p className="wrq-empty">Nothing waiting — the queue is clear. 🎉</p>}
      <ul className="wrq-list">
        {(pending || []).map((obs) => (
          <li key={obs.id} className="wrq-item">
            <div className="wrq-item-head">
              <button className="wof-entry-link" onClick={() => navigate(entryPath(obs.entry_slug))}>
                {entryName(obs.entry_slug)} <ExternalLink size={11} />
              </button>
              <span className="wrq-author">{obs.author?.full_name || 'Someone'} · {new Date(obs.created_at).toLocaleDateString()}</span>
            </div>
            <p className="wrq-content">{obs.content}</p>
            <div className="wrq-refs">
              {(obs.refs || []).map((r) => (
                <button key={r} className="bw-ref-chip" onClick={() => openScripture(r)}>{r}</button>
              ))}
            </div>
            <div className="wrq-actions">
              <button className="btn-primary" onClick={() => confirm(obs)}><BadgeCheck size={14} /> Confirm</button>
              <button className="btn-secondary wrq-delete" onClick={() => remove(obs)}><Trash2 size={14} /> Remove</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
