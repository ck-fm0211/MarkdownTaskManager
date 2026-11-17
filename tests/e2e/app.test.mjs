// Regression tests on the BUILT task-manager.html (mock File System Access API).
// Covers: safe save / external changes / conflicts, write ordering, failures, project switching,
// archive & restore, Japanese UI and data, search, offline.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchBrowser, newPage, createDir, openFolder, waitIdle, readFile, writeFile, setFault,
  syncState, notificationText, board, archive, task,
} from './helpers.mjs';
import { readFileSync } from 'node:fs';

let browser = null;
let skipReason = '';
before(async () => {
  const r = await launchBrowser();
  browser = r.browser;
  skipReason = r.reason || '';
  if (!browser) {
    // `npm run test:e2e` sets MTM_REQUIRE_BROWSER: there a missing browser is a FAILURE, not a skip.
    if (process.env.MTM_REQUIRE_BROWSER) throw new Error(`ブラウザーテストを実行できません: ${skipReason}`);
    console.warn(`[e2e] SKIP（ブラウザーなし。npm test は成功表示になりますが、ブラウザーテストは未実行です）: ${skipReason}`);
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

const T1 = task(1, 'First task', '**Priority**: High | **Category**: Backend\n\n**Subtasks**:\n- [ ] step one\n- [ ] step two');
const T2 = task(2, 'Second task', '**Priority**: Low');
const T3 = task(3, 'Done task', '**Priority**: Medium', 'done');

describe('safe save and external changes', () => {
  it('external edit is never overwritten by a stale page', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(T1 + '\n' + T2, { lastId: 2 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    // An AI edits kanban.md while the page is open.
    const external = board(T1 + '\n' + T2 + '\n' + task(3, 'Added by AI'), { lastId: 3 });
    await writeFile(page, 'p', 'kanban.md', external);
    // The page now changes something and tries to save.
    await page.evaluate(() => { tasks[0].title = 'Edited in browser'; return autoSave(); });
    await waitIdle(page);
    assert.equal(await readFile(page, 'p', 'kanban.md'), external, 'disk keeps the external version');
    assert.equal(await syncState(page), 'conflict');
    assert.equal(await page.isVisible('#syncBanner'), true);
    assert.match(await page.textContent('#syncBannerText'), /changed outside/);
    // Further edits are refused while in conflict.
    assert.equal(await page.evaluate(() => guardWritable()), false);
  });

  it('unsaved edits can be copied and downloaded during a conflict, then reload shows disk', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(T1, { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await writeFile(page, 'p', 'kanban.md', board(T1 + '\n' + task(2, 'From AI'), { lastId: 2 }));
    await page.evaluate(() => { tasks[0].title = 'ブラウザでの編集'; return autoSave(); });
    await waitIdle(page);
    await page.click('#syncCopyBtn');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(clip, /### TASK-001 \| ブラウザでの編集/);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#syncDownloadBtn')]);
    assert.match(download.suggestedFilename(), /^kanban\.unsaved-\d{8}-\d{6}\.md$/);
    const fs = await import('node:fs');
    const text = fs.readFileSync(await download.path(), 'utf8');
    assert.match(text, /ブラウザでの編集/);
    // Reload from disk (confirm discards unsaved edits).
    await page.click('#syncReloadBtn');
    await page.waitForFunction(() => document.getElementById('syncStatus').dataset.state === 'saved');
    await waitIdle(page);
    assert.equal(await page.evaluate(() => tasks.map((x) => x.title).join('|')), 'First task|From AI');
  });

  it('focus check: a clean page silently loads external changes', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(T1, { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await writeFile(page, 'p', 'kanban.md', board(T1 + '\n' + task(2, 'From AI'), { lastId: 2 }));
    await page.evaluate(() => checkExternalChanges());
    await waitIdle(page);
    assert.equal(await page.evaluate(() => tasks.length), 2);
    assert.equal(await syncState(page), 'saved');
  });

  it('focus check with an open editor does not reload — marks conflict instead', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(T1, { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('.task-edit-btn');
    await page.fill('#taskTitle', 'typing…');
    await writeFile(page, 'p', 'kanban.md', board(task(1, 'AI rename'), { lastId: 1 }));
    await page.evaluate(() => checkExternalChanges());
    assert.equal(await page.inputValue('#taskTitle'), 'typing…', 'form content kept');
    assert.equal(await syncState(page), 'conflict');
  });

  it('rapid successive edits are written in order and the last state wins', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(T1, { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await setFault(page, 'p', 'kanban.md', { writeDelay: 30 });
    await page.evaluate(async () => {
      const ps = [];
      for (let i = 0; i < 15; i++) { tasks[0].title = `v${i}`; ps.push(autoSave()); await new Promise((r) => setTimeout(r, 7)); }
      await Promise.all(ps);
    });
    await waitIdle(page);
    const disk = await readFile(page, 'p', 'kanban.md');
    assert.match(disk, /### TASK-001 \| v14\n/);
    const titles = await page.evaluate(() => window.__mockFS.writeLog.filter((w) => w.file === 'kanban.md').map((w) => +(/TASK-001 \| v(\d+)/.exec(w.text) || [0, -1])[1]));
    assert.ok(titles.length >= 1 && titles.length < 15, `writes are coalesced (${titles.length})`);
    for (let i = 1; i < titles.length; i++) assert.ok(titles[i] > titles[i - 1], `monotonic: ${titles}`);
    assert.equal(await syncState(page), 'saved', 'own writes never look like external changes');
  });

  it('drag-drop + subtask toggle + form edit interleaved keep every change', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(T1 + '\n' + T2, { lastId: 2 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await setFault(page, 'p', 'kanban.md', { writeDelay: 40 });
    await page.evaluate(() => {
      moveTask('TASK-002', 'done'); autoSave();
      toggleSubtask('TASK-001', 0);
      tasks[0].notes = 'メモ追加'; autoSave();
    });
    await page.keyboard.press('Escape');
    await waitIdle(page);
    const disk = await readFile(page, 'p', 'kanban.md');
    assert.match(disk, /### TASK-002 \| Second task\n\*\*Status\*\*: done/);
    assert.match(disk, /- \[x\] step one/);
    assert.match(disk, /\*\*Notes\*\*:\nメモ追加/);
  });
});

describe('read / write failures', () => {
  it('unreadable kanban.md: error shown, nothing written, board not shown', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(T1), 'archive.md': archive('') });
    await setFault(page, 'p', 'kanban.md', { readFail: true });
    await page.evaluate(() => { window.__mockFS.nextPick = window.__mockFS.dir('p'); });
    await page.click('#selectFolderBtn');
    await page.waitForFunction(() => /kanban\.md/.test(document.getElementById('notificationText').textContent));
    assert.equal(await page.isVisible('#kanbanView'), false);
    assert.equal(await page.evaluate(() => window.__mockFS.writeLog.length), 0);
    assert.equal(await readFile(page, 'p', 'kanban.md'), board(T1));
  });

  it('write failure: no success message, edit kept, retry saves', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(T1, { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    const before = await readFile(page, 'p', 'kanban.md');
    await setFault(page, 'p', 'kanban.md', { writeFail: true });
    await page.evaluate(() => { tasks[0].title = 'changed'; return persistKanban('SUCCESS-MESSAGE'); });
    await waitIdle(page);
    assert.notEqual(await notificationText(page), 'SUCCESS-MESSAGE');
    assert.equal(await syncState(page), 'error');
    assert.equal(await readFile(page, 'p', 'kanban.md'), before);
    assert.equal(await page.isVisible('#syncRetryBtn'), true);
    await setFault(page, 'p', 'kanban.md', {});
    await page.click('#syncRetryBtn');
    await waitIdle(page);
    assert.equal(await syncState(page), 'saved');
    assert.match(await readFile(page, 'p', 'kanban.md'), /TASK-001 \| changed/);
  });

  it('failure on close (after write) is reported, never treated as success', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(T1, { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await setFault(page, 'p', 'kanban.md', { closeFail: true });
    const ok = await page.evaluate(() => { tasks[0].title = 'x'; return autoSave(); });
    assert.equal(ok, false);
    assert.equal(await syncState(page), 'error');
  });

  it('kanban.md deleted externally: not recreated, reported as missing', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(T1, { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.evaluate(() => window.__mockFS.remove('p', 'kanban.md'));
    await page.evaluate(() => { tasks[0].title = 'x'; return autoSave(); });
    await waitIdle(page);
    assert.equal(await readFile(page, 'p', 'kanban.md'), null);
    assert.equal(await syncState(page), 'conflict');
    assert.match(await page.textContent('#syncBannerText'), /missing/);
  });

  it('unreadable archive.md is not treated as empty (archive refused, file untouched)', async ({ page }) => {
    const arch = archive(task(9, 'Old one', '', 'done'));
    await createDir(page, 'p', { 'kanban.md': board(T1 + '\n' + T3, { lastId: 9 }), 'archive.md': arch });
    await setFault(page, 'p', 'archive.md', { readFail: true });
    await openFolder(page, 'p');
    await setFault(page, 'p', 'archive.md', {});
    const r = await page.evaluate(() => archiveTask(tasks[1]));
    assert.equal(r.ok, false);
    assert.equal(await readFile(page, 'p', 'archive.md'), arch);
    assert.equal(await page.evaluate(() => tasks.length), 2);
  });

  it('a board with lossy content is read-only (never saved over)', async ({ page }) => {
    const lossy = board(task(1, 'x', '\n**Subtasks**:\n- [ ] a\n  補足（保存で消える行）'), { lastId: 1 });
    await createDir(page, 'p', { 'kanban.md': lossy, 'archive.md': archive('') });
    await openFolder(page, 'p');
    assert.equal(await syncState(page), 'blocked');
    assert.match(await page.textContent('#syncBannerDetail'), /補足（保存で消える行）/);
    assert.equal(await page.evaluate(() => guardWritable()), false);
    const ok = await page.evaluate(() => autoSave());
    assert.equal(ok, false);
    assert.equal(await readFile(page, 'p', 'kanban.md'), lossy);
  });

  it('folder without kanban.md: nothing is created unless confirmed', async ({ page, dialogs }) => {
    await createDir(page, 'app', { 'task-manager.html': '<html></html>' });
    dialogs.queue.push(false);
    await page.evaluate(() => { window.__mockFS.nextPick = window.__mockFS.dir('app'); });
    await page.click('#selectFolderBtn');
    await page.waitForFunction(() => window.__mockFS && document.getElementById('welcomeScreen').style.display !== 'none');
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => window.__mockFS.files('app')), ['task-manager.html']);
    assert.match(dialogs.seen.at(-1).message, /kanban\.md/);
    // Confirmed → both files are created.
    await createDir(page, 'new', {});
    await openFolder(page, 'new');
    assert.deepEqual(await page.evaluate(() => window.__mockFS.files('new')), ['archive.md', 'kanban.md']);
  });

  it('unrecognised file is not replaced by an empty board', async ({ page }) => {
    const memo = '# 議事録\n\nこれはタスクボードではありません。\n';
    await createDir(page, 'p', { 'kanban.md': memo });
    await openFolder(page, 'p');
    assert.equal(await syncState(page), 'blocked');
    await page.evaluate(() => autoSave());
    await waitIdle(page);
    assert.equal(await readFile(page, 'p', 'kanban.md'), memo);
  });
});

describe('legacy files', () => {
  it('V1 sample files migrate to V2 with a backup and without losing tasks', async ({ page }) => {
    const fs = await import('node:fs');
    const kb = fs.readFileSync(new URL('../../examples/kanban.md', import.meta.url), 'utf8');
    const ar = fs.readFileSync(new URL('../../examples/archive.md', import.meta.url), 'utf8');
    await createDir(page, 'p', { 'kanban.md': kb, 'archive.md': ar });
    await openFolder(page, 'p');
    assert.equal(await syncState(page), 'saved');
    assert.deepEqual(await page.evaluate(() => window.__mockFS.files('p')), ['archive.md', 'archive.v1-backup.md', 'kanban.md', 'kanban.v1-backup.md']);
    assert.equal(await readFile(page, 'p', 'kanban.v1-backup.md'), kb);
    assert.equal(await readFile(page, 'p', 'archive.v1-backup.md'), ar);
    const v2 = await readFile(page, 'p', 'kanban.md');
    assert.match(v2, /<!-- Format: v2 -->/);
    assert.equal((v2.match(/^### TASK-/gm) || []).length, (kb.match(/^### TASK-/gm) || []).length);
    assert.equal(((await readFile(page, 'p', 'archive.md')).match(/^### TASK-/gm) || []).length, (ar.match(/^### TASK-/gm) || []).length);
  });
});

describe('project switching', () => {
  it('switching to a project without archive.md never writes into the previous archive', async ({ page }) => {
    const archA = archive(task(50, 'A archived', '', 'done'));
    await createDir(page, 'A', { 'kanban.md': board(task(1, 'A task'), { lastId: 50 }), 'archive.md': archA });
    await createDir(page, 'B', { 'kanban.md': board(task(1, 'B task', '', 'done'), { lastId: 1 }) });
    await openFolder(page, 'A');
    await openFolder(page, 'B');
    const r = await page.evaluate(() => archiveTask(tasks[0]));
    assert.equal(r.ok, true);
    assert.equal(await readFile(page, 'A', 'archive.md'), archA, 'A untouched');
    const archB = await readFile(page, 'B', 'archive.md');
    assert.match(archB, /### TASK-001 \| B task/);
    assert.doesNotMatch(archB, /A archived/);
    assert.doesNotMatch(await readFile(page, 'B', 'kanban.md'), /TASK-001/);
  });

  it('a save in flight finishes against the OLD project; the new one is untouched', async ({ page }) => {
    const kb = board(task(1, 'B task'), { lastId: 1 });
    await createDir(page, 'A', { 'kanban.md': board(task(1, 'A task'), { lastId: 1 }), 'archive.md': archive('') });
    await createDir(page, 'B', { 'kanban.md': kb, 'archive.md': archive('') });
    await openFolder(page, 'A');
    await setFault(page, 'A', 'kanban.md', { writeDelay: 300 });
    await page.evaluate(() => { tasks[0].title = 'A edited'; autoSave(); });
    await openFolder(page, 'B');
    assert.match(await readFile(page, 'A', 'kanban.md'), /TASK-001 \| A edited/);
    assert.equal(await readFile(page, 'B', 'kanban.md'), kb);
    assert.equal(await page.evaluate(() => tasks[0].title), 'B task');
  });

  it('unsaved edits: leaving asks first; cancel keeps the project', async ({ page, dialogs }) => {
    await createDir(page, 'A', { 'kanban.md': board(task(1, 'A task'), { lastId: 1 }), 'archive.md': archive('') });
    await createDir(page, 'B', { 'kanban.md': board(task(1, 'B task'), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'A');
    await setFault(page, 'A', 'kanban.md', { writeFail: true });
    await page.evaluate(() => { tasks[0].title = 'unsaved'; return autoSave(); });
    dialogs.queue.push(false); // cancel "leave and discard?"
    await page.evaluate(() => { window.__mockFS.nextPick = window.__mockFS.dir('B'); });
    await page.click('#selectFolderBtn');
    await page.waitForFunction(() => document.getElementById('notificationText') && true);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => session.dir.name), 'A');
    assert.equal(await page.evaluate(() => tasks[0].title), 'unsaved');
    assert.ok(dialogs.seen.some((d) => d.type === 'confirm'));
  });

  it('a slow load of a project switched away from is ignored', async ({ page }) => {
    await createDir(page, 'A', { 'kanban.md': board(task(1, 'A task')) });
    await createDir(page, 'B', { 'kanban.md': board(task(1, 'B task')) });
    await createDir(page, 'C', { 'kanban.md': board(task(1, 'C task')) });
    await openFolder(page, 'A');
    await setFault(page, 'B', 'kanban.md', { readDelay: 400 });
    await page.evaluate(() => { openProject(window.__mockFS.dir('B'), { skipLeaveCheck: true }); });
    await page.waitForTimeout(50);
    await page.evaluate(() => openProject(window.__mockFS.dir('C'), { skipLeaveCheck: true }));
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => session.dir.name), 'C');
    assert.equal(await page.evaluate(() => tasks[0].title), 'C task');
  });

  it('archive operation in progress blocks switching', async ({ page }) => {
    await createDir(page, 'A', { 'kanban.md': board(T3, { lastId: 3 }), 'archive.md': archive('') });
    await createDir(page, 'B', { 'kanban.md': board(task(1, 'B')) });
    await openFolder(page, 'A');
    await setFault(page, 'A', 'archive.md', { writeDelay: 300 });
    const pending = page.evaluate(() => archiveTask(tasks[0]));
    await page.waitForTimeout(50);
    const switched = await page.evaluate(() => openProject(window.__mockFS.dir('B')));
    assert.equal(switched, false);
    assert.equal((await pending).ok, true);
    assert.equal(await page.evaluate(() => session.dir.name), 'A');
  });
});

describe('archive and restore', () => {
  const setup = async (page, extraArchive = '') => {
    await createDir(page, 'p', { 'kanban.md': board(T1 + '\n' + T3, { lastId: 3 }), 'archive.md': archive(extraArchive) });
    await openFolder(page, 'p');
  };

  it('archive then restore: both files consistent', async ({ page }) => {
    await setup(page);
    assert.equal((await page.evaluate(() => archiveTask(tasks.find((x) => x.id === 'TASK-003')))).ok, true);
    assert.doesNotMatch(await readFile(page, 'p', 'kanban.md'), /TASK-003/);
    assert.match(await readFile(page, 'p', 'archive.md'), /### TASK-003 \| Done task\n\*\*Status\*\*: done/);
    assert.equal((await page.evaluate(() => unarchiveTaskObject(archivedTasks[0]))).ok, true);
    assert.match(await readFile(page, 'p', 'kanban.md'), /### TASK-003 \| Done task\n\*\*Status\*\*: done/);
    assert.doesNotMatch(await readFile(page, 'p', 'archive.md'), /TASK-003/);
    assert.equal(await syncState(page), 'saved');
  });

  it('archive.md write fails → task stays on the board, kanban.md untouched', async ({ page }) => {
    await setup(page);
    const kb = await readFile(page, 'p', 'kanban.md');
    const ar = await readFile(page, 'p', 'archive.md');
    await setFault(page, 'p', 'archive.md', { writeFail: true });
    const r = await page.evaluate(() => archiveTask(tasks.find((x) => x.id === 'TASK-003')));
    assert.equal(r.ok, false);
    assert.equal(await readFile(page, 'p', 'kanban.md'), kb);
    assert.equal(await readFile(page, 'p', 'archive.md'), ar);
    assert.equal(await page.evaluate(() => tasks.some((x) => x.id === 'TASK-003')), true);
  });

  it('kanban.md write fails after archiving → partial, then re-run finishes without duplicate', async ({ page }) => {
    await setup(page);
    await setFault(page, 'p', 'kanban.md', { writeFail: true });
    const r = await page.evaluate(() => archiveTask(tasks.find((x) => x.id === 'TASK-003')));
    assert.equal(r.partial, true);
    assert.match(await notificationText(page), /BOTH files/);
    assert.match(await readFile(page, 'p', 'kanban.md'), /TASK-003/, 'still in kanban.md');
    assert.match(await readFile(page, 'p', 'archive.md'), /TASK-003/, 'and in archive.md');
    await setFault(page, 'p', 'kanban.md', {});
    await page.evaluate(() => { session.lastError = null; });
    const r2 = await page.evaluate(() => archiveTask(tasks.find((x) => x.id === 'TASK-003')));
    assert.equal(r2.ok, true);
    assert.equal(r2.skippedDestination, true);
    assert.doesNotMatch(await readFile(page, 'p', 'kanban.md'), /TASK-003/);
    assert.equal((await readFile(page, 'p', 'archive.md')).match(/### TASK-003/g).length, 1);
  });

  it('same id with different content in archive.md → refused, nothing changed', async ({ page }) => {
    await setup(page, task(3, 'A DIFFERENT task', '', 'done'));
    const kb = await readFile(page, 'p', 'kanban.md');
    const ar = await readFile(page, 'p', 'archive.md');
    const r = await page.evaluate(() => archiveTask(tasks.find((x) => x.id === 'TASK-003')));
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'duplicate-different');
    assert.equal(await readFile(page, 'p', 'kanban.md'), kb);
    assert.equal(await readFile(page, 'p', 'archive.md'), ar);
  });

  it('archive refuses when archive.md was changed externally', async ({ page }) => {
    await setup(page);
    const ext = archive(task(77, 'added by AI', '', 'done'));
    await writeFile(page, 'p', 'archive.md', ext);
    const r = await page.evaluate(() => archiveTask(tasks.find((x) => x.id === 'TASK-003')));
    assert.equal(r.ok, false);
    assert.equal(await readFile(page, 'p', 'archive.md'), ext);
    assert.equal(await syncState(page), 'conflict');
  });

  it('restore partial (archive.md fails) then re-run → exactly one copy on the board', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(T1, { lastId: 9 }), 'archive.md': archive(task(9, 'Archived', '**Priority**: Low', 'done')) });
    await openFolder(page, 'p');
    await setFault(page, 'p', 'archive.md', { writeFail: true });
    const r = await page.evaluate(() => unarchiveTaskObject(archivedTasks[0]));
    assert.equal(r.partial, true);
    await setFault(page, 'p', 'archive.md', {});
    await page.evaluate(() => { session.lastError = null; });
    const r2 = await page.evaluate(() => unarchiveTaskObject(archivedTasks[0]));
    assert.equal(r2.ok, true);
    assert.equal((await readFile(page, 'p', 'kanban.md')).match(/### TASK-009/g).length, 1);
    assert.doesNotMatch(await readFile(page, 'p', 'archive.md'), /TASK-009/);
  });

  it('double click on archive: second run is refused while the first is running', async ({ page }) => {
    await setup(page);
    await setFault(page, 'p', 'archive.md', { writeDelay: 200 });
    const [a, b] = await page.evaluate(() => {
      const t3 = tasks.find((x) => x.id === 'TASK-003');
      return Promise.all([archiveTask(t3), archiveTask(t3)]);
    });
    assert.equal(a.ok, true);
    assert.equal(b, null);
    assert.equal((await readFile(page, 'p', 'archive.md')).match(/### TASK-003/g).length, 1);
  });

  it('archive via the UI (detail dialog) keeps the existing manual flow', async ({ page }) => {
    await setup(page);
    await page.click('[data-task-id="TASK-003"] .task-title');
    await page.click('#taskModalActions button:has-text("Archive")');
    await page.waitForFunction(() => !document.getElementById('taskModal').classList.contains('active'));
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'archive.md'), /TASK-003/);
    await page.click('#archiveBtn');
    await page.waitForSelector('.archive-card');
    await page.click('.archive-card [data-archive-action="restore"]');
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'kanban.md'), /TASK-003/);
  });

  it('new task id skips ids already used in kanban.md and archive.md', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(5, 'x'), { lastId: 2 }), 'archive.md': archive(task(12, 'old', '', 'done')) });
    await openFolder(page, 'p');
    await page.click('#newTaskBtn');
    await page.fill('#taskTitle', 'new');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    const kb = await readFile(page, 'p', 'kanban.md');
    assert.match(kb, /### TASK-013 \| new/);
    assert.match(kb, /Last Task ID: 13/);
  });
});

describe('search, priority, offline', () => {
  it('task id search on the board and in the archive', async ({ page }) => {
    await createDir(page, 'p', {
      'kanban.md': board(task(42, 'Answer', '**Priority**: High') + '\n' + task(4, 'Other'), { lastId: 42 }),
      'archive.md': archive(task(7, 'Archived seven', '', 'done') + '\n' + task(70, 'Seventy', '', 'done')),
    });
    await openFolder(page, 'p');
    for (const q of ['TASK-042', 'task-042', 'ＴＡＳＫ－０４２']) {
      await page.fill('#globalSearchInput', q);
      assert.deepEqual(await page.$$eval('.task-card', (els) => els.map((e) => e.dataset.taskId)), ['TASK-042'], q);
    }
    await page.fill('#globalSearchInput', 'answer');
    assert.deepEqual(await page.$$eval('.task-card', (els) => els.map((e) => e.dataset.taskId)), ['TASK-042']);
    await page.fill('#globalSearchInput', '');
    await page.click('#archiveBtn');
    await page.fill('#archiveSearch', 'task-007');
    assert.equal(await page.$$eval('.archive-card', (els) => els.length), 1);
    assert.match(await page.textContent('.archive-card'), /Archived seven/);
    await page.fill('#archiveSearch', 'seventy');
    assert.match(await page.textContent('.archive-card'), /Seventy/);
  });

  it('priority without category is displayed and survives an edit through the form', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'no category', '**Priority**: Critical'), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    assert.match(await page.textContent('[data-task-id="TASK-001"] .badge-priority'), /Critical/);
    await page.click('.task-edit-btn');
    assert.equal(await page.inputValue('#taskPriority'), 'Critical');
    await page.fill('#taskTitle', 'edited');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'kanban.md'), /### TASK-001 \| edited\n\*\*Status\*\*: todo\n\*\*Priority\*\*: Critical\n/);
  });

  it('unknown priority value written by an AI is kept when editing', async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, 'x', '**Priority**: 至急'), { lastId: 1 }), 'archive.md': archive('') });
    await openFolder(page, 'p');
    await page.click('.task-edit-btn');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'kanban.md'), /\*\*Priority\*\*: 至急/);
  });

  it('works with no network: no external request is made', async ({ page, requests, context }) => {
    // The page itself comes from file:// — or from the local test server where file:// is not
    // allowed (MTM_TEST_HTTP=1). In that case the app HTML is answered locally (route) and every
    // other request is recorded and blocked, so the test checks the APP, not the test server.
    const appUrl = page.url();
    const blocked = [];
    if (appUrl.startsWith('http')) {
      const html = readFileSync(new URL('../../task-manager.html', import.meta.url));
      await context.route('**/*', (route) => {
        const u = route.request().url();
        if (u === appUrl) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
        blocked.push(u);
        return route.abort('internetdisconnected');
      });
    } else {
      await context.setOffline(true);
    }
    await createDir(page, 'p', { 'kanban.md': board(T1, { lastId: 1 }) });
    await page.reload();
    await page.evaluate(() => {
      window.__mockFS.createDir('q', { 'kanban.md': '' });
      window.loadRecentProjects = async () => [];
      window.saveDirectoryHandle = async () => {};
    });
    await openFolder(page, 'q');
    await page.click('#newTaskBtn');
    await page.fill('#taskTitle', 'offline');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    assert.deepEqual(requests, []);
    assert.deepEqual(blocked, []);
    assert.match(await readFile(page, 'q', 'kanban.md'), /offline/);
  });
});
