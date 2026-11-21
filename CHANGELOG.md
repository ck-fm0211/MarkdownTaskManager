# Changelog

## Fork 2.0.0-ja.1 (unreleased)

Base: [ioniks/MarkdownTaskManager](https://github.com/ioniks/MarkdownTaskManager) master at tag **V2.0**
(commit `f173f0d09274a8ce107fdfefda49823e2992e88f`, version 2.0.0). See `FORK_INFO.json`.
No automatic sync with upstream. Upstream pull requests were **not** merged wholesale; the
relevant problems were re-implemented against the requirements of this fork.

日本語の概要は [docs/ja/README.md](docs/ja/README.md) を参照。

### Review fixes, round 8 (external review of `c966c91..1b3c200`)
Data protection
- The app never writes a NUL (U+0000). Round 7 made a NUL "not UTF-8", but a NUL typed or pasted into the
  task form, a subtask of the detail view or a column passed the checks, was written, the read-back reported
  a conflict ("uncertain") although the file had changed, and the next load opened the whole board read-only
  as "not UTF-8 — save it again as UTF-8" (which cannot remove it); `tasks check` said NG, `next-id` stopped.
  Every input that writes text refuses a NUL and an unpaired surrogate (written as U+FFFD) before anything is
  changed (taskWriteProblems for all form fields and the detail view's subtasks, configWriteProblems for
  columns); writeFileChecked() refuses such content without writing ('refused', last line of defence; the
  banner offers no "Retry" for it, since the same content would be refused again).
- NUL detection split: UTF-16 without a BOM is recognised by NULs at one byte parity or by its line breaks
  ("\n\0" / "\0\n", e.g. a file of mostly kana and full-width spaces) and stays "not UTF-8"; a
  NUL in valid UTF-8 — also when a run of NULs cuts a character, as in a file damaged by a crash — is
  reported as `nul-char` with the line of the first one and the count (still
  read-only; the message says to delete it). App and CLI share the rule. While archive.md (CLI: either file)
  has a NUL, no new id is given (a run of NULs often replaces the end of a damaged file, where the newest ids
  are); as a further safeguard, ids are counted with NULs removed. Other C0
  control characters are not refused (they read back unchanged).
- `restore:verify`: a signal during the checks after the build or the removal of the temporary folder was
  ignored and the check ended "OK" with exit code 0 (synchronous rmSync). The folder is removed
  asynchronously and pending signals are handled before each step, right before "OK" and before ending with
  a failed check (so an interruption always ends with 128 + the signal number).
- `restore:verify`: a step that does not end on SIGTERM is killed with SIGKILL after 3 s (POSIX); if it still
  runs, its PID is printed (it was left running and kept writing into the restore folder).
- `restore:verify`: step output is decoded as UTF-8 (a character split between pipe chunks became U+FFFD) and
  only its last 64 K characters are kept; the failure message shows at most 4000 characters (a long one was
  cut off on a pipe before the exit).
- Backup with an unreadable configuration: copies of the task files keep their folder out of the ZIP — the
  usual copy names ("kanban - コピー.md", "kanban (2).md", "Copy of kanban.md", OneDrive conflict copies
  "kanban-DESKTOP-….md" / "-LAPTOP-…", the PC names Windows gives by default) whatever their content, and any other .md named kanban*/archive* whose content is a
  task file (also UTF-16, also `## TASK-` headers), so notes and docs/ stay in.

App
- Load warnings stay visible after 🔄, the automatic reload on focus (also with the archive dialog open) and
  "Reload from disk" (they were replaced at once by "Changes … were loaded" / "Reloaded from disk").
- A failed save while opening (e.g. the V1 migration), a conflict, or a recent-projects list that could not be
  updated is shown with the "loaded" message as an error instead of being hidden by a green one.

Tests and docs
- Regression tests for every item (unit 10, scripts 8, browser 10); all fail on `1b3c200` except four guard
  tests (UTF-16 without a BOM stays "not UTF-8" in unit and CLI, Shift_JIS / UTF-16 with a BOM stay "not
  UTF-8" with NULs in them, other control characters are not refused);
  "no new task while archive.md has a NUL" fails there only because 1b3c200 calls that file "not UTF-8".
  The test mock's saveDirectoryHandle returns true like the real one. The round 7 signal test is skipped on
  Windows (child.kill() terminates there). 194 tests.
- SAFETY / USER_GUIDE / OPERATIONS / DEVELOPMENT / TESTING, AGENTS.md, AI_WORKFLOW.md and the Claude skill
  updated (NUL vs UTF-16, reload warnings, restore:verify signals and Windows forced termination, backup
  exclusion of copies).

### Review fixes, round 7 (external review of `9071e08..c966c91`)
Data protection
- A file whose text contains a NUL (U+0000) is "not UTF-8": UTF-16 without a BOM whose text is ASCII only is
  valid UTF-8 byte by byte, so such an archive.md was accepted, its ids were not counted (a new task got an
  archived task's id; `tasks next-id` printed it, `check` said [OK]) and archiving wrote UTF-8 lines into it.
  It now opens read-only like other non-UTF-8 files; the messages name UTF-16 too.
- `restore:verify`: a signal sent to the script alone (`kill <pid>`) let the check run to the end and report
  OK with exit code 0 (the handlers could not run while `spawnSync` blocked). `npm ci` and the build now run
  asynchronously; a signal stops the running step (`taskkill /T` on Windows), removes the link and exits
  with 128 + the signal number.
- `--check-build`: the build's output path relative to the project (which may contain spaces, e.g. a user
  folder) is hidden; part of it stayed in manifest.json / README-RESTORE.md, also of a release.
- With an unreadable configuration, folders holding only task-file backups / exports
  (`kanban.v1-backup.md`, `kanban.unsaved-….md`) or names in another letter case are left out too.

App
- Load warnings (duplicate ids, unknown status, dates that are not YYYY-MM-DD) are no longer replaced at
  once by "Folder loaded" / "Project … loaded" / "Project restored" (`notifyProjectOpened`), and
  archive.md's own warnings are shown ("archive.md TASK-…").
- Enter in the task form's subtask field adds the subtask (it submitted the whole form).
- The save notification says when a trailing `---` of the description / notes was dropped (also a heading
  underline).
- `isIsoDate`: the years 0001-0099 are valid (Date.UTC read them as 1900-1999); 0000 is not.

Tests and docs
- Regression tests for every item (unit 3, scripts 4, browser 4); all fail on `c966c91` except the guard
  test "ordinary UTF-8 text is still valid". 166 tests.
- SAFETY / USER_GUIDE / OPERATIONS / DEVELOPMENT / TESTING updated.

### Review fixes, round 6 (two external reviews of `9071e08`)
Data protection
- Task form: subtask text typed but not added with "+" is part of the form input: "Save" adds it as a
  subtask and the conflict export ("Download unsaved" / "Copy") contains it (it counted as unsaved work,
  but was dropped from both).
- Startup restore: the project-request number is taken before the recent-projects list is read. (A folder
  the user started to choose while that read was slow was dropped, and the last project opened instead.)
- No new task while archive.md is not UTF-8: a UTF-16 file (Windows PowerShell 5.1 `Out-File` / `>`) hides
  every `### TASK-<n>` line, so a new task got the id of an archived one. `tasks next-id` prints no id and
  exits 1 then; `tasks check` offers no next id.
- Dates that are not YYYY-MM-DD (`2026-1-5`, `20261231`) are kept by the task form unless the field is
  changed (the date input showed them empty and "Save" erased them); the form says which dates it cannot
  show, and loading reports them as a warning (`non-iso-date`, not read-only).
- Backup with a configuration file that is not valid JSON: the folders given by `MTM_DATA_DIR` /
  `MTM_APP_DIR` / `MTM_BACKUP_DIR` stay excluded (`loadConfig({ lenient: true })`), and folders holding
  `kanban.md` / `archive.md` (other than the root and `examples/`) are left out as operations data.

Markdown / form
- Upstream's leading-`|` metadata form is read only in the metadata lines right under the task header and
  never when the line ends with `|`; parsing and the loss check share one rule (`metaLineMask`).
  ` | **Tags**: #経理` no longer opens the board read-only, and a description table row
  `| **Due**: 2026-01-01 |` stays description text (it became the Due field, or opened a correct file
  read-only). The form accepts such table rows.
- A description / notes ending with `---` is saved with the separator dropped, as reading does (the save
  was refused as "would not read back").

Ops
- ZIP metadata (`metadataErrors` in manifest.json / README-RESTORE.md) records a fixed description and the
  position only, never the `JSON.parse` message, which quotes the file (the content of a configuration
  file left out with `--no-local-config` reached the ZIP that way).
- `--check-build` output also hides the folders in their `file://` URL form (percent-encoded spaces and
  non-ASCII names) and shortens any other absolute file URL.
- `restore:verify --reuse-node-modules` removes its link on every exit: also after an unexpected error and on
  Ctrl+C / SIGTERM; a build that writes no output is reported as a failure.

Tests and docs
- Regression tests for every item (unit 6, scripts 6, browser 6, one more key in the translation coverage
  test); all fail on `9071e08` except the guard test "YYYY-MM-DD dates give no warning". 155 tests.
- SAFETY / USER_GUIDE / OPERATIONS / DEVELOPMENT / TESTING, AGENTS.md, AI_WORKFLOW.md and the Claude skill
  updated (next-id on non-UTF-8 files, dates, leading `|`, backup with a broken configuration).

### Review fixes, round 5 (two external reviews of `ce7130e`)
Data protection
- Archive / restore / delete-from-archive re-check, when the queued job STARTS, that archive.md is not
  read-only / unreadable / in conflict; `writeFileChecked()` itself refuses read-only files and an open
  conflict. (An archive queued behind the re-read done by opening the archive list could rewrite an
  archive.md that this re-read had just found read-only, dropping the unsupported lines.)
- Project switching: every request (selector, folder picker, startup restore) has a number; a request
  overtaken while waiting for a permission prompt is dropped, and the "unsaved changes" question is asked
  right before the switch. (A late permission grant could open its folder over a project opened and edited
  meanwhile, discarding its unsaved edits without a question.)
- Legacy V1 files: a `## ` section is matched to a column by its WHOLE heading (then without the leading
  emoji, then by id slug), never by prefix; each section belongs to one column. Every `### TASK-` header
  line must be read exactly once (checked on every load, not only when the count is short). (Columns
  "Todo" and "Todo Later" made the migration duplicate one task and drop another; the original stayed in
  `.v1-backup.md`.)
- Task form during a conflict: "Save" applies the change to the page only (nothing written) so it is part
  of "Download unsaved" / "Copy" and of the discard confirmations; typed but unsaved form input counts as
  unsaved work (reload, project switch, closing the tab, × / Cancel ask first) and is included in the
  export; the sync banner stays usable above an open dialog (the dialog moves below it).
- Files that are not UTF-8 (e.g. Shift_JIS written by Windows PowerShell 5.1 `Set-Content` /
  `Add-Content`) are detected (`TextDecoder` with `fatal`): kanban.md opens read-only, archive.md blocks
  archive / restore; such a file is never written. `tasks check` reports it. (Before, archive.md was read
  as U+FFFD and written back garbled on the next archive operation.)
- Release ZIP from a folder without Git packs only a fixed list of project paths; folders such as
  `secrets/`, `credentials/`, `.ssh/`, `.aws/` are never packed (also not in local backups); the
  configuration file actually in use (`MTM_CONFIG`) is treated like `local.config.json`.

Markdown / form
- Lines inside a closed ``` / ~~~ code block are text: a `**Due**:` / `**Notes**:` / checkbox example no
  longer becomes the task's field; the loss check compares code lines as code.
- Upstream V2.0 metadata lines written without a priority (` | **Category**: … | **Assigned**: …`) are read.
- The form refuses values that would not read back (`|` in category / assignees, blank title) and checks
  the task with a write → read round trip (`taskWriteProblems`) before changing anything; a leading
  full-width `＃` in tags is the tag marker. (Such a save "succeeded" and the next load opened the whole
  board read-only.)
- A language switch while the form is open keeps the selected (and a custom) priority (it was reset to
  "none" and the priority was removed on save).
- A task header never spans two lines (an empty title took the next line as title).
- A failed automatic reload keeps its error notification (it was replaced by "changes loaded").

Ops
- `backup` works while `package.json` / `FORK_INFO.json` / the config are not valid JSON (recorded in
  `metadataErrors` and README-RESTORE.md; a release still refuses); `backup.cmd` runs Node directly and
  `node scripts/backup.mjs` is documented for when npm cannot start.
- `--check-build` output no longer records the temporary / project / home folder path.
- `tasks check`: duplicate ids are reported as "fix this" (the browser only warns), not as "opens read-only".
- `restore:verify --reuse-node-modules` checks a ZIP without the npm registry (links the dev folder's
  node_modules; the link is removed afterwards).

Tests and docs
- Regression tests for every item (unit 13, scripts 5, browser 10; they fail on `ce7130e` except the added
  coverage test for unreadable content); the mock FS can hold raw bytes and fail content reads; the
  offline test works when the page is served from localhost (`MTM_TEST_HTTP=1`). 137 tests.
- The Claude skill (`.claude/skills/markdown-task-manager/SKILL.md`) no longer contains V1 steps
  (sections per column, `Last Task ID + 1`); AGENTS.md / AI_WORKFLOW.md require UTF-8 and YYYY-MM-DD dates;
  SAFETY / USER_GUIDE / OPERATIONS / DEVELOPMENT / TESTING updated (V1 migration and `.v1-backup.md`
  documented for users).

### Review fixes, round 4 (final review)
- Config keys accept any non-line-break space around the colon (full-width space U+3000, NBSP) in
  both the parser and the loss check (a Japanese IME no longer makes a board read-only).
- Code fences are checked per task: a ``` / ~~~ block not closed inside its task is reported
  (a `### TASK-` line inside a code block would otherwise silently become a new task); an unclosed
  fence can no longer be "closed" by a code block of a later task. The task form refuses unclosed fences.
- New ids count every heading-like task id after NFKC (`## TASK-050`, `###TASK-070`, `### TASK-０６０`).
- Release ZIP: `-dirty` and "work in progress" only reflect TRACKED changes; the public manifest
  records counts only — no names of untracked or secret-looking files.
- Language switch re-renders an open archived-task dialog read-only; edit / archive / delete and the
  form never fall back to "the task with the same id".
- An empty kanban.md is initialised only after confirmation (it may be a damaged file).
- Links keep `&` in query strings / mailto; site-relative paths must resolve to the page's own host.
- Docs corrected (SAFETY / OPERATIONS / USER_GUIDE, AI_WORKFLOW, AGENTS).

### Review fixes, round 3
- Config values never span lines: an empty `**Columns**:` (or other key) no longer swallows the next
  config line; the configuration part is also checked to read back identically after a save.
- Duplicate config values (`#bug #bug`) no longer make a board read-only; the title may follow blank
  lines / comments; `~~~` fences are code blocks and an unclosed fence no longer hides headings.
- Archived-task dialog: no subtask delete / edit, and no action can reach the board task with the
  same id.
- New tasks are refused only while archive.md is unreadable (a readable archive with format problems
  is fine: every `### TASK-<n>` line is counted); `tasks next-id` warns instead of failing.
- Links containing whitespace, control characters or a backslash are refused (`/\host` == `//host`).
- The task form keeps first-line indentation and trailing double spaces (only outer blank lines removed).
- `release` ignores untracked files when checking for uncommitted changes.
- Warning when `**Subtasks**:` is written after `**Notes**:` (kept as notes text).
- Tests: the B-10 and A-4 regression tests now fail on the pre-fix code for the right reason (slow
  backup write sampled; asynchronous isSameEntry stand-ins; slow comparison inside the transaction).

### Review fixes (external AI code reviews of the first version)
- Archive: no edits while an archive/restore/delete runs (the detail dialog closes); the task is
  re-checked against its snapshot before it is removed from the board.
- Restore/archive decide "identical copy already at the destination" from the file ON DISK, never from
  unsaved in-memory state (a restore could otherwise delete the only saved copy).
- Header/configuration part is verified by a parse → generate round-trip: unknown lines, a second
  `**Columns**`, unsupported keys are reported (read-only) instead of silently replaced; extra HTML
  comments are kept; `## ⚙ Configuration` without the variation selector, `**Key** :` and `#`-less
  config tags are read; a UTF-8 BOM no longer hides the title.
- Every task must read back identically after a save (fixed point); `**Subtasks**:` written after
  `**Notes**:` stays in the notes (it multiplied on every save); `## ` headings in the task area are
  reported; nested subtask indentation, trailing double spaces, full-width `：`/`＃` and `、`-separated
  tags are kept; empty optional fields no longer make a board read-only; column names may contain
  parentheses (the id is the last `( )`).
- XSS: the language label of a fenced code block was inserted unescaped (upstream code) — escaped;
  `//host` links refused, `rel="noopener noreferrer"` added.
- Delete / form edit / subtask actions work on the clicked task object (duplicate ids no longer hit the
  first task with that id); stale archive list actions are reported.
- New tasks are refused while archive.md cannot be read completely; new ids also consider every
  `### TASK-<n>` line of both files.
- Recent-projects list: the IndexedDB write no longer awaits isSameEntry() inside the transaction
  (TransactionInactiveError — renames and second projects were not saved); rename reports failures.
- V1→V2 migration: backup + rewrite in one queued job; an existing different backup is never trusted
  or overwritten.
- Ops: `_backup_info/` of a restored ZIP and a worktree `.git` file are not packed; duplicate ZIP
  entry names are refused; `.claude/settings.local.json` is never packed; `release` refuses
  uncommitted changes (`--allow-dirty`); deploy needs `backupDir` to replace an existing HTML (nothing
  else is created in the app folder); `restore:verify` runs Node without a shell (Windows paths with
  spaces); `.cmd` wrappers no longer print the failure line on success.
- Tests: `npm run test:e2e` fails instead of skipping without a browser; file:// falls back to a
  localhost server; real IndexedDB and real focus-event tests; regression tests for every item above.

### Data safety (safe save with external editors / AI)
- New save layer (`src/scripts/14-sync.js`): each file keeps the exact text last read/written; before
  every write the file is re-read and compared by **content**. A difference stops saving (conflict) —
  no overwrite option, no auto-merge. Unsaved board can be downloaded / copied; "reload from disk".
  Read errors, permission errors and missing files are never treated as "unchanged". Every write is
  read back before it counts as success; success notifications only after a confirmed save.
  (Upstream issue #25. Upstream PR #31 was reviewed but not used: it compares mtime+size and lets the
  user overwrite the external change.)
- All writes go through one queue (no reordering); queued kanban saves are coalesced.
- External-change check on focus / tab switch and a 🔄 button; a clean page reloads automatically,
  a page with unsaved edits or an open editor goes to conflict instead.
- `beforeunload` warning while something is unsaved.
- Loss guard: a file containing anything the generator would not write back (malformed task header,
  text outside tasks, unknown config lines, non-checkbox lines in Subtasks, …) is opened read-only
  instead of being saved over — including files that are not a board at all.
- A folder without kanban.md is initialised only after confirmation.

### Project switching
- Per-project session with a generation number: file handles, baselines and pending saves are never
  shared between projects. Fixes writing into the previous project's `archive.md` after switching to a
  project without one. In-flight saves finish against the old project before the switch; unsaved
  edits ask for confirmation; stale async loads are ignored; switching is refused during an archive
  operation. Projects are identified with `isSameEntry()` (two folders with the same name no longer
  collide).

### Archive / restore
- Write destination first, verify, then remove from the source; in-memory state changes only after
  the matching write. Partial success (task in both files) is reported and a re-run completes without
  duplicating. Same id with different content at the destination → refused. Both files are checked for
  external changes. One operation at a time. Previously the task was removed from the board before the
  archive write had completed, and an unreadable archive.md was treated as empty (next save could wipe it).
- archive.md header text is preserved instead of being regenerated in the current UI language.

### Markdown read/write
- Pure format module (`src/scripts/04-format.js`) shared by the app, the Node unit tests and the CLI.
- Priority is read without a Category (upstream issue #19; PR #34 reviewed); metadata fields are
  order-independent and optional; Category/Assigned without Priority no longer produce a broken line.
- Unicode: Japanese tags (`#経理`) were dropped by `#[\w-]+` — fixed; Japanese priorities kept;
  `clean()` is Unicode-aware (backward-compatible matching for old values).
- Description keeps blank lines and indentation; `**Notes**: text` on the same line is kept;
  `- [X]` subtasks parsed; CRLF files supported and their line ending preserved.
- Unknown `**Status**` values are kept as written (shown in the first column with a warning) instead
  of being silently changed to the first column; column names resolve to ids.
- New ids skip every id used in kanban.md **and** archive.md; duplicate ids are reported.
- "Created" default uses the local date (was UTC → wrong day in Japan before 9:00).
- Unknown priority values are kept when a task is edited in the form.
- Column id rename moves its tasks; non-empty / last column cannot be deleted.

### Search
- Task id search on the board and in the archive (`TASK-042`, `task-42`, `#42`, full-width input),
  case- and width-insensitive (upstream issue #20; PR #26 reviewed). The board search now also covers
  tags, category, assignees and subtasks, like the archive search.

### Japanese
- `ja` locale for every UI string (buttons, menus, forms, placeholders, notifications, errors,
  confirmations, help, tooltips, accessible labels); date locale per language; `<html lang>`
  follows the UI language; first start picks Japanese from `navigator.languages`.
- Language switching only changes display: tasks, column names and Markdown keys are never rewritten.
- Accessible names for icon-only buttons; notifications use `role="status"`, conflicts `role="alert"`.
- Japanese guides in `docs/ja/`.

### Build, deploy, backup (Node scripts, no new runtime dependency)
- `build.mjs`: syntax check before minify, output validation (single inline script, no external
  resources), atomic write, embedded `BUILD_INFO` / source hash, `--out`, `--check`.
- `npm run deploy` / `deploy:dry` / `build-deploy`: copies only task-manager.html to the app folder,
  refuses stale HTML, backs up the previous HTML (verified) first, never touches task data.
- `npm run backup` / `backup:dry` / `release`: dependency-free ZIP writer, verified read-back,
  manifest + restore instructions, secrets / node_modules / old backups excluded, Git history optional.
- `npm run restore:verify`, `npm run config:check`, `npm run tasks -- where|check|next-id|show`.
- `local.config.json` (git-ignored) with `%OneDriveCommercial%`-style variables; Windows `.cmd` wrappers.
- Tests: `npm test` (Node unit + script tests + browser tests with a mock File System Access API);
  devDependency `playwright-core` (uses installed Edge/Chrome, no browser download).

### AI instructions
- `AGENTS.md` (folder roles, build/deploy/backup, co-editing rules, task ids, archive order).
- `AI_WORKFLOW.md`, the Claude skill and the `*.md.exemple` files updated accordingly
  (V2 examples now include `**Status**`).
