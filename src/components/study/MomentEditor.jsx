import { useId, useState } from 'react';
import { JOURNEY_KINDS, JOURNEY_TEXT_MAX } from '../../lib/canvasJourney';
import { refToPassageIds } from '../../lib/scripture';
import useMomentDraft from './useMomentDraft';

export default function MomentEditor({ canvas, entry, userId, busy, onSave, onCancel }) {
  const prefix = useId();
  const [draft, setDraft, clearDraft, available] = useMomentDraft(`miqra_moment_edit_v1:${userId}:${canvas.id}:${entry?.id || 'original'}`, {
    text: entry ? entry.text : canvas.journey.moment,
    reference: entry?.reference || '', context: entry?.scripture?.context || '', connection: entry?.scripture?.connection || '',
  });
  const [error, setError] = useState('');
  const label = entry ? `Edit ${JOURNEY_KINDS[entry.kind].label.toLowerCase()}` : 'Edit original glimpse';
  const update = (field) => (event) => setDraft({ ...draft, [field]: event.target.value });
  async function submit(event) {
    event.preventDefault();
    if (!entry?.scripture && !draft.text.trim()) { setError('Add a few words before saving.'); return; }
    if (entry?.scripture && (!draft.context.trim() || !draft.connection.trim())) { setError('Keep the passage context and connection before saving.'); return; }
    if (entry?.kind === 'scripture' && !entry.scripture && !refToPassageIds(draft.reference.trim()).length) {
      setError('Use a Bible reference such as Ephesians 2:8–10.'); return;
    }
    setError('');
    const editedAt = new Date().toISOString();
    const journey = entry ? { ...canvas.journey, entries: canvas.journey.entries.map((item) => item.id === entry.id ? {
      ...item, text: draft.text.trim(), editedAt,
      ...(item.kind === 'scripture' && !item.scripture ? { reference: draft.reference.trim() } : {}),
      ...(item.scripture ? { scripture: { ...item.scripture, context: draft.context.trim(), connection: draft.connection.trim() } } : {}),
    } : item) } : { ...canvas.journey, moment: draft.text.trim(), editedAt };
    if (await onSave({ ...canvas, journey })) clearDraft();
  }
  return <form className="moment-editor" aria-label={label} onSubmit={submit}>
    <fieldset disabled={busy}>
      {entry?.kind === 'scripture' && !entry.scripture && <>
        <label htmlFor={`${prefix}-reference`}>Passage reference</label>
        <input id={`${prefix}-reference`} required maxLength={100} value={draft.reference} onChange={update('reference')} />
      </>}
      {entry?.scripture && <>
        <p className="moment-hint">The Bible text for {entry.reference} stays attached. You can refine the context, connection, and your own reflection.</p>
        <label htmlFor={`${prefix}-context`}>Passage context</label>
        <textarea id={`${prefix}-context`} required maxLength={JOURNEY_TEXT_MAX} value={draft.context} onChange={update('context')} />
        <label htmlFor={`${prefix}-connection`}>Connection to my glimpse</label>
        <textarea id={`${prefix}-connection`} required maxLength={JOURNEY_TEXT_MAX} value={draft.connection} onChange={update('connection')} />
      </>}
      <label htmlFor={`${prefix}-text`}>{entry?.scripture ? 'My reflection (optional)' : entry ? 'Entry text' : 'Original glimpse'}</label>
      <textarea id={`${prefix}-text`} rows={5} required={!entry?.scripture} maxLength={JOURNEY_TEXT_MAX} value={draft.text} onChange={update('text')} />
      {error && <p role="alert" className="moment-warning">{error}</p>}
      <div className="moment-entry-actions">
        <button className="btn-primary" type="submit">{busy ? 'Saving changes…' : 'Save changes'}</button>
        <button className="canvas-link" type="button" onClick={() => { clearDraft(); onCancel(); }}>Cancel edit</button>
      </div>
    </fieldset>
    {!available && <p role="status" className="moment-warning">Your edit is only in this open page. Save it before leaving.</p>}
  </form>;
}
