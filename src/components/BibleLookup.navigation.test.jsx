// Integration coverage for the Bible navigation menu: picking a verse must load
// the WHOLE chapter and focus that verse, while every pre-existing lookup path
// keeps its narrow fetch.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, configure, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import BibleLookup from './BibleLookup';

// This suite clicks through several async state transitions (open sheet →
// filter → book → chapter → verse → fetch). Under full-suite CPU contention the
// default 1000ms async timeout races those transitions and flakes; give the
// waitFor helpers real headroom. It only bounds the failure case — passing
// assertions still resolve as soon as they're true.
//
// Two further rules keep this suite deterministic, because the headroom above
// silently could not cover either case:
//
//  1. The picker steps use findByRole, not getByRole. asyncUtilTimeout only
//     governs the RETRYING queries; a sync getBy* runs once and throws the
//     instant the next list hasn't rendered yet.
//  2. The book filter is set with fireEvent.change rather than user.type.
//     user.type dispatches one event per character, and under contention the
//     controlled input can lose keystrokes — leaving a filter like "Jhn" that
//     matches no book, which no amount of waiting recovers from. The test
//     cares that the list is filtered to John, not that it was typed key by
//     key, so setting the value atomically removes the failure mode.
configure({ asyncUtilTimeout: 5000 });
// Keep the per-test ceiling above the async timeout so a slow waitFor fails its
// own assertion cleanly instead of tripping vitest's default 5000ms test limit.
vi.setConfig({ testTimeout: 15000 });

const mockInvoke = vi.fn();
const mockFrom = vi.fn();

vi.mock('../lib/supabaseClient', () => ({
  hasSupabaseConfig: true,
  supabase: {
    functions: { invoke: (...args) => mockInvoke(...args) },
    from: (...args) => mockFrom(...args),
  },
}));

// Keep the panel focused on passage text — the wiki/entity/engagement side
// loads are irrelevant here and would otherwise hit the network.
vi.mock('../lib/bibleWiki', () => ({ loadBibleWiki: () => Promise.resolve({ entries: [] }), buildNameIndex: () => new Map() }));
vi.mock('../lib/wikiEntityLinker', () => ({ loadEntityLinkIndex: () => Promise.resolve(new Map()) }));
vi.mock('../lib/scriptureEngagement', () => ({ recordEngagement: () => Promise.resolve(), passageIdsToChapters: () => [] }));

const session = { user: { id: 'user-1' } };

// A three-verse stand-in for John 3 using the inline-marker format the real
// bible-proxy returns.
const JOHN_3 = '[14] And as Moses lifted up the serpent. [15] That whosoever believeth. [16] For God so loved the world. [17] For God sent not his Son.';

function renderPanel() {
  return render(
    <MemoryRouter>
      <BibleLookup session={session} />
    </MemoryRouter>,
  );
}

async function openPanel(user) {
  await user.click(screen.getByRole('button', { name: /bible lookup/i }));
}

// A PostgREST-shaped builder: every filter returns the builder, and the builder
// itself is awaitable so a query can be terminated at any point in the chain.
function queryChain(result) {
  const chain = {
    eq: () => chain,
    or: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockInvoke.mockResolvedValue({ data: { data: { content: JOHN_3 } }, error: null });
  mockFrom.mockReturnValue({
    // Chainable and awaitable, so both `.select().order().limit()` (lookup
    // history) and `.select().eq().eq()` (verse highlights) resolve.
    select: () => queryChain({ data: [], error: null }),
    upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'h1' }, error: null }) }) }),
    delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
  });
  // jsdom implements neither of these on elements.
  Element.prototype.scrollTo = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

describe('BibleLookup — Bible navigation menu', () => {
  it('requests the whole chapter, not just the verse, when a verse is picked', async () => {
    const user = userEvent.setup();
    renderPanel();
    await openPanel(user);

    await user.click(screen.getByRole('button', { name: 'Book' }));
    const sheet = screen.getByRole('dialog');
    fireEvent.change(within(sheet).getByLabelText('Filter books'), { target: { value: 'John' } });
    await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: /^john, 21 chapters$/i }));
    await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'John chapter 3' }));
    await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'John 3 verse 16' }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    const passageCall = mockInvoke.mock.calls.find(([fn]) => fn === 'bible-proxy');
    // The whole point of the feature: JHN.3, not JHN.3.16.
    expect(passageCall[1].body.passageId).toBe('JHN.3');
  });

  it('keeps the picked verse in the breadcrumb after the chapter-only lookup', async () => {
    const user = userEvent.setup();
    renderPanel();
    await openPanel(user);

    await user.click(screen.getByRole('button', { name: 'Book' }));
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Filter books'), { target: { value: 'John' } });
    await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: /^john, 21 chapters$/i }));
    await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'John chapter 3' }));
    await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'John 3 verse 16' }));

    // Regression: the navigator issues "John 3", and syncing the breadcrumb
    // from that reference must not wipe the verse back out.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Verse 16' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Chapter 3' })).toBeInTheDocument();
  });

  it('marks the focused verse in the rendered chapter', async () => {
    const user = userEvent.setup();
    const { container } = renderPanel();
    await openPanel(user);

    await user.click(screen.getByRole('button', { name: 'Book' }));
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Filter books'), { target: { value: 'John' } });
    await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: /^john, 21 chapters$/i }));
    await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'John chapter 3' }));
    await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'John 3 verse 16' }));

    await waitFor(() => {
      expect(container.querySelector('[data-focus-verse="true"]')).toBeTruthy();
    });
    const focused = container.querySelector('[data-focus-verse="true"]');
    expect(focused.dataset.verse).toBe('16');
    expect(focused).toHaveTextContent('For God so loved the world');
    // Every verse in the chapter is anchored, not just the focused one.
    expect(container.querySelectorAll('[data-verse]')).toHaveLength(4);
  });

  it('a typed reference still fetches only that verse and focuses nothing', async () => {
    const user = userEvent.setup();
    const { container } = renderPanel();
    await openPanel(user);

    await user.type(screen.getByPlaceholderText(/John 3:16/), 'John 3:16{Enter}');

    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    const passageCall = mockInvoke.mock.calls.find(([fn]) => fn === 'bible-proxy');
    expect(passageCall[1].body.passageId).toBe('JHN.3.16');
    expect(container.querySelector('[data-focus-verse="true"]')).toBeNull();
  });

  it('offers chapter paging that crosses into the next book', async () => {
    const user = userEvent.setup();
    renderPanel();
    await openPanel(user);

    await user.click(screen.getByRole('button', { name: 'Book' }));
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Filter books'), { target: { value: 'John' } });
    await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: /^john, 21 chapters$/i }));
    await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'John chapter 21' }));
    await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'John 21 verse 1' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next chapter: acts 1/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /previous chapter: john 20/i })).toBeInTheDocument();
  });

  it('Escape inside the picker steps back a level without closing the panel', async () => {
    const user = userEvent.setup();
    const { container } = renderPanel();
    await openPanel(user);
    expect(container.querySelector('.bible-lookup-panel.open')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Book' }));
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Filter books'), { target: { value: 'John' } });
    await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: /^john, 21 chapters$/i }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Choose a chapter');

    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Choose a book');
    // The panel's own Escape handler must not have fired underneath.
    expect(container.querySelector('.bible-lookup-panel.open')).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container.querySelector('.bible-lookup-panel.open')).toBeTruthy();
  });

  it('restores the last position into the breadcrumb without fetching', async () => {
    localStorage.setItem('miqra_scripture_position', JSON.stringify({ code: 'ROM', chapter: 8, verse: 28 }));
    const user = userEvent.setup();
    renderPanel();
    await openPanel(user);

    expect(screen.getByRole('button', { name: 'Romans' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chapter 8' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verse 28' })).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith('bible-proxy', expect.anything());
  });
});
