import { useEffect, useRef, useState } from 'react';
import { BookHeart, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { PATHWAY_STAGES } from '../lib/discipleshipPathway';

// "My story" — a testimony written one paragraph at a time as a disciple walks
// the pathway (John 9:25, "one thing I do know"). Unlocked at experience
// stage 3. Each pathway stage contributes one guided paragraph; the finished
// story is something real to share at the 'shared_testimony' milestone.

const STAGE_PROMPTS = {
  rooted: 'Who were you before — and what changed when you understood you were loved first?',
  rhythms: 'What does walking with God actually look like in your ordinary week now?',
  serving: 'Where has God used your hands — and what did serving teach you?',
  sharing: 'What is the one thing you know — the change only you can testify to?',
  multiplying: 'Who are you passing this on to, and what do you hope for them?',
};

export default function DiscipleshipStory({ session, activeOrgId }) {
  const userId = session?.user?.id;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState({});
  const [shared, setShared] = useState(false);
  const [status, setStatus] = useState('');
  const saveTimer = useRef(null);

  useEffect(() => {
    if (!userId || !activeOrgId) return;
    let cancelled = false;
    supabase
      .from('discipleship_testimonies')
      .select('*')
      .eq('profile_id', userId)
      .eq('organization_id', activeOrgId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setSections(data.sections || {});
          setShared(!!data.shared);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId, activeOrgId]);

  const persist = (nextSections, nextShared) => {
    setStatus('Saving…');
    supabase
      .from('discipleship_testimonies')
      .upsert({
        profile_id: userId,
        organization_id: activeOrgId,
        sections: nextSections,
        shared: nextShared,
        updated_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        setStatus(error ? 'Could not save — try again.' : 'Saved.');
        if (!error) setTimeout(() => setStatus(''), 2000);
      });
  };

  const updateSection = (stageKey, value) => {
    const next = { ...sections, [stageKey]: value };
    setSections(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(next, shared), 900);
  };

  const toggleShared = () => {
    const next = !shared;
    setShared(next);
    persist(sections, next);
  };

  const writtenCount = PATHWAY_STAGES.filter((s) => (sections[s.key] || '').trim()).length;

  return (
    <section className="card disc-story">
      <button type="button" className="disc-story-head" onClick={() => setOpen((cur) => !cur)}>
        <h2><BookHeart size={17} /> My story</h2>
        <span className="disc-muted">
          {writtenCount === 0
            ? 'Start writing your testimony, one paragraph per stage'
            : `${writtenCount} of ${PATHWAY_STAGES.length} chapters written`}
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        loading ? (
          <p className="disc-muted"><Loader2 size={14} className="bl-spin" /> Loading…</p>
        ) : (
          <div className="disc-story-body">
            <p className="disc-muted">
              &ldquo;One thing I do know: I was blind but now I see.&rdquo; (John 9:25) — write one honest
              paragraph per stage of your pathway. By the end you&rsquo;ll have a testimony worth sharing out loud.
            </p>
            {PATHWAY_STAGES.map((stage) => (
              <label key={stage.key}>
                <span>{stage.label}</span>
                <em className="disc-story-prompt">{STAGE_PROMPTS[stage.key]}</em>
                <textarea
                  rows={3}
                  value={sections[stage.key] || ''}
                  onChange={(e) => updateSection(stage.key, e.target.value)}
                  placeholder="A few honest sentences…"
                />
              </label>
            ))}
            <div className="disc-story-foot">
              <label className="disc-share-toggle">
                <input type="checkbox" checked={shared} onChange={toggleShared} />
                Let my discipleship partners read my story
              </label>
              {status && <span className="disc-muted">{status}</span>}
            </div>
          </div>
        )
      )}
    </section>
  );
}
