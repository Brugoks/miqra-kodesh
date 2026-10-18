// Re-checks what jsdom cannot: real layout, hit-testing, pointer, wheel and touch input, contrast, and frame times,
// by driving the real Living Canvas page in headless Chrome. It asserts on geometry; it takes no screenshots.
//
//   node scripts/living-canvas-browser-check/run.mjs            # all scenarios
//   node scripts/living-canvas-browser-check/run.mjs mobile     # one: desktop | desktop-more | window | auto | mobile | fullscreen | fullscreen-iphone | perf
//
// Needs Google Chrome (set CHROME_PATH if it is not the macOS default) and python3. Nothing is sent anywhere: the
// harness has no Supabase credentials, so the page saves to the headless profile's localStorage.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'lc-harness-'));
process.env.LC_CHECK_OUT = out;
await build({ configFile: join(here, 'vite.config.mjs'), logLevel: 'warn' });

// 'fullscreen-iphone' repeats 'fullscreen' without the Fullscreen API, which iPhone Safari does not have on elements.
const all = ['desktop', 'desktop-more', 'window', 'auto', 'mobile', 'fullscreen', 'fullscreen-iphone', 'perf'];
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : all;
let failed = 0;
for (const [index, name] of wanted.entries()) {
  console.log(`\n── ${name} ──`);
  const iphone = name === 'fullscreen-iphone';
  const result = spawnSync('node', [join(here, `${iphone ? 'fullscreen' : name}.mjs`)], { stdio: 'inherit', env: { ...process.env, LC_CHECK_CDP: String(9333 + index), LC_CHECK_HTTP: String(8765 + index), ...(iphone ? { LC_NO_NATIVE_FULLSCREEN: '1' } : {}) } });
  if (result.status) failed += 1;
}
rmSync(out, { recursive: true, force: true });
console.log(failed ? `\n${failed} scenario(s) failed` : '\nAll scenarios passed');
process.exit(failed ? 1 : 0);
