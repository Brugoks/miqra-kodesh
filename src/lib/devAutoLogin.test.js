import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ensureDevSession, suppressDevAutoLogin } from './devAutoLogin';

const jsonResponse = (body) => ({
  ok: true,
  headers: { get: () => 'application/json' },
  json: async () => body,
});

const makeSupabase = ({ session = null, verify = () => ({ error: null }) } = {}) => ({
  auth: {
    getSession: vi.fn(async () => ({ data: { session } })),
    verifyOtp: vi.fn(async (args) => verify(args)),
  },
});

describe('ensureDevSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('redeems a minted token through verifyOtp', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ email: 'me@example.com', token_hash: 'abc' })));
    const supabase = makeSupabase();

    await expect(ensureDevSession(supabase)).resolves.toBe(true);
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'magiclink' });
  });

  it('leaves an existing session alone', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const supabase = makeSupabase({ session: { user: { id: 'someone-else' } } });

    await expect(ensureDevSession(supabase)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays out of the way after a deliberate sign-out', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    suppressDevAutoLogin();

    await expect(ensureDevSession(makeSupabase())).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // GoTrue keeps one live magic-link token per user, so a second mint
  // invalidates the first. StrictMode's double-invoked effect used to trip
  // exactly this.
  it('mints only once for concurrent callers', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ email: 'me@example.com', token_hash: 'abc' }));
    vi.stubGlobal('fetch', fetchMock);
    const supabase = makeSupabase();

    const results = await Promise.all([ensureDevSession(supabase), ensureDevSession(supabase)]);

    expect(results).toEqual([true, true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(supabase.auth.verifyOtp).toHaveBeenCalledTimes(1);
  });

  it('retries once when another tab invalidated the token', async () => {
    let mint = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      mint += 1;
      return jsonResponse({ email: 'me@example.com', token_hash: `token-${mint}` });
    }));
    const supabase = makeSupabase({
      verify: ({ token_hash: token }) =>
        (token === 'token-1' ? { error: { message: 'Email link is invalid or has expired' } } : { error: null }),
    });

    await expect(ensureDevSession(supabase)).resolves.toBe(true);
    expect(supabase.auth.verifyOtp).toHaveBeenCalledTimes(2);
  });

  it('gives up quietly when the endpoint is not mounted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'text/html' },
      json: async () => ({}),
    })));

    await expect(ensureDevSession(makeSupabase())).resolves.toBe(false);
  });

  it('does not throw when the dev server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connection refused'); }));

    await expect(ensureDevSession(makeSupabase())).resolves.toBe(false);
  });
});
