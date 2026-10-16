import { describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../supabase/functions/study-canvas/handler.ts';

const glimpse = 'A friend brought dinner when I felt overwhelmed.';
const reference = 'Galatians 6:2';
const context = 'Paul calls the community to bear burdens while restoring gently.';
const connection = 'Receiving help can be part of carrying one another’s burdens.';
const provider = (data) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) }, finish_reason: 'stop' }], usage: { total_tokens: 42 } }));
function setup(role = 'student') {
  const deps = {
    identity: vi.fn().mockResolvedValue(role ? { userId: 'verified', organizationId: 'org', role } : null),
    loadSources: vi.fn().mockResolvedValue({ reference: 'Galatians 6', chapterId: 'GAL.6', translation: 'BSB', sources: Array.from({ length: 6 }, (_, i) => ({
      id: `verse-GAL.6.${i + 1}`, kind: 'verse', ref: `Galatians 6:${i + 1}`, text: `Actual Bible text ${i + 1}`,
    })) }),
    env: (key) => key === 'SILICONFLOW_API_KEY' ? 'test-secret' : undefined,
    fetch: vi.fn().mockResolvedValueOnce(provider({ references: [reference] })).mockResolvedValueOnce(provider({ connections: [{ reference, context, connection }] })),
    recordUsage: vi.fn(),
  };
  const invoke = (body = {}) => createHandler(deps)(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ action: 'related', glimpse, ...body }) }));
  return { deps, invoke };
}

describe('related Scripture server', () => {
  it.each(['student', 'leader', 'parent_leader', 'student_leader', 'admin', 'developer'])('allows authenticated %s and grounds explanations in fetched chapter text', async (role) => {
    const { deps, invoke } = setup(role);
    const response = await invoke({ focus: 'Learning to receive help', userId: 'forged', model: 'forged', sources: ['forged'] });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.suggestions).toEqual([{ reference, scripture: {
      translation: 'BSB', verses: [{ reference, text: 'Actual Bible text 2' }],
      contextReference: 'Galatians 6:1–4', contextVerses: [1, 2, 3, 4].map((n) => ({ reference: `Galatians 6:${n}`, text: `Actual Bible text ${n}` })), context, connection, glimpse,
    } }]);
    expect(deps.loadSources).toHaveBeenCalledWith('Galatians 6', expect.any(AbortSignal));
    const payload = JSON.parse(deps.fetch.mock.calls[1][1].body);
    expect(payload.messages[1].content).toContain('Actual Bible text 6');
    expect(payload.messages[1].content).not.toContain('forged');
    expect(deps.recordUsage).toHaveBeenCalledTimes(2);
    expect(deps.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ userId: 'verified', feature: 'canvas-related-scripture' }));
  });
  it('rejects anonymous callers before provider or source requests', async () => {
    const { deps, invoke } = setup(null);
    expect((await invoke()).status).toBe(401);
    expect(deps.fetch).not.toHaveBeenCalled(); expect(deps.loadSources).not.toHaveBeenCalled();
  });
  it.each([{ glimpse: '' }, { glimpse: 'x'.repeat(4001) }, { focus: 2 }, { focus: 'x'.repeat(1001) }, { exclude: ['x'.repeat(101)] }, { exclude: Array(101).fill(reference) }])('validates input before spending credits: %j', async (body) => {
    const { deps, invoke } = setup();
    expect((await invoke(body)).status).toBe(400); expect(deps.fetch).not.toHaveBeenCalled();
  });
  it.each(['Galatians 6', 'Galatians 6:1–10', 'Invented 2:1', 'Galatians 6:90'])('rejects unverified or unbounded suggested passage %s', async (ref) => {
    const { deps, invoke } = setup(); deps.fetch.mockReset().mockResolvedValueOnce(provider({ references: [ref] }));
    expect((await invoke()).status).toBe(502);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });
  it('does not repeat an already saved reference and handles legacy multi-chapter exclusions', async () => {
    const { deps, invoke } = setup();
    const response = await invoke({ exclude: ['Gal 6:2', 'John 1–2'] });
    expect(response.status).toBe(200); expect((await response.json()).suggestions).toEqual([]);
    expect(deps.loadSources).not.toHaveBeenCalled(); expect(deps.fetch).toHaveBeenCalledTimes(1);
  });
  it('deduplicates references and loads each chapter once', async () => {
    const { deps, invoke } = setup();
    deps.fetch.mockReset().mockResolvedValueOnce(provider({ references: [reference, reference, 'Galatians 6:3'] })).mockResolvedValueOnce(provider({ connections: [
      { reference, context, connection }, { reference: 'Galatians 6:3', context, connection },
    ] }));
    const response = await invoke(); expect(response.status).toBe(200);
    expect((await response.json()).suggestions).toHaveLength(2); expect(deps.loadSources).toHaveBeenCalledTimes(1);
  });
  it('rejects explanations attached to an unknown reference', async () => {
    const { deps, invoke } = setup();
    deps.fetch.mockReset().mockResolvedValueOnce(provider({ references: [reference] })).mockResolvedValueOnce(provider({ connections: [{ reference: 'John 1:1', context, connection }] }));
    expect((await invoke()).status).toBe(502);
  });
  it('does not expose upstream errors, keys, or private inputs on failure', async () => {
    const { deps, invoke } = setup();
    deps.fetch.mockReset().mockResolvedValue(new Response(JSON.stringify({ error: `test-secret ${glimpse}` }), { status: 429 }));
    const response = await invoke(); expect(response.status).toBe(429);
    expect(await response.text()).not.toMatch(/test-secret|friend brought/);
  });
});
