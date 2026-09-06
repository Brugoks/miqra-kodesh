// Dev-only auth bypass, paired with the `miqra-dev-auto-login` Vite plugin in
// vite.config.js. The plugin (running in Node, where the service-role key
// lives) mints a magic-link token hash for DEV_LOGIN_EMAIL; here we redeem it
// through the ordinary verifyOtp path so the app ends up holding a real
// Supabase session rather than a stubbed one — RLS, roles and org scoping all
// behave exactly as they do for a hand-typed sign-in.
//
// `import.meta.env.DEV` is statically replaced at build time, so the whole
// body of this function is dropped from the production bundle.

const ENDPOINT = '/__dev-login';
const SUPPRESS_KEY = 'miqra_dev_login_off';

// GoTrue keeps ONE live magic-link token per user, so minting a second one
// silently invalidates the first. StrictMode double-invokes the effect that
// calls us, which was enough to make the first redemption fail with "Email
// link is invalid or has expired". Sharing a single in-flight promise
// collapses those callers onto one mint/redeem pair.
let inFlight = null;

const mintAndRedeem = async (supabase) => {
  const res = await fetch(ENDPOINT);
  // No DEV_LOGIN_EMAIL configured: the middleware isn't mounted and Vite
  // answers with the SPA's index.html. Nothing to do.
  if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return null;

  const { email, token_hash: tokenHash, error } = await res.json();
  if (error || !tokenHash) return { error: error || 'no token returned' };

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (verifyError) return { error: verifyError.message };
  return { email };
};

const runDevLogin = async (supabase) => {
  // Another tab (or a curl against /__dev-login) can invalidate our token
  // between mint and redeem by minting its own. One retry settles that race.
  let result = await mintAndRedeem(supabase);
  if (result?.error) result = await mintAndRedeem(supabase);

  if (!result) return false;
  if (result.error) {
    console.warn('[dev-login] could not sign in:', result.error);
    return false;
  }
  console.info(`[dev-login] signed in as ${result.email}`);
  return true;
};

export const ensureDevSession = async (supabase) => {
  if (!import.meta.env.DEV || !supabase) return false;

  // Never stomp a session that already exists — including one the maintainer
  // signed into by hand to test as somebody else.
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return false;

  // A deliberate sign-out must stick for the rest of the tab's life, otherwise
  // the auth screen is impossible to reach locally.
  if (sessionStorage.getItem(SUPPRESS_KEY) === '1') return false;

  if (!inFlight) {
    inFlight = runDevLogin(supabase)
      .catch((err) => {
        console.warn('[dev-login] failed:', err?.message || err);
        return false;
      })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
};

// Called on sign-out so the auto-login doesn't immediately sign the user back
// in. Cleared by opening a new tab.
export const suppressDevAutoLogin = () => {
  if (!import.meta.env.DEV) return;
  sessionStorage.setItem(SUPPRESS_KEY, '1');
};
