// Tests for the operations scripts: deploy, build failure handling, source backup, restore.
// Everything runs in temporary folders; the real project folder is only read.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, cpSync, symlinkSync,
  statSync, rmSync, appendFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { readZip } from '../../scripts/lib/zip.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const isWin = process.platform === 'win32';

function tmp(prefix = 'mtm-test-') { return mkdtempSync(join(tmpdir(), prefix)); }

function run(cwd, cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: isWin && cmd === 'npm', env: { ...process.env, ...env } });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const node = (cwd, script, args = [], env = {}) => run(cwd, process.execPath, [script, ...args], env);

// Operations folders B / C / D + a config file pointing at them.
function opsFolders() {
  const base = tmp();
  const app = join(base, 'app'); const data = join(base, 'data'); const backup = join(base, 'backup');
  [app, data, backup].forEach((d) => mkdirSync(d));
  writeFileSync(join(data, 'kanban.md'), '# 実データ\n<!-- Format: v2 -->\n\n## Tasks\n\n### TASK-001 | 本番タスク\n**Status**: todo\n');
  writeFileSync(join(data, 'archive.md'), '# Archive\n');
  writeFileSync(join(data, 'memo.txt'), 'other operational file');
  const cfg = join(base, 'cfg.json');
  writeFileSync(cfg, JSON.stringify({ appDir: app, dataDir: data, backupDir: backup }));
  return { base, app, data, backup, cfg, env: { MTM_CONFIG: cfg, MTM_APP_DIR: '', MTM_DATA_DIR: '', MTM_BACKUP_DIR: '' } };
}

function snapshot(dir) {
  return Object.fromEntries(readdirSync(dir).sort().map((f) => {
    const p = join(dir, f);
    return [f, { bytes: readFileSync(p).toString('base64'), mtime: statSync(p).mtimeMs }];
  }));
}

// A throw-away copy of the project (node_modules linked, not copied).
function projectCopy(name = 'MarkdownTaskManager') {
  const dest = join(tmp('mtm-proj-'), name);
  cpSync(ROOT, dest, {
    recursive: true,
    filter: (src) => !/[\\/](node_modules|\.git|backups|dist|test-results)([\\/]|$)/.test(src.slice(ROOT.length)) && !src.endsWith('local.config.json'),
  });
  symlinkSync(join(ROOT, 'node_modules'), join(dest, 'node_modules'), isWin ? 'junction' : 'dir');
  return dest;
}

describe('deploy', () => {
  test('no configuration → stops safely with instructions', () => {
    const r = node(ROOT, 'scripts/deploy.mjs', [], { MTM_CONFIG: join(tmp(), 'none.json'), MTM_APP_DIR: '' });
    assert.equal(r.code, 2);
    assert.match(r.out, /appDir/);
    assert.match(r.out, /local\.config\.example\.json/);
  });

  test('dry-run writes nothing', () => {
    const o = opsFolders();
    const r = node(ROOT, 'scripts/deploy.mjs', ['--dry-run'], o.env);
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(readdirSync(o.app), []);
    assert.deepEqual(readdirSync(o.backup), []);
  });

  test('deploys one file, backs up the previous one, never touches task data', () => {
    const o = opsFolders();
    const dataBefore = snapshot(o.data);
    let r = node(ROOT, 'scripts/deploy.mjs', [], o.env);
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(readdirSync(o.app), ['task-manager.html']);
    assert.deepEqual(readFileSync(join(o.app, 'task-manager.html')), readFileSync(join(ROOT, 'task-manager.html')));
    assert.match(r.out, /配備完了/);

    // An older HTML is in place → it is backed up first, then replaced.
    writeFileSync(join(o.app, 'task-manager.html'), '<html>old version</html>');
    r = node(ROOT, 'scripts/deploy.mjs', [], o.env);
    assert.equal(r.code, 0, r.out);
    const backups = readdirSync(join(o.backup, 'html'));
    assert.equal(backups.length, 1);
    assert.match(backups[0], /^task-manager\.\d{8}-\d{6}\.html$/);
    assert.equal(readFileSync(join(o.backup, 'html', backups[0]), 'utf8'), '<html>old version</html>');
    assert.deepEqual(readdirSync(o.app), ['task-manager.html']);

    // Same content again → nothing to do.
    r = node(ROOT, 'scripts/deploy.mjs', [], o.env);
    assert.match(r.out, /変更なし/);
    assert.deepEqual(snapshot(o.data), dataBefore, 'kanban.md / archive.md / other files untouched');
  });

  test('refuses an app folder that contains task data', () => {
    const o = opsFolders();
    writeFileSync(o.cfg, JSON.stringify({ appDir: o.data, backupDir: o.backup }));
    const before = snapshot(o.data);
    const r = node(ROOT, 'scripts/deploy.mjs', [], o.env);
    assert.equal(r.code, 1);
    assert.match(r.out, /運用データ/);
    assert.deepEqual(snapshot(o.data), before);
  });

  test('failed build → task-manager.html in the app folder is NOT updated', () => {
    const o = opsFolders();
    const proj = projectCopy();
    // Deploy a good build first.
    assert.equal(node(proj, 'scripts/deploy.mjs', [], o.env).code, 0);
    const deployed = readFileSync(join(o.app, 'task-manager.html'));
    // Break the source and run build-deploy (build && deploy).
    const f = join(proj, 'src', 'scripts', '12-init.js');
    writeFileSync(f, readFileSync(f, 'utf8') + '\nfunction broken( {\n');
    const r = run(proj, 'npm', ['run', 'build-deploy'], o.env);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /構文エラー|syntax error/i);
    assert.deepEqual(readFileSync(join(o.app, 'task-manager.html')), deployed);
    // Even when deploy is run on its own, the stale HTML is refused.
    const r2 = node(proj, 'scripts/deploy.mjs', [], o.env);
    assert.equal(r2.code, 1);
    assert.match(r2.out, /現在のソースからビルドされていません/);
    assert.deepEqual(readFileSync(join(o.app, 'task-manager.html')), deployed);
    assert.equal(readdirSync(o.app).length, 1);
  });
});

describe('source backup and restore', () => {
  test('backup works while the build is broken, includes hidden files, excludes junk/secrets/old backups', () => {
    const o = opsFolders();
    const proj = projectCopy();
    const f = join(proj, 'src', 'scripts', '12-init.js');
    writeFileSync(f, readFileSync(f, 'utf8') + '\nfunction broken( {\n');
    writeFileSync(join(proj, '.env'), 'TOKEN=secret');
    writeFileSync(join(proj, 'local.config.json'), JSON.stringify({ appDir: o.app }));
    mkdirSync(join(proj, 'backups'), { recursive: true });
    writeFileSync(join(proj, 'backups', 'old.zip'), 'zip');
    writeFileSync(join(proj, 'debug.log'), 'log');

    const r = node(proj, 'scripts/backup.mjs', ['--check-build', '--label', '作業途中'], o.env);
    assert.equal(r.code, 0, r.out);
    const zips = readdirSync(join(o.backup, 'source'));
    assert.equal(zips.length, 1);
    assert.match(zips[0], /^markdown-task-manager-src-\d{8}-\d{6}-作業途中\.zip$/);
    const entries = readZip(join(o.backup, 'source', zips[0]));
    const names = entries.map((e) => e.name);
    for (const must of ['src/scripts/12-init.js', 'build.mjs', 'package.json', 'package-lock.json', 'task-manager.html', 'LICENSE',
      'AGENTS.md', 'AI_WORKFLOW.md', '.claude/skills/markdown-task-manager/SKILL.md', '.gitignore', 'scripts/deploy.mjs',
      'tests/unit/format.test.mjs', 'local.config.json', '_backup_info/manifest.json', '_backup_info/README-RESTORE.md']) {
      assert.ok(names.includes(must), `contains ${must}`);
    }
    for (const never of ['.env', 'backups/old.zip', 'debug.log']) assert.ok(!names.includes(never), `excludes ${never}`);
    assert.ok(!names.some((n) => n.startsWith('node_modules/')));
    const manifest = JSON.parse(entries.find((e) => e.name === '_backup_info/manifest.json').data.toString('utf8'));
    assert.equal(manifest.build.check.run, true);
    assert.equal(manifest.build.check.ok, false, 'records the failed build');
    assert.equal(manifest.build.htmlUpToDate, false);
    assert.equal(manifest.includesGitHistory, false);
    assert.ok(manifest.excluded.secret.includes('.env'));
    const readme = entries.find((e) => e.name === '_backup_info/README-RESTORE.md').data.toString('utf8');
    assert.match(readme, /Git 履歴は含みません/);
    assert.match(readme, /npm ci/);
    // Original files untouched.
    assert.equal(readFileSync(join(proj, '.env'), 'utf8'), 'TOKEN=secret');
  });

  test('backup into a folder inside the project never packs itself; generations are never overwritten', () => {
    const proj = projectCopy();
    const env = { MTM_CONFIG: join(proj, 'none.json') };
    assert.equal(node(proj, 'scripts/backup.mjs', [], env).code, 0);
    assert.equal(node(proj, 'scripts/backup.mjs', [], env).code, 0);
    const zips = readdirSync(join(proj, 'backups')).filter((n) => n.endsWith('.zip'));
    assert.equal(zips.length, 2, 'two generations');
    for (const z of zips) {
      const names = readZip(join(proj, 'backups', z)).map((e) => e.name);
      assert.ok(!names.some((n) => n.startsWith('backups/') || n.endsWith('.zip')), 'no recursion');
    }
    assert.ok(!readdirSync(join(proj, 'backups')).some((n) => n.endsWith('.partial')));
  });

  test('release package excludes local config, data, dependencies and secrets', () => {
    const proj = projectCopy();
    writeFileSync(join(proj, 'local.config.json'), '{"appDir":"X"}');
    writeFileSync(join(proj, '.env'), 'SECRET=1');
    const out = tmp();
    const r = node(proj, 'scripts/backup.mjs', ['--release', '--out', out], { MTM_CONFIG: join(proj, 'none.json') });
    assert.equal(r.code, 0, r.out);
    const z = readdirSync(out).find((n) => n.endsWith('.zip'));
    const names = readZip(join(out, z)).map((e) => e.name);
    assert.ok(names.includes('task-manager.html'));
    for (const never of ['local.config.json', '.env']) assert.ok(!names.includes(never), never);
    assert.ok(!names.some((n) => n.startsWith('node_modules/')));
  });

  test('a backup ZIP restores into another folder and builds (npm ci + build)', { timeout: 300000 }, () => {
    const out = tmp();
    const b = node(ROOT, 'scripts/backup.mjs', ['--out', out], { MTM_CONFIG: join(out, 'none.json') });
    assert.equal(b.code, 0, b.out);
    const zip = join(out, readdirSync(out).find((n) => n.endsWith('.zip')));
    const dest = join(tmp(), 'restored');
    const r = node(ROOT, 'scripts/verify-restore.mjs', [zip, '--dest', dest]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /復元確認 OK/);
    assert.ok(existsSync(join(dest, 'node_modules', 'html-minifier-terser')));
    assert.ok(existsSync(join(dest, 'task-manager.restore-check.html')));
    rmSync(dest, { recursive: true, force: true });
  });
});

describe('review fixes (ops)', () => {
  test('a source restored from a backup ZIP can itself be backed up again (no duplicate _backup_info)', () => {
    const out = tmp();
    const proj = projectCopy();
    assert.equal(node(proj, 'scripts/backup.mjs', ['--out', out], { MTM_CONFIG: join(proj, 'none.json') }).code, 0);
    const zip = join(out, readdirSync(out).find((n) => n.endsWith('.zip')));
    const restored = join(tmp(), 'restored');
    for (const e of readZip(zip)) {
      mkdirSync(dirname(join(restored, e.name)), { recursive: true });
      writeFileSync(join(restored, e.name), e.data);
    }
    symlinkSync(join(ROOT, 'node_modules'), join(restored, 'node_modules'), isWin ? 'junction' : 'dir');
    const out2 = tmp();
    const r = node(restored, 'scripts/backup.mjs', ['--out', out2], { MTM_CONFIG: join(restored, 'none.json') });
    assert.equal(r.code, 0, r.out);
    const names = readZip(join(out2, readdirSync(out2).find((n) => n.endsWith('.zip')))).map((e) => e.name);
    assert.equal(names.filter((n) => n === '_backup_info/manifest.json').length, 1);
  });

  test('a ".git" FILE (git worktree) and .claude/settings.local.json are never packed', () => {
    const proj = projectCopy();
    writeFileSync(join(proj, '.git'), 'gitdir: /somewhere/else/.git/worktrees/x\n');
    mkdirSync(join(proj, '.claude'), { recursive: true });
    writeFileSync(join(proj, '.claude', 'settings.local.json'), '{"permissions":{"allow":["Bash(curl -H token:abc)"]}}');
    const out = tmp();
    const r = node(proj, 'scripts/backup.mjs', ['--out', out], { MTM_CONFIG: join(proj, 'none.json') });
    assert.equal(r.code, 0, r.out);
    const names = readZip(join(out, readdirSync(out).find((n) => n.endsWith('.zip')))).map((e) => e.name);
    assert.ok(!names.includes('.git'));
    assert.ok(!names.includes('.claude/settings.local.json'));
    assert.ok(names.includes('.claude/skills/markdown-task-manager/SKILL.md'));
  });

  test('release refuses uncommitted changes (they would be published)', () => {
    const proj = projectCopy();
    const git = (...a) => run(proj, 'git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a]);
    assert.equal(git('init', '-q').code, 0);
    git('add', '-A');
    assert.equal(git('commit', '-q', '-m', 'snapshot').code, 0);
    writeFileSync(join(proj, 'README.md'), readFileSync(join(proj, 'README.md'), 'utf8') + '\n実パス C:\\Users\\someone\n');
    const out = tmp();
    const r = node(proj, 'scripts/backup.mjs', ['--release', '--out', out], { MTM_CONFIG: join(proj, 'none.json') });
    assert.equal(r.code, 1);
    assert.match(r.out, /未コミットの変更/);
    assert.deepEqual(readdirSync(out), []);
    assert.equal(node(proj, 'scripts/backup.mjs', ['--release', '--allow-dirty', '--out', out], { MTM_CONFIG: join(proj, 'none.json') }).code, 0);
  });

  test('release ignores untracked files (they are never packed)', () => {
    const proj = projectCopy();
    const git = (...a) => run(proj, 'git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a]);
    git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'snapshot');
    writeFileSync(join(proj, 'my-notes.txt'), 'private memo');
    const out = tmp();
    const r = node(proj, 'scripts/backup.mjs', ['--release', '--out', out], { MTM_CONFIG: join(proj, 'none.json') });
    assert.equal(r.code, 0, r.out);
    const zipName = readdirSync(out).find((n) => n.endsWith('.zip'));
    assert.doesNotMatch(zipName, /-dirty/, 'untracked files do not make a release dirty');
    const entries = readZip(join(out, zipName));
    assert.ok(!entries.some((e) => e.name === 'my-notes.txt'));
    // The public manifest must not even NAME files that are not in the ZIP.
    const manifest = entries.find((e) => e.name === '_backup_info/manifest.json').data.toString('utf8');
    assert.doesNotMatch(manifest, /my-notes/);
    assert.match(entries.find((e) => e.name === '_backup_info/README-RESTORE.md').data.toString('utf8'), /作業途中の変更（未コミット）: なし/);
  });

  test('release manifest names no secret-looking or untracked files', () => {
    const proj = projectCopy();
    const git = (...a) => run(proj, 'git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a]);
    git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'snapshot');
    writeFileSync(join(proj, '.env'), 'TOKEN=x');
    mkdirSync(join(proj, 'private'));
    writeFileSync(join(proj, 'private', '取引先_評価.md'), 'x');
    const out = tmp();
    assert.equal(node(proj, 'scripts/backup.mjs', ['--release', '--out', out], { MTM_CONFIG: join(proj, 'none.json') }).code, 0);
    const entries = readZip(join(out, readdirSync(out).find((n) => n.endsWith('.zip'))));
    const manifest = entries.find((e) => e.name === '_backup_info/manifest.json').data.toString('utf8');
    assert.doesNotMatch(manifest, /\.env|取引先|private/);
  });

  test('deploy over an existing HTML needs a backup folder; nothing is created in the app folder', () => {
    const o = opsFolders();
    writeFileSync(join(o.app, 'task-manager.html'), '<html>old</html>');
    writeFileSync(o.cfg, JSON.stringify({ appDir: o.app, dataDir: o.data }));
    const r = node(ROOT, 'scripts/deploy.mjs', [], o.env);
    assert.equal(r.code, 2);
    assert.match(r.out, /backupDir/);
    assert.deepEqual(readdirSync(o.app), ['task-manager.html']);
    assert.equal(readFileSync(join(o.app, 'task-manager.html'), 'utf8'), '<html>old</html>');
  });
});

describe('review round 5 (ops)', () => {
  const zipOf = (out) => readZip(join(out, readdirSync(out).find((n) => n.endsWith('.zip'))));
  const manifestOf = (entries) => JSON.parse(entries.find((e) => e.name === '_backup_info/manifest.json').data.toString('utf8'));

  test('no Git: secret folders and the MTM_CONFIG file never reach a release; a local backup keeps the config only (review 1-5)', () => {
    const proj = projectCopy(); // no .git: the exclusion rules alone decide
    mkdirSync(join(proj, 'secrets'));
    writeFileSync(join(proj, 'secrets', 'service-account.json'), '{"token":"dummy-not-real"}');
    mkdirSync(join(proj, '.aws'));
    writeFileSync(join(proj, '.aws', 'config'), '[default]\nregion=dummy\n');
    const cfg = join(proj, 'company-pc.json');
    writeFileSync(cfg, JSON.stringify({ dataDir: join(tmp(), 'data') }));
    writeFileSync(join(proj, 'メモ_会議.txt'), 'local note');
    const env = { MTM_CONFIG: cfg, MTM_APP_DIR: '', MTM_DATA_DIR: '', MTM_BACKUP_DIR: '' };

    const rel = tmp();
    const r = node(proj, 'scripts/backup.mjs', ['--release', '--out', rel], env);
    assert.equal(r.code, 0, r.out);
    const names = zipOf(rel).map((e) => e.name);
    for (const never of ['secrets/service-account.json', '.aws/config', 'company-pc.json', 'メモ_会議.txt']) assert.ok(!names.includes(never), never);
    for (const must of ['task-manager.html', 'src/scripts/04-format.js', 'LICENSE', 'package-lock.json', 'CLAUDE.md.exemple']) assert.ok(names.includes(must), must);
    assert.equal(manifestOf(zipOf(rel)).includesLocalConfig, false);

    const local = tmp();
    const b = node(proj, 'scripts/backup.mjs', ['--out', local], env);
    assert.equal(b.code, 0, b.out);
    const lnames = zipOf(local).map((e) => e.name);
    assert.ok(!lnames.some((n) => n.startsWith('secrets/') || n.startsWith('.aws/')), 'secret folders are not even in a local backup');
    assert.ok(lnames.includes('company-pc.json'), 'the per-PC config in use is kept locally');
    assert.equal(manifestOf(zipOf(local)).includesLocalConfig, true);
    assert.match(b.out, /個別設定: 含む/);
  });

  test('a backup is made even while package.json / FORK_INFO.json are broken JSON (review 1-9)', () => {
    const proj = projectCopy();
    const broken = '{\n  "name": "markdown-task-manager",\n  "version": \n';
    writeFileSync(join(proj, 'package.json'), broken);
    writeFileSync(join(proj, 'FORK_INFO.json'), '{ "upstream": ');
    const out = tmp();
    const r = node(proj, 'scripts/backup.mjs', ['--out', out], { MTM_CONFIG: join(proj, 'none.json') });
    assert.equal(r.code, 0, r.out);
    const entries = zipOf(out);
    assert.equal(entries.find((e) => e.name === 'package.json').data.toString('utf8'), broken, 'packed as it is');
    const m = manifestOf(entries);
    assert.equal(m.metadataErrors.length, 2);
    assert.match(entries.find((e) => e.name === '_backup_info/README-RESTORE.md').data.toString('utf8'), /読めなかったメタ情報/);
    // A public release still requires valid metadata.
    assert.notEqual(node(proj, 'scripts/backup.mjs', ['--release', '--out', tmp()], { MTM_CONFIG: join(proj, 'none.json') }).code, 0);
  });

  test('--check-build records no temporary or project path (review 2-11)', () => {
    const proj = projectCopy();
    const out = tmp();
    const r = node(proj, 'scripts/backup.mjs', ['--check-build', '--out', out], { MTM_CONFIG: join(proj, 'none.json') });
    assert.equal(r.code, 0, r.out);
    const entries = zipOf(out);
    const m = manifestOf(entries);
    assert.equal(m.build.check.ok, true);
    const texts = [JSON.stringify(m.build.check), entries.find((e) => e.name === '_backup_info/README-RESTORE.md').data.toString('utf8')];
    for (const t of texts) {
      assert.doesNotMatch(t, /mtm-buildcheck-/);
      assert.ok(!t.includes(tmpdir()), 'no temp folder path');
      assert.ok(!t.includes(proj), 'no project path');
    }
  });

  test('tasks check: duplicate ids are a warning (not "read-only"); a Shift_JIS file is reported (review 2-10 / 2-1)', () => {
    const dir = tmp();
    const t1 = '### TASK-001 | 月次締め\n**Status**: todo\n';
    writeFileSync(join(dir, 'kanban.md'), `# B\n<!-- Format: v2 -->\n\n## ⚙️ Configuration\n\n**Columns**: To Do (todo) | Done (done)\n\n---\n\n## Tasks\n\n${t1}`);
    writeFileSync(join(dir, 'archive.md'), `# Task Archive\n<!-- Format: v2 -->\n\n## Archives\n\n${t1}`);
    let r = node(ROOT, 'scripts/tasks.mjs', ['check', '--dir', dir]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /重複した ID/);
    assert.doesNotMatch(r.out, /読み取り専用で開きます/);
    // "タスク" in Shift_JIS, as written by Windows PowerShell 5.1 Set-Content.
    writeFileSync(join(dir, 'archive.md'), Buffer.concat([Buffer.from('# Task Archive\n<!-- Format: v2 -->\n\n## Archives\n\n### TASK-002 | '), Buffer.from([0x83, 0x5e, 0x83, 0x58, 0x83, 0x4e]), Buffer.from('\n**Status**: done\n')]));
    r = node(ROOT, 'scripts/tasks.mjs', ['check', '--dir', dir]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /archive\.md: UTF-8 ではありません/);
    assert.match(r.out, /読み取り専用で開きます/);
  });

  test('restore:verify --reuse-node-modules works without the npm registry and keeps the dev node_modules (review 2-9)', { timeout: 300000 }, () => {
    const proj = projectCopy();
    const out = tmp();
    assert.equal(node(proj, 'scripts/backup.mjs', ['--out', out], { MTM_CONFIG: join(proj, 'none.json') }).code, 0);
    const zip = join(out, readdirSync(out).find((n) => n.endsWith('.zip')));
    // No registry and an empty npm cache: `npm ci` cannot work here.
    const env = { npm_config_offline: 'true', npm_config_cache: tmp('mtm-empty-cache-') };
    const r = node(proj, 'scripts/verify-restore.mjs', [zip, '--reuse-node-modules'], env);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /復元確認 OK/);
    assert.doesNotMatch(r.out, /実行 {2}: npm ci/);
    assert.ok(existsSync(join(ROOT, 'node_modules', 'html-minifier-terser')), 'the linked node_modules was not deleted');
  });
});

describe('review round 6 (ops)', () => {
  const zipOf = (out) => readZip(join(out, readdirSync(out).find((n) => n.endsWith('.zip'))));
  const manifestOf = (entries) => JSON.parse(entries.find((e) => e.name === '_backup_info/manifest.json').data.toString('utf8'));
  const infoTexts = (entries) => ['_backup_info/manifest.json', '_backup_info/README-RESTORE.md'].map((n) => entries.find((e) => e.name === n).data.toString('utf8'));
  const noEnv = { MTM_APP_DIR: '', MTM_DATA_DIR: '', MTM_BACKUP_DIR: '' };

  test('a broken configuration file does not let task data into a backup (round 6: review 1-2 / 2-4)', () => {
    const proj = projectCopy();
    // The data folder is given by an environment variable; the configuration file is broken.
    const data = join(proj, 'operation-data');
    mkdirSync(data);
    writeFileSync(join(data, 'kanban.md'), '# 実データ\n');
    const cfg = join(tmp(), 'cfg.json');
    writeFileSync(cfg, '{ "backupDir": ');
    const out = tmp();
    let r = node(proj, 'scripts/backup.mjs', ['--out', out], { ...noEnv, MTM_CONFIG: cfg, MTM_DATA_DIR: data });
    assert.equal(r.code, 0, r.out);
    assert.ok(!zipOf(out).some((e) => e.name.startsWith('operation-data/')), 'the MTM_DATA_DIR folder is still left out');
    // The data folder is only named IN the broken file: folders holding kanban.md / archive.md
    // (other than the project root and examples/) are left out, with a warning.
    rmSync(data, { recursive: true });
    mkdirSync(join(proj, 'data'));
    writeFileSync(join(proj, 'data', 'archive.md'), '# Archive\n');
    writeFileSync(join(proj, 'local.config.json'), '{ "dataDir": "./data", ');
    const out2 = tmp();
    r = node(proj, 'scripts/backup.mjs', ['--out', out2], { ...noEnv, MTM_CONFIG: '' });
    assert.equal(r.code, 0, r.out);
    const names = zipOf(out2).map((e) => e.name);
    assert.ok(!names.includes('data/archive.md'), 'a folder with task data is left out');
    for (const must of ['kanban.md', 'archive.md', 'examples/kanban.md', 'examples/archive.md']) assert.ok(names.includes(must), must);
    assert.match(r.out, /運用データ/);
  });

  test('the content of an unreadable configuration file never reaches the ZIP (round 6: review 1-4)', () => {
    for (const content of ['DUMMY-SECRET-VALUE', '{ "dataDir": "x", "token": DUMMY-SECRET-VALUE }']) {
      const proj = projectCopy();
      const cfg = join(proj, 'company-pc.json');
      writeFileSync(cfg, content);
      const out = tmp();
      const r = node(proj, 'scripts/backup.mjs', ['--no-local-config', '--out', out], { ...noEnv, MTM_CONFIG: cfg });
      assert.equal(r.code, 0, r.out);
      const entries = zipOf(out);
      assert.ok(!entries.some((e) => e.name === 'company-pc.json'), 'the file itself is left out');
      const m = manifestOf(entries);
      assert.equal(m.includesLocalConfig, false);
      assert.equal(m.metadataErrors.length, 1);
      assert.match(m.metadataErrors[0], /company-pc\.json.*JSON/);
      for (const t of infoTexts(entries)) assert.doesNotMatch(t, /DUMMY|SECRET/, 'no excerpt of the file');
    }
  });

  test('a failed --check-build records no project path, also not as a file:// URL (round 6: review 1-3)', () => {
    const proj = projectCopy('space project 日本'); // no Git; a space and non-ASCII characters (URL-encoded in stack traces)
    appendFileSync(join(proj, 'src', 'scripts', '12-init.js'), '\nconst broken = ;\n');
    const out = tmp();
    const r = node(proj, 'scripts/backup.mjs', ['--release', '--check-build', '--out', out], { ...noEnv, MTM_CONFIG: join(proj, 'none.json') });
    assert.equal(r.code, 0, r.out);
    const entries = zipOf(out);
    assert.equal(manifestOf(entries).build.check.ok, false);
    for (const t of infoTexts(entries)) {
      assert.ok(!t.includes(pathToFileURL(proj).href), 'no file:// URL of the project');
      assert.ok(!t.includes(proj), 'no project path');
      assert.doesNotMatch(t, /space%20project|%E6%97%A5/, 'no URL-encoded folder name');
      assert.doesNotMatch(t, /file:\/\/\/(?!<)/, 'no absolute file URL at all');
    }
  });

  test('restore:verify --reuse-node-modules removes its link also after an unexpected error (round 6: review 1-7 / 2-6)', () => {
    const proj = projectCopy();
    writeFileSync(join(proj, 'build.mjs'), '// builds nothing: the restore check finds no output file\n');
    const out = tmp();
    assert.equal(node(proj, 'scripts/backup.mjs', ['--out', out], { ...noEnv, MTM_CONFIG: join(proj, 'none.json') }).code, 0);
    const zip = join(out, readdirSync(out).find((n) => n.endsWith('.zip')));
    const dest = join(tmp(), 'restore');
    const r = node(proj, 'scripts/verify-restore.mjs', [zip, '--reuse-node-modules', '--dest', dest]);
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.out, /復元確認 NG/);
    assert.ok(existsSync(join(dest, 'build.mjs')), 'the extracted files are kept (--dest)');
    assert.ok(!existsSync(join(dest, 'node_modules')), 'the node_modules link was removed');
    assert.ok(existsSync(join(ROOT, 'node_modules', 'html-minifier-terser')), 'the dev node_modules is intact');
  });

  test('restore:verify --reuse-node-modules removes its link on Ctrl+C (round 6: review 2-6)', { skip: isWin && 'POSIX process groups', timeout: 120000 }, async () => {
    const proj = projectCopy();
    writeFileSync(join(proj, 'build.mjs'), 'setInterval(() => {}, 1000); // a build that never ends\n');
    const out = tmp();
    assert.equal(node(proj, 'scripts/backup.mjs', ['--out', out], { ...noEnv, MTM_CONFIG: join(proj, 'none.json') }).code, 0);
    const zip = join(out, readdirSync(out).find((n) => n.endsWith('.zip')));
    const dest = join(tmp(), 'restore');
    // Own process group, like a console window: Ctrl+C sends SIGINT to the script AND the build.
    const child = spawn(process.execPath, ['scripts/verify-restore.mjs', zip, '--reuse-node-modules', '--dest', dest], { cwd: proj, detached: true, stdio: 'ignore' });
    const exited = new Promise((res) => child.on('exit', (code, signal) => res({ code, signal })));
    const deadline = Date.now() + 60000;
    while (!existsSync(join(dest, 'node_modules')) && Date.now() < deadline) await new Promise((res) => setTimeout(res, 50));
    assert.ok(existsSync(join(dest, 'node_modules')), 'the link was made');
    await new Promise((res) => setTimeout(res, 500)); // the build is running
    let done = null;
    exited.then((v) => { done = v; });
    while (!done && Date.now() < deadline) {
      try { process.kill(-child.pid, 'SIGINT'); } catch { /* already gone */ }
      await new Promise((res) => setTimeout(res, 300));
    }
    assert.ok(done, 'the script ended');
    assert.ok(!existsSync(join(dest, 'node_modules')), 'the node_modules link was removed');
    assert.ok(existsSync(join(ROOT, 'node_modules', 'html-minifier-terser')), 'the dev node_modules is intact');
  });
  test('tasks next-id stops (exit 1, no id) when a file is not UTF-8, e.g. a UTF-16 archive.md (round 6: review 2-1)', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'kanban.md'), '# B\n<!-- Config: Last Task ID: 3 -->\n<!-- Format: v2 -->\n\n## ⚙️ Configuration\n\n**Columns**: To Do (todo) | Done (done)\n\n---\n\n## Tasks\n\n### TASK-003 | c\n**Status**: todo\n');
    // UTF-16LE with BOM (Windows PowerShell 5.1 Out-File / ">"): the "### TASK-004" line is not readable as UTF-8.
    const archiveMd = '# Task Archive\n<!-- Format: v2 -->\n\n## Archives\n\n### TASK-004 | d\n**Status**: done\n';
    writeFileSync(join(dir, 'archive.md'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(archiveMd, 'utf16le')]));
    const r = node(ROOT, 'scripts/tasks.mjs', ['next-id', '--dir', dir]);
    assert.equal(r.code, 1, r.out);
    assert.doesNotMatch(r.out, /TASK-00\d/, 'no id is printed');
    assert.match(r.out, /archive\.md.*UTF-8/);
    const c = node(ROOT, 'scripts/tasks.mjs', ['check', '--dir', dir]);
    assert.equal(c.code, 1, c.out);
    assert.doesNotMatch(c.out, /次の ID: TASK-004/, 'check does not offer an id that may be in use');
  });
});
