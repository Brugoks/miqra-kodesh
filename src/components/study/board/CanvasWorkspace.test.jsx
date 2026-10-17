import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasSaveError, saveMoment } from '../../../lib/studyCanvas';
import { createMoment } from '../../../lib/canvasJourney';
import { projectBoard } from '../../../lib/canvasBoard';
import CanvasWorkspace from './CanvasWorkspace';
import { recoveryJournal } from './useCanvasAutosave';

vi.mock('../../../lib/supabaseClient', () => ({ supabase: null, hasSupabaseConfig: false }));
vi.mock('../../../lib/studyCanvas', async (original) => ({ ...await original(), saveMoment: vi.fn() }));

const THOUGHT = 'What happened since? Has your understanding changed?';
const seed = (extra = {}) => {
  const canvas = { ...createMoment('A friend brought dinner.'), id: 'c1', savedAt: 't0', ...extra };
  canvas.journey.entries = [{ id: 'a', kind: 'reflection', text: 'Waiting is hard', createdAt: '2026-02-01T12:00:00Z' }];
  return canvas;
};
const props = () => ({ userId: 'u1', orgId: 'org', synced: true, boardOn: true, library: () => <p>The library</p>, onBack: vi.fn(), onDelete: vi.fn(), onReload: vi.fn(), onSaveCopy: vi.fn(), onSaved: vi.fn() });
const outline = () => localStorage.setItem('miqra_canvas_view_v1:u1', 'outline');
const open = (canvas = seed(), extra = {}) => { const p = { ...props(), ...extra }; return { ...render(<CanvasWorkspace initialCanvas={canvas} {...p} />), ...p }; };
const addThought = (words) => {
  fireEvent.change(screen.getByLabelText(THOUGHT), { target: { value: words } });
  fireEvent.click(screen.getByRole('button', { name: 'Add reflection' }));
};
const status = () => screen.getAllByRole('status').map((el) => el.textContent).join(' ');
const wait = (check) => waitFor(check, { timeout: 4000 });
const readBlob = (blob) => new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob); });

let stamp = 0;
beforeEach(async () => {
  localStorage.clear(); vi.clearAllMocks(); stamp = 0; outline();
  saveMoment.mockImplementation(async () => ({ savedAt: `t${(stamp += 1)}` }));
  await recoveryJournal().clear('u1', 'c1');
});

describe('saving as you go', () => {
  it('saves a burst of edits once, builds each save on the last timestamp, and says so', async () => {
    open();
    addThought('First');
    await screen.findByText('First');
    addThought('Second');
    expect(status()).toContain('Saving…');
    await wait(() => expect(saveMoment).toHaveBeenCalledTimes(1));
    expect(saveMoment.mock.calls[0][2].journey.entries.map((e) => e.text)).toEqual(['Waiting is hard', 'First', 'Second']);
    expect(saveMoment.mock.calls[0][3]).toBe('t0');
    await wait(() => expect(status()).toContain('Saved'));
    addThought('Third');
    await wait(() => expect(saveMoment).toHaveBeenCalledTimes(2));
    expect(saveMoment.mock.calls[1][3]).toBe('t1');
  });

  it('tells the library what was saved, so its title and revisit cue stay current', async () => {
    const { onSaved } = open();
    const title = screen.getByRole('textbox', { name: 'Canvas title' });
    fireEvent.change(title, { target: { value: 'Learning to receive' } });
    fireEvent.blur(title);
    await wait(() => expect(saveMoment).toHaveBeenCalled());
    expect(saveMoment.mock.calls[0][2].title).toBe('Learning to receive');
    await wait(() => expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Learning to receive' })));
  });

  it('keeps the title if it is emptied, and Escape puts the old one back', () => {
    open();
    const title = screen.getByRole('textbox', { name: 'Canvas title' });
    fireEvent.change(title, { target: { value: '   ' } });
    fireEvent.blur(title);
    expect(title).toHaveValue('A friend brought dinner.');
    fireEvent.change(title, { target: { value: 'Half typed' } });
    fireEvent.keyDown(title, { key: 'Escape' });
    expect(title).toHaveValue('A friend brought dinner.');
  });

  it('saves what is pending before leaving, then leaves', async () => {
    const { onBack } = open();
    addThought('Just before leaving');
    fireEvent.click(screen.getByRole('button', { name: 'All canvases' }));
    await wait(() => expect(onBack).toHaveBeenCalled());
    expect(saveMoment).toHaveBeenCalledTimes(1);
  });

  it('undoes and redoes with the keyboard outside a text box, and leaves text undo to the editor', async () => {
    open();
    addThought('Something to undo');
    await screen.findByText('Something to undo');
    const region = screen.getByRole('region', { name: 'How this moment is growing' });
    fireEvent.keyDown(screen.getByLabelText(THOUGHT), { key: 'z', ctrlKey: true });
    expect(within(region).getByText('Something to undo')).toBeInTheDocument();
    fireEvent.keyDown(region, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(within(region).queryByText('Something to undo')).not.toBeInTheDocument());
    expect(status()).toContain('Undid: thought added');
    fireEvent.keyDown(region, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(await within(region).findByText('Something to undo')).toBeInTheDocument();
  });
});

describe('when saving does not go through', () => {
  it('keeps a copy on this device and retries, and lets the person retry at once', async () => {
    saveMoment.mockRejectedValueOnce(new Error('Failed to fetch'));
    open();
    addThought('Written offline');
    await wait(() => expect(status()).toContain('Saved on this device · will retry'));
    expect((await recoveryJournal().read('u1', 'c1')).canvas.journey.entries.at(-1).text).toBe('Written offline');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await wait(() => expect(status()).toContain('Saved'));
    expect(status()).not.toContain('will retry');
    expect(await recoveryJournal().read('u1', 'c1')).toBeNull();
  });

  it('warns before leaving when there is no copy anywhere', async () => {
    // The device cannot keep a copy either (storage full or blocked).
    const full = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    saveMoment.mockRejectedValue(new Error('Failed to fetch'));
    const { onBack } = open();
    addThought('Only in this tab');
    await wait(() => expect(status()).toContain('changes are only in this tab'));
    fireEvent.click(screen.getByRole('button', { name: 'All canvases' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('could not be saved');
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.click(within(alert).getByRole('button', { name: 'Leave anyway' }));
    await wait(() => expect(onBack).toHaveBeenCalled());
    full.mockRestore();
  });

  it('stops on a change made elsewhere: nothing is retried or merged, and the person chooses', async () => {
    saveMoment.mockRejectedValue(new CanvasSaveError('conflict', 'This canvas changed on another device.'));
    const download = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:copy');
    const { onSaveCopy, onReload } = open();
    addThought('My edit');
    const banner = await screen.findByText('This canvas changed on another device.');
    expect(status()).toContain('Changed elsewhere');
    addThought('Another edit');
    await new Promise((r) => setTimeout(r, 900));
    expect(saveMoment).toHaveBeenCalledTimes(1);
    const group = banner.closest('[role="alert"]');
    fireEvent.click(within(group).getByRole('button', { name: 'Download my copy' }));
    expect(await readBlob(download.mock.calls[0][0])).toContain('My edit');
    fireEvent.click(within(group).getByRole('button', { name: 'Save my copy as a new canvas' }));
    expect(onSaveCopy).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
    fireEvent.click(within(group).getByRole('button', { name: 'Reload the latest version' }));
    await wait(() => expect(onReload).toHaveBeenCalled());
    expect(await recoveryJournal().read('u1', 'c1')).toBeNull();
  });

  it('says a canvas was deleted elsewhere, and offers a copy but not a reload', async () => {
    saveMoment.mockRejectedValue(new CanvasSaveError('gone', 'This canvas was deleted on another device.'));
    open();
    addThought('Too late');
    expect(await screen.findByText('This canvas was deleted on another device.')).toBeInTheDocument();
    expect(status()).toContain('Deleted elsewhere');
    expect(screen.getByRole('button', { name: 'Save my copy as a new canvas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reload the latest version' })).not.toBeInTheDocument();
  });
});

describe('edits left on this device', () => {
  const edited = () => { const c = seed(); c.title = 'Edited before the page closed'; return c; };

  it('offers to restore them when the account is still where they started, then saves them', async () => {
    const record = { canvas: edited(), baseSavedAt: 't0', seq: 3 };
    open(seed(), { recovery: { kind: 'restore', record } });
    expect(screen.getByRole('alert')).toHaveTextContent('Unsaved edits were found on this device');
    fireEvent.click(screen.getByRole('button', { name: 'Restore my edits' }));
    expect(screen.getByRole('textbox', { name: 'Canvas title' })).toHaveValue('Edited before the page closed');
    await wait(() => expect(saveMoment).toHaveBeenCalledWith('u1', 'org', expect.objectContaining({ title: 'Edited before the page closed' }), 't0'));
  });

  it('discards them only when asked', async () => {
    await recoveryJournal().write('u1', 'c1', { canvas: edited(), baseSavedAt: 't0', seq: 3 });
    open(seed(), { recovery: { kind: 'restore', record: await recoveryJournal().read('u1', 'c1') } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard them' }));
    await wait(async () => expect(await recoveryJournal().read('u1', 'c1')).toBeNull());
    expect(screen.getByRole('textbox', { name: 'Canvas title' })).toHaveValue('A friend brought dinner.');
    expect(saveMoment).not.toHaveBeenCalled();
  });

  it('never merges them into a canvas that moved on: it keeps them for download or a separate canvas', async () => {
    const record = { canvas: edited(), baseSavedAt: 'older', seq: 3 };
    const { onSaveCopy } = open(seed(), { recovery: { kind: 'conflict', record } });
    expect(screen.getByRole('alert')).toHaveTextContent('could not be applied');
    expect(screen.getByRole('textbox', { name: 'Canvas title' })).toHaveValue('A friend brought dinner.');
    fireEvent.click(screen.getByRole('button', { name: 'Save it as a separate canvas' }));
    expect(onSaveCopy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Edited before the page closed' }));
    expect(saveMoment).not.toHaveBeenCalled();
  });
});

describe('Canvas and Outline', () => {
  it('opens a new arranged canvas as a canvas on a desktop, and remembers a choice made here', async () => {
    localStorage.clear();
    const canvas = seed(); canvas.board = projectBoard(canvas).board;
    const view = open(canvas);
    expect(screen.getByRole('button', { name: 'Canvas' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('toolbar', { name: 'Canvas tools' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Outline' }));
    expect(await screen.findByRole('heading', { name: 'How this moment is growing' })).toBeInTheDocument();
    expect(localStorage.getItem('miqra_canvas_view_v1:u1')).toBe('outline');
    view.unmount();
    open(canvas);
    expect(screen.getByRole('button', { name: 'Outline' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens Outline on a phone, and for a canvas that has only ever been a story', async () => {
    localStorage.clear();
    const arranged = seed(); arranged.board = projectBoard(arranged).board;
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (q) => ({ matches: q.includes('760'), media: q, addEventListener() {}, removeEventListener() {} }) });
    const phone = open(arranged);
    expect(screen.getByRole('button', { name: 'Outline' })).toHaveAttribute('aria-pressed', 'true');
    phone.unmount();
    delete window.matchMedia;
    open(seed()); // no board yet
    expect(screen.getByRole('button', { name: 'Outline' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/has been a story so far/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try canvas' }));
    expect(await screen.findByRole('toolbar', { name: 'Canvas tools' })).toBeInTheDocument();
    expect(await screen.findByText('Waiting is hard')).toBeInTheDocument();
    // Looking is not an edit: nothing was written.
    await new Promise((r) => setTimeout(r, 800));
    expect(saveMoment).not.toHaveBeenCalled();
  });

  it('shows Outline only, with no spatial controls, when the board is switched off', () => {
    const arranged = seed(); arranged.board = null;
    open(arranged, { boardOn: false });
    expect(screen.queryByRole('group', { name: 'View your canvas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Order your outline' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Organize this/)).not.toBeInTheDocument();
    expect(screen.queryByText(/has been a story so far/)).not.toBeInTheDocument();
  });
});

describe('a saved layout that does not fit', () => {
  it('explains an unreadable layout, keeps the story readable, and offers the layout for download or a fresh start', async () => {
    const download = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:layout');
    const damaged = { ...seed(), board: null, boardIssue: { reason: 'The saved layout was made by a newer version of Living Canvas.', raw: { version: 9 } } };
    open(damaged);
    expect(screen.getByText('The saved layout can’t be read.')).toBeInTheDocument();
    expect(screen.getByText('Waiting is hard')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download or reset the layout' }));
    const panel = screen.getByRole('complementary', { name: 'Canvas settings' });
    fireEvent.click(within(panel).getByText('Layout recovery'));
    fireEvent.click(within(panel).getByRole('button', { name: /Download layout/ }));
    expect(JSON.parse(await readBlob(download.mock.calls.at(-1)[0])).board).toEqual({ version: 9 });
    fireEvent.click(within(panel).getByRole('button', { name: /Reset layout/ }));
    await wait(() => expect(saveMoment).toHaveBeenCalled());
    expect(saveMoment.mock.calls[0][2].board.nodes).toHaveLength(2);
    expect(saveMoment.mock.calls[0][2].boardIssue).toBeUndefined();
    expect(screen.queryByText('The saved layout can’t be read.')).not.toBeInTheDocument();
  });

  it('says how many saved placements no longer match', () => {
    const canvas = seed();
    canvas.board = { version: 1, sections: [], edges: [], nodes: [
      { id: 'moment:c1', contentRef: { type: 'moment' }, x: 0, y: 0, width: 320, sectionId: null },
      { id: 'entry:gone', contentRef: { type: 'entry', entryId: 'gone' }, x: 500, y: 0, width: 320, sectionId: null }] };
    open(canvas);
    expect(screen.getByText('1 placement in the saved layout no longer matches your canvas and is left out.')).toBeInTheDocument();
  });
});

describe('settings and export', () => {
  it('exports chosen thoughts with the sections and links between them', async () => {
    const canvas = seed();
    canvas.board = { version: 1, edges: [{ id: 'e', source: 'moment:c1', target: 'entry:a', label: 'leads to', direction: 'forward' }],
      sections: [{ id: 's', title: 'Noticing', color: 'teal', x: -24, y: -72, width: 400, height: 360, collapsed: false }],
      nodes: [{ id: 'moment:c1', contentRef: { type: 'moment' }, x: 0, y: 0, width: 320, sectionId: 's' }, { id: 'entry:a', contentRef: { type: 'entry', entryId: 'a' }, x: 500, y: 0, width: 320, sectionId: null }] };
    open(canvas);
    fireEvent.click(screen.getByRole('button', { name: 'Canvas settings' }));
    const panel = screen.getByRole('complementary', { name: 'Canvas settings' });
    fireEvent.click(within(panel).getByText('Take part of your story with you'));
    fireEvent.click(within(panel).getByText('Preview selected content'));
    const preview = panel.querySelector('pre').textContent;
    expect(preview).toContain('## Sections');
    expect(preview).toContain('### Noticing');
    expect(preview).toMatch(/Original glimpse: A friend brought dinner\. → Thought: Waiting is hard \(leads to\)/);
    fireEvent.click(within(panel).getByRole('checkbox'));
    expect(panel.querySelector('pre').textContent).not.toContain('leads to');
    expect(panel.querySelector('pre').textContent).not.toContain('Waiting is hard');
  });

  it('opens the library as a panel and closes settings with Escape, returning focus to the button that opened it', () => {
    open();
    const button = screen.getByRole('button', { name: 'Canvas settings' });
    button.focus();
    fireEvent.click(button);
    const panel = screen.getByRole('complementary', { name: 'Canvas settings' });
    expect(panel).toHaveFocus();
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'Canvas settings' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Your canvases' }));
    expect(screen.getByText('The library')).toBeInTheDocument();
  });

  it('deletes only after a second, explicit step, and nothing is saved on its way out', async () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    open(seed(), { onDelete });
    addThought('Pending when deleted');
    fireEvent.click(screen.getByRole('button', { name: 'Canvas settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete canvas' }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete entire canvas' }));
    await wait(() => expect(onDelete).toHaveBeenCalledWith('c1'));
    await new Promise((r) => setTimeout(r, 800));
    expect(saveMoment).not.toHaveBeenCalled();
    expect(await recoveryJournal().read('u1', 'c1')).toBeNull();
  });
});

describe('a delete that does not happen', () => {
  it('carries on saving, so edits made meanwhile are not lost', async () => {
    const onDelete = vi.fn().mockResolvedValue(false);
    open(seed(), { onDelete });
    addThought('Written before a failed delete');
    fireEvent.click(screen.getByRole('button', { name: 'Canvas settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete canvas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete entire canvas' }));
    await wait(() => expect(onDelete).toHaveBeenCalled());
    await wait(() => expect(saveMoment).toHaveBeenCalledTimes(1));
    expect(saveMoment.mock.calls[0][2].journey.entries.at(-1).text).toBe('Written before a failed delete');
  });
});
