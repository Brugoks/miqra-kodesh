import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';
import { Copy, Check, BookOpen, Calendar, MessageSquare, PlusSquare, PlusCircle, Send, CalendarClock, User, MapPin, ArrowRight } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { isLeaderRole } from '../lib/roles';
import { nextMeetingDate, toDateKey, formatMeetingDate } from '../lib/meetings';

export default function Dashboard({ session, userRole }) {
  const navigate = useNavigate();
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
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const [meetingsLoading, setMeetingsLoading] = useState(hasSupabaseConfig);
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

  // Surface the next meeting for each small group the user belongs to (leaders
  // who aren't linked to a specific group see all groups). Read-only here —
  // editing lives in the Study Hub.
  useEffect(() => {
    let isMounted = true;

    const loadMeetings = async () => {
      if (!hasSupabaseConfig || !userId) {
        setUpcomingMeetings([]);
        setMeetingsLoading(false);
        return;
      }

      setMeetingsLoading(true);
      const { data: groups } = await supabase
        .from('attendance_groups')
        .select('id, name, topic, students, meeting_day, meeting_time, frequency, meeting_location, leader');

      if (!isMounted) return;

      const mine = (groups || []).filter((g) =>
        (g.students || []).some((s) => s.linkedUserId === userId));
      const visible = mine.length ? mine : (isLeaderRole(userRole) ? (groups || []) : []);

      const scheduled = visible
        .map((group) => ({ group, date: nextMeetingDate(group.meeting_day) }))
        .filter((x) => x.date)
        .sort((a, b) => a.date - b.date);

      const results = await Promise.all(scheduled.map(async ({ group, date }) => {
        const { data } = await supabase
          .from('group_meetings')
          .select('*')
          .eq('group_id', group.id)
          .eq('meeting_date', toDateKey(date))
          .maybeSingle();
        return { group, date, details: data || null };
      }));

      if (isMounted) {
        setUpcomingMeetings(results);
        setMeetingsLoading(false);
      }
    };

    loadMeetings();

    return () => {
      isMounted = false;
    };
  }, [userId, userRole]);

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

      {/* Next Meeting(s) */}
      {(meetingsLoading || upcomingMeetings.length > 0) && (
        <section className="dash-meetings-card card">
          <div className="dash-meetings-header">
            <h2><CalendarClock size={18} /> Next Meeting{upcomingMeetings.length > 1 ? 's' : ''}</h2>
            <button className="dash-meetings-link" onClick={() => navigate('/studies')}>
              Study Hub <ArrowRight size={13} />
            </button>
          </div>

          {meetingsLoading ? (
            <p className="announcement-empty">Loading your group schedule…</p>
          ) : (
            <div className="dash-meetings-list">
              {upcomingMeetings.map(({ group, date, details }) => (
                <button
                  key={group.id}
                  className="dash-meeting-item"
                  onClick={() => navigate('/studies')}
                  title="Open in Study Hub"
                >
                  <div className="dash-meeting-when">
                    <span className="dash-meeting-date">{formatMeetingDate(date)}</span>
                    <span className="dash-meeting-time">
                      {group.meeting_time ? group.meeting_time : group.frequency || ''}
                    </span>
                  </div>
                  <div className="dash-meeting-body">
                    <span className="dash-meeting-group">{group.name}</span>
                    {(details?.focus_passage || group.topic) && (
                      <span className="dash-meeting-focus">
                        {details?.focus_passage || group.topic}
                      </span>
                    )}
                    <div className="dash-meeting-meta">
                      <span><User size={12} /> {details?.facilitator || group.leader || 'Facilitator TBA'}</span>
                      {(details?.location || group.meeting_location) && (
                        <span><MapPin size={12} /> {details?.location || group.meeting_location}</span>
                      )}
                    </div>
                    {details?.agenda && (
                      <p className="dash-meeting-agenda">{details.agenda}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

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
          <button className="action-btn" onClick={() => navigate('/studies')}>
            <div className="action-icon">
              <BookOpen size={24} />
            </div>
            <div className="action-info">
              <h4>Study Hub</h4>
              <p>Explore this week's Bible studies & small group discussion guides</p>
            </div>
          </button>
          
          <button className="action-btn" onClick={() => navigate('/calendar')}>
            <div className="action-icon">
              <Calendar size={24} />
            </div>
            <div className="action-info">
              <h4>Activity Calendar</h4>
              <p>View weekly student schedules, special events, camp dates & RSVP</p>
            </div>
          </button>

          <button className="action-btn" onClick={() => navigate('/fellowship')}>
            <div className="action-icon">
              <MessageSquare size={24} />
            </div>
            <div className="action-info">
              <h4>Fellowship Wall</h4>
              <p>Share encouraging thoughts & submit prayer requests</p>
            </div>
          </button>

          <button className="action-btn" onClick={() => navigate('/fellowship')}>
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
