import React, { useState } from 'react';
import './Dashboard.css';
import { Copy, Check, BookOpen, Calendar, MessageSquare, PlusSquare } from 'lucide-react';

export default function Dashboard({ setCurrentTab }) {
  const [copied, setCopied] = useState(false);
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

  const announcements = [
    {
      id: 1,
      date: "June 9, 2026",
      title: "Wednesday Night Youth Groups",
      body: "We meet this Wednesday at 6:30 PM in the Youth Center. Gather together as we continue our small group study in Ephesians."
    },
    {
      id: 2,
      date: "June 7, 2026",
      title: "Summer Camp Registration Open",
      body: "Registration for the upcoming Summer Youth Camp is officially open! Lock in your spot under the Calendar tab today."
    },
    {
      id: 3,
      date: "June 5, 2026",
      title: "Weekly Bible Study Guides Live",
      body: "The study materials for our new 'Walking in Unity' series are now live. Browse the Bible Study tab to review questions!"
    }
  ];

  return (
    <div className="dashboard-grid">
      {/* Welcome Card */}
      <section className="welcome-card card">
        <div className="welcome-text">
          <h1>{getGreeting()}, CB Youth</h1>
          <p>Welcome to the Youth Group Small Groups portal. Stay connected, grow in the Word, and walk in unity with one another.</p>
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
        <h2>Announcements</h2>
        <div style={{ marginTop: '1rem' }}>
          {announcements.map((item) => (
            <div key={item.id} className="announcement-item">
              <div className="announcement-date">{item.date}</div>
              <div className="announcement-title">{item.title}</div>
              <div className="announcement-body">{item.body}</div>
            </div>
          ))}
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
              <p>View weekly youth schedules, special events, camp dates & RSVP</p>
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
