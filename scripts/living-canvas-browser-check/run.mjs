// Re-checks what jsdom cannot: real layout, hit-testing, pointer, wheel and touch input, contrast, and frame times,
// by driving the real Living Canvas page in headless Chrome. It asserts on geometry; it takes no screenshots.
//
//   node scripts/living-canvas-browser-check/run.mjs            # all scenarios
//   node scripts/living-canvas-browser-check/run.mjs mobile     # one: desktop | desktop-more | mobile | perf
//
// Needs Google Chrome (set CHROME_PATH if it is not the macOS default) and python3. Nothing is sent anywhere: the
// harness has no Supabase credentials, so the page saves to the headless profile's localStorage.
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'lc-harness-'));
process.env.LC_CHECK_OUT = out;
await build({ configFile: join(here, 'vite.config.mjs'), logLevel: 'warn' });

const all = ['desktop', 'desktop-more', 'mobile', 'perf'];
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : all;
let failed = 0;
for (const [index, name] of wanted.entries()) {
  console.log(`\n── ${name} ──`);
  const result = spawnSync('node', [join(here, `${name}.mjs`)], { stdio: 'inherit', env: { ...process.env, LC_CHECK_CDP: String(9333 + index), LC_CHECK_HTTP: String(8765 + index) } });
  if (result.status) failed += 1;
}
console.log(failed ? `\n${failed} scenario(s) failed` : '\nAll scenarios passed');
process.exit(failed ? 1 : 0);
