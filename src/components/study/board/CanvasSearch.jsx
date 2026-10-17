import { useMemo, useRef, useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { searchBoard } from '../../../lib/canvasBoard';

/** Finds a thought by its words, a passage, a section or a connection label, as an ordinary list. */
export default function CanvasSearch({ canvas, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); }, []);
  const hits = useMemo(() => searchBoard(canvas, query), [canvas, query]);
  return <div className="lc-search" role="search" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <div className="lc-search__field">
      <Search size={16} aria-hidden="true" />
      <input ref={input} type="search" aria-label="Search this canvas" placeholder="Search words, passages, sections" value={query} onChange={(e) => setQuery(e.target.value)} />
      <button className="lc-icon-button" aria-label="Close search" onClick={onClose}><X size={16} /></button>
    </div>
    <div aria-live="polite" className="lc-search__status">{query.trim() ? `${hits.length} ${hits.length === 1 ? 'result' : 'results'}` : ''}</div>
    {hits.length > 0 && <ul aria-label="Search results">{hits.map((hit) => <li key={hit.nodeId || hit.sectionId || hit.edgeId}>
      <button onClick={() => onPick(hit)}><strong>{hit.label}</strong>{hit.sectionTitle && <small> · in {hit.sectionTitle}</small>}<span>{hit.excerpt}</span></button>
    </li>)}</ul>}
  </div>;
}
