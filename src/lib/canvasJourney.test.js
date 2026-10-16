import { describe, expect, it } from 'vitest';
import { createMoment, isRevisitDue, journeyToMarkdown, normalizeJourney, revisitDate } from './canvasJourney';
import { canvasToMarkdown, normalizeCanvas } from './studyCanvasModel';

const now = new Date(2026, 9, 15, 16, 0);
const moment = () => createMoment('A friend helped me receive kindness.', '7', now);
const entry = { id: 'e1', kind: 'reflection', text: 'I asked for help.', createdAt: now.toISOString() };

describe('personal moments', () => {
  it('saves a moment without passages or an AI explanation and preserves its original words', () => {
    const canvas = moment();
    const normalized = normalizeCanvas({ ...canvas, journey: { ...canvas.journey, entries: [entry] } });
    expect(normalized.passages).toEqual([]);
    expect(normalized.steps).toEqual([]);
    expect(normalized.journey.moment).toBe('A friend helped me receive kindness.');
    expect(normalized.journey.entries).toEqual([entry]);
    expect(normalized.journey.revisitOn).toBe('2026-10-22');
  });
  it('rejects malformed moments, invalid dates, unknown kinds, and duplicate entries', () => {
    const j = moment().journey;
    expect(normalizeJourney({ ...j, moment: ' ' })).toBeNull();
    expect(normalizeJourney({ ...j, createdAt: 'bad' })).toBeNull();
    expect(normalizeJourney({ ...j, revisitOn: '2026-02-30' })).toBeNull();
    expect(normalizeJourney({ ...j, entries: [entry, entry] })).toBeNull();
    expect(normalizeJourney({ ...j, entries: [{ ...entry, kind: 'toString' }] })).toBeNull();
    expect(normalizeJourney({ ...j, entries: [{ ...entry, kind: 'scripture' }] })).toBeNull();
    expect(normalizeCanvas({ ...moment(), journey: {} })).toBeNull();
  });
  it('uses calendar dates for revisits, including month boundaries and opting out', () => {
    expect(revisitDate('7', new Date(2026, 0, 28, 23))).toBe('2026-02-04');
    expect(revisitDate('', now)).toBeNull();
    expect(isRevisitDue('2026-10-15', '2026-10-15')).toBe(true);
    expect(isRevisitDue('2026-10-16', '2026-10-15')).toBe(false);
    expect(isRevisitDue(null)).toBe(false);
  });
  it('exports only the entries selected and omits personal content when notes are excluded', () => {
    const canvas = { ...moment(), journey: { ...moment().journey, entries: [entry, { ...entry, id: 'e2', text: 'A very private prayer', kind: 'prayer' }] } };
    const md = journeyToMarkdown(canvas, [entry]);
    expect(md).toContain(canvas.journey.moment);
    expect(md).toContain('I asked for help.');
    expect(md).not.toContain('A very private prayer');
    expect(canvasToMarkdown(canvas, { includeNotes: false })).not.toContain(canvas.journey.moment);
  });
});
