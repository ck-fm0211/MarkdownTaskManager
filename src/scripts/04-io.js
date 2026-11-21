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
            editingTask = null;
            formSubtasks = [];
            taskFormSnapshot = null;
        }

        // Ask before leaving a project that has unsaved edits; wait for in-flight writes first
        // (they belong to the current project and must finish against ITS files).
        async function confirmLeaveCurrent() {
            if (busyOperation) { showNotification(t('notif.busy'), 'error'); return false; }
            await waitForWrites();
            if (session && (hasUnsavedWork() || session.conflict)) return confirm(t('confirm.leaveUnsaved'));
            return true;
        }

        // Read one file of the project for loading. → { exists, text, handle, notUtf8 } or { error }.
        // Strict UTF-8 (see decodeUtf8): a Shift_JIS / UTF-16 file is opened read-only instead of
        // being shown — and later saved — as replacement characters.
        async function readForLoad(dir, name) {
            try {
                const handle = await dir.getFileHandle(name);
                const file = await handle.getFile();
                const d = decodeUtf8(await file.arrayBuffer());
                return { exists: true, text: d.text, handle, notUtf8: !d.valid };
            } catch (e) {
                if (e && e.name === 'NotFoundError') return { exists: false };
                return { error: e };
            }
        }

        const NOT_UTF8 = (name) => ({ code: 'not-utf8', lines: [name] });
        // Problems of a file as loaded: a file that is not UTF-8 is reported as such (the NULs of a
        // UTF-16 file are part of that, not a separate 'nul-char' problem).
        const loadProblems = (name, notUtf8, problems) => notUtf8
            ? [NOT_UTF8(name)].concat(problems.filter(p => p.code !== 'nul-char'))
            : problems;

        // Load warnings (duplicate ids, unknown status, dates that are not YYYY-MM-DD …) as one text.
        function loadWarningsText(warnings) {
            return (warnings || []).map(w => w.code === 'duplicate-id'
                ? t('integrity.duplicate-id', { ids: (w.ids || []).join(', ') })
                : `${t('integrity.' + w.code)} ${(w.lines || []).join(', ')}`).join(' / ');
        }

        // The success message after a project was opened (folder picker, recent-projects list, startup
        // restore, 🔄 / reload from disk, the automatic reload when the page gets the focus back). It
        // must not replace the load warnings that openProject() has just shown: they are kept after
        // the message.
        function notifyProjectOpened(message) {
            const w = session && session.warnings && session.warnings.length ? loadWarningsText(session.warnings) : '';
            showNotification(w ? `${message} — ${w}` : message, w ? 'error' : 'success');
        }

        function applyArchiveText(s, text, notUtf8 = false) {
            const r = parseArchiveContent(text);
            archivedTasks = r.tasks;
            loadedArchiveV2 = r.formatV2;
            s.archivePreamble = r.preamble;
            s.files.archive.notUtf8 = !!notUtf8;
            const problems = loadProblems('archive.md', notUtf8, r.problems);
            s.blocked.archive = problems.length ? problems : null;
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
            // folder picked by mistake must not silently receive data files). An EMPTY kanban.md is
            // treated the same way (it may be a damaged file): never rewritten without asking.
            if (kanban.exists && !kanban.text.trim()) {
                if (!confirm(t('confirm.initEmptyKanban', { name: dir.name }))) {
                    if (live()) { showBoardViews(false); updateSyncIndicator(); renderSyncBanner(); }
                    return false;
                }
                kanban.exists = false; // initialise below; the safe writer accepts an empty file
            } else if (!kanban.exists && !confirm(t('confirm.initFolder', { name: dir.name }))) {
                if (live()) { showBoardViews(false); updateSyncIndicator(); renderSyncBanner(); }
                return false;
            }
            const archive = await readForLoad(dir, 'archive.md');
            if (!live()) return false;
            let archiveWarnings = [];

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
                const ar = applyArchiveText(s, archive.text, archive.notUtf8);
                // archive.md's own warnings (e.g. dates that are not YYYY-MM-DD) are shown with the
                // board's; duplicate ids are checked across both files below.
                archiveWarnings = ar.warnings.filter(w => w.code !== 'duplicate-id')
                    .map(w => ({ ...w, lines: (w.lines || []).map(l => `archive.md ${l}`) }));
            }

            if (kanban.exists) {
                const slot = s.files.kanban;
                slot.handle = kanban.handle;
                slot.baseline = kanban.text;
                slot.eol = detectEol(kanban.text);
                slot.notUtf8 = !!kanban.notUtf8;
                const r = parseKanbanContent(kanban.text);
                config = r.config;
                tasks = r.tasks;
                loadedFormatV2 = r.formatV2;
                const problems = loadProblems('kanban.md', kanban.notUtf8, r.problems);
                s.blocked.kanban = problems.length ? problems : null;
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
            s.warnings.push(...archiveWarnings);

            showBoardViews(true);
            updateAutocomplete();
            renderKanban();
            renderSyncBanner();
            if (s.warnings.length) showNotification(loadWarningsText(s.warnings), 'error');

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

        // One-time V1 → V2 rewrites. Only when the parse was complete (no problems), and only after
        // a verified backup of the original exists. Backup + rewrite run as ONE job in the write
        // queue, so the page shows "saving" until everything is on disk.
        function migrateLegacyFiles(s) {
            if (s !== session) return Promise.resolve();
            const doKanban = !loadedFormatV2 && !s.blocked.kanban;
            const doArchive = !loadedArchiveV2 && archivedTasks.length > 0 && !s.blocked.archive
                && s.files.archive.baseline !== null && s.files.archive.state === 'ok';
            if (!doKanban && !doArchive) return Promise.resolve();
            return enqueueWrite(async () => {
                if (s !== session) return;
                try {
                    if (doKanban) {
                        const original = s.files.kanban.baseline;
                        if (await backupOriginal(s, 'kanban.md', original)) {
                            const seq = s.editSeq;
                            await writeFileChecked(s, 'kanban', generateKanbanContent(config, tasks, s.files.kanban.eol));
                            if (s.editSeq === seq) s.savedSeq = seq;
                            loadedFormatV2 = true;
                            console.log('Migrated kanban.md from V1 (sections) to V2 (status field)');
                        } else {
                            console.warn('Skipped V1→V2 migration of kanban.md (backup failed). File left unchanged.');
                        }
                    }
                    if (doArchive && s === session) {
                        if (await backupOriginal(s, 'archive.md', s.files.archive.baseline)) {
                            await writeFileChecked(s, 'archive', generateArchiveContent(s.archivePreamble, archivedTasks, s.files.archive.eol));
                            loadedArchiveV2 = true;
                        }
                    }
                } catch (e) { handleSyncError(s, e); }
            });
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
                if (slot.state === 'error' || disk.text !== slot.baseline || !!disk.notUtf8 !== !!slot.notUtf8) {
                    slot.handle = disk.handle;
                    slot.baseline = disk.text;
                    slot.state = 'ok';
                    slot.error = null;
                    slot.eol = detectEol(disk.text);
                    applyArchiveText(s, disk.text, disk.notUtf8);
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

        // Backup of a file's original content before a V1→V2 migration (runs inside the write
        // queue). Writes "<name>.v1-backup.md"; if that name exists with DIFFERENT content, a
        // timestamped name is used instead (an old backup is never overwritten or trusted blindly).
        // Returns true only when a backup with exactly `content` exists and was read back.
        async function backupOriginal(s, name, content) {
            const base = name.replace(/\.md$/, '.v1-backup');
            for (const candidate of [`${base}.md`, `${base}-${timestampForFile()}.md`]) {
                try {
                    let fh = null;
                    try { fh = await s.dir.getFileHandle(candidate); } catch (e) {
                        if (!e || e.name !== 'NotFoundError') return false;
                    }
                    if (fh) {
                        if ((await (await fh.getFile()).text()) === content) return true; // same backup already there
                        continue; // different content → try the next (timestamped) name
                    }
                    fh = await s.dir.getFileHandle(candidate, { create: true });
                    const w = await fh.createWritable();
                    await w.write(content);
                    await w.close();
                    if ((await (await fh.getFile()).text()) !== content) return false;
                    console.log('Backup written:', candidate);
                    return true;
                } catch (e) {
                    console.warn('Backup failed — migration aborted to keep the original intact:', e);
                    return false;
                }
            }
            return false;
        }

        // Board serialization used by the save queue (pure generator lives in 04-format.js).
        function generateMarkdown() {
            return generateKanbanContent(config, tasks, session ? session.files.kanban.eol : '\n');
        }

        // Enhanced markdown to HTML converter for notes
        // Escape user-controlled text/attribute values before inserting into innerHTML (XSS hardening)
