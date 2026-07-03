// Pure helpers for discipleship relationships and check-in rhythms, shared by
// the Discipleship page and the Chat DM deep-link.

const DAY_MS = 24 * 60 * 60 * 1000;

// The other participant's id and my role within a relationship.
export function relationshipRole(rel, userId) {
  if (rel.discipler_id === userId) {
    return { role: 'discipler', otherId: rel.disciple_id, roleLabel: 'You disciple' };
  }
  if (rel.disciple_id === userId) {
    return { role: 'disciple', otherId: rel.discipler_id, roleLabel: 'Discipling you' };
  }
  return null;
}

// A check-in is due when the author's last check-in (or the relationship
// start, for brand-new pairings) is older than the cadence.
export function checkInDue(lastCheckinAt, anchorAt, cadenceDays, now = new Date()) {
  const reference = lastCheckinAt || anchorAt;
  if (!reference) return true;
  return now.getTime() - new Date(reference).getTime() >= (cadenceDays || 7) * DAY_MS;
}

export function daysSince(iso, now = new Date()) {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);
}

export function lastCheckinLabel(iso, now = new Date()) {
  const days = daysSince(iso, now);
  if (days == null) return 'No check-ins yet';
  if (days === 0) return 'Checked in today';
  if (days === 1) return 'Checked in yesterday';
  return `Last check-in ${days} days ago`;
}

// Deterministic private-channel name for a two-person DM, so the same pair
// always resolves to the same channel regardless of who starts it.
export function dmChannelName(userIdA, userIdB) {
  const [a, b] = [String(userIdA).slice(0, 8), String(userIdB).slice(0, 8)].sort();
  return `dm-${a}-${b}`;
}
