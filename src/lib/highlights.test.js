import { describe, it, expect } from 'vitest';
import {
  HIGHLIGHT_COLORS,
  DEFAULT_HIGHLIGHT_COLOR,
  isValidColor,
  colorLabel,
  parseVerseId,
  buildVerseId,
  verseIdToDisplay,
  toHighlight,
  indexByVerseId,
  compareCanonical,
  versesCoveredBy,
  chaptersCoveredBy,
} from './highlights';

describe('colors', () => {
  it('has a stable default that is itself a valid color', () => {
    expect(isValidColor(DEFAULT_HIGHLIGHT_COLOR)).toBe(true);
    expect(HIGHLIGHT_COLORS[0].key).toBe(DEFAULT_HIGHLIGHT_COLOR);
  });

  it('rejects unknown colors', () => {
    expect(isValidColor('chartreuse')).toBe(false);
    expect(isValidColor(undefined)).toBe(false);
  });

  it('labels colors, falling back for unknown ones', () => {
    expect(colorLabel('gold')).toBe('Promise');
    expect(colorLabel('nope')).toBe('Highlight');
  });
});

describe('parseVerseId', () => {
  it('parses a single verse', () => {
    expect(parseVerseId('JHN.3.16')).toEqual({ bookCode: 'JHN', chapter: 3, verse: 16 });
  });

  it('parses numeric book codes', () => {
    expect(parseVerseId('1PE.5.7')).toEqual({ bookCode: '1PE', chapter: 5, verse: 7 });
  });

  it('rejects bare chapters, ranges, unknown books and junk', () => {
    expect(parseVerseId('JHN.3')).toBeNull();
    expect(parseVerseId('JHN.3.16-JHN.3.18')).toBeNull();
    expect(parseVerseId('XYZ.1.1')).toBeNull();
    expect(parseVerseId('JHN.three.16')).toBeNull();
    expect(parseVerseId('')).toBeNull();
    expect(parseVerseId(null)).toBeNull();
  });

  it('rejects non-positive chapter or verse', () => {
    expect(parseVerseId('JHN.0.1')).toBeNull();
    expect(parseVerseId('JHN.1.0')).toBeNull();
  });
});

describe('buildVerseId', () => {
  it('round-trips with parseVerseId', () => {
    const id = buildVerseId('ROM', 8, 28);
    expect(id).toBe('ROM.8.28');
    expect(parseVerseId(id)).toEqual({ bookCode: 'ROM', chapter: 8, verse: 28 });
  });

  it('returns null for an unknown book', () => {
    expect(buildVerseId('NOPE', 1, 1)).toBeNull();
  });
});

describe('verseIdToDisplay', () => {
  it('renders a human reference', () => {
    expect(verseIdToDisplay('JHN.3.16')).toBe('John 3:16');
    expect(verseIdToDisplay('1PE.5.7')).toBe('1 Peter 5:7');
  });

  it('returns null when unparseable', () => {
    expect(verseIdToDisplay('JHN.3')).toBeNull();
  });
});

describe('toHighlight', () => {
  it('maps a row and defaults an invalid color', () => {
    const h = toHighlight({
      id: 'a', verse_id: 'JHN.3.16', book_code: 'JHN', chapter: 3, verse: 16,
      color: 'not-a-color', note: null, verse_text: 'For God so loved…',
    });
    expect(h.color).toBe(DEFAULT_HIGHLIGHT_COLOR);
    expect(h.note).toBe('');
    expect(h.verseText).toBe('For God so loved…');
  });

  it('returns null without a verse id', () => {
    expect(toHighlight({ id: 'a' })).toBeNull();
    expect(toHighlight(null)).toBeNull();
  });
});

describe('indexByVerseId', () => {
  it('indexes rows and skips invalid ones', () => {
    const map = indexByVerseId([
      { id: '1', verse_id: 'JHN.3.16', color: 'gold' },
      { id: '2', color: 'blue' },
      null,
    ]);
    expect(map.size).toBe(1);
    expect(map.get('JHN.3.16').color).toBe('gold');
  });

  it('handles empty input', () => {
    expect(indexByVerseId(null).size).toBe(0);
  });
});

describe('compareCanonical', () => {
  it('orders by book, then chapter, then verse', () => {
    const rows = [
      { bookCode: 'REV', chapter: 1, verse: 1 },
      { bookCode: 'GEN', chapter: 2, verse: 3 },
      { bookCode: 'GEN', chapter: 1, verse: 1 },
      { bookCode: 'JHN', chapter: 3, verse: 16 },
      { bookCode: 'GEN', chapter: 1, verse: 2 },
    ];
    expect(rows.slice().sort(compareCanonical).map((r) => `${r.bookCode}.${r.chapter}.${r.verse}`))
      .toEqual(['GEN.1.1', 'GEN.1.2', 'GEN.2.3', 'JHN.3.16', 'REV.1.1']);
  });

  it('puts the Old Testament before the New', () => {
    expect(compareCanonical({ bookCode: 'MAL', chapter: 4, verse: 6 }, { bookCode: 'MAT', chapter: 1, verse: 1 })).toBeLessThan(0);
  });
});

describe('versesCoveredBy', () => {
  it('expands a same-chapter range inclusively', () => {
    expect(versesCoveredBy('ROM.8.28-ROM.8.30')).toEqual(['ROM.8.28', 'ROM.8.29', 'ROM.8.30']);
  });

  it('returns the single verse when there is no range', () => {
    expect(versesCoveredBy('JHN.3.16')).toEqual(['JHN.3.16']);
  });

  it('does not expand across chapters', () => {
    expect(versesCoveredBy('JHN.1.50-JHN.2.2')).toEqual(['JHN.1.50']);
  });

  it('returns null for a bare chapter', () => {
    expect(versesCoveredBy('PSA.23')).toBeNull();
  });

  it('refuses absurd ranges rather than allocating', () => {
    expect(versesCoveredBy('PSA.119.1-PSA.119.500')).toEqual(['PSA.119.1']);
  });
});

describe('chaptersCoveredBy', () => {
  it('collects distinct book/chapter pairs', () => {
    expect(chaptersCoveredBy(['ROM.8.28-ROM.8.30', 'ROM.8.1', 'JHN.3'])).toEqual([
      { bookCode: 'ROM', chapter: 8 },
      { bookCode: 'JHN', chapter: 3 },
    ]);
  });

  it('spans both chapters of a cross-chapter range', () => {
    expect(chaptersCoveredBy(['JHN.1.50-JHN.2.2'])).toEqual([
      { bookCode: 'JHN', chapter: 1 },
      { bookCode: 'JHN', chapter: 2 },
    ]);
  });

  it('ignores unknown books and junk', () => {
    expect(chaptersCoveredBy(['XYZ.1.1', 'nonsense', ''])).toEqual([]);
  });

  it('handles empty input', () => {
    expect(chaptersCoveredBy(null)).toEqual([]);
  });
});
