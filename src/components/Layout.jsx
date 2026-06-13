import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Layout.css';
import {
  Calendar, BookOpen, MessageSquare, Shield, Plug, ShieldCheck,
  LogOut, Mic2, Mail, Menu, X, Home, Code2, ChevronDown, MessageCircleQuestion, MessagesSquare,
} from 'lucide-react';
import { canAccessLeaderTools, isAdminRole, isDeveloperRole } from '../lib/roles';
import FeedbackButton from './FeedbackButton';
import JoinOrgModal from './JoinOrgModal';

const PRIMARY_TABS = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/calendar', label: 'Calendar', icon: Calendar },
  { path: '/fellowship', label: 'Fellowship', icon: MessageSquare },
];

export default function Layout({ onSignOut, userRole, session, organization, organizationsList = [], onSwitchOrganization, onJoinOrganization, unreadMentions = 0, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = isAdminRole(userRole);
  const isLeader = canAccessLeaderTools(userRole);
  const isDev = isDeveloperRole(userRole);
  const [drawerOpen, setDrawerOpen] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1025px)').matches);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showJoinOrgModal, setShowJoinOrgModal] = useState(false);
  const [drawerOrgOpen, setDrawerOrgOpen] = useState(false);
  const [drawerProfileOpen, setDrawerProfileOpen] = useState(false);

  const drawerNavItems = [
    { path: '/studies', label: 'Bible Study', icon: BookOpen },
    { path: '/sermons', label: 'Sermons', icon: Mic2 },
    { path: '/discipleship', label: 'Discipleship', icon: Mail },
    { path: '/qa', label: 'Q&R', icon: MessageCircleQuestion },
    { path: '/chat', label: 'Chat', icon: MessagesSquare },
    ...(isLeader ? [{ path: '/integrations', label: 'Integrations', icon: Plug }] : []),
    ...(isLeader ? [{ path: '/leader-portal', label: 'Leader Portal', icon: Shield }] : []),
    ...(isAdmin ? [{ path: '/admin', label: 'Admin', icon: ShieldCheck }] : []),
  ];

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerOrgOpen(false);
    setDrawerProfileOpen(false);
  };

  const navigateTo = (path) => {
    navigate(path);
    // On mobile/tablet the drawer is an overlay — auto-hide it after a selection.
    // On desktop (>= 1025px) it's a persistent sidebar, so leave it open.
    const isDesktop = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(min-width: 1025px)').matches;
    if (!isDesktop) {
      closeDrawer();
    }
  };

  const currentPath = location.pathname;

  const user = session?.user;
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';
  const avatarUrl = user?.user_metadata?.avatar_url;
  const initials = displayName.trim().split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const logoImg = organization?.logo_url;
  const orgName = organization?.name || 'Students Portal';

  return (
    <div className="layout-container">
      {/* Drawer (full-height push sidebar) */}
      <nav className={`drawer${drawerOpen ? ' open' : ''}`} aria-label="Main navigation">
        <div className="drawer-header">
          {logoImg ? (
            <div className="drawer-logo">
              <img src={logoImg} alt={orgName} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BookOpen size={24} style={{ color: 'var(--accent-gold)' }} />
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{orgName}</span>
            </div>
          )}
          <button className="drawer-close" onClick={closeDrawer} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        {/* Org switcher — mobile only, under logo */}
        {organizationsList.length > 0 && (
          <div className="drawer-mobile-only drawer-org-switcher">
            <div className="drawer-org-label">Organization</div>
            <button className="drawer-org-trigger" onClick={() => setDrawerOrgOpen(v => !v)}>
              <span className="drawer-org-current">{orgName}</span>
              <ChevronDown size={16} className={`drawer-org-chevron${drawerOrgOpen ? ' open' : ''}`} />
            </button>
            {drawerOrgOpen && (
              <>
              <div className="drawer-org-backdrop" onClick={() => setDrawerOrgOpen(false)} />
              <div className="drawer-org-list">
                {organizationsList.map((org) => {
                  const isActive = org.id === organization?.id;
                  return (
                    <button
                      key={org.id}
                      className={`drawer-org-item${isActive ? ' active' : ''}`}
                      onClick={() => {
                        if (!isActive) onSwitchOrganization(org.id);
                        setDrawerOrgOpen(false);
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {org.name}
                      </span>
                      {isActive && <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)' }}>●</span>}
                    </button>
                  );
                })}
                <button
                  className="drawer-join-btn"
                  onClick={() => { closeDrawer(); setShowJoinOrgModal(true); }}
                >
                  + Join Another Org
                </button>
              </div>
              </>
            )}
          </div>
        )}

        <div className="drawer-body">
          <div className="drawer-section-label">Navigate</div>
          {drawerNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                className={`drawer-nav-item${currentPath === item.path ? ' active' : ''}`}
                onClick={() => navigateTo(item.path)}
              >
                <Icon size={18} />
                {item.label}
                {item.path === '/chat' && unreadMentions > 0 && (
                  <span className="drawer-nav-badge">{unreadMentions > 99 ? '99+' : unreadMentions}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="drawer-footer">
          {/* Sign Out — desktop/tablet only */}
          {onSignOut && (
            <button className="drawer-signout drawer-desktop-only" onClick={() => { closeDrawer(); onSignOut(); }}>
              <LogOut size={16} />
              Sign Out
            </button>
          )}

          {/* Profile bar — mobile only, clickable with popover */}
          <div className="drawer-mobile-only drawer-profile-wrapper">
            <button className="drawer-profile-bar" onClick={() => setDrawerProfileOpen(v => !v)}>
              <div className="drawer-profile-avatar" style={{
                background: 'linear-gradient(135deg, var(--navy-primary), var(--navy-light))',
              }}>
                {avatarUrl
                  ? <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials}
              </div>
              <div className="drawer-profile-info">
                <div className="drawer-profile-name">{displayName}</div>
                <div className="drawer-profile-email">{user?.email}</div>
              </div>
            </button>
            {drawerProfileOpen && (
              <>
                <div className="drawer-profile-backdrop" onClick={() => setDrawerProfileOpen(false)} />
                <div className="drawer-profile-popover">
                  {isDev && (
                    <button
                      className="drawer-profile-popover-item drawer-profile-popover-item--dev"
                      onClick={() => { closeDrawer(); navigate('/devtools'); }}
                    >
                      <Code2 size={16} />
                      DevTools
                    </button>
                  )}
                  {onSignOut && (
                    <button
                      className="drawer-profile-popover-item drawer-profile-popover-item--danger"
                      onClick={() => { closeDrawer(); onSignOut(); }}
                    >
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Right side: topbar + content */}
      <div className="layout-content-area">
        {/* Top Bar */}
        <div className="layout-topbar">
          <div className="topbar-left">
            <button className="hamburger-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
          </div>

          {/* Primary Tabs (desktop) */}
          <div className="primary-tabs">
            {PRIMARY_TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.path}
                  className={`primary-tab${currentPath === t.path ? ' active' : ''}`}
                  onClick={() => navigate(t.path)}
                >
                  <Icon size={16} />
                  <span className="tab-label">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Centered logo (tablet / mobile — replaces tabs) */}
          {logoImg && (
            <button className="topbar-center-logo" onClick={() => navigate('/')}>
              <img src={logoImg} alt={orgName} />
            </button>
          )}

          {/* Profile */}
          <div className="topbar-right">
          {onSignOut && (
            <div style={{ position: 'relative' }}>
              <button
                className="profile-trigger"
                onClick={() => setShowProfileMenu(v => !v)}
                aria-label={displayName}
              >
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                  overflow: 'hidden', background: 'linear-gradient(135deg, var(--navy-primary), var(--navy-light))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.8rem', fontWeight: 700, color: 'white',
                }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : initials}
                </div>
              </button>

              {showProfileMenu && (
                <>
                  <div onClick={() => setShowProfileMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                  <div style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 11,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                    borderRadius: '12px', boxShadow: 'var(--shadow-lg)', minWidth: '220px', overflow: 'hidden',
                  }}>
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
                    {organizationsList.length > 0 && (
                      <div className="profile-org-section">
                        <div className="profile-org-label">Your Organizations</div>
                        {organizationsList.map((org) => {
                          const isActive = org.id === organization?.id;
                          return (
                            <button
                              key={org.id}
                              className={`profile-org-item${isActive ? ' active' : ''}`}
                              onClick={() => {
                                if (!isActive) onSwitchOrganization(org.id);
                                setShowProfileMenu(false);
                              }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {org.name}
                              </span>
                              {isActive && <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)' }}>●</span>}
                            </button>
                          );
                        })}
                        <button
                          className="profile-join-btn"
                          onClick={() => { setShowProfileMenu(false); setShowJoinOrgModal(true); }}
                        >
                          + Join Another Org
                        </button>
                      </div>
                    )}
                    {isDev && (
                      <button
                        onClick={() => { setShowProfileMenu(false); navigate('/devtools'); }}
                        className="profile-devtools-btn"
                      >
                        <Code2 size={15} />
                        DevTools
                      </button>
                    )}
                    <button
                      onClick={() => { setShowProfileMenu(false); onSignOut(); }}
                      className="drawer-signout"
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
        </div>

        <main className="layout-main animate-fade-in">
          {children}
        </main>

        {currentPath !== '/feedback' && (
          <FeedbackButton onClick={() => navigate('/feedback')} />
        )}

        <footer className="layout-footer">
          <p>© {new Date().getFullYear()} {organization?.name || 'Charleston Baptist Church'}. Student Small Groups.</p>
        </footer>

        {/* Bottom tabs for tablet / mobile */}
        <nav className="bottom-tabs" aria-label="Primary navigation">
          {PRIMARY_TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.path}
                className={`bottom-tab${currentPath === t.path ? ' active' : ''}`}
                onClick={() => navigate(t.path)}
              >
                <Icon size={20} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {showJoinOrgModal && (
        <JoinOrgModal
          onJoin={onJoinOrganization}
          onClose={() => setShowJoinOrgModal(false)}
        />
      )}
    </div>
  );
}
