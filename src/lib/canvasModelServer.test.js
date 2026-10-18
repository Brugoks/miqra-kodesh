import { describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../supabase/functions/study-canvas/handler.ts';
import { CANVAS_MODELS, canvasModelKey } from './canvasModels.js';

const reference = 'Galatians 6:2';
const workspace = { reference: 'Mark 2:5', chapterId: 'MRK.2', translation: 'BSB', sources: [{ id: 'verse-MRK.2.5', kind: 'verse', title: 'Mark 2:5', text: 'Seeing their faith…' }] };
const explanation = { title: 'Faith and forgiveness', cards: [{ title: 'Jesus responds', body: 'Jesus responds to their faith.', kind: 'observation', sourceIds: ['verse-MRK.2.5'] }], questions: ['What follows?'] };
const chapter = { reference: 'Galatians 6', chapterId: 'GAL.6', translation: 'BSB', sources: Array.from({ length: 6 }, (_, i) => ({ id: `verse-GAL.6.${i + 1}`, kind: 'verse', ref: `Galatians 6:${i + 1}`, text: `Actual Bible text ${i + 1}` })) };
const reply = (content, usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }], usage }));
const ENV = { SILICONFLOW_API_KEY: 'sf-secret', OPENROUTER_API_KEY: 'or-secret' };

function setup(role = 'developer', env = ENV) {
  const deps = {
    identity: vi.fn().mockResolvedValue(role ? { userId: 'verified', organizationId: 'org', role } : null),
    loadSources: vi.fn().mockImplementation(async (ref) => (ref === 'Galatians 6' ? chapter : workspace)),
    env: (key) => env[key],
    fetch: vi.fn().mockImplementation(async () => reply(explanation)),
    recordUsage: vi.fn().mockResolvedValue(undefined),
  };
  const invoke = (body = {}) => createHandler(deps)(new Request('https://example.test/study-canvas', {
    method: 'POST', headers: { Authorization: 'Bearer x' },
    body: JSON.stringify({ action: 'explain', reference: 'Mark 2:5', turns: [{ role: 'user', content: 'Explain this.' }], ...body }),
  }));
  return { deps, invoke };
}
const sent = (deps, n = 0) => ({ url: deps.fetch.mock.calls[n][0], headers: deps.fetch.mock.calls[n][1].headers, body: JSON.parse(deps.fetch.mock.calls[n][1].body) });
const keyOf = (model) => CANVAS_MODELS.find((entry) => entry.model === model).key;

describe('Living Canvas model registry', () => {
  it('has unique keys, known providers and a token budget for every model', () => {
    expect(new Set(CANVAS_MODELS.map((entry) => entry.key)).size).toBe(CANVAS_MODELS.length);
    for (const entry of CANVAS_MODELS) {
      expect(['siliconflow', 'openrouter']).toContain(entry.provider);
      expect(entry.key).toBe(canvasModelKey(entry.provider, entry.model));
      expect(entry.maxTokens).toBeGreaterThanOrEqual(2200);
      expect(entry.label).toBeTruthy();
    }
  });
  it('offers the three frontier families through OpenRouter and the Chinese models through SiliconFlow', () => {
    const open = CANVAS_MODELS.filter((entry) => entry.provider === 'openrouter').map((entry) => entry.model);
    expect(open).toEqual(expect.arrayContaining(['openai/gpt-6.1-sol', 'anthropic/claude-sonnet-5.5']));
    expect(open.some((model) => model.startsWith('google/gemini'))).toBe(true);
    const sf = CANVAS_MODELS.filter((entry) => entry.provider === 'siliconflow').map((entry) => entry.model);
    expect(sf).toEqual(expect.arrayContaining(['deepseek-ai/DeepSeek-V4-Pro', 'moonshotai/Kimi-K3', 'zai-org/GLM-5.3', 'Qwen/Qwen3.8-2.4T-A95B', 'MiniMaxAI/MiniMax-M3']));
  });
});

describe('Living Canvas model switching', () => {
  it.each(['admin', 'student', 'leader', 'parent_leader', 'student_leader'])('ignores a model choice from role %s and runs the default', async (role) => {
    // Related Scripture is open to every signed-in member, so this exercises the real path for each role.
    const { deps, invoke } = setup(role);
    deps.fetch.mockReset()
      .mockResolvedValueOnce(reply({ references: [reference] }))
      .mockResolvedValueOnce(reply({ connections: [{ reference, context: 'Paul calls the community to bear burdens.', connection: 'Receiving help can be part of carrying burdens.' }] }));
    const response = await invoke({ action: 'related', glimpse: 'A friend brought dinner.', modelChoice: keyOf('openai/gpt-6.1-sol') });
    expect(response.status).toBe(200);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
    for (const call of deps.fetch.mock.calls) {
      expect(call[0]).toBe('https://api.siliconflow.com/v1/chat/completions');
      expect(JSON.parse(call[1].body).model).toBe('deepseek-ai/DeepSeek-V4-Flash');
    }
    const data = await response.json();
    expect(data.model).toBe('deepseek-ai/DeepSeek-V4-Flash');
    expect(data.diagnostics).toBeUndefined();
    expect(deps.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ provider: 'siliconflow' }));
  });

  it('runs the default when a developer sends no choice, and honours SILICONFLOW_CANVAS_MODEL', async () => {
    const { deps, invoke } = setup('developer', { ...ENV, SILICONFLOW_CANVAS_MODEL: 'deepseek-ai/DeepSeek-V4-Pro' });
    expect((await invoke({ modelChoice: '' })).status).toBe(200);
    expect(sent(deps).body.model).toBe('deepseek-ai/DeepSeek-V4-Pro');
    expect(sent(deps).body.enable_thinking).toBe(false);
  });

  it('rejects a choice that is not in the registry before any source or provider work', async () => {
    const { deps, invoke } = setup();
    for (const modelChoice of ['openrouter:some/other-model', 'siliconflow:../../x', 'gpt-6.1-sol', 42, {}]) {
      const response = await invoke({ modelChoice });
      expect(response.status).toBe(400);
    }
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(deps.loadSources).not.toHaveBeenCalled();
  });

  it('sends a developer’s SiliconFlow choice to SiliconFlow with its own token budget', async () => {
    const { deps, invoke } = setup();
    const response = await invoke({ modelChoice: keyOf('zai-org/GLM-5.3') });
    expect(response.status).toBe(200);
    const call = sent(deps);
    expect(call.url).toBe('https://api.siliconflow.com/v1/chat/completions');
    expect(call.headers.Authorization).toBe('Bearer sf-secret');
    expect(call.body).toMatchObject({ model: 'zai-org/GLM-5.3', max_tokens: 6000, enable_thinking: false, response_format: { type: 'json_object' } });
    expect(deps.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ provider: 'siliconflow', userId: 'verified' }));
  });

  it.each(['openai/gpt-6.1-sol', 'anthropic/claude-sonnet-5.5', 'google/gemini-4-argon'])('sends %s through OpenRouter with low reasoning and JSON mode', async (model) => {
    const { deps, invoke } = setup();
    deps.fetch.mockImplementation(async () => reply(explanation, { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200, cost: 0.0042 }));
    const response = await invoke({ modelChoice: keyOf(model) });
    expect(response.status).toBe(200);
    const call = sent(deps);
    expect(call.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(call.headers.Authorization).toBe('Bearer or-secret');
    expect(call.headers['X-Title']).toBe('Miqra Kodesh');
    expect(call.body).toMatchObject({ model, max_tokens: 8000, response_format: { type: 'json_object' }, reasoning: { effort: 'low', exclude: true }, provider: { require_parameters: true } });
    expect(call.body).not.toHaveProperty('enable_thinking');
    expect(call.body.messages[0].content).toContain('verse-MRK.2.5');
    expect(deps.recordUsage).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'openrouter', feature: 'study-canvas', userId: 'verified', organizationId: 'org',
      metadata: expect.objectContaining({ model, inputTokens: 1000, outputTokens: 200, costUsd: 0.0042, explicitChoice: true }),
    }));
    const data = await response.json();
    expect(data.model).toBe(model);
    expect(data.explanation.cards[0].sourceIds).toEqual(['verse-MRK.2.5']);
    expect(data.diagnostics).toMatchObject({ provider: 'openrouter', model, calls: 1, inputTokens: 1000, outputTokens: 200, costUsd: 0.0042 });
    expect(data.diagnostics.ms).toBeGreaterThanOrEqual(0);
  });

  it('runs both Related Scripture calls on the chosen model and totals what they cost', async () => {
    const { deps, invoke } = setup();
    const usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.01 };
    deps.fetch.mockReset()
      .mockResolvedValueOnce(reply({ references: [reference] }, usage))
      .mockResolvedValueOnce(reply({ connections: [{ reference, context: 'Paul calls the community to bear burdens.', connection: 'Receiving help can be part of carrying burdens.' }] }, usage));
    const response = await invoke({ action: 'related', glimpse: 'A friend brought dinner.', modelChoice: keyOf('anthropic/claude-sonnet-5.5') });
    expect(response.status).toBe(200);
    expect(deps.fetch.mock.calls.map((call) => call[0])).toEqual(Array(2).fill('https://openrouter.ai/api/v1/chat/completions'));
    expect(deps.fetch.mock.calls.map((call) => JSON.parse(call[1].body).model)).toEqual(Array(2).fill('anthropic/claude-sonnet-5.5'));
    const data = await response.json();
    expect(data.suggestions[0].reference).toBe(reference);
    expect(data.diagnostics).toMatchObject({ calls: 2, inputTokens: 200, outputTokens: 40, costUsd: 0.02 });
  });

  it('reports no cost when the provider does not send one', async () => {
    const { invoke } = setup();
    const data = await (await invoke({ modelChoice: keyOf('moonshotai/Kimi-K3') })).json();
    expect(data.diagnostics.costUsd).toBeNull();
  });

  it('is not configured → 503 before any provider request, per provider', async () => {
    const noOpenRouter = setup('developer', { SILICONFLOW_API_KEY: 'sf-secret' });
    const openRouter = await noOpenRouter.invoke({ modelChoice: keyOf('openai/gpt-6.1-sol') });
    expect(openRouter.status).toBe(503);
    expect((await openRouter.json()).error).toMatch(/OpenRouter is not configured/);
    expect(noOpenRouter.deps.fetch).not.toHaveBeenCalled();
    const noSiliconFlow = setup('developer', { OPENROUTER_API_KEY: 'or-secret' });
    expect((await noSiliconFlow.invoke({ modelChoice: keyOf('moonshotai/Kimi-K3') })).status).toBe(503);
    expect(noSiliconFlow.deps.fetch).not.toHaveBeenCalled();
  });

  it('shows a developer the provider’s own reason when their chosen model fails, but not the default’s', async () => {
    const failure = (status, message) => async () => new Response(JSON.stringify({ error: { message } }), { status });
    const chosen = setup();
    chosen.deps.fetch.mockImplementation(failure(404, 'No endpoints found for openai/gpt-6.1-sol'));
    const chosenResponse = await chosen.invoke({ modelChoice: keyOf('openai/gpt-6.1-sol') });
    expect(chosenResponse.status).toBe(502);
    expect((await chosenResponse.json()).error).toContain('No endpoints found for openai/gpt-6.1-sol');
    const fallback = setup();
    fallback.deps.fetch.mockImplementation(failure(500, 'internal upstream detail'));
    const fallbackResponse = await fallback.invoke();
    expect((await fallbackResponse.json()).error).toBe('SiliconFlow could not complete this study. Please retry or check the configured model.');
  });

  it.each([[429, 429, /busy/], [402, 502, /out of credits/], [401, 502, /could not be authorized/]])('maps OpenRouter %i to a readable message', async (status, expected, pattern) => {
    const { deps, invoke } = setup();
    deps.fetch.mockImplementation(async () => new Response('{}', { status }));
    const response = await invoke({ modelChoice: keyOf('google/gemini-4-argon') });
    expect(response.status).toBe(expected);
    expect((await response.json()).error).toMatch(pattern);
  });

  it('treats a reasoning run that hit the token limit as incomplete rather than parsing half an answer', async () => {
    const { deps, invoke } = setup();
    deps.fetch.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"title":' }, finish_reason: 'length' }], usage: {} })));
    expect((await invoke({ modelChoice: keyOf('openai/gpt-6.1-sol') })).status).toBe(502);
  });

  it('never lets the client choose the provider URL, key or request body', async () => {
    const { deps, invoke } = setup();
    await invoke({ modelChoice: keyOf('openai/gpt-6.1-sol'), url: 'https://evil.example', apiKey: 'x', max_tokens: 999999, reasoning: { effort: 'max' }, provider: 'siliconflow' });
    const call = sent(deps);
    expect(call.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(call.headers.Authorization).toBe('Bearer or-secret');
    expect(call.body.max_tokens).toBe(8000);
    expect(call.body.reasoning).toEqual({ effort: 'low', exclude: true });
  });
});
