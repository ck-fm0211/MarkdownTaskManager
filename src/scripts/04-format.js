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
        const META_KEYS = ['Status', 'Priority', 'Category', 'Assigned', 'Created', 'Started', 'Due', 'Finished', 'Tags', 'Estimate'];
        // ":" may also be typed as a full-width "：" (Japanese IME); both are accepted.
        const META_LINE_RE = /^\s*\*\*(Status|Priority|Category|Assigned|Created|Started|Due|Finished|Tags|Estimate)\*\*\s*[:：]/;
        // Upstream V2.0 wrote " | **Category**: …" when a task had no priority (and " | **Assigned**: …"
        // with neither priority nor category). That form is read ONLY in the task's leading metadata
        // lines (see metaLineMask) and never when the line ends with "|": a Markdown table row such
        // as "| **Due**: 2026-01-01 |" in the description is description text, not the task's field.
        const PIPED_META_LINE_RE = /^\s*\|\s*\*\*(Status|Priority|Category|Assigned|Created|Started|Due|Finished|Tags|Estimate)\*\*\s*[:：](?!.*\|\s*$)/;
        const META_SEG_RE = /^\s*\*\*([A-Za-z]+)\*\*\s*[:：]\s*(.*?)\s*$/;
        // Worklog is structural only with a colon, as in WORKLOG_SECTION_RE; a bare bold
        // "**Worklog**" is text. Keep the legacy rules for the other section names.
        const SECTION_STOP_RE = /^\s*\*\*(?:(Subtasks|Notes|Links|Review|Dependencies)\*\*|Worklog\*\*\s*[:：])/i;
        const NOTES_RE = /^\s*\*\*Notes\*\*\s*[:：]/i;
        const WORKLOG_SECTION_RE = /^\s*\*\*Worklog\*\*\s*[:：]/i;
        const WORKLOG_LINE_RE = /^\s*-\s+(\d{4}-\d{2}-\d{2})\s*\|\s*(\d+(?:\.\d+)?)h(?:\s*\|\s*(.*?))?\s*$/;
        // Tags: "#" (or full-width "＃") followed by anything except whitespace, "#", "," and "、".
        // Unicode-safe (Japanese tags). Stored with an ASCII "#".
        const TAG_RE = /[#＃][^\s#＃,、，]+/g;
        const normTag = t => '#' + t.slice(1);
        const CHECKBOX_RE = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/;

        // Which lines of a task body are metadata lines (fenced = fencedLineMask(lines)). A plain
        // "**Key**:" line counts wherever it is (parseTask only reads the head); upstream's
        // " | **Key**:" form only in the leading run of metadata lines right after the task header
        // (before the first blank line or text). parseTask and the loss check (blockTokens) share
        // this rule, so a line is never "a field" on one side and "text" on the other.
        function metaLineMask(lines, fenced) {
            const mask = lines.map((l, i) => !fenced[i] && META_LINE_RE.test(l));
            let i = 0;
            while (i < lines.length && !lines[i].trim()) i++;
            for (; i < lines.length && !fenced[i]; i++) {
                if (mask[i]) continue;
                if (!PIPED_META_LINE_RE.test(lines[i])) break;
                mask[i] = true;
            }
            return mask;
        }

        // A metadata line without upstream's leading "|" separator.
        function metaText(line) {
            return line.replace(/^\s*\|\s*/, '');
        }

        // LF line endings, no UTF-8 BOM (a BOM would hide the "# Title" of the first line).
        function normalizeEol(content) {
            return String(content ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
        }

        // Bytes of kanban.md / archive.md → text. The files are UTF-8; Blob.text() would silently
        // turn the bytes of a Shift_JIS (cp932) / UTF-16 file into U+FFFD, and a later save would
        // write the garbled text back. → { text, valid }: valid=false means "not UTF-8" (the text is
        // the lossy decoding, for display only; such a file must never be written).
        // UTF-16 WITHOUT a BOM whose text is (mostly) ASCII is valid UTF-8 byte by byte ("#\0 \0T\0…"),
        // and none of its "### TASK-<n>" lines could be found: a NUL in (nearly) every other byte
        // (utf16WithoutBom) also means "not UTF-8". A NUL elsewhere in valid UTF-8 text (typed or pasted
        // by mistake, or left by a damaged file) is NOT an encoding problem: the parsers report it with
        // its line (nulCharProblems → 'nul-char'), so that the message can say what to delete.
        // A file damaged by a run of NULs written over part of it (the typical trace of a crash) is still
        // UTF-8 text even when the run starts or ends in the middle of a character: it is reported as
        // nul-char (delete the NULs / restore the file), not as another encoding ("save it again as UTF-8"
        // would not repair it). The text is then the lossy decoding (U+FFFD where a character was cut);
        // such a file is read-only anyway.
        function decodeUtf8(bytes) {
            try {
                const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
                return { text, valid: !(text.includes('\0') && utf16WithoutBom(bytes)) };
            } catch (e) {
                const text = new TextDecoder('utf-8').decode(bytes);
                return { text, valid: text.includes('\0') && !utf16WithoutBom(bytes) && utf8ApartFromNulCuts(bytes) };
            }
        }

        // Valid UTF-8 apart from characters cut by NUL runs: every part between NULs is valid UTF-8, except
        // that a part may begin with the rest (1-3 continuation bytes) of a character cut by the NULs before
        // it and end with the start of a character cut by the NULs after it.
        function utf8ApartFromNulCuts(bytes) {
            const b = ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes);
            const n = b.length;
            for (let i = 0; i < n;) {
                if (b[i] === 0) { i++; continue; }
                let j = i;
                while (j < n && b[j] !== 0) j++;
                let k = i;
                if (i > 0) while (k < j && k < i + 3 && (b[k] & 0xC0) === 0x80) k++;
                try {
                    // stream: an incomplete character at the end (cut by the following NULs) is no error.
                    new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(k, j), { stream: j < n });
                } catch (e) {
                    return false;
                }
                i = j;
            }
            return true;
        }

        // 'le' | 'be' when the bytes look like UTF-16 without a BOM:
        // - at least a quarter of the bytes at one parity are NUL (an ASCII character in UTF-16 is "X\0" (LE) /
        //   "\0X" (BE)) and the other parity has almost none, or
        // - (nearly) every line break is a UTF-16 one: "\n\0" at an even offset (LE) / "\0\n" at an odd offset
        //   (BE). This also finds a file of mostly kana and full-width spaces (U+3000 is "\0\x30" in LE, so its
        //   NULs are at the other parity) that happens to be valid UTF-8.
        // A few NULs typed into UTF-8 text, or a run of NULs (both parities), are neither.
        function utf16WithoutBom(bytes) {
            const b = ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes);
            const n = b.length;
            let even = 0, odd = 0;
            for (let i = 0; i < n; i++) if (b[i] === 0) { if (i & 1) odd++; else even++; }
            const many = (k, of) => of > 0 && k * 4 >= of;
            if (many(odd, n >> 1) && even * 8 <= odd) return 'le';
            if (many(even, (n + 1) >> 1) && odd * 8 <= even) return 'be';
            let lf = 0, leLf = 0, beLf = 0;
            for (let i = 0; i < n; i++) {
                if (b[i] !== 0x0A) continue;
                lf++;
                if (!(i & 1) && b[i + 1] === 0) leLf++;
                if ((i & 1) && b[i - 1] === 0) beLf++;
            }
            if (lf >= 2 && leLf * 10 >= lf * 9) return 'le';
            if (lf >= 2 && beLf * 10 >= lf * 9) return 'be';
            return null;
        }

        // A line with its invisible problem characters made visible: NUL → "␀" (U+2400), a lone
        // surrogate → "\uFFFD"; long lines are cut around the first one.
        function visibleLine(line) {
            const s = String(line);
            const at = Math.max(0, firstUnwritable(s));
            let from = Math.max(0, at - 40);
            // Never start in the middle of a surrogate pair (a correct emoji would be shown as U+FFFD).
            const isLow = (k) => s.charCodeAt(k) >= 0xDC00 && s.charCodeAt(k) <= 0xDFFF;
            const isHigh = (k) => s.charCodeAt(k) >= 0xD800 && s.charCodeAt(k) <= 0xDBFF;
            if (from > 0 && isLow(from) && isHigh(from - 1)) from--;
            let out = '';
            for (let i = from; i < s.length && i < from + 100; i++) {
                const c = s.charCodeAt(i);
                if (c === 0) out += '\u2400';
                else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xDC00 && s.charCodeAt(i + 1) <= 0xDFFF) { out += s[i] + s[i + 1]; i++; }
                else if (c >= 0xD800 && c <= 0xDFFF) out += '\uFFFD';
                else out += s[i];
            }
            return (from > 0 ? '…' : '') + out + (from + 100 < s.length ? '…' : '');
        }

        // NUL (U+0000) in otherwise valid UTF-8 text. It is invisible, text editors / grep / AI tools
        // take a file containing one for a binary file, and a run of NULs is the typical trace of a file
        // damaged by a crash: the file is opened read-only, with the line of the first NUL, so that the
        // user can delete it (saving the file again as UTF-8 does not remove it).
        // → [] or [{ code: 'nul-char', line, count, lines: ["<line>: <text with ␀>", … (at most 5)] }].
        function nulCharProblems(content) {
            const text = String(content ?? '');
            if (!text.includes('\0')) return [];
            const lines = text.split('\n');
            const at = [];
            let count = 0;
            lines.forEach((l, i) => {
                if (!l.includes('\0')) return;
                at.push(i + 1);
                count += l.split('\0').length - 1;
            });
            return [{ code: 'nul-char', line: at[0], count, lines: at.slice(0, 5).map(n => `${n}: ${visibleLine(lines[n - 1])}`) }];
        }

        // Index of the first character this app never writes, or -1: NUL (the file would open
        // read-only, see nulCharProblems) and a lone UTF-16 surrogate (written as U+FFFD, so the file
        // would not read back as written).
        function firstUnwritable(s) {
            for (let i = 0; i < s.length; i++) {
                const c = s.charCodeAt(i);
                if (c === 0) return i;
                if (c >= 0xD800 && c <= 0xDBFF) {
                    const d = s.charCodeAt(i + 1);
                    if (d >= 0xDC00 && d <= 0xDFFF) { i++; continue; }
                    return i;
                }
                if (c >= 0xDC00 && c <= 0xDFFF) return i;
            }
            return -1;
        }

        // Text that must not be written as it is (firstUnwritable). Every input that ends up in a file
        // (task form, subtasks of the detail view, columns) is checked before anything is changed, and
        // writeFileChecked() refuses such content as the last line of defence.
        // → [] or [{ code: 'unwritable-char', line?, lines }] (opts.lineNumbers: "<line>: " in front).
        function unwritableTextProblems(text, opts = {}) {
            const s = String(text ?? '');
            if (firstUnwritable(s) < 0) return [];
            const lines = s.split('\n');
            const bad = [];
            lines.forEach((l, i) => { if (firstUnwritable(l) >= 0) bad.push(i); });
            const p = { code: 'unwritable-char', lines: bad.slice(0, 5).map(i => (opts.lineNumbers ? `${i + 1}: ` : '') + visibleLine(lines[i])) };
            if (opts.lineNumbers) p.line = bad[0] + 1;
            return [p];
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

        // A date as AI_WORKFLOW.md and the form's date inputs expect it: YYYY-MM-DD, a real day.
        // Other dates ("2026-1-5", "20261231") are kept as written, but a date input cannot show
        // them (the form keeps such a value unless the user changes it) → reported as a warning.
        function isIsoDate(s) {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
            if (!m) return false;
            const [y, mo, day] = [+m[1], +m[2], +m[3]];
            // setUTCFullYear, not Date.UTC: Date.UTC reads the years 0–99 as 1900–1999. Year 0000 is not
            // a valid date for a date input either.
            const d = new Date(0);
            d.setUTCFullYear(y, mo - 1, day);
            return y >= 1 && d.getUTCFullYear() === y && d.getUTCMonth() === mo - 1 && d.getUTCDate() === day;
        }
        const DATE_FIELDS = [['created', 'Created'], ['started', 'Started'], ['due', 'Due'], ['completed', 'Finished']];
        function nonIsoDates(list) {
            const out = [];
            (list || []).forEach(t => {
                DATE_FIELDS.forEach(([f, key]) => {
                    if (t[f] && !isIsoDate(t[f])) out.push(`${t.id} ${key}: ${t[f]}`);
                });
                (t.worklog || []).forEach(log => {
                    if (!isIsoDate(log.date)) out.push(`${t.id} Worklog: ${log.date}`);
                });
            });
            return out;
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
        // Counted generously (skipping a number is harmless, reusing one is not): any heading level,
        // optional spaces, full-width digits / hyphen (NFKC), e.g. "## TASK-050", "###TASK-070",
        // "### TASK-０６０".
        function maxIdInText(text) {
            let max = 0;
            // NULs are removed first: "### TASK-1\050" reads as TASK-150, the id that line has once the NUL
            // is deleted (as the nul-char message asks), so a new task never takes it in the meantime.
            const plain = normalizeEol(text).replace(/\0/g, '');
            for (const m of plain.normalize('NFKC').matchAll(/^[^\S\n]*#{1,6}[^\S\n]*TASK[^\S\n]*[-‐‑–][^\S\n]*(\d+)/gmi)) {
                max = Math.max(max, parseInt(m[1], 10));
            }
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
            // Lines inside a closed ``` / ~~~ code block are text, never structure: a
            // "**Due**: 2026-12-31" or "**Notes**:" shown as an example in a code block must stay in
            // the code block (it was silently turned into the task's own field before).
            const fenced = fencedLineMask(lines);
            const structural = (i, re) => !fenced[i] && re.test(lines[i]);
            const findLine = (re) => lines.findIndex((l, i) => structural(i, re));

            // "Head" = lines before the first section (Subtasks/Worklog/Notes/Links/Review/Dependencies).
            // Metadata is only read from the head, so a "**Created**:" inside notes is not mistaken
            // for the task's own field.
            let headEnd = findLine(SECTION_STOP_RE);
            if (headEnd < 0) headEnd = lines.length;
            const head = lines.slice(0, headEnd);
            const metaMask = metaLineMask(lines, fenced);
            const isMetaLine = (i) => metaMask[i];

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
                estimate: '',
                description: '',
                subtasks: [],
                worklog: [],
                notes: '',
                extra: '' // verbatim passthrough for **Links** / **Review** / **Dependencies**
            };

            // Metadata: every "**Key**: value" segment of the head's metadata lines, split on "|".
            // Order-independent and each field optional — a task with no **Category** keeps its
            // **Priority** (upstream issue #19), and so does a Japanese priority value.
            // An empty value ("**Category**:") is the same as an absent field.
            const seen = {};
            head.forEach((line, i) => {
                if (!isMetaLine(i)) return;
                const text = metaText(line);
                const segs = /^\s*\*\*Tags\*\*\s*[:：]/.test(text) ? [text] : text.split('|');
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
                        case 'Estimate': task.estimate = v; break;
                    }
                });
            });

            // Description: the non-metadata lines of the head, kept verbatim (blank lines,
            // indentation and trailing double spaces = Markdown line breaks are preserved; only
            // outer blank lines and a trailing "---" separator are dropped).
            const desc = trimTrailingSeparators(head.filter((l, i) => !isMetaLine(i)));
            while (desc.length && !desc[0].trim()) desc.shift();
            task.description = desc.join('\n');

            // Everything after **Notes**: belongs to the notes, so the other sections are only
            // looked for BEFORE it (a "**Subtasks**:" written after the notes stays in the notes
            // instead of being read twice and multiplied on every save).
            let notesIdx = findLine(NOTES_RE);
            const beforeNotes = notesIdx >= 0 ? lines.slice(0, notesIdx) : lines;

            // Subtasks: only inside the **Subtasks** section (until the next "**Field**:").
            // Indentation (nested checkboxes) is kept.
            let inSubtasks = false;
            for (let i = 0; i < beforeNotes.length; i++) {
                const line = beforeNotes[i];
                if (fenced[i]) { if (inSubtasks) inSubtasks = false; continue; }
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

            // Worklog: only collect entries inside the **Worklog** section (until the next
            // "**Field**:"), just like Subtasks. A worklog section written after Notes remains
            // part of the notes because it is outside beforeNotes.
            let inWorklog = false;
            for (let i = 0; i < beforeNotes.length; i++) {
                const line = beforeNotes[i];
                if (fenced[i]) { if (inWorklog) inWorklog = false; continue; }
                if (WORKLOG_SECTION_RE.test(line)) { inWorklog = true; continue; }
                if (inWorklog && /^\s*\*\*[^*\n]+\*\*\s*[:：]/.test(line)) inWorklog = false;
                if (inWorklog) {
                    const m = line.match(WORKLOG_LINE_RE);
                    if (m) task.worklog.push({ date: m[1], hours: Number(m[2]), memo: m[3] ?? '' });
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
            const extraStop = /^\s*\*\*(?:(Status|Priority|Category|Assigned|Created|Started|Due|Finished|Tags|Estimate|Subtasks)\*\*|Worklog\*\*\s*[:：])/i;
            const extraLines = [];
            let capturing = false;
            for (let i = 0; i < beforeNotes.length; i++) {
                const line = beforeNotes[i];
                if (!fenced[i] && extraStart.test(line)) { capturing = true; extraLines.push(line); continue; }
                if (capturing && !fenced[i] && extraStop.test(line)) capturing = false;
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
            // [^\S\n] = a space that is not a line break: a header never spans two lines (with \s an
            // empty title would take the NEXT line as the title).
            const re = /^###[^\S\n]+TASK-(\d+)[^\S\n]*\|[^\S\n]*(.+?)[^\S\n]*$/gm;
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
                    // Code fences are checked PER TASK: a fence that is not closed inside its own task
                    // either hides a "### TASK-" line in a code block (it would silently become a new
                    // task) or swallows the following tasks' structure — both are reported.
                    const bodyLines = body.split('\n');
                    const open = unclosedFences(bodyLines);
                    if (open.length) report.push({ code: 'unclosed-code-block', id, lines: open });
                    const headings = headingsOutsideFences(bodyLines);
                    if (headings.length) report.push({ code: 'heading-in-tasks', id, lines: headings });
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

        // ----- Legacy V1 files ("## <column name>" sections) -----
        // Upstream V1 wrote each column as "## <column name>". A heading is matched to a column by
        // the WHOLE heading text (never by prefix: with columns "Todo" and "Todo Later", "## Todo
        // Later" must not be read as "Todo"), then by the name without its leading emoji, then by
        // the id slug. Each section belongs to at most one column.
        const normHeading = s => String(s ?? '').normalize('NFKC').replace(/[\uFE0E\uFE0F]/g, '').replace(/\s+/g, ' ').trim();

        function columnForHeading(title, columns) {
            const h = normHeading(title);
            const cols = columns || [];
            return cols.find(c => normHeading(c.name) === h)
                || (clean(h) && cols.find(c => clean(normHeading(c.name)) === clean(h)))
                || cols.find(c => legacySlug(title) === c.id)
                || null;
        }

        // "## " sections of a V1 file: [{ title, lines }] (the part before the first one is index -1).
        function legacySections(content) {
            return normalizeEol(content).split(/\n(?=##\s)/).map((part, pi) => {
                const pl = part.split('\n');
                if (pi === 0 && !/^##\s/.test(pl[0])) return { title: null, heading: null, lines: pl };
                return { title: pl[0].replace(/^##\s+/, '').trim(), heading: pl[0], lines: pl.slice(1) };
            });
        }

        // Task blocks of the section(s) of one column (kept for callers that ask by column).
        function parseTasksFromSection(content, sectionName, statusId, opts = {}, report = null) {
            const cols = opts.columns && opts.columns.length ? opts.columns : [{ name: sectionName, id: statusId }];
            const out = [];
            legacySections(content).forEach(sec => {
                if (sec.title === null) return;
                const col = columnForHeading(sec.title, cols);
                if (col && col.id === statusId) out.push(...parseTaskBlocks(sec.lines.join('\n').trim(), statusId, opts, report));
            });
            return out;
        }

        // ----- Loss detection -----
        // Turn a block body into comparable tokens. Formatting differences the generator is allowed
        // to make (field order, "|" layout, blank lines, "---" separators, [X] vs [x], emoji before a
        // priority, a known status written as a column name) are normalised away; anything else must
        // survive a parse → generate cycle, otherwise the block is reported as lossy.
        function blockTokens(body, opts = {}) {
            const tokens = [];
            const all = normalizeEol(body).split('\n');
            // A line inside a code block is compared as code: a "**Due**:" example that moved out
            // of its code block into the task's fields counts as lost (and the other way round).
            const fenced = fencedLineMask(all);
            // Same metadata rule as parseTask (a leading "|" only in the leading metadata lines).
            const meta = metaLineMask(all, fenced);
            all.forEach((raw, i) => {
                const line = raw.trim();
                if (!line || /^-{3,}$/.test(line)) return;
                if (fenced[i]) { tokens.push('code:' + line.replace(/\s+/g, ' ')); return; }
                if (meta[i]) {
                    const text = metaText(line);
                    if (/^\*\*Tags\*\*\s*[:：]/.test(text)) {
                        const v = text.replace(/^\*\*Tags\*\*\s*[:：]\s*/, '');
                        (v.match(TAG_RE) || []).forEach(tg => tokens.push('tag:' + normTag(tg)));
                        const rest = v.replace(TAG_RE, '').replace(/[\s,、，]+/g, '');
                        if (rest) tokens.push('tagsrest:' + rest);
                        return;
                    }
                    text.split('|').forEach(seg => {
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
                const worklog = t.match(WORKLOG_LINE_RE);
                if (worklog) {
                    tokens.push(`worklog:${worklog[1]}:${Number(worklog[2])}:${worklog[3] ?? ''}`);
                    return;
                }
                // Bare section headers carry no data of their own (an empty "**Notes**:" or
                // "**Subtasks**:" or "**Worklog**:" is legitimately not written back).
                if (/^\*\*(?:(Subtasks|Notes)\*\*\s*[:：]?|Worklog\*\*\s*[:：])$/i.test(t)) return;
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
                // Same whitespace rule as parseConfigSection: any space except a line break
                // (full-width space U+3000 and NBSP included).
                m = l.match(/^\*\*(Columns|Categories|Users|Priorities|Tags)\*\*[^\S\n]*[:：][^\S\n]*(.*)$/);
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
        // Opening fence lines that are never closed (by the same character, at least as long).
        function unclosedFences(lines) {
            const open = [];
            for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(/^\s{0,3}(`{3,}|~{3,})/);
                if (!m) continue;
                const ch = m[1][0], len = m[1].length;
                const closeRe = new RegExp(`^\\s{0,3}\\${ch}{${len},}\\s*$`);
                let j = i + 1;
                while (j < lines.length && !closeRe.test(lines[j])) j++;
                if (j < lines.length) i = j; else open.push(lines[i].trim());
            }
            return open;
        }

        // true for every line of a CLOSED ``` / ~~~ code block (opening and closing line included).
        // An opener that is never closed is not a code block (same rule as headingsOutsideFences;
        // such a task is reported as unclosed-code-block anyway).
        function fencedLineMask(lines) {
            const mask = new Array(lines.length).fill(false);
            for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(/^\s{0,3}(`{3,}|~{3,})/);
                if (!m) continue;
                const ch = m[1][0], len = m[1].length;
                const closeRe = new RegExp(`^\\s{0,3}\\${ch}{${len},}\\s*$`);
                let j = i + 1;
                while (j < lines.length && !closeRe.test(lines[j])) j++;
                if (j < lines.length) { for (let k = i; k <= j; k++) mask[k] = true; i = j; }
            }
            return mask;
        }

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
                const columnsMatch = text.match(/\*\*Columns\*\*[^\S\n]*[:：][^\S\n]*(\S.*)/);
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
                const cat = text.match(/\*\*Categories\*\*[^\S\n]*[:：][^\S\n]*(\S.*)/);
                if (cat) cfg.categories = cat[1].split(',').map(c => c.trim()).filter(Boolean);
                const usr = text.match(/\*\*Users\*\*[^\S\n]*[:：][^\S\n]*(\S.*)/);
                if (usr) cfg.users = usr[1].split(',').map(u => u.trim()).filter(Boolean);
                const pri = text.match(/\*\*Priorities\*\*[^\S\n]*[:：][^\S\n]*(\S.*)/);
                if (pri) cfg.priorities = pri[1].split('|').map(p => p.trim()).filter(Boolean);
                // Tags with or without "#" ("#バグ #改善" or "バグ, 改善").
                const tg = text.match(/\*\*Tags\*\*[^\S\n]*[:：][^\S\n]*(\S.*)/);
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
                const firstHeader = bodyLines.findIndex(l => TASK_HEADER_RE.test(l));
                const before = (firstHeader >= 0 ? bodyLines.slice(0, firstHeader) : bodyLines)
                    .filter(l => l.trim() && !/^-{3,}$/.test(l.trim()));
                if (before.length) problems.push({ code: 'text-outside-task', lines: before.map(l => l.trim()) });
                tasks.push(...parseTaskBlocks(bodyLines.join('\n'), config.columns[0].id, opts, problems));
            } else {
                const opts = { columns: config.columns, statusMode: 'ignore' };
                // Each "## " section is assigned to (at most) one column by its whole heading;
                // sections that are neither the config nor a column would be dropped on save.
                const byColumn = new Map(config.columns.map(c => [c.id, []]));
                legacySections(content).forEach(sec => {
                    if (sec.title === null) { headerLines.push(...sec.lines); return; }
                    if (/^⚙\uFE0F?\s*Configuration$/u.test(sec.title)) { headerLines.push(sec.heading, ...sec.lines); return; }
                    const col = columnForHeading(sec.title, config.columns);
                    const body = sec.lines;
                    const firstHeader = body.findIndex(l => TASK_HEADER_RE.test(l));
                    const before = (firstHeader >= 0 ? body.slice(0, firstHeader) : body)
                        .filter(l => l.trim() && !/^-{3,}$/.test(l.trim()));
                    if (!col) {
                        if (body.some(l => l.trim() && !/^-{3,}$/.test(l.trim()))) {
                            problems.push({ code: 'unknown-section', section: sec.title, lines: body.filter(l => l.trim()).slice(0, 5).map(l => l.trim()) });
                        }
                        return;
                    }
                    if (before.length) problems.push({ code: 'text-outside-task', section: sec.title, lines: before.map(l => l.trim()) });
                    byColumn.get(col.id).push(sec);
                });
                config.columns.forEach(column => byColumn.get(column.id).forEach(sec => {
                    tasks.push(...parseTaskBlocks(sec.lines.join('\n').trim(), column.id, opts, problems));
                }));
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
            // Checked header by header on every load (not only when the count is short): a block that
            // was read twice can otherwise hide one that was not read at all.
            const key = (id, title) => `${id} | ${title}`;
            const parsed = new Map();
            tasks.forEach(t => { const k = key(t.id, t.title); parsed.set(k, (parsed.get(k) || 0) + 1); });
            const missing = [];
            loose.filter(l => !malformed.includes(l)).forEach(l => {
                const m = l.match(TASK_HEADER_RE);
                const k = key(formatTaskId(m[1]), m[2].trim());
                const n = parsed.get(k) || 0;
                if (n > 0) parsed.set(k, n - 1); else missing.push(l.trim());
            });
            if (missing.length) problems.push({ code: 'task-not-in-column', lines: missing });
            const twice = [...parsed.entries()].filter(([, n]) => n > 0).map(([k]) => k);
            if (twice.length) problems.push({ code: 'task-read-twice', lines: twice });

            const dups = findDuplicateIds(tasks);
            if (dups.length) warnings.push({ code: 'duplicate-id', ids: dups });
            const unknown = tasks.filter(t => t.statusUnknown).map(t => `${t.id}: ${t.status}`);
            if (unknown.length) warnings.push({ code: 'unknown-status', lines: unknown });
            // "**Subtasks**:" written after "**Notes**:" is kept as notes text (not a checklist).
            const inNotes = tasks.filter(t => /^\s*\*\*Subtasks\*\*\s*[:：]/m.test(t.notes || '')).map(t => t.id);
            if (inNotes.length) warnings.push({ code: 'subtasks-in-notes', lines: inNotes });
            const badDates = nonIsoDates(tasks);
            if (badDates.length) warnings.push({ code: 'non-iso-date', lines: badDates });
            problems.push(...nulCharProblems(content));

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
            const loose = lines.filter(l => LOOSE_TASK_HEADER_RE.test(l));
            const malformed = loose.filter(l => !TASK_HEADER_RE.test(l) || !l.match(TASK_HEADER_RE)[2].trim());
            if (malformed.length) problems.push({ code: 'malformed-task-header', lines: malformed.map(l => l.trim()) });
            const dups = findDuplicateIds(tasks);
            if (dups.length) warnings.push({ code: 'duplicate-id', ids: dups });
            const badDates = nonIsoDates(tasks);
            if (badDates.length) warnings.push({ code: 'non-iso-date', lines: badDates });
            problems.push(...nulCharProblems(content));
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
            if (task.estimate) md += `**Estimate**: ${task.estimate}\n`;
            if (task.description) md += `\n${task.description}\n`;
            if (task.subtasks && task.subtasks.length) {
                md += `\n**Subtasks**:\n`;
                task.subtasks.forEach(st => { md += `${st.indent || ''}- [${st.completed ? 'x' : ' '}] ${st.text}\n`; });
            }
            if (task.worklog && task.worklog.length) {
                md += `\n**Worklog**:\n`;
                task.worklog.forEach(log => {
                    const memo = log.memo ? ` | ${log.memo}` : '';
                    md += `- ${log.date} | ${log.hours}h${memo}\n`;
                });
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

        // Would this task, once written, read back as exactly the same task? Used by the task form
        // before it changes the board: a value the Markdown format cannot carry ("|" in a category or
        // an assignee, an empty title, a tag with "#" inside) would otherwise be saved "successfully"
        // and make the whole board read-only on the next load. → [] when fine, otherwise problems in
        // the same shape as parseKanbanContent()'s.
        function taskWriteProblems(task, columns) {
            const md = serializeTask(task);
            // A NUL would make the whole file read-only on the next load (and is not seen by the
            // round trip below: it reads back unchanged); a lone surrogate would be written as U+FFFD.
            const bad = unwritableTextProblems(md);
            if (bad.length) return bad.map(p => ({ ...p, id: task.id }));
            const header = md.slice(0, md.indexOf('\n'));
            const h = header.match(TASK_HEADER_RE);
            if (!h || !h[2].trim() || h[2].trim() !== String(task.title ?? '')) {
                return [{ code: 'malformed-task-header', id: task.id, lines: [header] }];
            }
            const cols = columns && columns.length ? columns : DEFAULT_COLUMNS;
            const problems = [];
            const parsed = parseTaskBlocks(md, cols[0].id, { columns: cols, statusMode: 'column' }, problems);
            if (parsed.length !== 1) {
                problems.push({ code: 'task-read-twice', id: task.id, lines: parsed.map(p => `${p.id} | ${p.title}`) });
                return problems;
            }
            const again = serializeTask(parsed[0]);
            if (again !== md && !problems.some(p => p.code === 'lossy-task' || p.code === 'unstable-task')) {
                const back = new Set(again.split('\n'));
                problems.push({ code: 'unstable-task', id: task.id, lines: md.split('\n').filter(l => l.trim() && !back.has(l)) });
            }
            return problems;
        }

        // Would this configuration, once written, read back with the same columns and without a
        // problem? Used by the column dialog before it changes anything (a NUL or a line separator in a
        // column name would otherwise be saved and make the board read-only on the next load).
        function configWriteProblems(cfg) {
            const md = generateKanbanContent(cfg, []);
            const bad = unwritableTextProblems(md);
            if (bad.length) return bad;
            const r = parseKanbanContent(md);
            if (r.problems.length) return r.problems;
            const cols = cfg.columns || [];
            const same = r.config.columns.length === cols.length
                && r.config.columns.every((c, i) => c.name === cols[i].name && c.id === cols[i].id);
            return same ? [] : [{ code: 'unstable-header', lines: cols.map(c => `${c.name} (${c.id})`) }];
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
