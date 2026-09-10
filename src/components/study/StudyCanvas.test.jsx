import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import StudyCanvas from './StudyCanvas';
import { readCanvases, requestCanvas, saveCanvas } from '../../lib/studyCanvas';

vi.mock('../../lib/studyCanvas', async (importOriginal) => ({ ...await importOriginal(), requestCanvas: vi.fn() }));
const session = { user: { id: 'admin-one' } };
const workspace = { reference: 'Mark 2:1–12', chapterId: 'MRK.2', translation: 'BSB', sources: [
  { id: 'verse-MRK.2.5', kind: 'verse', ref: 'Mark 2:5', title: 'Mark 2:5', text: 'Seeing their faith…' },
  { id: 'wiki-jesus_905', kind: 'person', slug: 'jesus_905', title: 'Jesus', text: 'Indexed in this chapter.' },
] };
const explanation = (title = 'Faith and forgiveness') => ({ title, cards: [{ id: 'insight-1', title: 'An observation', body: 'Jesus responds to their faith.', kind: 'observation', sourceIds: ['verse-MRK.2.5'] }], questions: ['What happens next?'] });
const mount = (role = 'admin', currentSession = session) => render(<MemoryRouter><StudyCanvas session={currentSession} userRole={role} activeOrgId="org-one" /></MemoryRouter>);
beforeEach(() => { requestCanvas.mockReset(); });

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
    requestCanvas.mockResolvedValueOnce({ workspace }).mockResolvedValueOnce({ explanation: explanation() });
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Open canvas' }));
    await screen.findByRole('heading', { name: 'Faith and forgiveness' });
    expect(screen.getByRole('link', { name: /Explore the setting/ })).toHaveAttribute('href', '/atlas?chapters=MRK.2');
    expect(screen.getByRole('link', { name: 'Jesus' })).toHaveAttribute('href', '/wiki/jesus_905');
    fireEvent.click(screen.getByRole('button', { name: 'Mark 2:5' }));
    expect(document.getElementById('canvas-verse-MRK.2.5')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Save canvas' }));
    expect(screen.getByText('Saved on this device.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Faith and forgiveness Mark/ }));
    expect(screen.getByText('Opened saved canvas.')).toBeInTheDocument();
    expect(requestCanvas).toHaveBeenCalledTimes(2);
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
    expect(requestCanvas.mock.calls[2][0]).toMatchObject({ action: 'explain', turns: [{ role: 'user', content: 'Help me understand this passage.' }, { role: 'user', content: 'Focus on forgiveness' }] });
    await act(async () => oldResolve({ explanation: explanation('Obsolete answer') }));
    expect(screen.queryByRole('heading', { name: 'Obsolete answer' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The new focus' })).toBeInTheDocument();
  });
  it('keeps sources after a provider failure and retries without duplicating the question', async () => {
    requestCanvas.mockResolvedValueOnce({ workspace }).mockRejectedValueOnce(new Error('SiliconFlow is not configured.')).mockResolvedValueOnce({ explanation: explanation() });
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Open canvas' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Seeing their faith…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('heading', { name: 'Faith and forgiveness' });
    expect(requestCanvas.mock.calls[2][0].turns).toHaveLength(1);
  });
  it('stops outstanding work on unmount', async () => {
    requestCanvas.mockImplementation(() => new Promise(() => {}));
    const view = mount(); fireEvent.click(screen.getByRole('button', { name: 'Open canvas' }));
    const signal = requestCanvas.mock.calls[0][1];
    view.unmount(); expect(signal.aborted).toBe(true);
  });
  it('isolates saved canvases by signed-in user and organization', () => {
    saveCanvas('admin-one', 'org-one', { id: 'saved-one', title: 'A saved study', workspace, explanation: explanation(), turns: [] });
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
