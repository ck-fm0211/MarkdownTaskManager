// Japanese UI / Japanese data on the BUILT task-manager.html (mock File System Access API).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchBrowser, newPage, createDir, openFolder, waitIdle, readFile,
  board, archive, task,
} from './helpers.mjs';

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
const withOpts = (opts, fn) => Object.assign(fn, { opts });

describe('Japanese', () => {
  it('Japanese UI by browser language, Japanese task saved and reloaded', withOpts({ locale: 'ja-JP' }, async ({ page }) => {
    await createDir(page, 'p', {
      'kanban.md': board('', { columns: '📝 未着手 (todo) | 🚀 作業中 (doing) | ✅ 完了 (done)' }),
      'archive.md': archive(''),
    });
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'ja');
    assert.equal(await page.textContent('#selectFolderBtn'), '📁 フォルダー');
    await openFolder(page, 'p');
    await page.click('#newTaskBtn');
    assert.equal(await page.textContent('#newTaskModal h2'), '新しいタスク');
    await page.fill('#taskTitle', '請求書の確認 📄');
    await page.selectOption('#taskStatus', 'doing');
    await page.selectOption('#taskPriority', 'High');
    await page.fill('#taskCategory', '経理');
    await page.fill('#taskAssignee', '@山田, @suzuki');
    await page.fill('#taskTags', '#経理 締め処理');
    await page.fill('#taskDescription', '1行目\n\n**太字** と `code`\n  - 字下げ');
    await page.fill('#formSubtaskInput', '上長に確認');
    await page.click('#formSubtaskInput + button');
    await page.fill('#taskNotes', '**結果**:\n- 済み ✅');
    await page.click('#taskFormSubmitBtn');
    await waitIdle(page);
    const disk = await readFile(page, 'p', 'kanban.md');
    assert.match(disk, /### TASK-001 \| 請求書の確認 📄\n\*\*Status\*\*: doing\n\*\*Priority\*\*: High \| \*\*Category\*\*: 経理 \| \*\*Assigned\*\*: @山田, @suzuki/);
    assert.match(disk, /\*\*Tags\*\*: #経理 #締め処理/);
    assert.match(disk, /- \[ \] 上長に確認/);
    assert.match(disk, /1行目\n\n\*\*太字\*\* と `code`\n {2}- 字下げ/);
    await page.evaluate(() => reloadFromDisk({ force: true }));
    await waitIdle(page);
    const t1 = await page.evaluate(() => JSON.parse(JSON.stringify(tasks[0])));
    assert.equal(t1.title, '請求書の確認 📄');
    assert.deepEqual(t1.tags, ['#経理', '#締め処理']);
    assert.deepEqual(t1.assignees, ['@山田', '@suzuki']);
    assert.equal(t1.subtasks[0].text, '上長に確認');
    assert.equal(t1.notes, '**結果**:\n- 済み ✅');
    assert.match(await page.textContent('[data-task-id="TASK-001"]'), /高/, 'priority shown in Japanese');
    assert.equal(await readFile(page, 'p', 'kanban.md'), disk, 'reload did not rewrite the file');
  }));

  it('switching language never rewrites tasks or column names', async ({ page }) => {
    const kb = board(task(1, '日本語タスク', '**Priority**: Low\n**Tags**: #タグ') + '\n' + task(3, 'Done task', '**Priority**: Medium', 'done'), { columns: '📝 未着手 (todo) | ✅ 完了 (done)', lastId: 3 });
    const ar = archive(task(2, 'アーカイブ済み', '', 'done'));
    await createDir(page, 'p', { 'kanban.md': kb, 'archive.md': ar });
    await openFolder(page, 'p');
    for (const lang of ['ja', 'fr', 'de', 'zh_cn', 'en', 'ja']) {
      await page.selectOption('#languageSelector', lang);
    }
    await page.click('#archiveBtn');
    await page.waitForSelector('.archive-card');
    await waitIdle(page);
    assert.equal(await readFile(page, 'p', 'kanban.md'), kb);
    assert.equal(await readFile(page, 'p', 'archive.md'), ar);
    const cols = await page.$$eval('.column-title', (els) => els.map((e) => e.textContent.trim()));
    assert.deepEqual(cols, ['📝 未着手', '✅ 完了']);
    assert.equal(await page.textContent('#archiveModalTitle'), '📦 アーカイブ');
  });

  it('archiving with Japanese column names and restoring keeps the column', withOpts({ language: 'ja' }, async ({ page }) => {
    await createDir(page, 'p', { 'kanban.md': board(task(1, '完了タスク', '', 'kanryo'), { columns: '📝 未着手 (mityakusyu) | ✅ 完了 (kanryo)', lastId: 1 }) });
    await openFolder(page, 'p');
    assert.equal((await page.evaluate(() => archiveTask(tasks[0]))).ok, true);
    const ar = await readFile(page, 'p', 'archive.md');
    assert.match(ar, /^# タスクアーカイブ/, 'a NEW archive gets a Japanese title');
    assert.match(ar, /\*\*Status\*\*: kanryo/);
    assert.equal((await page.evaluate(() => unarchiveTaskObject(archivedTasks[0]))).ok, true);
    assert.match(await readFile(page, 'p', 'kanban.md'), /### TASK-001 \| 完了タスク\n\*\*Status\*\*: kanryo/);
    assert.match(await readFile(page, 'p', 'archive.md'), /^# タスクアーカイブ/, 'archive header preserved');
  }));
});

