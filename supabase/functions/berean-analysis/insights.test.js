import { describe, it, expect } from 'vitest';
import { buildInsightPack, canonicalReference, INSIGHT_PACK_VERSION, MAX_INSIGHTS, paragraphWindows } from './insights.ts';
import { parseReference } from './reference.ts';

const transcript = '# A sermon\n\n[10:00] Jesus knew his assignment before he sought anybody\'s approval and he went his way. '
  + 'Your assignment is greater than the applause from the people at church.\n\n'
  + '## Second point\n\n> [12:00] Then he passed through the midst of them and went on his way without any fear at all.\n';

const report = {
  promptVersion: 'berean-v4',
  cards: [
    { id: 'c1', assessment: 'aligned', passageText: '[18] The Spirit of the Lord is upon me', quoteVerified: true },
    { id: 'c2', assessment: 'context-caution', passageText: '[1] text', quoteVerified: true },
    { id: 'c3', assessment: 'aligned', passageText: null, quoteVerified: true },
    { id: 'c4', assessment: 'aligned', passageText: '[1] text', quoteVerified: false },
  ],
};
const now = new Date('2026-10-18T20:00:00Z');
const good = () => ({
  anchor: 'Luke 4:18-19', refs: ['Luke 4:14-30'], cards: ['c1'],
  claim: 'Jesus\' assignment was settled before his hometown\'s reaction.',
  quote: { text: 'Your assignment is greater than the applause from the people at church', at: '10:05' },
  question: 'What has God already given you to do that you are waiting for applause to confirm?',
});
const build = (insights, r = report) => buildInsightPack({ insights }, r, transcript, { model: 'test-model', now });

describe('buildInsightPack', () => {
  it('builds a versioned pack with stable ids and a canonical anchor', () => {
    const { pack, problems } = build([good(), { ...good(), anchor: 'luke 4:30', claim: 'He went his way.', quote: undefined }]);
    expect(problems).toEqual([]);
    expect(pack).toMatchObject({ version: INSIGHT_PACK_VERSION, generatedAt: '2026-10-18T20:00:00.000Z', model: 'test-model', basedOn: 'berean-v4' });
    expect(pack.insights.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(pack.insights[0]).toMatchObject({ anchor: 'Luke 4:18-19', refs: ['Luke 4:14-30'], cards: ['c1'], quote: { at: '10:05' } });
    expect(pack.insights[1].anchor).toBe('Luke 4:30');
    expect(pack.insights[1].quote).toBeNull();
  });

  it('never turns a card the review doubted into a member insight', () => {
    const { problems } = build([{ ...good(), cards: ['c2'] }]);
    expect(problems.join(' ')).toMatch(/not aligned/);
  });

  it.each([['c3', /no fetched passage/], ['c4', /not found in the transcript/], ['c99', /does not exist/]])('rejects card %s', (id, pattern) => {
    expect(build([{ ...good(), cards: [id] }]).problems.join(' ')).toMatch(pattern);
  });

  it('requires a card: an insight must be traceable to the review', () => {
    expect(build([{ ...good(), cards: [] }]).problems.join(' ')).toMatch(/name the Berean card/);
  });

  it('rejects a quote that is not in the transcript, and one that is too short', () => {
    expect(build([{ ...good(), quote: { text: 'God told me personally that you will be healed this week', at: '1:00' } }]).problems.join(' ')).toMatch(/not found in the transcript/);
    expect(build([{ ...good(), quote: { text: 'the applause', at: '1:00' } }]).problems.join(' ')).toMatch(/4\+ words/);
  });

  it.each(['31', '1:2', 'soon', '12:345'])('rejects a malformed quote time %s', (at) => {
    expect(build([{ ...good(), quote: { ...good().quote, at } }]).problems.join(' ')).toMatch(/quote time/);
  });
  it.each(['31:22', '1:02:03', '0:05'])('accepts the format of quote time %s (checked against a transcript with no markers)', (at) => {
    const plain = 'Your assignment is greater than the applause from the people at church.';
    const { problems } = buildInsightPack({ insights: [{ ...good(), quote: { ...good().quote, at } }] }, report, plain, { model: 'm', now });
    expect(problems).toEqual([]);
  });

  it('rejects a quote time that is not inside the paragraph the words are spoken in', () => {
    const q = (at) => ({ ...good().quote, at });
    expect(build([{ ...good(), quote: q('13:00') }]).problems.join(' ')).toMatch(/outside the paragraph it is spoken in \(starts 10:00\)/);
    expect(build([{ ...good(), quote: q('9:59') }]).problems.join(' ')).toMatch(/outside the paragraph/);
    expect(build([{ ...good(), quote: q('10:00') }]).problems).toEqual([]);
    expect(build([{ ...good(), quote: q('11:59') }]).problems).toEqual([]);
  });
  it('reads a time against a blockquoted paragraph too, and the last paragraph runs to the end', () => {
    const second = { ...good(), anchor: 'Luke 4:30', claim: 'He went on his way.', quote: { text: 'Then he passed through the midst of them and went on his way', at: '12:30' } };
    expect(build([second]).problems).toEqual([]);
    expect(build([{ ...second, quote: { ...second.quote, at: '11:00' } }]).problems.join(' ')).toMatch(/starts 12:00/);
  });
  it('uses the opening of an ellipsis quote to find its paragraph', () => {
    const quote = { text: 'Jesus knew his assignment before he sought anybody\'s approval ... went his way', at: '10:01' };
    expect(build([{ ...good(), quote }]).problems).toEqual([]);
    expect(build([{ ...good(), quote: { ...quote, at: '12:30' } }]).problems.join(' ')).toMatch(/outside the paragraph/);
  });
  it('skips the time check for an older transcript that has no markers, and accepts a quote with no time', () => {
    const plain = 'Jesus knew his assignment before he sought anybody\'s approval and he went his way. Your assignment is greater than the applause from the people at church.';
    const { problems } = buildInsightPack({ insights: [{ ...good(), quote: { ...good().quote, at: '99:59' } }] }, report, plain, { model: 'm', now });
    expect(problems).toEqual([]);
    expect(build([{ ...good(), quote: { ...good().quote, at: null } }]).problems).toEqual([]);
  });

  it('requires a real question, so the pack invites reflection rather than declaring a message', () => {
    expect(build([{ ...good(), question: 'God is telling you to trust him.' }]).problems.join(' ')).toMatch(/must be a question/);
  });

  it('validates references and bounds', () => {
    expect(build([{ ...good(), anchor: 'Hezekiah 4:2' }]).problems.join(' ')).toMatch(/not a valid/);
    expect(build([{ ...good(), refs: ['Luke 4:14-30', 'Nonsense 1:1'] }]).problems.join(' ')).toMatch(/Nonsense/);
    expect(build([{ ...good(), refs: Array(5).fill('Luke 4:1-2') }]).problems.join(' ')).toMatch(/at most 4 extra/);
    expect(build([{ ...good(), claim: 'x'.repeat(281) }]).problems.join(' ')).toMatch(/claim must be/);
    expect(build([]).problems.join(' ')).toMatch(/at least one/);
    expect(build(Array(MAX_INSIGHTS + 1).fill(good())).problems.join(' ')).toMatch(/At most 6/);
  });

  it('flags a duplicate rather than saving it twice', () => {
    expect(build([good(), good()]).problems.join(' ')).toMatch(/duplicates/);
  });

  it('does not repeat the anchor in refs', () => {
    const { pack } = build([{ ...good(), refs: ['Luke 4:18-19', 'Luke 4:18–19', 'Luke 4:14-30'] }]);
    expect(pack.insights[0].refs).toEqual(['Luke 4:14-30']);
  });

  it('takes nothing from a member: the pack depends only on the sermon inputs', () => {
    // The signature is (raw, report, transcript, meta) - there is no parameter through which a canvas could enter.
    expect(buildInsightPack.length).toBe(4);
  });
});

describe('paragraphWindows', () => {
  it('reads the marker at the start of each paragraph, plain or blockquoted, and ends each at the next', () => {
    const windows = paragraphWindows('# T\n\n## H\n\n[1:05] one\n\n> [2:10] two\n\n[1:02:03] three\n');
    expect(windows.map((w) => [w.start, w.end])).toEqual([[65, 130], [130, 3723], [3723, Infinity]]);
    expect(windows.map((w) => w.text)).toEqual(['one', 'two', 'three']);
  });
  it('finds none in a transcript without markers', () => { expect(paragraphWindows('# T\n\nJust words.\n')).toEqual([]); });
});

describe('canonicalReference', () => {
  it.each([['Luke 4:18-19', 'Luke 4:18-19'], ['John 3:16', 'John 3:16'], ['Psalm 23', 'Psalms 23'], ['Jude 5-7', 'Jude 1:5-7']])('%s -> %s', (input, expected) => {
    // Psalm/Psalms both resolve through NAME_TO_CODE; Jude's verses are chapter 1.
    const name = canonicalReference(parseReference(input));
    expect(name === expected || name === expected.replace('Psalms', 'Psalm')).toBe(true);
  });
});
