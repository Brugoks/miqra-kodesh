import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { normalizeCanvas } from '../../../src/lib/studyCanvasModel';
import { PublishedCanvasView } from '../../../src/components/study/PublishedLivingCanvas';
import MomentCanvas from '../../../src/components/study/MomentCanvas';
import '../../../src/index.css';

// Served only by this harness. Fixture is produced by the isolated database check.
const fixture = await (await fetch('/sample.json')).json();
const isPublic = new URLSearchParams(location.search).has('public');
const raw = fixture.private;
localStorage.setItem('miqra_canvas_v1:acceptance:personal', JSON.stringify([raw]));
localStorage.setItem('miqra_canvas_fullscreen_v1:acceptance', 'off');
localStorage.setItem('miqra_canvas_view_v1:acceptance', 'canvas');
const canvas = normalizeCanvas(fixture.published);
window.__acceptance = { private: normalizeCanvas(raw), published: canvas };
createRoot(document.getElementById('root')).render(<BrowserRouter>{isPublic
  ? <PublishedCanvasView canvas={canvas} />
  : <MomentCanvas userId="acceptance" orgId={null} initialCanvasId={raw.id} />}</BrowserRouter>);
