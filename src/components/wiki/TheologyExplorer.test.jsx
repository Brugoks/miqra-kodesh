import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TheologyExplorer from './TheologyExplorer';
import { loadQuestionnaire } from '../../lib/theoQuiz';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/church-history/explore" element={<TheologyExplorer />} />
        <Route path="/church-history/explore/:systemId" element={<TheologyExplorer />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TheologyExplorer', () => {
  beforeEach(() => localStorage.clear());

  it('lists available questionnaires on the index', async () => {
    renderAt('/church-history/explore');
    expect(await screen.findByText('Where Do You Stand?')).toBeInTheDocument();
    expect(screen.getByText('Grace, Faith & Salvation')).toBeInTheDocument();
    expect(screen.getByText(/12 questions/)).toBeInTheDocument();
  });

  it('shows a friendly message for unknown questionnaire ids', async () => {
    renderAt('/church-history/explore/nope');
    expect(await screen.findByText(/No questionnaire found/)).toBeInTheDocument();
  });

  it('walks intro → questions → results, saving the result', async () => {
    const system = await loadQuestionnaire('soteriology');
    renderAt('/church-history/explore/soteriology');

    // Intro: purpose framing, common ground, and begin button.
    expect(await screen.findByRole('heading', { name: 'Grace, Faith & Salvation' })).toBeInTheDocument();
    expect(screen.getByText('Why this exists')).toBeInTheDocument();
    expect(screen.getByText(/not tribes/)).toBeInTheDocument();
    expect(screen.getByText('Held in common')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Begin/ }));

    // Answer every question with its first option (Reformed-leaning content).
    for (let i = 0; i < system.questions.length; i += 1) {
      expect(await screen.findByText(`${i + 1} / ${system.questions.length}`)).toBeInTheDocument();
      const [first] = screen.getAllByRole('button').filter((b) => b.className.includes('tq-option'));
      fireEvent.click(first);
    }

    // Results: a nearest voice, axis meters, figures, reflection, disclaimer.
    expect(await screen.findByText('Your nearest voice')).toBeInTheDocument();
    expect(screen.getByText(/% aligned/)).toBeInTheDocument();
    expect(screen.getByText('Where you landed')).toBeInTheDocument();
    expect(screen.getByText('For your reflection')).toBeInTheDocument();
    expect(screen.getByText('For a conversation with someone who differs')).toBeInTheDocument();
    expect(screen.getByText(/test every teacher and every result against the Word/)).toBeInTheDocument();
    expect(screen.getByText(/unity of the Spirit/)).toBeInTheDocument();

    // The result persisted for next visit.
    const saved = JSON.parse(localStorage.getItem('miqra_theo_results_v1'));
    expect(saved).toHaveLength(1);
    expect(saved[0].systemId).toBe('soteriology');
    expect(saved[0].ranked[0].closeness).toBeGreaterThan(0);
  });

  it('lets unsure answers flow through to an all-open result', async () => {
    const system = await loadQuestionnaire('soteriology');
    renderAt('/church-history/explore/soteriology');
    fireEvent.click(await screen.findByRole('button', { name: /Begin/ }));

    for (let i = 0; i < system.questions.length; i += 1) {
      fireEvent.click(await screen.findByRole('button', { name: /I'm not sure yet/ }));
    }
    expect(await screen.findByText('Every question still open')).toBeInTheDocument();
  });

  it('reveals teaching context and scripture chips behind the why toggle', async () => {
    renderAt('/church-history/explore/soteriology');
    fireEvent.click(await screen.findByRole('button', { name: /Begin/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Why this question matters/ }));
    expect(await screen.findByText(/Synod of Dort/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ephesians 1:4-5' })).toBeInTheDocument();
  });
});
