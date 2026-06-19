import { describe, expect, it } from 'vitest';
import { buildArtDirectorPrompt, getHistoricalContext } from './scriptureImageUtils';

describe('buildArtDirectorPrompt insight context', () => {
  it('includes validated medium and high confidence study context', () => {
    const prompt = buildArtDirectorPrompt(
      'John 3:16',
      'For God so loved the world.',
      getHistoricalContext('John 3:16'),
      {
        historicalContext: { text: 'First-century Judea.', confidence: 'medium' },
        literaryContext: { text: 'Part of a Gospel narrative.', confidence: 'high' },
        keyThemes: [
          { theme: 'Divine love', confidence: 'high' },
          { theme: 'Eternal life', confidence: 'medium' },
        ],
      },
    );

    expect(prompt).toContain('Validated historical context: First-century Judea.');
    expect(prompt).toContain('Validated literary context: Part of a Gospel narrative.');
    expect(prompt).toContain('Validated key themes: Divine love, Eternal life');
  });

  it('excludes low-confidence study context from the art prompt', () => {
    const prompt = buildArtDirectorPrompt(
      'John 3:16',
      'For God so loved the world.',
      getHistoricalContext('John 3:16'),
      {
        historicalContext: { text: 'Speculative setting.', confidence: 'low' },
        literaryContext: { text: 'Speculative genre claim.', confidence: 'low' },
        keyThemes: [{ theme: 'Speculative symbol', confidence: 'low' }],
      },
    );

    expect(prompt).not.toContain('Speculative setting');
    expect(prompt).not.toContain('Speculative genre claim');
    expect(prompt).not.toContain('Speculative symbol');
  });
});
