import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiTimeline from './WikiTimeline';

// Renders against the real generated assets so a bad regeneration fails loudly.
describe('WikiTimeline', () => {
  it('renders centuries spanning Bible and church history', async () => {
    render(<MemoryRouter><WikiTimeline /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Timeline' })).toBeInTheDocument();
    // A Bible-era figure and a church-history teacher both appear.
    expect(await screen.findByText('Augustine of Hippo')).toBeInTheDocument();
    expect((await screen.findAllByText(/BC/)).length).toBeGreaterThan(0);
  });
});
