// Deploy the built task-manager.html to the operations app folder (B). Copies ONE file.
//   npm run deploy            配備（既存 HTML を日時付きで退避してから置き換え）
//   npm run deploy:dry        何をするかだけ表示（何も書き込まない）
//   npm run build-deploy      ビルドが成功したときだけ配備
// Options: --dry-run  --allow-stale (sources newer than the HTML)  --allow-data-dir
//
// Guarantees:
//  * Only <appDir>/task-manager.html is replaced. No folder mirroring, nothing else is created
//    in appDir except a short-lived temp file that is renamed onto task-manager.html.
//  * Task data (kanban.md, archive.md, ...) is never read for writing, changed or deleted.
//  * Refuses an HTML that was not built from the current sources (a failed build leaves the old
//    HTML in place → its hash no longer matches → no deploy).
//  * The previous task-manager.html is copied to the backup folder and verified BEFORE it is
//    replaced; if that fails nothing is deployed.
//  * Success is printed only after the deployed file was read back and matches byte for byte.
import { existsSync, statSync, readFileSync, copyFileSync, renameSync, rmSync, mkdirSync, appendFileSync, constants } from 'node:fs';
import { join, basename } from 'node:path';
import { loadConfig, ROOT, howToConfigure, samePath, isInside, timestamp } from './lib/config.mjs';
import { computeSourceHash, embeddedBuildInfo } from './lib/source-hash.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const allowStale = args.includes('--allow-stale');
const allowDataDir = args.includes('--allow-data-dir');
const HTML = 'task-manager.html';

function fail(msg, code = 1) {
  console.error(`\n[配備中止] ${msg}`);
  console.error('運用アプリフォルダは変更していません。');
  process.exit(code);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, label) {
  const waits = [0, 200, 600, 1500];
  let last;
  for (const w of waits) {
    if (w) await sleep(w);
    try { return fn(); } catch (e) { last = e; if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) break; }
  }
  throw new Error(`${label}: ${last && last.message}`);
}

let cfg;
try { cfg = loadConfig(); } catch (e) { fail(e.message, 2); }
if (!cfg.appDir) fail(howToConfigure('appDir'), 2);

const source = join(ROOT, HTML);
const target = join(cfg.appDir, HTML);

console.log(`配備元: ${source}`);
console.log(`配備先: ${target}`);
console.log(`対象  : ${HTML} の 1 ファイルのみ（フォルダー同期・他ファイルの変更は行いません）`);
if (dryRun) console.log('モード: dry-run（何も書き込みません）');

// 1. Source must exist and match the current sources.
if (!existsSync(source)) fail(`${HTML} がありません。先に npm run build を実行してください。`);
const srcBuf = readFileSync(source);
const info = embeddedBuildInfo(srcBuf.toString('utf8'));
const currentHash = computeSourceHash(ROOT);
if (!info) fail(`${HTML} にビルド情報がありません（npm run build で作り直してください）。`);
if (info.sourceHash !== currentHash) {
  const msg = `${HTML} は現在のソースからビルドされていません（HTML: ${info.sourceHash} / ソース: ${currentHash}）。ビルドが失敗したか未実行です。`;
  if (!allowStale) fail(`${msg}\nnpm run build を成功させてから配備してください（強制する場合のみ --allow-stale）。`);
  console.warn(`[警告] ${msg}（--allow-stale 指定のため続行）`);
}
console.log(`版    : ${info.version} / source ${info.sourceHash}`);

// 2. Target folder checks.
if (!existsSync(cfg.appDir) || !statSync(cfg.appDir).isDirectory()) {
  fail(`配備先フォルダーがありません: ${cfg.appDir}\nフォルダーを作成するか、設定（npm run config:check）を確認してください。`);
}
if (samePath(cfg.appDir, ROOT) || isInside(cfg.appDir, ROOT)) fail('配備先が開発フォルダー内です。運用アプリフォルダー（B）を指定してください。');
if (cfg.dataDir && samePath(cfg.appDir, cfg.dataDir)) fail('appDir と dataDir が同じです。運用アプリ（B）と運用データ（C）は別フォルダーにしてください。');
const dataInApp = ['kanban.md', 'archive.md'].filter((f) => existsSync(join(cfg.appDir, f)));
if (dataInApp.length && !allowDataDir) {
  fail(`配備先に運用データ（${dataInApp.join(', ')}）があります。運用アプリ（B）と運用データ（C）を分けてください。\n（このまま配備する場合は --allow-data-dir。データファイルには触れません）`);
}

// 3. Backup location for the previous HTML.
const htmlBackupDir = cfg.backupDir ? join(cfg.backupDir, 'html') : join(cfg.appDir, 'previous-html');
if (!cfg.backupDir) console.warn(`[注意] backupDir が未設定のため、旧 HTML は ${htmlBackupDir} に退避します。`);

let backupPath = null;
const targetExists = existsSync(target);
if (targetExists) {
  const old = readFileSync(target);
  if (Buffer.compare(old, srcBuf) === 0) {
    console.log('\n[変更なし] 配備先は既に同じ内容です。何も変更していません。');
    process.exit(0);
  }
  const oldInfo = embeddedBuildInfo(old.toString('utf8'));
  const base = `task-manager.${timestamp()}${oldInfo ? '.' + oldInfo.sourceHash : ''}`;
  backupPath = join(htmlBackupDir, `${base}.html`);
  for (let n = 2; existsSync(backupPath); n++) backupPath = join(htmlBackupDir, `${base}-${n}.html`);
  console.log(`退避先: ${backupPath}`);
} else {
  console.log('退避  : 配備先に既存の HTML はありません（初回配備）');
}

if (dryRun) {
  console.log('\n[dry-run] 確認のみ完了。実行するには npm run deploy');
  process.exit(0);
}

// 4. Backup previous HTML (verified) — abort on any failure.
if (backupPath) {
  try {
    mkdirSync(htmlBackupDir, { recursive: true });
    copyFileSync(target, backupPath, constants.COPYFILE_EXCL);
    if (Buffer.compare(readFileSync(backupPath), readFileSync(target)) !== 0) throw new Error('退避ファイルの内容が一致しません');
  } catch (e) {
    fail(`旧 HTML の退避に失敗しました: ${e.message}`);
  }
}

// 5. Copy to a temp file next to the target, verify, then rename onto the target.
const tmp = join(cfg.appDir, `.${HTML}.deploying-${process.pid}`);
try {
  copyFileSync(source, tmp, constants.COPYFILE_EXCL);
  if (Buffer.compare(readFileSync(tmp), srcBuf) !== 0) throw new Error('一時ファイルの内容が一致しません');
  await withRetry(() => renameSync(tmp, target), '置き換え');
  if (Buffer.compare(readFileSync(target), srcBuf) !== 0) throw new Error('配備後の内容が一致しません');
} catch (e) {
  try { rmSync(tmp, { force: true }); } catch { /* ignore */ }
  console.error(`\n[配備失敗] ${e.message}`);
  if (backupPath) console.error(`旧 HTML は ${backupPath} に退避済みです。配備先が壊れている場合はこれを ${HTML} として戻してください。`);
  process.exit(1);
}

// 6. Log (best effort).
if (cfg.backupDir) {
  try {
    mkdirSync(cfg.backupDir, { recursive: true });
    appendFileSync(join(cfg.backupDir, 'deploy-log.jsonl'), JSON.stringify({
      at: new Date().toISOString(), version: info.version, sourceHash: info.sourceHash,
      target: basename(cfg.appDir) + '/' + HTML, previousBackup: backupPath ? basename(backupPath) : null,
    }) + '\n');
  } catch (e) { console.warn(`[注意] 配備ログを書けませんでした: ${e.message}`); }
}

console.log(`\n[配備完了] ${target}（${info.version} / source ${info.sourceHash}）`);
console.log('※ OneDrive フォルダーへのローカル保存が完了した状態です。クラウドへの同期完了は OneDrive のアイコンで確認してください。');
console.log('※ ブラウザーで開いている場合は再読み込み（F5）すると新しい版になります。');
