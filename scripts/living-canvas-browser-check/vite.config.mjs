// Builds the browser-check harness: the real /study-canvas page with no Supabase, so it saves to localStorage.
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

const here = fileURLToPath(new URL('./harness', import.meta.url));
export default {
  root: here,
  base: './',
  plugins: [react()],
  envDir: here, // never pick up the app's .env: the harness must not talk to a real project
  build: { outDir: process.env.LC_CHECK_OUT, emptyOutDir: true, minify: false },
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { fs: { strict: false } },
};
