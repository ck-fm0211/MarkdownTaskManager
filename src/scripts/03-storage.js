        async function openDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                };
            });
        }

        // Write the whole recent-projects list in its own readwrite transaction.
        async function putRecentProjects(list) {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            transaction.objectStore(STORE_NAME).put(list, PROJECTS_KEY);
            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error || new Error('transaction aborted'));
            });
        }

        // Add / update a project in the recent list (most recent first). Returns true on success.
        // All awaits that are not IndexedDB requests (isSameEntry, prompt) happen BEFORE the write
        // transaction is opened: an IndexedDB transaction auto-commits as soon as the code awaits
        // something else, and a later put() would fail with TransactionInactiveError.
        async function saveDirectoryHandle(handle, customName = null) {
            try {
                const projects = await loadRecentProjects();
                const projectName = handle.name;

                // Identity = the same folder (isSameEntry), not just the same folder NAME: two
                // different folders called "data" must stay two projects.
                const existingIndex = await findProjectIndex(projects, handle);
                const existing = existingIndex >= 0 ? projects[existingIndex] : null;

                // Ask for a custom name for new projects if not provided
                let finalCustomName = customName;
                if (!existing && customName === null) {
                    finalCustomName = prompt(t('prompt.projectName', {name: projectName})) || '';
                }

                const projectData = {
                    handle: handle,
                    name: projectName,
                    customName: finalCustomName !== null ? finalCustomName : (existing ? existing.customName : ''),
                    lastAccessed: Date.now()
                };
                const rest = projects.filter((p, i) => i !== existingIndex);
                await putRecentProjects([projectData, ...rest].slice(0, MAX_RECENT_PROJECTS));

                console.log('Project saved to recent list:', projectData.customName || projectName);
                await updateProjectSelector();
                return true;
            } catch (error) {
                console.error('Failed to save directory handle:', error);
                return false;
            }
        }

        async function loadRecentProjects() {
            try {
                const db = await openDB();
                const transaction = db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(PROJECTS_KEY);

                return new Promise((resolve, reject) => {
                    request.onsuccess = () => resolve(request.result || []);
                    request.onerror = () => reject(request.error);
                });
            } catch (error) {
                console.error('Failed to load recent projects:', error);
                return [];
            }
        }

        async function loadDirectoryHandle() {
            try {
                const projects = await loadRecentProjects();
                // Return the most recent project (first in list)
                return projects.length > 0 ? projects[0].handle : null;
            } catch (error) {
                console.error('Failed to load directory handle:', error);
                return null;
            }
        }

        async function findProjectIndex(projects, handle) {
            for (let i = 0; i < projects.length; i++) {
                const h = projects[i].handle;
                try {
                    if (h && typeof h.isSameEntry === 'function') {
                        if (await h.isSameEntry(handle)) return i;
                        continue;
                    }
                } catch (e) { /* fall back to the name */ }
                if (projects[i].name === handle.name) return i;
            }
            return -1;
        }

        function localeForDates() {
            return t('locale.dates') || 'en-US';
        }

        async function verifyPermission(handle) {
            const options = { mode: 'readwrite' };
            if ((await handle.queryPermission(options)) === 'granted') {
                return true;
            }
            if ((await handle.requestPermission(options)) === 'granted') {
                return true;
            }
            return false;
        }

        // Update project selector dropdown
        async function updateProjectSelector() {
            const projects = await loadRecentProjects();
            const selector = document.getElementById('projectSelector');
            const renameBtn = document.getElementById('renameProjectBtn');
            const deleteBtn = document.getElementById('deleteProjectBtn');

            if (projects.length > 0) {
                selector.style.display = 'block';

                // Only mark as selected if kanban is actually loaded
                const isKanbanLoaded = document.getElementById('kanbanView').style.display !== 'none' && !!session;
                const currentIdx = (isKanbanLoaded && directoryHandle) ? await findProjectIndex(projects, directoryHandle) : -1;

                // Show/hide rename and delete buttons
                if (isKanbanLoaded) {
                    renameBtn.style.display = 'inline-flex';
                    deleteBtn.style.display = 'inline-flex';
                } else {
                    renameBtn.style.display = 'none';
                    deleteBtn.style.display = 'none';
                }

                // Add empty option if no project is loaded
                let html = '';
                if (!isKanbanLoaded) {
                    html = `<option value="" selected>${t('projects.select')}</option>`;
                }

                html += projects.map((p, idx) => {
                    const selected = idx === currentIdx ? 'selected' : '';
                    const date = new Date(p.lastAccessed).toLocaleDateString(localeForDates());
                    const displayName = p.customName || p.name;
                    const details = p.customName ? ` (📁 ${p.name})` : '';
                    return `<option value="${idx}" ${selected}>${escapeHtml(displayName + details)} - ${escapeHtml(date)}</option>`;
                }).join('');

                selector.innerHTML = html;
            } else {
                selector.style.display = 'none';
                renameBtn.style.display = 'none';
                deleteBtn.style.display = 'none';
            }
        }

        // Every request to show another project (selector, folder picker, startup restore) gets a
        // number. A request that is overtaken by a newer one while it waits (permission prompt,
        // folder picker, IndexedDB) is dropped: it must never open its folder later and replace a
        // project that was opened — and maybe edited — in the meantime.
        let projectRequestSeq = 0;
        function newProjectRequest() {
            const n = ++projectRequestSeq;
            return () => n !== projectRequestSeq; // → true when overtaken
        }

        // Switch to a different project. Unsaved edits → confirmation; running saves finish first
        // (against the OLD project's files); then a brand-new session is opened for the new folder.
        // The confirmation is asked about the project that is open RIGHT BEFORE the switch (after
        // the permission prompt), not about the one that was open when the request started.
        async function switchProject(projectIndex) {
            const overtaken = newProjectRequest();
            try {
                const projects = await loadRecentProjects();
                if (overtaken()) return;
                if (projectIndex < 0 || projectIndex >= projects.length) return;
                const project = projects[projectIndex];
                const permitted = await verifyPermission(project.handle);
                if (overtaken()) return;
                if (!permitted) {
                    showNotification(t('notif.permissionDenied'), 'error');
                    await updateProjectSelector();
                    return;
                }
                const leave = await confirmLeaveCurrent();
                if (overtaken()) return;
                if (!leave) { await updateProjectSelector(); return; }
                const ok = await openProject(project.handle, { skipLeaveCheck: true });
                if (ok) {
                    if (!(await saveDirectoryHandle(project.handle))) console.warn('recent-projects list not updated');
                    notifyProjectOpened(t('notif.projectLoaded', {name: project.customName || project.name}));
                }
                await updateProjectSelector();
            } catch (error) {
                console.error('Error switching project:', error);
                showNotification(t('notif.projectError'), 'error');
            }
        }

        // Rename current project
        async function renameCurrentProject() {
            if (!directoryHandle) return;

            try {
                const projects = await loadRecentProjects();
                const currentIdx = await findProjectIndex(projects, directoryHandle);
                const currentProject = currentIdx >= 0 ? projects[currentIdx] : null;

                if (currentProject) {
                    const currentName = currentProject.customName || currentProject.name;
                    const newName = prompt(t('prompt.renameProject'), currentName);

                    if (newName !== null && newName.trim() !== currentName) {
                        if (await saveDirectoryHandle(directoryHandle, newName.trim())) {
                            showNotification(t('notif.projectRenamed'), 'success');
                        } else {
                            showNotification(t('notif.renameError'), 'error');
                        }
                    }
                }
            } catch (error) {
                console.error('Error renaming project:', error);
                showNotification(t('notif.renameError'), 'error');
            }
        }

        // Delete current project from recent list
        async function deleteCurrentProject() {
            if (!directoryHandle) return;

            try {
                const projects = await loadRecentProjects();
                const currentIdx = await findProjectIndex(projects, directoryHandle);
                const currentProject = currentIdx >= 0 ? projects[currentIdx] : null;

                if (currentProject) {
                    const displayName = currentProject.customName || currentProject.name;

                    if (!(await confirmLeaveCurrent())) return;
                    if (confirm(t('confirm.deleteProject', {name: displayName}))) {
                        // Remove from projects list
                        const updatedProjects = projects.filter(p => p !== currentProject);

                        // Save updated list to IndexedDB
                        await putRecentProjects(updatedProjects);

                        // Clear current project (new generation → late async work is ignored)
                        projectGen++;
                        session = null;
                        directoryHandle = null;
                        tasks = [];
                        archivedTasks = [];
                        closeAllModals();
                        showBoardViews(false);
                        renderSyncBanner();

                        await updateProjectSelector();
                        showNotification(t('notif.projectDeleted'), 'success');
                    }
                }
            } catch (error) {
                console.error('Error deleting project:', error);
                showNotification(t('notif.renameError'), 'error');
            }
        }

        // Try to restore previous directory on page load
        async function tryRestorePreviousDirectory() {
            // The request number is taken BEFORE the first await: a folder the user starts to choose
            // while the recent-projects list is still loading is a newer request and wins (taken
            // after the list, the startup restore would overtake the user's choice and drop it).
            const overtaken = newProjectRequest();
            const savedHandle = await loadDirectoryHandle();
            if (overtaken() || session) { await updateProjectSelector(); return !!session; }
            console.log('Attempting to restore previous directory:', savedHandle ? savedHandle.name : 'none');

            if (savedHandle) {
                try {
                    // Verify we still have permission
                    console.log('Verifying permissions...');
                    const permitted = await verifyPermission(savedHandle);
                    // A folder chosen by the user while the startup permission check was pending wins.
                    if (overtaken() || session) { await updateProjectSelector(); return !!session; }
                    if (permitted) {
                        // Always a fresh read from disk: edits an AI made while the browser was
                        // closed are simply what gets loaded.
                        const ok = await openProject(savedHandle, { skipLeaveCheck: true });
                        await updateProjectSelector(); // Show project selector
                        if (ok) {
                            notifyProjectOpened(t('notif.projectRestored'));
                            return true;
                        }
                    } else {
                        console.log('Permission denied or cancelled');
                    }
                } catch (error) {
                    console.error('Could not restore previous directory:', error);
                }
            }
            // Even if no project is loaded, update selector to show recent projects
            await updateProjectSelector();
            return false;
        }

        // Initialize on page load
        window.addEventListener('DOMContentLoaded', async () => {
            await tryRestorePreviousDirectory();

            // Add event listener for project selector
            document.getElementById('projectSelector').addEventListener('change', async (e) => {
                const projectIndex = parseInt(e.target.value);
                if (!isNaN(projectIndex)) {
                    await switchProject(projectIndex);
                }
            });
        });

        // Select folder
        document.getElementById('selectFolderBtn').addEventListener('click', async () => {
            try {
                // Start in last used directory if available
                const options = {};
                if (directoryHandle) {
                    options.startIn = directoryHandle;
                }

                const overtaken = newProjectRequest();
                const picked = await window.showDirectoryPicker({ ...options, mode: 'readwrite' });
                if (overtaken()) return;
                const leave = await confirmLeaveCurrent();
                if (overtaken() || !leave) return;
                const ok = await openProject(picked, { skipLeaveCheck: true });
                if (ok && !(await saveDirectoryHandle(picked))) showNotification(t('notif.historyError'), 'error'); // Save for next time

                // Update project selector now that kanban is visible
                await updateProjectSelector();

                if (ok) notifyProjectOpened(t('notif.folderLoaded'));
            } catch (error) {
                if (error.name !== 'AbortError') {
                    showNotification(t('notif.folderError'), 'error');
                    console.error(error);
                }
            }
        });


