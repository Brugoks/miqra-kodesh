import { useState } from 'react';
import { ArrowUpRight, BookOpen, GitCompare, Loader2, Plus, X } from 'lucide-react';
import { MAX_PASSAGES } from '../../lib/studyCanvasModel';

/** The passages on a canvas, with adding and removing when the owner is editing. */
export default function CanvasScripture({ passages, selectedSource, citedIds, readOnly = false, busy = false, adding = false, onAdd, onRemove, onRelate }) {
  const [draft, setDraft] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (await onAdd(draft)) setDraft('');
  }

  return <section className={`canvas-card canvas-scripture${passages.length > 1 ? ' canvas-scripture--multi' : ''}`} aria-label="Scripture sources">
    {passages.map((passage) => {
      const verses = passage.sources.filter((source) => source.kind === 'verse');
      // A passage an explanation cites stays: removing it would orphan that evidence.
      const removable = !readOnly && passages.length > 1 && !verses.some((verse) => citedIds?.has(verse.id));
      return <div className="canvas-passage" key={passage.reference}>
        <div className="canvas-section-heading"><BookOpen size={18} /><h2>{passage.reference}</h2><span>BSB</span>
          {removable && <button type="button" className="canvas-icon-button" aria-label={`Remove ${passage.reference}`} onClick={() => onRemove(passage.reference)}><X size={15} /></button>}</div>
        <div className="canvas-verses">{verses.map((source) => <p id={`canvas-${source.id}`} tabIndex={-1} key={source.id} className={selectedSource === source.id ? 'canvas-selected' : ''}><sup>{source.ref.split(':').at(-1)}</sup>{source.text}</p>)}</div>
      </div>;
    })}
    {!readOnly && passages.length < MAX_PASSAGES && <form className="canvas-add-passage" onSubmit={submit}>
      <label htmlFor="canvas-add-passage">Set another passage beside {passages.length > 1 ? 'these' : 'this one'}</label>
      <div><input id="canvas-add-passage" value={draft} maxLength={100} placeholder="1 John 2:18–27" disabled={busy || adding} onChange={(event) => setDraft(event.target.value)} />
        <button className="btn-secondary" type="submit" disabled={!draft.trim() || busy || adding}>{adding ? <Loader2 className="canvas-spin" size={15} /> : <Plus size={15} />} Add passage</button></div>
    </form>}
    {!readOnly && passages.length > 1 && <button type="button" className="canvas-relate" disabled={busy} onClick={onRelate}><GitCompare size={15} /> Ask how these passages speak to each other</button>}
    <a href="https://berean.bible/" target="_blank" rel="noreferrer" className="canvas-attribution">Berean Standard Bible · Public domain <ArrowUpRight size={12} /></a>
  </section>;
}
