import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchBrowser, newPage, createDir, openFolder, waitIdle, readFile, setFault, syncState, board, archive, task,
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
  for (const [label, selector, invalid, reverted] of [
    ['estimate with a pipe', '#taskDetailEstimate', '8h | 概算', '8h'],
    ['empty worklog hours', '#taskDetailWorklog input[type="number"]', '', '2'],
  ]) {
    it(`keeps ${label} out of an unrelated queued save and rejects its commit`, async ({ page, dialogs }) => {
      await setup(page);
      await change(page, '#taskDetailEstimate', '8h');
      await page.click('#taskDetailWorklog > button');
      await waitIdle(page);
      await change(page, '#taskDetailWorklog input[type="number"]', '2');
      const committed = await page.evaluate(() => ({ estimate: tasks[0].estimate, worklog: tasks[0].worklog }));
      // Hold the first save at close, then queue a second one. The second save must
      // serialize tasks AFTER oninput, rather than reuse content prepared before typing.
      await page.evaluate(() => {
        window.__mockFS.holdWrite('p', 'kanban.md');
        toggleSubtask('TASK-001', 0);
      });
      await page.waitForFunction(() => window.__mockFS.isWriteHeld('p', 'kanban.md'));
      await page.evaluate(() => toggleSubtask('TASK-001', 0));
      const seq = await page.evaluate(() => session.editSeq);
      await page.fill(selector, invalid);
      assert.equal(await page.evaluate(() => session.editSeq), seq, 'input does not mark the committed board dirty');
      assert.deepEqual(await page.evaluate(() => ({ estimate: tasks[0].estimate, worklog: tasks[0].worklog })), committed);
      assert.equal(await page.evaluate(() => isDetailDraftDirty()), true);
      if (invalid) assert.ok((await page.evaluate(() => unsavedKanbanText())).includes(invalid));
      await page.evaluate(() => window.__mockFS.releaseWrite('p', 'kanban.md'));
      await waitIdle(page);
      const written = await readFile(page, 'p', 'kanban.md');
      assert.doesNotMatch(written, /8h \| 概算|NaNh/);
      assert.match(written, /\*\*Estimate\*\*: 8h\n/);
      assert.match(written, /\| 2h/);
      assert.equal(await page.evaluate(() => isDirty()), false);
      assert.equal(await page.evaluate(() => hasUnsavedWork()), true);
      assert.equal(await syncState(page), 'dirty', 'pending input must not be labelled saved');
      const writes = await page.evaluate(() => window.__mockFS.writeLog.length);
      const alerts = dialogs.seen.length;
      await page.dispatchEvent(selector, 'change');
      await waitIdle(page);
      assert.equal(dialogs.seen.length, alerts + 1);
      assert.equal(await page.inputValue(selector), reverted);
      assert.equal(await page.evaluate(() => hasUnsavedWork()), false);
      assert.equal(await syncState(page), 'saved');
      assert.equal(await page.evaluate(() => window.__mockFS.writeLog.length), writes, 'invalid commit must not persist');
      assert.equal(await readFile(page, 'p', 'kanban.md'), written);
    });
  }

  it('clears unsaved state when estimate or hours are reverted before change', async ({ page }) => {
    await setup(page);
    await change(page, '#taskDetailEstimate', '8h');
    await page.click('#taskDetailWorklog > button');
    await waitIdle(page);
    await change(page, '#taskDetailWorklog input[type="number"]', '2');
    const original = await readFile(page, 'p', 'kanban.md');
    for (const [selector, altered, originalValue] of [
      ['#taskDetailEstimate', '88h', '8h'],
      ['#taskDetailWorklog input[type="number"]', '22', '2'],
      ['#taskDetailWorklog input[type="number"]', '', '2'],
    ]) {
      // Moving focus can fire the previous field's change; settle that before
      // testing an input-only round trip in this field.
      await page.focus(selector);
      await waitIdle(page);
      const seq = await page.evaluate(() => session.editSeq);
      await page.fill(selector, altered);
      assert.equal(await page.evaluate(() => hasUnsavedWork()), true);
      assert.equal(await syncState(page), 'dirty');
      await page.fill(selector, originalValue);
      assert.equal(await page.evaluate(() => hasUnsavedWork()), false);
      assert.equal(await syncState(page), 'saved');
      assert.equal(await page.evaluate(() => session.editSeq), seq);
      assert.equal(await readFile(page, 'p', 'kanban.md'), original);
    }
    assert.match(await page.textContent('#taskDetailWorklogTotal'), /: 2h$/);
  });

  for (const operation of ['archive', 'restore']) {
    it(`isolates worklog after an interrupted ${operation}`, async ({ page }) => {
      await setup(page);
      await page.click('#taskDetailWorklog > button');
      await waitIdle(page);
      await change(page, '#taskDetailWorklog input[type="number"]', '2');
      await page.evaluate(() => closeModal());
      if (operation === 'restore') {
        assert.equal((await page.evaluate(() => archiveTask(tasks[0]))).ok, true);
        await waitIdle(page);
      }
      // The destination write succeeds but deleting the source fails: both copies
      // stay in memory. Exercise the real archive/restore copy paths.
      const sourceFile = operation === 'archive' ? 'kanban.md' : 'archive.md';
      await setFault(page, 'p', sourceFile, { writeFail: true });
      const result = await page.evaluate(op => op === 'archive'
        ? archiveTask(tasks[0]) : unarchiveTaskObject(archivedTasks[0]), operation);
      await waitIdle(page);
      assert.equal(result.partial, true);
      await setFault(page, 'p', sourceFile, {});
      assert.deepEqual(await page.evaluate(() => ({
        active: tasks.length, archived: archivedTasks.length,
        sameArray: tasks[0].worklog === archivedTasks[0].worklog,
        sameRow: tasks[0].worklog[0] === archivedTasks[0].worklog[0],
      })), { active: 1, archived: 1, sameArray: false, sameRow: false });
      const archivedWorklog = await page.evaluate(() => archivedTasks[0].worklog);
      const archivedText = await readFile(page, 'p', 'archive.md');
      // Also simulate legacy shared state to verify copy-on-write independently.
      await page.evaluate(() => {
        tasks[0].worklog = archivedTasks[0].worklog;
        showTaskDetail(tasks[0]);
      });
      await page.fill('#taskDetailWorklog input[type="number"]', '5');
      assert.deepEqual(await page.evaluate(() => archivedTasks[0].worklog), archivedWorklog);
      await page.dispatchEvent('#taskDetailWorklog input[type="number"]', 'change');
      await waitIdle(page);
      assert.equal(await page.evaluate(() => tasks[0].worklog[0].hours), 5);
      assert.equal(await page.evaluate(() => tasks[0].worklog[0] === archivedTasks[0].worklog[0]), false);
      assert.deepEqual(await page.evaluate(() => archivedTasks[0].worklog), archivedWorklog);
      assert.equal(await readFile(page, 'p', 'archive.md'), archivedText);
      assert.match(await readFile(page, 'p', 'kanban.md'), /\| 5h/);
    });
  }

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

  it('offers draft exports without retry after a kanban read failure', async ({ page }) => {
    await setup(page);
    await page.click('#taskDetailWorklog > button');
    await waitIdle(page);
    const original = await readFile(page, 'p', 'kanban.md');
    const memo = 'Rescue this uncommitted memo after a read failure';
    await page.fill('#taskDetailWorklog input[type="text"]', memo);
    assert.equal(await page.evaluate(() => isDirty()), false);
    assert.equal(await page.evaluate(() => isDetailDraftDirty()), true);
    await setFault(page, 'p', 'kanban.md', { readFail: true });
    await page.evaluate(() => checkExternalChanges());
    assert.deepEqual(await page.evaluate(() => session.lastError), { which: 'kanban', kind: 'read-failed' });
    assert.equal(await syncState(page), 'error');
    assert.equal(await page.isVisible('#syncBanner'), true);
    for (const selector of ['#syncDownloadBtn', '#syncCopyBtn', '#syncReloadBtn']) {
      assert.equal(await page.isVisible(selector), true, `${selector} is available`);
    }
    assert.equal(await page.isVisible('#syncRetryBtn'), false, 'a draft alone cannot be retried');
    assert.ok((await page.evaluate(() => unsavedKanbanText())).includes(memo));
    assert.equal(await page.evaluate(() => tasks[0].worklog[0].memo), '');
    assert.equal(await readFile(page, 'p', 'kanban.md'), original);
  });

  for (const saveInFlight of [false, true]) {
    it(`refreshes the form draft indicator on input and cancel${saveInFlight ? ' after a save finishes' : ''}`, async ({ page }) => {
      await setup(page);
      await page.evaluate(() => closeModal());
      let writeHeld = false;
      try {
        if (saveInFlight) {
          await page.evaluate(() => window.__mockFS.holdWrite('p', 'kanban.md'));
          writeHeld = true;
          await page.evaluate(() => toggleSubtask('TASK-001', 0));
          await page.waitForFunction(() => window.__mockFS.isWriteHeld('p', 'kanban.md'));
        }
        // The saving banner can intercept clicks while the write is held.
        await page.evaluate(() => openTaskModal(tasks[0]));
        await page.waitForSelector('#newTaskModal.active');
        if (!saveInFlight) assert.equal(await syncState(page), 'saved');
        await page.fill('#taskTitle', 'Uncommitted form title');
        if (!saveInFlight) assert.equal(await syncState(page), 'dirty');
        if (saveInFlight) {
          await page.evaluate(() => window.__mockFS.releaseWrite('p', 'kanban.md'));
          writeHeld = false;
          await waitIdle(page);
          await page.waitForFunction(() => document.getElementById('syncStatus').dataset.state !== 'saving');
        }
        assert.equal(await page.evaluate(() => isDirty()), false);
        assert.equal(await syncState(page), 'dirty');
        await page.evaluate(() => closeTaskModal());
        assert.equal(await page.isVisible('#newTaskModal'), false);
        assert.equal(await page.evaluate(() => hasUnsavedWork()), false);
        assert.equal(await syncState(page), 'saved');
        assert.equal(await page.evaluate(() => tasks[0].title), 'Time tracking');
        assert.doesNotMatch(await readFile(page, 'p', 'kanban.md'), /Uncommitted form title/);
      } finally {
        if (writeHeld) {
          await page.evaluate(() => window.__mockFS.releaseWrite('p', 'kanban.md'));
          await waitIdle(page);
        }
      }
    });
  }

  it('keeps an uncommitted memo unsaved when committing the estimate', async ({ page }) => {
    await setup(page);
    await page.click('#taskDetailWorklog > button');
    await waitIdle(page);
    const memo = 'Still typing while estimate commits';
    await page.fill('#taskDetailWorklog input[type="text"]', memo);
    // Commit the other field without moving focus or blurring the pending memo.
    await page.evaluate(() => {
      document.getElementById('taskDetailEstimate').value = '8h';
      setEstimate('TASK-001');
    });
    await waitIdle(page);
    assert.equal(await page.evaluate(() => tasks[0].estimate), '8h');
    assert.equal(await page.evaluate(() => tasks[0].worklog[0].memo), '');
    assert.equal(await page.evaluate(() => hasUnsavedWork()), true);
    assert.ok((await page.evaluate(() => unsavedKanbanText())).includes(memo));
    assert.equal(await page.locator('#taskDetailWorklog input[type="text"]').evaluate(el => el === document.activeElement), true);
    assert.doesNotMatch(await readFile(page, 'p', 'kanban.md'), /Still typing while estimate commits/);
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
    // Exercise rejection after oninput has already changed the draft.
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
