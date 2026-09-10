import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, BookOpen, Layers3, Loader2, Map, Save, Send, Square, Trash2 } from 'lucide-react';
import { isAdminRole } from '../../lib/roles';
import { deleteCanvas, readCanvases, requestCanvas, saveCanvas } from '../../lib/studyCanvas';
import './StudyCanvas.css';

export default function StudyCanvas({ session, userRole, activeOrgId }) {
  if (!session?.user?.id || !isAdminRole(userRole)) return <div className="card"><h1>Living Study Canvas</h1><p>This feature is available to signed-in admins only.</p></div>;
  return <CanvasWorkspace key={`${session.user.id}:${activeOrgId || ''}`} userId={session.user.id} orgId={activeOrgId} />;
}

function CanvasWorkspace({ userId, orgId }) {
  const [params] = useSearchParams();
  const [reference, setReference] = useState(() => params.get('ref') || 'Mark 2:1–12');
  const [question, setQuestion] = useState('Help me understand this passage.');
  const [workspace, setWorkspace] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [turns, setTurns] = useState([]);
  const [studyReference, setStudyReference] = useState('');
  const [resultFocus, setResultFocus] = useState('');
  const [canvasId, setCanvasId] = useState(null);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedSource, setSelectedSource] = useState(null);
  const [saved, setSaved] = useState(() => readCanvases(userId, orgId));
  const pending = useRef(null);
  const busy = Boolean(phase);
  const lastQuestion = [...turns].reverse().find((turn) => turn.role === 'user')?.content;

  useEffect(() => () => pending.current?.abort(), []);

  function stop() {
    pending.current?.abort();
    pending.current = null;
    setPhase('');
  }

  async function run(ref, nextTurns, loaded = null) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setError(''); setNotice(''); setTurns(nextTurns); setStudyReference(ref);
    setPhase(loaded ? 'Building your explanation…' : 'Loading Scripture and related entries…');
    try {
      const nextWorkspace = loaded || (await requestCanvas({ action: 'sources', reference: ref }, controller.signal)).workspace;
      if (controller.signal.aborted) return;
      setWorkspace(nextWorkspace); setStudyReference(nextWorkspace.reference); setReference(nextWorkspace.reference);
      setPhase('Building your explanation…');
      const result = await requestCanvas({ action: 'explain', reference: nextWorkspace.reference, turns: nextTurns.slice(-12) }, controller.signal);
      if (controller.signal.aborted) return;
      setExplanation(result.explanation);
      setResultFocus(nextTurns.at(-1).content);
      const answer = result.explanation.cards.map((card) => `${card.title}: ${card.body}`).join('\n').slice(0, 3000);
      setTurns([...nextTurns, { role: 'assistant', content: answer }].slice(-12));
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message || 'Could not build this study. Please retry.');
    } finally {
      if (pending.current === controller) { pending.current = null; setPhase(''); }
    }
  }

  function start(event) {
    event.preventDefault();
    if (!reference.trim()) return;
    setWorkspace(null); setExplanation(null); setResultFocus(''); setSelectedSource(null); setCanvasId(null);
    const prompt = question.trim() || 'Help me understand this passage.';
    setQuestion('');
    run(reference.trim(), [{ role: 'user', content: prompt }]);
  }

  function followUp(text) {
    if (!text.trim() || !studyReference) return;
    const nextTurns = [...turns, { role: 'user', content: text.trim() }].slice(-12);
    setQuestion('');
    run(studyReference, nextTurns, workspace);
  }

  function save() {
    try {
      const id = canvasId || crypto.randomUUID();
      setSaved(saveCanvas(userId, orgId, { id, title: explanation.title, workspace, explanation, turns, resultFocus, savedAt: new Date().toISOString() }));
      setCanvasId(id); setNotice('Saved on this device.');
    } catch { setError('This browser could not save the canvas. Storage may be full or unavailable.'); }
  }

  function restore(item) {
    stop(); setWorkspace(item.workspace); setReference(item.workspace.reference); setStudyReference(item.workspace.reference);
    setExplanation(item.explanation); setTurns(item.turns); setResultFocus(item.resultFocus || ''); setCanvasId(item.id);
    setQuestion(''); setError(''); setNotice('Opened saved canvas.'); setSelectedSource(null);
  }

  function reveal(id) {
    setSelectedSource(id);
    document.getElementById(`canvas-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById(`canvas-${id}`)?.focus({ preventScroll: true });
  }

  const verses = workspace?.sources.filter((source) => source.kind === 'verse') || [];
  const entities = workspace?.sources.filter((source) => source.kind !== 'verse') || [];
  const canSave = explanation && !busy && turns.at(-1)?.role === 'assistant';

  return <div className="study-canvas" data-no-scripture>
    <header className="canvas-header">
      <div><span className="canvas-eyebrow"><Layers3 size={15} /> ADMIN PREVIEW</span><h1>Living Study Canvas</h1><p>Read the passage. Explore its connections. Follow your questions.</p></div>
      <button className="btn-secondary" onClick={save} disabled={!canSave}><Save size={16} /> Save canvas</button>
    </header>

    <form className="canvas-start" onSubmit={start}>
      <div><label htmlFor="canvas-reference">Passage</label><input id="canvas-reference" value={reference} maxLength={100} onChange={(event) => setReference(event.target.value)} placeholder="Mark 2:1–12" required /><small>One chapter or a verse range within it · Berean Standard Bible</small></div>
      <button className="btn-primary" type="submit"><BookOpen size={17} /> {studyReference ? 'Start new study' : 'Open canvas'}</button>
    </form>

    <form className="canvas-composer" onSubmit={(event) => { event.preventDefault(); if (studyReference) followUp(question); else start(event); }}>
      <label htmlFor="canvas-question">{studyReference ? 'Where would you like to go next?' : 'What would you like to understand?'}</label>
      <div className="canvas-compose-row"><textarea id="canvas-question" maxLength={3000} rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={busy ? 'Change the focus while your study is being prepared…' : 'Focus on the forgiveness question…'} />
        <button className="btn-primary" type="submit" disabled={!question.trim()}><Send size={16} /> {busy ? 'Change focus' : 'Explore'}</button></div>
      {busy && <div className="canvas-progress" role="status"><Loader2 className="canvas-spin" size={16} /><span>{phase} You can change the focus now.</span><button type="button" className="btn-secondary" onClick={stop}><Square size={13} /> Stop</button></div>}
    </form>

    {error && <div className="canvas-error" role="alert"><span>{error}</span>{studyReference && turns.length > 0 && <button className="btn-secondary" onClick={() => run(studyReference, turns.at(-1)?.role === 'user' ? turns : turns.slice(0, -1), workspace)}>Retry</button>}</div>}
    {notice && <p className="canvas-notice" role="status">{notice}</p>}

    {workspace ? <div className="canvas-grid">
      <section className="canvas-card canvas-scripture" aria-label="Scripture sources"><div className="canvas-section-heading"><BookOpen size={18} /><h2>{workspace.reference}</h2><span>BSB</span></div>
        <div className="canvas-verses">{verses.map((source) => <p id={`canvas-${source.id}`} tabIndex={-1} key={source.id} className={selectedSource === source.id ? 'canvas-selected' : ''}><sup>{source.ref.split(':').at(-1)}</sup>{source.text}</p>)}</div>
        <a href="https://berean.bible/" target="_blank" rel="noreferrer" className="canvas-attribution">Berean Standard Bible · Public domain <ArrowUpRight size={12} /></a>
      </section>

      <section className="canvas-insights" aria-label="Study explanation">
        {explanation ? <><div className="canvas-insight-title"><span className="canvas-eyebrow">YOUR STUDY</span><h2>{explanation.title}</h2><p>Focus: {resultFocus}</p>{lastQuestion !== resultFocus && <small>Previous explanation shown while you explore a new focus.</small>}</div>
          {explanation.cards.map((card) => <article className="canvas-card" key={card.id}><span className={`canvas-kind ${card.kind}`}>{card.kind === 'observation' ? 'Text observation' : 'Interpretation'}</span><h3>{card.title}</h3><p>{card.body}</p><div className="canvas-citations" aria-label="Supporting sources">{card.sourceIds.map((id) => { const source = workspace.sources.find((s) => s.id === id); return source ? <button key={id} type="button" onClick={() => reveal(id)}>{source.title}</button> : null; })}</div></article>)}
          <div className="canvas-next"><h3>Keep exploring</h3>{explanation.questions.map((text) => <button type="button" key={text} onClick={() => followUp(text)}>{text}<ArrowUpRight size={16} /></button>)}</div>
        </> : <div className="canvas-card canvas-empty"><Layers3 size={32} /><h2>Your sources are ready</h2><p>{busy ? 'Your explanation will appear here. You can keep reading or change the focus above.' : 'Ask a question to connect the evidence into a study.'}</p></div>}
      </section>

      <aside className="canvas-connections" aria-label="Related people and places"><div className="canvas-section-heading"><h2>In this chapter</h2></div><p className="canvas-context-note">Chapter-level Wiki connections; some may fall outside your selected verses.</p>
        <Link className="canvas-atlas" to={`/atlas?chapters=${encodeURIComponent(workspace.chapterId)}`}><Map size={22} /><span><strong>Explore the setting</strong><small>Open this chapter in Ancient World</small></span><ArrowUpRight size={17} /></Link>
        {entities.map((source) => <article id={`canvas-${source.id}`} tabIndex={-1} key={source.id} className={`canvas-card ${selectedSource === source.id ? 'canvas-selected' : ''}`}><span className="canvas-kind">{source.kind === 'person' ? 'Person' : 'Place'}</span><h3><Link to={`/wiki/${encodeURIComponent(source.slug)}`}>{source.title} <ArrowUpRight size={14} /></Link></h3><p>{source.text}</p></article>)}
        {!entities.length && <p>No related Wiki entries are indexed for this chapter yet.</p>}
        <p className="canvas-context-note">Wiki foundation: Theographic Bible Metadata and OpenBible.info (CC BY), with curated app notes. Explanations are AI-generated interpretations; inspect their linked evidence.</p>
      </aside>
    </div> : <section className="canvas-welcome"><Layers3 size={36} /><h2>A place for your next question</h2><p>Open a passage to bring Scripture, people, places, and sourced explanations together.</p><div><button onClick={() => setReference('Mark 2:1–12')}>Mark 2:1–12</button><button onClick={() => setReference('Ruth 1')}>Ruth 1</button><button onClick={() => setReference('Psalm 23')}>Psalm 23</button></div></section>}

    <section className="canvas-saved"><h2>Saved canvases <span>On this device · up to 10</span></h2>{saved.length ? <div className="canvas-saved-grid">{saved.map((item) => <div key={item.id}><button className="canvas-saved-open" aria-label={`${item.title} ${item.workspace.reference}`} onClick={() => restore(item)}><strong>{item.title}</strong><span>{item.workspace.reference}</span></button><button className="canvas-delete" aria-label={`Delete ${item.title}`} onClick={() => { try { setSaved(deleteCanvas(userId, orgId, item.id)); if (canvasId === item.id) setCanvasId(null); } catch { setError('Could not delete this saved canvas.'); } }}><Trash2 size={16} /></button></div>)}</div> : <p>Save a completed canvas to return to it later.</p>}</section>
  </div>;
}
