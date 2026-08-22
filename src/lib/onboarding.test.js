// Onboarding flags moved from localStorage onto the profile (ticket 032815b7).
// The risk in that move is re-onboarding people who already finished: these
// pin the legacy fold-up, the offline fallback, and the "don't decide until we
// know" contract that gates every first-visit prompt.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockUpdateEq = vi.fn();
const mockMaybeSingle = vi.fn();
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
let supabaseConfigured = true;

vi.mock('./supabaseClient', () => ({
  get hasSupabaseConfig() { return supabaseConfigured; },
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
      update: (...args) => mockUpdate(...args),
    }),
  },
}));

const { useOnboarding, markOnboardingDone, resetOnboardingCache } = await import('./onboarding');

const session = { user: { id: 'user-1' } };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetOnboardingCache();
  supabaseConfigured = true;
  mockUpdateEq.mockResolvedValue({ error: null });
  mockMaybeSingle.mockResolvedValue({ data: { onboarding: {} }, error: null });
});

describe('useOnboarding', () => {
  it('is not ready until the profile has been read', async () => {
    let resolve;
    mockMaybeSingle.mockReturnValue(new Promise((r) => { resolve = r; }));

    const { result } = renderHook(() => useOnboarding(session));
    expect(result.current.ready).toBe(false);

    await act(async () => {
      resolve({ data: { onboarding: {} }, error: null });
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('reports a flag the profile already carries', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { onboarding: { discipleship: true } }, error: null });

    const { result } = renderHook(() => useOnboarding(session));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.isDone('discipleship')).toBe(true);
    expect(result.current.isDone('calendar')).toBe(false);
  });

  it('folds a pre-existing localStorage flag up to the profile exactly once', async () => {
    localStorage.setItem('miqra_discipleship_onboarding_v1', 'done');

    const { result } = renderHook(() => useOnboarding(session));

    await waitFor(() => expect(result.current.ready).toBe(true));
    // The whole point: someone who dismissed this before the migration must
    // not be walked through it again.
    expect(result.current.isDone('discipleship')).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({ onboarding: { discipleship: true } });
  });

  it('does not rewrite the profile when the legacy flag is already up there', async () => {
    localStorage.setItem('miqra_discipleship_onboarding_v1', 'done');
    mockMaybeSingle.mockResolvedValue({ data: { onboarding: { discipleship: true } }, error: null });

    const { result } = renderHook(() => useOnboarding(session));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('treats a non-object onboarding value as empty rather than throwing', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { onboarding: ['discipleship'] }, error: null });

    const { result } = renderHook(() => useOnboarding(session));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.isDone('discipleship')).toBe(false);
  });

  it('falls back to the local mirror when the profile read fails', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'offline' } });
    localStorage.setItem('miqra_onboarding', JSON.stringify({ discipleship: true }));

    const { result } = renderHook(() => useOnboarding(session));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.isDone('discipleship')).toBe(true);
  });

  it('marks done immediately, before the write lands', async () => {
    let resolveWrite;
    mockUpdateEq.mockReturnValue(new Promise((r) => { resolveWrite = r; }));

    const { result } = renderHook(() => useOnboarding(session));
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => { result.current.markDone('discipleship'); });

    // A modal must never sit there waiting on the network to close.
    expect(result.current.isDone('discipleship')).toBe(true);
    await act(async () => { resolveWrite({ error: null }); });
  });

  it('keeps the flag when the write fails, so the modal stays closed', async () => {
    mockUpdateEq.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useOnboarding(session));
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => { await markOnboardingDone('user-1', 'discipleship'); });

    expect(result.current.isDone('discipleship')).toBe(true);
    expect(JSON.parse(localStorage.getItem('miqra_onboarding'))).toEqual({ discipleship: true });
  });

  it('works with no Supabase configured, using the local mirror only', async () => {
    supabaseConfigured = false;

    const { result } = renderHook(() => useOnboarding(session));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.isDone('discipleship')).toBe(false);

    await act(async () => { await result.current.markDone('discipleship'); });

    expect(result.current.isDone('discipleship')).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not leak one user\'s flags to the next session', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { onboarding: { discipleship: true } }, error: null });
    const { result, rerender } = renderHook(({ s }) => useOnboarding(s), {
      initialProps: { s: session },
    });
    await waitFor(() => expect(result.current.isDone('discipleship')).toBe(true));

    let resolveSecond;
    mockMaybeSingle.mockReturnValue(new Promise((r) => { resolveSecond = r; }));
    rerender({ s: { user: { id: 'user-2' } } });

    // Not merely "eventually false" — the switch must never show user-1's
    // answer for user-2, not even for the render before the fetch lands.
    expect(result.current.ready).toBe(false);
    expect(result.current.isDone('discipleship')).toBe(false);

    await act(async () => { resolveSecond({ data: { onboarding: {} }, error: null }); });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.isDone('discipleship')).toBe(false);
  });
});
