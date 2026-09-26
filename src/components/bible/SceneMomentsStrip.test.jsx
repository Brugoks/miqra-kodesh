import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SceneMomentsStrip from './SceneMomentsStrip';
import { refToPassageIds } from '../../lib/scripture';

describe('SceneMomentsStrip', () => {
  it('offers the place a passage happened, and goes there when chosen', async () => {
    const onEnter = vi.fn();
    render(<SceneMomentsStrip passageIds={refToPassageIds('Mark 1:29-31')} onEnter={onEnter} />);
    const link = await screen.findByRole('button', { name: /The Fever Left Her/ });
    expect(link).toHaveTextContent('Capernaum · The house · Mark 1:29-31');
    fireEvent.click(link);
    expect(onEnter).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'capernaum', kind: 'event', id: 'mother-in-law', path: '/scene/capernaum?event=mother-in-law',
    }));
  });

  it('shows a few, with the rest behind a toggle', async () => {
    render(<SceneMomentsStrip passageIds={refToPassageIds('Mark 1')} limit={3} />);
    await screen.findByRole('button', { name: /Fishers of Men/ });
    expect(screen.queryByRole('button', { name: /The Whole City at the Door/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show \d+ more/ }));
    expect(screen.getByRole('button', { name: /The Whole City at the Door/ })).toBeInTheDocument();
  });

  it('shows nothing for a passage no scene is about', async () => {
    const { container } = render(<SceneMomentsStrip passageIds={refToPassageIds('Genesis 1')} />);
    // Let the lazy index resolve before asserting the strip stayed empty.
    await import('../../lib/sceneScripture');
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
