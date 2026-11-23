import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchBrowser, newPage, createDir, openFolder, waitIdle, readFile, board, archive, task,
} from './helpers.mjs';

let browser = null;
let skipReason = '';
before(async () => {
  const result = await launchBrowser();
  browser = result.browser;
  skipReason = result.reason || '';
  if (!browser) {
    if (process.env.MTM_REQUIRE_BROWSER) throw new Error(`ブラウザーテストを実行できません: ${skipReason}`);
    console.warn(`[e2e] SKIP（ブラウザーなし）: ${skipReason}`);
  }
});
after(async () => { if (browser) await browser.close(); });

function it(name, fn) {
  test(name, async (t) => {
    if (!browser) { t.skip(skipReason); return; }
    const ctx = await newPage(browser);
    try {
      await fn(ctx);
      assert.deepEqual(ctx.errors, [], 'no uncaught page errors');
    } finally {
      await ctx.context.close();
    }
  });
}

async function setup(page) {
  await createDir(page, 'p', {
    'kanban.md': board(task(1, 'Time tracking', '\n**Subtasks**:\n- [ ] First step\n\n**Notes**:\nKeep these notes'), { lastId: 1 }),
    'archive.md': archive(''),
  });
  await openFolder(page, 'p');
  await page.click('[data-task-id="TASK-001"] .task-title');
}

async function change(page, selector, value) {
  await page.fill(selector, value);
  await page.dispatchEvent(selector, 'change');
  await waitIdle(page);
}

describe('task detail estimate and worklog', () => {
  it('keeps an uncommitted memo in the unsaved board without writing to disk', async ({ page }) => {
    await setup(page);
    await page.click('#taskDetailWorklog > button');
    await waitIdle(page);
    const original = await readFile(page, 'p', 'kanban.md');
    assert.equal(await page.evaluate(() => hasUnsavedWork()), false);
    const memo = 'Still typing without blur';
    await page.fill('#taskDetailWorklog input[type="text"]', memo);
    assert.equal(await page.evaluate(() => hasUnsavedWork()), true);
    assert.ok((await page.evaluate(() => unsavedKanbanText())).includes(memo));
    assert.equal(await readFile(page, 'p', 'kanban.md'), original);
    assert.equal(await page.locator('#taskDetailWorklog input[type="text"]').evaluate(el => el === document.activeElement), true);
  });

  it('keeps a memo after Tab during a conflict', async ({ page }) => {
    await setup(page);
    await page.click('#taskDetailWorklog > button');
    await waitIdle(page);
    const original = await readFile(page, 'p', 'kanban.md');
    await page.evaluate(() => {
      session.conflict = { which: 'kanban', kind: 'conflict' };
      renderSyncBanner();
    });
    const memo = 'Keep this conflicting edit';
    await page.fill('#taskDetailWorklog input[type="text"]', memo);
    await page.press('#taskDetailWorklog input[type="text"]', 'Tab');
    await waitIdle(page);
    assert.equal(await page.inputValue('#taskDetailWorklog input[type="text"]'), memo);
    assert.equal(await page.evaluate(() => hasUnsavedWork()), true);
    assert.ok((await page.evaluate(() => unsavedKanbanText())).includes(memo));
    assert.equal(await readFile(page, 'p', 'kanban.md'), original);
  });

  it('commits the estimate and adds a row with one click', async ({ page }) => {
    await setup(page);
    const original = await readFile(page, 'p', 'kanban.md');
    await page.fill('#taskDetailEstimate', '8h');
    assert.equal(await page.evaluate(() => hasUnsavedWork()), true);
    assert.match(await page.evaluate(() => unsavedKanbanText()), /\*\*Estimate\*\*: 8h/);
    assert.equal(await readFile(page, 'p', 'kanban.md'), original);
    await page.click('#taskDetailWorklog > button');
    await waitIdle(page);
    assert.equal(await page.locator('#taskDetailWorklog li').count(), 1);
    const written = await readFile(page, 'p', 'kanban.md');
    assert.match(written, /\*\*Estimate\*\*: 8h\n/);
    assert.ok(written.includes(`**Worklog**:\n- ${await page.evaluate(() => localDateString())} | 0h`));
  });

  it('keeps focus on the memo when committing hours by clicking it', async ({ page }) => {
    await setup(page);
    await page.click('#taskDetailWorklog > button');
    await waitIdle(page);
    await page.fill('#taskDetailWorklog input[type="number"]', '2.5');
    assert.match(await page.textContent('#taskDetailWorklogTotal'), /: 2\.5h$/);
    await page.click('#taskDetailWorklog input[type="text"]');
    assert.equal(await page.locator('#taskDetailWorklog input[type="text"]').evaluate(el => el === document.activeElement), true);
    await waitIdle(page);
    assert.match(await readFile(page, 'p', 'kanban.md'), /\| 2\.5h/);
  });

  it('adds a row with the local date near midnight in JST', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' });
    await page.clock.setFixedTime(new Date('2026-11-30T15:30:00Z'));
    await setup(page);
    const today = await page.evaluate(() => localDateString());
    assert.equal(today, '2026-12-01');
    assert.notEqual(today, await page.evaluate(() => new Date().toISOString().slice(0, 10)));
    await page.click('#taskDetailWorklog > button');
    await waitIdle(page);
    assert.equal(await page.inputValue('#taskDetailWorklog input[type="date"]'), today);
    assert.ok((await readFile(page, 'p', 'kanban.md')).includes(`- ${today} | 0h`));
  });

  it('adds, edits, totals, saves, reloads and deletes worklog rows without losing estimate or notes', async ({ page }) => {
    await setup(page);
    await change(page, '#taskDetailEstimate', '8h');
    await page.click('#taskDetailWorklog > button');
    await waitIdle(page);
    assert.equal(await page.inputValue('#taskDetailWorklog input[type="date"]'), await page.evaluate(() => localDateString()));
    assert.equal(await page.inputValue('#taskDetailWorklog input[type="number"]'), '0');
    await change(page, '#taskDetailWorklog input[type="date"]', '2026-11-23');
    await change(page, '#taskDetailWorklog input[type="number"]', '7.5');
    const memo = '調査 <review> & "notes"';
    await change(page, '#taskDetailWorklog input[type="text"]', memo);
    assert.match(await page.textContent('#taskDetailWorklogTotal'), /: 7\.5h$/);
    // A second row exercises summation and removal independently of the first row.
    await page.evaluate(() => addWorklog('TASK-001'));
    await waitIdle(page);
    await page.evaluate(() => updateWorklog('TASK-001', 1, 'hours', '0.25'));
    await waitIdle(page);
    assert.match(await page.textContent('#taskDetailWorklogTotal'), /: 7\.75h$/);
    await page.evaluate(() => deleteWorklog('TASK-001', 1));
    await waitIdle(page);
    assert.equal(await page.evaluate(() => autoSave()), true);
    const written = await readFile(page, 'p', 'kanban.md');
    assert.match(written, /\*\*Estimate\*\*: 8h\n/);
    assert.ok(written.includes(`**Worklog**:\n- 2026-11-23 | 7.5h | ${memo}\n`));
    assert.ok(written.indexOf('**Subtasks**:') < written.indexOf('**Worklog**:'));
    assert.ok(written.indexOf('**Worklog**:') < written.indexOf('**Notes**:'));

    // Reopen from the mock-written file, rather than checking only the in-memory task.
    await page.evaluate(() => closeModal());
    await openFolder(page, 'p');
    assert.deepEqual(await page.evaluate(() => ({ estimate: tasks[0].estimate, worklog: tasks[0].worklog })), {
      estimate: '8h', worklog: [{ date: '2026-11-23', hours: 7.5, memo }],
    });
    await page.click('[data-task-id="TASK-001"] .task-title');
    assert.equal(await page.inputValue('#taskDetailEstimate'), '8h');
    assert.equal(await page.inputValue('#taskDetailWorklog input[type="text"]'), memo);
    await page.click('#taskDetailWorklog li button');
    await waitIdle(page);
    assert.match(await page.textContent('#taskDetailWorklogTotal'), /: 0h$/);
    const deleted = await readFile(page, 'p', 'kanban.md');
    assert.doesNotMatch(deleted, /\*\*Worklog\*\*:|2026-11-23 \| 7\.5h/);
    assert.match(deleted, /\*\*Estimate\*\*: 8h/);
    assert.match(deleted, /\*\*Notes\*\*:\nKeep these notes/);
    await page.evaluate(() => closeModal());
    await openFolder(page, 'p');
    assert.deepEqual(await page.evaluate(() => tasks[0].worklog), []);
  });

  it('refuses malformed worklog and estimate edits and restores the inputs', async ({ page, dialogs }) => {
    await setup(page);
    await change(page, '#taskDetailEstimate', '8h');
    await page.evaluate(() => addWorklog('TASK-001'));
    await waitIdle(page);
    const original = await readFile(page, 'p', 'kanban.md');
    const originalWorklog = await page.evaluate(() => tasks[0].worklog);
    for (const [field, value] of [['hours', '-1'], ['hours', 'NaN'], ['hours', ''], ['date', 'bad-date'], ['memo', 'before\nafter']]) {
      const alertCount = dialogs.seen.length;
      await page.evaluate(([field, value]) => updateWorklog('TASK-001', 0, field, value), [field, value]);
      await waitIdle(page);
      assert.equal(dialogs.seen.length, alertCount + 1, `${field}: alert`);
      assert.deepEqual(await page.evaluate(() => tasks[0].worklog), originalWorklog);
      assert.equal(await page.inputValue('#taskDetailWorklog input[type="number"]'), '0');
      assert.equal(await page.inputValue('#taskDetailWorklog input[type="date"]'), originalWorklog[0].date);
      assert.equal(await page.inputValue('#taskDetailWorklog input[type="text"]'), '');
      assert.equal(await readFile(page, 'p', 'kanban.md'), original);
    }
    // Exercise rejection after oninput has already changed the in-memory value.
    let alertCount = dialogs.seen.length;
    await change(page, '#taskDetailWorklog input[type="number"]', '-1');
    assert.equal(dialogs.seen.length, alertCount + 1);
    assert.deepEqual(await page.evaluate(() => tasks[0].worklog), originalWorklog);
    assert.equal(await page.inputValue('#taskDetailWorklog input[type="number"]'), '0');
    assert.match(await page.textContent('#taskDetailWorklogTotal'), /: 0h$/);
    alertCount = dialogs.seen.length;
    await change(page, '#taskDetailEstimate', '8h | **Status**: done');
    assert.equal(dialogs.seen.length, alertCount + 1);
    assert.equal(await page.inputValue('#taskDetailEstimate'), '8h');
    assert.equal(await page.evaluate(() => tasks[0].estimate), '8h');
    assert.equal(await readFile(page, 'p', 'kanban.md'), original);
  });

  it('renders archived values as escaped text and refuses edits to a board task with the same ID', async ({ page }) => {
    const archived = task(1, 'Archived time', '**Estimate**: 8h\n\n**Worklog**:\n- 2026-11-23 | 7.5h | <review> & "notes"', 'done');
    await createDir(page, 'p', {
      'kanban.md': board(task(1, 'Active time'), { lastId: 1 }),
      'archive.md': archive(archived),
    });
    await openFolder(page, 'p');
    const original = await readFile(page, 'p', 'kanban.md');
    await page.click('#archiveBtn');
    await page.click('#archiveModal.active .archive-card');
    assert.equal(await page.locator('#taskDetailEstimate, #taskDetailWorklog input, #taskDetailWorklog button').count(), 0);
    assert.ok((await page.textContent('#modalBody')).includes('8h'));
    assert.ok((await page.textContent('#taskDetailWorklog')).includes('<review> & "notes"'));
    assert.match(await page.textContent('#taskDetailWorklogTotal'), /: 7\.5h$/);
    await page.evaluate(() => {
      addWorklog('TASK-001');
      updateWorklog('TASK-001', 0, 'hours', '10');
      deleteWorklog('TASK-001', 0);
      setEstimate('TASK-001');
      showTaskDetail(currentDetailTask, { rerender: true });
    });
    await waitIdle(page);
    assert.equal(await readFile(page, 'p', 'kanban.md'), original);
    assert.equal(await readFile(page, 'p', 'archive.md'), archive(archived));
    assert.equal(await page.locator('#taskDetailWorklog input, #taskDetailWorklog button').count(), 0);
  });
});
