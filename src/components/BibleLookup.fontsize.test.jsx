// Feedback ticket 9d740e82: readers wanted the passage text bigger or smaller
// on a phone. The control steps a scale that the reading surface is sized
// against, clamps at both ends, and survives a reload.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import BibleLookup from './BibleLookup';

configure({ asyncUtilTimeout: 5000 });
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

vi.mock('../lib/bibleWiki', () => ({ loadBibleWiki: () => Promise.resolve({ entries: [] }), buildNameIndex: () => new Map() }));
vi.mock('../lib/wikiEntityLinker', () => ({ loadEntityLinkIndex: () => Promise.resolve(new Map()) }));
vi.mock('../lib/scriptureEngagement', () => ({ recordEngagement: () => Promise.resolve(), passageIdsToChapters: () => [] }));

const session = { user: { id: 'user-1' } };
const JOHN_3 = '[16] For God so loved the world. [17] For God sent not his Son.';

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

async function openToPassage(user) {
  await user.click(screen.getByRole('button', { name: /bible lookup/i }));
  await user.type(screen.getByPlaceholderText(/John 3:16/), 'John 3{Enter}');
  await waitFor(() => expect(document.querySelector('[data-verse="16"]')).toBeTruthy());
}

const panelScale = () => document.querySelector('.bible-lookup-panel').style.getPropertyValue('--bl-font-scale');
const smaller = () => screen.getByRole('button', { name: /decrease reading text size/i });
const larger = () => screen.getByRole('button', { name: /increase reading text size/i });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockInvoke.mockResolvedValue({ data: { data: { content: JOHN_3 } }, error: null });
  mockFrom.mockImplementation(() => ({
    select: () => queryChain(() => ({ data: [], error: null })),
    upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'h1' }, error: null }) }) }),
    delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
  }));
});

describe('BibleLookup reading text size', () => {
  it('starts at the default step', async () => {
    const user = userEvent.setup();
    renderPanel();
    await openToPassage(user);

    expect(panelScale()).toBe('1');
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('steps the scale up and down', async () => {
    const user = userEvent.setup();
    renderPanel();
    await openToPassage(user);

    await user.click(larger());
    expect(panelScale()).toBe('1.15');
    expect(screen.getByText('L')).toBeInTheDocument();

    await user.click(larger());
    expect(panelScale()).toBe('1.35');

    await user.click(smaller());
    expect(panelScale()).toBe('1.15');
  });

  it('clamps at both ends and disables the button that would overshoot', async () => {
    const user = userEvent.setup();
    renderPanel();
    await openToPassage(user);

    await user.click(smaller());
    expect(panelScale()).toBe('0.9');
    expect(smaller()).toBeDisabled();
    expect(larger()).not.toBeDisabled();

    await user.click(larger());
    await user.click(larger());
    await user.click(larger());
    await user.click(larger());
    expect(panelScale()).toBe('1.6');
    expect(larger()).toBeDisabled();
  });

  it('remembers the chosen size across a remount', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPanel();
    await openToPassage(user);
    await user.click(larger());
    expect(panelScale()).toBe('1.15');
    unmount();

    renderPanel();
    await waitFor(() => expect(panelScale()).toBe('1.15'));
  });

  it('ignores a junk stored value rather than rendering an unreadable page', async () => {
    localStorage.setItem('miqra_scripture_font_scale', 'huge');
    renderPanel();
    await waitFor(() => expect(panelScale()).toBe('1'));
  });
});
