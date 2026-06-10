import { useEffect, useState } from 'react';
import './Dashboard.css';
import { Copy, Check, BookOpen, Calendar, MessageSquare, PlusSquare, PlusCircle, Send } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { isLeaderRole } from '../lib/roles';

export default function Dashboard({ setCurrentTab, session, userRole }) {
  const [copied, setCopied] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(hasSupabaseConfig);
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [announcementError, setAnnouncementError] = useState('');
  const canManageAnnouncements = isLeaderRole(userRole);
  const userId = session?.user?.id;
  const scriptureRef = "Mark 12:30-31";
  const scriptureText = "And you shall love the Lord your God with all your heart and with all your soul and with all your mind and with all your strength. The second is this: ‘You shall love your neighbor as yourself.’ There is no other commandment greater than these.";

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Welcome';
    return 'Good evening';
  };

  const copyScripture = () => {
    navigator.clipboard.writeText(`"${scriptureText}" — ${scriptureRef}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    let isMounted = true;

    const loadAnnouncements = async () => {
      if (!hasSupabaseConfig) {
        setAnnouncements([]);
        setAnnouncementsLoading(false);
        return;
      }

      setAnnouncementsLoading(true);
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('announcement_date', { ascending: false });

      if (!isMounted) return;

      if (error || !data?.length) {
        setAnnouncements([]);
      } else {
        setAnnouncements(data.map((item) => ({
          id: item.id,
          date: new Date(`${item.announcement_date}T00:00:00`).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }),
          title: item.title,
          body: item.body,
        })));
      }
      setAnnouncementsLoading(false);
    };

    loadAnnouncements();

    return () => {
      isMounted = false;
    };
  }, []);

  const resetAnnouncementForm = () => {
    setAnnouncementTitle('');
    setAnnouncementBody('');
    setAnnouncementError('');
  };

  const handleCreateAnnouncement = async (event) => {
    event.preventDefault();
    if (!announcementTitle.trim() || !announcementBody.trim()) {
      setAnnouncementError('Title and announcement text are required.');
      return;
    }

    setAnnouncementSaving(true);
    setAnnouncementError('');
    const today = new Date().toISOString().slice(0, 10);
    const newAnnouncement = {
      id: `ann_${Date.now()}`,
      title: announcementTitle.trim(),
      body: announcementBody.trim(),
      announcement_date: today,
      sort_order: 0,
      created_by: userId || null,
    };

    const { data, error } = await supabase
      .from('announcements')
      .insert(newAnnouncement)
      .select('*')
      .single();

    if (error) {
      setAnnouncementError(error.message || 'Could not create announcement.');
      setAnnouncementSaving(false);
      return;
    }

    const saved = data || newAnnouncement;
    setAnnouncements((current) => [{
      id: saved.id,
      date: new Date(`${saved.announcement_date}T00:00:00`).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      title: saved.title,
      body: saved.body,
    }, ...current]);
    resetAnnouncementForm();
    setShowAnnouncementForm(false);
    setAnnouncementSaving(false);
  };

  return (
    <div className="dashboard-grid">
      {/* Welcome Card */}
      <section className="welcome-card card">
        <div className="welcome-text">
          <h1>{getGreeting()}, CB Students</h1>
          <p>Welcome to the Student Small Groups portal. Stay connected, grow in the Word, and walk in unity with one another.</p>
        </div>
        <div className="shabbat-candle-icon">
          <BookOpen size={48} className="logo-icon" />
        </div>
      </section>

      {/* Scripture Focus */}
      <section className="scripture-card card card-gold">
        <div className="scripture-meta">
          <span className="badge badge-gold">Weekly Scripture Focus</span>
          <button 
            className="btn-secondary" 
            style={{ padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderRadius: '6px' }}
            onClick={copyScripture}
            title="Copy verse"
          >
            {copied ? <Check size={14} style={{ color: 'var(--success-green)' }} /> : <Copy size={14} />}
            <span style={{ fontSize: '0.8rem' }}>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
        <blockquote className="scripture-text">
          "{scriptureText}"
        </blockquote>
        <p className="scripture-ref">— {scriptureRef}</p>
      </section>

      {/* Announcements */}
      <section className="announcements-card card">
        <div className="announcements-header">
          <h2>Announcements</h2>
          {canManageAnnouncements && hasSupabaseConfig && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                if (showAnnouncementForm) resetAnnouncementForm();
                setShowAnnouncementForm((value) => !value);
              }}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <PlusCircle size={14} />
              <span>{showAnnouncementForm ? 'Close' : 'New'}</span>
            </button>
          )}
        </div>
        {showAnnouncementForm && canManageAnnouncements && hasSupabaseConfig && (
          <form className="announcement-form" onSubmit={handleCreateAnnouncement}>
            <input
              type="text"
              value={announcementTitle}
              onChange={(event) => setAnnouncementTitle(event.target.value)}
              placeholder="Announcement title"
              required
            />
            <textarea
              value={announcementBody}
              onChange={(event) => setAnnouncementBody(event.target.value)}
              placeholder="Write the announcement..."
              rows={3}
              required
            />
            {announcementError && <p className="announcement-error">{announcementError}</p>}
            <div className="announcement-form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  resetAnnouncementForm();
                  setShowAnnouncementForm(false);
                }}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={announcementSaving}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Send size={13} />
                <span>{announcementSaving ? 'Posting...' : 'Post'}</span>
              </button>
            </div>
          </form>
        )}
        <div style={{ marginTop: '1rem' }}>
          {announcementsLoading ? (
            <p className="announcement-empty">Loading announcements...</p>
          ) : announcements.length === 0 ? (
            <p className="announcement-empty">No announcements have been posted yet.</p>
          ) : (
            announcements.map((item) => (
              <div key={item.id} className="announcement-item">
                <div className="announcement-date">{item.date}</div>
                <div className="announcement-title">{item.title}</div>
                <div className="announcement-body">{item.body}</div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Quick Actions Grid */}
      <section className="quick-actions-card card">
        <h2>Quick Navigation</h2>
        <div className="actions-grid">
          <button className="action-btn" onClick={() => setCurrentTab('studies')}>
            <div className="action-icon">
              <BookOpen size={24} />
            </div>
            <div className="action-info">
              <h4>Study Hub</h4>
              <p>Explore this week's Bible studies & small group discussion guides</p>
            </div>
          </button>
          
          <button className="action-btn" onClick={() => setCurrentTab('calendar')}>
            <div className="action-icon">
              <Calendar size={24} />
            </div>
            <div className="action-info">
              <h4>Activity Calendar</h4>
              <p>View weekly student schedules, special events, camp dates & RSVP</p>
            </div>
          </button>

          <button className="action-btn" onClick={() => setCurrentTab('fellowship')}>
            <div className="action-icon">
              <MessageSquare size={24} />
            </div>
            <div className="action-info">
              <h4>Fellowship Wall</h4>
              <p>Share encouraging thoughts & submit prayer requests</p>
            </div>
          </button>

          <button className="action-btn" onClick={() => setCurrentTab('fellowship')}>
            <div className="action-icon">
              <PlusSquare size={24} />
            </div>
            <div className="action-info">
              <h4>Personal Journal</h4>
              <p>Write down notes or key insights from your study time</p>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}
