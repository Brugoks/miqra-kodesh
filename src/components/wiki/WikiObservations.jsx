import { useState, useEffect } from 'react';
import { BadgeCheck, Clock, Trash2, Plus, X, Lightbulb } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';
import { canAccessLeaderTools, isAdminRole } from '../../lib/roles';
import { refToPassageIds, normalizeReference } from '../../lib/scripture';

const openScripture = (ref) =>
  window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref } }));

// Community observations on a wiki entry. Every observation must cite at least
// one passage (also enforced by a DB check constraint); leaders confirm
// entries to give them the org-visible badge.
export default function WikiObservations({ session, userRole, activeOrgId, entrySlug, entryName }) {
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [content, setContent] = useState('');
  const [refs, setRefs] = useState([]);
  const [refInput, setRefInput] = useState('');
  const [refError, setRefError] = useState('');
  const [saving, setSaving] = useState(false);

  const canUse = hasSupabaseConfig && session && activeOrgId;
  const isLeader = canAccessLeaderTools(userRole);
  const isAdmin = isAdminRole(userRole);

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    if (!canUse) return undefined;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from('wiki_observations')
        .select('*, author:profiles!wiki_observations_user_id_fkey(full_name)')
        .eq('organization_id', activeOrgId)
        .eq('entry_slug', entrySlug)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (err) setError('Could not load observations.');
      else setObservations(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [canUse, activeOrgId, entrySlug, refreshKey]);

  const addRef = () => {
    const raw = refInput.trim();
    if (!raw) return;
    if (!refToPassageIds(raw).length) {
      setRefError(`“${raw}” doesn't look like a reference (try “John 3:16” or “Genesis 12”).`);
      return;
    }
    const normalized = normalizeReference(raw);
    setRefError('');
    setRefInput('');
    if (!refs.includes(normalized)) setRefs([...refs, normalized]);
  };

  const submit = async () => {
    if (!content.trim() || !refs.length || saving) return;
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('wiki_observations').insert({
      organization_id: activeOrgId,
      entry_slug: entrySlug,
      user_id: session.user.id,
      content: content.trim(),
      refs,
    });
    if (err) {
      setError('Could not save your observation. Please try again.');
    } else {
      setContent('');
      setRefs([]);
      refresh();
    }
    setSaving(false);
  };

  const setStatus = async (obs, status) => {
    const patch = status === 'confirmed'
      ? { status, confirmed_by: session.user.id, confirmed_at: new Date().toISOString() }
      : { status: 'pending', confirmed_by: null, confirmed_at: null };
    const { error: err } = await supabase.from('wiki_observations').update(patch).eq('id', obs.id);
    if (!err) refresh();
  };

  const remove = async (obs) => {
    const { error: err } = await supabase.from('wiki_observations').delete().eq('id', obs.id);
    if (!err) setObservations((prev) => prev.filter((o) => o.id !== obs.id));
  };

  return (
    <section className="wo-section">
      <h2 className="bw-section-title"><Lightbulb size={15} /> What your church has noticed</h2>
      <p className="bw-section-hint">
        Share something you noticed about {entryName} in the text. Every observation cites
        Scripture; leaders confirm observations for the whole church.
      </p>

      {!canUse && (
        <p className="wo-signin-note">Sign in to read and share your church's observations.</p>
      )}

      {canUse && (
        <div className="wo-form" data-no-scripture>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`What does the text show about ${entryName}?`}
            rows={3}
            maxLength={2000}
          />
          <div className="wo-refs-row">
            {refs.map((r) => (
              <span key={r} className="wo-ref-tag">
                {r}
                <button onClick={() => setRefs(refs.filter((x) => x !== r))} aria-label={`Remove ${r}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={refInput}
              onChange={(e) => { setRefInput(e.target.value); setRefError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRef(); } }}
              placeholder={refs.length ? 'Add another reference' : 'Cite a passage — e.g. Exodus 4:14'}
            />
            <button className="wo-add-ref" onClick={addRef} disabled={!refInput.trim()}>
              <Plus size={14} /> Add
            </button>
          </div>
          {refError && <p className="wo-error">{refError}</p>}
          <div className="wo-form-footer">
            <span className="wo-cite-hint">
              {refs.length ? '' : 'At least one scripture reference is required.'}
            </span>
            <button
              className="wo-submit"
              onClick={submit}
              disabled={!content.trim() || !refs.length || saving}
            >
              {saving ? 'Sharing…' : 'Share observation'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="wo-error">{error}</p>}
      {loading && canUse && <p className="wo-muted">Loading observations…</p>}
      {!loading && canUse && !observations.length && (
        <p className="wo-muted">No observations yet — be the first to add one.</p>
      )}

      <ul className="wo-list">
        {observations.map((obs) => {
          const mine = obs.user_id === session?.user?.id;
          return (
            <li key={obs.id} className={`wo-item ${obs.status}`}>
              <p className="wo-content">{obs.content}</p>
              <div className="wo-refs">
                {(obs.refs || []).map((r) => (
                  <button key={r} className="bw-ref-chip" onClick={() => openScripture(r)}>{r}</button>
                ))}
              </div>
              <div className="wo-meta">
                <span className="wo-author">{obs.author?.full_name || 'Someone'}</span>
                <span className="wo-date">{new Date(obs.created_at).toLocaleDateString()}</span>
                {obs.status === 'confirmed' ? (
                  <span className="wo-badge confirmed"><BadgeCheck size={13} /> Confirmed</span>
                ) : (
                  <span className="wo-badge pending"><Clock size={13} /> Awaiting review</span>
                )}
                <span className="wo-actions">
                  {isLeader && obs.status === 'pending' && (
                    <button className="wo-action" onClick={() => setStatus(obs, 'confirmed')}>Confirm</button>
                  )}
                  {isLeader && obs.status === 'confirmed' && (
                    <button className="wo-action" onClick={() => setStatus(obs, 'pending')}>Unconfirm</button>
                  )}
                  {(mine || isAdmin) && (
                    <button className="wo-action danger" onClick={() => remove(obs)} aria-label="Delete observation">
                      <Trash2 size={13} />
                    </button>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
