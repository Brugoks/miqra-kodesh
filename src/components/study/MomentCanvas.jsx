import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Heart, LockKeyhole, Sprout } from 'lucide-react';
import { CanvasSaveError, deleteCanvas, isCanvasSyncAvailable, listCanvases, loadCanvas, saveMoment } from '../../lib/studyCanvas';
import { createMoment, isRevisitDue, JOURNEY_TEXT_MAX } from '../../lib/canvasJourney';
import { projectBoard } from '../../lib/canvasBoard';
import { classifyRecovery } from '../../lib/canvasRecovery';
import { applyBoardOverrideFromUrl, boardEnabled, hideBoard } from '../../lib/canvasFlags';
import useMomentDraft from './useMomentDraft';
import CanvasWorkspace from './board/CanvasWorkspace';
import { recoveryJournal } from './board/useCanvasAutosave';
import './MomentCanvas.css';
import './board/CanvasWorkspace.css';

const formatDate = (value) => new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const CAPTURE_DRAFT = { text: '', days: '7', id: '' };
const REVISIT_LABELS = { 7: 'in a week', 1: 'tomorrow', 30: 'in 30 days', '': 'in your own time' };

function CaptureMoment({ userId, busy, onCapture }) {
  const [draft, setDraft, clearDraft, draftAvailable] = useMomentDraft(`miqra_moment_draft_v1:${userId}`, CAPTURE_DRAFT);
  async function capture(event) {
    event.preventDefault();
    if (!draft.text.trim()) return;
    const candidate = createMoment(draft.text, draft.days);
    candidate.id = draft.id || candidate.id;
    setDraft({ ...draft, id: candidate.id });
    if (await onCapture(candidate)) clearDraft();
  }
  return <section className="moment-capture" aria-labelledby="capture-heading">
    <span className="moment-icon"><Sprout size={26} /></span>
    <h2 id="capture-heading">Capture a glimpse</h2>
    <p>A conversation, an act of kindness, a difficult day. Keep the moment when something about your faith became clearer, then arrange your thoughts around it.</p>
    <form onSubmit={capture}>
      <fieldset disabled={busy}>
        <label htmlFor="moment-text">What's on your mind?</label>
        <textarea id="moment-text" rows={5} required maxLength={JOURNEY_TEXT_MAX} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="Today I noticed…" aria-describedby="moment-capture-hint" />
        <p className="moment-hint" id="moment-capture-hint">A few words are enough. You can add thoughts, Scripture, prayers and questions after saving, and drag them into place.</p>
        <details className="moment-capture__options"><summary>Return {REVISIT_LABELS[draft.days] ?? 'in a week'} · change</summary>
          <label htmlFor="moment-revisit">When would you like to return?</label>
          <select id="moment-revisit" value={draft.days} onChange={(e) => setDraft({ ...draft, days: e.target.value })}>
            <option value="7">In a week</option><option value="1">Tomorrow</option><option value="30">In 30 days</option><option value="">I’ll return on my own</option>
          </select>
          <p className="moment-hint">Your canvas will show when it is time to revisit. No notifications are sent.</p>
        </details>
        <button type="submit" className="btn-primary" disabled={busy || !draft.text.trim()}><Check size={16} /> {busy ? 'Adding to your canvas…' : 'Add to canvas'}</button>
      </fieldset>
    </form>
    <p className="moment-hint"><LockKeyhole size={13} /> Private to you. AI is used only when you choose Pull related Scripture.</p>
    {!draftAvailable && <p role="status" className="moment-warning">This browser cannot keep a draft. Save your glimpse before leaving this page.</p>}
  </section>;
}

const summarize = (canvas, savedAt) => ({ id: canvas.id, title: canvas.title, reference: 'Personal moment', stepCount: 0, savedAt, shared: false, isMoment: true, revisitOn: canvas.journey.revisitOn });

export default function MomentCanvas({ userId, orgId }) {
  const [saved, setSaved] = useState([]);
  const [open, setOpen] = useState(null); // { canvas, recovery, instance }
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all');
  const [boardOn] = useState(() => { applyBoardOverrideFromUrl(); return boardEnabled(); });
  const operation = useRef(false);
  const request = useRef(0);
  const heading = useRef(null);
  const libraryHeading = useRef(null);
  const synced = isCanvasSyncAvailable();

  useEffect(() => {
    let cancelled = false;
    const current = ++request.current;
    listCanvases(userId, orgId).then((items) => { if (!cancelled && current === request.current) setSaved(items.filter((item) => item.isMoment)); })
      .catch(() => { if (!cancelled && current === request.current) setError('Could not load your canvases. Try refreshing the list. Your draft stays here.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; request.current += 1; };
  }, [userId, orgId]);

  const show = (canvas, recovery = null) => {
    setOpen((current) => ({ canvas: boardOn ? canvas : hideBoard(canvas), recovery, instance: (current?.instance ?? 0) + 1 }));
    setTimeout(() => heading.current?.focus(), 0);
  };

  async function refresh() {
    if (operation.current) return;
    request.current += 1;
    operation.current = true; setBusy(true); setError('');
    try { setSaved((await listCanvases(userId, orgId)).filter((item) => item.isMoment)); }
    catch { setError('Could not refresh your canvases. Check your connection and try again.'); }
    finally { operation.current = false; setBusy(false); }
  }

  // The library after a save. Anything still loading is superseded, so a slow first load
  // cannot overwrite the canvas that was just made; if the list cannot be read, the new one still shows.
  async function refreshLibrary(canvas, savedAt) {
    request.current += 1;
    try { setSaved((await listCanvases(userId, orgId)).filter((item) => item.isMoment)); }
    catch { setSaved((items) => [summarize(canvas, savedAt), ...items.filter((item) => item.id !== canvas.id)]); }
  }

  /** A new canvas: its first save is what opens it, so a failure keeps the words where they were typed. */
  async function capture(candidate) {
    if (operation.current) return false;
    request.current += 1;
    operation.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const canvas = boardOn ? { ...candidate, board: projectBoard(candidate).board } : candidate;
      let savedAt;
      try { ({ savedAt } = await saveMoment(userId, orgId, canvas, null)); }
      catch (err) {
        // A retry after a save whose answer was lost finds the canvas already there.
        if (err.code !== 'conflict') throw err;
        const existing = await loadCanvas(userId, orgId, canvas.id);
        savedAt = existing.savedAt;
      }
      await refreshLibrary(canvas, savedAt);
      show({ ...canvas, savedAt });
      return true;
    } catch (err) {
      setError(`Could not save. ${err instanceof CanvasSaveError ? err.message : 'Check your connection and try again.'} Your words are still here; try saving again.`);
      return false;
    } finally { operation.current = false; setBusy(false); }
  }

  // Keeps the library's title and revisit cue in step with what the open canvas has saved.
  // Stable, and a no-op when nothing differs, so reporting a save can never loop.
  const onSaved = useCallback((canvas) => setSaved((items) => {
    const item = items.find((entry) => entry.id === canvas.id);
    if (!item || (item.title === canvas.title && item.revisitOn === canvas.journey.revisitOn)) return items;
    return items.map((entry) => (entry.id === canvas.id ? { ...entry, title: canvas.title, revisitOn: canvas.journey.revisitOn } : entry));
  }), []);

  async function openCanvas(id, afterOpen) {
    if (operation.current) return;
    const current = ++request.current;
    operation.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const item = await loadCanvas(userId, orgId, id);
      if (!item.journey) throw new Error('This canvas could not be opened.');
      // Edits that were committed but never acknowledged: replay, discard, or keep for the person.
      const record = await recoveryJournal().read(userId, id);
      const verdict = classifyRecovery(item, record);
      if (verdict === 'saved') await recoveryJournal().clear(userId, id);
      if (current === request.current) { show(item, verdict === 'restore' || verdict === 'conflict' ? { kind: verdict, record } : null); afterOpen?.(); }
    } catch { if (current === request.current) setError('Could not open this canvas. Check your connection and try again.'); }
    finally { operation.current = false; if (current === request.current) setBusy(false); }
  }

  async function remove(id) {
    if (operation.current) return false;
    request.current += 1;
    operation.current = true; setBusy(true); setError('');
    try {
      const items = await deleteCanvas(userId, orgId, id);
      try {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith(`miqra_moment_entry_v1:${userId}:${id}`) || key.startsWith(`miqra_moment_edit_v1:${userId}:${id}:`) || key === `miqra_canvas_viewport_v1:${userId}:${id}`) localStorage.removeItem(key);
        }
      } catch { /* account deletion succeeded */ }
      await recoveryJournal().clear(userId, id);
      setSaved(items.filter((item) => item.isMoment)); setOpen(null); setNotice('Canvas deleted.');
      return true;
    } catch { setError('Could not delete this canvas. Please try again.'); return false; }
    finally { operation.current = false; setBusy(false); }
  }

  /** The person's edits as a canvas of their own, when the original has moved on or is gone. */
  async function saveCopy(source) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError('');
    try {
      const copy = { ...source, id: crypto.randomUUID(), title: `${source.title} (my copy)`.slice(0, 160), share: { token: null, includeNotes: false } };
      delete copy.savedAt;
      const { savedAt } = await saveMoment(userId, orgId, copy, null);
      await recoveryJournal().clear(userId, source.id);
      await refreshLibrary(copy, savedAt);
      show({ ...copy, savedAt });
      setNotice('Saved as a separate canvas.');
    } catch (err) { setError(`Could not save a copy. ${err instanceof CanvasSaveError ? err.message : 'Check your connection and try again.'}`); }
    finally { operation.current = false; setBusy(false); }
  }

  const dueCount = saved.filter((item) => isRevisitDue(item.revisitOn)).length;
  const visible = saved.filter((item) => filter !== 'due' || isRevisitDue(item.revisitOn));
  const current = open?.canvas;

  // A plain render function, not a component: it closes over the page's state and is
  // used in two places (the page, and the drawer inside an open canvas).
  const libraryList = (afterOpen) => <>
    <div className="moment-view" role="group" aria-label="Filter canvases"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All canvases</button><button aria-pressed={filter === 'due'} onClick={() => setFilter('due')}>To revisit{dueCount ? ` (${dueCount})` : ''}</button></div>
    {loading ? <p role="status">Loading your canvases…</p> : visible.length ? <ul>{visible.map((item) => <li key={item.id}><button disabled={busy} className={item.id === current?.id ? 'current' : ''} onClick={() => openCanvas(item.id, afterOpen)} aria-current={item.id === current?.id ? 'true' : undefined}><strong>{item.title}</strong><small>{isRevisitDue(item.revisitOn) ? 'Ready to revisit' : item.revisitOn ? `Return ${formatDate(item.revisitOn)}` : 'Return in your own time'}</small></button></li>)}</ul> : <p>{filter === 'due' ? 'Nothing waiting for a revisit. You can return to any canvas whenever you like.' : 'Your first glimpse starts here. Once saved, you can return to it anytime.'}</p>}
    <button className="canvas-link" disabled={busy || loading} onClick={refresh}>Refresh canvases</button>
  </>;
  const libraryNote = synced ? 'Private to your account, across devices.' : 'On this device · up to 10 canvases.';

  return <div className={`moment-workspace${current ? ' moment-workspace--open' : ''}`} data-no-scripture>
    <div className={current ? 'moment-intro visually-hidden' : 'moment-intro'}><h1 tabIndex={-1} ref={heading}>Living Canvas</h1>{!current && <p>Keep a glimpse. Arrange your thoughts. Return to see what is growing.</p>}
      {!current && saved.length > 0 && <button className="canvas-link moment-library-shortcut" onClick={() => libraryHeading.current?.focus()}>Return to your canvases{dueCount ? ` · ${dueCount} to revisit` : ` (${saved.length})`}</button>}
    </div>
    {!current && <div className="moment-guide" aria-label="Your canvas journey"><span><b>1</b> Capture a glimpse</span><span><b>2</b> Arrange your thoughts</span><span><b>3</b> Return & deepen</span></div>}
    {error && <div role="alert" className="canvas-error">{error}</div>}
    {notice && <p role="status" className="canvas-notice">{notice}</p>}
    {current
      ? <section className="moment-main moment-main--open" aria-label="Personal canvas" aria-busy={busy}>
        <CanvasWorkspace key={open.instance} initialCanvas={current} userId={userId} orgId={orgId} synced={synced} boardOn={boardOn} recovery={open.recovery}
          onBack={() => { setOpen(null); setNotice(''); setError(''); setTimeout(() => heading.current?.focus(), 0); }}
          onDelete={remove} onReload={() => openCanvas(current.id)} onSaveCopy={saveCopy} onSaved={onSaved}
          library={(close) => <div className="moment-library moment-library--drawer"><p className="moment-hint">{libraryNote}</p>{libraryList(close)}</div>} />
      </section>
      : <div className="moment-layout"><section className="moment-main" aria-label="Personal canvas" aria-busy={busy}>
        <CaptureMoment userId={userId} busy={busy} onCapture={capture} />
      </section><aside className="moment-library" aria-label="Your canvases">
        <h2 tabIndex={-1} ref={libraryHeading}><Heart size={18} /> Your canvases</h2><p className="moment-hint">{libraryNote}</p>
        {libraryList()}
        <div className="moment-library-note"><Sprout size={20} /><p>A question still open. A difficult season. A small step forward. They all belong here.</p></div>
      </aside></div>}
  </div>;
}
