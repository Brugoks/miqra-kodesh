import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Calendar from './components/Calendar';
import Studies from './components/Studies';
import Fellowship from './components/Fellowship';
import LeaderPortal from './components/LeaderPortal';
import Integrations from './components/Integrations';
import Auth, { ResetPassword } from './components/Auth';
import AdminPanel from './components/AdminPanel';
import SermonNotes from './components/SermonNotes';
import DiscipleshipInbox from './components/DiscipleshipInbox';
import Feedback from './components/Feedback';
import { hasSupabaseConfig, supabase } from './lib/supabaseClient';
import { canAccessLeaderTools, isAdminRole } from './lib/roles';

function App() {
  const [currentTab, setCurrentTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('integration') ? 'integrations' : 'dashboard';
  });
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [userRole, setUserRole] = useState('student');
  const [organization, setOrganization] = useState(null);
  const [organizationsList, setOrganizationsList] = useState([]);
  const [isRecovering, setIsRecovering] = useState(false);
  const canUseLeaderTools = canAccessLeaderTools(userRole);
  const canUseAdminTools = isAdminRole(userRole);
  const isLeaderOnlyTab = currentTab === 'integrations' || currentTab === 'leader-portal';
  const visibleTab = (isLeaderOnlyTab && !canUseLeaderTools) || (currentTab === 'admin' && !canUseAdminTools)
    ? 'dashboard'
    : currentTab;

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      return undefined;
    }

    const loadSession = async () => {
      const params = new URLSearchParams(window.location.search);
      const authCode = params.get('code');
      const integrationCode = params.has('integration');
      const isRecoveryFlow = params.get('recovery') === 'true';

      if (isRecoveryFlow) {
        setIsRecovering(true);
        params.delete('recovery');
      }

      if (authCode && !integrationCode) {
        const { error } = await supabase.auth.exchangeCodeForSession(authCode);

        if (!error) {
          params.delete('code');
        }
      }

      if (authCode || isRecoveryFlow) {
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`
        );
      }

      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session) {
        await handlePendingInviteCode(session.user);
        await fetchUserRole(session.user.id);
      }
      setLoading(false);
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        handlePendingInviteCode(session.user).then(() => {
          fetchUserRole(session.user.id);
        });
      } else {
        setUserRole('student');
        setOrganization(null);
        setOrganizationsList([]);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Update favicon dynamically
    const faviconEl = document.querySelector("link[rel~='icon']") || (() => {
      const el = document.createElement('link');
      el.rel = 'icon';
      document.head.appendChild(el);
      return el;
    })();

    if (organization?.logo_url) {
      faviconEl.href = organization.logo_url;
      document.title = organization.name || 'Students Portal';
    } else {
      faviconEl.href = '/vite.svg';
      document.title = 'Students Portal';
    }

    if (organization) {
      document.documentElement.style.setProperty('--accent-gold', organization.primary_color || '#2e52be');
      document.documentElement.style.setProperty('--bg-secondary', organization.secondary_color || '#ffffff');
      const primaryColor = organization.primary_color || '#2e52be';
      document.documentElement.style.setProperty('--accent-gold-hover', primaryColor + 'cc');
      document.documentElement.style.setProperty('--accent-gold-light', primaryColor + '1a');
      document.documentElement.style.setProperty('--accent-gold-glow', primaryColor + '40');
    } else {
      document.documentElement.style.removeProperty('--accent-gold');
      document.documentElement.style.removeProperty('--bg-secondary');
      document.documentElement.style.removeProperty('--accent-gold-hover');
      document.documentElement.style.removeProperty('--accent-gold-light');
      document.documentElement.style.removeProperty('--accent-gold-glow');
    }
  }, [organization]);

  const handlePendingInviteCode = async (user) => {
    const pendingCode = localStorage.getItem('pending_invite_code');
    if (pendingCode) {
      localStorage.removeItem('pending_invite_code');
      try {
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('id')
          .eq('invite_code', pendingCode)
          .maybeSingle();

        if (!orgError && org) {
          await supabase
            .from('profile_organizations')
            .insert({
              profile_id: user.id,
              organization_id: org.id
            });

          await supabase
            .from('profiles')
            .update({ active_organization_id: org.id })
            .eq('id', user.id);
        }
      } catch (err) {
        console.error("Error processing pending organization invite code:", err);
      }
    }
  };

  async function fetchUserRole(userId) {
    const { data } = await supabase
      .from('profiles')
      .select(`
        role,
        active_organization:organizations!profiles_active_organization_id_fkey(id, name, slug, logo_url, primary_color, secondary_color),
        profile_organizations(organization:organizations(id, name, slug, logo_url, primary_color, secondary_color))
      `)
      .eq('id', userId)
      .maybeSingle();

    setUserRole(data?.role || 'student');
    setOrganization(data?.active_organization || null);
    setOrganizationsList(
      (data?.profile_organizations || [])
        .map(po => po.organization)
        .filter(Boolean)
    );
  }

  const handleSwitchOrganization = async (orgId) => {
    const isMember = organizationsList.some(o => o.id === orgId);
    if (!isMember) {
      await supabase
        .from('profile_organizations')
        .insert({
          profile_id: session.user.id,
          organization_id: orgId
        });
    }

    const { error } = await supabase
      .from('profiles')
      .update({ active_organization_id: orgId })
      .eq('id', session.user.id);
    if (!error) {
      await fetchUserRole(session.user.id);
      setCurrentTab('dashboard');
    }
  };

  const handleJoinOrganization = async (inviteCode) => {
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('invite_code', inviteCode.trim())
      .maybeSingle();

    if (orgError || !org) {
      throw new Error('Invalid organization join code.');
    }

    const { error: joinError } = await supabase
      .from('profile_organizations')
      .insert({
        profile_id: session.user.id,
        organization_id: org.id
      });

    if (joinError && !joinError.message.includes('duplicate')) {
      throw joinError;
    }

    const { error: activeError } = await supabase
      .from('profiles')
      .update({ active_organization_id: org.id })
      .eq('id', session.user.id);

    if (activeError) throw activeError;

    fetchUserRole(session.user.id);
    return org;
  };

  const handleSignOut = async () => {
    await supabase?.auth.signOut();
  };

  const renderDashboard = () => (
    <Dashboard setCurrentTab={setCurrentTab} session={session} userRole={userRole} />
  );

  const renderContent = () => {
    switch (visibleTab) {
      case 'dashboard':
        return renderDashboard();
      case 'calendar':
        return <Calendar session={session} userRole={userRole} activeOrgId={organization?.id} />;
      case 'studies':
        return <Studies activeOrgId={organization?.id} />;
      case 'fellowship':
        return <Fellowship session={session} userRole={userRole} activeOrgId={organization?.id} />;
      case 'integrations':
        return canUseLeaderTools ? <Integrations /> : renderDashboard();
      case 'sermons':
        return <SermonNotes session={session} userRole={userRole} activeOrgId={organization?.id} />;
      case 'discipleship':
        return <DiscipleshipInbox session={session} activeOrgId={organization?.id} />;
      case 'feedback':
        return <Feedback session={session} userRole={userRole} activeOrgId={organization?.id} />;
      case 'leader-portal':
        return canUseLeaderTools ? <LeaderPortal userRole={userRole} activeOrgId={organization?.id} /> : renderDashboard();
      case 'admin':
        return canUseAdminTools ? (
          <AdminPanel 
            session={session} 
            userRole={userRole} 
            onRoleChange={() => fetchUserRole(session.user.id)} 
            onSwitchOrganization={handleSwitchOrganization}
            activeOrgId={organization?.id}
          />
        ) : renderDashboard();
      default:
        return renderDashboard();
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
        <div className="badge badge-gold" style={{ padding: '1rem 2rem', fontSize: '0.9rem', textTransform: 'none' }}>
          Loading Student Portal Session...
        </div>
      </div>
    );
  }

  if (isRecovering) {
    return <ResetPassword onComplete={() => setIsRecovering(false)} />;
  }

  if (hasSupabaseConfig && !session) {
    return <Auth />;
  }

  return (
    <Layout
      currentTab={visibleTab}
      setCurrentTab={setCurrentTab}
      onSignOut={hasSupabaseConfig ? handleSignOut : null}
      session={session}
      userRole={userRole}
      organization={organization}
      organizationsList={organizationsList}
      onSwitchOrganization={handleSwitchOrganization}
      onJoinOrganization={handleJoinOrganization}
    >
      {renderContent()}
    </Layout>
  );
}

export default function AppWrapper() {
  return <App />;
}
