import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
const here = fileURLToPath(new URL('./harness', import.meta.url));
export default {
  root: here, plugins: [react(), { name: 'isolated-sample', configureServer(server) {
    server.middlewares.use('/sample.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(readFileSync(process.env.CANVAS_TEST_SAMPLE_OUT || '/tmp/miqra-integration-sample.json'));
    });
  }, generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'sample.json', source: readFileSync(process.env.CANVAS_TEST_SAMPLE_OUT || '/tmp/miqra-integration-sample.json', 'utf8') });
  } }],
  envDir: here, // Deliberately excludes the application's real Supabase credentials.
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('') },
  resolve: { dedupe: ['react', 'react-dom'] }, server: { host: '127.0.0.1', fs: { strict: false } },
  build: { outDir: process.env.CANVAS_TEST_BROWSER_OUT, emptyOutDir: true },
};
