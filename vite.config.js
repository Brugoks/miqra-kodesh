import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only auth bypass. When DEV_LOGIN_EMAIL is set, `vite dev` exposes
// /__dev-login, which mints a real magic-link token for that user with the
// service-role key and hands back only the token hash. The browser redeems it
// through the normal verifyOtp path, so the app runs on a genuine Supabase
// session — RLS, roles and org scoping all behave exactly as in production.
// The service-role key never leaves the Node process, and `apply: 'serve'`
// keeps the whole plugin out of `vite build`.
const devAutoLogin = (env) => ({
  name: 'miqra-dev-auto-login',
  apply: 'serve',
  configureServer(server) {
    const email = env.DEV_LOGIN_EMAIL;
    const url = env.VITE_SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!email) return;
    if (!url || !serviceKey) {
      server.config.logger.warn(
        '[dev-login] DEV_LOGIN_EMAIL is set but VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing — auto-login disabled.'
      );
      return;
    }

    server.config.logger.info(`  ➜  Dev login:  auto sign-in as ${email}`);

    server.middlewares.use('/__dev-login', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const upstream = await fetch(`${url}/auth/v1/admin/generate_link`, {
          method: 'POST',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ type: 'magiclink', email }),
        });
        const body = await upstream.json();
        if (!upstream.ok) {
          res.statusCode = upstream.status;
          res.end(JSON.stringify({ error: body?.msg || body?.error || 'generate_link failed' }));
          return;
        }
        // The REST shape is flat; supabase-js nests the same fields under
        // `properties`. Accept either so a client-library swap can't break it.
        const tokenHash = body?.hashed_token || body?.properties?.hashed_token;
        if (!tokenHash) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: 'generate_link returned no token hash' }));
          return;
        }
        res.end(JSON.stringify({ email, token_hash: tokenHash }));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err?.message || 'dev login failed' }));
      }
    });
  },
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix: the plugin needs the un-prefixed, server-only secrets too.
  const env = loadEnv(mode, import.meta.dirname, '');
  return {
    plugins: [react(), devAutoLogin(env)],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      globals: true,
    },
  };
})
