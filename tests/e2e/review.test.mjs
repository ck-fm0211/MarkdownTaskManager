// Regression tests for problems found in the external code reviews (built task-manager.html,
// mock File System Access API unless stated otherwise).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchBrowser, newPage, createDir, openFolder, waitIdle, readFile, writeFile, setFault,
  syncState, notificationText, board, archive, task,
} from './helpers.mjs';

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
