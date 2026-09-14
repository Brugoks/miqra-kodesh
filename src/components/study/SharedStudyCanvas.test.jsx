import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SharedStudyCanvas from './SharedStudyCanvas';
import { loadSharedCanvas } from '../../lib/studyCanvas';

vi.mock('../../lib/studyCanvas', () => ({ loadSharedCanvas: vi.fn() }));

const passage = { reference: '1 Corinthians 11:17–34', chapterId: '1CO.11', translation: 'BSB', sources: [
  { id: 'verse-1CO.11.19', kind: 'verse', ref: '1 Corinthians 11:19', title: '1 Corinthians 11:19', text: 'No doubt there must be factions among you…' },
] };
const card = (title) => ({ id: 'insight-1', title, body: `${title} body`, kind: 'interpretation', sourceIds: ['verse-1CO.11.19'] });
const canvas = {
  id: 'c1', title: 'Truth by Contrast', passages: [passage], ownerName: 'Mark', includesNotes: true, savedAt: '2026-09-14T00:00:00Z', share: { token: null, includeNotes: false },
  steps: [
    { id: 'a', parentId: null, focus: 'Why must there be factions?', explanation: { title: 'Factions reveal', cards: [card('Approved')], questions: ['q'] }, note: 'Division exposes hearts.', cardNotes: {} },
    { id: 'b', parentId: 'a', focus: 'Who is approved?', explanation: { title: 'Approval', cards: [card('Tested')], questions: ['q'] }, note: '', cardNotes: { 'insight-1': 'See 1 John 2:19' } },
  ],
  pins: [{ id: 'a:insight-1', stepId: 'a', cardId: 'insight-1' }],
};
const mount = (session = { user: { id: 'member' } }) => render(<MemoryRouter initialEntries={['/study-canvas/shared/tok-1']}><Routes><Route path="/study-canvas/shared/:token" element={<SharedStudyCanvas session={session} />} /></Routes></MemoryRouter>);
beforeEach(() => loadSharedCanvas.mockReset());

describe('Shared study canvas', () => {
  it('shows the whole study read-only, with the notes the owner shared', async () => {
    loadSharedCanvas.mockResolvedValue(canvas);
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: 'Truth by Contrast' })).toBeInTheDocument();
    expect(loadSharedCanvas).toHaveBeenCalledWith('tok-1');
    expect(screen.getByText(/Shared by Mark/)).toBeInTheDocument();
    expect(screen.getByText('See 1 John 2:19')).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Study path' })).getAllByRole('button')[0]);
    expect(screen.getByText('Division exposes hearts.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Pinned insights' })).toBeInTheDocument();

    // Nothing that edits, asks, or saves.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Pin |Unpin|Add passage|Explore|contrast these/ })).not.toBeInTheDocument();
  });

  it('explains a link that is no longer shared', async () => {
    loadSharedCanvas.mockResolvedValue(null);
    mount();
    expect(await screen.findByRole('heading', { name: 'This study is not shared' })).toBeInTheDocument();
  });

  it('asks a signed-out visitor to sign in without requesting anything', () => {
    mount(null);
    expect(screen.getByText('Sign in to read this shared study.')).toBeInTheDocument();
    expect(loadSharedCanvas).not.toHaveBeenCalled();
  });
});
