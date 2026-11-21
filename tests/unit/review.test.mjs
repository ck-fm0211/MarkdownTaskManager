// Regression tests for the format-layer findings of the external code review of ce7130e
// (round 5). Pure functions only (src/scripts/04-format.js through scripts/lib/format.mjs).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadFormat } from '../../scripts/lib/format.mjs';

const F = loadFormat();
// Values created in the VM context have other Array/Object prototypes: compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));

const header = (columns, { v2 = false } = {}) => `# Board

<!-- Config: Last Task ID: 3 -->
${v2 ? '<!-- Format: v2 -->\n' : ''}
## ⚙️ Configuration

**Columns**: ${columns}

**Categories**: 経理, 総務

**Users**: @a

**Priorities**: 🔴 Critical | 🟠 High

**Tags**: #bug

---

`;
const v2Board = (tasksMd) => `${header('📝 To Do (todo) | ✅ Done (done)', { v2: true })}## Tasks\n\n${tasksMd}`;
const ids = (tasks) => plain(tasks.map((t) => `${t.id}:${t.status}`).sort());

describe('V1 column sections are matched by the WHOLE heading (review 1-3 / 2-2)', () => {
  test('"Todo" and "Todo Later": every task once, in its own column, longer section first', () => {
    const md = `${header('Todo (todo) | Todo Later (later)')}## Todo Later

### TASK-002 | later task
**Priority**: High

## Todo

### TASK-001 | todo task
**Priority**: High
`;
    const r = F.parseKanbanContent(md);
    assert.equal(r.formatV2, false);
    assert.deepEqual(ids(r.tasks), ['TASK-001:todo', 'TASK-002:later']);
    assert.deepEqual(plain(r.problems), []);
    assert.deepEqual(plain(r.warnings), []);
  });

  test('"To Do Later" before "To Do": no task is duplicated and none is dropped', () => {
    const md = `${header('To Do Later (later) | To Do (todo)')}## To Do Later

### TASK-001 | a

### TASK-002 | b

## To Do

### TASK-003 | c
`;
    const r = F.parseKanbanContent(md);
    assert.deepEqual(ids(r.tasks), ['TASK-001:later', 'TASK-002:later', 'TASK-003:todo']);
    assert.deepEqual(plain(r.problems), []);
    // What the migration writes contains every task exactly once.
    const out = F.generateKanbanContent(r.config, r.tasks);
    for (const id of ['TASK-001', 'TASK-002', 'TASK-003']) assert.equal(out.split(`### ${id} |`).length - 1, 1, id);
  });

  test('a heading that only STARTS with a column name is not that column (reported, not merged)', () => {
    const md = `${header('📝 To Do (todo) | ✅ Done (done)')}## 📝 To Do

### TASK-001 | a

## 📝 To Do (old)

### TASK-002 | b
`;
    const r = F.parseKanbanContent(md);
    assert.deepEqual(ids(r.tasks), ['TASK-001:todo']);
    assert.ok(r.problems.some((p) => p.code === 'unknown-section' && p.section === '📝 To Do (old)'), JSON.stringify(r.problems));
    assert.ok(r.problems.some((p) => p.code === 'task-not-in-column'), 'TASK-002 is reported as not read');
  });

  test('headings still match without the emoji and by the id slug (upstream V1 files)', () => {
    const md = `${header('📝 To Do (todo) | ✅ Done (done)')}## To Do

### TASK-001 | a

## done

### TASK-002 | b
`;
    const r = F.parseKanbanContent(md);
    assert.deepEqual(ids(r.tasks), ['TASK-001:todo', 'TASK-002:done']);
    assert.deepEqual(plain(r.problems), []);
  });
});

describe('code blocks are text, never task fields (review 1-7)', () => {
  const body = `### TASK-001 | t
**Status**: todo
**Priority**: High

Example of the format:

\`\`\`md
**Due**: 2026-12-31
**Notes**: not the notes
**Subtasks**:
- [ ] not a subtask
\`\`\`

**Subtasks**:
- [ ] real subtask

**Notes**:
real notes
`;

  test('"**Due**:" in a closed code block stays in the description', () => {
    const r = F.parseKanbanContent(v2Board(body));
    assert.deepEqual(plain(r.problems), []);
    const t = r.tasks[0];
    assert.equal(t.due, '');
    assert.equal(t.priority, 'High');
    assert.match(t.description, /```md\n\*\*Due\*\*: 2026-12-31\n\*\*Notes\*\*: not the notes\n\*\*Subtasks\*\*:\n- \[ \] not a subtask\n```/);
    assert.deepEqual(plain(t.subtasks.map((s) => s.text)), ['real subtask']);
    assert.equal(t.notes, 'real notes');
  });

  test('save → load keeps the code block unchanged (and is a fixed point)', () => {
    const r = F.parseKanbanContent(v2Board(body));
    const out = F.generateKanbanContent(r.config, r.tasks);
    assert.match(out, /```md\n\*\*Due\*\*: 2026-12-31\n/);
    const again = F.parseKanbanContent(out);
    assert.deepEqual(plain(again.problems), []);
    assert.equal(F.generateKanbanContent(again.config, again.tasks), out);
  });

  test('the loss check compares code lines as code (a fenced line used as a field is a loss)', () => {
    const t = F.parseKanbanContent(v2Board(body)).tasks[0];
    const moved = { ...t, due: '2026-12-31', description: t.description.replace('**Due**: 2026-12-31\n', '') };
    const lost = F.findLostLines(body.slice(body.indexOf('\n') + 1), moved, { columns: [{ name: 'To Do', id: 'todo' }] });
    assert.ok(lost.includes('**Due**: 2026-12-31'), JSON.stringify(lost));
  });
});

describe('upstream V2.0 metadata line without a priority (review 2-6)', () => {
  test('" | **Category**: … | **Assigned**: …" is read as fields, not as description', () => {
    const md = v2Board(`### TASK-001 | t
**Status**: todo
 | **Category**: 経理 | **Assigned**: @a, @b
**Created**: 2026-01-01

desc

### TASK-002 | u
**Status**: done
 | **Assigned**: @c
`);
    const r = F.parseKanbanContent(md);
    assert.deepEqual(plain(r.problems), []);
    const [a, b] = r.tasks;
    assert.equal(a.category, '経理');
    assert.deepEqual(plain(a.assignees), ['@a', '@b']);
    assert.equal(a.description, 'desc');
    assert.equal(a.created, '2026-01-01');
    assert.deepEqual(plain(b.assignees), ['@c']);
    assert.equal(b.description, '');
    // Written back in this fork's format (no leading "|").
    assert.match(F.serializeTask(a), /\n\*\*Category\*\*: 経理 \| \*\*Assigned\*\*: @a, @b\n/);
  });
});

describe('text encoding (review 2-1)', () => {
  // "タスク" in Shift_JIS (cp932) — what Windows PowerShell 5.1 Set-Content writes by default.
  const sjis = Uint8Array.from([0x83, 0x5e, 0x83, 0x58, 0x83, 0x4e]);
  test('Shift_JIS bytes are reported as not UTF-8', () => {
    const d = F.decodeUtf8(sjis);
    assert.equal(d.valid, false);
    assert.match(d.text, /�/);
  });
  test('UTF-8 (with and without BOM) is accepted unchanged', () => {
    const bytes = new TextEncoder().encode('# 看板\n### TASK-001 | 経理の締め\n');
    assert.deepEqual(plain(F.decodeUtf8(bytes)), { text: '# 看板\n### TASK-001 | 経理の締め\n', valid: true });
    const bom = Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes]);
    const d = F.decodeUtf8(bom);
    assert.equal(d.valid, true);
    assert.equal(F.normalizeEol(d.text), '# 看板\n### TASK-001 | 経理の締め\n');
  });
});

describe('what the task form may write (review 1-8 / 2-3)', () => {
  const base = { id: 'TASK-001', title: '月次処理', status: 'todo', priority: 'High', category: '経理', assignees: ['@a'], tags: ['#経理'], created: '2026-01-01', started: '', due: '', completed: '', description: '説明', subtasks: [{ completed: false, text: '確認' }], notes: 'メモ', extra: '' };
  const cols = [{ name: '📝 To Do', id: 'todo' }];
  const codes = (t) => plain(F.taskWriteProblems(t, cols).map((p) => p.code));

  test('a normal Japanese task reads back unchanged', () => {
    assert.deepEqual(codes(base), []);
    assert.deepEqual(codes({ ...base, title: 'A | B' }), [], '"|" in the title is fine');
    assert.deepEqual(codes({ ...base, description: '```md\n**Due**: 2026-12-31\n```' }), [], 'field line in a code block');
  });
  test('values the format cannot carry are refused before anything is written', () => {
    assert.notDeepEqual(codes({ ...base, category: '開発 | 運用' }), []);
    assert.notDeepEqual(codes({ ...base, assignees: ['経理|総務'] }), []);
    assert.notDeepEqual(codes({ ...base, tags: ['#＃経理'] }), []);
    assert.notDeepEqual(codes({ ...base, tags: ['#a#b'] }), []);
    assert.deepEqual(codes({ ...base, title: '' }), ['malformed-task-header']);
  });
  test('an empty title never takes the next line as its title', () => {
    const r = F.parseKanbanContent(v2Board('### TASK-001 | \n**Status**: todo\n'));
    assert.ok(r.problems.some((p) => p.code === 'malformed-task-header'));
    assert.ok(!r.tasks.some((t) => t.title === '**Status**: todo'), JSON.stringify(r.tasks.map((t) => t.title)));
  });
});

// ----- Round 6: two external reviews of 9071e08 -----

describe('upstream leading "|" only in the leading metadata lines (round 6: review 1-6 / 2-2)', () => {
  test('" | **Tags**: #経理" (and "＃経理", a "|" inside a tag) is read as tags, not reported as lossy', () => {
    const md = v2Board(`### TASK-001 | t
**Status**: todo
 | **Category**: 経理
 | **Tags**: #経理

### TASK-002 | u
**Status**: todo
 | **Tags**: ＃経理 #a|b
`);
    const r = F.parseKanbanContent(md);
    assert.deepEqual(plain(r.problems), []);
    assert.deepEqual(plain(r.tasks[0].tags), ['#経理']);
    assert.equal(r.tasks[0].category, '経理');
    assert.deepEqual(plain(r.tasks[1].tags), ['#経理', '#a|b']);
  });

  test('a Markdown table in the description stays description text (no field, not read-only)', () => {
    const table = [
      '| 項目 | 値 |',
      '|---|---|',
      '| **Due**: 2026-01-01 |',
      '| **Status**: 確認中 | 田中 |',
      '| **Category**: 経理 | メモ |',
    ].join('\n');
    const md = v2Board(`### TASK-001 | t
**Status**: todo
**Due**: 2026-02-01

${table}

**Subtasks**:
- [ ] a
`);
    const r = F.parseKanbanContent(md);
    assert.deepEqual(plain(r.problems), []);
    const [task] = r.tasks;
    assert.equal(task.due, '2026-02-01');
    assert.equal(task.status, 'todo');
    assert.equal(task.category, '');
    assert.equal(task.description, table);
    // Saving (e.g. after a subtask toggle) keeps the table and reads back the same (fixed point).
    task.subtasks[0].completed = true;
    const gen = F.serializeTask(task);
    assert.ok(gen.includes(table), gen);
    const again = F.parseKanbanContent(v2Board(gen));
    assert.deepEqual(plain(again.problems), []);
    assert.equal(F.serializeTask(again.tasks[0]), gen);
  });

  test('a table row right after the metadata (ends with "|") is not a field either', () => {
    const r = F.parseKanbanContent(v2Board(`### TASK-001 | t
**Status**: todo
| **Due**: 2026-01-01 |
`));
    assert.deepEqual(plain(r.problems), []);
    assert.equal(r.tasks[0].due, '');
    assert.equal(r.tasks[0].description, '| **Due**: 2026-01-01 |');
  });

  test('the task form may write a table row with a field in the description', () => {
    const t = { id: 'TASK-001', title: 't', status: 'todo', priority: '', category: '', assignees: [], tags: [], created: '', started: '', due: '', completed: '', description: '| **Due**: 2026-01-01 |', subtasks: [], notes: '', extra: '' };
    assert.deepEqual(plain(F.taskWriteProblems(t, [{ name: 'To Do', id: 'todo' }])), []);
  });
});

describe('dates that are not YYYY-MM-DD (round 6: review 2-3)', () => {
  test('are kept as written, and reported as a warning (not read-only)', () => {
    const r = F.parseKanbanContent(v2Board(`### TASK-001 | t
**Status**: todo
**Created**: 2026-1-5 | **Due**: 20261231

### TASK-002 | u
**Status**: todo
**Created**: 2026-01-05 | **Due**: 2026-02-30
`));
    assert.deepEqual(plain(r.problems), []);
    assert.equal(r.tasks[0].created, '2026-1-5');
    assert.equal(r.tasks[0].due, '20261231');
    const w = plain(r.warnings).find((x) => x.code === 'non-iso-date');
    assert.ok(w, JSON.stringify(r.warnings));
    assert.deepEqual(w.lines, ['TASK-001 Created: 2026-1-5', 'TASK-001 Due: 20261231', 'TASK-002 Due: 2026-02-30']);
    assert.match(F.serializeTask(r.tasks[0]), /\*\*Created\*\*: 2026-1-5 \| \*\*Due\*\*: 20261231\n/);
  });
  test('YYYY-MM-DD dates give no warning', () => {
    const r = F.parseKanbanContent(v2Board('### TASK-001 | t\n**Status**: todo\n**Created**: 2026-01-05 | **Due**: 2028-02-29\n'));
    assert.deepEqual(plain(r.warnings), []);
  });
});

// ----- Round 7: review of 9071e08..c966c91 -----

describe('UTF-16 without a BOM is not UTF-8 (round 7: review 1)', () => {
  // ASCII-only UTF-16 is VALID UTF-8 byte-wise (every second byte is NUL): the NUL decides.
  const ascii = '# Task Archive\n### TASK-004 | d\n**Status**: done\n';
  test('UTF-16LE / UTF-16BE without a BOM are reported as not UTF-8', () => {
    assert.equal(F.decodeUtf8(Buffer.from(ascii, 'utf16le')).valid, false);
    const be = Buffer.from(ascii, 'utf16le').swap16();
    assert.equal(F.decodeUtf8(be).valid, false);
  });
  test('ordinary UTF-8 text is still valid', () => {
    assert.equal(F.decodeUtf8(new TextEncoder().encode(ascii + '経理\n')).valid, true);
  });
});

describe('YYYY-MM-DD years below 100 (round 7: review 7)', () => {
  test('"0007-02-02" is a YYYY-MM-DD date (no warning); "0000-01-01" is not one a date field can show', () => {
    const r = F.parseKanbanContent(v2Board('### TASK-001 | t\n**Status**: todo\n**Created**: 0007-02-02 | **Due**: 0099-12-31\n\n### TASK-002 | u\n**Status**: todo\n**Due**: 0000-01-01\n'));
    assert.deepEqual(plain(r.problems), []);
    const w = plain(r.warnings).find((x) => x.code === 'non-iso-date');
    assert.deepEqual(w && w.lines, ['TASK-002 Due: 0000-01-01']);
  });
});

// ----- Round 8: review of c966c91..1b3c200 -----

describe('a NUL in UTF-8 text is not "not UTF-8"; UTF-16 without a BOM still is (round 8: review 中-1)', () => {
  const board = v2Board('### TASK-001 | t\n**Status**: todo\n\nbefore\0after\n');
  test('valid UTF-8 with a NUL decodes as UTF-8 and is reported as nul-char with its line', () => {
    const d = F.decodeUtf8(new TextEncoder().encode(board));
    assert.equal(d.valid, true);
    const p = plain(F.parseKanbanContent(d.text).problems);
    const lineNo = board.split('\n').findIndex((l) => l.includes('\0')) + 1;
    assert.deepEqual(p.map((x) => x.code), ['nul-char']);
    assert.equal(p[0].line, lineNo);
    assert.equal(p[0].count, 1);
    assert.deepEqual(p[0].lines, [`${lineNo}: before␀after`]);
    const a = plain(F.parseArchiveContent('# Task Archive\n<!-- Format: v2 -->\n\n### TASK-002 | x\0y\n**Status**: done\n').problems);
    assert.deepEqual(a.map((x) => [x.code, x.line]), [['nul-char', 4]]);
  });
  test('an id in a task header line with a NUL is still counted (as it reads once the NUL is deleted)', () => {
    assert.equal(F.maxIdInText('# Task Archive\n\n### TASK-1\u000050 | x\n**Status**: done\n'), 150);
    assert.equal(F.maxIdInText('### TASK-007 | a\n'), 7);
  });
  test('the line shown with the NUL never starts in the middle of an emoji (no false U+FFFD)', () => {
    const lines = plain(F.nulCharProblems('😀' + 'x'.repeat(39) + '\0end'))[0].lines;
    assert.ok(!lines[0].includes('\uFFFD'), lines[0]);
    assert.match(lines[0], /^1: 😀x+\u2400end$/);
  });
  test('a run of NULs (e.g. the damaged end of a file) is nul-char too, not UTF-16', () => {
    const text = board + '\0'.repeat(300);
    assert.equal(F.decodeUtf8(new TextEncoder().encode(text)).valid, true);
    assert.equal(plain(F.parseKanbanContent(text).problems).find((x) => x.code === 'nul-char').count, 301);
  });
  test('guard: UTF-16LE / UTF-16BE without a BOM stay "not UTF-8", also with CJK characters that happen to decode', () => {
    // The last one is mostly hiragana and full-width spaces (valid UTF-8 byte by byte; U+3000 puts its NUL at
    // the other byte parity): its line breaks show it is UTF-16.
    for (const s of ['# Task Archive\n### TASK-004 | d\n**Status**: done\n', '# Archive\n### TASK-004 | あい\n**Status**: done\n',
      '# Task Archive\n### TASK-004 | ' + 'あ\u3000'.repeat(20) + '\n**Status**: done\n']) {
      const le = Buffer.from(s, 'utf16le');
      assert.equal(F.decodeUtf8(le).valid, false, 'LE');
      assert.equal(F.decodeUtf8(Buffer.from(le).swap16()).valid, false, 'BE');
    }
  });
});

describe('the form check refuses characters that would not read back (round 8: review 中-1)', () => {
  const base = { id: 'TASK-001', title: 'A', status: 'todo', priority: '', category: '', assignees: [], tags: [], created: '', started: '', due: '', completed: '', description: '', notes: '', subtasks: [], extra: '' };
  const cols = [{ name: 'To Do', id: 'todo' }];
  const variants = (bad) => [
    { title: `A${bad}B` }, { category: `x${bad}y` }, { assignees: [`@a${bad}`] }, { tags: [`#t${bad}`] }, { due: `2026${bad}` },
    { description: `before${bad}after` }, { notes: `n${bad}` }, { subtasks: [{ completed: false, text: `s${bad}` }] },
  ];
  test('a NUL in any field is refused (unwritable-char), shown as ␀', () => {
    for (const v of variants('\0')) {
      const p = plain(F.taskWriteProblems({ ...base, ...v }, cols));
      assert.deepEqual(p.map((x) => x.code), ['unwritable-char'], JSON.stringify(v));
      assert.match(p[0].lines.join('\n'), /␀/);
    }
  });
  test('an unpaired surrogate (written as U+FFFD) is refused too', () => {
    for (const v of variants('\uD800')) assert.deepEqual(plain(F.taskWriteProblems({ ...base, ...v }, cols)).map((x) => x.code), ['unwritable-char'], JSON.stringify(v));
    assert.deepEqual(plain(F.taskWriteProblems({ ...base, description: '絵文字 😀 は可' }, cols)), [], 'a surrogate PAIR is fine');
  });
  test('guard: other control characters that read back (tab, ESC) are not refused and do not make a file read-only', () => {
    assert.deepEqual(plain(F.taskWriteProblems({ ...base, description: 'a\tb \u001b[0m c' }, cols)), []);
    assert.deepEqual(plain(F.parseKanbanContent(v2Board('### TASK-001 | t\n**Status**: todo\n\na\tb \u001b[0m c\n')).problems), []);
  });
});
