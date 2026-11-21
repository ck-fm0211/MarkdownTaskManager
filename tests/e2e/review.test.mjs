// Regression tests for problems found in the external code reviews (built task-manager.html,
// mock File System Access API unless stated otherwise).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchBrowser, newPage, createDir, openFolder, waitIdle, readFile, writeFile, setFault,
  syncState, notificationText, board, archive, task, writeBytes, readBytes,
} from './helpers.mjs';
import { readFileSync } from 'node:fs';

let browser = null;
let skipReason = '';
before(async () => {
  const r = await launchBrowser();
  browser = r.browser;
  skipReason = r.reason || '';
  if (!browser) {
    if (process.env.MTM_REQUIRE_BROWSER) throw new Error(`ブラウザーテストを実行できません: ${skipReason}`);
    console.warn(`[e2e] SKIP（ブラウザーなし）: ${skipReason}`);
  }
});
after(async () => { if (browser) await browser.close(); });

function it(name, fn) {
  test(name, async (t) => {
    if (!browser) { t.skip(skipReason); return; }
    const ctx = await newPage(browser, fn.opts || {});
    try {
      await fn(ctx);
      assert.deepEqual(ctx.errors, [], 'no uncaught page errors');
    } finally {
      await ctx.context.close();
    }
  });
}

const SUB = '**Priority**: Medium\n\n**Subtasks**:\n- [ ] step one';

describe('archive / restore races', () => {
  it('editing a task while it is being archived is refused (nothing silently lost)', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'A', SUB, 'done'), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await setFault(page, 'p', 'archive.md', { writeDelay: 300 });
    const pending = page.evaluate(() => archiveTask(tasks[0]));
    await page.waitForFunction(() => busyOperation === 'archive');
    const refused = await page.evaluate(() => { const before = tasks[0].subtasks[0].completed; toggleSubtask('TASK-001', 0); return before === tasks[0].subtasks[0].completed; });
    assert.equal(refused, true, 'the toggle was refused');
    assert.match(await notificationText(page), /operation is still running/);
    assert.equal((await pending).ok, true);
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'archive.md'), /- \[ \] step one/);
    assert.doesNotMatch(await readFile(page, 'p', 'kanban.md'), /TASK-001/);
  });

  it('second line of defence: a task changed during the operation is NOT removed from the board', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'A', SUB, 'done'), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await setFault(page, 'p', 'archive.md', { writeDelay: 200 });
    const pending = page.evaluate(() => archiveTask(tasks[0]));
    await page.waitForFunction(() => busyOperation === 'archive');
    await page.evaluate(() => { tasks[0].subtasks[0].completed = true; }); // bypasses the UI guard
    const r = await pending;
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'changed');
    assert.match(await readFile(page, 'p', 'kanban.md'), /TASK-001/, 'still on the board (file)');
    assert.equal(await page.evaluate(() => tasks[0].subtasks[0].completed), true, 'the change is kept in memory');
  });

  it('restore never trusts an UNSAVED copy on the board (review A-2)', async ({ page }) => {
    const OLD = task(5, 'version', '**Priority**: Low');
    const NEW = task(5, 'version', '**Priority**: High');
    await createDir(page, 'p', { 'kanban.md': board(OLD, { lastId: 5 }), 'archive.md': archive(NEW) });
    await openFolder(page, 'p');
    // The board is edited to equal the archived version, but saving fails.
    await setFault(page, 'p', 'kanban.md', { writeFail: true });
    await page.evaluate(() => { tasks[0].priority = 'High'; return autoSave(); });
    await page.evaluate(() => { session.lastError = null; });
    const r = await page.evaluate(() => unarchiveTaskObject(archivedTasks[0]));
    assert.equal(r.ok, false, 'kanban.md could not be written → restore fails');
    assert.match(await readFile(page, 'p', 'archive.md'), /TASK-005/, 'the only saved copy of the new version is still in archive.md');
    // Once kanban.md is writable again, the restore really writes it.
    await setFault(page, 'p', 'kanban.md', {});
    await page.evaluate(() => { session.lastError = null; });
    const r2 = await page.evaluate(() => unarchiveTaskObject(archivedTasks[0]));
    assert.equal(r2.ok, true);
    assert.match(await readFile(page, 'p', 'kanban.md'), /### TASK-005 \| version\n\*\*Status\*\*: todo\n\*\*Priority\*\*: High/);
    assert.doesNotMatch(await readFile(page, 'p', 'archive.md'), /TASK-005/);
  });

  it('delete with duplicate ids removes the clicked task, not the first one (review B-5)', async ({ page }) => {
    const ar = archive(task(3, 'Same title', 'A version', 'done') + '\n' + task(3, 'Same title', 'B version', 'done'));
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'x'), { lastId: 3 }), 'archive.md': ar });
    await openFolder(page, 'p');
    await page.click('#archiveBtn');
    await page.waitForSelector('.archive-card');
    await page.locator('.archive-card').nth(1).locator('[data-archive-action="delete"]').click();
    await waitIdle(page);
    const after = await readFile(page, 'p', 'archive.md');
    assert.match(after, /A version/);
    assert.doesNotMatch(after, /B version/);
  });

  it('automatic reload keeps the archive list open', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'x'), { lastId: 9 }), 'archive.md': archive(task(9, 'old', '', 'done')) });
    await openFolder(page, 'p');
    await page.click('#archiveBtn');
    await page.waitForSelector('.archive-card');
    await writeFile(page, 'p', 'kanban.md', board(task(1, 'x') + '\n' + task(2, 'by AI'), { lastId: 9 }));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => tasks.length === 2);
    assert.equal(await page.isVisible('#archiveModal .archive-card'), true);
  });
});

describe('ids, input, rendering', () => {
  it('no new task while archive.md is unreadable (ids could collide) — editing still works', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(2, 'x'), { lastId: 0 }), 'archive.md': archive(task(1, 'archived', '', 'done')) });
    await setFault(page, 'p', 'archive.md', { readFail: true });
    await openFolder(page, 'p');
    await page.click('#newTaskBtn');
    assert.equal(await page.isVisible('#newTaskModal'), false);
    assert.match(await notificationText(page), /archive\.md cannot be read/);
    await page.click('.task-edit-btn');
    assert.equal(await page.isVisible('#newTaskModal'), true, 'editing an existing task is allowed');
  });

  it('new ids skip ids used only in archive.md, even with a stale counter', async ({ page }) => {
    await createDir(page, 'p', {
      'kanban.md': board(task(1, 'x'), { lastId: 1 }),
      'archive.md': archive(task(40, 'archived', '', 'done')),
    });
    await openFolder(page, 'p');
    await page.click('#newTaskBtn');
    await page.fill('#taskTitle', 'n');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'kanban.md'), /### TASK-041 \| n/);
  });

  it('description lines that would be read as metadata are refused', async ({ page, dialogs }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'x'), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    const before = await readFile(page, 'p', 'kanban.md');
    for (const bad of ['**Priority**: 高と言われた', '**Notes**: x', '## 見出し']) {
      await page.click('.task-edit-btn');
      await page.fill('#taskDescription', `説明\n${bad}`);
      await page.click('#taskFormSubmitBtn');
      assert.match(dialogs.seen.at(-1).message, /read back as something else/);
      await page.click('#newTaskModal .close-btn');
    }
    await waitIdle(page);
    assert.equal(await readFile(page, 'p', 'kanban.md'), before);
  });

  it('no script runs from a code-block language label or a link (review B-1)', async ({ page }) => {
    const evil = 'Desc\n```<img src=x onerror="window.__pwned=1">\ncode\n```\n[l](//evil.example/x) [j](javascript:window.__pwned=2)';
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'x', evil), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('[data-task-id="TASK-001"] .task-title');
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
    const hrefs = await page.$$eval('#modalBody a', (as) => as.map((a) => [a.getAttribute('href'), a.getAttribute('rel')]));
    assert.deepEqual(hrefs, [['#', 'noopener noreferrer'], ['#', 'noopener noreferrer']]);
  });

  it('legacy migration: never "nothing pending" while a backup is still being written (review B-10)', async ({ page }) => {
    const v1 = '# Board\n\n## ⚙️ Configuration\n\n**Columns**: 📝 To Do | ✅ Done\n\n## 📝 To Do\n\n### TASK-001 | a\n**Priority**: Low\n';
    await createDir(page, 'p', { 'kanban.md': v1 });
    // The backup write is slow (OneDrive): before the fix it ran outside the write queue, so for
    // its whole duration the page reported no pending write ("saved") and allowed closing the tab.
    await setFault(page, 'p', 'kanban.v1-backup.md', { writeDelay: 150 });
    await page.evaluate(() => {
      window.__samples = [];
      window.__sampler = setInterval(() => {
        if (typeof session === 'undefined' || !session) return;
        const disk = window.__mockFS.read('p', 'kanban.md') || '';
        window.__samples.push({ pending: pendingWrites, migrated: disk.includes('<!-- Format: v2 -->') });
      }, 5);
    });
    await openFolder(page, 'p');
    // Stop sampling only once the migration really is on disk.
    await page.waitForFunction(() => (window.__mockFS.read('p', 'kanban.md') || '').includes('<!-- Format: v2 -->'));
    const samples = await page.evaluate(() => { clearInterval(window.__sampler); return window.__samples; });
    assert.ok(samples.length > 10, `sampled ${samples.length}`);
    const gaps = samples.filter((x) => !x.migrated && x.pending === 0);
    assert.deepEqual(gaps, [], 'no moment without a pending write before the migration is on disk');
    assert.equal(await syncState(page), 'saved');
  });

  it('an existing different v1-backup is not overwritten', async ({ page }) => {
    const v1 = '# Board\n\n## ⚙️ Configuration\n\n**Columns**: 📝 To Do | ✅ Done\n\n## 📝 To Do\n\n### TASK-001 | a\n';
    await createDir(page, 'p', { 'kanban.md': v1, 'kanban.v1-backup.md': 'OLDER BACKUP' });
    await openFolder(page, 'p');
    assert.equal(await readFile(page, 'p', 'kanban.v1-backup.md'), 'OLDER BACKUP');
    const files = await page.evaluate(() => window.__mockFS.files('p'));
    const extra = files.find((f) => /^kanban\.v1-backup-\d{8}-\d{6}\.md$/.test(f));
    assert.ok(extra, files.join(','));
    assert.equal(await readFile(page, 'p', extra), v1);
  });
});

describe('review round 3', () => {
  it('actions in the ARCHIVED task dialog never change the board task with the same id', async ({ page }) => {
    const both = task(7, 'twin', SUB, 'done');
    await createDir(page, 'p', { 'kanban.md': board(both, { lastId: 7 }), 'archive.md': archive(both) });
    await openFolder(page, 'p');
    const kb = await readFile(page, 'p', 'kanban.md');
    await page.click('#archiveBtn');
    await page.waitForSelector('.archive-card');
    await page.click('.archive-card strong');
    await page.waitForSelector('#taskModal.active');
    assert.equal(await page.$$eval('#subtasksList button', (b) => b.length), 0, 'no subtask delete button');
    assert.equal(await page.$$eval('#subtasksList [ondblclick]', (b) => b.length), 0, 'no double-click edit');
    // Even if called directly, nothing on the board changes.
    await page.evaluate(() => { deleteSubtask('TASK-007', 0); editSubtask('TASK-007', 0); toggleSubtask('TASK-007', 0); });
    await waitIdle(page);
    assert.equal(await readFile(page, 'p', 'kanban.md'), kb);
    assert.equal(await page.evaluate(() => tasks[0].subtasks.length), 1);
  });

  it('a readable archive.md with format problems does not block new tasks; ids still skip it', async ({ page }) => {
    const ar = archive(task(30, 'a', '', 'done')) + '\n## 2025年\n\n' + task(55, 'b', '', 'done');
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'x'), { lastId: 1 }), 'archive.md': ar });
    await openFolder(page, 'p');
    assert.equal(await page.evaluate(() => !!session.blocked.archive), true, 'archive is read-only');
    await page.click('#newTaskBtn');
    await page.fill('#taskTitle', 'new');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'kanban.md'), /### TASK-056 \| new/);
    assert.equal(await readFile(page, 'p', 'archive.md'), ar);
  });

  it('links with a backslash or whitespace cannot turn into //host', async ({ page }) => {
    const desc = '[a](/\\evil.example/share/x) [b](/\t/evil.example/x) [ok](/local/page)';
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'x', desc), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('[data-task-id="TASK-001"] .task-title');
    const hrefs = await page.$$eval('#modalBody a', (as) => as.map((a) => a.getAttribute('href')));
    assert.deepEqual(hrefs, ['#', '#', '/local/page']);
  });

  it('saving through the form keeps indentation and trailing double spaces of the description', async ({ page }) => {
    const desc = '    indented code\n行末  \n最後';
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'x', desc), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('.task-edit-btn');
    await page.fill('#taskTitle', 'renamed');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'kanban.md'), /\n {4}indented code\n行末 {2}\n最後\n/);
  });
});

describe('review round 4', () => {
  it('switching language keeps the archived-task dialog read-only; nothing reaches the board twin', async ({ page }) => {
    const both = task(7, 'twin', SUB, 'done');
    await createDir(page, 'p', { 'kanban.md': board(both, { lastId: 7 }), 'archive.md': archive(both) });
    await openFolder(page, 'p');
    const kb = await readFile(page, 'p', 'kanban.md');
    await page.click('#archiveBtn');
    await page.waitForSelector('.archive-card');
    await page.click('.archive-card strong');
    await page.waitForSelector('#taskModal.active');
    await page.selectOption('#languageSelector', 'ja');
    assert.equal(await page.$$eval('#taskModalActions button', (b) => b.length), 1, 'only "close"');
    assert.equal(await page.textContent('#taskModalActions button'), '閉じる');
    // Even when called directly, edit / archive / delete do nothing from the archived dialog.
    await page.evaluate(() => { editCurrentTask(); archiveCurrentTask(); deleteCurrentTask(); });
    await waitIdle(page);
    assert.equal(await page.isVisible('#newTaskModal'), false);
    assert.equal(await readFile(page, 'p', 'kanban.md'), kb);
    // The board dialog still gets its actions after a language change.
    await page.click('#taskModal .close-btn');
    await page.click('#archiveModal .close-btn');
    await page.click('[data-task-id="TASK-007"] .task-title');
    await page.selectOption('#languageSelector', 'en');
    assert.equal(await page.$$eval('#taskModalActions button', (b) => b.length), 4);
  });

  it('the form refuses to save a task whose edited object is no longer on the board', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'x'), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('.task-edit-btn');
    await page.evaluate(() => { tasks.splice(0, 1, { ...tasks[0] }); }); // same id, different object
    await page.fill('#taskTitle', 'changed');
    await page.click('#taskFormSubmitBtn');
    assert.match(await notificationText(page), /out of date/);
    assert.equal(await page.evaluate(() => tasks[0].title), 'x');
  });

  it('an EMPTY kanban.md is not rewritten without confirmation', async ({ page, dialogs }) => {
    await createDir(page, 'p', { 'kanban.md': '' });
    dialogs.queue.push(false);
    await page.evaluate(() => { window.__mockFS.nextPick = window.__mockFS.dir('p'); });
    await page.click('#selectFolderBtn');
    await page.waitForTimeout(150);
    assert.match(dialogs.seen.at(-1).message, /EMPTY/);
    assert.deepEqual(await page.evaluate(() => window.__mockFS.files('p')), ['kanban.md']);
    assert.equal(await readFile(page, 'p', 'kanban.md'), '');
    // Confirmed → initialised, no "v1 backup" of the empty file.
    await openFolder(page, 'p');
    assert.deepEqual(await page.evaluate(() => window.__mockFS.files('p')), ['archive.md', 'kanban.md']);
    assert.match(await readFile(page, 'p', 'kanban.md'), /<!-- Format: v2 -->/);
  });

  it('links keep "&" in query strings and mailto', async ({ page }) => {
    const desc = '[q](https://example.com/search?q=a&lang=ja) [m](mailto:a@example.com?subject=x&body=y)';
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'x', desc), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('[data-task-id="TASK-001"] .task-title');
    const hrefs = await page.$$eval('#modalBody a', (as) => as.map((a) => a.getAttribute('href')));
    assert.deepEqual(hrefs, ['https://example.com/search?q=a&lang=ja', 'mailto:a@example.com?subject=x&body=y']);
  });

  it('the form refuses an unclosed code block', async ({ page, dialogs }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'x'), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    const before = await readFile(page, 'p', 'kanban.md');
    await page.click('.task-edit-btn');
    await page.fill('#taskNotes', '```\nno end');
    await page.click('#taskFormSubmitBtn');
    assert.match(dialogs.seen.at(-1).message, /read back as something else/);
    await waitIdle(page);
    assert.equal(await readFile(page, 'p', 'kanban.md'), before);
  });
});

describe('recent projects (real IndexedDB)', () => {
  it('the list is updated on every save, rename and second project (review A-4)', async ({ page }) => {
    const res = await page.evaluate(async () => {
      // Real functions + real IndexedDB. Directory handles cannot be read back from IndexedDB in
      // the test browser's profile, so cloneable stand-ins are used; their isSameEntry() is
      // ASYNCHRONOUS and slow like the real one (identity by a hidden folder id, so two folders
      // with the same name stay two projects). Before the fix, awaiting it inside the IndexedDB
      // transaction made the transaction inactive (TransactionInactiveError) and nothing was saved.
      class FakeHandle { constructor(name, id) { this.name = name; this.kind = 'directory'; this.folderId = id; } }
      FakeHandle.prototype.isSameEntry = async function (o) {
        await new Promise((r) => setTimeout(r, 15));
        return !!o && o.folderId === this.folderId;
      };
      const realLoad = window.__realStorage.loadRecentProjects;
      // IndexedDB returns plain objects: give the stored handles their methods back, as real
      // FileSystemDirectoryHandle objects would have.
      window.loadRecentProjects = async () => (await realLoad()).map((p) => ({ ...p, handle: Object.setPrototypeOf(p.handle, FakeHandle.prototype) }));
      const save = window.__realStorage.saveDirectoryHandle;
      const errors = [];
      const origError = console.error;
      console.error = (...a) => { errors.push(String(a[1] && a[1].name ? a[1].name : a[0])); origError(...a); };
      const results = [
        await save(new FakeHandle('data', 1), 'A'),
        await save(new FakeHandle('data', 2), 'B (same folder name)'),
        await save(new FakeHandle('data', 1), 'A renamed'),
      ];
      console.error = origError;
      return { names: (await loadRecentProjects()).map((p) => p.customName), results, errors };
    });
    assert.deepEqual(res.errors, []);
    assert.deepEqual(res.names, ['A renamed', 'B (same folder name)']);
    assert.deepEqual(res.results, [true, true, true]);
  });

  it('no foreign await inside the IndexedDB transaction (TransactionInactiveError)', async ({ page }) => {
    const res = await page.evaluate(async () => {
      // The folder comparison takes time (real isSameEntry() is an async browser call). If it is
      // awaited while the write transaction is open, the transaction auto-commits and put() fails.
      window.loadRecentProjects = window.__realStorage.loadRecentProjects;
      const realFind = findProjectIndex;
      window.findProjectIndex = async (...a) => { await new Promise((r) => setTimeout(r, 15)); return realFind(...a); };
      class FakeHandle { constructor(n) { this.name = n; this.kind = 'directory'; } }
      const errors = [];
      const origError = console.error;
      console.error = (...a) => { errors.push(String(a[1] && a[1].name ? a[1].name : a[0])); origError(...a); };
      const save = window.__realStorage.saveDirectoryHandle;
      await save(new FakeHandle('A'), 'A');
      await save(new FakeHandle('B'), 'B');
      await save(new FakeHandle('A'), 'A renamed');
      console.error = origError;
      return { errors, names: (await loadRecentProjects()).map((p) => p.customName) };
    });
    assert.deepEqual(res.errors, []);
    assert.deepEqual(res.names, ['A renamed', 'B']);
  });
});

// ----- Review of ce7130e (round 5) -----

const downloadText = async (page) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#syncDownloadBtn', { timeout: 5000 })]);
  return readFileSync(await dl.path(), 'utf8');
};

describe('review round 5: archive, project switch, conflicts', () => {
  it('an archive queued behind a re-read of archive.md does not write it once the re-read makes it read-only (review 1-1)', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(2, 'B', '', 'done'), { lastId: 2 }), 'archive.md': archive(task(1, 'A', '**Subtasks**:\n- [ ] one', 'done')) });
    await openFolder(page, 'p');
    // An AI adds a hand-over line to archive.md that this page cannot keep (not a checkbox).
    const edited = archive(task(1, 'A', '**Subtasks**:\n- [ ] one\n引継ぎ: 担当者へ連絡済み', 'done'));
    await writeFile(page, 'p', 'archive.md', edited);
    await setFault(page, 'p', 'archive.md', { readDelay: 700 });
    await page.click('#archiveBtn'); // opening the archive list re-reads archive.md (slowly)
    await page.click('#kanbanView .task-card'); // the board is still usable meanwhile
    await page.click('#taskModalActions button[onclick="archiveCurrentTask()"]');
    await page.waitForFunction(() => document.getElementById('archiveModal').classList.contains('active'));
    await waitIdle(page);
    assert.equal(await page.evaluate(() => !!session.blocked.archive), true, 'archive.md is read-only after the re-read');
    assert.equal(await readFile(page, 'p', 'archive.md'), edited, 'archive.md was not rewritten (hand-over line kept)');
    assert.match(await readFile(page, 'p', 'kanban.md'), /TASK-002/, 'the task is still on the board');
    assert.doesNotMatch(await notificationText(page), /Task archived/);
  });

  it('a switch that waited for permission does not replace a project opened (and edited) meanwhile (review 1-2)', async ({ page, dialogs }) => {
    for (const n of ['A', 'B', 'C']) {
      await createDir(page, n, { 'kanban.md': board(task(1, `${n} task`), { lastId: 1 }), 'archive.md': archive('') });
    }
    await openFolder(page, 'A');
    await page.evaluate(async () => {
      window.__projects = ['C', 'B', 'A'].map((n) => ({ handle: window.__mockFS.dir(n), name: n, customName: '', lastAccessed: Date.now() }));
      window.__permissionB = new Promise((r) => { window.__grantB = r; });
      window.__mockFS.dir('B').queryPermission = async () => { await window.__permissionB; return 'granted'; };
      await updateProjectSelector();
    });
    await page.selectOption('#projectSelector', '1'); // B: waits for the permission
    await page.selectOption('#projectSelector', '0'); // C: opens right away
    await page.waitForFunction(() => session && session.dir.name === 'C');
    await waitIdle(page);
    await setFault(page, 'C', 'kanban.md', { writeFail: true });
    await page.evaluate(() => { tasks[0].title = 'C edited, not saved'; return autoSave(); });
    assert.equal(await page.evaluate(() => isDirty()), true);
    const seen = dialogs.seen.length;
    await page.evaluate(() => window.__grantB());
    await page.waitForTimeout(300);
    await waitIdle(page);
    assert.equal(await page.evaluate(() => session.dir.name), 'C', 'still on C');
    assert.equal(await page.evaluate(() => tasks[0].title), 'C edited, not saved', 'the unsaved edit is still there');
    assert.deepEqual(dialogs.seen.slice(seen), [], 'nothing was discarded behind the user\'s back');
  });

  it('saving the form during a conflict keeps the edit in the page: exported, and reload asks first (review 1-4 / 2-4)', async ({ page, dialogs }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'Old title'), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('.task-edit-btn');
    await page.fill('#taskTitle', 'Typed title');
    const external = board(task(1, 'Old title') + '\n' + task(2, 'added by AI'), { lastId: 2 });
    await writeFile(page, 'p', 'kanban.md', external);
    await page.evaluate(() => checkExternalChanges()); // e.g. the window got the focus back
    assert.equal(await syncState(page), 'conflict');
    await page.click('#taskFormSubmitBtn');
    assert.equal(await page.evaluate(() => document.getElementById('newTaskModal').classList.contains('active')), false);
    assert.match(await notificationText(page), /kept in this page only/);
    assert.equal(await readFile(page, 'p', 'kanban.md'), external, 'nothing was written');
    assert.equal(await page.evaluate(() => isDirty()), true);
    assert.match(await downloadText(page), /### TASK-001 \| Typed title/);
    dialogs.queue.push(false); // "discard unsaved changes?" → Cancel
    await page.click('#syncReloadBtn');
    assert.match(dialogs.seen.at(-1).message, /DISCARDED/);
    assert.equal(await page.evaluate(() => tasks[0].title), 'Typed title', 'cancel keeps the edit');
  });

  it('with the form still open, the conflict banner is usable above it and the export contains the typed text (review 1-4 / 2-4)', async ({ page, dialogs }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'T'), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('.task-edit-btn');
    await page.fill('#taskDescription', '入力途中の説明');
    await writeFile(page, 'p', 'kanban.md', board(task(1, 'T changed outside'), { lastId: 1 }));
    await page.evaluate(() => checkExternalChanges());
    assert.equal(await syncState(page), 'conflict');
    assert.equal(await page.evaluate(() => isDirty()), false, 'the board itself has no unsaved change');
    assert.match(await downloadText(page), /入力途中の説明/, 'the open form is part of the export');
    dialogs.queue.push(false);
    await page.click('#syncReloadBtn', { timeout: 5000 });
    assert.match(dialogs.seen.at(-1).message, /DISCARDED/, 'reload asks before discarding the form');
    assert.equal(await page.inputValue('#taskDescription'), '入力途中の説明', 'the form is still open with its text');
    dialogs.queue.push(false);
    await page.click('#newTaskModal .close-btn');
    assert.match(dialogs.seen.at(-1).message, /Discard what you typed/);
    assert.equal(await page.evaluate(() => document.getElementById('newTaskModal').classList.contains('active')), true);
  });

  it('a failed automatic reload keeps its error instead of reporting success (review 2-5)', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'T'), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await writeFile(page, 'p', 'kanban.md', board(task(1, 'T2'), { lastId: 1 }));
    await setFault(page, 'p', 'archive.md', { readDelay: 300 });
    const check = page.evaluate(() => checkExternalChanges());
    await page.waitForTimeout(100);
    await setFault(page, 'p', 'kanban.md', { readFail: true }); // the reload itself cannot read kanban.md
    await check;
    assert.doesNotMatch(await notificationText(page), /Changes made outside this page were loaded/);
    assert.match(await notificationText(page), /Could not read kanban\.md/);
  });
});

describe('review round 5: task form', () => {
  it('a language switch while editing keeps the selected priority and a custom one (review 1-6)', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'A', '**Priority**: High') + '\n' + task(2, 'B', '**Priority**: 至急'), { lastId: 2 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('#kanbanView .task-card:has-text("A") .task-edit-btn');
    assert.equal(await page.inputValue('#taskPriority'), 'High');
    await page.selectOption('#languageSelector', 'ja');
    assert.equal(await page.inputValue('#taskPriority'), 'High', 'still High after the switch');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'kanban.md'), /### TASK-001 \| A\n\*\*Status\*\*: todo\n\*\*Priority\*\*: High\n/);
    await page.click('#kanbanView .task-card:has-text("B") .task-edit-btn');
    await page.selectOption('#languageSelector', 'en');
    assert.equal(await page.inputValue('#taskPriority'), '至急', 'a custom priority survives the switch');
  });

  it('the form refuses values that would not read back; "＃" tags are stored as "#" (review 1-8 / 2-3)', async ({ page, dialogs }) => {
    const start = board('', { lastId: 0 });
    await createDir(page, 'p', { 'kanban.md': start, 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('#newTaskBtn');
    await page.fill('#taskTitle', '月次締め');
    await page.fill('#taskCategory', '開発 | 運用');
    await page.click('#taskFormSubmitBtn');
    assert.equal(dialogs.seen.length, 1, 'the form refused the category (an alert was shown)');
    assert.match(dialogs.seen.at(-1).message, /cannot contain "\|"/);
    assert.equal(await readFile(page, 'p', 'kanban.md'), start, 'nothing written');
    assert.equal(await page.evaluate(() => tasks.length), 0, 'nothing added to the board');
    await page.fill('#taskCategory', '経理');
    await page.fill('#taskAssignee', '@a');
    await page.fill('#taskTags', '＃経理 ＃月次');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'kanban.md'), /\*\*Tags\*\*: #経理 #月次\n/);
    await page.evaluate(() => reloadFromDisk({ force: true }));
    await waitIdle(page);
    assert.equal(await page.evaluate(() => session.blocked.kanban), null, 'the saved file is not read-only');
    await page.click('#newTaskBtn');
    await page.fill('#taskTitle', '   ');
    const before = dialogs.seen.length;
    await page.click('#taskFormSubmitBtn');
    assert.equal(dialogs.seen.length, before + 1, 'a blank title was refused (an alert was shown)');
    assert.match(dialogs.seen.at(-1).message, /enter a title/);
    assert.equal(await page.evaluate(() => tasks.length), 1);
  });
});

describe('review round 5: reading', () => {
  it('a file that opens but cannot be read is never taken as unchanged: nothing is written (review 2-8)', async ({ page }) => {
    const start = board(task(1, 'T'), { lastId: 1 });
    await createDir(page, 'p', { 'kanban.md': start, 'archive.md': archive('') });
    await openFolder(page, 'p');
    await setFault(page, 'p', 'kanban.md', { contentFail: true });
    const ok = await page.evaluate(() => { tasks[0].title = 'edited'; return autoSave(); });
    assert.equal(ok, false);
    assert.equal(await syncState(page), 'error');
    assert.equal(await readFile(page, 'p', 'kanban.md'), start);
    assert.equal(await page.evaluate(() => isDirty()), true, 'the edit is kept (unsaved) for a retry / export');
  });
});

describe('review round 5: text encoding', () => {
  // "タスク" in Shift_JIS (cp932): what Windows PowerShell 5.1 Set-Content / Add-Content write.
  const SJIS = [0x83, 0x5e, 0x83, 0x58, 0x83, 0x4e];
  const utf8 = (s) => Array.from(new TextEncoder().encode(s));

  it('a Shift_JIS archive.md is never rewritten: archive and restore are refused (review 2-1)', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(2, 'B', '', 'done'), { lastId: 2 }) });
    const bytes = [...utf8('# Task Archive\n<!-- Format: v2 -->\n\n## Archives\n\n### TASK-001 | '), ...SJIS, ...utf8('\n**Status**: done\n')];
    await writeBytes(page, 'p', 'archive.md', bytes);
    await openFolder(page, 'p');
    assert.equal(await page.evaluate(() => (session.blocked.archive || []).map((p) => p.code).join()), 'not-utf8');
    assert.equal((await page.evaluate(() => archiveTask(tasks[0]))).ok, false);
    assert.equal((await page.evaluate(() => unarchiveTaskObject(archivedTasks[0]))).ok, false);
    await waitIdle(page);
    assert.deepEqual(await readBytes(page, 'p', 'archive.md'), bytes, 'archive.md bytes unchanged');
    assert.match(await readFile(page, 'p', 'kanban.md'), /TASK-002/);
  });

  it('a kanban.md that is not UTF-8 opens read-only and is never saved (review 2-1)', async ({ page }) => {
    const text = board('### TASK-001 | X\n**Status**: todo\n', { lastId: 1 });
    const i = text.indexOf('X\n');
    const bytes = [...utf8(text.slice(0, i)), ...SJIS, ...utf8(text.slice(i + 1))];
    await createDir(page, 'p', { 'archive.md': archive('') });
    await writeBytes(page, 'p', 'kanban.md', bytes);
    await openFolder(page, 'p');
    assert.equal(await syncState(page), 'blocked');
    await page.evaluate(() => { tasks[0].title = 'edited'; return autoSave(); });
    await waitIdle(page);
    assert.deepEqual(await readBytes(page, 'p', 'kanban.md'), bytes, 'kanban.md bytes unchanged');
    assert.match(await page.textContent('#syncBannerDetail'), /not UTF-8/);
  });
});

describe('review round 6: task form', () => {
  it('subtask text typed but not added is part of the conflict export and of the in-page save (round 6: review 1-1)', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'T', SUB), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('.task-edit-btn');
    await page.fill('#formSubtaskInput', '未追加のサブタスク'); // "Add" is not pressed
    const external = board(task(1, 'T changed outside', SUB), { lastId: 1 });
    await writeFile(page, 'p', 'kanban.md', external);
    await page.evaluate(() => checkExternalChanges());
    assert.equal(await syncState(page), 'conflict');
    assert.match(await downloadText(page), /- \[ \] step one\n- \[ \] 未追加のサブタスク\n/, 'the typed subtask is in the export');
    await page.click('#taskFormSubmitBtn'); // during the conflict: applied to the page only
    assert.equal(await page.evaluate(() => document.getElementById('newTaskModal').classList.contains('active')), false);
    assert.deepEqual(await page.evaluate(() => tasks[0].subtasks.map((s) => s.text)), ['step one', '未追加のサブタスク']);
    assert.equal(await readFile(page, 'p', 'kanban.md'), external, 'nothing was written');
  });

  it('"Save" with subtask text typed but not added saves it as a subtask (round 6: review 1-1)', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'T', SUB), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('.task-edit-btn');
    await page.fill('#formSubtaskInput', '  step two  ');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'kanban.md'), /\*\*Subtasks\*\*:\n- \[ \] step one\n- \[ \] step two\n/);
  });
});

describe('review round 6: project switching', () => {
  it('a slow startup restore does not replace a folder the user is picking meanwhile (round 6: review 1-5)', async ({ page }) => {
    for (const n of ['A', 'B']) {
      await createDir(page, n, { 'kanban.md': board(task(1, `${n} task`), { lastId: 1 }), 'archive.md': archive('') });
    }
    await page.evaluate(() => {
      window.__history = new Promise((r) => { window.__releaseHistory = r; });
      window.__pick = new Promise((r) => { window.__releasePick = r; });
      window.loadRecentProjects = async () => {
        await window.__history; // the startup read of the recent-projects list is slow
        return [{ handle: window.__mockFS.dir('A'), name: 'A', customName: '', lastAccessed: Date.now() }];
      };
      window.showDirectoryPicker = async () => { await window.__pick; return window.__mockFS.dir('B'); };
      window.__restore = tryRestorePreviousDirectory(); // startup: waits for the list
    });
    await page.click('#selectFolderBtn'); // the user picks B (the picker is still open)
    await page.evaluate(() => window.__releaseHistory()); // the list arrives: A
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__releasePick()); // the user chooses B
    await page.evaluate(() => window.__restore);
    await page.waitForFunction(() => session && session.dir.name === 'B', null, { timeout: 5000 }).catch(() => {});
    await waitIdle(page);
    assert.equal(await page.evaluate(() => session && session.dir.name), 'B', 'the folder the user chose is open');
    assert.equal(await page.evaluate(() => tasks[0].title), 'B task');
  });
});

describe('review round 6: text encoding', () => {
  // UTF-16LE with BOM: what Windows PowerShell 5.1 Out-File and ">" write by default.
  const utf16le = (s) => [0xff, 0xfe, ...Array.from(new Uint8Array(new Uint16Array([...s].map((c) => c.charCodeAt(0))).buffer))];

  it('a UTF-16 archive.md stops new tasks: its ids cannot be read, so no id is reused (round 6: review 2-1)', async ({ page }) => {
    const start = board(task(3, 'C'), { lastId: 3 });
    await createDir(page, 'p', { 'kanban.md': start });
    await writeBytes(page, 'p', 'archive.md', utf16le(archive(task(4, 'archived D', '', 'done'))));
    await openFolder(page, 'p');
    await page.click('#newTaskBtn');
    assert.equal(await page.evaluate(() => document.getElementById('newTaskModal').classList.contains('active')), false, 'the new-task form does not open');
    assert.match(await notificationText(page), /not UTF-8/);
    // Also refused when the form was opened before archive.md became UTF-16 (checked again on submit).
    await page.evaluate(() => { session.files.archive.notUtf8 = false; openTaskModal(); session.files.archive.notUtf8 = true; });
    await page.fill('#taskTitle', '新しいタスク');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.match(await notificationText(page), /not UTF-8/);
    assert.equal(await readFile(page, 'p', 'kanban.md'), start, 'nothing written (TASK-004 is used in the archive)');
    assert.deepEqual(await page.evaluate(() => tasks.map((t) => t.id)), ['TASK-003']);
    // Existing tasks can still be edited.
    await page.evaluate(() => closeTaskModal());
    await page.evaluate(() => { tasks[0].title = 'C edited'; return persistKanban(); });
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'kanban.md'), /### TASK-003 \| C edited/);
  });
});

describe('review round 6: form values that the inputs cannot show', () => {
  it('a date the date input cannot show (not YYYY-MM-DD) is kept unless it is changed (round 6: review 2-3)', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'A', '**Created**: 2026-1-5 | **Due**: 20261231'), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('.task-edit-btn');
    const shown = await notificationText(page);
    await page.fill('#taskTitle', 'A2');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'kanban.md'), /### TASK-001 \| A2\n\*\*Status\*\*: todo\n\*\*Created\*\*: 2026-1-5 \| \*\*Due\*\*: 20261231\n/);
    assert.match(shown, /2026-1-5/, 'the form said which date it cannot show');
    // A date the user picks replaces the kept value.
    await page.click('.task-edit-btn');
    await page.fill('#taskDue', '2026-12-31');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'kanban.md'), /\*\*Created\*\*: 2026-1-5 \| \*\*Due\*\*: 2026-12-31\n/);
  });

  it('a description / notes ending with "---" is saved (the separator is dropped like on reading) (round 6: review 2-5)', async ({ page, dialogs }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'A'), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('.task-edit-btn');
    await page.fill('#taskDescription', '説明\n---\n');
    await page.fill('#taskNotes', 'メモ\n\n---');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.deepEqual(dialogs.seen, [], 'no refusal');
    const md = await readFile(page, 'p', 'kanban.md');
    assert.match(md, /### TASK-001 \| A\n\*\*Status\*\*: todo\n\n説明\n\n\*\*Notes\*\*:\nメモ\n/);
    await page.evaluate(() => reloadFromDisk({ force: true }));
    await waitIdle(page);
    assert.equal(await page.evaluate(() => session.blocked.kanban), null, 'the saved file is not read-only');
  });
});

describe('review round 7: text encoding', () => {
  // UTF-16LE WITHOUT a BOM: ASCII-only content is valid UTF-8 byte by byte (a NUL after each character).
  const utf16leNoBom = (s) => Array.from(new Uint8Array(new Uint16Array([...s].map((c) => c.charCodeAt(0))).buffer));

  it('a UTF-16 archive.md without a BOM is not UTF-8: no new task, no archive write (round 7: review 1)', async ({ page }) => {
    const start = board(task(3, 'C', '', 'done'), { lastId: 3 });
    await createDir(page, 'p', { 'kanban.md': start });
    const bytes = utf16leNoBom(archive(task(4, 'archived D', '', 'done')));
    await writeBytes(page, 'p', 'archive.md', bytes);
    await openFolder(page, 'p');
    assert.equal(await page.evaluate(() => (session.blocked.archive || []).map((p) => p.code).join()), 'not-utf8');
    await page.click('#newTaskBtn');
    assert.equal(await page.evaluate(() => document.getElementById('newTaskModal').classList.contains('active')), false, 'the new-task form does not open');
    assert.match(await notificationText(page), /not UTF-8/);
    assert.equal((await page.evaluate(() => archiveTask(tasks[0]))).ok, false);
    await waitIdle(page);
    assert.deepEqual(await readBytes(page, 'p', 'archive.md'), bytes, 'archive.md bytes unchanged');
    assert.equal(await readFile(page, 'p', 'kanban.md'), start);
  });
});

describe('review round 7: task form and load warnings', () => {
  it('load warnings of kanban.md AND archive.md stay visible after the folder is opened (round 7: review 4)', async ({ page }) => {
    await createDir(page, 'p', {
      'kanban.md': board(task(2, 'B', '**Due**: 2026-2-1'), { lastId: 2 }),
      'archive.md': archive(task(1, 'A', '**Finished**: 2026-1-5', 'done')),
    });
    await openFolder(page, 'p'); // the folder picker: "Folder loaded" used to replace the warning
    const text = await notificationText(page);
    assert.match(text, /YYYY-MM-DD/);
    assert.match(text, /TASK-002 Due: 2026-2-1/, 'kanban.md');
    assert.match(text, /archive\.md TASK-001 Finished: 2026-1-5/, 'archive.md');
    // Opening from the recent-projects list keeps it visible too.
    await createDir(page, 'q', { 'kanban.md': board(task(1, 'Q'), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'q');
    await page.evaluate(() => { window.__projects = [{ handle: window.__mockFS.dir('q'), name: 'q', customName: '', lastAccessed: Date.now() }, { handle: window.__mockFS.dir('p'), name: 'p', customName: '', lastAccessed: Date.now() }]; return updateProjectSelector(); });
    await page.selectOption('#projectSelector', '1');
    await page.waitForFunction(() => session && session.dir.name === 'p');
    await waitIdle(page);
    assert.match(await notificationText(page), /archive\.md TASK-001 Finished: 2026-1-5/);
  });

  it('Enter in the subtask field adds the subtask; it does not save or close the form (round 7: review 5)', async ({ page }) => {
    const start = board('', { lastId: 0 });
    await createDir(page, 'p', { 'kanban.md': start, 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('#newTaskBtn');
    await page.fill('#taskTitle', '新規');
    await page.fill('#formSubtaskInput', 'first');
    await page.press('#formSubtaskInput', 'Enter');
    assert.equal(await page.evaluate(() => document.getElementById('newTaskModal').classList.contains('active')), true, 'the form is still open');
    assert.deepEqual(await page.evaluate(() => formSubtasks.map((s) => s.text)), ['first']);
    assert.equal(await page.inputValue('#formSubtaskInput'), '');
    await page.press('#formSubtaskInput', 'Enter'); // empty field: nothing happens
    assert.equal(await page.evaluate(() => document.getElementById('newTaskModal').classList.contains('active')), true);
    assert.equal(await readFile(page, 'p', 'kanban.md'), start, 'nothing saved yet');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'kanban.md'), /### TASK-001 \| 新規\n[\s\S]*\*\*Subtasks\*\*:\n- \[ \] first\n(?!- \[ \] first)/);
  });

  it('dropping a trailing "---" (e.g. a heading underline) is said in the save notification (round 7: review 6)', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'A'), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('.task-edit-btn');
    await page.fill('#taskDescription', '本文\n\n手順\n---');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    const md = await readFile(page, 'p', 'kanban.md');
    assert.match(md, /\*\*Status\*\*: todo\n\n本文\n\n手順\n/);
    assert.doesNotMatch(md, /手順\n-{3}/);
    assert.match(await notificationText(page), /TASK-001 updated.*"---"/);
    // Without a trailing "---" there is no such note.
    await page.click('.task-edit-btn');
    await page.fill('#taskDescription', '本文');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.doesNotMatch(await notificationText(page), /---/);
  });
});

describe('review round 8: characters that cannot be written (NUL)', () => {
  const start = () => board(task(1, 'A', '**Priority**: Medium\n\n**Subtasks**:\n- [ ] one'), { lastId: 1 });
  const typeInto = async (page, selector, text) => { await page.focus(selector); await page.keyboard.insertText(text); };
  const stateOf = (page) => page.evaluate(() => ({ conflict: session.conflict, lastError: session.lastError && session.lastError.kind, blocked: session.blocked.kanban }));

  it('a NUL typed into any field of the task form is refused before anything is written (round 8: review 中-1)', async ({ page, dialogs }) => {
    await createDir(page, 'p', { 'kanban.md': start(), 'archive.md': archive('') });
    await openFolder(page, 'p');
    for (const field of ['#taskTitle', '#taskCategory', '#taskAssignee', '#taskTags', '#taskDescription', '#taskNotes', '#formSubtaskInput']) {
      await page.click('.task-edit-btn');
      await typeInto(page, field, 'before\u0000after');
      const seen = dialogs.seen.length;
      await page.click('#taskFormSubmitBtn');
      await waitIdle(page);
      const alerts = dialogs.seen.slice(seen).filter((d) => d.type === 'alert');
      assert.equal(alerts.length, 1, `${field}: one alert`);
      assert.match(alerts[0].message, /NOT saved[\s\S]*NUL[\s\S]*before␀after/, field);
      assert.equal(await readFile(page, 'p', 'kanban.md'), start(), `${field}: kanban.md unchanged`);
      assert.equal(await page.evaluate(() => document.getElementById('newTaskModal').classList.contains('active')), true, `${field}: the form stays open`);
      assert.deepEqual(await stateOf(page), { conflict: null, lastError: null, blocked: null }, field);
      assert.equal(await syncState(page), 'saved', field);
      await page.evaluate(() => closeTaskModal());
    }
    // A new task: refused too, and no id is used up.
    await page.click('#newTaskBtn');
    await page.fill('#taskTitle', 'New');
    await typeInto(page, '#taskDescription', 'x\u0000y');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.equal(await readFile(page, 'p', 'kanban.md'), start());
    assert.deepEqual(await page.evaluate(() => [tasks.length, config.lastTaskId]), [1, 1]);
    // Reloading finds a writable board (it was not damaged).
    await page.evaluate(() => { closeTaskModal(); return reloadFromDisk({ force: true }); });
    await waitIdle(page);
    assert.equal(await page.evaluate(() => session.blocked.kanban), null);
  });

  it('a NUL in a subtask added in the detail view is refused: no write, no conflict (round 8: review 中-1)', async ({ page, dialogs }) => {
    await createDir(page, 'p', { 'kanban.md': start(), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('.task-card');
    await typeInto(page, '#newSubtaskInput', 'x\u0000y');
    await page.press('#newSubtaskInput', 'Enter');
    await waitIdle(page);
    assert.ok(dialogs.seen.some((d) => d.type === 'alert' && /NUL[\s\S]*x␀y/.test(d.message)), JSON.stringify(dialogs.seen));
    assert.equal(await readFile(page, 'p', 'kanban.md'), start());
    assert.deepEqual(await page.evaluate(() => tasks[0].subtasks.map((s) => s.text)), ['one']);
    assert.deepEqual(await stateOf(page), { conflict: null, lastError: null, blocked: null });
    // Editing a subtask (prompt) is checked the same way.
    dialogs.queue.push('o\u0000ne');
    const seenEdit = dialogs.seen.length;
    await page.evaluate(() => editSubtask('TASK-001', 0));
    await waitIdle(page);
    assert.ok(dialogs.seen.slice(seenEdit).some((d) => d.type === 'alert' && /NOT saved[\s\S]*o\u2400ne/.test(d.message)), JSON.stringify(dialogs.seen.slice(seenEdit)));
    assert.equal(await readFile(page, 'p', 'kanban.md'), start());
    assert.deepEqual(await page.evaluate(() => tasks[0].subtasks.map((s) => s.text)), ['one']);
  });

  it('a NUL in a column name or id is refused (round 8: review 中-1)', async ({ page, dialogs }) => {
    await createDir(page, 'p', { 'kanban.md': start(), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('#manageColsBtn');
    const nameInput = page.locator('#columnsList input[type="text"]').first();
    await nameInput.click();
    await page.keyboard.press('End');
    await page.keyboard.insertText('\u0000x');
    await page.keyboard.press('Tab'); // change event → updateColumn
    await waitIdle(page);
    assert.ok(dialogs.seen.some((d) => d.type === 'alert' && /columns were NOT changed[\s\S]*␀/.test(d.message)), JSON.stringify(dialogs.seen));
    assert.equal(await readFile(page, 'p', 'kanban.md'), start());
    assert.equal(await page.evaluate(() => config.columns[0].name), '📝 To Do');
    // The id of a column (its tasks would get the new id as their **Status**).
    const seen = dialogs.seen.length;
    const idInput = page.locator('#columnsList input[type="text"]').nth(1);
    await idInput.click();
    await page.keyboard.press('End');
    await page.keyboard.insertText('\u0000');
    await page.keyboard.press('Tab');
    await waitIdle(page);
    assert.ok(dialogs.seen.slice(seen).some((d) => d.type === 'alert' && /columns were NOT changed[\s\S]*\u2400/.test(d.message)), JSON.stringify(dialogs.seen.slice(seen)));
    assert.equal(await readFile(page, 'p', 'kanban.md'), start());
    assert.deepEqual(await page.evaluate(() => [config.columns[0].id, tasks[0].status]), ['todo', 'todo']);
    dialogs.queue.push('Later\u0000', 'later');
    const seenAdd = dialogs.seen.length;
    await page.evaluate(() => addColumn());
    await waitIdle(page);
    assert.ok(dialogs.seen.slice(seenAdd).some((d) => d.type === 'alert' && /columns were NOT changed[\s\S]*Later\u2400/.test(d.message)), JSON.stringify(dialogs.seen.slice(seenAdd)));
    assert.equal(await readFile(page, 'p', 'kanban.md'), start());
    assert.equal(await page.evaluate(() => config.columns.length), 3);
    assert.deepEqual(await stateOf(page), { conflict: null, lastError: null, blocked: null });
  });

  it('last line of defence: writeFileChecked refuses content that would not read back, before writing (round 8: review 中-1)', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': start(), 'archive.md': archive('') });
    await openFolder(page, 'p');
    // A NUL that reached the board without an input check.
    const ok = await page.evaluate(() => { tasks[0].description = 'before\u0000after'; return persistKanban('saved'); });
    await waitIdle(page);
    assert.equal(ok, false);
    assert.equal(await readFile(page, 'p', 'kanban.md'), start(), 'nothing written');
    assert.deepEqual(await stateOf(page), { conflict: null, lastError: 'refused', blocked: null });
    assert.match(await page.evaluate(() => document.getElementById('syncBannerDetail').textContent), /\d+: before␀after[\s\S]*Retrying cannot save them/);
    // The same content would be refused again: no "Retry", but the export stays available.
    assert.deepEqual(await page.evaluate(() => ['syncRetryBtn', 'syncDownloadBtn', 'syncCopyBtn'].map((id) => document.getElementById(id).style.display)), ['none', 'inline-flex', 'inline-flex']);
    // A lone surrogate (it would be written as U+FFFD) in archive.md: refused the same way.
    const kind = await page.evaluate(async () => {
      try { await enqueueWrite(() => writeFileChecked(session, 'archive', archive0() + '\n### TASK-009 | x' + String.fromCharCode(0xD800) + '\n')); return 'written'; } catch (e) { return e.kind; }
      function archive0() { return session.files.archive.baseline; }
    });
    assert.equal(kind, 'refused');
    assert.equal(await readFile(page, 'p', 'archive.md'), archive(''));
  });

  it('no new task while archive.md has a NUL (e.g. its end overwritten by a crash); existing tasks stay editable (round 8: review 中-1)', async ({ page }) => {
    const kanban = board(task(3, 'C', '', 'done'), { lastId: 3 });
    // The archived TASK-004 / TASK-005 are lost under the NULs: their ids are unknown.
    const damaged = archive(task(2, 'B', '', 'done')) + '\u0000'.repeat(200);
    await createDir(page, 'p', { 'kanban.md': kanban, 'archive.md': damaged });
    await openFolder(page, 'p');
    assert.deepEqual(await page.evaluate(() => (session.blocked.archive || []).map((p) => p.code)), ['nul-char']);
    await page.click('#newTaskBtn');
    assert.equal(await page.evaluate(() => document.getElementById('newTaskModal').classList.contains('active')), false, 'the new-task form does not open');
    assert.match(await notificationText(page), /archive\.md contains NUL characters/);
    assert.equal((await page.evaluate(() => archiveTask(tasks[0]))).ok, false, 'no archive operation');
    await waitIdle(page);
    assert.equal(await readFile(page, 'p', 'archive.md'), damaged, 'archive.md unchanged');
    assert.equal(await readFile(page, 'p', 'kanban.md'), kanban);
    // Editing an existing task still works.
    await page.click('.task-edit-btn');
    await page.fill('#taskTitle', 'C2');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'kanban.md'), /### TASK-003 \| C2\n/);
  });

  it('a NUL in valid UTF-8 opens read-only as "nul-char" with its line; UTF-16BE without a BOM is still not UTF-8 (round 8: review 中-1)', async ({ page }) => {
    const text = board(task(1, 'A', '\nbefore\u0000after'), { lastId: 1 });
    const lineNo = text.split('\n').findIndex((l) => l.includes('\u0000')) + 1;
    await createDir(page, 'p', { 'kanban.md': text, 'archive.md': archive('') });
    await openFolder(page, 'p');
    assert.deepEqual(await page.evaluate(() => session.blocked.kanban.map((p) => [p.code, p.line])), [['nul-char', lineNo]]);
    const banner = await page.evaluate(() => document.getElementById('syncBannerDetail').textContent);
    assert.match(banner, new RegExp(`NUL[\\s\\S]*line ${lineNo}[\\s\\S]*${lineNo}: before␀after`));
    assert.doesNotMatch(banner, /not UTF-8/);
    // Guard: UTF-16BE without a BOM (ASCII only, valid UTF-8 byte by byte) stays "not UTF-8".
    const be = [];
    for (const ch of board(task(1, 'A'), { lastId: 1 })) { const c = ch.charCodeAt(0); if (c < 0x80) be.push(0, c); }
    await createDir(page, 'q', {});
    await writeBytes(page, 'q', 'kanban.md', be);
    await openFolder(page, 'q');
    const codes = await page.evaluate(() => session.blocked.kanban.map((p) => p.code));
    assert.equal(codes[0], 'not-utf8', codes.join());
    assert.ok(!codes.includes('nul-char'), 'its NULs are part of "not UTF-8"');
  });
});

describe('review round 8: load warnings after a reload', () => {
  // An AI wrote dates that are not YYYY-MM-DD into both files (title n tells the versions apart).
  const aiEdit = (page, n) => Promise.all([
    writeFile(page, 'p', 'kanban.md', board(task(1, `A${n}`, '**Due**: 2026-2-1'), { lastId: 2 })),
    writeFile(page, 'p', 'archive.md', archive(task(2, `B${n}`, '**Finished**: 2026-1-5', 'done'))),
  ]);
  const start = () => ({ 'kanban.md': board(task(1, 'A', '**Due**: 2026-02-01'), { lastId: 2 }), 'archive.md': archive(task(2, 'B', '**Finished**: 2026-01-05', 'done')) });
  // Waits for the reload (a new session that shows title A<n>) and its message, then checks that
  // the message keeps the warnings of BOTH files.
  async function expectWarningsAfter(page, n, message, label) {
    await page.waitForFunction((x) => session && tasks.length && tasks[0].title === `A${x}`, n);
    await waitIdle(page);
    await page.waitForFunction((m) => document.getElementById('notificationText').textContent.includes(m), message);
    const text = await notificationText(page);
    assert.match(text, /TASK-001 Due: 2026-2-1/, `${label}: kanban.md warning (${text})`);
    assert.match(text, /archive\.md TASK-002 Finished: 2026-1-5/, `${label}: archive.md warning (${text})`);
    assert.match(await page.evaluate(() => document.getElementById('notification').className), /\berror\b/, label);
  }

  it('🔄 without unsaved work and the automatic reload on focus keep the load warnings (round 8: review 中-2)', async ({ page }) => {
    await createDir(page, 'p', start());
    await openFolder(page, 'p');
    await aiEdit(page, 1);
    await page.click('#reloadBtn');
    await expectWarningsAfter(page, 1, 'Changes made outside this page were loaded', '🔄');
    await aiEdit(page, 2);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expectWarningsAfter(page, 2, 'Changes made outside this page were loaded', 'focus');
    // Also while the archive dialog is open (it stays open after the reload).
    await page.click('#archiveBtn');
    await waitIdle(page);
    await aiEdit(page, 3);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expectWarningsAfter(page, 3, 'Changes made outside this page were loaded', 'focus, archive dialog open');
    assert.equal(await page.evaluate(() => document.getElementById('archiveModal').classList.contains('active')), true);
  });

  it('the banner\'s "Reload from disk" and 🔄 with unsaved work keep the load warnings (round 8: review 中-2)', async ({ page }) => {
    await createDir(page, 'p', start());
    await openFolder(page, 'p');
    for (const [n, button] of [[1, '#syncReloadBtn'], [2, '#reloadBtn']]) {
      await aiEdit(page, n);
      await page.evaluate(() => { tasks[0].title = 'changed here'; return autoSave(); }); // → conflict
      await waitIdle(page);
      assert.equal(await syncState(page), 'conflict');
      await page.click(button); // asks before discarding (accepted)
      await expectWarningsAfter(page, n, 'Reloaded from disk', button);
    }
  });
});

describe('review round 8: errors while a project is opened', () => {
  const notification = (page) => page.evaluate(() => ({ text: document.getElementById('notificationText').textContent, cls: document.getElementById('notification').className }));

  it('a failed save while opening (V1 migration) is not covered by "Folder loaded" (round 8: review 低-6)', async ({ page }) => {
    const v1 = readFileSync(new URL('../../examples/kanban.md', import.meta.url), 'utf8');
    await createDir(page, 'p', { 'kanban.md': v1, 'archive.md': archive('') });
    await setFault(page, 'p', 'kanban.md', { writeFail: true });
    await openFolder(page, 'p');
    const n = await notification(page);
    assert.match(n.text, /Folder loaded successfully!.*Writing kanban\.md failed/, n.text);
    assert.match(n.cls, /\berror\b/);
    assert.equal(await page.evaluate(() => session.lastError && session.lastError.kind), 'write-failed');
    assert.equal(await readFile(page, 'p', 'kanban.md'), v1, 'the V1 file is unchanged');
    assert.equal(await syncState(page), 'error');
  });

  it('a recent-projects list that could not be updated is said with the "loaded" message (round 8: review 低-6)', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'A'), { lastId: 1 }), 'archive.md': archive('') });
    await page.evaluate(() => { window.saveDirectoryHandle = async () => false; });
    await openFolder(page, 'p');
    const n = await notification(page);
    assert.match(n.text, /Folder loaded successfully!.*recent-projects list could not be updated/, n.text);
    assert.match(n.cls, /\berror\b/);
    // Without a problem the message stays a plain success.
    await page.evaluate(() => { window.saveDirectoryHandle = async () => true; });
    await createDir(page, 'q', { 'kanban.md': board(task(1, 'Q'), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'q');
    assert.deepEqual(await notification(page), { text: 'Folder loaded successfully!', cls: 'notification success show' });
  });
});
