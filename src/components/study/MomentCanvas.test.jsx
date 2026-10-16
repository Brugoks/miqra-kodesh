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

const suggestion = (reference = 'Galatians 6:2') => ({ reference, scripture: {
  translation: 'BSB', verses: [{ reference, text: 'Carry one another’s burdens, and in this way you will fulfill the law of Christ.' }],
  contextReference: 'Galatians 6:1–4', contextVerses: [{ reference: 'Galatians 6:1', text: 'Brothers, if someone is caught in a trespass…' }],
  context: 'Paul addresses a community learning to restore one another gently.',
  connection: 'Receiving your friend’s help may be one way to share a burden.', glimpse: text,
} });

describe('editing and related Scripture', () => {
  it('edits the original glimpse, retains failed edits, and preserves the original creation date', async () => {
    const view = mount(); await capture();
    const original = readCanvases('member-one', 'org')[0];
    fireEvent.click(screen.getByRole('button', { name: 'Edit original glimpse' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Original glimpse' }), { target: { value: 'I learned to accept help with gratitude.' } });
    saveCanvas.mockRejectedValueOnce(new Error('Offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('textbox', { name: 'Original glimpse' })).toHaveValue('I learned to accept help with gratitude.');
    expect(readCanvases('member-one', 'org')[0].journey.moment).toBe(text);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Edit original glimpse' })).not.toBeInTheDocument());
    const saved = readCanvases('member-one', 'org')[0];
    expect(saved.journey).toMatchObject({ moment: 'I learned to accept help with gratitude.', createdAt: original.journey.createdAt, editedAt: expect.any(String) });
    view.unmount(); mount();
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(text) }));
    expect(await screen.findByText('I learned to accept help with gratitude.')).toBeInTheDocument();
    expect(requestCanvas).not.toHaveBeenCalled();
  });

  it.each(['reflection', 'scripture', 'prayer', 'question', 'response'])('edits a %s entry without replacing its ID, position, or creation date', async (kind) => {
    const canvas = createMoment(text);
    const entry = { id: 'entry-one', kind, text: 'Earlier understanding', createdAt: '2026-01-01T12:00:00Z', ...(kind === 'scripture' ? { reference: 'John 1:1' } : {}) };
    canvas.journey.entries = [entry, { id: 'entry-two', kind: 'prayer', text: 'Keep this unchanged', createdAt: entry.createdAt }];
    await saveCanvas('member-one', 'org', canvas);
    mount(); fireEvent.click(await screen.findByRole('button', { name: new RegExp(text) }));
    const history = await screen.findByRole('region', { name: 'How this moment is growing' });
    const article = within(history).getByText('Earlier understanding').closest('article');
    fireEvent.click(within(article).getByRole('button', { name: /^Edit / }));
    fireEvent.change(screen.getByLabelText('Entry text'), { target: { value: 'A deeper understanding' } });
    if (kind === 'scripture') fireEvent.change(screen.getByLabelText('Passage reference'), { target: { value: 'John 1:2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(readCanvases('member-one', 'org')[0].journey.entries[0].text).toBe('A deeper understanding'));
    expect(readCanvases('member-one', 'org')[0].journey.entries).toEqual([
      { ...entry, text: 'A deeper understanding', editedAt: expect.any(String), ...(kind === 'scripture' ? { reference: 'John 1:2' } : {}) }, canvas.journey.entries[1],
    ]);
  });

  it('recovers edit drafts after navigation and discards them only on explicit cancel', async () => {
    const view = mount(); await capture();
    fireEvent.click(screen.getByRole('button', { name: 'Edit original glimpse' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Original glimpse' }), { target: { value: 'Unfinished edit' } });
    view.unmount(); mount();
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(text) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit original glimpse' }));
    expect(screen.getByRole('textbox', { name: 'Original glimpse' })).toHaveValue('Unfinished edit');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit original glimpse' }));
    expect(screen.getByRole('textbox', { name: 'Original glimpse' })).toHaveValue(text);
    expect(readCanvases('member-one', 'org')[0].journey.moment).toBe(text);
  });

  it('previews suggestions, saves only the selected passage, edits its connection, and reloads its evidence', async () => {
    const view = mount(); await capture();
    requestCanvas.mockResolvedValueOnce({ suggestions: [suggestion(), suggestion('Romans 12:15')] });
    fireEvent.change(screen.getByLabelText('What are you exploring now? (optional)'), { target: { value: 'Receiving kindness' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pull related Scripture' }));
    const add = await screen.findByRole('button', { name: 'Add Galatians 6:2 to canvas' });
    expect(requestCanvas).toHaveBeenCalledWith({ action: 'related', glimpse: text, focus: 'Receiving kindness', exclude: [] }, expect.any(AbortSignal));
    expect(readCanvases('member-one', 'org')[0].journey.entries).toHaveLength(0);
    saveCanvas.mockRejectedValueOnce(new Error('Offline'));
    fireEvent.click(add);
    await screen.findByText(/This passage was not added/);
    expect(add).toBeEnabled();
    fireEvent.click(add);
    await screen.findByRole('button', { name: 'Galatians 6:2 added to canvas' });
    expect(readCanvases('member-one', 'org')[0].journey.entries).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Galatians 6:2 added to canvas' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit scripture' }));
    fireEvent.change(screen.getByLabelText('Connection to my glimpse'), { target: { value: 'I can receive care and offer it in turn.' } });
    fireEvent.change(screen.getByLabelText('My reflection (optional)'), { target: { value: 'I am learning to ask for help.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(readCanvases('member-one', 'org')[0].journey.entries[0].text).toBe('I am learning to ask for help.'));
    requestCanvas.mockResolvedValueOnce({ suggestions: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Pull related Scripture' }));
    await screen.findByText('No new passages were returned. Try a different focus.');
    expect(requestCanvas.mock.lastCall[0].exclude).toEqual(['Galatians 6:2']);
    view.unmount(); mount();
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(text) }));
    const history = await screen.findByRole('region', { name: 'How this moment is growing' });
    expect(within(history).getByText(suggestion().scripture.verses[0].text, { exact: false })).toBeInTheDocument();
    expect(within(history).getByText('I can receive care and offer it in turn.')).toBeInTheDocument();
    expect(within(history).getByText('I am learning to ask for help.')).toBeInTheDocument();
    expect(readCanvases('member-one', 'org')[0].journey.entries[0].scripture.contextVerses).toEqual(suggestion().scripture.contextVerses);
  });

  it('ignores a late cancelled search and retries without saving any suggestions', async () => {
    let resolve;
    requestCanvas.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    mount(); await capture();
    fireEvent.click(screen.getByRole('button', { name: 'Pull related Scripture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop search' }));
    expect(requestCanvas.mock.lastCall[1].aborted).toBe(true);
    await act(async () => resolve({ suggestions: [suggestion()] }));
    expect(screen.queryByRole('button', { name: 'Add Galatians 6:2 to canvas' })).not.toBeInTheDocument();
    requestCanvas.mockRejectedValueOnce(new Error('Scripture could not be loaded. Please try again.'));
    fireEvent.click(screen.getByRole('button', { name: 'Pull related Scripture' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Scripture could not be loaded');
    requestCanvas.mockResolvedValueOnce({ suggestions: [suggestion()] });
    fireEvent.click(screen.getByRole('button', { name: 'Pull related Scripture' }));
    await screen.findByRole('button', { name: 'Add Galatians 6:2 to canvas' });
    expect(readCanvases('member-one', 'org')[0].journey.entries).toHaveLength(0);
  });
});
