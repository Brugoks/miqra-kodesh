import { Suspense, lazy, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Cloud, CloudOff, Library, List, Loader2, Settings, LayoutGrid } from 'lucide-react';
import { boardRecoveryJson } from '../../../lib/canvasBoard';
import { recoveryJournal } from './useCanvasAutosave';
import useCanvasAutosave from './useCanvasAutosave';
import useCanvasDocument from './useCanvasDocument';
import CanvasOutline from './CanvasOutline';
import CanvasSettings from './CanvasSettings';
import DetailsShell from './DetailsShell';
import { downloadText } from './download';

// The board (React Flow and its styles) is a separate chunk: a phone that lives
// in Outline, or a person who only reads, never downloads it.
const LivingCanvasBoard = lazy(() => import('./LivingCanvasBoard'));

const VIEW_KEY = (userId) => `miqra_canvas_view_v1:${userId}`;
const isPhone = () => { try { return Boolean(window.matchMedia?.('(max-width: 760px)').matches); } catch { return false; } };
const isTyping = (target) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

// Desktop opens a new board as a canvas; a phone, and anyone who has only ever
// had the story, opens Outline. A choice made on this device is remembered.
function initialMode(userId, boardOn, canvas) {
  if (!boardOn) return 'outline';
  try {
    const stored = localStorage.getItem(VIEW_KEY(userId));
    if (stored === 'canvas' || stored === 'outline') return stored;
  } catch { /* fall through to the default */ }
  return !isPhone() && canvas.board ? 'canvas' : 'outline';
}

function SaveState({ status, synced, onRetry }) {
  const offline = status.state === 'local' || status.state === 'error';
  const label = {
    saved: synced ? 'Saved' : 'Saved on this device',
    saving: 'Saving…',
    local: 'Saved on this device · will retry',
    error: status.code === 'network' || !status.code ? 'Couldn’t save · changes are only in this tab' : 'Couldn’t save',
    conflict: 'Changed elsewhere',
    gone: 'Deleted elsewhere',
  }[status.state];
  const Icon = status.state === 'saving' ? Loader2 : status.state === 'saved' ? (synced ? Check : Cloud) : offline ? CloudOff : AlertTriangle;
  return <span className={`lc-save lc-save--${status.state}`} role="status">
    <Icon size={15} className={status.state === 'saving' ? 'spin' : undefined} aria-hidden="true" /> {label}
    {offline && <button className="canvas-link" onClick={onRetry}>Try again</button>}
  </span>;
}

export default function CanvasWorkspace({ initialCanvas, userId, orgId, synced, boardOn = true, recovery = null, library, onBack, onDelete, onReload, onSaveCopy, onSaved }) {
  const { store, canvas, view, notices, notice, dispatch, undo, redo, canUndo, canRedo } = useCanvasDocument(initialCanvas);
  const autosave = useCanvasAutosave({ store, userId, orgId, baseSavedAt: initialCanvas.savedAt });
  const { status } = autosave;
  const [mode, setMode] = useState(() => initialMode(userId, boardOn, initialCanvas));
  const [panel, setPanel] = useState(null);
  const [recoveryState, setRecoveryState] = useState(recovery);
  const [leaveWarning, setLeaveWarning] = useState(false);
  const [dismissed, setDismissed] = useState(null);
  const [titleDraft, setTitleDraft] = useState(canvas.title);
  const [seenTitle, setSeenTitle] = useState(canvas.title);
  if (seenTitle !== canvas.title) { setSeenTitle(canvas.title); setTitleDraft(canvas.title); }

  // Once the account has the latest edits, the library can show the same title and revisit cue.
  useEffect(() => { if (status.state === 'saved') onSaved?.(store.getState().canvas); }, [status.state, store, onSaved]);

  const showBoard = boardOn && mode === 'canvas';
  const chooseMode = (next) => {
    setMode(next);
    try { localStorage.setItem(VIEW_KEY(userId), next); } catch { /* the choice just won't be remembered */ }
  };
  const commitTitle = () => {
    const next = titleDraft.trim();
    if (!next) setTitleDraft(canvas.title); else if (next !== canvas.title) dispatch({ type: 'setTitle', title: next });
  };

  async function leave(force = false) {
    await autosave.flush();
    const { state } = autosave.getStatus();
    // "error" is the one state with no copy anywhere: not saved, and no recovery journal.
    if (state === 'error' && !force) { setLeaveWarning(true); return; }
    onBack();
  }

  function onKeyDown(event) {
    if (isTyping(event.target) || !(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
    else if (key === 'y') { event.preventDefault(); redo(); }
  }

  const clearJournal = () => recoveryJournal().clear(userId, canvas.id);
  const error = notice?.kind === 'error' && notice.id !== dismissed ? notice : null;
  const held = status.state === 'conflict' || status.state === 'gone';
  const copyJson = () => downloadText(boardRecoveryJson(canvas), 'my-lc-copy.json', 'application/json');

  return <div className="lc-workspace" onKeyDown={onKeyDown}>
    <header className="lc-bar">
      <button className="canvas-link lc-bar__back" onClick={() => leave()}><ArrowLeft size={16} /> All canvases</button>
      <input className="lc-title" aria-label="Canvas title" maxLength={160} value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} onBlur={commitTitle}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { setTitleDraft(canvas.title); e.currentTarget.blur(); } }} />
      <SaveState status={status} synced={synced} onRetry={autosave.retry} />
      {boardOn && <div className="moment-view lc-bar__views" role="group" aria-label="View your canvas">
        <button aria-pressed={mode === 'canvas'} onClick={() => chooseMode('canvas')}><LayoutGrid size={14} /> Canvas</button>
        <button aria-pressed={mode === 'outline'} onClick={() => chooseMode('outline')}><List size={14} /> Outline</button>
      </div>}
      <button className="lc-icon-button" aria-label="Your canvases" aria-haspopup="dialog" onClick={() => setPanel('library')}><Library size={18} /></button>
      <button className="lc-icon-button" aria-label="Canvas settings" aria-haspopup="dialog" onClick={() => setPanel('settings')}><Settings size={18} /></button>
    </header>

    {leaveWarning && <div role="alert" className="lc-banner lc-banner--warn"><p>Your latest changes could not be saved, and this device could not keep a copy. If you leave now they will be lost.</p>
      <button className="btn-secondary" onClick={() => setLeaveWarning(false)}>Stay and try again</button><button className="canvas-link" onClick={() => leave(true)}>Leave anyway</button></div>}

    {held && <div role="alert" className="lc-banner lc-banner--warn">
      <p><strong>{status.state === 'gone' ? 'This canvas was deleted on another device.' : 'This canvas changed on another device.'}</strong> Saving has stopped so nothing is overwritten or merged without you. Your edits are kept on this device.</p>
      <button className="btn-secondary" onClick={copyJson}>Download my copy</button>
      <button className="btn-secondary" onClick={() => onSaveCopy(canvas)}>Save my copy as a new canvas</button>
      {status.state === 'conflict' && <button className="canvas-link" onClick={async () => { await clearJournal(); onReload(); }}>Reload the latest version</button>}
    </div>}

    {recoveryState && <div role="alert" className="lc-banner lc-banner--warn">
      {recoveryState.kind === 'restore'
        ? <><p><strong>Unsaved edits were found on this device.</strong> They were made before the page closed and had not finished saving.</p>
          <button className="btn-primary" onClick={() => { store.replace(recoveryState.record.canvas, { dirty: true }); setRecoveryState(null); }}>Restore my edits</button>
          <button className="canvas-link" onClick={async () => { await clearJournal(); setRecoveryState(null); }}>Discard them</button></>
        : <><p><strong>Edits on this device could not be applied.</strong> This canvas changed elsewhere after you made them, so they were not merged.</p>
          <button className="btn-secondary" onClick={() => downloadText(boardRecoveryJson(recoveryState.record.canvas), 'my-device-copy.json', 'application/json')}>Download my device copy</button>
          <button className="btn-secondary" onClick={() => { onSaveCopy(recoveryState.record.canvas); }}>Save it as a separate canvas</button>
          <button className="canvas-link" onClick={async () => { await clearJournal(); setRecoveryState(null); }}>Keep what is saved</button></>}
    </div>}

    {boardOn && canvas.boardIssue && <div role="status" className="lc-banner"><p><strong>The saved layout can’t be read.</strong> {canvas.boardIssue.reason} Your words are all here in Outline, and nothing about the layout has been changed.</p>
      <button className="btn-secondary" onClick={() => setPanel('settings')}>Download or reset the layout</button></div>}
    {boardOn && canvas.board && notices.stale > 0 && <p role="status" className="lc-banner">{notices.stale === 1 ? '1 placement in the saved layout no longer matches your canvas and is left out.' : `${notices.stale} placements in the saved layout no longer match your canvas and are left out.`}</p>}
    {boardOn && mode === 'outline' && !canvas.board && !canvas.boardIssue && !recoveryState && <div className="lc-banner lc-banner--try"><p>This canvas has been a story so far. See it as a canvas: nothing changes until you move something.</p>
      <button className="btn-secondary" onClick={() => chooseMode('canvas')}>Try canvas</button></div>}

    <div className="lc-body">
      {showBoard
        ? <Suspense fallback={<p role="status" className="lc-loading">Loading your canvas…</p>}>
          <LivingCanvasBoard canvas={canvas} view={view} userId={userId} dispatch={dispatch} undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} />
        </Suspense>
        : <CanvasOutline canvas={canvas} view={view} userId={userId} dispatch={dispatch} spatial={boardOn} />}
    </div>

    {panel === 'settings' && <CanvasSettings canvas={canvas} dispatch={dispatch} onClose={() => setPanel(null)}
      onDelete={async () => { autosave.hold(); if (await onDelete(canvas.id)) await clearJournal(); else autosave.release(); }} onResetLayout={() => { store.resetBoard(); }} />}
    {panel === 'library' && <DetailsShell title="Your canvases" onClose={() => setPanel(null)}>{library(() => setPanel(null))}</DetailsShell>}

    <div className="visually-hidden" role="status" aria-live="polite">{notice?.kind === 'info' ? notice.message : ''}</div>
    {error && <div role="alert" className="lc-toast"><span>{error.message}</span><button className="canvas-link" onClick={() => setDismissed(error.id)}>Dismiss</button></div>}
  </div>;
}
