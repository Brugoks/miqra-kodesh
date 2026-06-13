import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
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
import QA from './components/QA';
import Feedback from './components/Feedback';
import DevTools from './components/DevTools';
import TranslationGuide from './components/TranslationGuide';
import { hasSupabaseConfig, supabase } from './lib/supabaseClient';
import { canAccessLeaderTools, isAdminRole, isDeveloperRole } from './lib/roles';
import FloatingPollNotification from './components/FloatingPollNotification';
import VotePollModal from './components/VotePollModal';
import BibleLookup from './components/BibleLookup';
import ScriptureLinker from './components/ScriptureLinker';
import OrgGate from './components/OrgGate';

function App() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [userRole, setUserRole] = useState('student');
  const [organization, setOrganization] = useState(null);
  const [organizationsList, setOrganizationsList] = useState([]);
  const [isRecovering, setIsRecovering] = useState(false);
  const [unrespondedPolls, setUnrespondedPolls] = useState([]);
  const [triggerRefresh, setTriggerRefresh] = useState(0);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const canUseLeaderTools = canAccessLeaderTools(userRole);
  const canUseAdminTools = isAdminRole(userRole);
  const canUseDevTools = isDeveloperRole(userRole);

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

      if (integrationCode) {
        navigate('/integrations', { replace: true });
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

  const getUnrespondedPolls = async () => {
    if (!session?.user?.id) return [];
    const userId = session.user.id;

    if (hasSupabaseConfig && supabase) {
      try {
        const { data: groupsData, error: groupsError } = await supabase
          .from('attendance_groups')
          .select('*');

        if (groupsError) throw groupsError;

        const myGroupIds = (groupsData || [])
          .filter(g => g.students?.some(s => s.linkedUserId === userId))
          .map(g => g.id);

        if (myGroupIds.length === 0) return [];

        const { data: pollsData, error: pollsError } = await supabase
          .from('polls')
          .select('*')
          .eq('is_closed', false)
          .in('group_key', myGroupIds);

        if (pollsError) throw pollsError;

        const { data: votesData, error: votesError } = await supabase
          .from('poll_votes')
          .select('poll_id')
          .eq('user_id', userId);

        if (votesError) throw votesError;

        const votedPollIds = new Set((votesData || []).map(v => v.poll_id));

        return (pollsData || []).filter(p => {
          const isExpired = p.expires_at && new Date(p.expires_at) <= new Date();
          return !isExpired && !votedPollIds.has(p.id);
        });
      } catch (err) {
        console.error("Error fetching unresponded polls:", err);
        return [];
      }
    } else {
      try {
        const savedGroups = localStorage.getItem('miqra_attendance_groups');
        const groupsObj = savedGroups ? JSON.parse(savedGroups) : {};
        const myGroupIds = Object.keys(groupsObj).filter(key =>
          groupsObj[key].students?.some(s => s.linkedUserId === userId)
        );

        if (myGroupIds.length === 0) return [];

        const savedPolls = localStorage.getItem('miqra_polls');
        const allPolls = savedPolls ? JSON.parse(savedPolls) : [];

        const savedVotes = localStorage.getItem('miqra_poll_votes');
        const allVotes = savedVotes ? JSON.parse(savedVotes) : [];
        const votedPollIds = new Set(
          allVotes.filter(v => v.userId === userId).map(v => v.pollId)
        );

        return allPolls.filter(p => {
          const isGroupMatch = myGroupIds.includes(p.groupKey);
          const isExpired = p.expiresAt && new Date(p.expiresAt) <= new Date();
          const isClosed = p.isClosed;
          return isGroupMatch && !isClosed && !isExpired && !votedPollIds.has(p.id);
        });
      } catch (err) {
        console.error("Error fetching unresponded polls locally:", err);
        return [];
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const polls = await getUnrespondedPolls();
      if (!cancelled) setUnrespondedPolls(polls);
    })();
    return () => { cancelled = true; };
  }, [session, organization, triggerRefresh]);

  const handleVoteFromModal = async (pollId, optionId) => {
    if (!session?.user?.id) return;
    const userId = session.user.id;

    if (hasSupabaseConfig && supabase) {
      try {
        const voteId = `vote_${Date.now()}`;
        const { data: pollData } = await supabase
          .from('polls')
          .select('organization_id')
          .eq('id', pollId)
          .single();

        const orgId = pollData?.organization_id || organization?.id || null;

        await supabase.from('poll_votes').insert({
          id: voteId,
          poll_id: pollId,
          user_id: userId,
          option_id: optionId,
          organization_id: orgId
        });
      } catch (err) {
        console.error("Error voting from modal:", err);
      }
    } else {
      try {
        const savedVotes = localStorage.getItem('miqra_poll_votes');
        const allVotes = savedVotes ? JSON.parse(savedVotes) : [];
        localStorage.setItem('miqra_poll_votes', JSON.stringify([...allVotes, { pollId, userId, optionId }]));
      } catch (err) {
        console.error("Error voting locally from modal:", err);
      }
    }

    setTriggerRefresh(prev => prev + 1);
  };


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
      navigate('/');
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
    navigate('/');
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

  // New OAuth users (Google/Facebook) who haven't joined an org yet
  const needsOrgJoin = hasSupabaseConfig && session && !loading
    && organizationsList.length === 0
    && !isDeveloperRole(userRole)
    && !isAdminRole(userRole);

  if (needsOrgJoin) {
    return (
      <OrgGate
        onJoin={handleJoinOrganization}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <>
      <Layout
        onSignOut={hasSupabaseConfig ? handleSignOut : null}
        session={session}
        userRole={userRole}
        organization={organization}
        organizationsList={organizationsList}
        onSwitchOrganization={handleSwitchOrganization}
        onJoinOrganization={handleJoinOrganization}
      >
        <Routes>
          <Route path="/" element={<Dashboard session={session} userRole={userRole} />} />
          <Route path="/calendar" element={<Calendar session={session} userRole={userRole} activeOrgId={organization?.id} />} />
          <Route path="/studies" element={<Studies session={session} activeOrgId={organization?.id} />} />
          <Route path="/fellowship" element={<Fellowship session={session} userRole={userRole} activeOrgId={organization?.id} onPollsChange={() => setTriggerRefresh(prev => prev + 1)} refreshTrigger={triggerRefresh} />} />
          <Route path="/sermons" element={<SermonNotes session={session} userRole={userRole} activeOrgId={organization?.id} />} />
          <Route path="/discipleship" element={<DiscipleshipInbox session={session} activeOrgId={organization?.id} />} />
          <Route path="/qa" element={<QA session={session} activeOrgId={organization?.id} />} />
          <Route path="/feedback" element={<Feedback session={session} userRole={userRole} activeOrgId={organization?.id} />} />
          <Route path="/integrations" element={canUseLeaderTools ? <Integrations /> : <Navigate to="/" replace />} />
          <Route path="/leader-portal" element={canUseLeaderTools ? <LeaderPortal userRole={userRole} activeOrgId={organization?.id} /> : <Navigate to="/" replace />} />
          <Route path="/admin" element={
            canUseAdminTools ? (
              <AdminPanel
                session={session}
                userRole={userRole}
                onRoleChange={() => fetchUserRole(session.user.id)}
                onSwitchOrganization={handleSwitchOrganization}
                activeOrgId={organization?.id}
              />
            ) : <Navigate to="/" replace />
          } />
          <Route path="/devtools" element={canUseDevTools ? <DevTools /> : <Navigate to="/" replace />} />
          <Route path="/translation-guide" element={<TranslationGuide />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <FloatingPollNotification polls={unrespondedPolls} onVoteNow={() => setShowVoteModal(true)} />
      {showVoteModal && (
        <VotePollModal
          polls={unrespondedPolls}
          onVote={handleVoteFromModal}
          onClose={() => setShowVoteModal(false)}
        />
      )}
      {session && <BibleLookup session={session} />}
      {session && <ScriptureLinker />}
    </>
  );
}

export default function AppWrapper() {
  return <App />;
}
