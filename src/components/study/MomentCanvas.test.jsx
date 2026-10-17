import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import StudyCanvas from './StudyCanvas';
import { CanvasSaveError, readCanvases, requestCanvas, saveMoment } from '../../lib/studyCanvas';
import { applyCommand } from '../../lib/canvasBoardCommands';
import { projectBoard } from '../../lib/canvasBoard';
import { recoveryJournal } from './board/useCanvasAutosave';
import { createMoment } from '../../lib/canvasJourney';

vi.mock('../../lib/supabaseClient', () => ({ supabase: null, hasSupabaseConfig: false }));
vi.mock('../../lib/studyCanvas', async (original) => ({ ...await original(), saveMoment: vi.fn((...args) => original().then((m) => m.saveMoment(...args))), requestCanvas: vi.fn() }));

const mount = (role = 'student', user = 'member-one') => render(<MemoryRouter><StudyCanvas session={{ user: { id: user } }} userRole={role} activeOrgId="org" /></MemoryRouter>);
const text = 'A friend brought dinner when I felt overwhelmed.';
const PROMPT = "What's on your mind?";
const capture = async () => {
  fireEvent.change(screen.getByLabelText(PROMPT), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Add to canvas' }));
  await screen.findByRole('heading', { name: 'Let this moment grow' });
};
const stored = () => readCanvases('member-one', 'org');
const saved = (check) => waitFor(check, { timeout: 4000 });
// These flows are about the words and the list, so they run in Outline; the board has its own tests.
beforeEach(() => { localStorage.clear(); localStorage.setItem('miqra_canvas_v1_unused', ''); localStorage.setItem('miqra_canvas_view_v1:member-one', 'outline'); vi.clearAllMocks(); });

describe('capturing and returning to a canvas', () => {
  it('lets members capture, add a response and Scripture, and return after reloading without AI', async () => {
    const view = mount();
    await capture();
    expect(requestCanvas).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Scripture study/ })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Canvas title' })).toHaveValue(text);
    expect(screen.getAllByRole('status').some((el) => el.textContent.includes('Saved on this device'))).toBe(true);
    // The first save writes the arrangement, so a new canvas opens as a canvas next time.
    expect(stored()[0].board.nodes).toHaveLength(1);

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
    await saved(() => expect(stored()[0].journey.entries).toHaveLength(2));
    expect(stored()[0].journey.moment).toBe(text);
    // New thoughts on an arranged canvas get a place of their own.
    expect(stored()[0].board.nodes).toHaveLength(3);

    view.unmount(); mount();
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(text) }));
    expect(await screen.findByRole('heading', { name: 'What is becoming clearer?' })).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Original glimpse' })).getByText(text, { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read Ephesians 2:8-10' })).toBeInTheDocument();
  });

  it('preserves capture and thought drafts across navigation, scoped to the user', async () => {
    let view = mount();
    fireEvent.change(screen.getByLabelText(PROMPT), { target: { value: 'An unfinished thought' } });
    view.unmount(); view = mount('student', 'someone-else');
    expect(screen.getByLabelText(PROMPT)).toHaveValue('');
    view.unmount(); view = mount();
    expect(screen.getByLabelText(PROMPT)).toHaveValue('An unfinished thought');
    await capture();
    fireEvent.change(screen.getByLabelText('What happened since? Has your understanding changed?'), { target: { value: 'Still making sense of it' } });
    view.unmount(); mount();
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(text) }));
    expect(await screen.findByLabelText('What happened since? Has your understanding changed?')).toHaveValue('Still making sense of it');
  });

  it('retains words after a failed first save and retries with the same identity', async () => {
    saveMoment.mockRejectedValueOnce(new Error('Offline'));
    mount();
    fireEvent.change(screen.getByLabelText(PROMPT), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to canvas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your words are still here');
    expect(screen.getByLabelText(PROMPT)).toHaveValue(text);
    fireEvent.click(screen.getByRole('button', { name: 'Add to canvas' }));
    await screen.findByRole('heading', { name: 'Let this moment grow' });
    expect(saveMoment.mock.calls[0][2].id).toBe(saveMoment.mock.calls[1][2].id);
    expect(stored()).toHaveLength(1);
  });

  it('prevents duplicate captures while the first save is pending', async () => {
    let resolve;
    saveMoment.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    mount();
    fireEvent.change(screen.getByLabelText(PROMPT), { target: { value: text } });
    const button = screen.getByRole('button', { name: 'Add to canvas' });
    fireEvent.click(button); fireEvent.click(button);
    expect(saveMoment).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => resolve({ savedAt: '2026-10-17T10:00:00.000Z' }));
  });

  it('surfaces due revisits and clears the cue after a thought, preserving the original', async () => {
    const canvas = createMoment('Learning to wait.', '', new Date('2020-01-01T12:00:00Z'));
    canvas.journey.revisitOn = '2020-01-02';
    await saveMoment('member-one', 'org', canvas, null);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Learning to wait/ }));
    await screen.findByText('A moment to return to');
    fireEvent.change(screen.getByLabelText('What happened since? Has your understanding changed?'), { target: { value: 'I still have questions.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add reflection' }));
    await saved(() => expect(stored()[0].journey.revisitOn).toBeNull());
    expect(stored()[0].journey.moment).toBe('Learning to wait.');
    fireEvent.click(screen.getByRole('button', { name: 'Canvas settings' }));
    expect(screen.getByLabelText('Revisit date (optional)')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Close canvas settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'All canvases' }));
    expect(await screen.findByRole('button', { name: 'To revisit' })).toBeInTheDocument();
  });

  it('requires confirmation to delete a canvas and removes its drafts', async () => {
    mount(); await capture();
    fireEvent.change(screen.getByLabelText('What happened since? Has your understanding changed?'), { target: { value: 'Draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Canvas settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete canvas' }));
    expect(stored()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete entire canvas' }));
    await screen.findByRole('heading', { name: 'Capture a glimpse' });
    expect(stored()).toHaveLength(0);
    expect(Object.keys(localStorage).some((k) => k.startsWith('miqra_moment_entry'))).toBe(false);
  });

  it('opens the library from inside a canvas to switch to another', async () => {
    const other = createMoment('Learning to rest.');
    await saveMoment('member-one', 'org', other, null);
    mount(); await capture();
    fireEvent.click(screen.getByRole('button', { name: 'Your canvases' }));
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Your canvases' })).getByRole('button', { name: /Learning to rest/ }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Canvas title' })).toHaveValue('Learning to rest.'));
    expect(screen.queryByRole('complementary', { name: 'Your canvases' })).not.toBeInTheDocument();
  });
});

const suggestion = (reference = 'Galatians 6:2') => ({ reference, scripture: {
  translation: 'BSB', verses: [{ reference, text: 'Carry one another’s burdens, and in this way you will fulfill the law of Christ.' }],
  contextReference: 'Galatians 6:1–4', contextVerses: [{ reference: 'Galatians 6:1', text: 'Brothers, if someone is caught in a trespass…' }],
  context: 'Paul addresses a community learning to restore one another gently.',
  connection: 'Receiving your friend’s help may be one way to share a burden.', glimpse: text,
} });

describe('editing and related Scripture', () => {
  it('edits the original glimpse, keeps a failed edit local until it saves, and preserves the original creation date', async () => {
    const view = mount(); await capture();
    const original = stored()[0];
    fireEvent.click(screen.getByRole('button', { name: 'Edit original glimpse' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Original glimpse' }), { target: { value: 'I learned to accept help with gratitude.' } });
    saveMoment.mockRejectedValueOnce(new Error('Offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    // The edit is committed at once; only the saving is retried in the background.
    await screen.findByText('I learned to accept help with gratitude.');
    await waitFor(() => expect(screen.getAllByRole('status').some((el) => el.textContent.includes('will retry'))).toBe(true), { timeout: 4000 });
    await saved(() => expect(stored()[0].journey.moment).toBe('I learned to accept help with gratitude.'));
    expect(stored()[0].journey).toMatchObject({ createdAt: original.journey.createdAt, editedAt: expect.any(String) });
    view.unmount(); mount();
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(text) }));
    expect(await screen.findByText('I learned to accept help with gratitude.')).toBeInTheDocument();
    expect(requestCanvas).not.toHaveBeenCalled();
  }, 15000);

  it.each(['reflection', 'scripture', 'prayer', 'question', 'response'])('edits a %s entry without replacing its ID, position, or creation date', async (kind) => {
    const canvas = createMoment(text);
    const entry = { id: 'entry-one', kind, text: 'Earlier understanding', createdAt: '2026-01-01T12:00:00Z', ...(kind === 'scripture' ? { reference: 'John 1:1' } : {}) };
    canvas.journey.entries = [entry, { id: 'entry-two', kind: 'prayer', text: 'Keep this unchanged', createdAt: entry.createdAt }];
    await saveMoment('member-one', 'org', canvas, null);
    mount(); fireEvent.click(await screen.findByRole('button', { name: new RegExp(text) }));
    const history = await screen.findByRole('region', { name: 'How this moment is growing' });
    const article = within(history).getByText('Earlier understanding').closest('article');
    fireEvent.click(within(article).getByRole('button', { name: /^Edit / }));
    fireEvent.change(screen.getByLabelText('Entry text'), { target: { value: 'A deeper understanding' } });
    if (kind === 'scripture') fireEvent.change(screen.getByLabelText('Passage reference'), { target: { value: 'John 1:2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await saved(() => expect(stored()[0].journey.entries[0].text).toBe('A deeper understanding'));
    expect(stored()[0].journey.entries).toEqual([
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
    expect(stored()[0].journey.moment).toBe(text);
  });

  it('previews suggestions, saves only the selected passage, edits its connection, and reloads its evidence', async () => {
    const view = mount(); await capture();
    requestCanvas.mockResolvedValueOnce({ suggestions: [suggestion(), suggestion('Romans 12:15')] });
    fireEvent.change(screen.getByLabelText('What are you exploring now? (optional)'), { target: { value: 'Receiving kindness' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pull related Scripture' }));
    const add = await screen.findByRole('button', { name: 'Add Galatians 6:2 to canvas' });
    expect(requestCanvas).toHaveBeenCalledWith({ action: 'related', glimpse: text, focus: 'Receiving kindness', exclude: [] }, expect.any(AbortSignal));
    expect(stored()[0].journey.entries).toHaveLength(0);
    fireEvent.click(add);
    await screen.findByRole('button', { name: 'Galatians 6:2 added to canvas' });
    expect(screen.getByRole('button', { name: 'Galatians 6:2 added to canvas' })).toBeDisabled();
    await saved(() => expect(stored()[0].journey.entries).toHaveLength(1));
    // A suggestion lands on the canvas by itself: no invented connections.
    expect(stored()[0].board.edges).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit scripture' }));
    fireEvent.change(screen.getByLabelText('Connection to my glimpse'), { target: { value: 'I can receive care and offer it in turn.' } });
    fireEvent.change(screen.getByLabelText('My reflection (optional)'), { target: { value: 'I am learning to ask for help.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await saved(() => expect(stored()[0].journey.entries[0].text).toBe('I am learning to ask for help.'));
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
    expect(stored()[0].journey.entries[0].scripture.contextVerses).toEqual(suggestion().scripture.contextVerses);
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
    expect(stored()[0].journey.entries).toHaveLength(0);
  });
});

const arranged = (words = 'Learning to rest.') => {
  const canvas = createMoment(words);
  canvas.journey.entries = [{ id: 'a', kind: 'reflection', text: 'Sabbath is a gift', createdAt: '2026-01-01T12:00:00Z' }];
  canvas.board = projectBoard(canvas).board;
  return applyCommand(canvas, { type: 'createSection', id: 'section:keep', title: 'Keep me', nodeIds: ['entry:a'] }).canvas;
};

describe('the rollout switch', () => {
  it('shows Outline only when switched off, and a save leaves the stored layout exactly as it was', async () => {
    localStorage.setItem('miqra_living_canvas_board', 'off');
    const canvas = arranged();
    await saveMoment('member-one', 'org', canvas, null);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Learning to rest/ }));
    await screen.findByRole('heading', { name: 'What is becoming clearer?' });
    expect(screen.queryByRole('group', { name: 'View your canvas' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('What happened since? Has your understanding changed?'), { target: { value: 'Written with the board off' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add reflection' }));
    await saved(() => expect(stored()[0].journey.entries).toHaveLength(2));
    expect(stored()[0].board.sections).toEqual(canvas.board.sections);
    expect(stored()[0].board.nodes).toEqual(canvas.board.nodes);
  });

  it('can be turned on for one device from the address', async () => {
    localStorage.setItem('miqra_living_canvas_board', 'off');
    window.history.pushState({}, '', '/study-canvas?canvasBoard=on');
    mount();
    await screen.findByLabelText(PROMPT);
    expect(localStorage.getItem('miqra_living_canvas_board')).toBe('on');
    window.history.pushState({}, '', '/');
  });
});

describe('canvases that were only ever a story', () => {
  it('opens in Outline, writes nothing for looking, and keeps the arrangement once something is moved', async () => {
    localStorage.removeItem('miqra_canvas_view_v1:member-one');
    const legacy = createMoment('A story from before the canvas.');
    legacy.journey.entries = [{ id: 'a', kind: 'prayer', text: 'Lord, teach me', createdAt: '2026-01-01T12:00:00Z' }];
    await saveMoment('member-one', 'org', legacy, null);
    const before = stored()[0].savedAt;
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /story from before/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Try canvas' }));
    expect(await screen.findByText('Lord, teach me')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 900));
    expect(stored()[0].savedAt).toBe(before);
    expect(stored()[0].board).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Section' }));
    await screen.findByRole('complementary', { name: 'Section' });
    await saved(() => expect(stored()[0].board.sections).toHaveLength(1));
    expect(stored()[0].board.nodes.map((n) => n.id)).toEqual(['moment:' + legacy.id, 'entry:a']);
  });
});

describe('edits left behind by a closed page', () => {
  const seedWithJournal = async (baseOf, edits) => {
    const canvas = arranged('Edited while offline.');
    await saveMoment('member-one', 'org', canvas, null);
    const server = stored()[0];
    await recoveryJournal().write('member-one', canvas.id, { canvas: { ...server, ...edits }, baseSavedAt: baseOf(server), seq: 2 });
    return server;
  };

  it('replays them when the account has not moved, after asking', async () => {
    await seedWithJournal((server) => server.savedAt, { title: 'Back from the dead' });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Edited while offline/ }));
    expect(await screen.findByText('Unsaved edits were found on this device', { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore my edits' }));
    await saved(() => expect(stored()[0].title).toBe('Back from the dead'));
    await saved(async () => expect(await recoveryJournal().read('member-one', stored()[0].id)).toBeNull());
  });

  it('keeps them for download, never merging, when the canvas changed since', async () => {
    await seedWithJournal(() => 'an-older-revision', { title: 'My offline title' });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Edited while offline/ }));
    expect(await screen.findByText('could not be applied', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Canvas title' })).toHaveValue('Edited while offline.');
    fireEvent.click(screen.getByRole('button', { name: 'Save it as a separate canvas' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Canvas title' })).toHaveValue('My offline title (my copy)'));
    expect(stored()).toHaveLength(2);
    expect(stored().find((c) => c.title === 'Edited while offline.')).toBeTruthy();
  });

  it('quietly drops a leftover the account already holds', async () => {
    const server = await seedWithJournal(() => 'lost-acknowledgement', {});
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Edited while offline/ }));
    await screen.findByRole('textbox', { name: 'Canvas title' });
    expect(screen.queryByText('Unsaved edits were found', { exact: false })).not.toBeInTheDocument();
    await saved(async () => expect(await recoveryJournal().read('member-one', server.id)).toBeNull());
  });
});

describe('when another device interferes', () => {
  it('finds a canvas whose first save landed but whose answer was lost, instead of making a second', async () => {
    const real = (await vi.importActual('../../lib/studyCanvas')).saveMoment;
    saveMoment.mockImplementationOnce(async (...args) => { await real(...args); throw new Error('Failed to fetch'); });
    mount();
    fireEvent.change(screen.getByLabelText(PROMPT), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to canvas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your words are still here');
    fireEvent.click(screen.getByRole('button', { name: 'Add to canvas' }));
    await screen.findByRole('heading', { name: 'Let this moment grow' });
    expect(stored()).toHaveLength(1);
  });

  it('saves the person\'s copy as its own canvas when the original changed elsewhere', async () => {
    mount(); await capture();
    saveMoment.mockRejectedValue(new CanvasSaveError('conflict', 'This canvas changed on another device.'));
    fireEvent.change(screen.getByLabelText('What happened since? Has your understanding changed?'), { target: { value: 'My side of it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add reflection' }));
    await screen.findByText('This canvas changed on another device.', {}, { timeout: 4000 });
    saveMoment.mockImplementation((...args) => vi.importActual('../../lib/studyCanvas').then((m) => m.saveMoment(...args)));
    fireEvent.click(screen.getByRole('button', { name: 'Save my copy as a new canvas' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Canvas title' }).value).toMatch(/\(my copy\)$/));
    expect(stored()).toHaveLength(2);
    expect(stored().find((c) => /my copy/.test(c.title)).journey.entries.map((e) => e.text)).toEqual(['My side of it']);
    expect(await screen.findByText('Saved as a separate canvas.')).toBeInTheDocument();
  });
});

describe('pasting several paragraphs', () => {
  const THOUGHT = 'What happened since? Has your understanding changed?';
  const pasted = 'First, I felt overwhelmed.\n\nThen a friend came with dinner.\n\n   \n\nI am learning to say yes to help.';

  it('adds them as one thought by default, wording and blank lines untouched', async () => {
    mount(); await capture();
    fireEvent.change(screen.getByLabelText(THOUGHT), { target: { value: pasted } });
    fireEvent.click(screen.getByRole('button', { name: 'Add reflection' }));
    await saved(() => expect(stored()[0].journey.entries).toHaveLength(1));
    expect(stored()[0].journey.entries[0].text).toBe(pasted);
  });

  it('offers a preview, and splits at the blank lines into separate thoughts, only when asked', async () => {
    mount(); await capture();
    expect(screen.queryByRole('group', { name: 'Split into thoughts' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(THOUGHT), { target: { value: 'One paragraph only.' } });
    expect(screen.queryByRole('group', { name: 'Split into thoughts' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(THOUGHT), { target: { value: pasted } });
    const group = screen.getByRole('group', { name: 'Split into thoughts' });
    expect(within(group).getByText('This looks like 3 thoughts.')).toBeInTheDocument();
    expect(within(group).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['First, I felt overwhelmed.', 'Then a friend came with dinner.', 'I am learning to say yes to help.']);
    expect(stored()[0].journey.entries).toHaveLength(0);
    fireEvent.click(within(group).getByRole('button', { name: 'Split into 3 thoughts' }));
    await saved(() => expect(stored()[0].journey.entries).toHaveLength(3));
    expect(stored()[0].journey.entries.map((e) => [e.kind, e.text])).toEqual([['reflection', 'First, I felt overwhelmed.'], ['reflection', 'Then a friend came with dinner.'], ['reflection', 'I am learning to say yes to help.']]);
    expect(screen.getByLabelText(THOUGHT)).toHaveValue('');
    expect(screen.queryByRole('group', { name: 'Split into thoughts' })).not.toBeInTheDocument();
  });

  it('keeps the chosen kind for every piece, and never offers to split a Scripture connection', async () => {
    mount(); await capture();
    fireEvent.click(screen.getByLabelText('Open question'));
    fireEvent.change(screen.getByLabelText('What are you still wondering?'), { target: { value: 'Why now?\n\nWhy me?' } });
    fireEvent.click(within(screen.getByRole('group', { name: 'Split into thoughts' })).getByRole('button', { name: 'Split into 2 thoughts' }));
    await saved(() => expect(stored()[0].journey.entries.map((e) => e.kind)).toEqual(['question', 'question']));
    fireEvent.click(screen.getByLabelText('Scripture'));
    fireEvent.change(screen.getByLabelText('How does this passage connect to your experience?'), { target: { value: 'One\n\nTwo' } });
    expect(screen.queryByRole('group', { name: 'Split into thoughts' })).not.toBeInTheDocument();
  });

  it('refuses, and says why, when the pieces would not fit on the canvas', async () => {
    const canvas = createMoment('A crowded canvas.');
    canvas.journey.entries = Array.from({ length: 98 }, (_, i) => ({ id: `e${i}`, kind: 'reflection', text: `Thought ${i}`, createdAt: '2026-01-01T12:00:00Z' }));
    await saveMoment('member-one', 'org', canvas, null);
    mount(); fireEvent.click(await screen.findByRole('button', { name: /crowded canvas/ }));
    fireEvent.change(await screen.findByLabelText(THOUGHT), { target: { value: 'a\n\nb\n\nc' } });
    const group = screen.getByRole('group', { name: 'Split into thoughts' });
    expect(within(group).getByRole('status')).toHaveTextContent('Only 2 more thoughts fit on this canvas, and this would add 3.');
    expect(within(group).getByRole('button', { name: 'Split into 3 thoughts' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add reflection' }));
    await saved(() => expect(stored()[0].journey.entries).toHaveLength(99));
  });
});

describe('organizing from the outline, without dragging', () => {
  const seedTwo = async () => {
    const canvas = createMoment('A season of waiting.');
    canvas.journey.entries = [
      { id: 'a', kind: 'reflection', text: 'Waiting is hard', createdAt: '2026-01-02T12:00:00Z' },
      { id: 'b', kind: 'prayer', text: 'Lord, teach me patience', createdAt: '2026-01-03T12:00:00Z' },
    ];
    await saveMoment('member-one', 'org', canvas, null);
    mount(); fireEvent.click(await screen.findByRole('button', { name: /season of waiting/ }));
    await screen.findByRole('heading', { name: 'How this moment is growing' });
  };
  const card = (words) => screen.getByText(words).closest('article');
  const organize = async (words) => { const article = card(words); fireEvent.click(within(article).getByText(/^Organize this/)); await within(article).findByLabelText('Section'); return article; };

  it('builds nothing for a card until its controls are opened', async () => {
    await seedTwo();
    expect(screen.queryByLabelText('Section')).not.toBeInTheDocument();
    await organize('Waiting is hard');
    expect(screen.getAllByLabelText('Section')).toHaveLength(1);
  });

  it('makes a section, moves a thought into it, and shows the outline grouped by section', async () => {
    await seedTwo();
    fireEvent.change(screen.getByLabelText('New section'), { target: { value: 'What I am noticing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add section' }));
    expect(await screen.findByRole('heading', { name: 'What I am noticing' })).toBeInTheDocument();
    const article = await organize('Waiting is hard');
    const sectionId = await waitFor(() => { const id = stored()[0].board?.sections[0]?.id; if (!id) throw new Error('the section has not been saved yet'); return id; }, { timeout: 4000 });
    fireEvent.change(within(article).getByLabelText('Section'), { target: { value: sectionId } });
    const group = screen.getByRole('heading', { name: 'What I am noticing' }).closest('.lc-outline__group');
    expect(within(group).getByText('Waiting is hard')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Not in a section' }).closest('.lc-outline__group')).toHaveTextContent('Lord, teach me patience');
    await saved(() => expect(stored()[0].board.nodes.find((n) => n.id === 'entry:a').sectionId).toBe(stored()[0].board.sections[0].id));
    fireEvent.click(screen.getByRole('button', { name: 'Chronological' }));
    expect(screen.queryByRole('heading', { name: 'What I am noticing' })).not.toBeInTheDocument();
    const order = [...document.querySelectorAll('.moment-entry article')].map((a) => a.getAttribute('aria-label'));
    expect(order[0]).toBe('Original glimpse');
  });

  it('connects two thoughts by name with a label, lists the link on both, and removes it', async () => {
    await seedTwo();
    const article = await organize('Waiting is hard');
    fireEvent.change(within(article).getByLabelText('Find a thought to connect'), { target: { value: 'patience' } });
    fireEvent.change(within(article).getByLabelText(/How are they related/), { target: { value: 'is answered by' } });
    fireEvent.click(within(article).getByRole('button', { name: 'Connect' }));
    await saved(() => expect(stored()[0].board.edges).toEqual([expect.objectContaining({ source: 'entry:a', target: 'entry:b', label: 'is answered by' })]));
    const other = await organize('Lord, teach me patience');
    expect(within(other).getByRole('list', { name: 'Connections' })).toHaveTextContent('Connected with');
    expect(within(other).getByRole('list', { name: 'Connections' })).toHaveTextContent('Waiting is hard');
    fireEvent.click(within(other).getByRole('button', { name: /Remove connection with/ }));
    await saved(() => expect(stored()[0].board.edges).toEqual([]));
  });

  it('deletes a thought with its links after one confirmation, and the keyboard undoes it', async () => {
    await seedTwo();
    const article = await organize('Lord, teach me patience');
    fireEvent.click(within(article).getByRole('button', { name: 'Delete thought' }));
    expect(card('Lord, teach me patience')).toBeInTheDocument();
    fireEvent.click(within(article).getByRole('button', { name: 'Delete thought' }));
    await waitFor(() => expect(screen.queryByText('Lord, teach me patience')).not.toBeInTheDocument());
    await saved(() => expect(stored()[0].journey.entries.map((e) => e.id)).toEqual(['a']));
    fireEvent.keyDown(screen.getByRole('region', { name: 'How this moment is growing' }), { key: 'z', ctrlKey: true });
    expect(await screen.findByText('Lord, teach me patience')).toBeInTheDocument();
    await saved(() => expect(stored()[0].journey.entries.map((e) => e.id)).toEqual(['a', 'b']));
  });

  it('will not delete the original glimpse, and says why', async () => {
    await seedTwo();
    const article = await organize('A season of waiting.');
    expect(within(article).queryByRole('button', { name: 'Delete thought' })).not.toBeInTheDocument();
    expect(within(article).getByText(/original glimpse stays with its canvas/)).toBeInTheDocument();
  });
});
