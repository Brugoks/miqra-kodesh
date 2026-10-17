import { useState } from 'react';
import { GitBranch, Pencil } from 'lucide-react';
import { BOARD_LIMITS, SECTION_COLORS, SECTION_COLOR_LABELS, cardContent, cardKindLabel, membersOf } from '../../../lib/canvasBoard';
import { formatCardDate } from '../../../lib/canvasBoardFlow';
import MomentEditor from '../MomentEditor';
import RelatedScripture from '../RelatedScripture';
import CardBody from './CardBody';
import DetailsShell from './DetailsShell';
import EntryComposer from './EntryComposer';
import { ConnectionsPanel, DeleteCard, SectionSelect } from './CanvasCardControls';
import { cardTitle } from './cardLabels';

function CardDetails({ detail, canvas, view, userId, dispatch, onClose, onOpenCard, onBranch }) {
  const node = view.nodes.find((n) => n.id === detail.nodeId);
  const content = node && cardContent(canvas, node);
  const [editing, setEditing] = useState(Boolean(detail.editing));
  if (!node || !content) return <DetailsShell title="Card" onClose={onClose}><p>This card is no longer on the canvas.</p></DetailsShell>;
  const noun = content.isMoment ? 'original glimpse' : cardKindLabel(content.kind).toLowerCase();
  return <DetailsShell title={content.label} onClose={onClose}>
    <p className="moment-hint"><time dateTime={content.createdAt}>{formatCardDate(content.createdAt)}</time>{content.editedAt && <> · Edited {formatCardDate(content.editedAt)}</>}</p>
    {editing
      ? <MomentEditor key={content.id} userId={userId} canvas={canvas} entry={content.entry || undefined} busy={false} onCancel={() => setEditing(false)}
        onSave={async (next) => { const ok = dispatch({ type: 'replaceJourney', journey: next.journey, announce: 'Changes saved' }).ok; if (ok) setEditing(false); return ok; }} />
      : <><CardBody content={content} canvas={canvas} /><button className="canvas-link" onClick={() => setEditing(true)}><Pencil size={14} /> Edit {noun}</button></>}
    <h3>Placement</h3>
    <SectionSelect view={view} node={node} dispatch={dispatch} />
    <h3>Connections</h3>
    <ConnectionsPanel canvas={canvas} view={view} node={node} dispatch={dispatch} onOpenCard={onOpenCard} />
    <div className="lc-details__actions">
      <button className="btn-secondary" onClick={() => onBranch(node.id)}><GitBranch size={15} /> Branch thought</button>
      <DeleteCard node={node} dispatch={dispatch} onDeleted={onClose} />
    </div>
    {content.isMoment && <RelatedScripture key={`${canvas.id}:${canvas.journey.moment}`} canvas={canvas} busy={false} onAdd={async (entry) => dispatch({ type: 'addThought', entry }).ok} />}
  </DetailsShell>;
}

function SectionDetails({ detail, view, dispatch, onClose }) {
  const section = view.sections.find((s) => s.id === detail.id);
  const [title, setTitle] = useState(section?.title ?? '');
  if (!section) return <DetailsShell title="Section" onClose={onClose}><p>This section is gone.</p></DetailsShell>;
  const members = membersOf(view, section.id).length;
  return <DetailsShell title="Section" onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); dispatch({ type: 'updateSection', id: section.id, title }); }}>
      <label htmlFor="section-title">Section name</label>
      <input id="section-title" maxLength={BOARD_LIMITS.sectionTitle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What I’m noticing" />
      <button className="btn-secondary" type="submit" disabled={title.trim() === section.title}>Save name</button>
    </form>
    <fieldset className="lc-colors"><legend>Color</legend>
      {SECTION_COLORS.map((color) => <label key={color} className={section.color === color ? 'selected' : ''}>
        <input type="radio" name="section-color" checked={section.color === color} onChange={() => dispatch({ type: 'updateSection', id: section.id, color })} />
        <span className={`lc-swatch lc-swatch--${color}`} aria-hidden="true" />{SECTION_COLOR_LABELS[color]}
      </label>)}
    </fieldset>
    <p className="moment-hint">{members === 1 ? '1 thought is' : `${members} thoughts are`} in this section. Moving the section moves them with it.</p>
    <div className="lc-details__actions">
      <button className="btn-secondary" onClick={() => dispatch({ type: 'toggleSection', id: section.id })}>{section.collapsed ? 'Expand section' : 'Collapse section'}</button>
      <button className="canvas-link lc-danger" onClick={() => { if (dispatch({ type: 'removeSection', id: section.id }).ok) onClose(); }}>Remove section, keep thoughts</button>
    </div>
  </DetailsShell>;
}

function EdgeDetails({ detail, canvas, view, dispatch, onClose }) {
  const edge = view.edges.find((e) => e.id === detail.id);
  const [label, setLabel] = useState(edge?.label ?? '');
  if (!edge) return <DetailsShell title="Connection" onClose={onClose}><p>This connection is gone.</p></DetailsShell>;
  const name = (id) => { const node = view.nodes.find((n) => n.id === id); return node ? cardTitle(canvas, node, 44) : 'a removed card'; };
  return <DetailsShell title="Connection" onClose={onClose}>
    <p className="moment-words"><strong>{name(edge.source)}</strong><br />{edge.direction === 'forward' ? 'points to' : 'is connected with'}<br /><strong>{name(edge.target)}</strong></p>
    <form onSubmit={(event) => { event.preventDefault(); dispatch({ type: 'updateEdge', id: edge.id, label }); }}>
      <label htmlFor="edge-label">How are they related? (optional)</label>
      <input id="edge-label" maxLength={BOARD_LIMITS.label} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="leads to, questions, answers…" />
      <button className="btn-secondary" type="submit" disabled={label.trim() === edge.label}>Save label</button>
    </form>
    <label className="lc-check"><input type="checkbox" checked={edge.direction === 'forward'} onChange={(e) => dispatch({ type: 'updateEdge', id: edge.id, direction: e.target.checked ? 'forward' : 'none' })} /> Show an arrow toward the second thought</label>
    <div className="lc-details__actions">
      {edge.direction === 'forward' && <button className="btn-secondary" onClick={() => dispatch({ type: 'updateEdge', id: edge.id, reverse: true })}>Swap direction</button>}
      <button className="canvas-link lc-danger" onClick={() => { if (dispatch({ type: 'removeEdge', id: edge.id }).ok) onClose(); }}>Remove connection</button>
    </div>
  </DetailsShell>;
}

/** Whatever the board has asked to look at closely: a card, a new thought, a section or a link. */
export default function CanvasDetails({ detail, canvas, view, userId, dispatch, onClose, onOpenCard, onBranch, onAdded }) {
  if (detail.type === 'new') {
    return <DetailsShell title="New thought" onClose={onClose}>
      <EntryComposer variant="panel" canvas={canvas} userId={userId} initialKind={detail.kind} position={detail.position} connectFrom={detail.connectFrom}
        onAdd={async (entry, options) => dispatch({ type: 'addThought', entry, ...options }).ok}
        onAddMany={async (entries, options) => dispatch({ type: 'addThoughts', entries, ...options }).ok} onDone={(entry) => onAdded?.(entry)} />
      <p className="moment-hint">Closing this keeps what you have written until you add it.</p>
    </DetailsShell>;
  }
  const props = { detail, canvas, view, userId, dispatch, onClose, onOpenCard, onBranch };
  if (detail.type === 'section') return <SectionDetails key={detail.id} {...props} />;
  if (detail.type === 'edge') return <EdgeDetails key={detail.id} {...props} />;
  return <CardDetails key={`${detail.nodeId}:${detail.editing ? 'edit' : 'read'}`} {...props} />;
}

