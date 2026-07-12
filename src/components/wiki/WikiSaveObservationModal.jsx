import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Lightbulb, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { loadEntityLinkIndex, matchEntitySegments } from '../../lib/wikiEntityLinker';
import { refToPassageIds, normalizeReference, splitScriptureReferences } from '../../lib/scripture';
import { canAccessLeaderTools } from '../../lib/roles';
import './WikiSaveObservationModal.css';

// Save a piece of text (a Q&A answer, a sermon takeaway) onto a wiki entry as
// an observation — turning good one-off content into the church's permanent
// notes. Entities are suggested from the text itself; observations must cite
// Scripture (same rule as the wiki page form). Leaders' saves are confirmed
// immediately; everyone else's enter the normal review queue.
export default function WikiSaveObservationModal({ session, userRole, activeOrgId, sourceText, contextText = '', onClose, onSaved }) {
  const [index, setIndex] = useState(null);
  const [pickedSlug, setPickedSlug] = useState('');
  const [content, setContent] = useState((sourceText || '').slice(0, 2000));
  // Prefill citations with any scripture references already in the text.
  const [refs, setRefs] = useState(() => {
    const found = splitScriptureReferences(`${contextText} ${sourceText || ''}`)
      .filter((seg) => seg.ref)
      .map((seg) => normalizeReference(seg.ref))
      .filter(Boolean);
    return [...new Set(found)].slice(0, 5);
  });
  const [refInput, setRefInput] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadEntityLinkIndex().then((idx) => { if (!cancelled) setIndex(idx); });
    return () => { cancelled = true; };
  }, []);

  const suggestions = useMemo(() => {
    if (!index) return [];
    const seen = new Set();
    const out = [];
    for (const seg of matchEntitySegments(`${contextText} ${sourceText || ''}`, index)) {
      if (!seg.slug || seen.has(seg.slug)) continue;
      seen.add(seg.slug);
      const entry = index.bySlug.get(seg.slug);
      if (entry) out.push(entry);
      if (out.length >= 8) break;
    }
    return out;
  }, [index, sourceText, contextText]);

  // The first detected entity is the default until the user picks another.
  const entitySlug = pickedSlug || suggestions[0]?.s || '';

  const addRef = () => {
    const raw = refInput.trim();
    if (!raw) return;
    if (!refToPassageIds(raw).length) {
      setError(`“${raw}” doesn't look like a reference (try “John 3:16”).`);
      return;
    }
    const normalized = normalizeReference(raw);
    setError('');
    setRefInput('');
    if (!refs.includes(normalized)) setRefs([...refs, normalized]);
  };

  const save = async () => {
    if (!entitySlug || !content.trim() || !refs.length || saving) return;
    setSaving(true);
    setError('');
    const { data, error: err } = await supabase.from('wiki_observations').insert({
      organization_id: activeOrgId,
      entry_slug: entitySlug,
      user_id: session.user.id,
      content: content.trim().slice(0, 2000),
      refs: refs.slice(0, 10),
    }).select('id').single();
    if (err) {
      setError('Could not save. Please try again.');
      setSaving(false);
      return;
    }
    // Leaders self-confirm — they are the reviewers.
    if (canAccessLeaderTools(userRole) && data?.id) {
      await supabase.from('wiki_observations')
        .update({ status: 'confirmed', confirmed_by: session.user.id, confirmed_at: new Date().toISOString() })
        .eq('id', data.id);
    }
    setSaving(false);
    onSaved?.();
    onClose();
  };

  const entityName = (slug) => index?.bySlug.get(slug)?.name || slug;

  return createPortal(
    <div className="wso-overlay" onClick={onClose}>
      <div className="wso-modal card" onClick={(e) => e.stopPropagation()} data-no-scripture>
        <div className="wso-head">
          <h3><Lightbulb size={16} /> Save to the wiki</h3>
          <button className="wso-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <p className="wso-hint">
          Attach this as an observation on a wiki page, where it stays findable for the whole church.
        </p>

        <label className="wso-label">Which page?</label>
        {suggestions.length > 0 ? (
          <div className="wso-entity-options">
            {suggestions.map((entry) => (
              <button
                key={entry.s}
                type="button"
                className={`wso-entity ${entitySlug === entry.s ? 'active' : ''}`}
                onClick={() => setPickedSlug(entry.s)}
              >
                {entry.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="wso-hint">No wiki names detected in this text — mention a person or place by name.</p>
        )}

        <label className="wso-label">Observation</label>
        <textarea rows={4} maxLength={2000} value={content} onChange={(e) => setContent(e.target.value)} />

        <label className="wso-label">Scripture citations</label>
        <div className="wso-refs-row">
          {refs.map((r) => (
            <span key={r} className="wso-ref-tag">
              {r}
              <button onClick={() => setRefs(refs.filter((x) => x !== r))} aria-label={`Remove ${r}`}><X size={11} /></button>
            </span>
          ))}
          <input
            type="text"
            value={refInput}
            onChange={(e) => { setRefInput(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRef(); } }}
            placeholder={refs.length ? 'Add another' : 'e.g. John 3:16 (required)'}
          />
          <button type="button" className="wso-add-ref" onClick={addRef} disabled={!refInput.trim()}><Plus size={13} /></button>
        </div>

        {error && <p className="wso-error">{error}</p>}
        <div className="wso-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={save}
            disabled={!entitySlug || !content.trim() || !refs.length || saving}
          >
            {saving ? 'Saving…' : `Save to ${entitySlug ? entityName(entitySlug) : 'wiki'}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
