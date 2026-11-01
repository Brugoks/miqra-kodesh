import { describe, expect, it } from 'vitest';
import { createMoment, journeyToMarkdown, normalizeJourney, normalizeSermonSource } from './canvasJourney';
import { joinSuggestions, matchInsights, momentReferences, normalizeInsightPack, secondsAt, sermonEntry, spansOf, videoLink } from './sermonInsights';

const insight = (over = {}) => ({
  id: 'i1', anchor: 'Luke 4:18-19', refs: ['Luke 4:14-30'], claim: 'Jesus\' assignment was settled before his hometown reacted.',
  quote: { text: 'Your assignment is greater than the applause', at: '10:05' }, question: 'What has God already given you to do?', ...over,
});
const talk = (over = {}) => ({
  id: 'talk-1', title: 'The Assignment Is Greater Than the Applause', speaker_name: 'Michael Peavey', talk_date: '2026-10-18',
  video_url: 'https://www.youtube.com/live/mQLJcgwa7hY?is=abc', canvas_insights: { version: 1, insights: [insight()] }, ...over,
});
const now = new Date(2026, 9, 19, 9, 0);
const moment = (text, entries = []) => ({ ...createMoment(text, '7', now).journey, entries });
const scriptureEntry = (reference, id = 'e1', extra = {}) => ({ id, kind: 'scripture', reference, text: 'My note.', createdAt: now.toISOString(), ...extra });

describe('spansOf', () => {
  it('reads verses, ranges and whole chapters', () => {
    expect(spansOf('Luke 4:18-19')).toEqual([{ book: 'LUK', chapter: 4, from: 18, to: 19 }]);
    expect(spansOf('Luke 4:30')).toEqual([{ book: 'LUK', chapter: 4, from: 30, to: 30 }]);
    expect(spansOf('Luke 4')).toEqual([{ book: 'LUK', chapter: 4, from: 1, to: 999 }]);
    expect(spansOf('nonsense')).toEqual([]);
  });
});

describe('normalizeInsightPack', () => {
  it('accepts a good pack and drops what it cannot trust', () => {
    const pack = normalizeInsightPack({ version: 1, insights: [insight(), insight({ id: 'i2', anchor: 'Not A Verse' }), insight({ id: 'i3', claim: '' }), { nope: true }, null] });
    expect(pack.insights.map((i) => i.id)).toEqual(['i1']);
  });
  it.each([null, undefined, {}, { version: 2, insights: [insight()] }, { version: 1 }, { version: 1, insights: [] }, 'x'])('reads %j as no pack', (value) => {
    expect(normalizeInsightPack(value)).toBeNull();
  });
  it('keeps only usable extra references and a well-formed quote time', () => {
    const [i] = normalizeInsightPack({ version: 1, insights: [insight({ refs: ['Luke 4:14-30', 'junk', 7], quote: { text: 'Your assignment is greater', at: 'soon' } })] }).insights;
    expect(i.refs).toEqual(['Luke 4:14-30']);
    expect(i.quote).toEqual({ text: 'Your assignment is greater', at: null });
  });
  it('reads at most six insights', () => {
    const many = Array.from({ length: 9 }, (_, n) => insight({ id: `i${n + 1}` }));
    expect(normalizeInsightPack({ version: 1, insights: many }).insights).toHaveLength(6);
  });
});

describe('momentReferences', () => {
  it('collects passages the person attached and passages they mentioned in their own words', () => {
    const j = moment('Reading Luke 4:14 this morning made me think about Nazareth.', [scriptureEntry('Psalms 23'), { id: 'e2', kind: 'reflection', text: 'See also John 3:16.', createdAt: now.toISOString() }]);
    expect(momentReferences(j).map((r) => r.ref).sort()).toEqual(['John 3:16', 'Luke 4:14', 'Psalms 23']);
  });
  it('does nothing when there is no passage anywhere', () => {
    expect(momentReferences(moment('A friend brought dinner when I felt overwhelmed.'))).toEqual([]);
  });
});

describe('matchInsights (no AI)', () => {
  it('matches on passage overlap and says which of the person\'s passages it came through', () => {
    const j = moment('Hard week.', [scriptureEntry('Luke 4:19-21')]);
    const [hit] = matchInsights(j, [talk()]);
    expect(hit).toMatchObject({ via: 'Luke 4:19-21', shared: 'Luke 4:18-19', talk: { id: 'talk-1', speaker: 'Michael Peavey', date: '2026-10-18' } });
    expect(hit.insight.id).toBe('i1');
  });
  it('finds a passage the person only mentioned in their words', () => {
    expect(matchInsights(moment('I keep thinking about Luke 4:30 and leaving the crowd behind.'), [talk()])).toHaveLength(1);
  });
  it('offers nothing when passages do not overlap, or when the moment names no passage at all', () => {
    expect(matchInsights(moment('Hard week.', [scriptureEntry('Psalms 23')]), [talk()])).toEqual([]);
    expect(matchInsights(moment('Hard week.'), [talk()])).toEqual([]);
    expect(matchInsights(moment('Hard week.', [scriptureEntry('Luke 5:1-5')]), [talk()])).toEqual([]);
  });
  it('ranks the insight\'s own passage above one the sermon merely touched, and a bare chapter below a verse', () => {
    const talks = [talk({ id: 'a', canvas_insights: { version: 1, insights: [insight({ id: 'i1', anchor: 'Luke 4:30', refs: ['Luke 4:14-30'] }), insight({ id: 'i2', anchor: 'Luke 4:18-19', refs: [] })] } })];
    const verse = matchInsights(moment('x', [scriptureEntry('Luke 4:18')]), talks);
    expect(verse.map((h) => h.insight.id)).toEqual(['i2', 'i1']); // anchor hit (3) before refs hit (2)
    const chapter = matchInsights(moment('x', [scriptureEntry('Luke 4')]), talks);
    expect(chapter.every((h) => h.score < 3)).toBe(true);
  });
  it('prefers newer talks on a tie and respects the limit', () => {
    const talks = ['t1', 't2', 't3'].map((id) => talk({ id }));
    expect(matchInsights(moment('x', [scriptureEntry('Luke 4:18')]), talks, 2).map((h) => h.talk.id)).toEqual(['t1', 't2']);
  });
  it('never offers an insight the person has already brought in', () => {
    const j = moment('x', [scriptureEntry('Luke 4:18-19', 'e1', { sermon: normalizeSermonSource({ talkId: 'talk-1', insightId: 'i1', title: 'T', claim: 'c', question: 'q?' }) })]);
    expect(matchInsights(j, [talk()])).toEqual([]);
  });
  it('ignores a talk whose pack cannot be read', () => {
    expect(matchInsights(moment('x', [scriptureEntry('Luke 4:18')]), [talk({ canvas_insights: { version: 9 } }), talk({ canvas_insights: null })])).toEqual([]);
  });
});

describe('joinSuggestions', () => {
  it('joins AI picks to the person\'s own copy of the talks and drops anything it cannot find', () => {
    const j = moment('x');
    const out = joinSuggestions([
      { talkId: 'talk-1', insightId: 'i1', why: 'This may meet the waiting you describe.' },
      { talkId: 'talk-9', insightId: 'i1', why: 'unknown talk' },
      { talkId: 'talk-1', insightId: 'i9', why: 'unknown insight' },
      { talkId: 'talk-1', insightId: 'i1', why: '' },
    ], [talk()], j);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ why: 'This may meet the waiting you describe.', insight: { id: 'i1' }, talk: { title: 'The Assignment Is Greater Than the Applause' } });
    expect(joinSuggestions('nope', [talk()], j)).toEqual([]);
  });
});

describe('videoLink', () => {
  it('opens a YouTube recording at the second it was said', () => {
    expect(videoLink('https://www.youtube.com/live/mQLJcgwa7hY?is=abc', '31:22')).toBe('https://www.youtube.com/live/mQLJcgwa7hY?is=abc&t=1882s');
    expect(videoLink('https://youtu.be/abc', '1:02:03')).toBe('https://youtu.be/abc?t=3723s');
  });
  it('leaves other hosts alone, and refuses anything that is not https', () => {
    expect(videoLink('https://vimeo.com/123', '10:00')).toBe('https://vimeo.com/123');
    expect(videoLink('http://example.test/x', '10:00')).toBeNull();
    expect(videoLink('javascript:alert(1)', null)).toBeNull();
    expect(videoLink('', null)).toBeNull();
  });
  it('reads clock times', () => { expect(secondsAt('0:05')).toBe(5); expect(secondsAt('soon')).toBeNull(); });
});

describe('bringing a connection into the canvas', () => {
  const pick = () => ({ talk: { id: 'talk-1', title: 'The Assignment Is Greater Than the Applause', speaker: 'Michael Peavey', date: '2026-10-18', videoUrl: 'https://www.youtube.com/live/x' }, insight: insight() });

  it('makes an ordinary Scripture entry in the person\'s own words, with the sermon beside it', () => {
    const entry = sermonEntry(pick(), '  I keep waiting for someone to say well done.  ', now);
    expect(entry).toMatchObject({ kind: 'scripture', reference: 'Luke 4:18-19', text: 'I keep waiting for someone to say well done.' });
    expect(entry.sermon).toMatchObject({ talkId: 'talk-1', insightId: 'i1', speaker: 'Michael Peavey', date: '2026-10-18', quote: { at: '10:05' } });
    // It passes the journey's own validation, so it saves like any other entry...
    const journey = moment('Hard week.', [entry]);
    expect(normalizeJourney(journey).entries[0].sermon.title).toBe('The Assignment Is Greater Than the Applause');
  });
  it('requires the person\'s own words', () => {
    expect(() => sermonEntry(pick(), '   ')).toThrow(/own words/);
  });
  it('says so plainly when the sermon source itself cannot be stored, instead of blaming the words', () => {
    const tooLong = pick();
    tooLong.talk.title = 'x'.repeat(201);
    expect(() => sermonEntry(tooLong, 'My words.')).toThrow(/could not be saved/);
  });
  it('stays valid for a client that has never heard of sermons: a Scripture entry with words and a reference', () => {
    const { sermon, ...legacy } = sermonEntry(pick(), 'My words.', now);
    expect(sermon).toBeTruthy();
    expect(normalizeJourney(moment('Hard week.', [legacy])).entries[0]).toMatchObject({ kind: 'scripture', text: 'My words.', reference: 'Luke 4:18-19' });
  });
  it('drops a damaged source rather than failing the person\'s words', () => {
    const entry = { ...sermonEntry(pick(), 'My words.', now), sermon: { talkId: 'x' } };
    const [kept] = normalizeJourney(moment('Hard week.', [entry])).entries;
    expect(kept.text).toBe('My words.');
    expect(kept.sermon).toBeUndefined();
  });
  it('keeps the source only on Scripture entries', () => {
    const entry = { id: 'r1', kind: 'reflection', text: 'x', createdAt: now.toISOString(), sermon: sermonEntry(pick(), 'w', now).sermon };
    expect(normalizeJourney(moment('Hard week.', [entry])).entries[0].sermon).toBeUndefined();
  });
  it('rejects non-https video links in the stored source', () => {
    const source = sermonEntry(pick(), 'w', now).sermon;
    expect(normalizeSermonSource({ ...source, videoUrl: 'http://example.test' })).toBeNull();
    expect(normalizeSermonSource({ ...source, date: '2026-02-30' })).toBeNull();
    expect(normalizeSermonSource({ ...source, quote: { text: '' } })).toBeNull();
  });
  it('travels with the entry when the canvas is exported', () => {
    const entry = sermonEntry(pick(), 'I keep waiting for someone to say well done.', now);
    const md = journeyToMarkdown({ title: 'T', journey: moment('Hard week.', [entry]) });
    expect(md).toContain('From the sermon “The Assignment Is Greater Than the Applause” · Michael Peavey · 2026-10-18');
    expect(md).toContain('Question to sit with: What has God already given you to do?');
    expect(md).toContain('I keep waiting for someone to say well done.');
  });
});
