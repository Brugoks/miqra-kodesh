import { useState } from 'react';
import './Layout.css';
import { Home, Calendar, BookOpen, MessageSquare, Shield, Plug, ShieldCheck, LogOut, Mic2 } from 'lucide-react';

const LEADER_ROLES = ['admin', 'student_leader', 'parent_leader'];

export default function Layout({ currentTab, setCurrentTab, onSignOut, userRole, session, children }) {
  const isAdmin = userRole === 'admin';
  const isLeader = LEADER_ROLES.includes(userRole);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const user = session?.user;
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';
  const avatarUrl = user?.user_metadata?.avatar_url;
  const initials = displayName.trim().split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const navItems = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'studies', label: 'Bible Study', icon: BookOpen },
    { id: 'fellowship', label: 'Fellowship', icon: MessageSquare },
    { id: 'sermons', label: 'Sermons', icon: Mic2 },
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
            <div style={{ position: 'relative' }}>
              {/* Profile trigger */}
              <button
                onClick={() => setShowProfileMenu(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  background: 'none', border: '1.5px solid var(--border-color)',
                  borderRadius: '999px', padding: '0.3rem 0.75rem 0.3rem 0.3rem',
                  cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-gold)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
              >
                <div style={{
                  width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                  overflow: 'hidden', background: 'linear-gradient(135deg, var(--navy-primary), var(--navy-light))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', fontWeight: 700, color: 'white',
                }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : initials}
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayName}
                </span>
              </button>

              {/* Dropdown */}
              {showProfileMenu && (
                <>
                  <div onClick={() => setShowProfileMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                  <div style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 11,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                    borderRadius: '12px', boxShadow: 'var(--shadow-lg)', minWidth: '220px', overflow: 'hidden',
                  }}>
                    {/* User info */}
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                        overflow: 'hidden', background: 'linear-gradient(135deg, var(--navy-primary), var(--navy-light))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.9rem', fontWeight: 700, color: 'white',
                      }}>
                        {avatarUrl
                          ? <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : initials}
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
                      </div>
                    </div>
                    {/* Sign out */}
                    <button
                      onClick={() => { setShowProfileMenu(false); onSignOut(); }}
                      style={{
                        width: '100%', padding: '0.75rem 1rem', background: 'none', border: 'none',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem',
                        color: '#ef4444', fontSize: '0.88rem', fontWeight: 600, textAlign: 'left',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <LogOut size={15} />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
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
        <p>© {new Date().getFullYear()} Charleston Baptist Church. Student Small Groups.</p>
      </footer>
    </div>
  );
}
