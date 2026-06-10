import { useState, useEffect } from 'react';
import './Fellowship.css';
import { Heart, Plus, BookOpen, Trash2, Calendar, Send, Sparkles } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';

export default function Fellowship({ session }) {
  // --- PRAYER WALL STATE ---
  const [prayers, setPrayers] = useState([]);
  const [showPrayerForm, setShowPrayerForm] = useState(false);
  const [prayerName, setPrayerName] = useState('');
  const [prayerCategory, setPrayerCategory] = useState('Healing');
  const [prayerText, setPrayerText] = useState('');

  // --- JOURNAL STATE ---
  const [journalEntries, setJournalEntries] = useState([]);
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [journalTitle, setJournalTitle] = useState('');
  const [journalScripture, setJournalScripture] = useState('');
  const [journalBody, setJournalBody] = useState('');

  // Default Fallbacks
  const defaultPrayers = [
    {
      id: 'p1',
      name: "Sarah M.",
      category: "Healing",
      text: "Please pray for my mother who is undergoing surgery this Friday. Pray for the doctor's guidance and a quick, smooth recovery.",
      date: "June 9, 2026",
      amenCount: 14,
      amenActive: false
    },
    {
      id: 'p2',
      name: "Daniel K.",
      category: "Guidance",
      text: "Seeking prayer for wisdom as our family prepares to transition to a new job. Pray that we stay strong in the faith and find a solid fellowship group.",
      date: "June 8, 2026",
      amenCount: 9,
      amenActive: false
    },
    {
      id: 'p3',
      name: "Youth Pastor",
      category: "Faith",
      text: "Lifting up our entire youth group, that we grow in love, stay grounded in our Bible studies, and walk worthy of our calling.",
      date: "June 6, 2026",
      amenCount: 24,
      amenActive: true
    }
  ];

  const defaultJournal = [
    {
      id: 'j1',
      title: "Meditation on Loving God & Others",
      scripture: "Mark 12:30-31",
      body: "Today I meditated on Jesus' call to love God with all our heart, soul, mind, and strength, and our neighbors as ourselves. It's a reminder that Christianity isn't just about rules; it's a deep relationship with our Creator that overflows into how we treat others in our daily life. I feel challenged to show real grace to my school peers this week.",
      date: "June 6, 2026"
    }
  ];

  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && Boolean(userId);

  const formatDate = (dateValue) => {
    return new Date(dateValue).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const loadLocalData = () => {
    const savedPrayers = localStorage.getItem('miqra_prayers');
    if (savedPrayers) {
      try {
        setPrayers(JSON.parse(savedPrayers));
      } catch {
        setPrayers(defaultPrayers);
      }
    } else {
      setPrayers(defaultPrayers);
      localStorage.setItem('miqra_prayers', JSON.stringify(defaultPrayers));
    }

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
      loadLocalData();
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

  // --- PRAYER ACTIONS ---
  const handlePrayerSubmit = async (e) => {
    e.preventDefault();
    if (!prayerText.trim()) return;

    const newPrayer = {
      id: 'p_' + Date.now(),
      name: prayerName.trim() || 'Anonymous',
      category: prayerCategory,
      text: prayerText.trim(),
      date: formatDate(new Date()),
      amenCount: 1,
      amenActive: true // Auto-amen on creation
    };

    if (isConfigured) {
      const { error } = await supabase.from('prayers').insert({
        id: newPrayer.id,
        user_id: userId,
        name: newPrayer.name,
        category: newPrayer.category,
        body: newPrayer.text,
      });

      if (!error) {
        await supabase.from('prayer_amens').insert({
          prayer_id: newPrayer.id,
          user_id: userId,
        });
        setPrayers([newPrayer, ...prayers]);
      }
    } else {
      const updated = [newPrayer, ...prayers];
      savePrayers(updated);
    }
    
    // Reset form
    setPrayerName('');
    setPrayerText('');
    setPrayerCategory('Healing');
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

  // --- JOURNAL ACTIONS ---
  const handleJournalSubmit = async (e) => {
    e.preventDefault();
    if (!journalTitle.trim() || !journalBody.trim()) return;

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
    setJournalTitle('');
    setJournalScripture('');
    setJournalBody('');
    setShowJournalForm(false);
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

  return (
    <div className="fellowship-grid animate-fade-in">
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

            <div className="form-actions">
              <button 
                type="button" 
                onClick={() => setShowPrayerForm(false)} 
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
                <Send size={14} />
                <span>Submit Request</span>
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
                  <button 
                    onClick={() => handleAmen(prayer.id)}
                    className={`amen-btn ${prayer.amenActive ? 'active' : ''}`}
                  >
                    <Heart size={14} fill={prayer.amenActive ? "var(--accent-gold)" : "none"} />
                    <span>Amen</span>
                  </button>
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
            onClick={() => setShowJournalForm(!showJournalForm)}
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
                onClick={() => setShowJournalForm(false)} 
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
                <span>Save Entry</span>
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
    </div>
  );
}
