// Feedback ticket d332b7e0, wired end to end: opening the reader on a page and
// pressing the device Back button must close the reader and leave the user on
// that page, not bounce them out to wherever they came from.
//
// BrowserRouter rather than the MemoryRouter the other reader suites use —
// jsdom's window.history is what a real Back press acts on.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import BibleLookup from './BibleLookup';
import { resetOnboardingCache } from '../lib/onboarding';

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

const panel = () => document.querySelector('.bible-lookup-panel');
const isOpen = () => panel().classList.contains('open');

async function pressBack() {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetOnboardingCache();
  window.history.replaceState(null, '', '/studies');
  mockInvoke.mockResolvedValue({ data: { data: { content: '[16] For God so loved the world.' } }, error: null });
  mockFrom.mockImplementation((table) => {
    // Already onboarded: this suite is about the reader's own Back handling,
    // and the first-use walkthrough is a layer above it that would otherwise
    // absorb the first press. Its own layering is covered in
    // BibleLookup.walkthrough.test.jsx.
    if (table === 'profiles') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { onboarding: { scriptureReader: true } }, error: null }) }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    }
    return {
      select: () => queryChain(() => ({ data: [], error: null })),
      upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'h1' }, error: null }) }) }),
      delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    };
  });
});

describe('BibleLookup device back button', () => {
  it('closes the reader and stays on the page it was opened from', async () => {
    const user = userEvent.setup();
    render(
      <BrowserRouter>
        <BibleLookup session={session} />
      </BrowserRouter>,
    );

    await user.click(screen.getByRole('button', { name: /bible lookup/i }));
    await waitFor(() => expect(isOpen()).toBe(true));

    await pressBack();

    await waitFor(() => expect(isOpen()).toBe(false));
    expect(window.location.pathname).toBe('/studies');
  });

  it('does not consume a history entry once the reader is closed by its own X', async () => {
    const user = userEvent.setup();
    render(
      <BrowserRouter>
        <BibleLookup session={session} />
      </BrowserRouter>,
    );

    await user.click(screen.getByRole('button', { name: /bible lookup/i }));
    await waitFor(() => expect(isOpen()).toBe(true));
    await user.click(screen.getByRole('button', { name: /^close$/i }));
    await waitFor(() => expect(isOpen()).toBe(false));

    // The placeholder must be gone, otherwise the next Back press is spent on
    // a reader that is no longer on screen.
    await waitFor(() => expect(window.history.state?.usr?.miqraBackDismiss).toBeFalsy());
  });
});
