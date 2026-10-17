import { useRef, useState } from 'react';
import { ChevronDown, Group, Hand, Link2, MousePointer2, Plus, Redo2, Undo2 } from 'lucide-react';
import { JOURNEY_KINDS } from '../../../lib/canvasJourney';
import { cardKindLabel } from '../../../lib/canvasBoard';

/**
 * Three ways to make something — Add thought, Connect, Section — plus the tools
 * for moving around and for undoing. Every button carries its name as text for
 * assistive technology; the three creators show it on screen too.
 */
export default function CanvasToolbar({ mode, setMode, connecting, onAdd, onConnect, onSection, canUndo, canRedo, undo, redo, multi, setMulti, coarse }) {
  const [open, setOpen] = useState(false);
  const group = useRef(null);
  const close = (event) => { if (!group.current?.contains(event.relatedTarget)) setOpen(false); };
  return <div className="lc-toolbar" role="toolbar" aria-label="Canvas tools" aria-orientation="vertical">
    <div className="lc-toolbar__group lc-toolbar__group--create">
      <div className="lc-toolbar__add" ref={group} onBlur={close} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}>
        <button className="lc-tool lc-tool--primary" onClick={() => { setOpen(false); onAdd('reflection'); }}><Plus size={18} /><span>Add thought</span></button>
        <button className="lc-tool lc-tool--menu" aria-label="Choose a type of thought" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><ChevronDown size={16} /></button>
        {open && <div className="lc-menu" role="menu" aria-label="Types of thought">
          {Object.keys(JOURNEY_KINDS).map((kind) => <button role="menuitem" key={kind} onClick={() => { setOpen(false); onAdd(kind); }}>{cardKindLabel(kind)}</button>)}
        </div>}
      </div>
      <button className="lc-tool" aria-pressed={connecting} onClick={onConnect}><Link2 size={18} /><span>Connect</span></button>
      <button className="lc-tool" onClick={onSection}><Group size={18} /><span>Section</span></button>
    </div>
    <div className="lc-toolbar__group">
      <button className="lc-tool lc-tool--icon" aria-label="Select" aria-pressed={mode === 'select'} onClick={() => setMode('select')}><MousePointer2 size={18} /></button>
      <button className="lc-tool lc-tool--icon" aria-label="Hand: move around the canvas" aria-pressed={mode === 'hand'} onClick={() => setMode('hand')}><Hand size={18} /></button>
      {coarse && <button className="lc-tool lc-tool--text" aria-pressed={multi} onClick={() => setMulti(!multi)}>Select several</button>}
    </div>
    <div className="lc-toolbar__group">
      <button className="lc-tool lc-tool--icon" aria-label="Undo" disabled={!canUndo} onClick={undo}><Undo2 size={18} /></button>
      <button className="lc-tool lc-tool--icon" aria-label="Redo" disabled={!canRedo} onClick={redo}><Redo2 size={18} /></button>
    </div>
  </div>;
}
