import { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Auth, { ResetPassword } from './components/Auth';
import { hasSupabaseConfig, supabase } from './lib/supabaseClient';
import { canAccessLeaderTools, isAdminRole, isDeveloperRole } from './lib/roles';
import { getActivityFeatureForPath, trackActivity } from './lib/activityBeacon';
import FloatingPollNotification from './components/FloatingPollNotification';
import MiniPlayerDock from './components/MiniPlayerDock';
import VotePollModal from './components/VotePollModal';
import OrgGate from './components/OrgGate';
import LoadingScreen from './components/LoadingScreen';
import ErrorBoundary from './components/ErrorBoundary';

// Route components load on demand so the initial bundle carries only the shell
// and Dashboard (the default landing).
//
// A chunk request can fail because a deploy replaced the hashed assets while
// this client still runs the old shell (the /assets/ rewrite exclusion makes
// those 404 on purpose), or because a resumed mobile tab lost its socket.
// Retry once for the transient case, then reload once per chunk to pick up
// the new build; a second failure falls through to the ErrorBoundary instead
// of a blank page.
//
// The reload guard MUST be cleared once the chunk finally loads — otherwise
// the first transient failure on a route primes its flag for the rest of the
// session, and every later hiccup on that same route (common on flaky mobile)
// hard-crashes into the ErrorBoundary instead of recovering with a reload.
// Clearing on success keeps the loop protection (a genuinely-broken chunk
// still fails again after its reload, before this success handler runs) while
// restoring the one-reload budget after every good navigation.
const lazyRoute = (importer, chunkKey) => lazy(() => {
  const KEY = `miqra-chunk-reload-${chunkKey}`;
  return importer()
    .catch(() => new Promise((resolve) => setTimeout(resolve, 1_200)).then(importer))
    .then((mod) => {
      sessionStorage.removeItem(KEY);
      return mod;
    })
    .catch((err) => {
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, '1');
        window.location.reload();
        return new Promise(() => {}); // hold the Suspense fallback while reloading
      }
      throw err;
    });
});

const Calendar = lazyRoute(() => import('./components/Calendar'), 'calendar');
const Studies = lazyRoute(() => import('./components/Studies'), 'studies');
const ReadingPlanPage = lazyRoute(() => import('./components/ReadingPlanPage'), 'reading');
const Fellowship = lazyRoute(() => import('./components/Fellowship'), 'fellowship');
const LeaderPortal = lazyRoute(() => import('./components/LeaderPortal'), 'leader');
const Integrations = lazyRoute(() => import('./components/Integrations'), 'integrations');
const AdminPanel = lazyRoute(() => import('./components/AdminPanel'), 'admin');
const Sermons = lazyRoute(() => import('./components/sermons/Sermons'), 'sermons');
const TalkDetail = lazyRoute(() => import('./components/sermons/TalkDetail'), 'talk');
const Discipleship = lazyRoute(() => import('./components/Discipleship'), 'discipleship');
const QA = lazyRoute(() => import('./components/QA'), 'qa');
const Chat = lazyRoute(() => import('./components/Chat'), 'chat');
const DiscordChat = lazyRoute(() => import('./components/DiscordChat'), 'discord');
const Feedback = lazyRoute(() => import('./components/Feedback'), 'feedback');
const DevTools = lazyRoute(() => import('./components/DevTools'), 'devtools');
const TranslationGuide = lazyRoute(() => import('./components/TranslationGuide'), 'translation');
const BibleWiki = lazyRoute(() => import('./components/wiki/BibleWiki'), 'wiki');
const CharacterReels = lazyRoute(() => import('./components/reels/CharacterReels'), 'reels');
const ChurchHistory = lazyRoute(() => import('./components/wiki/ChurchHistory'), 'history');
const WikiTimeline = lazyRoute(() => import('./components/wiki/WikiTimeline'), 'timeline');
const InsightsGuide = lazyRoute(() => import('./components/InsightsGuide'), 'insights');
const FormGenerator = lazyRoute(() => import('./components/FormGenerator'), 'forms');

// Floating widgets mount on every signed-in page but aren't needed for first
// paint; they hydrate quietly (fallback null) from their own chunks.
const BibleLookup = lazyRoute(() => import('./components/BibleLookup'), 'lookup');
const ScriptureLinker = lazyRoute(() => import('./components/ScriptureLinker'), 'linker');
const WikiEntityLinker = lazyRoute(() => import('./components/wiki/WikiEntityLinker'), 'entitylinker');
const WikiEntityPeek = lazyRoute(() => import('./components/wiki/WikiEntityPeek'), 'entitypeek');

function RouteLoading() {
  return (
    <div className="route-loading" aria-busy="true">
      <LoadingScreen label="Loading page…" />
    </div>
  );
}

const PROFILE_SELECT_WITH_PRIMARY_ORG = `
  role,
  full_name,
  email,
  avatar_url,
  joined_via_code,
  primary_organization_id,
  active_organization:organizations!profiles_active_organization_id_fkey(id, name, slug, invite_code, logo_url, primary_color, secondary_color, welcome_tagline, discord_enabled, discord_guild_id, discord_channel_id),
  profile_organizations(organization:organizations(id, name, slug, logo_url, primary_color, secondary_color, welcome_tagline, discord_enabled, discord_guild_id, discord_channel_id))
`;

const PROFILE_SELECT = `
  role,
  full_name,
  email,
  avatar_url,
  joined_via_code,
  active_organization:organizations!profiles_active_organization_id_fkey(id, name, slug, invite_code, logo_url, primary_color, secondary_color, welcome_tagline, discord_enabled, discord_guild_id, discord_channel_id),
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
      // Group invite link (?joinGroup=GROUP_ID), usually paired with ?invite so
      // one link joins the org and drops the user straight into a small group
      // (handlePendingJoinGroup below, after org membership is established).
      const joinGroupParam = params.get('joinGroup');

      if (inviteParam) {
        localStorage.setItem('pending_invite_code', inviteParam.trim());
        params.delete('invite');
      }

      if (joinGroupParam) {
        localStorage.setItem('pending_join_group', joinGroupParam.trim());
        params.delete('joinGroup');
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

      if (authCode || isRecoveryFlow || inviteParam || joinGroupParam) {
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
        await handlePendingJoinGroup();
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
        // Hold the loading screen only for the genuine first sign-in; focus and
        // token-refresh re-fires must refresh role/profile in the background or
        // they unmount the whole app (losing chat drafts, scroll, form state).
        if (shouldSnap) setLoading(true);
        setTimeout(async () => {
          try {
            await handlePendingInviteCode(session.user);
            await handlePendingJoinGroup();
            if (shouldSnap) claimDiscipleshipInvites();
            await fetchUserRole(session.user.id, { usePrimaryDefault: shouldSnap });
          } finally {
            if (shouldSnap) setLoading(false);
          }
        }, 0);
      } else {
        didPrimaryOrgSnap.current = false;
        setUserRole('student');
        setActualUserRole('student');
        localStorage.removeItem('miqra_dev_role_override');
        setUserProfile(null);
        setOrganization(null);
        setOrganizationsList([]);
        setPrimaryOrgId(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // The auth client can wedge while the tab is backgrounded (supabase-js lock
  // contention): every query then awaits a token that never arrives and each
  // page sits on its loading state until the user manually refreshes. Probe
  // the session when the tab returns; if the probe itself hangs, reload —
  // automating the refresh users were doing by hand, at most once per 2 min.
  useEffect(() => {
    if (!hasSupabaseConfig) return undefined;
    const probeAuthOnReturn = async () => {
      if (document.visibilityState !== 'visible') return;
      const outcome = await Promise.race([
        supabase.auth.getSession().then(() => 'ok', () => 'ok'),
        new Promise((resolve) => { setTimeout(() => resolve('wedged'), 10_000); }),
      ]);
      if (outcome !== 'wedged') return;
      const KEY = 'miqra-auth-wedged-reload-at';
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 120_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    };
    // visibilitychange alone misses some comebacks: iOS PWAs restored from the
    // bfcache fire pageshow, and a radio dropout ends with an online event.
    document.addEventListener('visibilitychange', probeAuthOnReturn);
    window.addEventListener('pageshow', probeAuthOnReturn);
    window.addEventListener('online', probeAuthOnReturn);
    return () => {
      document.removeEventListener('visibilitychange', probeAuthOnReturn);
      window.removeEventListener('pageshow', probeAuthOnReturn);
      window.removeEventListener('online', probeAuthOnReturn);
    };
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

  // Auto-join the small group from a ?joinGroup link once the user is signed in
  // and (via handlePendingInviteCode) a member of the group's org. Open groups
  // add the member immediately; closed groups fall back to a pending request.
  // Best-effort and idempotent — the RPC no-ops if they're already a member.
  const handlePendingJoinGroup = async () => {
    const pendingGroupId = localStorage.getItem('pending_join_group');
    if (!pendingGroupId) return;
    localStorage.removeItem('pending_join_group');
    try {
      await supabase.rpc('join_or_request_attendance_group', { p_group_id: pendingGroupId });
    } catch (err) {
      console.error('Error processing pending group join:', err);
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
        const voteId = `vote_${crypto.randomUUID()}`;
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
        <ErrorBoundary key={location.pathname}>
        <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<Dashboard session={session} userRole={userRole} organization={organization} />} />
          <Route path="/calendar" element={<Calendar session={session} userRole={userRole} activeOrgId={organization?.id} />} />
          <Route path="/studies" element={<Studies session={session} userRole={userRole} activeOrgId={organization?.id} />} />
          <Route path="/reading-plans" element={<ReadingPlanPage session={session} activeOrgId={organization?.id} />} />
          <Route path="/wiki" element={<BibleWiki session={session} userRole={userRole} activeOrgId={organization?.id} />} />
          <Route path="/wiki/:slug" element={<BibleWiki session={session} userRole={userRole} activeOrgId={organization?.id} />} />
          <Route path="/reels" element={<CharacterReels />} />
          <Route path="/church-history" element={<ChurchHistory session={session} userRole={userRole} activeOrgId={organization?.id} />} />
          <Route path="/church-history/:slug" element={<ChurchHistory session={session} userRole={userRole} activeOrgId={organization?.id} />} />
          <Route path="/timeline" element={<WikiTimeline />} />
          <Route path="/fellowship" element={<Fellowship session={session} userRole={userRole} activeOrgId={organization?.id} orgInviteCode={organization?.invite_code} onPollsChange={() => setTriggerRefresh(prev => prev + 1)} refreshTrigger={triggerRefresh} />} />
          <Route path="/sermons" element={<Sermons session={session} userRole={userRole} activeOrgId={organization?.id} />} />
          <Route path="/sermons/:talkId" element={<TalkDetail session={session} userRole={userRole} activeOrgId={organization?.id} />} />
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
        </Suspense>
        </ErrorBoundary>
      </Layout>
      <FloatingPollNotification polls={unrespondedPolls} onVoteNow={() => setShowVoteModal(true)} />
      <MiniPlayerDock />
      {showVoteModal && (
        <VotePollModal
          polls={unrespondedPolls}
          onVote={handleVoteFromModal}
          onClose={() => setShowVoteModal(false)}
        />
      )}
      <Suspense fallback={null}>
        {session && <BibleLookup session={session} />}
        {session && <ScriptureLinker />}
        {session && <WikiEntityLinker />}
        {session && <WikiEntityPeek />}
      </Suspense>
    </>
  );
}

export default function AppWrapper() {
  return <App />;
}
