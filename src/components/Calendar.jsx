import { useState, useEffect } from 'react';
import './Calendar.css';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import {
  Calendar as CalendarIcon, Clock, MapPin, X, Check,
  Users, ChevronDown, ChevronUp, Trash2, PlusCircle
} from 'lucide-react';

const CAN_CREATE_ROLES = ['admin', 'student_leader', 'parent_leader'];

const CATEGORIES = [
  { value: 'service',  label: 'Sunday Service',  color: '#1e40af', bg: '#dbeafe' },
  { value: 'study',    label: 'Bible Study',      color: '#065f46', bg: '#d1fae5' },
  { value: 'event',    label: 'Special Event',    color: '#7c3aed', bg: '#ede9fe' },
  { value: 'outreach', label: 'Outreach',         color: '#92400e', bg: '#fef3c7' },
];

function getCat(val) {
  return CATEGORIES.find(c => c.value === val) || CATEGORIES[0];
}

function formatDateBlock(dateStr, dateEndStr) {
  if (!dateStr) return { month: '', day: '' };
  const start = new Date(dateStr + 'T00:00:00');
  const month = start.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  if (dateEndStr && dateEndStr !== dateStr) {
    const end = new Date(dateEndStr + 'T00:00:00');
    const endMonth = end.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const day = endMonth !== month
      ? `${start.getDate()} – ${end.getDate()}`
      : `${start.getDate()} – ${end.getDate()}`;
    return { month: endMonth !== month ? `${month} – ${endMonth}` : month, day };
  }
  return { month, day: start.getDate().toString() };
}

function isPast(ev) {
  const end = ev.date_end || ev.date;
  if (!end) return false;
  return new Date(end + 'T23:59:59') < new Date();
}

export default function Calendar({ session, userRole }) {
  const [events, setEvents] = useState([]);
  const [rsvps, setRsvps] = useState({});
  const [rsvpCounts, setRsvpCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [filterCat, setFilterCat] = useState('all');

  const userId = session?.user?.id;
  const userEmail = session?.user?.email;
  const canCreate = CAN_CREATE_ROLES.includes(userRole);
  const canDelete = userRole === 'admin';
  const isConfigured = hasSupabaseConfig && !!userId;

  // New event form state
  const [form, setForm] = useState({
    title: '', date: '', date_end: '', time_start: '', time_end: '',
    location: '', address: '', category: 'service', description: ''
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (isConfigured && events.length > 0) {
      loadMyRsvps();
      loadRsvpCounts();
    }
  }, [isConfigured, events.length]);

  async function loadEvents() {
    setLoading(true);
    if (!hasSupabaseConfig) {
      setEvents([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .order('date', { ascending: true });
    if (!error) setEvents(data || []);
    setLoading(false);
  }

  async function loadMyRsvps() {
    if (!userId) return;
    const { data } = await supabase
      .from('calendar_rsvps')
      .select('event_id, status')
      .eq('user_id', userId);
    if (data) {
      const map = {};
      data.forEach(r => { map[r.event_id] = r.status; });
      setRsvps(map);
    }
  }

  async function loadRsvpCounts() {
    const { data } = await supabase
      .from('calendar_rsvps')
      .select('event_id, status');
    if (data) {
      const counts = {};
      data.forEach(r => {
        if (!counts[r.event_id]) counts[r.event_id] = { going: 0, not_going: 0 };
        counts[r.event_id][r.status] = (counts[r.event_id][r.status] || 0) + 1;
      });
      setRsvpCounts(counts);
    }
  }

  async function handleRsvp(eventId, status) {
    if (!isConfigured) return;
    const current = rsvps[eventId];
    const newStatus = current === status ? null : status;

    // Optimistic update
    setRsvps(prev => ({ ...prev, [eventId]: newStatus }));
    setRsvpCounts(prev => {
      const old = prev[eventId] || { going: 0, not_going: 0 };
      const updated = { ...old };
      if (current) updated[current] = Math.max(0, updated[current] - 1);
      if (newStatus) updated[newStatus] = (updated[newStatus] || 0) + 1;
      return { ...prev, [eventId]: updated };
    });

    if (newStatus === null) {
      await supabase.from('calendar_rsvps').delete()
        .eq('event_id', eventId).eq('user_id', userId);
    } else {
      await supabase.from('calendar_rsvps').upsert({
        event_id: eventId, user_id: userId,
        user_email: userEmail, status: newStatus,
      }, { onConflict: 'event_id,user_id' });
    }
  }

  async function handleCreateEvent(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.date) {
      setFormError('Title and date are required.');
      return;
    }
    if (form.date_end && form.date_end < form.date) {
      setFormError('End date cannot be before the start date.');
      return;
    }
    setSaving(true);
    setFormError('');
    const { error } = await supabase.from('calendar_events').insert({
      title: form.title.trim(),
      date: form.date,
      date_end: form.date_end || null,
      time_start: form.time_start || null,
      time_end: form.time_end || null,
      location: form.location.trim() || null,
      address: form.address.trim() || null,
      category: form.category,
      description: form.description.trim() || null,
      created_by: userId,
    });
    if (error) {
      setFormError('Could not save. Make sure the calendar_events table exists in Supabase.');
    } else {
      setForm({ title: '', date: '', date_end: '', time_start: '', time_end: '', location: '', address: '', category: 'service', description: '' });
      setShowForm(false);
      await loadEvents();
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this event and all its RSVPs?')) return;
    await supabase.from('calendar_rsvps').delete().eq('event_id', id);
    await supabase.from('calendar_events').delete().eq('id', id);
    setEvents(prev => prev.filter(ev => ev.id !== id));
  }

  const filtered = filterCat === 'all'
    ? events
    : events.filter(ev => ev.category === filterCat);

  const upcoming = filtered.filter(ev => !isPast(ev));
  const past = filtered.filter(ev => isPast(ev));

  return (
    <div style={{ padding: '2rem', maxWidth: '860px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '12px',
          background: 'linear-gradient(135deg, var(--navy-primary), var(--navy-dark))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <CalendarIcon size={24} color="white" />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', fontSize: '1.6rem' }}>
            Youth Events Calendar
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            RSVP to upcoming events and activities
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <PlusCircle size={17} />
            {showForm ? 'Cancel' : 'Add Event'}
          </button>
        )}
      </div>

      {/* Create Event Form */}
      {showForm && canCreate && (
        <div className="card" style={{ marginBottom: '1.75rem', borderLeft: '4px solid var(--navy-primary)' }}>
          <h3 style={{ margin: '0 0 1.25rem', color: 'var(--text-primary)' }}>New Event</h3>
          <form onSubmit={handleCreateEvent} style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Event Title *
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Sunday Morning Youth Service" required />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Category
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Start Date *
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                End Date <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional — for multi-day)</span>
                <input type="date" value={form.date_end} min={form.date || undefined}
                  onChange={e => setForm(p => ({ ...p, date_end: e.target.value }))} />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Start Time
                <input type="time" value={form.time_start} onChange={e => setForm(p => ({ ...p, time_start: e.target.value }))} />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                End Time
                <input type="time" value={form.time_end} onChange={e => setForm(p => ({ ...p, time_end: e.target.value }))} />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Location / Venue
                <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                  placeholder="e.g. Youth Center" />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Address
                <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  placeholder="e.g. 13 San Miguel Rd, Charleston SC" />
              </label>
            </div>
            <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Description
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Tell attendees what to expect…" rows={3}
                style={{ resize: 'vertical', fontFamily: 'inherit' }} />
            </label>
            {formError && <p style={{ color: '#dc2626', fontSize: '0.88rem', margin: 0 }}>{formError}</p>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Create Event'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* SQL Setup error hint */}
      {!hasSupabaseConfig && (
        <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.5rem', color: '#78350f', fontSize: '0.9rem' }}>
          ⚠️ Supabase is not configured. Events will not load until you add your environment variables.
        </div>
      )}

      {/* Category Filter */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <button onClick={() => setFilterCat('all')}
          style={{ padding: '0.35rem 0.9rem', borderRadius: '20px', border: `1.5px solid ${filterCat === 'all' ? 'var(--accent-gold)' : 'var(--border-color)'}`, background: filterCat === 'all' ? 'var(--accent-gold)' : 'var(--bg-secondary)', color: filterCat === 'all' ? '#ffffff' : 'var(--text-secondary)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
          All Events
        </button>
        {CATEGORIES.map(c => (
          <button key={c.value} onClick={() => setFilterCat(c.value)}
            style={{ padding: '0.35rem 0.9rem', borderRadius: '20px', border: `1.5px solid ${filterCat === c.value ? c.color : 'var(--border-color)'}`, background: filterCat === c.value ? c.bg : 'var(--bg-secondary)', color: filterCat === c.value ? c.color : 'var(--text-secondary)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Event List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Loading events…</div>
      ) : (
        <>
          {upcoming.length === 0 && past.length === 0 && (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
              <CalendarIcon size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
              <p style={{ fontWeight: 600 }}>{canCreate ? 'No events yet — add the first one!' : 'No upcoming events. Check back soon!'}</p>
            </div>
          )}

          {upcoming.length > 0 && (
            <section style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                Upcoming
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {upcoming.map(ev => <EventCard key={ev.id} ev={ev} rsvps={rsvps} rsvpCounts={rsvpCounts}
                  expandedId={expandedId} setExpandedId={setExpandedId}
                  onRsvp={handleRsvp} onDelete={canDelete ? handleDelete : null} userId={userId} isConfigured={isConfigured} />)}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                Past Events
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {past.map(ev => <EventCard key={ev.id} ev={ev} rsvps={rsvps} rsvpCounts={rsvpCounts}
                  expandedId={expandedId} setExpandedId={setExpandedId}
                  onRsvp={null} onDelete={canDelete ? handleDelete : null} userId={userId} isConfigured={isConfigured} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function EventCard({ ev, rsvps, rsvpCounts, expandedId, setExpandedId, onRsvp, onDelete, isConfigured }) {
  const cat = getCat(ev.category);
  const { month, day } = formatDateBlock(ev.date, ev.date_end);
  const isMultiDay = ev.date_end && ev.date_end !== ev.date;
  const myRsvp = rsvps[ev.id];
  const counts = rsvpCounts[ev.id] || { going: 0, not_going: 0 };
  const expanded = expandedId === ev.id;

  const timeStr = ev.time_start
    ? [
        ev.time_start.slice(0, 5),
        ev.time_end ? `– ${ev.time_end.slice(0, 5)}` : ''
      ].filter(Boolean).join(' ')
    : null;

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      overflow: 'hidden',
      opacity: onRsvp === null ? 0.7 : 1,
      transition: 'box-shadow 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Card Row */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        {/* Date Block */}
        <div style={{
          width: '68px', flexShrink: 0,
          background: 'linear-gradient(135deg, var(--navy-primary), var(--navy-dark))',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '1rem 0.5rem', color: 'white',
        }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.85, textAlign: 'center' }}>{month}</span>
          <span style={{ fontSize: isMultiDay ? '1rem' : '2rem', fontWeight: 900, lineHeight: 1.2, textAlign: 'center' }}>{day}</span>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '0.9rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                <span style={{ background: cat.bg, color: cat.color, borderRadius: '20px', padding: '0.15rem 0.6rem', fontSize: '0.72rem', fontWeight: 700 }}>
                  {cat.label}
                </span>
              </div>
              <h3 style={{ margin: '0 0 0.35rem', color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 700 }}>{ev.title}</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
                {timeStr && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                    <Clock size={13} /> {timeStr}
                  </span>
                )}
                {ev.location && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                    <MapPin size={13} /> {ev.location}
                  </span>
                )}
              </div>
            </div>

            {/* RSVP + actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              {/* Attendee count */}
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                <Users size={13} /> {counts.going} going
              </span>

              {onRsvp && isConfigured && (
                <>
                  <button
                    onClick={() => onRsvp(ev.id, 'going')}
                    style={{
                      padding: '0.3rem 0.7rem', borderRadius: '8px', border: '1.5px solid',
                      borderColor: myRsvp === 'going' ? '#15803d' : 'var(--border-color)',
                      background: myRsvp === 'going' ? '#dcfce7' : 'transparent',
                      color: myRsvp === 'going' ? '#15803d' : 'var(--text-secondary)',
                      fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem'
                    }}>
                    <Check size={13} /> Going
                  </button>
                  <button
                    onClick={() => onRsvp(ev.id, 'not_going')}
                    style={{
                      padding: '0.3rem 0.7rem', borderRadius: '8px', border: '1.5px solid',
                      borderColor: myRsvp === 'not_going' ? '#dc2626' : 'var(--border-color)',
                      background: myRsvp === 'not_going' ? '#fee2e2' : 'transparent',
                      color: myRsvp === 'not_going' ? '#dc2626' : 'var(--text-secondary)',
                      fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem'
                    }}>
                    <X size={13} /> Can't Go
                  </button>
                </>
              )}

              {onDelete && (
                <button onClick={() => onDelete(ev.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem' }}
                  title="Delete event">
                  <Trash2 size={15} />
                </button>
              )}

              {/* Expand toggle */}
              {ev.description && (
                <button onClick={() => setExpandedId(expanded ? null : ev.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem' }}>
                  {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div style={{ padding: '1rem 1rem 1rem 88px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
          {ev.address && (
            <p style={{ margin: '0 0 0.6rem', color: 'var(--text-secondary)', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <MapPin size={14} /> {ev.address}
            </p>
          )}
          {ev.description && (
            <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.6 }}>{ev.description}</p>
          )}
          {/* RSVP count breakdown */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.85rem', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
            <span>✅ {counts.going} Going</span>
            <span>❌ {counts.not_going} Not Going</span>
          </div>
        </div>
      )}
    </div>
  );
}
