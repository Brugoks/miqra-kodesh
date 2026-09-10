// Upload only the SiliconFlow settings from ignored .env.local. Never print keys
// or pass secret values in process arguments. CLI output is suppressed in case
// an upstream error echoes request data.
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';

const root = new URL('../', import.meta.url);
const env = parseEnv(await readFile(new URL('.env.local', root), 'utf8'));
const key = env.SILICONFLOW_API_KEY?.trim();
if (!key) {
  console.error('Paste your SiliconFlow key into SILICONFLOW_API_KEY in .env.local, then rerun this command.');
  process.exit(1);
}
const selected = { SILICONFLOW_API_KEY: key };
for (const name of ['SILICONFLOW_BASE_URL', 'SILICONFLOW_CANVAS_MODEL']) {
  if (env[name]?.trim()) selected[name] = env[name].trim();
}
if (Object.values(selected).some((value) => /[\r\n"\\]/.test(value))) throw new Error('A SiliconFlow setting has invalid characters.');
const directory = await mkdtemp(join(tmpdir(), 'miqra-canvas-secrets-'));
try {
  const target = join(directory, '.env');
  await writeFile(target, Object.entries(selected).map(([name, value]) => `${name}="${value}"`).join('\n'), { mode: 0o600 });
  const result = spawnSync('npx', ['supabase', 'secrets', 'set', '--env-file', target], { cwd: root, stdio: 'pipe' });
  if (result.status !== 0) {
    console.error('Could not update Supabase secrets. Check the CLI login and linked project; no secret values were logged.');
    process.exitCode = 1;
  } else console.log('SiliconFlow settings saved to the linked Supabase project.');
} finally { await rm(directory, { recursive: true, force: true }); }
