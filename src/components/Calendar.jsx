import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './Calendar.css';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import {
  Calendar as CalendarIcon, Clock, MapPin, X, Check,
  Users, ChevronDown, ChevronUp, Trash2, PlusCircle, ChevronLeft, ChevronRight, Pencil,
  CalendarPlus, Download, Mic2
} from 'lucide-react';
import { isAdminRole, isLeaderRole } from '../lib/roles';
import { nextMeetingDate, toDateKey } from '../lib/meetings';
import { downloadICS, googleCalendarUrl } from '../lib/calendarExport';
import { getEventForecast } from '../lib/eventWeather';
import { fetchPublicHolidays } from '../lib/holidays';
import { compressImage } from '../lib/imageCompression';
import QRShareButton from './QRShareButton';

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

function formatTimeAMPM(time) {
  if (!time) return '';
  const value = String(time).trim();
  if (/[ap]m/i.test(value)) return value;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

function dateFromKey(dateKey) {
  if (!dateKey) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function endOfWeek(date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function addFrequency(date, frequency) {
  const d = new Date(date);
  const freq = (frequency || 'Weekly').trim().toLowerCase();
  if (freq === 'every other week') {
    d.setDate(d.getDate() + 14);
  } else if (freq === 'once a month') {
    d.setMonth(d.getMonth() + 1);
  } else {
    d.setDate(d.getDate() + 7);
  }
  return d;
}

function groupMeetingOccurrences(group, rangeStart, rangeEnd) {
  const occurrences = [];
  let current = nextMeetingDate(group, rangeStart);
  let guard = 0;
  while (current && current <= rangeEnd && guard < 20) {
    occurrences.push(current);
    current = addFrequency(current, group.frequency);
    guard += 1;
  }
  return occurrences;
}

export default function Calendar({ session, userRole, activeOrgId }) {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [linkedTalks, setLinkedTalks] = useState({});
  const [studyGroups, setStudyGroups] = useState([]);
  const [studyMeetings, setStudyMeetings] = useState({});
  const [rsvps, setRsvps] = useState({});
  const [rsvpCounts, setRsvpCounts] = useState({});
  const [rsvpGoers, setRsvpGoers] = useState({});
  const [rsvpNotGoers, setRsvpNotGoers] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [calendarMode, setCalendarMode] = useState('month');
  const [calendarAnchor, setCalendarAnchor] = useState(() => new Date());
  const [selectedDayKey, setSelectedDayKey] = useState(() => toDateKey(new Date()));
  const [isCompact, setIsCompact] = useState(() =>
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 768px)').matches
  );
  const touchStart = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e) => setIsCompact(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const userId = session?.user?.id;
  const userEmail = session?.user?.email;
  const userName = session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name
    || session?.user?.email?.split('@')[0]
    || 'Unknown';
  const canCreate = isLeaderRole(userRole);
  const canEdit = isLeaderRole(userRole);
  const canDelete = isAdminRole(userRole);
  const isConfigured = hasSupabaseConfig && !!userId;

  // New event form state
  const [form, setForm] = useState({
    title: '', date: '', date_end: '', time_start: '', time_end: '',
    location: '', address: '', category: 'service', description: '', flyer_url: ''
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [flyerUploading, setFlyerUploading] = useState(false);

  useEffect(() => {
    loadEvents();
    loadStudySchedule();
  }, [activeOrgId]);

  useEffect(() => {
    if (isConfigured && events.length > 0) {
      loadMyRsvps();
      loadRsvpCounts();
    }
  }, [isConfigured, events.length, activeOrgId]);

  // Published sermons/messages linked to visible events (Sermons & Messages module).
  useEffect(() => {
    if (!hasSupabaseConfig || events.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLinkedTalks({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('sermon_talks')
        .select('id, title, category, event_id')
        .in('event_id', events.map(ev => ev.id))
        .eq('is_published', true);
      if (cancelled) return;
      const map = {};
      (data || []).forEach(talk => { map[talk.event_id] = talk; });
      setLinkedTalks(map);
    })();
    return () => { cancelled = true; };
  }, [events]);

  async function loadEvents() {
    setLoading(true);
    if (!hasSupabaseConfig) {
      setEvents([]);
      setLoading(false);
      return;
    }
    let query = supabase
      .from('calendar_events')
      .select('*')
      .order('date', { ascending: true });

    if (activeOrgId) {
      query = query.eq('organization_id', activeOrgId);
    }

    const { data, error } = await query;
    if (!error) setEvents(data || []);
    setLoading(false);
  }

  async function loadStudySchedule() {
    if (!hasSupabaseConfig) {
      setStudyGroups([]);
      setStudyMeetings({});
      return;
    }

    let groupsQuery = supabase
      .from('attendance_groups')
      .select('*')
      .order('created_at', { ascending: true });

    if (activeOrgId) {
      groupsQuery = groupsQuery.eq('organization_id', activeOrgId);
    }

    const { data: groups } = await groupsQuery;
    const groupIds = (groups || []).map(g => g.id);

    if (groupIds.length === 0) {
      setStudyGroups([]);
      setStudyMeetings({});
      return;
    }

    const { data: meetings } = await supabase
      .from('group_meetings')
      .select('*')
      .in('group_id', groupIds)
      .order('meeting_date', { ascending: true });

    setStudyGroups(groups || []);
    const meetingMap = {};
    (meetings || []).forEach((meeting) => {
      meetingMap[`${meeting.group_id}:${meeting.meeting_date}`] = meeting;
    });
    setStudyMeetings(meetingMap);
  }

  async function loadMyRsvps() {
    if (!userId) return;
    let query = supabase
      .from('calendar_rsvps')
      .select('event_id, status')
      .eq('user_id', userId);

    if (activeOrgId) {
      query = query.eq('organization_id', activeOrgId);
    }

    const { data } = await query;
    if (data) {
      const map = {};
      data.forEach(r => { map[r.event_id] = r.status; });
      setRsvps(map);
    }
  }

  async function loadRsvpCounts() {
    let query = supabase
      .from('calendar_rsvps')
      .select('event_id, status, user_id, user_email, user_name');

    if (activeOrgId) {
      query = query.eq('organization_id', activeOrgId);
    }

    const { data } = await query;
    if (data) {
      const counts = {};
      const goers = {};
      const notGoers = {};
      data.forEach(r => {
        if (!counts[r.event_id]) counts[r.event_id] = { going: 0, not_going: 0 };
        counts[r.event_id][r.status] = (counts[r.event_id][r.status] || 0) + 1;
        const person = { name: r.user_name || r.user_email, email: r.user_email, userId: r.user_id };
        if (r.status === 'going') {
          if (!goers[r.event_id]) goers[r.event_id] = [];
          goers[r.event_id].push(person);
        } else if (r.status === 'not_going') {
          if (!notGoers[r.event_id]) notGoers[r.event_id] = [];
          notGoers[r.event_id].push(person);
        }
      });
      setRsvpCounts(counts);
      setRsvpGoers(goers);
      setRsvpNotGoers(notGoers);
    }
  }

  async function handleRsvp(eventId, status) {
    if (!isConfigured) return;
    const current = rsvps[eventId];
    const newStatus = current === status ? null : status;
    const me = { name: userName, email: userEmail, userId };

    // Optimistic update — counts
    setRsvps(prev => ({ ...prev, [eventId]: newStatus }));
    setRsvpCounts(prev => {
      const old = prev[eventId] || { going: 0, not_going: 0 };
      const updated = { ...old };
      if (current) updated[current] = Math.max(0, updated[current] - 1);
      if (newStatus) updated[newStatus] = (updated[newStatus] || 0) + 1;
      return { ...prev, [eventId]: updated };
    });

    // Optimistic update — name lists
    const removeMe = list => (list || []).filter(p => p.userId !== userId);
    setRsvpGoers(prev => ({
      ...prev,
      [eventId]: newStatus === 'going' ? [...removeMe(prev[eventId]), me] : removeMe(prev[eventId]),
    }));
    setRsvpNotGoers(prev => ({
      ...prev,
      [eventId]: newStatus === 'not_going' ? [...removeMe(prev[eventId]), me] : removeMe(prev[eventId]),
    }));

    if (newStatus === null) {
      await supabase.from('calendar_rsvps').delete()
        .eq('event_id', eventId).eq('user_id', userId);
    } else {
      await supabase.from('calendar_rsvps').upsert({
        event_id: eventId, user_id: userId,
        user_email: userEmail, user_name: userName, status: newStatus,
      }, { onConflict: 'event_id,user_id' });
    }

    // Sync from server to catch any drift
    await loadRsvpCounts();
  }

  // Compress + upload a flyer to the per-user folder in the public
  // event-flyers bucket; returns the public URL. Callers surface errors on
  // their own form.
  async function uploadFlyer(file) {
    const compressed = await compressImage(file);
    const ext = (compressed.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from('event-flyers')
      .upload(path, compressed, { contentType: compressed.type });
    if (error) throw error;
    return supabase.storage.from('event-flyers').getPublicUrl(path).data.publicUrl;
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
      flyer_url: form.flyer_url || null,
      created_by: userId,
      created_by_email: userEmail,
      created_by_name: userName,
    });
    if (error) {
      setFormError(`Could not save: ${error.message}`);
    } else {
      setForm({ title: '', date: '', date_end: '', time_start: '', time_end: '', location: '', address: '', category: 'service', description: '', flyer_url: '' });
      setShowForm(false);
      await loadEvents();
    }
    setSaving(false);
  }

  function handleDeleteRequest(event) {
    setDeleteTarget(event);
  }

  function openEditEvent(ev) {
    setEditTarget(ev);
    setEditForm({
      title: ev.title || '',
      date: ev.date || '',
      date_end: ev.date_end || '',
      time_start: ev.time_start ? ev.time_start.slice(0, 5) : '',
      time_end: ev.time_end ? ev.time_end.slice(0, 5) : '',
      location: ev.location || '',
      address: ev.address || '',
      category: ev.category || 'service',
      description: ev.description || '',
      flyer_url: ev.flyer_url || '',
    });
    setEditError('');
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editTarget) return;
    if (!editForm.title.trim() || !editForm.date) {
      setEditError('Title and date are required.');
      return;
    }
    if (editForm.date_end && editForm.date_end < editForm.date) {
      setEditError('End date cannot be before the start date.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    const { error } = await supabase.from('calendar_events').update({
      title: editForm.title.trim(),
      date: editForm.date,
      date_end: editForm.date_end || null,
      time_start: editForm.time_start || null,
      time_end: editForm.time_end || null,
      location: editForm.location.trim() || null,
      address: editForm.address.trim() || null,
      category: editForm.category,
      description: editForm.description.trim() || null,
      flyer_url: editForm.flyer_url || null,
    }).eq('id', editTarget.id);
    if (error) {
      setEditError(`Could not save: ${error.message}`);
    } else {
      setEvents(prev => prev.map(ev => ev.id === editTarget.id
        ? { ...ev, ...editForm, date_end: editForm.date_end || null, time_start: editForm.time_start || null, time_end: editForm.time_end || null, location: editForm.location.trim() || null, address: editForm.address.trim() || null, description: editForm.description.trim() || null, flyer_url: editForm.flyer_url || null }
        : ev
      ));
      setEditTarget(null);
    }
    setEditSaving(false);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    await supabase.from('calendar_rsvps').delete().eq('event_id', deleteTarget.id);
    await supabase.from('calendar_events').delete().eq('id', deleteTarget.id);
    setEvents(prev => prev.filter(ev => ev.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleting(false);
  }

  const filtered = filterCat === 'all'
    ? events
    : events.filter(ev => ev.category === filterCat);

  const upcoming = filtered.filter(ev => !isPast(ev));
  const past = filtered.filter(ev => isPast(ev));
  const visibleRange = useMemo(() => {
    if (calendarMode === 'week') {
      return {
        start: startOfWeek(calendarAnchor),
        end: endOfWeek(calendarAnchor),
      };
    }
    return {
      start: startOfWeek(startOfMonth(calendarAnchor)),
      end: endOfWeek(endOfMonth(calendarAnchor)),
    };
  }, [calendarAnchor, calendarMode]);

  const calendarItems = useMemo(() => {
    const items = [];

    events
      .filter((event) => filterCat === 'all' || event.category === filterCat)
      .forEach((event) => {
      const start = dateFromKey(event.date);
      const end = dateFromKey(event.date_end || event.date);
      if (!start || !end) return;
      const cursor = startOfDay(start);
      while (cursor <= end) {
        if (cursor >= visibleRange.start && cursor <= visibleRange.end) {
          items.push({
            id: `event:${event.id}:${toDateKey(cursor)}`,
            kind: 'event',
            dateKey: toDateKey(cursor),
            title: event.title,
            time: event.time_start,
            category: event.category,
            color: getCat(event.category).color,
            bg: getCat(event.category).bg,
            event,
            talk: linkedTalks[event.id] || null,
          });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    const addedStudyKeys = new Set();

    if (filterCat === 'all' || filterCat === 'study') {
      // 1. Add all actual saved meetings from the database that fall within the visible range
      Object.entries(studyMeetings).forEach(([key, meeting]) => {
        const [groupId, dateKey] = key.split(':');
        const group = studyGroups.find((g) => g.id === groupId);
        if (!group) return;

        const date = dateFromKey(dateKey);
        if (!date || date < visibleRange.start || date > visibleRange.end) return;

        const itemId = `study:${groupId}:${dateKey}`;
        items.push({
          id: itemId,
          kind: 'study',
          dateKey,
          title: group.name,
          time: group.meeting_time,
          category: 'study',
          color: '#065f46',
          bg: '#d1fae5',
          group,
          details: meeting,
        });
        addedStudyKeys.add(`${groupId}:${dateKey}`);
      });

      // 2. Add recurring scheduled occurrences (unless already added by the actual meetings step)
      studyGroups.forEach((group) => {
        groupMeetingOccurrences(group, visibleRange.start, visibleRange.end).forEach((date) => {
          const dateKey = toDateKey(date);
          const key = `${group.id}:${dateKey}`;
          if (addedStudyKeys.has(key)) return;

          items.push({
            id: `study:${group.id}:${dateKey}`,
            kind: 'study',
            dateKey,
            title: group.name,
            time: group.meeting_time,
            category: 'study',
            color: '#065f46',
            bg: '#d1fae5',
            group,
            details: null,
          });
        });
      });
    }

    return items.sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey)
      || String(a.time || '').localeCompare(String(b.time || ''))
      || a.title.localeCompare(b.title)
    );
  }, [events, filterCat, studyGroups, studyMeetings, visibleRange, linkedTalks]);

  // US public holidays (Nager.Date, keyless) for the years currently visible.
  const [holidays, setHolidays] = useState({}); // 'YYYY-MM-DD' -> [names]
  useEffect(() => {
    const years = [...new Set([visibleRange.start.getFullYear(), visibleRange.end.getFullYear()])];
    let cancelled = false;
    Promise.all(years.map((year) => fetchPublicHolidays(year)))
      .then((maps) => { if (!cancelled) setHolidays(Object.assign({}, ...maps)); });
    return () => { cancelled = true; };
  }, [visibleRange]);

  const calendarDays = useMemo(() => {
    const days = [];
    const cursor = new Date(visibleRange.start);
    while (cursor <= visibleRange.end) {
      const dateKey = toDateKey(cursor);
      days.push({
        date: new Date(cursor),
        dateKey,
        items: calendarItems.filter((item) => item.dateKey === dateKey),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [calendarItems, visibleRange]);

  const calendarTitle = calendarMode === 'week'
    ? `${visibleRange.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${visibleRange.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : calendarAnchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const moveCalendar = (direction) => {
    setCalendarAnchor((current) => {
      const next = new Date(current);
      if (calendarMode === 'week') {
        next.setDate(next.getDate() + direction * 7);
      } else {
        next.setMonth(next.getMonth() + direction);
      }
      return next;
    });
  };

  // Keep the selected day inside the visible range when the user navigates:
  // prefer today if visible, otherwise fall back to the first day of the period.
  useEffect(() => {
    const selected = dateFromKey(selectedDayKey);
    if (selected && selected >= visibleRange.start && selected <= visibleRange.end) return;
    const today = startOfDay(new Date());
    const fallback = (today >= visibleRange.start && today <= visibleRange.end)
      ? today
      : (calendarMode === 'month' ? startOfMonth(calendarAnchor) : visibleRange.start);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedDayKey(toDateKey(fallback));
  }, [visibleRange, selectedDayKey, calendarMode, calendarAnchor]);

  const handleGridTouchStart = (e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleGridTouchEnd = (e) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    // Ignore taps and mostly-vertical scrolls.
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    moveCalendar(dx < 0 ? 1 : -1);
  };

  const openStudyMeeting = (item) => {
    if (item.kind !== 'study' || !item.group?.id || !item.dateKey) return;
    const isGroupMember = (item.group.students || []).some((student) => student.linkedUserId === userId);
    // Leaders go to the attendance page only for groups they actually lead
    // (name match, same convention as useGroups.canManageJoinRequestsForGroup);
    // any other group routes to Fellowship to join or request to join.
    const normalizeName = (name) => String(name || '').trim().toLowerCase();
    const myName = normalizeName(userName);
    const leadsThisGroup = canCreate && Boolean(myName)
      && [item.group.leader, item.group.co_leader].some((name) => normalizeName(name) === myName);
    if (isGroupMember || leadsThisGroup) {
      navigate(`/studies?group=${encodeURIComponent(item.group.id)}&date=${encodeURIComponent(item.dateKey)}`);
      return;
    }
    navigate(`/fellowship?group=${encodeURIComponent(item.group.id)}`);
  };

  const openCalendarEvent = (item) => {
    if (item.kind !== 'event' || !item.event) return;
    // Events with a linked sermon/message jump straight to that talk.
    if (item.talk) {
      navigate(`/sermons/${item.talk.id}`);
      return;
    }
    // Otherwise expand the event's card in the list below and scroll to it.
    setExpandedId(item.event.id);
    requestAnimationFrame(() => {
      document.getElementById(`calendar-event-${item.event.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  return (
    <div className="calendar-page">
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
            Event Calendar
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
                  placeholder="e.g. Sunday Morning Student Service" required />
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
                  placeholder="e.g. Student Center" />
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
            <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Flyer <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span>
              {form.flyer_url ? (
                <div style={{ position: 'relative', display: 'inline-block', maxWidth: '260px' }}>
                  <img src={form.flyer_url} alt="Event flyer" style={{ width: '100%', borderRadius: '10px', display: 'block' }} />
                  <button type="button" onClick={() => setForm(p => ({ ...p, flyer_url: '' }))}
                    aria-label="Remove flyer"
                    style={{ position: 'absolute', top: '0.4rem', right: '0.4rem', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <input type="file" accept="image/*" disabled={flyerUploading}
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    setFlyerUploading(true);
                    setFormError('');
                    try {
                      const url = await uploadFlyer(file);
                      setForm(p => ({ ...p, flyer_url: url }));
                    } catch (err) {
                      setFormError(`Could not upload flyer: ${err.message}`);
                    } finally {
                      setFlyerUploading(false);
                    }
                  }}
                  style={{ fontWeight: 400 }} />
              )}
              {flyerUploading && <span style={{ fontWeight: 400, fontSize: '0.8rem', opacity: 0.7 }}>Uploading…</span>}
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

      <section className="calendar-board card">
        <div className="calendar-board-header">
          <div>
            <h2>{calendarTitle}</h2>
            <span>Bible Study meetings and church events</span>
          </div>
          <div className="calendar-board-actions">
            <div className="calendar-view-toggle" aria-label="Calendar view">
              {['month', 'week', 'list'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={calendarMode === mode ? 'active' : ''}
                  onClick={() => setCalendarMode(mode)}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
            {calendarMode !== 'list' && (
              <div className="calendar-nav">
                <button type="button" onClick={() => moveCalendar(-1)} aria-label="Previous period">
                  <ChevronLeft size={16} />
                </button>
                <button type="button" onClick={() => { setCalendarAnchor(new Date()); setSelectedDayKey(toDateKey(new Date())); }}>
                  Today
                </button>
                <button type="button" onClick={() => moveCalendar(1)} aria-label="Next period">
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {calendarMode !== 'list' && (
          <div
            className={`calendar-grid-view ${calendarMode === 'week' ? 'week' : 'month'}`}
            onTouchStart={handleGridTouchStart}
            onTouchEnd={handleGridTouchEnd}
          >
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
              <div key={day} className={`calendar-weekday ${index === 0 || index === 6 ? 'weekend' : ''}`}>{day}</div>
            ))}
            {calendarDays.map((day) => {
              const outsideMonth = calendarMode === 'month' && day.date.getMonth() !== calendarAnchor.getMonth();
              const today = sameDay(day.date, new Date());
              const weekend = day.date.getDay() === 0 || day.date.getDay() === 6;
              const cellClass = `calendar-day-cell ${outsideMonth ? 'outside' : ''} ${today ? 'today' : ''} ${weekend ? 'weekend' : ''}`;

              if (isCompact) {
                const selected = day.dateKey === selectedDayKey;
                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    className={`${cellClass} compact ${selected ? 'selected' : ''}`}
                    onClick={() => setSelectedDayKey(day.dateKey)}
                    aria-pressed={selected}
                    aria-label={day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  >
                    <span className="calendar-day-number">{day.date.getDate()}</span>
                    {holidays[day.dateKey] && (
                      <span className="calendar-holiday-flag" title={holidays[day.dateKey].join(' · ')} />
                    )}
                    <span className="calendar-dot-row">
                      {day.items.slice(0, 4).map((item) => (
                        <span key={item.id} className="calendar-dot" style={{ background: item.color }} />
                      ))}
                      {day.items.length > 4 && (
                        <span className="calendar-dot-more">+{day.items.length - 4}</span>
                      )}
                    </span>
                  </button>
                );
              }

              const itemLimit = calendarMode === 'week' ? 8 : 4;
              return (
                <div key={day.dateKey} className={cellClass}>
                  <div className="calendar-day-number">{day.date.getDate()}</div>
                  {holidays[day.dateKey] && (
                    <div className="calendar-holiday" title={holidays[day.dateKey].join(' · ')}>
                      {holidays[day.dateKey][0]}
                    </div>
                  )}
                  <div className="calendar-day-items">
                    {day.items.slice(0, itemLimit).map((item) => (
                      <CalendarItemChip key={item.id} item={item} onOpenStudy={openStudyMeeting} onOpenEvent={openCalendarEvent} />
                    ))}
                    {day.items.length > itemLimit && (
                      <span className="calendar-more">+{day.items.length - itemLimit} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isCompact && calendarMode !== 'list' && (() => {
          const selectedDay = calendarDays.find((day) => day.dateKey === selectedDayKey);
          if (!selectedDay) return null;
          return (
            <div className="calendar-day-panel">
              <h3>{selectedDay.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
              {holidays[selectedDay.dateKey] && (
                <p className="calendar-panel-holiday">{holidays[selectedDay.dateKey].join(' · ')}</p>
              )}
              {selectedDay.items.length === 0 ? (
                <p className="calendar-panel-empty">No events on this day.</p>
              ) : (
                selectedDay.items.map((item) => {
                  const isStudy = item.kind === 'study';
                  const detail = isStudy ? item.details : item.event;
                  const location = isStudy
                    ? (detail?.location || item.group?.meeting_location)
                    : detail?.location;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="calendar-panel-item"
                      style={{ '--chip-color': item.color, '--chip-bg': item.bg }}
                      onClick={() => (isStudy ? openStudyMeeting(item) : openCalendarEvent(item))}
                    >
                      <span className="calendar-panel-time">{formatTimeAMPM(item.time) || (isStudy ? 'Study' : 'Event')}</span>
                      <span className="calendar-panel-body">
                        <span className="calendar-panel-title">
                          {item.talk && <Mic2 size={11} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />}
                          {item.title}
                        </span>
                        {location && <span className="calendar-panel-detail">{location}</span>}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          );
        })()}
      </section>

      {/* Category Filter */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <button onClick={() => setFilterCat('all')}
          style={{ padding: '0.35rem 0.9rem', borderRadius: '20px', border: `1.5px solid ${filterCat === 'all' ? 'var(--accent-gold)' : 'var(--border-color)'}`, background: filterCat === 'all' ? 'var(--accent-gold)' : 'var(--bg-secondary)', color: filterCat === 'all' ? 'var(--on-accent, #ffffff)' : 'var(--text-secondary)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
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
                {upcoming.map(ev => <EventCard key={ev.id} ev={ev} rsvps={rsvps} rsvpCounts={rsvpCounts} rsvpGoers={rsvpGoers} rsvpNotGoers={rsvpNotGoers}
                  expandedId={expandedId} setExpandedId={setExpandedId}
                  linkedTalk={linkedTalks[ev.id]} onOpenTalk={talk => navigate(`/sermons/${talk.id}`)}
                  onRsvp={handleRsvp} onDelete={canDelete ? handleDeleteRequest : null} onEdit={canEdit ? openEditEvent : null} userId={userId} isConfigured={isConfigured} />)}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                Past Events
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {past.map(ev => <EventCard key={ev.id} ev={ev} rsvps={rsvps} rsvpCounts={rsvpCounts} rsvpGoers={rsvpGoers} rsvpNotGoers={rsvpNotGoers}
                  expandedId={expandedId} setExpandedId={setExpandedId}
                  linkedTalk={linkedTalks[ev.id]} onOpenTalk={talk => navigate(`/sermons/${talk.id}`)}
                  onRsvp={null} onDelete={canDelete ? handleDeleteRequest : null} onEdit={canEdit ? openEditEvent : null} userId={userId} isConfigured={isConfigured} />)}
              </div>
            </section>
          )}
        </>
      )}

      {editTarget && (
        <div className="delete-confirm-overlay" role="presentation" onClick={() => !editSaving && setEditTarget(null)}>
          <div className="delete-confirm-dialog" style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--accent-gold)' }}>Edit Event</h2>
              <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setEditTarget(null)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Event Title *
                  <input value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} required />
                </label>
                <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Category
                  <select value={editForm.category} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Start Date *
                  <input type="date" value={editForm.date} onChange={e => setEditForm(p => ({ ...p, date: e.target.value }))} required />
                </label>
                <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  End Date <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
                  <input type="date" value={editForm.date_end} min={editForm.date || undefined} onChange={e => setEditForm(p => ({ ...p, date_end: e.target.value }))} />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Start Time
                  <input type="time" value={editForm.time_start} onChange={e => setEditForm(p => ({ ...p, time_start: e.target.value }))} />
                </label>
                <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  End Time
                  <input type="time" value={editForm.time_end} onChange={e => setEditForm(p => ({ ...p, time_end: e.target.value }))} />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Location / Venue
                  <input value={editForm.location} onChange={e => setEditForm(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Student Center" />
                </label>
                <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Address
                  <input value={editForm.address} onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))} placeholder="e.g. 13 San Miguel Rd" />
                </label>
              </div>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Description
                <textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Tell attendees what to expect…" rows={3} style={{ resize: 'vertical', fontFamily: 'inherit' }} />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Flyer <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span>
                {editForm.flyer_url ? (
                  <div style={{ position: 'relative', display: 'inline-block', maxWidth: '260px' }}>
                    <img src={editForm.flyer_url} alt="Event flyer" style={{ width: '100%', borderRadius: '10px', display: 'block' }} />
                    <button type="button" onClick={() => setEditForm(p => ({ ...p, flyer_url: '' }))}
                      aria-label="Remove flyer"
                      style={{ position: 'absolute', top: '0.4rem', right: '0.4rem', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <input type="file" accept="image/*" disabled={flyerUploading}
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      setFlyerUploading(true);
                      setEditError('');
                      try {
                        const url = await uploadFlyer(file);
                        setEditForm(p => ({ ...p, flyer_url: url }));
                      } catch (err) {
                        setEditError(`Could not upload flyer: ${err.message}`);
                      } finally {
                        setFlyerUploading(false);
                      }
                    }}
                    style={{ fontWeight: 400 }} />
                )}
                {flyerUploading && <span style={{ fontWeight: 400, fontSize: '0.8rem', opacity: 0.7 }}>Uploading…</span>}
              </label>
              {editError && <p style={{ color: '#dc2626', fontSize: '0.88rem', margin: 0 }}>{editError}</p>}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setEditTarget(null)} disabled={editSaving}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="delete-confirm-overlay" role="presentation" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="delete-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-event-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="delete-event-title">Delete Event?</h2>
            <p>
              This will permanently delete <strong>{deleteTarget.title}</strong> and remove all RSVPs for this event.
            </p>
            <div className="delete-confirm-actions">
              <button type="button" className="btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarItemChip({ item, onOpenStudy, onOpenEvent }) {
  const isStudy = item.kind === 'study';
  const detail = isStudy ? item.details : item.event;
  const location = isStudy
    ? (detail?.location || item.group?.meeting_location)
    : detail?.location;
  const focus = isStudy
    ? detail?.focus_passage
    : detail?.description;
  const time = formatTimeAMPM(item.time);

  return (
    <button
      type="button"
      className={`calendar-item-chip ${isStudy ? 'study' : 'event'}`}
      style={{ '--chip-color': item.color, '--chip-bg': item.bg }}
      onClick={() => {
        if (isStudy) onOpenStudy?.(item);
        else onOpenEvent?.(item);
      }}
      title={[
        item.title,
        time,
        location,
        focus,
        item.talk ? `Open ${item.talk.category === 'message' ? 'message' : 'sermon'}: ${item.talk.title}` : null,
      ].filter(Boolean).join(' | ')}
    >
      <span className="calendar-chip-time">{time || (isStudy ? 'Study' : 'Event')}</span>
      <span className="calendar-chip-title">
        {item.talk && <Mic2 size={9} style={{ marginRight: '0.2rem', verticalAlign: 'middle' }} />}
        {item.title}
      </span>
      {focus && <span className="calendar-chip-detail">{focus}</span>}
      {location && <span className="calendar-chip-detail">{location}</span>}
    </button>
  );
}

function WeatherBadge({ ev }) {
  const [forecast, setForecast] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getEventForecast(ev).then((result) => {
      if (!cancelled) setForecast(result);
    });
    return () => { cancelled = true; };
  }, [ev.id, ev.date, ev.address, ev.location]);

  if (!forecast) return null;
  return (
    <span
      style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}
      title={`${forecast.label} — high ${forecast.high}°F, low ${forecast.low}°F${forecast.precipChance != null ? `, ${forecast.precipChance}% chance of precipitation` : ''}`}
    >
      {forecast.emoji} {forecast.high}°F
      {forecast.precipChance != null && forecast.precipChance >= 30 && (
        <span style={{ color: 'var(--text-muted)' }}>· {forecast.precipChance}% 💧</span>
      )}
    </span>
  );
}

function EventCard({ ev, rsvps, rsvpCounts, rsvpGoers, rsvpNotGoers, expandedId, setExpandedId, onRsvp, onDelete, onEdit, isConfigured, linkedTalk, onOpenTalk }) {
  const cat = getCat(ev.category);
  const { month, day } = formatDateBlock(ev.date, ev.date_end);
  const isMultiDay = ev.date_end && ev.date_end !== ev.date;
  const myRsvp = rsvps[ev.id];
  const counts = rsvpCounts[ev.id] || { going: 0, not_going: 0 };
  const expanded = expandedId === ev.id;

  const timeStr = ev.time_start
    ? [
        formatTimeAMPM(ev.time_start),
        ev.time_end ? `– ${formatTimeAMPM(ev.time_end)}` : ''
      ].filter(Boolean).join(' ')
    : null;

  return (
    <div id={`calendar-event-${ev.id}`} style={{
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
                {linkedTalk && onOpenTalk && (
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); onOpenTalk(linkedTalk); }}
                    title={`Open ${linkedTalk.category === 'message' ? 'message' : 'sermon'}: ${linkedTalk.title}`}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: '20px', padding: '0.15rem 0.6rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
                    <Mic2 size={10} /> {linkedTalk.category === 'message' ? 'Message' : 'Sermon'}
                  </button>
                )}
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
                {onRsvp !== null && <WeatherBadge ev={ev} />}
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

              {onEdit && (
                <button onClick={(event) => {
                  event.stopPropagation();
                  onEdit(ev);
                }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem' }}
                  title="Edit event">
                  <Pencil size={15} />
                </button>
              )}

              {onDelete && (
                <button onClick={(event) => {
                  event.stopPropagation();
                  onDelete(ev);
                }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem' }}
                  title="Delete event">
                  <Trash2 size={15} />
                </button>
              )}

              {/* Expand toggle */}
              <button onClick={() => setExpandedId(expanded ? null : ev.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem' }}>
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div style={{ padding: '1rem 1rem 1rem 88px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
          {linkedTalk && onOpenTalk && (
            <button
              type="button"
              onClick={() => onOpenTalk(linkedTalk)}
              className="btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.4rem 0.9rem', fontSize: '0.83rem', borderRadius: '8px', marginBottom: '0.75rem' }}
            >
              <Mic2 size={14} /> {linkedTalk.category === 'message' ? 'Message' : 'Sermon'}: {linkedTalk.title}
            </button>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <a
              href={googleCalendarUrl(ev)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.8rem', fontSize: '0.8rem', textDecoration: 'none', borderRadius: '8px' }}
            >
              <CalendarPlus size={14} /> Google Calendar
            </a>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => downloadICS(ev)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.8rem', fontSize: '0.8rem', borderRadius: '8px' }}
            >
              <Download size={14} /> Apple / Outlook (.ics)
            </button>
            <QRShareButton
              value={googleCalendarUrl(ev)}
              title={`Scan to add "${ev.title}" to your calendar`}
              buttonLabel="Share QR"
            />
          </div>
          {ev.flyer_url && (
            <a href={ev.flyer_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', margin: '0 0 0.75rem' }}>
              <img src={ev.flyer_url} alt={`Flyer for ${ev.title}`} loading="lazy"
                style={{ width: '100%', maxWidth: '420px', borderRadius: '12px', display: 'block' }} />
            </a>
          )}
          {ev.address && (
            <p style={{ margin: '0 0 0.6rem', color: 'var(--text-secondary)', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <MapPin size={14} /> {ev.address}
            </p>
          )}
          {ev.description && (
            <p style={{ margin: '0 0 0.75rem', color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.6 }}>{ev.description}</p>
          )}
          {(ev.created_by_name || ev.created_by_email) && (
            <p style={{ margin: '0 0 0.75rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              <strong>Created by:</strong> {ev.created_by_name || ev.created_by_email}
            </p>
          )}
          {/* Going list */}
          {(rsvpGoers[ev.id] || []).length > 0 && (
            <div style={{ marginBottom: '0.6rem' }}>
              <p style={{ margin: '0 0 0.3rem', fontSize: '0.82rem', fontWeight: 700, color: '#15803d' }}>
                ✅ Going ({counts.going})
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {(rsvpGoers[ev.id] || []).map(p => (
                  <span key={p.email} style={{ background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: '20px', padding: '0.2rem 0.65rem', fontSize: '0.78rem', color: '#15803d', fontWeight: 600 }}>
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Not going list */}
          {(rsvpNotGoers[ev.id] || []).length > 0 && (
            <div style={{ marginBottom: '0.6rem' }}>
              <p style={{ margin: '0 0 0.3rem', fontSize: '0.82rem', fontWeight: 700, color: '#dc2626' }}>
                ❌ Can't Go ({counts.not_going})
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {(rsvpNotGoers[ev.id] || []).map(p => (
                  <span key={p.email} style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '20px', padding: '0.2rem 0.65rem', fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Show counts even when no one has responded yet */}
          {(rsvpGoers[ev.id] || []).length === 0 && (rsvpNotGoers[ev.id] || []).length === 0 && (
            <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', margin: 0 }}>No responses yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
