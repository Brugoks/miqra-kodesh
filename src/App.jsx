import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Calendar from './components/Calendar';
import Studies from './components/Studies';
import Fellowship from './components/Fellowship';
import LeaderPortal from './components/LeaderPortal';
import Integrations from './components/Integrations';
import Auth from './components/Auth';
import AdminPanel from './components/AdminPanel';
import { hasSupabaseConfig, supabase } from './lib/supabaseClient';

function App() {
  const [currentTab, setCurrentTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('integration') ? 'integrations' : 'dashboard';
  });
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(hasSupabaseConfig);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      return undefined;
    }

    // Check current session state
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase?.auth.signOut();
  };

  const renderContent = () => {
    switch (currentTab) {
      case 'dashboard':
        return <Dashboard setCurrentTab={setCurrentTab} />;
      case 'calendar':
        return <Calendar session={session} />;
      case 'studies':
        return <Studies />;
      case 'fellowship':
        return <Fellowship session={session} />;
      case 'integrations':
        return <Integrations />;
      case 'leader-portal':
        return <LeaderPortal />;
      case 'admin':
        return <AdminPanel session={session} />;
      default:
        return <Dashboard setCurrentTab={setCurrentTab} />;
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
        <div className="badge badge-gold" style={{ padding: '1rem 2rem', fontSize: '0.9rem', textTransform: 'none' }}>
          Loading Youth Portal Session...
        </div>
      </div>
    );
  }

  if (hasSupabaseConfig && !session) {
    return <Auth />;
  }

  return (
    <Layout currentTab={currentTab} setCurrentTab={setCurrentTab} onSignOut={hasSupabaseConfig ? handleSignOut : null} session={session}>
      {renderContent()}
    </Layout>
  );
}

export default function AppWrapper() {
  return <App />;
}
