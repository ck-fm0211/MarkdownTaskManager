        // ===== Markdown format: pure functions (no DOM, no globals) =====
        // Everything that turns kanban.md / archive.md text into data and back lives here, so it
        // can be unit-tested in Node (tests/unit) and reused by the CLI (scripts/tasks.mjs).
        // RULE: Markdown keys (**Status**, **Priority**, "## Tasks", ...) are a data format and are
        // never translated. Only the UI is localised.

        const DEFAULT_COLUMNS = [
            { name: '📝 To Do', id: 'todo' },
            { name: '🚀 In Progress', id: 'in-progress' },
            { name: '👀 In Review', id: 'in-review' },
            { name: '✅ Done', id: 'done' }
        ];
        const DEFAULT_CATEGORIES = ['Frontend', 'Backend', 'Design', 'DevOps', 'Tests', 'Documentation'];
        const DEFAULT_USERS = ['@user (User)'];
        const DEFAULT_PRIORITIES = ['🔴 Critical', '🟠 High', '🟡 Medium', '🟢 Low'];
        const DEFAULT_TAGS = ['bug', 'feature', 'ui', 'backend', 'urgent', 'refactor', 'docs', 'test'];

        // Strict task header. Only this starts a task block.
        const TASK_HEADER_RE = /^###\s+TASK-(\d+)\s*\|\s*(.+?)\s*$/;
        // Anything that LOOKS like a task header (used to detect malformed headers).
        const LOOSE_TASK_HEADER_RE = /^###\s+TASK-/;
        const META_KEYS = ['Status', 'Priority', 'Category', 'Assigned', 'Created', 'Started', 'Due', 'Finished', 'Tags'];
        // ":" may also be typed as a full-width "：" (Japanese IME); both are accepted.
        const META_LINE_RE = /^\s*\*\*(Status|Priority|Category|Assigned|Created|Started|Due|Finished|Tags)\*\*\s*[:：]/;
        const META_SEG_RE = /^\s*\*\*([A-Za-z]+)\*\*\s*[:：]\s*(.*?)\s*$/;
        const SECTION_STOP_RE = /^\s*\*\*(Subtasks|Notes|Links|Review|Dependencies)\*\*/i;
        const NOTES_RE = /^\s*\*\*Notes\*\*\s*[:：]/i;
        // Tags: "#" (or full-width "＃") followed by anything except whitespace, "#", "," and "、".
        // Unicode-safe (Japanese tags). Stored with an ASCII "#".
        const TAG_RE = /[#＃][^\s#＃,、，]+/g;
        const normTag = t => '#' + t.slice(1);
        const CHECKBOX_RE = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/;

        // LF line endings, no UTF-8 BOM (a BOM would hide the "# Title" of the first line).
        function normalizeEol(content) {
            return String(content ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
        }

        // Drop trailing blank lines and "---" separators (old files put one between tasks).
        function trimTrailingSeparators(lines) {
            const all = lines.slice();
            for (;;) {
                while (all.length && !all[all.length - 1].trim()) all.pop();
                if (all.length && /^\s*-{3,}\s*$/.test(all[all.length - 1])) { all.pop(); continue; }
                return all;
            }
        }

        function detectEol(content) {
            return /\r\n/.test(content || '') ? '\r\n' : '\n';
        }

        // Slugify a column name/heading to an id (lowercase, drop emoji/punctuation, dash spaces).
        // MUST stay identical to the id derivation used when a column has no explicit (id).
        // NOTE: \w (no /u flag) strips accents and CJK — "完了" → "" — so a column without an
        // explicit (id) whose name is only Japanese gets a positional id ("col1"...). Generated
        // files always carry explicit ids, so this only matters for hand-written legacy files.
        function legacySlug(s) {
            return s.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
        }

        // Strip leading emoji / symbols / spaces from a label: "🔴 Critical" → "Critical",
        // "🔴 緊急" → "緊急", "緊急" → "緊急". Unicode-aware (letters/numbers of any script are kept).
        function clean(text) {
            return String(text ?? '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
        }

        // Pre-fork behaviour of clean() (removes the first run of non-[A-Za-z0-9_ ] chars anywhere).
        // Kept ONLY to match priorities that were saved by older versions.
        function legacyClean(text) {
            return String(text ?? '').replace(/[^\w\s]+/, '').trim();
        }

        // Leading emoji/symbol of a label ("🔴 Critical" → "🔴"), '' if it starts with a letter.
        function getFirstEmoji(text) {
            const m = String(text ?? '').match(/^[^\p{L}\p{N}\s]+/u);
            return m ? ([...m[0]][0] || '') : '';
        }

        // Find the configured priority label for a task's stored priority value.
        function findPriorityLabel(priorities, value) {
            if (!value) return null;
            return (priorities || []).find(p => clean(p) === value || p === value || legacyClean(p) === value) || null;
        }

        // Resolve a **Status** value to a column id: exact id, then case-insensitive id, then the
        // column's display name (with or without its emoji). Returns null when nothing matches.
        function resolveStatus(raw, columns) {
            const s = String(raw ?? '').trim();
            if (!s) return null;
            const cols = columns || [];
            if (cols.some(c => c.id === s)) return s;
            const lower = s.toLowerCase();
            const byId = cols.find(c => c.id.toLowerCase() === lower);
            if (byId) return byId.id;
            const byName = cols.find(c => c.name === s) || (clean(s) && cols.find(c => clean(c.name) === clean(s)));
            return byName ? byName.id : null;
        }

        // Today as YYYY-MM-DD in LOCAL time (toISOString() is UTC: in Japan it is "yesterday"
        // until 9:00).
        function localDateString(d = new Date()) {
            const p = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
        }

        function taskNumber(id) {
            const m = /^TASK-(\d+)$/i.exec(String(id ?? '').trim());
            return m ? parseInt(m[1], 10) : NaN;
        }

        function formatTaskId(n) {
            return 'TASK-' + String(n).padStart(3, '0');
        }

        // Next free id number: above the config counter AND above every id seen in the active
        // board and the archive (an AI may add tasks without bumping the counter).
        function nextTaskNumber(lastTaskId, ...lists) {
            let max = Number.isFinite(+lastTaskId) ? +lastTaskId : 0;
            lists.forEach(list => (list || []).forEach(t => {
                const n = taskNumber(t.id);
                if (Number.isFinite(n) && n > max) max = n;
            }));
            return max + 1;
        }

        // Highest "### TASK-<n>" number written in a file, even in blocks that could not be
        // parsed (malformed header, unknown section): such ids must not be handed out again.
        function maxIdInText(text) {
            let max = 0;
            for (const m of normalizeEol(text).matchAll(/^###\s+TASK-(\d+)/gm)) max = Math.max(max, parseInt(m[1], 10));
            return max;
        }

        // Ids that appear more than once (within or across the given lists).
        function findDuplicateIds(...lists) {
            const seen = new Map();
            lists.forEach(list => (list || []).forEach(t => seen.set(t.id, (seen.get(t.id) || 0) + 1)));
            return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
        }

        // ----- Search -----
        // NFKC folds full-width input (ＴＡＳＫ－０４２ → TASK-042, half-width kana → full-width) and
        // lower-cases, which is what a Japanese user expects from a search box.
        function normalizeForSearch(s) {
            return String(s ?? '').normalize('NFKC').toLowerCase();
        }

        // Does the term refer to this task's id? "TASK-042", "task-042", "ＴＡＳＫ－０４２",
        // "TASK-42", "#42" and "042" all find TASK-042. A plain substring of the id also matches.
        function matchesTaskId(task, term) {
            if (!task || !task.id) return false;
            const q = normalizeForSearch(term).trim();
            if (!q) return false;
            const id = normalizeForSearch(task.id);
            if (id.includes(q)) return true;
            const qNum = /^(?:#|task\s*-?\s*)?0*(\d+)$/.exec(q);
            const idNum = /^task-0*(\d+)$/.exec(id);
            return !!(qNum && idNum && qNum[1] === idNum[1]);
        }

        // Full-text search used by the board AND the archive: id, title, description, notes, tags,
        // category, assignees and subtasks. Case-insensitive, width-insensitive.
        function taskMatchesSearch(task, term) {
            const q = normalizeForSearch(term).trim();
            if (!q) return true;
            if (matchesTaskId(task, term)) return true;
            const fields = [
                task.title, task.description, task.notes, task.category,
                ...(task.tags || []), ...(task.assignees || []),
                ...(task.subtasks || []).map(s => s.text)
            ];
            return fields.some(f => f && normalizeForSearch(f).includes(q));
        }

        // ----- Parsing -----

        // Parse one task block. `content` = everything after the "### TASK-xxx | title" line.
        // opts.columns: columns used to resolve **Status**; opts.statusMode:
        //   'column' → **Status** resolved against columns (unknown values are KEPT raw and flagged)
        //   'raw'    → **Status** kept as written (archive: remembers the original column)
        //   'ignore' → status = fallback (legacy section-based files)
        function parseTask(id, title, content, fallbackStatus, opts = {}) {
            const columns = opts.columns || [];
            const statusMode = opts.statusMode || 'column';
            const lines = normalizeEol(content).split('\n');

            // "Head" = lines before the first section (Subtasks/Notes/Links/Review/Dependencies).
            // Metadata is only read from the head, so a "**Created**:" inside notes is not mistaken
            // for the task's own field.
            let headEnd = lines.findIndex(l => SECTION_STOP_RE.test(l));
            if (headEnd < 0) headEnd = lines.length;
            const head = lines.slice(0, headEnd);

            const task = {
                id,
                title: title.trim(),
                status: fallbackStatus,
                priority: '',
                category: '',
                assignees: [],
                tags: [],
                created: '',
                started: '',
                due: '',
                completed: '',
                description: '',
                subtasks: [],
                notes: '',
                extra: '' // verbatim passthrough for **Links** / **Review** / **Dependencies**
            };

            // Metadata: every "**Key**: value" segment of the head's metadata lines, split on "|".
            // Order-independent and each field optional — a task with no **Category** keeps its
            // **Priority** (upstream issue #19), and so does a Japanese priority value.
            // An empty value ("**Category**:") is the same as an absent field.
            const seen = {};
            head.forEach(line => {
                if (!META_LINE_RE.test(line)) return;
                const segs = /^\s*\*\*Tags\*\*\s*[:：]/.test(line) ? [line] : line.split('|');
                segs.forEach(seg => {
                    const m = seg.match(META_SEG_RE);
                    if (!m || !META_KEYS.includes(m[1]) || seen[m[1]] || !m[2]) return;
                    seen[m[1]] = true;
                    const v = m[2];
                    switch (m[1]) {
                        case 'Status': {
                            if (statusMode === 'raw') { if (v) task.status = v; }
                            else if (statusMode === 'column' && v) {
                                const resolved = resolveStatus(v, columns);
                                task.status = resolved || v;
                                if (!resolved) task.statusUnknown = true;
                            }
                            break;
                        }
                        case 'Priority': task.priority = clean(v) || v; break;
                        case 'Category': task.category = v; break;
                        case 'Assigned': task.assignees = v.split(',').map(a => a.trim()).filter(Boolean); break;
                        case 'Created': task.created = (v.match(/^[\d-]+/) || [''])[0]; break;
                        case 'Started': task.started = (v.match(/^[\d-]+/) || [''])[0]; break;
                        case 'Due': task.due = (v.match(/^[\d-]+/) || [''])[0]; break;
                        case 'Finished': task.completed = (v.match(/^[\d-]+/) || [''])[0]; break;
                        case 'Tags': task.tags = (v.match(TAG_RE) || []).map(normTag); break;
                    }
                });
            });

            // Description: the non-metadata lines of the head, kept verbatim (blank lines,
            // indentation and trailing double spaces = Markdown line breaks are preserved; only
            // outer blank lines and a trailing "---" separator are dropped).
            const desc = trimTrailingSeparators(head.filter(l => !META_LINE_RE.test(l)));
            while (desc.length && !desc[0].trim()) desc.shift();
            task.description = desc.join('\n');

            // Everything after **Notes**: belongs to the notes, so the other sections are only
            // looked for BEFORE it (a "**Subtasks**:" written after the notes stays in the notes
            // instead of being read twice and multiplied on every save).
            let notesIdx = lines.findIndex(l => NOTES_RE.test(l));
            const beforeNotes = notesIdx >= 0 ? lines.slice(0, notesIdx) : lines;

            // Subtasks: only inside the **Subtasks** section (until the next "**Field**:").
            // Indentation (nested checkboxes) is kept.
            let inSubtasks = false;
            for (const line of beforeNotes) {
                if (/^\s*\*\*Subtasks\*\*/i.test(line)) { inSubtasks = true; continue; }
                if (inSubtasks && /^\s*\*\*[^*\n]+\*\*\s*[:：]/.test(line)) inSubtasks = false;
                if (inSubtasks) {
                    const m = line.match(CHECKBOX_RE);
                    if (m) {
                        const st = { completed: m[2] !== ' ', text: m[3] };
                        if (m[1]) st.indent = m[1];
                        task.subtasks.push(st);
                    }
                }
            }

            // Notes: everything after **Notes**: to the end of the block (text on the same line
            // as "**Notes**:" is kept too).
            if (notesIdx >= 0) {
                const inline = lines[notesIdx].replace(/^\s*\*\*Notes\*\*\s*[:：]\s*/i, '');
                const rest = lines.slice(notesIdx + 1);
                const all = trimTrailingSeparators((inline ? [inline] : []).concat(rest));
                while (all.length && !all[0].trim()) all.shift();
                task.notes = all.join('\n');
            }

            // Unsupported sections preserved verbatim: **Links** / **Review** / **Dependencies**.
            const extraStart = /^\s*\*\*(Links|Review|Dependencies)\*\*\s*:/i;
            const extraStop = /^\s*\*\*(Status|Priority|Category|Assigned|Created|Started|Due|Finished|Tags|Subtasks)\*\*/i;
            const extraLines = [];
            let capturing = false;
            for (const line of beforeNotes) {
                if (extraStart.test(line)) { capturing = true; extraLines.push(line); continue; }
                if (capturing && extraStop.test(line)) capturing = false;
                if (capturing) extraLines.push(line);
            }
            task.extra = trimTrailingSeparators(extraLines).join('\n').trim();

            return task;
        }

        // Parse "### TASK-NNN | Title" blocks from a chunk of markdown. If `report` is given,
        // every block is checked for content that the generator would NOT write back
        // (see findLostLines) and problems are pushed into it.
        function parseTaskBlocks(sectionContent, statusId, opts = {}, report = null) {
            const text = normalizeEol(sectionContent);
            const found = [];
            const re = /^###\s+TASK-(\d+)\s*\|\s*(.+?)\s*$/gm;
            const headers = [...text.matchAll(re)];
            headers.forEach((h, i) => {
                const titlePart = h[2].trim();
                if (!titlePart) return;
                const start = h.index + h[0].length;
                const end = i + 1 < headers.length ? headers[i + 1].index : text.length;
                const body = text.slice(start, end);
                const id = formatTaskId(h[1]);
                const task = parseTask(id, titlePart, body, statusId, opts);
                found.push(task);
                if (report) {
                    const lost = findLostLines(body, task, opts);
                    if (lost.length) report.push({ code: 'lossy-task', id, lines: lost });
                    // Saving must be a fixed point: what we write must read back as the same task
                    // (otherwise every save would change the file again, e.g. multiply subtasks).
                    const gen = serializeTask(task);
                    const again = parseTask(id, titlePart, gen.slice(gen.indexOf('\n') + 1), statusId, opts);
                    if (serializeTask(again) !== gen) report.push({ code: 'unstable-task', id, lines: [] });
                }
            });
            return found;
        }

        // Extract the "## <sectionName>" section (legacy V1 files), then parse its task blocks.
        function parseTasksFromSection(content, sectionName, statusId, opts = {}, report = null) {
            const sections = normalizeEol(content).split(/\n##\s+/);
            for (const section of sections) {
                if (section.startsWith(sectionName)) {
                    return parseTaskBlocks(section.substring(sectionName.length).trim(), statusId, opts, report);
                }
            }
            for (const section of sections) {
                const nl = section.indexOf('\n');
                const title = (nl >= 0 ? section.slice(0, nl) : section).trim();
                if (legacySlug(title) === statusId) {
                    return parseTaskBlocks(nl >= 0 ? section.slice(nl).trim() : '', statusId, opts, report);
                }
            }
            return [];
        }

        // ----- Loss detection -----
        // Turn a block body into comparable tokens. Formatting differences the generator is allowed
        // to make (field order, "|" layout, blank lines, "---" separators, [X] vs [x], emoji before a
        // priority, a known status written as a column name) are normalised away; anything else must
        // survive a parse → generate cycle, otherwise the block is reported as lossy.
        function blockTokens(body, opts = {}) {
            const tokens = [];
            normalizeEol(body).split('\n').forEach(raw => {
                const line = raw.trim();
                if (!line || /^-{3,}$/.test(line)) return;
                if (/^\*\*Tags\*\*\s*[:：]/.test(line)) {
                    const v = line.replace(/^\*\*Tags\*\*\s*[:：]\s*/, '');
                    (v.match(TAG_RE) || []).forEach(tg => tokens.push('tag:' + normTag(tg)));
                    const rest = v.replace(TAG_RE, '').replace(/[\s,、，]+/g, '');
                    if (rest) tokens.push('tagsrest:' + rest);
                    return;
                }
                if (META_LINE_RE.test(line)) {
                    line.split('|').forEach(seg => {
                        const m = seg.match(META_SEG_RE);
                        if (!m) { if (seg.trim()) tokens.push('seg:' + seg.trim()); return; }
                        let [, k, v] = m;
                        if (!v) return; // empty field == absent field
                        if (k === 'Priority') v = clean(v) || v;
                        if (k === 'Status' && (opts.statusMode || 'column') === 'column') v = resolveStatus(v, opts.columns) || v;
                        if (k === 'Status' && opts.statusMode === 'ignore') return; // legacy: status = section
                        if (k === 'Assigned') { v.split(',').map(a => a.trim()).filter(Boolean).forEach(a => tokens.push('assigned:' + a)); return; }
                        tokens.push(k.toLowerCase() + ':' + v);
                    });
                    return;
                }
                const cb = raw.match(CHECKBOX_RE);
                if (cb) { tokens.push('cb:' + cb[1] + (cb[2] === ' ' ? ' ' : 'x') + ':' + cb[3].trim()); return; }
                let t = line;
                // Bare section headers carry no data of their own (an empty "**Notes**:" or
                // "**Subtasks**:" is legitimately not written back).
                if (/^\*\*(Subtasks|Notes)\*\*\s*[:：]?$/i.test(t)) return;
                if (NOTES_RE.test(t)) t = t.replace(/^\*\*Notes\*\*\s*[:：]\s*/i, '');
                tokens.push('line:' + t.replace(/\s+/g, ' '));
            });
            return tokens;
        }

        // Lines of the original block that would be missing after serializeTask(task).
        function findLostLines(body, task, opts = {}) {
            const gen = serializeTask(task);
            const genBody = gen.slice(gen.indexOf('\n') + 1);
            const pool = new Map();
            blockTokens(genBody, opts).forEach(t => pool.set(t, (pool.get(t) || 0) + 1));
            const lost = [];
            blockTokens(body, opts).forEach(t => {
                const n = pool.get(t) || 0;
                if (n > 0) pool.set(t, n - 1);
                else lost.push(t.replace(/^[a-z]+:/, ''));
            });
            return lost;
        }

        // Header (title / comments / configuration) as comparable tokens. The original header and
        // the header the generator would write are tokenised the same way; anything of the
        // original that is missing from the generated one would be lost on save.
        function headerTokens(lines) {
            const toks = [];
            // Categories / Users / Tags are de-duplicated by the generator (a repeated value is
            // not information), so they are compared as sets.
            const list = (prefix, values) => [...new Set(values.map(v => v.trim()).filter(Boolean))].forEach(v => toks.push(prefix + v));
            lines.forEach(raw => {
                const l = raw.trim();
                if (!l || /^-{3,}$/.test(l)) return;
                if (/^<!--\s*Format:\s*v2\s*-->$/i.test(l)) return;
                if (/^##\s+⚙\uFE0F?\s*Configuration\s*$/u.test(l)) return;
                let m = l.match(/^<!--\s*Config:\s*Last Task ID:\s*(\d+)\s*-->$/);
                if (m) { toks.push('lastid:' + parseInt(m[1], 10)); return; }
                m = l.match(/^#[ \t]+(.+?)$/);
                if (m) { toks.push('title:' + m[1]); return; }
                m = l.match(/^\*\*(Columns|Categories|Users|Priorities|Tags)\*\*\s*[:：]\s*(.*)$/);
                if (m) {
                    const [, k, v] = m;
                    if (k === 'Columns') {
                        v.split('|').map(c => c.trim()).filter(Boolean).forEach(c => {
                            const mm = c.match(COLUMN_RE);
                            toks.push('col:' + (mm ? mm[1].trim() : c));
                            if (mm) toks.push('colid:' + mm[2].trim());
                        });
                    } else if (k === 'Priorities') list('pri:', v.split('|'));
                    else if (k === 'Tags') list('ctag:', v.split(/[\s,、，]+/).map(x => x.replace(/^[#＃]/, '')));
                    else list(k === 'Users' ? 'user:' : 'cat:', v.split(','));
                    return;
                }
                toks.push('line:' + l.replace(/\s+/g, ' '));
            });
            return toks;
        }

        function lostHeaderLines(originalLines, cfg) {
            const gen = generateKanbanContent(cfg, []).split('\n');
            const pool = new Map();
            headerTokens(gen).forEach(t => pool.set(t, (pool.get(t) || 0) + 1));
            const lost = [];
            headerTokens(originalLines).forEach(t => {
                const n = pool.get(t) || 0;
                if (n > 0) pool.set(t, n - 1); else lost.push(t.replace(/^[a-z]+:/, ''));
            });
            return lost;
        }

        // "name (id)": the id is the LAST parenthesised part, so a name may contain "(…)".
        const COLUMN_RE = /^(.*\S)\s*\(([^()]+)\)\s*$/;

        // A "## " heading inside the task area (outside ``` code fences). In V2 every "## " line
        // after "## Tasks" would silently become part of the preceding task.
        function headingsOutsideFences(lines) {
            const found = [];
            for (let i = 0; i < lines.length; i++) {
                // A fence is ``` or ~~~ (3+), closed by the same character at least as long. An
                // opener that is never closed is NOT a fence (the lines after it are still checked).
                const open = lines[i].match(/^\s{0,3}(`{3,}|~{3,})/);
                if (open) {
                    const ch = open[1][0], len = open[1].length;
                    const closeRe = new RegExp(`^\\s{0,3}\\${ch}{${len},}\\s*$`);
                    let j = i + 1;
                    while (j < lines.length && !closeRe.test(lines[j])) j++;
                    if (j < lines.length) { i = j; continue; }
                }
                if (/^##\s/.test(lines[i])) found.push(lines[i].trim());
            }
            return found;
        }

        function parseConfigSection(content) {
            const cfg = {
                lastTaskId: 0,
                columns: [],
                categories: [],
                users: [],
                priorities: [],
                tags: [],
                boardTitle: 'Kanban Board'
            };
            // Title = the first "# " line before any "## " section (blank lines or comments may
            // precede it).
            for (const line of content.split('\n')) {
                if (/^##/.test(line)) break;
                const titleMatch = line.match(/^#[ \t]+(.+?)[ \t]*$/);
                if (titleMatch) { cfg.boardTitle = titleMatch[1].trim(); break; }
            }

            const idMatch = content.match(/<!--\s*Config:\s*Last Task ID:\s*(\d+)\s*-->/);
            if (idMatch) cfg.lastTaskId = parseInt(idMatch[1], 10);

            // "## ⚙️ Configuration" with or without the emoji variation selector.
            const section = content.match(/(?:^|\n)##[ \t]+⚙\uFE0F?[ \t]*Configuration[ \t]*((?:\n[\s\S]*?)?)(?=\n-{3,}[ \t]*(?:\n|$)|\n##\s|$)/u);
            if (section) {
                const text = section[1];
                const columnsMatch = text.match(/\*\*Columns\*\*[ \t]*[:：][ \t]*(\S.*)/);
                if (columnsMatch) {
                    const used = new Set();
                    cfg.columns = columnsMatch[1].split('|').map((col, idx) => {
                        col = col.trim();
                        if (!col) return null;
                        const m = col.match(COLUMN_RE);
                        let name, baseId;
                        if (m) { name = m[1].trim(); baseId = m[2].trim(); }
                        else { name = col; baseId = legacySlug(col) || ('col' + (idx + 1)); }
                        let id = baseId, n = 2;
                        while (used.has(id)) id = `${baseId}-${n++}`;
                        used.add(id);
                        return { name, id };
                    }).filter(Boolean);
                }
                const cat = text.match(/\*\*Categories\*\*[ \t]*[:：][ \t]*(\S.*)/);
                if (cat) cfg.categories = cat[1].split(',').map(c => c.trim()).filter(Boolean);
                const usr = text.match(/\*\*Users\*\*[ \t]*[:：][ \t]*(\S.*)/);
                if (usr) cfg.users = usr[1].split(',').map(u => u.trim()).filter(Boolean);
                const pri = text.match(/\*\*Priorities\*\*[ \t]*[:：][ \t]*(\S.*)/);
                if (pri) cfg.priorities = pri[1].split('|').map(p => p.trim()).filter(Boolean);
                // Tags with or without "#" ("#バグ #改善" or "バグ, 改善").
                const tg = text.match(/\*\*Tags\*\*[ \t]*[:：][ \t]*(\S.*)/);
                if (tg) cfg.tags = tg[1].split(/[\s,、，]+/).map(x => x.replace(/^[#＃]/, '')).filter(Boolean);
            }
            if (cfg.columns.length === 0) cfg.columns = DEFAULT_COLUMNS.map(c => ({ ...c }));
            if (cfg.categories.length === 0) cfg.categories = [...DEFAULT_CATEGORIES];
            if (cfg.users.length === 0) cfg.users = [...DEFAULT_USERS];
            if (cfg.priorities.length === 0) cfg.priorities = [...DEFAULT_PRIORITIES];
            if (cfg.tags.length === 0) cfg.tags = [...DEFAULT_TAGS];
            return cfg;
        }

        // Parse kanban.md. Returns { config, tasks, formatV2, problems, warnings }.
        // `problems` = content that would be LOST if the board were saved → the app must not save.
        function parseKanbanContent(rawContent) {
            const content = normalizeEol(rawContent);
            const config = parseConfigSection(content);
            const tasks = [];
            const problems = [];
            const warnings = [];

            const reEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const hasMarker = /<!--\s*Format:\s*v2\s*-->/i.test(content);
            const hasTasksHeading = /(^|\n)##\s+Tasks\s*(\n|$)/.test(content);
            const sectionTitles = [...content.matchAll(/(?:^|\n)##\s+([^\n]+?)\s*(?:\n|$)/g)].map(m => m[1].trim());
            const hasColumnSections = config.columns.some(c =>
                new RegExp(`(^|\\n)##\\s+${reEscape(c.name)}\\s*(\\n|$)`).test(content) ||
                (!hasTasksHeading && sectionTitles.some(t => legacySlug(t) === c.id)));
            const formatV2 = hasMarker || (hasTasksHeading && !hasColumnSections);
            const lines = content.split('\n');
            const headerLines = []; // title / comments / configuration part

            if (formatV2) {
                const opts = { columns: config.columns, statusMode: 'column' };
                const tasksIdx = lines.findIndex(l => /^##\s+Tasks\s*$/.test(l));
                const preamble = tasksIdx >= 0 ? lines.slice(0, tasksIdx) : lines;
                const bodyLines = tasksIdx >= 0 ? lines.slice(tasksIdx + 1) : [];
                headerLines.push(...preamble);
                const headings = headingsOutsideFences(bodyLines);
                if (headings.length) problems.push({ code: 'heading-in-tasks', lines: headings });
                const firstHeader = bodyLines.findIndex(l => TASK_HEADER_RE.test(l));
                const before = (firstHeader >= 0 ? bodyLines.slice(0, firstHeader) : bodyLines)
                    .filter(l => l.trim() && !/^-{3,}$/.test(l.trim()));
                if (before.length) problems.push({ code: 'text-outside-task', lines: before.map(l => l.trim()) });
                tasks.push(...parseTaskBlocks(bodyLines.join('\n'), config.columns[0].id, opts, problems));
            } else {
                const opts = { columns: config.columns, statusMode: 'ignore' };
                config.columns.forEach(column => {
                    tasks.push(...parseTasksFromSection(content, column.name, column.id, opts, problems));
                });
                // Sections that are neither the config nor a column would be dropped on save.
                const parts = content.split(/\n(?=##\s)/);
                parts.forEach((part, pi) => {
                    const pl = part.split('\n');
                    if (pi === 0 && !/^##\s/.test(pl[0])) { headerLines.push(...pl); return; }
                    const title = pl[0].replace(/^##\s+/, '').trim();
                    if (/^⚙\uFE0F?\s*Configuration$/u.test(title)) { headerLines.push(...pl); return; }
                    const isColumn = config.columns.some(c => title.startsWith(c.name) || legacySlug(title) === c.id);
                    const body = pl.slice(1);
                    const firstHeader = body.findIndex(l => TASK_HEADER_RE.test(l));
                    const before = (firstHeader >= 0 ? body.slice(0, firstHeader) : body)
                        .filter(l => l.trim() && !/^-{3,}$/.test(l.trim()));
                    if (!isColumn && body.some(l => l.trim() && !/^-{3,}$/.test(l.trim()))) {
                        problems.push({ code: 'unknown-section', section: title, lines: body.filter(l => l.trim()).slice(0, 5).map(l => l.trim()) });
                    } else if (isColumn && before.length) {
                        problems.push({ code: 'text-outside-task', section: title, lines: before.map(l => l.trim()) });
                    }
                });
            }

            // Header: keep extra HTML comments (e.g. notes left by an AI), then check that nothing of
            // the title / comments / configuration would be lost or silently replaced on save.
            config.comments = headerLines.map(l => l.trim()).filter(l => /^<!--.*-->$/.test(l)
                && !/^<!--\s*Format:\s*v2\s*-->$/i.test(l) && !/^<!--\s*Config:\s*Last Task ID:/.test(l));
            const lostHeader = lostHeaderLines(headerLines, config);
            if (lostHeader.length) problems.push({ code: 'unknown-header-content', lines: lostHeader });
            // The header written on save must read back to the same header (fixed point).
            const genHeader = generateKanbanContent(config, []);
            const again = parseConfigSection(genHeader);
            again.comments = config.comments;
            if (generateKanbanContent(again, []) !== genHeader) problems.push({ code: 'unstable-header', lines: [] });

            // Every "### TASK-" line must have produced exactly one task.
            const loose = lines.filter(l => LOOSE_TASK_HEADER_RE.test(l));
            const malformed = loose.filter(l => !TASK_HEADER_RE.test(l) || !l.match(TASK_HEADER_RE)[2].trim());
            if (malformed.length) problems.push({ code: 'malformed-task-header', lines: malformed.map(l => l.trim()) });
            const strictCount = loose.length - malformed.length;
            if (tasks.length < strictCount) {
                const parsed = new Map();
                tasks.forEach(t => parsed.set(t.id, (parsed.get(t.id) || 0) + 1));
                const missing = [];
                loose.filter(l => !malformed.includes(l)).forEach(l => {
                    const id = formatTaskId(l.match(TASK_HEADER_RE)[1]);
                    const n = parsed.get(id) || 0;
                    if (n > 0) parsed.set(id, n - 1); else missing.push(l.trim());
                });
                problems.push({ code: 'task-not-in-column', lines: missing });
            }

            const dups = findDuplicateIds(tasks);
            if (dups.length) warnings.push({ code: 'duplicate-id', ids: dups });
            const unknown = tasks.filter(t => t.statusUnknown).map(t => `${t.id}: ${t.status}`);
            if (unknown.length) warnings.push({ code: 'unknown-status', lines: unknown });
            // "**Subtasks**:" written after "**Notes**:" is kept as notes text (not a checklist).
            const inNotes = tasks.filter(t => /^\s*\*\*Subtasks\*\*\s*[:：]/m.test(t.notes || '')).map(t => t.id);
            if (inNotes.length) warnings.push({ code: 'subtasks-in-notes', lines: inNotes });

            return { config, tasks, formatV2, problems, warnings };
        }

        // Parse archive.md: a flat list of task blocks under any heading (language-independent).
        // The text before the first task (title / description / section heading) is kept verbatim
        // as `preamble`, so saving never rewrites it just because the UI language changed.
        function parseArchiveContent(rawContent) {
            const content = normalizeEol(rawContent);
            const lines = content.split('\n');
            const firstHeader = lines.findIndex(l => LOOSE_TASK_HEADER_RE.test(l));
            const preamble = (firstHeader >= 0 ? lines.slice(0, firstHeader) : lines).join('\n').replace(/\s+$/, '');
            const problems = [];
            const warnings = [];
            const tasks = parseTaskBlocks(content, 'archived', { statusMode: 'raw' }, problems);
            const headings = firstHeader >= 0 ? headingsOutsideFences(lines.slice(firstHeader)) : [];
            if (headings.length) problems.push({ code: 'heading-in-tasks', lines: headings });
            const loose = lines.filter(l => LOOSE_TASK_HEADER_RE.test(l));
            const malformed = loose.filter(l => !TASK_HEADER_RE.test(l) || !l.match(TASK_HEADER_RE)[2].trim());
            if (malformed.length) problems.push({ code: 'malformed-task-header', lines: malformed.map(l => l.trim()) });
            const dups = findDuplicateIds(tasks);
            if (dups.length) warnings.push({ code: 'duplicate-id', ids: dups });
            const formatV2 = /<!--\s*Format:\s*v2\s*-->/i.test(content);
            return { tasks, preamble, formatV2, problems, warnings };
        }

        // ----- Generation -----

        function serializeTask(task) {
            let md = `### ${task.id} | ${task.title}\n`;
            md += `**Status**: ${task.status}\n`;
            const meta = [];
            if (task.priority) meta.push(`**Priority**: ${task.priority}`);
            if (task.category) meta.push(`**Category**: ${task.category}`);
            if (task.assignees && task.assignees.length) meta.push(`**Assigned**: ${task.assignees.join(', ')}`);
            if (meta.length) md += meta.join(' | ') + '\n';
            const dates = [];
            if (task.created) dates.push(`**Created**: ${task.created}`);
            if (task.started) dates.push(`**Started**: ${task.started}`);
            if (task.due) dates.push(`**Due**: ${task.due}`);
            if (task.completed) dates.push(`**Finished**: ${task.completed}`);
            if (dates.length) md += dates.join(' | ') + '\n';
            if (task.tags && task.tags.length) md += `**Tags**: ${task.tags.join(' ')}\n`;
            if (task.description) md += `\n${task.description}\n`;
            if (task.subtasks && task.subtasks.length) {
                md += `\n**Subtasks**:\n`;
                task.subtasks.forEach(st => { md += `${st.indent || ''}- [${st.completed ? 'x' : ' '}] ${st.text}\n`; });
            }
            if (task.extra) md += `\n${task.extra}\n`;
            if (task.notes) md += `\n**Notes**:\n${task.notes}\n`;
            md += `\n`;
            return md;
        }

        // Two task objects are "the same task" when they serialize identically.
        function sameTask(a, b) {
            return !!a && !!b && serializeTask(a) === serializeTask(b);
        }

        function withEol(text, eol) {
            return eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
        }

        function generateKanbanContent(cfg, taskList, eol = '\n') {
            const boardTitle = (cfg.boardTitle && cfg.boardTitle.trim()) || 'Kanban Board';
            const uniq = a => [...new Set(a || [])];
            const categories = uniq(cfg.categories).length ? uniq(cfg.categories) : DEFAULT_CATEGORIES;
            const users = uniq(cfg.users).length ? uniq(cfg.users) : DEFAULT_USERS;
            const priorities = (cfg.priorities || []).length ? cfg.priorities : DEFAULT_PRIORITIES;
            const tags = uniq(cfg.tags).length ? uniq(cfg.tags) : DEFAULT_TAGS;
            let md = `# ${boardTitle}\n\n<!-- Config: Last Task ID: ${cfg.lastTaskId} -->\n<!-- Format: v2 -->\n`;
            (cfg.comments || []).forEach(c => { md += `${c}\n`; });
            md += `\n`;
            md += `## ⚙️ Configuration\n\n`;
            md += `**Columns**: ${cfg.columns.map(c => `${c.name} (${c.id})`).join(' | ')}\n\n`;
            md += `**Categories**: ${categories.join(', ')}\n\n`;
            md += `**Users**: ${users.join(', ')}\n\n`;
            md += `**Priorities**: ${priorities.join(' | ')}\n\n`;
            md += `**Tags**: ${tags.map(t => '#' + t).join(' ')}\n\n`;
            md += `---\n\n`;
            md += `## Tasks\n\n`;
            taskList.forEach(task => { md += serializeTask(task); });
            return withEol(md, eol);
        }

        function defaultArchivePreamble(title, desc, section) {
            return `${title}\n<!-- Format: v2 -->\n\n${desc}\n\n${section}`;
        }

        function generateArchiveContent(preamble, taskList, eol = '\n') {
            let pre = normalizeEol(preamble || '').replace(/\s+$/, '');
            if (!pre) pre = defaultArchivePreamble('# Task Archive', '> Archived tasks', '## ✅ Archives');
            if (!/<!--\s*Format:\s*v2\s*-->/i.test(pre)) {
                const nl = pre.indexOf('\n');
                pre = nl >= 0 ? `${pre.slice(0, nl)}\n<!-- Format: v2 -->${pre.slice(nl)}` : `${pre}\n<!-- Format: v2 -->`;
            }
            let md = `${pre}\n\n`;
            taskList.forEach(task => { md += serializeTask(task); });
            return withEol(md, eol);
        }
