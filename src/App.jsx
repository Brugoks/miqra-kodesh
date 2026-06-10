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
      if (session) fetchUserRole(session.user.id);
      setLoading(false);
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchUserRole(session.user.id);
      else setUserRole('student');
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchUserRole(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    setUserRole(data?.role || 'student');
  }

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
        return <Calendar session={session} userRole={userRole} />;
      case 'studies':
        return <Studies />;
      case 'fellowship':
        return <Fellowship session={session} userRole={userRole} />;
      case 'integrations':
        return canUseLeaderTools ? <Integrations /> : renderDashboard();
      case 'sermons':
        return <SermonNotes session={session} userRole={userRole} />;
      case 'discipleship':
        return <DiscipleshipInbox session={session} />;
      case 'leader-portal':
        return canUseLeaderTools ? <LeaderPortal userRole={userRole} /> : renderDashboard();
      case 'admin':
        return canUseAdminTools ? <AdminPanel session={session} userRole={userRole} onRoleChange={() => fetchUserRole(session.user.id)} /> : renderDashboard();
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
    <Layout currentTab={visibleTab} setCurrentTab={setCurrentTab} onSignOut={hasSupabaseConfig ? handleSignOut : null} session={session} userRole={userRole}>
      {renderContent()}
    </Layout>
  );
}

export default function AppWrapper() {
  return <App />;
}
