import { useState, useEffect } from 'react';
import './Fellowship.css';
import { Heart, Plus, BookOpen, Trash2, Calendar, Send, Sparkles, Pencil, Users, ChevronDown, ChevronUp, Clock, MapPin } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { canAccessLeaderTools } from '../lib/roles';

export default function Fellowship({ session, userRole }) {
  const canCreateGroups = canAccessLeaderTools(userRole);
  // --- PRAYER WALL STATE ---
  const [prayers, setPrayers] = useState([]);
  const [showPrayerForm, setShowPrayerForm] = useState(false);
  const [prayerName, setPrayerName] = useState('');
  const [prayerCategory, setPrayerCategory] = useState('Healing');
  const [prayerText, setPrayerText] = useState('');
  const [prayerSubmitting, setPrayerSubmitting] = useState(false);
  const [prayerError, setPrayerError] = useState('');

  // --- JOURNAL STATE ---
  const [journalEntries, setJournalEntries] = useState([]);
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [journalTitle, setJournalTitle] = useState('');
  const [journalScripture, setJournalScripture] = useState('');
  const [journalBody, setJournalBody] = useState('');
  const [editingJournalId, setEditingJournalId] = useState(null);


  const defaultJournal = [
    {
      id: 'j1',
      title: "Meditation on Loving God & Others",
      scripture: "Mark 12:30-31",
      body: "Today I meditated on Jesus' call to love God with all our heart, soul, mind, and strength, and our neighbors as ourselves. It's a reminder that Christianity isn't just about rules; it's a deep relationship with our Creator that overflows into how we treat others in our daily life. I feel challenged to show real grace to my school peers this week.",
      date: "June 6, 2026"
    }
  ];

  // --- GROUPS STATE ---
  const [groups, setGroups] = useState({});
  const [groupFilter, setGroupFilter] = useState('mine');
  const [expandedGroupId, setExpandedGroupId] = useState(null);
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDay, setNewGroupDay] = useState('');
  const [newGroupTime, setNewGroupTime] = useState('');
  const [newGroupFrequency, setNewGroupFrequency] = useState('Weekly');
  const [newGroupTopic, setNewGroupTopic] = useState('');
  const [newGroupLeader, setNewGroupLeader] = useState('');
  const [newGroupCoLeader, setNewGroupCoLeader] = useState('');

  const defaultGroups = {
    boys: {
      name: "High School Boys",
      meetingDay: "Wednesday", meetingTime: "6:30 PM", frequency: "Weekly",
      topic: "Walking in Unity (Ephesians 4)", leader: "Dan K.", coLeader: "",
      students: [
        { id: 'sb1', name: "Daniel Quiambao" }, { id: 'sb2', name: "Joshua Smith" },
        { id: 'sb3', name: "Caleb Harrison" }, { id: 'sb4', name: "Benjamin Rogers" },
        { id: 'sb5', name: "Isaac Newton" }, { id: 'sb6', name: "Nathan Wright" }
      ]
    },
    girls: {
      name: "High School Girls",
      meetingDay: "Wednesday", meetingTime: "6:30 PM", frequency: "Weekly",
      topic: "Walking in Unity (Ephesians 4)", leader: "Sarah M.", coLeader: "",
      students: [
        { id: 'sg1', name: "Elizabeth Bennet" }, { id: 'sg2', name: "Hannah Abbott" },
        { id: 'sg3', name: "Esther Prince" }, { id: 'sg4', name: "Abigail Williams" },
        { id: 'sg5', name: "Ruth Peterson" }, { id: 'sg6', name: "Lydia Bennet" }
      ]
    },
    middle: {
      name: "Middle School Co-ed",
      meetingDay: "Sunday", meetingTime: "9:30 AM", frequency: "Weekly",
      topic: "Faith Under Pressure", leader: "Chris J.", coLeader: "",
      students: [
        { id: 'sm1', name: "Samuel Adams" }, { id: 'sm2', name: "David Copperfield" },
        { id: 'sm3', name: "Elijah Craig" }, { id: 'sm4', name: "Chloe Smith" },
        { id: 'sm5', name: "Grace Kelly" }, { id: 'sm6', name: "Sophia Loren" }
      ]
    }
  };

  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && Boolean(userId);

  const formatDate = (dateValue) => {
    return new Date(dateValue).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const buildGroupId = (name) => {
    const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `group-${Date.now()}`;
    let id = base;
    let suffix = 2;
    while (groups[id]) { id = `${base}-${suffix}`; suffix += 1; }
    return id;
  };

  const saveGroupsState = async (newGroups) => {
    setGroups(newGroups);
    localStorage.setItem('miqra_attendance_groups', JSON.stringify(newGroups));
    if (isConfigured) {
      for (const [id, group] of Object.entries(newGroups)) {
        await supabase.from('attendance_groups').upsert({
          id,
          name: group.name,
          meeting_day: group.meetingDay,
          meeting_time: group.meetingTime,
          frequency: group.frequency,
          topic: group.topic,
          leader: group.leader,
          co_leader: group.coLeader,
          students: group.students,
          updated_at: new Date().toISOString()
        });
      }
    }
  };

  const handleAddGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const id = buildGroupId(newGroupName);
    const newGroups = {
      ...groups,
      [id]: {
        name: newGroupName.trim(),
        meetingDay: newGroupDay,
        meetingTime: newGroupTime.trim(),
        frequency: newGroupFrequency,
        topic: newGroupTopic.trim(),
        leader: newGroupLeader.trim() || 'Unassigned',
        coLeader: newGroupCoLeader.trim(),
        students: []
      }
    };
    await saveGroupsState(newGroups);
    setNewGroupName('');
    setNewGroupDay('');
    setNewGroupTime('');
    setNewGroupFrequency('Weekly');
    setNewGroupTopic('');
    setNewGroupLeader('');
    setNewGroupCoLeader('');
    setShowNewGroupForm(false);
  };

  const loadGroupsData = async () => {
    if (isConfigured) {
      const { data, error } = await supabase
        .from('attendance_groups')
        .select('*')
        .order('created_at', { ascending: true });

      if (error || !data || data.length === 0) {
        setGroups(defaultGroups);
      } else {
        const mapped = {};
        data.forEach(item => {
          mapped[item.id] = {
            name: item.name,
            meetingDay: item.meeting_day,
            meetingTime: item.meeting_time,
            frequency: item.frequency,
            topic: item.topic,
            leader: item.leader,
            coLeader: item.co_leader,
            students: item.students || []
          };
        });
        setGroups(mapped);
      }
    } else {
      const saved = localStorage.getItem('miqra_attendance_groups');
      if (saved) {
        try { setGroups(JSON.parse(saved)); } catch { setGroups(defaultGroups); }
      } else {
        setGroups(defaultGroups);
      }
    }
  };

  const loadLocalData = () => {
    setPrayers([]);

    const savedJournal = localStorage.getItem('miqra_journal');
    if (savedJournal) {
      try {
        setJournalEntries(JSON.parse(savedJournal));
      } catch {
        setJournalEntries(defaultJournal);
      }
    } else {
      setJournalEntries(defaultJournal);
      localStorage.setItem('miqra_journal', JSON.stringify(defaultJournal));
    }
  };

  const loadSupabaseData = async () => {
    const [{ data: prayerRows, error: prayerError }, { data: amenRows }, { data: journalRows, error: journalError }] = await Promise.all([
      supabase.from('prayers').select('*').order('created_at', { ascending: false }),
      supabase.from('prayer_amens').select('prayer_id, user_id'),
      supabase.from('journal_entries').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    ]);

    if (prayerError) {
      console.error('Error loading prayers from Supabase:', prayerError);
      setPrayers([]);
      return;
    }

    const amenCounts = {};
    const activeAmens = new Set();
    (amenRows || []).forEach((amen) => {
      amenCounts[amen.prayer_id] = (amenCounts[amen.prayer_id] || 0) + 1;
      if (amen.user_id === userId) activeAmens.add(amen.prayer_id);
    });

    setPrayers((prayerRows || []).map((prayer) => ({
      id: prayer.id,
      userId: prayer.user_id,
      name: prayer.name,
      category: prayer.category,
      text: prayer.body,
      date: formatDate(prayer.created_at),
      amenCount: amenCounts[prayer.id] || 0,
      amenActive: activeAmens.has(prayer.id),
    })));

    if (journalError) {
      console.error('Error loading journal from Supabase:', journalError);
      setJournalEntries([]);
    } else {
      setJournalEntries((journalRows || []).map((entry) => ({
        id: entry.id,
        title: entry.title,
        scripture: entry.scripture || 'General Reflections',
        body: entry.body,
        date: formatDate(entry.created_at),
      })));
    }
  };

  // Load Data
  useEffect(() => {
    // The fellowship page intentionally hydrates local/Supabase state when the session becomes available.
    if (isConfigured) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadSupabaseData();
    } else {
      loadLocalData();
    }
    loadGroupsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, userId]);

  // Save Prayers Helper
  const savePrayers = (updatedPrayers) => {
    setPrayers(updatedPrayers);
    localStorage.setItem('miqra_prayers', JSON.stringify(updatedPrayers));
  };

  // Save Journal Helper
  const saveJournal = (updatedJournal) => {
    setJournalEntries(updatedJournal);
    localStorage.setItem('miqra_journal', JSON.stringify(updatedJournal));
  };

  const resetJournalForm = () => {
    setJournalTitle('');
    setJournalScripture('');
    setJournalBody('');
    setEditingJournalId(null);
  };

  // --- PRAYER ACTIONS ---
  const handlePrayerSubmit = async (e) => {
    e.preventDefault();
    if (!prayerText.trim()) return;

    setPrayerSubmitting(true);
    setPrayerError('');

    const newPrayer = {
      id: 'p_' + Date.now(),
      userId,
      name: prayerName.trim() || 'Anonymous',
      category: prayerCategory,
      text: prayerText.trim(),
      date: formatDate(new Date()),
      amenCount: 1,
      amenActive: true,
    };

    if (isConfigured) {
      const { error } = await supabase.from('prayers').insert({
        id: newPrayer.id,
        user_id: userId,
        name: newPrayer.name,
        category: newPrayer.category,
        body: newPrayer.text,
      });

      if (error) {
        console.error('Prayer insert error:', error);
        setPrayerError(error.message || 'Could not save your prayer. Please try again.');
        setPrayerSubmitting(false);
        return;
      }

      await supabase.from('prayer_amens').insert({
        prayer_id: newPrayer.id,
        user_id: userId,
      });
      setPrayers([newPrayer, ...prayers]);
    } else {
      savePrayers([newPrayer, ...prayers]);
    }

    setPrayerName('');
    setPrayerText('');
    setPrayerCategory('Healing');
    setPrayerSubmitting(false);
    setShowPrayerForm(false);
  };

  const handleAmen = async (id) => {
    const currentPrayer = prayers.find((p) => p.id === id);
    const updated = prayers.map((p) => {
      if (p.id === id) {
        return {
          ...p,
          amenCount: p.amenActive ? p.amenCount - 1 : p.amenCount + 1,
          amenActive: !p.amenActive
        };
      }
      return p;
    });
    setPrayers(updated);

    if (isConfigured && currentPrayer) {
      if (currentPrayer.amenActive) {
        await supabase.from('prayer_amens').delete().eq('prayer_id', id).eq('user_id', userId);
      } else {
        await supabase.from('prayer_amens').insert({ prayer_id: id, user_id: userId });
      }
    } else {
      localStorage.setItem('miqra_prayers', JSON.stringify(updated));
    }
  };

  const handleDeletePrayer = async (id) => {
    setPrayers(prev => prev.filter(p => p.id !== id));
    if (isConfigured) {
      await supabase.from('prayer_amens').delete().eq('prayer_id', id);
      await supabase.from('prayers').delete().eq('id', id).eq('user_id', userId);
    } else {
      const updated = prayers.filter(p => p.id !== id);
      localStorage.setItem('miqra_prayers', JSON.stringify(updated));
    }
  };

  // --- JOURNAL ACTIONS ---
  const handleJournalSubmit = async (e) => {
    e.preventDefault();
    if (!journalTitle.trim() || !journalBody.trim()) return;

    if (editingJournalId) {
      const updatedEntry = {
        title: journalTitle.trim(),
        scripture: journalScripture.trim() || 'General Reflections',
        body: journalBody.trim(),
      };
      const updatedJournal = journalEntries.map((entry) => (
        entry.id === editingJournalId ? { ...entry, ...updatedEntry } : entry
      ));

      if (isConfigured) {
        const { error } = await supabase
          .from('journal_entries')
          .update(updatedEntry)
          .eq('id', editingJournalId)
          .eq('user_id', userId);

        if (error) {
          console.error('Journal update error:', error);
          return;
        }

        setJournalEntries(updatedJournal);
      } else {
        saveJournal(updatedJournal);
      }

      resetJournalForm();
      setShowJournalForm(false);
      return;
    }

    const newEntry = {
      id: 'j_' + Date.now(),
      title: journalTitle.trim(),
      scripture: journalScripture.trim() || 'General Reflections',
      body: journalBody.trim(),
      date: formatDate(new Date())
    };

    if (isConfigured) {
      const { error } = await supabase.from('journal_entries').insert({
        id: newEntry.id,
        user_id: userId,
        title: newEntry.title,
        scripture: newEntry.scripture,
        body: newEntry.body,
      });

      if (!error) setJournalEntries([newEntry, ...journalEntries]);
    } else {
      const updated = [newEntry, ...journalEntries];
      saveJournal(updated);
    }

    // Reset Form
    resetJournalForm();
    setShowJournalForm(false);
  };

  const startEditingJournalEntry = (entry) => {
    setEditingJournalId(entry.id);
    setJournalTitle(entry.title);
    setJournalScripture(entry.scripture === 'General Reflections' ? '' : entry.scripture);
    setJournalBody(entry.body);
    setShowJournalForm(true);
  };

  const cancelJournalForm = () => {
    resetJournalForm();
    setShowJournalForm(false);
  };

  const toggleJournalForm = () => {
    if (showJournalForm) {
      cancelJournalForm();
      return;
    }

    resetJournalForm();
    setShowJournalForm(true);
  };

  const deleteJournalEntry = async (id) => {
    if (window.confirm("Are you sure you want to delete this journal entry?")) {
      const updated = journalEntries.filter(j => j.id !== id);
      setJournalEntries(updated);

      if (isConfigured) {
        await supabase.from('journal_entries').delete().eq('id', id).eq('user_id', userId);
      } else {
        localStorage.setItem('miqra_journal', JSON.stringify(updated));
      }
    }
  };

  const myGroupIds = Object.keys(groups).filter(key =>
    groups[key].students?.some(s => s.linkedUserId === userId)
  );
  const displayedGroups = groupFilter === 'mine'
    ? Object.fromEntries(myGroupIds.map(k => [k, groups[k]]))
    : groups;
  const displayedGroupEntries = Object.entries(displayedGroups);

  return (
    <div className="fellowship-page animate-fade-in">

      {/* Groups Section */}
      <section className="groups-section card">
        <div className="groups-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Users size={18} style={{ color: 'var(--accent-gold)' }} />
            <h2 style={{ margin: 0 }}>Small Groups</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="groups-filter-pills">
              <button
                className={`group-filter-pill ${groupFilter === 'mine' ? 'active' : ''}`}
                onClick={() => setGroupFilter('mine')}
              >
                My Groups
              </button>
              <button
                className={`group-filter-pill ${groupFilter === 'all' ? 'active' : ''}`}
                onClick={() => setGroupFilter('all')}
              >
                All
              </button>
            </div>
            {canCreateGroups && (
              <button
                className="btn-primary"
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                onClick={() => setShowNewGroupForm(v => !v)}
              >
                <Plus size={15} />
                <span>{showNewGroupForm ? 'Close' : 'New Group'}</span>
              </button>
            )}
          </div>
        </div>

        {canCreateGroups && showNewGroupForm && (
          <form onSubmit={handleAddGroup} className="new-group-form animate-fade-in">
            <div className="new-group-form-grid">
              <div className="form-group">
                <label>Group Name</label>
                <input type="text" placeholder="e.g. High School Boys" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Meeting Day</label>
                <select value={newGroupDay} onChange={e => setNewGroupDay(e.target.value)} required>
                  <option value="">Select day</option>
                  {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Meeting Time</label>
                <input type="text" placeholder="e.g. 6:30 PM" value={newGroupTime} onChange={e => setNewGroupTime(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Frequency</label>
                <select value={newGroupFrequency} onChange={e => setNewGroupFrequency(e.target.value)}>
                  <option value="Weekly">Weekly</option>
                  <option value="Every Other Week">Every Other Week</option>
                  <option value="Once a Month">Once a Month</option>
                </select>
              </div>
              <div className="form-group">
                <label>Topic / Book</label>
                <input type="text" placeholder="e.g. Ephesians 4" value={newGroupTopic} onChange={e => setNewGroupTopic(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Leader</label>
                <input type="text" placeholder="e.g. Dan K." value={newGroupLeader} onChange={e => setNewGroupLeader(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Co-Leader</label>
                <input type="text" placeholder="Optional" value={newGroupCoLeader} onChange={e => setNewGroupCoLeader(e.target.value)} />
              </div>
            </div>
            <div className="form-actions" style={{ marginTop: '0.75rem' }}>
              <button type="button" className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => setShowNewGroupForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Plus size={14} />
                Create Group
              </button>
            </div>
          </form>
        )}

        {displayedGroupEntries.length === 0 ? (
          <div className="groups-empty">
            {groupFilter === 'mine' ? (
              <>
                <p>You're not linked to any groups yet.</p>
                <button
                  className="btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.8rem', marginTop: '0.5rem' }}
                  onClick={() => setGroupFilter('all')}
                >
                  View All Groups
                </button>
              </>
            ) : (
              <p>No groups have been created yet.</p>
            )}
          </div>
        ) : (
          <div className="groups-card-grid">
            {displayedGroupEntries.map(([key, group]) => {
              const isExpanded = expandedGroupId === key;
              return (
                <div
                  key={key}
                  className={`group-card ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => setExpandedGroupId(isExpanded ? null : key)}
                >
                  <div className="group-card-top">
                    <div className="group-card-main">
                      <h3 className="group-card-name">{group.name}</h3>
                      <div className="group-card-meta">
                        <span className="group-meta-item">
                          <Clock size={12} />
                          {[group.meetingDay, group.meetingTime].filter(Boolean).join(' · ') || 'TBD'}
                        </span>
                        <span className="group-meta-item">
                          <Users size={12} />
                          {group.students?.length ?? 0} members
                        </span>
                      </div>
                      {group.topic && (
                        <span className="badge badge-gold" style={{ fontSize: '0.65rem', marginTop: '0.4rem', display: 'inline-block' }}>
                          {group.topic}
                        </span>
                      )}
                    </div>
                    <div className="group-card-chevron">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="group-card-detail" onClick={e => e.stopPropagation()}>
                      <div className="group-detail-meta-row">
                        <div className="group-detail-field">
                          <span className="group-detail-label">Leader</span>
                          <span className="group-detail-value">{group.leader || '—'}</span>
                        </div>
                        {group.coLeader && (
                          <div className="group-detail-field">
                            <span className="group-detail-label">Co-Leader</span>
                            <span className="group-detail-value">{group.coLeader}</span>
                          </div>
                        )}
                        <div className="group-detail-field">
                          <span className="group-detail-label">Frequency</span>
                          <span className="group-detail-value">{group.frequency || '—'}</span>
                        </div>
                      </div>
                      {group.students?.length > 0 && (
                        <div className="group-members-list">
                          <span className="group-detail-label" style={{ display: 'block', marginBottom: '0.5rem' }}>Members</span>
                          <div className="group-member-tags">
                            {group.students.map(s => (
                              <span
                                key={s.id}
                                className={`group-member-tag ${s.linkedUserId === userId ? 'you' : ''}`}
                              >
                                {s.name}{s.linkedUserId === userId ? ' (You)' : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="fellowship-grid">

      {/* 1. Prayer Wall Column */}
      <section className="card">
        <div className="wall-header">
          <h2>Prayer Wall</h2>
          <button 
            onClick={() => setShowPrayerForm(!showPrayerForm)}
            className="btn-primary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Plus size={16} />
            <span>{showPrayerForm ? 'Close Form' : 'Request Prayer'}</span>
          </button>
        </div>

        {/* New Prayer Form */}
        {showPrayerForm && (
          <form onSubmit={handlePrayerSubmit} className="prayer-form animate-fade-in">
            <div className="form-group">
              <label htmlFor="prayer-name">Your Name / Initials</label>
              <input 
                id="prayer-name"
                type="text" 
                placeholder="e.g. John S. (leave blank for Anonymous)"
                value={prayerName}
                onChange={(e) => setPrayerName(e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="prayer-cat">Category</label>
              <select 
                id="prayer-cat"
                value={prayerCategory}
                onChange={(e) => setPrayerCategory(e.target.value)}
              >
                <option value="Healing">Healing</option>
                <option value="Guidance">Guidance</option>
                <option value="Provision">Provision</option>
                <option value="Faith">Faith & Strength</option>
                <option value="Thanksgiving">Thanksgiving</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="prayer-req">Prayer Request</label>
              <textarea 
                id="prayer-req"
                rows={3} 
                placeholder="What would you like the fellowship to pray for?"
                value={prayerText}
                onChange={(e) => setPrayerText(e.target.value)}
                required
              />
            </div>

            {prayerError && (
              <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: 0, padding: '0.5rem 0.75rem', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }}>
                {prayerError}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                onClick={() => { setShowPrayerForm(false); setPrayerError(''); }}
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={prayerSubmitting}
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Send size={14} />
                <span>{prayerSubmitting ? 'Submitting…' : 'Submit Request'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Prayers Cards List */}
        <div className="prayer-card-list">
          {prayers.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
              No prayer requests currently active. Feel free to submit the first!
            </p>
          ) : (
            prayers.map((prayer) => (
              <div key={prayer.id} className="prayer-request-card">
                <div className="prayer-card-header">
                  <div>
                    <span className="prayer-user">{prayer.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{prayer.date}</span>
                  </div>
                  <span className="badge badge-gold" style={{ fontSize: '0.65rem' }}>{prayer.category}</span>
                </div>
                
                <p className="prayer-text">"{prayer.text}"</p>
                
                <div className="prayer-card-footer">
                  <span>Joined by {prayer.amenCount} brethren in prayer</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {prayer.userId === userId && (
                      <button
                        onClick={() => handleDeletePrayer(prayer.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem', display: 'flex', alignItems: 'center' }}
                        title="Delete prayer"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => handleAmen(prayer.id)}
                      className={`amen-btn ${prayer.amenActive ? 'active' : ''}`}
                    >
                      <Heart size={14} fill={prayer.amenActive ? "var(--accent-gold)" : "none"} />
                      <span>Amen</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 2. Personal Journal Column */}
      <section className="card">
        <div className="journal-header">
          <h2>Study Journal</h2>
          <button 
            onClick={toggleJournalForm}
            className="btn-primary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Plus size={16} />
            <span>{showJournalForm ? 'Close Form' : 'New Entry'}</span>
          </button>
        </div>

        {/* New Journal Form */}
        {showJournalForm && (
          <form onSubmit={handleJournalSubmit} className="journal-form animate-fade-in">
            <div className="form-group">
              <label htmlFor="journal-title">Entry Title</label>
              <input 
                id="journal-title"
                type="text" 
                placeholder="e.g. Insights from Sunday small group"
                value={journalTitle}
                onChange={(e) => setJournalTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="journal-scripture">Scripture Focus</label>
              <input 
                id="journal-scripture"
                type="text" 
                placeholder="e.g. Numbers 8:4"
                value={journalScripture}
                onChange={(e) => setJournalScripture(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="journal-reflections">Reflections</label>
              <textarea 
                id="journal-reflections"
                rows={4} 
                placeholder="Write down what you learned, notes, or prayer thoughts..."
                value={journalBody}
                onChange={(e) => setJournalBody(e.target.value)}
                required
              />
            </div>

            <div className="form-actions">
              <button 
                type="button" 
                onClick={cancelJournalForm}
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn-primary"
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Sparkles size={14} />
                <span>{editingJournalId ? 'Save Changes' : 'Save Entry'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Journal Entries List */}
        <div className="journal-list">
          {journalEntries.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
              Your study journal is empty. Click "New Entry" above to start documenting your studies!
            </p>
          ) : (
            journalEntries.map((entry) => (
              <div key={entry.id} className="journal-card">
                <div className="journal-card-header">
                  <h3 className="journal-title">{entry.title}</h3>
                  <span className="journal-date" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Calendar size={12} />
                    {entry.date}
                  </span>
                </div>
                
                <div className="journal-scripture-focus">
                  <BookOpen size={12} />
                  <span>{entry.scripture}</span>
                </div>
                
                <p className="journal-body">{entry.body}</p>
                
                <div className="journal-actions">
                  <button
                    onClick={() => startEditingJournalEntry(entry)}
                    className="btn-secondary"
                    style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <Pencil size={12} />
                    <span>Edit</span>
                  </button>
                  <button 
                    onClick={() => deleteJournalEntry(entry.id)}
                    className="btn-danger"
                    style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <Trash2 size={12} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      </div>{/* end fellowship-grid */}
    </div>
  );
}
