import { useState } from 'react';
import './Berean.css';
import { supabase } from '../../lib/supabaseClient';
import { FileJson, Copy, Save, ChevronDown, ChevronUp } from 'lucide-react';

function manualPromptText(kit) {
  if (!kit?.prompt) return '';
  return `${kit.prompt}

Return only valid JSON matching this schema:
${JSON.stringify(kit.schema || {}, null, 2)}`;
}

function parseJsonField(value, label) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

function jsonSummary(value, kind) {
  if (!value.trim()) return '';
  try {
    const parsed = parseJsonField(value, 'JSON');
    if (kind === 'extract') {
      const usages = Array.isArray(parsed.usages) ? parsed.usages.length : 0;
      return `${usages} scripture uses detected`;
    }
    if (kind === 'judge') {
      const cards = Array.isArray(parsed.cards) ? parsed.cards.length : 0;
      const dimensions = Array.isArray(parsed.maturity?.dimensions) ? parsed.maturity.dimensions.length : 0;
      return `${cards} judgments · ${dimensions} maturity scores`;
    }
    if (kind === 'illustrations') {
      const groups = Array.isArray(parsed.cardIllustrations) ? parsed.cardIllustrations : [];
      const total = groups.reduce((sum, item) => sum + (Array.isArray(item.illustrations) ? item.illustrations.length : 0), 0);
      return `${total} examples/stories across ${groups.length} cards`;
    }
    return 'Valid JSON';
  } catch {
    return 'Invalid JSON';
  }
}

export default function ManualBereanWorkflow({ talk, report, disabled, onSaved }) {
  const [open, setOpen] = useState(false);
  const [workflow, setWorkflow] = useState('scripture');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [manualModel, setManualModel] = useState('');
  const [extractKit, setExtractKit] = useState(null);
  const [extractJson, setExtractJson] = useState('');
  const [judgeKit, setJudgeKit] = useState(null);
  const [judgeJson, setJudgeJson] = useState('');
  const [illustrationKit, setIllustrationKit] = useState(null);
  const [illustrationJson, setIllustrationJson] = useState('');

  async function invokeManual(mode, payload = {}) {
    setBusy(mode);
    setError('');
    setStatus('');
    const { data, error: fnError } = await supabase.functions.invoke('berean-analysis', {
      body: { talkId: talk.id, mode, ...payload },
    });
    setBusy('');
    if (fnError || data?.error) {
      let message = data?.error || fnError?.message || 'The manual Berean action could not be completed.';
      if (fnError?.context?.json) {
        try { message = (await fnError.context.json())?.error || message; } catch { /* keep default */ }
      }
      setError(message);
      return null;
    }
    return data;
  }

  async function copyKit(kit, label) {
    try {
      await navigator.clipboard.writeText(manualPromptText(kit));
      setStatus(`${label} copied.`);
      setError('');
    } catch {
      setError('Could not copy to clipboard. Select the prompt text and copy it manually.');
    }
  }

  async function prepareExtract() {
    const data = await invokeManual('manual-extract-kit');
    if (data?.kit) {
      setExtractKit(data.kit);
      setStatus('Step 1 ready: copy the extraction prompt.');
    }
  }

  async function prepareJudge() {
    try {
      const extractionResult = parseJsonField(extractJson, 'Extraction result');
      const data = await invokeManual('manual-judge-kit', { extractionResult });
      if (data?.kit) {
        setJudgeKit(data.kit);
        setStatus('Step 3 ready: copy the Scripture judgment prompt.');
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveScripture() {
    try {
      const extractionResult = parseJsonField(extractJson, 'Extraction result');
      const judgmentResult = parseJsonField(judgeJson, 'Scripture judgment result');
      const data = await invokeManual('manual-save-scripture', { extractionResult, judgmentResult, manualModel });
      if (data?.analysis) {
        onSaved(data.analysis, 'scripture');
        setStatus('Manual Scripture report saved.');
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function prepareIllustrations() {
    const data = await invokeManual('manual-illustrations-kit');
    if (data?.kit) {
      setIllustrationKit(data.kit);
      setStatus('Examples & stories prompt ready.');
    }
  }

  async function saveIllustrations() {
    try {
      const illustrationResult = parseJsonField(illustrationJson, 'Examples & stories result');
      const data = await invokeManual('manual-save-illustrations', { illustrationResult, manualModel });
      if (data?.analysis) {
        onSaved(data.analysis, 'illustrations');
        setStatus('Manual examples & stories review saved.');
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="berean-manual card">
      <button className="berean-manual-toggle" onClick={() => setOpen(prev => !prev)}>
        <FileJson size={15} />
        <span>Manual AI import</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="berean-manual-body">
          <div className="berean-manual-tabs" role="tablist" aria-label="Manual Berean import mode">
            <button
              className={workflow === 'scripture' ? 'active' : ''}
              onClick={() => setWorkflow('scripture')}
              type="button"
            >
              Scripture report
            </button>
            <button
              className={workflow === 'examples' ? 'active' : ''}
              onClick={() => setWorkflow('examples')}
              type="button"
              disabled={!report?.cards?.length}
            >
              Examples &amp; stories
            </button>
          </div>

          <label className="berean-manual-model">
            AI model used (kept with the report, e.g. "GPT-5" or "Claude")
            <input
              type="text"
              value={manualModel}
              onChange={e => setManualModel(e.target.value)}
              placeholder="external-subscription"
              maxLength={60}
            />
          </label>

          {workflow === 'scripture' ? (
            <div className="berean-manual-flow">
              <div className="berean-manual-step">
                <div className="berean-manual-step-head">
                  <span>1. Copy extraction prompt</span>
                  <button className="btn-secondary berean-manual-btn" onClick={prepareExtract} disabled={disabled || !!busy}>
                    <FileJson size={13} /> {busy === 'manual-extract-kit' ? 'Preparing…' : 'Prepare'}
                  </button>
                </div>
                {extractKit && (
                  <>
                    <p className="berean-manual-hint">{extractKit.expectedOutput}</p>
                    <button className="btn-secondary berean-manual-copy" onClick={() => copyKit(extractKit, 'Extraction prompt')}>
                      <Copy size={13} /> Copy extraction prompt
                    </button>
                    <textarea className="berean-manual-prompt" value={manualPromptText(extractKit)} readOnly rows={8} />
                  </>
                )}
              </div>

              <div className="berean-manual-step">
                <div className="berean-manual-step-head">
                  <span>2. Paste extraction response</span>
                  {extractJson.trim() && <em>{jsonSummary(extractJson, 'extract')}</em>}
                </div>
                <textarea
                  className="berean-manual-json"
                  value={extractJson}
                  onChange={e => {
                    setExtractJson(e.target.value);
                    setJudgeKit(null);
                  }}
                  placeholder="Paste the extraction JSON returned by your AI tool"
                  rows={7}
                />
                <button className="btn-secondary berean-manual-btn" onClick={prepareJudge} disabled={disabled || !!busy || !extractJson.trim()}>
                  <FileJson size={13} /> {busy === 'manual-judge-kit' ? 'Building…' : 'Build grounded judgment prompt'}
                </button>
              </div>

              <div className="berean-manual-step">
                <div className="berean-manual-step-head">
                  <span>3. Copy judgment prompt</span>
                </div>
                {judgeKit ? (
                  <>
                    <p className="berean-manual-hint">{judgeKit.expectedOutput}</p>
                    <button className="btn-secondary berean-manual-copy" onClick={() => copyKit(judgeKit, 'Judgment prompt')}>
                      <Copy size={13} /> Copy judgment prompt
                    </button>
                    <textarea className="berean-manual-prompt" value={manualPromptText(judgeKit)} readOnly rows={8} />
                  </>
                ) : (
                  <p className="berean-manual-hint">Paste extraction JSON first, then build this prompt. The app will fetch the real Bible passages before creating it.</p>
                )}
              </div>

              <div className="berean-manual-step">
                <div className="berean-manual-step-head">
                  <span>4. Paste judgment response and save</span>
                  {judgeJson.trim() && <em>{jsonSummary(judgeJson, 'judge')}</em>}
                </div>
                <textarea
                  className="berean-manual-json"
                  value={judgeJson}
                  onChange={e => setJudgeJson(e.target.value)}
                  placeholder="Paste the Scripture judgment JSON returned by your AI tool"
                  rows={7}
                />
                <button
                  className="btn-primary berean-manual-save"
                  onClick={saveScripture}
                  disabled={disabled || !!busy || !extractJson.trim() || !judgeJson.trim()}
                >
                  <Save size={13} /> {busy === 'manual-save-scripture' ? 'Saving…' : 'Save Scripture report'}
                </button>
              </div>
            </div>
          ) : (
            <div className="berean-manual-flow">
              <div className="berean-manual-step">
                <div className="berean-manual-step-head">
                  <span>1. Copy examples prompt</span>
                  <button className="btn-secondary berean-manual-btn" onClick={prepareIllustrations} disabled={disabled || !!busy || !report?.cards?.length}>
                    <FileJson size={13} /> {busy === 'manual-illustrations-kit' ? 'Preparing…' : 'Prepare'}
                  </button>
                </div>
                {illustrationKit && (
                  <>
                    <p className="berean-manual-hint">{illustrationKit.expectedOutput}</p>
                    <button className="btn-secondary berean-manual-copy" onClick={() => copyKit(illustrationKit, 'Examples prompt')}>
                      <Copy size={13} /> Copy examples prompt
                    </button>
                    <textarea className="berean-manual-prompt" value={manualPromptText(illustrationKit)} readOnly rows={8} />
                  </>
                )}
              </div>

              <div className="berean-manual-step">
                <div className="berean-manual-step-head">
                  <span>2. Paste examples response and save</span>
                  {illustrationJson.trim() && <em>{jsonSummary(illustrationJson, 'illustrations')}</em>}
                </div>
                <textarea
                  className="berean-manual-json"
                  value={illustrationJson}
                  onChange={e => setIllustrationJson(e.target.value)}
                  placeholder="Paste the Examples & stories JSON returned by your AI tool"
                  rows={7}
                />
                <button
                  className="btn-primary berean-manual-save"
                  onClick={saveIllustrations}
                  disabled={disabled || !!busy || !report?.cards?.length || !illustrationJson.trim()}
                >
                  <Save size={13} /> {busy === 'manual-save-illustrations' ? 'Saving…' : 'Save examples & stories'}
                </button>
              </div>
            </div>
          )}

          {status && <p className="berean-manual-status">{status}</p>}
          {error && <p className="berean-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
