// First-use walkthrough for the scripture reader — the in-app answer to the
// "short video tutorial" ask on ticket 032815b7.
//
// What matters: it shows itself once and only once, it is reopenable on
// demand, and it takes its turn at the top of the reader's dismiss stack so a
// Back press or Escape closes the walkthrough before the reader underneath it.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 15000 });

const mockInvoke = vi.fn();
const mockFrom = vi.fn();
const mockUpdateEq = vi.fn();
const mockProfileSingle = vi.fn();

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

const { default: BibleLookup } = await import('./BibleLookup');
const { resetOnboardingCache } = await import('../lib/onboarding');

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
const readerOpen = () => panel().classList.contains('open');
const walkthrough = () => screen.queryByRole('dialog', { name: /how the scripture reader works/i });

async function pressBack() {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function renderReader() {
  return render(
    <BrowserRouter>
      <BibleLookup session={session} />
    </BrowserRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetOnboardingCache();
  window.history.replaceState(null, '', '/studies');
  mockInvoke.mockResolvedValue({ data: { data: { content: '[16] For God so loved the world.' } }, error: null });
  mockUpdateEq.mockResolvedValue({ error: null });
  // Never onboarded yet.
  mockProfileSingle.mockResolvedValue({ data: { onboarding: {} }, error: null });
  mockFrom.mockImplementation((table) => {
    if (table === 'profiles') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: mockProfileSingle }) }),
        update: () => ({ eq: mockUpdateEq }),
      };
    }
    return {
      select: () => queryChain(() => ({ data: [], error: null })),
      upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'h1' }, error: null }) }) }),
      delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    };
  });
});

describe('scripture reader walkthrough', () => {
  it('greets a first-time reader when the panel opens', async () => {
    const user = userEvent.setup();
    renderReader();

    expect(walkthrough()).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /bible lookup/i }));
    expect(await screen.findByRole('dialog', { name: /how the scripture reader works/i })).toBeInTheDocument();
    expect(screen.getByText('1 of 5')).toBeInTheDocument();
  });

  it('steps through and records the dismissal on the profile', async () => {
    const user = userEvent.setup();
    renderReader();
    await user.click(screen.getByRole('button', { name: /bible lookup/i }));
    await screen.findByRole('dialog', { name: /how the scripture reader works/i });

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('2 of 5')).toBeInTheDocument();

    // Jump to the end via the dots rather than clicking Next three more times.
    await user.click(screen.getByRole('button', { name: /step 5:/i }));
    await user.click(screen.getByRole('button', { name: /start reading/i }));

    await waitFor(() => expect(walkthrough()).not.toBeInTheDocument());
    expect(mockUpdateEq).toHaveBeenCalled();
    // Closing the walkthrough must not close the reader with it.
    expect(readerOpen()).toBe(true);
  });

  it('stays away for someone who has already seen it', async () => {
    mockProfileSingle.mockResolvedValue({ data: { onboarding: { scriptureReader: true } }, error: null });
    const user = userEvent.setup();
    renderReader();

    await user.click(screen.getByRole('button', { name: /bible lookup/i }));
    await waitFor(() => expect(readerOpen()).toBe(true));
    // Give the auto-open every chance to fire before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(walkthrough()).not.toBeInTheDocument();
  });

  it('reopens from the How it works button', async () => {
    mockProfileSingle.mockResolvedValue({ data: { onboarding: { scriptureReader: true } }, error: null });
    const user = userEvent.setup();
    renderReader();
    await user.click(screen.getByRole('button', { name: /bible lookup/i }));
    await waitFor(() => expect(readerOpen()).toBe(true));

    await user.click(screen.getByRole('button', { name: /how the reader works/i }));

    expect(await screen.findByRole('dialog', { name: /how the scripture reader works/i })).toBeInTheDocument();
  });

  it('lets Back close the walkthrough before the reader under it', async () => {
    const user = userEvent.setup();
    renderReader();
    await user.click(screen.getByRole('button', { name: /bible lookup/i }));
    await screen.findByRole('dialog', { name: /how the scripture reader works/i });

    await pressBack();

    // One Back press = one layer. The reader is still there.
    await waitFor(() => expect(walkthrough()).not.toBeInTheDocument());
    expect(readerOpen()).toBe(true);
    expect(window.location.pathname).toBe('/studies');

    // The reader is still open, so it re-arms for the next press. Wait for that
    // rather than racing it — a real user takes a second between presses.
    await waitFor(() => expect(window.history.state?.usr?.miqraBackDismiss).toBe(true));

    await pressBack();
    await waitFor(() => expect(readerOpen()).toBe(false));
    expect(window.location.pathname).toBe('/studies');
  });

  it('closes on Escape without closing the reader', async () => {
    const user = userEvent.setup();
    renderReader();
    await user.click(screen.getByRole('button', { name: /bible lookup/i }));
    await screen.findByRole('dialog', { name: /how the scripture reader works/i });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(walkthrough()).not.toBeInTheDocument());
    expect(readerOpen()).toBe(true);
  });
});
