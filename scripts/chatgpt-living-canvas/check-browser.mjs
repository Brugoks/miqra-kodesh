import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';
const dir = mkdtempSync(join(tmpdir(), 'miqra-canvas-browser-'));
try {
  process.env.CANVAS_TEST_BROWSER_OUT = dir;
  await build({ configFile: fileURLToPath(new URL('./vite.config.mjs', import.meta.url)), logLevel: 'warn' });
  const result = spawnSync('node', [fileURLToPath(new URL('./browser-worker.mjs', import.meta.url))], { stdio: 'inherit', env: { ...process.env, LC_CHECK_OUT: dir, LC_CHECK_CDP: '9438', LC_CHECK_HTTP: '8878' } });
  if (result.status) process.exitCode = 1;
} finally { rmSync(dir, { recursive: true, force: true }); }
