// Test runner (no glob support needed, works on Windows/Node 18+).
//   npm test            -> unit + script tests + browser (e2e) tests
//   npm run test:unit   -> unit + script tests only (no browser needed)
//   npm run test:e2e    -> browser tests only (needs Edge/Chrome or Playwright's Chromium)
// The browser tests run against the BUILT task-manager.html: run `npm run build` first.
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const which = process.argv[2] || 'all';
const groups = { unit: ['tests/unit', 'tests/scripts'], e2e: ['tests/e2e'], all: ['tests/unit', 'tests/scripts', 'tests/e2e'] }[which];
if (!groups) { console.error(`unknown group: ${which}`); process.exit(2); }
const files = groups.flatMap((d) => (existsSync(join(root, d)) ? readdirSync(join(root, d)).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => join(d, f)) : []));
if (groups.includes('tests/e2e') && !existsSync(join(root, 'task-manager.html'))) {
  console.error('task-manager.html がありません。先に npm run build を実行してください。');
  process.exit(1);
}
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
