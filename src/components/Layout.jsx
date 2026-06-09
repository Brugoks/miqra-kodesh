import React from 'react';
import './Layout.css';
import { Home, Calendar, BookOpen, MessageSquare, Shield } from 'lucide-react';

export default function Layout({ currentTab, setCurrentTab, children }) {
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
          <span className="logo-text">CB Youth Portal</span>
        </div>
        
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
