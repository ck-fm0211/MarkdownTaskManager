        // Detail inputs are exportable drafts; only validated changes enter tasks[].
        let detailDraft = null;

        function resetDetailDraft(task) {
            detailDraft = { task, estimate: task.estimate || '', worklog: (task.worklog || []).map(log => ({ ...log })) };
            return detailDraft;
        }

        function draftForDetail(task) {
            return detailDraft?.task === task ? detailDraft : resetDetailDraft(task);
        }

        function isDetailDraftDirty() {
            return !!detailDraft && tasks.includes(detailDraft.task) && (
                detailDraft.estimate !== (detailDraft.task.estimate || '') ||
                JSON.stringify(detailDraft.worklog) !== JSON.stringify(detailDraft.task.worklog || [])
            );
        }

        // opts.rerender: refresh the open dialog (e.g. language change) keeping whether it shows an
        // archived task.
        function showTaskDetail(task, opts = {}) {
            if (detailDraft?.task !== task) detailDraft = null;
            currentDetailTask = task;
            const detailValues = detailDraft || task;
            const actions = document.getElementById('taskModalActions');
            const modal = document.getElementById('taskModal');
            const modalBody = document.getElementById('modalBody');
            const archiveModal = document.getElementById('archiveModal');

            let actionsHtml = `<button class="btn btn-secondary" onclick="closeModal()">${t('taskDetail.close')}</button>`;

            // If coming from the archiveModal, hide: archive, edit, and delete buttons
            if (!opts.rerender) wasArchiveModalActive = archiveModal.classList.contains('active');
            if (wasArchiveModalActive) {
                archiveModal.classList.remove('active');
            }
            else {
                actionsHtml += `<button class="btn btn-primary" onclick="editCurrentTask()">${t('taskDetail.edit')}</button>`;
                actionsHtml += `<button class="btn btn-secondary" onclick="archiveCurrentTask()">${t('taskDetail.archive')}</button>`;
                actionsHtml += `<button class="btn btn-secondary" onclick="deleteCurrentTask()">${t('taskDetail.delete')}</button>`;
            }

            actions.innerHTML = actionsHtml;

            // Get priority with translation
            let priorityWithIcon = task.priority;
            if (task.priority) {
                const priority = findPriorityLabel(config.priorities, task.priority);
                if (priority) {
                    priorityWithIcon = displayPriority(priority);
                }
            }

            // Get status name
            const statusColumn = config.columns.find(col => col.id === task.status);
            const statusName = statusColumn ? statusColumn.name : task.status;
            const taskIdArg = escapeHtml(JSON.stringify(task.id));
            const worklog = detailValues.worklog || [];
            const actualTotal = Number(worklog.reduce((sum, log) => sum + (Number(log.hours) || 0), 0).toFixed(2));

            modalBody.innerHTML = `
                <div style="padding: 1.5rem;">
                    <!-- Task ID Badge -->
                    <div style="display: inline-block; background: var(--primary); color: white; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.85rem; font-weight: 600; margin-bottom: 1rem;">
                        ${escapeHtml(task.id)}
                    </div>

                    <!-- Title -->
                    <h3 style="margin: 0 0 1.5rem 0; font-size: 1.5rem; color: var(--text);">${escapeHtml(task.title)}</h3>

                    <!-- Metadata Grid -->
                    <div class="modal-form-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: var(--bg); border-radius: 8px;">
                        ${task.priority ? `
                            <div>
                                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">${t('meta.priority')}</div>
                                <div style="font-weight: 500;">${escapeHtml(displayPriority(priorityWithIcon))}</div>
                            </div>
                        ` : ''}

                        <div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">${t('meta.status')}</div>
                            <div style="font-weight: 500;">${escapeHtml(statusName)}</div>
                        </div>

                        ${task.category ? `
                            <div>
                                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">${t('meta.category')}</div>
                                <div style="font-weight: 500;">${escapeHtml(task.category)}</div>
                            </div>
                        ` : ''}

                        ${task.assignees.length > 0 ? `
                            <div>
                                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">${t('meta.assigned')}</div>
                                <div style="font-weight: 500;">${escapeHtml(task.assignees.join(', '))}</div>
                            </div>
                        ` : ''}

                        ${task.created ? `
                            <div>
                                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">${t('meta.created')}</div>
                                <div style="font-weight: 500;">${task.created}</div>
                            </div>
                        ` : ''}

                        ${task.started ? `
                            <div>
                                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">${t('meta.started')}</div>
                                <div style="font-weight: 500;">${task.started}</div>
                            </div>
                        ` : ''}

                        ${task.due ? `
                            <div>
                                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">${t('meta.due')}</div>
                                <div style="font-weight: 500;">${task.due}</div>
                            </div>
                        ` : ''}

                        ${task.completed ? `
                            <div>
                                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">${t('meta.completed')}</div>
                                <div style="font-weight: 500;">${task.completed}</div>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Tags -->
                    ${task.tags.length > 0 ? `
                        <div style="margin-bottom: 1.5rem;">
                            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem;">${t('meta.tags')}</div>
                            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                ${task.tags.map(tag => `
                                    <span style="background: var(--primary); color: white; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem;">
                                        ${escapeHtml(tag)}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Description -->
                    ${task.description ? `
                        <div style="margin-bottom: 1.5rem;">
                            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem; font-weight: 600;">${t('meta.description')}</div>
                            <div style="line-height: 1.6; color: var(--text);">${markdownToHtml(task.description)}</div>
                        </div>
                    ` : ''}

                    <!-- Subtasks -->
                    <div style="margin-bottom: 1.5rem;">
                        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem; font-weight: 600;">${t('meta.subtasks', {completed: task.subtasks.filter(st => st.completed).length, total: task.subtasks.length})}</div>
                        <ul id="subtasksList" style="list-style: none; padding: 0; margin: 0 0 1rem 0;">
                            ${task.subtasks.map((st, idx) => {
                                const escapedText = st.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                return `
                                <li style="padding: 0.5rem; margin-bottom: 0.25rem; background: var(--bg); border-radius: 4px; display: flex; align-items: center; gap: 0.5rem;">
                                    <input type="checkbox" ${st.completed ? 'checked' : ''} ${wasArchiveModalActive ? 'disabled' : ''} onchange="toggleSubtask('${task.id}', ${idx})" aria-label="${escapeHtml(st.text)}" style="width: 18px; height: 18px; cursor: pointer;">
                                    ${wasArchiveModalActive
                                        ? `<span style="flex: 1; ${st.completed ? 'text-decoration: line-through; color: var(--text-secondary);' : ''}">${escapedText}</span>`
                                        : `<span ondblclick="editSubtask('${task.id}', ${idx})" style="flex: 1; ${st.completed ? 'text-decoration: line-through; color: var(--text-secondary);' : ''} cursor: pointer;" title="${t('tooltip.doubleClickEdit')}">${escapedText}</span>
                                    <button onclick="deleteSubtask('${task.id}', ${idx})" style="background: none; border: none; cursor: pointer; color: #e53e3e; font-size: 1.1rem; padding: 0.25rem;" title="${t('tooltip.delete')}" aria-label="${t('tooltip.delete')}">🗑️</button>`}
                                </li>
                                `;
                            }).join('')}
                        </ul>
                        ${!wasArchiveModalActive ? `
                        <div style="display: flex; gap: 0.5rem;">
                            <input type="text" id="newSubtaskInput" placeholder="${t('subtask.newPlaceholder')}" aria-label="${t('subtask.newPlaceholder')}" onkeypress="if(event.key==='Enter') addSubtask('${task.id}')" style="flex: 1; padding: 0.5rem; border: 2px solid var(--border, #cbd5e0); border-radius: 4px; font-size: 0.9rem; background: var(--bg); color: var(--text);">
                            <button onclick="addSubtask('${task.id}')" class="btn btn-primary" style="padding: 0.5rem 1rem;">${t('taskForm.subtaskAdd')}</button>
                        </div>
                        ` : ''}
                    </div>

                    <!-- Estimate and Worklog -->
                    <div style="margin-bottom: 1.5rem;">
                        <label for="taskDetailEstimate" style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem; font-weight: 600;">${escapeHtml(t('taskForm.estimateLabel'))}</label>
                        ${wasArchiveModalActive
                            ? `<div>${escapeHtml(detailValues.estimate || '')}</div>`
                            : `<input type="text" id="taskDetailEstimate" value="${escapeHtml(detailValues.estimate || '')}" title="${escapeHtml(t('taskForm.estimateHint'))}" oninput="inputEstimate(${taskIdArg})" onchange="setEstimate(${taskIdArg})" style="padding: 0.5rem; border: 2px solid var(--border, #cbd5e0); border-radius: 4px; background: var(--bg); color: var(--text);">`}
                    </div>
                    <div id="taskDetailWorklog" style="margin-bottom: 1.5rem;">
                        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem; font-weight: 600;">${escapeHtml(t('taskForm.worklogLabel'))}</div>
                        <ul style="list-style: none; padding: 0; margin: 0 0 1rem 0;">
                            ${worklog.map((log, idx) => `
                                <li style="padding: 0.5rem; margin-bottom: 0.25rem; background: var(--bg); border-radius: 4px; display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                                    ${wasArchiveModalActive
                                        ? `<span>${escapeHtml(log.date)} | ${escapeHtml(String(log.hours))}h${log.memo ? ` | ${escapeHtml(log.memo)}` : ''}</span>`
                                        : `
                                        <input type="date" value="${escapeHtml(log.date)}" aria-label="${escapeHtml(t('taskForm.worklogDateLabel'))}" oninput="inputWorklog(${taskIdArg}, ${idx}, 'date', this.value)" onchange="updateWorklog(${taskIdArg}, ${idx}, 'date', this.value)" style="padding: 0.5rem; background: var(--bg); color: var(--text); border: 1px solid var(--border, #cbd5e0); border-radius: 4px;">
                                        <input type="number" min="0" step="0.25" value="${escapeHtml(String(log.hours))}" aria-label="${escapeHtml(t('taskForm.worklogHoursLabel'))}" oninput="inputWorklog(${taskIdArg}, ${idx}, 'hours', this.value)" onchange="updateWorklog(${taskIdArg}, ${idx}, 'hours', this.value)" style="width: 6rem; padding: 0.5rem; background: var(--bg); color: var(--text); border: 1px solid var(--border, #cbd5e0); border-radius: 4px;">
                                        <input type="text" value="${escapeHtml(log.memo || '')}" aria-label="${escapeHtml(t('taskForm.worklogMemoLabel'))}" oninput="inputWorklog(${taskIdArg}, ${idx}, 'memo', this.value)" onchange="updateWorklog(${taskIdArg}, ${idx}, 'memo', this.value)" style="flex: 1; min-width: 6rem; padding: 0.5rem; background: var(--bg); color: var(--text); border: 1px solid var(--border, #cbd5e0); border-radius: 4px;">
                                        <button onclick="deleteWorklog(${taskIdArg}, ${idx})" title="${escapeHtml(t('taskForm.worklogDelete'))}" aria-label="${escapeHtml(t('taskForm.worklogDelete'))}" style="background: none; border: none; cursor: pointer; color: #e53e3e; font-size: 1.1rem; padding: 0.25rem;">🗑️</button>`}
                                </li>
                            `).join('')}
                        </ul>
                        ${!wasArchiveModalActive ? `<button class="btn btn-primary" onclick="addWorklog(${taskIdArg})">${escapeHtml(t('taskForm.worklogAdd'))}</button>` : ''}
                        <div id="taskDetailWorklogTotal" style="margin-top: 0.5rem; font-weight: 600;">${escapeHtml(t('taskForm.worklogTotalLabel'))}: ${actualTotal}h</div>
                    </div>

                    <!-- Notes -->
                    ${task.notes ? `
                        <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #e2e8f0;">
                            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.75rem; font-weight: 600;">${t('meta.notes')}</div>
                            <div style="line-height: 1.7; color: var(--text); background: var(--bg); padding: 1rem; border-radius: 8px; border-left: 4px solid var(--primary);">
                                ${markdownToHtml(task.notes)}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;

            modal.classList.add('active');
        }

        function closeModal() {
            detailDraft = null;
            refreshSyncUi();
            document.getElementById('taskModal').classList.remove('active');
            if (wasArchiveModalActive) {
                document.getElementById('archiveModal').classList.add('active');
                wasArchiveModalActive = false; // Reset for next time
            }
        }

        function editCurrentTask() {
            // Only a task that is ON THE BOARD can be edited (never an archived task, never another
            // task with the same id).
            if (!currentDetailTask || wasArchiveModalActive || !tasks.includes(currentDetailTask)) return;
            const task = currentDetailTask;
            closeModal();
            openTaskModal(task);
        }

        // The task shown in the detail dialog, by object identity (duplicate ids must not make an
        // action hit another task with the same id); falls back to the id.
        // If the dialog shows an ARCHIVED task (or a task that is no longer on the board), no
        // board task is returned — an action there must never change another task with that id.
        function findActiveTask(taskId) {
            if (currentDetailTask && currentDetailTask.id === taskId) {
                return tasks.includes(currentDetailTask) ? currentDetailTask : null;
            }
            return tasks.find(t => t.id === taskId) || null;
        }

        // Lines that would be read back as something else (a new task, a heading of the task
        // area, a metadata field or a section) are refused instead of writing a file that reads
        // back differently or becomes read-only.
        function findStructuralLine(description, notes, subtaskTexts) {
            const head = /^\s*#{2,3}\s+TASK-/i;
            const outside = (text) => headingsOutsideFences(String(text || '').split('\n'));
            const fromNotes = String(notes || '').split('\n').find(l => head.test(l)) || outside(notes)[0];
            if (fromNotes) return fromNotes;
            // Field / section lines are only structure OUTSIDE a closed code block (same rule as the
            // parser); "### TASK-" is refused everywhere (it always starts a new task block).
            const descLines = String(description || '').split('\n');
            const descFenced = fencedLineMask(descLines);
            const fromDesc = descLines.find((l, i) => head.test(l) || (!descFenced[i] && (META_LINE_RE.test(l) || SECTION_STOP_RE.test(l))))
                || outside(description)[0];
            if (fromDesc) return fromDesc;
            // An unclosed ``` / ~~~ block would make the file ambiguous (read-only on the next load).
            const open = unclosedFences(String(description || '').split('\n'))[0] || unclosedFences(String(notes || '').split('\n'))[0];
            if (open) return open;
            return (subtaskTexts || []).find(l => head.test(l)) || null;
        }

        // A new task needs an id that is unused in kanban.md AND archive.md; refuse while
        // archive.md cannot be read completely.
        function canCreateNewTask() {
            const s = session;
            if (!s) return false;
            // Unreadable → its ids are unknown. A readable archive.md with parse problems is fine:
            // every "### TASK-<n>" line of it is still counted (maxIdInText).
            if (s.files.archive.state === 'error') {
                showNotification(t('notif.archiveNeededForId'), 'error');
                renderSyncBanner();
                return false;
            }
            // Not UTF-8 → its "### TASK-<n>" lines may not be readable at all (UTF-16, as written by
            // Windows PowerShell 5.1 Out-File / ">", puts a NUL between the characters): the same as
            // unreadable for choosing an id (a new task got the id of an archived one).
            if (s.files.archive.notUtf8) {
                showNotification(t('notif.archiveNotUtf8ForId'), 'error');
                renderSyncBanner();
                return false;
            }
            // A NUL in archive.md (nul-char) is often what a damaged file leaves: a run of NULs may have
            // replaced the end of the file, i.e. the most recently archived (highest) ids. They are not
            // known until the file is repaired (the NUL deleted, or restored from the version history).
            if ((s.blocked.archive || []).some(p => p.code === 'nul-char')) {
                showNotification(t('notif.archiveNulForId'), 'error');
                renderSyncBanner();
                return false;
            }
            return true;
        }

        // Subtask management
        function toggleSubtask(taskId, subtaskIdx) {
            const task = findActiveTask(taskId);
            if (!task || !task.subtasks[subtaskIdx]) return;
            if (!guardWritable()) { showTaskDetail(task); return; }
            task.subtasks[subtaskIdx].completed = !task.subtasks[subtaskIdx].completed;
            currentDetailTask = task; // Update reference
            showTaskDetail(task); // Refresh display
            renderKanban(); // Update card progress
            persistKanban();
        }

        function deleteSubtask(taskId, subtaskIdx) {
            const task = findActiveTask(taskId);
            if (!task || !guardWritable()) return;
            if (confirm(t('confirm.deleteSubtask'))) {
                task.subtasks.splice(subtaskIdx, 1);
                currentDetailTask = task;
                showTaskDetail(task);
                renderKanban();
                persistKanban();
            }
        }

        // The detail view writes subtask text too: the same read-back check as the task form (a NUL,
        // a line separator … would be saved "successfully" and make the board read-only on the next
        // load). → true (and an alert) when the change must not be made; nothing has been changed.
        function subtasksWriteRefused(task, subtasks) {
            const problems = taskWriteProblems({ ...task, subtasks }, config.columns);
            if (!problems.length) return false;
            alert(t('alert.cannotWriteTask', { details: problemSummary(problems) }));
            return true;
        }

        function addSubtask(taskId) {
            const input = document.getElementById('newSubtaskInput');
            const text = input.value.trim();
            if (!text) return;

            const task = findActiveTask(taskId);
            if (task && guardWritable()) {
                if (/\n/.test(text)) return;
                if (subtasksWriteRefused(task, task.subtasks.concat([{ completed: false, text }]))) return;
                task.subtasks.push({ completed: false, text });
                currentDetailTask = task;
                input.value = '';
                showTaskDetail(task);
                renderKanban();
                persistKanban();
            }
        }

        function editSubtask(taskId, subtaskIdx) {
            const task = findActiveTask(taskId);
            if (!task || !task.subtasks[subtaskIdx]) return;
            if (!guardWritable()) return;

            const newText = prompt(t('prompt.editSubtask'), task.subtasks[subtaskIdx].text);
            if (newText !== null && newText.trim()) {
                const text = newText.trim().replace(/\s*\n\s*/g, ' ');
                if (subtasksWriteRefused(task, task.subtasks.map((st, i) => (i === subtaskIdx ? { ...st, text } : st)))) return;
                task.subtasks[subtaskIdx].text = text;
                currentDetailTask = task;
                showTaskDetail(task);
                renderKanban();
                persistKanban();
            }
        }

        function worklogWriteRefused(task, worklog) {
            const problems = taskWriteProblems({ ...task, worklog }, config.columns);
            if (!problems.length) return false;
            alert(t('alert.cannotWriteTask', { details: problemSummary(problems) }));
            return true;
        }

        function updateWorklogTotal(task) {
            const total = document.getElementById('taskDetailWorklogTotal');
            const hours = Number((task.worklog || []).reduce((sum, log) => sum + (Number(log.hours) || 0), 0).toFixed(2));
            if (total) total.textContent = `${t('taskForm.worklogTotalLabel')}: ${hours}h`;
        }

        // Like the task form, keep edits in memory during a conflict so export and the leave
        // guard include them. Read-only files and running exclusive operations still refuse edits.
        function canEditDetail() {
            return (!!session?.conflict && !busyOperation && !session.blocked.kanban) || guardWritable();
        }

        function refreshDetailDraft() {
            updateWorklogTotal(detailDraft);
            refreshSyncUi();
        }

        // A blur commit may happen during an export-button click. Keep the banner stable
        // through mouseup; typing and the save result refresh its buttons separately.
        function commitDetailRefresh() {
            updateWorklogTotal(detailDraft || currentDetailTask);
            updateSyncIndicator();
        }

        function inputEstimate(taskId) {
            const task = findActiveTask(taskId);
            const input = document.getElementById('taskDetailEstimate');
            if (!task || wasArchiveModalActive || !input || !canEditDetail()) return;
            draftForDetail(task).estimate = input.value;
            refreshDetailDraft();
        }

        function setEstimate(taskId) {
            const task = findActiveTask(taskId);
            const input = document.getElementById('taskDetailEstimate');
            if (!task || wasArchiveModalActive || !input) return;
            const draft = draftForDetail(task);
            draft.estimate = input.value;
            const estimate = input.value.trim();
            if (!canEditDetail() || worklogWriteRefused({ ...task, estimate }, task.worklog || [])) {
                draft.estimate = input.value = task.estimate || '';
                refreshDetailDraft();
                return;
            }
            task.estimate = estimate;
            input.value = input.defaultValue = estimate;
            draftForDetail(task).estimate = estimate;
            commitDetailRefresh();
            renderKanban();
            persistKanban();
        }

        function addWorklog(taskId) {
            const task = findActiveTask(taskId);
            if (!task || wasArchiveModalActive || !guardWritable()) return;
            const worklog = draftForDetail(task).worklog.map(log => ({ ...log }))
                .concat([{ date: localDateString(), hours: 0, memo: '' }]);
            if (worklogWriteRefused(task, worklog)) return;
            task.worklog = worklog;
            resetDetailDraft(task);
            currentDetailTask = task;
            showTaskDetail(task);
            renderKanban();
            persistKanban();
        }

        function worklogInput(idx, field) {
            const type = { date: 'date', hours: 'number', memo: 'text' }[field];
            return document.querySelector(`#taskDetailWorklog li:nth-child(${idx + 1}) input[type="${type}"]`);
        }

        function worklogValue(field, value) {
            return field === 'hours' ? (String(value).trim() === '' ? NaN : Number(value)) : value;
        }

        function inputWorklog(taskId, idx, field, value) {
            const task = findActiveTask(taskId);
            if (!task || wasArchiveModalActive || !task.worklog?.[idx] || !['date', 'hours', 'memo'].includes(field) || !canEditDetail()) return;
            draftForDetail(task).worklog[idx][field] = worklogValue(field, value);
            refreshDetailDraft();
        }

        function updateWorklog(taskId, idx, field, value) {
            const task = findActiveTask(taskId);
            if (!task || wasArchiveModalActive || !task.worklog?.[idx] || !['date', 'hours', 'memo'].includes(field)) return;
            const input = worklogInput(idx, field);
            if (!input) return;
            const draft = draftForDetail(task);
            draft.worklog[idx][field] = worklogValue(field, value);
            // Validate only this field against committed values, never another pending input.
            const committedVal = field === 'memo'
                ? String(value).replace(/[\r\n\u0085\u2028\u2029]/g, ' ').trim()
                : worklogValue(field, value);
            const worklog = task.worklog.map((log, i) => i === idx
                ? { ...log, [field]: committedVal }
                : { ...log });
            if (!canEditDetail() || worklogWriteRefused(task, worklog)) {
                draft.worklog[idx][field] = task.worklog[idx][field];
                input.value = task.worklog[idx][field] ?? '';
                refreshDetailDraft();
                return;
            }
            task.worklog = worklog.map(log => ({ ...log }));
            input.value = field === 'memo' ? committedVal : value;
            input.defaultValue = input.value;
            draftForDetail(task).worklog[idx][field] = task.worklog[idx][field];
            commitDetailRefresh();
            renderKanban();
            persistKanban();
        }

        function deleteWorklog(taskId, idx) {
            const task = findActiveTask(taskId);
            if (!task || wasArchiveModalActive || !task.worklog?.[idx] || !guardWritable()) return;
            const worklog = draftForDetail(task).worklog.filter((_, i) => i !== idx).map(log => ({ ...log }));
            if (worklogWriteRefused(task, worklog)) return;
            task.worklog = worklog;
            resetDetailDraft(task);
            currentDetailTask = task;
            showTaskDetail(task);
            renderKanban();
            persistKanban();
        }

        // Handle task form submission (create or edit)
        document.getElementById('newTaskForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const s = session;
            if (!s) return;
            // During a CONFLICT the form is still accepted, but only into this page (nothing is
            // written): the typed change becomes part of the unsaved board, so "Download unsaved" /
            // "Copy" contain it and reload / switch / closing the tab ask before discarding it.
            // Everything else guardWritable() refuses (read-only file, running archive) stays refused.
            const inConflict = !!s.conflict && !busyOperation && !s.blocked.kanban;
            if (!inConflict && !guardWritable()) return;

            const v = readTaskForm();
            const droppedRule = formDropsTrailingRule(); // read before the form is closed
            if (!v.title) { alert(t('alert.titleRequired')); return; }
            // "|" separates the fields of a metadata line: "開発 | 運用" would be read back as "開発".
            for (const [label, value] of [['taskForm.categoryLabel', v.category], ['taskForm.assignedLabel', v.assignees.join(', ')]]) {
                if (value.includes('|')) { alert(t('alert.pipeNotAllowed', { field: t(label) })); return; }
            }
            const badLine = findStructuralLine(v.description, v.notes, v.subtasks.map(st => st.text));
            if (badLine) {
                alert(t('alert.forbiddenHeading', { line: badLine.trim() }));
                return;
            }

            let task = null, candidate, successMessage, newNumber = 0;
            if (isEditMode) {
                // The edited task OBJECT must still be on the board (no lookup by id: with duplicate
                // ids or an archived copy it could hit another task).
                task = (editingTask && tasks.includes(editingTask)) ? editingTask : null;
                if (!task) { showNotification(t('notif.staleList'), 'error'); return; }
                candidate = applyTaskForm(task, v);
                successMessage = t('notif.taskEdited', { id: task.id });
            } else {
                // New id: above the config counter AND every id already used in kanban.md or
                // archive.md (an AI may have added tasks without bumping the counter).
                if (!canCreateNewTask()) return;
                newNumber = nextNewTaskNumber();
                candidate = newTaskFromForm(v, formatTaskId(newNumber));
                successMessage = t('notif.taskCreated', { id: candidate.id });
            }
            const ruleNote = droppedRule ? ' ' + t('notif.trailingRuleDropped') : '';
            successMessage += ruleNote;
            // Last line of defence: the task must read back from Markdown exactly as entered (the
            // same check a load does). Otherwise the save would "succeed" and the next load would
            // open the whole board read-only. Nothing has been changed yet.
            const problems = taskWriteProblems(candidate, config.columns);
            if (problems.length) {
                alert(t('alert.cannotWriteTask', { details: problemSummary(problems) }));
                return;
            }

            if (task) {
                Object.assign(task, candidate);
                delete task.statusUnknown;
            } else {
                config.lastTaskId = newNumber;
                tasks.push(candidate);
            }
            closeTaskModal();
            renderKanban();
            if (inConflict) {
                await autoSave(); // refused while the conflict is open: marks the board unsaved
                showNotification(t('notif.conflictKeptInMemory') + ruleNote, 'error');
                renderSyncBanner();
                return;
            }
            await persistKanban(successMessage);
        });

        // Archive functions
