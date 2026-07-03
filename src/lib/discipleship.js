// Pure helpers for discipleship relationships and check-in rhythms, shared by
// the Discipleship page and the Chat DM deep-link.

const DAY_MS = 24 * 60 * 60 * 1000;

// The other participant's id and my role within a relationship. Peer
// ("soul friend") relationships have no hierarchy — both sides are equals.
export function relationshipRole(rel, userId) {
  if (rel.kind === 'peer') {
    if (rel.discipler_id === userId) return { role: 'peer', otherId: rel.disciple_id, roleLabel: 'Soul friend' };
    if (rel.disciple_id === userId) return { role: 'peer', otherId: rel.discipler_id, roleLabel: 'Soul friend' };
    return null;
  }
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

// ── Progressive disclosure: the experience ladder ────────────────────────────
// Features surface as a user shows readiness, so day one is never overwhelming.
//   0 Connect     — no relationship yet: hand-raise, suggestions, invites only
//   1 First steps — connected: check-ins, first meet-up, covenant
//   2 Rhythm      — 3+ check-ins authored: watchword, prayer thread, deeper questions
//   3 Growth      — 5+ pathway sessions in a relationship: story builder, celebrations
export function discipleshipStage({ hasRelationship, myCheckinCount = 0, maxSessionsDone = 0 }) {
  if (!hasRelationship) return 0;
  if (maxSessionsDone >= 5) return 3;
  if (myCheckinCount >= 3) return 2;
  return 1;
}

export const STAGE_UNLOCKS = {
  1: 'You’re connected! Check-ins, your first meet-up, and a shared covenant are now open.',
  2: 'New rhythm tools unlocked: a daily watchword, a prayer thread, and deeper questions.',
  3: 'Growth tools unlocked: start writing your story, and celebrate milestones with your community.',
};

// ── Covenant (rule of life) — Benedictine practice, kept modest ─────────────
export const COVENANT_OPTIONS = [
  { key: 'daily_word', emoji: '📖', label: 'Read Scripture daily' },
  { key: 'weekly_prayer', emoji: '🙏', label: 'Pray for each other weekly' },
  { key: 'monthly_meal', emoji: '🍞', label: 'Share a meal monthly' },
  { key: 'meet_in_person', emoji: '🤝', label: 'Meet in person, not just online' },
  { key: 'memorize_verse', emoji: '🧠', label: 'Memorize one verse a month' },
  { key: 'honest_answers', emoji: '💬', label: 'Answer check-ins honestly' },
];

export function covenantLabel(key) {
  const option = COVENANT_OPTIONS.find((o) => o.key === key);
  return option ? `${option.emoji} ${option.label}` : null;
}

// ── Watchword — a shared daily verse (Moravian Losungen, 1728–today) ────────
export const WATCHWORDS = [
  { ref: 'Psalm 23:1', theme: 'The Lord is my shepherd; I shall not want.' },
  { ref: 'Lamentations 3:22-23', theme: 'His mercies are new every morning.' },
  { ref: 'Proverbs 3:5-6', theme: 'Trust in the Lord with all your heart.' },
  { ref: 'Isaiah 41:10', theme: 'Fear not, for I am with you.' },
  { ref: 'Matthew 11:28', theme: 'Come to me, all who are weary.' },
  { ref: 'John 15:5', theme: 'Apart from me you can do nothing.' },
  { ref: 'Romans 8:28', theme: 'God works all things for good.' },
  { ref: 'Philippians 4:6-7', theme: 'Do not be anxious about anything.' },
  { ref: 'Psalm 46:10', theme: 'Be still, and know that I am God.' },
  { ref: 'Micah 6:8', theme: 'Act justly, love mercy, walk humbly.' },
  { ref: 'Joshua 1:9', theme: 'Be strong and courageous.' },
  { ref: 'Psalm 119:105', theme: 'Your word is a lamp to my feet.' },
  { ref: 'Galatians 2:20', theme: 'It is no longer I who live, but Christ.' },
  { ref: '2 Corinthians 5:17', theme: 'The old has gone, the new has come.' },
  { ref: 'Hebrews 12:1-2', theme: 'Run with endurance, eyes fixed on Jesus.' },
  { ref: 'Colossians 3:12', theme: 'Clothe yourselves with compassion.' },
  { ref: 'James 1:19', theme: 'Quick to listen, slow to speak.' },
  { ref: '1 John 4:19', theme: 'We love because he first loved us.' },
  { ref: 'Psalm 34:8', theme: 'Taste and see that the Lord is good.' },
  { ref: 'Isaiah 40:31', theme: 'Those who wait on the Lord renew their strength.' },
  { ref: 'Matthew 5:16', theme: 'Let your light shine before others.' },
  { ref: 'John 13:34-35', theme: 'Love one another as I have loved you.' },
  { ref: 'Romans 12:2', theme: 'Be transformed by the renewing of your mind.' },
  { ref: 'Ephesians 2:8-9', theme: 'By grace you have been saved, through faith.' },
  { ref: 'Philippians 1:6', theme: 'He who began a good work will complete it.' },
  { ref: 'Psalm 121:1-2', theme: 'My help comes from the Lord.' },
  { ref: 'Jeremiah 29:11', theme: 'Plans to give you a future and a hope.' },
  { ref: 'Matthew 6:33', theme: 'Seek first the kingdom of God.' },
  { ref: '2 Timothy 1:7', theme: 'A spirit of power, love, and self-control.' },
  { ref: 'Psalm 90:12', theme: 'Teach us to number our days.' },
  { ref: 'Galatians 6:9', theme: 'Do not grow weary of doing good.' },
];

// Deterministic pick by date so every pair sees the same watchword today.
export function watchwordForDate(date = new Date()) {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / DAY_MS);
  return WATCHWORDS[dayOfYear % WATCHWORDS.length];
}

export function localDateISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ── Deeper questions — Wesley's band meetings (1740s), rotated weekly ────────
// Each set still maps onto the three check-in columns (learning / struggle /
// prayer) so the data model and history stay unchanged.
export const BAND_QUESTION_SETS = [
  [
    { key: 'learning', label: 'How is it with your soul?', placeholder: 'Honestly — not how the week went, but how you are.' },
    { key: 'struggle', label: 'What temptations have you met with?', placeholder: 'Where were you pulled this week?' },
    { key: 'prayer', label: 'How were you delivered — and where do you still need help?', placeholder: 'Name it so we can pray it.' },
  ],
  [
    { key: 'learning', label: 'Where did you notice God this week?', placeholder: 'A moment, a person, a verse that landed…' },
    { key: 'struggle', label: 'What have you thought, said, or done that you doubt?', placeholder: 'Wesley’s question — say the true thing.' },
    { key: 'prayer', label: 'What is God asking of you next?', placeholder: 'One concrete step to pray toward.' },
  ],
  [
    { key: 'learning', label: 'What are you thankful for right now?', placeholder: 'Gratitude first — even in a hard week.' },
    { key: 'struggle', label: 'What are you carrying that no one knows about?', placeholder: 'This stays between the two of you.' },
    { key: 'prayer', label: 'Who are you praying for — and how can I join you?', placeholder: 'Someone outside this relationship.' },
  ],
  [
    { key: 'learning', label: 'What has Scripture said to you this week?', placeholder: 'A passage that read you back.' },
    { key: 'struggle', label: 'Where did you hold back from obedience?', placeholder: 'The step you saw and didn’t take.' },
    { key: 'prayer', label: 'What would freedom look like — pray it with me?', placeholder: 'Ask boldly.' },
  ],
];

// Deterministic set for the ISO week, so both partners see the same questions.
export function bandPromptsForWeek(date = new Date()) {
  const week = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / (7 * DAY_MS));
  return BAND_QUESTION_SETS[week % BAND_QUESTION_SETS.length];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// The invitation email for someone who isn't in the app yet. The magic link
// pre-fills the org join code at sign-up (?invite=CODE); the numbered steps
// and the code itself are the fallback for people whose email client mangles
// the button. Written for non-tech-savvy readers: one action per step.
export function buildDiscipleshipInviteEmail({ inviterName, orgName, inviteCode, appOrigin, inviterRole, inviteeEmail }) {
  const joinUrl = `${appOrigin}/?invite=${encodeURIComponent(inviteCode)}`;
  const invitation = inviterRole === 'peer'
    ? `${inviterName} is inviting you to be soul friends — two people walking side by side, praying for each other, and growing in faith together.`
    : inviterRole === 'discipler'
      ? `${inviterName} would like to walk with you in discipleship — meeting regularly, praying for each other, and growing in faith together.`
      : `${inviterName} is asking you to disciple them — walking together, praying for each other, and growing in faith.`;

  const subject = `${inviterName} invited you to join ${orgName}`;

  const html = `<div style="max-width:520px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.55;">
  <p>Hi,</p>
  <p>${escapeHtml(invitation)}</p>
  <p>To get connected, join <strong>${escapeHtml(orgName)}</strong> on Miqra Kodesh. It only takes a couple of minutes:</p>
  <p style="text-align:center;margin:1.75rem 0;">
    <a href="${escapeHtml(joinUrl)}" style="display:inline-block;background:#2e52be;color:#ffffff;font-weight:bold;font-size:1.05rem;padding:0.85rem 2rem;border-radius:8px;text-decoration:none;">Accept your invitation</a>
  </p>
  <p>Tapping the button opens the sign-up page with everything filled in for you. Then:</p>
  <ol style="padding-left:1.25rem;">
    <li>Choose <strong>Create New Account</strong>.</li>
    <li>Sign up using <strong>this email address</strong> (${escapeHtml(inviteeEmail)}) — that's how we connect you with ${escapeHtml(inviterName)} automatically.</li>
    <li>Once you're in, open the <strong>Discipleship</strong> page and accept ${escapeHtml(inviterName)}'s invitation.</li>
  </ol>
  <p>If the button doesn't work, go to <a href="${escapeHtml(appOrigin)}">${escapeHtml(appOrigin)}</a>, choose <strong>Create New Account</strong>, and enter this organization join code when asked:</p>
  <p style="text-align:center;margin:1.25rem 0;"><span style="display:inline-block;background:#f3f4f6;border:1px dashed #9ca3af;border-radius:8px;padding:0.6rem 1.4rem;font-size:1.15rem;font-weight:bold;letter-spacing:0.08em;">${escapeHtml(inviteCode)}</span></p>
  <p>— ${escapeHtml(orgName)}, via Miqra Kodesh</p>
</div>`;

  const text = `Hi,

${invitation}

To get connected, join ${orgName} on Miqra Kodesh:

1. Open this link: ${joinUrl}
2. Choose "Create New Account" and sign up using this email address (${inviteeEmail}) — that's how we connect you with ${inviterName} automatically.
3. If asked for an organization join code, enter: ${inviteCode}
4. Once you're in, open the Discipleship page and accept ${inviterName}'s invitation.

— ${orgName}, via Miqra Kodesh`;

  return { subject, html, text };
}
