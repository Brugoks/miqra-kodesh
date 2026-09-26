// From a passage in the reader straight into the 3D scene where it happened.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, configure, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
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

const MARK_1 = '[29] And immediately he left the synagogue. [30] Now Simon’s mother-in-law lay ill with a fever. [31] And he came and took her by the hand and lifted her up.';

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

// Stands in for the scene route: shows where the reader sent the visitor.
function Arrived() {
  const location = useLocation();
  return (
    <p data-testid="arrived">
      {location.pathname}{location.search} {JSON.stringify(location.state)}
    </p>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetOnboardingCache();
  mockInvoke.mockResolvedValue({ data: { data: { content: MARK_1 } }, error: null });
  mockFrom.mockImplementation((table) => {
    if (table === 'profiles') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { onboarding: { scriptureReader: true } }, error: null }) }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    }
    return {
      select: () => queryChain({ data: [], error: null }),
      upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'h1' }, error: null }) }) }),
      delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    };
  });
  Element.prototype.scrollTo = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

describe('BibleLookup — into the scene', () => {
  it('offers the scene where the passage happened, and takes the reader there', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <BibleLookup session={{ user: { id: 'user-1' } }} />
        <Routes>
          <Route path="/dashboard" element={<p>dashboard</p>} />
          <Route path="/scene/:slug" element={<Arrived />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {
      window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref: 'Mark 1:29-31' } }));
    });

    const strip = await screen.findByRole('region', { name: 'Step into the scene' });
    const link = await screen.findByRole('button', { name: /The Fever Left Her/ });
    expect(strip).toContainElement(link);
    fireEvent.click(link);

    const arrived = await screen.findByTestId('arrived');
    expect(arrived).toHaveTextContent('/scene/capernaum?event=mother-in-law');
    // Exit from the scene comes back here and reopens the reader at the passage.
    expect(arrived).toHaveTextContent('"source":"scripture"');
    expect(arrived).toHaveTextContent('"ref":"Mark 1:29-31"');
    expect(arrived).toHaveTextContent('"from":"/dashboard"');
    expect(arrived).toHaveTextContent('"depth":1');
  });

  it('jumps between moments inside a scene without losing the way back to the reader', async () => {
    const entered = { source: 'scripture', ref: 'Mark 1:16-20', from: '/dashboard', depth: 1 };
    render(
      <MemoryRouter initialEntries={[{ pathname: '/scene/capernaum', search: '?event=fishermen', state: { sceneReturnContext: entered } }]}>
        <BibleLookup session={{ user: { id: 'user-1' } }} />
        <Routes>
          <Route path="/scene/:slug" element={<Arrived />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {
      window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref: 'Mark 1:29-31' } }));
    });
    fireEvent.click(await screen.findByRole('button', { name: /The Fever Left Her/ }));
    const arrived = await screen.findByText(/event=mother-in-law/);
    // Still going back to the dashboard, now one entry further down: the
    // reader's Back placeholder was replaced by the new moment.
    expect(arrived).toHaveTextContent('"from":"/dashboard"');
    expect(arrived).toHaveTextContent('"ref":"Mark 1:29-31"');
    expect(arrived).toHaveTextContent('"depth":2');
  });
});
