import { useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Layout.css';
import {
  Calendar, BookOpen, BookOpenCheck, Shield, Plug, ShieldCheck,
  LogOut, Mic2, Mail, Menu, X, Home, Code2, ChevronDown, MessageCircleQuestion, MessageCircle,
  Pencil, Check, Camera, Loader2, MessageSquarePlus, Users, FileText, Bell, Star,
} from 'lucide-react';
import SermonTakeawayButton from './SermonTakeawayButton';
import { canAccessLeaderTools, isAdminRole, isDeveloperRole } from '../lib/roles';
import { supabase } from '../lib/supabaseClient';
import { compressImage } from '../lib/imageCompression';
import FeedbackButton from './FeedbackButton';
import JoinOrgModal from './JoinOrgModal';

const PRIMARY_TABS = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/calendar', label: 'Calendar', icon: Calendar },
  { path: '/fellowship', label: 'Fellowship', icon: Users },
  { path: '/chat', label: 'Chat', icon: MessageCircle },
];

export default function Layout({ onSignOut, userRole, session, userProfile, organization, organizationsList = [], primaryOrgId, onSwitchOrganization, onSetPrimaryOrganization, onJoinOrganization, onUpdateDisplayName, onUpdateAvatar, unreadMentions = 0, chatUnreadTotal = unreadMentions, chatGlow = false, actualUserRole, onDevRoleOverride, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = isAdminRole(userRole) || isAdminRole(actualUserRole);
  const isLeader = canAccessLeaderTools(userRole);
  const isDev = isDeveloperRole(actualUserRole);
  const [drawerOpen, setDrawerOpen] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1025px)').matches);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showJoinOrgModal, setShowJoinOrgModal] = useState(false);
  const [drawerOrgOpen, setDrawerOrgOpen] = useState(false);
  const [drawerProfileOpen, setDrawerProfileOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [primarySavingOrgId, setPrimarySavingOrgId] = useState(null);
  const [primaryOrgError, setPrimaryOrgError] = useState('');

  const drawerNavItems = [
    { path: '/studies', label: 'Bible Study', icon: BookOpen },
    { path: '/reading-plans', label: 'Reading Plan', icon: BookOpenCheck },
    { path: '/sermons', label: 'Sermons', icon: Mic2 },
    { path: '/discipleship', label: 'Discipleship', icon: Mail },
    { path: '/qa', label: 'Q&R', icon: MessageCircleQuestion },
    { path: '/forms', label: 'Forms', icon: FileText },
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
  const displayName = userProfile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';
  const avatarUrl = userProfile?.avatar_url || user?.user_metadata?.avatar_url;
  const initials = displayName.trim().split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const logoImg = organization?.logo_url;
  const orgName = organization?.name || 'Student/Member Portal';
  const effectivePrimaryOrgId = primaryOrgId || organization?.id;

  const startNameEdit = () => {
    setNameDraft(displayName);
    setNameError('');
    setIsEditingName(true);
  };

  const cancelNameEdit = () => {
    setNameDraft('');
    setNameError('');
    setIsEditingName(false);
  };

  const saveNameEdit = async (event) => {
    event.preventDefault();
    if (!onUpdateDisplayName) return;

    const nextName = nameDraft.trim().replace(/\s+/g, ' ');
    if (!nextName) {
      setNameError('Username cannot be blank.');
      return;
    }

    setNameSaving(true);
    setNameError('');
    try {
      await onUpdateDisplayName(nextName);
      setIsEditingName(false);
      setNameDraft('');
    } catch (err) {
      setNameError(err.message || 'Could not update username.');
    } finally {
      setNameSaving(false);
    }
  };

  const avatarInputRef = useRef(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const handleAvatarPick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-picking the same file
    if (!file || !onUpdateAvatar || !user?.id) return;

    setAvatarUploading(true);
    setAvatarError('');
    try {
      const compressed = await compressImage(file, { maxDimension: 512 });
      const ext = (compressed.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      // Stable-ish unique path per upload; cache-busted by the timestamp.
      const path = `${user.id}/avatar_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, compressed, { contentType: compressed.type, upsert: true });
      if (upErr) throw upErr;
      const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      await onUpdateAvatar(url);
    } catch (err) {
      setAvatarError(err.message || 'Could not update photo.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const triggerAvatarPick = () => {
    setAvatarError('');
    avatarInputRef.current?.click();
  };

  const handleSetPrimary = async (orgId) => {
    if (!onSetPrimaryOrganization || orgId === effectivePrimaryOrgId) return;
    setPrimarySavingOrgId(orgId);
    setPrimaryOrgError('');
    try {
      await onSetPrimaryOrganization(orgId);
    } catch (err) {
      setPrimaryOrgError(err.message || 'Could not update primary organization.');
    } finally {
      setPrimarySavingOrgId(null);
    }
  };

  const renderChangePhotoItem = (className) => (
    <button type="button" className={className} onClick={triggerAvatarPick} disabled={avatarUploading}>
      {avatarUploading ? <Loader2 size={16} className="spin" /> : <Camera size={16} />}
      {avatarUploading ? 'Uploading…' : 'Change Photo'}
    </button>
  );

  const renderNameEditor = () => (
    <form className="profile-name-editor" onSubmit={saveNameEdit}>
      <label>
        <span>Username</span>
        <input
          type="text"
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          maxLength={80}
          autoFocus
        />
      </label>
      {nameError && <p className="profile-name-error">{nameError}</p>}
      <div className="profile-name-actions">
        <button type="button" className="profile-name-icon-btn" onClick={cancelNameEdit} disabled={nameSaving} title="Cancel">
          <X size={15} />
        </button>
        <button type="submit" className="profile-name-icon-btn primary" disabled={nameSaving || !nameDraft.trim()} title="Save username">
          <Check size={15} />
        </button>
      </div>
    </form>
  );

  const renderOrgRows = ({ rowClassName, itemClassName, primaryClassName, activeMarkClassName, closeMenu }) => (
    <>
      {organizationsList.map((org) => {
        const isActive = org.id === organization?.id;
        const isPrimary = org.id === effectivePrimaryOrgId;
        const isSavingPrimary = org.id === primarySavingOrgId;
        return (
          <div key={org.id} className={rowClassName}>
            <button
              type="button"
              className={`${itemClassName}${isActive ? ' active' : ''}`}
              onClick={() => {
                if (!isActive) onSwitchOrganization(org.id);
                closeMenu?.();
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {org.name}
              </span>
              {isActive && <span className={activeMarkClassName}>●</span>}
            </button>
            {onSetPrimaryOrganization && (
              <button
                type="button"
                className={`${primaryClassName}${isPrimary ? ' active' : ''}`}
                onClick={() => handleSetPrimary(org.id)}
                disabled={isSavingPrimary || isPrimary}
                aria-label={isPrimary ? `${org.name} is your primary organization` : `Make ${org.name} primary`}
                aria-pressed={isPrimary}
                title={isPrimary ? 'Primary organization' : 'Make primary organization'}
              >
                {isSavingPrimary ? <Loader2 size={15} className="spin" /> : <Star size={15} fill={isPrimary ? 'currentColor' : 'none'} />}
              </button>
            )}
          </div>
        );
      })}
      {primaryOrgError && <p className="profile-org-error">{primaryOrgError}</p>}
    </>
  );

  return (
    <div className="layout-container">
      {/* Hidden input shared by both profile menus' "Change Photo" action */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleAvatarPick}
      />
      {/* Drawer Overlay (Backdrop for closing when tapping outside) */}
      {drawerOpen && (
        <div
          className="drawer-overlay"
          onClick={closeDrawer}
          data-testid="drawer-overlay"
        />
      )}
      {/* Drawer (full-height push sidebar) */}
      <nav className={`drawer${drawerOpen ? ' open' : ''}`} aria-label="Main navigation">
        <div className="drawer-header">
          <button
            className="drawer-logo-btn"
            onClick={() => navigateTo('/')}
            aria-label="Go to home"
          >
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
          </button>
          <button className="drawer-close" onClick={closeDrawer} aria-label="Close menu">
            <X size={22} />
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
                {renderOrgRows({
                  rowClassName: 'drawer-org-row',
                  itemClassName: 'drawer-org-item',
                  primaryClassName: 'drawer-org-primary-btn',
                  activeMarkClassName: 'drawer-org-active-mark',
                  closeMenu: () => setDrawerOrgOpen(false),
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
                className={`drawer-nav-item${currentPath === item.path ? ' active' : ''}${item.path === '/chat' && chatGlow ? ' glow' : ''}`}
                onClick={() => navigateTo(item.path)}
              >
                <Icon size={18} />
                {item.label}
                {item.path === '/chat' && chatUnreadTotal > 0 && (
                  <span className="drawer-nav-badge">{chatUnreadTotal > 99 ? '99+' : chatUnreadTotal}</span>
                )}
                {item.path === '/chat' && chatGlow && chatUnreadTotal === 0 && (
                  <span className="drawer-nav-dot" aria-label="Unseen messages" />
                )}
              </button>
            );
          })}
        </div>

        <div className="drawer-footer">
          {currentPath !== '/feedback' && (
            <button
              className="drawer-nav-item drawer-feedback-item"
              onClick={() => navigateTo('/feedback')}
            >
              <MessageSquarePlus size={18} />
              Feedback
            </button>
          )}
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
                  {isEditingName ? renderNameEditor() : onUpdateDisplayName && (
                    <button
                      className="drawer-profile-popover-item"
                      onClick={startNameEdit}
                    >
                      <Pencil size={16} />
                      Edit Username
                    </button>
                  )}
                  {!isEditingName && onUpdateAvatar && renderChangePhotoItem('drawer-profile-popover-item')}
                  {avatarError && <p className="profile-name-error" style={{ padding: '0 0.75rem' }}>{avatarError}</p>}
                  {actualUserRole === 'developer' && (
                    <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                        Dev Role Override
                      </span>
                      <select
                        value={userRole}
                        onChange={(e) => {
                          onDevRoleOverride(e.target.value);
                          setDrawerProfileOpen(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '0.35rem 0.5rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-secondary)',
                          color: 'var(--accent-gold)',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <option value="developer">Developer</option>
                        <option value="admin">Pastor / Admin</option>
                        <option value="leader">Leader</option>
                        <option value="student_leader">Student Leader</option>
                        <option value="parent_leader">Parent Leader</option>
                        <option value="student">Student/Member</option>
                      </select>
                    </div>
                  )}
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
            <button className="hamburger-btn" onClick={() => drawerOpen ? closeDrawer() : setDrawerOpen(true)} aria-label="Toggle menu">
              <Menu size={20} />
              {chatGlow && <span className="hamburger-dot" aria-label="Unseen chat activity" />}
            </button>
            {organization?.logo_url && (
              <img src={organization.logo_url} alt="" className="topbar-logo" onClick={() => navigate('/')} />
            )}
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
          <button
            className="topbar-scripture-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('scripture:toggle'))}
            aria-label="Scripture Lookup"
          >
            <BookOpen size={20} />
          </button>
          {session && organization && (
            <SermonTakeawayButton
              session={session}
              activeOrgId={organization.id}
              inline
              className="topbar-scripture-btn"
            />
          )}
          <button
            className={`topbar-chat-btn${chatGlow ? ' glow' : ''}${currentPath === '/chat' ? ' active' : ''}`}
            onClick={() => navigate('/chat')}
            aria-label="Notifications"
          >
            <Bell size={20} />
            {chatUnreadTotal > 0 && (
              <span className="topbar-chat-badge">{chatUnreadTotal > 99 ? '99+' : chatUnreadTotal}</span>
            )}
            {chatGlow && chatUnreadTotal === 0 && (
              <span className="topbar-chat-dot" />
            )}
          </button>
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
                    {isEditingName ? renderNameEditor() : onUpdateDisplayName && (
                      <button
                        onClick={startNameEdit}
                        className="profile-edit-name-btn"
                      >
                        <Pencil size={15} />
                        Edit Username
                      </button>
                    )}
                    {!isEditingName && onUpdateAvatar && renderChangePhotoItem('profile-edit-name-btn')}
                    {avatarError && <p className="profile-name-error" style={{ padding: '0 1rem 0.5rem' }}>{avatarError}</p>}
                    {organizationsList.length > 0 && (
                      <div className="profile-org-section">
                        <div className="profile-org-label">Your Organizations</div>
                        {renderOrgRows({
                          rowClassName: 'profile-org-row',
                          itemClassName: 'profile-org-item',
                          primaryClassName: 'profile-org-primary-btn',
                          activeMarkClassName: 'profile-org-active-mark',
                          closeMenu: () => setShowProfileMenu(false),
                        })}
                        <button
                          className="profile-join-btn"
                          onClick={() => { setShowProfileMenu(false); setShowJoinOrgModal(true); }}
                        >
                          + Join Another Org
                        </button>
                      </div>
                    )}
                    {actualUserRole === 'developer' && (
                      <div className="profile-org-section" style={{ borderTop: '1px solid var(--border-color)', padding: '0.5rem 0' }}>
                        <div className="profile-org-label">Dev Role Override</div>
                        <div style={{ padding: '0.25rem 1rem 0.5rem' }}>
                          <select
                            value={userRole}
                            onChange={(e) => {
                              onDevRoleOverride(e.target.value);
                              setShowProfileMenu(false);
                            }}
                            className="role-select"
                            style={{
                              width: '100%',
                              padding: '0.4rem 0.5rem',
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)',
                              backgroundColor: 'var(--bg-secondary)',
                              color: 'var(--accent-gold)',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            <option value="developer">Developer</option>
                            <option value="admin">Pastor / Admin</option>
                            <option value="leader">Leader</option>
                            <option value="student_leader">Student Leader</option>
                            <option value="parent_leader">Parent Leader</option>
                            <option value="student">Student/Member</option>
                          </select>
                        </div>
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

        <main className={`layout-main animate-fade-in${currentPath === '/calendar' ? ' layout-main--wide' : ''}${currentPath === '/chat' ? ' layout-main--chat' : ''}`}>
          {children}
        </main>

        {currentPath !== '/feedback' && (
          <FeedbackButton onClick={() => navigate('/feedback')} />
        )}

        <footer className="layout-footer">
          <p>© {new Date().getFullYear()} {organization?.name || 'Charleston Baptist Church'}. Student/Member Small Groups.</p>
        </footer>

        {/* Bottom tabs for tablet / mobile */}
        <nav className="bottom-tabs" aria-label="Primary navigation">
          {PRIMARY_TABS.map((t) => {
            const Icon = t.icon;
            const isChat = t.path === '/chat';
            return (
              <button
                key={t.path}
                className={`bottom-tab${currentPath === t.path ? ' active' : ''}${isChat && chatGlow ? ' glow' : ''}`}
                onClick={() => navigate(t.path)}
              >
                <span className="bottom-tab-icon">
                  <Icon size={20} />
                  {isChat && chatUnreadTotal > 0 && (
                    <span className="bottom-tab-badge">{chatUnreadTotal > 99 ? '99+' : chatUnreadTotal}</span>
                  )}
                  {isChat && chatGlow && chatUnreadTotal === 0 && (
                    <span className="bottom-tab-dot" />
                  )}
                </span>
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
