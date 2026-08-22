import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { renderChatMarkdown } from './chatMarkdown';

describe('renderChatMarkdown', () => {
  it('renders nested bold/italic spans without hanging (regression: shared-regex infinite loop)', () => {
    const body = [
      '🎙️ **New Sermon Discussion: Full On Family (Jesus Style)**',
      '*Speaker:* Scott Matthews | *Scripture:* Hebrews 13:1-3',
      '',
      'A short summary paragraph.',
      '',
      '💬 **Community Questions:**',
      '1. What does it mean?',
      '2. Have you ever?',
      '3. How can we?',
    ].join('\n');

    const { container } = render(<div>{renderChatMarkdown(body)}</div>);

    expect(container.querySelectorAll('strong')).toHaveLength(2);
    expect(container.querySelectorAll('em')).toHaveLength(2);
    expect(container.textContent).toContain('New Sermon Discussion: Full On Family (Jesus Style)');
    expect(container.textContent).toContain('Speaker:');
    expect(container.textContent).toContain('Community Questions:');
  });

  it('renders a plain bold span at the start of text (single match, no siblings)', () => {
    const { container } = render(<div>{renderChatMarkdown('**bold** then plain text')}</div>);
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.textContent).toBe('bold then plain text');
  });
});
