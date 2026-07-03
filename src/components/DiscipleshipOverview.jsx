import { useEffect, useState } from 'react';
import { HeartHandshake, Users, Sprout, MoonStar, RefreshCw } from 'lucide-react';
import './DiscipleshipOverview.css';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { daysSince } from '../lib/discipleship';
import { PATHWAY_SESSIONS } from '../lib/discipleshipPathway';

// Leader view of the org's discipleship network: coverage, quiet pairs, and
// multiplication. Shows pairing structure and activity recency only — the
// discipleship_org_overview RPC never exposes check-in content.

// A pair is "quiet" with no check-in for 2× its cadence (min 21 days).
function isQuiet(rel) {
  const threshold = Math.max(21, (rel.cadenceDays || 7) * 2);
  const days = daysSince(rel.lastCheckinAt || rel.createdAt);
  return days != null && days >= threshold;
}

export default function DiscipleshipOverview({ activeOrgId }) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!hasSupabaseConfig || !activeOrgId) return Promise.resolve();
    return supabase.rpc('discipleship_org_overview', { org_id: activeOrgId })
      .then(({ data, error: rpcError }) => {
        if (rpcError) {
          setError(rpcError.message || 'Could not load the discipleship overview.');
        } else {
          setOverview(data);
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    Promise.resolve().then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  if (loading) return <p className="disc-ov-muted">Loading discipleship overview…</p>;
  if (error) return <p className="disc-ov-muted">{error}</p>;
  if (!overview) return null;

  const relationships = overview.relationships || [];
  const activeRels = relationships.filter((r) => r.status === 'active');
  const notConnected = overview.notConnected || [];
  const quiet = activeRels.filter(isQuiet);

  // Multipliers: people who are being discipled in one pair and discipling in another.
  const disciplerIds = new Set(activeRels.map((r) => r.disciplerId));
  const multipliers = new Set(activeRels.filter((r) => disciplerIds.has(r.discipleId)).map((r) => r.discipleId));

  const connectedCount = new Set(activeRels.flatMap((r) => [r.disciplerId, r.discipleId])).size;

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
                      {multipliers.has(rel.disciplerId) && <span className="disc-ov-sprout" title="Also being discipled — a multiplier"> 🌱</span>}
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
