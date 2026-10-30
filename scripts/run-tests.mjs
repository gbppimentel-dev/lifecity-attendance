import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = new URL('./', import.meta.url);
const suites = readdirSync(scriptsDirectory)
  .filter((file) => /^test-.*\.mjs$/.test(file) && file !== 'test-demo-reset.mjs')
  .sort()
  .map((file) => fileURLToPath(new URL(file, scriptsDirectory)));

const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...suites], {
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
