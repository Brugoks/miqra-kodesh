// Feedback ticket d332b7e0, wired end to end: opening the reader on a page and
// pressing the device Back button must close the reader and leave the user on
// that page, not bounce them out to wherever they came from.
//
// BrowserRouter rather than the MemoryRouter the other reader suites use —
// jsdom's window.history is what a real Back press acts on.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, configure, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, useSearchParams } from 'react-router-dom';
import BibleLookup from './BibleLookup';
import { resetOnboardingCache } from '../lib/onboarding';
import { resetScriptureIntents } from '../lib/scriptureIntent';

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

// Stands in for the pages that sync their own query string while the reader is
// open (Sermons' tab switch, the reels' ?c=): a replace-navigation that drops
// whatever was in location.state, placeholder included.
function ReplaceParams() {
  const [, setSearchParams] = useSearchParams();
  return (
    <button type="button" onClick={() => setSearchParams({ tab: 'notes' }, { replace: true })}>
      replace params
    </button>
  );
}

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
  resetScriptureIntents();
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

  // Closing the reader pops its placeholder, and history.go() is asynchronous.
  // Reopening before that pop lands used to read as a Back press and slam the
  // reader shut again, so the reopen took two taps.
  it('stays open when reopened before its own pop has landed', async () => {
    render(
      <BrowserRouter>
        <BibleLookup session={session} />
      </BrowserRouter>,
    );

    const fab = screen.getByRole('button', { name: /bible lookup/i });
    await act(async () => { fireEvent.click(fab); });
    await waitFor(() => expect(isOpen()).toBe(true));

    // Close and reopen back to back, with no chance for the pop to settle.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^close$/i })); });
    expect(isOpen()).toBe(false);
    await act(async () => { fireEvent.click(fab); });
    expect(isOpen()).toBe(true);

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    expect(isOpen()).toBe(true);

    // And the reopened reader is armed again: Back closes it, not the page.
    await pressBack();
    await waitFor(() => expect(isOpen()).toBe(false));
    expect(window.location.pathname).toBe('/studies');
  });

  // A replace-navigation elsewhere on the page drops location.state, taking the
  // placeholder with it. That is not a Back press and must not close the reader.
  it('survives a replace-navigation that drops its placeholder', async () => {
    const user = userEvent.setup();
    render(
      <BrowserRouter>
        <ReplaceParams />
        <BibleLookup session={session} />
      </BrowserRouter>,
    );

    await user.click(screen.getByRole('button', { name: /bible lookup/i }));
    await waitFor(() => expect(isOpen()).toBe(true));

    await user.click(screen.getByRole('button', { name: /replace params/i }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(isOpen()).toBe(true);

    // Re-armed on the new entry, so Back still peels the reader off first.
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
