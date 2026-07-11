import { describe, expect, it } from 'vitest';
import { passageIdToSefariaRef } from './sefaria';

describe('passageIdToSefariaRef', () => {
  it('builds refs for verses, ranges, and bare chapters', () => {
    expect(passageIdToSefariaRef('GEN.1.1')).toBe('Genesis 1:1');
    expect(passageIdToSefariaRef('GEN.1.1-GEN.1.3')).toBe('Genesis 1:1-3');
    expect(passageIdToSefariaRef('PSA.23')).toBe('Psalms 23');
  });

  it('maps numbered books to Sefaria roman-numeral names', () => {
    expect(passageIdToSefariaRef('1SA.17.4')).toBe('I Samuel 17:4');
    expect(passageIdToSefariaRef('2CH.7.14')).toBe('II Chronicles 7:14');
  });

  it('returns null for New Testament books', () => {
    expect(passageIdToSefariaRef('JHN.3.16')).toBeNull();
  });
});
