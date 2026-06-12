import { useState, useRef, useCallback } from 'react';
import './Layout.css';
import { Calendar, BookOpen, MessageSquare, Shield, Plug, ShieldCheck, LogOut, Mic2, Mail } from 'lucide-react';
import { canAccessLeaderTools, isAdminRole } from '../lib/roles';
import FeedbackButton from './FeedbackButton';

export default function Layout({ currentTab, setCurrentTab, onSignOut, userRole, session, organization, organizationsList = [], onSwitchOrganization, onJoinOrganization, children }) {
  const isAdmin = isAdminRole(userRole);
  const isLeader = canAccessLeaderTools(userRole);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [navScroll, setNavScroll] = useState({ canLeft: false, canRight: false });
  const navRef = useRef(null);

  const handleNavScroll = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    setNavScroll({
      canLeft: el.scrollLeft > 4,
      canRight: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  const initNavScroll = useCallback((el) => {
    navRef.current = el;
    if (el) {
      el.addEventListener('scroll', handleNavScroll, { passive: true });
      // Check initial state after render
      requestAnimationFrame(handleNavScroll);
    }
  }, [handleNavScroll]);

  const handleJoinOrgPrompt = async () => {
    const code = window.prompt("Enter Organization Join Code:");
    if (!code) return;
    try {
      const org = await onJoinOrganization(code);
      alert(`Successfully joined ${org.name}!`);
    } catch (err) {
      alert(err.message || "Failed to join organization.");
    }
  };

  const user = session?.user;
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';
  const avatarUrl = user?.user_metadata?.avatar_url;
  const initials = displayName.trim().split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const navItems = [
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'studies', label: 'Bible Study', icon: BookOpen },
    { id: 'fellowship', label: 'Fellowship', icon: MessageSquare },
    { id: 'sermons', label: 'Sermons', icon: Mic2 },
    { id: 'discipleship', label: 'Discipleship', icon: Mail },
    ...(isLeader ? [{ id: 'integrations', label: 'Integrations', icon: Plug }] : []),
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
          {organization?.logo_url ? (
            <img 
              src={organization.logo_url} 
              alt={organization.name} 
              style={{ height: '48px', width: 'auto', maxWidth: '160px', objectFit: 'contain', borderRadius: '4px' }} 
            />
          ) : (
            <BookOpen className="logo-icon" size={28} />
          )}

        </button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
          {/* Desktop Navigation */}
          <div className={`nav-scroll-wrapper${navScroll.canLeft ? ' can-scroll-left' : ''}${navScroll.canRight ? ' can-scroll-right' : ''}`}>
            <nav className="nav-links" ref={initNavScroll}>
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
          </div>

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

                    {/* Organizations Switcher */}
                    {organizationsList.length > 0 && (
                      <div style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', padding: '0.25rem 1rem 0.5rem' }}>
                          YOUR ORGANIZATIONS
                        </div>
                        <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                          {organizationsList.map((org) => {
                            const isActive = org.id === organization?.id;
                            return (
                              <button
                                key={org.id}
                                onClick={() => {
                                  if (!isActive) onSwitchOrganization(org.id);
                                  setShowProfileMenu(false);
                                }}
                                style={{
                                  width: '100%',
                                  padding: '0.5rem 1rem',
                                  background: isActive ? 'var(--accent-gold-light)' : 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  color: isActive ? 'var(--accent-gold-dark)' : 'var(--text-primary)',
                                  fontSize: '0.82rem',
                                  fontWeight: isActive ? 700 : 500,
                                  textAlign: 'left',
                                }}
                                onMouseEnter={e => {
                                  if (!isActive) e.currentTarget.style.background = 'var(--bg-primary)';
                                }}
                                onMouseLeave={e => {
                                  if (!isActive) e.currentTarget.style.background = 'none';
                                }}
                              >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {org.name}
                                </span>
                                {isActive && <span style={{ fontSize: '0.75rem', marginLeft: '0.5rem' }}>●</span>}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          onClick={() => {
                            setShowProfileMenu(false);
                            handleJoinOrgPrompt();
                          }}
                          style={{
                            width: '100%',
                            padding: '0.5rem 1rem',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--accent-gold)',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}
                          onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                          onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                        >
                          + Join Another Org
                        </button>
                      </div>
                    )}
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

      {/* Floating feedback button — visible on every screen except the board itself */}
      {currentTab !== 'feedback' && (
        <FeedbackButton onClick={() => setCurrentTab('feedback')} />
      )}

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
        <p>© {new Date().getFullYear()} {organization?.name || 'Charleston Baptist Church'}. Student Small Groups.</p>
      </footer>
    </div>
  );
}
