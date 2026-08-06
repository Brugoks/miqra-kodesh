// Integration coverage for personal verse highlights in the reader: marking a
// verse must persist under its canonical verse id, re-marking in the same colour
// must clear it, and notes must attach to the verse they were opened from.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import BibleLookup from './BibleLookup';

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 15000 });

const mockInvoke = vi.fn();
const mockFrom = vi.fn();
const mockUpsert = vi.fn();
const mockDeleteEq2 = vi.fn();
const mockUpdateEq2 = vi.fn();
let existingRows = [];

vi.mock('../lib/supabaseClient', () => ({
  hasSupabaseConfig: true,
  supabase: {
    functions: { invoke: (...args) => mockInvoke(...args) },
    from: (...args) => mockFrom(...args),
  },
}));

vi.mock('../lib/bibleWiki', () => ({ loadBibleWiki: () => Promise.resolve({ entries: [] }), buildNameIndex: () => new Map() }));
vi.mock('../lib/wikiEntityLinker', () => ({ loadEntityLinkIndex: () => Promise.resolve(new Map()) }));
vi.mock('../lib/scriptureEngagement', () => ({ recordEngagement: () => Promise.resolve(), passageIdsToChapters: () => [] }));

const session = { user: { id: 'user-1' } };
const JOHN_3 = '[14] And as Moses lifted up the serpent. [15] That whosoever believeth. [16] For God so loved the world. [17] For God sent not his Son.';

function queryChain(getResult) {
  const chain = {
    eq: () => chain,
    or: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(getResult()),
    then: (resolve, reject) => Promise.resolve(getResult()).then(resolve, reject),
  };
  return chain;
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <BibleLookup session={session} />
    </MemoryRouter>,
  );
}

// PassageText renders each word as its own node, so passage text is never a
// single matchable string. Wait on the verse anchors instead.
async function openToPassage(user) {
  await user.click(screen.getByRole('button', { name: /bible lookup/i }));
  await user.type(screen.getByPlaceholderText(/John 3:16/), 'John 3{Enter}');
  await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
  await waitFor(() => expect(document.querySelector('[data-verse="16"]')).toBeTruthy());
}

async function enterHighlightMode(user) {
  await user.click(await screen.findByRole('button', { name: /^highlight$/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  existingRows = [];
  mockInvoke.mockResolvedValue({ data: { data: { content: JOHN_3 } }, error: null });
  mockUpsert.mockResolvedValue({ error: null });
  mockDeleteEq2.mockResolvedValue({ error: null });
  mockUpdateEq2.mockResolvedValue({ error: null });
  // Table-aware so highlight writes can be asserted without catching the
  // reader's own lookup-history upsert, which chains .select().single().
  mockFrom.mockImplementation((table) => {
    if (table === 'verse_highlights') {
      return {
        select: () => queryChain(() => ({ data: existingRows, error: null })),
        upsert: (...args) => mockUpsert(...args),
        delete: () => ({ eq: () => ({ eq: (...a) => mockDeleteEq2(...a) }) }),
        update: (...args) => ({ eq: () => ({ eq: (...a) => mockUpdateEq2(args[0], ...a) }) }),
      };
    }
    return {
      select: () => queryChain(() => ({ data: [], error: null })),
      upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'h1' }, error: null }) }) }),
      delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    };
  });
  Element.prototype.scrollTo = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

describe('BibleLookup — personal verse highlights', () => {
  it('has no highlight controls until highlight mode is entered', async () => {
    const user = userEvent.setup();
    renderPanel();
    await openToPassage(user);

    expect(screen.queryByRole('radiogroup', { name: /highlight colour/i })).toBeNull();
    await enterHighlightMode(user);
    expect(screen.getByRole('radiogroup', { name: /highlight colour/i })).toBeInTheDocument();
  });

  it('marks a verse under its canonical verse id', async () => {
    const user = userEvent.setup();
    const { container } = renderPanel();
    await openToPassage(user);
    await enterHighlightMode(user);

    await user.click(container.querySelector('[data-verse="16"]'));

    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    const row = mockUpsert.mock.calls[0][0];
    expect(row).toMatchObject({
      user_id: 'user-1',
      verse_id: 'JHN.3.16',
      book_code: 'JHN',
      chapter: 3,
      verse: 16,
      color: 'gold',
      source: 'reader',
    });
    // The snapshot is what lets a highlights list render without re-fetching.
    expect(row.verse_text).toContain('For God so loved the world');
    expect(mockUpsert.mock.calls[0][1]).toEqual({ onConflict: 'user_id,verse_id' });
  });

  it('records the chosen colour rather than always the default', async () => {
    const user = userEvent.setup();
    const { container } = renderPanel();
    await openToPassage(user);
    await enterHighlightMode(user);

    await user.click(screen.getByRole('radio', { name: /command/i }));
    await user.click(container.querySelector('[data-verse="15"]'));

    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({ verse_id: 'JHN.3.15', color: 'blue' });
  });

  it('clears a highlight when the same colour is applied again', async () => {
    existingRows = [{
      id: 'h1', verse_id: 'JHN.3.16', book_code: 'JHN', chapter: 3, verse: 16, color: 'gold',
    }];
    const user = userEvent.setup();
    const { container } = renderPanel();
    await openToPassage(user);
    await enterHighlightMode(user);

    await user.click(container.querySelector('[data-verse="16"]'));

    await waitFor(() => expect(mockDeleteEq2).toHaveBeenCalledWith('verse_id', 'JHN.3.16'));
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('recolours rather than clears when a different colour is applied', async () => {
    existingRows = [{
      id: 'h1', verse_id: 'JHN.3.16', book_code: 'JHN', chapter: 3, verse: 16, color: 'gold',
    }];
    const user = userEvent.setup();
    const { container } = renderPanel();
    await openToPassage(user);
    await enterHighlightMode(user);

    await user.click(screen.getByRole('radio', { name: /conviction/i }));
    await user.click(container.querySelector('[data-verse="16"]'));

    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({ verse_id: 'JHN.3.16', color: 'rose' });
    expect(mockDeleteEq2).not.toHaveBeenCalled();
  });

  it('renders an existing highlight without entering highlight mode', async () => {
    existingRows = [{
      id: 'h1', verse_id: 'JHN.3.16', book_code: 'JHN', chapter: 3, verse: 16, color: 'green',
    }];
    const user = userEvent.setup();
    const { container } = renderPanel();
    await openToPassage(user);

    await waitFor(() => {
      expect(container.querySelector('[data-verse="16"]').className).toContain('bl-hl-green');
    });
    expect(container.querySelector('[data-verse="15"]').className).not.toContain('bl-hl');
  });

  it('saves a note against the verse it was opened from', async () => {
    existingRows = [{
      id: 'h1', verse_id: 'JHN.3.16', book_code: 'JHN', chapter: 3, verse: 16, color: 'gold',
      verse_text: 'For God so loved the world.',
    }];
    const user = userEvent.setup();
    renderPanel();
    await openToPassage(user);

    await user.click(await screen.findByRole('button', { name: /add a note to verse 16/i }));
    await user.type(screen.getByPlaceholderText(/what is this verse saying/i), 'The whole gospel in one line.');
    await user.click(screen.getByRole('button', { name: /save note/i }));

    await waitFor(() => expect(mockUpdateEq2).toHaveBeenCalled());
    const [payload, column, value] = mockUpdateEq2.mock.calls[0];
    expect(payload).toEqual({ note: 'The whole gospel in one line.' });
    expect(column).toBe('verse_id');
    expect(value).toBe('JHN.3.16');
  });

  it('suspends word study while highlighting so taps cannot collide', async () => {
    const user = userEvent.setup();
    const { container } = renderPanel();
    await openToPassage(user);

    expect(container.querySelectorAll('.bl-plain-word, .bl-word-btn').length).toBeGreaterThan(0);
    await enterHighlightMode(user);
    expect(container.querySelectorAll('.bl-plain-word, .bl-word-btn').length).toBe(0);
  });
});
