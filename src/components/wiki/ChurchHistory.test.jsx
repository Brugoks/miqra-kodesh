import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ChurchHistory from './ChurchHistory';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/church-history" element={<ChurchHistory session={null} userRole="student" activeOrgId={null} />} />
        <Route path="/church-history/:slug" element={<ChurchHistory session={null} userRole="student" activeOrgId={null} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ChurchHistory', () => {
  it('renders the era-grouped index', async () => {
    renderAt('/church-history');
    expect(await screen.findByText('Church History')).toBeInTheDocument();
    expect(await screen.findByText('Augustine of Hippo')).toBeInTheDocument();
    expect(screen.getByText('Council of Jerusalem')).toBeInTheDocument();
    expect(screen.getByText('First Council of Nicaea')).toBeInTheDocument();
    expect(screen.getByText('Reformation')).toBeInTheDocument();
    expect(screen.getByText('Martin Luther')).toBeInTheDocument();
  });

  it('renders a teacher page with contribution and the tradition disclaimer', async () => {
    renderAt('/church-history/augustine-of-hippo');
    expect(await screen.findByRole('heading', { name: 'Augustine of Hippo' })).toBeInTheDocument();
    expect(screen.getByText(/Contribution to Christian understanding/)).toBeInTheDocument();
    expect(screen.getByText(/not Scripture/)).toBeInTheDocument();
    // key scriptures render as tappable chips
    expect(screen.getByRole('button', { name: 'Romans 13:13-14' })).toBeInTheDocument();
  });

  it('renders a council page with the Reformed Perspective', async () => {
    renderAt('/church-history/first-council-of-nicaea');
    expect(await screen.findByRole('heading', { name: 'First Council of Nicaea' })).toBeInTheDocument();
    expect(screen.getByText(/Reformed Perspective/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'John 1:1-4' })).toBeInTheDocument();
  });

  it('shows a friendly message for unknown slugs', async () => {
    renderAt('/church-history/nobody');
    expect(await screen.findByText(/No page found/)).toBeInTheDocument();
  });
});
