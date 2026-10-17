import { useId, useMemo, useState } from 'react';
import { Link2, Trash2 } from 'lucide-react';
import { BOARD_LIMITS, connectionsFor } from '../../../lib/canvasBoard';
import { cardTitle, sectionName } from './cardLabels';
import { newSectionId } from '../../../lib/canvasBoardCommands';

/** "Move to section": the menu route to what dropping a card on a section does. */
export function SectionSelect({ view, node, dispatch }) {
  const id = useId();
  function change(event) {
    const value = event.target.value;
    if (value === '__new') dispatch({ type: 'createSection', id: newSectionId(), nodeIds: [node.id] });
    else dispatch({ type: 'moveToSection', nodeIds: [node.id], sectionId: value || null });
  }
  return <div className="lc-field">
    <label htmlFor={id}>Section</label>
    <select id={id} value={node.sectionId || ''} onChange={change}>
      <option value="">Not in a section</option>
      {view.sections.map((section) => <option key={section.id} value={section.id}>{sectionName(section)}</option>)}
      {view.sections.length < BOARD_LIMITS.sections && <option value="__new">New section with this thought…</option>}
    </select>
  </div>;
}

const phrase = (link) => (link.direction === 'forward' ? (link.outgoing ? 'Points to' : 'Pointed to from') : 'Connected with');

/** Connect this card to another by name, with an optional label — no dragging needed. */
export function ConnectPicker({ canvas, view, node, dispatch }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState('');
  const [label, setLabel] = useState('');
  const [arrow, setArrow] = useState(false);
  const linked = useMemo(() => new Set(connectionsFor(view, node.id).map((c) => c.otherId)), [view, node.id]);
  const candidates = useMemo(() => view.nodes.filter((n) => n.id !== node.id && !linked.has(n.id))
    .map((n) => ({ id: n.id, title: cardTitle(canvas, n) }))
    .filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase())), [view, canvas, node.id, linked, query]);
  const chosen = candidates.some((c) => c.id === target) ? target : candidates[0]?.id || '';
  function connect(event) {
    event.preventDefault();
    if (!chosen) return;
    if (dispatch({ type: 'connect', source: node.id, target: chosen, label, direction: arrow ? 'forward' : 'none' }).ok) { setLabel(''); setTarget(''); setArrow(false); setQuery(''); }
  }
  if (!view.nodes.some((n) => n.id !== node.id && !linked.has(n.id))) return <p className="moment-hint">Every other thought is already connected to this one.</p>;
  return <form className="lc-connect-picker" onSubmit={connect} aria-label="Connect to another thought">
    <label htmlFor={`${id}-find`}>Find a thought to connect</label>
    <input id={`${id}-find`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your thoughts" />
    <label htmlFor={`${id}-to`}>Connect to</label>
    <select id={`${id}-to`} value={chosen} onChange={(e) => setTarget(e.target.value)} disabled={!candidates.length}>
      {candidates.length ? candidates.map((c) => <option key={c.id} value={c.id}>{c.title}</option>) : <option value="">No match</option>}
    </select>
    <label htmlFor={`${id}-label`}>How are they related? (optional)</label>
    <input id={`${id}-label`} maxLength={BOARD_LIMITS.label} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="leads to, questions, answers…" list={`${id}-suggest`} />
    <datalist id={`${id}-suggest`}><option value="leads to" /><option value="questions" /><option value="answers" /><option value="reminds me of" /></datalist>
    <label className="lc-check"><input type="checkbox" checked={arrow} onChange={(e) => setArrow(e.target.checked)} /> Show an arrow toward the other thought</label>
    <button className="btn-secondary" type="submit" disabled={!chosen}><Link2 size={15} /> Connect</button>
  </form>;
}

/** This card's links, each with a way to open the other end or remove the link. */
export function ConnectionsPanel({ canvas, view, node, dispatch, onOpenCard }) {
  const links = connectionsFor(view, node.id);
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  return <div className="lc-connections">
    {links.length ? <ul aria-label="Connections">{links.map((link) => {
      const other = byId.get(link.otherId);
      return <li key={link.edgeId}>
        <span>{phrase(link)} <strong>{other ? cardTitle(canvas, other, 48) : 'a removed card'}</strong>{link.label && <> — “{link.label}”</>}</span>
        <span className="lc-connections__actions">
          {onOpenCard && other && <button className="canvas-link" onClick={() => onOpenCard(link.otherId)}>Open</button>}
          <button className="canvas-link" onClick={() => dispatch({ type: 'removeEdge', id: link.edgeId })} aria-label={`Remove connection with ${other ? cardTitle(canvas, other, 30) : 'removed card'}`}>Remove</button>
        </span>
      </li>;
    })}</ul> : <p className="moment-hint">Not connected to anything yet.</p>}
    <ConnectPicker canvas={canvas} view={view} node={node} dispatch={dispatch} />
  </div>;
}

/** Deleting asks once, inline, and is undoable. The original glimpse explains why it stays. */
export function DeleteCard({ node, dispatch, onDeleted, startConfirming = false }) {
  const [confirming, setConfirming] = useState(startConfirming);
  if (node.contentRef.type === 'moment') {
    return <p className="moment-hint">The original glimpse stays with its canvas. Edit its words, or delete the whole canvas from the menu.</p>;
  }
  if (!confirming) return <button className="canvas-link lc-danger" onClick={() => setConfirming(true)}><Trash2 size={14} /> Delete thought</button>;
  return <div className="lc-confirm" role="group" aria-label="Confirm delete">
    <p>Delete this thought and its connections? You can undo this.</p>
    <button className="btn-secondary" onClick={() => { if (dispatch({ type: 'deleteCard', nodeId: node.id }).ok) onDeleted?.(); }}>Delete thought</button>
    <button className="canvas-link" onClick={() => setConfirming(false)}>Keep it</button>
  </div>;
}
