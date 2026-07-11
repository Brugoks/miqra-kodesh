import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Plus, Trash2, Save } from 'lucide-react';
import RichTextEditor from '../RichTextEditor';
import { TALK_CATEGORIES, normalizeTakeaways } from './talkUtils';

const labelStyle = { display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' };

export default function TalkEditor({ session, activeOrgId, talk = null, onSaved, onCancel }) {
  const userId = session?.user?.id;
  const userName = session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name
    || session?.user?.email?.split('@')[0]
    || 'Unknown';

  const [form, setForm] = useState(() => ({
    title: talk?.title || '',
    category: talk?.category || 'sermon',
    speaker_name: talk?.speaker_name || '',
    scripture_ref: talk?.scripture_ref || '',
    talk_date: talk?.talk_date || '',
    video_url: talk?.video_url || '',
    summary: talk?.summary || '',
    transcript: talk?.transcript || '',
    event_id: talk?.event_id || '',
    is_published: talk?.is_published ?? false,
  }));
  const [takeaways, setTakeaways] = useState(() => {
    const list = normalizeTakeaways(talk?.key_takeaways);
    return list.length > 0 ? list : [''];
  });
  const [events, setEvents] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeOrgId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('calendar_events')
        .select('id, title, date')
        .eq('organization_id', activeOrgId)
        .order('date', { ascending: false })
        .limit(150);
      if (!cancelled) setEvents(data || []);
    })();
    return () => { cancelled = true; };
  }, [activeOrgId]);

  const set = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }));

  function setTakeaway(index, value) {
    setTakeaways(prev => prev.map((t, i) => (i === index ? value : t)));
  }

  function addTakeaway() {
    setTakeaways(prev => [...prev, '']);
  }

  function removeTakeaway(index) {
    setTakeaways(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : ['']));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError('');
    const payload = {
      title: form.title.trim(),
      category: form.category,
      speaker_name: form.speaker_name.trim() || null,
      scripture_ref: form.scripture_ref.trim() || null,
      talk_date: form.talk_date || null,
      video_url: form.video_url.trim() || null,
      summary: form.summary.trim() || null,
      transcript: form.transcript.trim() || null,
      key_takeaways: takeaways.map(t => t.trim()).filter(Boolean),
      event_id: form.event_id || null,
      is_published: form.is_published,
      updated_at: new Date().toISOString(),
    };

    let data, saveError;
    if (talk) {
      ({ data, error: saveError } = await supabase
        .from('sermon_talks')
        .update(payload)
        .eq('id', talk.id)
        .select()
        .single());
    } else {
      ({ data, error: saveError } = await supabase
        .from('sermon_talks')
        .insert({ ...payload, organization_id: activeOrgId, created_by: userId, created_by_name: userName })
        .select()
        .single());
    }

    if (saveError) {
      setError(`Save failed: ${saveError.message}`);
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved?.(data);
  }

  return (
    <div className="card" style={{ marginBottom: '1.75rem', borderLeft: '4px solid var(--navy-primary)' }}>
      <h3 style={{ margin: '0 0 1.25rem', color: 'var(--text-primary)' }}>
        {talk ? 'Edit Sermon / Message' : 'New Sermon / Message'}
      </h3>
      <form onSubmit={handleSave} style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
          <label style={labelStyle}>
            Title *
            <input value={form.title} onChange={set('title')} placeholder="e.g. Walking by Faith" required />
          </label>
          <label style={labelStyle}>
            Type
            <select value={form.category} onChange={set('category')}>
              {TALK_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <label style={labelStyle}>
            Speaker
            <input value={form.speaker_name} onChange={set('speaker_name')} placeholder="e.g. Pastor John" />
          </label>
          <label style={labelStyle}>
            Date
            <input type="date" value={form.talk_date} onChange={set('talk_date')} />
          </label>
          <label style={labelStyle}>
            Scripture Reference
            <input value={form.scripture_ref} onChange={set('scripture_ref')} placeholder="e.g. Hebrews 11:1-6" />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <label style={labelStyle}>
            Linked Calendar Event <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
            <select value={form.event_id} onChange={set('event_id')}>
              <option value="">— No linked event —</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.date} · {ev.title}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Video / Audio URL <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
            <input type="url" value={form.video_url} onChange={set('video_url')} placeholder="https://youtube.com/…" />
          </label>
        </div>

        <div style={labelStyle}>
          Key Takeaways
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {takeaways.map((takeaway, index) => (
              // Index keys are fine here: rows are only appended/removed via the buttons below.
              <div className="takeaway-editor-row" key={index}>
                <input
                  value={takeaway}
                  onChange={e => setTakeaway(index, e.target.value)}
                  placeholder={`Takeaway ${index + 1} — e.g. Faith grows through obedience`}
                />
                <button type="button" onClick={() => removeTakeaway(index)} title="Remove takeaway"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.3rem' }}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button type="button" className="btn-secondary" onClick={addTakeaway}
              style={{ justifySelf: 'start', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.83rem', padding: '0.35rem 0.85rem' }}>
              <Plus size={14} /> Add Takeaway
            </button>
          </div>
        </div>

        <label style={labelStyle}>
          Summary Notes
          <RichTextEditor
            key={talk?.id || 'new'}
            value={form.summary}
            onChange={val => setForm(p => ({ ...p, summary: val }))}
            placeholder="Summarize the main points, structure, and application of the talk…"
          />
        </label>

        <label style={labelStyle}>
          Raw Transcript
          <textarea
            value={form.transcript}
            onChange={set('transcript')}
            placeholder="Paste the full raw transcript here…"
            rows={12}
            style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.6 }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={form.is_published}
            onChange={e => setForm(p => ({ ...p, is_published: e.target.checked }))}
            style={{ width: '16px', height: '16px' }} />
          Publish — visible to everyone in your organization
        </label>

        {error && <p style={{ color: '#dc2626', fontSize: '0.88rem', margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="submit" className="btn-primary" disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Save size={15} /> {saving ? 'Saving…' : talk ? 'Save Changes' : 'Create'}
          </button>
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
