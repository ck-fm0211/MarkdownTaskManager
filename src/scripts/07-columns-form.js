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

        function addColumn() {
            if (!guardWritable()) return;
            const name = prompt(t('prompt.columnName'));
            if (!name || !name.trim() || /[|\r\n]/.test(name)) return;
            const id = prompt(t('prompt.columnId'));
            if (id === null) return;
            if (!validColumnId(id)) { alert(t('alert.invalidColumnId')); return; }
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
                const oldId = col.id;
                tasks.forEach(task => { if (task.status === oldId) task.status = v; });
                col.id = v;
            } else {
                if (!v || /[|\r\n]/.test(v)) { openColumnsModal(); return; }
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
        function openTaskModal(task = null, defaultColumnId = null) {
            if (!guardWritable()) return;
            isEditMode = !!task;
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

            // Populate priorities select. "None" is always available, and a priority value that is
            // not in the config (written by hand / an AI) is offered as-is, so opening and saving the
            // form never erases it.
            const priorityOptions = [`<option value="">${escapeHtml(t('taskForm.priorityNone'))}</option>`]
                .concat(config.priorities.map(priority =>
                    `<option value="${escapeHtml(clean(priority))}">${escapeHtml(displayPriority(priority))}</option>`));
            if (task && task.priority && !findPriorityLabel(config.priorities, task.priority)) {
                priorityOptions.push(`<option value="${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</option>`);
            }
            document.getElementById('taskPriority').innerHTML = priorityOptions.join('');

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
                const pLabel = findPriorityLabel(config.priorities, task.priority);
                document.getElementById('taskPriority').value = pLabel ? clean(pLabel) : (task.priority || '');
                document.getElementById('taskCategory').value = task.category || '';
                document.getElementById('taskAssignee').value = task.assignees.join(', ');
                document.getElementById('taskCreated').value = task.created || '';
                document.getElementById('taskStarted').value = task.started || '';
                document.getElementById('taskDue').value = task.due || '';
                document.getElementById('taskCompleted').value = task.completed || '';
                document.getElementById('taskTags').value = task.tags.join(' ');
                document.getElementById('taskDescription').value = task.description || '';
                document.getElementById('taskNotes').value = task.notes || '';
                formSubtasks = JSON.parse(JSON.stringify(task.subtasks || []));
            } else {
                form.reset();
                document.getElementById('taskEditId').value = '';
                if (defaultColumnId) {
                    document.getElementById('taskStatus').value = defaultColumnId;
                }
                formSubtasks = [];
            }

            renderFormSubtasks();
            modal.classList.add('active');
        }

        function closeTaskModal() {
            document.getElementById('newTaskModal').classList.remove('active');
            document.getElementById('newTaskForm').reset();
            formSubtasks = [];
            isEditMode = false;
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
        }

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
