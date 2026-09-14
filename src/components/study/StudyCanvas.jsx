import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Check, Layers3, Loader2, Save, Send, Share2, Square, Trash2 } from 'lucide-react';
import { isAdminRole } from '../../lib/roles';
import { deleteCanvas, isCanvasSyncAvailable, listCanvases, loadCanvas, requestCanvas, saveCanvas, setCanvasSharing } from '../../lib/studyCanvas';
import { DEFAULT_FOCUS, MAX_PASSAGES, MAX_PINS, MAX_STEPS, buildTurns, citedSourceIds, combinedSources, orderTree } from '../../lib/studyCanvasModel';
import CanvasScripture from './CanvasScripture';
import CanvasConnections from './CanvasConnections';
import CanvasPath from './CanvasPath';
import CanvasStep from './CanvasStep';
import CanvasPinboard from './CanvasPinboard';
import CanvasShare from './CanvasShare';
import CanvasHandout from './CanvasHandout';
import { revealCanvasSource } from './canvasDom';
import { usePrintHandout } from './usePrintHandout';
import './StudyCanvas.css';

export default function StudyCanvas({ session, userRole, activeOrgId }) {
  if (!session?.user?.id || !isAdminRole(userRole)) return <div className="card"><h1>Living Study Canvas</h1><p>This feature is available to signed-in admins only.</p></div>;
  return <CanvasWorkspace key={`${session.user.id}:${activeOrgId || ''}`} userId={session.user.id} orgId={activeOrgId} />;
}

const formatSaved = (iso) => {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
};
const clip = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);
const EMPTY = { canvasId: null, title: '', passages: [], steps: [], pins: [] };

function CanvasWorkspace({ userId, orgId }) {
  const [params] = useSearchParams();
  const [reference, setReference] = useState(() => params.get('ref') || 'Mark 2:1–12');
  const [question, setQuestion] = useState(DEFAULT_FOCUS);
  const [passages, setPassages] = useState([]);
  const [steps, setSteps] = useState([]);
  const [pins, setPins] = useState([]);
  const [currentId, setCurrentId] = useState(null); // the step on screen; null follows the newest
  const [studyReference, setStudyReference] = useState('');
  const [title, setTitle] = useState('');
  const [canvasId, setCanvasId] = useState(null);
  const [share, setShare] = useState({ token: null, includeNotes: false });
  const [pendingAsk, setPendingAsk] = useState(null); // { focus, parentId }: what is running, and what Retry re-sends
  const [phase, setPhase] = useState('');
  const [addingPassage, setAddingPassage] = useState(false);
  const [saveState, setSaveState] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedSource, setSelectedSource] = useState(null);
  const [saved, setSaved] = useState([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [opening, setOpening] = useState(null);
  const { printing, print } = usePrintHandout();
  const pending = useRef(null);
  const passageRequest = useRef(null);
  // Async handlers (an answer arriving, an autosave) must see the canvas as it
  // is now, not as it was when they started.
  const latest = useRef(EMPTY);
  useEffect(() => { latest.current = { canvasId, title, passages, steps, pins }; });
  const busy = Boolean(phase);
  const synced = isCanvasSyncAvailable();
  const step = steps.find((s) => s.id === currentId) || steps.at(-1);
  const stepNumber = step ? steps.indexOf(step) + 1 : 0;
  const isLatest = step && step.id === steps.at(-1).id;
  const sources = combinedSources(passages);
  const pinnedIds = new Set(pins.map((pin) => pin.id));
  const canvas = { id: canvasId, title: title.trim() || steps[0]?.explanation.title || '', passages, steps, pins };

  useEffect(() => () => { pending.current?.abort(); passageRequest.current?.abort(); }, []);

  useEffect(() => {
    let cancelled = false;
    listCanvases(userId, orgId)
      .then((items) => { if (!cancelled) setSaved(items); })
      .catch(() => { if (!cancelled) setError('Could not load your saved canvases. Check your connection and reload.'); })
      .finally(() => { if (!cancelled) setSavedLoading(false); });
    return () => { cancelled = true; };
  }, [userId, orgId]);

  async function persist(overrides = {}) {
    const { canvasId: currentCanvas, ...current } = { ...latest.current, ...overrides };
    if (!current.passages.length || !current.steps.length) return;
    const id = currentCanvas || crypto.randomUUID();
    setSaveState('saving');
    try {
      setSaved(await saveCanvas(userId, orgId, { id, ...current }));
      setCanvasId(id); setSaveState('saved');
    } catch {
      setSaveState('error');
      setError(synced ? 'Could not save this canvas to your account. Check your connection and save again.' : 'This browser could not save the canvas. Storage may be full or unavailable.');
    }
  }

  // Once a canvas has been saved, everything that happens to it is recorded.
  const autosave = (overrides) => { if (latest.current.canvasId) persist(overrides); };

  function stop() {
    pending.current?.abort();
    pending.current = null;
    setPhase(''); setPendingAsk(null);
  }

  async function ask(focus, parentId, loadReference = null) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setError(''); setNotice(''); setPendingAsk({ focus, parentId });
    setPhase(loadReference ? 'Loading Scripture and related entries…' : 'Building your explanation…');
    try {
      let runPassages = latest.current.passages;
      if (loadReference) {
        const { workspace } = await requestCanvas({ action: 'sources', reference: loadReference }, controller.signal);
        if (controller.signal.aborted) return;
        runPassages = [workspace];
        latest.current = { ...latest.current, passages: runPassages };
        setPassages(runPassages); setStudyReference(workspace.reference); setReference(workspace.reference);
        setPhase('Building your explanation…');
      }
      const turns = buildTurns(latest.current.steps, parentId, focus);
      const result = await requestCanvas({ action: 'explain', references: runPassages.map((p) => p.reference), turns }, controller.signal);
      if (controller.signal.aborted) return;
      const next = { id: crypto.randomUUID(), parentId, focus, explanation: result.explanation, createdAt: new Date().toISOString(), note: '', cardNotes: {} };
      const nextSteps = [...latest.current.steps, next];
      latest.current = { ...latest.current, steps: nextSteps };
      setSteps(nextSteps); setCurrentId(null); setPendingAsk(null);
      autosave({ passages: runPassages, steps: nextSteps });
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message || 'Could not build this study. Please retry.');
    } finally {
      if (pending.current === controller) { pending.current = null; setPhase(''); }
    }
  }

  function start(event) {
    event.preventDefault();
    if (!reference.trim()) return;
    passageRequest.current?.abort();
    setPassages([]); setSteps([]); setPins([]); setCurrentId(null); setSelectedSource(null); setCanvasId(null); setTitle(''); setSaveState('');
    setShare({ token: null, includeNotes: false });
    latest.current = EMPTY;
    const prompt = question.trim() || DEFAULT_FOCUS;
    setQuestion(''); setStudyReference(reference.trim());
    ask(prompt, null, reference.trim());
  }

  /** Asks from the step on screen. From the newest step that continues the line; from an earlier one it branches. */
  function followUp(text) {
    const focus = text.trim();
    if (!focus || !studyReference) return;
    if (latest.current.steps.length >= MAX_STEPS) { setError(`This canvas has reached ${MAX_STEPS} steps. Start a new study to keep exploring.`); return; }
    setQuestion('');
    // Changing the focus mid-flight replaces that question, so it keeps its place in the tree.
    const parentId = busy && pendingAsk ? pendingAsk.parentId : step?.id ?? null;
    ask(focus, parentId, latest.current.passages.length ? null : studyReference);
  }

  async function addPassage(value) {
    const ref = value.trim();
    if (!ref || busy || latest.current.passages.length >= MAX_PASSAGES) return false;
    passageRequest.current?.abort();
    const controller = new AbortController();
    passageRequest.current = controller;
    setAddingPassage(true); setError(''); setNotice('');
    try {
      const { workspace } = await requestCanvas({ action: 'sources', reference: ref }, controller.signal);
      if (controller.signal.aborted) return false;
      if (latest.current.passages.some((p) => p.reference === workspace.reference)) { setNotice(`${workspace.reference} is already on this canvas.`); return true; }
      const next = [...latest.current.passages, workspace];
      latest.current = { ...latest.current, passages: next };
      setPassages(next);
      setNotice(`Added ${workspace.reference}. Your next question will draw on every passage here.`);
      autosave({ passages: next });
      return true;
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message || 'Could not add that passage.');
      return false;
    } finally {
      if (passageRequest.current === controller) { passageRequest.current = null; setAddingPassage(false); }
    }
  }

  function removePassage(ref) {
    const next = latest.current.passages.filter((p) => p.reference !== ref);
    if (!next.length) return;
    setPassages(next); autosave({ passages: next });
  }

  function updateStep(stepId, patch) {
    setSteps((current) => current.map((s) => (s.id === stepId ? { ...s, ...patch } : s)));
  }

  function togglePin(stepId, cardId) {
    const id = `${stepId}:${cardId}`;
    const current = latest.current.pins;
    const pinned = current.some((pin) => pin.id === id);
    if (!pinned && current.length >= MAX_PINS) { setError(`The pinboard holds ${MAX_PINS} insights. Unpin one to make room.`); return; }
    const next = pinned ? current.filter((pin) => pin.id !== id) : [...current, { id, stepId, cardId }];
    setPins(next); autosave({ pins: next });
  }

  function contrast(a, b) {
    followUp(`Set these two insights side by side. What does each reveal that the other does not, where do they agree, and what does the contrast teach?\n\nA — "${a.card.title}" (step ${a.number}): ${clip(a.card.body, 1100)}\n\nB — "${b.card.title}" (step ${b.number}): ${clip(b.card.body, 1100)}`);
  }

  function relatePassages() {
    followUp(`How do ${passages.map((p) => p.reference).join(' and ')} speak to each other? Where do they agree, and what does setting them side by side reveal that neither shows alone?`);
  }

  async function open(id) {
    stop(); passageRequest.current?.abort(); setOpening(id); setError('');
    try {
      const item = await loadCanvas(userId, orgId, id);
      latest.current = { canvasId: item.id, title: item.title, passages: item.passages, steps: item.steps, pins: item.pins };
      setPassages(item.passages); setSteps(item.steps); setPins(item.pins); setCurrentId(null); setTitle(item.title); setCanvasId(item.id);
      setShare(item.share); setStudyReference(item.passages[0].reference); setReference(item.passages[0].reference);
      setQuestion(''); setNotice('Opened saved canvas.'); setSelectedSource(null); setSaveState('saved');
    } catch (err) {
      setError(err.message || 'Could not open this saved canvas.');
    } finally { setOpening(null); }
  }

  async function remove(item) {
    try {
      setSaved(await deleteCanvas(userId, orgId, item.id));
      if (canvasId === item.id) { setCanvasId(null); setSaveState(''); setShare({ token: null, includeNotes: false }); }
    } catch { setError('Could not delete this saved canvas.'); }
  }

  async function changeSharing(next) {
    try {
      const result = await setCanvasSharing(canvasId, { ...next, currentToken: share.token });
      setShare(result);
      setSaved((items) => items.map((item) => (item.id === canvasId ? { ...item, shared: Boolean(result.token) } : item)));
    } catch { setError('Could not update sharing for this canvas.'); }
  }

  function reveal(id) {
    setSelectedSource(id);
    revealCanvasSource(id);
  }

  function openStep(id) {
    setCurrentId(id === steps.at(-1)?.id ? null : id);
    document.querySelector('.canvas-insights')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const canSave = steps.length > 0 && !busy && saveState !== 'saving';
  const saveLabel = saveState === 'saving' ? 'Saving…' : canvasId && saveState === 'saved' ? 'Saved' : 'Save canvas';
  const branchFrom = step ? orderTree(steps).find((entry) => entry.step.id === step.id)?.branchFrom : null;
  const composeHint = !step ? '' : steps.some((s) => s.parentId === step.id) ? `Asking here starts a new branch from step ${stepNumber}.` : steps.length > 1 ? `Continues from step ${stepNumber}.` : '';

  return <div className="study-canvas" data-no-scripture>
    <header className="canvas-header">
      <div><span className="canvas-eyebrow"><Layers3 size={15} /> ADMIN PREVIEW</span><h1>Living Study Canvas</h1><p>Read the passages. Explore their connections. Follow your questions.</p></div>
      <div className="canvas-save"><button className="btn-secondary" onClick={() => persist()} disabled={!canSave}>{saveLabel === 'Saved' ? <Check size={16} /> : <Save size={16} />} {saveLabel}</button>
        {canvasId && <small>Every step, note and pin is saved{synced ? ' to your account' : ' on this device'}.</small>}</div>
    </header>

    <form className="canvas-start" onSubmit={start}>
      <div><label htmlFor="canvas-reference">Passage</label><input id="canvas-reference" value={reference} maxLength={100} onChange={(event) => setReference(event.target.value)} placeholder="Mark 2:1–12" required /><small>One chapter or a verse range within it · Berean Standard Bible · add more passages once it opens</small></div>
      <button className="btn-primary" type="submit"><BookOpen size={17} /> {studyReference ? 'Start new study' : 'Open canvas'}</button>
    </form>

    <form className="canvas-composer" onSubmit={(event) => { event.preventDefault(); if (studyReference) followUp(question); else start(event); }}>
      <label htmlFor="canvas-question">{studyReference ? 'Where would you like to go next?' : 'What would you like to understand?'}</label>
      <div className="canvas-compose-row"><textarea id="canvas-question" maxLength={3000} rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={busy ? 'Change the focus while your study is being prepared…' : 'Focus on the forgiveness question…'} />
        <button className="btn-primary" type="submit" disabled={!question.trim()}><Send size={16} /> {busy ? 'Change focus' : 'Explore'}</button></div>
      {composeHint && !busy && <small className="canvas-compose-hint">{composeHint}</small>}
      {busy && <div className="canvas-progress" role="status"><Loader2 className="canvas-spin" size={16} /><span>{phase} You can change the focus now.</span><button type="button" className="btn-secondary" onClick={stop}><Square size={13} /> Stop</button></div>}
    </form>

    {error && <div className="canvas-error" role="alert"><span>{error}</span>{pendingAsk && !busy && <button className="btn-secondary" onClick={() => ask(pendingAsk.focus, pendingAsk.parentId, passages.length ? null : studyReference)}>Retry</button>}</div>}
    {notice && <p className="canvas-notice" role="status">{notice}</p>}

    {passages.length ? <div className="canvas-grid">
      <CanvasScripture passages={passages} selectedSource={selectedSource} citedIds={citedSourceIds(steps)} busy={busy} adding={addingPassage} onAdd={addPassage} onRemove={removePassage} onRelate={relatePassages} />

      <section className="canvas-insights" aria-label="Study explanation">
        {step ? <>
          <label className="canvas-name"><span>Canvas name</span><input value={title} maxLength={160} placeholder={steps[0].explanation.title} onChange={(event) => setTitle(event.target.value)}
            onBlur={() => autosave()} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>
          {steps.length > 1 && <CanvasPath steps={steps} currentId={step.id} onSelect={(id) => setCurrentId(id === steps.at(-1).id ? null : id)} />}
          <CanvasStep step={step} number={stepNumber} stepCount={steps.length} branchFrom={branchFrom} isLatest={isLatest} sources={sources} pinnedIds={pinnedIds}
            supersededBy={pendingAsk && pendingAsk.focus !== step.focus ? pendingAsk.focus : ''}
            onReveal={reveal} onPin={togglePin} onNoteChange={updateStep} onNoteCommit={() => autosave()} onAsk={followUp} onBackToLatest={() => setCurrentId(null)} />
        </> : <div className="canvas-card canvas-empty"><Layers3 size={32} /><h2>Your sources are ready</h2><p>{busy ? 'Your explanation will appear here. You can keep reading or change the focus above.' : 'Ask a question to connect the evidence into a study.'}</p></div>}
      </section>

      <CanvasConnections passages={passages} selectedSource={selectedSource} />
    </div> : <section className="canvas-welcome"><Layers3 size={36} /><h2>A place for your next question</h2><p>Open a passage to bring Scripture, people, places, and sourced explanations together.</p><div><button onClick={() => setReference('Mark 2:1–12')}>Mark 2:1–12</button><button onClick={() => setReference('Ruth 1')}>Ruth 1</button><button onClick={() => setReference('1 Corinthians 11:17–34')}>1 Corinthians 11:17–34</button></div></section>}

    <CanvasPinboard steps={steps} pins={pins} busy={busy} onUnpin={togglePin} onContrast={contrast} onOpenStep={openStep} />
    {steps.length > 0 && <CanvasShare key={canvasId || 'unsaved'} canvas={canvas} synced={synced} saved={Boolean(canvasId)} share={share} onShareChange={changeSharing} onPrint={print} />}

    <section className="canvas-saved"><h2>Saved canvases <span>{synced ? 'Synced to your account on every device' : 'On this device · up to 10'}</span></h2>
      {savedLoading ? <p>Loading your canvases…</p> : saved.length ? <div className="canvas-saved-grid">{saved.map((item) => <div key={item.id} className={item.id === canvasId ? 'canvas-saved-current' : ''}>
        <button className="canvas-saved-open" aria-label={`${item.title} ${item.reference}`} disabled={opening === item.id} onClick={() => open(item.id)}><strong>{item.title}</strong>
          <span>{[item.reference, `${item.stepCount} ${item.stepCount === 1 ? 'step' : 'steps'}`, formatSaved(item.savedAt)].filter(Boolean).join(' · ')}</span>
          {item.shared && <span className="canvas-shared-badge"><Share2 size={12} /> Shared</span>}</button>
        <button className="canvas-delete" aria-label={`Delete ${item.title}`} onClick={() => remove(item)}><Trash2 size={16} /></button></div>)}</div>
        : <p>Save a completed canvas to return to it later.</p>}</section>

    {printing && steps.length > 0 && <CanvasHandout canvas={canvas} />}
  </div>;
}
