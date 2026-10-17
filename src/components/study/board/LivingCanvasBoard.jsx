import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, MiniMap, Panel, ReactFlow, ReactFlowProvider, SelectionMode, applyNodeChanges, useReactFlow, useViewport } from '@xyflow/react';
import { Maximize, Minus, Plus, Search } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { boundsOf, cardRect, entryNodeId, momentNodeId, sectionAt, sectionFrame, viewportCenter } from '../../../lib/canvasBoard';
import { newEdgeId, newSectionId } from '../../../lib/canvasBoardCommands';
import { boardNeedsMinimap, dragResult, dropTargetFor, toFlowEdges, toFlowNodes } from '../../../lib/canvasBoardFlow';
import { BoardContext } from './BoardContext';
import CanvasDetails from './CanvasDetails';
import CanvasSearch from './CanvasSearch';
import CanvasToolbar from './CanvasToolbar';
import ConnectionEdge from './ConnectionEdge';
import ScriptureNode from './ScriptureNode';
import SectionNode from './SectionNode';
import SelectionBar from './SelectionBar';
import ThoughtNode from './ThoughtNode';
import { cardTitle } from './cardLabels';

// Defined once, outside the component: React Flow compares these by identity.
const nodeTypes = { thought: ThoughtNode, scripture: ScriptureNode, section: SectionNode };
const edgeTypes = { connection: ConnectionEdge };
const NUDGE = 16;
const NUDGE_FAR = 64;

const media = (query) => { try { return Boolean(window.matchMedia?.(query).matches); } catch { return false; } };
const viewportKey = (userId, canvasId) => `miqra_canvas_viewport_v1:${userId}:${canvasId}`;
// The viewport is a per-device convenience, never a content write.
function readViewport(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v && [v.x, v.y, v.zoom].every(Number.isFinite) && v.zoom > 0 ? v : null;
  } catch { return null; }
}
function writeViewport(key, viewport) {
  try { localStorage.setItem(key, JSON.stringify({ x: viewport.x, y: viewport.y, zoom: viewport.zoom })); } catch { /* the viewport is only a convenience */ }
}
const isTyping = (target) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

function Navigation({ onSearch }) {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  return <div className="lc-nav" role="group" aria-label="Move around the canvas">
    <button className="lc-tool lc-tool--text" onClick={() => flow.fitView({ padding: 0.2, maxZoom: 1, duration: media('(prefers-reduced-motion: reduce)') ? 0 : 250 })}><Maximize size={16} /> Fit all</button>
    <button className="lc-icon-button" aria-label="Zoom out" onClick={() => flow.zoomOut()}><Minus size={16} /></button>
    <output className="lc-nav__zoom" aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
    <button className="lc-icon-button" aria-label="Zoom in" onClick={() => flow.zoomIn()}><Plus size={16} /></button>
    <button className="lc-tool lc-tool--text" onClick={onSearch}><Search size={16} /> Search</button>
  </div>;
}

function Board({ canvas, view, userId, dispatch, undo, redo, canUndo, canRedo }) {
  const flow = useReactFlow();
  const wrapper = useRef(null);
  const coarse = useMemo(() => media('(pointer: coarse)'), []);
  const duration = useMemo(() => (media('(prefers-reduced-motion: reduce)') ? 0 : 250), []);
  // A phone cannot show a whole board at a readable size: open on the original glimpse at a size cards can be read,
  // and leave Fit all for the overview. Wider screens open on the whole board.
  const initialFit = useMemo(() => (media('(max-width: 760px)')
    ? { nodes: [{ id: momentNodeId(canvas.id) }], padding: 0.1, minZoom: 0.5, maxZoom: 0.8 }
    : { padding: 0.2, maxZoom: 1 }), [canvas.id]);
  const key = viewportKey(userId, canvas.id);
  const saved = useMemo(() => readViewport(key), [key]);
  const [cache] = useState(() => new Map());
  const timer = useRef(null);

  const [selection, setSelection] = useState({ nodes: new Set(), edge: null });
  const [mode, setMode] = useState('select');
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState(null);
  const [multi, setMulti] = useState(false);
  const [detail, setDetail] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);

  const flowNodes = useMemo(
    () => toFlowNodes(canvas, view, { selected: selection.nodes, connectFrom, connecting: connectMode, cache }),
    [canvas, view, selection.nodes, connectFrom, connectMode, cache],
  );
  const flowEdges = useMemo(() => toFlowEdges(view, { selected: selection.edge }), [view, selection.edge]);
  // The nodes React Flow draws are local, so a drag can move them freely; they
  // are replaced whenever the document (or the selection) yields a new set.
  const [nodes, setNodes] = useState(flowNodes);
  const [synced, setSynced] = useState(flowNodes);
  if (synced !== flowNodes) { setSynced(flowNodes); setNodes(flowNodes); }

  useEffect(() => () => clearTimeout(timer.current), []);

  const sectionById = (id) => view.sections.find((s) => s.id === id);
  const select = (ids, edge = null) => setSelection({ nodes: new Set(ids), edge });
  const clearSelection = () => { select([]); setMoreOpen(false); setDeleteRequested(false); };
  const endConnect = () => { setConnectMode(false); setConnectFrom(null); };
  const center = () => {
    const rect = wrapper.current?.getBoundingClientRect();
    return viewportCenter(flow.getViewport(), { width: rect?.width || 0, height: rect?.height || 0 });
  };
  const reveal = (nodeId) => setTimeout(() => flow.fitView({ nodes: [{ id: nodeId }], duration, maxZoom: 1.1, padding: 0.6 }), 40);

  const openNew = (kind, extra = {}) => { endConnect(); setDetail({ type: 'new', kind, position: center(), ...extra }); };
  const openCard = (nodeId, editing = false) => { endConnect(); setDetail({ type: 'card', nodeId, editing }); };
  const startConnect = (fromId = null) => { setDetail(null); setConnectMode(true); setConnectFrom(fromId); };

  function toggleConnect() {
    if (connectMode) { endConnect(); return; }
    const only = [...selection.nodes].filter((id) => view.nodes.some((n) => n.id === id));
    startConnect(only.length === 1 ? only[0] : null);
  }

  function createSection(cardIds = []) {
    const id = newSectionId();
    const chosen = cardIds.length ? cardIds : [...selection.nodes].filter((n) => view.nodes.some((c) => c.id === n));
    if (dispatch({ type: 'createSection', id, nodeIds: chosen, position: center() }).ok) { select([id]); setDetail({ type: 'section', id }); }
  }

  function chooseConnectTarget(node) {
    if (node.type === 'section') return;
    if (!connectFrom) { setConnectFrom(node.id); return; }
    const id = newEdgeId();
    const result = dispatch({ type: 'connect', id, source: connectFrom, target: node.id });
    if (!result.ok) return; // the reason is announced and shown; stay here to choose again
    endConnect();
    select([], id);
    setDetail({ type: 'edge', id });
  }

  function onNodesChange(changes) {
    const rest = changes.filter((c) => c.type !== 'select');
    if (rest.length) setNodes((current) => applyNodeChanges(rest, current));
    const picks = changes.filter((c) => c.type === 'select');
    // Connecting and multi-select taps manage selection themselves.
    if (!picks.length || connectMode || multi) return;
    setSelection((prev) => {
      const next = new Set(prev.nodes);
      for (const change of picks) { if (change.selected) next.add(change.id); else next.delete(change.id); }
      return { nodes: next, edge: next.size ? null : prev.edge };
    });
    setMoreOpen(false); setDeleteRequested(false);
  }

  function onNodeClick(_event, node) {
    if (connectMode) { chooseConnectTarget(node); return; }
    if (multi) {
      const next = new Set(selection.nodes);
      if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
      select(next);
    }
  }

  function onNodeDrag(_event, node, dragged) {
    if (dragged.length !== 1 || node.type === 'section') { if (dropTarget) setDropTarget(null); return; }
    const next = dropTargetFor(node, nodes, view, sectionAt);
    if (next !== dropTarget) setDropTarget(next);
  }

  function onNodeDragStop(_event, _node, dragged) {
    setDropTarget(null);
    const result = dragResult(dragged, nodes, view);
    if (result.nodes.length || result.sections.length) dispatch({ type: 'move', ...result });
    // If nothing was accepted the document did not change, so put the cards back where it says they are.
    setNodes(flowNodes);
  }

  function nudge(ids, dx, dy) {
    const cards = view.nodes.filter((n) => ids.includes(n.id) && !(n.sectionId && ids.includes(n.sectionId)));
    const sections = view.sections.filter((s) => ids.includes(s.id));
    if (!cards.length && !sections.length) return;
    dispatch({ type: 'move', nodes: cards.map((n) => ({ id: n.id, x: n.x + dx, y: n.y + dy })), sections: sections.map((s) => ({ id: s.id, x: s.x + dx, y: s.y + dy })) });
  }

  function onKeyDown(event) {
    if (isTyping(event.target)) return;
    const focused = event.target.closest?.('.react-flow__node')?.dataset.id;
    const targets = selection.nodes.size ? [...selection.nodes] : focused ? [focused] : [];
    const step = event.shiftKey ? NUDGE_FAR : NUDGE;
    const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); setSearchOpen(true); return; }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Escape') {
      // Cancel a pending gesture first, then clear what is selected.
      if (connectMode) endConnect(); else if (selection.nodes.size || selection.edge) clearSelection();
    } else if (arrows[event.key] && targets.length && !connectMode) {
      event.preventDefault(); event.stopPropagation();
      nudge(targets, ...arrows[event.key]);
    } else if (event.key === 'Enter' || event.key === ' ') {
      const id = focused || (selection.nodes.size === 1 ? [...selection.nodes][0] : null);
      if (!id) return;
      event.preventDefault();
      if (connectMode) { const node = nodes.find((n) => n.id === id); if (node) chooseConnectTarget(node); }
      else if (view.sections.some((s) => s.id === id)) { select([id]); if (event.key === 'Enter') setDetail({ type: 'section', id }); }
      else if (event.key === 'Enter') { select([id]); openCard(id, true); }
      else select([id]);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selection.edge) { event.preventDefault(); dispatch({ type: 'removeEdge', id: selection.edge }); clearSelection(); }
      else if (selection.nodes.size === 1) {
        const id = [...selection.nodes][0];
        if (view.sections.some((s) => s.id === id)) { event.preventDefault(); dispatch({ type: 'removeSection', id }); clearSelection(); }
        else { event.preventDefault(); setMoreOpen(true); setDeleteRequested(true); }
      }
    }
  }

  function onPaneDoubleClick(event) {
    if (!event.target.classList?.contains('react-flow__pane')) return;
    openNew('reflection', { position: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
  }

  function pick(hit) {
    setSearchOpen(false);
    if (hit.type === 'connection') { select([], hit.edgeId); return; }
    const id = hit.type === 'section' ? hit.sectionId : hit.nodeId;
    const node = view.nodes.find((n) => n.id === id);
    const home = node?.sectionId && sectionById(node.sectionId);
    if (home?.collapsed) dispatch({ type: 'toggleSection', id: home.id }); // show what was found
    select([id]);
    reveal(id);
  }

  function onAdded(added) {
    const ids = (Array.isArray(added) ? added : [added]).map((entry) => entryNodeId(entry.id));
    const branched = detail?.connectFrom;
    setDetail(null);
    select(ids);
    if (branched) reveal(ids[0]);
  }

  const board = useMemo(() => ({
    dropTarget,
    toggleSection: (id) => dispatch({ type: 'toggleSection', id }),
    resizeSection: (id, width, height) => dispatch({ type: 'resizeSection', id, width, height }),
  }), [dropTarget, dispatch]);

  const bounds = useMemo(() => boundsOf([...view.nodes.map(cardRect), ...view.sections.map(sectionFrame)]), [view]);
  const handTool = mode === 'hand';
  const sourceName = connectFrom && cardTitle(canvas, view.nodes.find((n) => n.id === connectFrom) || { contentRef: { type: 'moment' } }, 40);

  return <div className={`lc-board${detail ? ' has-details' : ''}${connectMode ? ' is-connecting' : ''}${handTool ? ' is-hand' : ''}`} onKeyDown={onKeyDown}>
    <CanvasToolbar mode={mode} setMode={setMode} connecting={connectMode} multi={multi} setMulti={setMulti} coarse={coarse}
      onAdd={(kind) => openNew(kind)} onConnect={toggleConnect} onSection={() => createSection()}
      canUndo={canUndo} canRedo={canRedo} undo={undo} redo={redo} />
    <div className="lc-stage">
      <div className="lc-flow" ref={wrapper} onDoubleClick={onPaneDoubleClick}>
        <BoardContext.Provider value={board}>
          <ReactFlow
            nodes={nodes} edges={flowEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            onNodesChange={onNodesChange} onNodeClick={onNodeClick} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop}
            onNodeDoubleClick={(_e, node) => (node.type === 'section' ? setDetail({ type: 'section', id: node.id }) : openCard(node.id, true))}
            onEdgeClick={(_e, edge) => { if (!connectMode) select([], edge.id); }}
            onEdgeDoubleClick={(_e, edge) => setDetail({ type: 'edge', id: edge.id })}
            onPaneClick={() => { if (!connectMode) clearSelection(); }}
            onMoveEnd={(_e, viewport) => { clearTimeout(timer.current); timer.current = setTimeout(() => writeViewport(key, viewport), 300); }}
            {...(saved ? { defaultViewport: saved } : { fitView: true, fitViewOptions: initialFit })}
            minZoom={0.1} maxZoom={2} nodeDragThreshold={4}
            panOnScroll panOnDrag={handTool || coarse ? true : [1, 2]} panActivationKeyCode="Space"
            selectionOnDrag={!handTool && !coarse} selectionMode={SelectionMode.Partial} multiSelectionKeyCode="Shift"
            zoomOnScroll={false} zoomOnDoubleClick={false} zoomOnPinch defaultMarkerColor="var(--text-muted)"
            deleteKeyCode={null} disableKeyboardA11y nodesConnectable={false} nodesDraggable={!connectMode && !handTool}
            aria-label="Living Canvas. Use the Outline view for a list of everything on this canvas."
          >
            <Background gap={24} size={1.5} />
            {boardNeedsMinimap(bounds) && <MiniMap pannable zoomable ariaLabel="Overview of your whole canvas" className="lc-minimap" />}
            <Panel position="bottom-left"><Navigation onSearch={() => setSearchOpen(true)} /></Panel>
            {view.nodes.length === 1 && !view.sections.length && !selection.nodes.size && !selection.edge && !connectMode && <Panel position="top-center" className="lc-hint"><p>Add another thought, connect ideas, or create a section.</p></Panel>}
          </ReactFlow>
        </BoardContext.Provider>
        {searchOpen && <CanvasSearch canvas={canvas} onPick={pick} onClose={() => setSearchOpen(false)} />}
      </div>
      <div className="lc-overlay">
        {connectMode && <div className="lc-mode-banner" role="status">
          <span>{connectFrom ? `Connecting from “${sourceName}”. Choose the thought it relates to.` : 'Connect: choose the first thought.'}</span>
          <button className="lc-tool lc-tool--text" onClick={endConnect}>Cancel</button>
        </div>}
        <SelectionBar selection={selection} view={view} dispatch={dispatch} moreOpen={moreOpen} setMoreOpen={setMoreOpen} deleteRequested={deleteRequested}
          onEdit={(id) => openCard(id, true)} onConnect={(id) => startConnect(id)} onBranch={(id) => openNew('reflection', { connectFrom: id })}
          onCreateSection={createSection} onOpenSection={(id) => setDetail({ type: 'section', id })} onOpenEdge={(id) => setDetail({ type: 'edge', id })} onClear={clearSelection} />
      </div>
    </div>
    {detail && <CanvasDetails detail={detail} canvas={canvas} view={view} userId={userId} dispatch={dispatch} onClose={() => setDetail(null)}
      onOpenCard={(id) => { select([id]); reveal(id); setDetail({ type: 'card', nodeId: id }); }} onBranch={(id) => setDetail({ type: 'new', kind: 'reflection', connectFrom: id, position: center() })} onAdded={onAdded} />}
  </div>;
}

export default function LivingCanvasBoard(props) {
  return <ReactFlowProvider><Board {...props} /></ReactFlowProvider>;
}
