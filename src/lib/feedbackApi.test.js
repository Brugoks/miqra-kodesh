import { describe, it, expect, vi, beforeEach } from 'vitest';

// Force the localStorage fallback path — no Supabase in tests.
vi.mock('./supabaseClient', () => ({ hasSupabaseConfig: false, supabase: null }));

import {
  computeRankScore,
  parseMentions,
  mergeTimeline,
  categoryLabel,
  appAreaLabel,
  categoryDisplay,
  appAreaDisplay,
  statusLabel,
  fetchBoard,
  searchSimilar,
  fetchTicket,
  createTicket,
  editTicket,
  updateTicket,
  fetchUserVotes,
  toggleVote,
  fetchTicketTimeline,
  addComment,
} from './feedbackApi';

const USER = { id: 'u1', email: 'user@example.com', user_metadata: { full_name: 'Test User' } };

async function makeTicket(overrides = {}) {
  return createTicket({
    user: USER,
    category: 'bug',
    appArea: 'home',
    title: 'Something is broken',
    description: 'Steps to reproduce…',
    ...overrides,
  });
}

describe('computeRankScore', () => {
  it('weights votes by 5', () => {
    expect(computeRankScore(0, null)).toBe(0);
    expect(computeRankScore(3, null)).toBe(15);
  });

  it('adds priority weights', () => {
    expect(computeRankScore(0, 'low')).toBe(20);
    expect(computeRankScore(0, 'medium')).toBe(80);
    expect(computeRankScore(0, 'high')).toBe(200);
    expect(computeRankScore(0, 'critical')).toBe(400);
    expect(computeRankScore(2, 'high')).toBe(210);
  });

  it('ignores unknown priorities', () => {
    expect(computeRankScore(1, 'bogus')).toBe(5);
  });
});

describe('parseMentions', () => {
  it('extracts uuids from react-mentions markup', () => {
    expect(parseMentions('Hey @[Alice](id-1), ping @[Bob](id-2)!')).toEqual(['id-1', 'id-2']);
  });

  it('dedupes repeated mentions', () => {
    expect(parseMentions('@[Alice](id-1) and again @[Alice](id-1)')).toEqual(['id-1']);
  });

  it('handles plain text and empty input', () => {
    expect(parseMentions('no mentions here')).toEqual([]);
    expect(parseMentions('')).toEqual([]);
    expect(parseMentions(null)).toEqual([]);
  });
});

describe('mergeTimeline', () => {
  it('interleaves comments and events chronologically with kind tags', () => {
    const comments = [
      { id: 'c1', created_at: '2026-06-10T10:05:00Z' },
      { id: 'c2', created_at: '2026-06-10T10:20:00Z' },
    ];
    const events = [
      { id: 'e1', created_at: '2026-06-10T10:00:00Z' },
      { id: 'e2', created_at: '2026-06-10T10:10:00Z' },
    ];
    const merged = mergeTimeline(comments, events);
    expect(merged.map((i) => i.id)).toEqual(['e1', 'c1', 'e2', 'c2']);
    expect(merged.map((i) => i.kind)).toEqual(['event', 'comment', 'event', 'comment']);
  });

  it('handles missing inputs', () => {
    expect(mergeTimeline(null, null)).toEqual([]);
    expect(mergeTimeline([{ id: 'c1', created_at: '2026-01-01' }], null)).toHaveLength(1);
  });
});

describe('label helpers', () => {
  it('maps known values and falls back to the raw value', () => {
    expect(categoryLabel('bug')).toBe('Bug Report');
    expect(appAreaLabel('bible_study')).toBe('Bible Study');
    expect(statusLabel('in_progress')).toBe('In Progress');
    expect(statusLabel('mystery')).toBe('mystery');
  });

  it('surfaces the free-text detail for Other selections', () => {
    expect(categoryDisplay({ category: 'other', category_detail: 'Question' })).toBe('Other: Question');
    expect(categoryDisplay({ category: 'other', category_detail: null })).toBe('Other');
    expect(categoryDisplay({ category: 'bug', category_detail: 'ignored' })).toBe('Bug Report');
    expect(appAreaDisplay({ app_area: 'other', app_area_detail: 'Login screen' })).toBe('Other: Login screen');
    expect(appAreaDisplay({ app_area: 'calendar', app_area_detail: null })).toBe('Calendar');
  });
});

describe('localStorage fallback', () => {
  beforeEach(() => localStorage.clear());

  it('creates a ticket and logs a created event', async () => {
    const ticket = await makeTicket();
    expect(ticket.status).toBe('open');
    expect(ticket.author_name).toBe('Test User');

    const timeline = await fetchTicketTimeline(ticket.id);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ kind: 'event', event_type: 'created', actor_id: 'u1' });
  });

  it('stores Other detail text only for Other selections', async () => {
    const other = await makeTicket({
      category: 'other',
      categoryDetail: '  Question  ',
      appArea: 'other',
      appAreaDetail: 'Login screen',
    });
    expect(other.category_detail).toBe('Question');
    expect(other.app_area_detail).toBe('Login screen');

    // Detail text is dropped when the selection isn't "Other".
    const bug = await makeTicket({ categoryDetail: 'ignored', appAreaDetail: 'ignored' });
    expect(bug.category_detail).toBeNull();
    expect(bug.app_area_detail).toBeNull();
  });

  it('lets the author edit a request and logs the changes', async () => {
    const ticket = await makeTicket();

    const updated = await editTicket(ticket.id, {
      title: 'Something is very broken',
      description: 'New repro steps.',
      category: 'other',
      categoryDetail: 'Question',
      appArea: 'calendar',
      appAreaDetail: '',
    }, USER);

    expect(updated.title).toBe('Something is very broken');
    expect(updated.category).toBe('other');
    expect(updated.category_detail).toBe('Question');
    expect(updated.app_area).toBe('calendar');
    expect(updated.app_area_detail).toBeNull();

    const timeline = await fetchTicketTimeline(ticket.id);
    const types = timeline.map((i) => i.event_type);
    expect(types).toContain('title_changed');
    expect(types).toContain('description_changed');
    expect(types).toContain('category_changed');
    expect(types).toContain('area_changed');

    const titleEvent = timeline.find((i) => i.event_type === 'title_changed');
    expect(titleEvent).toMatchObject({
      actor_id: 'u1',
      old_value: 'Something is broken',
      new_value: 'Something is very broken',
    });
    const categoryEvent = timeline.find((i) => i.event_type === 'category_changed');
    expect(categoryEvent).toMatchObject({
      old_value: 'Bug Report',
      new_value: 'Other: Question',
    });
  });

  it('does not log edit events when nothing changed', async () => {
    const ticket = await makeTicket();
    await editTicket(ticket.id, {
      title: ticket.title,
      description: ticket.description,
      category: ticket.category,
      categoryDetail: '',
      appArea: ticket.app_area,
      appAreaDetail: '',
    }, USER);

    const timeline = await fetchTicketTimeline(ticket.id);
    expect(timeline.map((i) => i.event_type)).toEqual(['created']);
  });

  it('returns board rows with vote/comment counts and rank score', async () => {
    const ticket = await makeTicket();
    const board = await fetchBoard();
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ id: ticket.id, votes: 0, comments: 0, rank_score: 0 });
  });

  it('toggles votes and reflects them in rank score and user votes', async () => {
    const ticket = await makeTicket();

    expect(await toggleVote(ticket.id, 'u1', false)).toBe(true);
    expect((await fetchUserVotes('u1')).has(ticket.id)).toBe(true);

    let [row] = await fetchBoard();
    expect(row.votes).toBe(1);
    expect(row.rank_score).toBe(5);

    expect(await toggleVote(ticket.id, 'u1', true)).toBe(false);
    expect((await fetchUserVotes('u1')).has(ticket.id)).toBe(false);
    [row] = await fetchBoard();
    expect(row.votes).toBe(0);
  });

  it('logs status, priority and assignee changes on update', async () => {
    const ticket = await makeTicket();
    await updateTicket(ticket.id, { status: 'in_progress' }, USER);
    await updateTicket(ticket.id, { priority: 'high' }, USER);
    await updateTicket(ticket.id, { assignee_id: 'dev-1', assignee_name: 'Dev One' }, USER);

    const updated = await fetchTicket(ticket.id);
    expect(updated).toMatchObject({ status: 'in_progress', priority: 'high', assignee_id: 'dev-1' });
    expect(updated.rank_score).toBe(200);

    const events = (await fetchTicketTimeline(ticket.id)).filter((i) => i.kind === 'event');
    expect(events.map((e) => e.event_type)).toEqual([
      'created', 'status_changed', 'priority_changed', 'assigned',
    ]);
    const statusEvent = events.find((e) => e.event_type === 'status_changed');
    expect(statusEvent).toMatchObject({ old_value: 'open', new_value: 'in_progress' });
  });

  it('does not log events for unchanged fields', async () => {
    const ticket = await makeTicket();
    await updateTicket(ticket.id, { status: 'open' }, USER);
    const events = (await fetchTicketTimeline(ticket.id)).filter((i) => i.kind === 'event');
    expect(events).toHaveLength(1); // only 'created'
  });

  it('stores comments with parsed mentions and merges them into the timeline', async () => {
    const ticket = await makeTicket();
    const comment = await addComment({
      ticketId: ticket.id,
      author: USER,
      body: 'Can @[Dev One](dev-1) take a look?',
    });
    expect(comment.mentions).toEqual(['dev-1']);

    const timeline = await fetchTicketTimeline(ticket.id);
    expect(timeline.filter((i) => i.kind === 'comment')).toHaveLength(1);
    expect(timeline.filter((i) => i.kind === 'event')).toHaveLength(1);
  });

  it('searches titles and descriptions case-insensitively', async () => {
    await makeTicket({ title: 'Dark mode for the calendar' });
    await makeTicket({ title: 'Other thing', description: 'really about DARK MODE' });
    await makeTicket({ title: 'Unrelated request' });

    expect(await searchSimilar('dark mode')).toHaveLength(2);
    expect(await searchSimilar('unrelated')).toHaveLength(1);
    expect(await searchSimilar('')).toEqual([]);
  });

  it('filters and sorts the board', async () => {
    const a = await makeTicket({ title: 'A' });
    const b = await makeTicket({ title: 'B' });
    await toggleVote(b.id, 'u1', false);
    await updateTicket(a.id, { status: 'done' }, USER);

    const open = await fetchBoard({ status: 'open' });
    expect(open.map((t) => t.id)).toEqual([b.id]);

    const top = await fetchBoard({ sort: 'top' });
    expect(top[0].id).toBe(b.id);

    const trending = await fetchBoard({ sort: 'trending' });
    expect(trending[0].id).toBe(b.id);
  });
});
