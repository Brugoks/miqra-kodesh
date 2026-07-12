import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, FileText } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';
import { formatYearRange } from '../../lib/bibleWiki';
import { CODE_TO_NAME } from '../../lib/scripture';

// Leader tool: a printable one-page study handout generated from an entry's
// foundation data — facts, story arc, key verses, family, the org's confirmed
// observations, and discussion questions. No LLM involved; everything on the
// page is either Scripture-derived data or the church's own reviewed notes.
export default function WikiStudyPack({ entry, activeOrgId, onClose }) {
  const [observations, setObservations] = useState([]);

  useEffect(() => {
    if (!hasSupabaseConfig || !activeOrgId) return undefined;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('wiki_observations')
        .select('content, refs')
        .eq('organization_id', activeOrgId)
        .eq('entry_slug', entry.s)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false })
        .limit(6);
      if (!cancelled && data) setObservations(data);
    })();
    return () => { cancelled = true; };
  }, [entry.s, activeOrgId]);

  const isPerson = entry.type === 'person';
  const firstBook = entry.fv ? CODE_TO_NAME[entry.fv.split('.')[0]] : null;
  const era = entry.y ? formatYearRange(entry.y) : null;

  const questions = [
    entry.arc?.length
      ? `Which moment in ${entry.name}'s story stands out to you most, and why?`
      : `What stands out to you most about ${entry.name} in the passages you read?`,
    isPerson
      ? `What does ${entry.name}'s story reveal about God's character?`
      : `What happened at ${entry.name}, and what does it show about God's purposes?`,
    isPerson
      ? `Where do you see yourself in ${entry.name}'s story — the faith, the failure, or both?`
      : `Why do you think God's story keeps returning to ${entry.name}?`,
    'What is one concrete way this changes how you live this week?',
  ];

  return createPortal(
    <div className="wsp-overlay" onClick={onClose}>
      <div className="wsp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wsp-toolbar wsp-noprint">
          <span className="wsp-toolbar-title"><FileText size={15} /> Study pack</span>
          <div className="wsp-toolbar-actions">
            <button className="btn-primary" onClick={() => window.print()}><Printer size={14} /> Print</button>
            <button className="wsp-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
        </div>

        <div className="wsp-page" id="wiki-study-pack">
          <header className="wsp-header">
            <h1>{entry.name}</h1>
            <p className="wsp-subtitle">
              {isPerson ? 'A person of Scripture' : entry.type === 'event' ? 'An event of Scripture' : 'A place of Scripture'}
              {era ? ` · lived ${era} (traditional dating)` : ''}
              {firstBook ? ` · first appears in ${firstBook}` : ''}
            </p>
          </header>

          {entry.desc && <p className="wsp-desc">{entry.desc}</p>}
          {entry.nm && <p className="wsp-meaning"><strong>Name:</strong> {entry.nm}</p>}

          {entry.arc?.length > 0 && (
            <section>
              <h2>The story in {entry.arc.length} readings</h2>
              <ol className="wsp-arc">
                {entry.arc.map((step) => (
                  <li key={step.r}><strong>{step.t}</strong> — {step.r}</li>
                ))}
              </ol>
            </section>
          )}

          {entry.kv?.length > 0 && (
            <section>
              <h2>Verses worth memorizing</h2>
              <p>{entry.kv.join(' · ')}</p>
            </section>
          )}

          {observations.length > 0 && (
            <section>
              <h2>What our church has noticed</h2>
              <ul className="wsp-observations">
                {observations.map((o, i) => (
                  <li key={i}>{o.content} <em>({(o.refs || []).join('; ')})</em></li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2>Discussion questions</h2>
            <ol className="wsp-questions">
              {questions.map((q) => <li key={q}>{q}</li>)}
            </ol>
          </section>

          <footer className="wsp-footer">
            Generated from the Bible Wiki · foundation data: Theographic Bible Metadata &amp; OpenBible.info (CC-BY)
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}
