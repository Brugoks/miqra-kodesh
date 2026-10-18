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
  it.each(['Galatians 6', 'Galatians 6:1–10', 'Invented 2:1', 'Galatians 6:90'])('never shows an unverified or unbounded passage (%s), and gives up after one corrective retry', async (ref) => {
    const { deps, invoke } = setup(); deps.fetch.mockReset().mockImplementation(async () => provider({ references: [ref] }));
    expect((await invoke()).status).toBe(502);
    expect(deps.fetch).toHaveBeenCalledTimes(2); // the pick, then one retry; the explanation is never reached
    const retry = JSON.parse(deps.fetch.mock.calls[1][1].body).messages;
    expect(retry.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(JSON.parse(retry[3].content).notUsable).toHaveLength(1);
  });
  it('drops an over-long pick on its own and keeps the rest, with no retry', async () => {
    // The laments run past 8 verses; one of them must not sink a request whose other picks are sound.
    const { deps, invoke } = setup();
    deps.fetch.mockReset().mockResolvedValueOnce(provider({ references: ['Galatians 6:1–15', reference, 'Galatians 6:3'] }))
      .mockResolvedValueOnce(provider({ connections: [{ reference, context, connection }, { reference: 'Galatians 6:3', context, connection }] }));
    const response = await invoke();
    expect(response.status).toBe(200);
    expect((await response.json()).suggestions.map((s) => s.reference)).toEqual([reference, 'Galatians 6:3']);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
    const explainInput = JSON.parse(JSON.parse(deps.fetch.mock.calls[1][1].body).messages[1].content);
    expect(explainInput.passages.map((p) => p.reference)).toEqual([reference, 'Galatians 6:3']);
  });
  it('drops a pick whose verses do not exist and keeps one that does', async () => {
    const { deps, invoke } = setup();
    deps.fetch.mockReset().mockResolvedValueOnce(provider({ references: ['Galatians 6:90', reference] }))
      .mockResolvedValueOnce(provider({ connections: [{ reference, context, connection }] }));
    const response = await invoke();
    expect(response.status).toBe(200);
    expect((await response.json()).suggestions.map((s) => s.reference)).toEqual([reference]);
  });
  it('tells the model what was wrong when nothing was usable, and accepts a good second try', async () => {
    const { deps, invoke } = setup();
    deps.fetch.mockReset().mockResolvedValueOnce(provider({ references: ['Galatians 6:1–15', 'Invented 2:1'] }))
      .mockResolvedValueOnce(provider({ references: [reference] }))
      .mockResolvedValueOnce(provider({ connections: [{ reference, context, connection }] }));
    const response = await invoke();
    expect(response.status).toBe(200);
    expect((await response.json()).suggestions.map((s) => s.reference)).toEqual([reference]);
    expect(deps.fetch).toHaveBeenCalledTimes(3);
    const retry = JSON.parse(deps.fetch.mock.calls[1][1].body).messages;
    const feedback = JSON.parse(retry[3].content);
    expect(feedback.notUsable).toEqual(['Galatians 6:1–15 is 15 verses long', '"Invented 2:1" is not a valid chapter and verse range']);
    expect(feedback.rule).toMatch(/1–8 verses/);
    expect(retry[2]).toEqual({ role: 'assistant', content: JSON.stringify({ references: ['Galatians 6:1–15', 'Invented 2:1'] }) });
  });
  it('considers only the first three references if the model sends more, and still rejects an empty or malformed answer', async () => {
    const { deps, invoke } = setup();
    deps.fetch.mockReset().mockResolvedValueOnce(provider({ references: [reference, 'Galatians 6:3', 'Galatians 6:4', 'Galatians 6:5'] }))
      .mockResolvedValueOnce(provider({ connections: [reference, 'Galatians 6:3', 'Galatians 6:4'].map((r) => ({ reference: r, context, connection })) }));
    expect((await (await invoke()).json()).suggestions).toHaveLength(3);
    for (const bad of [{ references: [] }, { references: 'Galatians 6:2' }, {}]) {
      const next = setup(); next.deps.fetch.mockReset().mockImplementation(async () => provider(bad));
      expect((await next.invoke()).status).toBe(502);
      expect(next.deps.fetch).toHaveBeenCalledTimes(1); // a malformed answer is not retried
    }
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
