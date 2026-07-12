import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Discipleship.css';
import {
  Archive,
  BookOpenCheck,
  Brain,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Flame,
  Hand,
  HandHeart,
  Heart,
  HeartHandshake,
  HelpCircle,
  Loader2,
  Mail,
  MessageCircle,
  PartyPopper,
  PenLine,
  QrCode,
  ScrollText,
  Send,
  Sparkles,
  Sun,
  UserPlus,
  X,
} from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import {
  relationshipRole, checkInDue, lastCheckinLabel, buildDiscipleshipInviteEmail,
  discipleshipStage, STAGE_UNLOCKS, COVENANT_OPTIONS, covenantLabel,
  watchwordForDate, localDateISO, bandPromptsForWeek,
} from '../lib/discipleship';
import { googleCalendarUrl, downloadICS } from '../lib/calendarExport';
import { getPlan, computeStreak } from '../lib/readingPlans';
import { createReadingGroup, inviteToGroup } from '../lib/readingGroups';
import { PATHWAY_SESSIONS, getStage, nextSession, sessionNumber } from '../lib/discipleshipPathway';
import Avatar from './ui/Avatar';
import DiscipleshipOnboarding, { ONBOARDING_KEY } from './DiscipleshipOnboarding';
import DiscipleshipStory from './DiscipleshipStory';

const emptyCheckin = { learning: '', struggle: '', prayer: '' };

const CHECKIN_PROMPTS = [
  { key: 'learning', label: "What's God been teaching you?", placeholder: 'A verse, a moment, a small shift…' },
  { key: 'struggle', label: 'Where are you struggling?', placeholder: 'Be honest — this stays between you two.' },
  { key: 'prayer', label: 'How can I pray for you?', placeholder: 'One thing to bring before God this week.' },
];

const CADENCES = [
  { value: 7, label: 'Weekly' },
  { value: 14, label: 'Every other week' },
  { value: 30, label: 'Monthly' },
];

const MILESTONE_KINDS = [
  { kind: 'baptism', emoji: '🌊', label: 'Baptized' },
  { kind: 'first_prayer_aloud', emoji: '🙏', label: 'Prayed aloud in group' },
  { kind: 'shared_testimony', emoji: '🎤', label: 'Shared their testimony' },
  { kind: 'led_study', emoji: '📖', label: 'Led a study' },
  { kind: 'started_discipling', emoji: '🌱', label: 'Started discipling someone' },
  { kind: 'custom', emoji: '✨', label: 'Something else…' },
];

const milestoneMeta = (milestone) => {
  const meta = MILESTONE_KINDS.find((k) => k.kind === milestone.kind);
  if (milestone.kind === 'custom') return { emoji: '✨', label: milestone.label || 'Milestone' };
  return meta || { emoji: '🎉', label: 'Milestone' };
};

const formatDateTime = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));
};

export default function Discipleship({ session, activeOrgId, displayName }) {
  const navigate = useNavigate();
  const userId = session?.user?.id;
  const isConfigured = hasSupabaseConfig && !!userId && !!activeOrgId;

  const [relationships, setRelationships] = useState([]);
  const [checkins, setCheckins] = useState([]); // all check-ins across my relationships
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(isConfigured);
  const [error, setError] = useState('');

  const [selectedId, setSelectedId] = useState(null);
  const [composer, setComposer] = useState(emptyCheckin);
  const [saving, setSaving] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState('member'); // 'member' | 'email' | 'link'
  const [invitePersonId, setInvitePersonId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteDirection, setInviteDirection] = useState('discipler'); // my role in the new relationship
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteNotice, setInviteNotice] = useState('');
  const [emailInvites, setEmailInvites] = useState([]); // pending email invites I sent
  const [org, setOrg] = useState(null); // { name, invite_code } for the invitation email
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // Progressive-disclosure data
  const [suggestions, setSuggestions] = useState([]); // leader pairing suggestions for me
  const [myHand, setMyHand] = useState(null); // my discipleship_availability row
  const [openHands, setOpenHands] = useState([]); // org members open to connecting
  const [handSaving, setHandSaving] = useState(false);
  const [sessionCounts, setSessionCounts] = useState(new Map()); // relId -> sessions done (for stage)
  const [prayerTaps, setPrayerTaps] = useState([]); // taps across my relationships
  const [watchwordReads, setWatchwordReads] = useState([]); // today's reads across my rels
  const [celebrations, setCelebrations] = useState([]); // org-wide shared milestones
  const [covenantOpen, setCovenantOpen] = useState(false);
  const [covenantDraft, setCovenantDraft] = useState([]);
  const [scheduleFor, setScheduleFor] = useState(null); // relationship being scheduled
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [deeperOn, setDeeperOn] = useState(() => {
    try { return localStorage.getItem('disc_deeper_questions') === 'on'; } catch { return false; }
  });
  const [unlockNotice, setUnlockNotice] = useState('');

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveMessages, setArchiveMessages] = useState(null);

  // Phase 2: partner growth, milestones, onboarding
  const [partnerGrowth, setPartnerGrowth] = useState(null); // { plan, completedDays, streak, verseCount, versesDue } | 'hidden'
  const [milestones, setMilestones] = useState([]);
  const [readTogetherState, setReadTogetherState] = useState('idle'); // idle | sending | sent | error

  // Phase 3: pathway guide
  const [sessionsDone, setSessionsDone] = useState([]);
  const [guide, setGuide] = useState(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideError, setGuideError] = useState('');
  const [markingSession, setMarkingSession] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState({ kind: 'baptism', personId: '', label: '', note: '', shared: false });
  const [milestoneSaving, setMilestoneSaving] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) !== 'done';
    } catch {
      return true;
    }
  });

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const personName = useCallback((id) => {
    if (id === userId) return displayName || 'You';
    const member = memberById.get(id);
    return member?.full_name || member?.email || 'Former member';
  }, [memberById, userId, displayName]);

  const load = useCallback(() => {
    if (!isConfigured) return Promise.resolve();
    return Promise.all([
      supabase
        .from('discipleship_relationships')
        .select('*')
        .neq('status', 'ended')
        .order('created_at', { ascending: false }),
      supabase.rpc('org_members', { org_id: activeOrgId }).order('full_name', { ascending: true }),
      supabase
        .from('organizations')
        .select('name, invite_code')
        .eq('id', activeOrgId)
        .maybeSingle(),
      supabase
        .from('discipleship_email_invites')
        .select('*')
        .eq('organization_id', activeOrgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('discipleship_suggestions')
        .select('*')
        .eq('organization_id', activeOrgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('discipleship_availability')
        .select('*')
        .eq('organization_id', activeOrgId),
      supabase
        .from('discipleship_milestones')
        .select('*')
        .eq('organization_id', activeOrgId)
        .eq('shared', true)
        .order('achieved_on', { ascending: false })
        .limit(6),
    ]).then(async ([relResult, memberResult, orgResult, emailInviteResult, suggestionResult, availabilityResult, celebrationResult]) => {
      if (relResult.error) {
        setError(relResult.error.message || 'Could not load discipleship relationships.');
        setLoading(false);
        return;
      }
      const rels = relResult.data || [];
      setRelationships(rels);
      setMembers(memberResult.data || []);
      setOrg(orgResult.data || null);
      setEmailInvites(emailInviteResult.data || []);
      setSuggestions((suggestionResult.data || []).filter((s) => s.discipler_id === userId || s.disciple_id === userId));
      const hands = availabilityResult.data || [];
      setMyHand(hands.find((h) => h.profile_id === userId) || null);
      setOpenHands(hands.filter((h) => h.profile_id !== userId));
      setCelebrations(celebrationResult.data || []);

      if (rels.length) {
        const relIds = rels.map((r) => r.id);
        const today = localDateISO();
        const [checkinResult, sessionResult, readResult] = await Promise.all([
          supabase
            .from('discipleship_checkins')
            .select('*')
            .in('relationship_id', relIds)
            .order('created_at', { ascending: false })
            .limit(300),
          supabase
            .from('discipleship_session_progress')
            .select('relationship_id')
            .in('relationship_id', relIds),
          supabase
            .from('discipleship_watchword_reads')
            .select('*')
            .in('relationship_id', relIds)
            .eq('read_on', today),
        ]);
        const checkinData = checkinResult.data || [];
        setCheckins(checkinData);
        const counts = new Map();
        for (const row of sessionResult.data || []) {
          counts.set(row.relationship_id, (counts.get(row.relationship_id) || 0) + 1);
        }
        setSessionCounts(counts);
        setWatchwordReads(readResult.data || []);
        if (checkinData.length) {
          const { data: tapData } = await supabase
            .from('discipleship_prayer_taps')
            .select('*')
            .in('relationship_id', relIds);
          setPrayerTaps(tapData || []);
        } else {
          setPrayerTaps([]);
        }
      } else {
        setCheckins([]);
        setSessionCounts(new Map());
        setWatchwordReads([]);
        setPrayerTaps([]);
      }
      setLoading(false);
    });
  }, [isConfigured, activeOrgId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const active = useMemo(() => relationships.filter((r) => r.status === 'active'), [relationships]);
  const invitesForMe = useMemo(() => relationships.filter(
    (r) => r.status === 'invited' && r.created_by !== userId
  ), [relationships, userId]);
  const invitesISent = useMemo(() => relationships.filter(
    (r) => r.status === 'invited' && r.created_by === userId
  ), [relationships, userId]);

  const checkinsByRel = useMemo(() => {
    const map = new Map();
    for (const checkin of checkins) {
      if (!map.has(checkin.relationship_id)) map.set(checkin.relationship_id, []);
      map.get(checkin.relationship_id).push(checkin);
    }
    return map;
  }, [checkins]);

  const myLastCheckinAt = useCallback((rel) => (
    (checkinsByRel.get(rel.id) || []).find((c) => c.author_id === userId)?.created_at || null
  ), [checkinsByRel, userId]);

  const selected = active.find((r) => r.id === selectedId) || null;

  // Ids already connected to me (active or pending), to filter the invite picker.
  const connectedIds = useMemo(() => {
    const ids = new Set([userId]);
    relationships.forEach((r) => {
      ids.add(r.discipler_id);
      ids.add(r.disciple_id);
    });
    return ids;
  }, [relationships, userId]);

  // ── Progressive disclosure: which tools has this user grown into? ──
  const myCheckinCount = useMemo(() => checkins.filter((c) => c.author_id === userId).length, [checkins, userId]);
  const maxSessionsDone = useMemo(() => Math.max(0, ...sessionCounts.values()), [sessionCounts]);
  const stage = useMemo(() => discipleshipStage({
    hasRelationship: relationships.some((r) => r.status !== 'ended'),
    myCheckinCount,
    maxSessionsDone,
  }), [relationships, myCheckinCount, maxSessionsDone]);

  // One friendly line when a new stage unlocks; never repeats.
  useEffect(() => {
    if (loading) return undefined;
    let cancelled = false;
    // Defer the setState out of the effect body (sync setState trips the lint rule).
    Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const seen = Number(localStorage.getItem('disc_stage_seen') || '0');
        if (stage > seen) {
          localStorage.setItem('disc_stage_seen', String(stage));
          if (STAGE_UNLOCKS[stage]) setUnlockNotice(STAGE_UNLOCKS[stage]);
        }
      } catch { /* localStorage unavailable */ }
    });
    return () => { cancelled = true; };
  }, [stage, loading]);

  const todayWatchword = useMemo(() => watchwordForDate(), []);
  const weekPrompts = useMemo(() => bandPromptsForWeek(), []);
  const composerPrompts = deeperOn && stage >= 2 ? weekPrompts : CHECKIN_PROMPTS;

  const inviteLink = org?.invite_code
    ? `${window.location.origin}/?invite=${encodeURIComponent(org.invite_code)}`
    : '';

  // QR for the share tab, generated when the tab opens.
  useEffect(() => {
    if (inviteMode !== 'link' || !inviteOpen || !inviteLink) return;
    // Dynamic import keeps `qrcode` out of the main bundle (QRShareButton
    // lazy-loads it the same way).
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(inviteLink, { width: 220, margin: 1 }))
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [inviteMode, inviteOpen, inviteLink]);

  const openHandIds = useMemo(() => new Set(openHands.map((h) => h.profile_id)), [openHands]);

  // ── Actions ──────────────────────────────────────────────────
  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy — long-press the link to copy it manually.');
    }
  };

  const raiseHand = async (seeking) => {
    if (handSaving) return;
    setHandSaving(true);
    setError('');
    const { error: handError } = await supabase
      .from('discipleship_availability')
      .upsert({ profile_id: userId, organization_id: activeOrgId, seeking });
    if (handError) setError(handError.message || 'Could not save your availability.');
    else setMyHand({ profile_id: userId, organization_id: activeOrgId, seeking });
    setHandSaving(false);
  };

  const lowerHand = async () => {
    if (handSaving) return;
    setHandSaving(true);
    await supabase
      .from('discipleship_availability')
      .delete()
      .eq('profile_id', userId)
      .eq('organization_id', activeOrgId);
    setMyHand(null);
    setHandSaving(false);
  };

  const respondToSuggestion = async (suggestion, accept) => {
    setError('');
    if (accept) {
      const { error: relError } = await supabase.from('discipleship_relationships').insert({
        organization_id: activeOrgId,
        discipler_id: suggestion.discipler_id,
        disciple_id: suggestion.disciple_id,
        created_by: userId,
        kind: suggestion.kind,
      });
      if (relError && !relError.message?.includes('duplicate')) {
        setError(relError.message || 'Could not send the invitation.');
        return;
      }
    }
    await supabase
      .from('discipleship_suggestions')
      .update({ status: accept ? 'sent' : 'dismissed' })
      .eq('id', suggestion.id);
    await load();
  };

  const openCovenantEditor = (rel) => {
    setCovenantDraft(Array.isArray(rel.covenant) ? rel.covenant : []);
    setCovenantOpen(true);
  };

  const saveCovenant = async () => {
    if (!selected) return;
    setError('');
    const { error: covError } = await supabase
      .from('discipleship_relationships')
      .update({ covenant: covenantDraft })
      .eq('id', selected.id);
    if (covError) setError(covError.message || 'Could not save your covenant.');
    else {
      setRelationships((cur) => cur.map((r) => (r.id === selected.id ? { ...r, covenant: covenantDraft } : r)));
      setCovenantOpen(false);
    }
  };

  const saveSchedule = async () => {
    if (!scheduleFor || !scheduleAt || scheduleSaving) return;
    setScheduleSaving(true);
    setError('');
    const iso = new Date(scheduleAt).toISOString();
    const { error: schedError } = await supabase
      .from('discipleship_relationships')
      .update({ next_meeting_at: iso })
      .eq('id', scheduleFor.id);
    if (schedError) {
      setError(schedError.message || 'Could not save the meeting time.');
    } else {
      setRelationships((cur) => cur.map((r) => (r.id === scheduleFor.id ? { ...r, next_meeting_at: iso } : r)));
      setScheduleFor(null);
      setScheduleAt('');
    }
    setScheduleSaving(false);
  };

  // Calendar-export event shape for a scheduled meet-up.
  const meetingEvent = (rel) => {
    const other = personName(relationshipRole(rel, userId)?.otherId);
    const when = new Date(rel.next_meeting_at);
    return {
      id: rel.id,
      title: `Discipleship meet-up with ${other}`,
      date: localDateISO(when),
      time_start: `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`,
      description: 'Set up from the Miqra Kodesh Discipleship page.',
    };
  };

  const tapPrayer = async (checkin) => {
    setError('');
    const { error: tapError } = await supabase.from('discipleship_prayer_taps').insert({
      checkin_id: checkin.id,
      relationship_id: checkin.relationship_id,
      author_id: userId,
    });
    if (tapError) {
      if (!tapError.message?.includes('duplicate')) setError(tapError.message || 'Could not record that.');
      return;
    }
    setPrayerTaps((cur) => [...cur, { checkin_id: checkin.id, relationship_id: checkin.relationship_id, author_id: userId }]);
  };

  const markWatchwordRead = async (rel) => {
    openPassage(todayWatchword.ref);
    const today = localDateISO();
    const { error: readError } = await supabase.from('discipleship_watchword_reads').insert({
      relationship_id: rel.id,
      profile_id: userId,
      read_on: today,
    });
    if (!readError) {
      setWatchwordReads((cur) => [...cur, { relationship_id: rel.id, profile_id: userId, read_on: today }]);
    }
  };

  const toggleDeeper = () => {
    setDeeperOn((cur) => {
      const next = !cur;
      try { localStorage.setItem('disc_deeper_questions', next ? 'on' : 'off'); } catch { /* ignore */ }
      return next;
    });
  };

  const sendInvite = async () => {
    if (!invitePersonId || inviteSaving) return;
    setInviteSaving(true);
    setError('');
    const { error: inviteError } = await supabase.from('discipleship_relationships').insert({
      organization_id: activeOrgId,
      discipler_id: inviteDirection === 'disciple' ? invitePersonId : userId,
      disciple_id: inviteDirection === 'disciple' ? userId : invitePersonId,
      created_by: userId,
      kind: inviteDirection === 'peer' ? 'peer' : 'discipleship',
    });
    if (inviteError) {
      setError(inviteError.message?.includes('duplicate')
        ? 'You already have a pending or active relationship with that person in this direction.'
        : (inviteError.message || 'Could not send the invitation.'));
    } else {
      setInviteOpen(false);
      setInvitePersonId('');
      await load();
    }
    setInviteSaving(false);
  };

  // Invite someone who isn't in the app yet: record the invite, then email
  // them the org join code + a magic sign-up link. When they sign up with
  // this email address, the claim RPC turns it into a normal invitation.
  const sendEmailInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || inviteSaving) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('That doesn’t look like a valid email address.');
      return;
    }
    if (email === (session?.user?.email || '').toLowerCase()) {
      setError('That’s your own email address.');
      return;
    }
    setInviteSaving(true);
    setError('');

    // Already a member? Send them a normal in-app invitation instead.
    const existing = members.find((m) => (m.email || '').toLowerCase() === email);
    if (existing) {
      if (connectedIds.has(existing.id)) {
        setError(`${existing.full_name || email} is already connected with you (or has a pending invitation).`);
        setInviteSaving(false);
        return;
      }
      const { error: inviteError } = await supabase.from('discipleship_relationships').insert({
        organization_id: activeOrgId,
        discipler_id: inviteDirection === 'disciple' ? existing.id : userId,
        disciple_id: inviteDirection === 'disciple' ? userId : existing.id,
        created_by: userId,
        kind: inviteDirection === 'peer' ? 'peer' : 'discipleship',
      });
      if (inviteError) {
        setError(inviteError.message || 'Could not send the invitation.');
      } else {
        setInviteOpen(false);
        setInviteEmail('');
        setInviteNotice(`${existing.full_name || email} is already a member here — we sent them an in-app invitation instead.`);
        await load();
      }
      setInviteSaving(false);
      return;
    }

    if (!org?.invite_code) {
      setError('Could not find your organization’s join code. Please try again.');
      setInviteSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from('discipleship_email_invites').insert({
      organization_id: activeOrgId,
      inviter_id: userId,
      invitee_email: email,
      inviter_role: inviteDirection,
      app_origin: window.location.origin,
    });
    if (insertError) {
      setError(insertError.message?.includes('duplicate')
        ? 'You already have a pending email invitation for that address.'
        : (insertError.message || 'Could not save the invitation.'));
      setInviteSaving(false);
      return;
    }

    const { subject, html, text } = buildDiscipleshipInviteEmail({
      inviterName: displayName || session?.user?.email || 'A member',
      orgName: org.name || 'our community',
      inviteCode: org.invite_code,
      appOrigin: window.location.origin,
      inviterRole: inviteDirection,
      inviteeEmail: email,
    });
    const { error: emailError } = await supabase.functions.invoke('send-email', {
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: {
        type: 'discipleship_invite',
        to: email,
        subject,
        html,
        text,
        metadata: { organization_id: activeOrgId },
      },
    }).catch((err) => ({ error: err }));

    setInviteOpen(false);
    setInviteEmail('');
    setInviteNotice(emailError
      ? `Invitation saved, but the email to ${email} may not have been delivered. You can cancel it and try again.`
      : `Invitation emailed to ${email}. Once they sign up with that address, you’ll be connected automatically.`);
    await load();
    setInviteSaving(false);
  };

  const cancelEmailInvite = async (invite) => {
    setError('');
    const { error: cancelError } = await supabase
      .from('discipleship_email_invites')
      .update({ status: 'cancelled' })
      .eq('id', invite.id);
    if (cancelError) {
      setError(cancelError.message || 'Could not cancel the invitation.');
    } else {
      await load();
    }
  };

  const respondToInvite = async (rel, accept) => {
    setError('');
    const payload = accept
      ? { status: 'active', accepted_at: new Date().toISOString() }
      : { status: 'ended', ended_at: new Date().toISOString() };
    const { error: respondError } = await supabase
      .from('discipleship_relationships')
      .update(payload)
      .eq('id', rel.id);
    if (respondError) {
      setError(respondError.message || 'Could not update the invitation.');
    } else {
      await load();
      // The riskiest moment is right after "Accept" — prompt the first meet-up.
      if (accept) {
        setScheduleFor(rel);
        setScheduleAt('');
      }
    }
  };

  const endRelationship = async (rel) => {
    const other = personName(relationshipRole(rel, userId)?.otherId);
    if (!window.confirm(`End your discipleship relationship with ${other}? Check-in history is kept.`)) return;
    await supabase
      .from('discipleship_relationships')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', rel.id);
    setSelectedId(null);
    await load();
  };

  const updateCadence = async (rel, cadenceDays) => {
    setRelationships((cur) => cur.map((r) => (r.id === rel.id ? { ...r, cadence_days: cadenceDays } : r)));
    await supabase
      .from('discipleship_relationships')
      .update({ cadence_days: cadenceDays })
      .eq('id', rel.id);
  };

  const submitCheckin = async (event) => {
    event.preventDefault();
    if (!selected || saving) return;
    const learning = composer.learning.trim();
    const struggle = composer.struggle.trim();
    const prayer = composer.prayer.trim();
    if (!learning && !struggle && !prayer) {
      setError('Answer at least one prompt before checking in.');
      return;
    }
    setSaving(true);
    setError('');
    const { data, error: checkinError } = await supabase
      .from('discipleship_checkins')
      .insert({
        relationship_id: selected.id,
        organization_id: activeOrgId,
        author_id: userId,
        learning: learning || null,
        struggle: struggle || null,
        prayer: prayer || null,
      })
      .select('*')
      .single();
    if (checkinError) {
      setError(checkinError.message || 'Could not save your check-in.');
    } else {
      setCheckins((cur) => [data, ...cur]);
      setComposer(emptyCheckin);
    }
    setSaving(false);
  };

  const openDm = (otherId) => {
    navigate(`/chat?dm=${encodeURIComponent(otherId)}`);
  };

  // ── Phase 2: partner growth + milestones for the open relationship ──
  useEffect(() => {
    let cancelled = false;
    // Clear in a microtask (sync setState in effects trips the lint rule).
    Promise.resolve().then(() => {
      if (!cancelled) {
        setPartnerGrowth(null);
        setMilestones([]);
        setSessionsDone([]);
        setGuide(null);
        setGuideError('');
        setReadTogetherState('idle');
      }
    });
    if (!selected) return () => { cancelled = true; };
    const otherId = relationshipRole(selected, userId)?.otherId;

    Promise.all([
      supabase
        .from('reading_plan_enrollments')
        .select('plan_id, started_at')
        .eq('user_id', otherId)
        .order('started_at', { ascending: false })
        .limit(1),
      supabase
        .from('reading_plan_progress')
        .select('plan_id, day, completed_at')
        .eq('user_id', otherId)
        .order('completed_at', { ascending: false })
        .limit(400),
      supabase
        .from('memory_verses')
        .select('id, due_at')
        .eq('user_id', otherId),
      supabase
        .from('discipleship_milestones')
        .select('*')
        .eq('relationship_id', selected.id)
        .order('achieved_on', { ascending: false }),
      supabase
        .from('discipleship_session_progress')
        .select('session_id')
        .eq('relationship_id', selected.id),
    ]).then(([enrollRes, progressRes, versesRes, milestonesRes, sessionsRes]) => {
      if (cancelled) return;
      setMilestones(milestonesRes.data || []);
      setSessionsDone((sessionsRes.data || []).map((row) => row.session_id));

      // RLS hides the partner's growth rows entirely when their sharing
      // toggle is off — an empty read with no enrollment means hidden/none.
      const enrollment = enrollRes.data?.[0] || null;
      const plan = enrollment ? getPlan(enrollment.plan_id) : null;
      const progress = (progressRes.data || []).filter((row) => !plan || row.plan_id === plan.id);
      const verses = versesRes.data || [];
      const nowIso = new Date().toISOString();
      if (!plan && !verses.length) {
        setPartnerGrowth('hidden');
        return;
      }
      setPartnerGrowth({
        plan,
        completedDays: plan ? progress.length : 0,
        streak: computeStreak((progressRes.data || []).map((row) => row.completed_at)),
        verseCount: verses.length,
        versesDue: verses.filter((v) => v.due_at && v.due_at <= nowIso).length,
      });
    });

    return () => { cancelled = true; };
  }, [selected, userId]);

  // One-tap "read together": creates a 2-person group for the partner's
  // current plan, self-enrolls, and pushes an invite the partner can join
  // with a single tap (they join themselves — see readingGroups.js).
  const handleReadTogether = async (rel) => {
    if (readTogetherState === 'sending' || !partnerGrowth?.plan) return;
    const partnerId = relationshipRole(rel, userId)?.otherId;
    if (!partnerId) return;
    setReadTogetherState('sending');
    try {
      const group = await createReadingGroup({
        organizationId: activeOrgId,
        planId: partnerGrowth.plan.id,
        name: `${partnerGrowth.plan.name} — with ${personName(partnerId)}`,
        creatorId: userId,
      });
      await inviteToGroup({ groupId: group.id, groupName: group.name, inviteeId: partnerId });
      setReadTogetherState('sent');
    } catch {
      setReadTogetherState('error');
    }
  };

  const mySharesGrowth = (rel) => (
    rel.discipler_id === userId ? rel.discipler_shares_growth : rel.disciple_shares_growth
  );

  const toggleShareGrowth = async (rel) => {
    const column = rel.discipler_id === userId ? 'discipler_shares_growth' : 'disciple_shares_growth';
    const next = !mySharesGrowth(rel);
    setRelationships((cur) => cur.map((r) => (r.id === rel.id ? { ...r, [column]: next } : r)));
    await supabase
      .from('discipleship_relationships')
      .update({ [column]: next })
      .eq('id', rel.id);
  };

  // ── Phase 3: conversation guide ──
  const fetchGuide = async (session) => {
    if (guideLoading) return;
    setGuideLoading(true);
    setGuideError('');
    const { data, error: guideErr } = await supabase.functions.invoke('discipleship-guide', {
      body: {
        sessionId: session.id,
        title: session.title,
        passage: session.passage,
        focus: session.focus,
      },
    });
    if (guideErr || !data?.guide) {
      setGuideError(data?.error || guideErr?.message || 'Could not load the guide. Try again.');
    } else {
      setGuide(data.guide);
    }
    setGuideLoading(false);
  };

  const markSessionDone = async (session) => {
    if (!selected || markingSession) return;
    setMarkingSession(true);
    const { error: sessionErr } = await supabase.from('discipleship_session_progress').insert({
      relationship_id: selected.id,
      organization_id: activeOrgId,
      session_id: session.id,
      completed_by: userId,
    });
    if (!sessionErr) {
      setSessionsDone((cur) => [...cur, session.id]);
      setGuide(null);
      setGuideError('');
    }
    setMarkingSession(false);
  };

  const openPassage = (ref) => {
    window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref } }));
  };

  const recordMilestone = async () => {
    if (!selected || milestoneSaving) return;
    const personId = milestoneForm.personId || userId;
    if (milestoneForm.kind === 'custom' && !milestoneForm.label.trim()) {
      setError('Give the custom milestone a short name.');
      return;
    }
    setMilestoneSaving(true);
    setError('');
    const { data, error: milestoneError } = await supabase
      .from('discipleship_milestones')
      .insert({
        relationship_id: selected.id,
        organization_id: activeOrgId,
        person_id: personId,
        created_by: userId,
        kind: milestoneForm.kind,
        label: milestoneForm.kind === 'custom' ? milestoneForm.label.trim() : null,
        note: milestoneForm.note.trim() || null,
        shared: stage >= 3 ? !!milestoneForm.shared : false,
      })
      .select('*')
      .single();
    if (milestoneError) {
      setError(milestoneError.message || 'Could not record the milestone.');
    } else {
      setMilestones((cur) => [data, ...cur]);
      if (data.shared) setCelebrations((cur) => [data, ...cur].slice(0, 6));
      setMilestoneOpen(false);
      setMilestoneForm({ kind: 'baptism', personId: '', label: '', note: '', shared: false });
    }
    setMilestoneSaving(false);
  };

  const loadArchive = async () => {
    const next = !archiveOpen;
    setArchiveOpen(next);
    if (next && archiveMessages === null) {
      const { data } = await supabase
        .from('discipleship_messages')
        .select('*')
        .eq('organization_id', activeOrgId)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(100);
      setArchiveMessages(data || []);
    }
  };

  if (!hasSupabaseConfig) {
    return (
      <div className="discipleship-page">
        <section className="discipleship-header card">
          <HeartHandshake size={34} />
          <div>
            <h1>Discipleship</h1>
            <p>Connect Supabase to start walking with people.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="discipleship-page">
      <section className="discipleship-header card">
        <div className="discipleship-title">
          <HeartHandshake size={34} />
          <div>
            <h1>Discipleship</h1>
            <p>Walk with someone. Check in, pray for each other, and grow — then help them do the same for someone else.</p>
          </div>
        </div>
        <div className="discipleship-actions">
          <button type="button" className="btn-secondary icon-text-btn" onClick={() => setShowOnboarding(true)}>
            <HelpCircle size={16} />
            <span>How it works</span>
          </button>
          <button type="button" className="btn-primary icon-text-btn" onClick={() => { setInviteOpen(true); setError(''); }}>
            <UserPlus size={16} />
            <span>Invite someone</span>
          </button>
        </div>
      </section>

      {error && <p className="disc-status error">{error}</p>}
      {inviteNotice && (
        <p className="disc-status notice">
          {inviteNotice}
          <button type="button" className="disc-notice-dismiss" onClick={() => setInviteNotice('')} aria-label="Dismiss">
            <X size={14} />
          </button>
        </p>
      )}
      {unlockNotice && (
        <p className="disc-status unlock">
          <Sparkles size={15} /> {unlockNotice}
          <button type="button" className="disc-notice-dismiss" onClick={() => setUnlockNotice('')} aria-label="Dismiss">
            <X size={14} />
          </button>
        </p>
      )}

      {/* Leader pairing suggestions for me */}
      {suggestions.length > 0 && (
        <section className="card disc-invites">
          <h2><Sparkles size={17} /> A suggestion for you</h2>
          {suggestions.map((s) => {
            const iAmDiscipler = s.discipler_id === userId;
            const otherId = iAmDiscipler ? s.disciple_id : s.discipler_id;
            const otherName = personName(otherId);
            return (
              <div key={s.id} className="disc-invite-row">
                <Avatar src={memberById.get(otherId)?.avatar_url} name={otherName} size={34} />
                <p>
                  <strong>{personName(s.suggested_by)}</strong>
                  {s.kind === 'peer'
                    ? <> thinks you and <strong>{otherName}</strong> would make good accountability partners.</>
                    : iAmDiscipler
                      ? <> thinks you&rsquo;d be a great discipler for <strong>{otherName}</strong>.</>
                      : <> suggests <strong>{otherName}</strong> as a discipler for you.</>}
                </p>
                <div className="disc-invite-actions">
                  <button type="button" className="btn-primary" onClick={() => respondToSuggestion(s, true)}>
                    <Send size={14} /> Send invitation
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => respondToSuggestion(s, false)}>
                    Not now
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Org-wide celebrations (shared milestones) */}
      {celebrations.length > 0 && (
        <section className="card disc-celebrations">
          <h2><PartyPopper size={17} /> Recently celebrated</h2>
          <div className="disc-celebration-row">
            {celebrations.map((m) => (
              <span key={m.id} className="disc-celebration-chip">
                {milestoneMeta(m).emoji} <strong>{personName(m.person_id)}</strong> — {milestoneMeta(m).label}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Invitations for me */}
      {invitesForMe.length > 0 && (
        <section className="card disc-invites">
          <h2><Heart size={17} /> Invitations</h2>
          {invitesForMe.map((rel) => {
            const iAmDiscipler = rel.discipler_id === userId;
            const inviterName = personName(rel.created_by);
            return (
              <div key={rel.id} className="disc-invite-row">
                <Avatar src={memberById.get(rel.created_by)?.avatar_url} name={inviterName} size={34} />
                <p>
                  <strong>{inviterName}</strong>
                  {rel.kind === 'peer'
                    ? ' invited you to be accountability partners — walking side by side.'
                    : iAmDiscipler
                      ? ' asked you to disciple them.'
                      : ' wants to walk with you as your discipler.'}
                </p>
                <div className="disc-invite-actions">
                  <button type="button" className="btn-primary" onClick={() => respondToInvite(rel, true)}>
                    <Check size={14} /> Accept
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => respondToInvite(rel, false)}>
                    Decline
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* My People */}
      <section className="disc-section">
        <h2 className="disc-section-title">My People</h2>
        {loading ? (
          <p className="disc-muted"><Loader2 size={15} className="bl-spin" /> Loading…</p>
        ) : active.length === 0 && invitesISent.length === 0 && emailInvites.length === 0 ? (
          <div className="card disc-empty">
            <HandHeart size={30} />
            <p>No discipleship relationships yet.</p>
            <p className="disc-muted">Invite someone to disciple — or ask someone you trust to disciple you. Everything here stays between the two of you.</p>
            <div className="disc-hand-raise">
              {myHand ? (
                <>
                  <p className="disc-hand-status">
                    <Hand size={15} /> Your hand is up — leaders can see you&rsquo;re open to
                    {myHand.seeking === 'discipler' ? ' being discipled.' : myHand.seeking === 'disciple' ? ' discipling someone.' : ' an accountability partner.'}
                  </p>
                  <button type="button" className="btn-secondary" onClick={lowerHand} disabled={handSaving}>
                    Lower my hand
                  </button>
                </>
              ) : (
                <>
                  <p className="disc-muted">Not sure who to ask? Raise your hand and let a leader connect you:</p>
                  <div className="disc-hand-options">
                    <button type="button" className="btn-secondary" onClick={() => raiseHand('discipler')} disabled={handSaving}>
                      🙋 I&rsquo;d like someone to disciple me
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => raiseHand('disciple')} disabled={handSaving}>
                      🌱 I&rsquo;m willing to disciple someone
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => raiseHand('peer')} disabled={handSaving}>
                      🤝 I&rsquo;m looking for an accountability partner
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="disc-people-grid">
            {active.map((rel) => {
              const info = relationshipRole(rel, userId);
              const other = memberById.get(info.otherId);
              const otherName = personName(info.otherId);
              const relCheckins = checkinsByRel.get(rel.id) || [];
              const lastFromThem = relCheckins.find((c) => c.author_id !== userId)?.created_at || null;
              const due = checkInDue(myLastCheckinAt(rel), rel.accepted_at || rel.created_at, rel.cadence_days);
              const isOpen = selectedId === rel.id;
              return (
                <article key={rel.id} className={`card disc-person ${isOpen ? 'open' : ''}`}>
                  <div className="disc-person-head">
                    <Avatar src={other?.avatar_url} name={otherName} size={42} />
                    <div className="disc-person-meta">
                      <strong>{otherName}</strong>
                      <span className={`disc-role ${info.role}`}>{info.roleLabel}</span>
                    </div>
                    {due && <span className="disc-due" title="Your check-in is due">Check-in due</span>}
                  </div>
                  <p className="disc-person-recency">
                    {lastCheckinLabel(myLastCheckinAt(rel))}
                    {lastFromThem && ` · Theirs: ${lastCheckinLabel(lastFromThem).toLowerCase()}`}
                  </p>
                  {rel.next_meeting_at && new Date(rel.next_meeting_at) > new Date() ? (
                    <p className="disc-next-meeting">
                      <CalendarPlus size={13} /> Next meet-up: {formatDateTime(rel.next_meeting_at)}
                      <button type="button" className="disc-inline-link" onClick={() => { setScheduleFor(rel); setScheduleAt(''); }}>change</button>
                    </p>
                  ) : (
                    <p className="disc-next-meeting muted">
                      <CalendarPlus size={13} />
                      <button type="button" className="disc-inline-link" onClick={() => { setScheduleFor(rel); setScheduleAt(''); }}>
                        Plan your next meet-up
                      </button>
                    </p>
                  )}
                  <div className="disc-person-actions">
                    <button
                      type="button"
                      className={due ? 'btn-primary' : 'btn-secondary'}
                      onClick={() => { setSelectedId(isOpen ? null : rel.id); setComposer(emptyCheckin); setError(''); }}
                    >
                      <PenLine size={14} /> {isOpen ? 'Close' : 'Check in'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => openDm(info.otherId)}>
                      <MessageCircle size={14} /> Message
                    </button>
                    <button type="button" className="disc-expand" onClick={() => setSelectedId(isOpen ? null : rel.id)} aria-label={isOpen ? 'Collapse' : 'Expand'}>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </article>
              );
            })}
            {invitesISent.map((rel) => {
              const info = relationshipRole(rel, userId);
              const otherName = personName(info.otherId);
              return (
                <article key={rel.id} className="card disc-person pending">
                  <div className="disc-person-head">
                    <Avatar src={memberById.get(info.otherId)?.avatar_url} name={otherName} size={42} />
                    <div className="disc-person-meta">
                      <strong>{otherName}</strong>
                      <span className="disc-role invited">Invitation sent</span>
                    </div>
                  </div>
                  <p className="disc-person-recency">Waiting for {otherName} to accept.</p>
                  <div className="disc-person-actions">
                    <button type="button" className="btn-secondary" onClick={() => respondToInvite(rel, false)}>
                      <X size={14} /> Cancel invite
                    </button>
                  </div>
                </article>
              );
            })}
            {emailInvites.map((invite) => (
              <article key={invite.id} className="card disc-person pending">
                <div className="disc-person-head">
                  <Avatar name={invite.invitee_email} size={42} />
                  <div className="disc-person-meta">
                    <strong>{invite.invitee_email}</strong>
                    <span className="disc-role invited"><Mail size={12} /> Invitation emailed</span>
                  </div>
                </div>
                <p className="disc-person-recency">
                  Waiting for them to sign up
                  {invite.inviter_role === 'peer'
                    ? ' — you’ll walk as accountability partners.'
                    : invite.inviter_role === 'discipler'
                      ? ' — you’ll disciple them.'
                      : ' — you asked them to disciple you.'}
                </p>
                <div className="disc-person-actions">
                  <button type="button" className="btn-secondary" onClick={() => cancelEmailInvite(invite)}>
                    <X size={14} /> Cancel invite
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Selected relationship: check-in composer + timeline */}
      {selected && (() => {
        const info = relationshipRole(selected, userId);
        const otherName = personName(info.otherId);
        const relCheckins = checkinsByRel.get(selected.id) || [];
        return (
          <section className="card disc-detail">
            <div className="disc-detail-head">
              <h2>Walking with {otherName}</h2>
              <div className="disc-detail-controls">
                <label className="disc-cadence">
                  Rhythm
                  <select value={selected.cadence_days} onChange={(e) => updateCadence(selected, Number(e.target.value))}>
                    {CADENCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </label>
                <label className="disc-share-toggle" title="When on, they can see your reading plan streak and memory verse deck">
                  <input
                    type="checkbox"
                    checked={mySharesGrowth(selected)}
                    onChange={() => toggleShareGrowth(selected)}
                  />
                  Share my growth
                </label>
                <button type="button" className="disc-end" onClick={() => endRelationship(selected)}>
                  End relationship
                </button>
              </div>
            </div>

            {/* Covenant — the pair's chosen rule of life (stage 1+) */}
            <div className="disc-covenant">
              {(Array.isArray(selected.covenant) ? selected.covenant : []).length > 0 ? (
                <>
                  <ScrollText size={14} />
                  {(selected.covenant || []).map((key) => covenantLabel(key)).filter(Boolean).map((label) => (
                    <span key={label} className="disc-covenant-chip">{label}</span>
                  ))}
                  <button type="button" className="disc-inline-link" onClick={() => openCovenantEditor(selected)}>edit</button>
                </>
              ) : (
                <button type="button" className="disc-inline-link" onClick={() => openCovenantEditor(selected)}>
                  <ScrollText size={14} /> Set your shared rhythm — a simple covenant you both keep
                </button>
              )}
            </div>

            {/* Watchword — the pair's shared daily verse (stage 2+) */}
            {stage >= 2 && (() => {
              const iRead = watchwordReads.some((w) => w.relationship_id === selected.id && w.profile_id === userId);
              const theyRead = watchwordReads.some((w) => w.relationship_id === selected.id && w.profile_id === info.otherId);
              return (
                <div className="disc-watchword">
                  <Sun size={15} />
                  <div className="disc-watchword-body">
                    <strong>Today&rsquo;s watchword: {todayWatchword.ref}</strong>
                    <span>{todayWatchword.theme}</span>
                  </div>
                  <div className="disc-watchword-status">
                    {iRead
                      ? <span className="read">✓ You read it</span>
                      : (
                        <button type="button" className="btn-secondary" onClick={() => markWatchwordRead(selected)}>
                          Read it
                        </button>
                      )}
                    {theyRead && <span className="read">✓ {otherName} read it</span>}
                  </div>
                </div>
              );
            })()}

            {/* Prayer thread — their current requests, and who prayed for yours (stage 2+) */}
            {stage >= 2 && (() => {
              const theirRequests = relCheckins.filter((c) => c.author_id !== userId && c.prayer).slice(0, 3);
              const myRequests = relCheckins.filter((c) => c.author_id === userId && c.prayer).slice(0, 2);
              if (!theirRequests.length && !myRequests.length) return null;
              return (
                <div className="disc-prayer-thread">
                  {theirRequests.length > 0 && (
                    <div>
                      <h3><Heart size={14} /> Praying for {otherName}</h3>
                      {theirRequests.map((c) => {
                        const tapped = prayerTaps.some((t) => t.checkin_id === c.id && t.author_id === userId);
                        return (
                          <div key={c.id} className="disc-prayer-row">
                            <p>&ldquo;{c.prayer}&rdquo; <span className="disc-muted">· {formatDateTime(c.created_at)}</span></p>
                            <button
                              type="button"
                              className={`disc-pray-btn ${tapped ? 'done' : ''}`}
                              onClick={() => tapPrayer(c)}
                              disabled={tapped}
                            >
                              {tapped ? '🙏 Prayed' : '🙏 I prayed for this'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {myRequests.some((c) => prayerTaps.some((t) => t.checkin_id === c.id && t.author_id !== userId)) && (
                    <p className="disc-prayer-echo">
                      🙏 {otherName} prayed for your request{myRequests.filter((c) => prayerTaps.some((t) => t.checkin_id === c.id && t.author_id !== userId)).length === 1 ? '' : 's'} recently.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Partner growth strip */}
            {partnerGrowth === 'hidden' ? (
              <p className="disc-growth disc-muted">
                {otherName} isn&rsquo;t sharing growth practices yet — or hasn&rsquo;t started a reading plan or memory deck on the Dashboard.
              </p>
            ) : partnerGrowth ? (
              <div className="disc-growth">
                {partnerGrowth.streak > 0 && (
                  <span className="disc-growth-item streak" title={`${otherName} has read ${partnerGrowth.streak} days in a row`}>
                    <Flame size={14} /> {partnerGrowth.streak}-day streak
                  </span>
                )}
                {partnerGrowth.plan && (
                  <span className="disc-growth-item" title={`${otherName}'s reading plan`}>
                    <BookOpenCheck size={14} /> {partnerGrowth.plan.name} — day {Math.min(partnerGrowth.completedDays + 1, partnerGrowth.plan.days)} of {partnerGrowth.plan.days}
                  </span>
                )}
                {partnerGrowth.verseCount > 0 && (
                  <span className="disc-growth-item" title={`${otherName}'s memory verse deck`}>
                    <Brain size={14} /> {partnerGrowth.verseCount} verse{partnerGrowth.verseCount === 1 ? '' : 's'}
                    {partnerGrowth.versesDue > 0 && ` (${partnerGrowth.versesDue} due)`}
                  </span>
                )}
                {partnerGrowth.plan && (
                  <button
                    type="button"
                    className="disc-read-together-btn"
                    onClick={() => handleReadTogether(selected)}
                    disabled={readTogetherState === 'sending' || readTogetherState === 'sent'}
                  >
                    {readTogetherState === 'sending' ? <Loader2 size={13} className="bl-spin" /> : <BookOpenCheck size={13} />}
                    {readTogetherState === 'sent' ? 'Invite sent!' : readTogetherState === 'error' ? 'Retry invite' : `Read ${partnerGrowth.plan.name} together`}
                  </button>
                )}
              </div>
            ) : null}

            {/* Pathway conversation guide */}
            {(() => {
              const session = nextSession(sessionsDone);
              if (!session) {
                return (
                  <div className="disc-guide done">
                    <p><PartyPopper size={15} /> You&rsquo;ve walked the whole pathway together — all 15 sessions. Time to help {otherName} start walking with someone new. 🌱</p>
                  </div>
                );
              }
              const stage = getStage(session.stage);
              return (
                <div className="disc-guide">
                  <div className="disc-guide-head">
                    <div>
                      <span className="disc-guide-stage">{stage.label} · Session {sessionNumber(session.id)} of {PATHWAY_SESSIONS.length}</span>
                      <h3>{session.title}</h3>
                      <p className="disc-guide-focus">{session.focus}</p>
                    </div>
                    <button type="button" className="disc-guide-passage" onClick={() => openPassage(session.passage)} title="Read this passage">
                      <BookOpenCheck size={14} /> {session.passage}
                    </button>
                  </div>

                  {guide ? (
                    <div className="disc-guide-content">
                      <p><em>Warm up:</em> {guide.opener}</p>
                      <ol>
                        {guide.questions.map((q, i) => <li key={i}>{q}</li>)}
                      </ol>
                      <p><em>This week:</em> {guide.practice}</p>
                    </div>
                  ) : (
                    <div className="disc-guide-actions">
                      <button type="button" className="btn-secondary icon-text-btn" onClick={() => fetchGuide(session)} disabled={guideLoading}>
                        {guideLoading ? <Loader2 size={14} className="bl-spin" /> : <BookOpenCheck size={14} />}
                        {guideLoading ? 'Preparing your guide…' : 'Open the conversation guide'}
                      </button>
                    </div>
                  )}
                  {guideError && <p className="disc-status error">{guideError}</p>}
                  {guide && (
                    <div className="disc-guide-actions">
                      <button type="button" className="btn-primary icon-text-btn" onClick={() => markSessionDone(session)} disabled={markingSession}>
                        <Check size={14} /> {markingSession ? 'Saving…' : 'We talked through this — mark it done'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Milestones */}
            <div className="disc-milestones">
              <div className="disc-milestones-head">
                <h3><PartyPopper size={15} /> Milestones</h3>
                <button type="button" className="btn-secondary" onClick={() => { setMilestoneOpen(true); setError(''); }}>
                  Celebrate a milestone
                </button>
              </div>
              {milestones.length === 0 ? (
                <p className="disc-muted">Nothing recorded yet — baptisms, first prayers, testimonies, leading a study… mark them as they happen.</p>
              ) : (
                <div className="disc-milestone-list">
                  {milestones.map((milestone) => {
                    const meta = milestoneMeta(milestone);
                    return (
                      <div key={milestone.id} className="disc-milestone">
                        <span className="disc-milestone-emoji">{meta.emoji}</span>
                        <div>
                          <strong>{personName(milestone.person_id)} · {meta.label}</strong>
                          <span>
                            {new Date(milestone.achieved_on + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {milestone.note && ` — ${milestone.note}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <form className="disc-checkin-form" onSubmit={submitCheckin}>
              {stage >= 2 && (
                <label className="disc-deeper-toggle" title="Wesley's band-meeting questions — a new set each week">
                  <input type="checkbox" checked={deeperOn} onChange={toggleDeeper} />
                  Go deeper this week
                </label>
              )}
              {composerPrompts.map((prompt) => (
                <label key={prompt.key}>
                  <span>{prompt.label}</span>
                  <textarea
                    rows={2}
                    value={composer[prompt.key]}
                    onChange={(e) => setComposer((cur) => ({ ...cur, [prompt.key]: e.target.value }))}
                    placeholder={prompt.placeholder}
                  />
                </label>
              ))}
              <div className="disc-checkin-actions">
                <span className="disc-muted">Only you and {otherName} can see this.</span>
                <button type="submit" className="btn-primary icon-text-btn" disabled={saving}>
                  <Send size={15} />
                  <span>{saving ? 'Sending…' : 'Share check-in'}</span>
                </button>
              </div>
            </form>

            <div className="disc-timeline">
              {relCheckins.length === 0 ? (
                <p className="disc-muted">No check-ins yet — share the first one above.</p>
              ) : relCheckins.map((checkin) => {
                const mine = checkin.author_id === userId;
                return (
                  <div key={checkin.id} className={`disc-checkin ${mine ? 'mine' : 'theirs'}`}>
                    <div className="disc-checkin-meta">
                      <strong>{mine ? 'You' : otherName}</strong>
                      <span>{formatDateTime(checkin.created_at)}</span>
                    </div>
                    {checkin.learning && <p><em>Learning:</em> {checkin.learning}</p>}
                    {checkin.struggle && <p><em>Struggling:</em> {checkin.struggle}</p>}
                    {checkin.prayer && <p><em>Pray for:</em> {checkin.prayer}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* My story — testimony built stage-by-stage (stage 3+) */}
      {stage >= 3 && (
        <DiscipleshipStory session={session} activeOrgId={activeOrgId} />
      )}

      {/* Legacy mail archive */}
      <section className="disc-archive">
        <button type="button" className="disc-archive-toggle" onClick={loadArchive}>
          <Archive size={14} />
          {archiveOpen ? 'Hide' : 'View'} legacy Discipleship Mail archive
        </button>
        {archiveOpen && (
          <div className="card disc-archive-list">
            {archiveMessages === null ? (
              <p className="disc-muted">Loading archive…</p>
            ) : archiveMessages.length === 0 ? (
              <p className="disc-muted">No archived mail.</p>
            ) : archiveMessages.map((message) => (
              <details key={message.id} className="disc-archive-item">
                <summary>
                  <Mail size={13} />
                  <span className="disc-archive-parties">
                    {message.sender_name || message.sender_email} → {message.recipient_name || message.recipient_email}
                  </span>
                  <span className="disc-archive-subject">{message.subject || '(No subject)'}</span>
                  <span className="disc-archive-date">{formatDateTime(message.sent_at)}</span>
                </summary>
                <p>{message.body}</p>
              </details>
            ))}
          </div>
        )}
      </section>

      {/* Invite modal */}
      {inviteOpen && (
        <div className="disc-modal-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setInviteOpen(false); }}>
          <div className="disc-modal card" role="dialog" aria-modal="true" aria-label="Invite someone">
            <div className="disc-modal-head">
              <h2><UserPlus size={18} /> Invite someone</h2>
              <button type="button" onClick={() => setInviteOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="disc-invite-mode" role="tablist" aria-label="Who are you inviting?">
              <button
                type="button"
                role="tab"
                aria-selected={inviteMode === 'member'}
                className={`disc-invite-mode-tab ${inviteMode === 'member' ? 'active' : ''}`}
                onClick={() => { setInviteMode('member'); setError(''); }}
              >
                <UserPlus size={14} /> A member
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={inviteMode === 'email'}
                className={`disc-invite-mode-tab ${inviteMode === 'email' ? 'active' : ''}`}
                onClick={() => { setInviteMode('email'); setError(''); }}
              >
                <Mail size={14} /> By email
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={inviteMode === 'link'}
                className={`disc-invite-mode-tab ${inviteMode === 'link' ? 'active' : ''}`}
                onClick={() => { setInviteMode('link'); setError(''); }}
              >
                <QrCode size={14} /> Share a link
              </button>
            </div>
            {inviteMode === 'member' && (
              <label>
                <span>Person</span>
                <select value={invitePersonId} onChange={(e) => setInvitePersonId(e.target.value)}>
                  <option value="">Choose a member…</option>
                  {members.filter((m) => !connectedIds.has(m.id)).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name || m.email}{openHandIds.has(m.id) ? ' 🙋 (open to connecting)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {inviteMode === 'email' && (
              <label>
                <span>Their email address</span>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="off"
                />
                <span className="disc-muted disc-invite-hint">
                  We&rsquo;ll email them simple sign-up steps with your organization&rsquo;s join code.
                  When they create an account with this address, you&rsquo;ll be connected automatically.
                </span>
              </label>
            )}
            {inviteMode === 'link' && (
              <div className="disc-share-link">
                <p className="disc-muted disc-invite-hint">
                  Standing next to them? Let them scan this code with their phone camera — it opens
                  sign-up with your organization&rsquo;s join code already filled in. Or copy the link
                  and text it to them.
                </p>
                {qrDataUrl && <img src={qrDataUrl} alt="Invitation QR code" className="disc-qr" />}
                <div className="disc-share-link-row">
                  <code>{inviteLink}</code>
                  <button type="button" className="btn-secondary" onClick={copyInviteLink}>
                    <Copy size={14} /> {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="disc-muted disc-invite-hint">
                  Once they&rsquo;re in, invite them from the &ldquo;A member&rdquo; tab — or have them invite you.
                </p>
              </div>
            )}
            {inviteMode !== 'link' && (
              <div className="disc-direction">
                <button
                  type="button"
                  className={`disc-direction-option ${inviteDirection === 'discipler' ? 'active' : ''}`}
                  onClick={() => setInviteDirection('discipler')}
                >
                  <strong>I'll disciple them</strong>
                  <span>You lead the rhythm and pray them forward.</span>
                </button>
                <button
                  type="button"
                  className={`disc-direction-option ${inviteDirection === 'disciple' ? 'active' : ''}`}
                  onClick={() => setInviteDirection('disciple')}
                >
                  <strong>I'm asking them to disciple me</strong>
                  <span>Invite someone you trust to walk with you.</span>
                </button>
                <button
                  type="button"
                  className={`disc-direction-option ${inviteDirection === 'peer' ? 'active' : ''}`}
                  onClick={() => setInviteDirection('peer')}
                >
                  <strong>We'll be accountability partners</strong>
                  <span>Two peers, side by side — no one leads, both grow.</span>
                </button>
              </div>
            )}
            {error && <p className="disc-status error">{error}</p>}
            <div className="disc-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setInviteOpen(false)}>
                {inviteMode === 'link' ? 'Done' : 'Cancel'}
              </button>
              {inviteMode !== 'link' && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={inviteMode === 'member' ? sendInvite : sendEmailInvite}
                  disabled={inviteSaving || (inviteMode === 'member' ? !invitePersonId : !inviteEmail.trim())}
                >
                  {inviteSaving ? 'Sending…' : inviteMode === 'member' ? 'Send invitation' : 'Email invitation'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Milestone modal */}
      {milestoneOpen && selected && (() => {
        const info = relationshipRole(selected, userId);
        return (
          <div className="disc-modal-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setMilestoneOpen(false); }}>
            <div className="disc-modal card" role="dialog" aria-modal="true" aria-label="Celebrate a milestone">
              <div className="disc-modal-head">
                <h2><PartyPopper size={18} /> Celebrate a milestone</h2>
                <button type="button" onClick={() => setMilestoneOpen(false)} aria-label="Close"><X size={18} /></button>
              </div>
              <label>
                <span>Who reached it?</span>
                <select
                  value={milestoneForm.personId || userId}
                  onChange={(e) => setMilestoneForm((cur) => ({ ...cur, personId: e.target.value }))}
                >
                  <option value={userId}>Me</option>
                  <option value={info.otherId}>{personName(info.otherId)}</option>
                </select>
              </label>
              <label>
                <span>Milestone</span>
                <select
                  value={milestoneForm.kind}
                  onChange={(e) => setMilestoneForm((cur) => ({ ...cur, kind: e.target.value }))}
                >
                  {MILESTONE_KINDS.map((k) => (
                    <option key={k.kind} value={k.kind}>{k.emoji} {k.label}</option>
                  ))}
                </select>
              </label>
              {milestoneForm.kind === 'custom' && (
                <label>
                  <span>Name it</span>
                  <input
                    type="text"
                    value={milestoneForm.label}
                    onChange={(e) => setMilestoneForm((cur) => ({ ...cur, label: e.target.value }))}
                    placeholder="e.g. Invited a friend to church"
                  />
                </label>
              )}
              <label>
                <span>Note (optional)</span>
                <input
                  type="text"
                  value={milestoneForm.note}
                  onChange={(e) => setMilestoneForm((cur) => ({ ...cur, note: e.target.value }))}
                  placeholder="A sentence to remember it by"
                />
              </label>
              {stage >= 3 && (
                <label className="disc-share-toggle">
                  <input
                    type="checkbox"
                    checked={!!milestoneForm.shared}
                    onChange={(e) => setMilestoneForm((cur) => ({ ...cur, shared: e.target.checked }))}
                  />
                  Celebrate with the whole community — everyone in your organization will see it
                </label>
              )}
              {error && <p className="disc-status error">{error}</p>}
              <div className="disc-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setMilestoneOpen(false)}>Cancel</button>
                <button type="button" className="btn-primary" onClick={recordMilestone} disabled={milestoneSaving}>
                  {milestoneSaving ? 'Saving…' : '🎉 Record it'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Onboarding walkthrough */}
      {/* Schedule a meet-up modal */}
      {scheduleFor && (() => {
        const otherName = personName(relationshipRole(scheduleFor, userId)?.otherId);
        const current = relationships.find((r) => r.id === scheduleFor.id) || scheduleFor;
        return (
          <div className="disc-modal-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setScheduleFor(null); }}>
            <div className="disc-modal card" role="dialog" aria-modal="true" aria-label="Plan a meet-up">
              <div className="disc-modal-head">
                <h2><CalendarPlus size={18} /> Plan a meet-up with {otherName}</h2>
                <button type="button" onClick={() => setScheduleFor(null)} aria-label="Close"><X size={18} /></button>
              </div>
              <p className="disc-muted">
                Pairs that meet early stay connected. Coffee, a meal, a walk — pick a time and put it on the calendar.
              </p>
              <label>
                <span>When</span>
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                />
              </label>
              {current.next_meeting_at && (
                <div className="disc-schedule-links">
                  <span className="disc-muted">Saved: {formatDateTime(current.next_meeting_at)}</span>
                  <a className="btn-secondary" href={googleCalendarUrl(meetingEvent(current))} target="_blank" rel="noreferrer">
                    Google Calendar
                  </a>
                  <button type="button" className="btn-secondary" onClick={() => downloadICS(meetingEvent(current))}>
                    Apple / Outlook (.ics)
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => { setScheduleFor(null); openDm(relationshipRole(current, userId)?.otherId); }}>
                    <MessageCircle size={14} /> Message them
                  </button>
                </div>
              )}
              {error && <p className="disc-status error">{error}</p>}
              <div className="disc-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setScheduleFor(null)}>
                  {current.next_meeting_at ? 'Done' : 'Maybe later'}
                </button>
                <button type="button" className="btn-primary" onClick={saveSchedule} disabled={!scheduleAt || scheduleSaving}>
                  {scheduleSaving ? 'Saving…' : 'Save meet-up'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Covenant editor modal */}
      {covenantOpen && selected && (
        <div className="disc-modal-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setCovenantOpen(false); }}>
          <div className="disc-modal card" role="dialog" aria-modal="true" aria-label="Your shared covenant">
            <div className="disc-modal-head">
              <h2><ScrollText size={18} /> Your shared rhythm</h2>
              <button type="button" onClick={() => setCovenantOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <p className="disc-muted">
              A covenant is a few simple commitments you both keep — chosen, named, and modest.
              Pick two or three; a rhythm you&rsquo;ll actually keep beats an ambitious one you won&rsquo;t.
            </p>
            <div className="disc-covenant-options">
              {COVENANT_OPTIONS.map((option) => (
                <label key={option.key} className="disc-covenant-option">
                  <input
                    type="checkbox"
                    checked={covenantDraft.includes(option.key)}
                    onChange={(e) => setCovenantDraft((cur) => (
                      e.target.checked ? [...cur, option.key] : cur.filter((k) => k !== option.key)
                    ))}
                  />
                  <span>{option.emoji} {option.label}</span>
                </label>
              ))}
            </div>
            {error && <p className="disc-status error">{error}</p>}
            <div className="disc-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setCovenantOpen(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={saveCovenant}>Save covenant</button>
            </div>
          </div>
        </div>
      )}

      {showOnboarding && <DiscipleshipOnboarding onClose={() => setShowOnboarding(false)} />}
    </div>
  );
}
