import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { renderTranscriptMarkdown } from './transcriptMarkdown';

describe('renderTranscriptMarkdown', () => {
  it('renders headings, hr, bold, blockquote, and paragraphs', () => {
    const text = [
      '# Go All Out: Peace, Holiness, and Your Inheritance',
      '',
      '**Speaker:** Mark Matthews  ',
      '**Text:** Hebrews 12:14–17',
      '',
      '---',
      '',
      '## Introduction',
      '',
      'Good morning everyone! My name is Mark.',
      '',
      '> Dear Lord, thank you for this morning.',
      '',
      'Let us begin.',
    ].join('\n');

    const { container } = render(<div>{renderTranscriptMarkdown(text)}</div>);

    expect(container.querySelector('h3')?.textContent).toBe('Go All Out: Peace, Holiness, and Your Inheritance');
    expect(container.querySelector('h4')?.textContent).toBe('Introduction');
    expect(container.querySelector('hr')).toBeTruthy();
    expect(container.querySelector('blockquote')?.textContent).toContain('Dear Lord');
    expect(container.querySelectorAll('strong')).toHaveLength(2);
    expect(container.textContent).toContain('Good morning everyone! My name is Mark.');
    expect(container.textContent).toContain('Let us begin.');
  });

  it('renders a plain-paragraph transcript with no markdown at all', () => {
    const text = 'First paragraph here.\n\nSecond paragraph here.';
    const { container } = render(<div>{renderTranscriptMarkdown(text)}</div>);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe('First paragraph here.');
    expect(paragraphs[1].textContent).toBe('Second paragraph here.');
  });

  it('renders a bullet list', () => {
    const text = '* Romans 8:28\n* Isaiah 53:5\n* Psalm 23';
    const { container } = render(<div>{renderTranscriptMarkdown(text)}</div>);
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });

  it('does not hang on nested bold text (regression: shared-regex loop, see chatMarkdown fix)', () => {
    const text = '**Bold with more bold inside is not valid markdown but should not hang** plain text after.';
    const { container } = render(<div>{renderTranscriptMarkdown(text)}</div>);
    expect(container.textContent).toContain('plain text after.');
  });

  it('returns null for empty input', () => {
    expect(renderTranscriptMarkdown('')).toBeNull();
    expect(renderTranscriptMarkdown(null)).toBeNull();
  });
});
