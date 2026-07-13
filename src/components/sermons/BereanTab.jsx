import { useState, useEffect, useCallback } from 'react';
import './Berean.css';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';
import {
  BookOpenCheck, RefreshCw, ShieldQuestion, CheckCircle2, HelpCircle,
  AlertTriangle, ChevronDown, ChevronUp, Quote,
} from 'lucide-react';
import { getMaturityBand, maturityPercent } from './talkUtils';
import { isAdminRole } from '../../lib/roles';
import ManualBereanWorkflow from './ManualBereanWorkflow';

const USAGE_LABELS = {
  verbatim: { label: 'Verbatim quote', className: 'usage-verbatim' },
  paraphrase: { label: 'Paraphrase', className: 'usage-paraphrase' },
  allusion: { label: 'Indirect Scripture reference', className: 'usage-allusion' },
  'uncited-claim': { label: 'Uncited claim', className: 'usage-uncited' },
};

const ASSESSMENT_LABELS = {
  aligned: { label: 'Aligned', className: 'assess-aligned' },
  'context-caution': { label: 'Context caution', className: 'assess-caution' },
  misquote: { label: 'Misquote', className: 'assess-flag' },
  unsupported: { label: 'Unsupported', className: 'assess-flag' },
  'disputed-secondary': { label: 'Denominational distinctive', className: 'assess-disputed' },
  unverified: { label: 'Unverified', className: 'assess-unverified' },
};

const ILLUSTRATION_LABELS = {
  'clarifies-text': { label: 'Clarifies the text', className: 'illustration-positive' },
  'applies-text': { label: 'Applies the text', className: 'illustration-positive' },
  'overextends-text': { label: 'Overextends the text', className: 'illustration-caution' },
  'distracts-from-text': { label: 'Distracts from the text', className: 'illustration-caution' },
  'reframes-text': { label: 'Reframes the text', className: 'illustration-flag' },
  'unsupported-spiritual-claim': { label: 'Unsupported spiritual claim', className: 'illustration-flag' },
  unverified: { label: 'Unverified', className: 'illustration-unverified' },
};

const VERDICT_OPTIONS = [
  { value: 'sound', label: 'Sound', Icon: CheckCircle2, className: 'verdict-sound' },
  { value: 'discuss', label: 'Discuss', Icon: HelpCircle, className: 'verdict-discuss' },
  { value: 'concern', label: 'Concern', Icon: AlertTriangle, className: 'verdict-concern' },
];

function MaturityMeter({ maturity }) {
  const band = getMaturityBand(maturity.overall);
  return (
    <div className="berean-meter card">
      <div className="berean-meter-header">
        <h3>Milk → Solid Food</h3>
        {band && (
          <span className="berean-band-chip" style={{ color: band.color, background: band.bg }}>
            {band.label} · {maturity.overall.toFixed(1)}/5
          </span>
        )}
      </div>
      <div className="berean-meter-track">
        <div className="berean-meter-marker" style={{ left: `${maturityPercent(maturity.overall)}%` }} />
      </div>
      <div className="berean-meter-scale">
        <span>Milk</span>
        <span>Transitional</span>
        <span>Solid food</span>
      </div>
      {maturity.overallNote && <p className="berean-meter-note">{maturity.overallNote}</p>}

      <div className="berean-dimensions">
        {maturity.dimensions.map(dimension => {
          const dimBand = getMaturityBand(dimension.score);
          return (
            <MaturityDimension key={dimension.key} dimension={dimension} band={dimBand} />
          );
        })}
      </div>
      <p className="berean-meter-footnote">
        Per Hebrews 5:12–14 · milk is not a flaw (1 Pet 2:2) — this profile describes audience fit, not quality.
      </p>
    </div>
  );
}

function MaturityDimension({ dimension, band }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="berean-dimension">
      <button className="berean-dimension-row" onClick={() => setOpen(prev => !prev)}>
        <span className="berean-dimension-label">{dimension.label}</span>
        <span className="berean-dimension-bar">
          {[1, 2, 3, 4, 5].map(step => (
            <span
              key={step}
              className={`berean-dimension-seg ${step <= dimension.score ? 'filled' : ''}`}
              style={step <= dimension.score && band ? { background: band.color } : undefined}
            />
          ))}
        </span>
        {band && <span className="berean-dimension-band" style={{ color: band.color }}>{band.label}</span>}
        {dimension.evidence?.length > 0 && (open ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
      </button>
      {open && (
        <div className="berean-dimension-detail">
          {dimension.note && <p>{dimension.note}</p>}
          {dimension.evidence?.map((quote, index) => (
            <blockquote key={index}><Quote size={11} /> {quote}</blockquote>
          ))}
        </div>
      )}
    </div>
  );
}

function IllustrationAlignment({ illustrations }) {
  if (!illustrations?.length) return null;

  return (
    <div className="berean-illustrations">
      <p className="berean-illustrations-title">Examples &amp; stories</p>
      {illustrations.map((illustration) => {
        const alignment = ILLUSTRATION_LABELS[illustration.alignment] || ILLUSTRATION_LABELS.unverified;
        return (
          <div className="berean-illustration" key={illustration.id}>
            <div className="berean-illustration-header">
              <span className={`berean-illustration-badge ${alignment.className}`}>
                {alignment.label}
              </span>
              <span className="berean-confidence">AI confidence: {illustration.confidence}</span>
            </div>
            <blockquote className="berean-illustration-excerpt">“{illustration.excerpt}”</blockquote>
            {illustration.claimSupported && (
              <p className="berean-illustration-claim">
                <strong>Used to support:</strong> {illustration.claimSupported}
              </p>
            )}
            {illustration.explanation && (
              <p className="berean-illustration-note">{illustration.explanation}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AlignmentCard({ card, verdicts, myVerdict, onVerdict, savingVerdict }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [draftNote, setDraftNote] = useState('');
  const [noteTouched, setNoteTouched] = useState(false);
  const usage = USAGE_LABELS[card.usageType] || USAGE_LABELS.allusion;
  const assessment = ASSESSMENT_LABELS[card.assessment] || ASSESSMENT_LABELS.unverified;
  const otherVerdicts = verdicts.filter(v => v.user_id !== myVerdict?.user_id || !myVerdict);
  // Until the leader edits the note here, the saved note is the source of
  // truth — verdicts can load after mount, and a verdict click must never
  // overwrite an existing note with an empty draft.
  const note = noteTouched ? draftNote : (myVerdict?.note || '');

  return (
    <div className="berean-card card">
      <div className="berean-card-badges">
        <span className={`berean-badge ${usage.className}`}>{usage.label}</span>
        <span className={`berean-badge ${assessment.className}`}>{assessment.label}</span>
        <span className="berean-confidence">AI confidence: {card.confidence}</span>
        {card.quoteMatch != null && card.quoteMatch < 0.6 && (
          <span className="berean-badge assess-flag">Weak text match ({Math.round(card.quoteMatch * 100)}%)</span>
        )}
        {card.quoteVerified === false && (
          <span className="berean-badge assess-flag">Quote not found in transcript</span>
        )}
      </div>

      <div className="berean-card-columns">
        <div className="berean-col">
          <p className="berean-col-title">What the speaker said</p>
          <blockquote className="berean-speaker-quote">“{card.transcriptQuote}”</blockquote>
          {card.claimSummary && <p className="berean-claim">{card.claimSummary}</p>}
        </div>
        <div className="berean-col">
          <p className="berean-col-title">
            What the text says{card.passageReference ? ` — ${card.passageReference}` : ''}
            {card.translation ? ` (${String(card.translation).toUpperCase()})` : ''}
          </p>
          {card.passageText ? (
            <blockquote className="berean-passage">{card.passageText}</blockquote>
          ) : (
            <p className="berean-passage-missing">
              No passage could be fetched{card.reference ? ` for “${card.reference}”` : ''} — examine this one manually.
            </p>
          )}
        </div>
      </div>

      <p className="berean-explanation">{card.explanation}</p>

      <IllustrationAlignment illustrations={card.illustrations} />

      <div className="berean-verdict-row">
        {VERDICT_OPTIONS.map(({ value, label, Icon, className }) => (
          <button
            key={value}
            className={`berean-verdict-btn ${className} ${myVerdict?.verdict === value ? 'active' : ''}`}
            disabled={savingVerdict}
            onClick={() => onVerdict(card.id, value, note)}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
        <button className="berean-note-toggle" onClick={() => setNoteOpen(prev => !prev)}>
          {noteOpen ? 'Hide note' : myVerdict?.note ? 'Edit note' : 'Add note'}
        </button>
      </div>
      {noteOpen && (
        <div className="berean-note-editor">
          <textarea
            value={note}
            onChange={e => {
              setDraftNote(e.target.value);
              setNoteTouched(true);
            }}
            placeholder="Private to leaders — why this verdict?"
            rows={2}
          />
          <button
            className="btn-secondary"
            disabled={savingVerdict || !myVerdict}
            onClick={() => onVerdict(card.id, myVerdict.verdict, note)}
          >
            Save note
          </button>
        </div>
      )}
      {otherVerdicts.length > 0 && (
        <p className="berean-other-verdicts">
          {otherVerdicts.map(v => `${v.user_name || 'Leader'}: ${v.verdict}${v.note ? ` — “${v.note}”` : ''}`).join(' · ')}
        </p>
      )}
    </div>
  );
}

export default function BereanTab({ talk, session, activeOrgId, userRole }) {
  const userId = session?.user?.id;
  const userName = session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name
    || session?.user?.email?.split('@')[0]
    || 'Leader';
  const isConfigured = hasSupabaseConfig && !!userId;
  const isAdmin = isAdminRole(userRole);

  const [analysis, setAnalysis] = useState(null);
  const [verdicts, setVerdicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState('');
  const [savingVerdict, setSavingVerdict] = useState(false);
  const [error, setError] = useState('');

  const loadVerdicts = useCallback(async (analysisId) => {
    const { data } = await supabase
      .from('sermon_talk_berean_verdicts')
      .select('*')
      .eq('analysis_id', analysisId);
    setVerdicts(data || []);
  }, []);

  useEffect(() => {
    if (!isConfigured || !talk?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('sermon_talk_berean')
        .select('*')
        .eq('talk_id', talk.id)
        .maybeSingle();
      if (cancelled) return;
      setAnalysis(data || null);
      setLoading(false);
      if (data) await loadVerdicts(data.id);
    })();
    return () => { cancelled = true; };
  }, [isConfigured, talk?.id, loadVerdicts]);

  async function handleRun(mode = 'scripture') {
    setRunning(mode);
    setError('');
    const { data, error: fnError } = await supabase.functions.invoke('berean-analysis', {
      body: { talkId: talk.id, mode },
    });
    if (fnError || data?.error) {
      let message = data?.error || fnError?.message || 'The analysis could not be completed. Please try again.';
      if (fnError?.context?.json) {
        try { message = (await fnError.context.json())?.error || message; } catch { /* keep default */ }
      }
      setError(message);
    } else if (data?.analysis) {
      setAnalysis(data.analysis);
      if (mode === 'scripture') setVerdicts([]);
    }
    setRunning('');
  }

  function handleManualSaved(savedAnalysis, mode) {
    setAnalysis(savedAnalysis);
    setError('');
    if (mode === 'scripture') setVerdicts([]);
  }

  async function handleVerdict(cardId, verdict, note) {
    setSavingVerdict(true);
    const { data, error: upsertError } = await supabase
      .from('sermon_talk_berean_verdicts')
      .upsert({
        analysis_id: analysis.id,
        organization_id: activeOrgId,
        card_id: cardId,
        user_id: userId,
        user_name: userName,
        verdict,
        note: note?.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'analysis_id,card_id,user_id' })
      .select()
      .single();
    if (!upsertError && data) {
      setVerdicts(prev => [...prev.filter(v => !(v.card_id === cardId && v.user_id === userId)), data]);
    }
    setSavingVerdict(false);
  }

  if (loading) {
    return <p className="berean-loading">Loading Berean review…</p>;
  }

  const report = analysis?.report;
  const hasTranscript = !!talk?.transcript && talk.transcript.trim().length >= 200;

  return (
    <div className="berean-tab">
      <div className="berean-intro">
        <BookOpenCheck size={18} />
        <p>
          <strong>Berean review</strong> — every scripture use in this talk, laid beside the actual text
          so you can examine it yourself (Acts 17:11). Visible to leaders only.
        </p>
      </div>

      {!hasTranscript ? (
        <div className="empty-state">
          <ShieldQuestion size={40} style={{ marginBottom: '0.75rem', opacity: 0.3 }} />
          <p>Add a transcript to this talk (Edit → Transcript) to run a Berean review.</p>
        </div>
      ) : !report ? (
        <div className="empty-state">
          <ShieldQuestion size={40} style={{ marginBottom: '0.75rem', opacity: 0.3 }} />
          <p>This talk has not been reviewed yet. The analysis takes about a minute.</p>
          <div className="berean-run-actions">
            <button
              className="btn-primary berean-run-btn"
              onClick={() => handleRun('scripture')}
              disabled={!!running || !isConfigured}
            >
              <RefreshCw size={14} className={running === 'scripture' ? 'berean-spin' : ''} />
              {running === 'scripture' ? 'Examining the Scriptures…' : 'Run Scripture review'}
            </button>
            <button className="btn-secondary berean-run-btn" disabled>
              Run Examples &amp; stories after Scripture review
            </button>
          </div>
          {error && <p className="berean-error">{error}</p>}
          {isAdmin && (
            <ManualBereanWorkflow
              talk={talk}
              report={report}
              disabled={!isConfigured}
              onSaved={handleManualSaved}
            />
          )}
        </div>
      ) : (
        <>
          <div className="berean-summary-strip">
            {[
              [report.summary.stats.total, 'scripture uses'],
              [report.summary.stats.verbatim, 'verbatim'],
              [report.summary.stats.paraphrase, 'paraphrase'],
              [report.summary.stats.allusion, 'indirect references'],
              [report.summary.stats.uncited, 'uncited claims'],
              [report.summary.stats.illustrations || 0, 'examples/stories'],
              [report.summary.stats.flagged, 'flagged'],
            ].map(([count, label]) => (
              <span key={label} className={`berean-stat ${label === 'flagged' && count > 0 ? 'berean-stat-flagged' : ''}`}>
                <strong>{count}</strong> {label}
              </span>
            ))}
            <div className="berean-rerun-actions">
              <button
                className="btn-secondary berean-rerun"
                onClick={() => handleRun('scripture')}
                disabled={!!running}
              >
                <RefreshCw size={13} className={running === 'scripture' ? 'berean-spin' : ''} />
                {running === 'scripture' ? 'Re-running Scripture…' : 'Re-run Scripture'}
              </button>
              <button
                className="btn-secondary berean-rerun"
                onClick={() => handleRun('illustrations')}
                disabled={!!running}
              >
                <RefreshCw size={13} className={running === 'illustrations' ? 'berean-spin' : ''} />
                {running === 'illustrations' ? 'Reviewing examples…' : 'Run Examples & stories'}
              </button>
            </div>
          </div>
          {error && <p className="berean-error">{error}</p>}
          {isAdmin && (
            <ManualBereanWorkflow
              talk={talk}
              report={report}
              disabled={!isConfigured}
              onSaved={handleManualSaved}
            />
          )}
          {report.summary.thesis && (
            <p className="berean-thesis">
              <strong>Thesis:</strong> {report.summary.thesis}
              {report.summary.mainReference ? ` (${report.summary.mainReference})` : ''}
            </p>
          )}
          {report.summary.truncated && (
            <p className="berean-error">This transcript was longer than the review limit — only the first portion was analyzed.</p>
          )}

          <MaturityMeter maturity={report.maturity} />

          {report.cards.map(card => (
            <AlignmentCard
              key={card.id}
              card={card}
              verdicts={verdicts.filter(v => v.card_id === card.id)}
              myVerdict={verdicts.find(v => v.card_id === card.id && v.user_id === userId) || null}
              onVerdict={handleVerdict}
              savingVerdict={savingVerdict}
            />
          ))}

          <p className="berean-disclaimer">{report.disclaimer}</p>
        </>
      )}
    </div>
  );
}
