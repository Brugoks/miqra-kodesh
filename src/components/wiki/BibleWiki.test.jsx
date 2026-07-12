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

describe('BibleWiki new entry types', () => {
  it('renders a book page from BOOK_INTROS with chapters and cast', async () => {
    renderAt('/wiki/book-gen');
    expect(await screen.findByRole('heading', { name: 'Genesis' })).toBeInTheDocument();
    expect(screen.getByText('50 chapters')).toBeInTheDocument();
    expect(await screen.findByText('The cast')).toBeInTheDocument();
  });

  it('renders an event page with participants and passages', async () => {
    renderAt('/wiki/the-flood-subsides');
    expect(await screen.findByRole('heading', { name: 'The flood subsides' })).toBeInTheDocument();
    expect(await screen.findByText('Who was there')).toBeInTheDocument();
    expect(screen.getByText('Noah')).toBeInTheDocument();
  });

  it('shows the story arc and name meaning for curated figures', async () => {
    renderAt('/wiki/moses_2108');
    expect(await screen.findByRole('heading', { name: 'Moses' })).toBeInTheDocument();
    expect(await screen.findByText('The story arc')).toBeInTheDocument();
    expect(screen.getByText('The burning bush')).toBeInTheDocument();
    expect(screen.getByText(/drawn out/)).toBeInTheDocument();
  });
});
