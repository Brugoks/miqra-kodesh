import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Background, Controls, ReactFlow } from '@xyflow/react';
import { supabase } from '../../lib/supabaseClient';
import { normalizeCanvas } from '../../lib/studyCanvasModel';
import { cardContent } from '../../lib/canvasBoard';
import { toFlowEdges, toFlowNodes } from '../../lib/canvasBoardFlow';
import ThoughtNode from './board/ThoughtNode';
import ScriptureNode from './board/ScriptureNode';
import ConnectionEdge from './board/ConnectionEdge';
import Anchors from './board/Anchors';
import CardBody from './board/CardBody';
import '@xyflow/react/dist/style.css';
import './StudyCanvas.css';
import './MomentCanvas.css';
import './board/CanvasWorkspace.css';
import './PublishedLivingCanvas.css';

function PublishedSection({ data }) {
  return <div className={`lc-section lc-section--${data.color}`}><Anchors /><header className="lc-section__header"><span className="lc-section__title">{data.title}</span></header></div>;
}
const nodeTypes = { thought: ThoughtNode, scripture: ScriptureNode, section: PublishedSection };
const edgeTypes = { connection: ConnectionEdge };

export function PublishedCanvasView({ canvas }) {
  const [selected, setSelected] = useState(null);
  const board = { ...canvas.board, sections: canvas.board.sections.map((s) => ({ ...s, collapsed: false })) };
  const nodes = toFlowNodes(canvas, board);
  const edges = toFlowEdges(board);
  const node = board.nodes.find((n) => n.id === selected);
  const content = node && cardContent(canvas, node);
  return <main className="study-canvas published-canvas" data-no-scripture>
    <header className="canvas-header"><div><span className="canvas-eyebrow">PUBLISHED LIVING CANVAS · READ-ONLY</span><h1>{canvas.title}</h1><p>A selected snapshot. AI-assisted insights should be weighed against Scripture.</p></div></header>
    <div className="published-canvas__board" aria-label="Read-only concept board">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} fitView fitViewOptions={{ maxZoom: 1 }} onNodeClick={(_event, n) => setSelected(n.id)}>
        <Background /><Controls showInteractive={false} />
      </ReactFlow>
    </div>
    {content && <section className="card" aria-label="Selected card"><h2>{content.label}</h2><CardBody content={content} canvas={canvas} readOnly /></section>}
    <section className="card" aria-label="Published cards"><h2>Explore the cards</h2>
      {board.nodes.map((n) => { const c = cardContent(canvas, n); return c && <details key={n.id}><summary>{c.label}{c.reference ? ` · ${c.reference}` : ''} · {c.text.slice(0, 80)}</summary><CardBody content={c} canvas={canvas} readOnly /></details>; })}
    </section>
  </main>;
}
export default function PublishedLivingCanvas() {
  const { token } = useParams();
  const [state, setState] = useState({ canvas: null, loading: true });
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (!supabase || !/^[0-9a-f-]{36}$/i.test(token || '')) throw new Error('Invalid link');
        const { data, error } = await supabase.rpc('get_published_living_canvas', { p_token: token });
        if (error) throw error;
        const canvas = normalizeCanvas(data);
        if (!cancelled) setState({ loading: false, canvas: canvas?.board && !canvas.boardIssue ? canvas : null });
      } catch { if (!cancelled) setState({ loading: false, canvas: null }); }
    };
    load(); return () => { cancelled = true; };
  }, [token]);
  if (state.loading) return <main className="study-canvas"><p role="status">Opening published canvas…</p></main>;
  if (!state.canvas) return <main className="study-canvas"><h1>Canvas unavailable</h1><p>This link is invalid or its owner has stopped publishing it.</p></main>;
  return <PublishedCanvasView canvas={state.canvas} />;
}
