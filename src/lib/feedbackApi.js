import { hasSupabaseConfig, supabase } from './supabaseClient';

// ---------------------------------------------------------------------------
// Constants shared by the feedback UI
// ---------------------------------------------------------------------------

export const FEEDBACK_CATEGORIES = [
  { value: 'bug', label: 'Bug Report' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'other', label: 'Other' },
];

export const FEEDBACK_APP_AREAS = [
  { value: 'home', label: 'Home' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'bible_study', label: 'Bible Study' },
  { value: 'fellowship', label: 'Fellowship' },
  { value: 'sermons', label: 'Sermons' },
  { value: 'discipleship', label: 'Discipleship' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'leader_portal', label: 'Leader Portal' },
  { value: 'admin_portal', label: 'Admin Portal' },
  { value: 'other', label: 'Other' },
];

export const FEEDBACK_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'declined', label: 'Declined' },
];

export const FEEDBACK_PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export function categoryLabel(value) {
  return FEEDBACK_CATEGORIES.find((c) => c.value === value)?.label || value;
}

export function appAreaLabel(value) {
  return FEEDBACK_APP_AREAS.find((a) => a.value === value)?.label || value;
}

// Badge text for a ticket — surfaces the free-text detail when "Other" was chosen.
export function categoryDisplay(ticket) {
  return ticket.category === 'other' && ticket.category_detail
    ? `Other: ${ticket.category_detail}`
    : categoryLabel(ticket.category);
}

export function appAreaDisplay(ticket) {
  return ticket.app_area === 'other' && ticket.app_area_detail
    ? `Other: ${ticket.app_area_detail}`
    : appAreaLabel(ticket.app_area);
}

export function statusLabel(value) {
  return FEEDBACK_STATUSES.find((s) => s.value === value)?.label || value;
}

const PRIORITY_WEIGHTS = { critical: 400, high: 200, medium: 80, low: 20 };

const SCREENSHOT_BUCKET = 'feedback-screenshots';

const LS_TICKETS = 'miqra_feedback_tickets';
const LS_VOTES = 'miqra_feedback_votes';
const LS_COMMENTS = 'miqra_feedback_comments';
const LS_EVENTS = 'miqra_feedback_events';

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

export function computeRankScore(votes, priority) {
  return votes * 5 + (PRIORITY_WEIGHTS[priority] || 0);
}

// Parse react-mentions markup "@[Display Name](uuid)" into the uuid array.
export function parseMentions(body) {
  const ids = [];
  const regex = /@\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(body || '')) !== null) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
}

// Interleave comments and events into one chronological timeline.
export function mergeTimeline(comments, events) {
  const tagged = [
    ...(comments || []).map((c) => ({ ...c, kind: 'comment' })),
    ...(events || []).map((e) => ({ ...e, kind: 'event' })),
  ];
  return tagged.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

function sortBoard(rows, sort) {
  const sorted = [...rows];
  if (sort === 'new') {
    sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (sort === 'top') {
    sorted.sort((a, b) => b.votes - a.votes || new Date(b.created_at) - new Date(a.created_at));
  } else {
    sorted.sort((a, b) => b.rank_score - a.rank_score || b.votes - a.votes
      || new Date(b.created_at) - new Date(a.created_at));
  }
  return sorted;
}

// ---------------------------------------------------------------------------
// localStorage fallback (used when Supabase isn't configured)
// ---------------------------------------------------------------------------

function lsRead(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function lsWrite(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function lsBoardRows() {
  const tickets = lsRead(LS_TICKETS);
  const votes = lsRead(LS_VOTES);
  const comments = lsRead(LS_COMMENTS);
  return tickets.map((t) => {
    const voteCount = votes.filter((v) => v.ticket_id === t.id).length;
    return {
      ...t,
      votes: voteCount,
      comments: comments.filter((c) => c.ticket_id === t.id).length,
      rank_score: computeRankScore(voteCount, t.priority),
    };
  });
}

function lsLogEvent(ticketId, actorId, eventType, oldValue = null, newValue = null) {
  const events = lsRead(LS_EVENTS);
  events.push({
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ticket_id: ticketId,
    actor_id: actorId,
    event_type: eventType,
    old_value: oldValue,
    new_value: newValue,
    created_at: new Date().toISOString(),
  });
  lsWrite(LS_EVENTS, events);
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

// status: 'all' (everything) | 'active' (everything except done) | a specific status value
export async function fetchBoard({ sort = 'trending', status = 'all', activeOrgId } = {}) {
  if (!hasSupabaseConfig) {
    let rows = lsBoardRows();
    if (status === 'active') rows = rows.filter((t) => t.status !== 'done');
    else if (status !== 'all') rows = rows.filter((t) => t.status === status);
    return sortBoard(rows, sort);
  }

  let query = supabase.from('feedback_board').select('*');
  if (status === 'active') query = query.neq('status', 'done');
  else if (status !== 'all') query = query.eq('status', status);
  if (activeOrgId) query = query.eq('organization_id', activeOrgId);
  if (sort === 'new') {
    query = query.order('created_at', { ascending: false });
  } else if (sort === 'top') {
    query = query.order('votes', { ascending: false }).order('created_at', { ascending: false });
  } else {
    query = query
      .order('rank_score', { ascending: false })
      .order('votes', { ascending: false })
      .order('created_at', { ascending: false });
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function searchSimilar(q, maxResults = 5, activeOrgId) {
  const trimmed = (q || '').trim();
  if (!trimmed) return [];

  if (!hasSupabaseConfig) {
    const needle = trimmed.toLowerCase();
    return lsBoardRows()
      .filter((t) =>
        t.title.toLowerCase().includes(needle)
        || (t.description || '').toLowerCase().includes(needle))
      .slice(0, maxResults);
  }

  let query = supabase.rpc('search_similar_feedback', {
    q: trimmed,
    max_results: maxResults,
  });
  if (activeOrgId) {
    query = query.eq('organization_id', activeOrgId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchTicket(ticketId) {
  if (!hasSupabaseConfig) {
    return lsBoardRows().find((t) => t.id === ticketId) || null;
  }
  const { data, error } = await supabase
    .from('feedback_board')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export async function createTicket({
  user, category, categoryDetail, appArea, appAreaDetail, title, description, files = [], activeOrgId,
}) {
  // Detail text only applies to "Other" selections.
  const categoryDetailValue = category === 'other' ? categoryDetail?.trim() || null : null;
  const appAreaDetailValue = appArea === 'other' ? appAreaDetail?.trim() || null : null;
  if (!hasSupabaseConfig) {
    const tickets = lsRead(LS_TICKETS);
    const ticket = {
      id: `fbk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author_id: user?.id || 'local-user',
      author_name: user?.user_metadata?.full_name || user?.email || 'You',
      category,
      category_detail: categoryDetailValue,
      app_area: appArea,
      app_area_detail: appAreaDetailValue,
      title,
      description,
      status: 'open',
      priority: null,
      assignee_id: null,
      assignee_name: null,
      screenshot_paths: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    lsWrite(LS_TICKETS, [ticket, ...tickets]);
    lsLogEvent(ticket.id, ticket.author_id, 'created');
    return ticket;
  }

  const screenshotPaths = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${user.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from(SCREENSHOT_BUCKET)
      .upload(path, file, { contentType: file.type });
    if (uploadError) throw uploadError;
    screenshotPaths.push(path);
  }

  const { data, error } = await supabase
    .from('feedback_tickets')
    .insert({
      author_id: user.id,
      category,
      category_detail: categoryDetailValue,
      app_area: appArea,
      app_area_detail: appAreaDetailValue,
      title,
      description,
      screenshot_paths: screenshotPaths,
      organization_id: activeOrgId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Author edits to the request content (title, description, type, location).
// The DB trigger logs the matching activity events; RLS limits callers to
// the author (or a developer), and a guard trigger keeps triage fields safe.
export async function editTicket(ticketId, {
  title, description, category, categoryDetail, appArea, appAreaDetail,
}, actor) {
  // Detail text only applies to "Other" selections.
  const categoryDetailValue = category === 'other' ? categoryDetail?.trim() || null : null;
  const appAreaDetailValue = appArea === 'other' ? appAreaDetail?.trim() || null : null;
  if (!hasSupabaseConfig) {
    const tickets = lsRead(LS_TICKETS);
    const idx = tickets.findIndex((t) => t.id === ticketId);
    if (idx === -1) return null;
    const old = tickets[idx];
    const next = {
      ...old,
      title,
      description,
      category,
      category_detail: categoryDetailValue,
      app_area: appArea,
      app_area_detail: appAreaDetailValue,
      updated_at: new Date().toISOString(),
    };
    const actorId = actor?.id || 'local-user';
    if (old.title !== next.title) {
      lsLogEvent(ticketId, actorId, 'title_changed', old.title, next.title);
    }
    if (old.description !== next.description) {
      lsLogEvent(ticketId, actorId, 'description_changed');
    }
    if (old.category !== next.category || (old.category_detail || null) !== next.category_detail) {
      lsLogEvent(ticketId, actorId, 'category_changed', categoryDisplay(old), categoryDisplay(next));
    }
    if (old.app_area !== next.app_area || (old.app_area_detail || null) !== next.app_area_detail) {
      lsLogEvent(ticketId, actorId, 'area_changed', appAreaDisplay(old), appAreaDisplay(next));
    }
    tickets[idx] = next;
    lsWrite(LS_TICKETS, tickets);
    return next;
  }

  const { data, error } = await supabase
    .from('feedback_tickets')
    .update({
      title,
      description,
      category,
      category_detail: categoryDetailValue,
      app_area: appArea,
      app_area_detail: appAreaDetailValue,
    })
    .eq('id', ticketId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Developer-only fields: status, priority, assignee_id. The DB trigger logs
// the matching activity events; RLS rejects non-developer callers.
export async function updateTicket(ticketId, fields, actor) {
  if (!hasSupabaseConfig) {
    const tickets = lsRead(LS_TICKETS);
    const idx = tickets.findIndex((t) => t.id === ticketId);
    if (idx === -1) return null;
    const old = tickets[idx];
    const actorId = actor?.id || 'local-user';
    if ('status' in fields && fields.status !== old.status) {
      lsLogEvent(ticketId, actorId, 'status_changed', old.status, fields.status);
    }
    if ('priority' in fields && fields.priority !== old.priority) {
      lsLogEvent(ticketId, actorId, 'priority_changed', old.priority, fields.priority);
    }
    if ('assignee_id' in fields && fields.assignee_id !== old.assignee_id) {
      lsLogEvent(ticketId, actorId, 'assigned', old.assignee_name, fields.assignee_name || null);
    }
    tickets[idx] = { ...old, ...fields, updated_at: new Date().toISOString() };
    lsWrite(LS_TICKETS, tickets);
    return tickets[idx];
  }

  // assignee_name only exists for the localStorage fallback's event log — on
  // Supabase it's a view column, not a ticket column, so PostgREST rejects it.
  const updates = { ...fields };
  delete updates.assignee_name;
  const { data, error } = await supabase
    .from('feedback_tickets')
    .update(updates)
    .eq('id', ticketId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

export async function fetchUserVotes(userId) {
  if (!hasSupabaseConfig) {
    return new Set(
      lsRead(LS_VOTES)
        .filter((v) => v.user_id === (userId || 'local-user'))
        .map((v) => v.ticket_id)
    );
  }
  const { data, error } = await supabase
    .from('feedback_ticket_votes')
    .select('ticket_id')
    .eq('user_id', userId);
  if (error) throw error;
  return new Set((data || []).map((v) => v.ticket_id));
}

export async function toggleVote(ticketId, userId, hasVoted) {
  if (!hasSupabaseConfig) {
    const uid = userId || 'local-user';
    let votes = lsRead(LS_VOTES);
    if (hasVoted) {
      votes = votes.filter((v) => !(v.ticket_id === ticketId && v.user_id === uid));
    } else {
      votes.push({ ticket_id: ticketId, user_id: uid, created_at: new Date().toISOString() });
    }
    lsWrite(LS_VOTES, votes);
    return !hasVoted;
  }

  if (hasVoted) {
    const { error } = await supabase
      .from('feedback_ticket_votes')
      .delete()
      .eq('ticket_id', ticketId)
      .eq('user_id', userId);
    if (error) throw error;
    return false;
  }
  const { error } = await supabase
    .from('feedback_ticket_votes')
    .insert({ ticket_id: ticketId, user_id: userId });
  if (error) throw error;
  return true;
}

// ---------------------------------------------------------------------------
// Timeline (comments + events)
// ---------------------------------------------------------------------------

export async function fetchTicketTimeline(ticketId) {
  if (!hasSupabaseConfig) {
    const comments = lsRead(LS_COMMENTS).filter((c) => c.ticket_id === ticketId);
    const events = lsRead(LS_EVENTS).filter((e) => e.ticket_id === ticketId);
    return mergeTimeline(comments, events);
  }

  const [commentsRes, eventsRes] = await Promise.all([
    supabase
      .from('feedback_ticket_comments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
    supabase
      .from('feedback_ticket_events')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
  ]);
  if (commentsRes.error) throw commentsRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const comments = commentsRes.data || [];
  const events = eventsRes.data || [];

  // Resolve author/actor names in one profiles query.
  const ids = [
    ...new Set(
      [...comments.map((c) => c.author_id), ...events.map((e) => e.actor_id)].filter(Boolean)
    ),
  ];
  let names = {};
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('id', ids);
    names = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  }

  return mergeTimeline(
    comments.map((c) => ({
      ...c,
      author_name: names[c.author_id]?.full_name || 'Dev Team',
      author_role: names[c.author_id]?.role || null,
    })),
    events.map((e) => ({
      ...e,
      actor_name: names[e.actor_id]?.full_name || 'Dev Team',
    }))
  );
}

export async function addComment({ ticketId, author, body }) {
  const mentions = parseMentions(body);

  if (!hasSupabaseConfig) {
    const comments = lsRead(LS_COMMENTS);
    const comment = {
      id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ticket_id: ticketId,
      author_id: author?.id || 'local-user',
      author_name: author?.user_metadata?.full_name || author?.email || 'You',
      body,
      mentions,
      created_at: new Date().toISOString(),
    };
    comments.push(comment);
    lsWrite(LS_COMMENTS, comments);
    return comment;
  }

  const { data, error } = await supabase
    .from('feedback_ticket_comments')
    .insert({ ticket_id: ticketId, author_id: author.id, body, mentions })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Screenshots & mentionable profiles
// ---------------------------------------------------------------------------

export async function getSignedScreenshotUrls(paths) {
  if (!hasSupabaseConfig || !paths || paths.length === 0) return [];
  const { data, error } = await supabase.storage
    .from(SCREENSHOT_BUCKET)
    .createSignedUrls(paths, 3600);
  if (error) throw error;
  return (data || []).map((d) => d.signedUrl).filter(Boolean);
}

// Profiles that can be @-mentioned (and assigned): developers and admins.
export async function fetchMentionableProfiles() {
  if (!hasSupabaseConfig) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('role', ['developer', 'admin']);
  if (error) throw error;
  return data || [];
}
