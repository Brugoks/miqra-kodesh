import { describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../supabase/functions/study-canvas/handler.ts';
import { candidatesFrom, sermonConnections, validateSermons } from '../../supabase/functions/study-canvas/sermons.ts';

const glimpse = 'I keep waiting for someone to tell me I did a good job at work.';
const insight = (over = {}) => ({ id: 'i1', anchor: 'Luke 4:18-19', refs: [], claim: 'Jesus\' assignment was settled before his hometown reacted.', quote: null, question: 'What has God already given you to do?', ...over });
const talk = (over = {}) => ({ id: 'talk-1', title: 'The Assignment Is Greater Than the Applause', speaker_name: 'Michael Peavey', talk_date: '2026-10-18', canvas_insights: { version: 1, insights: [insight(), insight({ id: 'i2', anchor: 'Luke 4:30', claim: 'He went his way.' })] }, ...over });
const provider = (data) => new Response(JSON.stringify({ choices: [{ message: { content: typeof data === 'string' ? data : JSON.stringify(data) }, finish_reason: 'stop' }], usage: { total_tokens: 30 } }));

function setup(role = 'student', talks = [talk()], answer = { picks: [{ id: 'talk-1:i1', why: 'Waiting for someone to say well done may be one way the question of whose approval you are living for shows up.' }] }) {
  const deps = {
    identity: vi.fn().mockResolvedValue(role ? { userId: 'verified', organizationId: 'org', role } : null),
    loadSources: vi.fn(),
    loadInsights: vi.fn().mockResolvedValue(talks),
    env: (key) => (key === 'SILICONFLOW_API_KEY' ? 'test-secret' : undefined),
    fetch: vi.fn().mockImplementation(async () => provider(answer)),
    recordUsage: vi.fn(),
  };
  const invoke = (body = {}) => createHandler(deps)(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify({ action: 'sermons', glimpse, ...body }) }));
  return { deps, invoke };
}

describe('sermon connections server', () => {
  it.each(['student', 'leader', 'admin', 'developer'])('answers an authenticated %s with ids the model chose from the closed list', async (role) => {
    const { deps, invoke } = setup(role);
    const response = await invoke({ focus: 'Feeling unseen' });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.suggestions).toEqual([{ talkId: 'talk-1', insightId: 'i1', why: expect.stringContaining('may be one way') }]);
    expect(deps.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ userId: 'verified', feature: 'canvas-sermon-connections' }));
    const sent = JSON.parse(deps.fetch.mock.calls[0][1].body).messages;
    const payload = JSON.parse(sent[1].content);
    expect(payload.glimpse).toBe(glimpse);
    expect(payload.focus).toBe('Feeling unseen');
    expect(payload.candidates.map((c) => c.id)).toEqual(['talk-1:i1', 'talk-1:i2']);
  });

  it('loads the church\'s talks as the caller, and never from the request body', async () => {
    const { deps, invoke } = setup();
    await invoke({ candidates: [{ id: 'forged:i1', point: 'Forged sermon point' }], talks: [talk({ id: 'forged' })], userId: 'someone-else' });
    expect(deps.loadInsights).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ userId: 'verified', organizationId: 'org' }));
    const sent = deps.fetch.mock.calls[0][1].body;
    expect(sent).not.toContain('Forged sermon point');
    expect(sent).not.toContain('forged');
  });

  it('rejects anonymous callers before loading talks or calling a provider', async () => {
    const { deps, invoke } = setup(null);
    expect((await invoke()).status).toBe(401);
    expect(deps.loadInsights).not.toHaveBeenCalled(); expect(deps.fetch).not.toHaveBeenCalled();
  });

  it.each([{ glimpse: '' }, { glimpse: 'x'.repeat(4001) }, { focus: 2 }, { focus: 'x'.repeat(1001) }, { exclude: 'talk-1:i1' }, { exclude: ['x'.repeat(81)] }, { exclude: Array(101).fill('a:b') }])('validates input before spending credits: %j', async (body) => {
    const { deps, invoke } = setup();
    expect((await invoke(body)).status).toBe(400);
    expect(deps.fetch).not.toHaveBeenCalled(); expect(deps.loadInsights).not.toHaveBeenCalled();
  });

  it('makes no provider call when the church has no insights to choose from', async () => {
    const { deps, invoke } = setup('student', []);
    const response = await invoke();
    expect((await response.json()).suggestions).toEqual([]);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('does not offer what the person has already brought in', async () => {
    const { deps, invoke } = setup();
    await invoke({ exclude: ['talk-1:i1'] });
    const payload = JSON.parse(JSON.parse(deps.fetch.mock.calls[0][1].body).messages[1].content);
    expect(payload.candidates.map((c) => c.id)).toEqual(['talk-1:i2']);
  });

  it('treats "nothing truly connects" as a valid answer', async () => {
    const { invoke } = setup('student', [talk()], { picks: [] });
    expect((await (await invoke()).json()).suggestions).toEqual([]);
  });

  it('drops any pick the model invented, duplicated, or left without an explanation, and keeps at most three', async () => {
    const answer = { picks: [
      { id: 'talk-9:i1', why: 'A sermon that does not exist.' },
      { id: 'talk-1:i1', why: 'This may meet the waiting you describe.' },
      { id: 'talk-1:i1', why: 'Again, the same one.' },
      { id: 'talk-1:i2', why: '' },
      { id: 42, why: 'Not even an id.' },
      { id: 'talk-1:i2', why: 'He went his way, which might speak to leaving the approval question behind.' },
    ] };
    const { invoke } = setup('student', [talk()], answer);
    const { suggestions } = await (await invoke()).json();
    expect(suggestions.map((s) => `${s.talkId}:${s.insightId}`)).toEqual(['talk-1:i1', 'talk-1:i2']);
  });

  it.each([
    'God is telling you to wait on him.', 'The Lord is saying to you that this season is a gift.', 'Jesus wants you to let go of the need for applause.',
    'This is a sign that you should stay.', 'The Holy Spirit has revealed that your boss is wrong.', 'This is God\'s message for you today.', 'You must trust God and quit.',
  ])('never lets the app announce what God is saying: %s', async (why) => {
    const { invoke } = setup('student', [talk()], { picks: [{ id: 'talk-1:i1', why }] });
    expect((await (await invoke()).json()).suggestions).toEqual([]);
  });

  it.each([
    'This sermon point may speak to the waiting you describe.', 'One way this might connect is the question of whose approval you are living for.',
    'The speaker suggests that assignment comes before applause, which could be worth holding up beside what you wrote.',
  ])('allows tentative wording: %s', async (why) => {
    const { invoke } = setup('student', [talk()], { picks: [{ id: 'talk-1:i1', why }] });
    expect((await (await invoke()).json()).suggestions).toHaveLength(1);
  });

  it.each(['not json', '{"picks":"nope"}', '[]', '{}'])('reports an unreadable model answer (%s) instead of guessing', async (answer) => {
    const { invoke } = setup('student', [talk()], answer);
    expect((await invoke()).status).toBe(502);
  });
});

describe('candidatesFrom', () => {
  it('keeps only well-formed insights from well-formed talks, and caps the list', () => {
    const talks = [
      talk(), talk({ id: 'old', canvas_insights: { version: 2, insights: [insight()] } }), talk({ id: 'none', canvas_insights: null }),
      talk({ id: 'bad', canvas_insights: { version: 1, insights: [insight({ claim: '' }), { nope: 1 }, null] } }),
    ];
    expect(candidatesFrom(talks).map((c) => c.id)).toEqual(['talk-1:i1', 'talk-1:i2']);
    const many = Array.from({ length: 20 }, (_, n) => talk({ id: `t${n}`, canvas_insights: { version: 1, insights: Array.from({ length: 6 }, (_, k) => insight({ id: `i${k}` })) } }));
    expect(candidatesFrom(many)).toHaveLength(72);
  });
  it('passes only what the model needs to choose with', () => {
    expect(candidatesFrom([talk()])[0]).toEqual({ id: 'talk-1:i1', sermon: 'The Assignment Is Greater Than the Applause', speaker: 'Michael Peavey', date: '2026-10-18', passage: 'Luke 4:18-19', point: insight().claim, question: insight().question });
  });
});

describe('validateSermons', () => {
  it('trims and de-duplicates', () => {
    expect(validateSermons({ glimpse: ` ${glimpse} `, focus: ' x ', exclude: ['a:b', 'a:b'] })).toEqual({ glimpse, focus: 'x', exclude: ['a:b'] });
  });
});

describe('sermonConnections', () => {
  it('asks the model for nothing when there is nothing to choose from', async () => {
    const generate = vi.fn();
    expect(await sermonConnections({ glimpse, focus: '', exclude: [] }, [], generate)).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
});
