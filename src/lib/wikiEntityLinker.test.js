import { describe, it, expect } from 'vitest';
import { matchEntitySegments, resolvePattern } from './wikiEntityLinker';

// A hand-built index in the shape loadEntityLinkIndex() resolves — two Johns
// sharing a name, the Baptist better-attested.
const baptist = { s: 'john_baptist', n: 'John', type: 'person', vc: 90, p: ['MAT.3', 'LUK.3'] };
const apostle = { s: 'john_apostle', n: 'John', type: 'person', vc: 35, p: ['JHN.13', '1JN.1', 'REV.1'] };
const peter = { s: 'peter_1', n: 'Peter', type: 'person', vc: 175, p: ['MAT.4'] };

const index = {
  bySlug: new Map([[baptist.s, baptist], [apostle.s, apostle], [peter.s, peter]]),
  patternToSlug: new Map([['John', 'john_baptist'], ['Peter', 'peter_1']]),
  patternToAlternates: new Map([['John', ['john_baptist', 'john_apostle']], ['Peter', ['peter_1']]]),
  regex: /\b(?:John|Peter)\b/g,
};

describe('resolvePattern', () => {
  it('defaults to the best-attested entry', () => {
    expect(resolvePattern(index, 'John')).toBe('john_baptist');
  });

  it('prefers an alternate present in the given book', () => {
    expect(resolvePattern(index, 'John', '1JN')).toBe('john_apostle');
    expect(resolvePattern(index, 'John', 'REV')).toBe('john_apostle');
    // the default still wins where it actually appears
    expect(resolvePattern(index, 'John', 'MAT')).toBe('john_baptist');
  });

  it('ignores book context for unambiguous names', () => {
    expect(resolvePattern(index, 'Peter', '1JN')).toBe('peter_1');
  });
});

describe('matchEntitySegments with book context', () => {
  it('links ambiguous names to the in-book entry', () => {
    const segments = matchEntitySegments('Then John wrote to the churches.', index, null, 'REV');
    const linked = segments.find((s) => s.slug);
    expect(linked.slug).toBe('john_apostle');
    expect(linked.text).toBe('John');
  });

  it('skips the self entry and stitches text back together', () => {
    const segments = matchEntitySegments('John and Peter ran together.', index, 'john_baptist');
    expect(segments.map((s) => s.text).join('')).toBe('John and Peter ran together.');
    expect(segments.filter((s) => s.slug).map((s) => s.slug)).toEqual(['peter_1']);
  });
});
