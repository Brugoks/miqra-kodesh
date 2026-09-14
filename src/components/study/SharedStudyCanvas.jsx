import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Layers3, Loader2, Printer } from 'lucide-react';
import { loadSharedCanvas } from '../../lib/studyCanvas';
import { combinedSources, orderTree } from '../../lib/studyCanvasModel';
import CanvasScripture from './CanvasScripture';
import CanvasConnections from './CanvasConnections';
import CanvasPath from './CanvasPath';
import CanvasStep from './CanvasStep';
import CanvasPinboard from './CanvasPinboard';
import CanvasHandout from './CanvasHandout';
import { revealCanvasSource } from './canvasDom';
import { usePrintHandout } from './usePrintHandout';
import './StudyCanvas.css';

/** A canvas someone shared by link: the whole study, read-only, for any signed-in member. */
export default function SharedStudyCanvas({ session }) {
  const { token } = useParams();
  if (!session?.user?.id) return <div className="card"><h1>Shared study</h1><p>Sign in to read this shared study.</p></div>;
  return <SharedView key={token} token={token} />;
}

function SharedView({ token }) {
  const [state, setState] = useState({ status: 'loading', canvas: null });
  const [currentId, setCurrentId] = useState(null);
  const [selectedSource, setSelectedSource] = useState(null);
  const { printing, print } = usePrintHandout();

  useEffect(() => {
    let cancelled = false;
    loadSharedCanvas(token)
      .then((canvas) => { if (!cancelled) setState({ status: canvas ? 'ready' : 'missing', canvas }); })
      .catch(() => { if (!cancelled) setState({ status: 'error', canvas: null }); });
    return () => { cancelled = true; };
  }, [token]);

  const { status, canvas } = state;
  if (status === 'loading') return <div className="study-canvas"><p className="canvas-progress" role="status"><Loader2 className="canvas-spin" size={16} /> Opening shared study…</p></div>;
  if (!canvas) return <div className="study-canvas"><section className="canvas-welcome"><Layers3 size={36} /><h2>{status === 'error' ? 'This study could not be opened' : 'This study is not shared'}</h2>
    <p>{status === 'error' ? 'Check your connection and try again.' : 'The link may be mistyped, or its owner has stopped sharing it.'}</p><div><Link to="/">Go home</Link></div></section></div>;

  const step = canvas.steps.find((s) => s.id === currentId) || canvas.steps.at(-1);
  const numbers = new Map(canvas.steps.map((s, i) => [s.id, i + 1]));
  const branchFrom = orderTree(canvas.steps).find((entry) => entry.step.id === step.id)?.branchFrom;
  const reveal = (id) => { setSelectedSource(id); revealCanvasSource(id); };
  const openStep = (id) => { setCurrentId(id); document.querySelector('.canvas-insights')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return <div className="study-canvas" data-no-scripture>
    <header className="canvas-header">
      <div><span className="canvas-eyebrow"><Layers3 size={15} /> SHARED STUDY · READ-ONLY</span><h1>{canvas.title}</h1>
        <p>{[canvas.ownerName && `Shared by ${canvas.ownerName}`, canvas.savedAt && `updated ${new Date(canvas.savedAt).toLocaleDateString()}`, `${canvas.steps.length} ${canvas.steps.length === 1 ? 'step' : 'steps'}`].filter(Boolean).join(' · ')}</p></div>
      <button type="button" className="btn-secondary" onClick={print}><Printer size={16} /> Print handout</button>
    </header>
    <div className="canvas-grid">
      <CanvasScripture passages={canvas.passages} selectedSource={selectedSource} readOnly />
      <section className="canvas-insights" aria-label="Study explanation">
        {canvas.steps.length > 1 && <CanvasPath steps={canvas.steps} currentId={step.id} onSelect={setCurrentId} />}
        <CanvasStep step={step} number={numbers.get(step.id)} stepCount={canvas.steps.length} branchFrom={branchFrom} isLatest sources={combinedSources(canvas.passages)} readOnly onReveal={reveal} />
      </section>
      <CanvasConnections passages={canvas.passages} selectedSource={selectedSource} />
    </div>
    <CanvasPinboard steps={canvas.steps} pins={canvas.pins} readOnly onOpenStep={openStep} />
    {printing && <CanvasHandout canvas={canvas} includeNotes={canvas.includesNotes} ownerName={canvas.ownerName} />}
  </div>;
}
