import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Search, ShieldCheck, Mail, Clock, Building, Plus, Upload, Palette, ExternalLink, Edit } from 'lucide-react';
import { ROLES, isAdminRole, isDeveloperRole } from '../lib/roles';
import { contrastTextColor } from '../lib/colorContrast';
import Select from './ui/Select';
import './AdminPanel.css';

const ADMIN_EMAIL = 'markquiambao@gmail.com';

const ROLE_OPTIONS = [
  { value: ROLES.STUDENT, label: 'Member / Student' },
  { value: ROLES.LEADER, label: 'Leader' },
  { value: ROLES.ADMIN, label: 'Pastor / Admin' },
];

const DEVELOPER_ROLE_OPTION = { value: ROLES.DEVELOPER, label: 'Developer' };

const DEVELOPER_BG = 'var(--developer-bg)';
const DEVELOPER_TEXT = 'var(--developer-text)';

const ROLE_BADGES = {
  developer:      { background: '#111111', forcedColor: '#ffffff' },
  admin:          { background: '#1e3a5f' },
  leader:         { background: '#d1fae5', dark: '#065f46' },
  student_leader: { background: '#d1fae5', dark: '#065f46' },
  parent_leader:  { background: '#ede9fe', dark: '#5b21b6' },
  student:        { background: '#f3f4f6', dark: '#374151' },
};

const ROLE_STYLES = Object.fromEntries(
  Object.entries(ROLE_BADGES).map(([role, { background, dark, forcedColor }]) => [
    role,
    forcedColor
      ? { background: DEVELOPER_BG, color: DEVELOPER_TEXT }
      : { background, color: contrastTextColor(background, dark ? { dark } : undefined) },
  ])
);

const LEGACY_ROLE_LABELS = {
  student_leader: 'Student Leader',
  parent_leader: 'Parent Leader',
  developer: 'Developer',
};

function getAccountAge(createdAt) {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now - created;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day old';
  if (diffDays < 30) return `${diffDays} days old`;
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? 's' : ''} old`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years} year${years > 1 ? 's' : ''} old`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getInitials(name, email) {
  if (name && name.trim()) {
    return name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
  return (email || '?')[0].toUpperCase();
}

export default function AdminPanel({ session, userRole, onRoleChange, onSwitchOrganization, activeOrgId }) {
  // Tab states
  const [activeTab, setActiveTab] = useState('users');

  // Users tab states
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [search, setSearch] = useState('');
  const [updatingRole, setUpdatingRole] = useState(null);
  const [movingUser, setMovingUser] = useState(null);
  const [moveNotice, setMoveNotice] = useState('');

  // Organizations tab states
  const [organizations, setOrganizations] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgsError, setOrgsError] = useState('');
  const [orgFormOpen, setOrgFormOpen] = useState(false);

  // Create Org Form states
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [orgInviteCode, setOrgInviteCode] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#2e52be');
  const [secondaryColor, setSecondaryColor] = useState('#ffffff');
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [submittingOrg, setSubmittingOrg] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);

  const isAdmin = isAdminRole(userRole);
  const isDeveloper = isDeveloperRole(userRole);
  const roleOptions = isDeveloper ? [...ROLE_OPTIONS, DEVELOPER_ROLE_OPTION] : ROLE_OPTIONS;

  const fetchUsers = useCallback(async () => {
    if (!activeOrgId) return;
    setUsersLoading(true);
    setUsersError('');
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('active_organization_id', activeOrgId)
      .order('created_at', { ascending: false });

    if (error) {
      setUsersError('Could not load users. Make sure the profiles table and RLS policies are set up.');
    } else {
      setUsers(data || []);
    }
    setUsersLoading(false);
  }, [activeOrgId]);

  const fetchOrganizations = useCallback(async () => {
    setOrgsLoading(true);
    setOrgsError('');
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      setOrgsError('Could not load organizations. Make sure your RLS policies are correct.');
    } else {
      setOrganizations(data || []);
    }
    setOrgsLoading(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = setTimeout(() => {
      if (activeTab === 'users') {
        fetchUsers();
        fetchOrganizations(); // needed to populate the per-user "move to org" selector
      } else if (activeTab === 'organizations') {
        fetchOrganizations();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [activeTab, fetchUsers, fetchOrganizations, isAdmin]);

  const handleRoleChange = async (userId, newRole) => {
    setUpdatingRole(userId);
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    if (session?.user?.id === userId) onRoleChange?.();
    setUpdatingRole(null);
  };

  const handleMoveUser = async (userId, newOrgId) => {
    if (!newOrgId || newOrgId === activeOrgId) return;
    setMovingUser(userId);
    setUsersError('');
    setMoveNotice('');
    const movedUser = users.find(u => u.id === userId);
    const targetOrg = organizations.find(o => o.id === newOrgId);
    const { error } = await supabase.rpc('admin_move_user_to_organization', {
      target_user: userId,
      target_org: newOrgId,
    });
    if (error) {
      setUsersError(error.message || 'Could not move user to that organization.');
    } else {
      // The user no longer belongs to the active org, so drop them from this list.
      setUsers(prev => prev.filter(u => u.id !== userId));
      setMoveNotice(
        `Moved ${movedUser?.full_name || movedUser?.email || 'user'} to ${targetOrg?.name || 'the selected organization'}.`
      );
    }
    setMovingUser(null);
  };

  const handleNameChange = (val) => {
    setOrgName(val);
    setOrgSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    if (!orgInviteCode) {
      const rand = Math.floor(1000 + Math.random() * 9000);
      const prefix = val.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'ORG';
      setOrgInviteCode(`${prefix}-${rand}`);
    }
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleCreateOrgClick = () => {
    setEditingOrg(null);
    setOrgName('');
    setOrgSlug('');
    setOrgInviteCode('');
    setPrimaryColor('#2e52be');
    setSecondaryColor('#ffffff');
    setLogoFile(null);
    setLogoPreview(null);
    setOrgFormOpen(true);
  };

  const handleEditOrgClick = (org) => {
    setEditingOrg(org);
    setOrgName(org.name);
    setOrgSlug(org.slug);
    setOrgInviteCode(org.invite_code);
    setPrimaryColor(org.primary_color || '#2e52be');
    setSecondaryColor(org.secondary_color || '#ffffff');
    setLogoFile(null);
    setLogoPreview(org.logo_url);
    setOrgFormOpen(true);
  };

  const handleCreateOrgSubmit = async (e) => {
    e.preventDefault();
    if (!orgName.trim() || !orgSlug.trim() || !orgInviteCode.trim()) {
      setOrgsError('Please fill out all required fields.');
      return;
    }
    setSubmittingOrg(true);
    setOrgsError('');

    try {
      let logoUrl = editingOrg ? editingOrg.logo_url : null;
      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
        const filePath = `logos/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('organization-logos')
          .upload(filePath, logoFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('organization-logos')
          .getPublicUrl(filePath);

        logoUrl = publicUrl;
      }

      if (editingOrg) {
        const { error: updateError } = await supabase
          .from('organizations')
          .update({
            name: orgName.trim(),
            slug: orgSlug.trim(),
            invite_code: orgInviteCode.trim(),
            logo_url: logoUrl,
            primary_color: primaryColor,
            secondary_color: secondaryColor
          })
          .eq('id', editingOrg.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('organizations')
          .insert({
            name: orgName.trim(),
            slug: orgSlug.trim(),
            invite_code: orgInviteCode.trim(),
            logo_url: logoUrl,
            primary_color: primaryColor,
            secondary_color: secondaryColor
          });

        if (insertError) throw insertError;
      }

      // Reset Form State
      setOrgName('');
      setOrgSlug('');
      setOrgInviteCode('');
      setPrimaryColor('#2e52be');
      setSecondaryColor('#ffffff');
      setLogoFile(null);
      setLogoPreview(null);
      setOrgFormOpen(false);
      const wasEditingActive = editingOrg && editingOrg.id === activeOrgId;
      setEditingOrg(null);
      fetchOrganizations();
      
      if (wasEditingActive) {
        onRoleChange?.(); // Trigger dynamic branding reload in App.jsx
      }
    } catch (err) {
      setOrgsError(err.message || 'Error occurred saving organization.');
    } finally {
      setSubmittingOrg(false);
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1rem' }}>
        <ShieldCheck size={48} style={{ color: 'var(--text-muted)' }} />
        <h2 style={{ color: 'var(--text-primary)' }}>Admin Access Only</h2>
        <p style={{ color: 'var(--text-secondary)' }}>You don't have permission to view this page.</p>
      </div>
    );
  }

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return (
      (u.email || '').toLowerCase().includes(q) ||
      (u.full_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
      
      {/* Tab Selectors */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '2rem'
      }}>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'users' ? '3px solid var(--accent-gold)' : '3px solid transparent',
            color: activeTab === 'users' ? 'var(--accent-gold)' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
            borderRadius: 0,
            transition: 'all 0.15s'
          }}
        >
          Users & Roles
        </button>
        <button
          onClick={() => setActiveTab('organizations')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'organizations' ? '3px solid var(--accent-gold)' : '3px solid transparent',
            color: activeTab === 'organizations' ? 'var(--accent-gold)' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
            borderRadius: 0,
            transition: 'all 0.15s'
          }}
        >
          Organizations
        </button>
      </div>

      {activeTab === 'users' ? (
        <>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--navy-primary), var(--navy-dark))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <ShieldCheck size={24} color="white" />
            </div>
            <div>
              <h1 style={{ margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', fontSize: '1.6rem' }}>
                Admin — Registered Users
              </h1>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                All accounts that have signed up to the portal
              </p>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ background: 'var(--navy-primary)', color: 'white', borderRadius: '20px', padding: '0.3rem 0.9rem', fontSize: '0.85rem', fontWeight: 700 }}>
                {users.length} {users.length === 1 ? 'User' : 'Users'}
              </div>
              <button onClick={fetchUsers} className="btn-secondary" style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem' }}>
                Refresh
              </button>
            </div>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: '1.5rem', maxWidth: '400px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', paddingLeft: '2.4rem', boxSizing: 'border-box' }}
            />
          </div>

          {usersError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '1rem 1.5rem', marginBottom: '1.5rem', color: '#dc2626' }}>
              {usersError}
            </div>
          )}

          {moveNotice && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '1rem 1.5rem', marginBottom: '1.5rem', color: '#15803d' }}>
              {moveNotice}
            </div>
          )}

          {/* Loading */}
          {usersLoading && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              Loading users…
            </div>
          )}

          {/* Users Table */}
          {!usersLoading && !usersError && (
            <>
              {filteredUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  {search ? 'No users match your search.' : 'No users found.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {filteredUsers.map((user) => (
                    <div key={user.id} style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      padding: '1rem 1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      flexWrap: 'wrap',
                      transition: 'box-shadow 0.15s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: '46px', height: '46px', borderRadius: '50%', flexShrink: 0,
                        background: user.avatar_url ? 'transparent' : 'linear-gradient(135deg, var(--navy-primary), var(--navy-light))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1rem', fontWeight: 700, color: 'white', overflow: 'hidden',
                      }}>
                        {user.avatar_url
                          ? <img src={user.avatar_url} alt={user.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : getInitials(user.full_name, user.email)
                        }
                      </div>

                      {/* Name + Email */}
                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem', marginBottom: '0.15rem' }}>
                          {user.full_name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No name</span>}
                          {user.email === ADMIN_EMAIL && (
                            <span style={{ marginLeft: '0.5rem', background: 'var(--navy-primary)', color: 'white', borderRadius: '6px', fontSize: '0.68rem', padding: '0.1rem 0.45rem', fontWeight: 700, verticalAlign: 'middle' }}>
                              ADMIN
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          <Mail size={13} />
                          {user.email}
                        </div>
                      </div>

                      {/* Provider badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {user.provider === 'google' ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '20px', padding: '0.2rem 0.65rem', fontSize: '0.8rem', fontWeight: 600 }}>
                            <svg width="12" height="12" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                            Google
                          </span>
                        ) : (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '20px', padding: '0.2rem 0.65rem', fontSize: '0.8rem', fontWeight: 600 }}>
                            <Mail size={11} /> Email
                          </span>
                        )}
                      </div>

                      {/* Role selector */}
                      <div
                        className="admin-role-select"
                        style={{
                          '--role-bg': ROLE_STYLES[user.role || 'student']?.background,
                          '--role-color': ROLE_STYLES[user.role || 'student']?.color,
                          minWidth: '160px',
                        }}
                      >
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Role</span>
                        <Select
                          value={roleOptions.some(opt => opt.value === user.role) ? user.role : (user.role || ROLES.STUDENT)}
                          disabled={updatingRole === user.id}
                          onValueChange={(value) => handleRoleChange(user.id, value)}
                          options={[
                            ...roleOptions,
                            ...(user.role && !roleOptions.some(opt => opt.value === user.role) && LEGACY_ROLE_LABELS[user.role]
                              ? [{ value: user.role, label: LEGACY_ROLE_LABELS[user.role] }]
                              : []),
                          ]}
                        />
                      </div>

                      {/* Move to organization */}
                      <div style={{ display: 'grid', gap: '0.2rem', minWidth: '170px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Organization</span>
                        <Select
                          value={activeOrgId || ''}
                          disabled={movingUser === user.id || organizations.length === 0}
                          onValueChange={(value) => handleMoveUser(user.id, value)}
                          options={organizations.map(org => ({ value: org.id, label: org.name }))}
                        />
                      </div>

                      {/* Created date + age */}
                      <div style={{ textAlign: 'right', minWidth: '160px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'flex-end', color: 'var(--text-secondary)', fontSize: '0.83rem', marginBottom: '0.2rem' }}>
                          <Clock size={13} />
                          {formatDate(user.created_at)}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                          {getAccountAge(user.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {/* Organizations Tab Content */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--navy-primary), var(--navy-dark))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <Building size={24} color="white" />
            </div>
            <div>
              <h1 style={{ margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', fontSize: '1.6rem' }}>
                Admin — Organizations
              </h1>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Create and manage branding and themes for all tenant organizations
              </p>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                onClick={handleCreateOrgClick}
                className="btn-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.85rem',
                  padding: '0.45rem 1rem'
                }}
              >
                <Plus size={16} />
                Create Org
              </button>
              <button onClick={fetchOrganizations} className="btn-secondary" style={{ fontSize: '0.82rem', padding: '0.45rem 0.75rem' }}>
                Refresh
              </button>
            </div>
          </div>

          {orgsError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '1rem 1.5rem', marginBottom: '1.5rem', color: '#dc2626' }}>
              {orgsError}
            </div>
          )}

          {orgsLoading && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              Loading organizations…
            </div>
          )}

          {!orgsLoading && !orgsError && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
              {organizations.map((org) => (
                <div
                  key={org.id}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '1.5rem',
                    gap: '1.25rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: '60px', height: '60px', borderRadius: '12px',
                      border: '1.5px solid var(--border-color)', overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--bg-tertiary)', flexShrink: 0
                    }}>
                      {org.logo_url ? (
                        <img src={org.logo_url} alt={org.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px', boxSizing: 'border-box' }} />
                      ) : (
                        <Building size={30} style={{ color: 'var(--text-muted)' }} />
                      )}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 'bold' }}>{org.name}</h3>
                      <span className="badge badge-gold" style={{ fontSize: '0.65rem', padding: '0.1rem 0.5rem', marginTop: '0.25rem' }}>
                        slug: {org.slug}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Invite Code:</span>
                      <strong style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{org.invite_code}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Theme Colors:</span>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <div
                          title={`Primary: ${org.primary_color}`}
                          style={{
                            width: '20px', height: '20px', borderRadius: '50%',
                            backgroundColor: org.primary_color,
                            border: '1px solid var(--border-color)'
                          }}
                        />
                        <div
                          title={`Secondary: ${org.secondary_color}`}
                          style={{
                            width: '20px', height: '20px', borderRadius: '50%',
                            backgroundColor: org.secondary_color,
                            border: '1px solid var(--border-color)'
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ 
                    marginTop: '1rem', 
                    paddingTop: '1rem', 
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                  }}>
                    <button
                      onClick={() => handleEditOrgClick(org)}
                      className="btn-secondary"
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.4rem', 
                        fontSize: '0.8rem', 
                        padding: '0.45rem 0.9rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        borderColor: 'var(--accent-gold)',
                        color: 'var(--accent-gold)',
                        marginRight: 'auto'
                      }}
                    >
                      <Edit size={14} />
                      Edit
                    </button>
                    {org.id === activeOrgId ? (
                      <span style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '0.35rem', 
                        fontSize: '0.82rem', 
                        color: 'var(--success-green)', 
                        fontWeight: 700 
                      }}>
                        <ShieldCheck size={16} />
                        Active Workspace
                      </span>
                    ) : (
                      <button
                        onClick={() => onSwitchOrganization?.(org.id)}
                        className="btn-secondary"
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.4rem', 
                          fontSize: '0.8rem', 
                          padding: '0.45rem 0.9rem',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          borderColor: 'var(--accent-gold)',
                          color: 'var(--accent-gold)'
                        }}
                      >
                        <ExternalLink size={14} />
                        Launch App
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Org Creation Modal */}
          {orgFormOpen && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 100,
              backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
              display: 'flex', overflowY: 'auto', padding: '1.5rem 1rem'
            }}>
              <div
                className="card animate-fade-in"
                style={{
                  maxWidth: '480px', width: '100%',
                  backgroundColor: 'var(--bg-secondary)',
                  padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem',
                  boxShadow: 'var(--shadow-lg)',
                  margin: 'auto'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                  <Building size={24} style={{ color: 'var(--accent-gold)' }} />
                  <h2 style={{ margin: 0, border: 0, padding: 0 }}>
                    {editingOrg ? 'Edit Organization' : 'Create Organization'}
                  </h2>
                </div>

                <form onSubmit={handleCreateOrgSubmit} style={{ display: 'grid', gap: '1.25rem' }}>
                  <label style={{ display: 'grid', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>
                    Organization Name *
                    <input
                      type="text"
                      placeholder="e.g. Grace Fellowship"
                      value={orgName}
                      onChange={e => handleNameChange(e.target.value)}
                      required
                    />
                  </label>

                  <label style={{ display: 'grid', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>
                    Slug (URL Identifier) *
                    <input
                      type="text"
                      value={orgSlug}
                      onChange={e => setOrgSlug(e.target.value)}
                      required
                    />
                  </label>

                  <label style={{ display: 'grid', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>
                    Join / Invite Code *
                    <input
                      type="text"
                      value={orgInviteCode}
                      onChange={e => setOrgInviteCode(e.target.value)}
                      required
                    />
                  </label>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <label style={{ flex: 1, display: 'grid', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Palette size={14} />
                        Primary Color
                      </div>
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={e => setPrimaryColor(e.target.value)}
                        style={{ height: '42px', padding: '0.2rem', cursor: 'pointer' }}
                      />
                    </label>

                    <label style={{ flex: 1, display: 'grid', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Palette size={14} />
                        Secondary Color
                      </div>
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={e => setSecondaryColor(e.target.value)}
                        style={{ height: '42px', padding: '0.2rem', cursor: 'pointer' }}
                      />
                    </label>
                  </div>

                  <label style={{ display: 'grid', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>
                    Logo Upload
                    <div style={{
                      border: '2px dashed var(--border-color)', borderRadius: '8px',
                      padding: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center',
                      gap: '0.75rem', cursor: 'pointer', transition: 'border-color 0.15s',
                      position: 'relative'
                    }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-gold)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoChange}
                        style={{
                          position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', zIndex: 2
                        }}
                      />
                      {logoPreview ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', zIndex: 1, width: '100%' }}>
                          <img src={logoPreview} alt="Preview" style={{ maxHeight: '80px', width: 'auto', maxWidth: '100%', objectFit: 'contain', borderRadius: '6px', border: '1px solid var(--border-color)', padding: '4px', backgroundColor: 'var(--bg-primary)' }} />
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{logoFile?.name}</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Click or drag to change logo</span>
                        </div>
                      ) : (
                        <>
                          <Upload size={24} style={{ color: 'var(--text-muted)' }} />
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Click to select a logo image</span>
                        </>
                      )}
                    </div>
                  </label>

                  {orgsError && (
                    <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: 0 }}>{orgsError}</p>
                  )}

                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setOrgFormOpen(false);
                        setLogoPreview(null);
                        setLogoFile(null);
                        setEditingOrg(null);
                      }}
                      className="btn-secondary"
                      style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem' }}
                      disabled={submittingOrg}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                      style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem' }}
                      disabled={submittingOrg}
                    >
                      {submittingOrg ? (editingOrg ? 'Saving...' : 'Creating...') : (editingOrg ? 'Save Changes' : 'Create')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
