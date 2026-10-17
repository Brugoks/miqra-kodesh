import { beforeEach, describe, expect, it, vi } from 'vitest';

// A minimal PostgREST-shaped fake: records every call and resolves with `rows`/`error`.
const fake = vi.hoisted(() => {
  const state = { calls: [], rows: [], rpcData: null, error: null, inserted: null, updateMisses: false };
  const chain = (table) => {
    let ids = null;
    let updating = false;
    const record = (op, args) => { state.calls.push({ table, op, args }); return builder; };
    const matching = () => (ids ? state.rows.filter((row) => ids.includes(row.id)) : state.rows);
    const builder = {
      select: (...args) => record('select', args), order: (...args) => record('order', args), limit: (...args) => record('limit', args),
      eq: (...args) => record('eq', args), delete: () => record('delete', []), update: (row) => { updating = true; return record('update', [row]); },
      in: (column, values) => { ids = values; return record('in', [column, values]); },
      insert: (rows) => { state.calls.push({ table, op: 'insert', args: [rows] }); return builder; },
      upsert: (rows) => { state.calls.push({ table, op: 'upsert', args: [rows] }); return Promise.resolve({ error: state.error }); },
      single: () => { state.calls.push({ table, op: 'single', args: [] }); return Promise.resolve({ data: state.error ? null : state.inserted ?? matching()[0] ?? null, error: state.error }); },
      maybeSingle: () => { state.calls.push({ table, op: 'maybeSingle', args: [] }); return Promise.resolve({ data: state.error || (updating && state.updateMisses) ? null : matching()[0] ?? null, error: state.error }); },
      then: (resolve, reject) => Promise.resolve({ data: state.error ? null : matching(), error: state.error }).then(resolve, reject),
    };
    return builder;
  };
  const rpc = (name, args) => { state.calls.push({ op: 'rpc', args: [name, args] }); return Promise.resolve({ data: state.error ? null : state.rpcData, error: state.error }); };
  return { state, client: { from: chain, rpc } };
});
vi.mock('./supabaseClient', () => ({ supabase: fake.client, hasSupabaseConfig: true }));

const { CanvasSaveError, deleteCanvas, listCanvases, loadCanvas, loadSharedCanvas, saveCanvas, saveMoment, setCanvasSharing } = await import('./studyCanvas');

const workspace = { reference: '1 Corinthians 11:17–34', chapterId: '1CO.11', translation: 'BSB', sources: [
  { id: 'verse-1CO.11.19', kind: 'verse', ref: '1 Corinthians 11:19', title: '1 Corinthians 11:19', text: 'No doubt there must be factions among you…' },
] };
const second = { ...workspace, reference: '1 John 2:18–27', chapterId: '1JN.2', sources: [{ id: 'verse-1JN.2.19', kind: 'verse', ref: '1 John 2:19', title: '1 John 2:19', text: 'They went out from us…' }] };
const explanation = (title) => ({ title, cards: [{ id: 'insight-1', title: 'Approved', body: 'Factions reveal who is approved.', kind: 'observation', sourceIds: ['verse-1CO.11.19'] }], questions: ['Why must there be factions?'] });
const legacy = { id: 'legacy-one', title: 'Truth by Contrast', workspace, explanation: explanation('Truth by Contrast'), turns: [{ role: 'user', content: 'What does contrast reveal?' }], resultFocus: 'What does contrast reveal?', savedAt: '2026-09-12T10:00:00.000Z' };
const calls = (op) => fake.state.calls.filter((call) => call.op === op);

beforeEach(() => { fake.state.calls = []; fake.state.rows = []; fake.state.rpcData = null; fake.state.error = null; fake.state.inserted = null; fake.state.updateMisses = false; localStorage.clear(); });

describe('study canvas storage', () => {
  it('uploads device-local saves from every org to the account, then clears them', async () => {
    localStorage.setItem('miqra_canvas_v1:me:org-one', JSON.stringify([legacy]));
    localStorage.setItem('miqra_canvas_v1:me:org-two', JSON.stringify([{ ...legacy, id: 'legacy-two' }]));
    localStorage.setItem('miqra_canvas_v1:someone-else:org-one', JSON.stringify([{ ...legacy, id: 'not-mine' }]));
    fake.state.rows = [{ id: 'listed', title: 'Truth by Contrast', reference: workspace.reference, step_count: 1, share_token: null, updated_at: '2026-09-14T00:00:00Z' }];

    const list = await listCanvases('me', 'org-one');

    const uploads = calls('insert').flatMap((call) => call.args[0]);
    expect(uploads.map((row) => row.id).sort()).toEqual(['legacy-one', 'legacy-two']);
    expect(uploads[0]).toMatchObject({ reference: workspace.reference, passages: [workspace], created_at: legacy.savedAt, steps: [expect.objectContaining({ focus: 'What does contrast reveal?', parentId: null })] });
    expect(uploads[0]).not.toHaveProperty('user_id');
    expect(calls('upsert')).toHaveLength(0);
    expect(localStorage.getItem('miqra_canvas_v1:me:org-one')).toBeNull();
    expect(localStorage.getItem('miqra_canvas_v1:me:org-two')).toBeNull();
    expect(localStorage.getItem('miqra_canvas_v1:someone-else:org-one')).not.toBeNull();
    expect(list).toEqual([{ id: 'listed', title: 'Truth by Contrast', reference: workspace.reference, stepCount: 1, savedAt: '2026-09-14T00:00:00Z', shared: false }]);
  });

  it('never overwrites a canvas the account already has: a copy that is not newer is dropped, a newer device copy is kept untouched', async () => {
    const older = { ...legacy, id: 'already-there', savedAt: '2026-09-12T10:00:00.000Z' };
    const newer = { ...legacy, id: 'edited-offline', savedAt: '2026-09-20T10:00:00.000Z' };
    localStorage.setItem('miqra_canvas_v1:me:org-one', JSON.stringify([older, newer, { ...legacy, id: 'brand-new' }]));
    fake.state.rows = [{ id: 'already-there', updated_at: '2026-09-14T00:00:00Z' }, { id: 'edited-offline', updated_at: '2026-09-14T00:00:00Z' }];

    await listCanvases('me', 'org-one');

    expect(calls('insert').flatMap((call) => call.args[0]).map((row) => row.id)).toEqual(['brand-new']);
    expect(calls('upsert')).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('miqra_canvas_v1:me:org-one')).map((row) => row.id)).toEqual(['edited-offline']);
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
    fake.state.inserted = { updated_at: '2026-10-15T12:00:01Z' };
    await saveMoment('me', 'org', canvas);
    expect(calls('insert')[0].args[0]).toEqual({ ...canvas, reference: 'Personal moment' });
    expect(calls('insert')[0].args[0]).not.toHaveProperty('share_token');
    fake.state.rows = [{ ...canvas, updated_at: '2026-10-15T12:00:01Z' }];
    expect((await loadCanvas('me', 'org', canvas.id)).journey).toEqual(canvas.journey);
  });
  it('reads only moment metadata for the library', async () => {
    fake.state.rows = [{ id: canvas.id, title: canvas.title, reference: 'Personal moment', step_count: 0, journey_kind: 'moment', revisit_on: '2026-10-22', updated_at: '2026-10-15T12:00:01Z' }];
    expect(await listCanvases('me', 'org')).toEqual([expect.objectContaining({ isMoment: true, revisitOn: '2026-10-22', title: canvas.title })]);
    expect(calls('select')[0].args[0]).toContain('journey_kind:journey->>kind');
  });
  it('keeps personal canvases off the study save path, which would upsert over a canvas deleted elsewhere', async () => {
    await expect(saveCanvas('me', 'org', canvas)).rejects.toThrow('saveMoment');
    expect(calls('upsert')).toHaveLength(0);
  });
});

describe('saving a personal canvas with a layout', () => {
  const board = { version: 1, nodes: [{ id: 'moment:m1', contentRef: { type: 'moment' }, x: 0, y: 0, width: 320, sectionId: null }], sections: [], edges: [] };
  const canvas = { id: 'm1', title: 'Learning to receive', passages: [], steps: [], pins: [], board, journey: {
    kind: 'moment', moment: 'Someone helped me.', createdAt: '2026-10-15T12:00:00Z', revisitOn: null, entries: [],
  } };

  it('writes the layout beside the journey, and loads it back', async () => {
    fake.state.inserted = { updated_at: '2026-10-17T10:00:00.123456+00:00' };
    expect(await saveMoment('me', 'org', canvas)).toEqual({ savedAt: '2026-10-17T10:00:00.123456+00:00' });
    expect(calls('insert')[0].args[0]).toMatchObject({ id: 'm1', board, journey: canvas.journey });
    fake.state.rows = [{ ...canvas, updated_at: '2026-10-17T10:00:00.123456+00:00' }];
    const loaded = await loadCanvas('me', 'org', 'm1');
    expect(loaded.board).toEqual(board);
    expect(calls('select').at(-1).args[0]).toContain('board');
  });

  it('does not read the board column while the workspace is switched off, so it can ship before the migration', async () => {
    localStorage.setItem('miqra_living_canvas_board', 'off');
    fake.state.rows = [{ ...canvas, board, updated_at: '2026-10-17T10:00:00Z' }];
    const loaded = await loadCanvas('me', 'org', 'm1');
    expect(calls('select').at(-1).args[0]).not.toContain('board');
    expect(loaded.journey.moment).toBe('Someone helped me.');
    expect(loaded.board).toEqual(board); // whatever the server sends is still understood
    localStorage.removeItem('miqra_living_canvas_board');
  });

  it('leaves the column alone when the canvas was never arranged, or its layout could not be read', async () => {
    fake.state.rows = [{ updated_at: '2026-10-17T10:00:01Z' }];
    await saveMoment('me', 'org', { ...canvas, board: null }, '2026-10-17T10:00:00Z');
    await saveMoment('me', 'org', { ...canvas, board: null, boardIssue: { reason: 'newer', raw: { version: 9 } } }, '2026-10-17T10:00:00Z');
    expect(calls('update').map((call) => 'board' in call.args[0])).toEqual([false, false]);
  });

  it('updates only the version it was built on, and returns the new timestamp', async () => {
    fake.state.rows = [{ updated_at: '2026-10-17T10:00:05Z' }];
    expect(await saveMoment('me', 'org', canvas, '2026-10-17T10:00:00Z')).toEqual({ savedAt: '2026-10-17T10:00:05Z' });
    expect(calls('eq')).toEqual(expect.arrayContaining([expect.objectContaining({ args: ['updated_at', '2026-10-17T10:00:00Z'] })]));
    expect(calls('upsert')).toHaveLength(0);
  });

  it('tells a canvas changed elsewhere from one deleted elsewhere, and never recreates it', async () => {
    fake.state.rows = [];
    await expect(saveMoment('me', 'org', canvas, '2026-10-17T10:00:00Z')).rejects.toMatchObject({ code: 'gone' });
    expect(calls('insert')).toHaveLength(0);
    expect(calls('upsert')).toHaveLength(0);
  });

  it('reports a canvas changed on another device as a conflict', async () => {
    fake.state.rows = [{ id: 'm1', updated_at: '2026-10-17T10:00:09Z' }];
    fake.state.updateMisses = true;
    await expect(saveMoment('me', 'org', canvas, '2026-10-17T10:00:00Z')).rejects.toMatchObject({ code: 'conflict' });
  });

  it('reports a duplicate first save as a conflict and passes other failures through for a retry', async () => {
    fake.state.error = { code: '23505', message: 'duplicate key' };
    await expect(saveMoment('me', 'org', canvas)).rejects.toBeInstanceOf(CanvasSaveError);
    fake.state.error = { message: 'Failed to fetch' };
    await expect(saveMoment('me', 'org', canvas, '2026-10-17T10:00:00Z')).rejects.not.toBeInstanceOf(CanvasSaveError);
  });
});
