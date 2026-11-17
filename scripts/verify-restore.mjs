// Check that a source backup ZIP can really be restored and built.
//   npm run restore:verify -- <backup.zip> [--dest <empty folder>] [--keep] [--offline] [--skip-install]
//                                          [--reuse-node-modules]
// Steps: extract into an empty folder (default: a temp folder) → check every file against the
// SHA-256 list in _backup_info/manifest.json → `npm ci` (lockfile) → build → compare.
// `npm ci` needs the npm registry or a filled npm cache. On a PC without either, use
// --reuse-node-modules: the dev folder's node_modules is linked instead (checks extraction and the
// build, NOT that the lockfile installs). --skip-install alone only works if the destination
// already has node_modules.
// The original dev folder and the ZIP are only read.
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, lstatSync } from 'node:fs';
import { join, resolve, dirname, isAbsolute, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readZip } from './lib/zip.mjs';
import { embeddedBuildInfo } from './lib/source-hash.mjs';
import { ROOT } from './lib/config.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const zipPath = args.find((a, i) => !a.startsWith('--') && !['--dest'].includes(args[i - 1]));
const keep = args.includes('--keep') || !!opt('--dest');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

let linkedModules = null; // node_modules link made by --reuse-node-modules (removed on every exit)
function unlinkModules() {
  if (!linkedModules) return;
  try { if (lstatSync(linkedModules).isSymbolicLink()) unlinkSync(linkedModules); } catch { /* not there */ }
  linkedModules = null;
}
function fail(msg) { unlinkModules(); console.error(`\n[復元確認 NG] ${msg}`); process.exit(1); }
if (!zipPath) fail('使い方: npm run restore:verify -- <backup.zip> [--dest <空のフォルダー>] [--keep] [--offline]');

let dest = opt('--dest');
if (dest) {
  dest = resolve(dest);
  if (existsSync(dest) && readdirSync(dest).length) fail(`展開先が空ではありません: ${dest}`);
  mkdirSync(dest, { recursive: true });
} else {
  dest = mkdtempSync(join(tmpdir(), 'mtm-restore-'));
}
console.log(`ZIP   : ${resolve(zipPath)}`);
console.log(`展開先: ${dest}`);

let entries;
try { entries = readZip(resolve(zipPath)); } catch (e) { fail(`ZIP を読めません: ${e.message}`); }

for (const e of entries) {
  const n = normalize(e.name);
  if (isAbsolute(n) || n.startsWith('..') || e.name.includes('..' + '/') || /^[A-Za-z]:/.test(e.name)) fail(`不正なパス: ${e.name}`);
  const out = join(dest, n);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, e.data, { flag: 'wx' });
}
console.log(`展開  : ${entries.length} ファイル`);

const manifestPath = join(dest, '_backup_info', 'manifest.json');
if (!existsSync(manifestPath)) fail('_backup_info/manifest.json がありません（このツールで作った ZIP ではない？）');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
for (const f of manifest.files) {
  const p = join(dest, f.path);
  if (!existsSync(p)) fail(`ファイルがありません: ${f.path}`);
  if (sha256(readFileSync(p)) !== f.sha256) fail(`SHA-256 が一致しません: ${f.path}`);
}
console.log(`検証  : manifest の ${manifest.files.length} ファイルの SHA-256 一致`);

const isWin = process.platform === 'win32';
// npm is npm.cmd on Windows and needs a shell; Node itself must NOT go through a shell
// (C:\Program Files\nodejs\node.exe contains a space and would be split).
const run = (cmd, a, viaShell = false) => spawnSync(cmd, a, { cwd: dest, encoding: 'utf8', shell: viaShell, env: { ...process.env, MTM_CONFIG: join(dest, '__no_config__.json') } });

const reuse = args.includes('--reuse-node-modules');
const linked = join(dest, 'node_modules');
if (reuse) {
  const src = join(ROOT, 'node_modules');
  if (!existsSync(src)) fail(`--reuse-node-modules: 開発フォルダーに node_modules がありません（${src}）。先に開発フォルダーで npm ci を実行してください。`);
  if (existsSync(linked)) fail('--reuse-node-modules: 展開先に node_modules が既にあります');
  // A directory junction on Windows (no administrator right needed), a symlink elsewhere.
  // Only the link itself is removed later (unlinkModules), never what it points to.
  try { symlinkSync(src, linked, isWin ? 'junction' : 'dir'); linkedModules = linked; } catch (e) { fail(`node_modules をリンクできません: ${e.message}`); }
  console.log('依存  : 開発フォルダーの node_modules を使用（npm ci は実行しません。ロックファイルからのインストールは未確認）');
} else if (!args.includes('--skip-install')) {
  const ciArgs = ['ci', '--no-audit', '--no-fund', args.includes('--offline') ? '--offline' : '--prefer-offline'];
  console.log(`実行  : npm ${ciArgs.join(' ')}`);
  const r = run(isWin ? 'npm.cmd' : 'npm', ciArgs, isWin);
  if (r.status !== 0) fail(`npm ci に失敗しました（ネットワーク / npm キャッシュを確認）:\n${(r.stdout + r.stderr).trim().split('\n').slice(-15).join('\n')}`);
}

console.log('実行  : node build.mjs --out task-manager.restore-check.html');
const b = run(process.execPath, ['build.mjs', '--out', 'task-manager.restore-check.html']);
if (b.status !== 0) {
  fail(`ビルドに失敗しました（バックアップ時点で作業途中だった可能性: ビルド確認=${manifest.build && manifest.build.check && manifest.build.check.run ? (manifest.build.check.ok ? '成功' : '失敗') : '未実施'}）:\n${(b.stdout + b.stderr).trim().split('\n').slice(-10).join('\n')}`);
}
const built = embeddedBuildInfo(readFileSync(join(dest, 'task-manager.restore-check.html'), 'utf8'));
console.log(`ビルド: 成功（source ${built.sourceHash}）`);
if (manifest.build && built.sourceHash !== manifest.build.currentSourceHash) {
  fail(`ビルド結果のソースハッシュ (${built.sourceHash}) がバックアップ時 (${manifest.build.currentSourceHash}) と一致しません`);
}
if (existsSync(join(dest, 'task-manager.html'))) {
  const shipped = embeddedBuildInfo(readFileSync(join(dest, 'task-manager.html'), 'utf8'));
  const same = shipped && shipped.sourceHash === built.sourceHash;
  console.log(`同梱HTML: source ${shipped ? shipped.sourceHash : 'なし'}（${same ? 'ソースと一致' : 'ソースと不一致 — 復元後は npm run build を実行'}）`);
}

unlinkModules();
if (!keep) rmSync(dest, { recursive: true, force: true });
console.log(`\n[復元確認 OK] ZIP から展開 → ${reuse ? '（開発フォルダーの依存を使って）' : '依存の再インストール → '}ビルドまで成功しました。${keep ? `\n展開先を残しています: ${dest}` : ''}`);
