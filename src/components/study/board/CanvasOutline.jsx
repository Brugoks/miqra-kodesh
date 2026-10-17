import { useMemo, useState } from 'react';
import { Plus, Sprout } from 'lucide-react';
import { BOARD_LIMITS, cardKindLabel, emptySectionSpot, outlineGroups } from '../../../lib/canvasBoard';
import { formatCardDate } from '../../../lib/canvasBoardFlow';
import { isRevisitDue } from '../../../lib/canvasJourney';
import { newSectionId } from '../../../lib/canvasBoardCommands';
import MomentEditor from '../MomentEditor';
import RelatedScripture from '../RelatedScripture';
import CardBody from './CardBody';
import EntryComposer from './EntryComposer';
import { ConnectionsPanel, DeleteCard, SectionSelect } from './CanvasCardControls';
import { sectionName } from './cardLabels';

function OutlineCard({ item, canvas, view, userId, dispatch, editing, setEditing, spatial }) {
  const { node, content } = item;
  const noun = content.isMoment ? 'original glimpse' : cardKindLabel(content.kind).toLowerCase();
  const links = view.edges.filter((e) => e.source === node.id || e.target === node.id).length;
  // The organizing controls (a picker listing every other thought) are only built once opened: a full canvas has a hundred of them.
  const [organizing, setOrganizing] = useState(false);
  return <li className={`moment-entry ${content.kind}`} id={`outline-${node.id}`}><article aria-label={content.isMoment ? 'Original glimpse' : `${content.label}, ${formatCardDate(content.createdAt)}`}>
    <div className="moment-entry-heading"><strong>{content.label}</strong><time dateTime={content.createdAt}>{formatCardDate(content.createdAt)}</time></div>
    {editing === node.id
      ? <MomentEditor key={node.id} userId={userId} canvas={canvas} entry={content.entry || undefined} busy={false} onCancel={() => setEditing(null)}
        onSave={async (next) => { const ok = dispatch({ type: 'replaceJourney', journey: next.journey, announce: 'Changes saved' }).ok; if (ok) setEditing(null); return ok; }} />
      : <>
        <CardBody content={content} canvas={canvas} />
        <div className="moment-entry-actions">
          <button className="canvas-link" disabled={Boolean(editing)} onClick={() => setEditing(node.id)}>Edit {noun}</button>
          {content.editedAt && <small>Edited {formatCardDate(content.editedAt)}</small>}
        </div>
      </>}
    {spatial && <details className="lc-outline__more" onToggle={(event) => setOrganizing(event.currentTarget.open)}><summary>Organize this {content.isMoment ? 'glimpse' : 'thought'}{links ? ` · ${links} ${links === 1 ? 'connection' : 'connections'}` : ''}</summary>
      {organizing && <>
        <SectionSelect view={view} node={node} dispatch={dispatch} />
        <h4>Connections</h4>
        <ConnectionsPanel canvas={canvas} view={view} node={node} dispatch={dispatch} />
        <DeleteCard node={node} dispatch={dispatch} />
      </>}
    </details>}
  </article></li>;
}

function NewSection({ dispatch, view }) {
  const [title, setTitle] = useState('');
  if (view.sections.length >= BOARD_LIMITS.sections) return <p className="moment-hint">A canvas holds up to {BOARD_LIMITS.sections} sections.</p>;
  return <form className="lc-new-section" onSubmit={(event) => { event.preventDefault(); if (dispatch({ type: 'createSection', id: newSectionId(), title: title.trim() || 'New section', position: emptySectionSpot(view) }).ok) setTitle(''); }}>
    <label htmlFor="outline-new-section">New section</label>
    <input id="outline-new-section" maxLength={BOARD_LIMITS.sectionTitle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What I’m noticing" />
    <button className="btn-secondary" type="submit"><Plus size={15} /> Add section</button>
  </form>;
}

function SectionHeading({ section, dispatch }) {
  const [title, setTitle] = useState(section.title);
  return <div className="lc-outline__section-heading">
    <h3>{sectionName(section)}</h3>
    <details><summary>Rename or remove</summary>
      <form onSubmit={(event) => { event.preventDefault(); dispatch({ type: 'updateSection', id: section.id, title }); }}>
        <label htmlFor={`rename-${section.id}`}>Section name</label>
        <input id={`rename-${section.id}`} maxLength={BOARD_LIMITS.sectionTitle} value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn-secondary" type="submit">Save name</button>
        <button className="canvas-link lc-danger" type="button" onClick={() => dispatch({ type: 'removeSection', id: section.id })}>Remove section, keep thoughts</button>
      </form>
    </details>
  </div>;
}

/**
 * Everything on the board as an ordinary list: every card, its words, its place
 * and its links, with every action a drag would give — reading, keyboard and
 * phone use all start here.
 */
export default function CanvasOutline({ canvas, view, userId, dispatch, spatial = true }) {
  const [chosenOrder, setOrder] = useState('section');
  const order = spatial ? chosenOrder : 'chronological';
  const [editing, setEditing] = useState(null);
  const groups = useMemo(() => outlineGroups(canvas, order), [canvas, order]);
  const j = canvas.journey;
  const due = isRevisitDue(j.revisitOn);
  const formatDate = formatCardDate;
  return <div className="lc-outline">
    <div className={`moment-revisit ${due ? 'due' : ''}`}><Sprout size={20} /><div><strong>{due ? 'A moment to return to' : j.revisitOn ? `Return on ${formatDate(j.revisitOn)}` : 'Return in your own time'}</strong><p>{due ? 'Read your first words. What has happened since? There is no deadline to understand it all.' : 'New understanding can deepen or change your first reflection. There is room for both.'}</p></div></div>
    <RelatedScripture key={`${canvas.id}:${j.moment}`} canvas={canvas} busy={Boolean(editing)} onAdd={async (entry) => dispatch({ type: 'addThought', entry }).ok} />
    <EntryComposer key={canvas.id} canvas={canvas} userId={userId} disabled={Boolean(editing)} onAdd={async (entry) => dispatch({ type: 'addThought', entry }).ok}
      onAddMany={async (entries) => dispatch({ type: 'addThoughts', entries }).ok} />
    <section className="moment-history" aria-labelledby="moment-history-heading">
      <div className="moment-history-bar"><h2 id="moment-history-heading">How this moment is growing</h2>
        {spatial && <div className="moment-view" role="group" aria-label="Order your outline"><button aria-pressed={order === 'section'} onClick={() => setOrder('section')}>By section</button><button aria-pressed={order === 'chronological'} onClick={() => setOrder('chronological')}>Chronological</button></div>}</div>
      <p className="moment-hint">{spatial ? 'Your glimpse, reflections and chosen Scripture, with their sections and connections. Everything you can do on the canvas, you can do here.' : 'Your reflections and chosen Scripture, connected to the original glimpse. Return to add or refine what you are learning.'}</p>
      {spatial && <NewSection dispatch={dispatch} view={view} />}
      {groups.map((group) => <div key={group.section?.id || 'loose'} className="lc-outline__group">
        {order === 'section' && (group.section ? <SectionHeading key={group.section.title} section={group.section} dispatch={dispatch} /> : view.sections.length > 0 && <h3>Not in a section</h3>)}
        {group.cards.length ? <ol className="moment-entries story">{group.cards.map((item) => <OutlineCard key={item.node.id} item={item} canvas={canvas} view={view} userId={userId} dispatch={dispatch} editing={editing} setEditing={setEditing} spatial={spatial} />)}</ol> : <p className="moment-hint">Nothing here yet. Use “Section” on a thought to place it here.</p>}
      </div>)}
    </section>
  </div>;
}
