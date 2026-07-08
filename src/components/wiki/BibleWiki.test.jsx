import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import BibleWiki from './BibleWiki';

// Renders against the real generated asset (src/assets/bible-wiki.json) so a
// bad regeneration breaks the build loudly.
function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/wiki" element={<BibleWiki session={null} userRole="student" activeOrgId={null} />} />
        <Route path="/wiki/:slug" element={<BibleWiki session={null} userRole="student" activeOrgId={null} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('BibleWiki', () => {
  it('renders the index with foundation entries', async () => {
    renderAt('/wiki');
    expect(await screen.findByText('Bible Wiki')).toBeInTheDocument();
    expect(await screen.findByText('Aaron')).toBeInTheDocument();
    expect(await screen.findByText('Jerusalem')).toBeInTheDocument();
  });

  it('renders an entry page with scripture-derived facts', async () => {
    renderAt('/wiki/aaron_1');
    expect(await screen.findByRole('heading', { name: 'Aaron' })).toBeInTheDocument();
    expect(screen.getByText('First appearance')).toBeInTheDocument();
    expect(screen.getByText('Exodus 4:14')).toBeInTheDocument();
    // signed-out state shows the observations sign-in note instead of the form
    expect(screen.getByText(/Sign in to read and share/)).toBeInTheDocument();
  });

  it('shows a friendly message for unknown slugs', async () => {
    renderAt('/wiki/not-a-real-slug');
    expect(await screen.findByText(/No page found/)).toBeInTheDocument();
  });
});
