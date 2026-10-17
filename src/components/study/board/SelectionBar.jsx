import { useState } from 'react';
import { ChevronDown, GitBranch, Group, Link2, Pencil, Trash2, X } from 'lucide-react';
import { BOARD_LIMITS } from '../../../lib/canvasBoard';
import { DeleteCard, SectionSelect } from './CanvasCardControls';
import { sectionName } from './cardLabels';

/**
 * What can be done with what is selected: Edit, Connect and More for a card, so
 * the board stays calm until something is chosen. It sits in the page flow
 * above the board, so a thumb can reach it and it never covers the cards.
 */
export default function SelectionBar({ selection, view, dispatch, moreOpen, setMoreOpen, deleteRequested, onEdit, onConnect, onBranch, onCreateSection, onOpenSection, onOpenEdge, onClear }) {
  const [target, setTarget] = useState('');
  const cardIds = [...selection.nodes].filter((id) => view.nodes.some((n) => n.id === id));
  const sectionIds = [...selection.nodes].filter((id) => view.sections.some((s) => s.id === id));

  if (selection.edge) {
    return <div className="lc-selection" role="toolbar" aria-label="Connection actions"><strong>Connection</strong>
      <button className="lc-tool lc-tool--text" onClick={() => onOpenEdge(selection.edge)}><Pencil size={16} /> Edit label</button>
      <button className="lc-tool lc-tool--text" onClick={() => dispatch({ type: 'removeEdge', id: selection.edge })}><Trash2 size={16} /> Remove</button>
      <button className="lc-icon-button" aria-label="Clear selection" onClick={onClear}><X size={16} /></button></div>;
  }

  if (cardIds.length === 1 && !sectionIds.length) {
    const node = view.nodes.find((n) => n.id === cardIds[0]);
    return <div className="lc-selection" role="toolbar" aria-label="Thought actions">
      <button className="lc-tool lc-tool--text" onClick={() => onEdit(node.id)}><Pencil size={16} /> Edit</button>
      <button className="lc-tool lc-tool--text" onClick={() => onConnect(node.id)}><Link2 size={16} /> Connect</button>
      <button className="lc-tool lc-tool--text" aria-expanded={moreOpen} aria-controls="lc-more" onClick={() => setMoreOpen(!moreOpen)}>More <ChevronDown size={14} /></button>
      <button className="lc-icon-button" aria-label="Clear selection" onClick={onClear}><X size={16} /></button>
      {moreOpen && <div className="lc-selection__more" id="lc-more">
        <button className="btn-secondary" onClick={() => onBranch(node.id)}><GitBranch size={15} /> Branch thought</button>
        <SectionSelect view={view} node={node} dispatch={dispatch} />
        <DeleteCard node={node} dispatch={dispatch} onDeleted={onClear} startConfirming={deleteRequested} />
      </div>}
    </div>;
  }

  if (cardIds.length > 1) {
    return <div className="lc-selection" role="toolbar" aria-label="Selection actions"><strong>{cardIds.length} thoughts selected</strong>
      <button className="lc-tool lc-tool--text" disabled={view.sections.length >= BOARD_LIMITS.sections} onClick={() => onCreateSection(cardIds)}><Group size={16} /> Create section</button>
      {view.sections.length > 0 && <span className="lc-selection__move">
        <label className="visually-hidden" htmlFor="lc-move-to">Move selected thoughts to a section</label>
        <select id="lc-move-to" value={target} onChange={(e) => { const value = e.target.value; setTarget(''); if (value) dispatch({ type: 'moveToSection', nodeIds: cardIds, sectionId: value === '__none' ? null : value }); }}>
          <option value="">Move to section…</option>
          {view.sections.map((s) => <option key={s.id} value={s.id}>{sectionName(s)}</option>)}
          <option value="__none">Take out of sections</option>
        </select></span>}
      <button className="lc-icon-button" aria-label="Clear selection" onClick={onClear}><X size={16} /></button></div>;
  }

  if (sectionIds.length === 1 && !cardIds.length) {
    const section = view.sections.find((s) => s.id === sectionIds[0]);
    return <div className="lc-selection" role="toolbar" aria-label="Section actions"><strong>{sectionName(section)}</strong>
      <button className="lc-tool lc-tool--text" onClick={() => onOpenSection(section.id)}><Pencil size={16} /> Edit section</button>
      <button className="lc-tool lc-tool--text" onClick={() => dispatch({ type: 'toggleSection', id: section.id })}>{section.collapsed ? 'Expand' : 'Collapse'}</button>
      <button className="lc-tool lc-tool--text" onClick={() => { if (dispatch({ type: 'removeSection', id: section.id }).ok) onClear(); }}>Remove, keep thoughts</button>
      <button className="lc-icon-button" aria-label="Clear selection" onClick={onClear}><X size={16} /></button></div>;
  }

  const total = cardIds.length + sectionIds.length;
  if (total > 1) {
    return <div className="lc-selection" role="toolbar" aria-label="Selection actions"><strong>{total} items selected</strong>
      <span className="moment-hint">Choose one thing to see what you can do with it.</span>
      <button className="lc-icon-button" aria-label="Clear selection" onClick={onClear}><X size={16} /></button></div>;
  }
  return null;
}
