import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import StudyCanvas from './StudyCanvas';
import { readCanvases, requestCanvas, saveCanvas } from '../../lib/studyCanvas';

// No Supabase: saves take the device-local path. The synced path is covered in studyCanvas.test.js.
vi.mock('../../lib/supabaseClient', () => ({ supabase: null, hasSupabaseConfig: false }));
vi.mock('../../lib/studyCanvas', async (importOriginal) => ({ ...await importOriginal(), requestCanvas: vi.fn() }));
const session = { user: { id: 'admin-one' } };
const workspace = { reference: 'Mark 2:1–12', chapterId: 'MRK.2', translation: 'BSB', sources: [
  { id: 'verse-MRK.2.5', kind: 'verse', ref: 'Mark 2:5', title: 'Mark 2:5', text: 'Seeing their faith…' },
  { id: 'wiki-jesus_905', kind: 'person', slug: 'jesus_905', title: 'Jesus', text: 'Indexed in this chapter.' },
] };
const luke = { reference: 'Luke 5:17–26', chapterId: 'LUK.5', translation: 'BSB', sources: [
  { id: 'verse-LUK.5.20', kind: 'verse', ref: 'Luke 5:20', title: 'Luke 5:20', text: 'Friend, your sins are forgiven.' },
  { id: 'wiki-jesus_905', kind: 'person', slug: 'jesus_905', title: 'Jesus', text: 'Indexed in this chapter.' },
] };
const explanation = (title = 'Faith and forgiveness') => ({ title, cards: [{ id: 'insight-1', title: `${title} insight`, body: 'Jesus responds to their faith.', kind: 'observation', sourceIds: ['verse-MRK.2.5'] }], questions: ['What happens next?'] });
const mount = (role = 'admin', currentSession = session) => render(<MemoryRouter><StudyCanvas session={currentSession} userRole={role} activeOrgId="org-one" /></MemoryRouter>);
const explainCalls = () => requestCanvas.mock.calls.map((call) => call[0]).filter((body) => body.action === 'explain');
beforeEach(() => { requestCanvas.mockReset(); localStorage.clear(); });

async function openStudy() {
  requestCanvas.mockResolvedValueOnce({ workspace }).mockResolvedValueOnce({ explanation: explanation() });
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Open canvas' }));
  await screen.findByRole('heading', { name: 'Faith and forgiveness' });
}
async function askNext(title, action) {
  requestCanvas.mockResolvedValueOnce({ explanation: explanation(title) });
  action();
  await screen.findByRole('heading', { level: 2, name: title });
}

describe('Living Study Canvas', () => {
  it.each(['student', 'leader', 'parent_leader', 'student_leader'])('does not expose the canvas to %s', (role) => {
    mount(role);
    expect(screen.queryByRole('button', { name: 'Open canvas' })).not.toBeInTheDocument();
    expect(requestCanvas).not.toHaveBeenCalled();
  });
  it('requires a signed-in admin', () => {
    mount('admin', null);
    expect(screen.getByText(/signed-in admins only/)).toBeInTheDocument();
  });
  it('loads sources, links evidence and existing app destinations, and saves/restores a canvas', async () => {
    await openStudy();
    expect(screen.getByRole('link', { name: /Explore the setting/ })).toHaveAttribute('href', '/atlas?chapters=MRK.2');
    expect(screen.getByRole('link', { name: 'Jesus' })).toHaveAttribute('href', '/wiki/jesus_905');
    fireEvent.click(screen.getByRole('button', { name: 'Mark 2:5' }));
    expect(document.getElementById('canvas-verse-MRK.2.5')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Save canvas' }));
    expect(await screen.findByRole('button', { name: 'Saved' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Faith and forgiveness Mark/ }));
    expect(await screen.findByText('Opened saved canvas.')).toBeInTheDocument();
    expect(requestCanvas).toHaveBeenCalledTimes(2);
  });

  it('records every step as a path, and keeps a saved canvas up to date', async () => {
    await openStudy();
    expect(screen.queryByRole('navigation', { name: 'Study path' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Canvas name'), { target: { value: 'Truth by Contrast' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save canvas' }));
    await screen.findByRole('button', { name: /Truth by Contrast Mark/ });

    await askNext('Authority to forgive', () => fireEvent.click(screen.getByRole('button', { name: /What happens next\?/ })));
    expect(explainCalls()[1].turns.map((turn) => turn.role)).toEqual(['user', 'assistant', 'user']);
    expect(within(screen.getByRole('navigation', { name: 'Study path' })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('STEP 2 OF 2')).toBeInTheDocument();

    await waitFor(() => expect(readCanvases('admin-one', 'org-one')[0].steps).toHaveLength(2));
    expect(readCanvases('admin-one', 'org-one')[0].title).toBe('Truth by Contrast');
    expect(screen.getByRole('button', { name: /Truth by Contrast Mark/ })).toHaveTextContent('2 steps');
  });

  it('branches when asked from an earlier step, sending only that branch as context', async () => {
    await openStudy();
    await askNext('Second step', () => fireEvent.click(screen.getByRole('button', { name: /What happens next\?/ })));
    const path = () => screen.getByRole('navigation', { name: 'Study path' });
    fireEvent.click(within(path()).getAllByRole('button')[0]);
    expect(screen.getByText(/looking back at an earlier step/)).toBeInTheDocument();
    expect(screen.getByText('Asking here starts a new branch from step 1.')).toBeInTheDocument();

    await askNext('A different road', () => {
      fireEvent.change(screen.getByLabelText('Where would you like to go next?'), { target: { value: 'What about the scribes?' } });
      fireEvent.click(screen.getByRole('button', { name: 'Explore' }));
    });
    const context = explainCalls()[2].turns.map((turn) => turn.content).join('\n');
    expect(context).not.toContain('Second step');
    expect(context).toContain('What about the scribes?');
    expect(within(path()).getByText('from step 1')).toBeInTheDocument();
    expect(screen.getByText('Branches from step 1')).toBeInTheDocument();
    fireEvent.click(within(path()).getAllByRole('button')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Back to latest' }));
    expect(screen.getByRole('heading', { level: 2, name: 'A different road' })).toBeInTheDocument();
  });

  it('carries the reflection and card notes into the next question', async () => {
    await openStudy();
    fireEvent.change(screen.getByLabelText('Your reflection'), { target: { value: 'Faith is seen in what the friends do.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add a note' }));
    fireEvent.change(screen.getByLabelText('Note on Faith and forgiveness insight'), { target: { value: 'Compare James 2' } });
    await askNext('Faith that acts', () => fireEvent.click(screen.getByRole('button', { name: /What happens next\?/ })));
    expect(explainCalls()[1].turns.at(-1).content).toBe('My reflection so far: Faith is seen in what the friends do.\nOn "Faith and forgiveness insight": Compare James 2\n\nMy question: What happens next?');
  });

  it('sets passages side by side and explains them together', async () => {
    await openStudy();
    requestCanvas.mockResolvedValueOnce({ workspace: luke });
    fireEvent.change(screen.getByLabelText('Set another passage beside this one'), { target: { value: 'Luke 5:17-26' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add passage' }));
    expect(await screen.findByRole('heading', { name: 'Luke 5:17–26' })).toBeInTheDocument();
    expect(requestCanvas.mock.calls.at(-1)[0]).toEqual({ action: 'sources', reference: 'Luke 5:17-26' });
    expect(screen.getAllByRole('link', { name: 'Jesus' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Explore the setting/ })).toHaveAttribute('href', `/atlas?chapters=${encodeURIComponent('MRK.2,LUK.5')}`);
    // Mark is cited by the first step, so only Luke can be removed.
    expect(screen.queryByRole('button', { name: 'Remove Mark 2:1–12' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Luke 5:17–26' })).toBeInTheDocument();

    await askNext('Two tellings', () => fireEvent.click(screen.getByRole('button', { name: /Ask how these passages speak to each other/ })));
    expect(explainCalls()[1]).toMatchObject({ references: ['Mark 2:1–12', 'Luke 5:17–26'] });
    expect(explainCalls()[1].turns.at(-1).content).toContain('How do Mark 2:1–12 and Luke 5:17–26 speak to each other?');
  });

  it('pins insights from different steps, compares two, and asks the canvas to contrast them', async () => {
    await openStudy();
    fireEvent.click(screen.getByRole('button', { name: 'Pin Faith and forgiveness insight' }));
    await askNext('Opposition', () => fireEvent.click(screen.getByRole('button', { name: /What happens next\?/ })));
    fireEvent.click(screen.getByRole('button', { name: 'Pin Opposition insight' }));

    const board = screen.getByRole('region', { name: 'Pinned insights' });
    expect(within(board).getAllByRole('article')).toHaveLength(2);
    fireEvent.click(within(board).getByLabelText('Compare Faith and forgiveness insight'));
    fireEvent.click(within(board).getByLabelText('Compare Opposition insight'));
    expect(screen.getByRole('group', { name: 'Side-by-side comparison' })).toBeInTheDocument();

    await askNext('What the contrast shows', () => fireEvent.click(screen.getByRole('button', { name: /Ask the canvas to contrast these/ })));
    const asked = explainCalls()[2].turns.at(-1).content;
    expect(asked).toContain('A — "Faith and forgiveness insight" (step 1)');
    expect(asked).toContain('B — "Opposition insight" (step 2)');
    expect(asked.length).toBeLessThanOrEqual(3000);
    fireEvent.click(within(board).getAllByRole('button', { name: 'Unpin' })[0]);
    expect(within(screen.getByRole('region', { name: 'Pinned insights' })).getAllByRole('article')).toHaveLength(1);
  });

  it('offers export on every study, and sharing only with a synced account', async () => {
    await openStudy();
    const share = screen.getByRole('region', { name: 'Share and export' });
    expect(within(share).getByRole('button', { name: /Print handout/ })).toBeInTheDocument();
    expect(within(share).getByRole('button', { name: /Download Markdown/ })).toBeInTheDocument();
    expect(within(share).queryByRole('button', { name: /Create share link/ })).not.toBeInTheDocument();
  });

  it('aborts an earlier explanation and ignores it when a newer focus wins', async () => {
    let oldResolve;
    requestCanvas.mockResolvedValueOnce({ workspace }).mockImplementationOnce(() => new Promise((resolve) => { oldResolve = resolve; }));
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Open canvas' }));
    await waitFor(() => expect(requestCanvas).toHaveBeenCalledTimes(2));
    const oldSignal = requestCanvas.mock.calls[1][1];
    requestCanvas.mockResolvedValueOnce({ explanation: explanation('The new focus') });
    fireEvent.change(screen.getByLabelText('Where would you like to go next?'), { target: { value: 'Focus on forgiveness' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change focus' }));
    await screen.findByRole('heading', { name: 'The new focus' });
    expect(oldSignal.aborted).toBe(true);
    expect(requestCanvas.mock.calls[2][0]).toMatchObject({ action: 'explain', references: ['Mark 2:1–12'], turns: [{ role: 'user', content: 'Focus on forgiveness' }] });
    await act(async () => oldResolve({ explanation: explanation('Obsolete answer') }));
    expect(screen.queryByRole('heading', { name: 'Obsolete answer' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The new focus' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Study path' })).not.toBeInTheDocument();
  });
  it('keeps sources after a provider failure and retries the same question', async () => {
    requestCanvas.mockResolvedValueOnce({ workspace }).mockRejectedValueOnce(new Error('SiliconFlow is not configured.')).mockResolvedValueOnce({ explanation: explanation() });
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Open canvas' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Seeing their faith…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('heading', { name: 'Faith and forgiveness' });
    expect(requestCanvas.mock.calls[2][0].turns).toEqual([{ role: 'user', content: 'Help me understand this passage.' }]);
  });
  it('stops outstanding work on unmount', async () => {
    requestCanvas.mockImplementation(() => new Promise(() => {}));
    const view = mount(); fireEvent.click(screen.getByRole('button', { name: 'Open canvas' }));
    const signal = requestCanvas.mock.calls[0][1];
    view.unmount(); expect(signal.aborted).toBe(true);
  });
  it('isolates saved canvases by signed-in user and organization', async () => {
    await saveCanvas('admin-one', 'org-one', { id: 'saved-one', title: 'A saved study', passages: [workspace], steps: [{ id: 's1', parentId: null, focus: 'Explain', explanation: explanation() }], pins: [] });
    expect(readCanvases('admin-one', 'org-one')).toHaveLength(1);
    expect(readCanvases('admin-two', 'org-one')).toEqual([]);
    expect(readCanvases('admin-one', 'org-two')).toEqual([]);
    expect(readCanvases(null, 'org-one')).toEqual([]);
  });
  it('ignores damaged local saves rather than crashing the page', () => {
    localStorage.setItem('miqra_canvas_v1:admin-one:org-one', JSON.stringify([{ id: 'broken', title: 'Broken', workspace: { ...workspace, sources: [{ id: 'x', kind: 'verse', title: 'Missing ref', text: 'text' }] }, explanation: explanation(), turns: [] }]));
    expect(readCanvases('admin-one', 'org-one')).toEqual([]);
    localStorage.setItem('miqra_canvas_v1:admin-one:org-one', '{bad json');
    expect(readCanvases('admin-one', 'org-one')).toEqual([]);
  });
});
