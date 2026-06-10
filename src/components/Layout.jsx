import React from 'react';
import './Layout.css';
import { Home, Calendar, BookOpen, MessageSquare, Shield, Plug, ShieldCheck } from 'lucide-react';

const LEADER_ROLES = ['admin', 'student_leader', 'parent_leader'];

export default function Layout({ currentTab, setCurrentTab, onSignOut, userRole, children }) {
  const isAdmin = userRole === 'admin';
  const isLeader = LEADER_ROLES.includes(userRole);

  const navItems = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'studies', label: 'Bible Study', icon: BookOpen },
    { id: 'fellowship', label: 'Fellowship', icon: MessageSquare },
    { id: 'integrations', label: 'Integrations', icon: Plug },
    ...(isLeader ? [{ id: 'leader-portal', label: 'Leader Portal', icon: Shield }] : []),
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: ShieldCheck }] : []),
  ];

  return (
    <div className="layout-container">
      {/* Header */}
      <header className="layout-header">
        <button
          className="logo-container"
          onClick={() => setCurrentTab('dashboard')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <BookOpen className="logo-icon" size={28} />
          <span className="logo-text">CB Students Portal</span>
        </button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Desktop Navigation */}
          <nav className="nav-links">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`nav-item ${currentTab === item.id ? 'active' : ''}`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {onSignOut && (
            <button
              onClick={onSignOut}
              className="btn-secondary"
              style={{
                padding: '0.45rem 0.85rem',
                fontSize: '0.85rem',
                borderRadius: '8px',
                color: '#ef4444',
                borderColor: 'rgba(239, 68, 68, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontWeight: '600'
              }}
            >
              Sign Out
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="layout-main animate-fade-in">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`mobile-nav-item ${currentTab === item.id ? 'active' : ''}`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <footer className="layout-footer">
        <p>© {new Date().getFullYear()} Charleston Baptist Church. Youth Group Small Groups.</p>
      </footer>
    </div>
  );
}
