import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { firstUrl, allUrls, linkifyText } from './linkUtils';

describe('firstUrl / allUrls', () => {
  it('finds a bare url', () => {
    expect(firstUrl('check https://example.com/path out')).toBe('https://example.com/path');
  });

  it('returns null/empty when there is no url', () => {
    expect(firstUrl('no links here')).toBeNull();
    expect(allUrls('no links here')).toEqual([]);
  });
});

describe('linkifyText', () => {
  it('returns plain text unchanged when there is no url', () => {
    expect(linkifyText('just some text')).toBe('just some text');
  });

  it('returns empty string as-is', () => {
    expect(linkifyText('')).toBe('');
    expect(linkifyText(null)).toBe('');
  });

  it('turns a bare url into a clickable link, preserving surrounding text', () => {
    const { container } = render(<div>{linkifyText('Sign up at https://example.com/rsvp today')}</div>);
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://example.com/rsvp');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    expect(container.textContent).toBe('Sign up at https://example.com/rsvp today');
  });

  it('links multiple urls in the same body', () => {
    const { container } = render(
      <div>{linkifyText('https://a.example.com and https://b.example.com')}</div>,
    );
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('https://a.example.com');
    expect(links[1].getAttribute('href')).toBe('https://b.example.com');
  });
});
