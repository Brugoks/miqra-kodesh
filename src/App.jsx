import { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Calendar from './components/Calendar';
import Studies from './components/Studies';
import ReadingPlanPage from './components/ReadingPlanPage';
import Fellowship from './components/Fellowship';
import LeaderPortal from './components/LeaderPortal';
import Integrations from './components/Integrations';
import Auth, { ResetPassword } from './components/Auth';
import AdminPanel from './components/AdminPanel';
import SermonNotes from './components/SermonNotes';
import Discipleship from './components/Discipleship';
import QA from './components/QA';
import Chat from './components/Chat';
import DiscordChat from './components/DiscordChat';
import Feedback from './components/Feedback';
import DevTools from './components/DevTools';
import TranslationGuide from './components/TranslationGuide';
import InsightsGuide from './components/InsightsGuide';
import FormGenerator from './components/FormGenerator';
import { hasSupabaseConfig, supabase } from './lib/supabaseClient';
import { canAccessLeaderTools, isAdminRole, isDeveloperRole } from './lib/roles';
import { getActivityFeatureForPath, trackActivity } from './lib/activityBeacon';
import FloatingPollNotification from './components/FloatingPollNotification';
import VotePollModal from './components/VotePollModal';
import BibleLookup from './components/BibleLookup';
import ScriptureLinker from './components/ScriptureLinker';
import OrgGate from './components/OrgGate';
import LoadingScreen from './components/LoadingScreen';

const PROFILE_SELECT_WITH_PRIMARY_ORG = `
  role,
  full_name,
  email,
  avatar_url,
  joined_via_code,
  primary_organization_id,
  active_organization:organizations!profiles_active_organization_id_fkey(id, name, slug, logo_url, primary_color, secondary_color, welcome_tagline, discord_enabled, discord_guild_id, discord_channel_id),
  profile_organizations(organization:organizations(id, name, slug, logo_url, primary_color, secondary_color, welcome_tagline, discord_enabled, discord_guild_id, discord_channel_id))
`;

const PROFILE_SELECT = `
  role,
  full_name,
  email,
  avatar_url,
  joined_via_code,
  active_organization:organizations!profiles_active_organization_id_fkey(id, name, slug, logo_url, primary_color, secondary_color, welcome_tagline, discord_enabled, discord_guild_id, discord_channel_id),
  profile_organizations(organization:organizations(id, name, slug, logo_url, primary_color, secondary_color, welcome_tagline, discord_enabled, discord_guild_id, discord_channel_id))
`;

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [userRole, setUserRole] = useState('student');
  const [actualUserRole, setActualUserRole] = useState('student');
  const [userProfile, setUserProfile] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [organizationsList, setOrganizationsList] = useState([]);
  const [primaryOrgId, setPrimaryOrgId] = useState(null);
  // Snap to the user's preferred (primary) org only once per app load. supabase-js
  // re-fires onAuthStateChange (SIGNED_IN on focus, TOKEN_REFRESHED periodically),
  // and we must not override the active org the user has since switched to.
  const didPrimaryOrgSnap = useRef(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [unrespondedPolls, setUnrespondedPolls] = useState([]);
  const [triggerRefresh, setTriggerRefresh] = useState(0);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [unreadMentions, setUnreadMentions] = useState(0);
  const [unreadChatMessages, setUnreadChatMessages] = useState(0);
  const canUseLeaderTools = canAccessLeaderTools(userRole);
  const canUseAdminTools = isAdminRole(userRole) || isAdminRole(actualUserRole);
  const canUseDevTools = isDeveloperRole(actualUserRole);
  const privilegedUserRole = isAdminRole(actualUserRole) ? actualUserRole : userRole;

  const handleDevRoleOverride = useCallback((nextRole) => {
    if (actualUserRole === 'developer') {
      setUserRole(nextRole);
      localStorage.setItem('miqra_dev_role_override', nextRole);
    }
  }, [actualUserRole]);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      return undefined;
    }

    const loadSession = async () => {
      const params = new URLSearchParams(window.location.search);
      const authCode = params.get('code');
      const integrationCode = params.has('integration');
      const isRecoveryFlow = params.get('recovery') === 'true';
      // Magic invite link (?invite=ORG-CODE) from invitation emails. Stash the
      // code so Auth pre-fills it at sign-up, or so a signed-in user joins
      // automatically via handlePendingInviteCode below.
      const inviteParam = params.get('invite');

      if (inviteParam) {
        localStorage.setItem('pending_invite_code', inviteParam.trim());
        params.delete('invite');
      }

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

      if (authCode || isRecoveryFlow || inviteParam) {
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
        await claimDiscipleshipInvites();
        didPrimaryOrgSnap.current = true;
        await fetchUserRole(session.user.id, { usePrimaryDefault: true });
      }
      setLoading(false);
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        // Only snap to the preferred org on the genuine first sign-in. Later
        // re-fires (focus/token refresh) refresh role+profile but must respect
        // whatever org the user has actively switched to.
        const shouldSnap = !didPrimaryOrgSnap.current;
        didPrimaryOrgSnap.current = true;
        handlePendingInviteCode(session.user).then(async () => {
          if (shouldSnap) await claimDiscipleshipInvites();
          fetchUserRole(session.user.id, { usePrimaryDefault: shouldSnap });
        });
      } else {
        didPrimaryOrgSnap.current = false;
        setUserRole('student');
        setActualUserRole('student');
        localStorage.removeItem('miqra_dev_role_override');
        setUserProfile(null);
        setOrganization(null);
        setOrganizationsList([]);
        setPrimaryOrgId(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !organization?.id) return;
    const featureKey = getActivityFeatureForPath(location.pathname);
    if (!featureKey) return;
    trackActivity(organization.id, featureKey, { role: actualUserRole });
  }, [actualUserRole, location.pathname, organization?.id, session]);

  useEffect(() => {
    const faviconEl = document.querySelector("link[rel~='icon']") || (() => {
      const el = document.createElement('link');
      el.rel = 'icon';
      document.head.appendChild(el);
      return el;
    })();

    if (organization?.logo_url) {
      faviconEl.href = organization.logo_url;
      document.title = organization.name || 'Student/Member Portal';
    } else {
      faviconEl.href = '/vite.svg';
      document.title = 'Student/Member Portal';
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

  // Convert any pending discipleship email invites addressed to this user's
  // email into in-app relationship invitations. Idempotent; best-effort.
  const claimDiscipleshipInvites = async () => {
    try {
      await supabase.rpc('claim_discipleship_email_invites');
    } catch (err) {
      console.error('Error claiming discipleship email invites:', err);
    }
  };

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
            .update({ active_organization_id: org.id, primary_organization_id: org.id, joined_via_code: true })
            .eq('id', user.id);
        }
      } catch (err) {
        console.error("Error processing pending organization invite code:", err);
      }
    }
  };

  async function fetchUserRole(userId, { usePrimaryDefault = false } = {}) {
    let { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT_WITH_PRIMARY_ORG)
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      const fallback = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('id', userId)
        .maybeSingle();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('Error loading user profile:', error);
    }

    const memberOrganizations = (data?.profile_organizations || [])
      .map(po => po.organization)
      .filter(Boolean);
    let activeOrganization = data?.active_organization || null;
    let nextPrimaryOrgId = data?.primary_organization_id || null;

    if (!nextPrimaryOrgId && activeOrganization?.id) {
      nextPrimaryOrgId = activeOrganization.id;
    }

    if (usePrimaryDefault && nextPrimaryOrgId) {
      const primaryOrganization = memberOrganizations.find(org => org.id === nextPrimaryOrgId);
      if (primaryOrganization && primaryOrganization.id !== activeOrganization?.id) {
        const { error } = await supabase
          .from('profiles')
          .update({ active_organization_id: primaryOrganization.id, updated_at: new Date().toISOString() })
          .eq('id', userId);
        if (!error) {
          activeOrganization = primaryOrganization;
        }
      }
    }

    const dbRole = data?.role || 'student';
    setActualUserRole(dbRole);

    const savedOverride = localStorage.getItem('miqra_dev_role_override');
    if (dbRole === 'developer' && savedOverride) {
      setUserRole(savedOverride);
    } else {
      setUserRole(dbRole);
    }

    setUserProfile(data ? {
      full_name: data.full_name,
      email: data.email,
      avatar_url: data.avatar_url,
      joined_via_code: data.joined_via_code,
    } : null);
    setOrganization(activeOrganization);
    setOrganizationsList(memberOrganizations);
    setPrimaryOrgId(nextPrimaryOrgId);
  }

  const refreshChatUnread = useCallback(async () => {
    const uid = session?.user?.id;
    if (!hasSupabaseConfig || !uid) { setUnreadMentions(0); setUnreadChatMessages(0); return; }
    try {
      const { count: mentions } = await supabase
        .from('chat_mentions')
        .select('id', { count: 'exact', head: true })
        .eq('mentioned_user_id', uid)
        .is('read_at', null);
      setUnreadMentions(mentions || 0);

      const [{ data: unreadRows }, { data: prefs }] = await Promise.all([
        supabase.rpc('chat_unread_counts'),
        supabase.from('chat_channel_prefs').select('channel_id,muted_until').eq('user_id', uid),
      ]);
      const mutedIds = new Set((prefs || [])
        .filter((pref) => pref.muted_until && new Date(pref.muted_until) > new Date())
        .map((pref) => pref.channel_id));
      const totalUnread = (unreadRows || []).reduce((sum, row) => (
        mutedIds.has(row.channel_id) ? sum : sum + Number(row.unread || 0)
      ), 0);
      setUnreadChatMessages(totalUnread);
    } catch {
      setUnreadMentions(0);
      setUnreadChatMessages(0);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    (async () => { await refreshChatUnread(); })();
    const uid = session?.user?.id;
    if (!hasSupabaseConfig || !uid || typeof supabase.channel !== 'function') return undefined;
    const channel = supabase
      .channel(`chat-unread-${uid}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_mentions', filter: `mentioned_user_id=eq.${uid}` },
        () => setUnreadMentions((c) => c + 1))
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        () => refreshChatUnread())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refreshChatUnread, session?.user?.id]);

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

  const handleSetPrimaryOrganization = async (orgId) => {
    if (!session?.user?.id) {
      throw new Error('You need to be signed in to choose a primary organization.');
    }

    const isMember = organizationsList.some(o => o.id === orgId);
    if (!isMember) {
      throw new Error('You can only choose a primary organization you belong to.');
    }

    const { error } = await supabase
      .from('profiles')
      .update({ primary_organization_id: orgId, updated_at: new Date().toISOString() })
      .eq('id', session.user.id);

    if (error) throw error;
    setPrimaryOrgId(orgId);
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
      .update({ active_organization_id: org.id, joined_via_code: true })
      .eq('id', session.user.id);

    if (activeError) throw activeError;

    await claimDiscipleshipInvites();
    fetchUserRole(session.user.id);
    return org;
  };

  const handleUpdateDisplayName = async (displayName) => {
    if (!session?.user?.id) {
      throw new Error('You need to be signed in to update your username.');
    }

    const nextName = displayName.trim().replace(/\s+/g, ' ');
    if (!nextName) {
      throw new Error('Username cannot be blank.');
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ full_name: nextName, updated_at: new Date().toISOString() })
      .eq('id', session.user.id)
      .select('full_name, email, avatar_url')
      .single();

    if (error) {
      throw error;
    }

    setUserProfile(data);
    return data;
  };

  const handleUpdateAvatar = async (avatarUrl) => {
    const { data, error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', session.user.id)
      .select('full_name, email, avatar_url')
      .single();

    if (error) throw error;
    setUserProfile(data);
    return data;
  };

  const handleSignOut = async () => {
    await supabase?.auth.signOut();
    navigate('/');
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (isRecovering) {
    return <ResetPassword onComplete={() => setIsRecovering(false)} />;
  }

  if (hasSupabaseConfig && !session) {
    return <Auth />;
  }

  // New OAuth/Email users who haven't entered an invite code yet
  const needsOrgJoin = hasSupabaseConfig && session && !loading
    && userProfile?.joined_via_code === false
    && !isDeveloperRole(actualUserRole)
    && !isAdminRole(actualUserRole);

  if (needsOrgJoin) {
    return (
      <OrgGate
        onJoin={handleJoinOrganization}
        onSignOut={handleSignOut}
      />
    );
  }

  const usesDiscordChat = Boolean(organization?.discord_enabled && organization?.discord_guild_id);

  return (
    <>
      <Layout
        onSignOut={hasSupabaseConfig ? handleSignOut : null}
        session={session}
        userProfile={userProfile}
        userRole={userRole}
        organization={organization}
        organizationsList={organizationsList}
        primaryOrgId={primaryOrgId}
        onSwitchOrganization={handleSwitchOrganization}
        onSetPrimaryOrganization={handleSetPrimaryOrganization}
        onJoinOrganization={handleJoinOrganization}
        onUpdateDisplayName={handleUpdateDisplayName}
        onUpdateAvatar={handleUpdateAvatar}
        unreadMentions={usesDiscordChat ? 0 : unreadMentions}
        chatUnreadTotal={usesDiscordChat ? 0 : unreadMentions + unreadChatMessages}
        chatGlow={!usesDiscordChat && (unreadMentions > 0 || unreadChatMessages > 0)}
        actualUserRole={actualUserRole}
        onDevRoleOverride={handleDevRoleOverride}
      >
        <Routes>
          <Route path="/" element={<Dashboard session={session} userRole={userRole} organization={organization} />} />
          <Route path="/calendar" element={<Calendar session={session} userRole={userRole} activeOrgId={organization?.id} />} />
          <Route path="/studies" element={<Studies session={session} userRole={userRole} activeOrgId={organization?.id} />} />
          <Route path="/reading-plans" element={<ReadingPlanPage session={session} activeOrgId={organization?.id} />} />
          <Route path="/fellowship" element={<Fellowship session={session} userRole={userRole} activeOrgId={organization?.id} onPollsChange={() => setTriggerRefresh(prev => prev + 1)} refreshTrigger={triggerRefresh} />} />
          <Route path="/sermons" element={<SermonNotes session={session} userRole={userRole} activeOrgId={organization?.id} />} />
          <Route path="/discipleship" element={<Discipleship session={session} activeOrgId={organization?.id} displayName={userProfile?.full_name} />} />
          <Route path="/qa" element={<QA session={session} userRole={userRole} activeOrgId={organization?.id} displayName={userProfile?.full_name} />} />
          <Route path="/chat" element={
            usesDiscordChat
              ? <DiscordChat organization={organization} />
              : <Chat session={session} userRole={userRole} activeOrgId={organization?.id} displayName={userProfile?.full_name} myAvatarUrl={userProfile?.avatar_url} onChatSeen={refreshChatUnread} />
          } />
          <Route path="/feedback" element={<Feedback session={session} userRole={userRole} activeOrgId={organization?.id} />} />
          <Route path="/forms" element={<FormGenerator session={session} userRole={userRole} activeOrgId={organization?.id} />} />
          <Route path="/integrations" element={canUseLeaderTools ? <Integrations /> : <Navigate to="/" replace />} />
          <Route path="/leader-portal" element={canUseLeaderTools ? <LeaderPortal session={session} userRole={userRole} activeOrgId={organization?.id} /> : <Navigate to="/" replace />} />
          <Route path="/admin" element={
            canUseAdminTools ? (
              <AdminPanel
                session={session}
                userRole={privilegedUserRole}
                onRoleChange={() => fetchUserRole(session.user.id)}
                onSwitchOrganization={handleSwitchOrganization}
                activeOrgId={organization?.id}
              />
            ) : <Navigate to="/" replace />
          } />
          <Route path="/devtools" element={canUseDevTools ? <DevTools /> : <Navigate to="/" replace />} />
          <Route path="/translation-guide" element={<TranslationGuide />} />
          <Route path="/insights-guide" element={<InsightsGuide />} />
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
