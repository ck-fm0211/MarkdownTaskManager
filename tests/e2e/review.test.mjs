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

  it('legacy migration: "saving" until both backups and rewrites are done (stable)', async ({ page }) => {
    const v1 = '# Board\n\n## ⚙️ Configuration\n\n**Columns**: 📝 To Do | ✅ Done\n\n## 📝 To Do\n\n### TASK-001 | a\n**Priority**: Low\n';
    const v1a = '# Archive\n\n## ✅ Archives\n\n### TASK-009 | old\n**Priority**: Low\n';
    for (let i = 0; i < 3; i++) {
      await createDir(page, `p${i}`, { 'kanban.md': v1, 'archive.md': v1a });
      await openFolder(page, `p${i}`);
      assert.equal(await syncState(page), 'saved');
      assert.deepEqual(await page.evaluate((d) => window.__mockFS.files(d), `p${i}`), ['archive.md', 'archive.v1-backup.md', 'kanban.md', 'kanban.v1-backup.md']);
    }
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

describe('recent projects (real IndexedDB)', () => {
  it('the list is updated on every save, rename and second project (review A-4)', async ({ page }) => {
    const list = await page.evaluate(async () => {
      // Real functions, real IndexedDB. Cloneable stand-ins for directory handles; the folder
      // comparison is made slow like the real isSameEntry(), which used to run inside the
      // IndexedDB transaction and make it inactive (TransactionInactiveError).
      window.loadRecentProjects = window.__realStorage.loadRecentProjects;
      class FakeHandle { constructor(n) { this.name = n; this.kind = 'directory'; } }
      const realFind = findProjectIndex;
      window.findProjectIndex = async (...a) => { await new Promise((r) => setTimeout(r, 10)); return realFind(...a); };
      const save = window.__realStorage.saveDirectoryHandle;
      const results = [await save(new FakeHandle('A'), 'A'), await save(new FakeHandle('B'), 'B'), await save(new FakeHandle('A'), 'A renamed')];
      return { results, names: (await loadRecentProjects()).map((p) => p.customName) };
    });
    assert.deepEqual(list.results, [true, true, true]);
    assert.deepEqual(list.names, ['A renamed', 'B']);
  });
});
