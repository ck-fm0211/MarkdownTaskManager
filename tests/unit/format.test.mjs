// Unit tests for the Markdown format layer (parse / generate / loss detection / search).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFormat } from '../../scripts/lib/format.mjs';

const F = loadFormat();
const plain = (x) => JSON.parse(JSON.stringify(x));

const JA_BOARD = `# 業務ボード

<!-- Config: Last Task ID: 3 -->
<!-- Format: v2 -->

## ⚙️ Configuration

**Columns**: 📝 未着手 (todo) | 🚀 作業中 (doing) | ✅ 完了 (done)

**Categories**: 開発, 調査

**Users**: @yamada (山田), @suzuki

**Priorities**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

**Tags**: #バグ #改善

---

## Tasks

### TASK-001 | ログイン画面の修正 🔐
**Status**: doing
**Priority**: High | **Category**: 開発 | **Assigned**: @yamada (山田), @suzuki
**Created**: 2026-01-05 | **Started**: 2026-01-06 | **Due**: 2026-01-31
**Tags**: #バグ #認証 #UI改善

説明の1行目です。**太字** と \`code\` と [リンク](https://example.com)。

  - インデントされた行
2段落目（空行を挟む）😀

**Subtasks**:
- [x] 原因調査
- [ ] 修正 ✨

**Notes**:
**結果**:
- 対応済み
\`\`\`js
const a = 1;
\`\`\`

### TASK-002 | カテゴリなし
**Status**: todo
**Priority**: Critical
**Created**: 2026-02-01

### TASK-003 | 優先度とカテゴリなし
**Status**: done
**Assigned**: @suzuki
**Created**: 2026-02-02 | **Finished**: 2026-02-03
`;

test('Japanese board: parse → generate → parse keeps every field', () => {
  const a = F.parseKanbanContent(JA_BOARD);
  assert.deepEqual(plain(a.problems), []);
  assert.equal(a.tasks.length, 3);
  const t1 = a.tasks[0];
  assert.equal(t1.title, 'ログイン画面の修正 🔐');
  assert.equal(t1.status, 'doing');
  assert.equal(t1.priority, 'High');
  assert.equal(t1.category, '開発');
  assert.deepEqual(plain(t1.assignees), ['@yamada (山田)', '@suzuki']);
  assert.deepEqual(plain(t1.tags), ['#バグ', '#認証', '#UI改善']);
  assert.match(t1.description, /2段落目/);
  assert.match(t1.description, /\n\n {2}- インデントされた行/);
  assert.deepEqual(plain(t1.subtasks), [{ completed: true, text: '原因調査' }, { completed: false, text: '修正 ✨' }]);
  assert.match(t1.notes, /const a = 1;/);
  assert.equal(a.config.boardTitle, '業務ボード');
  assert.deepEqual(plain(a.config.tags), ['バグ', '改善']);

  const md = F.generateKanbanContent(a.config, a.tasks);
  const b = F.parseKanbanContent(md);
  assert.deepEqual(plain(b.tasks), plain(a.tasks));
  assert.deepEqual(plain(b.config), plain(a.config));
  assert.deepEqual(plain(b.problems), []);
  // Generation is a fixed point.
  assert.equal(F.generateKanbanContent(b.config, b.tasks), md);
});

test('priority without category is kept (upstream issue #19), for every priority', () => {
  for (const p of ['Critical', 'High', 'Medium', 'Low', '緊急']) {
    for (const withCat of [true, false]) {
      const meta = withCat ? `**Priority**: ${p} | **Category**: 開発` : `**Priority**: ${p}`;
      const md = `# B\n<!-- Format: v2 -->\n\n## Tasks\n\n### TASK-001 | t\n**Status**: todo\n${meta}\n`;
      const a = F.parseKanbanContent(md);
      assert.equal(a.tasks[0].priority, p, `${p} withCat=${withCat}`);
      assert.equal(a.tasks[0].category, withCat ? '開発' : '');
      const again = F.parseKanbanContent(F.generateKanbanContent(a.config, a.tasks));
      assert.equal(again.tasks[0].priority, p);
      assert.equal(again.tasks[0].category, withCat ? '開発' : '');
    }
  }
});

test('category-only and assignee-only metadata round-trip', () => {
  const md = `# B\n<!-- Format: v2 -->\n\n## Tasks\n\n### TASK-001 | t\n**Status**: todo\n**Category**: 調査 | **Assigned**: @a\n`;
  const a = F.parseKanbanContent(md);
  assert.equal(a.tasks[0].category, '調査');
  assert.deepEqual(plain(a.tasks[0].assignees), ['@a']);
  const gen = F.generateKanbanContent(a.config, a.tasks);
  assert.match(gen, /^\*\*Category\*\*: 調査 \| \*\*Assigned\*\*: @a$/m);
});

test('emoji-prefixed priority written by hand is normalised to the config value', () => {
  const md = `# B\n<!-- Format: v2 -->\n\n## Tasks\n\n### TASK-001 | t\n**Status**: todo\n**Priority**: 🔴 Critical\n`;
  const a = F.parseKanbanContent(md);
  assert.equal(a.tasks[0].priority, 'Critical');
  assert.deepEqual(plain(a.problems), []);
});

test('lossy content is reported instead of being silently dropped', () => {
  const md = `# B\n<!-- Format: v2 -->\n\n## Tasks\n\n### TASK-001 | t\n**Status**: todo\n\n**Subtasks**:\n- [ ] a\n  補足メモ（チェックボックスでない行）\n\n**Notes**:\nn\n`;
  const a = F.parseKanbanContent(md);
  assert.equal(a.problems.length, 1);
  assert.equal(a.problems[0].code, 'lossy-task');
  assert.deepEqual(plain(a.problems[0].lines), ['補足メモ（チェックボックスでない行）']);
});

test('malformed task headers and unknown content block saving', () => {
  const md = `# B\n<!-- Format: v2 -->\nメモ行\n\n## Tasks\n\n### TASK-ABC | bad\n### TASK-002 | ok\n**Status**: todo\n`;
  const a = F.parseKanbanContent(md);
  const codes = plain(a.problems.map((p) => p.code).sort());
  assert.deepEqual(codes, ['malformed-task-header', 'text-outside-task', 'unknown-header-content']);
});

test('unparseable file is not mistaken for an empty board', () => {
  const a = F.parseKanbanContent('これはボードではない普通のメモです。\n\n- a\n- b\n');
  assert.ok(a.problems.length > 0);
  assert.equal(a.tasks.length, 0);
});

test('legacy V1 sample (examples/kanban.md) parses without loss', () => {
  const md = readFileSync(new URL('../../examples/kanban.md', import.meta.url), 'utf8');
  const a = F.parseKanbanContent(md);
  assert.equal(a.formatV2, false);
  assert.deepEqual(plain(a.problems), []);
  const blocks = (md.match(/^###\s+TASK-/gm) || []).length;
  assert.equal(a.tasks.length, blocks);
  const b = F.parseKanbanContent(F.generateKanbanContent(a.config, a.tasks));
  assert.deepEqual(plain(b.tasks), plain(a.tasks));
});

test('archive sample parses, keeps its preamble and round-trips', () => {
  const md = readFileSync(new URL('../../examples/archive.md', import.meta.url), 'utf8');
  const a = F.parseArchiveContent(md);
  assert.deepEqual(plain(a.problems), []);
  assert.ok(a.tasks.length > 0);
  const gen = F.generateArchiveContent(a.preamble, a.tasks);
  assert.ok(gen.startsWith(a.preamble.split('\n')[0]));
  const b = F.parseArchiveContent(gen);
  assert.deepEqual(plain(b.tasks), plain(a.tasks));
});

test('unknown status is kept as written (not silently moved)', () => {
  const md = `# B\n<!-- Format: v2 -->\n\n## ⚙️ Configuration\n\n**Columns**: 📝 未着手 (todo) | ✅ 完了 (done)\n\n---\n\n## Tasks\n\n### TASK-001 | a\n**Status**: 完了\n\n### TASK-002 | b\n**Status**: 保留\n`;
  const a = F.parseKanbanContent(md);
  assert.equal(a.tasks[0].status, 'done', 'column name resolves to its id');
  assert.equal(a.tasks[1].status, '保留');
  assert.equal(a.tasks[1].statusUnknown, true);
  assert.match(F.generateKanbanContent(a.config, a.tasks), /\*\*Status\*\*: 保留/);
});

test('CRLF files parse like LF files and EOL can be preserved', () => {
  const crlf = JA_BOARD.replace(/\n/g, '\r\n');
  const a = F.parseKanbanContent(crlf);
  const b = F.parseKanbanContent(JA_BOARD);
  assert.deepEqual(plain(a.tasks), plain(b.tasks));
  assert.equal(F.detectEol(crlf), '\r\n');
  assert.ok(F.generateKanbanContent(a.config, a.tasks, '\r\n').includes('\r\n## Tasks\r\n'));
});

test('inline Notes text is kept', () => {
  const md = `# B\n<!-- Format: v2 -->\n\n## Tasks\n\n### TASK-001 | a\n**Status**: todo\n**Notes**: 同じ行のメモ\n次の行\n`;
  const a = F.parseKanbanContent(md);
  assert.equal(a.tasks[0].notes, '同じ行のメモ\n次の行');
  assert.deepEqual(plain(a.problems), []);
});

test('Estimate and Worklog round-trip without changing their meaning', () => {
  const md = `# B
<!-- Format: v2 -->

## ⚙️ Configuration

**Columns**: 📝 To Do (todo)

---

## Tasks

### TASK-001 | 実装
**Status**: todo
**Estimate**: 8h

説明

**Subtasks**:
- [ ] 実装する

**Worklog**:
- 2026-11-20 | 2.5h | 調査
- 2026-11-21 | 3h | 実装

**Notes**:
完了条件を確認
`;
  const a = F.parseKanbanContent(md);
  assert.deepEqual(plain(a.problems), []);
  assert.equal(a.tasks[0].estimate, '8h');
  assert.deepEqual(plain(a.tasks[0].worklog), [
    { date: '2026-11-20', hours: 2.5, memo: '調査' },
    { date: '2026-11-21', hours: 3, memo: '実装' }
  ]);

  const generated = F.generateKanbanContent(a.config, a.tasks);
  const b = F.parseKanbanContent(generated);
  assert.deepEqual(plain(b.tasks), plain(a.tasks));
  assert.ok(generated.indexOf('**Subtasks**:') < generated.indexOf('**Worklog**:'));
  assert.ok(generated.indexOf('**Worklog**:') < generated.indexOf('**Notes**:'));
});

test('colon-less Worklog headings remain description text and round-trip exactly', () => {
  for (const heading of ['**Worklog**', '**worklog**  ', '**Worklog** without a colon']) {
    const body = `**Status**: todo\n\nDescription\n${heading}\n\n`;
    const md = `### TASK-001 | Description\n${body}`;
    const task = F.parseTask('TASK-001', 'Description', body, 'todo');
    assert.equal(task.description, `Description\n${heading}`);
    assert.deepEqual(plain(task.worklog), []);
    assert.equal(F.serializeTask(task), md);
    assert.deepEqual(plain(F.findLostLines(body, task)), []);
    assert.deepEqual(plain(F.taskWriteProblems(task)), []);
    assert.deepEqual(plain(F.findLostLines(body, { ...task, description: 'Description' })), [heading.trim()]);
  }
});

test('colon-less Worklog heading in an extra section is preserved', () => {
  const body = '**Status**: todo\n\n**Links**:\nhttps://example.com\n**Worklog**\n\n';
  const task = F.parseTask('TASK-001', 'Links', body, 'todo');
  assert.equal(task.extra, '**Links**:\nhttps://example.com\n**Worklog**');
  assert.equal(F.serializeTask(task), `### TASK-001 | Links\n${body}`);
  assert.deepEqual(plain(F.taskWriteProblems(task)), []);
});

test('Worklog section accepts ASCII and full-width colons', () => {
  for (const colon of [':', '：']) {
    const body = `**Status**: todo\n\n**Worklog** ${colon}\n- 2026-02-28 | 1.5h\n`;
    const task = F.parseTask('TASK-001', 'Worklog', body, 'todo');
    assert.equal(task.description, '');
    assert.deepEqual(plain(task.worklog), [{ date: '2026-02-28', hours: 1.5, memo: '' }]);
    assert.deepEqual(plain(F.taskWriteProblems(task)), []);
  }
});

test('impossible Worklog dates warn with the task id while preserving the entry', () => {
  for (const [id, date, invalid] of [['TASK-041', '2026-02-30', true], ['TASK-042', '2026-02-28', false]]) {
    const taskText = `### ${id} | Worklog\n**Status**: todo\n\n**Worklog**:\n- ${date} | 1.5h\n\n`;
    const board = `# B\n<!-- Format: v2 -->\n\n## ⚙️ Configuration\n\n**Columns**: To Do (todo)\n\n---\n\n## Tasks\n\n${taskText}`;
    for (const parsed of [F.parseKanbanContent(board), F.parseArchiveContent(`# Task Archive\n\n## ✅ Archives\n\n${taskText}`)]) {
      assert.deepEqual(plain(parsed.problems), []);
      assert.deepEqual(plain(parsed.tasks[0].worklog), [{ date, hours: 1.5, memo: '' }]);
      assert.equal(F.serializeTask(parsed.tasks[0]), taskText);
      const warnings = parsed.warnings.filter(w => w.code === 'non-iso-date');
      assert.deepEqual(plain(warnings), invalid ? [{ code: 'non-iso-date', lines: [`${id} Worklog: ${date}`] }] : []);
    }
  }
});

test('Worklog-looking text inside Notes is not parsed as worklog', () => {
  const md = `# B
<!-- Format: v2 -->

## ⚙️ Configuration

**Columns**: 📝 To Do (todo)

---

## Tasks

### TASK-001 | メモ
**Status**: todo

**Notes**:
実績の記録例:
**Worklog**:
- 2026-11-20 | 2.5h | これはメモ
`;
  const a = F.parseKanbanContent(md);
  assert.deepEqual(plain(a.problems), []);
  assert.deepEqual(plain(a.tasks[0].worklog), []);
  assert.match(a.tasks[0].notes, /\*\*Worklog\*\*:/);
  assert.match(a.tasks[0].notes, /これはメモ/);
});

test('empty Estimate and Worklog fields are omitted when serialized', () => {
  const md = `# B
<!-- Format: v2 -->

## ⚙️ Configuration

**Columns**: 📝 To Do (todo)

---

## Tasks

### TASK-001 | 空欄
**Status**: todo
**Estimate**:

**Worklog**:
`;
  const a = F.parseKanbanContent(md);
  assert.equal(a.tasks[0].estimate, '');
  assert.deepEqual(plain(a.tasks[0].worklog), []);
  const generated = F.generateKanbanContent(a.config, a.tasks);
  assert.doesNotMatch(generated, /\*\*Estimate\*\*\s*:/);
  assert.doesNotMatch(generated, /\*\*Worklog\*\*\s*:/);
  assert.deepEqual(plain(F.parseKanbanContent(generated).problems), []);
});

test('Worklog entries may omit the memo', () => {
  const md = `# B
<!-- Format: v2 -->

## ⚙️ Configuration

**Columns**: 📝 To Do (todo)

---

## Tasks

### TASK-001 | メモ省略
**Status**: todo

**Worklog**:
- 2026-11-20 | 2.5h
`;
  const a = F.parseKanbanContent(md);
  assert.deepEqual(plain(a.tasks[0].worklog), [{ date: '2026-11-20', hours: 2.5, memo: '' }]);
});

test('task id search: full id, case, width, number', () => {
  const task = { id: 'TASK-042', title: 'x', description: '', notes: '', tags: [], assignees: [], subtasks: [] };
  for (const q of ['TASK-042', 'task-042', 'Task-042', 'ＴＡＳＫ－０４２', 'TASK-42', '#42', '042', ' TASK-042 ']) {
    assert.equal(F.matchesTaskId(task, q), true, q);
  }
  for (const q of ['TASK-043', 'TASK-0421', '43']) assert.equal(F.matchesTaskId(task, q), false, q);
  const t2 = { ...task, title: '請求書の確認', tags: ['#経理'], subtasks: [{ text: '承認依頼' }] };
  assert.equal(F.taskMatchesSearch(t2, '請求書'), true);
  assert.equal(F.taskMatchesSearch(t2, '経理'), true);
  assert.equal(F.taskMatchesSearch(t2, '承認'), true);
  assert.equal(F.taskMatchesSearch(t2, 'task-042'), true);
  assert.equal(F.taskMatchesSearch(t2, '存在しない'), false);
});

test('next id never collides with active or archived ids', () => {
  assert.equal(F.nextTaskNumber(3, [{ id: 'TASK-010' }], [{ id: 'TASK-007' }]), 11);
  assert.equal(F.nextTaskNumber(20, [{ id: 'TASK-010' }], []), 21);
  assert.deepEqual(plain(F.findDuplicateIds([{ id: 'TASK-001' }], [{ id: 'TASK-001' }, { id: 'TASK-002' }])), ['TASK-001']);
});

test('clean / priority helpers are Unicode-aware and backward compatible', () => {
  assert.equal(F.clean('🔴 Critical'), 'Critical');
  assert.equal(F.clean('🔴 緊急'), '緊急');
  assert.equal(F.clean('緊急'), '緊急');
  assert.equal(F.getFirstEmoji('🔴 緊急'), '🔴');
  assert.equal(F.getFirstEmoji('緊急'), '');
  assert.equal(F.findPriorityLabel(['Very-High'], 'VeryHigh'), 'Very-High', 'value saved by the pre-fork clean()');
  assert.equal(F.findPriorityLabel(['🔴 Very-High'], 'Very-High'), '🔴 Very-High');
});

test('Japanese column names without ids still get unique ids', () => {
  const md = `# B\n\n## ⚙️ Configuration\n\n**Columns**: 未着手 | 作業中 | 完了\n\n## 未着手\n\n### TASK-001 | a\n\n## 完了\n\n### TASK-002 | b\n`;
  const a = F.parseKanbanContent(md);
  assert.deepEqual(plain(a.config.columns.map((c) => c.id)), ['col1', 'col2', 'col3']);
  assert.deepEqual(plain(a.tasks.map((t) => t.status)), ['col1', 'col3']);
  assert.deepEqual(plain(a.problems), []);
});

// ----- Regression tests for review findings (2nd round) -----
const H = (cfg = '', extraHead = '') => `# B\n<!-- Config: Last Task ID: 1 -->\n<!-- Format: v2 -->\n${extraHead}\n## ⚙️ Configuration\n\n**Columns**: 📝 To Do (todo) | ✅ Done (done)\n${cfg}\n---\n\n## Tasks\n\n`;
const cycles = (md, n = 3) => {
  let x = md; let first = null;
  for (let i = 0; i < n; i++) {
    const p = F.parseKanbanContent(x);
    const g = F.generateKanbanContent(p.config, p.tasks);
    if (first === null) first = g; else assert.equal(g, first, `save #${i + 1} changed the file again`);
    x = g;
  }
  return F.parseKanbanContent(x);
};

test('Subtasks written after Notes stay in the notes and never multiply', () => {
  const p = cycles(H() + '### TASK-001 | a\n**Status**: todo\n\n**Notes**:\nメモ\n\n**Subtasks**:\n- [ ] step\n', 4);
  assert.equal(p.tasks[0].subtasks.length, 0);
  assert.match(p.tasks[0].notes, /\*\*Subtasks\*\*:\n- \[ \] step/);
  assert.deepEqual(plain(p.problems), []);
});

test('empty optional fields are not reported as lost', () => {
  const p = F.parseKanbanContent(H() + '### TASK-001 | a\n**Status**: todo\n**Priority**: High | **Category**:\n**Due**:\n**Tags**:\n');
  assert.deepEqual(plain(p.problems), []);
  assert.equal(p.tasks[0].priority, 'High');
  // A later non-empty duplicate is still read (the empty one does not shadow it).
  const q = F.parseKanbanContent(H() + '### TASK-001 | a\n**Status**: todo\n**Category**:\n**Category**: 経理\n');
  assert.equal(q.tasks[0].category, '経理');
});

test('header: extra comments are kept, config spelling variants are read, BOM title kept', () => {
  let p = F.parseKanbanContent(H('', '<!-- 引継ぎ: ダミーメモ -->\n'));
  assert.deepEqual(plain(p.problems), []);
  assert.match(F.generateKanbanContent(p.config, p.tasks), /<!-- 引継ぎ: ダミーメモ -->/);
  p = F.parseKanbanContent(H('**Categories** : 経理, 総務\n**Tags**: バグ, 改善\n'));
  assert.deepEqual(plain(p.config.categories), ['経理', '総務']);
  assert.deepEqual(plain(p.config.tags), ['バグ', '改善']);
  assert.deepEqual(plain(p.problems), []);
  p = F.parseKanbanContent(H().replace('## ⚙️ Configuration', '## ⚙ Configuration'));
  assert.deepEqual(plain(p.config.columns.map((c) => c.id)), ['todo', 'done']);
  assert.deepEqual(plain(p.problems), []);
  p = F.parseKanbanContent('﻿' + H().replace('# B', '# 日本語ボード'));
  assert.equal(p.config.boardTitle, '日本語ボード');
});

test('header content that cannot be kept makes the board read-only', () => {
  for (const extra of ['**Owner**: 山田\n', '**Columns**: A (a)\n', '自由記述のメモ\n']) {
    const p = F.parseKanbanContent(H(extra));
    assert.ok(p.problems.some((q) => q.code === 'unknown-header-content'), JSON.stringify(extra));
  }
});

test('column names may contain parentheses', () => {
  const p = cycles(H().replace('✅ Done (done)', '✅ 完了 (済) (done)') + '### TASK-001 | a\n**Status**: done\n');
  assert.equal(p.config.columns[1].name, '✅ 完了 (済)');
  assert.equal(p.config.columns[1].id, 'done');
  assert.equal(p.tasks[0].status, 'done');
});

test('nested subtasks keep their indentation; "## " in the task area is reported', () => {
  const p = cycles(H() + '### TASK-001 | a\n**Status**: todo\n\n**Subtasks**:\n- [ ] 親\n  - [x] 子\n');
  assert.equal(p.tasks[0].subtasks[1].indent, '  ');
  assert.match(F.generateKanbanContent(p.config, p.tasks), /\n {2}- \[x\] 子\n/);
  const q = F.parseKanbanContent(H() + '### TASK-001 | a\n**Status**: todo\n説明\n\n## メモ\n本文\n');
  assert.ok(q.problems.some((x) => x.code === 'heading-in-tasks'));
  // ...but not inside a code block in the notes
  const r = F.parseKanbanContent(H() + '### TASK-001 | a\n**Status**: todo\n\n**Notes**:\n```md\n## 見出しの例\n```\n');
  assert.deepEqual(plain(r.problems), []);
});

test('full-width colon / ＃ / 、 written by a Japanese IME are understood', () => {
  const p = cycles(H() + '### TASK-001 | a\n**Status**：done\n**Priority**：High\n**Tags**: ＃経理 #総務、#人事\n');
  assert.equal(p.tasks[0].status, 'done');
  assert.equal(p.tasks[0].priority, 'High');
  assert.deepEqual(plain(p.tasks[0].tags), ['#経理', '#総務', '#人事']);
  assert.deepEqual(plain(p.problems), []);
});

test('Markdown hard line breaks are kept; "---" between tasks is dropped', () => {
  const p = cycles(H() + '### TASK-001 | a\n**Status**: todo\n\n1行目  \n2行目\n\n---\n\n### TASK-002 | b\n**Status**: todo\n');
  assert.equal(p.tasks[0].description, '1行目  \n2行目');
});

// ----- Regression tests for review findings (3rd round) -----
const HC = (cfg) => `# B\n<!-- Format: v2 -->\n\n## ⚙️ Configuration\n\n${cfg}\n---\n\n## Tasks\n\n### TASK-001 | a\n**Status**: todo\n`;

test('an empty config value never swallows the next line', () => {
  for (const key of ['Columns', 'Categories', 'Users', 'Priorities', 'Tags']) {
    const p = cycles(HC(`**${key}**:\n**Categories**: 経理, 総務\n**Columns**: 📝 未着手 (todo) | ✅ 完了 (done)\n`.replace(`**${key}**:\n`, `**${key}**:\n`)));
    for (const c of p.config.columns) assert.doesNotMatch(c.name, /\*\*/, `${key}: column name`);
    for (const list of [p.config.categories, p.config.users, p.config.priorities, p.config.tags]) {
      for (const v of list) assert.doesNotMatch(v, /\*\*/, `${key}: ${v}`);
    }
  }
  const p = F.parseKanbanContent(HC('**Columns**:\n**Categories**: 経理\n'));
  assert.deepEqual(plain(p.config.categories), ['経理']);
  assert.equal(p.config.columns[0].id, 'todo', 'empty Columns → default columns, not the next line');
});

test('duplicate values in the configuration do not make the board read-only', () => {
  const p = F.parseKanbanContent(HC('**Columns**: 📝 To Do (todo)\n**Tags**: #bug #feature #bug\n**Categories**: 開発, 調査, 開発\n'));
  assert.deepEqual(plain(p.problems), []);
});

test('title may follow blank lines or comments', () => {
  const p = cycles('\n<!-- memo -->\n' + HC('**Columns**: 📝 To Do (todo)\n'));
  assert.equal(p.config.boardTitle, 'B');
  assert.deepEqual(plain(p.problems), []);
});

test('~~~ fences are code blocks; an unclosed fence does not hide later headings', () => {
  const base = HC('**Columns**: 📝 To Do (todo)\n');
  assert.deepEqual(plain(F.parseKanbanContent(base + '\n**Notes**:\n~~~\n## in tilde fence\n~~~\n').problems), []);
  const q = F.parseKanbanContent(base + '\n**Notes**:\n```\nunclosed\n\n### TASK-002 | b\n**Status**: todo\n\n## real heading\n');
  assert.ok(q.problems.some((x) => x.code === 'heading-in-tasks'));
});

test('Subtasks written after Notes produce a warning', () => {
  const p = F.parseKanbanContent(HC('**Columns**: 📝 To Do (todo)\n') + '\n**Notes**:\nメモ\n\n**Subtasks**:\n- [ ] x\n');
  assert.ok(p.warnings.some((w) => w.code === 'subtasks-in-notes' && w.lines.includes('TASK-001')));
  assert.deepEqual(plain(p.problems), []);
});

// ----- Regression tests for review findings (4th round) -----
test('full-width space / NBSP after a config key is accepted (Japanese IME)', () => {
  const p = cycles(HC('**Columns**：　📝 未着手 (todo) | ✅ 完了 (done)\n**Tags**: #バグ #改善\n**Categories**　:　経理\n'));
  assert.deepEqual(plain(p.config.columns.map((c) => c.id)), ['todo', 'done']);
  assert.deepEqual(plain(p.config.tags), ['バグ', '改善']);
  assert.deepEqual(plain(p.config.categories), ['経理']);
  assert.deepEqual(plain(p.problems), []);
});

test('a "### TASK-" line inside a code block (unclosed per task) is reported, never silently a task', () => {
  const p = F.parseKanbanContent(HC('**Columns**: 📝 To Do (todo)\n').replace('**Status**: todo\n', '**Status**: todo\n\n**Notes**:\n```\n### TASK-099 | example\n```\n'));
  assert.ok(p.problems.some((x) => x.code === 'unclosed-code-block' && x.id === 'TASK-001'));
  // A properly closed code block without a task header is fine.
  const q = F.parseKanbanContent(HC('**Columns**: 📝 To Do (todo)\n').replace('**Status**: todo\n', '**Status**: todo\n\n**Notes**:\n```md\n## 例\n```\n'));
  assert.deepEqual(plain(q.problems), []);
});

test('code fences are checked per task (an unclosed fence is not closed by a later task)', () => {
  const body = '### TASK-001 | a\n**Status**: todo\n\n**Notes**:\n```\nunclosed\n## 見出し\n\n### TASK-002 | b\n**Status**: todo\n\n**Notes**:\n```js\nx\n```\n';
  const p = F.parseKanbanContent(`# B\n<!-- Format: v2 -->\n\n## ⚙️ Configuration\n\n**Columns**: 📝 To Do (todo)\n\n---\n\n## Tasks\n\n${body}`);
  const codes = plain(p.problems.map((x) => `${x.code}:${x.id}`));
  assert.ok(codes.includes('unclosed-code-block:TASK-001'));
  assert.ok(codes.includes('heading-in-tasks:TASK-001'));
  assert.ok(!codes.some((c) => c.endsWith('TASK-002')), codes.join());
});

test('maxIdInText counts every heading-like task id (h2, no space, full-width digits)', () => {
  assert.equal(F.maxIdInText('## TASK-050 | x\n### TASK-０６０ | y\n###TASK-070 | z\n### TASK-010 | w\n'), 70);
  assert.equal(F.maxIdInText('### ＴＡＳＫ－０８０ | full width\n'), 80);
  assert.equal(F.maxIdInText('see TASK-999 in the text\n'), 0, 'mentions in text are not ids');
});
