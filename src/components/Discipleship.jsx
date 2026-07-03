import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Discipleship.css';
import {
  Archive,
  BookOpenCheck,
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Flame,
  HandHeart,
  Heart,
  HeartHandshake,
  HelpCircle,
  Loader2,
  Mail,
  MessageCircle,
  PartyPopper,
  PenLine,
  Send,
  UserPlus,
  X,
} from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { relationshipRole, checkInDue, lastCheckinLabel } from '../lib/discipleship';
import { getPlan, computeStreak } from '../lib/readingPlans';
import Avatar from './ui/Avatar';
import DiscipleshipOnboarding, { ONBOARDING_KEY } from './DiscipleshipOnboarding';

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
  const [invitePersonId, setInvitePersonId] = useState('');
  const [inviteDirection, setInviteDirection] = useState('discipler'); // my role in the new relationship
  const [inviteSaving, setInviteSaving] = useState(false);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveMessages, setArchiveMessages] = useState(null);

  // Phase 2: partner growth, milestones, onboarding
  const [partnerGrowth, setPartnerGrowth] = useState(null); // { plan, completedDays, streak, verseCount, versesDue } | 'hidden'
  const [milestones, setMilestones] = useState([]);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState({ kind: 'baptism', personId: '', label: '', note: '' });
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
    ]).then(async ([relResult, memberResult]) => {
      if (relResult.error) {
        setError(relResult.error.message || 'Could not load discipleship relationships.');
        setLoading(false);
        return;
      }
      const rels = relResult.data || [];
      setRelationships(rels);
      setMembers(memberResult.data || []);

      if (rels.length) {
        const { data: checkinData } = await supabase
          .from('discipleship_checkins')
          .select('*')
          .in('relationship_id', rels.map((r) => r.id))
          .order('created_at', { ascending: false })
          .limit(300);
        setCheckins(checkinData || []);
      } else {
        setCheckins([]);
      }
      setLoading(false);
    });
  }, [isConfigured, activeOrgId]);

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

  // ── Actions ──────────────────────────────────────────────────
  const sendInvite = async () => {
    if (!invitePersonId || inviteSaving) return;
    setInviteSaving(true);
    setError('');
    const { error: inviteError } = await supabase.from('discipleship_relationships').insert({
      organization_id: activeOrgId,
      discipler_id: inviteDirection === 'discipler' ? userId : invitePersonId,
      disciple_id: inviteDirection === 'discipler' ? invitePersonId : userId,
      created_by: userId,
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
    ]).then(([enrollRes, progressRes, versesRes, milestonesRes]) => {
      if (cancelled) return;
      setMilestones(milestonesRes.data || []);

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
      })
      .select('*')
      .single();
    if (milestoneError) {
      setError(milestoneError.message || 'Could not record the milestone.');
    } else {
      setMilestones((cur) => [data, ...cur]);
      setMilestoneOpen(false);
      setMilestoneForm({ kind: 'baptism', personId: '', label: '', note: '' });
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
                  {iAmDiscipler
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
        ) : active.length === 0 && invitesISent.length === 0 ? (
          <div className="card disc-empty">
            <HandHeart size={30} />
            <p>No discipleship relationships yet.</p>
            <p className="disc-muted">Invite someone to disciple — or ask someone you trust to disciple you. Everything here stays between the two of you.</p>
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
              </div>
            ) : null}

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
              {CHECKIN_PROMPTS.map((prompt) => (
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
            <label>
              <span>Person</span>
              <select value={invitePersonId} onChange={(e) => setInvitePersonId(e.target.value)}>
                <option value="">Choose a member…</option>
                {members.filter((m) => !connectedIds.has(m.id)).map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                ))}
              </select>
            </label>
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
            </div>
            {error && <p className="disc-status error">{error}</p>}
            <div className="disc-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setInviteOpen(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={sendInvite} disabled={!invitePersonId || inviteSaving}>
                {inviteSaving ? 'Sending…' : 'Send invitation'}
              </button>
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
      {showOnboarding && <DiscipleshipOnboarding onClose={() => setShowOnboarding(false)} />}
    </div>
  );
}
