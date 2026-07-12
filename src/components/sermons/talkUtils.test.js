import { describe, it, expect } from 'vitest';
import {
  getTalkCategory, formatTalkDate, normalizeTakeaways,
  getMaturityBand, maturityPercent,
} from './talkUtils';

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

describe('getMaturityBand', () => {
  it('maps scores to milk / transitional / solid food bands', () => {
    expect(getMaturityBand(1).label).toBe('Milk');
    expect(getMaturityBand(2.33).label).toBe('Milk');
    expect(getMaturityBand(2.34).label).toBe('Transitional');
    expect(getMaturityBand(3.66).label).toBe('Transitional');
    expect(getMaturityBand(3.67).label).toBe('Solid food');
    expect(getMaturityBand(5).label).toBe('Solid food');
  });

  it('returns null for non-numeric input', () => {
    expect(getMaturityBand(null)).toBeNull();
    expect(getMaturityBand('milk')).toBeNull();
    expect(getMaturityBand(undefined)).toBeNull();
  });
});

describe('maturityPercent', () => {
  it('maps the 1-5 scale to 0-100', () => {
    expect(maturityPercent(1)).toBe(0);
    expect(maturityPercent(3)).toBe(50);
    expect(maturityPercent(5)).toBe(100);
  });

  it('clamps out-of-range scores and zeroes invalid input', () => {
    expect(maturityPercent(0)).toBe(0);
    expect(maturityPercent(9)).toBe(100);
    expect(maturityPercent('nope')).toBe(0);
  });
});
