        // ===== Archive / restore / delete =====
        // Moving a task between kanban.md and archive.md is two writes. They are NOT a transaction;
        // the order is chosen so that a failure never loses the task:
        //   archive : 1) check both files unchanged  2) write archive.md WITH the task
        //             3) write kanban.md WITHOUT it
        //   restore : 1) check both files unchanged  2) write kanban.md WITH the task
        //             3) write archive.md WITHOUT it
        // In-memory state is changed only after the matching write succeeded. If step 3 fails the
        // task is in BOTH files (reported as partial success). Running the same action again
        // detects the identical copy at the destination and only finishes step 3 — no duplicates.
        // A destination copy with the same id but different content is never overwritten/merged.

        function archiveEol() {
            return session ? session.files.archive.eol : '\n';
        }

        function archiveContentFor(list) {
            const pre = (session && session.archivePreamble) || defaultArchivePreambleText();
            return generateArchiveContent(pre, list, archiveEol());
        }

        function archiveUnavailableReason(s) {
            if (s.files.archive.state === 'error') return t('notif.archiveUnreadable');
            if (s.blocked.archive) return t('notif.archiveReadOnly');
            if (s.blocked.kanban) return t('notif.readOnly');
            if (s.conflict) return t('notif.conflictNoEdit');
            return null;
        }

        // Checked again when the queued job STARTS: a job queued behind a reload of archive.md
        // (opening the archive list re-reads it) must not write a file that this reload found to be
        // read-only, or run into a conflict found meanwhile. → true when the job must stop.
        function refusedAtStart(s) {
            const reason = archiveUnavailableReason(s);
            if (!reason) return false;
            showNotification(reason, 'error');
            renderSyncBanner();
            return true;
        }

        // Archive one task (the exact object `task` of tasks[]).
        // → { ok, partial?, skippedDestination?, reason? }
        async function archiveTask(task) {
            return runExclusive('archive', async () => {
                const s = session;
                if (!s || !task) return { ok: false };
                const reason = archiveUnavailableReason(s);
                if (reason) { showNotification(reason, 'error'); renderSyncBanner(); return { ok: false, reason }; }
                return enqueueWrite(async () => {
                    if (s !== session || !tasks.includes(task)) return { ok: false, reason: 'stale' };
                    if (refusedAtStart(s)) return { ok: false, reason: 'unavailable' };
                    // Snapshot: exactly this content is archived. Edits are blocked while the
                    // operation runs (guardWritable); the snapshot is re-checked before the task
                    // is removed from the board, as a second line of defence.
                    const snapshot = serializeTask(task);
                    try {
                        await assertUnchanged(s, 'archive');
                        await assertUnchanged(s, 'kanban');
                    } catch (e) { handleSyncError(s, e); return { ok: false, reason: e.kind }; }

                    // Destination: archive.md — decided on what is ON DISK (== baseline, just checked).
                    const diskArchive = s.files.archive.baseline === null ? [] : parseArchiveContent(s.files.archive.baseline).tasks;
                    const same = diskArchive.filter(a => a.id === task.id);
                    let skippedDestination = false;
                    if (same.length) {
                        if (!same.every(a => sameTask(a, task))) {
                            showNotification(t('notif.duplicateDifferent', { id: task.id, file: 'archive.md' }), 'error');
                            return { ok: false, reason: 'duplicate-different' };
                        }
                        skippedDestination = true; // already archived identically (earlier partial run)
                    } else {
                        const next = [...archivedTasks, { ...task, subtasks: task.subtasks.map(st => ({ ...st })), worklog: (task.worklog || []).map(log => ({ ...log })) }];
                        try {
                            await writeFileChecked(s, 'archive', archiveContentFor(next));
                        } catch (e) {
                            handleSyncError(s, e);
                            showNotification(t('notif.archiveFailed', { id: task.id }), 'error');
                            return { ok: false, reason: e.kind };
                        }
                        archivedTasks = next;
                    }

                    // Source: kanban.md
                    if (serializeTask(task) !== snapshot) {
                        showNotification(t('notif.changedDuringOperation', { id: task.id }), 'error');
                        return { ok: false, partial: true, reason: 'changed' };
                    }
                    const seq = s.editSeq;
                    const remaining = tasks.filter(x => x !== task);
                    try {
                        await writeFileChecked(s, 'kanban', generateKanbanContent(config, remaining, s.files.kanban.eol));
                    } catch (e) {
                        handleSyncError(s, e);
                        showNotification(t('notif.archivePartial', { id: task.id }), 'error');
                        return { ok: false, partial: true, reason: e.kind };
                    }
                    const i = tasks.indexOf(task);
                    if (i >= 0) tasks.splice(i, 1);
                    if (s.editSeq === seq) s.savedSeq = seq; // nothing else changed meanwhile
                    else s.editSeq++; // later edits still need their own save (already queued)
                    return { ok: true, skippedDestination };
                });
            });
        }

        async function archiveCurrentTask() {
            if (!currentDetailTask || wasArchiveModalActive || !guardWritable()) return;
            const task = tasks.includes(currentDetailTask) ? currentDetailTask : null;
            if (!task) { showNotification(t('notif.staleList'), 'error'); return; }
            if (!confirm(t('confirm.archiveTask', { title: task.title }))) return;
            closeModal(); // nothing of this task can be edited while it is being archived
            const r = await archiveTask(task);
            if (!r) return;
            updateAutocomplete();
            renderKanban();
            if (r.ok) showNotification(t('notif.taskArchived'), 'success');
        }

        // Restore one archived task (exact object of archivedTasks[]).
        async function unarchiveTaskObject(task) {
            return runExclusive('restore', async () => {
                const s = session;
                if (!s || !task) return { ok: false };
                const reason = archiveUnavailableReason(s);
                if (reason) { showNotification(reason, 'error'); renderSyncBanner(); return { ok: false, reason }; }
                return enqueueWrite(async () => {
                    if (s !== session || !archivedTasks.includes(task)) return { ok: false, reason: 'stale' };
                    if (refusedAtStart(s)) return { ok: false, reason: 'unavailable' };
                    try {
                        await assertUnchanged(s, 'kanban');
                        await assertUnchanged(s, 'archive');
                    } catch (e) { handleSyncError(s, e); return { ok: false, reason: e.kind }; }

                    // Keep the original column; fall back to the first column if it no longer exists.
                    const restored = { ...task, subtasks: task.subtasks.map(st => ({ ...st })), worklog: (task.worklog || []).map(log => ({ ...log })) };
                    delete restored.statusUnknown;
                    if (!config.columns.find(col => col.id === restored.status)) {
                        restored.status = config.columns[0]?.id || 'todo';
                    }

                    // Destination: kanban.md. The board in memory may hold UNSAVED changes, so the
                    // write is skipped only when an identical copy is really ON DISK.
                    const inMemory = tasks.filter(a => a.id === task.id);
                    if (inMemory.some(a => !sameTask(a, restored))) {
                        showNotification(t('notif.duplicateDifferent', { id: task.id, file: 'kanban.md' }), 'error');
                        return { ok: false, reason: 'duplicate-different' };
                    }
                    const onDisk = parseKanbanContent(s.files.kanban.baseline).tasks.filter(a => a.id === task.id);
                    const skippedDestination = inMemory.length > 0 && onDisk.length > 0 && onDisk.every(a => sameTask(a, restored));
                    if (!skippedDestination) {
                        const seq = s.editSeq;
                        const next = inMemory.length ? tasks : [...tasks, restored];
                        try {
                            await writeFileChecked(s, 'kanban', generateKanbanContent(config, next, s.files.kanban.eol));
                        } catch (e) {
                            handleSyncError(s, e);
                            showNotification(t('notif.restoreFailed', { id: task.id }), 'error');
                            return { ok: false, reason: e.kind };
                        }
                        if (!inMemory.length) tasks.push(restored);
                        if (s.editSeq === seq) s.savedSeq = seq; else s.editSeq++;
                    }

                    // Source: archive.md
                    const remaining = archivedTasks.filter(x => x !== task);
                    try {
                        await writeFileChecked(s, 'archive', archiveContentFor(remaining));
                    } catch (e) {
                        handleSyncError(s, e);
                        showNotification(t('notif.restorePartial', { id: task.id }), 'error');
                        return { ok: false, partial: true, reason: e.kind };
                    }
                    archivedTasks = remaining;
                    return { ok: true, skippedDestination };
                });
            });
        }

        async function restoreFromList(task) {
            if (!guardWritable()) return;
            const r = await unarchiveTaskObject(task);
            if (!r) return;
            if (r.reason === 'stale') showNotification(t('notif.staleList'), 'error');
            updateAutocomplete();
            renderKanban();
            renderArchiveList(document.getElementById('archiveSearch').value);
            if (r.ok) showNotification(t('notif.taskRestored'), 'success');
        }

        async function unarchiveTask(taskId) {
            const task = archivedTasks.find(x => x.id === taskId);
            if (task) await restoreFromList(task);
        }

        function deleteCurrentTask() {
            if (!currentDetailTask || wasArchiveModalActive) return; // the archived dialog is read-only
            deleteTask(currentDetailTask, false);
        }

        // Delete one task. `target` is the task OBJECT (an id is accepted for compatibility):
        // with duplicate ids, the clicked task is deleted — never "the first one with that id".
        async function deleteTask(target, fromArchive = false) {
            if (!guardWritable()) return;
            const taskList = fromArchive ? archivedTasks : tasks;
            const task = typeof target === 'object' ? target : taskList.find(x => x.id === target);
            if (!task || !taskList.includes(task)) {
                if (task) { showNotification(t('notif.staleList'), 'error'); if (fromArchive) renderArchiveList(document.getElementById('archiveSearch').value); }
                return;
            }

            const confirmMessage = fromArchive
                ? t('confirm.deleteTask', { title: task.title })
                : t('confirm.deleteTaskFromArchive', { title: task.title });
            if (!confirm(confirmMessage)) return;

            if (!fromArchive) {
                const idx = tasks.indexOf(task);
                if (idx < 0) return;
                tasks.splice(idx, 1);
                renderKanban();
                closeModal();
                await persistKanban(t('notif.taskDeleted'));
                return;
            }

            // archive.md: write first, commit after.
            const r = await runExclusive('delete-archived', async () => {
                const s = session;
                const reason = archiveUnavailableReason(s);
                if (reason) { showNotification(reason, 'error'); return { ok: false }; }
                return enqueueWrite(async () => {
                    if (s !== session || !archivedTasks.includes(task)) return { ok: false, reason: 'stale' };
                    if (refusedAtStart(s)) return { ok: false, reason: 'unavailable' };
                    const remaining = archivedTasks.filter(x => x !== task);
                    try {
                        await writeFileChecked(s, 'archive', archiveContentFor(remaining));
                    } catch (e) { handleSyncError(s, e); return { ok: false }; }
                    archivedTasks = remaining;
                    return { ok: true };
                });
            });
            if (r && r.reason === 'stale') showNotification(t('notif.staleList'), 'error');
            renderArchiveList(document.getElementById('archiveSearch').value);
            if (r && r.ok) showNotification(t('notif.taskDeleted'), 'success');
        }

        async function openArchiveModal() {
            await refreshArchiveFromDisk();
            renderArchiveList(document.getElementById('archiveSearch').value);
            document.getElementById('archiveModal').classList.add('active');
        }

        function closeArchiveModal() {
            document.getElementById('archiveModal').classList.remove('active');
        }

        function renderArchiveList(searchTerm = '') {
            const list = document.getElementById('archiveList');
            if (!list) return;

            const filtered = searchTerm ? archivedTasks.filter(x => taskMatchesSearch(x, searchTerm)) : archivedTasks;

            if (filtered.length === 0) {
                list.innerHTML = `<p style="text-align: center; color: var(--text-secondary, #999); padding: 2rem;">${t(searchTerm ? 'archives.noMatch' : 'archives.empty')}</p>`;
                return;
            }

            list.innerHTML = filtered.map((task, i) => `
                <div class="task-card archive-card" data-archive-index="${archivedTasks.indexOf(task)}">
                    <div style="background: var(--bg); border: 2px solid var(--border, #e2e8f0); border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                            <div>
                                <span style="background: #6b7280; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">${escapeHtml(task.id)}</span>
                                <strong style="margin-left: 0.5rem; font-size: 1.1rem;">${escapeHtml(task.title)}</strong>
                            </div>
                            <div style="display: flex; gap: 0.5rem;">
                                <button data-archive-action="delete" class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.85rem; background: #ef4444; color: white;" title="${escapeHtml(t('tooltip.deletePermanently'))}" aria-label="${escapeHtml(t('tooltip.deletePermanently'))}">🗑️</button>
                                <button data-archive-action="restore" class="btn btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">${t('action.restore')}</button>
                            </div>
                        </div>
                        ${task.description ? `<div style="color: var(--text-secondary, #666); margin: 0.5rem 0;">${markdownToHtml(task.description)}</div>` : ''}
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem;">
                            ${task.priority ? `<span style="background: #fbbf24; color: white; padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.8rem;">${escapeHtml(displayPriority(findPriorityLabel(config.priorities, task.priority) || task.priority))}</span>` : ''}
                            ${task.category ? `<span style="background: #8b5cf6; color: white; padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.8rem;">${escapeHtml(task.category)}</span>` : ''}
                            ${task.tags.map(tg => `<span style="background: #3b82f6; color: white; padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.8rem;">${escapeHtml(tg)}</span>`).join('')}
                        </div>
                    </div>
                </div>
            `).join('');

            // Handlers bound in JS (the archived object itself is passed — never an id in HTML).
            list.querySelectorAll('.archive-card').forEach(card => {
                const task = archivedTasks[+card.dataset.archiveIndex];
                card.addEventListener('click', () => showTaskDetail(task));
                card.querySelector('[data-archive-action="delete"]').addEventListener('click', (e) => { e.stopPropagation(); deleteTask(task, true); });
                card.querySelector('[data-archive-action="restore"]').addEventListener('click', (e) => { e.stopPropagation(); restoreFromList(task); });
            });
        }

        // Archive search
        document.getElementById('archiveSearch').addEventListener('input', (e) => {
            renderArchiveList(e.target.value);
        });

        // Event listeners
        document.getElementById('newTaskBtn').addEventListener('click', () => openTaskModal());
        document.getElementById('archiveBtn').addEventListener('click', openArchiveModal);
        document.getElementById('manageColsBtn').addEventListener('click', openColumnsModal);
