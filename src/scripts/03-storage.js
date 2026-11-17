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

        async function saveDirectoryHandle(handle, customName = null) {
            try {
                const db = await openDB();
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);

                // Get existing projects
                const getRequest = store.get(PROJECTS_KEY);
                const projects = await new Promise((resolve, reject) => {
                    getRequest.onsuccess = () => resolve(getRequest.result || []);
                    getRequest.onerror = () => reject(getRequest.error);
                });

                // Get project name (directory name)
                const projectName = handle.name;

                // Check if project already exists. Identity = the same folder (isSameEntry), not just
                // the same folder NAME: two different folders called "data" must stay two projects.
                const existingIndex = await findProjectIndex(projects, handle);
                const isNewProject = existingIndex < 0;

                // Ask for custom name for new projects if not provided
                let finalCustomName = customName;
                if (isNewProject && !customName) {
                    finalCustomName = prompt(t('prompt.projectName', {name: projectName})) || '';
                }

                const projectData = {
                    handle: handle,
                    name: projectName,
                    customName: finalCustomName || (existingIndex >= 0 ? projects[existingIndex].customName : ''),
                    lastAccessed: Date.now()
                };

                if (existingIndex >= 0) {
                    // Update existing project (keep custom name if not changing)
                    projectData.customName = customName !== null ? customName : projects[existingIndex].customName;
                    projects[existingIndex] = projectData;
                } else {
                    // Add new project at the beginning
                    projects.unshift(projectData);
                }

                // Keep only MAX_RECENT_PROJECTS
                const recentProjects = projects.slice(0, MAX_RECENT_PROJECTS);

                // Save updated list
                store.put(recentProjects, PROJECTS_KEY);

                await new Promise((resolve, reject) => {
                    transaction.oncomplete = resolve;
                    transaction.onerror = () => reject(transaction.error);
                });

                console.log('Project saved to recent list:', projectData.customName || projectName);
                updateProjectSelector();
            } catch (error) {
                console.error('Failed to save directory handle:', error);
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

        // Switch to a different project. Unsaved edits → confirmation; running saves finish first
        // (against the OLD project's files); then a brand-new session is opened for the new folder.
        async function switchProject(projectIndex) {
            try {
                const projects = await loadRecentProjects();
                if (projectIndex < 0 || projectIndex >= projects.length) return;
                const project = projects[projectIndex];
                if (!(await confirmLeaveCurrent())) { await updateProjectSelector(); return; }
                if (!(await verifyPermission(project.handle))) {
                    showNotification(t('notif.permissionDenied'), 'error');
                    await updateProjectSelector();
                    return;
                }
                const ok = await openProject(project.handle, { skipLeaveCheck: true });
                if (ok) {
                    await saveDirectoryHandle(project.handle);
                    showNotification(t('notif.projectLoaded', {name: project.customName || project.name}), 'success');
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
                        await saveDirectoryHandle(directoryHandle, newName.trim());
                        showNotification(t('notif.projectRenamed'), 'success');
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
                        const db = await openDB();
                        const transaction = db.transaction(STORE_NAME, 'readwrite');
                        const store = transaction.objectStore(STORE_NAME);
                        store.put(updatedProjects, PROJECTS_KEY);

                        await new Promise((resolve, reject) => {
                            transaction.oncomplete = resolve;
                            transaction.onerror = () => reject(transaction.error);
                        });

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
            const savedHandle = await loadDirectoryHandle();
            console.log('Attempting to restore previous directory:', savedHandle ? savedHandle.name : 'none');

            if (savedHandle) {
                try {
                    // Verify we still have permission
                    console.log('Verifying permissions...');
                    if (await verifyPermission(savedHandle)) {
                        // Always a fresh read from disk: edits an AI made while the browser was
                        // closed are simply what gets loaded.
                        const ok = await openProject(savedHandle, { skipLeaveCheck: true });
                        await updateProjectSelector(); // Show project selector
                        if (ok) {
                            showNotification(t('notif.projectRestored'), 'success');
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

                const picked = await window.showDirectoryPicker({ ...options, mode: 'readwrite' });
                if (!(await confirmLeaveCurrent())) return;
                const ok = await openProject(picked, { skipLeaveCheck: true });
                if (ok) await saveDirectoryHandle(picked); // Save for next time

                // Update project selector now that kanban is visible
                await updateProjectSelector();

                if (ok) showNotification(t('notif.folderLoaded'), 'success');
            } catch (error) {
                if (error.name !== 'AbortError') {
                    showNotification(t('notif.folderError'), 'error');
                    console.error(error);
                }
            }
        });


