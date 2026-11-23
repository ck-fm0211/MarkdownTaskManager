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
import { readZip, writeZip } from '../../scripts/lib/zip.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const isWin = process.platform === 'win32';

function tmp(prefix = 'mtm-test-') { return mkdtempSync(join(tmpdir(), prefix)); }

function run(cwd, cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: isWin && cmd === 'npm', env: { ...process.env, ...env } });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), stderr: r.stderr || '' };
}
const node = (cwd, script, args = [], env = {}) => run(cwd, process.execPath, [script, ...args], env);

describe('tasks worklog', () => {
  function fixture(t) {
    const dir = tmp('mtm-worklog-');
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const task = (id, category, estimate, logs, assigned = '@alice, @bob', tags = '#feature #shared') =>
      `### TASK-${id} | Example ${id}\n**Status**: todo\n**Priority**: High | **Category**: ${category} | **Assigned**: ${assigned}\n**Created**: 2026-01-01\n**Tags**: ${tags}\n**Estimate**: ${estimate}\n\n**Worklog**:\n${logs.map(([date, hours]) => `- ${date} | ${hours}h | example`).join('\n')}\n\n`;
    writeFileSync(join(dir, 'kanban.md'), `# Board\n<!-- Format: v2 -->\n<!-- Config: Last Task ID: 4 -->\n\n## ⚙️ Configuration\n\n**Columns**: To Do (todo) | Done (done)\n\n---\n\n## Tasks\n\n${
      task('001', 'Backend', '8h', [['2026-01-10', 3.5], ['2026-02-01', 2]])}${
      task('002', 'Frontend', '2.25', [['2026-02-02', 4]], '@alice', '#feature')}${
      task('004', '', '1', [], '', '')}`);
    writeFileSync(join(dir, 'archive.md'), `# Task Archive\n<!-- Format: v2 -->\n\n## ✅ Archives\n\n${
      task('003', 'Backend', '1.5 H', [['2026-01-31', 0.75]], '', '')}`);
    return dir;
  }

  test('totals include active and archived tasks; check stays OK and files stay unchanged', (t) => {
    const dir = fixture(t);
    const before = snapshot(dir);
    const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--dir', dir]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /\| TOTAL \| 12\.75 \| 10\.25 \| -2\.5 \|/);
    const check = node(ROOT, 'scripts/tasks.mjs', ['check', '--dir', dir]);
    assert.equal(check.code, 0, check.out);
    assert.match(check.out, /\[OK\]/);
    assert.deepEqual(snapshot(dir), before);
  });

  test('category is the default; estimates, actuals and both signs of diff are grouped correctly', (t) => {
    const dir = fixture(t);
    const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--by', 'category', '--dir', dir]);
    assert.equal(r.code, 0, r.out);
    assert.equal(r.out, node(ROOT, 'scripts/tasks.mjs', ['worklog', '--dir', dir]).out);
    assert.match(r.out, /\| Group \| Estimate\(h\) \| Actual\(h\) \| Diff\(h\) \|/);
    assert.match(r.out, /\| Backend \| 9\.5 \| 6\.25 \| -3\.25 \|/);
    assert.match(r.out, /\| Frontend \| 2\.25 \| 4 \| 1\.75 \|/);
    assert.match(r.out, /\| \(none\) \| 1 \| 0 \| -1 \|/);
  });

  test('CSV emits the same numeric totals and escapes commas and quotes', (t) => {
    const dir = fixture(t);
    const p = join(dir, 'kanban.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace('Frontend', 'UI, "web"'));
    const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--csv', '--dir', dir]);
    assert.equal(r.code, 0, r.out);
    // Parse RFC4180 fields, including escaped double quotes.
    const rows = r.out.trim().split(/\r?\n/).map((line) => [...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)]
      .map((m) => m[1].startsWith('"') ? m[1].slice(1, -1).replace(/""/g, '"') : m[1]));
    assert.deepEqual(rows[0], ['Group', 'Estimate(h)', 'Actual(h)', 'Diff(h)']);
    assert.deepEqual(rows.find(([group]) => group === 'UI, "web"'), ['UI, "web"', '2.25', '4', '1.75']);
    assert.deepEqual(rows.at(-1), ['TOTAL', '12.75', '10.25', '-2.5']);
  });

  test('user/tag use full attribution while TOTAL counts each task once', (t) => {
    const dir = fixture(t);
    for (const [axis, key] of [['user', '@bob'], ['tag', '#shared']]) {
      const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--by', axis, '--dir', dir]);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, new RegExp(`\\| ${key} \\| 8 \\| 5\\.5 \\| -2\\.5 \\|`));
      assert.match(r.out, /\| \(none\) \| 2\.5 \| 0\.75 \| -1\.75 \|/);
      assert.match(r.out, /\| TOTAL \| 12\.75 \| 10\.25 \| -2\.5 \|/);
      assert.match(r.out, /小計の合計が TOTAL を超える/);
    }
  });

  test('inclusive date filtering keeps full estimates only for tasks with matching entries', (t) => {
    const dir = fixture(t);
    const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--from', '2026-01-31', '--to', '2026-02-01', '--dir', dir]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /2026-01-31 ～ 2026-02-01/);
    assert.match(r.out, /\| TOTAL \| 9\.5 \| 2\.75 \| -6\.75 \|/);
    assert.doesNotMatch(r.out, /Frontend|\(none\)/);
    for (const [flag, date] of [['--from', '2026-02-01'], ['--to', '2026-01-31']]) {
      const oneSided = node(ROOT, 'scripts/tasks.mjs', ['worklog', flag, date, '--dir', dir]);
      assert.equal(oneSided.code, 0, oneSided.out);
      assert.match(oneSided.out, flag === '--from' ? /\| TOTAL \| 10\.25 \| 6 \| -4\.25 \|/ : /\| TOTAL \| 9\.5 \| 4\.25 \| -5\.25 \|/);
    }
  });

  test('period groups entries by month and sorts ascending, including CSV and date filtering', (t) => {
    const dir = fixture(t);
    const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--by', 'period', '--dir', dir]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /\| Period \| Actual\(h\) \|\n\| --- \| --- \|\n\| 2026-01 \| 4\.25 \|\n\| 2026-02 \| 6 \|\n\| TOTAL \| 10\.25 \|/);
    const csv = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--by', 'period', '--from', '2026-02-01', '--csv', '--dir', dir]);
    assert.equal(csv.code, 0, csv.out);
    assert.equal(csv.out, 'Period,Actual(h)\n2026-02,6\nTOTAL,6\n');
  });

  test('unparseable estimates are excluded and counted once per task', (t) => {
    const dir = fixture(t);
    const p = join(dir, 'kanban.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace('**Estimate**: 8h', '**Estimate**: 1 day').replace('**Estimate**: 2.25', '**Estimate**: '));
    const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--by', 'user', '--dir', dir]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /\| TOTAL \| 2\.5 \| 10\.25 \| 7\.75 \|/);
    assert.match(r.out, /解析できない Estimate が 1 件あります/);
  });

  test('empty scope or empty date range produces a clear message or just CSV headers', (t) => {
    const dir = fixture(t);
    for (const extra of [['--from', '2027-01-01'], []]) {
      if (!extra.length) {
        writeFileSync(join(dir, 'kanban.md'), '# Board\n<!-- Format: v2 -->\n\n## Tasks\n');
        writeFileSync(join(dir, 'archive.md'), '# Task Archive\n\n## ✅ Archives\n');
      }
      const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', ...extra, '--dir', dir]);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /実績データがありません/);
      const csv = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--csv', ...extra, '--dir', dir]);
      assert.equal(csv.code, 0, csv.out);
      assert.equal(csv.out, 'Group,Estimate(h),Actual(h),Diff(h)\n');
    }
  });

  for (const [label, content] of [['zero-byte', ''], ['whitespace-only', ' \t\r\n\n ']]) {
    test(`${label} kanban stops aggregation even when archive has worklog`, (t) => {
      const dir = fixture(t);
      writeFileSync(join(dir, 'kanban.md'), content);
      const before = snapshot(dir);
      const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--csv', '--dir', dir]);
      assert.equal(r.code, 1, r.out);
      assert.match(r.stderr, /kanban\.md.*空/);
      assert.ok(r.stderr.includes(dir), r.stderr);
      assert.equal(r.out, r.stderr); // No CSV rows on stdout.
      assert.doesNotMatch(r.out, /TOTAL/);
      assert.deepEqual(snapshot(dir), before);
    });
  }

  test('invalid dates, missing values and unknown axes exit 2; help describes estimate filtering', (t) => {
    const dir = fixture(t);
    for (const args of [['--from', '2026-1-01'], ['--to', 'yesterday'], ['--from'], ['--by', 'other']]) {
      const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', ...args, '--dir', dir]);
      assert.equal(r.code, 2, r.out);
      assert.match(r.out, /指定してください/);
    }
    const help = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--help'], { MTM_CONFIG: join(dir, 'missing.json') });
    assert.equal(help.code, 0, help.out);
    assert.match(help.out, /Estimate は全量/);
  });

  test('duplicate IDs stop aggregation before parse problems; argument errors take priority', (t) => {
    const dir = fixture(t);
    const p = join(dir, 'archive.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace('TASK-003', 'TASK-001'));
    const before = snapshot(dir);
    const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--dir', dir]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.stderr, /TASK-001/);
    assert.match(r.stderr, /アーカイブ.*中断|中断.*アーカイブ/);
    assert.match(r.stderr, /重複.*修正|重複.*解消/);
    assert.doesNotMatch(r.out, /TOTAL/);
    assert.deepEqual(snapshot(dir), before);

    appendFileSync(p, '\nUnparseable archive content\n');
    const duplicate = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--dir', dir]);
    assert.equal(duplicate.code, 1, duplicate.out);
    assert.match(duplicate.stderr, /重複.*TASK-001/);
    assert.doesNotMatch(duplicate.out, /TOTAL|lossy-task/);
    const invalid = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--from', '2026-02-30', '--dir', dir]);
    assert.equal(invalid.code, 2, invalid.out);
    assert.match(invalid.stderr, /--from/);
    assert.doesNotMatch(invalid.out, /TASK-001|TOTAL/);
  });

  test('missing required kanban stops archive-only and non-existent folders', (t) => {
    const dir = fixture(t);
    rmSync(join(dir, 'kanban.md'));
    const before = snapshot(dir);
    for (const target of [dir, join(dir, 'missing')]) {
      for (const extra of [[], ['--csv']]) {
        const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', ...extra, '--dir', target]);
        assert.equal(r.code, 1, r.out);
        assert.match(r.stderr, /必須.*kanban\.md.*見つかりません/);
        assert.ok(r.stderr.includes(target), r.stderr);
        assert.equal(r.out, r.stderr); // No header or partial aggregate on stdout.
      }
    }
    const invalid = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--by', 'other', '--dir', dir]);
    assert.equal(invalid.code, 2, invalid.out);
    assert.match(invalid.stderr, /--by/);
    assert.deepEqual(snapshot(dir), before);
  });

  test('impossible Worklog dates in both files stop aggregation even outside the date filter', (t) => {
    const dir = fixture(t);
    for (const [file, date] of [['kanban.md', '2026-13-01'], ['archive.md', '2026-02-30']]) {
      const p = join(dir, file);
      writeFileSync(p, readFileSync(p, 'utf8').replace(/- 2026-\d{2}-\d{2} \| [\d.]+h \| example/, `- ${date} | 2h`));
    }
    const before = snapshot(dir);
    for (const extra of [[], ['--by', 'period'], ['--by', 'period', '--csv'], ['--to', '2026-01-01']]) {
      const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', ...extra, '--dir', dir]);
      assert.equal(r.code, 1, r.out);
      assert.match(r.stderr, /TASK-001.*2026-13-01/);
      assert.match(r.stderr, /TASK-003.*2026-02-30/);
      assert.equal(r.out, r.stderr); // No month rows or TOTAL on stdout.
    }
    assert.deepEqual(snapshot(dir), before);
  });

  test('unmeasured tasks produce no rows; explicit zero estimates and zero-hour logs still count', (t) => {
    const dir = fixture(t);
    for (const file of ['kanban.md', 'archive.md']) {
      const p = join(dir, file);
      writeFileSync(p, readFileSync(p, 'utf8')
        .replace(/^\*\*Estimate\*\*:.*\n/gm, '')
        .replace(/^\*\*Worklog\*\*:\n(?:- .*\n)*/gm, ''));
    }
    const before = snapshot(dir);
    for (const axis of ['category', 'user', 'tag', 'period']) {
      const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--by', axis, '--dir', dir]);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /実績データがありません/);
      assert.doesNotMatch(r.out, /\| TOTAL \|/);
      const csv = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--by', axis, '--csv', '--dir', dir]);
      assert.equal(csv.code, 0, csv.out);
      assert.equal(csv.out, axis === 'period' ? 'Period,Actual(h)\n' : 'Group,Estimate(h),Actual(h),Diff(h)\n');
    }
    assert.deepEqual(snapshot(dir), before);

    // archive.md is optional, and an explicit 0h is measured data.
    rmSync(join(dir, 'archive.md'));
    const p = join(dir, 'kanban.md');
    const unmeasured = readFileSync(p, 'utf8');
    for (const measurement of ['**Estimate**: 0h', '**Worklog**:\n- 2026-01-10 | 0h']) {
      writeFileSync(p, unmeasured.replace('**Tags**: #feature #shared', `**Tags**: #feature #shared\n${measurement}`));
      for (const axis of ['category', 'user', 'tag']) {
        const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--by', axis, '--csv', '--dir', dir]);
        assert.equal(r.code, 0, r.out);
        assert.match(r.out, /TOTAL,0,0,0\n/);
        assert.doesNotMatch(r.out, /Frontend|\(none\)/);
      }
    }
  });

  test('unparseable Worklog rows in either file stop aggregation with problems on stderr', (t) => {
    const dir = fixture(t);
    for (const file of ['kanban.md', 'archive.md']) {
      const p = join(dir, file);
      const original = readFileSync(p, 'utf8');
      writeFileSync(p, original.replace(/- 2026-\d{2}-\d{2} \| [\d.]+h \| example/, '- 2026-11-20 | 2 h | x'));
      const before = snapshot(dir);
      const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--dir', dir]);
      assert.equal(r.code, 1, r.out);
      assert.ok(r.stderr.includes(file), r.stderr);
      assert.match(r.stderr, /lossy-task/);
      assert.match(r.stderr, /2026-11-20 \| 2 h \| x/);
      assert.doesNotMatch(r.out, /TOTAL/);
      assert.deepEqual(snapshot(dir), before);
      writeFileSync(p, original);
    }
  });

  test('non-UTF-8 input in either file stops aggregation without changing files', (t) => {
    const dir = fixture(t);
    for (const file of ['kanban.md', 'archive.md']) {
      const p = join(dir, file);
      const original = readFileSync(p);
      writeFileSync(p, Buffer.from([0x82, 0xa0])); // Shift_JIS, invalid UTF-8.
      const before = snapshot(dir);
      const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--dir', dir]);
      assert.equal(r.code, 1, r.out);
      assert.ok(r.stderr.includes(file), r.stderr);
      assert.match(r.stderr, /UTF-8 ではありません/);
      assert.doesNotMatch(r.out, /TOTAL/);
      assert.deepEqual(snapshot(dir), before);
      writeFileSync(p, original);
    }
  });

  test('estimate-only tasks appear for category/user/tag, but not periods or date filters', (t) => {
    const dir = fixture(t);
    const p = join(dir, 'kanban.md');
    writeFileSync(p, readFileSync(p, 'utf8').split('### TASK-002')[0]
      .replace(/\*\*Worklog\*\*:[\s\S]*$/, ''));
    writeFileSync(join(dir, 'archive.md'), '# Task Archive\n\n## ✅ Archives\n');
    const before = snapshot(dir);
    for (const [axis, key] of [['category', 'Backend'], ['user', '@alice'], ['tag', '#feature']]) {
      const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--by', axis, '--dir', dir]);
      assert.equal(r.code, 0, r.out);
      assert.ok(r.out.includes(`| ${key} | 8 | 0 | -8 |`), r.out);
      assert.match(r.out, /\| TOTAL \| 8 \| 0 \| -8 \|/);
      assert.doesNotMatch(r.out, /実績データがありません/);
      const csv = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--by', axis, '--csv', '--dir', dir]);
      assert.equal(csv.code, 0, csv.out);
      assert.ok(csv.out.includes(`${key},8,0,-8\n`), csv.out);
      assert.match(csv.out, /TOTAL,8,0,-8\n/);
    }
    for (const extra of [['--by', 'period'], ['--from', '2026-01-01'], ['--to', '2026-12-31']]) {
      const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', ...extra, '--dir', dir]);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /実績データがありません/);
      assert.doesNotMatch(r.out, /TOTAL/);
      const csv = node(ROOT, 'scripts/tasks.mjs', ['worklog', ...extra, '--csv', '--dir', dir]);
      assert.equal(csv.code, 0, csv.out);
      assert.equal(csv.out, extra.includes('period') ? 'Period,Actual(h)\n' : 'Group,Estimate(h),Actual(h),Diff(h)\n');
    }
    assert.deepEqual(snapshot(dir), before);
  });

  test('date bounds must be real dates in ascending order; valid ranges still aggregate', (t) => {
    const dir = fixture(t);
    for (const args of [
      ['--from', '2026-02-30'], ['--to', '2026-02-30'],
      ['--from', '2026-11-23', '--to', '2026-11-01'],
    ]) {
      const r = node(ROOT, 'scripts/tasks.mjs', ['worklog', ...args, '--dir', dir]);
      assert.equal(r.code, 2, r.out);
      assert.match(r.stderr, /--from|--to/);
      assert.doesNotMatch(r.out, /TOTAL/);
    }
    const valid = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--from', '2026-01-10', '--to', '2026-02-02', '--dir', dir]);
    assert.equal(valid.code, 0, valid.out);
    assert.match(valid.out, /\| TOTAL \| 11\.75 \| 10\.25 \| -1\.5 \|/);
    const sameDay = node(ROOT, 'scripts/tasks.mjs', ['worklog', '--from', '2026-02-01', '--to', '2026-02-01', '--dir', dir]);
    assert.equal(sameDay.code, 0, sameDay.out);
    assert.match(sameDay.out, /\| TOTAL \| 8 \| 2 \| -6 \|/);
  });
});

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
    writeFileSync(join(proj, 'build.mjs'), 'setTimeout(() => {}, 30000); // a build that takes long\n');
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

describe('review round 7 (ops)', () => {
  const noEnv = { MTM_APP_DIR: '', MTM_DATA_DIR: '', MTM_BACKUP_DIR: '' };

  test('tasks next-id / check: a UTF-16 archive.md WITHOUT a BOM is not UTF-8 either (round 7: review 1)', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'kanban.md'), '# B\n<!-- Config: Last Task ID: 3 -->\n<!-- Format: v2 -->\n\n## ⚙️ Configuration\n\n**Columns**: To Do (todo) | Done (done)\n\n---\n\n## Tasks\n\n### TASK-003 | c\n**Status**: todo\n');
    writeFileSync(join(dir, 'archive.md'), Buffer.from('# Task Archive\n<!-- Format: v2 -->\n\n## Archives\n\n### TASK-004 | d\n**Status**: done\n', 'utf16le'));
    const r = node(ROOT, 'scripts/tasks.mjs', ['next-id', '--dir', dir]);
    assert.equal(r.code, 1, r.out);
    assert.doesNotMatch(r.out, /TASK-00\d/);
    const c = node(ROOT, 'scripts/tasks.mjs', ['check', '--dir', dir]);
    assert.equal(c.code, 1, c.out);
    assert.match(c.out, /archive\.md: UTF-8 ではありません/);
  });

  // On Windows, child.kill('SIGTERM' / 'SIGINT') ends the process at once (TerminateProcess): no handler
  // runs there, so the link cannot be removed by the script (see docs/ja/OPERATIONS.md).
  const winKill = isWin && 'Windows: child.kill() terminates the process forcibly, the signal handlers never run';
  test('restore:verify --reuse-node-modules: a signal sent to the script alone stops it at once (round 7: review 2)', { skip: winKill, timeout: 180000 }, async () => {
    const proj = projectCopy();
    // A slow build that writes its process id (it runs in the restore folder).
    writeFileSync(join(proj, 'build.mjs'), "import { writeFileSync } from 'node:fs';\nwriteFileSync('build.pid', String(process.pid));\nsetTimeout(() => {}, 20000);\n");
    const out = tmp();
    assert.equal(node(proj, 'scripts/backup.mjs', ['--out', out], { ...noEnv, MTM_CONFIG: join(proj, 'none.json') }).code, 0);
    const zip = join(out, readdirSync(out).find((n) => n.endsWith('.zip')));
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    for (const sig of ['SIGTERM', 'SIGINT']) {
      const dest = join(tmp(), 'restore');
      const child = spawn(process.execPath, ['scripts/verify-restore.mjs', zip, '--reuse-node-modules', '--dest', dest], { cwd: proj, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', (d) => { output += d; });
      child.stderr.on('data', (d) => { output += d; });
      const exited = new Promise((res) => child.on('exit', (code, signal) => res({ code, signal, at: Date.now() })));
      const deadline = Date.now() + 60000;
      while (!existsSync(join(dest, 'build.pid')) && Date.now() < deadline) await new Promise((res) => setTimeout(res, 50));
      const buildPid = Number(readFileSync(join(dest, 'build.pid'), 'utf8'));
      assert.ok(existsSync(join(dest, 'node_modules')), 'the link was made');
      const sent = Date.now();
      child.kill(sig); // to the script only (not to its process group)
      const r = await exited;
      assert.ok(r.at - sent < 5000, `${sig}: ended ${r.at - sent} ms after the signal (not after the build)`);
      assert.notEqual(r.code, 0, `${sig}: ${output}`);
      assert.doesNotMatch(output, /復元確認 OK/);
      assert.match(output, /中断/);
      assert.ok(!existsSync(join(dest, 'node_modules')), `${sig}: the node_modules link was removed`);
      await new Promise((res) => setTimeout(res, 300));
      assert.equal(alive(buildPid), false, `${sig}: the build was stopped too`);
    }
    assert.ok(existsSync(join(ROOT, 'node_modules', 'html-minifier-terser')), 'the dev node_modules is intact');
  });

  test('--check-build records no part of a temporary folder whose path has spaces (round 7: review 3)', () => {
    const proj = projectCopy();
    const temp = join(tmp(), 'Users', 'Taro Yamada', 'AppData Local', 'Temp'); // e.g. a Windows user folder
    mkdirSync(temp, { recursive: true });
    for (const extra of [[], ['--release']]) {
      const out = tmp();
      const r = node(proj, 'scripts/backup.mjs', ['--check-build', ...extra, '--out', out], { ...noEnv, MTM_CONFIG: join(proj, 'none.json'), TMPDIR: temp, TMP: temp, TEMP: temp });
      assert.equal(r.code, 0, r.out);
      const entries = readZip(join(out, readdirSync(out).find((n) => n.endsWith('.zip'))));
      const m = JSON.parse(entries.find((e) => e.name === '_backup_info/manifest.json').data.toString('utf8'));
      assert.equal(m.build.check.ok, true, m.build.check.output);
      assert.match(m.build.check.output, /Built <一時フォルダー>[\\/]task-manager\.html /);
      for (const t of [m.build.check.output, entries.find((e) => e.name === '_backup_info/README-RESTORE.md').data.toString('utf8')]) {
        assert.doesNotMatch(t, /Taro|Yamada|AppData|mtm-buildcheck-/, `${extra.join(' ')}: ${t}`);
      }
    }
  });

  test('with an unreadable configuration, folders holding only backups / exports of the task files are left out too (round 7: review note)', () => {
    const proj = projectCopy();
    mkdirSync(join(proj, 'old-data'));
    writeFileSync(join(proj, 'old-data', 'kanban.v1-backup.md'), '# 旧形式の退避\n');
    mkdirSync(join(proj, 'exports'));
    writeFileSync(join(proj, 'exports', 'kanban.unsaved-20261101-101500.md'), '# 未保存分\n');
    mkdirSync(join(proj, 'Data'));
    writeFileSync(join(proj, 'Data', 'Archive.md'), '# Archive\n'); // case differs (Windows)
    writeFileSync(join(proj, 'local.config.json'), '{ "dataDir": ');
    const out = tmp();
    const r = node(proj, 'scripts/backup.mjs', ['--out', out], { ...noEnv, MTM_CONFIG: '' });
    assert.equal(r.code, 0, r.out);
    const names = readZip(join(out, readdirSync(out).find((n) => n.endsWith('.zip')))).map((e) => e.name);
    for (const never of ['old-data/', 'exports/', 'Data/']) assert.ok(!names.some((n) => n.startsWith(never)), never);
    for (const must of ['kanban.md', 'archive.md', 'examples/kanban.md', 'src/scripts/04-format.js']) assert.ok(names.includes(must), must);
  });
});


describe('review round 8 (ops)', () => {
  const noEnv = { MTM_APP_DIR: '', MTM_DATA_DIR: '', MTM_BACKUP_DIR: '' };
  const winSignals = isWin && 'Windows: child.kill() terminates the process forcibly, the signal handlers never run';
  // The tests with 20000 files remove what they made (the project copy, the ZIP, the restore folder).
  const removeAll = (...dirs) => dirs.filter(Boolean).forEach((d) => { try { rmSync(d, { recursive: true, force: true }); } catch { /* gone */ } });
  const restoreDirOf = (output) => { const m = output.match(/展開先: (.+)\n/); return m ? m[1].trim() : null; };
  const zipIn = (out) => join(out, readdirSync(out).find((n) => n.endsWith('.zip')));
  const backupOf = (proj) => {
    const out = tmp();
    const r = node(proj, 'scripts/backup.mjs', ['--out', out], { ...noEnv, MTM_CONFIG: join(proj, 'none.json') });
    assert.equal(r.code, 0, r.out);
    return zipIn(out);
  };
  // restore:verify in the background → { child, output(), exited }.
  const verifyInBackground = (proj, args, env = {}) => {
    const child = spawn(process.execPath, ['scripts/verify-restore.mjs', ...args], { cwd: proj, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
    let output = '';
    const listeners = [];
    const onData = (d) => { output += d; listeners.forEach((f) => f(output)); };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const exited = new Promise((res) => child.on('close', (code, signal) => res({ code, signal, at: Date.now() })));
    return { child, output: () => output, onOutput: (f) => listeners.push(f), exited };
  };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

  test('restore:verify: a signal during the work after the build (checks, removing the temporary folder) ends it with NG, not OK (round 8: review 低-2)', { skip: winSignals, timeout: 240000 }, async () => {
    const proj = projectCopy();
    // Many files: removing the extracted copy takes a while, like an installed node_modules.
    mkdirSync(join(proj, 'bulk'));
    for (let i = 0; i < 20000; i++) writeFileSync(join(proj, 'bulk', `f${i}.txt`), `${i}\n`);
    const zip = backupOf(proj);
    const temp = tmp('mtm-verify-tmp-');
    try {
      const v = verifyInBackground(proj, [zip, '--reuse-node-modules'], { TMPDIR: temp, TMP: temp, TEMP: temp });
      let sent = null;
      // "ビルド: 成功" is printed after the build has ended: the script is in its checks / the removal.
      v.onOutput((o) => { if (sent === null && /ビルド: 成功/.test(o)) sent = v.child.kill('SIGTERM'); });
      const r = await v.exited;
      assert.equal(sent, true, `the signal reached the running script:\n${v.output()}`);
      assert.doesNotMatch(v.output(), /復元確認 OK/);
      assert.match(v.output(), /中断されました（SIGTERM）/);
      assert.equal(r.code, 143, v.output());
    } finally {
      removeAll(dirname(proj), dirname(zip), temp);
    }
  });

  test('restore:verify: a check that fails after a signal arrived during synchronous work still ends with 128 + the signal number (round 8: review 低-2)', { skip: winSignals, timeout: 240000 }, async () => {
    const proj = projectCopy();
    mkdirSync(join(proj, 'bulk'));
    for (let i = 0; i < 20000; i++) writeFileSync(join(proj, 'bulk', `f${i}.txt`), `${i}\n`);
    const good = backupOf(proj);
    // The same ZIP with one file changed: the SHA-256 check after the (long, synchronous) extraction fails.
    const entries = readZip(good).map((e) => (e.name === 'bulk/f19999.txt' ? { ...e, data: Buffer.from('changed\n') } : e));
    const zip = join(tmp(), 'changed.zip');
    writeZip(zip, entries);
    let v = null;
    try {
      v = verifyInBackground(proj, [zip, '--reuse-node-modules']);
      let sent = null;
      // "展開先:" is printed right before the extraction of the 20000 files starts.
      v.onOutput((o) => { if (sent === null && /展開先: /.test(o)) sent = v.child.kill('SIGTERM'); });
      const r = await v.exited;
      assert.equal(sent, true, v.output());
      assert.match(v.output(), /SHA-256 が一致しません: bulk\/f19999\.txt/, 'the check itself failed');
      assert.match(v.output(), /中断されました（SIGTERM）/);
      assert.equal(r.code, 143, v.output());
    } finally {
      removeAll(dirname(proj), dirname(good), dirname(zip), v && restoreDirOf(v.output()));
    }
  });

  test('restore:verify: a step that ignores SIGTERM is killed; nothing is left running after the script (round 8: review 低-3)', { skip: winSignals, timeout: 120000 }, async () => {
    const proj = projectCopy();
    writeFileSync(join(proj, 'build.mjs'), "import { writeFileSync } from 'node:fs';\nwriteFileSync('build.pid', String(process.pid));\nprocess.on('SIGTERM', () => {});\nsetTimeout(() => writeFileSync('late-write.txt', 'x'), 6000);\n");
    const zip = backupOf(proj);
    const dest = join(tmp(), 'restore');
    const v = verifyInBackground(proj, [zip, '--reuse-node-modules', '--dest', dest]);
    const deadline = Date.now() + 60000;
    while (!existsSync(join(dest, 'build.pid')) && Date.now() < deadline) await new Promise((res) => setTimeout(res, 50));
    await new Promise((res) => setTimeout(res, 100)); // the build has installed its SIGTERM handler
    const buildPid = Number(readFileSync(join(dest, 'build.pid'), 'utf8'));
    assert.ok(buildPid > 0, 'the build wrote its process id'); // never kill(0): that is the whole process group
    try {
      const sent = Date.now();
      v.child.kill('SIGTERM');
      const r = await v.exited;
      assert.equal(r.code, 143, v.output());
      assert.match(v.output(), /中断されました（SIGTERM）/);
      assert.ok(r.at - sent < 5500, `ended ${r.at - sent} ms after the signal`);
      assert.ok(r.at - sent >= 2500, `the build ignored SIGTERM, so it was stopped only after the grace period (${r.at - sent} ms)`);
      assert.equal(alive(buildPid), false, 'the build that ignored SIGTERM is not left running');
      assert.ok(!existsSync(join(dest, 'node_modules')), 'the link was removed');
    } finally {
      if (buildPid > 0) try { process.kill(buildPid, 'SIGKILL'); } catch { /* already gone */ }
    }
  });

  test('restore:verify: a character split between two chunks of a step\'s output stays one character (round 8: review 低-4)', { timeout: 120000 }, () => {
    const proj = projectCopy();
    // A failing build. Before its last lines it prints 20 lines of 90 KB; each of the last three lines is
    // written in two parts cut INSIDE its last character, with a pause between them, so the script
    // reads them as two separate chunks (a chunk turned into a string on its own gives U+FFFD).
    writeFileSync(join(proj, 'build.mjs'), [
      "const sleep = (ms) => new Promise((r) => setTimeout(r, ms));",
      "const big = 'あ'.repeat(30000);",
      "for (let i = 0; i < 20; i++) process.stdout.write(`${i}:${big}\\n`);",
      "await sleep(200);",
      "for (const text of ['境目1: あいう\\n', '境目2: かきく\\n', '境目3: さしす\\n']) {",
      "  const b = Buffer.from(text);",
      "  process.stdout.write(b.subarray(0, b.length - 2)); // 2 of the 3 bytes of the last character",
      "  await sleep(150);",
      "  process.stdout.write(b.subarray(b.length - 2));",
      "  await sleep(150);",
      "}",
      "process.stdout.write('最後の行: ビルド失敗（テスト）\\n');",
      "process.exitCode = 1;",
    ].join('\n') + '\n');
    const zip = backupOf(proj);
    const r = node(proj, 'scripts/verify-restore.mjs', [zip, '--reuse-node-modules']);
    assert.equal(r.code, 1, r.out.slice(-2000));
    assert.match(r.out, /ビルドに失敗しました/);
    assert.ok(!r.out.includes('\uFFFD'), `no character was split into U+FFFD:\n${r.out.slice(-300)}`);
    for (const line of ['境目1: あいう', '境目2: かきく', '境目3: さしす', '最後の行: ビルド失敗（テスト）']) assert.ok(r.out.includes(line), line);
    // The failure message shows the end only (written right before exit, a long one was cut off).
    assert.ok(r.out.length < 8000, `only the end of the output is shown (${r.out.length} characters printed)`);
  });

  test('restore:verify: only the end of a step\'s output is kept (more output than a string can hold) (round 8: review 低-4)', { timeout: 180000 }, () => {
    const proj = projectCopy();
    // About 630 M characters: more than the longest JavaScript string (about 537 M in V8). Kept whole,
    // the output cannot be collected at all (RangeError: Invalid string length).
    writeFileSync(join(proj, 'build.mjs'), "const mb = 'x'.repeat(1023) + '\\n';\nconst chunk = mb.repeat(1024);\nfor (let i = 0; i < 600; i++) process.stdout.write(chunk);\nprocess.stdout.write('最後の行: ビルド失敗（大量の出力）\\n');\nprocess.exitCode = 1;\n");
    const zip = backupOf(proj);
    const r = node(proj, 'scripts/verify-restore.mjs', [zip, '--reuse-node-modules']);
    assert.equal(r.code, 1, r.out.slice(-2000));
    assert.match(r.out, /ビルドに失敗しました/, r.out.slice(-2000));
    assert.match(r.out, /最後の行: ビルド失敗（大量の出力）/);
    assert.doesNotMatch(r.out, /Invalid string length/);
  });

  test('with an unreadable configuration, copies of the task files ("kanban - コピー.md", OneDrive conflict copies) are left out too (round 8: review 低-5)', () => {
    const proj = projectCopy();
    const boardMd = readFileSync(join(ROOT, 'kanban.md'), 'utf8');
    const copies = { copy1: 'kanban - コピー.md', copy2: 'kanban-DESKTOP-ABC123.md', copy3: 'kanban (2).md', copy4: 'Archive - Copy.md' };
    for (const [d, f] of Object.entries(copies)) { mkdirSync(join(proj, d)); writeFileSync(join(proj, d, f), d === 'copy4' ? readFileSync(join(ROOT, 'examples', 'archive.md'), 'utf8') : boardMd); }
    mkdirSync(join(proj, 'copy5'));
    // Saved as UTF-16; a lower-case name that no copy-name rule takes: only the content check finds it.
    writeFileSync(join(proj, 'copy5', 'kanban-old16.md'), Buffer.from(boardMd, 'utf16le'));
    // The usual copy names count whatever the content (also empty or a dummy text).
    const byName = { copy6: ['kanban - コピー.md', 'x\n'], copy7: ['Copy of kanban.md', ''], copy8: ['kanban - Copy (2).md', 'x'], copy9: ['archive-LAPTOP-7K3Q9ZX.md', ''], copy10: ['kanban copy 2.md', 'x'] };
    for (const [d, [f, text]] of Object.entries(byName)) { mkdirSync(join(proj, d)); writeFileSync(join(proj, d, f), text); }
    mkdirSync(join(proj, 'copy11'));
    writeFileSync(join(proj, 'copy11', 'kanban-old.md'), '# Old\n\n## TASK-001 | h2 header\n'); // task header written as h2
    // Not task files: a note whose name starts with "kanban", a picture.
    mkdirSync(join(proj, 'notes'));
    writeFileSync(join(proj, 'notes', 'kanban-ideas.md'), '# カンバンの改善案\n\n- 列の色\n');
    writeFileSync(join(proj, 'notes', 'archive-policy.md'), '# アーカイブの方針\n'); // lower case after "-": not a PC name
    writeFileSync(join(proj, 'notes', 'kanban-API.md'), '# API のメモ\n'); // capitals, but not like a PC name
    writeFileSync(join(proj, 'notes', 'archive-2025.md'), '# 2025 年の振り返り\n');
    writeFileSync(join(proj, 'notes', 'archive-Q1-2025.md'), '# 第 1 四半期\n');
    writeFileSync(join(proj, 'notes', 'kanban-TODO-LIST.md'), '# やること\n');
    mkdirSync(join(proj, 'copy12'));
    writeFileSync(join(proj, 'copy12', 'archive-2025.md'), readFileSync(join(ROOT, 'examples', 'archive.md'), 'utf8')); // a yearly archive: its content decides
    writeFileSync(join(proj, 'local.config.json'), '{ "dataDir": ');
    const out = tmp();
    const r = node(proj, 'scripts/backup.mjs', ['--out', out], { ...noEnv, MTM_CONFIG: '' });
    assert.equal(r.code, 0, r.out);
    const names = readZip(zipIn(out)).map((e) => e.name);
    for (const d of ['copy1/', 'copy2/', 'copy3/', 'copy4/', 'copy5/', 'copy6/', 'copy7/', 'copy8/', 'copy9/', 'copy10/', 'copy11/', 'copy12/']) assert.ok(!names.some((n) => n.startsWith(d)), d);
    for (const must of ['notes/kanban-ideas.md', 'notes/archive-policy.md', 'notes/kanban-API.md', 'notes/archive-2025.md', 'notes/archive-Q1-2025.md', 'notes/kanban-TODO-LIST.md', 'docs/images/kanban-board.jpg', 'docs/ja/SAFETY.md', 'src/scripts/04-format.js', 'tests/unit/format.test.mjs',
      '.claude/skills/markdown-task-manager/SKILL.md', 'examples/kanban.md', 'kanban.md', 'archive.md']) assert.ok(names.includes(must), must);
    assert.match(r.out, /運用データの可能性があるため除外: copy1\//);
  });

  const kanbanWith = (extra) => `# B\n<!-- Config: Last Task ID: 3 -->\n<!-- Format: v2 -->\n\n## ⚙️ Configuration\n\n**Columns**: To Do (todo) | Done (done)\n\n---\n\n## Tasks\n\n### TASK-003 | c\n**Status**: todo\n${extra}`;

  test('tasks check: a NUL in UTF-8 text is reported with its line (not "not UTF-8"); no new id is handed out while it is there (round 8: review 中-1)', () => {
    const dir = tmp();
    const text = kanbanWith('\nbefore\0after\n');
    writeFileSync(join(dir, 'kanban.md'), text);
    const line = text.split('\n').findIndex((l) => l.includes('\0')) + 1;
    const c = node(ROOT, 'scripts/tasks.mjs', ['check', '--dir', dir]);
    assert.equal(c.code, 1, c.out);
    assert.match(c.out, new RegExp(`kanban\\.md: NUL 文字.*${line} 行目にあります（全 1 個）`));
    assert.match(c.out, new RegExp(`${line}: before␀after`));
    assert.doesNotMatch(c.out, /kanban\.md: UTF-8 ではありません/);
    assert.match(c.out, /\[NG\]/);
    assert.match(c.out, /次の ID: （NUL 文字のあるファイルがあるため決められません）/);
    const n = node(ROOT, 'scripts/tasks.mjs', ['next-id', '--dir', dir]);
    assert.equal(n.code, 1, n.out);
    assert.match(n.out, /\[停止\] kanban\.md に NUL 文字があります/);
    assert.doesNotMatch(n.out, /TASK-00\d/);
    // A damaged archive.md whose end was overwritten with NULs: the ids that were there are unknown.
    const dir2 = tmp();
    writeFileSync(join(dir2, 'kanban.md'), readFileSync(join(ROOT, 'examples', 'kanban.md')));
    const arch = readFileSync(join(ROOT, 'examples', 'archive.md'));
    const cut = arch.indexOf(0x0a, arch.length >> 1) + 1; // at a line break (never inside a character)
    writeFileSync(join(dir2, 'archive.md'), Buffer.concat([arch.subarray(0, cut), Buffer.alloc(arch.length - cut)]));
    const n2 = node(ROOT, 'scripts/tasks.mjs', ['next-id', '--dir', dir2]);
    assert.equal(n2.code, 1, n2.out);
    assert.match(n2.out, /archive\.md に NUL 文字があります/);
    assert.doesNotMatch(n2.out, /TASK-\d/);
    // The same, with the NULs starting inside a Japanese character (the usual case for a crash).
    const dir3 = tmp();
    writeFileSync(join(dir3, 'kanban.md'), readFileSync(join(ROOT, 'examples', 'kanban.md')));
    const ja = Buffer.from(readFileSync(join(ROOT, 'archive.md'), 'utf8') + '\n### TASK-001 | 売上の集計\n**Status**: done\n\n請求書を確認する\n');
    const inside = ja.indexOf(Buffer.from('請')) + 1;
    writeFileSync(join(dir3, 'archive.md'), Buffer.concat([ja.subarray(0, inside), Buffer.alloc(200)]));
    const c3 = node(ROOT, 'scripts/tasks.mjs', ['check', '--dir', dir3]);
    assert.match(c3.out, /archive\.md: NUL 文字.*行目にあります/);
    assert.doesNotMatch(c3.out, /archive\.md: UTF-8 ではありません/, 'not "save it again as UTF-8"');
    assert.match(c3.out, /次の ID: （NUL 文字のあるファイルがあるため決められません）/);
    // The guidance names the rest of the cut character ("�" next to "␀"), and it is right: deleting only
    // the NUL bytes leaves a broken character ("not UTF-8"), deleting that rest too repairs the file.
    assert.match(c3.out, /␀ のすぐ隣の � は NUL で切れた文字の残り/);
    assert.match(c3.out, /\d+: 請?\uFFFD\u2400/);
    const cutBytes = readFileSync(join(dir3, 'archive.md'));
    const nulsOnly = cutBytes.subarray(0, cutBytes.indexOf(0));
    writeFileSync(join(dir3, 'archive.md'), nulsOnly);
    assert.match(node(ROOT, 'scripts/tasks.mjs', ['check', '--dir', dir3]).out, /archive\.md: UTF-8 ではありません/);
    writeFileSync(join(dir3, 'archive.md'), nulsOnly.subarray(0, nulsOnly.length - 1)); // the 1 byte left of "請"
    const fixed = node(ROOT, 'scripts/tasks.mjs', ['check', '--dir', dir3]);
    assert.doesNotMatch(fixed.out, /archive\.md: (UTF-8 ではありません|NUL 文字)/, fixed.out);
    assert.match(fixed.out, /次の ID: TASK-\d+/);
    // A NUL in a task's text shows as "␀" in the warning lines too (no raw NUL on the terminal).
    const dir4 = tmp();
    writeFileSync(join(dir4, 'kanban.md'), kanbanWith('').replace('**Status**: todo', '**Status**: to\0do'));
    const c4 = node(ROOT, 'scripts/tasks.mjs', ['check', '--dir', dir4]);
    assert.match(c4.out, /unknown-status: TASK-003: to\u2400do/);
    assert.ok(!c4.out.includes('\0'), 'no raw NUL is printed');
    const s4 = node(ROOT, 'scripts/tasks.mjs', ['show', 'TASK-003', '--dir', dir4]);
    assert.match(s4.out, /\*\*Status\*\*: to\u2400do/);
    assert.ok(!s4.out.includes('\0'), 'show prints no raw NUL either');
  });

  test('guard: tasks check / next-id: UTF-16BE without a BOM is still not UTF-8 (round 8: review 中-1)', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'kanban.md'), Buffer.from(kanbanWith(''), 'utf16le').swap16());
    const c = node(ROOT, 'scripts/tasks.mjs', ['check', '--dir', dir]);
    assert.equal(c.code, 1, c.out);
    assert.match(c.out, /kanban\.md: UTF-8 ではありません/);
    assert.doesNotMatch(c.out, /NUL 文字（U\+0000/, 'its NULs are part of "not UTF-8"');
    const n = node(ROOT, 'scripts/tasks.mjs', ['next-id', '--dir', dir]);
    assert.equal(n.code, 1, n.out);
    assert.doesNotMatch(n.out, /TASK-00\d/);
  });
});
