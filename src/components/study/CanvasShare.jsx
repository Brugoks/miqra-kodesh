import { useState } from 'react';
import { Copy, Download, Link2, Printer, Share2 } from 'lucide-react';
import { canvasFileName, canvasToMarkdown } from '../../lib/studyCanvasModel';

const sharedCanvasUrl = (token) => `${window.location.origin}/study-canvas/shared/${token}`;

function downloadMarkdown(canvas) {
  const url = URL.createObjectURL(new Blob([canvasToMarkdown(canvas)], { type: 'text/markdown;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: canvasFileName(canvas.title) });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Export (print, Markdown) for any canvas; read-only link sharing once it is saved to the account. */
export default function CanvasShare({ canvas, synced, saved, share, onShareChange, onPrint }) {
  const [includeNotes, setIncludeNotes] = useState(share.includeNotes);
  const [copied, setCopied] = useState(false);
  const [working, setWorking] = useState(false);
  const notes = share.token ? share.includeNotes : includeNotes;

  async function change(next) {
    setWorking(true);
    try { await onShareChange(next); } finally { setWorking(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(sharedCanvasUrl(share.token)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the link stays selectable */ }
  }

  return <section className="canvas-share" aria-label="Share and export">
    <div className="canvas-share-block"><h2><Download size={17} /> Take it with you</h2><p>A handout with the whole path, your notes, pins and the passages.</p>
      <div className="canvas-share-actions"><button type="button" className="btn-secondary" onClick={onPrint}><Printer size={15} /> Print handout</button>
        <button type="button" className="btn-secondary" onClick={() => downloadMarkdown(canvas)}><Download size={15} /> Download Markdown</button></div></div>

    {synced && <div className="canvas-share-block"><h2><Share2 size={17} /> Share read-only</h2>
      {!saved ? <p>Save the canvas to share it.</p> : <>
        <p>Anyone signed in to the app with the link can read this canvas{notes ? ', including your reflections and card notes.' : '. Your reflections and card notes stay private.'} They cannot change it.</p>
        <label className="canvas-check"><input type="checkbox" checked={notes} disabled={working} onChange={(event) => { if (share.token) change({ enabled: true, includeNotes: event.target.checked }); else setIncludeNotes(event.target.checked); }} /> Include my notes and reflections</label>
        {share.token ? <>
          <div className="canvas-share-link"><Link2 size={15} /><input readOnly aria-label="Share link" value={sharedCanvasUrl(share.token)} onFocus={(event) => event.target.select()} />
            <button type="button" className="btn-secondary" onClick={copy}><Copy size={15} /> {copied ? 'Copied' : 'Copy'}</button></div>
          <button type="button" className="canvas-link" disabled={working} onClick={() => change({ enabled: false, includeNotes: false })}>Stop sharing (this link will stop working)</button>
        </> : <button type="button" className="btn-primary" disabled={working} onClick={() => change({ enabled: true, includeNotes })}><Link2 size={15} /> Create share link</button>}
      </>}
    </div>}
  </section>;
}
