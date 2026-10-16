import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Check, Download, Heart, LockKeyhole, Plus, Sprout, Trash2 } from 'lucide-react';
import { deleteCanvas, isCanvasSyncAvailable, listCanvases, loadCanvas, saveCanvas } from '../../lib/studyCanvas';
import { canvasFileName } from '../../lib/studyCanvasModel';
import { createMoment, isRevisitDue, JOURNEY_ENTRY_MAX, JOURNEY_KINDS, JOURNEY_TEXT_MAX, journeyToMarkdown } from '../../lib/canvasJourney';
import { refToPassageIds } from '../../lib/scripture';
import './MomentCanvas.css';

const formatDate = (value) => new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const CAPTURE_DRAFT = { text: '', days: '7', id: '' };
const ENTRY_DRAFT = { text: '', kind: 'reflection', reference: '' };

// Write drafts as the user types, so switching pages cannot discard an unsaved
// thought. Keys belong to the signed-in person; no private text goes into URLs.
function useMomentDraft(key, defaults) {
  const [value, setValue] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key));
      return stored && Object.keys(defaults).every((field) => typeof stored[field] === 'string' && stored[field].length <= JOURNEY_TEXT_MAX)
        && (!('days' in defaults) || ['', '1', '7', '30'].includes(stored.days)) ? stored : defaults;
    } catch { return defaults; }
  });
  const [available, setAvailable] = useState(true);
  function update(next) {
    setValue(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setAvailable(true); } catch { setAvailable(false); }
  }
  function clear() {
    setValue(defaults);
    try { localStorage.removeItem(key); } catch { setAvailable(false); }
  }
  return [value, update, clear, available];
}

function CaptureMoment({ userId, busy, onCapture }) {
  const [draft, setDraft, clearDraft, draftAvailable] = useMomentDraft(`miqra_moment_draft_v1:${userId}`, CAPTURE_DRAFT);
  async function capture(event) {
    event.preventDefault();
    if (!draft.text.trim()) return;
    const candidate = createMoment(draft.text, draft.days);
    candidate.id = draft.id || candidate.id;
    setDraft({ ...draft, id: candidate.id });
    if (await onCapture(candidate)) clearDraft();
  }
  return <section className="moment-capture" aria-labelledby="capture-heading">
    <span className="moment-icon"><Sprout size={26} /></span>
    <h2 id="capture-heading">Capture a glimpse</h2>
    <p>A conversation, an act of kindness, a difficult day. Keep the moment when something about your faith became clearer.</p>
    <form onSubmit={capture}>
      <fieldset disabled={busy}>
        <label htmlFor="moment-text">What happened, and what did you glimpse?</label>
        <textarea id="moment-text" rows={5} required maxLength={JOURNEY_TEXT_MAX} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="Today I noticed…" aria-describedby="moment-capture-hint" />
        <p className="moment-hint" id="moment-capture-hint">A few words are enough. You can add Scripture, prayer, or questions after saving.</p>
        <label htmlFor="moment-revisit">When would you like to return?</label>
        <select id="moment-revisit" value={draft.days} onChange={(e) => setDraft({ ...draft, days: e.target.value })}>
          <option value="7">In a week</option><option value="1">Tomorrow</option><option value="30">In 30 days</option><option value="">I’ll return on my own</option>
        </select>
        <p className="moment-hint">Your canvas will show when it is time to revisit. No notifications are sent.</p>
        <button type="submit" className="btn-primary" disabled={busy || !draft.text.trim()}><Check size={16} /> {busy ? 'Keeping your glimpse…' : 'Keep this glimpse'}</button>
      </fieldset>
    </form>
    <p className="moment-hint"><LockKeyhole size={13} /> Private to you. Your words are not sent to AI.</p>
    {!draftAvailable && <p role="status" className="moment-warning">This browser cannot keep a draft. Save your glimpse before leaving this page.</p>}
  </section>;
}

function EntryComposer({ canvas, userId, busy, onAdd }) {
  const [draft, setDraft, clearDraft, available] = useMomentDraft(`miqra_moment_entry_v1:${userId}:${canvas.id}`, ENTRY_DRAFT);
  const kind = Object.hasOwn(JOURNEY_KINDS, draft.kind) ? draft.kind : 'reflection';
  const guidance = JOURNEY_KINDS[kind];
  const [error, setError] = useState('');
  const full = canvas.journey.entries.length >= JOURNEY_ENTRY_MAX;
  async function submit(event) {
    event.preventDefault();
    if (!draft.text.trim() || full) return;
    if (kind === 'scripture' && !refToPassageIds(draft.reference.trim()).length) {
      setError('Use a Bible reference such as Ephesians 2:8–10.'); return;
    }
    setError('');
    const entry = { id: crypto.randomUUID(), kind, text: draft.text.trim(), createdAt: new Date().toISOString(), ...(kind === 'scripture' ? { reference: draft.reference.trim() } : {}) };
    if (await onAdd(entry)) clearDraft();
  }
  return <section className="moment-composer" aria-labelledby="moment-grow-heading">
    <span className="canvas-eyebrow">{canvas.journey.entries.length ? 'RETURN & DEEPEN' : 'WHEN YOU ARE READY'}</span>
    <h2 id="moment-grow-heading">{canvas.journey.entries.length ? 'What is becoming clearer?' : 'Let this moment grow'}</h2>
    <p>{canvas.journey.entries.length ? 'Your original words stay here. Add what you are learning now, even if your understanding has changed.' : 'Your glimpse is enough for today. Or choose one way to explore it below.'}</p>
    <form onSubmit={submit}>
      <fieldset disabled={busy || full}>
        <legend className="moment-legend">What would you like to add?</legend>
        <div className="moment-kinds">{Object.entries(JOURNEY_KINDS).map(([key, value]) => <label key={key} className={kind === key ? 'selected' : ''}>
          <input type="radio" name="moment-kind" value={key} checked={kind === key} onChange={() => { setDraft({ ...draft, kind: key }); setError(''); }} />{value.label}
        </label>)}</div>
        {kind === 'scripture' && <><label htmlFor="moment-scripture">Passage to explore</label><input id="moment-scripture" maxLength={100} required placeholder="Ephesians 2:8–10" value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} /></>}
        <label htmlFor="moment-entry">{guidance.prompt}</label>
        <textarea id="moment-entry" rows={4} required maxLength={JOURNEY_TEXT_MAX} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} aria-describedby="moment-entry-hint" />
        <p className="moment-hint" id="moment-entry-hint">{guidance.hint}</p>
        {error && <p role="alert" className="moment-warning">{error}</p>}
        <button className="btn-primary" type="submit" disabled={busy || full || !draft.text.trim()}><Plus size={16} /> {busy ? 'Saving…' : `Add ${guidance.label.toLowerCase()}`}</button>
      </fieldset>
    </form>
    {full && <p role="status">This thread holds 100 entries. Keep a new glimpse to continue your journey.</p>}
    {!available && <p role="status" className="moment-warning">Your draft is only in this open page. Save it before leaving.</p>}
  </section>;
}

function JourneyExport({ canvas }) {
  const [selected, setSelected] = useState(() => new Set(canvas.journey.entries.map((e) => e.id)));
  const entries = canvas.journey.entries.filter((entry) => selected.has(entry.id));
  function download() {
    const url = URL.createObjectURL(new Blob([journeyToMarkdown(canvas, entries)], { type: 'text/markdown;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: canvasFileName(canvas.title) });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return <details className="moment-export"><summary><Download size={16} /> Take part of your story with you</summary>
    <p>Download a personal copy. Your title and original glimpse are included. Choose which later entries to include; nothing is published.</p>
    {canvas.journey.entries.map((entry) => <label className="moment-export-choice" key={entry.id}><input type="checkbox" checked={selected.has(entry.id)} onChange={(e) => setSelected((current) => { const next = new Set(current); if (e.target.checked) next.add(entry.id); else next.delete(entry.id); return next; })} /><span>{JOURNEY_KINDS[entry.kind].label} · {formatDate(entry.createdAt)}<small>{entry.text}</small></span></label>)}
    <details><summary>Preview selected content</summary><pre>{journeyToMarkdown(canvas, entries)}</pre></details>
    <button className="btn-secondary" onClick={download}><Download size={15} /> Download selected story</button>
  </details>;
}

function MomentThread({ canvas, userId, busy, onSave, onAdd, onBack, onDelete }) {
  const [view, setView] = useState('story');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const j = canvas.journey;
  const due = isRevisitDue(j.revisitOn);
  return <>
    <div className="moment-thread-bar"><button className="canvas-link" disabled={busy} onClick={onBack}><ArrowLeft size={15} /> Capture another glimpse</button><span className="moment-private"><LockKeyhole size={13} /> Only you</span></div>
    <section className="moment-original" aria-label="Original glimpse">
      <span className="canvas-eyebrow">THE ORIGINAL GLIMPSE · {formatDate(j.createdAt)}</span><h2>{canvas.title}</h2><p className="moment-words">{j.moment}</p>
      <details className="moment-settings"><summary>Name this thread or choose a revisit date</summary>
        <form key={j.revisitOn || 'no-date'} onSubmit={async (e) => { e.preventDefault(); const data = new FormData(e.currentTarget); await onSave({ ...canvas, title: String(data.get('title')).trim() || canvas.title, journey: { ...j, revisitOn: data.get('date') || null } }); }}><fieldset disabled={busy}>
          <label htmlFor="moment-title">Thread name</label><input id="moment-title" name="title" maxLength={160} defaultValue={canvas.title} />
          <label htmlFor="moment-date">Revisit date (optional)</label><input id="moment-date" type="date" name="date" defaultValue={j.revisitOn || ''} />
          <p className="moment-hint">Leave the date empty to return in your own time. This appears in your canvas, without sending a notification.</p>
          <button className="btn-secondary" type="submit">Save thread details</button>
        </fieldset></form>
      </details>
    </section>
    <div className={`moment-revisit ${due ? 'due' : ''}`}><Sprout size={20} /><div><strong>{due ? 'A moment to return to' : j.revisitOn ? `Return on ${formatDate(j.revisitOn)}` : 'Return in your own time'}</strong><p>{due ? 'Read your first words. What has happened since? There is no deadline to understand it all.' : 'New understanding can deepen or change your first reflection. There is room for both.'}</p></div></div>
    <EntryComposer key={canvas.id} canvas={canvas} userId={userId} busy={busy} onAdd={onAdd} />
    {j.entries.length > 0 && <section className="moment-history" aria-labelledby="moment-history-heading">
      <div className="moment-history-bar"><h2 id="moment-history-heading">How this moment is growing</h2><div className="moment-view" role="group" aria-label="View your thread"><button aria-pressed={view === 'story'} onClick={() => setView('story')}>Story</button><button aria-pressed={view === 'cards'} onClick={() => setView('cards')}>Cards</button></div></div>
      <p className="moment-hint">Your own reflections, connected to the original glimpse. Earlier entries are preserved as your understanding grows.</p>
      <ol className={`moment-entries ${view}`}>{j.entries.map((entry) => <li key={entry.id} className={`moment-entry ${entry.kind}`}><article>
        <div className="moment-entry-heading"><strong>{JOURNEY_KINDS[entry.kind].label}</strong><time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time></div>
        {entry.reference && <button className="moment-scripture-link" onClick={() => window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref: entry.reference } }))}><BookOpen size={15} /> Read {entry.reference}</button>}
        <p className="moment-words">{entry.text}</p>{entry.kind === 'scripture' && <small>My connection to Scripture</small>}
      </article></li>)}</ol>
    </section>}
    <JourneyExport key={`${canvas.id}:${j.entries.length}`} canvas={canvas} />
    <div className="moment-delete">{confirmDelete ? <><p>Delete this entire thread, including its original glimpse and {j.entries.length} later entries? This cannot be undone.</p><button className="btn-secondary" disabled={busy} onClick={onDelete}>Delete entire thread</button><button className="canvas-link" onClick={() => setConfirmDelete(false)}>Keep it</button></> : <button className="canvas-link" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete thread</button>}</div>
  </>;
}

export default function MomentCanvas({ userId, orgId }) {
  const [saved, setSaved] = useState([]);
  const [canvas, setCanvas] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all');
  const operation = useRef(false);
  const request = useRef(0);
  const heading = useRef(null);
  const libraryHeading = useRef(null);
  const synced = isCanvasSyncAvailable();
  useEffect(() => {
    let cancelled = false;
    const current = ++request.current;
    listCanvases(userId, orgId).then((items) => { if (!cancelled && current === request.current) setSaved(items.filter((item) => item.isMoment)); })
      .catch(() => { if (!cancelled && current === request.current) setError('Could not load your moments. Try refreshing the list. Your draft stays here.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; request.current += 1; };
  }, [userId, orgId]);

  async function refresh() {
    if (operation.current) return;
    request.current += 1;
    operation.current = true; setBusy(true); setError('');
    try { setSaved((await listCanvases(userId, orgId)).filter((item) => item.isMoment)); }
    catch { setError('Could not refresh your moments. Check your connection and try again.'); }
    finally { operation.current = false; setBusy(false); }
  }

  async function persist(next) {
    if (operation.current) return false;
    request.current += 1;
    operation.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const items = await saveCanvas(userId, orgId, next);
      setCanvas({ ...next, savedAt: items.find((item) => item.id === next.id)?.savedAt }); setSaved(items.filter((item) => item.isMoment));
      setNotice(synced ? 'Saved privately to your account.' : 'Saved on this device.');
      if (!canvas) heading.current?.focus();
      return true;
    } catch (err) {
      const reason = /^(This moment changed|This device holds)/.test(err.message || '') ? err.message : 'Check your connection and try again.';
      setError(`Could not save. ${reason} Your words are still here; try saving again.`);
      return false;
    } finally { operation.current = false; setBusy(false); }
  }

  async function open(id) {
    if (operation.current) return;
    const current = ++request.current;
    operation.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const item = await loadCanvas(userId, orgId, id);
      if (!item.journey) throw new Error('This moment could not be opened.');
      if (current === request.current) { setCanvas(item); heading.current?.focus(); }
    } catch { if (current === request.current) setError('Could not open this moment. Check your connection and try again.'); }
    finally { operation.current = false; if (current === request.current) setBusy(false); }
  }

  async function remove() {
    if (operation.current) return;
    request.current += 1;
    operation.current = true; setBusy(true); setError('');
    try {
      const items = await deleteCanvas(userId, orgId, canvas.id);
      try { localStorage.removeItem(`miqra_moment_entry_v1:${userId}:${canvas.id}`); } catch { /* account deletion succeeded */ }
      setSaved(items.filter((item) => item.isMoment)); setCanvas(null); setNotice('Thread deleted.');
    } catch { setError('Could not delete this thread. Please try again.'); }
    finally { operation.current = false; setBusy(false); }
  }

  async function addEntry(entry) {
    // A reflection completes a planned revisit. Other additions do not dismiss it.
    const revisitOn = entry.kind === 'reflection' && isRevisitDue(canvas.journey.revisitOn) ? null : canvas.journey.revisitOn;
    return persist({ ...canvas, journey: { ...canvas.journey, revisitOn, entries: [...canvas.journey.entries, entry] } });
  }

  const dueCount = saved.filter((item) => isRevisitDue(item.revisitOn)).length;
  const visible = saved.filter((item) => filter !== 'due' || isRevisitDue(item.revisitOn));
  return <div className="moment-workspace" data-no-scripture>
    <div className="moment-intro"><h1 tabIndex={-1} ref={heading}>Living Canvas</h1><p>Keep a glimpse. Explore its meaning. Return to see what is growing.</p>
      {saved.length > 0 && <button className="canvas-link moment-library-shortcut" onClick={() => libraryHeading.current?.focus()}>Return to your moments{dueCount ? ` · ${dueCount} to revisit` : ` (${saved.length})`}</button>}
    </div>
    <div className="moment-guide" aria-label="Your canvas journey"><span><b>1</b> Capture a glimpse</span><span><b>2</b> Explore at your pace</span><span><b>3</b> Return & deepen</span></div>
    {error && <div role="alert" className="canvas-error">{error}</div>}
    {notice && <p role="status" className="canvas-notice">{notice}</p>}
    <div className="moment-layout"><section className="moment-main" aria-label="Personal canvas" aria-busy={busy}>
      {canvas ? <MomentThread key={canvas.id} canvas={canvas} userId={userId} busy={busy} onSave={persist} onAdd={addEntry} onBack={() => { setCanvas(null); setNotice(''); setError(''); heading.current?.focus(); }} onDelete={remove} /> : <CaptureMoment userId={userId} busy={busy} onCapture={persist} />}
    </section><aside className="moment-library" aria-label="Your moments">
      <h2 tabIndex={-1} ref={libraryHeading}><Heart size={18} /> Your moments</h2><p className="moment-hint">{synced ? 'Private to your account, across devices.' : 'On this device · up to 10 canvases.'}</p>
      <div className="moment-view" role="group" aria-label="Filter moments"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All moments</button><button aria-pressed={filter === 'due'} onClick={() => setFilter('due')}>To revisit{dueCount ? ` (${dueCount})` : ''}</button></div>
      {loading ? <p role="status">Loading your moments…</p> : visible.length ? <ul>{visible.map((item) => <li key={item.id}><button disabled={busy} className={item.id === canvas?.id ? 'current' : ''} onClick={() => open(item.id)} aria-current={item.id === canvas?.id ? 'true' : undefined}><strong>{item.title}</strong><small>{isRevisitDue(item.revisitOn) ? 'Ready to revisit' : item.revisitOn ? `Return ${formatDate(item.revisitOn)}` : 'Return in your own time'}</small></button></li>)}</ul> : <p>{filter === 'due' ? 'Nothing waiting for a revisit. You can return to any moment whenever you like.' : 'Your first glimpse starts here. Once saved, you can return to it anytime.'}</p>}
      <button className="canvas-link" disabled={busy || loading} onClick={refresh}>Refresh moments</button>
      <div className="moment-library-note"><Sprout size={20} /><p>A question still open. A difficult season. A small step forward. They all belong here.</p></div>
    </aside></div>
  </div>;
}
