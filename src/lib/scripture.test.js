import { describe, expect, it } from 'vitest';
import { refToPassageIds, SCRIPTURE_CHAIN_REGEX, normalizeReference, expandPassageIdVerses, passageIdToDisplay } from './scripture';

describe('scripture reference parsing', () => {
  it('expands chained chapter and verse references', () => {
    expect(refToPassageIds('Revelation 3:5;13:8;17:8;20:12,15;21:27')).toEqual([
      'REV.3.5',
      'REV.13.8',
      'REV.17.8',
      'REV.20.12',
      'REV.20.15',
      'REV.21.27',
    ]);
  });

  it('supports hyphen and en-dash verse ranges', () => {
    expect(refToPassageIds('Romans 8:28-30')).toEqual(['ROM.8.28-ROM.8.30']);
    expect(refToPassageIds('Romans 8:28–30')).toEqual(['ROM.8.28-ROM.8.30']);
  });

  it('detects a full chained reference as one linkable match', () => {
    SCRIPTURE_CHAIN_REGEX.lastIndex = 0;
    const match = SCRIPTURE_CHAIN_REGEX.exec('Read Revelation 3:5;13:8;17:8;20:12,15;21:27, before group.');
    expect(normalizeReference(match[0])).toBe('Revelation 3:5;13:8;17:8;20:12,15;21:27');
  });

  it('supports chapter-only references', () => {
    expect(refToPassageIds('John 3')).toEqual(['JHN.3']);
    expect(refToPassageIds('1 John 2')).toEqual(['1JN.2']);
  });

  it('detects a chapter-only reference as a linkable match', () => {
    SCRIPTURE_CHAIN_REGEX.lastIndex = 0;
    const match = SCRIPTURE_CHAIN_REGEX.exec('Let us study John 3 together.');
    expect(normalizeReference(match[0])).toBe('John 3');
  });
});

describe('expandPassageIdVerses', () => {
  it('returns a single verse unchanged', () => {
    expect(expandPassageIdVerses('JHN.3.16')).toEqual(['JHN.3.16']);
  });

  it('expands same-chapter ranges', () => {
    expect(expandPassageIdVerses('JHN.3.16-JHN.3.18')).toEqual(['JHN.3.16', 'JHN.3.17', 'JHN.3.18']);
  });

  it('falls back to the start for cross-chapter ranges and bare chapters', () => {
    expect(expandPassageIdVerses('JHN.1.50-JHN.2.2')).toEqual(['JHN.1.50']);
    expect(expandPassageIdVerses('PSA.23')).toEqual(['PSA.23']);
  });
});

describe('passageIdToDisplay', () => {
  it('formats single verses', () => {
    expect(passageIdToDisplay('JHN.1.1')).toBe('John 1:1');
    expect(passageIdToDisplay('1CO.13.4')).toBe('1 Corinthians 13:4');
  });

  it('formats same-chapter ranges', () => {
    expect(passageIdToDisplay('JHN.1.1-JHN.1.3')).toBe('John 1:1-3');
  });

  it('formats cross-chapter ranges', () => {
    expect(passageIdToDisplay('JHN.1.50-JHN.2.2')).toBe('John 1:50-2:2');
  });

  it('formats bare chapters and rejects unknown books', () => {
    expect(passageIdToDisplay('PSA.23')).toBe('Psalms 23');
    expect(passageIdToDisplay('XXX.1.1')).toBeNull();
  });
});
