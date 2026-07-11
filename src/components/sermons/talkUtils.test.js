import { describe, it, expect } from 'vitest';
import { getTalkCategory, formatTalkDate, normalizeTakeaways } from './talkUtils';

describe('getTalkCategory', () => {
  it('returns the matching category', () => {
    expect(getTalkCategory('message').label).toBe('Message');
    expect(getTalkCategory('sermon').label).toBe('Sermon');
  });

  it('falls back to sermon for unknown values', () => {
    expect(getTalkCategory('bumper').value).toBe('sermon');
    expect(getTalkCategory(null).value).toBe('sermon');
  });
});

describe('formatTalkDate', () => {
  it('formats a date-only string without timezone drift', () => {
    expect(formatTalkDate('2026-07-05')).toBe('Jul 5, 2026');
  });

  it('returns empty string for missing or invalid input', () => {
    expect(formatTalkDate('')).toBe('');
    expect(formatTalkDate(null)).toBe('');
    expect(formatTalkDate('not-a-date')).toBe('');
  });
});

describe('normalizeTakeaways', () => {
  it('returns trimmed, non-empty strings from an array', () => {
    expect(normalizeTakeaways([' one ', '', 'two', 42, null])).toEqual(['one', 'two']);
  });

  it('parses JSON strings', () => {
    expect(normalizeTakeaways('["a","b"]')).toEqual(['a', 'b']);
  });

  it('returns an empty array for invalid input', () => {
    expect(normalizeTakeaways(null)).toEqual([]);
    expect(normalizeTakeaways('not json')).toEqual([]);
    expect(normalizeTakeaways({ a: 1 })).toEqual([]);
  });
});
