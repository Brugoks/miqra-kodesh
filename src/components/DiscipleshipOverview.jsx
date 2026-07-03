import { useEffect, useMemo, useState } from 'react';
import { HeartHandshake, Users, Sprout, MoonStar, RefreshCw, Sparkles, Hand, Network } from 'lucide-react';
import './DiscipleshipOverview.css';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { daysSince } from '../lib/discipleship';
import { PATHWAY_SESSIONS } from '../lib/discipleshipPathway';

// Leader view of the org's discipleship network: coverage, quiet pairs,
// multiplication, matchmaking, and the generation tree. Shows pairing
// structure and activity recency only — the discipleship_org_overview RPC
// never exposes check-in content.

// A pair is "quiet" with no check-in for 2× its cadence (min 21 days).
function isQuiet(rel) {
  const threshold = Math.max(21, (rel.cadenceDays || 7) * 2);
  const days = daysSince(rel.lastCheckinAt || rel.createdAt);
  return days != null && days >= threshold;
}

const SEEKING_LABELS = {
  discipler: '🙋 wants a discipler',
  disciple: '🌱 willing to disciple',
  peer: '🤝 wants a soul friend',
};

export default function DiscipleshipOverview({ activeOrgId }) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [openHands, setOpenHands] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestForm, setSuggestForm] = useState({ disciplerId: '', discipleId: '', kind: 'discipleship' });
  const [suggestStatus, setSuggestStatus] = useState('');
  const [suggestSaving, setSuggestSaving] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);

  const load = () => {
    if (!hasSupabaseConfig || !activeOrgId) return Promise.resolve();
    return Promise.all([
      supabase.rpc('discipleship_org_overview', { org_id: activeOrgId }),
      supabase.rpc('org_members', { org_id: activeOrgId }).order('full_name', { ascending: true }),
      supabase.from('discipleship_availability').select('*').eq('organization_id', activeOrgId),
    ]).then(([overviewResult, memberResult, handsResult]) => {
      if (overviewResult.error) {
        setError(overviewResult.error.message || 'Could not load the discipleship overview.');
      } else {
        setOverview(overviewResult.data);
      }
      setMembers(memberResult.data || []);
      setOpenHands(handsResult.data || []);
      setLoading(false);
    });
  };

  useEffect(() => {
    Promise.resolve().then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  const memberName = useMemo(() => {
    const map = new Map(members.map((m) => [m.id, m.full_name || m.email || 'Unknown']));
    return (id) => map.get(id) || 'Unknown';
  }, [members]);

  const suggestPairing = async () => {
    if (!suggestForm.disciplerId || !suggestForm.discipleId || suggestSaving) return;
    if (suggestForm.disciplerId === suggestForm.discipleId) {
      setSuggestStatus('Pick two different people.');
      return;
    }
    setSuggestSaving(true);
    setSuggestStatus('');
    const { data: { session } } = await supabase.auth.getSession();
    const { error: suggestError } = await supabase.from('discipleship_suggestions').insert({
      organization_id: activeOrgId,
      suggested_by: session?.user?.id,
      discipler_id: suggestForm.disciplerId,
      disciple_id: suggestForm.discipleId,
      kind: suggestForm.kind,
    });
    if (suggestError) {
      setSuggestStatus(suggestError.message || 'Could not send the suggestion.');
    } else {
      setSuggestStatus('Suggestion sent — both people will see it on their Discipleship page.');
      setSuggestForm({ disciplerId: '', discipleId: '', kind: 'discipleship' });
    }
    setSuggestSaving(false);
  };

  if (loading) return <p className="disc-ov-muted">Loading discipleship overview…</p>;
  if (error) return <p className="disc-ov-muted">{error}</p>;
  if (!overview) return null;

  const relationships = overview.relationships || [];
  const activeRels = relationships.filter((r) => r.status === 'active');
  const notConnected = overview.notConnected || [];
  const quiet = activeRels.filter(isQuiet);

  // Multipliers: people who are being discipled in one pair and discipling in another.
  const hierarchyRels = activeRels.filter((r) => r.kind !== 'peer');
  const disciplerIds = new Set(hierarchyRels.map((r) => r.disciplerId));
  const multipliers = new Set(hierarchyRels.filter((r) => disciplerIds.has(r.discipleId)).map((r) => r.discipleId));

  const connectedCount = new Set(activeRels.flatMap((r) => [r.disciplerId, r.discipleId])).size;

  // Generation tree (2 Tim 2:2): who discipled whom, down the generations.
  const childrenOf = new Map();
  for (const rel of hierarchyRels) {
    if (!childrenOf.has(rel.disciplerId)) childrenOf.set(rel.disciplerId, []);
    childrenOf.get(rel.disciplerId).push(rel);
  }
  const discipledIds = new Set(hierarchyRels.map((r) => r.discipleId));
  const roots = [...new Set(hierarchyRels.map((r) => r.disciplerId))].filter((id) => !discipledIds.has(id));

  const renderTree = (personId, name, visited) => {
    if (visited.has(personId)) return null;
    const nextVisited = new Set(visited).add(personId);
    const children = childrenOf.get(personId) || [];
    return (
      <li key={personId}>
        <span className="disc-ov-tree-name">
          {name}
          {multipliers.has(personId) && <span title="A multiplier — discipled, now discipling"> 🌱</span>}
        </span>
        {children.length > 0 && (
          <ul>
            {children.map((rel) => renderTree(rel.discipleId, rel.discipleName, nextVisited))}
          </ul>
        )}
      </li>
    );
  };

  const openHandName = (hand) => memberName(hand.profile_id);

  return (
    <section className="card disc-ov">
      <div className="disc-ov-head">
        <h2><HeartHandshake size={18} /> Discipleship Network</h2>
        <button type="button" className="btn-secondary" onClick={() => { setLoading(true); load(); }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      <p className="disc-ov-muted">
        Pairings and rhythm health only — check-in conversations stay private between the two people.
      </p>

      <div className="disc-ov-stats">
        <div className="disc-ov-stat">
          <strong>{connectedCount}</strong>
          <span><Users size={13} /> in a relationship</span>
        </div>
        <div className="disc-ov-stat">
          <strong>{notConnected.length}</strong>
          <span>not yet connected</span>
        </div>
        <div className={`disc-ov-stat ${quiet.length ? 'warn' : ''}`}>
          <strong>{quiet.length}</strong>
          <span><MoonStar size={13} /> gone quiet</span>
        </div>
        <div className="disc-ov-stat good">
          <strong>{multipliers.size}</strong>
          <span><Sprout size={13} /> multipliers</span>
        </div>
      </div>

      {/* Open hands: people who raised their hand and are waiting */}
      {openHands.length > 0 && (
        <div className="disc-ov-hands">
          <h3><Hand size={14} /> Open hands — waiting to be connected</h3>
          <div className="disc-ov-chips">
            {openHands.map((hand) => (
              <span key={hand.profile_id} className="disc-ov-chip hand">
                {openHandName(hand)} · {SEEKING_LABELS[hand.seeking] || hand.seeking}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Matchmaking */}
      <div className="disc-ov-suggest">
        <button type="button" className="btn-secondary" onClick={() => { setSuggestOpen((c) => !c); setSuggestStatus(''); }}>
          <Sparkles size={14} /> {suggestOpen ? 'Close matchmaking' : 'Suggest a pairing'}
        </button>
        {suggestOpen && (
          <div className="disc-ov-suggest-form">
            <p className="disc-ov-muted">
              Both people get a gentle nudge — &ldquo;a leader thinks you two would walk well
              together&rdquo; — and either can turn it into an invitation with one tap.
            </p>
            <div className="disc-ov-suggest-fields">
              <label>
                {suggestForm.kind === 'peer' ? 'First person' : 'Discipler'}
                <select value={suggestForm.disciplerId} onChange={(e) => setSuggestForm((c) => ({ ...c, disciplerId: e.target.value }))}>
                  <option value="">Choose…</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                </select>
              </label>
              <label>
                {suggestForm.kind === 'peer' ? 'Second person' : 'Disciple'}
                <select value={suggestForm.discipleId} onChange={(e) => setSuggestForm((c) => ({ ...c, discipleId: e.target.value }))}>
                  <option value="">Choose…</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                </select>
              </label>
              <label>
                Kind
                <select value={suggestForm.kind} onChange={(e) => setSuggestForm((c) => ({ ...c, kind: e.target.value }))}>
                  <option value="discipleship">Discipler → disciple</option>
                  <option value="peer">Soul friends (peers)</option>
                </select>
              </label>
              <button
                type="button"
                className="btn-primary"
                onClick={suggestPairing}
                disabled={suggestSaving || !suggestForm.disciplerId || !suggestForm.discipleId}
              >
                {suggestSaving ? 'Sending…' : 'Send suggestion'}
              </button>
            </div>
            {suggestStatus && <p className="disc-ov-muted">{suggestStatus}</p>}
          </div>
        )}
      </div>

      {relationships.length === 0 ? (
        <p className="disc-ov-muted">No discipleship relationships yet. Encourage a few leaders to invite someone from the Discipleship page — the network starts with one pair.</p>
      ) : (
        <div className="dev-table-wrap">
          <table className="disc-ov-table">
            <thead>
              <tr>
                <th>Discipler</th>
                <th>Walking with</th>
                <th>Status</th>
                <th>Last check-in</th>
                <th>Check-ins</th>
                <th>Pathway</th>
                <th>Milestones</th>
              </tr>
            </thead>
            <tbody>
              {relationships.map((rel) => {
                const quietPair = rel.status === 'active' && isQuiet(rel);
                const days = daysSince(rel.lastCheckinAt);
                return (
                  <tr key={rel.id} className={quietPair ? 'quiet' : ''}>
                    <td>
                      <strong>{rel.disciplerName}</strong>
                      {rel.kind === 'peer' && <span className="disc-ov-badge peer" title="Soul friends — no hierarchy"> 🤝 peers</span>}
                      {rel.kind !== 'peer' && multipliers.has(rel.disciplerId) && <span className="disc-ov-sprout" title="Also being discipled — a multiplier"> 🌱</span>}
                    </td>
                    <td>{rel.discipleName}</td>
                    <td>
                      {rel.status === 'invited'
                        ? <span className="disc-ov-badge pending">Invited</span>
                        : quietPair
                          ? <span className="disc-ov-badge quiet">Quiet</span>
                          : <span className="disc-ov-badge active">Active</span>}
                    </td>
                    <td>{days == null ? '—' : days === 0 ? 'Today' : `${days}d ago`}</td>
                    <td>{rel.checkinCount}</td>
                    <td>{rel.sessionsDone} / {PATHWAY_SESSIONS.length}</td>
                    <td>{rel.milestoneCount > 0 ? `🎉 ${rel.milestoneCount}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Generation tree */}
      {roots.length > 0 && (
        <div className="disc-ov-tree">
          <button type="button" className="btn-secondary" onClick={() => setTreeOpen((c) => !c)}>
            <Network size={14} /> {treeOpen ? 'Hide generation tree' : 'Show generation tree'}
          </button>
          {treeOpen && (
            <>
              <p className="disc-ov-muted">
                Who discipled whom, down the generations (2 Timothy 2:2). 🌱 marks multipliers.
              </p>
              <ul className="disc-ov-tree-root">
                {roots.map((rootId) => renderTree(
                  rootId,
                  hierarchyRels.find((r) => r.disciplerId === rootId)?.disciplerName || memberName(rootId),
                  new Set(),
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {notConnected.length > 0 && (
        <div className="disc-ov-unconnected">
          <h3>Not yet in a discipleship relationship</h3>
          <div className="disc-ov-chips">
            {notConnected.map((person) => (
              <span key={person.id} className="disc-ov-chip">{person.name}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
