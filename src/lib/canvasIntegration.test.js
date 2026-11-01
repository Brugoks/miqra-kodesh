import { describe, expect, it, vi } from 'vitest';
import { applyIntegrationChange, assertIntegrationCanvas, publicationSnapshot } from './canvasIntegration';
import { normalizeCanvas } from './studyCanvasModel';
import { normalizeJourney } from './canvasJourney';
import { cardContent, cardRect } from './canvasBoard';
import { createIntegrationHandler, fingerprint } from '../../supabase/functions/living-canvas-api/handler.ts';
import { loadScripture } from '../../supabase/functions/living-canvas-api/scripture.ts';
import { validCanvasClaims } from '../../supabase/functions/living-canvas-api/auth.js';
import { TOOLS, validateTool } from '../../supabase/functions/living-canvas-api/tools.js';

const revision = '2026-10-31T12:00:00.000Z';
const baseArgs = { idempotency_key: 'request-001', title: 'Wisdom Without Control', moment: 'PRIVATE GLIMPSE: how can we equip others?', insights: [{ category: 'interpretation', text: 'Equipping others can share responsibility.' }, { category: 'reflection', text: 'PRIVATE NOTE' }] };
const scripture = { translation: 'KJV', reference: 'Proverbs 20:5', verses: [{ reference: 'Proverbs 20:5', text: 'Counsel in the heart of man is like deep water; but a man of understanding will draw it out.' }] };
function canvas() { let n = 0; return { ...applyIntegrationChange(null, 'create_canvas', baseArgs, { id: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, now: revision }), updated_at: revision }; }
const changeArgs = (row, extra = {}) => ({ canvas_id: row.id, expected_updated_at: row.updated_at, idempotency_key: 'update-001', ...extra });
function server({ row = canvas(), authenticated = true, rate = true } = {}) {
  const repo = { get: vi.fn().mockResolvedValue(row), list: vi.fn().mockResolvedValue({ canvases: [{ id: row.id, title: row.title }], next_offset: null }), consume: vi.fn().mockResolvedValue(rate), receipt: vi.fn().mockResolvedValue(null), commit: vi.fn().mockImplementation(async (args) => ({ canvas_id: args.p_canvas_id, updated_at: revision, ...(args.p_action === 'publish_canvas' ? { token: 'published-token' } : {}) })) };
  const deps = { resource: 'https://test.example/functions/v1/living-canvas-api/mcp', issuer: 'https://auth.example/auth/v1', appOrigin: 'https://miqra.example', authenticate: vi.fn().mockResolvedValue(authenticated ? repo : null), loadScripture: vi.fn().mockResolvedValue(scripture) };
  const handler = createIntegrationHandler(deps);
  const request = (path, body, headers = {}) => handler(new Request(`https://test.example/functions/v1/living-canvas-api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  const tool = (name, args) => request(`tools/${name}`, args);
  const mcp = (method, params, id = 1) => request('mcp', { jsonrpc: '2.0', id, method, params });
  return { repo, deps, handler, request, tool, mcp, row };
}

describe('integration model and existing Living Canvas compatibility', () => {
  it('normalizes created canvases and every distinct content category without moving existing nodes', () => {
    let row = canvas();
    const before = row.board.nodes;
    for (const category of ['historical_context', 'observation', 'application', 'counterargument', 'open_question']) row = { ...row, ...applyIntegrationChange(row, 'add_insight', { category, text: category, ...(category === 'historical_context' ? { evidence_urls: ['https://example.org/evidence'] } : {}) }) };
    expect(normalizeCanvas(row)).toBeTruthy();
    expect(row.board.nodes.slice(0, before.length)).toEqual(before);
    expect(row.journey.entries.map((e) => e.category)).toEqual(expect.arrayContaining(['interpretation', 'reflection', 'observation', 'application', 'counterargument', 'open_question', 'historical_context']));
    const rects = row.board.nodes.map(cardRect);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(rects[i].x >= rects[j].x + rects[j].width || rects[j].x >= rects[i].x + rects[i].width || rects[i].y >= rects[j].y + rects[j].height || rects[j].y >= rects[i].y + rects[i].height).toBe(true);
  });
  it('stores verified Scripture separately from editable context', () => {
    const initial = canvas();
    const row = { ...initial, ...applyIntegrationChange(initial, 'add_scripture', { note: 'Consider the surrounding passage.' }, { scripture }) };
    const entry = normalizeCanvas(row).journey.entries.at(-1);
    expect(entry.biblePassage).toEqual(scripture);
    expect(entry.category).toBe('scripture');
    expect(cardContent(row, row.board.nodes.at(-1)).label).toBe('Scripture');
  });
  it('rejects invented/missing sources, duplicate passages, damaged layouts and unsupported versions', () => {
    expect(() => applyIntegrationChange(canvas(), 'add_insight', { category: 'observation', text: 'Hello', source_entry_ids: ['missing'] })).toThrow('missing');
    expect(() => applyIntegrationChange(canvas(), 'add_insight', { category: 'historical_context', text: 'An unsupported claim' })).toThrow('evidence');
    const initial = canvas();
    const row = { ...initial, ...applyIntegrationChange(initial, 'add_scripture', {}, { scripture }) };
    expect(() => applyIntegrationChange(row, 'add_scripture', {}, { scripture })).toThrow('already attached');
    expect(() => assertIntegrationCanvas({ ...row, board: { ...row.board, version: 99 } })).toThrow('safely edited');
  });
  it('patches only intended entry text, title, placement and thematic sections', () => {
    const row = canvas(); const entries = row.journey.entries;
    const updated = applyIntegrationChange(row, 'update_canvas', { title: 'Revised title', entries: [{ id: entries[0].id, text: 'Reconsidered insight' }], sections: [{ id: 'section:wisdom', title: 'Wisdom', entry_ids: [entries[0].id] }] });
    expect(updated.journey.moment).toBe(row.journey.moment);
    expect(updated.journey.entries[1]).toEqual(entries[1]);
    expect(updated.board.nodes.map((n) => ({ x: n.x, y: n.y }))).toEqual(row.board.nodes.map((n) => ({ x: n.x, y: n.y })));
    expect(updated.board.sections[0].title).toBe('Wisdom');
    expect(updated).not.toHaveProperty('step_count');
    expect(updated).not.toHaveProperty('user_id');
  });
  it('allows only valid connections between distinct existing cards', () => {
    const row = canvas(); const [a, b] = row.board.nodes;
    const linked = applyIntegrationChange(row, 'connect_concepts', { source: a.id, target: b.id, label: 'equips' });
    expect(linked.board.edges[0].direction).toBe('forward');
    expect(() => applyIntegrationChange(row, 'connect_concepts', { source: a.id, target: a.id, label: '' })).toThrow();
    expect(() => applyIntegrationChange(row, 'connect_concepts', { source: a.id, target: 'missing', label: '' })).toThrow();
    expect(() => applyIntegrationChange(linked, 'connect_concepts', { source: b.id, target: a.id, label: '' })).toThrow();
  });
  it('preserves old journeys and reads legacy Scripture studies without implicit conversion', () => {
    const row = canvas(); const old = { ...row.journey, entries: [{ id: 'old', kind: 'prayer', text: 'My prayer', createdAt: revision }] };
    expect(normalizeJourney(old)).toEqual(old);
    const legacy = { id: row.id, title: 'Legacy', passages: [{ reference: 'Mark 2:1', chapterId: 'MRK.2', sources: [] }], steps: [{ id: 's', focus: '', explanation: { title: 'Study', cards: [], questions: [] } }], pins: [] };
    expect(assertIntegrationCanvas(legacy)).toBeTruthy();
    expect(applyIntegrationChange(legacy, 'update_canvas', { title: 'Changed' })).toEqual({ title: 'Changed' });
    expect(() => applyIntegrationChange(legacy, 'add_insight', { category: 'observation', text: 'One' })).toThrow('Legacy');
  });
  it('publishes only chosen nonpersonal cards, with no private glimpse, sermon provenance or section names', () => {
    const row = canvas(); row.board.sections = [{ id: 's', title: 'PRIVATE SECTION', color: 'teal', x: 0, y: 0, width: 1000, height: 1000, collapsed: false }]; row.board.nodes[1].sectionId = 's';
    const snapshot = publicationSnapshot(row, [row.journey.entries[0].id], revision);
    expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE|sermon|owner|organization/);
    expect(snapshot.board.nodes).toHaveLength(1);
    expect(snapshot.board.sections[0].title).toBe('Theme 1');
    expect(normalizeCanvas(snapshot)).toBeTruthy();
    expect(() => publicationSnapshot(row, [row.journey.entries[1].id])).toThrow('cannot be published');
    expect(() => publicationSnapshot(row, ['missing'])).toThrow();
  });
});

describe('verified Bible loading', () => {
  it('uses existing parser and KJV service; never accepts caller supplied quotations', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ chapter: { content: [{ type: 'verse', number: 5, content: [scripture.verses[0].text] }] } })));
    expect(await loadScripture('Proverbs 20:5', 'KJV', fetcher)).toEqual(scripture);
    expect(fetcher.mock.calls[0][0]).toBe('https://bible.helloao.org/api/eng_kjv/PRO/20.json');
    expect(() => validateTool('add_scripture', changeArgs(canvas(), { reference: 'Proverbs 20:5', text: 'Made up verse' }))).toThrow();
    await expect(loadScripture('Fakebook 1:1', 'KJV', fetcher)).rejects.toThrow();
  });
  it('refuses missing verses and provider failures', async () => {
    await expect(loadScripture('Proverbs 20:5', 'KJV', async () => new Response('{}', { status: 503 }))).rejects.toThrow('verified');
    await expect(loadScripture('Proverbs 20:5', 'KJV', async () => new Response('{"chapter":{"content":[]}}'))).rejects.toThrow('not available');
  });
});

describe('OAuth access token restrictions', () => {
  const config = { issuer: 'https://auth.example/auth/v1', resource: 'https://mcp.example/mcp', clientIds: ['registered-client'], now: 100 };
  const claims = { iss: config.issuer, aud: ['authenticated', config.resource], sub: 'owner', role: 'authenticated', exp: 200, client_id: 'registered-client', canvas_integration: true };
  it('accepts only verified claims for the configured resource and approved OAuth client', () => { expect(validCanvasClaims(claims, config)).toBe(true); });
  it.each([{ aud: 'authenticated' }, { iss: 'other' }, { exp: 90 }, { client_id: 'other' }, { client_id: undefined }, { canvas_integration: false }, { role: 'service_role' }, { is_anonymous: true }, { sub: '' }, { user_metadata: { canvas_integration: true }, canvas_integration: undefined }])('rejects invalid authorization %j', (change) => { expect(validCanvasClaims({ ...claims, ...change }, config)).toBe(false); });
});

describe('REST and MCP integration boundary', () => {
  it('exposes all eight documented tools, schemas and publication confirmation annotations', () => {
    expect(TOOLS).toHaveLength(8);
    expect(TOOLS.find((t) => t.name === 'publish_canvas').annotations.destructiveHint).toBe(true);
    expect(TOOLS.every((t) => t.inputSchema.additionalProperties === false && t.outputSchema)).toBe(true);
  });
  it('advertises OAuth metadata and challenges missing authentication', async () => {
    const s = server({ authenticated: false });
    const metadata = await s.handler(new Request('https://test.example/functions/v1/living-canvas-api/.well-known/oauth-protected-resource'));
    expect((await metadata.json()).authorization_servers).toEqual([s.deps.issuer]);
    const r = await s.mcp('tools/list');
    expect(r.status).toBe(401); expect(r.headers.get('WWW-Authenticate')).toContain('resource_metadata=');
    expect(s.repo.get).not.toHaveBeenCalled();
  });
  it('initializes stateless MCP, discovers tools and returns structured results', async () => {
    const s = server();
    expect((await (await s.mcp('initialize', { protocolVersion: '2025-11-25' })).json()).result.protocolVersion).toBe('2025-11-25');
    expect((await (await s.mcp('tools/list')).json()).result.tools).toHaveLength(8);
    const r = await (await s.mcp('tools/call', { name: 'list_canvases', arguments: {} })).json();
    expect(r.result.structuredContent.result.canvases).toHaveLength(1);
    expect(r.result.isError).toBe(false);
    expect((await s.request('mcp', { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
  });
  it('creates privately and forwards only whitelisted data to an atomic commit', async () => {
    const s = server(); const result = await (await s.tool('create_canvas', baseArgs)).json();
    const args = s.repo.commit.mock.calls[0][0];
    expect(args.p_patch.journey.entries[0].provenance).toBe('ai');
    expect(args.p_patch).not.toHaveProperty('share_token'); expect(args.p_patch).not.toHaveProperty('user_id');
    expect(result.result.canvas_url).toContain('?canvas=');
    expect(result.result.published_url).toBeUndefined();
  });
  it.each(['user_id', 'organization_id', 'step_count', 'share_token'])('rejects caller supplied %s', async (field) => {
    const s = server(); expect((await s.tool('create_canvas', { ...baseArgs, [field]: 'spoof' })).status).toBe(400); expect(s.repo.commit).not.toHaveBeenCalled();
  });
  it('rejects stale revisions and inaccessible IDs before changing content', async () => {
    const s = server(); expect((await s.tool('update_canvas', changeArgs(s.row, { expected_updated_at: '2020-01-01T00:00:00Z', title: 'Changed' }))).status).toBe(409);
    s.repo.get.mockResolvedValue(null);
    expect((await s.tool('get_canvas', { canvas_id: s.row.id })).status).toBe(404);
    expect((await s.tool('add_insight', changeArgs(s.row, { category: 'observation', text: 'Changed' }))).status).toBe(404);
    expect(s.repo.commit).not.toHaveBeenCalled();
  });
  it('replays identical requests without provider calls or another write, rejects key reuse', async () => {
    const s = server(); const args = { ...baseArgs, scriptures: [{ reference: 'Proverbs 20:5' }] };
    s.repo.receipt.mockResolvedValue({ request_hash: await fingerprint('create_canvas', args), result: { canvas_id: s.row.id, updated_at: revision } });
    expect((await s.tool('create_canvas', args)).status).toBe(200);
    expect(s.repo.commit).not.toHaveBeenCalled(); expect(s.deps.loadScripture).not.toHaveBeenCalled();
    expect((await s.tool('create_canvas', { ...args, title: 'Different' })).status).toBe(409);
    expect(await fingerprint('update_canvas', { a: 1, b: 2 })).toBe(await fingerprint('update_canvas', { b: 2, a: 1 }));
  });
  it('requires explicit publication authorization and selected nonpersonal cards', async () => {
    const s = server(); const args = changeArgs(s.row, { entry_ids: [s.row.journey.entries[0].id] });
    expect((await s.tool('publish_canvas', args)).status).toBe(400);
    const result = await (await s.tool('publish_canvas', { ...args, explicit_public_authorization: true })).json();
    expect(result.result.published_url).toBe('https://miqra.example/study-canvas/published/published-token');
    expect((await s.tool('publish_canvas', { ...args, explicit_public_authorization: true, entry_ids: [s.row.journey.entries[1].id] })).status).toBe(400);
  });
  it('rate limits, bounds request bytes, validates JSON, rejects cross-origin writes and unsupported transport', async () => {
    const s = server({ rate: false }); expect((await s.tool('list_canvases', {})).status).toBe(429);
    const normal = server();
    expect((await normal.request('tools/list_canvases', '{}', { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await normal.request('tools/list_canvases', '{}', { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await normal.request('tools/list_canvases', '{')).status).toBe(400);
    expect((await normal.request('tools/list_canvases', ' '.repeat(262145))).status).toBe(413);
    expect((await normal.handler(new Request('https://test.example/mcp'))).status).toBe(405);
    expect((await normal.request('mcp', { jsonrpc: '2.0', id: 1, method: 'ping' }, { 'MCP-Protocol-Version': '1900-01-01' })).status).toBe(400);
  });
  it('returns model-readable MCP tool errors and rejects invalid envelopes', async () => {
    const s = server(); const invalid = await (await s.mcp('tools/call', { name: 'update_canvas', arguments: {} })).json();
    expect(invalid.result.isError).toBe(true);
    expect((await (await s.request('mcp', [{ jsonrpc: '2.0', id: 1, method: 'ping' }])).json()).error.code).toBe(-32600);
    expect((await (await s.mcp('missing')).json()).error.code).toBe(-32601);
  });
});
