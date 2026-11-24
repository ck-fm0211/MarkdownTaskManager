        // A column = display name (free text, any language) + id (what **Status** stores). Renaming
        // the display name never touches tasks; changing an id moves the tasks of that column to
        // the new id so they do not disappear from the board.
        function openColumnsModal() {
            if (!guardWritable()) return;
            const modal = document.getElementById('columnsModal');
            const list = document.getElementById('columnsList');
            list.innerHTML = config.columns.map((col, idx) => `
                <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem; padding: 0.75rem; background: var(--bg); border: 2px solid var(--border, #cbd5e0); border-radius: 6px; align-items: center;">
                    <div style="display: flex; gap: 0.25rem;">
                        <button onclick="moveColumn(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;" title="${t('action.moveUp')}" aria-label="${t('action.moveUp')}">↑</button>
                        <button onclick="moveColumn(${idx}, 1)" ${idx === config.columns.length - 1 ? 'disabled' : ''} class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;" title="${t('action.moveDown')}" aria-label="${t('action.moveDown')}">↓</button>
                    </div>
                    <input type="text" value="${escapeHtml(col.name)}" onchange="updateColumn(${idx}, 'name', this.value)" aria-label="${escapeHtml(t('columns.nameLabel'))}" title="${escapeHtml(t('columns.nameLabel'))}" style="flex: 1; padding: 0.5rem; border: 1px solid var(--border, #cbd5e0); border-radius: 4px; background: var(--bg); color: var(--text);">
                    <input type="text" value="${escapeHtml(col.id)}" onchange="updateColumn(${idx}, 'id', this.value)" aria-label="${escapeHtml(t('columns.idLabel'))}" title="${escapeHtml(t('columns.idHelp'))}" style="width: 120px; padding: 0.5rem; border: 1px solid var(--border, #cbd5e0); border-radius: 4px; background: var(--bg); color: var(--text);" placeholder="${escapeHtml(t('columns.idLabel'))}">
                    <button onclick="deleteColumn(${idx})" class="btn btn-secondary" style="padding: 0.5rem;" title="${escapeHtml(t('tooltip.delete'))}" aria-label="${escapeHtml(t('tooltip.delete'))}">🗑️</button>
                </div>
            `).join('');
            modal.classList.add('active');
        }

        function closeColumnsModal() {
            document.getElementById('columnsModal').classList.remove('active');
        }

        function validColumnId(id, exceptIdx = -1) {
            const v = String(id || '').trim();
            if (!v || /[|()\r\n]/.test(v)) return false;
            return !config.columns.some((c, i) => i !== exceptIdx && c.id === v);
        }

        // The columns as they would be written must read back the same (no NUL, no line separator …):
        // checked before the configuration is changed. → true (and an alert) when refused.
        function columnsWriteRefused(columns) {
            const problems = configWriteProblems({ ...config, columns });
            if (!problems.length) return false;
            alert(t('alert.cannotWriteColumns', { details: problemSummary(problems) }));
            return true;
        }

        function addColumn() {
            if (!guardWritable()) return;
            const name = prompt(t('prompt.columnName'));
            if (!name || !name.trim() || /[|\r\n]/.test(name)) return;
            const id = prompt(t('prompt.columnId'));
            if (id === null) return;
            if (!validColumnId(id)) { alert(t('alert.invalidColumnId')); return; }
            if (columnsWriteRefused(config.columns.concat([{ name: name.trim(), id: id.trim() }]))) return;
            config.columns.push({ name: name.trim(), id: id.trim() });
            openColumnsModal();
            renderKanban();
            persistKanban();
        }

        function updateColumn(idx, field, value) {
            if (!guardWritable()) return;
            const col = config.columns[idx];
            if (!col) return;
            const v = String(value || '').trim();
            if (field === 'id') {
                if (!validColumnId(v, idx)) { alert(t('alert.invalidColumnId')); openColumnsModal(); return; }
                if (columnsWriteRefused(config.columns.map((c, i) => (i === idx ? { ...c, id: v } : c)))) { openColumnsModal(); return; }
                const oldId = col.id;
                tasks.forEach(task => { if (task.status === oldId) task.status = v; });
                col.id = v;
            } else {
                if (!v || /[|\r\n]/.test(v)) { openColumnsModal(); return; }
                if (columnsWriteRefused(config.columns.map((c, i) => (i === idx ? { ...c, name: v } : c)))) { openColumnsModal(); return; }
                col.name = v;
            }
            renderKanban();
            persistKanban();
        }

        function deleteColumn(idx) {
            if (!guardWritable()) return;
            const col = config.columns[idx];
            if (!col) return;
            const count = tasks.filter(task => task.status === col.id).length;
            if (config.columns.length <= 1) { alert(t('alert.lastColumn')); return; }
            if (count > 0) { alert(t('alert.columnNotEmpty', { count })); return; }
            if (confirm(t('confirm.deleteColumn'))) {
                config.columns.splice(idx, 1);
                openColumnsModal();
                renderKanban();
                persistKanban();
            }
        }

        function moveColumn(idx, direction) {
            if (!guardWritable()) return;
            const newIdx = idx + direction;
            if (newIdx < 0 || newIdx >= config.columns.length) return;
            [config.columns[idx], config.columns[newIdx]] = [config.columns[newIdx], config.columns[idx]];
            openColumnsModal();
            renderKanban();
            persistKanban();
        }

        // Task edit/create modal
        document.getElementById('newTaskForm').addEventListener('input', refreshSyncUi);

        function openTaskModal(task = null, defaultColumnId = null) {
            if (!guardWritable()) return;
            if (!task && !canCreateNewTask()) return;
            isEditMode = !!task;
            editingTask = task;
            const modal = document.getElementById('newTaskModal');
            const form = document.getElementById('newTaskForm');
            const title = modal.querySelector('h2');
            const submitBtn = document.getElementById('taskFormSubmitBtn');

            title.textContent = isEditMode ? t('taskForm.editTask') : t('taskForm.newTask');
            submitBtn.textContent = isEditMode ? t('taskForm.save') : t('taskForm.create');

            // Populate columns select
            document.getElementById('taskStatus').innerHTML = config.columns.map(col =>
                `<option value="${escapeHtml(col.id)}">${escapeHtml(col.name)}</option>`
            ).join('');

            // Populate priorities select (see renderPriorityOptions).
            const pLabel = task ? findPriorityLabel(config.priorities, task.priority) : null;
            renderPriorityOptions(task ? (pLabel ? clean(pLabel) : (task.priority || '')) : '');

            // Update autocomplete
            updateAutocomplete();

            if (isEditMode) {
                document.getElementById('taskEditId').value = task.id;
                document.getElementById('taskTitle').value = task.title;
                if (!config.columns.some(c => c.id === task.status)) {
                    // Unknown status: keep it selectable so saving the form does not change it silently.
                    document.getElementById('taskStatus').insertAdjacentHTML('beforeend',
                        `<option value="${escapeHtml(task.status)}">⚠️ ${escapeHtml(task.status)}</option>`);
                }
                document.getElementById('taskStatus').value = task.status;
                document.getElementById('taskCategory').value = task.category || '';
                document.getElementById('taskAssignee').value = task.assignees.join(', ');
                formKeptDates = {};
                const kept = [];
                TASK_FORM_DATES.forEach(([inputId, field, key]) => {
                    const input = document.getElementById(inputId);
                    input.value = task[field] || '';
                    // A date input shows only YYYY-MM-DD: "2026-1-5" / "20261231" would be shown
                    // empty and erased by "Save". Such a value is kept unless the user enters a date.
                    if (task[field] && input.value !== task[field]) {
                        formKeptDates[inputId] = task[field];
                        kept.push(`${key}: ${task[field]}`);
                    }
                });
                if (kept.length) showNotification(t('taskForm.keptDates', { dates: kept.join(', ') }), 'error');
                document.getElementById('taskTags').value = task.tags.join(' ');
                document.getElementById('taskDescription').value = task.description || '';
                document.getElementById('taskNotes').value = task.notes || '';
                formSubtasks = JSON.parse(JSON.stringify(task.subtasks || []));
            } else {
                form.reset();
                formKeptDates = {};
                document.getElementById('taskEditId').value = '';
                if (defaultColumnId) {
                    document.getElementById('taskStatus').value = defaultColumnId;
                }
                formSubtasks = [];
            }

            renderFormSubtasks();
            modal.classList.add('active');
            taskFormSnapshot = taskFormState();
        }

        // Priority <select> of the task form. "None" is always available, and a priority value that
        // is not in the config (written by hand / an AI) is offered as-is, so opening and saving the
        // form never erases it. Called again on a language switch: only the LABELS change, the
        // selected value (and a custom value) is kept — the form may be open with unsaved input.
        function renderPriorityOptions(value) {
            const sel = document.getElementById('taskPriority');
            if (!sel) return;
            const current = value === undefined ? sel.value : value;
            const priorities = (config && config.priorities && config.priorities.length) ? config.priorities : DEFAULT_PRIORITIES;
            const options = [`<option value="">${escapeHtml(t('taskForm.priorityNone'))}</option>`]
                .concat(priorities.map(priority =>
                    `<option value="${escapeHtml(clean(priority))}">${escapeHtml(displayPriority(priority))}</option>`));
            if (current && !priorities.some(p => clean(p) === current)) {
                options.push(`<option value="${escapeHtml(current)}">${escapeHtml(current)}</option>`);
            }
            sel.innerHTML = options.join('');
            sel.value = current || '';
        }

        // ----- Unsaved input in the task form -----
        // The form's values right after it was opened. A form whose values differ is "unsaved work":
        // reload / project switch / closing the tab ask first, and the conflict export includes it.
        const TASK_FORM_FIELDS = ['taskTitle', 'taskStatus', 'taskPriority', 'taskCategory', 'taskAssignee', 'taskCreated',
            'taskStarted', 'taskDue', 'taskCompleted', 'taskTags', 'taskDescription', 'taskNotes', 'formSubtaskInput'];
        let taskFormSnapshot = null;
        // Date inputs: [input id, task field, Markdown key]. formKeptDates = the task's values that
        // the date input could not show (not YYYY-MM-DD), kept until the user enters a date there.
        const TASK_FORM_DATES = [['taskCreated', 'created', 'Created'], ['taskStarted', 'started', 'Started'],
            ['taskDue', 'due', 'Due'], ['taskCompleted', 'completed', 'Finished']];
        let formKeptDates = {};
        TASK_FORM_DATES.forEach(([inputId]) => {
            const input = document.getElementById(inputId);
            if (input) input.addEventListener('input', () => { delete formKeptDates[inputId]; });
        });

        function taskFormState() {
            const v = {};
            TASK_FORM_FIELDS.forEach(id => { const el = document.getElementById(id); v[id] = el ? el.value : ''; });
            v.subtasks = formSubtasks;
            v.keptDates = formKeptDates;
            return JSON.stringify(v);
        }

        function isTaskFormOpen() {
            const m = document.getElementById('newTaskModal');
            return !!m && m.classList.contains('active');
        }

        function isFormDirty() {
            return isTaskFormOpen() && taskFormSnapshot !== null && taskFormState() !== taskFormSnapshot;
        }

        // Does the typed description / notes end with a "---" line (dropped on save, as on reading)?
        // A heading underline ("手順\n---") is such a line too: the save notification says so.
        function formDropsTrailingRule() {
            return ['taskDescription', 'taskNotes'].some(id => {
                const ls = String(document.getElementById(id).value).replace(/\r\n?/g, '\n').split('\n');
                while (ls.length && !ls[ls.length - 1].trim()) ls.pop();
                return ls.length > 0 && /^\s*-{3,}\s*$/.test(ls[ls.length - 1]);
            });
        }

        // Values typed in the form, as task fields (no validation).
        function readTaskForm() {
            const val = id => document.getElementById(id).value;
            // Only outer blank lines are removed: indentation of the first line and trailing double
            // spaces (Markdown line breaks) are content. A trailing "---" separator is dropped too,
            // exactly as reading does (trimTrailingSeparators): kept, it would not read back as
            // typed and the save was refused with a hard-to-understand reason.
            const trimBlankLines = (v) => {
                const ls = trimTrailingSeparators(String(v).replace(/\r\n?/g, '\n').split('\n'));
                while (ls.length && !ls[0].trim()) ls.shift();
                return ls.join('\n');
            };
            const tagsInput = val('taskTags').trim();
            const assignee = val('taskAssignee').trim();
            // Subtask text typed but not yet added with "+" is part of the input (as if "+" had been
            // pressed): "Save" adds it, the conflict export contains it (it was silently dropped).
            const pendingSubtask = val('formSubtaskInput').trim();
            return {
                title: val('taskTitle').trim(),
                status: val('taskStatus'),
                priority: val('taskPriority'),
                category: val('taskCategory').trim(),
                // Whitespace / comma separated; a leading "#" or full-width "＃" (Japanese IME) is
                // the tag marker, stored as one ASCII "#".
                tags: tagsInput ? tagsInput.split(/[\s,、，]+/).map(x => x.replace(/^[#＃]+/, '')).filter(Boolean).map(x => '#' + x) : [],
                assignees: assignee ? assignee.split(/[,、，]/).map(a => a.trim()).filter(Boolean) : [],
                created: val('taskCreated') || formKeptDates.taskCreated || '',
                started: val('taskStarted') || formKeptDates.taskStarted || '',
                due: val('taskDue') || formKeptDates.taskDue || '',
                completed: val('taskCompleted') || formKeptDates.taskCompleted || '',
                description: trimBlankLines(val('taskDescription')),
                notes: trimBlankLines(val('taskNotes')),
                subtasks: formSubtasks.map(st => ({ ...st }))
                    .concat(pendingSubtask ? [{ completed: false, text: pendingSubtask }] : [])
            };
        }

        // `base` with the form values applied (a new object; `base` is not changed).
        function applyTaskForm(base, v) {
            const task = { ...base, ...v, subtasks: v.subtasks.map(st => ({ ...st })) };
            delete task.statusUnknown;
            return task;
        }

        // Number of the next new task: above the config counter AND every id already used in
        // kanban.md or archive.md (an AI may have added tasks without bumping the counter).
        function nextNewTaskNumber() {
            const s = session;
            const rawMax = s ? Math.max(maxIdInText(s.files.kanban.baseline || ''), maxIdInText(s.files.archive.baseline || '')) : 0;
            return nextTaskNumber(Math.max(config.lastTaskId || 0, rawMax), tasks, archivedTasks);
        }

        function newTaskFromForm(v, id) {
            return applyTaskForm({ id, extra: '' }, { ...v, created: v.created || localDateString() });
        }

        // tasks[] plus detail / form drafts (only for exporting unsaved work; never regular saves).
        function boardWithOpenForm() {
            let board = tasks;
            if (isDetailDraftDirty()) {
                board = tasks.map(task => task === detailDraft.task
                    ? {
                        ...task, estimate: detailDraft.estimate,
                        // Empty hours stay invalid in the draft, but exports must read back.
                        worklog: detailDraft.worklog.map(log => ({ ...log, hours: Number.isFinite(log.hours) ? log.hours : 0 }))
                    }
                    : task);
            }
            if (!isFormDirty()) return board;
            const v = readTaskForm();
            if (isEditMode && editingTask) {
                const i = tasks.indexOf(editingTask);
                const edited = applyTaskForm(board[i] || editingTask, v);
                if (i < 0) return board.concat([edited]);
                const list = board.slice();
                list[i] = edited;
                return list;
            }
            return board.concat([newTaskFromForm(v, formatTaskId(nextNewTaskNumber()))]);
        }

        function closeTaskModal() {
            document.getElementById('newTaskModal').classList.remove('active');
            document.getElementById('newTaskForm').reset();
            formSubtasks = [];
            formKeptDates = {};
            isEditMode = false;
            editingTask = null;
            taskFormSnapshot = null;
            refreshSyncUi();
        }

        // × / Cancel: typed input is only thrown away after confirmation.
        function cancelTaskModal() {
            if (isFormDirty() && !confirm(t('confirm.discardForm'))) return;
            closeTaskModal();
        }

        // Form subtasks management
        function renderFormSubtasks() {
            const list = document.getElementById('formSubtasksList');
            list.innerHTML = formSubtasks.map((st, idx) => `
                <li style="padding: 0.5rem; margin-bottom: 0.25rem; background: var(--bg); border: 1px solid var(--border, #cbd5e0); border-radius: 4px; display: flex; align-items: center; gap: 0.5rem;">
                    <input type="checkbox" ${st.completed ? 'checked' : ''} onchange="toggleFormSubtask(${idx})" aria-label="${escapeHtml(st.text)}" style="width: 16px; height: 16px; cursor: pointer;">
                    <span style="flex: 1; ${st.completed ? 'text-decoration: line-through; color: #999;' : ''}">${st.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
                    <button type="button" onclick="deleteFormSubtask(${idx})" title="${escapeHtml(t('tooltip.delete'))}" aria-label="${escapeHtml(t('tooltip.delete'))}" style="background: none; border: none; cursor: pointer; color: #e53e3e; font-size: 1rem;">🗑️</button>
                </li>
            `).join('');
            refreshSyncUi();
        }

        // Enter in the subtask field adds the subtask (as in the task detail view). Without this, Enter
        // submitted the whole form: a new task was created / the form was saved and closed. Enter that
        // confirms an IME conversion (isComposing / keyCode 229) is left to the IME.
        document.getElementById('formSubtaskInput').addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            addFormSubtask();
        });

        function addFormSubtask() {
            const input = document.getElementById('formSubtaskInput');
            const text = input.value.trim();
            if (!text) return;
            formSubtasks.push({ completed: false, text });
            input.value = '';
            renderFormSubtasks();
        }

        function toggleFormSubtask(idx) {
            if (formSubtasks[idx]) {
                formSubtasks[idx].completed = !formSubtasks[idx].completed;
                renderFormSubtasks();
            }
        }

        function deleteFormSubtask(idx) {
            formSubtasks.splice(idx, 1);
            renderFormSubtasks();
        }

        // Render Kanban board
