import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Search, ShieldCheck, Mail, Clock } from 'lucide-react';
import { ROLES, isAdminRole, isDeveloperRole } from '../lib/roles';
import { contrastTextColor } from '../lib/colorContrast';

const ADMIN_EMAIL = 'markquiambao@gmail.com';

const ROLE_OPTIONS = [
  { value: ROLES.STUDENT, label: 'Member / Student' },
  { value: ROLES.LEADER, label: 'Leader' },
  { value: ROLES.ADMIN, label: 'Pastor / Admin' },
];

// Only developers may grant the developer role.
const DEVELOPER_ROLE_OPTION = { value: ROLES.DEVELOPER, label: 'Developer' };

// Badge backgrounds per role; text color is derived from the background.
// The optional `dark` entry is a brand-tinted dark candidate — the contrast
// helper only uses it when it reads better than light text on that background.
const ROLE_BADGES = {
  developer:      { background: '#312e81' },
  admin:          { background: '#1e3a5f' },
  leader:         { background: '#d1fae5', dark: '#065f46' },
  student_leader: { background: '#d1fae5', dark: '#065f46' },
  parent_leader:  { background: '#ede9fe', dark: '#5b21b6' },
  student:        { background: '#f3f4f6', dark: '#374151' },
};

const ROLE_STYLES = Object.fromEntries(
  Object.entries(ROLE_BADGES).map(([role, { background, dark }]) => [
    role,
    { background, color: contrastTextColor(background, dark ? { dark } : undefined) },
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

export default function AdminPanel({ session, userRole, onRoleChange }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [updatingRole, setUpdatingRole] = useState(null);

  const isAdmin = isAdminRole(userRole);
  const isDeveloper = isDeveloperRole(userRole);
  const roleOptions = isDeveloper ? [...ROLE_OPTIONS, DEVELOPER_ROLE_OPTION] : ROLE_OPTIONS;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setError('Could not load users. Make sure the profiles table and RLS policies are set up. See setup instructions below.');
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    // Admin users are hydrated from Supabase when the admin panel opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers();
  }, [fetchUsers, isAdmin]);

  const handleRoleChange = async (userId, newRole) => {
    setUpdatingRole(userId);
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    if (session?.user?.id === userId) onRoleChange?.();
    setUpdatingRole(null);
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

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return (
      (u.email || '').toLowerCase().includes(q) ||
      (u.full_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
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
            All accounts that have signed up to the CB Students Portal
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

      {/* Error / Setup Instructions */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
          <p style={{ color: '#dc2626', fontWeight: 700, margin: '0 0 0.75rem' }}>⚠️ {error}</p>
          <p style={{ color: '#7f1d1d', fontSize: '0.9rem', margin: '0 0 0.5rem' }}>Run this SQL in your Supabase SQL Editor to set up the profiles table:</p>
          <pre style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.75rem', fontSize: '0.75rem', overflowX: 'auto', margin: 0 }}>
{`CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT, full_name TEXT, avatar_url TEXT, provider TEXT,
  role TEXT NOT NULL DEFAULT 'student',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- If the table already exists, add the role column:
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student';
-- Seed the admin role:
UPDATE profiles SET role = 'admin' WHERE email = '${ADMIN_EMAIL}';
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admin view all" ON profiles FOR SELECT USING (auth.jwt() ->> 'email' = '${ADMIN_EMAIL}');
CREATE POLICY "Admin update roles" ON profiles FOR UPDATE USING (auth.jwt() ->> 'email' = '${ADMIN_EMAIL}');
CREATE POLICY "System upsert" ON profiles FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, provider, created_at)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url', NEW.raw_app_meta_data->>'provider', NEW.created_at)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url), provider = COALESCE(EXCLUDED.provider, profiles.provider);
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id, email, full_name, avatar_url, provider, created_at)
SELECT id, email,
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email,'@',1)),
  raw_user_meta_data->>'avatar_url', raw_app_meta_data->>'provider', created_at
FROM auth.users ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;`}
          </pre>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Loading users…
        </div>
      )}

      {/* Users Table */}
      {!loading && !error && (
        <>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              {search ? 'No users match your search.' : 'No users found. Make sure the profiles table is set up.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filtered.map((user) => (
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
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem', minWidth: '140px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Role</span>
                    <select
                      value={roleOptions.some(opt => opt.value === user.role) ? user.role : (user.role || ROLES.STUDENT)}
                      disabled={updatingRole === user.id}
                      onChange={e => handleRoleChange(user.id, e.target.value)}
                      style={{
                        fontSize: '0.8rem', padding: '0.25rem 0.5rem', borderRadius: '8px',
                        border: '1px solid var(--border-color)', cursor: 'pointer',
                        ...ROLE_STYLES[user.role || 'student'],
                        opacity: updatingRole === user.id ? 0.5 : 1,
                      }}
                    >
                      {roleOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                      {user.role && !roleOptions.some(opt => opt.value === user.role) && LEGACY_ROLE_LABELS[user.role] && (
                        <option value={user.role}>{LEGACY_ROLE_LABELS[user.role]}</option>
                      )}
                    </select>
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
    </div>
  );
}
