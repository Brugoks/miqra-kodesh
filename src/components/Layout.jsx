import React from 'react';
import './Layout.css';
import { Home, Calendar, BookOpen, MessageSquare, Shield } from 'lucide-react';

export default function Layout({ currentTab, setCurrentTab, onSignOut, children }) {
  const navItems = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'studies', label: 'Bible Study', icon: BookOpen },
    { id: 'fellowship', label: 'Fellowship', icon: MessageSquare },
    { id: 'leader-portal', label: 'Leader Portal', icon: Shield },
  ];

  return (
    <div className="layout-container">
      {/* Header */}
      <header className="layout-header">
        <div className="logo-container">
          <BookOpen className="logo-icon" size={28} />
          <span className="logo-text">CB Students Portal</span>
        </div>
        
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
