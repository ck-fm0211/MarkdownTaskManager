        // ===== Project loading =====
        // openProject() is the ONLY way a folder becomes the current project (first open, switch,
        // restore at startup, reload). It creates a fresh session (14-sync.js): file handles,
        // baselines and pending state of the previous project are never reused.

        function showBoardViews(visible) {
            document.getElementById('welcomeScreen').style.display = visible ? 'none' : 'block';
            document.getElementById('kanbanView').style.display = visible ? 'block' : 'none';
            document.getElementById('filterBar').style.display = visible ? 'block' : 'none';
            ['newTaskBtn', 'archiveBtn', 'manageColsBtn', 'reloadBtn'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = visible ? 'inline-flex' : 'none';
            });
        }

        function closeAllModals() {
            ['taskModal', 'newTaskModal', 'columnsModal', 'archiveModal'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('active');
            });
            wasArchiveModalActive = false;
            currentDetailTask = null;
            isEditMode = false;
            formSubtasks = [];
        }

        // Ask before leaving a project that has unsaved edits; wait for in-flight writes first
        // (they belong to the current project and must finish against ITS files).
        async function confirmLeaveCurrent() {
            if (busyOperation) { showNotification(t('notif.busy'), 'error'); return false; }
            await waitForWrites();
            if (session && (isDirty() || session.conflict)) return confirm(t('confirm.leaveUnsaved'));
            return true;
        }

        // Read one file of the project for loading. → { exists, text, handle } or { error }.
        async function readForLoad(dir, name) {
            try {
                const handle = await dir.getFileHandle(name);
                const file = await handle.getFile();
                return { exists: true, text: await file.text(), handle };
            } catch (e) {
                if (e && e.name === 'NotFoundError') return { exists: false };
                return { error: e };
            }
        }

        function applyArchiveText(s, text) {
            const r = parseArchiveContent(text);
            archivedTasks = r.tasks;
            loadedArchiveV2 = r.formatV2;
            s.archivePreamble = r.preamble;
            s.blocked.archive = r.problems.length ? r.problems : null;
            return r;
        }

        function defaultArchivePreambleText() {
            return defaultArchivePreamble(t('markdown.archiveTitle'), t('markdown.archiveDesc'), t('markdown.archiveSection'));
        }

        async function openProject(dir, opts = {}) {
            if (!opts.skipLeaveCheck && !(await confirmLeaveCurrent())) return false;
            await waitForWrites();

            // New session first: from here on every older async continuation is stale.
            const s = newSession(dir);
            session = null;
            queuedKanbanSave = null;
            const live = () => s.gen === projectGen;
            closeAllModals();
            tasks = [];
            archivedTasks = [];
            directoryHandle = dir;

            const kanban = await readForLoad(dir, 'kanban.md');
            if (!live()) return false;
            if (kanban.error) {
                console.error('Error loading kanban.md:', kanban.error);
                showNotification(t('notif.loadError'), 'error');
                showBoardViews(false);
                updateSyncIndicator();
                renderSyncBanner();
                return false;
            }
            // A folder without kanban.md is only initialised after confirmation (e.g. the app
            // folder picked by mistake must not silently receive data files).
            if (!kanban.exists && !confirm(t('confirm.initFolder', { name: dir.name }))) {
                if (live()) { showBoardViews(false); updateSyncIndicator(); renderSyncBanner(); }
                return false;
            }
            const archive = await readForLoad(dir, 'archive.md');
            if (!live()) return false;

            // archive.md
            if (archive.error) {
                console.error('Error loading archive.md:', archive.error);
                s.files.archive.state = 'error';
                s.files.archive.error = archive.error;
                s.blocked.archive = [{ code: 'read-failed' }];
            } else if (archive.exists) {
                s.files.archive.handle = archive.handle;
                s.files.archive.baseline = archive.text;
                s.files.archive.eol = detectEol(archive.text);
                applyArchiveText(s, archive.text);
            }

            if (kanban.exists) {
                const slot = s.files.kanban;
                slot.handle = kanban.handle;
                slot.baseline = kanban.text;
                slot.eol = detectEol(kanban.text);
                const r = parseKanbanContent(kanban.text);
                config = r.config;
                tasks = r.tasks;
                loadedFormatV2 = r.formatV2;
                s.blocked.kanban = r.problems.length ? r.problems : null;
                s.warnings = r.warnings;
                console.log(`Loaded kanban.md: ${tasks.length} tasks, V2=${loadedFormatV2}, problems=${r.problems.length}`);
            } else {
                // New folder: create kanban.md (and archive.md if missing) — via the safe writer,
                // which refuses if someone created the file in the meantime.
                showNotification(t('notif.initializingFolder'), 'success');
                const r = parseKanbanContent(createDefaultKanbanContent());
                config = r.config;
                tasks = [];
                loadedFormatV2 = true;
            }

            session = s;
            const dups = findDuplicateIds(tasks, archivedTasks);
            if (dups.length) s.warnings.push({ code: 'duplicate-id', ids: dups });

            showBoardViews(true);
            updateAutocomplete();
            renderKanban();
            renderSyncBanner();
            if (s.warnings.length) {
                showNotification(s.warnings.map(w => w.code === 'duplicate-id'
                    ? t('integrity.duplicate-id', { ids: (w.ids || []).join(', ') })
                    : `${t('integrity.' + w.code)} ${(w.lines || []).join(', ')}`).join(' / '), 'error');
            }

            if (!kanban.exists) {
                const created = await enqueueWrite(async () => {
                    try {
                        await writeFileChecked(s, 'kanban', createDefaultKanbanContent());
                        if (s.files.archive.baseline === null && s.files.archive.state === 'ok') {
                            const pre = defaultArchivePreambleText();
                            s.archivePreamble = pre;
                            await writeFileChecked(s, 'archive', generateArchiveContent(pre, []));
                        }
                        return true;
                    } catch (e) {
                        handleSyncError(s, e);
                        return false;
                    }
                });
                if (created && live()) showNotification(t('notif.filesInitialized'), 'success');
                else if (live()) showNotification(t('notif.filesError'), 'error');
                return live();
            }

            await migrateLegacyFiles(s);
            return live();
        }

        // One-time V1 → V2 rewrites. Only when the parse was complete (no problems) and a backup
        // of the original could be written first.
        async function migrateLegacyFiles(s) {
            if (s !== session) return;
            if (!loadedFormatV2 && !s.blocked.kanban) {
                const original = s.files.kanban.baseline;
                if (await backupOriginal(s, 'kanban.md', original) && await autoSave()) {
                    console.log('Migrated kanban.md from V1 (sections) to V2 (status field)');
                } else {
                    console.warn('Skipped V1→V2 migration of kanban.md (backup or save failed). File left unchanged.');
                }
            }
            if (s !== session) return;
            if (!loadedArchiveV2 && archivedTasks.length > 0 && !s.blocked.archive && s.files.archive.baseline !== null) {
                const original = s.files.archive.baseline;
                if (await backupOriginal(s, 'archive.md', original)) {
                    await enqueueWrite(async () => {
                        try {
                            await writeFileChecked(s, 'archive', generateArchiveContent(s.archivePreamble, archivedTasks, s.files.archive.eol));
                            loadedArchiveV2 = true;
                        } catch (e) { handleSyncError(s, e); }
                    });
                }
            }
        }

        // Re-read archive.md (e.g. when the archive list is opened) so archive edits made by an AI
        // are visible. archive.md never holds unsaved in-memory changes (every archive operation
        // writes first and commits after), so taking the disk version loses nothing. A file that
        // existed and is now missing / unreadable is reported, never silently treated as empty.
        async function refreshArchiveFromDisk() {
            const s = session;
            if (!s) return;
            await enqueueWrite(async () => {
                if (s !== session) return;
                const slot = s.files.archive;
                let disk;
                try { disk = await readDisk(s, 'archive'); } catch (e) {
                    s.lastError = { which: 'archive', kind: 'read-failed' };
                    renderSyncBanner();
                    return;
                }
                if (!disk.exists) {
                    if (slot.baseline !== null) { s.conflict = s.conflict || { which: 'archive', kind: 'missing' }; renderSyncBanner(); }
                    return;
                }
                if (slot.state === 'error' || disk.text !== slot.baseline) {
                    slot.handle = disk.handle;
                    slot.baseline = disk.text;
                    slot.state = 'ok';
                    slot.error = null;
                    slot.eol = detectEol(disk.text);
                    applyArchiveText(s, disk.text);
                    if (s.lastError && s.lastError.which === 'archive') s.lastError = null;
                    updateAutocomplete();
                    renderSyncBanner();
                }
            });
        }

        // Kept for callers/tests that load the archive of the current project.
        async function loadArchive() {
            await refreshArchiveFromDisk();
        }

        // Create default kanban.md content
        function createDefaultKanbanContent() {
            return `# Kanban Board

<!-- Config: Last Task ID: 0 -->
<!-- Format: v2 -->

## ⚙️ Configuration

**Columns**: 📝 To Do (todo) | 🚀 In Progress (in-progress) | 👀 In Review (in-review) | ✅ Done (done)

**Categories**: Frontend, Backend, Design, DevOps, Tests, Documentation

**Users**: @user (User)

**Priorities**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

**Tags**: #bug #feature #ui #backend #urgent #refactor #docs #test

---

## Tasks
`;
        }

        // One-time backup of a file's original content before a V1→V2 migration. Returns true
        // when a usable backup exists (freshly written OR already present). Never overwrites.
        async function backupOriginal(s, name, content) {
            try {
                const backupName = name.replace(/\.md$/, '.v1-backup.md');
                try { await s.dir.getFileHandle(backupName); return true; } catch (e) {
                    if (!e || e.name !== 'NotFoundError') return false;
                }
                const fh = await s.dir.getFileHandle(backupName, { create: true });
                const w = await fh.createWritable();
                await w.write(content);
                await w.close();
                const back = await (await fh.getFile()).text();
                if (back !== content) return false;
                console.log('Backup written:', backupName);
                return true;
            } catch (e) {
                console.warn('Backup failed — migration aborted to keep the original intact:', e);
                return false;
            }
        }

        // Board serialization used by the save queue (pure generator lives in 04-format.js).
        function generateMarkdown() {
            return generateKanbanContent(config, tasks, session ? session.files.kanban.eol : '\n');
        }

        // Enhanced markdown to HTML converter for notes
        // Escape user-controlled text/attribute values before inserting into innerHTML (XSS hardening)
