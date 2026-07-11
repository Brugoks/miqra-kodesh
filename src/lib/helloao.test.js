import { describe, expect, it } from 'vitest';
import { flattenVerseContent, parsePassageId, buildPassageContent } from './helloao';

describe('flattenVerseContent', () => {
  it('joins strings and text objects, skipping note markers', () => {
    expect(flattenVerseContent([
      'Jesus replied,',
      { text: '"Truly, truly, I tell you' },
      { noteId: 13 },
      '"',
    ])).toBe('Jesus replied, "Truly, truly, I tell you "');
  });

  it('handles non-arrays', () => {
    expect(flattenVerseContent(null)).toBe('');
  });
});

describe('parsePassageId', () => {
  it('parses single verses, ranges, and bare chapters', () => {
    expect(parsePassageId('JHN.3.16')).toEqual({ book: 'JHN', chapter: 3, from: 16, to: 16 });
    expect(parsePassageId('JHN.3.16-JHN.3.18')).toEqual({ book: 'JHN', chapter: 3, from: 16, to: 18 });
    expect(parsePassageId('PSA.23')).toEqual({ book: 'PSA', chapter: 23, from: null, to: null });
  });
});

describe('buildPassageContent', () => {
  const chapterJson = {
    chapter: {
      content: [
        { type: 'heading', content: ['Jesus and Nicodemus'] },
        { type: 'verse', number: 16, content: ['For God so loved the world'] },
        { type: 'line_break' },
        { type: 'verse', number: 17, content: ['For God did not send', { noteId: 1 }] },
        { type: 'verse', number: 18, content: ['Whoever believes'] },
      ],
    },
  };

  it('slices the requested verse range with implicit-chapter markers', () => {
    expect(buildPassageContent(chapterJson, 'JHN.3.16-JHN.3.17', 3))
      .toBe('[16] For God so loved the world [17] For God did not send');
  });

  it('uses explicit chapter markers when the chapter differs from the lookup start', () => {
    expect(buildPassageContent(chapterJson, 'JHN.3.16', 13))
      .toBe('[3:16] For God so loved the world');
  });

  it('includes the whole chapter for bare-chapter passage ids', () => {
    expect(buildPassageContent(chapterJson, 'JHN.3', 3))
      .toBe('[16] For God so loved the world [17] For God did not send [18] Whoever believes');
  });
});
