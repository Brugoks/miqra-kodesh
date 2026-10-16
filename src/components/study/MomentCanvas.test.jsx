import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import StudyCanvas from './StudyCanvas';
import { readCanvases, saveCanvas, requestCanvas } from '../../lib/studyCanvas';
import { createMoment } from '../../lib/canvasJourney';

vi.mock('../../lib/supabaseClient', () => ({ supabase: null, hasSupabaseConfig: false }));
vi.mock('../../lib/studyCanvas', async (original) => ({ ...await original(), saveCanvas: vi.fn((...args) => original().then((m) => m.saveCanvas(...args))), requestCanvas: vi.fn() }));
const mount = (role = 'student', user = 'member-one') => render(<MemoryRouter><StudyCanvas session={{ user: { id: user } }} userRole={role} activeOrgId="org" /></MemoryRouter>);
const text = 'A friend brought dinner when I felt overwhelmed.';
const capture = async () => {
  fireEvent.change(screen.getByLabelText('What happened, and what did you glimpse?'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Keep this glimpse' }));
  await screen.findByRole('heading', { name: 'Let this moment grow' });
};
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe('guided personal canvas', () => {
  it('lets members capture, add a response and Scripture, and return after reloading without AI', async () => {
    const view = mount();
    await capture();
    expect(requestCanvas).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Scripture study/ })).not.toBeInTheDocument();
    expect(screen.getByText('Saved on this device.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Small response'));
    fireEvent.change(screen.getByLabelText('How could you put this into practice?'), { target: { value: 'Ask for help this week.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add small response' }));
    await screen.findByRole('heading', { name: 'What is becoming clearer?' });
    expect(within(screen.getByRole('region', { name: 'How this moment is growing' })).getByText('Ask for help this week.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Scripture'));
    fireEvent.change(screen.getByLabelText('Passage to explore'), { target: { value: 'Ephesians 2:8-10' } });
    fireEvent.change(screen.getByLabelText('How does this passage connect to your experience?'), { target: { value: 'I want to explore grace as a gift.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add scripture' }));
    await screen.findByRole('button', { name: 'Read Ephesians 2:8-10' });
    const listener = vi.fn(); window.addEventListener('scripture:open', listener);
    fireEvent.click(screen.getByRole('button', { name: 'Read Ephesians 2:8-10' }));
    expect(listener.mock.calls[0][0].detail).toEqual({ ref: 'Ephesians 2:8-10' });
    window.removeEventListener('scripture:open', listener);
    const saved = readCanvases('member-one', 'org')[0];
    expect(saved.journey.moment).toBe(text); expect(saved.journey.entries).toHaveLength(2);
    view.unmount(); mount();
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(text) }));
    expect(await screen.findByRole('heading', { name: 'What is becoming clearer?' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Original glimpse' })).getByText(text, { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read Ephesians 2:8-10' })).toBeInTheDocument();
  });

  it('preserves capture and reflection drafts across navigation, scoped to the user', async () => {
    let view = mount();
    fireEvent.change(screen.getByLabelText('What happened, and what did you glimpse?'), { target: { value: 'An unfinished thought' } });
    view.unmount(); view = mount('student', 'someone-else');
    expect(screen.getByLabelText('What happened, and what did you glimpse?')).toHaveValue('');
    view.unmount(); view = mount();
    expect(screen.getByLabelText('What happened, and what did you glimpse?')).toHaveValue('An unfinished thought');
    await capture();
    fireEvent.change(screen.getByLabelText('What happened since? Has your understanding changed?'), { target: { value: 'Still making sense of it' } });
    view.unmount(); mount();
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(text) }));
    expect(await screen.findByLabelText('What happened since? Has your understanding changed?')).toHaveValue('Still making sense of it');
  });

  it('retains words after save failure and retries with the same identity', async () => {
    saveCanvas.mockRejectedValueOnce(new Error('Offline'));
    mount();
    fireEvent.change(screen.getByLabelText('What happened, and what did you glimpse?'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Keep this glimpse' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your words are still here');
    expect(screen.getByLabelText('What happened, and what did you glimpse?')).toHaveValue(text);
    fireEvent.click(screen.getByRole('button', { name: 'Keep this glimpse' }));
    await screen.findByRole('heading', { name: 'Let this moment grow' });
    expect(saveCanvas.mock.calls[0][2].id).toBe(saveCanvas.mock.calls[1][2].id);
    expect(readCanvases('member-one', 'org')).toHaveLength(1);
  });

  it('surfaces due revisits and clears the cue after a reflection, preserving the original', async () => {
    const canvas = createMoment('Learning to wait.', '', new Date('2020-01-01T12:00:00Z'));
    canvas.journey.revisitOn = '2020-01-02';
    await saveCanvas('member-one', 'org', canvas);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Learning to wait/ }));
    await screen.findByText('A moment to return to');
    fireEvent.change(screen.getByLabelText('What happened since? Has your understanding changed?'), { target: { value: 'I still have questions.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add reflection' }));
    await waitFor(() => expect(readCanvases('member-one', 'org')[0].journey.revisitOn).toBeNull());
    expect(readCanvases('member-one', 'org')[0].journey.moment).toBe('Learning to wait.');
    expect(screen.getByRole('button', { name: 'To revisit' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Name this thread or choose a revisit date'));
    expect(screen.getByLabelText('Revisit date (optional)')).toHaveValue('');
  });

  it('requires confirmation to delete a thread and removes its draft', async () => {
    mount(); await capture();
    fireEvent.change(screen.getByLabelText('What happened since? Has your understanding changed?'), { target: { value: 'Draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete thread' }));
    expect(readCanvases('member-one', 'org')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete entire thread' }));
    await screen.findByRole('heading', { name: 'Capture a glimpse' });
    expect(readCanvases('member-one', 'org')).toHaveLength(0);
    expect(Object.keys(localStorage).some((k) => k.startsWith('miqra_moment_entry'))).toBe(false);
  });

  it('prevents duplicate captures while a save is pending', async () => {
    let resolve;
    saveCanvas.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    mount();
    fireEvent.change(screen.getByLabelText('What happened, and what did you glimpse?'), { target: { value: text } });
    const button = screen.getByRole('button', { name: 'Keep this glimpse' });
    fireEvent.click(button); fireEvent.click(button);
    expect(saveCanvas).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => resolve([]));
  });
});
