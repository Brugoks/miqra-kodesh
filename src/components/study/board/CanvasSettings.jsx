import { useState } from 'react';
import { Download, RotateCcw, Trash2 } from 'lucide-react';
import { boardRecoveryJson, cardKindLabel, exportMarkdown } from '../../../lib/canvasBoard';
import { formatCardDate } from '../../../lib/canvasBoardFlow';
import { canvasFileName } from '../../../lib/studyCanvasModel';
import DetailsShell from './DetailsShell';
import { downloadText as download } from './download';

/** Take part of the story with you: choose entries; sections and links between chosen cards come along. */
function CanvasExport({ canvas }) {
  const [selected, setSelected] = useState(() => new Set(canvas.journey.entries.map((e) => e.id)));
  const entries = canvas.journey.entries.filter((entry) => selected.has(entry.id));
  return <details className="moment-export"><summary><Download size={16} /> Take part of your story with you</summary>
    <p>Download a personal copy. Your title and original glimpse are included. Choose which later entries to include; sections and connections come along only when the cards they join are chosen. Nothing is published.</p>
    {canvas.journey.entries.map((entry) => <label className="moment-export-choice" key={entry.id}><input type="checkbox" checked={selected.has(entry.id)} onChange={(e) => setSelected((current) => { const next = new Set(current); if (e.target.checked) next.add(entry.id); else next.delete(entry.id); return next; })} /><span>{cardKindLabel(entry.kind)} · {formatCardDate(entry.createdAt)}<small>{entry.reference ? `${entry.reference}${entry.text ? ` · ${entry.text}` : ''}` : entry.text}</small></span></label>)}
    <details><summary>Preview selected content</summary><pre>{exportMarkdown(canvas, entries)}</pre></details>
    <button className="btn-secondary" onClick={() => download(exportMarkdown(canvas, entries), canvasFileName(canvas.title), 'text/markdown;charset=utf-8')}><Download size={15} /> Download selected story</button>
  </details>;
}

export default function CanvasSettings({ canvas, dispatch, onClose, onDelete, onResetLayout }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const j = canvas.journey;
  return <DetailsShell title="Canvas settings" onClose={onClose}>
    <form key={j.revisitOn || 'no-date'} onSubmit={(event) => { event.preventDefault(); dispatch({ type: 'replaceJourney', journey: { ...j, revisitOn: new FormData(event.currentTarget).get('date') || null }, announce: 'Revisit date changed' }); }}>
      <label htmlFor="moment-date">Revisit date (optional)</label>
      <input id="moment-date" type="date" name="date" defaultValue={j.revisitOn || ''} />
      <p className="moment-hint">Leave the date empty to return in your own time. This appears in your canvases, without sending a notification.</p>
      <button className="btn-secondary" type="submit">Save revisit date</button>
    </form>
    <CanvasExport key={`${canvas.id}:${j.entries.length}`} canvas={canvas} />
    <details className="moment-export"><summary><Download size={16} /> Layout recovery</summary>
      <p>Download your canvas and its saved layout as JSON. {canvas.boardIssue ? 'Your saved layout could not be read, so it is included exactly as it was stored.' : 'This is a personal backup of where everything sits.'}</p>
      <button className="btn-secondary" onClick={() => download(boardRecoveryJson(canvas), `${canvasFileName(canvas.title).replace(/\.md$/, '')}-layout.json`, 'application/json')}><Download size={15} /> Download layout</button>
      {canvas.boardIssue && <><p role="status" className="moment-warning">{canvas.boardIssue.reason} Your words are safe, and Outline still shows everything. Resetting lays the cards out afresh and replaces the saved layout.</p>
        <button className="btn-secondary" onClick={onResetLayout}><RotateCcw size={15} /> Reset layout</button></>}
    </details>
    <div className="moment-delete">{confirmDelete
      ? <><p>Delete this entire canvas, including its original glimpse and {j.entries.length} later {j.entries.length === 1 ? 'entry' : 'entries'}? This cannot be undone.</p><button className="btn-secondary" onClick={onDelete}>Delete entire canvas</button><button className="canvas-link" onClick={() => setConfirmDelete(false)}>Keep it</button></>
      : <button className="canvas-link" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete canvas</button>}</div>
  </DetailsShell>;
}
