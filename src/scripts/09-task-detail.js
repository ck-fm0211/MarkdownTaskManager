        function showTaskDetail(task) {
            currentDetailTask = task;
            const actions = document.getElementById('taskModalActions');
            const modal = document.getElementById('taskModal');
            const modalBody = document.getElementById('modalBody');
            const archiveModal = document.getElementById('archiveModal');

            let actionsHtml = `<button class="btn btn-secondary" onclick="closeModal()">${t('taskDetail.close')}</button>`;

            // If coming from the archiveModal, hide: archive, edit, and delete buttons
            wasArchiveModalActive = archiveModal.classList.contains('active');
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
                                    <span ondblclick="editSubtask('${task.id}', ${idx})" style="flex: 1; ${st.completed ? 'text-decoration: line-through; color: var(--text-secondary);' : ''} cursor: pointer;" title="${t('tooltip.doubleClickEdit')}">${escapedText}</span>
                                    <button onclick="deleteSubtask('${task.id}', ${idx})" style="background: none; border: none; cursor: pointer; color: #e53e3e; font-size: 1.1rem; padding: 0.25rem;" title="${t('tooltip.delete')}" aria-label="${t('tooltip.delete')}">🗑️</button>
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
            document.getElementById('taskModal').classList.remove('active');
            if (wasArchiveModalActive) {
                document.getElementById('archiveModal').classList.add('active');
                wasArchiveModalActive = false; // Reset for next time
            }
        }

        function editCurrentTask() {
            if (currentDetailTask) {
                closeModal();
                openTaskModal(currentDetailTask);
            }
        }

        // Subtask management
        function toggleSubtask(taskId, subtaskIdx) {
            const task = tasks.find(t => t.id === taskId);
            if (!task || !task.subtasks[subtaskIdx]) return;
            if (!guardWritable()) { showTaskDetail(task); return; }
            task.subtasks[subtaskIdx].completed = !task.subtasks[subtaskIdx].completed;
            currentDetailTask = task; // Update reference
            showTaskDetail(task); // Refresh display
            renderKanban(); // Update card progress
            persistKanban();
        }

        function deleteSubtask(taskId, subtaskIdx) {
            const task = tasks.find(t => t.id === taskId);
            if (!task || !guardWritable()) return;
            if (confirm(t('confirm.deleteSubtask'))) {
                task.subtasks.splice(subtaskIdx, 1);
                currentDetailTask = task;
                showTaskDetail(task);
                renderKanban();
                persistKanban();
            }
        }

        function addSubtask(taskId) {
            const input = document.getElementById('newSubtaskInput');
            const text = input.value.trim();
            if (!text) return;

            const task = tasks.find(t => t.id === taskId);
            if (task && guardWritable()) {
                if (/\n/.test(text)) return;
                task.subtasks.push({ completed: false, text });
                currentDetailTask = task;
                input.value = '';
                showTaskDetail(task);
                renderKanban();
                persistKanban();
            }
        }

        function editSubtask(taskId, subtaskIdx) {
            const task = tasks.find(t => t.id === taskId);
            if (!task || !task.subtasks[subtaskIdx]) return;
            if (!guardWritable()) return;

            const newText = prompt(t('prompt.editSubtask'), task.subtasks[subtaskIdx].text);
            if (newText !== null && newText.trim()) {
                task.subtasks[subtaskIdx].text = newText.trim().replace(/\s*\n\s*/g, ' ');
                currentDetailTask = task;
                showTaskDetail(task);
                renderKanban();
                persistKanban();
            }
        }

        // Handle task form submission (create or edit)
        document.getElementById('newTaskForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!guardWritable()) return;

            // Get form values
            const title = document.getElementById('taskTitle').value.trim();
            const status = document.getElementById('taskStatus').value;
            const priority = document.getElementById('taskPriority').value;
            const category = document.getElementById('taskCategory').value.trim();
            const assignee = document.getElementById('taskAssignee').value.trim();
            const created = document.getElementById('taskCreated').value;
            const started = document.getElementById('taskStarted').value;
            const due = document.getElementById('taskDue').value;
            const completed = document.getElementById('taskCompleted').value;
            const tagsInput = document.getElementById('taskTags').value.trim();
            const description = document.getElementById('taskDescription').value.trim();
            const notes = document.getElementById('taskNotes').value.trim();

            // A line that looks like a task header or a top-level section would split the task (or
            // the file) on the next read. Refuse it instead of writing a file that reads back wrong.
            const badLine = [description, notes, ...formSubtasks.map(st => st.text)]
                .join('\n').split('\n').find(l => /^\s*#{2,3}\s+TASK-/i.test(l) || /^\s*##\s+Tasks\s*$/i.test(l));
            if (badLine) {
                alert(t('alert.forbiddenHeading', { line: badLine.trim() }));
                return;
            }

            // Parse tags and assignees. Tags: whitespace/comma separated, "#" added if missing.
            const tags = tagsInput ? tagsInput.split(/[\s,、]+/).filter(Boolean).map(t => t.startsWith('#') ? t : '#' + t).filter(t => t.length > 1) : [];
            const assignees = assignee ? assignee.split(/[,、]/).map(a => a.trim()).filter(Boolean) : [];

            let successMessage = '';
            if (isEditMode) {
                // Edit existing task
                const taskId = document.getElementById('taskEditId').value;
                const task = tasks.find(t => t.id === taskId);
                if (task) {
                    task.title = title;
                    task.status = status;
                    task.priority = priority;
                    task.category = category;
                    task.assignees = assignees;
                    task.tags = tags;
                    task.created = created;
                    task.started = started;
                    task.due = due;
                    task.completed = completed;
                    task.description = description;
                    task.subtasks = formSubtasks;
                    task.notes = notes;
                    delete task.statusUnknown;
                    successMessage = t('notif.taskEdited', {id: taskId});
                }
            } else {
                // Create new task. The id is above the config counter AND every id already used in
                // kanban.md or archive.md (an AI may have added tasks without bumping the counter).
                config.lastTaskId = nextTaskNumber(config.lastTaskId, tasks, archivedTasks);
                const newTaskId = formatTaskId(config.lastTaskId);
                tasks.push({
                    id: newTaskId,
                    title,
                    status,
                    priority,
                    category,
                    assignees,
                    tags,
                    created: created || localDateString(),
                    started: started || '',
                    due,
                    completed: completed || '',
                    description,
                    subtasks: formSubtasks,
                    notes,
                    extra: ''
                });
                successMessage = t('notif.taskCreated', {id: newTaskId});
            }

            closeTaskModal();
            renderKanban();
            await persistKanban(successMessage);
        });

        // Archive functions
