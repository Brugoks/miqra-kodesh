// Coverage for the My Highlights review page: canonical grouping, the filters,
// note editing, removal (which must be confirmed), and opening a verse back up
// in the reader.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Highlights from './Highlights';

const mockFrom = vi.fn();
const mockUpdateEq2 = vi.fn();
const mockDeleteEq2 = vi.fn();
let rows = [];
let loadError = null;

vi.mock('../lib/supabaseClient', () => ({
  hasSupabaseConfig: true,
  supabase: { from: (...args) => mockFrom(...args) },
}));

const session = { user: { id: 'user-1' } };

function row(verseId, extra = {}) {
  const [book_code, chapter, verse] = verseId.split('.');
  return {
    id: verseId,
    verse_id: verseId,
    book_code,
    chapter: Number(chapter),
    verse: Number(verse),
    color: 'gold',
    note: null,
    verse_text: `Text of ${verseId}`,
    created_at: '2026-08-06T00:00:00Z',
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
  loadError = null;
  mockUpdateEq2.mockResolvedValue({ error: null });
  mockDeleteEq2.mockResolvedValue({ error: null });
  mockFrom.mockReturnValue({
    select: () => {
      const chain = {
        eq: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: rows, error: loadError }),
      };
      return chain;
    },
    update: (payload) => ({ eq: () => ({ eq: (col, val) => mockUpdateEq2(payload, col, val) }) }),
    delete: () => ({ eq: () => ({ eq: (col, val) => mockDeleteEq2(col, val) }) }),
  });
});

describe('Highlights page', () => {
  it('teaches how to highlight when there is nothing yet', async () => {
    render(<Highlights session={session} />);
    expect(await screen.findByText(/nothing highlighted yet/i)).toBeInTheDocument();
    expect(screen.getByText(/tap a verse to mark it/i)).toBeInTheDocument();
  });

  it('groups verses by book in canonical order, not insertion order', async () => {
    rows = [row('REV.1.8'), row('GEN.1.1'), row('JHN.3.16'), row('GEN.1.3')];
    render(<Highlights session={session} />);

    await screen.findByText('Genesis');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Genesis', 'John', 'Revelation']);
  });

  it('orders verses within a book by chapter and verse', async () => {
    rows = [row('GEN.2.1'), row('GEN.1.10'), row('GEN.1.2')];
    render(<Highlights session={session} />);

    await screen.findByText('Genesis');
    const refs = screen.getAllByRole('button', { name: /open in the reader|Genesis/i })
      .map((b) => b.textContent)
      .filter((t) => t.startsWith('Genesis'));
    expect(refs).toEqual(['Genesis 1:2', 'Genesis 1:10', 'Genesis 2:1']);
  });

  it('summarises what has been marked', async () => {
    rows = [row('GEN.1.1', { note: 'a note' }), row('JHN.3.16')];
    render(<Highlights session={session} />);

    const stats = await screen.findByText(/verses/, { selector: '.hl-stats' });
    expect(stats.textContent).toMatch(/2 verses/);
    expect(stats.textContent).toMatch(/2 books/);
    expect(stats.textContent).toMatch(/1 with notes/);
  });

  it('filters by colour', async () => {
    rows = [row('GEN.1.1', { color: 'gold' }), row('JHN.3.16', { color: 'blue' })];
    const user = userEvent.setup();
    render(<Highlights session={session} />);
    await screen.findByText('Genesis');

    await user.click(screen.getByRole('button', { name: /command/i }));

    expect(screen.queryByText('Genesis')).toBeNull();
    expect(screen.getByText('John')).toBeInTheDocument();
  });

  it('searches note text as well as verse text', async () => {
    rows = [
      row('GEN.1.1', { note: 'creation and beginnings' }),
      row('JHN.3.16', { note: 'the gospel in one line' }),
    ];
    const user = userEvent.setup();
    render(<Highlights session={session} />);
    await screen.findByText('Genesis');

    await user.type(screen.getByLabelText(/search your highlights/i), 'gospel');

    await waitFor(() => expect(screen.queryByText('Genesis')).toBeNull());
    expect(screen.getByText('John')).toBeInTheDocument();
  });

  it('saves an edited note against the right verse', async () => {
    rows = [row('JHN.3.16')];
    const user = userEvent.setup();
    render(<Highlights session={session} />);
    await screen.findByText('John');

    await user.click(screen.getByRole('button', { name: /add note on John 3:16/i }));
    await user.type(screen.getByPlaceholderText(/what is this verse saying/i), 'Remember this');
    await user.click(screen.getByRole('button', { name: /save note/i }));

    await waitFor(() => expect(mockUpdateEq2).toHaveBeenCalled());
    expect(mockUpdateEq2).toHaveBeenCalledWith({ note: 'Remember this' }, 'verse_id', 'JHN.3.16');
  });

  it('requires confirmation before removing a highlight', async () => {
    rows = [row('JHN.3.16')];
    const user = userEvent.setup();
    render(<Highlights session={session} />);
    await screen.findByText('John');

    await user.click(screen.getByRole('button', { name: /remove highlight on John 3:16/i }));
    expect(mockDeleteEq2).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^remove$/i }));
    await waitFor(() => expect(mockDeleteEq2).toHaveBeenCalledWith('verse_id', 'JHN.3.16'));
  });

  it('opens a verse back up in the reader', async () => {
    rows = [row('JHN.3.16')];
    const listener = vi.fn();
    window.addEventListener('scripture:open', listener);
    const user = userEvent.setup();
    render(<Highlights session={session} />);
    await screen.findByText('John');

    await user.click(screen.getByRole('button', { name: /open John 3:16 in the reader/i }));

    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls[0][0].detail).toEqual({ ref: 'John 3:16' });
    window.removeEventListener('scripture:open', listener);
  });

  it('surfaces a load failure instead of pretending there is nothing', async () => {
    loadError = { message: 'network is down' };
    render(<Highlights session={session} />);
    expect(await screen.findByText(/network is down/i)).toBeInTheDocument();
  });

  it('tells a signed-out visitor what to do', () => {
    render(<Highlights session={null} />);
    expect(screen.getByText(/sign in to see the verses/i)).toBeInTheDocument();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('keeps a note visible and editable after saving', async () => {
    rows = [row('JHN.3.16', { note: 'first thought' })];
    const user = userEvent.setup();
    render(<Highlights session={session} />);

    const note = await screen.findByRole('button', { name: /first thought/i });
    await user.click(note);
    const box = screen.getByPlaceholderText(/what is this verse saying/i);
    expect(box).toHaveValue('first thought');

    await user.clear(box);
    await user.type(box, 'second thought');
    await user.click(screen.getByRole('button', { name: /save note/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /second thought/i })).toBeInTheDocument());
  });

  it('says so when filters match nothing', async () => {
    rows = [row('GEN.1.1')];
    const user = userEvent.setup();
    render(<Highlights session={session} />);
    await screen.findByText('Genesis');

    await user.type(screen.getByLabelText(/search your highlights/i), 'zzzz');

    expect(await screen.findByText(/nothing matches those filters/i)).toBeInTheDocument();
  });

  it('only offers books that actually have highlights', async () => {
    rows = [row('GEN.1.1'), row('GEN.1.2'), row('JHN.3.16')];
    render(<Highlights session={session} />);
    await screen.findByText('Genesis');

    const select = screen.getByLabelText(/filter by book/i);
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['All books', 'Genesis (2)', 'John (1)']);
  });
});
