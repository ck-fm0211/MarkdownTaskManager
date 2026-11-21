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
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, symlinkSync, unlinkSync, lstatSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, resolve, dirname, isAbsolute, normalize } from 'node:path';
import { tmpdir, constants } from 'node:os';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
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
// Ends the check with NG. A signal that arrived during the synchronous work before (extracting, hashing,
// the checks after the build) is handled first, so the exit code is then 128 + the signal number as on
// every other interruption (checkpoint). Always called as `await fail(…)`.
async function fail(msg) {
  unlinkModules();
  console.error(`\n[復元確認 NG] ${msg}`);
  await checkpoint();
  process.exit(1);
}
// npm ci / the build run asynchronously (runStep): while one runs, the event loop is free, so a
// signal sent to this script alone (kill <pid>, Ctrl+C, a closed console window) is handled at once:
// the running step is stopped, the link is removed and the exit code is 128 + the signal number.
// (With spawnSync the handler could only run after the step had ended, and the check went on.)
// The "exit" event also follows an uncaught exception: the link is removed then too.
// A step that does not end on SIGTERM (it ignores the signal, or hangs) is killed with SIGKILL after
// STOP_GRACE_MS (POSIX; taskkill /F on Windows is already forced); if even that does not end it, its
// process id is printed so that the user can end it (it would otherwise go on running, and writing
// into the restore folder, after this script has ended).
const STOP_GRACE_MS = 3000;
let currentStep = null; // set while a step runs; cleared only when it has really ended (runStep)
const running = (child) => !!child && child.exitCode === null && child.signalCode === null;
// Stop the running step: SIGTERM (force: SIGKILL). → the step (or null when none is running).
function stopStep(force = false) {
  const child = currentStep;
  if (!running(child)) return null;
  try {
    // npm.cmd runs through cmd.exe on Windows: stop the whole tree, not only the shell.
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill(force ? 'SIGKILL' : 'SIGTERM');
  } catch { /* already gone */ }
  return child;
}
// → true when the step has ended within `ms`.
const endedWithin = (child, ms) => new Promise((res) => {
  if (!running(child)) { res(true); return; }
  const timer = setTimeout(() => res(!running(child)), ms);
  child.once('exit', () => { clearTimeout(timer); res(true); });
});
// The process is ending: nothing can be waited for any more, so a running step is killed at once.
process.on('exit', () => { stopStep(true); unlinkModules(); });
let interrupted = false;
let interruption = null; // the running signal handler (it ends the process)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  try {
    process.on(sig, () => {
      if (interrupted) return;
      interrupted = true;
      interruption = (async () => {
        const child = stopStep();
        unlinkModules();
        console.error(`\n[復元確認 NG] 中断されました（${sig}）`);
        // Wait until the stopped step has really ended, so that it is not left behind.
        if (child && !(await endedWithin(child, STOP_GRACE_MS))) {
          stopStep(true);
          if (!(await endedWithin(child, 2000))) {
            console.error(`[注意] 実行中だった処理（PID ${child.pid}）が終了しません（強制終了も効きません）。タスクマネージャー（Windows）や ps（POSIX）でその処理の状態を確認し、終了できなければ PC を再起動してください。`);
          }
        }
        process.exit(128 + ((constants.signals && constants.signals[sig]) || 0));
      })();
    });
  } catch { /* signal not available on this OS */ }
}
// A signal that arrives while this script runs synchronous code (extracting, hashing, the checks after
// the build) is handled only when the event loop runs again. Before the next step, after the build
// and right before "OK", the event loop gets that chance here; after a signal the script never goes
// on (the handler above ends it with 128 + the signal number), so "OK" is never printed then.
async function checkpoint() {
  await new Promise((r) => setImmediate(r));
  if (interrupted) await interruption;
}
if (!zipPath) await fail('使い方: npm run restore:verify -- <backup.zip> [--dest <空のフォルダー>] [--keep] [--offline]');

let dest = opt('--dest');
if (dest) {
  dest = resolve(dest);
  if (existsSync(dest) && readdirSync(dest).length) await fail(`展開先が空ではありません: ${dest}`);
  mkdirSync(dest, { recursive: true });
} else {
  dest = mkdtempSync(join(tmpdir(), 'mtm-restore-'));
}
console.log(`ZIP   : ${resolve(zipPath)}`);
console.log(`展開先: ${dest}`);

let entries;
try { entries = readZip(resolve(zipPath)); } catch (e) { await fail(`ZIP を読めません: ${e.message}`); }

for (const e of entries) {
  const n = normalize(e.name);
  if (isAbsolute(n) || n.startsWith('..') || e.name.includes('..' + '/') || /^[A-Za-z]:/.test(e.name)) await fail(`不正なパス: ${e.name}`);
  const out = join(dest, n);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, e.data, { flag: 'wx' });
}
console.log(`展開  : ${entries.length} ファイル`);

const manifestPath = join(dest, '_backup_info', 'manifest.json');
if (!existsSync(manifestPath)) await fail('_backup_info/manifest.json がありません（このツールで作った ZIP ではない？）');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
for (const f of manifest.files) {
  const p = join(dest, f.path);
  if (!existsSync(p)) await fail(`ファイルがありません: ${f.path}`);
  if (sha256(readFileSync(p)) !== f.sha256) await fail(`SHA-256 が一致しません: ${f.path}`);
}
console.log(`検証  : manifest の ${manifest.files.length} ファイルの SHA-256 一致`);

const isWin = process.platform === 'win32';
// npm is npm.cmd on Windows and needs a shell; Node itself must NOT go through a shell
// (C:\Program Files\nodejs\node.exe contains a space and would be split).
// → { status, output }: output = the END of stdout + stderr (at most OUTPUT_TAIL characters; only
// the last lines are shown on failure). The streams are decoded as UTF-8 text (setEncoding: a
// character split between two chunks stays one character, no U+FFFD), and an endless or huge output
// cannot fill the memory (spawnSync used to cut it at 1 MB; the asynchronous step had no limit).
const OUTPUT_TAIL = 64 * 1024;
function tailOf(text) {
  let t = text.length > OUTPUT_TAIL ? text.slice(-OUTPUT_TAIL) : text;
  if (/^[\uDC00-\uDFFF]/.test(t)) t = t.slice(1); // never start with half of a surrogate pair
  return t;
}
// The end of a step's output for a failure message: the last `n` lines, at most 4000 characters
// (the end is kept). The message is written right before process.exit(): a long one could be cut
// off on a pipe.
function lastLines(text, n) {
  const t = text.trim().split('\n').slice(-n).join('\n');
  return t.length > 4000 ? `…${tailOf(t.slice(-4000))}` : t;
}
function runStep(cmd, a, viaShell = false) {
  return new Promise((res) => {
    let output = '';
    let child;
    try {
      child = spawn(cmd, a, { cwd: dest, shell: viaShell, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MTM_CONFIG: join(dest, '__no_config__.json') } });
    } catch (e) { res({ status: null, output: e.message }); return; }
    currentStep = child;
    const collect = (d) => { output += d; if (output.length > OUTPUT_TAIL) output = tailOf(output); };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (e) => { if (currentStep === child) currentStep = null; if (!interrupted) res({ status: null, output: tailOf(output + e.message) }); });
    child.on('close', (code) => {
      if (currentStep === child) currentStep = null;
      if (!interrupted) res({ status: code, output: tailOf(output) }); // interrupted: the signal handler ends the process
    });
  });
}

const reuse = args.includes('--reuse-node-modules');
const linked = join(dest, 'node_modules');
if (reuse) {
  const src = join(ROOT, 'node_modules');
  if (!existsSync(src)) await fail(`--reuse-node-modules: 開発フォルダーに node_modules がありません（${src}）。先に開発フォルダーで npm ci を実行してください。`);
  if (existsSync(linked)) await fail('--reuse-node-modules: 展開先に node_modules が既にあります');
  // A directory junction on Windows (no administrator right needed), a symlink elsewhere.
  // Only the link itself is removed later (unlinkModules), never what it points to.
  try { symlinkSync(src, linked, isWin ? 'junction' : 'dir'); linkedModules = linked; } catch (e) { await fail(`node_modules をリンクできません: ${e.message}`); }
  console.log('依存  : 開発フォルダーの node_modules を使用（npm ci は実行しません。ロックファイルからのインストールは未確認）');
} else if (!args.includes('--skip-install')) {
  const ciArgs = ['ci', '--no-audit', '--no-fund', args.includes('--offline') ? '--offline' : '--prefer-offline'];
  await checkpoint();
  console.log(`実行  : npm ${ciArgs.join(' ')}`);
  const r = await runStep(isWin ? 'npm.cmd' : 'npm', ciArgs, isWin);
  if (r.status !== 0) await fail(`npm ci に失敗しました（ネットワーク / npm キャッシュを確認）:\n${lastLines(r.output, 15)}`);
}

await checkpoint();
console.log('実行  : node build.mjs --out task-manager.restore-check.html');
const b = await runStep(process.execPath, ['build.mjs', '--out', 'task-manager.restore-check.html']);
await checkpoint();
if (b.status !== 0) {
  await fail(`ビルドに失敗しました（バックアップ時点で作業途中だった可能性: ビルド確認=${manifest.build && manifest.build.check && manifest.build.check.run ? (manifest.build.check.ok ? '成功' : '失敗') : '未実施'}）:\n${lastLines(b.output, 10)}`);
}
const builtPath = join(dest, 'task-manager.restore-check.html');
if (!existsSync(builtPath)) await fail('ビルドは終了しましたが、出力ファイル（task-manager.restore-check.html）がありません（build.mjs が作業途中の可能性）');
const built = embeddedBuildInfo(readFileSync(builtPath, 'utf8'));
if (!built) await fail('ビルドの出力にビルド情報（mtm-build）がありません（build.mjs が作業途中の可能性）');
console.log(`ビルド: 成功（source ${built.sourceHash}）`);
if (manifest.build && built.sourceHash !== manifest.build.currentSourceHash) {
  await fail(`ビルド結果のソースハッシュ (${built.sourceHash}) がバックアップ時 (${manifest.build.currentSourceHash}) と一致しません`);
}
if (existsSync(join(dest, 'task-manager.html'))) {
  const shipped = embeddedBuildInfo(readFileSync(join(dest, 'task-manager.html'), 'utf8'));
  const same = shipped && shipped.sourceHash === built.sourceHash;
  console.log(`同梱HTML: source ${shipped ? shipped.sourceHash : 'なし'}（${same ? 'ソースと一致' : 'ソースと不一致 — 復元後は npm run build を実行'}）`);
}

unlinkModules();
// Asynchronous: removing an installed node_modules takes a while, and a signal during it must still
// be handled (rmSync blocked the event loop, and the check ended "OK" with exit code 0). A signal
// during the removal ends the script at once; the rest of the temporary folder may stay then.
if (!keep) await rm(dest, { recursive: true, force: true });
await checkpoint();
console.log(`\n[復元確認 OK] ZIP から展開 → ${reuse ? '（開発フォルダーの依存を使って）' : '依存の再インストール → '}ビルドまで成功しました。${keep ? `\n展開先を残しています: ${dest}` : ''}`);
