import { beforeEach, describe, expect, it, vi } from 'vitest';

// A minimal PostgREST-shaped fake: records every call and resolves with `rows`/`error`.
const fake = vi.hoisted(() => {
  const state = { calls: [], rows: [], rpcData: null, error: null };
  const chain = (table) => {
    const record = (op, args) => { state.calls.push({ table, op, args }); return builder; };
    const builder = {
      select: (...args) => record('select', args), order: (...args) => record('order', args), limit: (...args) => record('limit', args),
      eq: (...args) => record('eq', args), delete: () => record('delete', []), update: (row) => record('update', [row]),
      upsert: (rows) => { state.calls.push({ table, op: 'upsert', args: [rows] }); return Promise.resolve({ error: state.error }); },
      maybeSingle: () => { state.calls.push({ table, op: 'maybeSingle', args: [] }); return Promise.resolve({ data: state.error ? null : state.rows[0] ?? null, error: state.error }); },
      then: (resolve, reject) => Promise.resolve({ data: state.error ? null : state.rows, error: state.error }).then(resolve, reject),
    };
    return builder;
  };
  const rpc = (name, args) => { state.calls.push({ op: 'rpc', args: [name, args] }); return Promise.resolve({ data: state.error ? null : state.rpcData, error: state.error }); };
  return { state, client: { from: chain, rpc } };
});
vi.mock('./supabaseClient', () => ({ supabase: fake.client, hasSupabaseConfig: true }));

const { deleteCanvas, listCanvases, loadCanvas, loadSharedCanvas, saveCanvas, setCanvasSharing } = await import('./studyCanvas');

const workspace = { reference: '1 Corinthians 11:17–34', chapterId: '1CO.11', translation: 'BSB', sources: [
  { id: 'verse-1CO.11.19', kind: 'verse', ref: '1 Corinthians 11:19', title: '1 Corinthians 11:19', text: 'No doubt there must be factions among you…' },
] };
const second = { ...workspace, reference: '1 John 2:18–27', chapterId: '1JN.2', sources: [{ id: 'verse-1JN.2.19', kind: 'verse', ref: '1 John 2:19', title: '1 John 2:19', text: 'They went out from us…' }] };
const explanation = (title) => ({ title, cards: [{ id: 'insight-1', title: 'Approved', body: 'Factions reveal who is approved.', kind: 'observation', sourceIds: ['verse-1CO.11.19'] }], questions: ['Why must there be factions?'] });
const legacy = { id: 'legacy-one', title: 'Truth by Contrast', workspace, explanation: explanation('Truth by Contrast'), turns: [{ role: 'user', content: 'What does contrast reveal?' }], resultFocus: 'What does contrast reveal?', savedAt: '2026-09-12T10:00:00.000Z' };
const calls = (op) => fake.state.calls.filter((call) => call.op === op);

beforeEach(() => { fake.state.calls = []; fake.state.rows = []; fake.state.rpcData = null; fake.state.error = null; localStorage.clear(); });

describe('study canvas storage', () => {
  it('uploads device-local saves from every org to the account, then clears them', async () => {
    localStorage.setItem('miqra_canvas_v1:me:org-one', JSON.stringify([legacy]));
    localStorage.setItem('miqra_canvas_v1:me:org-two', JSON.stringify([{ ...legacy, id: 'legacy-two' }]));
    localStorage.setItem('miqra_canvas_v1:someone-else:org-one', JSON.stringify([{ ...legacy, id: 'not-mine' }]));
    fake.state.rows = [{ id: 'legacy-one', title: 'Truth by Contrast', reference: workspace.reference, step_count: 1, share_token: null, updated_at: '2026-09-14T00:00:00Z' }];

    const list = await listCanvases('me', 'org-one');

    const uploads = calls('upsert').flatMap((call) => call.args[0]);
    expect(uploads.map((row) => row.id).sort()).toEqual(['legacy-one', 'legacy-two']);
    expect(uploads[0]).toMatchObject({ reference: workspace.reference, passages: [workspace], created_at: legacy.savedAt, steps: [expect.objectContaining({ focus: 'What does contrast reveal?', parentId: null })] });
    expect(uploads[0]).not.toHaveProperty('user_id');
    expect(localStorage.getItem('miqra_canvas_v1:me:org-one')).toBeNull();
    expect(localStorage.getItem('miqra_canvas_v1:me:org-two')).toBeNull();
    expect(localStorage.getItem('miqra_canvas_v1:someone-else:org-one')).not.toBeNull();
    expect(list).toEqual([{ id: 'legacy-one', title: 'Truth by Contrast', reference: workspace.reference, stepCount: 1, savedAt: '2026-09-14T00:00:00Z', shared: false }]);
  });

  it('keeps device-local saves when the upload fails', async () => {
    localStorage.setItem('miqra_canvas_v1:me:org-one', JSON.stringify([legacy]));
    fake.state.error = { message: 'relation "study_canvases" does not exist' };
    await expect(listCanvases('me', 'org-one')).rejects.toBeTruthy();
    expect(localStorage.getItem('miqra_canvas_v1:me:org-one')).not.toBeNull();
  });

  it('saves passages, the step tree and pins — never the sharing fields — then loads and deletes', async () => {
    const steps = [
      { id: 's1', parentId: null, focus: 'first', explanation: explanation('Factions'), createdAt: null, note: 'mine', cardNotes: {} },
      { id: 's2', parentId: 's1', focus: 'second', explanation: explanation('Approval'), createdAt: null, note: '', cardNotes: { 'insight-1': 'x' } },
    ];
    await saveCanvas('me', 'org-one', { id: 'c1', title: '  ', passages: [workspace, second], steps, pins: [{ id: 's2:insight-1', stepId: 's2', cardId: 'insight-1' }] });
    const row = calls('upsert')[0].args[0];
    expect(row).toEqual({ id: 'c1', title: 'Factions', reference: '1 Corinthians 11:17–34 · 1 John 2:18–27', passages: [workspace, second], steps, pins: [{ id: 's2:insight-1', stepId: 's2', cardId: 'insight-1' }] });

    fake.state.rows = [{ id: 'c1', title: 'Factions', passages: [workspace, second], steps, pins: [], share_token: 'tok', share_includes_notes: true, updated_at: '2026-09-14T00:00:00Z' }];
    const loaded = await loadCanvas('me', 'org-one', 'c1');
    expect(loaded.steps[1].parentId).toBe('s1');
    expect(loaded.share).toEqual({ token: 'tok', includeNotes: true });

    await deleteCanvas('me', 'org-one', 'c1');
    expect(fake.state.calls).toEqual(expect.arrayContaining([{ table: 'study_canvases', op: 'delete', args: [] }, { table: 'study_canvases', op: 'eq', args: ['id', 'c1'] }]));
  });

  it('keeps a share link stable when only the notes setting changes, and mints a new one after sharing is turned off', async () => {
    const first = await setCanvasSharing('c1', { enabled: true, includeNotes: false });
    expect(first.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(await setCanvasSharing('c1', { enabled: true, includeNotes: true, currentToken: first.token })).toEqual({ token: first.token, includeNotes: true });
    expect(await setCanvasSharing('c1', { enabled: false, includeNotes: true, currentToken: first.token })).toEqual({ token: null, includeNotes: true });
    expect(calls('update').map((call) => call.args[0])).toEqual([
      { share_token: first.token, share_includes_notes: false }, { share_token: first.token, share_includes_notes: true }, { share_token: null, share_includes_notes: true },
    ]);
  });

  it('opens a shared canvas through the RPC, and treats a bad or dead link as not shared', async () => {
    fake.state.rpcData = { id: 'c1', title: 'Truth by Contrast', passages: [workspace], steps: [{ id: 's1', parentId: null, focus: 'q', explanation: explanation('Factions') }], pins: [], includesNotes: false, ownerName: 'Mark', updatedAt: '2026-09-14T00:00:00Z' };
    const shared = await loadSharedCanvas('token-1');
    expect(calls('rpc')[0].args).toEqual(['get_shared_study_canvas', { p_token: 'token-1' }]);
    expect(shared).toMatchObject({ title: 'Truth by Contrast', ownerName: 'Mark', includesNotes: false, savedAt: '2026-09-14T00:00:00Z' });
    expect(shared.steps[0].note).toBe('');

    fake.state.rpcData = null;
    expect(await loadSharedCanvas('token-2')).toBeNull();
    fake.state.error = { code: '22P02', message: 'invalid input syntax for type uuid' };
    expect(await loadSharedCanvas('not-a-uuid')).toBeNull();
  });
});

describe('synced personal moments', () => {
  const canvas = { id: 'moment-one', title: 'Learning to receive', passages: [], steps: [], pins: [], journey: {
    kind: 'moment', moment: 'Someone helped me.', createdAt: '2026-10-15T12:00:00Z', revisitOn: '2026-10-22', entries: [],
  } };
  it('saves and loads an independent moment without creating a share link', async () => {
    await saveCanvas('me', 'org', canvas);
    expect(calls('upsert')[0].args[0]).toEqual({ ...canvas, reference: 'Personal moment' });
    expect(calls('upsert')[0].args[0]).not.toHaveProperty('share_token');
    fake.state.rows = [{ ...canvas, updated_at: '2026-10-15T12:00:01Z' }];
    expect((await loadCanvas('me', 'org', canvas.id)).journey).toEqual(canvas.journey);
  });
  it('reads only moment metadata for the library', async () => {
    fake.state.rows = [{ id: canvas.id, title: canvas.title, reference: 'Personal moment', step_count: 0, journey_kind: 'moment', revisit_on: '2026-10-22', updated_at: '2026-10-15T12:00:01Z' }];
    expect(await listCanvases('me', 'org')).toEqual([expect.objectContaining({ isMoment: true, revisitOn: '2026-10-22', title: canvas.title })]);
    expect(calls('select')[0].args[0]).toContain('journey_kind:journey->>kind');
  });
  it('refuses to overwrite a moment changed on another device', async () => {
    await expect(saveCanvas('me', 'org', { ...canvas, savedAt: '2026-10-15T12:00:01Z' })).rejects.toThrow('changed on another device');
    expect(calls('upsert')).toHaveLength(0);
    expect(calls('eq')).toContainEqual(expect.objectContaining({ args: ['updated_at', '2026-10-15T12:00:01Z'] }));
  });
  it('updates an unchanged moment using the timestamp it was opened with', async () => {
    fake.state.rows = [{ id: canvas.id, journey_kind: 'moment', updated_at: '2026-10-15T12:01:00Z' }];
    const items = await saveCanvas('me', 'org', { ...canvas, savedAt: '2026-10-15T12:00:01Z' });
    expect(items[0].savedAt).toBe('2026-10-15T12:01:00Z');
    expect(calls('update')).toHaveLength(1);
  });
});
