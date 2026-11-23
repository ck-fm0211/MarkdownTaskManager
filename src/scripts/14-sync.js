        // ===== Safe file I/O =====
        // kanban.md / archive.md are edited by this page AND by AI assistants / text editors.
        // Rules implemented here:
        //  * Every file keeps a BASELINE = its exact text when we last read or wrote it.
        //  * Before any write the file is read again and compared (full content, not mtime/size)
        //    with the baseline. Any difference → no write, the board enters CONFLICT state.
        //  * There is no "overwrite anyway" and no automatic merge. The user can export the
        //    unsaved board (download / copy) and reload the disk version.
        //  * All writes of all files go through ONE queue (no overlapping or reordered writes).
        //  * A write counts as done only after the file was read back and matched.
        //  * A read error / permission error / missing file is never treated as "no change".
        //  * Each opened project is a `session` with a generation number; async work that
        //    finishes after a switch sees a stale session and does nothing.
        // LIMIT: this is a check-then-write, not a lock. Another program can still write between
        // our check and our write (a window of milliseconds), and OneDrive may sync later. See
        // docs/ja/SAFETY.md for the operating rules that close that gap.

        let projectGen = 0;
        let session = null;
        let writeChain = Promise.resolve();
        let pendingWrites = 0;
        let queuedKanbanSave = null;
        let busyOperation = null;

        class SyncError extends Error {
            constructor(kind, which, message, extra = {}) {
                super(message || kind);
                this.kind = kind;   // conflict | missing | appeared | read-failed | write-failed | verify-failed | uncertain | stale | blocked | refused
                this.which = which; // 'kanban' | 'archive'
                Object.assign(this, extra);
            }
        }

        function newFileSlot(name) {
            // baseline: string = content we know is on disk; null = we know the file does not exist.
            // state: 'ok' | 'error' (could not be read → never written).
            // notUtf8: the file is not valid UTF-8 (e.g. Shift_JIS written by PowerShell 5.1); the
            // baseline is then its lossy decoding and the file is read-only (never written).
            return { name, handle: null, baseline: null, state: 'ok', eol: '\n', error: null, notUtf8: false };
        }

        function newSession(dir) {
            return {
                gen: ++projectGen,
                dir,
                files: { kanban: newFileSlot('kanban.md'), archive: newFileSlot('archive.md') },
                editSeq: 0,      // bumped on every in-memory board change
                savedSeq: 0,     // editSeq covered by the last successful kanban.md write
                conflict: null,  // { which, kind } → saves stop until reload
                blocked: { kanban: null, archive: null }, // parse problems → file is read-only
                lastError: null, // { which, kind } of the last failed (non-conflict) write
                archivePreamble: '',
                warnings: []
            };
        }

        function isDirty(s = session) {
            return !!s && s.editSeq !== s.savedSeq;
        }

        // Unsaved work of any kind: board changes not on disk yet, or typed changes in a task form / detail view.
        function hasUnsavedWork(s = session) {
            return isDirty(s) || (!!s && (isFormDirty() || isDetailDraftDirty()));
        }

        function fileLabel(which) {
            return which === 'archive' ? 'archive.md' : 'kanban.md';
        }

        // Serialize ALL file writes. fn runs after every previously queued write has settled.
        function enqueueWrite(fn) {
            pendingWrites++;
            updateSyncIndicator();
            const run = writeChain.then(() => fn());
            writeChain = run.then(() => {}, () => {}).then(() => {
                pendingWrites--;
                updateSyncIndicator();
            });
            return run;
        }

        async function waitForWrites() {
            while (pendingWrites > 0) await writeChain;
        }

        function assertLive(s) {
            if (!s || s !== session || s.gen !== projectGen) throw new SyncError('stale', null, 'stale session');
        }

        // Read a file of the session. → { exists: true, text, handle, notUtf8 } | { exists: false }.
        // Any error other than "not found" throws read-failed (never treated as "unchanged").
        // The bytes are decoded strictly: a file that is not UTF-8 is reported (notUtf8), never
        // silently turned into U+FFFD replacement characters.
        async function readDisk(s, which) {
            const slot = s.files[which];
            let handle = slot.handle;
            try {
                if (!handle) handle = await s.dir.getFileHandle(slot.name);
                const file = await handle.getFile();
                const d = decodeUtf8(await file.arrayBuffer());
                return { exists: true, text: d.text, handle, notUtf8: !d.valid };
            } catch (e) {
                if (e && e.name === 'NotFoundError') return { exists: false };
                throw new SyncError('read-failed', which, e && e.message, { cause: e });
            }
        }

        // Compare the disk with the baseline. Throws when writing would discard someone else's change.
        function checkBaseline(s, which, disk) {
            const slot = s.files[which];
            if (slot.state === 'error') throw new SyncError('read-failed', which, 'file was not readable at load');
            if (slot.baseline === null) {
                if (disk.exists && (disk.notUtf8 || disk.text.trim() !== '')) throw new SyncError('appeared', which);
                return;
            }
            if (!disk.exists) throw new SyncError('missing', which);
            if (!!disk.notUtf8 !== !!slot.notUtf8 || disk.text !== slot.baseline) throw new SyncError('conflict', which);
        }

        async function assertUnchanged(s, which) {
            assertLive(s);
            const disk = await readDisk(s, which);
            assertLive(s);
            checkBaseline(s, which, disk);
            return disk;
        }

        // Check → write → read back. MUST be called from inside enqueueWrite().
        // A read-only file (parse problems, not UTF-8) and an open conflict are refused HERE too, not
        // only by the callers: a job that was queued before a reload made the file read-only must
        // not write it when its turn comes.
        // Content that would not read back as written (a NUL: the file would open read-only; a lone
        // surrogate: written as U+FFFD) is refused before anything is read or written ('refused').
        // The inputs check this themselves (taskWriteProblems / configWriteProblems); this is the
        // last line of defence.
        async function writeFileChecked(s, which, content) {
            const slot = s.files[which];
            assertLive(s);
            const unwritable = unwritableTextProblems(content, { lineNumbers: true });
            if (unwritable.length) throw new SyncError('refused', which, 'content would not read back', { problems: unwritable });
            if (s.blocked[which]) throw new SyncError('blocked', which, 'file is read-only');
            if (s.conflict) throw new SyncError(s.conflict.kind, s.conflict.which, 'conflict is open');
            const disk = await assertUnchanged(s, which);
            let handle = disk.handle || slot.handle;
            try {
                if (!handle) handle = await s.dir.getFileHandle(slot.name, { create: true });
            } catch (e) {
                throw new SyncError('write-failed', which, e && e.message, { cause: e });
            }
            assertLive(s);
            let writable = null;
            try {
                writable = await handle.createWritable();
                await writable.write(content);
                await writable.close();
            } catch (e) {
                if (writable) { try { await writable.abort(); } catch (ignored) { /* already closed */ } }
                // What is on disk now? Unchanged → clean failure; our content → it did land;
                // anything else → unknown state, treat as conflict.
                let after = null;
                try { after = await readDisk(s, which); } catch (ignored) { /* unreadable */ }
                const unchanged = after && (slot.baseline === null ? !after.exists || after.text === '' : after.exists && after.text === slot.baseline);
                if (!(after && after.exists && after.text === content)) {
                    throw new SyncError(unchanged ? 'write-failed' : 'uncertain', which, e && e.message, { cause: e });
                }
            }
            let back;
            try { back = await readDisk(s, which); } catch (e) {
                throw new SyncError('uncertain', which, 'read-back failed', { cause: e });
            }
            if (!back.exists || back.notUtf8 || back.text !== content) throw new SyncError('uncertain', which, 'read-back mismatch');
            slot.handle = handle;
            slot.baseline = content;
            slot.state = 'ok';
            slot.notUtf8 = false;
            return true;
        }

        // Called after every in-memory change of the board. Returns a Promise<boolean>.
        function autoSave() {
            const s = session;
            if (!s) return Promise.resolve(false);
            s.editSeq++;
            updateSyncIndicator();
            return requestKanbanSave(s).then(r => r.ok);
        }

        // Coalesce: while a kanban.md save is queued but not started, later requests share it
        // (it serializes the board at the moment it RUNS, so it always writes the latest state).
        function requestKanbanSave(s = session) {
            if (!s) return Promise.resolve({ ok: false, kind: 'no-session' });
            if (queuedKanbanSave && queuedKanbanSave.session === s) return queuedKanbanSave.promise;
            const entry = { session: s, promise: null };
            entry.promise = enqueueWrite(async () => {
                if (queuedKanbanSave === entry) queuedKanbanSave = null;
                return saveKanbanNow(s);
            });
            queuedKanbanSave = entry;
            return entry.promise;
        }

        async function saveKanbanNow(s) {
            if (s !== session) return { ok: false, kind: 'stale' };
            if (s.conflict) { renderSyncBanner(); return { ok: false, kind: 'conflict' }; }
            if (s.blocked.kanban) { renderSyncBanner(); return { ok: false, kind: 'blocked' }; }
            const seq = s.editSeq;
            const slot = s.files.kanban;
            const content = generateKanbanContent(config, tasks, slot.eol);
            if (content === slot.baseline) {
                s.savedSeq = Math.max(s.savedSeq, seq);
                updateSyncIndicator();
                return { ok: true, unchanged: true };
            }
            try {
                await writeFileChecked(s, 'kanban', content);
                s.savedSeq = Math.max(s.savedSeq, seq);
                if (s.lastError && s.lastError.which === 'kanban') s.lastError = null;
                renderSyncBanner();
                return { ok: true };
            } catch (e) {
                handleSyncError(s, e);
                return { ok: false, kind: e.kind };
            }
        }

        // Save, then show `successMessage` only if the save really succeeded.
        async function persistKanban(successMessage) {
            const ok = await autoSave();
            if (ok && successMessage) showNotification(successMessage, 'success');
            return ok;
        }

        function handleSyncError(s, e) {
            if (!e || e.kind === 'stale' || s !== session) return;
            console.error('Save/check failed:', e.which, e.kind, e.cause || e);
            if (['conflict', 'missing', 'appeared', 'uncertain'].includes(e.kind)) {
                s.conflict = { which: e.which || 'kanban', kind: e.kind };
            } else {
                s.lastError = { which: e.which || 'kanban', kind: e.kind, problems: e.problems || null };
            }
            renderSyncBanner();
            showNotification(t('sync.saveFailedShort', { file: fileLabel(e.which) }), 'error');
        }

        // Block edits that could not be saved (read-only file or open conflict).
        function guardWritable() {
            const s = session;
            if (!s) return false;
            // No edits while an archive / restore / delete is running: the operation works on a
            // snapshot of the task and must not drop a change made in the meantime.
            if (busyOperation) { showNotification(t('notif.busy'), 'error'); return false; }
            if (s.blocked.kanban) { showNotification(t('notif.readOnly'), 'error'); renderSyncBanner(); return false; }
            if (s.conflict) { showNotification(t('notif.conflictNoEdit'), 'error'); renderSyncBanner(); return false; }
            return true;
        }

        // Multi-step operations (archive / restore / delete-from-archive) run one at a time.
        async function runExclusive(name, fn) {
            if (busyOperation) { showNotification(t('notif.busy'), 'error'); return null; }
            busyOperation = name;
            updateSyncIndicator();
            try {
                return await fn();
            } finally {
                busyOperation = null;
                updateSyncIndicator();
            }
        }

        // ----- Export of the in-memory (unsaved) board -----

        function timestampForFile(d = new Date()) {
            const p = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
        }

        // The board as it is in this page, INCLUDING what is typed in an open task form (a form that
        // could not be saved because of a conflict must be part of the export).
        function unsavedKanbanText() {
            return generateKanbanContent(config, boardWithOpenForm(), session ? session.files.kanban.eol : '\n');
        }

        function downloadUnsaved() {
            if (!session) return;
            const name = `kanban.unsaved-${timestampForFile()}.md`;
            const blob = new Blob([unsavedKanbanText()], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            showNotification(t('sync.downloaded', { name }), 'success');
        }

        async function copyUnsaved() {
            if (!session) return;
            const text = unsavedKanbanText();
            try {
                await navigator.clipboard.writeText(text);
                showNotification(t('sync.copied'), 'success');
                return;
            } catch (e) { /* fall back below */ }
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            ta.remove();
            showNotification(ok ? t('sync.copied') : t('sync.copyFailed'), ok ? 'success' : 'error');
        }

        // ----- Reload / external change detection -----

        function anyEditorOpen() {
            return ['taskModal', 'newTaskModal', 'columnsModal'].some(id => {
                const el = document.getElementById(id);
                return el && el.classList.contains('active');
            });
        }

        // Re-read the project from disk. Unsaved edits are only discarded after confirmation.
        async function reloadFromDisk(opts = {}) {
            if (!session) return false;
            if (busyOperation) { showNotification(t('notif.busy'), 'error'); return false; }
            await waitForWrites();
            if (!session) return false;
            if (!opts.force && hasUnsavedWork()) {
                if (!confirm(t('confirm.reloadDiscard'))) return false;
            }
            const ok = await openProject(session.dir, { skipLeaveCheck: true, reload: true });
            // Like every other way of opening a project: the load warnings (duplicate ids, dates …,
            // archive.md's too) stay visible after the message instead of being replaced by it.
            if (ok && !opts.quiet) notifyProjectOpened(t('notif.reloaded'));
            return ok;
        }

        let externalCheckRunning = false;
        // Run when the page becomes visible / focused and from the manual "check" action.
        async function checkExternalChanges(opts = {}) {
            const s = session;
            if (!s || externalCheckRunning || busyOperation || pendingWrites > 0) return;
            externalCheckRunning = true;
            try {
                const changed = [];
                for (const which of ['kanban', 'archive']) {
                    try {
                        checkBaseline(s, which, await readDisk(s, which));
                    } catch (e) {
                        if (e.kind === 'read-failed' && s.files[which].state === 'error') continue; // already known
                        changed.push(e);
                    }
                }
                if (s !== session) return;
                if (changed.length === 0) {
                    if (opts.manual) showNotification(t('notif.noExternalChange'), 'success');
                    return;
                }
                const readError = changed.find(e => e.kind === 'read-failed');
                if (readError) {
                    s.lastError = { which: readError.which, kind: 'read-failed' };
                    renderSyncBanner();
                    return;
                }
                const onlyContentChanges = changed.every(e => e.kind === 'conflict' || e.kind === 'appeared');
                if (onlyContentChanges && !isDirty(s) && !anyEditorOpen() && !s.conflict) {
                    // Nothing unsaved and nothing being edited → safe to take the disk version.
                    const archiveOpen = document.getElementById('archiveModal').classList.contains('active');
                    const ok = await openProject(s.dir, { skipLeaveCheck: true, reload: true });
                    if (ok && archiveOpen) {
                        renderArchiveList(document.getElementById('archiveSearch').value);
                        document.getElementById('archiveModal').classList.add('active');
                    }
                    // A failed reload already reported its own error (load error, cancelled
                    // initialisation): never cover it with a success message. A successful one keeps
                    // the load warnings visible (this is how a board edited by an AI is usually loaded).
                    if (ok) notifyProjectOpened(t('notif.reloadedExternal'));
                    return;
                }
                const first = changed[0];
                s.conflict = { which: first.which, kind: first.kind };
                renderSyncBanner();
            } finally {
                externalCheckRunning = false;
            }
        }

        // ----- Status indicator & banner -----

        function updateSyncIndicator() {
            const el = document.getElementById('syncStatus');
            if (!el) return;
            const s = session;
            let state = 'none', label = '';
            if (s) {
                if (s.blocked.kanban) { state = 'blocked'; label = t('sync.statusReadOnly'); }
                else if (s.conflict) { state = 'conflict'; label = t('sync.statusConflict'); }
                else if (pendingWrites > 0 || busyOperation) { state = 'saving'; label = t('sync.statusSaving'); }
                else if (s.lastError) { state = 'error'; label = t('sync.statusError'); }
                else if (hasUnsavedWork(s)) { state = 'dirty'; label = t('sync.statusUnsaved'); }
                else { state = 'saved'; label = t('sync.statusSaved'); }
            }
            el.dataset.state = state;
            el.textContent = label;
            el.style.display = s ? 'inline-flex' : 'none';
        }

        function problemSummary(problems) {
            return (problems || []).map(p => {
                const head = t('integrity.' + p.code, { id: p.id || '', section: p.section || '', where: p.section ? ` (${p.section})` : '', line: p.line || '', count: p.count || '' });
                const lines = (p.lines || []).slice(0, 5).map(l => `  ${l}`).join('\n');
                return lines ? `${head}\n${lines}` : head;
            }).join('\n');
        }

        function renderSyncBanner() {
            updateSyncIndicator();
            const banner = document.getElementById('syncBanner');
            if (!banner) return;
            const s = session;
            const msgEl = document.getElementById('syncBannerText');
            const detailEl = document.getElementById('syncBannerDetail');
            const btns = {
                retry: document.getElementById('syncRetryBtn'),
                download: document.getElementById('syncDownloadBtn'),
                copy: document.getElementById('syncCopyBtn'),
                reload: document.getElementById('syncReloadBtn')
            };
            let kind = null, text = '', detail = '', show = [];
            if (s && s.blocked.kanban) {
                kind = 'blocked';
                text = t('sync.blockedKanban');
                detail = problemSummary(s.blocked.kanban);
                show = ['reload'];
            } else if (s && s.conflict) {
                kind = 'conflict';
                text = t('sync.conflict.' + s.conflict.kind, { file: fileLabel(s.conflict.which) });
                detail = t('sync.conflictHelp');
                show = ['download', 'copy', 'reload'];
            } else if (s && s.lastError) {
                kind = 'error';
                text = t('sync.error.' + s.lastError.kind, { file: fileLabel(s.lastError.which) });
                // 'refused': the same content would be refused again, so no "Retry"; the help says what to do.
                const refused = s.lastError.kind === 'refused';
                const exportable = hasUnsavedWork(s);
                const canRetry = isDirty(s) && !refused;
                const help = !exportable ? '' : refused ? t('sync.refusedHelp') : t('sync.errorUnsavedHelp');
                detail = [problemSummary(s.lastError.problems), help].filter(Boolean).join('\n\n');
                show = exportable ? (canRetry ? ['retry', 'download', 'copy', 'reload'] : ['download', 'copy', 'reload']) : ['reload'];
            } else if (s && s.blocked.archive) {
                kind = 'warning';
                text = t('sync.blockedArchive');
                detail = problemSummary(s.blocked.archive);
                show = ['reload'];
            }
            if (!kind) {
                banner.classList.remove('show');
                banner.removeAttribute('data-kind');
                updateBannerSpace();
                return;
            }
            banner.dataset.kind = kind;
            msgEl.textContent = text;
            detailEl.textContent = detail;
            detailEl.style.display = detail ? 'block' : 'none';
            Object.entries(btns).forEach(([k, b]) => { if (b) b.style.display = show.includes(k) ? 'inline-flex' : 'none'; });
            banner.classList.add('show');
            updateBannerSpace();
        }

        // While a dialog is open the banner is shown on top of it (CSS); the dialog leaves this much
        // room at the top so that neither covers the other.
        function updateBannerSpace() {
            const banner = document.getElementById('syncBanner');
            const h = banner && banner.classList.contains('show') ? Math.min(banner.offsetHeight, Math.round(window.innerHeight * 0.45)) : 0;
            document.documentElement.style.setProperty('--sync-banner-space', `${h}px`);
        }
        window.addEventListener('resize', updateBannerSpace);

        async function retrySave() {
            if (!session) return;
            session.lastError = null;
            renderSyncBanner();
            const r = await requestKanbanSave();
            if (r.ok) showNotification(t('notif.saved'), 'success');
        }

        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('syncRetryBtn').addEventListener('click', retrySave);
            document.getElementById('syncDownloadBtn').addEventListener('click', downloadUnsaved);
            document.getElementById('syncCopyBtn').addEventListener('click', copyUnsaved);
            document.getElementById('syncReloadBtn').addEventListener('click', () => reloadFromDisk());
            document.getElementById('reloadBtn').addEventListener('click', async () => {
                if (!session) return;
                if (hasUnsavedWork() || session.conflict) { await reloadFromDisk(); return; }
                await checkExternalChanges({ manual: true });
            });
            document.addEventListener('visibilitychange', () => { if (!document.hidden) checkExternalChanges(); });
            window.addEventListener('focus', () => checkExternalChanges());
            updateSyncIndicator();
        });

        // Warn before closing the tab while something is not on disk yet.
        window.addEventListener('beforeunload', (e) => {
            if (session && (hasUnsavedWork() || pendingWrites > 0 || busyOperation)) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
