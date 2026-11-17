// Source backup ZIP (local, kept in the backup folder D) and release ZIP (public).
//   npm run backup                     作業途中でも可。日時付き ZIP を backupDir/source に作成
//   npm run backup -- --label 作業前    ファイル名にラベルを付ける
//   npm run backup -- --check-build    一時フォルダーへ試しにビルドし、結果を記録（失敗しても ZIP は作る）
//   npm run backup -- --include-git    .git（履歴）も含める
//   npm run backup -- --no-local-config  local.config.json（個別 PC 設定）を含めない
//   npm run release -- --allow-dirty     未コミットの変更があっても公開用 ZIP を作る（通常は拒否）
//   npm run backup:dry                 対象ファイルの一覧と除外理由だけ表示
//   npm run release                    公開用 ZIP（dist/）。依存・実データ・個別設定・秘密情報なし
//   --out <dir>                        出力先を指定
//
// A backup contains every file needed to restore and rebuild (sources, build, lockfile, built
// HTML, docs, LICENSE, tests, AI instructions/skills, scripts) and leaves out what can be
// regenerated (node_modules, caches, logs), earlier backups and anything that looks secret.
// The ZIP is written as *.partial, read back and checked entry by entry, and only then renamed;
// a failed run never leaves a file that looks like a valid backup. Sources are never modified.
import { readdirSync, lstatSync, readFileSync, existsSync, mkdirSync, renameSync, rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, basename, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { loadConfig, ROOT, isInside, samePath, timestamp } from './lib/config.mjs';
import { computeSourceHash, embeddedBuildInfo } from './lib/source-hash.mjs';
import { writeZip, readZip } from './lib/zip.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const release = args.includes('--release');
const dryRun = args.includes('--dry-run');
const includeGit = args.includes('--include-git') && !release;
const includeLocal = !args.includes('--no-local-config') && !release;
const allowDirty = args.includes('--allow-dirty');
const checkBuild = args.includes('--check-build');
const label = (opt('--label') || '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
const root = resolve(opt('--root') || ROOT);

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const posix = (p) => p.split(sep).join('/');

function fail(msg) {
  console.error(`\n[バックアップ失敗] ${msg}`);
  process.exit(1);
}

let cfg;
try { cfg = loadConfig({ root }); } catch (e) { fail(e.message); }
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const fork = existsSync(join(root, 'FORK_INFO.json')) ? JSON.parse(readFileSync(join(root, 'FORK_INFO.json'), 'utf8')) : null;

// Output folder
let outDir = opt('--out');
if (!outDir) {
  if (release) outDir = join(root, 'dist');
  else if (cfg.backupDir) outDir = join(cfg.backupDir, 'source');
  else {
    outDir = join(root, 'backups');
    console.warn(`[注意] backupDir が未設定のため ${outDir} に出力します（開発フォルダー内 = OneDrive で同期されません）。`);
  }
}
outDir = resolve(outDir);

// ----- file selection -----
// Reserved: the metadata folder this script adds to every ZIP (a restored copy must not pack the
// old one again).
const RESERVED_ROOT_DIRS = new Set(['_backup_info']);
const EXCLUDED_DIRS = new Set(['node_modules', '.cache', 'coverage', 'test-results', 'playwright-report', '.playwright-mcp', 'tmp', '.tmp', 'backups', 'dist', '.npm', '.vscode-test']);
const JUNK = [/\.log$/i, /\.tmp$/i, /\.partial$/i, /\.zip$/i, /^\.DS_Store$/, /^Thumbs\.db$/i, /^desktop\.ini$/i, /\.tmp-\d+$/, /^\.task-manager\.html\.deploying-/, /^npm-debug/, /~$/, /\.swp$/];
const SECRET = [/^\.env$/i, /^\.env\.(?!example$|sample$)/i, /\.pem$/i, /\.key$/i, /\.pfx$/i, /\.p12$/i, /^id_(rsa|dsa|ecdsa|ed25519)/i, /^\.npmrc$/i, /^\.netrc$/i, /secret/i, /^credentials?(\..*)?$/i, /\.kdbx$/i, /^\.git-credentials$/i];
// Per-PC configuration kept in LOCAL backups (paths only, no secrets). Never in a release.
const LOCAL_CONFIG = ['local.config.json'];
// Per-PC tool settings that may contain tokens in allowed commands: never packed.
const NEVER = [posix(join('.claude', 'settings.local.json'))];
const skipped = { junk: [], secret: [], symlink: [], dir: [], local: [], data: [], untracked: [], reserved: [] };

// Data folder or backup folder inside the dev folder must never be packed.
const protectedDirs = [cfg.dataDir, cfg.backupDir, cfg.appDir, outDir].filter((d) => d && isInside(d, root) && !samePath(d, root));

function walk(dir, out) {
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const rel = posix(relative(root, abs));
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) { skipped.symlink.push(rel); continue; }
    // ".git" is a folder in a normal checkout and a FILE ("gitdir: /abs/path") in a worktree:
    // excluded in both cases unless the history is requested (a worktree pointer is never useful).
    if (name === '.git' && (!includeGit || !st.isDirectory())) { skipped.dir.push(rel + (st.isDirectory() ? '/' : '')); continue; }
    if (st.isDirectory()) {
      if (dir === root && RESERVED_ROOT_DIRS.has(name)) { skipped.reserved.push(rel + '/'); continue; }
      if (EXCLUDED_DIRS.has(name)) { skipped.dir.push(rel + '/'); continue; }
      if (protectedDirs.some((d) => samePath(d, abs))) { skipped.data.push(rel + '/'); continue; }
      walk(abs, out);
      continue;
    }
    if (!st.isFile()) continue;
    if (NEVER.includes(rel)) { skipped.secret.push(rel); continue; }
    if (!rel.startsWith('.git/')) {
      if (LOCAL_CONFIG.includes(rel) && !includeLocal) { skipped.local.push(rel); continue; }
      if (JUNK.some((r) => r.test(name))) { skipped.junk.push(rel); continue; }
      if (SECRET.some((r) => r.test(name)) && !LOCAL_CONFIG.includes(rel)) { skipped.secret.push(rel); continue; }
    }
    out.push({ rel, abs, mtime: st.mtime });
  }
  return out;
}

function git(...a) {
  const r = spawnSync('git', a, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}
const hasGit = existsSync(join(root, '.git')) && git('rev-parse', '--is-inside-work-tree') === 'true';

let files = walk(root, []);
if (release && hasGit) {
  // Public package: only files tracked by Git (an untracked local file can never leak).
  const tracked = new Set((git('ls-files', '-z') || '').split('\0').filter(Boolean));
  files = files.filter((f) => { if (tracked.has(f.rel)) return true; skipped.untracked.push(f.rel); return false; });
}

// ----- version / state information -----
const gitInfo = hasGit ? {
  available: true,
  branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
  head: git('rev-parse', 'HEAD'),
  headDate: git('log', '-1', '--format=%cI'),
  headSubject: git('log', '-1', '--format=%s'),
  describe: git('describe', '--tags', '--always', '--dirty'),
  changes: (git('status', '--porcelain') || '').split('\n').filter(Boolean),
} : { available: false };
const dirty = gitInfo.available ? gitInfo.changes.length > 0 : null;
// A public package must contain exactly what is committed: uncommitted edits (e.g. a real path or
// a real task typed by mistake) would otherwise be published.
// Untracked files never go into a release (tracked files only), so only changes to TRACKED files count.
const trackedChanges = release && gitInfo.available ? (git('status', '--porcelain', '--untracked-files=no') || '').split('\n').filter(Boolean) : [];
if (release && trackedChanges.length && !allowDirty && !dryRun) {
  fail(`未コミットの変更があるため公開用 ZIP を作りません（${trackedChanges.length} 件）。コミットしてから実行してください（確認のうえ強制する場合のみ --allow-dirty）。\n${trackedChanges.slice(0, 10).join('\n')}`);
}
if (release && !gitInfo.available) console.warn('[注意] Git 情報がないため、公開用 ZIP は除外ルールだけで作成します。内容を確認してから配布してください。');

const currentHash = computeSourceHash(root);
const htmlPath = join(root, 'task-manager.html');
const htmlInfo = existsSync(htmlPath) ? embeddedBuildInfo(readFileSync(htmlPath, 'utf8')) : null;

let buildCheck = { run: false };
if (checkBuild && !dryRun) {
  const tmp = mkdtempSync(join(tmpdir(), 'mtm-buildcheck-'));
  const out = join(tmp, 'task-manager.html');
  const r = spawnSync(process.execPath, [join(root, 'build.mjs'), '--out', out], { cwd: root, encoding: 'utf8' });
  buildCheck = { run: true, ok: r.status === 0, output: (r.stdout + r.stderr).trim().split('\n').slice(-6).join('\n') };
  rmSync(tmp, { recursive: true, force: true });
}

function npmVersion() {
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['-v'], { encoding: 'utf8', shell: process.platform === 'win32' });
  return r.status === 0 ? r.stdout.trim() : null;
}

const now = new Date();
const stamp = timestamp(now);
const kind = release ? 'release' : 'src';
const baseName = release
  ? `${pkg.name}-${pkg.version}-${(gitInfo.head || 'nogit').slice(0, 7)}${dirty ? '-dirty' : ''}`
  : `${pkg.name}-src-${stamp}${label ? '-' + label : ''}${dirty ? '-dirty' : ''}`;

const manifest = {
  kind: release ? 'release-package' : 'source-backup',
  createdAt: now.toISOString(),
  createdAtLocal: now.toString(),
  project: { name: pkg.name, version: pkg.version, folder: basename(root) },
  fork,
  git: gitInfo.available ? { ...gitInfo, changes: gitInfo.changes.slice(0, 300) } : gitInfo,
  workInProgress: dirty,
  includesGitHistory: includeGit,
  includesLocalConfig: includeLocal && files.some((f) => LOCAL_CONFIG.includes(f.rel)),
  runtime: { node: process.version, npm: npmVersion(), platform: process.platform, engines: pkg.engines || null },
  build: {
    currentSourceHash: currentHash,
    htmlSourceHash: htmlInfo ? htmlInfo.sourceHash : null,
    htmlUpToDate: htmlInfo ? htmlInfo.sourceHash === currentHash : false,
    check: buildCheck,
  },
  excluded: Object.fromEntries(Object.entries(skipped).map(([k, v]) => [k, v.slice(0, 200)])),
  files: [],
};

if (dryRun) {
  console.log(`[dry-run] 種別: ${manifest.kind}`);
  console.log(`出力先: ${join(outDir, baseName + '.zip')}`);
  console.log(`含めるファイル (${files.length}):`);
  files.forEach((f) => console.log('  + ' + f.rel));
  for (const [k, v] of Object.entries(skipped)) if (v.length) console.log(`除外(${k}) ${v.length}: ${v.slice(0, 20).join(', ')}${v.length > 20 ? ' …' : ''}`);
  process.exit(0);
}

// ----- build the archive -----
const entries = [];
for (const f of files) {
  const data = readFileSync(f.abs);
  manifest.files.push({ path: f.rel, size: data.length, sha256: sha256(data) });
  entries.push({ name: f.rel, data, mtime: f.mtime });
}

const yesNo = (v) => (v === null ? '不明（Git 情報なし）' : v ? 'あり' : 'なし');
const readme = `# ${release ? 'リリースパッケージ' : 'ソースバックアップ'}: ${pkg.name} ${pkg.version}

- 作成日時: ${now.toString()}
- 種別: ${release ? '公開用（依存パッケージ・実データ・個別PC設定・秘密情報を含まない）' : 'ローカル保管用ソースバックアップ'}
- fork 元: ${fork ? `${fork.upstream.repository} の ${fork.upstream.tag || ''} ${fork.upstream.commit}` : '不明'}
- Git: ${gitInfo.available ? `${gitInfo.branch} @ ${gitInfo.head}（${gitInfo.describe}）` : '情報なし（Git 管理外のフォルダーから作成）'}
- 作業途中の変更（未コミット）: ${yesNo(dirty)}
- Git 履歴（.git）: ${includeGit ? '含む' : '含まない — このZIPはソースの復元用であり、Git 履歴は含みません'}
- 個別 PC 設定（local.config.json 等）: ${manifest.includesLocalConfig ? '含む（社外・公開リポジトリに置かないこと）' : '含まない'}
- 作成時の実行環境: Node.js ${process.version} / npm ${manifest.runtime.npm || '不明'} / ${process.platform}
- 想定する実行環境: Node.js ${(pkg.engines && pkg.engines.node) || '20 以上'}（ビルド・テスト用。通常利用には不要）
- ソースのハッシュ: ${currentHash}
- 同梱 task-manager.html: ${htmlInfo ? `source ${htmlInfo.sourceHash}（${manifest.build.htmlUpToDate ? '現在のソースと一致' : 'ソースより古い／不一致 — 復元後に npm run build が必要'}）` : 'なし'}
- ビルド確認: ${buildCheck.run ? (buildCheck.ok ? '成功（一時フォルダーで確認）' : '失敗（作業途中の可能性。下記の出力参照）') : '未実施（--check-build で実施）'}
${buildCheck.run && !buildCheck.ok ? '\n```\n' + buildCheck.output + '\n```\n' : ''}
## 復元手順

1. この ZIP を **OneDrive 同期対象外** のフォルダーに展開する（例: C:\\dev\\${pkg.name}）。
2. そのフォルダーでコマンドプロンプト / PowerShell を開き、ロックファイルどおりに依存を入れる:
   \`npm ci\`
3. ビルドできることを確認する: \`npm run build\` → \`npm run build:check\`
4. （任意）テスト: \`npm run test:unit\`、ブラウザーテストは \`npm run test:e2e\`
5. 個別 PC 設定がなければ local.config.example.json を local.config.json にコピーして編集する。

自動確認: 元の開発フォルダーで \`npm run restore:verify -- <このZIPのパス>\`

_backup_info/manifest.json に全ファイルの SHA-256 と除外したファイルの一覧があります。
`;
const infoEntries = [
  { name: '_backup_info/README-RESTORE.md', data: Buffer.from(readme, 'utf8'), mtime: now },
  { name: '_backup_info/manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), mtime: now },
];
const allEntries = [...entries, ...infoEntries];
const seenNames = new Set();
for (const e of allEntries) {
  const key = e.name.toLowerCase(); // also catches names that differ only in case (Windows)
  if (seenNames.has(key)) fail(`ZIP 内のファイル名が重複します: ${e.name}`);
  seenNames.add(key);
}

try { mkdirSync(outDir, { recursive: true }); } catch (e) { fail(`出力先フォルダーを作れません: ${outDir}: ${e.message}`); }
let finalPath = join(outDir, `${baseName}.zip`);
for (let n = 2; existsSync(finalPath); n++) finalPath = join(outDir, `${baseName}-${n}.zip`);
const partial = `${finalPath}.partial`;

try {
  writeZip(partial, allEntries);
  // Verify: read back every entry and compare with what was packed.
  const back = readZip(partial);
  if (back.length !== allEntries.length) throw new Error(`エントリー数が一致しません (${back.length}/${allEntries.length})`);
  const expected = new Map(allEntries.map((e) => [e.name, sha256(e.data)]));
  for (const b of back) {
    if (expected.get(b.name) !== sha256(b.data)) throw new Error(`内容が一致しません: ${b.name}`);
  }
  if (existsSync(finalPath)) throw new Error(`同名のファイルが作成されました: ${finalPath}`);
  renameSync(partial, finalPath);
} catch (e) {
  try { rmSync(partial, { force: true }); } catch { /* ignore */ }
  fail(e.message);
}

const total = manifest.files.reduce((a, f) => a + f.size, 0);
console.log(`[${release ? 'リリースZIP作成' : 'バックアップ完了'}] ${finalPath}`);
console.log(`  ファイル数 ${files.length}（${(total / 1024).toFixed(0)} KB）・読み戻し検証 OK`);
console.log(`  作業途中の変更: ${yesNo(dirty)} / Git履歴: ${includeGit ? '含む' : '含まない'} / 個別設定: ${manifest.includesLocalConfig ? '含む' : '含まない'}`);
console.log(`  HTML: ${manifest.build.htmlUpToDate ? '最新' : '要ビルド（ソースと不一致）'}${buildCheck.run ? ` / ビルド確認: ${buildCheck.ok ? '成功' : '失敗'}` : ''}`);
if (skipped.secret.length) console.log(`  秘密情報の可能性があるため除外: ${skipped.secret.join(', ')}`);
if (!release && cfg.backupDir && isInside(finalPath, cfg.backupDir)) {
  console.log('※ OneDrive フォルダーへのローカル保存が完了した状態です。クラウドへの同期完了は OneDrive のアイコンで確認してください。');
}
