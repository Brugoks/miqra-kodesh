import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '../../../src/index.css';
import StudyCanvas from '../../../src/components/study/StudyCanvas';
import Layout from '../../../src/components/Layout';
import { createMoment } from '../../../src/lib/canvasJourney';
import { applyCommand } from '../../../src/lib/canvasBoardCommands';
import { projectBoard } from '../../../src/lib/canvasBoard';

const entry = (id, text, kind = 'reflection') => ({ id, kind, text, createdAt: '2026-02-01T12:00:00Z' });
const run = (canvas, command) => { const r = applyCommand(canvas, command); if (!r.ok) throw new Error(r.error); return r.canvas; };
function build(kind) {
  let canvas = createMoment('A friend brought dinner when I felt overwhelmed.');
  canvas.id = '00000000-0000-4000-8000-000000000001';
  if (kind === 'full') {
    canvas.journey.entries = Array.from({ length: 100 }, (_, i) => entry('e' + i, 'Thought number ' + i + ' about waiting and trust'));
  } else {
    canvas.journey.entries = [entry('a', 'Waiting is hard'), entry('b', 'God is near'), entry('c', 'What does trust look like?', 'question')];
  }
  canvas.board = projectBoard(canvas).board;
  if (kind === 'full') {
    for (let i = 0; i < 20; i += 1) canvas = run(canvas, { type: 'createSection', id: 's' + i, title: 'Section ' + i, nodeIds: ['entry:e' + i * 5, 'entry:e' + (i * 5 + 1)] });
    const ids = ['moment:' + canvas.id, ...canvas.journey.entries.map((e) => 'entry:' + e.id)];
    let n = 0;
    for (const hop of [1, 7, 13]) for (let i = 0; i < ids.length && n < 200; i += 1) { canvas = run(canvas, { type: 'connect', source: ids[i], target: ids[(i + hop) % ids.length] }); n += 1; }
  } else {
    canvas = run(canvas, { type: 'move', nodes: [{ id: 'entry:a', x: 440, y: 40 }, { id: 'entry:b', x: 880, y: 40 }, { id: 'entry:c', x: 440, y: 420 }] });
    canvas = run(canvas, { type: 'createSection', id: 'section:one', title: 'Noticing', nodeIds: ['entry:c'] });
  }
  return canvas;
}
window.__seed = (kind) => {
  const c = build(kind);
  const row = { id: c.id, title: c.title, reference: 'Personal moment', passages: [], steps: [], pins: [], journey: c.journey, board: c.board, savedAt: new Date().toISOString() };
  localStorage.setItem('miqra_canvas_v1:u1:org', JSON.stringify([row]));
  localStorage.setItem('miqra_canvas_view_v1:u1', 'canvas');
  localStorage.removeItem('miqra_canvas_viewport_v1:u1:' + c.id);
  return c.id;
};
// The page sits inside the app's real Layout (header, sidebar, bottom tab bar), so full screen is checked against the real chrome.
const ORG = { id: 'org', name: 'First Church', slug: 'first-church', logo_url: null, primary_color: '#2e52be', secondary_color: '#ffffff' };
const session = { user: { id: 'u1', email: 'test@example.com', user_metadata: { full_name: 'Test User' } } };
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Layout onSignOut={() => {}} userRole="student" session={session} organization={ORG} organizationsList={[ORG]} primaryOrgId="org"
      onSwitchOrganization={() => {}} onSetPrimaryOrganization={() => {}} onJoinOrganization={() => {}}>
      <StudyCanvas session={session} userRole="student" activeOrgId="org" />
    </Layout>
  </BrowserRouter>,
);
