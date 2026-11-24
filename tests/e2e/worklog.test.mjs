import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile as readDownloadedFile } from 'node:fs/promises';
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
  for (const [field, selector, typed, committed, savedLine] of [
    ['estimate', '#taskDetailEstimate', '8h ', '8h', '**Estimate**: 8h\n'],
    ['memo', '#taskDetailWorklog input[type="text"]', 'review ', 'review', '| 0h | review\n'],
  ]) {
    it(`trims ${field} only on Tab commit and saves a clean round trip`, async ({ page, dialogs }) => {
      await setup(page);
      if (field === 'memo') {
        await page.click('#taskDetailWorklog > button');
        await waitIdle(page);
      }
      assert.equal(await syncState(page), 'saved');
      const original = await readFile(page, 'p', 'kanban.md');
      const seen = dialogs.seen.length;
      await page.fill(selector, typed);
      assert.equal(await page.inputValue(selector), typed);
      assert.equal(await page.evaluate(f => f === 'estimate' ? detailDraft.estimate : detailDraft.worklog[0].memo, field), typed);
      assert.equal(await page.evaluate(f => f === 'estimate' ? tasks[0].estimate : tasks[0].worklog[0].memo, field), '');
      assert.equal(await readFile(page, 'p', 'kanban.md'), original);

      await page.press(selector, 'Tab');
      await waitIdle(page);
      assert.deepEqual(dialogs.seen.slice(seen), [], 'normal commit must not alert');
      assert.equal(await page.evaluate(f => f === 'estimate' ? tasks[0].estimate : tasks[0].worklog[0].memo, field), committed);
      assert.equal(await page.inputValue(selector), committed);
      assert.equal(await page.locator(selector).evaluate(el => el.defaultValue), committed);
      assert.equal(await page.evaluate(f => f === 'estimate' ? detailDraft.estimate : detailDraft.worklog[0].memo, field), committed);
      assert.equal(await page.evaluate(() => hasUnsavedWork()), false);
      assert.equal(await syncState(page), 'saved');
      const saved = await readFile(page, 'p', 'kanban.md');
      assert.ok(saved.includes(savedLine));
      const roundTrip = await page.evaluate(text => {
        const parsed = parseKanbanContent(text);
        const serialized = generateKanbanContent(parsed.config, parsed.tasks);
        const again = parseKanbanContent(serialized);
        return {
          problems: parsed.problems, againProblems: again.problems,
          writeProblems: taskWriteProblems(parsed.tasks[0], parsed.config.columns),
          serialized, stable: generateKanbanContent(again.config, again.tasks),
          tasks: parsed.tasks, againTasks: again.tasks,
        };
      }, saved);
      assert.deepEqual(roundTrip.problems, []);
      assert.deepEqual(roundTrip.againProblems, []);
      assert.deepEqual(roundTrip.writeProblems, []);
      assert.deepEqual(roundTrip.againTasks, roundTrip.tasks);
      assert.equal(roundTrip.serialized, saved);
      assert.equal(roundTrip.stable, saved);

      await page.evaluate(() => closeModal());
      await openFolder(page, 'p');
      await page.click('[data-task-id="TASK-001"] .task-title');
      assert.equal(await page.inputValue(selector), committed);
      assert.equal(await page.evaluate(f => f === 'estimate' ? tasks[0].estimate : tasks[0].worklog[0].memo, field), committed);
      assert.deepEqual(dialogs.seen.slice(seen), []);
    });
  }

  it('still refuses an estimate that cannot round-trip after trimming on a clean board', async ({ page, dialogs }) => {
    await setup(page);
    await change(page, '#taskDetailEstimate', '4h');
    assert.equal(await syncState(page), 'saved');
    const original = await readFile(page, 'p', 'kanban.md');
    const writes = await page.evaluate(() => window.__mockFS.writeLog.length);
    const seen = dialogs.seen.length;
    await page.fill('#taskDetailEstimate', '8h | x ');
    await page.press('#taskDetailEstimate', 'Tab');
    await waitIdle(page);
    assert.deepEqual(dialogs.seen.slice(seen).map(dialog => dialog.type), ['alert']);
    assert.equal(await page.inputValue('#taskDetailEstimate'), '4h');
    assert.equal(await page.evaluate(() => tasks[0].estimate), '4h');
    assert.equal(await page.evaluate(() => detailDraft.estimate), '4h');
    assert.equal(await page.evaluate(() => hasUnsavedWork()), false);
    assert.equal(await syncState(page), 'saved');
    assert.equal(await page.evaluate(() => window.__mockFS.writeLog.length), writes);
    assert.equal(await readFile(page, 'p', 'kanban.md'), original);
  });

  it('commits the focused estimate before retrying a recovered read failure', async ({ page }) => {
    await setup(page);
    await change(page, '#taskDetailEstimate', '8h');
    try {
      await setFault(page, 'p', 'kanban.md', { readFail: true });
      await page.evaluate(() => toggleSubtask('TASK-001', 0));
      await waitIdle(page);
      assert.equal(await page.isVisible('#syncRetryBtn'), true);
      assert.match(await readFile(page, 'p', 'kanban.md'), /\*\*Estimate\*\*: 8h\n/);
      await setFault(page, 'p', 'kanban.md', { readDelay: 100 });
      await page.fill('#taskDetailEstimate', '15h');
      assert.equal(await page.locator('#taskDetailEstimate').evaluate(el => el === document.activeElement), true);
      await page.click('#syncRetryBtn');
      await waitIdle(page);
      assert.match(await readFile(page, 'p', 'kanban.md'), /\*\*Estimate\*\*: 15h\n/);
      assert.equal(await page.evaluate(() => hasUnsavedWork()), false);
      assert.equal(await syncState(page), 'saved');
    } finally {
      await waitIdle(page);
      await setFault(page, 'p', 'kanban.md', {});
    }
  });

  it('confirms reload before discarding a focused estimate and preserves it on cancel', async ({ page, dialogs }) => {
    await setup(page);
    const original = await readFile(page, 'p', 'kanban.md');
    const writes = await page.evaluate(() => window.__mockFS.writeLog.length);
    try {
      await setFault(page, 'p', 'kanban.md', { readFail: true });
      await page.evaluate(() => checkExternalChanges());
      await page.waitForSelector('#syncReloadBtn:visible');
      // The disk recovers before clicking, so an accidental blur could save the edit.
      await setFault(page, 'p', 'kanban.md', {});
      await page.fill('#taskDetailEstimate', '15h');
      const confirmation = await page.evaluate(() => t('confirm.reloadDiscard'));
      const seen = dialogs.seen.length;
      dialogs.queue.push(false);
      await page.click('#syncReloadBtn');
      await waitIdle(page);
      assert.deepEqual(dialogs.seen.slice(seen), [{ type: 'confirm', message: confirmation }]);
      assert.equal(await page.inputValue('#taskDetailEstimate'), '15h');
      assert.equal(await page.locator('#taskDetailEstimate').evaluate(el => el === document.activeElement), true);
      assert.equal(await page.evaluate(() => isDetailDraftDirty()), true);
      assert.equal(await readFile(page, 'p', 'kanban.md'), original);

      dialogs.queue.push(true);
      await page.click('#syncReloadBtn');
      await page.waitForFunction(() => session && tasks.length === 1 && !hasUnsavedWork() && !document.getElementById('taskModal').classList.contains('active'));
      await waitIdle(page);
      assert.deepEqual(dialogs.seen.slice(seen), [
        { type: 'confirm', message: confirmation },
        { type: 'confirm', message: confirmation },
      ]);
      assert.equal(await readFile(page, 'p', 'kanban.md'), original);
      assert.equal(await page.evaluate(() => window.__mockFS.writeLog.length), writes);
      assert.equal(await page.evaluate(() => tasks[0].estimate), '');
    } finally {
      await setFault(page, 'p', 'kanban.md', {});
      await waitIdle(page);
    }
  });

  for (const action of ['Copy', 'Download']) {
    for (const [committedEstimate, draftEstimate, memo, expectedEstimate] of [
      ['', '8h | 再見積もり', '', ''],
      ['4h', '8h | 再見積もり', '', '4h'],
      ['4h', '8h ', '', '8h'],
      ['', '8h', 'Unsaved worklog memo', '8h'],
    ]) {
      it(`rescues estimate ${JSON.stringify(draftEstimate)} over ${JSON.stringify(committedEstimate)} on ${action}`, async ({ page }) => {
        await setup(page);
        if (committedEstimate) await change(page, '#taskDetailEstimate', committedEstimate);
        await page.evaluate(() => addWorklog('TASK-001'));
        await waitIdle(page);
        const original = await readFile(page, 'p', 'kanban.md');
        const committed = await page.evaluate(() => ({ estimate: tasks[0].estimate, worklog: tasks[0].worklog }));
        try {
          await setFault(page, 'p', 'kanban.md', { readFail: true });
          await page.evaluate(() => checkExternalChanges());
          await page.fill('#taskDetailEstimate', draftEstimate);
          // Input events keep both fields in the draft without triggering blur/commit.
          if (memo) await page.locator('#taskDetailWorklog input[type="text"]').evaluate((el, value) => {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }, memo);
          await page.waitForSelector(`#sync${action}Btn:visible`);
          assert.equal(await syncState(page), 'error');
          const draft = await page.evaluate(() => ({ estimate: detailDraft.estimate, worklog: detailDraft.worklog }));
          let exported;
          if (action === 'Download') {
            const [download] = await Promise.all([
              page.waitForEvent('download', { timeout: 5000 }),
              page.click('#syncDownloadBtn'),
            ]);
            exported = await readDownloadedFile(await download.path(), 'utf8');
          } else {
            await page.evaluate(() => navigator.clipboard.writeText(''));
            await page.click('#syncCopyBtn');
            await page.waitForFunction(async () => (await navigator.clipboard.readText()).includes('## Tasks'));
            exported = await page.evaluate(() => navigator.clipboard.readText());
          }
          assert.doesNotMatch(exported, /\*\*Estimate\*\*: 8h \| 再見積もり/);
          const roundTrip = await page.evaluate(text => {
            const parsed = parseKanbanContent(text);
            const serialized = generateKanbanContent(parsed.config, parsed.tasks);
            const again = parseKanbanContent(serialized);
            return {
              problems: parsed.problems, againProblems: again.problems,
              serialized, stable: generateKanbanContent(again.config, again.tasks),
              estimate: parsed.tasks[0].estimate,
            };
          }, exported);
          assert.deepEqual(roundTrip.problems, []);
          assert.deepEqual(roundTrip.againProblems, []);
          assert.equal(roundTrip.serialized, exported);
          assert.equal(roundTrip.stable, exported);
          assert.equal(roundTrip.estimate, expectedEstimate);
          if (draftEstimate === '8h ') assert.match(exported, /\*\*Estimate\*\*: 8h\n/);
          if (memo) {
            assert.match(exported, /\*\*Estimate\*\*: 8h\n/);
            assert.ok(exported.includes(memo));
          }
          assert.equal(await page.inputValue('#taskDetailEstimate'), draftEstimate);
          assert.deepEqual(await page.evaluate(() => ({ estimate: detailDraft.estimate, worklog: detailDraft.worklog })), draft);
          assert.deepEqual(await page.evaluate(() => ({ estimate: tasks[0].estimate, worklog: tasks[0].worklog })), committed);
          assert.equal(await page.evaluate(() => isDetailDraftDirty()), true);
          assert.equal(await page.evaluate(() => isDirty()), false);
          assert.equal(await readFile(page, 'p', 'kanban.md'), original);
        } finally {
          await setFault(page, 'p', 'kanban.md', {});
          await waitIdle(page);
        }
      });
    }

    for (const scenario of ['warning date', 'Unicode separators and NUL', 'trailing memo space']) {
      const warningDate = scenario === 'warning date';
      it(`rescues ${scenario} on ${action}`, async ({ page }) => {
        const date = warningDate ? '2026-13-01' : '2026-11-23';
        const committed = [{ date, hours: 3, memo: 'committed memo' }];
        await createDir(page, 'p', {
          'kanban.md': board(task(1, 'Time tracking', `**Worklog**:\n- ${date} | 3h | committed memo`), { lastId: 1 }),
          'archive.md': archive(''),
        });
        await openFolder(page, 'p');
        await page.click('[data-task-id="TASK-001"] .task-title');
        const original = await readFile(page, 'p', 'kanban.md');
        const committedTask = await page.evaluate(() => tasks[0]);
        const memo = scenario === 'trailing memo space' ? 'review ' : 'before' + String.fromCharCode(0x2028) + 'middle'
          + String.fromCharCode(0x2029, 0x0085) + 'after' + String.fromCharCode(0x0000) + 'end';
        try {
          await setFault(page, 'p', 'kanban.md', { readFail: true });
          await page.evaluate(() => checkExternalChanges());
          if (warningDate) await page.fill('#taskDetailEstimate', '8h');
          else await page.fill('#taskDetailWorklog input[type="text"]', memo);
          await page.waitForSelector(`#sync${action}Btn:visible`);
          assert.equal(await syncState(page), 'error');
          const draft = await page.evaluate(() => ({ estimate: detailDraft.estimate, worklog: detailDraft.worklog }));
          let exported;
          if (action === 'Download') {
            const [download] = await Promise.all([
              page.waitForEvent('download', { timeout: 5000 }),
              page.click('#syncDownloadBtn'),
            ]);
            exported = await readDownloadedFile(await download.path(), 'utf8');
          } else {
            await page.evaluate(() => navigator.clipboard.writeText(''));
            await page.click('#syncCopyBtn');
            await page.waitForFunction(async () => (await navigator.clipboard.readText()).includes('**Worklog**:'));
            exported = await page.evaluate(() => navigator.clipboard.readText());
          }
          const roundTrip = await page.evaluate(text => {
            const parsed = parseKanbanContent(text);
            const serialized = generateKanbanContent(parsed.config, parsed.tasks);
            const again = parseKanbanContent(serialized);
            return {
              problems: parsed.problems, againProblems: again.problems,
              serialized, stable: generateKanbanContent(again.config, again.tasks),
              task: parsed.tasks[0], estimate: parsed.tasks[0].estimate, worklog: parsed.tasks[0].worklog,
            };
          }, exported);
          assert.deepEqual(roundTrip.problems, []);
          assert.deepEqual(roundTrip.againProblems, []);
          assert.equal(roundTrip.serialized, exported);
          assert.equal(roundTrip.stable, exported);
          const expectedWorklog = warningDate ? committed : [{ date, hours: 3, memo: scenario === 'trailing memo space' ? 'review' : 'before middle  afterend' }];
          assert.deepEqual(roundTrip.worklog, expectedWorklog);
          assert.deepEqual(roundTrip.task, { ...committedTask, estimate: warningDate ? '8h' : committedTask.estimate, worklog: expectedWorklog });
          if (scenario === 'trailing memo space') assert.match(exported, /- 2026-11-23 \| 3h \| review\n/);
          if (warningDate) assert.equal(roundTrip.estimate, '8h');
          else assert.doesNotMatch(exported, /[\u0085\u2028\u2029\u0000]/);
          assert.deepEqual(await page.evaluate(() => ({ estimate: detailDraft.estimate, worklog: detailDraft.worklog })), draft);
          assert.deepEqual(await page.evaluate(() => tasks[0].worklog), committed);
          assert.equal(await page.evaluate(() => isDetailDraftDirty()), true);
          assert.equal(await page.evaluate(() => isDirty()), false);
          assert.equal(await readFile(page, 'p', 'kanban.md'), original);
        } finally {
          await setFault(page, 'p', 'kanban.md', {});
          await waitIdle(page);
        }
      });
    }

    for (const [label, type, invalid] of [
      ['empty hours', 'number', ''],
      ['negative hours', 'number', '-5'],
    ]) {
      it(`restores committed ${label} while rescuing every worklog row and memo on ${action}`, async ({ page }) => {
        await setup(page);
        // Keep the valid row and rescue the invalid row with its last committed hours.
        await page.evaluate(() => addWorklog('TASK-001'));
        await waitIdle(page);
        await change(page, '#taskDetailWorklog input[type="date"]', '2026-11-23');
        await change(page, '#taskDetailWorklog input[type="number"]', '2');
        await change(page, '#taskDetailWorklog input[type="text"]', 'valid rescue row');
        await page.evaluate(() => addWorklog('TASK-001'));
        await waitIdle(page);
        const row = '#taskDetailWorklog li:nth-child(2)';
        await change(page, `${row} input[type="number"]`, '3');
        await change(page, `${row} input[type="text"]`, 'invalid rescue row');
        const original = await readFile(page, 'p', 'kanban.md');
        const committed = await page.evaluate(() => tasks[0].worklog);
        const selector = `${row} input[type="${type}"]`;
        try {
          await setFault(page, 'p', 'kanban.md', { readFail: true });
          await page.evaluate(() => checkExternalChanges());
          await page.fill(selector, invalid);
          await page.locator(`${row} input[type="text"]`).evaluate(el => {
            el.value = 'draft memo worth rescuing';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          assert.equal(await syncState(page), 'error');
          await page.waitForSelector(`#sync${action}Btn:visible`);
          const draft = await page.evaluate(() => detailDraft.worklog);
          let exported;
          if (action === 'Download') {
            const [download] = await Promise.all([
              page.waitForEvent('download', { timeout: 5000 }),
              page.click('#syncDownloadBtn'),
            ]);
            exported = await readDownloadedFile(await download.path(), 'utf8');
          } else {
            await page.evaluate(() => navigator.clipboard.writeText(''));
            await page.click('#syncCopyBtn');
            await page.waitForFunction(async () => (await navigator.clipboard.readText()).includes('**Worklog**:'));
            exported = await page.evaluate(() => navigator.clipboard.readText());
          }
          assert.match(exported, /- 2026-11-23 \| 2h \| valid rescue row\n/);
          assert.match(exported, /\| 3h \| draft memo worth rescuing\n/);
          assert.doesNotMatch(exported, /\| (?:0|-5|NaN)h/);
          const roundTrip = await page.evaluate(text => {
            const parsed = parseKanbanContent(text);
            const serialized = generateKanbanContent(parsed.config, parsed.tasks);
            const again = parseKanbanContent(serialized);
            return {
              problems: parsed.problems, againProblems: again.problems, tasks: parsed.tasks, againTasks: again.tasks,
              serialized, stable: generateKanbanContent(again.config, again.tasks),
            };
          }, exported);
          assert.deepEqual(roundTrip.problems, []);
          assert.deepEqual(roundTrip.againProblems, []);
          assert.deepEqual(roundTrip.againTasks, roundTrip.tasks);
          assert.equal(roundTrip.serialized, exported);
          assert.equal(roundTrip.stable, exported);
          assert.deepEqual(roundTrip.tasks[0].worklog, [committed[0], { ...committed[1], memo: 'draft memo worth rescuing' }]);
          assert.equal(await page.inputValue(selector), invalid);
          assert.equal(await page.locator(selector).evaluate(el => el === document.activeElement), true);
          assert.deepEqual(await page.evaluate(() => detailDraft.worklog), draft);
          assert.deepEqual(await page.evaluate(() => tasks[0].worklog), committed);
          assert.equal(await page.evaluate(() => isDetailDraftDirty()), true);
          assert.equal(await page.evaluate(() => isDirty()), false);
          assert.equal(await readFile(page, 'p', 'kanban.md'), original);
        } finally {
          await setFault(page, 'p', 'kanban.md', {});
          await waitIdle(page);
        }
      });
    }
  }

  for (const [field, selector, invalid, reverted] of [
    ['estimate', '#taskDetailEstimate', '8h | 概算', '8h'],
    ['hours', '#taskDetailWorklog input[type="number"]', '', '2'],
  ]) {
    it(`clears stale rescue controls after refusing invalid ${field} on Tab`, async ({ page, dialogs }) => {
      await setup(page);
      await change(page, '#taskDetailEstimate', '8h');
      await page.click('#taskDetailWorklog > button');
      await waitIdle(page);
      await change(page, '#taskDetailWorklog input[type="number"]', '2');
      const original = await readFile(page, 'p', 'kanban.md');
      try {
        await setFault(page, 'p', 'kanban.md', { readFail: true });
        await page.evaluate(() => checkExternalChanges());
        const alerts = dialogs.seen.length;
        await page.fill(selector, invalid);
        assert.equal(await page.evaluate(() => hasUnsavedWork()), true);
        assert.equal(await page.isVisible('#syncCopyBtn'), true);
        assert.equal(await page.isVisible('#syncDownloadBtn'), true);
        assert.ok((await page.textContent('#syncBannerDetail')).includes(await page.evaluate(() => t('sync.errorUnsavedHelp'))));
        await page.press(selector, 'Tab');
        await waitIdle(page);
        assert.equal(dialogs.seen.length, alerts + 1);
        assert.equal(await page.inputValue(selector), reverted);
        for (const closeDetail of [false, true]) {
          if (closeDetail) await page.evaluate(() => closeModal());
          assert.equal(await page.evaluate(() => hasUnsavedWork()), false);
          assert.equal(await page.isVisible('#syncCopyBtn'), false);
          assert.equal(await page.isVisible('#syncDownloadBtn'), false);
          assert.equal(await page.textContent('#syncBannerDetail'), '');
          assert.equal(await syncState(page), 'error', 'the read error remains independently of the reverted draft');
        }
        assert.equal(await readFile(page, 'p', 'kanban.md'), original);
      } finally {
        await waitIdle(page);
        await setFault(page, 'p', 'kanban.md', {});
      }
    });
  }

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
      let writeHeld = false;
      try {
        // Hold the first save at close, then queue a second one. The second save must
        // serialize tasks AFTER oninput, rather than reuse content prepared before typing.
        await page.evaluate(() => {
          window.__mockFS.holdWrite('p', 'kanban.md');
          toggleSubtask('TASK-001', 0);
        });
        writeHeld = true;
        await page.waitForFunction(() => window.__mockFS.isWriteHeld('p', 'kanban.md'));
        await page.evaluate(() => toggleSubtask('TASK-001', 0));
        const seq = await page.evaluate(() => session.editSeq);
        await page.fill(selector, invalid);
        assert.equal(await page.evaluate(() => session.editSeq), seq, 'input does not mark the committed board dirty');
        assert.deepEqual(await page.evaluate(() => ({ estimate: tasks[0].estimate, worklog: tasks[0].worklog })), committed);
        assert.equal(await page.evaluate(() => isDetailDraftDirty()), true);
        if (invalid) assert.ok(!(await page.evaluate(() => unsavedKanbanText())).includes(invalid));
        await page.evaluate(() => window.__mockFS.releaseWrite('p', 'kanban.md'));
        writeHeld = false;
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
      } finally {
        if (writeHeld) await page.evaluate(() => window.__mockFS.releaseWrite('p', 'kanban.md'));
        await waitIdle(page);
      }
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

  for (const draft of ['detail memo', 'form title']) {
    it(`refreshes error banner exports when typing a ${draft} after a read failure`, async ({ page }) => {
      await setup(page);
      if (draft === 'detail memo') {
        await page.evaluate(() => addWorklog('TASK-001'));
        await waitIdle(page);
      } else {
        await page.evaluate(() => {
          closeModal();
          openTaskModal(tasks[0]);
        });
        await page.waitForSelector('#newTaskModal.active');
      }
      const original = await readFile(page, 'p', 'kanban.md');
      await setFault(page, 'p', 'kanban.md', { readFail: true });
      await page.evaluate(() => checkExternalChanges());
      await page.waitForFunction(() => document.getElementById('syncStatus').dataset.state === 'error');
      assert.deepEqual(await page.evaluate(() => session.lastError), { which: 'kanban', kind: 'read-failed' });
      assert.equal(await page.isVisible('#syncReloadBtn'), true);
      for (const selector of ['#syncDownloadBtn', '#syncCopyBtn', '#syncRetryBtn']) {
        assert.equal(await page.isVisible(selector), false, `${selector} starts hidden`);
      }

      const selector = draft === 'detail memo' ? '#taskDetailWorklog input[type="text"]' : '#taskTitle';
      const text = `Rescue this uncommitted ${draft}`;
      await page.fill(selector, text);
      await page.waitForSelector('#syncDownloadBtn:visible');
      await page.waitForSelector('#syncCopyBtn:visible');
      assert.equal(await page.isVisible('#syncReloadBtn'), true);
      assert.equal(await page.isVisible('#syncRetryBtn'), false, 'a draft alone cannot be retried');
      assert.equal(await page.evaluate(() => isDirty()), false);
      assert.ok((await page.evaluate(() => unsavedKanbanText())).includes(text));
      assert.equal(await readFile(page, 'p', 'kanban.md'), original);

      // Reverting or closing the draft must remove its export buttons again.
      if (draft === 'detail memo') await page.fill(selector, '');
      else await page.evaluate(() => closeTaskModal());
      await page.waitForSelector('#syncDownloadBtn', { state: 'hidden' });
      await page.waitForSelector('#syncCopyBtn', { state: 'hidden' });
      assert.equal(await page.evaluate(() => hasUnsavedWork()), false);
    });
  }

  for (const [field, selector, text] of [
    ['worklog memo', '#taskDetailWorklog input[type="text"]', 'Rescue memo on the first click'],
    ['estimate', '#taskDetailEstimate', '8h'],
  ]) {
    it(`downloads the ${field} on the first click after a delayed read failure`, async ({ page }) => {
      await setup(page);
      await page.evaluate(() => addWorklog('TASK-001'));
      await waitIdle(page);
      const original = await readFile(page, 'p', 'kanban.md');
      try {
        await setFault(page, 'p', 'kanban.md', { readFail: true, readDelay: 250 });
        await page.evaluate(() => checkExternalChanges());
        assert.deepEqual(await page.evaluate(() => session.lastError), { which: 'kanban', kind: 'read-failed' });
        assert.equal(await page.isVisible('#syncDownloadBtn'), false);

        await page.fill(selector, text);
        await page.waitForSelector('#syncDownloadBtn:visible');
        assert.equal(await page.isVisible('#syncCopyBtn'), true);
        assert.equal(await page.locator(selector).evaluate(el => el === document.activeElement), true);
        assert.equal(await page.evaluate(() => isDirty()), false);

        // Use the normal click path to export the still-focused draft.
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 5000 }),
          page.click('#syncDownloadBtn'),
        ]);
        assert.match(download.suggestedFilename(), /^kanban\.unsaved-\d{8}-\d{6}\.md$/);
        const exported = await readDownloadedFile(await download.path(), 'utf8');
        if (field === 'estimate') assert.match(exported, /\*\*Estimate\*\*: 8h\n/);
        else assert.ok(exported.includes(text));
        await waitIdle(page);
        assert.equal(await readFile(page, 'p', 'kanban.md'), original);
      } finally {
        await waitIdle(page);
        await setFault(page, 'p', 'kanban.md', {});
      }
    });
  }

  for (const width of [740, 1024]) {
    for (const action of ['Copy', 'Download']) {
      for (const [field, selector, text] of [
        ['memo', '#taskDetailWorklog input[type="text"]', '長押しの最初の操作で救出するメモ'],
        ['estimate', '#taskDetailEstimate', '8h'],
      ]) {
        it(`rescues the ${field} with the first held ${action} press at ${width}px in Japanese`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.evaluate(() => setLanguage('ja'));
          await setup(page);
          await page.evaluate(() => addWorklog('TASK-001'));
          await waitIdle(page);
          const original = await readFile(page, 'p', 'kanban.md');
          try {
            await setFault(page, 'p', 'kanban.md', { readFail: true, readDelay: 30 });
            await page.evaluate(() => checkExternalChanges());
            assert.deepEqual(await page.evaluate(() => session.lastError), { which: 'kanban', kind: 'read-failed' });
            await page.fill(selector, text);
            await page.waitForSelector(`#sync${action}Btn:visible`);
            assert.equal(await page.isVisible('#syncRetryBtn'), false);
            const seq = await page.evaluate(() => session.editSeq);
            if (action === 'Copy') await page.evaluate(() => navigator.clipboard.writeText(''));
            const bounds = await page.locator(`#sync${action}Btn`).boundingBox();
            assert.ok(bounds);
            await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
            const press = async () => {
              await page.mouse.down();
              // Without focus preservation, blur queues a save whose 30ms read
              // failure inserts Retry and moves the target before this release.
              await page.waitForTimeout(100);
              await page.mouse.up();
            };
            let exported;
            if (action === 'Download') {
              const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: 5000 }),
                press(),
              ]);
              exported = await readDownloadedFile(await download.path(), 'utf8');
            } else {
              await press();
              await page.waitForFunction(async value => (await navigator.clipboard.readText()).includes(value), text, { timeout: 5000 });
              exported = await page.evaluate(() => navigator.clipboard.readText());
            }
            if (field === 'estimate') assert.match(exported, /\*\*Estimate\*\*: 8h\n/);
            else assert.ok(exported.includes(text));
            assert.equal(await page.locator(selector).evaluate(el => el === document.activeElement), true, 'rescue keeps the draft input focused');
            await waitIdle(page);
            assert.equal(await page.evaluate(() => session.editSeq), seq, 'rescue must not commit the draft');
            assert.equal(await page.evaluate(() => isDirty()), false);
            assert.equal(await page.evaluate(() => isDetailDraftDirty()), true);
            assert.equal(await page.isVisible('#syncRetryBtn'), false, 'no failed save inserts Retry');
            assert.equal(await readFile(page, 'p', 'kanban.md'), original);
          } finally {
            await page.mouse.up();
            await waitIdle(page);
            await setFault(page, 'p', 'kanban.md', {});
          }
        });
      }
    }
  }

  it('refreshes the form draft indicator after subtask mutations and reversions', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
      closeModal();
      openTaskModal(tasks[0]);
    });
    await page.waitForSelector('#newTaskModal.active');
    const original = await readFile(page, 'p', 'kanban.md');
    const checkbox = '#formSubtasksList input[type="checkbox"]';
    await page.waitForFunction(() => document.getElementById('syncStatus').dataset.state === 'saved');
    // Real checkbox clicks exercise input before change updates formSubtasks.
    await page.check(checkbox);
    await page.waitForFunction(() => document.getElementById('syncStatus').dataset.state === 'dirty');
    await page.uncheck(checkbox);
    await page.waitForFunction(() => document.getElementById('syncStatus').dataset.state === 'saved');
    await page.click('#formSubtasksList button');
    await page.waitForFunction(() => document.getElementById('syncStatus').dataset.state === 'dirty');
    assert.equal(await page.locator('#formSubtasksList li').count(), 0);

    // Adding the deleted subtask back restores the opened task's state.
    await page.fill('#formSubtaskInput', 'First step');
    await page.press('#formSubtaskInput', 'Enter');
    await page.waitForFunction(() => document.getElementById('syncStatus').dataset.state === 'saved');
    await page.fill('#formSubtaskInput', 'Another step');
    await page.press('#formSubtaskInput', 'Enter');
    await page.waitForFunction(() => document.getElementById('syncStatus').dataset.state === 'dirty');
    await page.evaluate(() => closeTaskModal());
    await page.waitForFunction(() => document.getElementById('syncStatus').dataset.state === 'saved');
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
