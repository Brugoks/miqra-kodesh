// The reader is lazy-loaded, so its window-event triggers (the top bar's Bible
// icon, every auto-linked reference) can fire before it is mounted to hear
// them. Those taps used to vanish, which is why opening the reader on a cold
// load took two taps. scriptureIntent.js buffers them; this suite is the proof
// that the buffered tap still opens the reader when it finally arrives.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, configure } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BibleLookup from './BibleLookup';
import { resetOnboardingCache } from '../lib/onboarding';
import { installScriptureIntentBuffer, resetScriptureIntents } from '../lib/scriptureIntent';

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

// Stands in for the lazy chunk landing a moment after the tap.
function mountReader() {
  return render(
    <MemoryRouter>
      <BibleLookup session={session} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetOnboardingCache();
  resetScriptureIntents();
  installScriptureIntentBuffer();
  mockInvoke.mockResolvedValue({ data: { data: { content: '[16] For God so loved the world.' } }, error: null });
  mockFrom.mockImplementation((table) => {
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

afterEach(() => {
  resetScriptureIntents();
});

describe('BibleLookup taps that land before it mounts', () => {
  it('opens for a scripture:toggle dispatched before the chunk arrived', async () => {
    act(() => { window.dispatchEvent(new CustomEvent('scripture:toggle')); });

    mountReader();

    await waitFor(() => expect(isOpen()).toBe(true));
  });

  it('opens and looks up a scripture:open dispatched before the chunk arrived', async () => {
    act(() => {
      window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref: 'John 3:16' } }));
    });

    mountReader();

    await waitFor(() => expect(isOpen()).toBe(true));
    await waitFor(() => expect(screen.getByDisplayValue('John 3:16')).toBeTruthy());
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('bible-proxy', expect.anything()));
  });

  it('stays shut when no tap was buffered', async () => {
    mountReader();

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(isOpen()).toBe(false);
  });

  it('does not replay a tap the mounted reader already handled', async () => {
    const { unmount } = mountReader();
    await waitFor(() => expect(isOpen()).toBe(false));

    // Handled live by the reader's own listener, so nothing should be left in
    // the buffer to fire again on the next mount.
    act(() => { window.dispatchEvent(new CustomEvent('scripture:toggle')); });
    await waitFor(() => expect(isOpen()).toBe(true));

    unmount();
    mountReader();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(isOpen()).toBe(false);
  });
});
