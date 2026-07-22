import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import {
  Search,
  ShieldCheck,
  Mail,
  Clock,
  Building,
  Plus,
  Upload,
  Palette,
  ExternalLink,
  Link2,
  Copy,
  Check,
  Edit,
  Trash2,
  MessagesSquare,
  BarChart3,
  Trophy,
  Activity,
  Users,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  MessageCircle,
  HelpCircle,
  BookOpen,
  Heart,
  Calendar,
  FileText,
  UserPlus,
} from 'lucide-react';
import { ROLES, isAdminRole, isDeveloperRole } from '../lib/roles';
import { contrastTextColor } from '../lib/colorContrast';
import Select from './ui/Select';
import DiscordChat from './DiscordChat';
import './AdminPanel.css';

const ADMIN_EMAIL = 'markquiambao@gmail.com';

// Discord/WidgetBot snowflake IDs are 17–20 digit numbers.
const DISCORD_ID_RE = /^\d{17,20}$/;
const isValidDiscordId = (value) => DISCORD_ID_RE.test((value || '').trim());

const ROLE_OPTIONS = [
  { value: ROLES.STUDENT, label: 'Student/Member' },
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

const formatNumber = (value = 0) => new Intl.NumberFormat('en-US').format(Number(value) || 0);

function formatShortDateTime(value) {
  if (!value) return 'No activity yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No activity yet';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateOnly(value) {
  if (!value) return 'Never seen';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Never seen';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRelativeTime(value) {
  if (!value) return 'unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown time';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60 * 1000) return 'just now';
  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatShortDateTime(value);
}

const FEATURE_LABELS = {
  dashboard: 'Dashboard',
  studies: 'Bible Study',
  bible: 'Bible Lookup',
  chat: 'Chat',
  qa: 'Q&A',
  discipleship: 'Discipleship',
  calendar: 'Calendar',
  fellowship: 'Fellowship',
  sermons: 'Sermons',
  feedback: 'Feedback',
  forms: 'Forms',
  integrations: 'Integrations',
  'leader-portal': 'Leader Portal',
  notifications: 'Notifications',
  api: 'External API',
  'api:api-bible': 'Scripture Lookup',
  'api:gemini': 'AI Insights',
  'api:openrouter': 'OpenRouter AI',
  'api:wikidata': 'Wikidata Context',
  'api:huggingface': 'Hugging Face AI',
  'api:groq': 'Groq AI',
  'api:cloudflare-ai': 'Scripture Images',
  'api:youtube': 'BibleProject Search',
  'api:resend': 'Email Notifications',
  'chat:message': 'Chat Messages',
  'chat:reaction': 'Chat Reactions',
  'q-and-a:question': 'Q&A Questions',
  'q-and-a:answer': 'Q&A Answers',
  'q-and-a:vote': 'Q&A Votes',
  'prayer:request': 'Prayer Requests',
  'prayer:amen': 'Prayer Amens',
  'journal:entry': 'Journal Entries',
  'journal:comment': 'Journal Comments',
  'sermon:note': 'Sermon Notes',
  'sermon:feedback-request': 'Feedback Requests',
  'sermon:feedback': 'Sermon Feedback',
  'attendance:session': 'Attendance Sessions',
  'groups:meeting-plan': 'Group Meeting Plans',
};

function featureLabel(feature) {
  return FEATURE_LABELS[feature] || feature?.replace(/[:_-]/g, ' ') || 'Unknown feature';
}

function deltaInfo(current = 0, previous = 0) {
  const value = Number(current) || 0;
  const prev = Number(previous) || 0;
  const diff = value - prev;
  if (diff === 0) return { tone: 'flat', label: 'Even', icon: Minus };
  if (prev === 0) return { tone: diff > 0 ? 'up' : 'down', label: diff > 0 ? 'New' : 'No prior', icon: diff > 0 ? TrendingUp : TrendingDown };
  const percent = Math.round((Math.abs(diff) / prev) * 100);
  return {
    tone: diff > 0 ? 'up' : 'down',
    label: `${diff > 0 ? '+' : '-'}${percent}%`,
    icon: diff > 0 ? TrendingUp : TrendingDown,
  };
}

function MetricDelta({ current, previous }) {
  if (previous === undefined || previous === null) return null;
  const delta = deltaInfo(current, previous);
  const Icon = delta.icon;
  return (
    <small className={`admin-metric-delta ${delta.tone}`}>
      <Icon size={13} />
      {delta.label}
    </small>
  );
}

function ActivitySparkline({ daily }) {
  const points = Array.isArray(daily) ? daily : [];
  if (points.length === 0) return <div className="admin-empty-state">Presence data starts accumulating now.</div>;

  const width = 360;
  const height = 120;
  const padding = 10;
  const chartHeight = height - padding * 2;
  const slotWidth = (width - padding * 2) / points.length;
  const barWidth = Math.max(1, slotWidth - 2);
  const maxActive = Math.max(...points.map((point) => Number(point.activeUsers) || 0), 1);
  const maxEvents = Math.max(...points.map((point) => Number(point.events) || 0), 1);
  const step = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const eventPoints = points.map((point, index) => {
    const x = padding + index * step;
    const y = height - padding - ((Number(point.events) || 0) / maxEvents) * chartHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const totalActive = points.reduce((sum, point) => sum + (Number(point.activeUsers) || 0), 0);
  const totalEvents = points.reduce((sum, point) => sum + (Number(point.events) || 0), 0);

  return (
    <div className="admin-pulse-sparkline">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Activity trend: ${formatNumber(totalActive)} active user-days and ${formatNumber(totalEvents)} content events`}>
        <title>Activity trend</title>
        {points.map((point, index) => {
          const active = Number(point.activeUsers) || 0;
          const x = padding + index * slotWidth + Math.max(0, (slotWidth - barWidth) / 2);
          const barHeight = Math.max(active > 0 ? 4 : 0, (active / maxActive) * chartHeight);
          const y = height - padding - barHeight;
          return (
            <rect
              key={point.day || index}
              x={x.toFixed(1)}
              y={y.toFixed(1)}
              width={barWidth.toFixed(1)}
              height={barHeight.toFixed(1)}
              rx="2"
              className="admin-sparkline-bar"
            />
          );
        })}
        {points.length > 1 && <polyline points={eventPoints} className="admin-sparkline-line" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="admin-sparkline-legend">
        <span><i className="admin-legend-swatch users" /> Active users</span>
        <span><i className="admin-legend-swatch events" /> Content events</span>
      </div>
    </div>
  );
}

function recentActivityVerb(kind) {
  if (kind === 'chat:message') return 'sent a chat message';
  if (kind === 'chat:reaction') return 'reacted in chat';
  if (kind === 'q-and-a:question') return 'asked a question';
  if (kind === 'q-and-a:answer') return 'answered a question';
  if (kind === 'q-and-a:vote') return 'voted in Q&A';
  if (kind === 'prayer:request') return 'shared a prayer request';
  if (kind === 'prayer:amen') return 'prayed along';
  if (kind === 'journal:entry') return 'wrote a journal entry';
  if (kind === 'journal:comment') return 'commented on a journal';
  if (kind?.startsWith('sermon:')) return 'used Sermons';
  if (kind?.startsWith('attendance:') || kind?.startsWith('groups:')) return 'updated leader tools';
  if (kind?.startsWith('api:')) return `used ${featureLabel(kind)}`;
  return `used ${featureLabel(kind)}`;
}

function RecentActivityIcon({ kind }) {
  if (kind?.startsWith('chat:')) return <MessagesSquare size={16} />;
  if (kind?.startsWith('q-and-a:')) return <HelpCircle size={16} />;
  if (kind?.startsWith('prayer:')) return <Heart size={16} />;
  if (kind?.startsWith('journal:')) return <BookOpen size={16} />;
  if (kind?.startsWith('sermon:')) return <FileText size={16} />;
  if (kind?.startsWith('attendance:') || kind?.startsWith('groups:')) return <Calendar size={16} />;
  return <Activity size={16} />;
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
  const [deletingUser, setDeletingUser] = useState(null);
  const [activityMetrics, setActivityMetrics] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [activityWindowDays, setActivityWindowDays] = useState(30);

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
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [discordGuildId, setDiscordGuildId] = useState('');
  const [discordChannelId, setDiscordChannelId] = useState('');
  const [discordPreview, setDiscordPreview] = useState(false);
  const [submittingOrg, setSubmittingOrg] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [copiedOrgId, setCopiedOrgId] = useState(null);

  // Build the magic invite link App.jsx understands (?invite=CODE): it stashes
  // the code so Auth pre-fills it at sign-up and handle_new_user assigns the org.
  const orgInviteLink = (code) =>
    `${window.location.origin}/?invite=${encodeURIComponent(code)}`;

  const copyOrgInviteLink = async (org) => {
    if (!org?.invite_code) return;
    try {
      await navigator.clipboard.writeText(orgInviteLink(org.invite_code));
      setCopiedOrgId(org.id);
      setTimeout(() => setCopiedOrgId((current) => (current === org.id ? null : current)), 2000);
    } catch {
      setOrgsError('Could not copy — long-press the link to copy it manually.');
    }
  };

  const isAdmin = isAdminRole(userRole);
  const isDeveloper = isDeveloperRole(userRole);
  const roleOptions = isDeveloper ? [...ROLE_OPTIONS, DEVELOPER_ROLE_OPTION] : ROLE_OPTIONS;

  const fetchUsers = useCallback(async () => {
    if (!activeOrgId) return;
    setUsersLoading(true);
    setUsersError('');
    const { data, error } = await supabase
      .rpc('org_members', { org_id: activeOrgId })
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

  const fetchActivityMetrics = useCallback(async () => {
    if (!activeOrgId) return;
    setActivityLoading(true);
    setActivityError('');
    const { data, error } = await supabase.rpc('admin_activity_pulse', {
      target_org: activeOrgId,
      window_days: activityWindowDays,
    });
    if (error) {
      setActivityMetrics(null);
      setActivityError(error.message || 'Could not load activity metrics.');
    } else {
      setActivityMetrics(data);
    }
    setActivityLoading(false);
  }, [activeOrgId, activityWindowDays]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = setTimeout(() => {
      if (activeTab === 'users') {
        fetchUsers();
        fetchOrganizations(); // needed to populate the per-user "move to org" selector
      } else if (activeTab === 'organizations') {
        fetchOrganizations();
      } else if (activeTab === 'activity') {
        fetchActivityMetrics();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [activeTab, fetchUsers, fetchOrganizations, fetchActivityMetrics, isAdmin]);

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

  const handleDeleteUser = async (userToDelete) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete the user "${userToDelete.full_name || userToDelete.email}"? This action cannot be undone.`
    );
    if (!confirmDelete) return;

    setDeletingUser(userToDelete.id);
    setUsersError('');
    setMoveNotice('');

    const { error } = await supabase.rpc('admin_delete_user', {
      target_user: userToDelete.id
    });

    if (error) {
      setUsersError(error.message || 'Could not delete user.');
    } else {
      setUsers(prev => prev.filter(u => u.id !== userToDelete.id));
      setMoveNotice(`Successfully deleted user "${userToDelete.full_name || userToDelete.email}".`);
    }
    setDeletingUser(null);
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
    setDiscordEnabled(false);
    setDiscordGuildId('');
    setDiscordChannelId('');
    setDiscordPreview(false);
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
    setDiscordEnabled(Boolean(org.discord_enabled));
    setDiscordGuildId(org.discord_guild_id || '');
    setDiscordChannelId(org.discord_channel_id || '');
    setDiscordPreview(false);
    setOrgFormOpen(true);
  };

  const handleCreateOrgSubmit = async (e) => {
    e.preventDefault();
    if (!orgName.trim() || !orgSlug.trim() || !orgInviteCode.trim()) {
      setOrgsError('Please fill out all required fields.');
      return;
    }
    if (discordEnabled) {
      if (!discordGuildId.trim()) {
        setOrgsError('Enter a Discord Server (Guild) ID, or turn off “Use Discord for chat”.');
        return;
      }
      if (!isValidDiscordId(discordGuildId)) {
        setOrgsError('That Server ID doesn’t look right — it should be a 17–20 digit number copied from Discord.');
        return;
      }
      if (discordChannelId.trim() && !isValidDiscordId(discordChannelId)) {
        setOrgsError('That Channel ID doesn’t look right — it should be a 17–20 digit number, or leave it blank.');
        return;
      }
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
            secondary_color: secondaryColor,
            discord_enabled: discordEnabled,
            discord_guild_id: discordGuildId.trim() || null,
            discord_channel_id: discordChannelId.trim() || null
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
            secondary_color: secondaryColor,
            discord_enabled: discordEnabled,
            discord_guild_id: discordGuildId.trim() || null,
            discord_channel_id: discordChannelId.trim() || null
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
      setDiscordEnabled(false);
      setDiscordGuildId('');
      setDiscordChannelId('');
      setDiscordPreview(false);
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
  const activityTotals = activityMetrics?.totals || {};
  const activityModules = [...(activityMetrics?.modules || [])]
    .sort((a, b) => (
      (Number(b.users) || 0) - (Number(a.users) || 0)
      || ((Number(b.visits) || 0) + (Number(b.events) || 0)) - ((Number(a.visits) || 0) + (Number(a.events) || 0))
      || featureLabel(a.feature).localeCompare(featureLabel(b.feature))
    ));
  const maxModuleUsers = Math.max(...activityModules.map((module) => Number(module.users) || 0), 1);
  const hasPresenceData = Number(activityTotals.presenceRows || 0) > 0;

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
        <button
          onClick={() => setActiveTab('activity')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'activity' ? '3px solid var(--accent-gold)' : '3px solid transparent',
            color: activeTab === 'activity' ? 'var(--accent-gold)' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
            borderRadius: 0,
            transition: 'all 0.15s'
          }}
        >
          Activity Metrics
        </button>
      </div>

      {activeTab === 'users' && (
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

                      {/* Actions (Delete) */}
                      {user.id !== session?.user?.id && (
                        <button
                          onClick={() => handleDeleteUser(user)}
                          disabled={deletingUser === user.id}
                          className="btn-secondary"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0.45rem',
                            borderRadius: '8px',
                            color: '#ef4444',
                            borderColor: '#fee2e2',
                            background: '#fef2f2',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                          title="Delete User"
                          onMouseEnter={e => {
                            e.currentTarget.style.background = '#fecaca';
                            e.currentTarget.style.borderColor = '#fca5a5';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = '#fef2f2';
                            e.currentTarget.style.borderColor = '#fee2e2';
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'activity' && (
        <>
          <div className="admin-activity-header">
            <div className="admin-activity-title">
              <div className="admin-activity-icon">
                <BarChart3 size={24} color="white" />
              </div>
              <div>
                <h1>Admin - Pulse</h1>
                <p>See who is present, which modules are alive, and who may need a nudge</p>
              </div>
            </div>
            <div className="admin-activity-actions">
              <div className="admin-window-toggle" aria-label="Activity window">
                {[7, 30, 90].map(days => (
                  <button
                    key={days}
                    type="button"
                    className={activityWindowDays === days ? 'active' : ''}
                    onClick={() => setActivityWindowDays(days)}
                  >
                    {days}d
                  </button>
                ))}
              </div>
              <button onClick={fetchActivityMetrics} className="btn-secondary admin-refresh-button">
                <RefreshCw size={15} />
                Refresh
              </button>
            </div>
          </div>

          {activityError && (
            <div className="admin-activity-error">
              {activityError}
            </div>
          )}

          {activityLoading && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              Loading Pulse...
            </div>
          )}

          {!activityLoading && activityMetrics && (
            <>
              <div className="admin-metric-grid">
                <div className="admin-metric-card">
                  <Users size={19} />
                  <span>Today</span>
                  <strong>{formatNumber(activityTotals.dau)}</strong>
                  <MetricDelta current={activityTotals.dau} previous={activityTotals.prevDau} />
                </div>
                <div className="admin-metric-card">
                  <BarChart3 size={19} />
                  <span>This Week</span>
                  <strong>{formatNumber(activityTotals.wau)}</strong>
                  <MetricDelta current={activityTotals.wau} previous={activityTotals.prevWau} />
                </div>
                <div className="admin-metric-card">
                  <Activity size={19} />
                  <span>This Month</span>
                  <strong>{formatNumber(activityTotals.mau)}</strong>
                  <MetricDelta current={activityTotals.mau} previous={activityTotals.prevMau} />
                </div>
                <div className="admin-metric-card">
                  <UserPlus size={19} />
                  <span>New Members</span>
                  <strong>{formatNumber(activityTotals.newMembers)}</strong>
                  <MetricDelta current={activityTotals.newMembers} previous={activityTotals.prevNewMembers} />
                </div>
              </div>

              <div className="admin-activity-meta">
                Showing {activityMetrics.windowDays || activityWindowDays} days. {formatNumber(activityTotals.members)} members. {formatNumber(activityTotals.contentEvents)} content events. Generated {formatShortDateTime(activityMetrics.generatedAt)}.
              </div>

              {!hasPresenceData && (
                <div className="admin-presence-note">
                  Presence tracking starts now; content activity below is still included while daily visit data fills in.
                </div>
              )}

              <div className="admin-activity-layout">
                <section className="admin-activity-section">
                  <div className="admin-section-heading">
                    <BarChart3 size={18} />
                    <h2>Engagement Trend</h2>
                  </div>
                  <ActivitySparkline daily={activityMetrics.daily || []} />
                </section>

                <section className="admin-activity-section">
                  <div className="admin-section-heading">
                    <Activity size={18} />
                    <h2>What's Working</h2>
                  </div>
                  {activityModules.length === 0 ? (
                    <div className="admin-empty-state">No module activity yet.</div>
                  ) : (
                    <div className="admin-module-list">
                      {activityModules.map(module => {
                        const users = Number(module.users) || 0;
                        const width = users > 0 ? Math.max(6, Math.round((users / maxModuleUsers) * 100)) : 0;
                        return (
                          <div className={`admin-module-row ${users === 0 ? 'is-quiet' : ''}`} key={module.feature}>
                            <div className="admin-module-main">
                              <strong>{featureLabel(module.feature)}</strong>
                              <span>{formatNumber(users)} users - {formatNumber(module.visits)} visits - {formatNumber(module.events)} events</span>
                            </div>
                            <div className="admin-module-meter" aria-label={`${formatNumber(users)} users`}>
                              <span style={{ width: `${width}%` }} />
                            </div>
                            <MetricDelta current={module.users} previous={module.prevUsers} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              <div className="admin-activity-layout admin-pulse-lower">
                <section className="admin-activity-section">
                  <div className="admin-section-heading">
                    <Clock size={18} />
                    <h2>Recent Activity</h2>
                  </div>
                  {(activityMetrics.recent || []).length === 0 ? (
                    <div className="admin-empty-state">No recent activity in this window.</div>
                  ) : (
                    <div className="admin-recent-list">
                      {(activityMetrics.recent || []).map((item, index) => (
                        <div className="admin-recent-row" key={`${item.kind}-${item.at}-${index}`}>
                          <div className="admin-recent-icon">
                            <RecentActivityIcon kind={item.kind} />
                          </div>
                          <div>
                            <strong>{item.userName || 'Someone'}</strong>
                            <span>{recentActivityVerb(item.kind)} - {formatRelativeTime(item.at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="admin-activity-section">
                  <div className="admin-section-heading">
                    <Trophy size={18} />
                    <h2>Power Users</h2>
                  </div>
                  {(activityMetrics.powerUsers || []).length === 0 ? (
                    <div className="admin-empty-state">No activity in this window yet.</div>
                  ) : (
                    <div className="admin-power-user-list compact">
                      {(activityMetrics.powerUsers || []).map((user, index) => (
                        <div className="admin-power-user-row compact" key={user.userId || index}>
                          <div className="admin-rank">{index + 1}</div>
                          <div className="admin-power-avatar">
                            {getInitials(user.name)}
                          </div>
                          <div className="admin-power-main">
                            <strong>{user.name || 'Unknown user'}</strong>
                            <span>Last seen {formatDateOnly(user.lastSeen)}</span>
                          </div>
                          <div className="admin-power-score">
                            <strong>{formatNumber(user.score)}</strong>
                            <span>{formatNumber(user.visits)} visits</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <section className="admin-activity-section admin-drifting-section">
                <div className="admin-section-heading">
                  <MessageCircle size={18} />
                  <h2>Drifting Away</h2>
                </div>
                {(activityMetrics.quiet || []).length === 0 ? (
                  <div className="admin-empty-state">No members have gone quiet for 14+ days.</div>
                ) : (
                  <div className="admin-quiet-list">
                    {(activityMetrics.quiet || []).map(user => (
                      <div className="admin-quiet-row" key={user.userId}>
                        <div>
                          <strong>{user.name || 'Unknown user'}</strong>
                          <span>Last seen {formatDateOnly(user.lastSeen)}</span>
                        </div>
                        <Link className="btn-secondary admin-message-link" to={`/chat?dm=${encodeURIComponent(user.userId)}`}>
                          <MessageCircle size={15} />
                          Message
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}

      {activeTab === 'organizations' && (
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

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
                      <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                        <Link2 size={14} /> Invite Link:
                      </span>
                      <button
                        type="button"
                        onClick={() => copyOrgInviteLink(org)}
                        title={orgInviteLink(org.invite_code)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                          background: 'transparent', border: 'none', padding: 0,
                          cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                          color: copiedOrgId === org.id ? 'var(--success-green)' : 'var(--accent-gold)'
                        }}
                      >
                        {copiedOrgId === org.id ? <Check size={14} /> : <Copy size={14} />}
                        {copiedOrgId === org.id ? 'Copied!' : 'Copy Link'}
                      </button>
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

                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', display: 'grid', gap: '0.85rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <MessagesSquare size={14} />
                        Use Discord for chat
                      </span>
                      <input
                        type="checkbox"
                        checked={discordEnabled}
                        onChange={e => setDiscordEnabled(e.target.checked)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </label>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      When enabled, this organization’s Chat tab shows the full embedded Discord
                      server (channels, messages, mentions) instead of the native chat. Leave off
                      to keep native chat unchanged.
                    </p>
                    {discordEnabled && (
                      <>
                        {/* Step-by-step setup checklist */}
                        <ol style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          <li>
                            Add the free <strong>WidgetBot</strong> bot to your Discord server (you need the
                            <strong> Manage Server</strong> permission):
                            <div style={{ marginTop: '0.4rem' }}>
                              <a
                                href="https://add.widgetbot.io"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.75rem', borderRadius: '6px', background: '#5865f2', color: '#fff', fontWeight: 600, fontSize: '0.75rem', textDecoration: 'none' }}
                              >
                                Add WidgetBot bot <ExternalLink size={12} />
                              </a>
                            </div>
                          </li>
                          <li>
                            In Discord, turn on IDs: <strong>User Settings → Advanced → Developer Mode</strong>.
                          </li>
                          <li>
                            Right-click your <strong>server icon → Copy Server ID</strong>, then paste it below.
                          </li>
                          <li>
                            Right-click the channel chat should open to → <strong>Copy Channel ID</strong> (optional).
                          </li>
                        </ol>

                        <label style={{ display: 'grid', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>
                          Discord Server (Guild) ID *
                          <input
                            type="text"
                            value={discordGuildId}
                            onChange={e => setDiscordGuildId(e.target.value)}
                            placeholder="e.g. 974519864045756446"
                            inputMode="numeric"
                            style={{ padding: '0.6rem 0.75rem', borderRadius: '6px', border: `1px solid ${discordGuildId.trim() && !isValidDiscordId(discordGuildId) ? '#dc2626' : 'var(--border-color)'}` }}
                          />
                          {discordGuildId.trim() && !isValidDiscordId(discordGuildId) && (
                            <span style={{ fontWeight: 400, fontSize: '0.72rem', color: '#dc2626' }}>
                              Should be a 17–20 digit number copied from Discord.
                            </span>
                          )}
                        </label>
                        <label style={{ display: 'grid', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>
                          Default Channel ID
                          <input
                            type="text"
                            value={discordChannelId}
                            onChange={e => setDiscordChannelId(e.target.value)}
                            placeholder="optional — channel the chat opens to"
                            inputMode="numeric"
                            style={{ padding: '0.6rem 0.75rem', borderRadius: '6px', border: `1px solid ${discordChannelId.trim() && !isValidDiscordId(discordChannelId) ? '#dc2626' : 'var(--border-color)'}` }}
                          />
                          {discordChannelId.trim() && !isValidDiscordId(discordChannelId) && (
                            <span style={{ fontWeight: 400, fontSize: '0.72rem', color: '#dc2626' }}>
                              Should be a 17–20 digit number, or leave blank.
                            </span>
                          )}
                        </label>

                        <span style={{ fontWeight: 400, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Members sign into Discord inside the chat to post. Only channels visible to everyone
                          appear, and the free WidgetBot tier shows a small “powered by WidgetBot” mark.
                        </span>

                        {/* Live preview — confirm the connection before saving */}
                        <div>
                          <button
                            type="button"
                            onClick={() => setDiscordPreview(p => !p)}
                            disabled={!isValidDiscordId(discordGuildId)}
                            className="btn-secondary"
                            style={{ fontSize: '0.78rem', padding: '0.4rem 0.9rem', opacity: isValidDiscordId(discordGuildId) ? 1 : 0.5, cursor: isValidDiscordId(discordGuildId) ? 'pointer' : 'not-allowed' }}
                          >
                            {discordPreview ? 'Hide preview' : 'Preview connection'}
                          </button>
                          {!isValidDiscordId(discordGuildId) && (
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              Enter a valid Server ID to preview.
                            </span>
                          )}
                        </div>
                        {discordPreview && isValidDiscordId(discordGuildId) && (
                          <DiscordChat
                            compact
                            organization={{ name: orgName, discord_guild_id: discordGuildId, discord_channel_id: discordChannelId }}
                          />
                        )}
                      </>
                    )}
                  </div>

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
